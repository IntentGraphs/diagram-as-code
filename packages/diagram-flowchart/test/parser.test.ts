import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_EDGES, MAX_NODES, MAX_SOURCE_CHARS, parseFlowchart } from '../src/index.js';

const fixture = (name: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');
const codes = (source: string) => { const result = parseFlowchart(source); return [...result.errors, ...result.semanticErrors].map((error) => error.code); };

describe('flowchart parser', () => {
  it('accepts direction and reports invalid direction values', () => {
    expect(parseFlowchart('direction: left\nbox "A" as a').ast.direction).toBe('left');
    expect(codes('direction: diagonal\nbox "A" as a')).toContain('invalid_direction');
  });
  it('parses linear, branching, and loop fixtures', () => {
    for (const name of ['linear.bpm', 'branching.bpm', 'loop.bpm']) {
      const result = parseFlowchart(fixture(name));
      expect(result.errors).toEqual([]);
      expect(result.semanticErrors).toEqual([]);
    }
    expect(parseFlowchart(fixture('branching.bpm')).ast.edges.map((edge) => edge.kind)).toEqual(['sequence', 'conditionalSequence', 'conditionalSequence']);
    expect(parseFlowchart(fixture('loop.bpm')).ast.edges[1].kind).toBe('defaultSequence');
  });

  it('accepts the long-label and endpoint/duplicate fixtures for later diagnostics', () => {
    const long = parseFlowchart(fixture('long-label.bpm'));
    expect(long.errors).toEqual([]);
    expect(long.ast.nodes).toHaveLength(2);
    expect(fixture('unknown-endpoint.bpm')).toContain('missing');
    expect(codes(fixture('unknown-endpoint.bpm'))).toContain('unknown_edge_endpoint');
    expect(codes(fixture('duplicate-id.bpm'))).toContain('duplicate_id');
  });

  it.each([
    ['box "a" as a\nbox as b', 'missing_label'],
    ['box "a" as a\na -> b', 'unknown_edge_endpoint'],
    ['box "a" as a\nbox "b" as a', 'duplicate_id'],
    ['box "a" as 1bad', 'invalid_id'],
    ['garbage', 'unparseable_line'],
    [fixture('unsupported-edge.bpm'), 'unsupported_edge_kind'],
    [fixture('bad-declaration.bpm'), 'unsupported_declaration'],
  ])('reports %s', (source, code) => expect(codes(source)).toContain(code));

  it('enforces source, node, and edge limits', () => {
    expect(codes('x'.repeat(MAX_SOURCE_CHARS + 1))).toContain('source_too_large');
    const nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) => `box "n${i}" as n${i}`).join('\n');
    expect(codes(nodes)).toContain('max_nodes_exceeded');
    const edges = ['box "a" as a', 'box "b" as b', ...Array.from({ length: MAX_EDGES + 1 }, () => 'a -> b')].join('\n');
    expect(codes(edges)).toContain('max_edges_exceeded');
  });
});
