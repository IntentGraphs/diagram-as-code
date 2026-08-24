import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { layoutManual } from '../src/engine.js';

describe('layoutManual — flat (non-pool) diagrams', () => {
  it('places each node at its given position with auto-sized width/height', async () => {
    const diagram: Diagram = {
      pools: [],
      positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'gateway', id: 'g1', label: 'OK?', gatewayType: 'exclusive', position: { x: 220, y: 50 } },
      ],
      edges: [{ id: 'e1', sourceId: 't1', targetId: 'g1', flowType: 'sequence' }],
    };

    const positioned = await layoutManual(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    const g1 = positioned.nodes.find((n) => n.id === 'g1')!;

    expect(t1.x).toBe(40);
    expect(t1.y).toBe(40);
    expect(t1.width).toBeGreaterThan(0);
    expect(t1.height).toBeGreaterThan(0);
    expect(g1.x).toBe(220);
    expect(g1.y).toBe(50);

    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    expect(edge.points[0]).toEqual({ x: t1.x + t1.width, y: t1.y + t1.height / 2 });
  });

  it('applies parent shape-family sizes in manual mode over per-node overrides', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      shapeSizes: { task: { width: 160, height: 72 }, gateway: { width: 64, height: 64 } },
      nodes: [
        { kind: 'activity', id: 't1', label: 'A long task label', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 0, y: 0 } },
        { kind: 'activity', id: 't2', label: 'Override', activityType: 'task', collapsed: false, children: [], childEdges: [], sizeHint: { width: 190, height: 80 }, position: { x: 220, y: 0 } },
        { kind: 'gateway', id: 'g1', label: 'Check', gatewayType: 'exclusive', position: { x: 460, y: 0 } },
      ],
      edges: [],
    };
    const positioned = await layoutManual(diagram);
    expect(positioned.nodes.find((n) => n.id === 't1')).toMatchObject({ width: 160, height: 72 });
    expect(positioned.nodes.find((n) => n.id === 't2')).toMatchObject({ width: 160, height: 72 });
    expect(positioned.nodes.find((n) => n.id === 'g1')).toMatchObject({ width: 64, height: 64 });
  });

  it('throws a clear error when a node has no position', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [{ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] }],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(
      'Node "t1" has no position — every node needs "at (x, y)" in a manual-positioning diagram.',
    );
  });

  it('places an expanded subprocess with children relative to its own origin', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [{
        kind: 'activity', id: 'sp1', label: 'Sub', activityType: 'subProcess', collapsed: false,
        position: { x: 0, y: 0 },
        children: [{ kind: 'activity', id: 'c1', label: 'Inner', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 20, y: 40 } }],
        childEdges: [],
      }],
      edges: [],
    };
    const positioned = await layoutManual(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;
    expect(sp1.children).toBeDefined();
    expect(sp1.children![0].id).toBe('c1');
    expect(sp1.children![0].x).toBeGreaterThan(sp1.x);
    expect(sp1.children![0].y).toBeGreaterThan(sp1.y);
  });

  it('throws a clear error when two nodes overlap', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 50, y: 50 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/overlap/);
  });
});

describe('layoutManual — explicit via waypoints', () => {
  // Regression coverage for a real bug found via apps/web/test/e2e/diagram-import-roundtrip.spec.ts
  // layoutManual's edge router used to ignore `via` entirely and always
  // recompute its own obstacle-avoiding path, silently discarding any routing the DSL author (or
  // an importer round-tripping a bpmn-js edit) had specified.

  it('routes an edge between two top-level nodes through its given via waypoints', async () => {
    const diagram: Diagram = {
      pools: [],
      positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 400, y: 300 } },
      ],
      edges: [{ id: 'e1', sourceId: 't1', targetId: 't2', flowType: 'sequence', waypoints: [{ x: 200, y: 40 }, { x: 200, y: 300 }] }],
    };

    const positioned = await layoutManual(diagram);
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    // Interior points must be exactly the given via — not whatever the auto-router would pick.
    expect(edge.points).toContainEqual({ x: 200, y: 40 });
    expect(edge.points).toContainEqual({ x: 200, y: 300 });
  });

  it('delta-maps via waypoints from a lane-nested source into placed/canvas space', async () => {
    // @bpm/layout-core's waypointMapper convention: via is authored in the SAME frame as the
    // source node's own "at (x, y)" — lane-relative when the source is in a lane. A via point at
    // (10, 10) from a source placed at lane-origin (1000, 500) + its own (40, 40) declared
    // position must land at canvas-absolute (1000 + 10, 500 + 10), not literal (10, 10).
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'Pool',
        lanes: [{ id: 'lane1', name: 'Lane', nodeIds: ['t1'] }],
      }],
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 400, y: 400 } },
      ],
      edges: [{ id: 'e1', sourceId: 't1', targetId: 't2', flowType: 'sequence', waypoints: [{ x: 60, y: 60 }] }],
    };

    const positioned = await layoutManual(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    // dx/dy between t1's placed (canvas) position and its own declared (lane-relative) position
    // is exactly the lane's origin — the via point must be shifted by that same delta.
    const dx = t1.x - 40;
    const dy = t1.y - 40;
    expect(edge.points).toContainEqual({ x: 60 + dx, y: 60 + dy });
  });
});

