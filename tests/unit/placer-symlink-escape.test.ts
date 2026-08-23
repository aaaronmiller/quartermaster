import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restorePriorState } from '../../src/core/deploy/placer';

// Reconstruction of the 2026-08-15 incident, in miniature.
//
// A rollback removed 268 files from the operator's source repository. No
// operation named that repository. The path travelled there through a
// directory symlink that a different deployment tool had placed inside the
// harness directory:
//
//   ~/.codex/skills/x/references  ->  /home/cheta/code/custom-skills/x/references
//
// so unlinking "~/.codex/skills/x/references/y.md" deleted the real file in
// the source tree. lstat on the final component sees an ordinary file; the
// symlink is in the prefix.
describe('restorePriorState symlink-escape guard', () => {
  let root: string;
  let harness: string;
  let source: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'qm-escape-'));
    harness = join(root, 'harness', 'skills', 'demo');
    source = join(root, 'source', 'demo', 'references');
    await mkdir(harness, { recursive: true });
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'keep.md'), 'operator content', 'utf8');
    // The hazard: a directory inside the harness that is really the source.
    await symlink(source, join(harness, 'references'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('refuses to unlink through a symlinked parent, leaving the source intact', async () => {
    const op = {
      artifactId: 'demo',
      sourcePath: join(source, 'keep.md'),
      targetPath: join(harness, 'references', 'keep.md'),
      method: 'copy' as const,
    };

    await expect(restorePriorState(op, { kind: 'missing' })).rejects.toThrow(
      /refusing to restore/,
    );

    // The operator's file is still there. This is the whole point.
    expect(await readdir(source)).toEqual(['keep.md']);
  });

  it('refuses to write content through a symlinked parent', async () => {
    const op = {
      artifactId: 'demo',
      sourcePath: join(source, 'keep.md'),
      targetPath: join(harness, 'references', 'keep.md'),
      method: 'copy' as const,
    };

    await expect(
      restorePriorState(op, { kind: 'file', content: 'overwritten' }),
    ).rejects.toThrow(/refusing to restore/);
  });

  it('still operates normally when no symlink is in the path', async () => {
    const plain = join(harness, 'plain.md');
    await writeFile(plain, 'deployed', 'utf8');
    const op = {
      artifactId: 'demo',
      sourcePath: join(source, 'keep.md'),
      targetPath: plain,
      method: 'copy' as const,
    };

    // A genuine rollback inside the harness must keep working.
    await restorePriorState(op, { kind: 'missing' });
    expect(await readdir(harness)).not.toContain('plain.md');
  });
});
