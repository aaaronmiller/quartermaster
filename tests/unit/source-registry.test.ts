import { describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applySourceLibrary,
  planSourceLibrary,
  resolveAuthorRoot,
  rollbackSourceLibrary,
} from '../../src/core/library/source-registry';

function fixture(): { registry: string; source: string; library: string } {
  const root = mkdtempSync(join(tmpdir(), 'qm-sources-'));
  const source = join(root, 'canonical-skills');
  const library = join(root, 'library');
  mkdirSync(source);
  writeFileSync(join(source, 'SKILL.md'), '---\nname: fixture\n---\n');
  const registry = join(root, 'sources.yaml');
  writeFileSync(
    registry,
    `version: 1\nlibraryRoot: ${library}\nsources:\n  - id: custom-skills\n    class: first-party\n    path: ${source}\n    lifecycle: active\n`,
  );
  return { registry, source, library };
}

describe('source-linked library', () => {
  test('dry-run is read-only and apply creates the requested provenance link', () => {
    const { registry, source, library } = fixture();
    const plan = planSourceLibrary(registry);
    const link = join(library, 'first-party', 'custom-skills');
    expect(plan.conflicts).toEqual([]);
    expect(plan.operations[0]?.action).toBe('create');
    expect(existsSync(link)).toBe(false);

    const applied = applySourceLibrary(plan);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(source);
    expect(applied.recordPath && existsSync(applied.recordPath)).toBe(true);
    expect(existsSync(join(library, 'harness-defaults'))).toBe(true);
  });

  test('rollback removes only links recorded as created', () => {
    const { registry, library } = fixture();
    const applied = applySourceLibrary(planSourceLibrary(registry));
    const link = join(library, 'first-party', 'custom-skills');
    const removed = rollbackSourceLibrary(applied.recordPath!);
    expect(removed).toEqual([link]);
    expect(existsSync(link)).toBe(false);
  });

  test('an existing non-link is a conflict and apply changes nothing', () => {
    const { registry, library } = fixture();
    const link = join(library, 'first-party', 'custom-skills');
    mkdirSync(link, { recursive: true });
    const plan = planSourceLibrary(registry);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.operations).toHaveLength(0);
  });
});

describe('resolveAuthorRoot', () => {
  function authorFixture(tags?: string[], extra?: string): { registry: string; author: string; root: string } {
    const dir = mkdtempSync(join(tmpdir(), 'qm-author-'));
    const author = join(dir, 'author-skills');
    const root = join(dir, 'library');
    mkdirSync(author);
    writeFileSync(join(author, 'SKILL.md'), '---\nname: placeholder\n---\n');
    const tagLine = tags ? `    tags: [${tags.join(', ')}]\n` : '';
    writeFileSync(
      join(dir, 'sources.yaml'),
      `version: 1\nlibraryRoot: ${root}\nsources:\n  - id: author\n    class: first-party\n    path: ${author}\n    lifecycle: active\n    trusted: true\n${tagLine}${extra ?? ''}`,
    );
    return { registry: join(dir, 'sources.yaml'), author, root };
  }

  test('canonical user-authored first-party source wins', () => {
    const { registry, author } = authorFixture(['user-authored', 'canonical']);
    expect(resolveAuthorRoot(registry)).toBe(author);
  });

  test('falls back to any active trusted first-party source without tags', () => {
    const { registry, author } = authorFixture();
    expect(resolveAuthorRoot(registry)).toBe(author);
  });

  test('deprecated first-party source is not eligible', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-author-dep-'));
    const registry = join(dir, 'sources.yaml');
    writeFileSync(
      registry,
      `version: 1\nlibraryRoot: ${join(dir, 'library')}\nsources:\n  - id: old\n    class: first-party\n    path: ${join(dir, 'old')}\n    lifecycle: deprecated\n    trusted: true\n`,
    );
    expect(resolveAuthorRoot(registry)).toBeNull();
  });

  test('returns null when no eligible first-party source exists or target is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-author-none-'));
    const registry = join(dir, 'sources.yaml');
    writeFileSync(
      registry,
      `version: 1\nlibraryRoot: ${join(dir, 'library')}\nsources:\n  - id: third\n    class: third-party\n    path: ${join(dir, 'tp')}\n    lifecycle: active\n    trusted: false\n`,
    );
    expect(resolveAuthorRoot(registry)).toBeNull();
  });
});
