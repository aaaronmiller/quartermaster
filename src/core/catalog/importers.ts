import { cpSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { git } from "./git";
import { nowIso, stableId, type Source, type SourceKind } from "../types";
import type { Repository } from "../../storage/repository";

export function importSource(repo: Repository, input: { kind: SourceKind; reference: string; destinationRoot: string; subdir?: string; ref?: string }): Source {
  mkdirSync(input.destinationRoot, { recursive: true });
  const id = stableId("source", input.kind, input.reference, input.subdir ?? "");
  const dest = join(input.destinationRoot, basename(input.reference).replace(/\.git$/, "") || id);
  if (input.kind === "git" || input.kind === "git_subdir") {
    const cloned = git(["clone", input.reference, dest]);
    if (!cloned.ok) throw new Error(cloned.stderr || `git clone failed for ${input.reference}`);
  } else if (input.kind === "local") {
    cpSync(resolve(input.reference), dest, { recursive: true });
  }
  const source: Source = {
    id,
    kind: input.kind,
    reference: input.reference,
    ref_branch: input.ref ?? null,
    imported_revision: input.kind.startsWith("git") ? git(["rev-parse", "HEAD"], dest).stdout.trim() : null,
    updated_at: nowIso()
  };
  repo.upsertSource(source);
  return source;
}
