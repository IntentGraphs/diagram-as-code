import { escapeXml, pointAlongPolyline, polylinePathD } from '@bpm/render-core';
import type { PositionedDfd, PositionedDfdNode } from './layout.js';
const MARGIN = 24;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
function label(node: PositionedDfdNode): string { const centerX = node.x + MARGIN + node.width / 2; const centerY = node.y + MARGIN + node.height / 2; const startY = centerY - ((node.labelLines.length - 1) * LINE_HEIGHT) / 2; return `<text data-node-label-id="${escapeXml(node.id)}" x="${centerX}" y="${startY}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_SIZE}">${node.labelLines.map((line, index) => `<tspan x="${centerX}" y="${startY + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`).join('')}</text>`; }
function shape(node: PositionedDfdNode): string { const x = node.x + MARGIN; const y = node.y + MARGIN; if (node.kind === 'external') return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" fill="#fff7ed" stroke="#c2410c" stroke-width="1.5"/>`; if (node.kind === 'dataStore') return `<path data-node-id="${escapeXml(node.id)}" d="M${x} ${y + 10} Q${x + node.width / 2} ${y - 2} ${x + node.width} ${y + 10} V${y + node.height - 10} Q${x + node.width / 2} ${y + node.height + 2} ${x} ${y + node.height - 10} Z" fill="#f0fdf4" stroke="#15803d" stroke-width="1.5"/>`; return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>`; }
export function renderDfd(positioned: PositionedDfd): string {
  const width = positioned.width + MARGIN * 2;
  const height = positioned.height + MARGIN * 2;
  const edges = positioned.edges.map((edge) => {
    const points = edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y + MARGIN }));
    const edgeLabel = edge.label ? (() => {
      const point = pointAlongPolyline(points, 0.5);
      return `<text data-edge-label-id="${escapeXml(edge.id)}" x="${point.x}" y="${point.y - 6}" text-anchor="middle" font-size="${FONT_SIZE}" paint-order="stroke" stroke="white" stroke-width="4">${escapeXml(edge.label)}</text>`;
    })() : '';
    return `<g data-edge-id="${escapeXml(edge.id)}"><path class="diagram-edge-visible" d="${polylinePathD(points, 'round')}" stroke="#475569" stroke-width="1.5" fill="none" marker-end="url(#dfd-arrow)"/>${edgeLabel}</g>`;
  }).join('');
  const nodes = positioned.nodes.map((node) => `${shape(node)}${label(node)}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Data flow diagram"><defs><marker id="dfd-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,7 L7,3.5 z" fill="#475569"/></marker></defs>${edges}${nodes}</svg>`;
}
