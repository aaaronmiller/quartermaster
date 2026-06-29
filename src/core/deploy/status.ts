// ─────────────────────────────────────────────────────────────
// Quartermaster — Harness Deployment Status (FR-060, FR-061)
// Reports deployed artifacts, sync state vs library source,
// and orphaned files in harness target directories.
// ─────────────────────────────────────────────────────────────

import type { DeploymentRecord, HarnessProfile } from '@core/types';
import { LoadoutManager, type LoadoutStatus } from '@core/loadouts/loadouts';
import type { Repository } from '@storage/repository';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { basename, join } from 'path';

// ─── Ignored filenames ───────────────────────────────────────

const IGNORE_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

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
  orphaned: string[];
  loadout: LoadoutStatus;
  lastDeployment?: DeploymentRecord;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * FR-060: Report which artifacts are deployed to a harness, by what method,
 * and whether each matches its library source (inSync) or has drifted.
 *
 * FR-061: Detect and report orphaned files — files present in target
 * directories that are not accounted for by any deployment record.
 */
export async function getHarnessStatus(
  harness: string,
  repo: Repository,
  profile: HarnessProfile,
): Promise<HarnessStatus> {
  const records = repo.getDeployments(harness);

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

  // FR-061: Walk all target directories from the profile and collect orphans.
  const orphaned = await findOrphanedFiles(profile, accountedTargetPaths);

  return {
    harness,
    deployed,
    orphaned,
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
 * Walk all unique target directories declared in the harness profile
 * and collect file paths that are not present in `accountedPaths`.
 * Skips ignored basenames (.DS_Store, Thumbs.db, .gitkeep).
 * Handles missing directories gracefully.
 */
async function findOrphanedFiles(
  profile: HarnessProfile,
  accountedPaths: Set<string>,
): Promise<string[]> {
  // Collect unique target directories from all artifact type locations.
  const targetDirs = new Set<string>();
  for (const atl of profile.artifactTypes) {
    if (atl.locations.global) targetDirs.add(atl.locations.global);
    if (atl.locations.project) targetDirs.add(atl.locations.project);
  }

  const orphaned: string[] = [];

  for (const dir of targetDirs) {
    await walkDir(dir, accountedPaths, orphaned);
  }

  return orphaned;
}

/**
 * Recursively walk a directory, collecting files not in `accountedPaths`.
 * Silently returns on ENOENT (missing directory).
 */
async function walkDir(
  dirPath: string,
  accountedPaths: Set<string>,
  orphaned: string[],
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
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await walkDir(fullPath, accountedPaths, orphaned);
    } else if (stat.isFile()) {
      if (!accountedPaths.has(fullPath)) {
        orphaned.push(fullPath);
      }
    }
  }
}
