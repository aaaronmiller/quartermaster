export type ArtifactType =
  | "skill"
  | "plugin"
  | "agent"
  | "hook"
  | "script"
  | "mcp"
  | "command"
  | "output_style";

export type SourceKind = "git" | "git_subdir" | "marketplace" | "local" | "self";
export type VerdictResult = "deployable" | "transform" | "incompatible";
export type LayoutMode = "flat" | "nested" | "config";
export type ConfigFormat = "json" | "yaml" | "toml";
export type PlacementMethod = "symlink" | "copy" | "write_config" | "skip";
export type OperationKind = "create" | "replace" | "remove" | "link" | "copy" | "write_config" | "transform" | "skip";

export interface Source {
  id: string;
  kind: SourceKind;
  reference: string;
  ref_branch?: string | null;
  imported_revision?: string | null;
  pin_revision?: string | null;
  updated_at: string;
}

export interface CapabilityRequirement {
  name: string;
  dialect?: string;
  format?: ConfigFormat;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  name: string;
  description?: string | null;
  version?: string | null;
  org_path: string;
  abs_path: string;
  content_hash: string;
  required_capabilities: CapabilityRequirement[];
  risk_flags: string[];
  source_id: string;
  is_self_authored: boolean;
  locally_modified: boolean;
  updated_at: string;
}

export interface ArtifactTypeProfile {
  supported: boolean;
  layout?: LayoutMode;
  dialect?: string;
  targets?: {
    global?: string;
    project?: string;
  };
}

export interface CapabilityProfile {
  supported: boolean;
  dialects?: string[];
  config_formats?: ConfigFormat[];
}

export interface HarnessProfile {
  id: string;
  name: string;
  version: number;
  artifact_types: Partial<Record<ArtifactType, ArtifactTypeProfile>>;
  capabilities: Record<string, CapabilityProfile>;
  deactivation: {
    strategy: string;
  };
}

export interface CompatibilityVerdict {
  artifact_id: string;
  harness_id: string;
  result: VerdictResult;
  reason: string | null;
  transformation: string | null;
  override_note?: string | null;
  computed_at: string;
}

export interface DeploymentOperation {
  kind: OperationKind;
  artifact_id?: string;
  source_path?: string;
  target_path?: string;
  method?: PlacementMethod;
  transformation?: string | null;
  reason?: string | null;
  prior_state_ref?: string | null;
}

export interface DeploymentPlan {
  id: string;
  harness_id: string;
  scope: string;
  placements: DeploymentOperation[];
  requires_confirmation: boolean;
  created_at: string;
}

export interface DeploymentRecord {
  id: string;
  harness_id: string;
  scope: string;
  plan_snapshot: DeploymentPlan;
  applied_at: string;
  operations: DeploymentOperation[];
  prior_state_ref: string | null;
}

export interface Loadout {
  id: string;
  name: string;
  description?: string | null;
  members: string[];
  updated_at: string;
}

export interface LoadoutAssignment {
  harness_id: string;
  loadout_id: string;
  active: boolean;
  assigned_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  use_case: string;
  directive: string;
  origin: "hand" | "agentic";
  members: string[];
  updated_at: string;
}

export interface GuidanceFile {
  id: string;
  scope: "canonical" | "harness";
  harness_id?: string | null;
  body: string;
  managed_section: string;
  updated_at: string;
}

export interface Auditor {
  id: string;
  invocation: string[];
  stages: string[];
  parser: string;
  enabled: boolean;
}

export interface AuditFinding {
  artifact_id: string;
  auditor_id: string;
  score: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  findings: unknown;
  evaluated_at: string;
}

export interface EvaluationProposal {
  id: string;
  kind: "grade" | "comparison" | "loadout" | "pipeline" | "audit" | "improvement" | "fix";
  payload: unknown;
  rationale: string;
  model: string;
  turns: number;
  accepted: boolean | null;
  created_at: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function stableId(...parts: string[]): string {
  const data = parts.join("\u001f");
  return Bun.hash(data).toString(36);
}
