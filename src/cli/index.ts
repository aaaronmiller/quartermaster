#!/usr/bin/env bun
import { auditCommand } from "./commands/audit";
import { catalogCommand } from "./commands/catalog";
import { deployCommand } from "./commands/deploy";
import { evalCommand } from "./commands/eval";
import { guidanceCommand } from "./commands/guidance";
import { importCommand } from "./commands/import";
import { loadoutCommand } from "./commands/loadout";
import { scanCommand } from "./commands/scan";
import { statusCommand } from "./commands/status";
import { syncCommand } from "./commands/sync";
import { queryArtifacts, queryCompatibility, queryDeployment } from "../query/commands";
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
      "qm loadout list|create|add [--json]",
      "qm guidance render [--json]",
      "qm import --source <path-or-url> [--kind local|git] [--json]",
      "qm sync [--json]",
      "qm eval grade|comparison|loadout|pipeline [--json]",
      "qm query artifacts|compatibility|deployment --json",
      "qm status [--json]"
    ]);
    return;
  }
  if (command === "scan") await scanCommand(repo, args);
  else if (command === "catalog") catalogCommand(repo, args);
  else if (command === "audit") auditCommand(repo, args);
  else if (command === "deploy") deployCommand(repo, args);
  else if (command === "loadout") loadoutCommand(repo, args);
  else if (command === "guidance") guidanceCommand(repo, args);
  else if (command === "import") importCommand(repo, args);
  else if (command === "sync") syncCommand(repo);
  else if (command === "eval") evalCommand(repo, args);
  else if (command === "status") statusCommand(repo, args);
  else if (command === "query") queryCommand(repo, args);
  else fail(`Unknown command: ${command}`);
}

function queryCommand(repo: ReturnType<typeof createContext>["repo"], args: string[]): void {
  const sub = args[0];
  if (sub === "artifacts") printJson(queryArtifacts(repo));
  else if (sub === "compatibility") {
    const artifact = args[args.indexOf("--artifact") + 1];
    if (!artifact) fail("qm query compatibility requires --artifact <id>");
    printJson(queryCompatibility(repo, artifact));
  } else if (sub === "deployment") {
    const harness = args[args.indexOf("--harness") + 1];
    if (!harness) fail("qm query deployment requires --harness <id>");
    printJson(queryDeployment(repo, harness));
  } else fail("qm query requires artifacts, compatibility, or deployment");
}

await main();
