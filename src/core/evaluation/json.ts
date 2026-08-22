import { GatewayError } from './gateway';

// Models routed through an OpenAI-compatible gateway rarely return bare JSON.
// Observed 2026-08-21 against `muse-spark-1.2-contributor-free` on
// opencode-go: every grading response arrived wrapped in a ```json fence, and
// a strict JSON.parse rejected it with "Unrecognized token '`'". Reasoning
// models additionally emit a sentence or two of preamble before the object.
//
// Refusing those responses is not a correctness win. The model answered; only
// the envelope differs. So peel the envelope in three escalating steps and
// only fail when no JSON value can be found at all.

/** Strip one leading ```/```json fence and its closing fence, if present. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/^\s*```(?:[A-Za-z0-9_-]+)?\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/);
  return fenced?.[1] ?? text;
}

// Scan for the first balanced { } or [ ] span, ignoring braces that sit inside
// string literals. A naive indexOf/lastIndexOf pair breaks on trailing prose
// that itself contains a brace, which is exactly what a chatty model produces.
function extractJsonSpan(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j++) {
      const ch = text[j];

      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return text.slice(i, j + 1);
      }
    }
    // Unbalanced from this opener; a later one may still close cleanly.
  }
  return null;
}

export function parseJsonContent<T>(content: string): T {
  const candidates = [content, stripCodeFence(content)];

  const span = extractJsonSpan(stripCodeFence(content)) ?? extractJsonSpan(content);
  if (span) candidates.push(span);

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    try {
      return JSON.parse(trimmed) as T;
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw new GatewayError(
    `Model response was not valid JSON: ${lastError?.message ?? 'no JSON value found'}`,
  );
}
