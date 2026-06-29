// ─────────────────────────────────────────────────────────────
// Quartermaster — Core Domain Type System
// All shared types for catalog, audit, deploy, loadouts,
// pipelines, guidance, evaluation, and safety subsystems.
// ─────────────────────────────────────────────────────────────

// ─── Enums & Literal Unions ─────────────────────────────────

/**
 * All artifact types the catalog recognizes.
 * - `skill`: Agent instruction markdown files (CLAUDE.md, AGENTS.md, etc.)
 * - `plugin`: Packaged component that bundles hooks, commands, or MCP servers
 * - `agent`: Agent configuration with manifest.yaml
 * - `hook`: Lifecycle hook scripts (hook-*)
 * - `mcp-config`: MCP server configuration files
 * - `command`: Slash command definitions
 * - `output-style`: Output formatting configurations
 * - `script`: Standalone executable scripts
 */
export type ArtifactType =
  | 'skill'
  | 'plugin'
  | 'agent'
  | 'hook'
  | 'mcp-config'
  | 'slash-command'
  | 'output-style'
  | 'script';

/** All artifact type values for iteration. */
export const ARTIFACT_TYPES: readonly ArtifactType[] = [
  'skill',
  'plugin',
  'agent',
  'hook',
  'mcp-config',
  'slash-command',
  'output-style',
  'script',
] as const;

// ─── Source ─────────────────────────────────────────────────

/**
 * Discriminated union of all artifact provenance kinds.
 *
 * - `github`: Fetched from a GitHub repository archive
 * - `git`: Cloned from a generic git remote
 * - `git_subdir`: Cloned from a subdirectory of a git remote
 * - `marketplace`: Downloaded from a marketplace URL
 * - `local`: Copied from a local filesystem path
 * - `self`: Authored directly in the local library
 */
export type ArtifactSource =
  | {
      kind: 'github';
      owner: string;
      repo: string;
      ref: string;
      subdir?: string;
      importedRevision?: string;
      pinnedRevision?: string;
      trusted?: boolean;
    }
  | {
      kind: 'git';
      url: string;
      ref: string;
      importedRevision?: string;
      pinnedRevision?: string;
      trusted?: boolean;
    }
  | {
      kind: 'git_subdir';
      url: string;
      ref: string;
      subdir: string;
      importedRevision?: string;
      pinnedRevision?: string;
      trusted?: boolean;
    }
  | {
      kind: 'marketplace';
      url: string;
      importedRevision?: string;
      pinnedRevision?: string;
      trusted?: boolean;
    }
  | { kind: 'local'; path: string; importedRevision?: string; pinnedRevision?: string; trusted?: boolean }
  | { kind: 'self'; path: string; importedRevision?: string; pinnedRevision?: string; trusted?: boolean };

// ─── Capability & Dialect ───────────────────────────────────

/**
 * Declared or inferred capability of an artifact.
 *
 * `type` identifies the capability (e.g. `'hooks'`, `'mcp'`, `'plugins'`).
 * `dialect` identifies the convention variant (e.g. `'claude'`, `'opencode'`).
 * `metadata` carries optional additional context (e.g. version, entry points).
 */
export interface Capability {
  type: string;
  dialect: string;
  metadata?: Record<string, unknown>;
}

// ─── Risk ───────────────────────────────────────────────────

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A risk indicator detected during scanning.
 * `type` classifies the risk; `detail` is a human-readable description;
 * `location` optionally points to the specific field or line.
 */
export interface RiskFlag {
  artifactId: string;
  type:
    | 'bundled-script'
    | 'network-access'
    | 'shell-execution'
    | 'secret-access'
    | 'known-vulnerable-dep'
    | 'base64-code';
  severity: RiskSeverity;
  detail: string;
  location?: string;
}

// ─── Artifact ───────────────────────────────────────────────

/**
 * Primary domain entity representing a single managed artifact
 * in the Quartermaster library.
 */
