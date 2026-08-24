import type { PositionedDiagram } from '@bpm/layout';
import type { SvgViewportSnapshot } from './svgViewport.js';

export interface ViewportAnchor {
  center: { x: number; y: number };
  relativeZoom: number;
}

function sceneOrigin(diagram: PositionedDiagram): { x: number; y: number } {
  const nestedEdges = diagram.nodes.flatMap(function collectEdges(node): PositionedDiagram['edges'] {
    return [
      ...(node.childEdges ?? []),
      ...(node.children ?? []).flatMap(collectEdges),
    ];
  });
  const edges = [...diagram.edges, ...nestedEdges];
  const xValues = [
    ...diagram.nodes.flatMap((node) => [node.x, node.x + node.width]),
    ...diagram.pools.flatMap((pool) => [pool.x, pool.x + pool.width]),
    ...edges.flatMap((edge) => edge.points.map((point) => point.x)),
  ];
  const yValues = [
    ...diagram.nodes.flatMap((node) => [node.y, node.y + node.height]),
    ...diagram.pools.flatMap((pool) => [pool.y, pool.y + pool.height]),
    ...edges.flatMap((edge) => edge.points.map((point) => point.y)),
  ];

  // The SVG renderer uses translate(-minX, -minY) with the same zero floor.
  return {
    x: Math.min(0, ...xValues),
    y: Math.min(0, ...yValues),
  };
}

/**
 * Convert the current Text-mode SVG viewport into a scene-coordinate anchor that
 * can be applied to the BPMN.js canvas after the same positioned diagram is imported.
 */
export function getViewportAnchor(
  snapshot: SvgViewportSnapshot | undefined,
  diagram: PositionedDiagram,
): ViewportAnchor | undefined {
  if (!snapshot || snapshot.scale <= 0 || !Number.isFinite(snapshot.scale)) return undefined;

  const originX = (snapshot.stageWidth - snapshot.svgWidth) / 2;
  const originY = (snapshot.stageHeight - snapshot.svgHeight) / 2;
  const contentCenterX = snapshot.scrollLeft + snapshot.contentWidth / 2;
  const contentCenterY = snapshot.scrollTop + snapshot.contentHeight / 2;
  const origin = sceneOrigin(diagram);
  const center = {
    x: (contentCenterX - originX) / snapshot.scale + origin.x,
    y: (contentCenterY - originY) / snapshot.scale + origin.y,
  };

  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return undefined;
  return { center, relativeZoom: snapshot.zoom };
}
