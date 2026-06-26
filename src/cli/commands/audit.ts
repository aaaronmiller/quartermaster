import { auditArtifacts } from "../../core/audit/auditor";
import { loadProfiles } from "../../core/audit/profile-registry";
import { argValue, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function auditCommand(repo: Repository, args: string[]): void {
  const harness = argValue(args, "--harness");
  const profiles = loadProfiles(argValue(args, "--profiles") ?? undefined).filter((profile) => !harness || profile.id === harness);
  const verdicts = auditArtifacts(repo, profiles);
  if (args.includes("--json")) printJson({ verdicts });
  else printText(verdicts.map((v) => `${v.artifact_id}\t${v.harness_id}\t${v.result}\t${v.reason ?? ""}`));
}
