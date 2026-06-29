// ─────────────────────────────────────────────────────────────
// Quartermaster — Source Importers
// Imports artifacts from GitHub, git, marketplace, and local.
// ─────────────────────────────────────────────────────────────

import { scanRoots } from '@core/catalog/scanner';
import type { Artifact, ArtifactSource, ScanResult } from '@core/types';
import type { Repository } from '@storage/repository';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import { gitClone, gitLsRemote } from './git';

export interface ImportOptions {
  source: ArtifactSource;
  targetDir: string;
  pin?: string;
  onProgress?: (msg: string) => void;
}

export class ImportManager {
  constructor(private repo: Repository) {}

  async importFromSource(opts: ImportOptions): Promise<ScanResult> {
    const { source, targetDir, pin, onProgress } = opts;

    await fs.mkdir(targetDir, { recursive: true });

    let extractedDir: string;

    switch (source.kind) {
      case 'github':
        extractedDir = await this.importFromGitHub(source, targetDir, onProgress);
        break;
      case 'git':
        extractedDir = await this.importFromGit(source, targetDir, onProgress);
        break;
      case 'git_subdir':
        extractedDir = await this.importFromGitSubdir(source, targetDir, onProgress);
        break;
      case 'marketplace':
        extractedDir = await this.importFromMarketplace(source, targetDir, onProgress);
        break;
      case 'local':
        extractedDir = await this.importFromLocal(source, targetDir, onProgress);
        break;
      case 'self':
        throw new ImportError('self-authored artifacts are created in the library, not imported');
    }

    // Scan imported directory
    const result = await scanRoots([extractedDir], this.repo);

    // Update provenance and pin on all added artifacts
    const importedRevision = await this.resolveImportedRevision(source);
    for (const artifact of result.added) {
      artifact.source = {
        ...source,
        ...(importedRevision ? { importedRevision } : {}),
        ...(pin ? { pinnedRevision: pin } : {}),
      } as ArtifactSource;
      artifact.provenance = this.formatProvenance(source);
      artifact.metadata = {
        ...artifact.metadata,
        importedHash: artifact.hash,
        ...(importedRevision ? { gitRef: importedRevision } : {}),
      };
      if (pin) {
        artifact.pinnedRevision = pin;
      }
      this.repo.upsertArtifact(artifact);
    }

    return result;
  }

  private async importFromGitHub(
    source: Extract<ArtifactSource, { kind: 'github' }>,
    targetDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const { owner, repo, ref } = source;
    // Use git clone for GitHub - avoids zip extraction
    const url = `https://github.com/${owner}/${repo}.git`;
    const destDir = join(targetDir, `${owner}-${repo}`);

    onProgress?.(`Cloning ${owner}/${repo}@${ref}...`);

    await gitClone(url, destDir, { shallow: true, branch: ref });

    onProgress?.(`Cloned to ${destDir}`);
    return destDir;
  }

  private async importFromGitSubdir(
    source: Extract<ArtifactSource, { kind: 'git_subdir' }>,
    targetDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const { url, ref, subdir } = source;
    const name = basename(url).replace(/\.git$/, '');
    const destDir = join(targetDir, name);

    onProgress?.(`Cloning ${url}...`);

    await gitClone(url, destDir, { shallow: true, branch: ref });

    const subdirPath = join(destDir, subdir);
    onProgress?.(`Using subdirectory ${subdirPath}`);
    return subdirPath;
  }

  private async importFromGit(
    source: Extract<ArtifactSource, { kind: 'git' }>,
    targetDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const { url, ref } = source;
    const name = basename(url).replace(/\.git$/, '');
    const destDir = join(targetDir, name);

    onProgress?.(`Cloning ${url}...`);

    await gitClone(url, destDir, { shallow: true, branch: ref });

    onProgress?.(`Cloned to ${destDir}`);
    return destDir;
  }

  private async importFromMarketplace(
    source: Extract<ArtifactSource, { kind: 'marketplace' }>,
    targetDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const { url } = source;
    const name = basename(new URL(url).pathname) || 'import';
    const destDir = join(targetDir, name);

    onProgress?.(`Downloading from ${url}...`);

    if (url.startsWith('file://')) {
      await fs.cp(new URL(url).pathname, destDir, { recursive: true });
      onProgress?.(`Copied marketplace fixture to ${destDir}`);
      return destDir;
    }

    const res = await fetch(url);
    if (!res.ok) throw new ImportError(`Marketplace download failed: ${res.status}`);

    const content = await res.arrayBuffer();
    await fs.writeFile(destDir, Buffer.from(content));

    onProgress?.(`Saved to ${destDir}`);
    return destDir;
  }

  private async importFromLocal(
    source: Extract<ArtifactSource, { kind: 'local' }>,
    targetDir: string,
    onProgress?: (msg: string) => void,
  ): Promise<string> {
    const { path: srcPath } = source;
    const name = basename(srcPath);
    const destDir = join(targetDir, name);

    onProgress?.(`Copying ${srcPath}...`);

    await fs.cp(srcPath, destDir, { recursive: true });

    onProgress?.(`Copied to ${destDir}`);
    return destDir;
  }

  private formatProvenance(source: ArtifactSource): string {
    switch (source.kind) {
      case 'github':
        return `github:${source.owner}/${source.repo}@${source.ref}${source.subdir ? '/' + source.subdir : ''}`;
      case 'git':
        return `git:${source.url}@${source.ref}`;
      case 'git_subdir':
        return `git:${source.url}@${source.ref}/${source.subdir}`;
      case 'marketplace':
        return `marketplace:${source.url}`;
      case 'local':
        return `local:${source.path}`;
      case 'self':
        return `self:${source.path}`;
    }
  }

  private async resolveImportedRevision(source: ArtifactSource): Promise<string | null> {
    switch (source.kind) {
      case 'github':
        return gitLsRemote(`https://github.com/${source.owner}/${source.repo}`, source.ref || 'HEAD');
      case 'git':
      case 'git_subdir':
        return gitLsRemote(source.url, source.ref || 'HEAD');
      case 'marketplace':
      case 'local':
      case 'self':
        return null;
    }
  }
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
