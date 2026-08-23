import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { analyzeLayout, positionBoundaryEvents, getRouteFallbackCount, resetRouteFallbackCount } from '@bpm/layout-core';
import { swimlaneEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await swimlaneEngine.layout(diagram));
}

describe('swimlane engine', () => {
  it('keeps horizontal lanes as the default and composes vertical lanes side-by-side', async () => {
    const diagram: Diagram = {
      laneDirection: 'vertical',
      pools: [{ id: 'pool1', name: 'Process', lanes: [
        { id: 'lane1', name: 'Operations', nodeIds: ['a'] },
        { id: 'lane2', name: 'A very readable approval lane', nodeIds: ['b'] },
      ] }],
      nodes: [
        { kind: 'activity', id: 'a', label: 'Start work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b', label: 'Approve', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    const [lane1, lane2] = positioned.pools[0].lanes;
    const a = positioned.nodes.find((node) => node.id === 'a')!;
    const b = positioned.nodes.find((node) => node.id === 'b')!;
    expect(lane2.x).toBeGreaterThan(lane1.x + lane1.width);
    expect(lane2.width).toBeGreaterThanOrEqual(lane2.name.length * 7 + 28);
    expect(positioned.pools[0].width).toBeGreaterThanOrEqual(lane2.x + lane2.width - positioned.pools[0].x);
    for (const [node, lane] of [[a, lane1], [b, lane2]] as const) {
      expect(node.x).toBeGreaterThanOrEqual(lane.x);
      expect(node.x + node.width).toBeLessThanOrEqual(lane.x + lane.width);
      expect(node.y).toBeGreaterThanOrEqual(lane.y);
      expect(node.y + node.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
    const edge = positioned.edges.find((candidate) => candidate.id === 'e1')!;
    expect(edge.sourceId).toBe('a');
    expect(edge.targetId).toBe('b');
    expect(edge.points.length).toBeGreaterThanOrEqual(3);
    expect(analyzeLayout(positioned).edgeThroughNode).toEqual([]);
    for (let i = 1; i < edge.points.length; i += 1) {
      expect(edge.points[i].x === edge.points[i - 1].x || edge.points[i].y === edge.points[i - 1].y).toBe(true);
    }
  });

  it('sizes each lane from its own content instead of the pool-wide maximum', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Process',
          lanes: [
            { id: 'lane1', name: 'Detailed work', nodeIds: ['large'] },
            { id: 'lane2', name: 'Sparse work', nodeIds: ['small'] },
          ],
        },
      ],
      nodes: [
        {
          kind: 'activity', id: 'large', label: 'Large', activityType: 'task', collapsed: false,
          children: [], childEdges: [], sizeHint: { width: 120, height: 180 },
        },
        {
          kind: 'activity', id: 'small', label: 'Small', activityType: 'task', collapsed: false,
          children: [], childEdges: [],
        },
      ],
      edges: [],
    };

    const positioned = await layout(diagram);
    const [largeLane, smallLane] = positioned.pools[0].lanes;

    // Normal lane padding is 20px on both sides. The large node therefore needs 220px,
    // while the default 60px task needs only 100px.
    expect(largeLane.height).toBe(220);
    expect(smallLane.height).toBe(100);
    expect(smallLane.y).toBeGreaterThan(largeLane.y + largeLane.height);
  });

  it('keeps lane bounds containing their nodes', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }],
        },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const lane = positioned.pools[0].lanes[0];
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;

    for (const n of [n1, n2]) {
      expect(n.x).toBeGreaterThanOrEqual(lane.x);
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.x + n.width).toBeLessThanOrEqual(lane.x + lane.width);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
    // Horizontal BPMN lanes reserve the left header strip for pool/lane labels.
    expect(n1.x).toBeGreaterThanOrEqual(lane.x);
    expect(lane.x).toBe(positioned.pools[0].x + 30);
    expect(lane.x + lane.width).toBe(positioned.pools[0].x + positioned.pools[0].width);
  });

  it('re-packs pools after lane banding expands their final heights', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'main', name: 'Main', lanes: [
            { id: 'mainLane', name: 'Manufacturing', nodeIds: ['main1', 'main2'] },
          ],
        },
        {
          id: 'secondary', name: 'Secondary', lanes: [
            { id: 'secondaryLane', name: 'Operations', nodeIds: ['secondary1'] },
          ],
        },
      ],
      nodes: [
        { kind: 'activity', id: 'main1', label: 'First', activityType: 'task', collapsed: false, children: [], childEdges: [], sizeHint: { width: 100, height: 500 } },
        { kind: 'activity', id: 'main2', label: 'Second', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'secondary1', label: 'Other', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [],
    };

    const positioned = await layout(diagram);
    const [main, secondary] = positioned.pools;
    expect(secondary.y).toBeGreaterThanOrEqual(main.y + main.height + 24);
  });
});

