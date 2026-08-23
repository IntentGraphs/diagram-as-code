import { escapeXml, polylinePathD } from '@bpm/render-core';
import type { PositionedMindmap, PositionedMindmapNode } from './layout.js';

const MARGIN = 20;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
function nodes(root: PositionedMindmapNode): PositionedMindmapNode[] { return [root, ...root.children.flatMap(nodes)]; }

function renderLabel(node: PositionedMindmapNode): string {
  const centerX = node.x + MARGIN + node.width / 2;
  const centerY = node.y + MARGIN + node.height / 2;
  const startY = centerY - ((node.labelLines.length - 1) * LINE_HEIGHT) / 2;
  const tspans = node.labelLines
    .map((line, index) => `<tspan x="${centerX}" y="${startY + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text text-anchor="middle" dominant-baseline="middle" font-size="${FONT_SIZE}">${tspans}</text>`;
}

export function renderMindmap(positioned: PositionedMindmap): string {
  const all = nodes(positioned.root);
  const width = positioned.width + MARGIN * 2;
  const height = positioned.height + MARGIN * 2;
  const edgeMarkup = positioned.edges.map((edge) => `<path d="${polylinePathD(edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y + MARGIN })), 'round')}" stroke="black" stroke-width="1.5" fill="none"/>`).join('');
  const boxMarkup = all.map((node) => `<rect x="${node.x + MARGIN}" y="${node.y + MARGIN}" width="${node.width}" height="${node.height}" rx="8" fill="white" stroke="black" stroke-width="${node.depth === 0 ? 3 : 1.5}"/>`).join('');
  const labelMarkup = all.map(renderLabel).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${edgeMarkup}${boxMarkup}${labelMarkup}</svg>`;
}
