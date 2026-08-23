import { describe, expect, it } from 'vitest';
import { assertNoOverlaps } from '@bpm/diagram-core';
import { layoutFlowchart, parseFlowchart } from '../src/index.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');
describe('flowchart layout', () => {
  const chain = (direction?: 'down' | 'up' | 'right' | 'left') => {
    const source = [
      ...(direction ? [`direction: ${direction}`] : []),
      'box "A" as a',
      'box "B" as b',
      'box "C" as c',
      'a -> b',
      'b -> c',
    ].join('\n');
    return parseFlowchart(source).ast;
  };

  const center = (node: { x: number; y: number; width: number; height: number }) => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 });

  it('preserves the legacy downward layout by default', async () => {
    const positioned = await layoutFlowchart(chain());
    const a = positioned.nodes.find((node) => node.id === 'a')!;
    const b = positioned.nodes.find((node) => node.id === 'b')!;
    expect(center(b).y).toBeGreaterThan(center(a).y);
    expect(center(b).x).toBe(center(a).x);
  });

  it.each([
    ['right', 'x', 1],
    ['left', 'x', -1],
    ['down', 'y', 1],
    ['up', 'y', -1],
  ] as const)('lays out a chain %s with matching endpoint orientation', async (direction, axis, sign) => {
    const positioned = await layoutFlowchart(chain(direction));
    expect(positioned.edges).toHaveLength(2);
    expect(positioned.edges.map((edge) => [edge.from, edge.to])).toEqual([['a', 'b'], ['b', 'c']]);
    const nodes = new Map(positioned.nodes.map((node) => [node.id, center(node)]));
    const first = nodes.get('a')!;
    const second = nodes.get('b')!;
    expect((second[axis] - first[axis]) * sign).toBeGreaterThan(0);
    const firstEdge = positioned.edges[0];
    expect(firstEdge.points[0]).not.toEqual(firstEdge.points[firstEdge.points.length - 1]);
    expect(firstEdge.points.at(-1)).toEqual(expect.objectContaining({ [axis]: expect.any(Number) }));
  });

  it('prefers the runtime option over the AST direction', async () => {
    const positioned = await layoutFlowchart(chain('right'), { direction: 'up' });
    const nodes = new Map(positioned.nodes.map((node) => [node.id, center(node)]));
    expect(nodes.get('b')!.y).toBeLessThan(nodes.get('a')!.y);
  });

  it('keeps nodes and routed edges within declared bounds without losing references', async () => {
    const positioned = await layoutFlowchart(parseFlowchart([
      'direction: left',
      'box "Start" as start',
      'decision "Choose" as choose',
      'box "Yes" as yes',
      'box "No" as no',
      'start -> choose',
      'choose => yes: "yes"',
      'choose ->> no: "no"',
    ].join('\n')).ast);
    expect(positioned.edges).toHaveLength(3);
    for (const node of positioned.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(positioned.width);
      expect(node.y + node.height).toBeLessThanOrEqual(positioned.height);
    }
    for (const edge of positioned.edges) {
      expect(edge.from).toEqual(expect.any(String));
      expect(edge.to).toEqual(expect.any(String));
      for (const point of edge.points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(positioned.width);
        expect(point.y).toBeLessThanOrEqual(positioned.height);
      }
    }
  });

  it('lays out a loop without hanging and without overlaps', async () => {
    const positioned = await layoutFlowchart(parseFlowchart(fixture('loop.bpm')).ast);
    expect(positioned.nodes).toHaveLength(3);
    assertNoOverlaps(positioned.nodes);
  });
  it('carries wrapped label lines from sizing into the positioned AST', async () => {
    const positioned = await layoutFlowchart(parseFlowchart(fixture('long-label.bpm')).ast);
    expect(positioned.nodes.every((node) => node.labelLines.length > 1)).toBe(true);
  });
  it('places labeled edges on a real route segment and renders a readable halo', async () => {
    const positioned = await layoutFlowchart(parseFlowchart('box "A" as a\nbox "B" as b\na -> b: "continue"').ast);
    expect(positioned.edges[0]?.labelPosition).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });
  it('places edge labels on the longest clear segment with a halo position', async () => {
    const positioned = await layoutFlowchart(parseFlowchart('box "A" as a\nbox "B" as b\na -> b: "yes"').ast);
    expect(positioned.edges[0]?.labelPosition).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });
  it('is deterministic and overlap-free across seeded graphs', async () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const lines = [`box "Root ${seed}" as root`, 'decision "Continue?" as decision'];
      for (let i = 0; i < 4; i += 1) lines.push(`box "Step ${seed}-${i} ${'x'.repeat((seed * 7 + i * 3) % 30)}" as n${i}`);
      lines.push('root -> decision', 'decision => n0: "yes"', 'decision ->> n1: "retry"', 'n0 -> n2', 'n1 -> n2', 'n2 -> n3');
      const ast = parseFlowchart(lines.join('\n')).ast;
      const first = await layoutFlowchart(ast);
      const second = await layoutFlowchart(ast);
      expect(second).toEqual(first);
      assertNoOverlaps(first.nodes);
    }
  });
});
