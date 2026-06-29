import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { searchCatalog } from '../../src/core/catalog/search';
import { scanRoots } from '../../src/core/catalog/scanner';
import { copyFixtureLibrary, tempRepo } from '../helpers';

describe('catalog metadata (FR-003)', () => {
  test('skill records declared name, description, and version', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const skill = repo.listArtifacts({ type: 'skill' })[0];
    expect(skill?.name).toBe('Deep Research');
    expect(skill?.metadata.description).toBe('Research a topic with multiple source checks.');
    expect(skill?.metadata.version).toBe('1.0.0');
    repo.close();
  });

  test('plugin records its declared manifest fields', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const plugin = repo.listArtifacts({ type: 'plugin' })[0];
    expect(plugin?.name).toBe('review-plugin');
    expect(plugin?.metadata.description).toContain('review');
    repo.close();
  });
});

describe('capability inference (FR-004)', () => {
  test('a plugin bundling a hook is recorded as requiring hook capability', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const plugin = repo.listArtifacts({ type: 'plugin' })[0];
    expect(plugin?.capabilities.some((c) => c.type === 'hooks')).toBe(true);
    repo.close();
  });

  test('a pure skill requires only skill support (no extra capability)', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const skill = repo.listArtifacts({ type: 'skill' })[0];
    expect(skill?.capabilities.map((c) => c.type)).toEqual(['skill']);
    repo.close();
  });

  test('a skill whose body references an MCP server requires the mcp capability (T029)', async () => {
    const { repo } = tempRepo();
    const fixture = join(import.meta.dir, '..', 'fixtures', 'library', 'mcp-ref');
    await scanRoots([fixture], repo);
    const skills = repo.listArtifacts({ type: 'skill' });
    const mcpSkill = skills.find((s) => s.name === 'mcp-using-skill');
    const plainSkill = skills.find((s) => s.name === 'plain-skill');
    expect(mcpSkill?.capabilities.some((c) => c.type === 'mcp')).toBe(true);
    // A skill with no MCP reference stays pure (no over-broad capability).
    expect(plainSkill?.capabilities.map((c) => c.type)).toEqual(['skill']);
    repo.close();
  });
});

describe('catalog search/filter (FR-006)', () => {
  test('filter by type returns only that type', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const results = searchCatalog(repo, { type: 'hook' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((a) => a.type === 'hook')).toBe(true);
    repo.close();
  });

  test('filter by capability returns artifacts requiring it', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const results = searchCatalog(repo, { capability: 'hooks' });
    // Both the hook artifact and the hook-bundling plugin require `hooks`.
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((a) => a.capabilities.some((c) => c.type === 'hooks'))).toBe(true);
    repo.close();
  });

  test('free-text search matches name/path/metadata', async () => {
    const { repo } = tempRepo();
    await scanRoots([copyFixtureLibrary()], repo);
    const results = searchCatalog(repo, { text: 'Deep Research' });
    expect(results.some((a) => a.name === 'Deep Research')).toBe(true);
    repo.close();
  });
});
