// ─────────────────────────────────────────────────────────────
// Quartermaster — Skill Registry Types (D3.1)
// Three-level progressive disclosure model.
// ─────────────────────────────────────────────────────────────

export type SkillStatus = 'proposed' | 'active' | 'disabled' | 'archived' | 'superseded';

export type CostHint = 'on-demand' | 'always' | 'expensive' | 'cheap' | 'unknown';

export interface Level0Metadata {
  name: string;
  description: string;
  triggers: string[];
  status: SkillStatus;
  statusReason?: string | undefined;
  supersededBy?: string | undefined;
  costHint: CostHint;
  organizationalPath: string;
  artifactId: string;
  sourceId: string;
  path: string;
}

export interface Level1Content {
  artifactId: string;
  name: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

export interface Level2Resources {
  artifactId: string;
  name: string;
  references: string[];
  scripts: string[];
  assets: string[];
  missingTargets: string[];
}

export interface DiscoveryQuery {
  text?: string | undefined;
  capability?: string | undefined;
  status?: SkillStatus | SkillStatus[] | undefined;
  includeDisabled?: boolean | undefined;
  includeArchived?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface DiscoveryResult {
  query: DiscoveryQuery;
  total: number;
  returned: number;
  elapsedMs: number;
  results: Level0Metadata[];
}

export interface DedupeQuery {
  text?: string | undefined;
  capability?: string | undefined;
  limit?: number | undefined;
}

export interface DedupeResult {
  query: DedupeQuery;
  totalCandidates: number;
  results: Array<Level0Metadata & { dedupeScore: number; dedupeReason: string }>;
  heldOutMetrics?: HeldOutMetrics | undefined;
}

export interface HeldOutMetrics {
  heldOutSize: number;
  top1Accuracy: number;
  top5Recall: number;
  mrr: number;
  notes: string;
}

export interface GapRecord {
  id: string;
  capability: string;
  context: string;
  createdAt: string;
  createdBy: string;
  status: 'open' | 'triaged' | 'promoted' | 'closed';
}

export interface UsageEvent {
  id: string;
  skill: string;
  version?: string | undefined;
  trigger: 'before_create' | 'task_start' | 'explicit';
  openedPastLevel0: boolean;
  outcome?: 'accepted' | 'reworked' | 'escalated' | 'abandoned' | 'unknown' | undefined;
  clauseId?: string | undefined;
  timestamp: string;
}

export interface BoundaryMapEntry {
  clauseId: string;
  skill: string;
  deferralKind: 'required' | 'advisory' | 'procedure';
  notes?: string | undefined;
}

export interface HarnessDeliveryEntry {
  harness: string;
  skillInjection: 'native' | 'injected' | 'unsupported';
  level0Available: boolean;
  mechanism: string;
  notes?: string | undefined;
}
