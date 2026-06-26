import { argValue, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";
import type { ArtifactType } from "../../core/types";

export function catalogCommand(repo: Repository, args: string[]): void {
  if (args[0] === "show" && args[1]) {
    const artifact = repo.getArtifact(args[1]);
    if (args.includes("--json")) printJson({ artifact });
    else printText(artifact ? `${artifact.id} ${artifact.type} ${artifact.name}` : "Artifact not found");
    return;
  }
  const filters: Parameters<Repository["listArtifacts"]>[0] = {};
  const type = argValue(args, "--type") as ArtifactType | null;
  const source = argValue(args, "--source");
  const path = argValue(args, "--path");
  const text = argValue(args, "--text") ?? args.find((arg) => !arg.startsWith("--"));
  if (type) filters.type = type;
  if (source) filters.source_id = source;
  if (path) filters.org_path = path;
  if (text) filters.text = text;
  const artifacts = repo.listArtifacts(filters);
  if (args.includes("--json")) printJson({ artifacts });
  else printText(artifacts.map((artifact) => `${artifact.id}\t${artifact.type}\t${artifact.org_path}\t${artifact.name}`));
}
