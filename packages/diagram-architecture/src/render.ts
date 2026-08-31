import { escapeXml, polylinePathD, wrappedTextBelow, wrappedTextCentered } from '@bpm/render-core';
import type { PositionedArchitecture, PositionedArchitectureNode } from './layout.js';

const MARGIN = 24;
const FONT_SIZE = 13;
function shape(node: PositionedArchitectureNode): string {
  const x = node.x + MARGIN, y = node.y + MARGIN;
  if (node.kind === 'database') return `<path data-node-id="${escapeXml(node.id)}" d="M${x} ${y + 12} C${x} ${y - 4} ${x + node.width} ${y - 4} ${x + node.width} ${y + 12} V${y + node.height - 12} C${x + node.width} ${y + node.height + 4} ${x} ${y + node.height + 4} ${x} ${y + node.height - 12} Z" fill="white" stroke="black" stroke-width="1.5"/>`;
  if (node.kind === 'queue') return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${Math.min(18, node.height / 2)}" fill="white" stroke="black" stroke-width="1.5"/>`;
  if (node.kind === 'person') return `<circle data-node-id="${escapeXml(node.id)}" cx="${x + node.width / 2}" cy="${y + 14}" r="9" fill="white" stroke="black" stroke-width="1.5"/><path d="M${x + node.width / 2 - 18} ${y + 43} Q${x + node.width / 2} ${y + 24} ${x + node.width / 2 + 18} ${y + 43}" fill="none" stroke="black" stroke-width="1.5"/>`;
  const radius = node.kind === 'system' || node.kind === 'container' ? 10 : 3;
  const fill = node.kind === 'system' ? '#eef5ff' : node.kind === 'container' ? '#f7f9fc' : 'white';
  return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${radius}" fill="${fill}" stroke="black" stroke-width="1.5"/>`;
}
function renderNode(node: PositionedArchitectureNode): string {
  const centerX = node.x + MARGIN + node.width / 2;
  const centerY = node.y + MARGIN + node.height / 2 + (node.kind === 'person' ? 8 : 0);
  const label = node.children.length
    ? wrappedTextBelow(centerX, node.y + MARGIN + 18, node.width - 20, node.label, FONT_SIZE, 2).replace('<text ', `<text data-node-label-id="${escapeXml(node.id)}" `)
    : wrappedTextCentered(centerX, centerY, node.width - 20, node.label, FONT_SIZE, 5).replace('<text ', `<text data-node-label-id="${escapeXml(node.id)}" `);
  return `${shape(node)}${label}${node.children.map(renderNode).join('')}`;
}
export function renderArchitecture(positioned: PositionedArchitecture): string {
  const edgePaths = positioned.edges.map((edge) => {
    const points = edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y + MARGIN }));
    return `<path data-edge-id="${escapeXml(edge.id)}" d="${polylinePathD(points, 'round')}" stroke="black" stroke-width="1.5" fill="none" marker-end="url(#architecture-arrow)"/>`;
  }).join('');
  const edgeLabels = positioned.edges.map((edge) => {
    if (edge.label === undefined || !edge.labelRect) return '';
    const label = (() => {
      const rect = { ...edge.labelRect, x: edge.labelRect.x + MARGIN, y: edge.labelRect.y + MARGIN };
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const text = wrappedTextCentered(centerX, centerY, rect.width - 8, edge.label, 11, 3).replace('<text ', `<text data-edge-label-id="${escapeXml(edge.id)}" data-edge-label="${escapeXml(edge.id)}" `);
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="3" fill="white" opacity="0.92"/>${text}`;
    })();
    return label;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${positioned.width + MARGIN * 2}" height="${positioned.height + MARGIN * 2}" viewBox="0 0 ${positioned.width + MARGIN * 2} ${positioned.height + MARGIN * 2}"><defs><marker id="architecture-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,7 L7,3.5 z" fill="black"/></marker></defs>${edgePaths}${positioned.nodes.map(renderNode).join('')}${edgeLabels}</svg>`;
}