export interface Artifact {
  /** Unique identifier (typically a content-hash derived or assigned name). */
  id: string;
  /** Artifact type from the controlled vocabulary. */
  type: ArtifactType;
  /** Display name. */
  name: string;
  /** Absolute or library-relative file path. */
  path: string;
  /**
   * Organizational subfolder path within the library, relative to its root
   * (FR-002). Recorded independently of how any harness lays the artifact out;
   * deployment transformations (e.g. flatten) never alter this.
   */
  organizationalPath: string;
  /** SHA-256 content hash of the file. */
  hash: string;
  /** File size in bytes. */
  size: number;
  /** Arbitrary metadata (serialized as JSON in storage). */
  metadata: Record<string, unknown>;
  /** Provenance / source of the artifact. */
  source: ArtifactSource;
  /** Inferred or declared capabilities. */
  capabilities: Capability[];
  /** ISO-8601 timestamp of import. */
  importedAt: string;
  /** ISO-8601 timestamp of last update. */
  updatedAt: string;
  /** Provenance record string. */
  provenance: string;
  /** If pinned, the revision to which this artifact is locked. */
  pinnedRevision?: string;
  /** Whether the artifact has local uncommitted modifications. */
  localModifications?: boolean;
  /** Risk flags detected during scanning. */
  riskFlags?: RiskFlag[];
  /** Names of loadouts that include this artifact. */
  loadouts?: string[];
}

// ─── Verdict & Compatibility ────────────────────────────────

export type VerdictStatus = 'deployable' | 'incompatible' | 'transform';

/**
 * Compatibility verdict for a single (artifact, harness) pair.
 */
export interface Verdict {
  status: VerdictStatus;
  /** Human-readable explanation of the verdict. */
  reason: string;
  /** Name of the transformation required (only when `status === 'transform'`). */
  transformation?: string;
}

// ─── Deployment ─────────────────────────────────────────────

export type DeployMethod = 'link' | 'copy';

/**
 * A single filesystem operation within a deployment plan.
 */
export interface DeploymentOperation {
  /** Source path in the library. */
  sourcePath: string;
  /** Target path in the harness directory. */
  targetPath: string;
  /** Placement method. */
  method: DeployMethod;
  /** Optional transformation name to apply before placement. */
  transform?: string;
  /** Captured prior state for rollback (populated during apply). */
  priorState?: {
    contentHash: string;
    permissions: number;
  };
}

/**
 * A complete deployment plan for a single harness.
 */
export interface DeploymentPlan {
  /** Harness profile id. */
  harness: string;
  /** Ordered list of operations to perform. */
  operations: DeploymentOperation[];
  /** Artifacts excluded from deployment with reasons. */
  excluded: Array<{ artifact: string; reason: string }>;
}

export type DeploymentStatus = 'applied' | 'rolled-back' | 'failed';

/**
 * Immutable record of a completed deployment attempt.
 */
export interface DeploymentRecord {
  id: string;
  timestamp: string;
  harness: string;
  plan: DeploymentPlan;
  status: DeploymentStatus;
}

// ─── Loadout ────────────────────────────────────────────────

/**
 * A named subset of artifacts + pipelines that can be activated
 * per harness to scope deployment.
 */
export interface LoadoutDefinition {
  name: string;
  harnesses: string[];
  /** Artifact IDs included in this loadout. */
  artifacts: string[];
  /** Pipeline names referenced by this loadout. */
  pipelines: string[];
  active: boolean;
}

// ─── Pipeline ───────────────────────────────────────────────

/**
 * A named ordered group of artifacts plus directives that feed
 * into guidance generation.
 */
export interface PipelineDefinition {
  name: string;
  /** Ordered artifact IDs. */
  artifacts: string[];
  /** Key-value directives injected into guidance files. */
  directives: Record<string, unknown>;
}

// ─── Guidance ───────────────────────────────────────────────

/**
 * A rendered guidance document (CLAUDE.md, AGENTS.md, etc.)
 * with managed and unmanaged sections.
 */
export interface GuidanceDocument {
  path: string;
  harness: string;
  managed: string;
  unmanaged: string;
  sections: Array<{
    name: string;
    content: string;
    managed: boolean;
  }>;
}

// ─── Evaluation ─────────────────────────────────────────────

/**
 * Raw output from an agentic evaluation workflow.
 */
export interface RawEvaluation {
  type: 'grade' | 'compare' | 'propose';
  input: unknown;
  output: unknown;
  model: string;
  timestamp: string;
}

