#!/usr/bin/env bun
import { auditCommand } from "./commands/audit";
import { catalogCommand } from "./commands/catalog";
import { deployCommand } from "./commands/deploy";
import { evalCommand } from "./commands/eval";
import { guidanceCommand } from "./commands/guidance";
import { importCommand } from "./commands/import";
import { loadoutCommand } from "./commands/loadout";
import { pipelineCommand } from "./commands/pipeline";
import { proposalCommand } from "./commands/proposal";
import { scanCommand } from "./commands/scan";
import { statusCommand } from "./commands/status";
import { syncCommand } from "./commands/sync";
import type { ArtifactType } from "../core/types";
import { renderTuiState } from "../tui/app";
import { createRoutes } from "../web/server/routes";
import {
  queryArtifactSearch,
  queryArtifacts,
  queryCompatibility,
  queryDeployment,
  queryLoadouts,
  queryPipelines,
  queryProposals,
  querySummary
} from "../query/commands";
import { createContext } from "./context";
import { fail, printJson, printText } from "./output";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const { repo } = createContext();
  if (!command || command === "help" || command === "--help") {
    printText([
      "qm scan --root <path> [--json]",
      "qm catalog [show <id>] [--json]",
      "qm audit [--harness <id>] [--matrix] [--json]",
      "qm deploy preview|apply|rollback [--harness <id>] [--target-root <path>] [--yes] [--json]",
      "qm loadout list|new|add|remove|set|show|assign|switch|copy|move [--json]",
      "qm pipeline list|new|validate|add-to [--json]",
      "qm proposal list|show|accept|reject [--json]",
      "qm guidance render [--json]",
      "qm import --source <path-or-url> [--kind local|git] [--json]",
      "qm sync [--json]",
      "qm eval grade|comparison|loadout|pipeline|audit|improve|fix [--json]",
      "qm query summary|artifacts|search|compatibility|deployment|loadouts|pipelines|proposals --json",
      "qm tui [--json]",
      "qm web [--port <number>]",
      "qm status [--json]"
    ]);
    return;
  }
  if (command === "scan") await scanCommand(repo, args);
  else if (command === "catalog") catalogCommand(repo, args);
  else if (command === "audit") auditCommand(repo, args);
  else if (command === "deploy") deployCommand(repo, args);
  else if (command === "loadout") loadoutCommand(repo, args);
  else if (command === "pipeline") pipelineCommand(repo, args);
  else if (command === "proposal") proposalCommand(repo, args);
  else if (command === "guidance") guidanceCommand(repo, args);
  else if (command === "import") importCommand(repo, args);
  else if (command === "sync") syncCommand(repo);
  else if (command === "eval" || command === "evaluate") await evalCommand(repo, args);
  else if (command === "status") statusCommand(repo, args);
  else if (command === "query") queryCommand(repo, args);
  else if (command === "tui") tuiCommand(repo, args);
  else if (command === "web") webCommand(repo, args);
  else fail(`Unknown command: ${command}`);
}

function tuiCommand(repo: ReturnType<typeof createContext>["repo"], args: string[]): void {
  const state = renderTuiState(repo) as { title: string; subtitle: string; sections: { title: string; metrics: { label: string; value: number }[]; commands: string[] }[] };
  if (args.includes("--json")) {
    printJson(state);
    return;
  }
  printText([state.title, state.subtitle, ""]);
  for (const section of state.sections) {
    printText([
      section.title,
      section.metrics.map((metric) => `${metric.label}: ${metric.value}`).join(" | "),
      `Commands: ${section.commands.join(" ; ")}`,
      ""
    ]);
  }
}

function webCommand(repo: ReturnType<typeof createContext>["repo"], args: string[]): void {
  const port = Number(valueAfter(args, "--port") ?? process.env.QM_WEB_PORT ?? 4173);
  const app = createRoutes(repo);
  Bun.serve({ port, fetch: app.fetch });
  printText([`Quartermaster web UI: http://localhost:${port}`]);
}

function queryCommand(repo: ReturnType<typeof createContext>["repo"], args: string[]): void {
  const sub = args[0];
  if (sub === "summary") printJson(querySummary(repo));
  else if (sub === "artifacts") printJson(queryArtifacts(repo));
  else if (sub === "search") {
    const text = args.find((arg, index) => index > 0 && !arg.startsWith("--"));
    printJson(queryArtifactSearch(repo, searchInput({
      text,
      type: valueAfter(args, "--type") as ArtifactType | undefined,
      capability: valueAfter(args, "--capability"),
      risk: valueAfter(args, "--risk"),
      source_id: valueAfter(args, "--source"),
      org_path: valueAfter(args, "--path")
    })));
  }
  else if (sub === "compatibility") {
    const artifact = valueAfter(args, "--artifact");
    if (!artifact) fail("qm query compatibility requires --artifact <id>");
    printJson(queryCompatibility(repo, artifact));
  } else if (sub === "deployment") {
    const harness = valueAfter(args, "--harness");
    if (!harness) fail("qm query deployment requires --harness <id>");
    printJson(queryDeployment(repo, harness));
  } else if (sub === "loadouts") printJson(queryLoadouts(repo));
  else if (sub === "pipelines") printJson(queryPipelines(repo));
  else if (sub === "proposals") printJson(queryProposals(repo));
  else fail("qm query requires summary, artifacts, search, compatibility, deployment, loadouts, pipelines, or proposals");
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function searchInput(input: {
  text?: string | undefined;
  type?: ArtifactType | undefined;
  capability?: string | undefined;
  risk?: string | undefined;
  source_id?: string | undefined;
  org_path?: string | undefined;
}): Parameters<typeof queryArtifactSearch>[1] {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")) as Parameters<typeof queryArtifactSearch>[1];
}

await main();
