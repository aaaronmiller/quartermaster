import { printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function statusCommand(repo: Repository, args: string[]): void {
  const deployments = repo.listDeployments();
  const artifactIds = new Set(repo.listArtifacts().map((artifact) => artifact.id));
  const orphans = deployments.flatMap((record) => record.operations).filter((operation) => operation.artifact_id && !artifactIds.has(operation.artifact_id));
  const status = { deployments: deployments.length, orphans };
  if (args.includes("--json")) printJson(status);
  else printText(`Deployments: ${status.deployments}\nOrphans: ${orphans.length}`);
}
