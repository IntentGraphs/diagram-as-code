import { escapeXml, pointAlongPolyline, polylinePathD } from '@bpm/render-core';
import type { PositionedFlowchart, PositionedFlowchartNode } from './layout.js';

const MARGIN = 20;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;

function renderLabel(node: PositionedFlowchartNode): string {
  const centerX = node.x + MARGIN + node.width / 2;
  const centerY = node.y + MARGIN + node.height / 2;
  const startY = centerY - ((node.labelLines.length - 1) * LINE_HEIGHT) / 2;
  return `<text data-node-label="${escapeXml(node.id)}" text-anchor="middle" dominant-baseline="middle" font-size="${FONT_SIZE}">${node.labelLines.map((line, index) => `<tspan x="${centerX}" y="${startY + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

export function renderFlowchart(positioned: PositionedFlowchart): string {
  const edgeMarkup = positioned.edges.map((edge) => {
    const points = edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y + MARGIN }));
    const label = edge.label === undefined ? '' : (() => { const p = edge.labelPosition ? { x: edge.labelPosition.x + MARGIN, y: edge.labelPosition.y + MARGIN } : pointAlongPolyline(points, 0.5); return `<text data-edge-label="${escapeXml(edge.id)}" x="${p.x}" y="${p.y}" text-anchor="middle" font-size="${FONT_SIZE}" paint-order="stroke" stroke="white" stroke-width="4" stroke-linejoin="round">${escapeXml(edge.label)}</text>`; })();
    return `<path data-edge-id="${escapeXml(edge.id)}" d="${polylinePathD(points, 'round')}" stroke="black" stroke-width="1.5" fill="none" marker-end="url(#flowchart-arrow)"/>${label}`;
  }).join('');
  const nodeMarkup = positioned.nodes.map((node) => node.kind === 'decision'
    ? `<polygon data-node-id="${escapeXml(node.id)}" points="${node.x + MARGIN + node.width / 2},${node.y + MARGIN} ${node.x + MARGIN + node.width},${node.y + MARGIN + node.height / 2} ${node.x + MARGIN + node.width / 2},${node.y + MARGIN + node.height} ${node.x + MARGIN},${node.y + MARGIN + node.height / 2}" fill="white" stroke="black" stroke-width="1.5"/>`
    : `<rect data-node-id="${escapeXml(node.id)}" x="${node.x + MARGIN}" y="${node.y + MARGIN}" width="${node.width}" height="${node.height}" rx="8" fill="white" stroke="black" stroke-width="1.5"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${positioned.width + MARGIN * 2}" height="${positioned.height + MARGIN * 2}" viewBox="0 0 ${positioned.width + MARGIN * 2} ${positioned.height + MARGIN * 2}"><defs><marker id="flowchart-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,7 L7,3.5 z" fill="black"/></marker></defs>${edgeMarkup}${nodeMarkup}${positioned.nodes.map(renderLabel).join('')}</svg>`;
}
