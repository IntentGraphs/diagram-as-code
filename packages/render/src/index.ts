import type { PositionedDiagram } from '@bpm/layout';
import { escapeXml } from '@bpm/render-core';
import { renderNode } from './shapes.js';
import { renderEdge } from './edges.js';

function nestedEdges(nodes: PositionedDiagram['nodes'], into: PositionedDiagram['edges'] = []): PositionedDiagram['edges'] {
  for (const node of nodes) {
    if (node.childEdges) into.push(...node.childEdges);
    if (node.children) nestedEdges(node.children, into);
  }
  return into;
}

export function render(diagram: PositionedDiagram): string {
  const allEdges = nestedEdges(diagram.nodes, [...diagram.edges]);
  const allX = [
    ...diagram.nodes.flatMap((n) => [n.x, n.x + n.width]),
    ...diagram.pools.flatMap((p) => [p.x, p.x + p.width]),
    ...allEdges.flatMap((edge) => edge.points.map((point) => point.x)),
  ];
  const allY = [
    ...diagram.nodes.flatMap((n) => [n.y, n.y + n.height]),
    ...diagram.pools.flatMap((p) => [p.y, p.y + p.height]),
    ...allEdges.flatMap((edge) => edge.points.map((point) => point.y)),
  ];
  const minX = Math.min(0, ...allX);
  const minY = Math.min(0, ...allY);
  const maxX = Math.max(40, ...allX) + 40;
  const maxY = Math.max(40, ...allY) + 40;

  const poolBodyEls = diagram.pools
    .map((pool) => {
      const laneBodyEls = pool.lanes
        .map((lane) => `<rect data-lane-id="${escapeXml(lane.id)}" x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" fill="none" stroke="#999"/>`)
        .join('');
      return `<g data-pool-id="${escapeXml(pool.id)}"><rect x="${pool.x}" y="${pool.y}" width="${pool.width}" height="${pool.height}" fill="none" stroke="#333" stroke-width="2"/>${laneBodyEls}</g>`;
    })
    .join('');
  const laneLabelEls = diagram.pools
    .flatMap((pool) => pool.lanes)
    .map((lane) => `<text x="${lane.x + 4}" y="${lane.y + 14}" font-size="11">${escapeXml(lane.name)}</text>`)
    .join('');

  const nodes = diagram.nodes.map(renderNode);
  const edges = diagram.edges.map(renderEdge);

  // Every shape and every line is drawn before any label. Painting all labels in a final pass
  // — rather than interleaving each shape with its own label — guarantees a shape drawn later
  // in the diagram can never end up on top of (and hiding) a label drawn earlier.
  const bodyEls = [poolBodyEls, ...nodes.map((n) => n.body), ...edges.map((e) => e.body)].join('');
  const labelEls = [...nodes.map((n) => n.label), laneLabelEls, ...edges.map((e) => e.label)].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX - minX}" height="${maxY - minY}" viewBox="0 0 ${maxX - minX} ${maxY - minY}"><g transform="translate(${-minX} ${-minY})">${bodyEls}${labelEls}</g></svg>`;
}
