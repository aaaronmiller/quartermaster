import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('installer uses the canonical repository, qm binary, and fail-closed verification', () => {
  const script = readFileSync(join(import.meta.dir, '..', '..', 'install.sh'), 'utf8');
  expect(script).toContain('aaaronmiller/quartermaster.git');
  expect(script).toContain('BIN_DEST="$BIN_DIR/qm"');
  expect(script).toContain('merge --quiet --ff-only');
  expect(script).not.toContain('reset --quiet --hard');
  expect(script).not.toMatch(/bun test[^\n]*\|\| true/);
  expect(script).toContain('bun run typecheck');
});
