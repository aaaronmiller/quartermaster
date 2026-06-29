// ─────────────────────────────────────────────────────────────
// Quartermaster — Safety Findings & Allowlist (FR-142)
// Trusted allowlist extensible without code changes, plus a
// shared finding normalizer for auditor output.
// ─────────────────────────────────────────────────────────────

import type { RiskSeverity, SafetyFinding } from '@core/types';

// ─── Safety scoring (FR-141) ──────────────────────────────────

/** Per-severity penalty applied to the safety score. */
const SEVERITY_PENALTY: Record<RiskSeverity, number> = {
  low: 0.1,
  medium: 0.3,
  high: 0.6,
  critical: 1.0,
};

/**
 * Compute a normalized safety score in [0, 1] from a set of findings.
 * Score = 1 - (worst single-finding penalty). No findings → 1.0 (fully safe).
 * Deploy gating compares this against the developer-configured threshold.
 */
export function computeSafetyScore(findings: SafetyFinding[]): number {
  if (findings.length === 0) return 1;
  const worst = Math.max(...findings.map((f) => SEVERITY_PENALTY[f.severity] ?? 0));
  return Math.max(0, Math.min(1, 1 - worst));
}

// ─── Allowlist ────────────────────────────────────────────────

export interface AllowlistEntry {
  /** Discriminator for the match strategy used by `isAllowlisted`. */
  kind: 'source' | 'artifact' | 'plugin';
  /**
   * For `kind='source'`: a URL substring/pattern to match against `sourceUrl`.
   * For `kind='artifact'`: an exact artifact ID.
   * For `kind='plugin'`: a plugin name.
   */
  value: string;
  /** Human-readable reason this entry was added. */
  reason: string;
  /** ISO-8601 timestamp of when the entry was added. */
  addedAt: string;
}

/**
 * Manages a trusted allowlist that can be extended at runtime
 * without requiring code changes (FR-142).
 *
 * Entries are loaded from configuration (e.g. quartermaster.config.ts)
 * and mutated via `add` / `remove` for dynamic use-cases.
 */
export class AllowlistManager {
  private readonly entries: AllowlistEntry[];

  constructor(entries: AllowlistEntry[]) {
    // Defensive copy to prevent external mutation of the source array
    this.entries = [...entries];
  }

  /**
   * Return `true` when the artifact or its source URL is covered by any
   * allowlist entry.
   *
   * Match rules by `kind`:
   *  - `artifact` — exact match on `artifactId`
   *  - `source`   — `sourceUrl` contains `entry.value` (substring match)
   *  - `plugin`   — not matched here (plugin-level check belongs to the
   *                 plugin registry); always returns `false` for safety.
   */
  isAllowlisted(artifactId: string, sourceUrl?: string): boolean {
    for (const entry of this.entries) {
      if (entry.kind === 'artifact' && entry.value === artifactId) {
        return true;
      }
      if (entry.kind === 'source' && sourceUrl && sourceUrl.includes(entry.value)) {
        return true;
      }
    }
    return false;
  }

  /** Append a new entry. Duplicates (same kind + value) are silently ignored. */
  add(entry: AllowlistEntry): void {
    const exists = this.entries.some((e) => e.kind === entry.kind && e.value === entry.value);
    if (!exists) {
      this.entries.push(entry);
    }
  }

  /** Remove all entries whose `value` matches `value` (any kind). */
  remove(value: string): void {
    let i = this.entries.length;
    while (i--) {
      const entry = this.entries[i];
      if (entry !== undefined && entry.value === value) {
        this.entries.splice(i, 1);
      }
    }
  }

  /** Return a shallow copy of all current entries. */
  list(): AllowlistEntry[] {
    return [...this.entries];
  }
}

// ─── Finding normalizer ───────────────────────────────────────

const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

function coerceSeverity(raw: unknown): RiskSeverity {
  if (typeof raw === 'string' && VALID_SEVERITIES.has(raw)) {
    return raw as RiskSeverity;
  }
  return 'low';
}

/**
 * Normalize a raw parsed value from auditor JSON output into a
 * typed `SafetyFinding`.
 *
 * Mapping rules:
 *  - `raw.severity`       → `severity`  (validated; falls back to 'low')
 *  - `raw.description`    → `description`
 *  - `raw.recommendation` → `recommendation`
 *  - Missing fields receive safe defaults.
 *
 * This function is intentionally tolerant of unexpected shapes so that
 * third-party auditors with non-standard output can still be ingested.
 */
export function normalizeFinding(
  raw: unknown,
  auditorName: string,
  artifactId: string,
): SafetyFinding {
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return {
      severity: coerceSeverity(obj['severity']),
      source: auditorName,
      artifactId,
      description:
        typeof obj['description'] === 'string' ? obj['description'] : JSON.stringify(raw),
      recommendation:
        typeof obj['recommendation'] === 'string' ? obj['recommendation'] : 'Review manually',
    };
  }

  // Primitive or null — stringify everything
  return {
    severity: 'low',
    source: auditorName,
    artifactId,
    description: JSON.stringify(raw),
    recommendation: 'Review manually',
  };
}
