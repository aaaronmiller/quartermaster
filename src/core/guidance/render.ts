import type { GuidanceDocument, PipelineDefinition } from '@core/types';

// ─── Managed Section Delimiters (FR-122) ─────────────────────────────────────

const MANAGED_START = (name: string) => `<!-- MANAGED BY QUARTERMASTER: ${name} -->`;
const MANAGED_END = '<!-- END MANAGED -->';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GuidanceInput {
  canonical: string;
  pipelineDirectives: PipelineDefinition[];
  targetHarness: string;
  existingFile?: string;
}

export interface ManagedSection {
  name: string;
  /** Inclusive character index of the opening delimiter line start. */
  start: number;
  /** Exclusive character index just after the closing delimiter line end. */
  end: number;
  /** Text between the opening and closing delimiters (exclusive of delimiter lines). */
  content: string;
}

// ─── FR-120: Harness filename translation ────────────────────────────────────

/**
 * Returns the canonical guidance filename for a given harness.
 * 'claude-code' → 'CLAUDE.md'; everything else → 'AGENTS.md'.
 */
export function harnessGuidanceFilename(harness: string): string {
  return harness === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md';
}

// ─── FR-122: Detect managed sections ─────────────────────────────────────────

/**
 * Scans `content` line-by-line and returns all well-formed managed sections.
 * An opening tag without a matching closing tag emits a console.warn and is
 * treated as unmanaged (not returned).
 */
export function detectManagedSections(content: string): ManagedSection[] {
  const lines = content.split('\n');
  const sections: ManagedSection[] = [];

  // Build a map of cumulative char offsets so we can convert line indices to
  // character positions without repeated string scanning.
  const lineOffsets: number[] = new Array(lines.length + 1);
  lineOffsets[0] = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i + 1] = (lineOffsets[i] ?? 0) + (lines[i] ?? '').length + 1; // +1 for '\n'
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const openMatch = line.match(/^<!-- MANAGED BY QUARTERMASTER: (.+) -->$/);
    if (openMatch) {
      const name = openMatch[1] ?? '';
      const sectionStart = lineOffsets[i] ?? 0; // char start of the opening delimiter line
      const bodyLines: string[] = [];
      let closed = false;

      i++;
      while (i < lines.length) {
        if (lines[i] === MANAGED_END) {
          // +1 to include the newline that follows the closing delimiter if present
          const sectionEnd = Math.min(lineOffsets[i + 1] ?? content.length, content.length);
          sections.push({
            name,
            start: sectionStart,
            end: sectionEnd,
            content: bodyLines.join('\n'),
          });
          closed = true;
          i++;
          break;
        }
        bodyLines.push(lines[i] ?? '');
        i++;
      }

      if (!closed) {
        console.warn(
          `[quartermaster/guidance] Unclosed managed section "${name}" at char offset ${sectionStart}. Treating as unmanaged.`,
        );
      }
    } else {
      i++;
    }
  }

  return sections;
}

// ─── FR-121 + FR-122: Render guidance document ───────────────────────────────

/**
 * Produces a fully-rendered GuidanceDocument for the given harness.
 *
 * Algorithm:
 *  1. Start from `existingFile` content (or empty string).
 *  2. Strip all existing managed sections, preserving developer content.
 *  3. Append a canonical managed section.
 *  4. Append one managed section per pipeline directive.
 *  5. Return a GuidanceDocument capturing managed/unmanaged breakdown.
 */
export function renderGuidance(input: GuidanceInput): GuidanceDocument {
  const { canonical, pipelineDirectives, targetHarness, existingFile = '' } = input;

  // Step 1 – baseline
  let base = existingFile;

  // Step 2 – strip existing managed sections (FR-122: confine managed additions)
  const existingSections = detectManagedSections(base);

  // Remove in reverse order so earlier offsets remain valid.
  const sorted = [...existingSections].sort((a, b) => b.start - a.start);
  for (const sec of sorted) {
    base = base.slice(0, sec.start) + base.slice(sec.end);
  }

  // Trim any trailing whitespace left by removed sections.
  const unmanagedContent = base.trimEnd();

  // Step 3 – build canonical managed section
  const canonicalBlock = [MANAGED_START('canonical'), canonical, MANAGED_END].join('\n');

  // Step 4 – build per-pipeline managed sections (FR-121)
  const pipelineBlocks = pipelineDirectives.map((pipeline) => {
    const directiveContent = Object.entries(pipeline.directives)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    return [MANAGED_START(`pipeline:${pipeline.name}`), directiveContent, MANAGED_END].join('\n');
  });

  // Assemble final content
  const managedBlocks = [canonicalBlock, ...pipelineBlocks];
  const separator = unmanagedContent.length > 0 ? '\n\n' : '';
  const fullContent = unmanagedContent + separator + managedBlocks.join('\n\n');

  // Step 5 – build sections array for GuidanceDocument
  const managedSections = detectManagedSections(fullContent);
  const managedSet = new Set(managedSections.map((s) => `${s.start}:${s.end}`));

  const sections: GuidanceDocument['sections'] = [];

  // Unmanaged portion (everything before the first managed block in fullContent)
  if (unmanagedContent.length > 0) {
    sections.push({ name: 'developer', content: unmanagedContent, managed: false });
  }

  // Canonical managed section
  sections.push({ name: 'canonical', content: canonical, managed: true });

  // Pipeline managed sections
  for (const pipeline of pipelineDirectives) {
    const directiveContent = Object.entries(pipeline.directives)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    sections.push({
      name: `pipeline:${pipeline.name}`,
      content: directiveContent,
      managed: true,
    });
  }

  const managedJoined = [
    canonical,
    ...pipelineDirectives.map((p) =>
      Object.entries(p.directives)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n'),
    ),
  ].join('\n\n');

  return {
    path: harnessGuidanceFilename(targetHarness),
    harness: targetHarness,
    content: fullContent,
    managed: managedJoined,
    unmanaged: unmanagedContent,
    sections,
  };
}
