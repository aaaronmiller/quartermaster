import { describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, symlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restorePriorState } from '../../src/core/deploy/placer';

describe('restorePriorState', () => {
  test('removes a dangling symlink (missing prior state)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-rb-'));
    const target = join(dir, 'dangling-link');
    symlinkSync(join(dir, 'does-not-exist.txt'), target);
    // Sanity: existsSync follows the link and reports false for a dangling link.
    expect(existsSync(target)).toBe(false);
    await restorePriorState({ artifactId: 'a', sourcePath: '/src', targetPath: target, method: 'link' }, { kind: 'missing' });
    expect(() => lstatSync(target)).toThrow();
  });

  test('removes a live symlink (missing prior state)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-rb-'));
    const source = join(dir, 'real.txt');
    const target = join(dir, 'live-link');
    await Bun.write(source, 'x');
    symlinkSync(source, target);
    await restorePriorState({ artifactId: 'a', sourcePath: source, targetPath: target, method: 'link' }, { kind: 'missing' });
    expect(() => lstatSync(target)).toThrow();
  });
});
