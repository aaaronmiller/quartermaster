import { describe, expect, it } from 'bun:test';
import { parseJsonContent } from '../../src/core/evaluation/json';

// These cases are transcripts of shapes actually returned by
// `muse-spark-1.2-contributor-free` through the opencode-go gateway on
// 2026-08-21, plus the adversarial shapes a naive indexOf/lastIndexOf
// extractor would get wrong.
describe('parseJsonContent', () => {
  it('parses bare JSON', () => {
    expect(parseJsonContent('{"score":0.8}')).toEqual({ score: 0.8 });
  });

  it('parses a ```json fenced object — the observed failure', () => {
    const content = '```json\n{"score":0.8,"notes":"good"}\n```';
    expect(parseJsonContent(content)).toEqual({ score: 0.8, notes: 'good' });
  });

  it('parses an unlabelled fence', () => {
    expect(parseJsonContent('```\n{"score":1}\n```')).toEqual({ score: 1 });
  });

  it('parses JSON preceded by reasoning preamble', () => {
    const content = 'Here is my assessment of the skill.\n\n{"score":0.5}';
    expect(parseJsonContent(content)).toEqual({ score: 0.5 });
  });

  it('ignores a trailing brace in prose after the object', () => {
    const content = '{"score":0.5}\n\nNote: the {score} field is 0-1.';
    expect(parseJsonContent(content)).toEqual({ score: 0.5 });
  });

  it('ignores braces inside string values', () => {
    const content = '{"notes":"use } and { carefully","score":0.3}';
    expect(parseJsonContent(content)).toEqual({
      notes: 'use } and { carefully',
      score: 0.3,
    });
  });

  it('ignores an escaped quote inside a string value', () => {
    const content = 'prose {"notes":"say \\"hi\\" }","score":0.1} tail';
    expect(parseJsonContent(content)).toEqual({
      notes: 'say "hi" }',
      score: 0.1,
    });
  });

  it('skips an unbalanced brace in the preamble', () => {
    const content = 'Consider { this partial\n{"score":0.9}';
    expect(parseJsonContent(content)).toEqual({ score: 0.9 });
  });

  it('parses a top-level array', () => {
    expect(parseJsonContent('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it('throws when no JSON value is present', () => {
    expect(() => parseJsonContent('I cannot grade this artifact.')).toThrow(
      /not valid JSON/,
    );
  });
});
