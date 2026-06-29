import { describe, expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { rescanIncremental, scanRoots } from '../../src/core/catalog/scanner';
import type { ArtifactType } from '../../src/core/types';
import { copyFixtureLibrary, tempRepo } from '../helpers';

const ALL_TYPES: ArtifactType[] = [
  'skill',
  'plugin',
  'agent',
  'hook',
  'script',
  'mcp-config',
  'slash-command',
  'output-style',
];

describe('scan (FR-001 / FR-002 / FR-005)', () => {
  test('detects all 8 artifact types across nested folders (FR-001)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    const r = await scanRoots([root], repo);

    expect(r.errors).toEqual([]);
    const types = new Set(repo.listArtifacts().map((a) => a.type));
    for (const t of ALL_TYPES) {
      expect(types.has(t)).toBe(true);
    }
    repo.close();
  });

  test('records organizational subfolder path independent of layout (FR-002)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);

    const skill = repo.listArtifacts().find((a) => a.type === 'skill');
    expect(skill?.organizationalPath).toBe('research/deep-research');
    repo.close();
  });

  test('a re-scan of an unchanged library reports no changes (FR-005)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);
    const second = await scanRoots([root], repo);
    expect(second.added.length).toBe(0);
    expect(second.changed.length).toBe(0);
    repo.close();
  });

  test('incremental rescan reports exactly the changed artifact (FR-005)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);

    appendFileSync(join(root, 'research/deep-research/SKILL.md'), '\nappended\n');
    const r = await rescanIncremental(repo);
    expect(r.changed.length).toBe(1);
    expect(r.removed.length).toBe(0);
    repo.close();
  });
});
