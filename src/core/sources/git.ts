// ─────────────────────────────────────────────────────────────
// Quartermaster — Git Subprocess Wrapper
// Shells out to git CLI for clone, fetch, log, checkout.
// ─────────────────────────────────────────────────────────────

import { spawn } from 'child_process';

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
}

export async function isGitAvailable(): Promise<boolean> {
  try {
    await runGit(['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function gitClone(
  url: string,
  dir: string,
  opts?: { shallow?: boolean; branch?: string },
): Promise<void> {
  // Guard against argv flag smuggling: a source URL/ref/branch beginning with
  // '-' would be interpreted by git as an option (e.g. --upload-pack=...).
  assertNotFlag(url, 'repository url');
  if (opts?.branch) assertNotFlag(opts.branch, 'branch');

  const args = ['clone'];
  if (opts?.shallow) args.push('--depth', '1');
  if (opts?.branch) args.push('--branch', opts.branch);
  args.push('--', url, dir);

  await runGit(args, { timeout: 60000 });
}

export async function gitFetch(dir: string): Promise<void> {
  await runGit(['-C', dir, 'fetch', '--all'], { timeout: 30000 });
}

export async function gitLog(dir: string, since?: string): Promise<GitLogEntry[]> {
  const args = ['-C', dir, 'log', '--format=%H|%ai|%s'];
  if (since) args.push('--since', since);

  const { stdout } = await runGit(args, { timeout: 10000 });
  return stdout
    .trim()
    .split('\n')
    .filter((l) => l)
    .map((line) => {
      const [hash, date, ...msgParts] = line.split('|');
      return { hash: hash ?? '', date: date ?? '', message: msgParts.join('|') };
    });
}

export async function gitCheckout(dir: string, ref: string): Promise<void> {
  assertNotFlag(ref, 'ref');
  await runGit(['-C', dir, 'checkout', ref], { timeout: 10000 });
}

/**
 * Resolve a remote ref to its SHA without cloning, via `git ls-remote`.
 * Works for any git host (incl. GitHub over https) — no API token, no rate limit.
 * Returns null on failure (offline, unreachable, unknown ref).
 */
export async function gitLsRemote(url: string, ref = 'HEAD'): Promise<string | null> {
  assertNotFlag(url, 'repository url');
  assertNotFlag(ref, 'ref');
  try {
    const { stdout } = await runGit(['ls-remote', '--', url, ref], { timeout: 20000 });
    const line = stdout.trim().split('\n')[0];
    if (!line) return null;
    const sha = line.split(/\s+/)[0];
    return sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

export async function gitCurrentRef(dir: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(['-C', dir, 'rev-parse', 'HEAD'], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function gitCurrentBranch(dir: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      timeout: 5000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function assertNotFlag(value: string, label: string): void {
  if (value.startsWith('-')) {
    throw new GitArgumentError(`${label} must not start with '-'`);
  }
}

// NOTE: runGit must NOT call isGitAvailable() — isGitAvailable() calls runGit(),
// so a pre-check here causes infinite mutual recursion (which previously made
// every git operation silently fail). Missing git is detected via the spawn
// 'error' handler (ENOENT) instead.
function runGit(
  args: string[],
  opts?: { timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    const timer = opts?.timeout
      ? setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new GitTimeoutError(args[0] ?? 'git'));
        }, opts.timeout)
      : null;

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new GitError(args.join(' '), code ?? -1, stderr));
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      if (err.code === 'ENOENT') reject(new GitNotAvailableError());
      else reject(new GitError(args.join(' '), -1, err.message));
    });
  });
}

export class GitError extends Error {
  constructor(
    public readonly command: string,
    public readonly code: number,
    public readonly stderr: string,
  ) {
    super(`git ${command} exited with code ${code}: ${stderr}`);
    this.name = 'GitError';
  }
}

export class GitTimeoutError extends Error {
  constructor(op: string) {
    super(`git ${op} timed out`);
    this.name = 'GitTimeoutError';
  }
}

export class GitArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitArgumentError';
  }
}

export class GitNotAvailableError extends Error {
  constructor() {
    super('git not installed or not in PATH');
    this.name = 'GitNotAvailableError';
  }
}