describe('swimlane — cross-container edges', () => {
  it('routes an edge that crosses lanes within a pool', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [
            { id: 'lane1', name: 'Sales', nodeIds: ['n1'] },
            { id: 'lane2', name: 'Fulfilment', nodeIds: ['n2'] },
          ],
        },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Ship order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    const lane1 = positioned.pools[0].lanes[0];
    const lane2 = positioned.pools[0].lanes[1];

    expect(edge.points.length).toBeGreaterThanOrEqual(3);
    const start = edge.points[0];
    const end = edge.points[edge.points.length - 1];
    // Cross-lane edges leave a source side, are routed by the shared router through the gap
    // between lane bands, and enter the target on the facing side.
    expect([n1.x, n1.x + n1.width]).toContain(start.x);
    expect(start.y).toBe(n1.y + n1.height / 2);
    expect(end.x).toBe(n2.x);
    expect(end.y).toBe(n2.y + n2.height / 2);
    expect(lane2.y).toBeGreaterThan(lane1.y + lane1.height);
    // The router-produced path travels from the source band down to the target band without
    // ever backtracking upward, and clears both endpoint nodes (verified diagram-wide too).
    for (let i = 1; i < edge.points.length; i++) {
      expect(edge.points[i].y).toBeGreaterThanOrEqual(edge.points[i - 1].y);
    }
    const analysis = analyzeLayout(positioned);
    expect(analysis.nodeOverlaps).toEqual([]);
    expect(analysis.edgeThroughNode).toEqual([]);
  });

  it('leaves a short stub after a round source exit (and before target entry) on cross-lane trunks', async () => {
    // A start event is a circle: its bbox right edge is tangent to the circle. Turning
    // vertically exactly at that x grazes the shape; a short horizontal stub before the
    // first turn (and a matching stub before the final entry) gives clean clearance.
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [
            { id: 'lane1', name: 'Sales', nodeIds: ['start'] },
            { id: 'lane2', name: 'Fulfilment', nodeIds: ['task'] },
          ],
        },
      ],
      nodes: [
        { kind: 'event', id: 'start', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'task', label: 'Ship order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'cross', sourceId: 'start', targetId: 'task', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const source = positioned.nodes.find((n) => n.id === 'start')!;
    const target = positioned.nodes.find((n) => n.id === 'task')!;
    const edge = positioned.edges.find((e) => e.id === 'cross')!;
    const exit = edge.points[0];
    const preferRight = exit.x === source.x + source.width;

    // Exit stub: second point continues horizontally past the bbox before any vertical turn.
    const afterExit = edge.points[1];
    expect(afterExit.y).toBe(exit.y);
    if (preferRight) {
      expect(afterExit.x).toBeGreaterThan(exit.x);
    } else {
      expect(afterExit.x).toBeLessThan(exit.x);
    }
    expect(Math.abs(afterExit.x - exit.x)).toBeGreaterThan(0);
    const firstTurn = edge.points[2];
    expect(firstTurn.x).toBe(afterExit.x);
    expect(firstTurn.y).not.toBe(afterExit.y);

    // Entry stub: the target's primary port is on the left, so the final segment
    // approaches horizontally from the outside of the target.
    const entry = edge.points[edge.points.length - 1];
    const beforeEntry = edge.points[edge.points.length - 2];
    expect(entry.x).toBe(target.x);
    expect(entry.y).toBe(target.y + target.height / 2);
    expect(beforeEntry.y).toBe(entry.y);
    expect(beforeEntry.x).toBeLessThan(entry.x);
    expect(entry.x - beforeEntry.x).toBeGreaterThan(0);
  });

  it('routes an edge that crosses two pools', async () => {
    const diagram: Diagram = {
      pools: [
        { id: 'poolA', name: 'Customer', lanes: [{ id: 'laneA', name: 'Customer', nodeIds: ['n1'] }] },
        { id: 'poolB', name: 'Supplier', lanes: [{ id: 'laneB', name: 'Supplier', nodeIds: ['n2'] }] },
      ],
      nodes: [
        { kind: 'activity', id: 'n1', label: 'Order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n2', label: 'Fulfil', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'message' }],
    };

    const positioned = await layout(diagram);
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < edge.points.length; i += 1) {
      expect(edge.points[i].x === edge.points[i - 1].x || edge.points[i].y === edge.points[i - 1].y).toBe(true);
    }
    const analysis = analyzeLayout(positioned);
    expect(analysis.edgeThroughNode).toEqual([]);
    expect(analysis.edgeCrossings).toBe(0);
  });

  it('reroutes cross-pool message flows after vertical lane banding', async () => {
    const diagram: Diagram = {
      laneDirection: 'vertical',
      pools: [
        { id: 'poolA', name: 'Customer', lanes: [{ id: 'laneA', name: 'Customer', nodeIds: ['n1'] }] },
        { id: 'poolB', name: 'Supplier', lanes: [{ id: 'laneB', name: 'Supplier', nodeIds: ['n2'] }] },
      ],
      nodes: [
        { kind: 'activity', id: 'n1', label: 'Order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n2', label: 'Fulfil', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'message' }],
    };

    const positioned = await layout(diagram);
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < edge.points.length; i += 1) {
      expect(edge.points[i].x === edge.points[i - 1].x || edge.points[i].y === edge.points[i - 1].y).toBe(true);
    }
    const analysis = analyzeLayout(positioned);
    expect(analysis.edgeThroughNode).toEqual([]);
    expect(analysis.edgeCrossings).toBe(0);
  });

  it('routes two edges crossing the same lane boundary with overlapping x-spans without crossing each other', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1', name: 'P',
          lanes: [
            { id: 'lane1', name: 'A', nodeIds: ['a1', 'a2'] },
            { id: 'lane2', name: 'B', nodeIds: ['b1', 'b2'] },
          ],
        },
      ],
      nodes: [
        { kind: 'activity', id: 'a1', label: 'A1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'a2', label: 'A2', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b1', label: 'B1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b2', label: 'B2', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e1', sourceId: 'a1', targetId: 'b2', flowType: 'sequence' }, // crosses lane1->lane2, spans right
        { id: 'e2', sourceId: 'a2', targetId: 'b1', flowType: 'sequence' }, // crosses lane1->lane2, spans left — overlaps e1's x-range
      ],
    };

    const positioned = await layout(diagram);
    const e1 = positioned.edges.find((e) => e.id === 'e1')!;
    const e2 = positioned.edges.find((e) => e.id === 'e2')!;
    const lane1 = positioned.pools[0].lanes[0];
    const lane2 = positioned.pools[0].lanes[1];
    expect(lane2.y).toBeGreaterThan(lane1.y + lane1.height);

    // The shared router treats each previously-routed edge as an obstacle for the next one,
    // so two overlapping-x-span cross-lane edges must clear each other (no crossings) as well
    // as every node — verified geometrically rather than by asserting a specific track y.
    expect(e1.points.length).toBeGreaterThanOrEqual(3);
    expect(e2.points.length).toBeGreaterThanOrEqual(3);
    const analysis = analyzeLayout(positioned);
    expect(analysis.nodeOverlaps).toEqual([]);
    expect(analysis.edgeThroughNode).toEqual([]);
    expect(analysis.edgeCrossings).toBe(0);
  });

  it('routes a 3+-lane span on a dedicated trunk x, not a blind vertical at the target port through intermediate content', async () => {
    // a1 (lane A) → c1 (lane C) skips over lane B. A naive stitch that jumps to the target port after
    // the first channel then only changes y would drop a vertical through B's content band.
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'P',
          lanes: [
            { id: 'laneA', name: 'A', nodeIds: ['a1'] },
            { id: 'laneB', name: 'B', nodeIds: ['b1', 'b2'] },
            { id: 'laneC', name: 'C', nodeIds: ['c1'] },
          ],
        },
      ],
      nodes: [
        { kind: 'activity', id: 'a1', label: 'A1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b1', label: 'B1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b2', label: 'B2', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'c1', label: 'C1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'span', sourceId: 'a1', targetId: 'c1', flowType: 'sequence' },
        { id: 'mid', sourceId: 'b1', targetId: 'b2', flowType: 'sequence' },
      ],
    };

    const positioned = await layout(diagram);
    const span = positioned.edges.find((e) => e.id === 'span')!;
    const c1 = positioned.nodes.find((n) => n.id === 'c1')!;
    const laneB = positioned.pools[0].lanes[1];
    const targetX = c1.x;
    const intermediateNodes = positioned.nodes.filter((n) => n.id === 'b1' || n.id === 'b2');

    // Vertical segments whose y-range overlaps lane B's content must not sit on targetX
    // (that is the bug); they run on a dedicated trunk corridor clear of intermediate nodes.
    const trunkVerticals = [];
    for (let i = 0; i < span.points.length - 1; i++) {
      const p = span.points[i];
      const q = span.points[i + 1];
      if (p.x !== q.x) continue;
      const yLo = Math.min(p.y, q.y);
      const yHi = Math.max(p.y, q.y);
      if (yHi <= laneB.y || yLo >= laneB.y + laneB.height) continue;
      trunkVerticals.push(p.x);
      expect(p.x).not.toBe(targetX);
      for (const node of intermediateNodes) {
        expect(p.x < node.x || p.x > node.x + node.width).toBe(true);
      }
    }
    expect(trunkVerticals.length).toBeGreaterThan(0);

    // Converge to the target's primary left port in the final channel.
    const last = span.points[span.points.length - 1];
    expect(last.x).toBe(targetX);
  });

  it('keeps crowded cross-lane associations Manhattan even when the router falls back', async () => {
    // Several artifacts in a lower lane all connect to one task above them — the same
    // shape as protocol→deliver / consent→deliver, which used to emit a raw diagonal
    // once clearance 10/6/4 all failed.
    resetRouteFallbackCount();
    const diagram: Diagram = {
      pools: [{
        id: 'pool1', name: 'P',
        lanes: [
          { id: 'work', name: 'Work', nodeIds: ['deliver'] },
          { id: 'docs', name: 'Docs', nodeIds: ['protocol', 'consent', 'otherDocs'] },
        ],
      }],
      nodes: [
        { kind: 'activity', id: 'deliver', label: 'Deliver', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'dataObject', id: 'protocol', label: 'Protocol' },
        { kind: 'dataObject', id: 'consent', label: 'Consent' },
        { kind: 'dataObject', id: 'otherDocs', label: 'Other' },
      ],
      edges: [
        { id: 'e1', sourceId: 'protocol', targetId: 'deliver', flowType: 'association' },
        { id: 'e2', sourceId: 'consent', targetId: 'deliver', flowType: 'association' },
        { id: 'e3', sourceId: 'otherDocs', targetId: 'deliver', flowType: 'association' },
      ],
    };

    const positioned = await layout(diagram);
    for (const edge of positioned.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < edge.points.length - 1; i++) {
        const a = edge.points[i];
        const b = edge.points[i + 1];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
    expect(getRouteFallbackCount()).toBeGreaterThan(0);
  });
});
