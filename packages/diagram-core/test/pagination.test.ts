import { describe, expect, it } from 'vitest';
import { diagnosePaginatedScene, normalizePaginatedScene, type PaginatedScene } from '../src/index.js';

function crossPageScene(): PaginatedScene {
  return {
    mode: 'semantic', sourceWidth: 200, sourceHeight: 100,
    pages: [
      { pageNumber: 1, width: 100, height: 100, nodes: [{ id: 'source', kind: 'task', x: 10, y: 10, width: 20, height: 20 }],
        edges: [{ id: 'cross', sourceId: 'source', targetId: 'target', points: [{ x: 20, y: 20 }, { x: 180, y: 20 }] }],
        continuations: [{ kind: 'both', sourcePage: 1, targetPage: 2, nodeIds: ['source', 'target'], edgeIds: ['cross'] }] },
      { pageNumber: 2, width: 100, height: 100, nodes: [{ id: 'target', kind: 'task', x: 10, y: 10, width: 20, height: 20 }],
        edges: [{ id: 'cross', sourceId: 'source', targetId: 'target', points: [{ x: -80, y: 20 }, { x: 20, y: 20 }] }],
        continuations: [{ kind: 'both', sourcePage: 1, targetPage: 2, nodeIds: ['source', 'target'], edgeIds: ['cross'] }] },
    ],
  };
}

describe('shared paginated scene contract', () => {
  it('normalizes a non-paginated scene to one stable page', () => {
    const scene = normalizePaginatedScene({ width: 100, height: 80, title: 'Order', nodes: [{ id: 'a', kind: 'task', x: 10, y: 10, width: 20, height: 20 }], edges: [] });
    expect(scene).toMatchObject({ mode: 'none', sourceWidth: 100, sourceHeight: 80, pages: [{ pageNumber: 1, width: 100, height: 80, title: 'Order', continuations: [] }] });
  });

  it('reports blocking geometry and advisory continuation/readability diagnostics separately', () => {
    const scene = crossPageScene();
    scene.sourceWidth = 1000;
    scene.sourceHeight = 1000;
    scene.pages[0].nodes[0].x = 90;
    const diagnostics = diagnosePaginatedScene(scene);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error' }),
      expect.objectContaining({ code: 'pagination_cross_page_edge', severity: 'warning' }),
      expect.objectContaining({ code: 'pagination_readability', severity: 'warning' }),
    ]));
  });

  it('validates source dimensions, containers, edges, continuations, and metadata', () => {
    const scene: PaginatedScene = {
      mode: 'semantic', sourceWidth: 200, sourceHeight: 100,
      pages: [{ pageNumber: 1, width: 200, height: 100, nodeCount: 1, edgeCount: 1, continuationCount: 0,
        nodes: [{ id: 'a', kind: 'task', x: 10, y: 10, width: 20, height: 20 }],
        containers: [{ id: 'pool', kind: 'pool', x: 0, y: 0, width: 100, height: 90 }],
        edges: [{ id: 'e1', sourceId: 'a', targetId: 'a', points: [{ x: 20, y: 20 }, { x: 30, y: 30 }] }], continuations: [] }],
    };
    expect(diagnosePaginatedScene(scene).filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('allows projected cross-page edges with continuation metadata', () => {
    const scene = crossPageScene();
    const diagnostics = diagnosePaginatedScene(scene);
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(diagnostics.filter((diagnostic) => diagnostic.code === 'pagination_cross_page_edge')).toHaveLength(1);
  });

  it('rejects forged continuation edge IDs', () => {
    const scene = crossPageScene();
    scene.pages[0].continuations[0].edgeIds = ['forged'];
    scene.pages[1].continuations[0].edgeIds = ['forged'];
    const diagnostics = diagnosePaginatedScene(scene);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_invalid_reference', severity: 'error', edgeIds: ['forged'] }),
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error', edgeIds: ['cross'] }),
    ]));
  });

  it('rejects asymmetric and missing continuation counterparts', () => {
    const asymmetric = crossPageScene();
    asymmetric.pages[1].continuations[0].nodeIds = ['source'];
    expect(diagnosePaginatedScene(asymmetric).filter((diagnostic) => diagnostic.code === 'pagination_invalid_reference')).toHaveLength(2);

    const missing = crossPageScene();
    missing.pages[1].continuations = [];
    expect(diagnosePaginatedScene(missing)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_invalid_reference', severity: 'error', pageNumber: 1 }),
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error', pageNumber: 2, edgeIds: ['cross'] }),
    ]));
  });

  it('rejects one-point and neither-local continuation routes', () => {
    const onePoint = crossPageScene();
    onePoint.pages[0].edges[0].points = [{ x: 20, y: 20 }];
    expect(diagnosePaginatedScene(onePoint)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_invalid_reference', severity: 'error', pageNumber: 1 }),
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error', pageNumber: 1, edgeIds: ['cross'] }),
    ]));

    const neitherLocal = crossPageScene();
    neitherLocal.pages[0].nodes = [{ id: 'unrelated', kind: 'task', x: 10, y: 10, width: 20, height: 20 }];
    expect(diagnosePaginatedScene(neitherLocal)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_invalid_reference', severity: 'error', pageNumber: 1 }),
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error', pageNumber: 1, edgeIds: ['cross'] }),
    ]));
  });

  it('reports invalid dimensions, bounds, references, duplicate IDs, and counts', () => {
    const scene: PaginatedScene = {
      mode: 'semantic', sourceWidth: 0, sourceHeight: Number.NaN,
      pages: [{ pageNumber: 1, width: 100, height: 100, nodeCount: 4, edgeCount: 2, continuationCount: 1,
        nodes: [{ id: 'a', kind: 'task', x: 90, y: 0, width: 20, height: 20 }, { id: 'a', kind: 'task', x: 0, y: 0, width: 10, height: 10 }],
        containers: [{ id: 'pool', kind: 'pool', x: -1, y: 0, width: 20, height: 20 }],
        edges: [{ id: 'e1', sourceId: 'missing', targetId: 'a', points: [] }, { id: 'e2', sourceId: 'a', targetId: 'a', points: [{ x: 0, y: 0 }, { x: 101, y: 0 }] }],
        continuations: [{ kind: 'edge', sourcePage: 1, targetPage: 9, edgeIds: ['e1'] }] }],
    };
    const diagnostics = diagnosePaginatedScene(scene);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'pagination_impossible_geometry', severity: 'error' }),
      expect.objectContaining({ code: 'pagination_page_bounds', severity: 'error' }),
      expect.objectContaining({ code: 'pagination_duplicate_id', severity: 'error' }),
      expect.objectContaining({ code: 'pagination_invalid_reference', severity: 'error' }),
      expect.objectContaining({ code: 'pagination_metadata_count', severity: 'error' }),
    ]));
  });
});
