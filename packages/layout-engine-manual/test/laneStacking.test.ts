import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { stackLanes } from '../src/laneStacking.js';
import { placeNode } from '../src/engine.js';

describe('stackLanes', () => {
  it('positions a node relative to its own lane, and stacks a second lane below the first', () => {
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'Order-to-Cash',
        lanes: [
          { id: 'lane1', name: 'Sales', nodeIds: ['t1'] },
          { id: 'lane2', name: 'Fulfillment', nodeIds: ['t2'] },
        ],
      }],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'Ship', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      ],
      edges: [],
    };

    const [pool] = stackLanes(diagram, placeNode);
    const t1 = pool.placedNodes.find((n) => n.id === 't1')!;
    const t2 = pool.placedNodes.find((n) => n.id === 't2')!;

    // Both nodes were placed at lane-relative (40, 40); lane2 is not at canvas y=40 too —
    // it's stacked below lane1's full height.
    expect(t1.x).toBe(40);
    expect(t2.x).toBe(40);
    expect(t2.y).toBeGreaterThan(t1.y);
    expect(pool.positionedPool.lanes).toHaveLength(2);
    expect(pool.positionedPool.lanes[1].y).toBeGreaterThan(pool.positionedPool.lanes[0].y);
    // lane2's band starts at or below lane1's band's bottom edge.
    expect(pool.positionedPool.lanes[1].y).toBeGreaterThanOrEqual(
      pool.positionedPool.lanes[0].y + pool.positionedPool.lanes[0].height,
    );
  });

  it('never lets a later lane\'s content collide with an earlier lane\'s content', () => {
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'P',
        lanes: [
          { id: 'lane1', name: 'Tall', nodeIds: ['t1'] },
          { id: 'lane2', name: 'Short', nodeIds: ['t2'] },
        ],
      }],
      nodes: [
        // t1 placed far down within its own lane (tests that lane1's height grows to fit it).
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 400 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      ],
      edges: [],
    };

    const [pool] = stackLanes(diagram, placeNode);
    const t1 = pool.placedNodes.find((n) => n.id === 't1')!;
    const t2 = pool.placedNodes.find((n) => n.id === 't2')!;
    expect(t2.y).toBeGreaterThanOrEqual(t1.y + t1.height);
  });

  it('stacks a second pool below the first instead of both starting at y=0', () => {
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [
        {
          id: 'pool1', name: 'Customer',
          lanes: [{ id: 'lane1', name: 'Only', nodeIds: ['t1'] }],
        },
        {
          id: 'pool2', name: 'Vendor',
          lanes: [{ id: 'lane2', name: 'Only', nodeIds: ['t2'] }],
        },
      ],
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      ],
      edges: [],
    };

    const [pool1, pool2] = stackLanes(diagram, placeNode);

    expect(pool2.positionedPool.y).toBeGreaterThanOrEqual(
      pool1.positionedPool.y + pool1.positionedPool.height,
    );
    const t1 = pool1.placedNodes.find((n) => n.id === 't1')!;
    const t2 = pool2.placedNodes.find((n) => n.id === 't2')!;
    expect(t2.y).toBeGreaterThan(t1.y);
  });

  it('does not choke on a boundary event attached to a node in the same lane', () => {
    // Boundary events are placed later by positionBoundaryEvents; placeNode() rejects them
    // outright if handed one directly ("cannot be manually positioned"), so stackLanes must
    // filter them out of a lane's nodeIds before calling placeNode.
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'P',
        lanes: [{ id: 'lane1', name: 'Only', nodeIds: ['t1', 'be1'] }],
      }],
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'event', id: 'be1', label: 'Timeout', category: 'boundary', trigger: 'timer', interrupting: true, attachedToId: 't1' },
      ],
      edges: [],
    };

    const [pool] = stackLanes(diagram, placeNode);
    expect(pool.placedNodes.map((n) => n.id)).toEqual(['t1']);
  });
});
