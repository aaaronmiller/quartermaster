import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';

export type SourceClass = 'first-party' | 'third-party' | 'harness-defaults';
export type SourceLifecycle = 'active' | 'specialist' | 'deprecated' | 'superseded' | 'quarantined';

export interface SkillSourceRegistration {
  id: string;
  class: SourceClass;
  path: string;
  subpath?: string;
  remote?: string;
  revision?: string;
  trusted?: boolean;
  enabled?: boolean;
  lifecycle?: SourceLifecycle;
  tags?: string[];
  updatePolicy?: 'manual' | 'pull-fast-forward' | 'pinned';
}

export interface SourceRegistry {
  version: 1;
  libraryRoot: string;
  sources: SkillSourceRegistration[];
}

export interface SourceLinkOperation {
  sourceId: string;
  class: SourceClass;
  target: string;
  link: string;
  action: 'create' | 'unchanged' | 'disabled';
}

export interface SourceLibraryPlan {
  operationId: string;
  registryPath: string;
  libraryRoot: string;
  operations: SourceLinkOperation[];
  conflicts: Array<{ sourceId: string; link: string; reason: string }>;
  applied: boolean;
  recordPath?: string;
}

export class SourceRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceRegistryError';
  }
}

export function loadSourceRegistry(registryPath: string): SourceRegistry {
  const resolvedPath = expandPath(registryPath);
  if (!existsSync(resolvedPath)) throw new SourceRegistryError(`source registry does not exist: ${resolvedPath}`);
  const parsed = parseYaml(readFileSync(resolvedPath, 'utf8')) as unknown;
  return validateSourceRegistry(parsed);
}

export function validateSourceRegistry(value: unknown): SourceRegistry {
  if (!value || typeof value !== 'object') throw new SourceRegistryError('source registry must be an object');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new SourceRegistryError('source registry version must be 1');
  if (typeof raw.libraryRoot !== 'string' || raw.libraryRoot.length === 0) {
    throw new SourceRegistryError('libraryRoot must be a non-empty path');
  }
  if (!Array.isArray(raw.sources)) throw new SourceRegistryError('sources must be a list');

  const seen = new Set<string>();
  const sources = raw.sources.map((entry, index) => validateSource(entry, index, seen));
  return { version: 1, libraryRoot: raw.libraryRoot, sources };
}

export function planSourceLibrary(registryPath: string): SourceLibraryPlan {
  const resolvedRegistry = expandPath(registryPath);
  const registry = loadSourceRegistry(resolvedRegistry);
  const libraryRoot = expandPath(registry.libraryRoot);
  const operations: SourceLinkOperation[] = [];
  const conflicts: SourceLibraryPlan['conflicts'] = [];

  for (const source of registry.sources) {
    const target = sourceTarget(source);
    const link = join(libraryRoot, source.class, source.id);
    if (source.enabled === false) {
      operations.push({ sourceId: source.id, class: source.class, target, link, action: 'disabled' });
      continue;
    }
    if (!existsSync(target)) {
      conflicts.push({ sourceId: source.id, link, reason: `canonical source does not exist: ${target}` });
      continue;
    }
    if (!existsSync(link) && !isDanglingLink(link)) {
      operations.push({ sourceId: source.id, class: source.class, target, link, action: 'create' });
      continue;
    }
    const stat = lstatSync(link);
    if (stat.isSymbolicLink() && resolve(dirname(link), readlinkSync(link)) === resolve(target)) {
      operations.push({ sourceId: source.id, class: source.class, target, link, action: 'unchanged' });
    } else {
      conflicts.push({ sourceId: source.id, link, reason: 'destination exists and is not the requested source link' });
    }
  }

  return {
    operationId: `source-library-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`,
    registryPath: resolvedRegistry,
    libraryRoot,
    operations,
    conflicts,
    applied: false,
  };
}

export function applySourceLibrary(plan: SourceLibraryPlan): SourceLibraryPlan {
  if (plan.conflicts.length > 0) {
    throw new SourceRegistryError(`source library has ${plan.conflicts.length} conflict(s); nothing was changed`);
  }
  const created: SourceLinkOperation[] = [];
  try {
    for (const sourceClass of ['first-party', 'third-party', 'harness-defaults'] as const) {
      mkdirSync(join(plan.libraryRoot, sourceClass), { recursive: true });
    }
    for (const operation of plan.operations) {
      if (operation.action !== 'create') continue;
      mkdirSync(dirname(operation.link), { recursive: true });
      symlinkSync(operation.target, operation.link, 'dir');
      created.push(operation);
    }
    const recordDir = join(plan.libraryRoot, '.operations');
    mkdirSync(recordDir, { recursive: true });
    const recordPath = join(recordDir, `${plan.operationId}.json`);
    const applied = { ...plan, applied: true, recordPath };
    writeFileSync(recordPath, `${JSON.stringify(applied, null, 2)}\n`, { flag: 'wx' });
    return applied;
  } catch (error) {
    for (const operation of created.reverse()) {
      if (isLinkTo(operation.link, operation.target)) unlinkSync(operation.link);
    }
    throw error;
  }
}

export function rollbackSourceLibrary(recordPath: string): string[] {
  const resolved = expandPath(recordPath);
  const plan = JSON.parse(readFileSync(resolved, 'utf8')) as SourceLibraryPlan;
  const removed: string[] = [];
  for (const operation of [...plan.operations].reverse()) {
    if (operation.action === 'create' && isLinkTo(operation.link, operation.target)) {
      unlinkSync(operation.link);
      removed.push(operation.link);
    }
  }
  return removed;
}

function validateSource(value: unknown, index: number, seen: Set<string>): SkillSourceRegistration {
  if (!value || typeof value !== 'object') throw new SourceRegistryError(`sources[${index}] must be an object`);
  const raw = value as Record<string, unknown>;
  const id = raw.id;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    throw new SourceRegistryError(`sources[${index}].id must use lowercase letters, numbers, dots, dashes, or underscores`);
  }
  if (seen.has(id)) throw new SourceRegistryError(`duplicate source id: ${id}`);
  seen.add(id);
  const sourceClass = raw.class;
  if (!['first-party', 'third-party', 'harness-defaults'].includes(String(sourceClass))) {
    throw new SourceRegistryError(`sources[${index}].class is invalid`);
  }
  if (typeof raw.path !== 'string' || raw.path.length === 0) {
    throw new SourceRegistryError(`sources[${index}].path must be a non-empty path`);
  }
  if (raw.subpath !== undefined && (typeof raw.subpath !== 'string' || normalize(raw.subpath).startsWith('..'))) {
    throw new SourceRegistryError(`sources[${index}].subpath must remain inside its source`);
  }
  return raw as unknown as SkillSourceRegistration;
}

function sourceTarget(source: SkillSourceRegistration): string {
  const base = expandPath(source.path);
  return source.subpath ? resolve(base, source.subpath) : base;
}

function expandPath(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const expanded = path === '~' ? home : path.startsWith('~/') ? join(home, path.slice(2)) : path;
  return isAbsolute(expanded) ? normalize(expanded) : resolve(expanded);
}

function isDanglingLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isLinkTo(link: string, target: string): boolean {
  try {
    return lstatSync(link).isSymbolicLink() && resolve(dirname(link), readlinkSync(link)) === resolve(target);
  } catch {
    return false;
  }
}
