import { git } from "./git";
import type { Repository } from "../../storage/repository";

export interface UpstreamStatus {
  source_id: string;
  status: "unchanged" | "ahead" | "pinned" | "locally_modified" | "conflicted" | "unavailable";
  reason: string | null;
}

export function checkUpstream(repo: Repository): UpstreamStatus[] {
  return repo.listSources().map((source) => {
    if (source.pin_revision) return { source_id: source.id, status: "pinned", reason: source.pin_revision };
    if (!source.kind.startsWith("git")) return { source_id: source.id, status: "unchanged", reason: null };
    const status = git(["status", "--porcelain"], source.reference);
    if (!status.ok) return { source_id: source.id, status: "unavailable", reason: status.stderr || "git unavailable" };
    if (status.stdout.trim()) return { source_id: source.id, status: "locally_modified", reason: "working tree has local changes" };
    return { source_id: source.id, status: "unchanged", reason: null };
  });
}
