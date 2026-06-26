import { statSync } from "node:fs";
import { resolve } from "node:path";
import { detectArtifacts } from "./detectors";
import { parseMetadata } from "./metadata";
import { inferCapabilities, inferRiskFlags } from "./inference";
import { assertExistingDirectory, relativeUnix } from "../filesystem/paths";
import { nowIso, stableId, type Artifact, type Source } from "../types";
import type { Repository } from "../../storage/repository";

export interface ScanResult {
  root: string;
  added: number;
  changed: number;
  removed: number;
  unchanged: number;
  errors: { path: string; message: string }[];
  artifacts: Artifact[];
}

export async function scanLibrary(repo: Repository, rootInput: string): Promise<ScanResult> {
  const root = assertExistingDirectory(rootInput);
  const before = repo.listArtifacts().filter((artifact) => artifact.abs_path.startsWith(root));
  const beforeById = new Map(before.map((artifact) => [artifact.id, artifact]));
  const artifacts: Artifact[] = [];
  const errors: ScanResult["errors"] = [];
  const source: Source = {
    id: stableId("source", root),
    kind: "local",
    reference: root,
    updated_at: nowIso()
  };
  repo.upsertSource(source);

  for (const detected of detectArtifacts(root)) {
    try {
      const metadata = parseMetadata(detected.type, detected.path);
      const abs = resolve(detected.path);
      const orgPath = relativeUnix(root, abs);
      const hash = await hashPath(abs);
      artifacts.push({
        id: stableId("artifact", root, detected.type, orgPath),
        type: detected.type,
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        org_path: orgPath,
        abs_path: abs,
        content_hash: hash,
        required_capabilities: inferCapabilities(detected.type, metadata.raw),
        risk_flags: inferRiskFlags(detected.type, metadata.raw),
        source_id: source.id,
        is_self_authored: true,
        locally_modified: false,
        updated_at: nowIso()
      });
    } catch (error) {
      errors.push({ path: detected.path, message: error instanceof Error ? error.message : String(error) });
    }
  }

  let added = 0;
  let changed = 0;
  let unchanged = 0;
  for (const artifact of artifacts) {
    const existing = beforeById.get(artifact.id);
    if (!existing) added++;
    else if (existing.content_hash !== artifact.content_hash) changed++;
    else unchanged++;
  }
  const afterIds = new Set(artifacts.map((artifact) => artifact.id));
  const removed = before.filter((artifact) => !afterIds.has(artifact.id)).length;
  repo.replaceArtifactsForRoot(root, artifacts);
  return { root, added, changed, removed, unchanged, errors, artifacts };
}

async function hashPath(path: string): Promise<string> {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    const file = Bun.file(`${path}/SKILL.md`);
    if (await file.exists()) return Bun.hash(await file.text()).toString(36);
    return Bun.hash(`${path}:${stat.mtimeMs}`).toString(36);
  }
  return Bun.hash(await Bun.file(path).text()).toString(36);
}
