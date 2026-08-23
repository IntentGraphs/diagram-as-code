import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { parse } from '@bpm/parser';
import { layout } from '../src/index.js';

const task = (id: string, label: string) =>
  ({ kind: 'activity' as const, id, label, activityType: 'task' as const, collapsed: false, children: [], childEdges: [] });

describe('@bpm/layout facade', () => {
  it('auto-selects swimlane for diagrams with pools and lanes', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.pools[0].lanes).toHaveLength(1);
    const lane = positioned.pools[0].lanes[0];
    for (const n of positioned.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });

  it('auto-selects flat when there are no pools', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
    expect(positioned.pools).toEqual([]);
  });

  it.each([
    ['right', 'x'], ['left', 'x'], ['down', 'y'], ['up', 'y'],
  ] as const)('honors direct layout direction: %s', async (direction, axis) => {
    const positioned = await layout({
      pools: [],
      nodes: [task('a', 'A'), task('b', 'B')],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', flowType: 'sequence' }],
    }, { direction });
    const a = positioned.nodes.find((n) => n.id === 'a')!;
    const b = positioned.nodes.find((n) => n.id === 'b')!;
    expect(axis === 'x' ? a.x !== b.x : a.y !== b.y).toBe(true);
    if (direction === 'right') expect(b.x).toBeGreaterThan(a.x);
    if (direction === 'left') expect(b.x).toBeLessThan(a.x);
    if (direction === 'down') expect(b.y).toBeGreaterThan(a.y);
    if (direction === 'up') expect(b.y).toBeLessThan(a.y);
  });

  it('lets layout: flat override a pool/lane diagram', async () => {
    const diagram: Diagram = {
      layout: 'flat',
      pools: [
        {
          id: 'p1', name: 'P',
          lanes: [
            { id: 'l1', name: 'A', nodeIds: ['n1'] },
            { id: 'l2', name: 'B', nodeIds: ['n2'] },
          ],
        },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
  });

  it('throws for an explicit unknown engine name', async () => {
    const diagram: Diagram = {
      layout: 'bogus',
      pools: [],
      nodes: [task('n1', 'Work')],
      edges: [],
    };
    await expect(layout(diagram)).rejects.toThrow(/Unknown layout engine "bogus"/);
  });

  it('lets an engineOverride force flat even for a pool/lane diagram', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram, { engineOverride: 'flat' });
    // Flat still emits pool shells but does not assign lane bands (unlike swimlane).
    expect(positioned.pools).toHaveLength(1);
    expect(positioned.pools[0].lanes).toEqual([]);
    expect(positioned.nodes).toHaveLength(2);
  });

  it('lets an engineOverride win over an explicit layout: directive', async () => {
    const diagram: Diagram = {
      layout: 'swimlane',
      pools: [],
      nodes: [task('n1', 'Work')],
      edges: [],
    };
    const positioned = await layout(diagram, { engineOverride: 'flat' });
    expect(positioned.nodes).toHaveLength(1);
  });

  it('throws for an unknown engineOverride name', async () => {
    const diagram: Diagram = { pools: [], nodes: [task('n1', 'Work')], edges: [] };
    await expect(layout(diagram, { engineOverride: 'bogus' })).rejects.toThrow(/Unknown layout engine "bogus"/);
  });

  it('routes a manual-positioning diagram to the manual engine, bypassing engine selection', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [{ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } }],
      edges: [],
    };
    const positioned = await layout(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    expect(t1.x).toBe(40);
    expect(t1.y).toBe(40);
  });

  it('still runs positionBoundaryEvents on top of a manual-positioning diagram', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 'host' },
      ],
      edges: [],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes.some((n) => n.id === 'b1')).toBe(true);
  });
});

describe('layout — pinned node override', () => {
  it('produces identical output when no node is pinned (non-regression)', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const a = await layout(diagram);
    const b = await layout(diagram);
    expect(a).toEqual(b);
  });

  it('overrides one pinned node while auto-laying-out the rest', async () => {
    const { diagram, errors } = parse([
      'task "A" as a1 at (500, 500)',
      'task "B" as b1',
      'task "C" as c1',
      'a1 -> b1',
      'b1 -> c1',
    ].join('\n'));
    expect(errors).toEqual([]);
    const result = await layout(diagram);
    const a1 = result.nodes.find((n) => n.id === 'a1')!;
    expect(a1.x).toBe(500);
    expect(a1.y).toBe(500);
    expect(result.nodes.find((n) => n.id === 'b1')).toBeDefined();
    expect(result.nodes.find((n) => n.id === 'c1')).toBeDefined();
  });

  it('throws the actionable overlap error when a pinned node collides with an auto-placed neighbor', async () => {
    const { diagram: base } = parse(['task "A" as a1', 'task "B" as b1', 'a1 -> b1'].join('\n'));
    const auto = await layout(base);
    const b1 = auto.nodes.find((n) => n.id === 'b1')!;
    const { diagram, errors } = parse([
      `task "A" as a1 at (${b1.x}, ${b1.y})`,
      'task "B" as b1',
      'a1 -> b1',
    ].join('\n'));
    expect(errors).toEqual([]);
    await expect(layout(diagram)).rejects.toThrow(/overlap at their given positions/);
  });

  it('honors a lane-relative pin inside a pool', async () => {
    const text = [
      'pool "Order"',
      '  lane "Sales"',
      '    task "Review" as t1 at (40, 40)',
      '    task "Approve" as t2',
      't1 -> t2',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const result = await layout(diagram);
    const lane = result.pools[0].lanes[0];
    const t1 = result.nodes.find((n) => n.id === 't1')!;
    expect(t1.x).toBe(lane.x + 40);
    expect(t1.y).toBe(lane.y + 40);
  });
});
