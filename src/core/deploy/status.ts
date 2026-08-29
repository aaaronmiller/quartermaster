// ─────────────────────────────────────────────────────────────
// Quartermaster — Harness Deployment Status (FR-060, FR-061)
// Reports deployed artifacts, sync state vs library source, and classifies
// unaccounted files in harness target directories as drift, stale, or orphaned.
// ─────────────────────────────────────────────────────────────

import type { DeploymentRecord, HarnessProfile } from '@core/types';
import { computeVerdict, loadVerdictOverrides } from '@core/audit/auditor';
import { LoadoutManager, type LoadoutStatus } from '@core/loadouts/loadouts';
import type { Repository } from '@storage/repository';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

// ─── Ignored filenames ───────────────────────────────────────

// Trees that are package-managed or otherwise not a qm deployment surface.
// Walking them (e.g. a plugin cache with node_modules symlink loops) would
// hang the orphan scan and flood it with noise.
const IGNORE_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep', 'node_modules', '.git', 'cache']);

// ─── Public interfaces ───────────────────────────────────────

export interface DeployedArtifact {
  artifactId: string;
  targetPath: string;
  method: 'link' | 'copy';
  inSync: boolean;
  libraryHash: string;
  deployedHash: string;
}

export interface HarnessStatus {
  harness: string;
  deployed: DeployedArtifact[];
  /** Files present in target directories that no recorded deployment ever placed (foreign residue). */
  orphaned: string[];
  /** Files a prior recorded deployment placed but the latest applied plan no longer covers (managed residue). */
  stale: string[];
  /** Managed links whose target no longer resolves: deployed drift, not unchanged artifacts. */
  drift: string[];
  /** Loaded vs disabled accounting (FR-060s). `loaded` = placements of the
   * latest applied deployment whose targets resolve on disk (the artifact is
   * live in this harness). `disabled` = catalog artifacts that audit as
   * deployable or transformable for this harness but are not deployed —
   * in the library, not loaded. */
  state: { loaded: number; disabled: number };
  loadout: LoadoutStatus;
  lastDeployment?: DeploymentRecord;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * FR-060: Report which artifacts are deployed to a harness, by what method,
 * and whether each matches its library source (inSync) or has drifted.
 *
 * FR-061: Detect and classify unaccounted files in target directories —
 * drift (managed link whose target no longer resolves), stale (managed file
 * the latest plan no longer covers), or orphaned (never deployed by qm).
 */
export async function getHarnessStatus(
  harness: string,
  repo: Repository,
  profile: HarnessProfile,
): Promise<HarnessStatus> {
  const records = repo.getDeployments(harness);

  // Every recorded deployment defines the managed surface of this harness,
  // not just the newest one. When an artifact is removed from the catalog
  // its operations vanish from fresh plans, but its deployed links remain
  // on disk; only the record history knows they are ours.
  const managedTargetPaths = new Set<string>();
  for (const record of records) {
    for (const op of record.plan.operations) managedTargetPaths.add(op.targetPath);
  }

  // Find the most recent 'applied' deployment record.
  const lastApplied = records.find((r) => r.status === 'applied');
  const lastDeployment = records[0] as DeploymentRecord | undefined;

  const deployed: DeployedArtifact[] = [];

  // Track target paths accounted for by the deployment record.
  const accountedTargetPaths = new Set<string>();

  if (lastApplied) {
    for (const op of lastApplied.plan.operations) {
      accountedTargetPaths.add(op.targetPath);

      // Determine library source hash.
      const libraryHash = await hashFile(op.sourcePath);
      if (libraryHash === null) {
        // Library source missing — treat as drifted with empty hashes.
        deployed.push({
          artifactId: artifactIdFromSourcePath(op.sourcePath),
          targetPath: op.targetPath,
          method: op.method,
          inSync: false,
          libraryHash: '',
          deployedHash: '',
        });
        continue;
      }

      // Determine deployed target hash.
      const deployedHash = await hashFile(op.targetPath);
      if (deployedHash === null) {
        // Target missing — drifted.
        deployed.push({
          artifactId: artifactIdFromSourcePath(op.sourcePath),
          targetPath: op.targetPath,
          method: op.method,
          inSync: false,
          libraryHash,
          deployedHash: '',
        });
        continue;
      }

      deployed.push({
        artifactId: artifactIdFromSourcePath(op.sourcePath),
        targetPath: op.targetPath,
        method: op.method,
        inSync: libraryHash === deployedHash,
        libraryHash,
        deployedHash,
      });
    }
  }

  // FR-061: Walk all target directories from the profile and classify every
  // file the latest applied plan does not account for.
  const { orphaned, stale, drift } = await classifyUnaccountedFiles(
    profile,
    accountedTargetPaths,
    managedTargetPaths,
  );

  // FR-060s: loaded/disabled accounting. Loaded = placements of the latest
  // applied deployment whose targets resolve on disk (deployedHash empty
  // marks a drifted placement). Disabled = catalog artifacts that audit as
  // deployable or transformable for this harness but are not deployed.
  const loaded = deployed.filter((entry) => entry.deployedHash !== '').length;
  const deployedSourcePaths = new Set(
    (lastApplied?.plan.operations ?? []).map((op) => op.sourcePath),
  );
  const overrides = loadVerdictOverrides(repo);
  let disabled = 0;
  for (const artifact of repo.listArtifacts()) {
    if (deployedSourcePaths.has(artifact.path)) continue;
    if (computeVerdict(artifact, profile, overrides).verdict !== 'incompatible') disabled += 1;
  }


  return {
    harness,
    deployed,
    orphaned,
    stale,
    drift,
    state: { loaded, disabled },
    loadout: new LoadoutManager(repo).status(harness),
    ...(lastDeployment !== undefined ? { lastDeployment } : {}),
  };
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a file. Returns null if the file does
 * not exist or cannot be read.
 */
async function hashFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Derive a best-effort artifact ID from a library source path.
 * Uses the basename of the path, which matches the convention used
 * elsewhere in Quartermaster (artifact IDs are name-derived).
 */
function artifactIdFromSourcePath(sourcePath: string): string {
  return basename(sourcePath);
}

/**
 * Walk all unique target directories declared in the harness profile and
 * classify every file that is not present in `accountedPaths` (the latest
 * applied plan):
 * - `drift`: a managed link (recorded in any deployment) whose target no
 *   longer resolves — the deployed stub is dead and the harness sees nothing;
 * - `stale`: a managed file the latest plan no longer covers (residue
 *   Quartermaster itself deployed earlier, not a foreign orphan);
 * - `orphaned`: a file no recorded deployment ever placed.
 * Skips ignored basenames (.DS_Store, Thumbs.db, .gitkeep, node_modules,
 * .git, cache). Handles missing directories gracefully.
 */
async function classifyUnaccountedFiles(
  profile: HarnessProfile,
  accountedPaths: Set<string>,
  managedPaths: Set<string>,
): Promise<{ orphaned: string[]; stale: string[]; drift: string[] }> {
  // Collect unique target directories from all artifact type locations.
  const targetDirs = new Set<string>();
  for (const atl of profile.artifactTypes) {
    if (atl.locations.global) targetDirs.add(atl.locations.global);
    if (atl.locations.project) targetDirs.add(atl.locations.project);
  }

  const classified = { orphaned: [] as string[], stale: [] as string[], drift: [] as string[] };

  for (const dir of targetDirs) {
    await walkDir(dir, accountedPaths, managedPaths, classified);
  }

  return classified;
}

/**
 * Recursively walk a directory, classifying files not in `accountedPaths`
 * into `classified.orphaned`, `classified.stale`, or `classified.drift`.
 * Silently returns on ENOENT (missing directory).
 * Uses lstat: symlinks are treated as leaves and never descended into,
 * which prevents infinite recursion through symlink loops (e.g. node_modules
 * under a plugin cache) that fs.stat would follow.
 */
async function walkDir(
  dirPath: string,
  accountedPaths: Set<string>,
  managedPaths: Set<string>,
  classified: { orphaned: string[]; stale: string[]; drift: string[] },
): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(dirPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  for (const name of names) {
    if (IGNORE_BASENAMES.has(name)) continue;

    const fullPath = join(dirPath, name);
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await walkDir(fullPath, accountedPaths, managedPaths, classified);
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      if (accountedPaths.has(fullPath)) continue;

      if (managedPaths.has(fullPath)) {
        // FR-061 accounting: a file Quartermaster itself deployed in an
        // earlier recorded deployment is managed residue, not a foreign
        // orphan.
        if (stat.isSymbolicLink()) {
          try {
            await fs.stat(fullPath);
            classified.stale.push(fullPath);
          } catch {
            // FR-060: a deployed link whose target no longer resolves is
            // drift, not an unchanged artifact.
            classified.drift.push(fullPath);
          }
        } else {
          classified.stale.push(fullPath);
        }
      } else {
        classified.orphaned.push(fullPath);
      }
    }
  }
}
