import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents } from '../src/boundaryEvents.js';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '../src/types.js';
import { analyzeLayout } from '../test-utils/geometry.js';

function activity(
  partial: Partial<PositionedNode> & Pick<PositionedNode, 'id' | 'x' | 'y' | 'width' | 'height'>,
): PositionedNode {
  return {
    kind: 'activity',
    label: '',
    activityType: 'task',
    collapsed: false,
    children: [],
    childEdges: [],
    ...partial,
  } as PositionedNode;
}

/** Liang-Barsky segment-vs-AABB check matching test-utils/geometry.ts. */
function segmentIntersectsRect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
  marginX = 3,
  marginY = 3,
): boolean {
  const rx = rect.x + marginX;
  const ry = rect.y + marginY;
  const rw = rect.width - 2 * marginX;
  const rh = rect.height - 2 * marginY;
  if (rw <= 0 || rh <= 0) return false;

  let t0 = 0;
  let t1 = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const checks: Array<[number, number]> = [
    [-dx, p1.x - rx],
    [dx, rx + rw - p1.x],
    [-dy, p1.y - ry],
    [dy, ry + rh - p1.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function edgeClipsNode(edge: RoutedEdge, node: PositionedNode): boolean {
  for (let k = 0; k < edge.points.length - 1; k++) {
    if (segmentIntersectsRect(edge.points[k], edge.points[k + 1], node)) return true;
  }
  return false;
}

describe('positionBoundaryEvents — routeAroundScope direction', () => {
  it('does not sweep past the right of source/target when the escalation target is to the left', () => {
    // Mirrors the real bug: boundary event on a right-side host escalating to a
    // far-left handler, while other content sits even further right. The old
    // route always swept right of every node (past the diagram edge) before
    // doubling back left — an enormous unnecessary detour.
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event',
          id: 'b1',
          label: 'Escalate',
          category: 'intermediate',
          trigger: 'escalation',
          interrupting: true,
          attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Handler', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'rightFiller', label: 'Other', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence' }],
    };

    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 1100, y: 100, width: 100, height: 80 }),
        activity({ id: 'target', x: 100, y: 200, width: 100, height: 80 }),
        activity({ id: 'rightFiller', x: 2000, y: 100, width: 100, height: 80 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1');
    expect(edge).toBeDefined();

    const start = edge!.points[0];
    const target = result.nodes.find((n) => n.id === 'target')!;
    expect(target.x + target.width / 2).toBeLessThan(start.x);

    // When the target is on the left, the corridor must not wander further right
    // than a small margin past source/target — sweeping out to rightFiller (x=2000+)
    // is the bug this assertion catches.
    const rightBound = Math.max(start.x, target.x + target.width) + 48;
    const maxRouteX = Math.max(...edge!.points.map((p) => p.x));
    expect(maxRouteX).toBeLessThanOrEqual(rightBound);

    const end = edge!.points[edge!.points.length - 1];
    expect(end.x).toBe(target.x);
    expect(end.y).toBe(target.y + target.height / 2);
  });
});

describe('positionBoundaryEvents — final approach obstacle avoidance', () => {
  it('does not cut through an intervening node on the straight final approach into the target', () => {
    // Reproduces the blind final-approach bug: routeAroundScope sweeps out to clearX,
    // drops to the target's mid-y, then draws a straight horizontal into the target's
    // entry border — ignoring any unrelated node that sits on that y between clearX
    // and the target (e.g. "Send tracking information" / "Order fulfilled" in real diagrams).
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event',
          id: 'b1',
          label: 'Escalate',
          category: 'intermediate',
          trigger: 'escalation',
          interrupting: true,
          attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Handler', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'activity',
          id: 'intervening',
          label: 'Send tracking information',
          activityType: 'task',
          collapsed: false,
          children: [],
          childEdges: [],
        },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence' }],
    };

    // Rightward sweep: clearX lands past intervening; naive final approach at target mid-y
    // is the horizontal from clearX back to target's right border — straight through intervening.
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 100, y: 80, width: 100, height: 80 }),
        activity({ id: 'target', x: 200, y: 400, width: 100, height: 80 }),
        // Sits between target.right (300) and clearX, overlapping target mid-y (440).
        activity({ id: 'intervening', label: 'Send tracking information', x: 360, y: 410, width: 120, height: 60 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1');
    expect(edge).toBeDefined();

    const intervening = result.nodes.find((n) => n.id === 'intervening')!;
    expect(edgeClipsNode(edge!, intervening)).toBe(false);

    // Same geometry check the layout analyzer uses for edge-through-node regressions.
    const throughIntervening = analyzeLayout(result).edgeThroughNode.filter((msg) =>
      msg.includes('intervening'),
    );
    expect(throughIntervening).toEqual([]);
  });
});

