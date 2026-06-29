// ─────────────────────────────────────────────────────────────
// Quartermaster — Safety Auditors (FR-140, FR-141)
// Runs external auditor tools against artifacts, normalizes
// findings, and gates deployment on a configurable threshold.
// ─────────────────────────────────────────────────────────────

import type { Artifact, RiskSeverity, SafetyFinding } from '@core/types';
import { spawn } from 'child_process';

import { normalizeFinding } from './findings';

// ─── Severity ordering ────────────────────────────────────────

const SEVERITY_ORDER: Record<RiskSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ─── Public interfaces ────────────────────────────────────────

export interface AuditorConfig {
  name: string;
  /** Shell command to invoke. `{path}` is substituted with the artifact path. */
  command: string;
  args?: string[];
  /** Process timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
  /** Minimum severity that constitutes a gate failure. */
  severityThreshold?: RiskSeverity;
  enabled: boolean;
}

export interface AuditorResult {
  auditor: string;
  passed: boolean;
  findings: SafetyFinding[];
  rawOutput?: string;
  durationMs: number;
  error?: string;
}

export interface SafetyReport {
  artifactId: string;
  auditors: AuditorResult[];
  /** True when no finding meets or exceeds the effective threshold. */
  passed: boolean;
  overridden?: boolean;
  overrideNote?: string;
}

// ─── Internal helpers ─────────────────────────────────────────

function substituteArtifactPath(template: string, artifactPath: string): string {
  return template.replace(/\{path\}/g, artifactPath);
}

function parseAuditorOutput(
  raw: string,
  auditorName: string,
  artifactId: string,
  fallbackSeverity: RiskSeverity,
): SafetyFinding[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed: unknown = JSON.parse(trimmed);

    // Expected shape: { findings: [...] }
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'findings' in (parsed as object) &&
      Array.isArray((parsed as { findings: unknown }).findings)
    ) {
      return (parsed as { findings: unknown[] }).findings.map((f) =>
        normalizeFinding(f, auditorName, artifactId),
      );
    }

    // Single object finding
    return [normalizeFinding(parsed, auditorName, artifactId)];
  } catch {
    // Non-JSON output: treat the whole output as one low-severity finding
    return [
      normalizeFinding(
        { description: trimmed, severity: fallbackSeverity },
        auditorName,
        artifactId,
      ),
    ];
  }
}

/**
 * Spawn the auditor process and return `{ stdout, stderr, exitCode }`.
 * Rejects with an error whose `code` property is `'ENOENT'` when the
 * binary cannot be found, or `'TIMEOUT'` when the process is killed.
 */
function spawnAuditor(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>;

    try {
      proc = spawn(command, args, { shell: false });
    } catch (err) {
      return reject(err);
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      const timeoutErr = new Error(`Auditor process timed out after ${timeoutMs} ms`);
      (timeoutErr as NodeJS.ErrnoException).code = 'TIMEOUT';
      reject(timeoutErr);
    }, timeoutMs);

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('close', (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        exitCode,
      });
    });
  });
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Run all enabled auditors against `artifact` and aggregate the results
 * into a `SafetyReport`.
 *
 * FR-140: register external auditor tools, invoke them, normalize findings.
 */
export async function runAuditors(
  artifact: Artifact,
  configs: AuditorConfig[],
): Promise<SafetyReport> {
  const enabled = configs.filter((c) => c.enabled);
  const effectiveThreshold: RiskSeverity = 'high'; // sensible project default

  const auditorResults: AuditorResult[] = await Promise.all(
    enabled.map(async (cfg): Promise<AuditorResult> => {
      const timeoutMs = cfg.timeoutMs ?? 30_000;
      const threshold = cfg.severityThreshold ?? effectiveThreshold;
      const startMs = Date.now();

      const command = substituteArtifactPath(cfg.command, artifact.path);
      const rawArgs = (cfg.args ?? []).map((a) => substituteArtifactPath(a, artifact.path));

      let findings: SafetyFinding[] = [];
      let rawOutput: string | undefined;
      let errorMsg: string | undefined;

      try {
        const { stdout, stderr } = await spawnAuditor(command, rawArgs, timeoutMs);
        rawOutput = stdout || stderr;
        findings = parseAuditorOutput(rawOutput, cfg.name, artifact.id, threshold);
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        const isNotFound = nodeErr.code === 'ENOENT';
        const isTimeout = nodeErr.code === 'TIMEOUT';

        errorMsg = nodeErr.message;
        findings = [
          {
            severity: threshold,
            source: cfg.name,
            artifactId: artifact.id,
            description: isNotFound
              ? 'auditor binary not found'
              : isTimeout
                ? `auditor timed out after ${timeoutMs} ms`
                : `auditor error: ${nodeErr.message}`,
            recommendation: isNotFound
              ? `Ensure the auditor '${command}' is installed and on PATH.`
              : 'Check auditor configuration and retry.',
          },
        ];
      }

      const durationMs = Date.now() - startMs;
      const passed = thresholdGate(
        { artifactId: artifact.id, auditors: [], passed: true },
        threshold,
        findings,
      );

      return {
        auditor: cfg.name,
        passed,
        findings,
        ...(rawOutput !== undefined ? { rawOutput } : {}),
        durationMs,
        ...(errorMsg ? { error: errorMsg } : {}),
      };
    }),
  );

  const allFindings = auditorResults.flatMap((r) => r.findings);
  const reportPassed = !allFindings.some(
    (f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[effectiveThreshold],
  );

  return {
    artifactId: artifact.id,
    auditors: auditorResults,
    passed: reportPassed,
  };
}

/**
 * Return `true` (passes) when no finding has severity >= `threshold`.
 *
 * FR-141: gate deployment on configurable safety threshold.
 *
 * The optional `findings` overload lets callers check an ad-hoc list;
 * omitting it checks all findings across the report's auditors.
 */
export function thresholdGate(
  report: SafetyReport,
  threshold: RiskSeverity,
  findings?: SafetyFinding[],
): boolean {
  const toCheck = findings ?? report.auditors.flatMap((a) => a.findings);
  const thresholdOrder = SEVERITY_ORDER[threshold];
  return !toCheck.some((f) => SEVERITY_ORDER[f.severity] >= thresholdOrder);
}
