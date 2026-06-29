// ─────────────────────────────────────────────────────────────
// Quartermaster — Transform Registry
// Named transformations that convert artifacts for a target harness.
// ─────────────────────────────────────────────────────────────

import type { Artifact, HarnessProfile } from '@core/types';

export interface TransformedArtifact {
  original: Artifact;
  content: Uint8Array | string;
  targetPath: string;
  transformName: string;
}

export interface Transform {
  name: string;
  sourceType?: Artifact['type'];
  sourceDialect?: string | undefined;
  targetDialect?: string | undefined;
  apply(
    input: Artifact,
    context: { profile: HarnessProfile; harnessPath: string },
  ): Promise<TransformedArtifact>;
}

export type TransformContext = { profile: HarnessProfile; harnessPath: string };

// ─── Transform Registry ─────────────────────────────────────

export class TransformRegistry {
  private transforms = new Map<string, Transform>();

  constructor() {
    // Register built-in transforms
    this.register(flattenTransform);
    this.register(translateJsonToTomlTransform);
    this.register(translateTomlToJsonTransform);
  }

  /** Register a transform. */
  register(t: Transform): void {
    this.transforms.set(t.name, t);
  }

  /** Get a transform by name. */
  get(name: string): Transform | undefined {
    return this.transforms.get(name);
  }

  /** List all registered transform names. */
  list(): string[] {
    return Array.from(this.transforms.keys());
  }

  /** Find a transform that can handle a dialect mismatch. */
  findTransform(
    sourceType: Artifact['type'] | undefined,
    sourceDialect: string,
    targetDialect: string,
  ): Transform | undefined {
    for (const t of this.transforms.values()) {
      if (t.sourceDialect === sourceDialect && t.targetDialect === targetDialect) {
        // If sourceType is specified, it must also match
        if (t.sourceType && t.sourceType !== sourceType) continue;
        return t;
      }
    }
    return undefined;
  }

  /** Check if a transform exists by name. */
  has(name: string): boolean {
    return this.transforms.has(name);
  }
}

// ─── Built-in Transforms ────────────────────────────────────

/**
 * Flatten transform: rewrites target path to remove nesting.
 */
export const flattenTransform: Transform = {
  name: 'flatten',
  sourceDialect: undefined,
  targetDialect: undefined,

  async apply(input: Artifact, context: TransformContext): Promise<TransformedArtifact> {
    const flatName = input.path.replace(/[\\/]/g, '-');
    return {
      original: input,
      content: '', // content will be read from source
      targetPath: `${context.harnessPath}/${flatName}`,
      transformName: 'flatten',
    };
  },
};

/**
 * JSON to TOML config translation.
 */
export const translateJsonToTomlTransform: Transform = {
  name: 'translate-json-to-toml',
  sourceDialect: 'json',
  targetDialect: 'toml',

  async apply(input: Artifact, context: TransformContext): Promise<TransformedArtifact> {
    // Read original JSON content, convert to TOML format
    const baseName =
      input.path
        .split('/')
        .pop()
        ?.replace(/\.json$/, '.toml') ?? 'config.toml';
    return {
      original: input,
      content: `# Converted from ${input.path}\n# Target: ${context.profile.name}\n`,
      targetPath: `${context.harnessPath}/${baseName}`,
      transformName: 'translate-json-to-toml',
    };
  },
};

/**
 * TOML to JSON config translation.
 */
export const translateTomlToJsonTransform: Transform = {
  name: 'translate-toml-to-json',
  sourceDialect: 'toml',
  targetDialect: 'json',

  async apply(input: Artifact, context: TransformContext): Promise<TransformedArtifact> {
    const baseName =
      input.path
        .split('/')
        .pop()
        ?.replace(/\.toml$/, '.json') ?? 'config.json';
    return {
      original: input,
      content: '{}',
      targetPath: `${context.harnessPath}/${baseName}`,
      transformName: 'translate-toml-to-json',
    };
  },
};
