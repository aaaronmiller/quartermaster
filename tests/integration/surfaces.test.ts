// ─────────────────────────────────────────────────────────────
// Surfaces — TUI + local Web over the same engine (NFR-052, NFR-030).
// ─────────────────────────────────────────────────────────────

import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Artifact, EvaluationProposal } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';
import { defaultConfig } from '../../src/core/config/schema';

import { renderCatalog, renderDashboard } from '../../src/tui/app';
import { renderMatrix } from '../../src/tui/views/matrix';
import { renderLoadouts } from '../../src/tui/views/loadouts';
import { renderProposals, applyProposalAction } from '../../src/tui/views/proposals';
import { defaultTheme } from '../../src/tui/theme';
import { computeVerdict } from '../../src/core/audit/auditor';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import { LOCAL_HOST, handleRequest, startWebServer } from '../../src/web/server';

function artifact(id: string): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path: `/lib/${id}.md`,
    organizationalPath: 'research',
    hash: id,
    size: 1,
    metadata: {},
    source: { kind: 'self', path: `/lib/${id}.md` },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:/lib/${id}.md`,
  };
}

function seeded(): Repository {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('alpha'));
  repo.upsertLoadout({ name: 'coding', harnesses: ['claude-code'], artifacts: ['alpha'], pipelines: [], active: true });
  return repo;
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

// ─── TUI (NFR-052) ────────────────────────────────────────────

test('TUI catalog view lists artifacts (T256)', () => {
  const out = renderCatalog([artifact('alpha'), artifact('beta')]);
  expect(out).toContain('alpha');
  expect(out).toContain('Catalog (2)');
});

test('TUI matrix view renders verdicts (T257)', () => {
  const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
  const matrix = [[computeVerdict(artifact('alpha'), codex)]];
  const out = renderMatrix(matrix, ['codex']);
  expect(out).toContain('Compatibility Matrix');
});

test('TUI loadouts view marks the active loadout (T258)', () => {
  const repo = seeded();
  const out = renderLoadouts(repo.listLoadouts());
  expect(out).toContain('coding');
  repo.close();
});

test('TUI proposals view + accept action use the proposal lifecycle (T259)', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  const proposal: EvaluationProposal = {
    id: 'p1',
    type: 'loadout',
    content: { name: 'x', harnesses: [], artifacts: [], pipelines: [], active: false },
    rationale: 'try this',
    status: 'pending',
    createdAt: '2026-06-29T00:00:00Z',
  };
  repo.saveProposal(proposal);
  expect(renderProposals(repo.listProposals())).toContain('p1');
  const accepted = applyProposalAction(repo, 'p1', 'accept');
  expect(accepted.status).toBe('accepted');
  repo.close();
});

test('TUI default theme is dark (T260)', () => {
  expect(defaultTheme.dark).toBe(true);
  expect(defaultTheme.name).toBe('dark');
});

test('TUI dashboard assembles all sections (T261)', () => {
  const repo = seeded();
  const frame = renderDashboard(repo, defaultConfig().profileDir);
  expect(frame).toContain('Quartermaster');
  expect(frame).toContain('Catalog');
  expect(frame).toContain('Loadouts');
  repo.close();
});

// ─── Web (NFR-052, NFR-030) ───────────────────────────────────

test('web server binds localhost only and serves the catalog (T262, T263, T268)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-web-'));
  const repo = new Repository({ dbPath: join(dir, 'catalog.sqlite') });
  repo.upsertArtifact(artifact('alpha'));
  repo.close();

  const handle = startWebServer({ ...defaultConfig(), dbPath: join(dir, 'catalog.sqlite') }, 0);
  cleanups.push(handle.stop);
  expect(handle.url.startsWith('http://127.0.0.1:')).toBe(true);

  const res = await fetch(`${handle.url}/`);
  const html = await res.text();
  expect(res.headers.get('content-type')).toContain('text/html');
  expect(html).toContain('alpha');
  expect(html).toContain('href="/theme.css"'); // dark-mode stylesheet linked
});

test('web matrix, loadouts, and proposals pages render (T264, T265, T266)', async () => {
  const repo = seeded();
  const profileDir = defaultConfig().profileDir;
  for (const path of ['/matrix', '/loadouts', '/proposals']) {
    const res = await handleRequest(repo, profileDir, new Request(`http://127.0.0.1${path}`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('Quartermaster');
  }
  repo.close();
});

test('web proposal accept POST applies the proposal (T266)', async () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.saveProposal({
    id: 'p1',
    type: 'loadout',
    content: { name: 'x', harnesses: [], artifacts: [], pipelines: [], active: false },
    rationale: 'r',
    status: 'pending',
    createdAt: '2026-06-29T00:00:00Z',
  });
  const res = await handleRequest(repo, defaultConfig().profileDir, new Request('http://127.0.0.1/proposals/p1/accept', { method: 'POST' }));
  expect(res.status).toBe(303);
  expect(repo.getProposal('p1')?.status).toBe('accepted');
  repo.close();
});

test('web theme css is dark-mode-first (T267)', async () => {
  const repo = new Repository({ dbPath: ':memory:' });
  const res = await handleRequest(repo, defaultConfig().profileDir, new Request('http://127.0.0.1/theme.css'));
  const css = await res.text();
  expect(res.headers.get('content-type')).toContain('text/css');
  expect(css).toContain('color-scheme: dark');
  expect(LOCAL_HOST).toBe('127.0.0.1');
  repo.close();
});
