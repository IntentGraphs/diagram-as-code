import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents, type PositionedDiagram } from '@bpm/layout-core';
import { swimlaneEngine, bandLanes } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await swimlaneEngine.layout(diagram));
}

describe('bandLanes — edge.from/to override', () => {
  it('exits the source from the overridden side instead of the auto-picked one', async () => {
    // a1 is in lane 0, b1 in lane 1 and to the right of a1 — auto preferRight would choose
    // the right border; from: left must override that.
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [
            { id: 'lane1', name: 'Sales', nodeIds: ['a1'] },
            { id: 'lane2', name: 'Fulfilment', nodeIds: ['b1'] },
          ],
        },
      ],
      nodes: [
        { kind: 'activity', id: 'a1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'b1', label: 'Ship', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'a1', targetId: 'b1', flowType: 'sequence', from: 'left' }],
    };

    const positioned = await layout(diagram);
    const a1 = positioned.nodes.find((n) => n.id === 'a1')!;
    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    const start = edge.points[0];

    expect(start).toEqual({ x: a1.x, y: a1.y + a1.height / 2 });
  });
});

function axisAligned(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x || a.y === b.y;
}

describe('bandLanes — same-lane routing', () => {
  it('keeps a same-lane ELK dogleg orthogonal instead of interpolating Y by array index', () => {
    // Two nodes in one lane, stacked so each has a different pre-banding y. ELK already
    // produced a clean horizontal-then-vertical path. Index interpolation between the two
    // endpoint shifts would move the middle corner to a blended y, turning the first
    // segment into a diagonal (the draft→aiReview failure mode).
    const diagram: Diagram = {
      pools: [{
        id: 'pool1', name: 'P',
        lanes: [{ id: 'lane1', name: 'Work', nodeIds: ['draft', 'aiReview'] }],
      }],
      nodes: [
        { kind: 'activity', id: 'draft', label: 'Draft', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'aiReview', label: 'AI Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'draft', targetId: 'aiReview', flowType: 'sequence' }],
    };
    const positioned: PositionedDiagram = {
      pools: [{ id: 'pool1', name: 'P', x: 0, y: 0, width: 500, height: 300, lanes: [] }],
      nodes: [
        { kind: 'activity', id: 'draft', label: 'Draft', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 40, y: 40, width: 100, height: 40 },
        { kind: 'activity', id: 'aiReview', label: 'AI Review', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 280, y: 140, width: 100, height: 40 },
      ],
      edges: [{
        id: 'e1', sourceId: 'draft', targetId: 'aiReview', flowType: 'sequence',
        points: [
          { x: 140, y: 60 },
          { x: 210, y: 60 },
          { x: 210, y: 160 },
          { x: 280, y: 160 },
        ],
      }],
    };

    const result = bandLanes(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < edge.points.length - 1; i++) {
      expect(axisAligned(edge.points[i], edge.points[i + 1])).toBe(true);
    }
    // Shared router signature: a short orthogonal stub off the source, not a shifted ELK point.
    const [exit, afterExit] = edge.points;
    expect(axisAligned(exit, afterExit)).toBe(true);
    expect(Math.abs(afterExit.x - exit.x) + Math.abs(afterExit.y - exit.y)).toBe(14);
  });

  it('gives reciprocal same-lane flows deterministic opposite endpoint ports', () => {
    const diagram: Diagram = {
      pools: [{ id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'Work', nodeIds: ['complete', 'package'] }] }],
      nodes: [
        { kind: 'activity', id: 'complete', label: 'Complete', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'package', label: 'Package', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'a-forward', sourceId: 'complete', targetId: 'package', flowType: 'sequence' },
        { id: 'z-feedback', sourceId: 'package', targetId: 'complete', flowType: 'sequence' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [{ id: 'pool1', name: 'P', x: 0, y: 0, width: 500, height: 180, lanes: [] }],
      nodes: [
        { kind: 'activity', id: 'complete', label: 'Complete', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 40, y: 40, width: 100, height: 40 },
        { kind: 'activity', id: 'package', label: 'Package', activityType: 'task', collapsed: false, children: [], childEdges: [], x: 280, y: 40, width: 100, height: 40 },
      ],
      edges: [
        { id: 'z-feedback', sourceId: 'package', targetId: 'complete', flowType: 'sequence', points: [{ x: 280, y: 60 }, { x: 140, y: 60 }] },
        { id: 'a-forward', sourceId: 'complete', targetId: 'package', flowType: 'sequence', points: [{ x: 140, y: 60 }, { x: 280, y: 60 }] },
      ],
    };
    const result = bandLanes(diagram, positioned);
    const feedback = result.edges.find((edge) => edge.id === 'z-feedback')!;
    const forward = result.edges.find((edge) => edge.id === 'a-forward')!;
    expect(feedback.points[0].x).not.toBe(forward.points[0].x);
    expect(feedback.points.at(-1)!.x).not.toBe(forward.points.at(-1)!.x);
  });
});