// ─── Safety ─────────────────────────────────────────────────

/**
 * A finding produced by a safety auditor.
 */
export interface SafetyFinding {
  severity: RiskSeverity;
  /** Name of the auditor or scanner that produced this finding. */
  source: string;
  description: string;
  artifactId: string;
  recommendation: string;
}

// ─── Scan Results ───────────────────────────────────────────

/**
 * Result of a catalog scan operation.
 */
export interface ScanResult {
  added: Artifact[];
  changed: Artifact[];
  removed: Artifact[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Change set detected during an incremental rescan.
 */
export interface ChangeSet {
  added: Artifact[];
  changed: Artifact[];
  removed: Artifact[];
  upstreamChanges: Array<{
    artifact: string;
    state: 'unchanged' | 'ahead' | 'conflict';
  }>;
}

// ─── Harness Profile ────────────────────────────────────────

/**
 * Location rule for an artifact type within a harness.
 */
export interface ArtifactTypeLocation {
  type: ArtifactType;
  /** Global and project-scoped target directories. */
  locations: {
    global: string;
    project: string;
  };
  /** Whether the harness requires a flat (non-nested) layout. */
  flat: boolean;
  /** Expected config format (null if not a config file). */
  configFormat: string | null;
  /** Optional conventional directory/file name for this artifact type. */
  dirname?: string;
}

/**
 * Capability rule for a harness profile.
 */
export interface CapabilitySupport {
  type: string;
  /** Accepted dialects for this capability. */
  dialects: string[];
}

/**
 * Deployment configuration for a harness profile.
 */
export interface DeploymentConfig {
  method: DeployMethod;
  crossDevice: boolean;
  priorStateBackup: boolean;
}

/**
 * A declarative harness profile describing a single agent
 * environment's layout, capabilities, and deployment rules.
 */
export interface HarnessProfile {
  id: string;
  name: string;
  version: number;
  guidanceFilename: string;
  artifactTypes: ArtifactTypeLocation[];
  capabilities: CapabilitySupport[];
  deployment: DeploymentConfig;
}

// ─── MCP Server Config ─────────────────────────────────────

/**
 * Canonical MCP server definition used for config translation.
 */
export interface McpServerDef {
  name: string;
  type: 'mcp-server';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse';
  url?: string;
}

export type ConfigFormat = 'json' | 'yaml' | 'toml';

// ─── Transform ──────────────────────────────────────────────

/**
 * A named transformation that converts an artifact for a
 * specific target harness (e.g. flatten, config translation).
 */
export interface Transform {
  name: string;
  sourceType?: ArtifactType;
  sourceDialect?: string;
  targetDialect?: string;
  apply(
    input: Artifact,
    context: { profile: HarnessProfile; harnessPath: string },
  ): Promise<TransformedArtifact>;
}

/**
 * Result of applying a transform to an artifact.
 */
export interface TransformedArtifact {
  original: Artifact;
  content: Uint8Array | string;
  targetPath: string;
  transformName: string;
}

// ─── Search ─────────────────────────────────────────────────

/**
 * Structured query for catalog search.
 */
export interface SearchQuery {
  type?: ArtifactType | ArtifactType[];
  capability?: string | string[];
  source?: 'github' | 'git' | 'marketplace' | 'local';
  /** Subpath glob filter. */
  path?: string;
  /** Free-text search across name, path, and metadata. */
  text?: string;
  /** Skill frontmatter tags (only for skills). */
  tags?: string[];
  limit?: number;
  offset?: number;
}

// ─── Gateway / Eval ─────────────────────────────────────────

export interface GatewayConfig {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeout: number;
  maxRetries: number;
}

export interface GatewayResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface EvaluationProposal {
  id: string;
  type: 'loadout' | 'pipeline' | 'evaluation';
  content: unknown;
  rationale: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  acceptedAt?: string;
  rejectionReason?: string;
}

// ─── Sync ───────────────────────────────────────────────────

export interface SyncReport {
  unchanged: string[];
  updated: string[];
  conflicts: Array<{
    artifact: string;
    localRevision: string;
    upstreamRevision: string;
  }>;
  pinned: string[];
  errors: Array<{ artifact: string; error: string }>;
}
