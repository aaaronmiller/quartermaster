// ─────────────────────────────────────────────────────────────
// Quartermaster — Risk Scanner
// Scans artifacts for security and quality risk indicators.
// ─────────────────────────────────────────────────────────────

import type { Artifact, RiskFlag } from '@core/types';
import { promises as fs } from 'fs';

const KNOWN_VULNERABLE_DEPS = [
  'lodash@4.17.15',
  'event-stream@3.3.6',
  'flatmap-stream@0.1.1',
  'minimatch@3.0.0',
];

const SECRET_PATTERNS = [
  /ANTHROPIC_API_KEY/,
  /OPENAI_API_KEY/,
  /GITHUB_TOKEN/,
  /NPM_TOKEN/,
  /AWS_ACCESS_KEY_ID/,
  /AWS_SECRET_ACCESS_KEY/,
  /DATABASE_URL/,
  /PRIVATE_KEY/,
  /SECRET_KEY/,
];

const SHELL_EXEC_PATTERNS = [
  /\bexec\b/,
  /\bspawn\b/,
  /\bshell\s*:\s*true\b/,
  /child_process/,
  /execSync/,
];

const NETWORK_PATTERNS = [
  /\bfetch\b/,
  /\baxios\b/,
  /\bgot\b/,
  /\bnode-fetch\b/,
  /api\./,
  /https?:\/\//,
];

export async function scanRisks(artifact: Artifact): Promise<RiskFlag[]> {
  const flags: RiskFlag[] = [];

  try {
    const content = await readArtifactContent(artifact);
    const metadataStr = JSON.stringify(artifact.metadata);

    // 1. Base64 encoded code detection
    flags.push(...scanBase64Code(artifact, content, metadataStr));

    // 2. Secret access detection
    flags.push(...scanSecretAccess(artifact, content, metadataStr));

    // 3. Shell execution detection
    flags.push(...scanShellExecution(artifact, content));

    // 4. Network access detection
    flags.push(...scanNetworkAccess(artifact, content));

    // 5. Known vulnerable dependencies
    flags.push(...scanKnownVulnerableDeps(artifact, content, metadataStr));

    // 6. Bundled scripts
    flags.push(...scanBundledScripts(artifact, content));
  } catch (err) {
    flags.push({
      artifactId: artifact.id,
      type: 'bundled-script',
      severity: 'low',
      detail: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return flags;
}

function scanBase64Code(artifact: Artifact, content: string, metadataStr: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const base64Regex = /[A-Za-z0-9+/]{100,}={0,2}/g;
  const matches = content.match(base64Regex) ?? [];

  for (const match of matches) {
    try {
      const decoded = Buffer.from(match, 'base64').toString('utf-8');
      if (
        /function\s*\(/.test(decoded) ||
        /\bimport\b/.test(decoded) ||
        /\brequire\b/.test(decoded) ||
        /\bexec\b/.test(decoded) ||
        /\bspawn\b/.test(decoded) ||
        /\beval\b/.test(decoded)
      ) {
        flags.push({
          artifactId: artifact.id,
          type: 'base64-code',
          severity: 'critical',
          detail: 'Base64-encoded executable code detected',
          location: 'content',
        });
      }
    } catch {
      // Not valid base64 or not UTF-8
    }
  }

  return flags;
}

function scanSecretAccess(artifact: Artifact, content: string, metadataStr: string): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const combined = content + ' ' + metadataStr;

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(combined)) {
      flags.push({
        artifactId: artifact.id,
        type: 'secret-access',
        severity: 'high',
        detail: `Potential secret access: ${pattern.source}`,
        location: content.includes(pattern.source.slice(1, -1)) ? 'content' : 'metadata',
      });
    }
  }

  return flags;
}

function scanShellExecution(artifact: Artifact, content: string): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const pattern of SHELL_EXEC_PATTERNS) {
    if (pattern.test(content)) {
      flags.push({
        artifactId: artifact.id,
        type: 'shell-execution',
        severity: 'medium',
        detail: `Shell execution pattern: ${pattern.source}`,
        location: 'content',
      });
      break; // One flag per artifact for shell execution
    }
  }

  return flags;
}

function scanNetworkAccess(artifact: Artifact, content: string): RiskFlag[] {
  const flags: RiskFlag[] = [];

  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.test(content)) {
      flags.push({
        artifactId: artifact.id,
        type: 'network-access',
        severity: 'low',
        detail: `Network access pattern: ${pattern.source}`,
        location: 'content',
      });
      break; // One flag per artifact
    }
  }

  return flags;
}

function scanKnownVulnerableDeps(
  artifact: Artifact,
  _content: string,
  metadataStr: string,
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const combined = metadataStr + ' ' + artifact.provenance;

  for (const dep of KNOWN_VULNERABLE_DEPS) {
    if (combined.includes(dep)) {
      flags.push({
        artifactId: artifact.id,
        type: 'known-vulnerable-dep',
        severity: 'high',
        detail: `Known vulnerable dependency: ${dep}`,
        location: 'metadata',
      });
    }
  }

  return flags;
}

function scanBundledScripts(artifact: Artifact, content: string): RiskFlag[] {
  // Check if artifact itself is a script that might bundle other executables
  if (
    artifact.type === 'script' ||
    artifact.path.endsWith('.sh') ||
    artifact.path.endsWith('.py')
  ) {
    if (
      content.includes('tar ') ||
      content.includes('unzip') ||
      content.includes('curl') ||
      content.includes('wget')
    ) {
      return [
        {
          artifactId: artifact.id,
          type: 'bundled-script',
          severity: 'medium',
          detail: 'Script downloads or extracts executables',
          location: 'content',
        },
      ];
    }
  }
  return [];
}

async function readArtifactContent(artifact: Artifact): Promise<string> {
  try {
    return await fs.readFile(artifact.path, 'utf-8');
  } catch {
    return ''; // Binary or unreadable - return empty for safe scanning
  }
}
