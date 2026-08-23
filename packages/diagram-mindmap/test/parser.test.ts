import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_DEPTH, MAX_NODES, MAX_SOURCE_CHARS, parseMindmap } from '../src/index.js';

const codes = (source: string) => {
  const result = parseMindmap(source);
  return [...result.errors, ...result.semanticErrors].map((error) => error.code);
};
const fixture = (name: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

describe('mindmap parser', () => {
  it('accepts direction and reports invalid direction values', () => {
    expect(parseMindmap('direction: up\nmindmap "Root" as root').ast.direction).toBe('up');
    expect(codes('direction: diagonal\nmindmap "Root" as root')).toContain('invalid_direction');
  });
  it('parses roots, nesting, omitted labels, and explicit empty labels', () => {
    const result = parseMindmap('mindmap "Root" as root\n  mindmap as child\n  mindmap "" as blank');
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.root).toMatchObject({ id: 'root', label: 'Root', hasExplicitLabel: true, depth: 0 });
    expect(result.ast.root.children).toMatchObject([
      { id: 'child', label: 'child', hasExplicitLabel: false, depth: 1 },
      { id: 'blank', label: '', hasExplicitLabel: true, depth: 1 },
    ]);
  });

  it('covers the focused parser fixtures', () => {
    expect(parseMindmap(fixture('single-root.bpm')).errors).toEqual([]);
    expect(parseMindmap(fixture('omitted-labels.bpm')).ast.root.label).toBe('core_system');
    expect(codes(fixture('bad-indent.bpm'))).toContain('bad_indent_step');
    expect(codes(fixture('orphan-indent.bpm'))).toContain('orphan_indent');
    expect(codes(fixture('unicode-labels.bpm'))).toEqual([]);
  });

  it.each([
    ['mindmap "a" as a\nmindmap "b" as b', 'multiple_roots'],
    ['mindmap "a" as a\n   mindmap "b" as b', 'bad_indent_step'],
    ['mindmap "a" as a\n    mindmap "b" as b', 'indent_skips_level'],
    ['\tmindmap "a" as a', 'bad_indent_step'],
    ['mindmap "a" as a\n  mindmap "b" as a', 'duplicate_id'],
    ['mindmap "a" as a\n  mindmap "b" as 1x', 'invalid_id'],
    ['mindmap Budget as budget', 'unparseable_line'],
  ])('reports %s', (source, code) => expect(codes(source)).toContain(code));

  it('reports missing roots and applies the source-size guard first', () => {
    expect(codes(' \n\n')).toContain('missing_root');
    const result = parseMindmap('x'.repeat(MAX_SOURCE_CHARS + 1));
    expect(result.semanticErrors[0]).toMatchObject({ code: 'source_too_large', line: 1 });
  });

  it('enforces node and depth limits incrementally', () => {
    const siblings = ['mindmap as root', ...Array.from({ length: MAX_NODES }, (_, i) => `  mindmap as child${i}`)].join('\n');
    expect(codes(siblings)).toContain('max_nodes_exceeded');
    const chain = Array.from({ length: MAX_DEPTH + 2 }, (_, i) => `${'  '.repeat(i)}mindmap as n${i}`).join('\n');
    expect(codes(chain)).toContain('max_depth_exceeded');
  });

  it('retains duplicate-id diagnostics across depth-limit skips', () => {
    const deep = Array.from({ length: MAX_DEPTH + 2 }, (_, i) => `${'  '.repeat(i)}mindmap as ${i === MAX_DEPTH + 1 ? 'duplicate' : `n${i}`}`);
    deep.push('  mindmap as duplicate');
    const result = parseMindmap(deep.join('\n'));
    expect(result.semanticErrors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'max_depth_exceeded' }),
      expect.objectContaining({ code: 'duplicate_id', line: MAX_DEPTH + 3, token: 'duplicate' }),
    ]));
  });
});
