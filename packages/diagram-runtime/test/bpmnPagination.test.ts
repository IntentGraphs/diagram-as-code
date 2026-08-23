import { describe, expect, it } from 'vitest';
import { paginateBpmn } from '../src/bpmnPagination.js';
import { executeDiagramSource } from '../src/index.js';
import type { PositionedDiagram } from '@bpm/layout';

function diagram(): PositionedDiagram {
  return {
    pools: [
      { id: 'p1', name: 'Customer', x: 0, y: 0, width: 240, height: 160, lanes: [{ id: 'l1', name: 'Sales', x: 0, y: 0, width: 240, height: 80 }, { id: 'l2', name: 'Ops', x: 0, y: 80, width: 240, height: 80 }] },
      { id: 'p2', name: 'Warehouse', x: 300, y: 0, width: 240, height: 160, lanes: [{ id: 'l3', name: 'Fulfilment', x: 300, y: 0, width: 240, height: 160 }] },
    ],
    nodes: [
      { id: 'a', kind: 'activity', label: 'Start', x: 40, y: 30, width: 60, height: 30, flowType: undefined as never },
      { id: 'b', kind: 'activity', label: 'Ship', x: 340, y: 55, width: 60, height: 30, flowType: undefined as never },
    ],
    edges: [{ id: 'message', sourceId: 'a', targetId: 'b', flowType: 'message', points: [{ x: 100, y: 45 }, { x: 340, y: 70 }] }],
  };
}

describe('BPMN semantic pagination', () => {
  it('exposes semantic pages through the runtime for explicit BPMN pagination', async () => {
    const result = await executeDiagramSource('paginate: semantic\npool "A"\n  lane "L1"\n    task "a" as a\npool "B"\n  lane "L2"\n    task "b" as b\na -> b');
    expect(result.diagnostics).toEqual([]);
    expect(result.paginated?.pages).toHaveLength(2);
  });

  it('keeps a one-pool semantic BPMN diagram on one complete page', () => {
    const positioned = diagram();
    positioned.pools = [positioned.pools[0]];
    positioned.nodes = [positioned.nodes[0]];
    positioned.edges = [];
    const result = paginateBpmn(positioned);
    expect(result.scene.pages).toHaveLength(1);
    expect(result.scene.pages[0]).toMatchObject({ sourcePoolId: 'p1', nodeCount: 1, edgeCount: 0, continuationCount: 0 });
  });

  it('splits by pool and retains cross-page message flow metadata', () => {
    const { scene, diagnostics } = paginateBpmn(diagram());
    expect(scene.pages).toHaveLength(2);
    expect(scene.pages.flatMap((page) => page.nodes.map((node) => node.id))).toEqual(['a', 'b']);
    expect(scene.pages.every((page) => page.edgeCount === 1)).toBe(true);
    expect(scene.pages.every((page) => page.continuationCount === 1)).toBe(true);
    expect(scene.pages[0].edges[0].kind).toBe('message');
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'pagination_cross_page_edge')).toBe(true);
  });

  it('supports lane page breaks without dropping nodes', () => {
    const positioned = diagram();
    positioned.pools[1].lanes = [{ id: 'l3', name: 'Fulfilment', x: 300, y: 0, width: 240, height: 160 }];
    const result = paginateBpmn(positioned, undefined, 'lane');
    expect(result.scene.pages.map((page) => page.sourceLaneIds)).toEqual([['l1'], ['l2'], ['l3']]);
    expect(result.scene.pages.flatMap((page) => page.nodes.map((node) => node.id))).toEqual(['a', 'b']);
  });

  it('honours contain and strict fit policy for a semantic group', () => {
    const page = { width: 1, height: 1, unit: 'in' as const, fit: 'contain' as const };
    expect(paginateBpmn(diagram(), page).scene.pages.every((item) => item.readabilityScale! > 0)).toBe(true);
    expect(paginateBpmn(diagram(), { ...page, fit: 'strict' }).diagnostics.some((item) => item.severity === 'error')).toBe(true);
  });
});