describe('positionBoundaryEvents — routing around its own host', () => {
  it('does not cut through the boundary event\'s own host on the way to a target behind it', () => {
    // The host is excluded from the obstacle set (the edge has to start on the host's own
    // border), but that exclusion must only apply near the start point — not license the
    // shortest-path search to cut straight through the host's interior anywhere along the
    // route. Here the target sits directly above the host, so the naive shortest orthogonal
    // path from the boundary event (bottom of host) to the target runs straight up through
    // the host's own box.
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event',
          id: 'b1',
          label: 'Escalate',
          category: 'intermediate',
          trigger: 'escalation',
          interrupting: true,
          attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Handler', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence' }],
    };

    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 100, y: 80, width: 100, height: 80 }),
        // Narrower than the host and centered above it, so the entry point (x=160) falls
        // strictly inside the host's x-range (100-200) rather than lining up with either
        // edge — the shortest orthogonal path from the boundary event straight up to that
        // entry point runs right through the host's interior.
        activity({ id: 'target', x: 140, y: -100, width: 20, height: 80 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1');
    expect(edge).toBeDefined();

    const host = result.nodes.find((n) => n.id === 'host')!;
    expect(edgeClipsNode(edge!, host)).toBe(false);

    const throughHost = analyzeLayout(result).edgeThroughNode.filter((msg) => msg.includes('Host'));
    expect(throughHost).toEqual([]);
  });
});

describe('positionBoundaryEvents — scoping obstacles inside a subprocess', () => {
  it('does not treat the enclosing subprocess container as an obstacle for its own children\'s routing', () => {
    // A boundary event's edge to a sibling inside the same subprocess must be routed using
    // only its subprocess siblings as obstacles — not the subprocess container itself, which
    // structurally encloses both endpoints and would make any path between them "trapped"
    // inside an obstacle it can never legally clear.
    const diagram: Diagram = {
      pools: [],
      nodes: [
        {
          kind: 'activity',
          id: 'sp1',
          label: 'Sub',
          activityType: 'subprocess',
          collapsed: false,
          childEdges: [{ id: 'e1', sourceId: 'sb1', targetId: 'sn3', flowType: 'sequence' }],
          children: [
            { kind: 'activity', id: 'sn2', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
            {
              kind: 'event',
              id: 'sb1',
              label: 'Slow',
              category: 'intermediate',
              trigger: 'timer',
              interrupting: false,
              attachedToId: 'sn2',
            },
            { kind: 'activity', id: 'sn3', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
          ],
        },
      ],
      edges: [],
    };

    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({
          id: 'sp1',
          x: 100,
          y: 0,
          width: 300,
          height: 220,
          children: [
            activity({ id: 'sn2', x: 284, y: 114, width: 101, height: 60 }),
            activity({ id: 'sn3', x: 124, y: 24, width: 100, height: 60 }),
          ],
        }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const sp1 = result.nodes.find((n) => n.id === 'sp1')!;
    const edge = sp1.childEdges!.find((e) => e.id === 'e1');
    expect(edge).toBeDefined();

    const sn2 = sp1.children!.find((n) => n.id === 'sn2')!;
    expect(edgeClipsNode(edge!, sn2)).toBe(false);

    const throughHost = analyzeLayout(result).edgeThroughNode.filter((msg) => msg.includes('Host'));
    expect(throughHost).toEqual([]);
  });
});

describe('positionBoundaryEvents — target-side obstacle avoidance', () => {
  it('does not cut through its own target node when the approach direction forces a detour', () => {
    // Verified in dev: with the pre-fix code, this produces points
    // [{x:350,y:178},{x:350,y:430},{x:100,y:430}] — a horizontal final segment from x=350
    // to the target's LEFT border at x=100, which travels straight through the target's
    // whole 100-200 x-range at y=430 (dead center of its 400-460 y-range) to get there.
    // The "blocker" node forces this: without it, the router happens to pick a different
    // (safe) L-shape for this exact geometry, so the blocker is required for a deterministic
    // repro — it forces the router away from the vertical-first path that would otherwise
    // avoid the box by chance.
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer',
          interrupting: true, attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Issue refund', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'blocker', label: 'Blocker', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence' }],
    };

    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 300, y: 80, width: 100, height: 80 }),
        activity({ id: 'target', x: 100, y: 400, width: 100, height: 60 }),
        activity({ id: 'blocker', x: 60, y: 190, width: 60, height: 160 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1')!;
    const target = result.nodes.find((n) => n.id === 'target')!;

    expect(edgeClipsNode(edge, target)).toBe(false);
    const throughTarget = analyzeLayout(result).edgeThroughNode.filter((msg) => msg.includes('Issue refund'));
    expect(throughTarget).toEqual([]);
  });
});

describe('positionBoundaryEvents — edge.to override', () => {
  it('enters the target from the overridden side instead of the auto-picked one', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event', id: 'b1', label: 'Escalate', category: 'intermediate', trigger: 'escalation',
          interrupting: true, attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Handler', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      // sweepEntryPoint would auto-pick target's left or right border (never top/bottom);
      // "to: bottom" must override that and produce the bottom border instead.
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence', to: 'bottom' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 300, y: 80, width: 100, height: 80 }),
        activity({ id: 'target', x: 100, y: 300, width: 100, height: 80 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1')!;
    const target = result.nodes.find((n) => n.id === 'target')!;
    const last = edge.points[edge.points.length - 1];
    expect(last).toEqual({ x: target.x + target.width / 2, y: target.y + target.height });
  });
});
