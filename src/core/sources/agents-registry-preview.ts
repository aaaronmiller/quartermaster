import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export type AgentsRegistryArtifactKind = 'skill' | 'plugin';

export interface AgentsRegistryCandidate {
  id: string;
  kind: AgentsRegistryArtifactKind;
  name: string;
  sourcePath: string;
  sourceKey: string;
  provenance: {
    format: 'agents-source-registry-v1';
    registryPath: string;
    line: number;
  };
  entrypointOverride?: string;
  extraSourcePath?: string;
  extraTarget?: string;
}

export interface AgentsRegistryDiagnostic {
  severity: 'error' | 'warning';
  code:
    | 'invalid-column-count'
    | 'invalid-kind'
    | 'invalid-name'
    | 'duplicate-source'
    | 'missing-source-path'
    | 'relative-source-path'
    | 'unavailable-source-path'
    | 'invalid-extra-mapping'
    | 'unsupported-plugin-field';
  line: number;
  message: string;
}

export interface AgentsRegistryPreview {
  format: 'agents-source-registry-v1';
  registryPath: string;
  candidates: AgentsRegistryCandidate[];
  diagnostics: AgentsRegistryDiagnostic[];
  valid: boolean;
}

export interface AgentsRegistryPreviewOptions {
  registryPath?: string;
  sourceExists?: (path: string) => boolean;
}

const SOURCE_HEADER = '# kind|name|source|skill-file-override|extra-source|extra-target';
const VALID_NAME = /^[a-z0-9][a-z0-9._-]*$/;

export function previewAgentsSourceRegistry(
  text: string,
  options: AgentsRegistryPreviewOptions = {},
): AgentsRegistryPreview {
  const registryPath = options.registryPath ?? '<memory>';
  const sourceExists = options.sourceExists ?? existsSync;
  const candidates: AgentsRegistryCandidate[] = [];
  const diagnostics: AgentsRegistryDiagnostic[] = [];
  const seen = new Set<string>();
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (lines[0]?.trim() !== SOURCE_HEADER) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-column-count',
      line: 1,
      message: `expected registry header: ${SOURCE_HEADER}`,
    });
  }

  for (const [offset, rawLine] of lines.entries()) {
    const line = offset + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const columns = rawLine.split('|').map((value) => value.trim());
    if (columns.length !== 6) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-column-count',
        line,
        message: `expected 6 pipe-delimited columns, found ${columns.length}`,
      });
      continue;
    }

    const [rawKind, name, sourcePath, entrypointOverride, extraSourcePath, extraTarget] = columns;
    if (rawKind !== 'skill' && rawKind !== 'plugin') {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-kind',
        line,
        message: `unsupported artifact kind: ${rawKind || '<empty>'}`,
      });
      continue;
    }
    if (!name || !VALID_NAME.test(name)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-name',
        line,
        message: `invalid ${rawKind} name: ${name || '<empty>'}`,
      });
      continue;
    }

    const sourceKey = `${rawKind}:${name}`;
    if (seen.has(sourceKey)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-source',
        line,
        message: `duplicate source identity: ${sourceKey}`,
      });
      continue;
    }
    seen.add(sourceKey);

    if (!sourcePath) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-source-path',
        line,
        message: `${sourceKey} has no source path`,
      });
      continue;
    }
    if (!isAbsolute(sourcePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'relative-source-path',
        line,
        message: `${sourceKey} source path must be absolute: ${sourcePath}`,
      });
    } else if (!sourceExists(sourcePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'unavailable-source-path',
        line,
        message: `${sourceKey} source path is unavailable: ${sourcePath}`,
      });
    }

    if (rawKind === 'plugin' && (entrypointOverride || extraSourcePath || extraTarget)) {
      diagnostics.push({
        severity: 'error',
        code: 'unsupported-plugin-field',
        line,
        message: `${sourceKey} cannot use skill override or extra mapping fields`,
      });
    }
    if (Boolean(extraSourcePath) !== Boolean(extraTarget)) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-extra-mapping',
        line,
        message: `${sourceKey} must provide both extra-source and extra-target`,
      });
    }
    if (entrypointOverride && !isAbsolute(entrypointOverride)) {
      diagnostics.push({
        severity: 'error',
        code: 'relative-source-path',
        line,
        message: `${sourceKey} entrypoint override must be absolute: ${entrypointOverride}`,
      });
    } else if (entrypointOverride && !sourceExists(entrypointOverride)) {
      diagnostics.push({
        severity: 'error',
        code: 'unavailable-source-path',
        line,
        message: `${sourceKey} entrypoint override is unavailable: ${entrypointOverride}`,
      });
    }
    if (extraSourcePath && !isAbsolute(extraSourcePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'relative-source-path',
        line,
        message: `${sourceKey} extra source must be absolute: ${extraSourcePath}`,
      });
    } else if (extraSourcePath && !sourceExists(extraSourcePath)) {
      diagnostics.push({
        severity: 'error',
        code: 'unavailable-source-path',
        line,
        message: `${sourceKey} extra source is unavailable: ${extraSourcePath}`,
      });
    }

    candidates.push({
      id: sourceKey,
      kind: rawKind,
      name,
      sourcePath,
      sourceKey,
      provenance: {
        format: 'agents-source-registry-v1',
        registryPath,
        line,
      },
      ...(entrypointOverride ? { entrypointOverride } : {}),
      ...(extraSourcePath ? { extraSourcePath } : {}),
      ...(extraTarget ? { extraTarget } : {}),
    });
  }

  return {
    format: 'agents-source-registry-v1',
    registryPath,
    candidates,
    diagnostics,
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
  };
}

export function previewAgentsSourceRegistryFile(
  registryPath: string,
  options: Omit<AgentsRegistryPreviewOptions, 'registryPath'> = {},
): AgentsRegistryPreview {
  return previewAgentsSourceRegistry(readFileSync(registryPath, 'utf8'), {
    registryPath,
    ...options,
  });
}
