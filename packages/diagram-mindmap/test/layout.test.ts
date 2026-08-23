import { describe, expect, it } from 'vitest';
import { assertNoOverlaps } from '@bpm/diagram-core';
import { layoutMindmap, parseMindmap, type PositionedMindmapNode } from '../src/index.js';

describe('mindmap layout', () => {
  const source = 'mindmap "Root" as root\n  mindmap "A" as a\n    mindmap "A1" as a1\n  mindmap "B" as b';
  const flatten = (node: PositionedMindmapNode): PositionedMindmapNode[] => [node, ...node.children.flatMap(flatten)];

  it('is deterministic and preserves source order', async () => {
    const parsed = parseMindmap('mindmap "Root" as root\n  mindmap "A" as a\n    mindmap "A1" as a1\n  mindmap "B" as b');
    const first = await layoutMindmap(parsed.ast);
    const second = await layoutMindmap(parsed.ast);
    expect(second).toEqual(first);
    expect(first.root.children.map((node) => node.id)).toEqual(['a', 'b']);
    expect(first.edges).toHaveLength(3);
    expect(first.root.children[0].x).toBeGreaterThan(first.root.x);
    expect(first.width).toBe(390);
    expect(first.width).toBeLessThan(3 * 260);
  });

  it('reserves an internal node box before placing neighboring sibling subtrees', async () => {
    const source = [
      'mindmap "Root" as root',
      '  mindmap "A very long internal label that wraps across several lines" as a',
      '    mindmap "leaf" as a1',
      '  mindmap "B very long internal label that wraps across several lines" as b',
      '    mindmap "leaf" as b1',
    ].join('\n');
    const positioned = await layoutMindmap(parseMindmap(source).ast);
    assertNoOverlaps([positioned.root]);
    for (const node of [positioned.root, ...positioned.root.children]) {
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y + node.height).toBeLessThanOrEqual(positioned.height);
    }
  });

  it.each([
    ['right', 'right', 'left'],
    ['left', 'left', 'right'],
    ['down', 'bottom', 'top'],
    ['up', 'top', 'bottom'],
  ] as const)('supports %s direction with complete, correctly anchored edges', async (direction, fromSide, toSide) => {
    const positioned = await layoutMindmap(parseMindmap(source).ast, { direction });
    const allNodes = flatten(positioned.root);
    expect(allNodes).toHaveLength(4);
    expect(positioned.edges).toHaveLength(3);
    expect(positioned.width).toBeGreaterThan(0);
    expect(positioned.height).toBeGreaterThan(0);
    for (const node of allNodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.x + node.width).toBeLessThanOrEqual(positioned.width);
      expect(node.y + node.height).toBeLessThanOrEqual(positioned.height);
    }
    for (const edge of positioned.edges) {
      const from = allNodes.find((node) => node.id === edge.from)!;
      const to = allNodes.find((node) => node.id === edge.to)!;
      const first = edge.points[0];
      const last = edge.points.at(-1)!;
      expect(first).toEqual(expect.objectContaining(fromSide === 'right' ? { x: from.x + from.width } : fromSide === 'left' ? { x: from.x } : fromSide === 'bottom' ? { y: from.y + from.height } : { y: from.y }));
      expect(last).toEqual(expect.objectContaining(toSide === 'right' ? { x: to.x + to.width } : toSide === 'left' ? { x: to.x } : toSide === 'bottom' ? { y: to.y + to.height } : { y: to.y }));
    }
  });

  it('uses an explicit runtime direction over the AST direction', async () => {
    const ast = parseMindmap('direction: right\n' + source).ast;
    const positioned = await layoutMindmap(ast, { direction: 'down' });
    expect(positioned.root.children[0].y).toBeGreaterThan(positioned.root.y);
    expect(positioned.root.children[0].x).not.toBe(positioned.root.x);
  });

  it('keeps seeded varied trees overlap-free and deterministic', async () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const lines = [`mindmap "Root ${seed}" as root`];
      for (let branch = 0; branch < 4; branch += 1) {
        const label = 'Branch ' + 'x'.repeat((seed * 7 + branch * 11) % 42);
        lines.push(`  mindmap "${label}" as b${branch}`);
        for (let leaf = 0; leaf < (seed + branch) % 4; leaf += 1) {
          lines.push(`    mindmap "Leaf ${seed} ${branch} ${leaf}" as b${branch}l${leaf}`);
        }
      }
      const parsed = parseMindmap(lines.join('\n'));
      const first = await layoutMindmap(parsed.ast);
      const second = await layoutMindmap(parsed.ast);
      expect(second).toEqual(first);
      assertNoOverlaps([first.root]);
    }
  });

  it('uses the widest label in each depth without clipping edge endpoints', async () => {
    const positioned = await layoutMindmap(parseMindmap('mindmap "Root" as root\n  mindmap "short" as short\n  mindmap "A very long branch label that wraps" as long\n    mindmap "leaf" as leaf').ast);
    const nodes = flatten(positioned.root);
    expect(nodes.find((node) => node.id === 'long')!.width).toBeGreaterThan(nodes.find((node) => node.id === 'short')!.width);
    for (const edge of positioned.edges) for (const point of edge.points) {
      expect(point.x).toBeGreaterThanOrEqual(0); expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(positioned.width); expect(point.y).toBeLessThanOrEqual(positioned.height);
    }
  });
  it('sizes horizontal columns from their content instead of a fixed maximum', async () => {
    const positioned = await layoutMindmap(parseMindmap('mindmap "R" as r\n  mindmap "short" as s\n    mindmap "tiny" as t').ast);
    expect(positioned.width).toBeLessThan(3 * (MAX_LABEL_WIDTH_PLACEHOLDER));
  });
});

const MAX_LABEL_WIDTH_PLACEHOLDER = 260;