describe('layoutManual — actionable overlap errors', () => {
  it('suggests a rightward/leftward shift when the horizontal overlap is smaller', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 40, y: 0 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/shift "b" right by 10 \(or the other node left\)/);
  });

  it('suggests a downward/upward shift when the vertical overlap is smaller', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 0, y: 40 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/shift "b" down by 10 \(or the other node up\)/);
  });

  it('still leads with the original identifying message, for any existing tooling matching on it', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 10, y: 10 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/Nodes "a" and "b" overlap at their given positions/);
  });
});

describe('layoutManual — nested subprocess content', () => {
  it('places subprocess children relative to the subprocess own origin and sizes the subprocess to fit them', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          position: { x: 100, y: 100 },
          children: [
            { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true, position: { x: 20, y: 40 } },
            { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 100, y: 30 } },
          ],
          childEdges: [{ id: 'ce1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };

    const positioned = await layoutManual(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;
    expect(sp1.children).toBeDefined();
    const sn1 = sp1.children!.find((n) => n.id === 'sn1')!;
    const sn2 = sp1.children!.find((n) => n.id === 'sn2')!;

    expect(sn1.x).toBeGreaterThan(sp1.x);
    expect(sn1.y).toBeGreaterThan(sp1.y);
    expect(sp1.x + sp1.width).toBeGreaterThanOrEqual(sn2.x + sn2.width);
    expect(sp1.y + sp1.height).toBeGreaterThanOrEqual(sn1.y + sn1.height);

    expect(sp1.childEdges).toBeDefined();
    expect(sp1.childEdges![0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('still allows a collapsed subprocess with no children (unchanged v1 behavior)', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: true, children: [], childEdges: [], position: { x: 0, y: 0 } },
      ],
      edges: [],
    };
    const positioned = await layoutManual(diagram);
    expect(positioned.nodes[0].children).toBeUndefined();
  });

  it('produces zero false-positive overlaps between a subprocess and its own children', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          position: { x: 100, y: 100 },
          children: [
            { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true, position: { x: 20, y: 40 } },
            { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 100, y: 30 } },
          ],
          childEdges: [{ id: 'ce1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };
    const positioned = await layoutManual(diagram);
    expect(analyzeLayout(positioned).nodeOverlaps).toEqual([]);
  });

  it('does not choke on a boundary event attached to a node inside subprocess content', async () => {
    // Boundary events are placed later, by @bpm/layout-core's positionBoundaryEvents, which
    // looks the host up by id in the already-positioned tree and splices the event in as a
    // child of its host's scope. layoutManual must exclude boundary events from the subprocess's
    // own placedChildren (placeNode() rejects them outright — "cannot be manually positioned")
    // rather than trying to place them itself.
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          position: { x: 100, y: 100 },
          children: [
            { kind: 'activity', id: 'sn1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 20, y: 40 } },
            { kind: 'event', id: 'be1', label: 'Timeout', category: 'boundary', trigger: 'timer', interrupting: true, attachedToId: 'sn1' },
          ],
          childEdges: [],
        },
      ],
      edges: [],
    };

    const positioned = await layoutManual(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;
    expect(sp1.children!.map((c) => c.id)).toEqual(['sn1']);
  });
});
