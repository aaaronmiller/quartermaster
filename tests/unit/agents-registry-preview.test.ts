import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  previewAgentsSourceRegistry,
  previewAgentsSourceRegistryFile,
} from '../../src/core/sources/agents-registry-preview';

const fixturePath = resolve('tests/fixtures/agents/source-registry.tsv');
const fixturePaths = new Set([
  '/fixtures/example-plugin',
  '/fixtures/example-skill',
  '/fixtures/composite-skill',
  '/fixtures/composite-skill/skill.md',
  '/fixtures/composite-skill/always-on',
]);

describe('Agents source registry preview', () => {
  test('maps every fixture row to a deterministic candidate without writing state', () => {
    const sourceExists = (path: string): boolean => fixturePaths.has(path);
    const first = previewAgentsSourceRegistryFile(fixturePath, { sourceExists });
    const second = previewAgentsSourceRegistry(readFileSync(fixturePath, 'utf8'), {
      registryPath: fixturePath,
      sourceExists,
    });

    expect(first).toEqual(second);
    expect(first.valid).toBe(true);
    expect(first.diagnostics).toEqual([]);
    expect(first.candidates).toHaveLength(3);
    expect(first.candidates[0]).toMatchObject({
      id: 'plugin:example-plugin',
      kind: 'plugin',
      sourcePath: '/fixtures/example-plugin',
    });
    expect(first.candidates[2]).toMatchObject({
      id: 'skill:composite-skill',
      entrypointOverride: '/fixtures/composite-skill/skill.md',
      extraSourcePath: '/fixtures/composite-skill/always-on',
      extraTarget: 'always-on',
    });
  });

  test('keeps skill and plugin names in separate identity namespaces', () => {
    const text = [
      '# kind|name|source|skill-file-override|extra-source|extra-target',
      'plugin|shared|/fixtures/example-plugin|||',
      'skill|shared|/fixtures/example-skill|||',
    ].join('\n');
    const result = previewAgentsSourceRegistry(text, { sourceExists: () => true });

    expect(result.valid).toBe(true);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      'plugin:shared',
      'skill:shared',
    ]);
  });

  test('reports duplicate identities and unavailable roots explicitly', () => {
    const text = [
      '# kind|name|source|skill-file-override|extra-source|extra-target',
      'skill|missing|/fixtures/missing|||',
      'skill|missing|/fixtures/other|||',
    ].join('\n');
    const result = previewAgentsSourceRegistry(text, { sourceExists: () => false });

    expect(result.valid).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unavailable-source-path',
      'duplicate-source',
    ]);
  });

  test('rejects malformed extra mappings and plugin-only field misuse', () => {
    const text = [
      '# kind|name|source|skill-file-override|extra-source|extra-target',
      'skill|partial|/fixtures/example-skill||/fixtures/extra|',
      'plugin|configured|/fixtures/example-plugin|/fixtures/entry||',
    ].join('\n');
    const result = previewAgentsSourceRegistry(text, { sourceExists: () => true });

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-extra-mapping',
      'unsupported-plugin-field',
    ]);
  });
});
