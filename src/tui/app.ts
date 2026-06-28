import type { Repository } from "../storage/repository";
import { buildSurfaceSummary } from "../core/surface/summary";

export function renderTuiState(repo: Repository): unknown {
  const summary = buildSurfaceSummary(repo);
  return {
    title: "Quartermaster",
    subtitle: "Local artifact fleet console",
    sections: [
      {
        id: "catalog",
        title: "Catalog",
        metrics: [
          { label: "Artifacts", value: summary.catalog.total },
          { label: "Sources", value: summary.catalog.sources },
          { label: "Risk flagged", value: summary.catalog.risky },
          { label: "Local edits", value: summary.catalog.locally_modified }
        ],
        commands: ["qm scan --root <library>", "qm catalog --json", "qm query search <text> --json"]
      },
      {
        id: "compatibility",
        title: "Harness Readiness",
        metrics: [
          { label: "Deployable", value: summary.compatibility.deployable },
          { label: "Transform", value: summary.compatibility.transform },
          { label: "Blocked", value: summary.compatibility.incompatible }
        ],
        rows: Object.entries(summary.compatibility.by_harness).map(([harness, counts]) => ({ harness, ...counts })),
        commands: ["qm audit --matrix --json", "qm deploy preview --harness <id> --json"]
      },
      {
        id: "activation",
        title: "Loadouts and Pipelines",
        metrics: [
          { label: "Loadouts", value: summary.loadouts.total },
          { label: "Pipelines", value: summary.pipelines.total },
          { label: "Harness assigns", value: summary.activation.total },
          { label: "Active", value: summary.activation.active }
        ],
        rows: [
          ...summary.loadouts.names.map((name) => ({ kind: "loadout", name })),
          ...summary.pipelines.names.map((name) => ({ kind: "pipeline", name })),
          ...Object.entries(summary.activation.by_harness).map(([harness, state]) => ({ kind: "harness", harness, ...state }))
        ],
        commands: ["qm loadout list --json", "qm loadout show <name> --json", "qm loadout assign <name> --harness <id> --json", "qm query deployment --harness <id> --json"]
      },
      {
        id: "review",
        title: "Review Queue",
        metrics: [
          { label: "Pending proposals", value: summary.proposals.pending },
          { label: "Accepted", value: summary.proposals.accepted },
          { label: "Rejected", value: summary.proposals.rejected },
          { label: "Deployments", value: summary.deployments.total }
        ],
        rows: summary.recommendations.map((recommendation) => ({ recommendation })),
        commands: ["qm eval loadout --json", "qm eval pipeline --json", "qm status --json"]
      }
    ],
    summary
  };
}
