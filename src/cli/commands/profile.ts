// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm profile ...`
// Manage declarative harness profiles as data files.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import {
  ProfileRegistry,
  loadProfileFromFile,
  validateProfile,
} from '@core/profiles/profile-registry';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function profileCommand(args: ParsedArgs): OutputEnvelope {
  const action = args.positional[0] ?? 'list';
  const cfg = loadConfig();
  const registry = new ProfileRegistry({ profileDirs: [cfg.profileDir] });

  switch (action) {
    case 'list':
      return success('profile', {
        profiles: registry.listProfiles().map((profile) => ({
          id: profile.id,
          name: profile.name,
          version: profile.version,
          guidanceFilename: profile.guidanceFilename,
        })),
      });
    case 'show': {
      const id = args.positional[1];
      if (!id) return failure('profile', 'usage: qm profile show <id>');
      const profile = registry.getProfile(id);
      return profile ? success('profile', profile) : failure('profile', `profile not found: ${id}`);
    }
    case 'validate': {
      const target = args.positional[1];
      if (!target) return failure('profile', 'usage: qm profile validate <file-or-id>');
      const profile = existsSync(target) ? loadProfileFromFile(target) : registry.getProfile(target);
      if (!profile) return failure('profile', `profile not found: ${target}`);
      const issues = validateProfile(profile);
      return success('profile', { valid: issues.length === 0, issues });
    }
    case 'add':
    case 'edit': {
      const file = args.positional[1];
      if (!file) return failure('profile', `usage: qm profile ${action} <profile-file>`);
      const profile = loadProfileFromFile(file);
      mkdirSync(cfg.profileDir, { recursive: true });
      const ext = file.endsWith('.json') ? '.json' : '.yaml';
      const dest = join(cfg.profileDir, `${profile.id}${ext}`);
      copyFileSync(file, dest);
      return success('profile', { id: profile.id, path: dest, action });
    }
    default:
      return failure('profile', `unknown profile action '${action}'`);
  }
}
