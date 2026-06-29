import { expect, test } from 'bun:test';
import { renderGuidance } from '../../src/core/guidance/render';

const pipeline1 = {
  name: 'Coding',
  artifacts: [] as string[],
  directives: { instruction: 'Use strict checks.' },
};

const pipeline2 = {
  name: 'Research',
  artifacts: [] as string[],
  directives: { instruction: 'Cite sources.' },
};

test('guidance rendering preserves user content outside managed markers', () => {
  const rendered = renderGuidance({
    canonical: '# Canonical guidance',
    pipelineDirectives: [pipeline1],
    targetHarness: 'codex',
    existingFile: 'Keep this user rule.\n',
  });

  expect(rendered.unmanaged).toContain('Keep this user rule.');
  expect(rendered.sections.some((s) => s.managed)).toBe(true);

  // Re-render: old pipeline dropped, new pipeline injected, user content preserved
  const rerendered = renderGuidance({
    canonical: '# Canonical guidance',
    pipelineDirectives: [pipeline2],
    targetHarness: 'codex',
    existingFile: 'Keep this user rule.\n' + rendered.sections.map((s) =>
      s.managed ? `<!-- MANAGED BY QUARTERMASTER: ${s.name} -->\n${s.content}\n<!-- END MANAGED -->` : ''
    ).join('\n'),
  });

  expect(rerendered.unmanaged).toContain('Keep this user rule.');
  // Old pipeline's directive gone from managed sections
  const managedContent = rerendered.sections.filter((s) => s.managed).map((s) => s.content).join('');
  expect(managedContent).not.toContain('Use strict checks.');
  expect(managedContent).toContain('Cite sources.');
});

test('harnessGuidanceFilename maps claude-code to CLAUDE.md, others to AGENTS.md', () => {
  const { harnessGuidanceFilename } = require('../../src/core/guidance/render');
  expect(harnessGuidanceFilename('claude-code')).toBe('CLAUDE.md');
  expect(harnessGuidanceFilename('codex')).toBe('AGENTS.md');
  expect(harnessGuidanceFilename('antigravity')).toBe('AGENTS.md');
});

test('one canonical source renders to claude-code (CLAUDE.md) and codex (AGENTS.md)', () => {
  const input = { canonical: '# Guide', pipelineDirectives: [], targetHarness: '' };
  const claude = renderGuidance({ ...input, targetHarness: 'claude-code' });
  const codex = renderGuidance({ ...input, targetHarness: 'codex' });
  expect(claude.path).toBe('CLAUDE.md');
  expect(codex.path).toBe('AGENTS.md');
});
