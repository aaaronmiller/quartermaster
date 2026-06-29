// ─────────────────────────────────────────────────────────────
// Quartermaster — perf fixture generator (NFR-001..003)
// Builds an N-artifact nested library on demand (kept out of git;
// 1000 committed files would bloat the repo). Returns the root path.
// ─────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Generate `count` skill artifacts across nested folders under `root`. */
export function generatePerfLibrary(root: string, count = 1000): string {
  for (let i = 0; i < count; i++) {
    const bucket = i % 25; // spread across 25 nested subfolders
    const dir = join(root, `area-${bucket}`, `skill-${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'SKILL.md'),
      `---\nname: skill-${i}\ndescription: perf fixture skill ${i}\nversion: 1.0.0\n---\n# skill-${i}\n\nBody for skill ${i}.\n`,
    );
  }
  return root;
}
