import { escapeXml, measureLabel, polylinePathD, wrappedTextBelow, wrappedTextCentered } from '@bpm/render-core';
import type { PositionedArchitecture, PositionedArchitectureNode } from './layout.js';

const MARGIN = 24;
const FONT_SIZE = 13;
const TITLE_HEIGHT = 42;
const LEGEND_HEIGHT = 42;
interface ArchitecturePalette { system: string; container: string; component: string; data: string; external: string; edge: string; text: string; muted: string; }
function palette(theme: PositionedArchitecture['theme']): ArchitecturePalette {
  return theme === 'high-contrast'
    ? { system: '#005a8d', container: '#007c91', component: '#b9e6ff', data: '#ffe08a', external: '#f4b183', edge: '#1f2937', text: '#111827', muted: '#374151' }
    : { system: '#dbeafe', container: '#eff6ff', component: '#f0f9ff', data: '#fef3c7', external: '#ffedd5', edge: '#374151', text: '#111827', muted: '#4b5563' };
}
function nodeTypeLabel(kind: PositionedArchitectureNode['kind']): string {
  if (kind === 'system') return 'Software System';
  if (kind === 'container') return 'Container';
  if (kind === 'component') return 'Component';
  if (kind === 'person') return 'Person';
  if (kind === 'database') return 'Database';
  return 'Queue';
}
function shape(node: PositionedArchitectureNode, colors: ArchitecturePalette): string {
  const x = node.x + MARGIN, y = node.y + MARGIN;
  if (node.kind === 'database') return `<path data-node-id="${escapeXml(node.id)}" d="M${x} ${y + 12} C${x} ${y - 4} ${x + node.width} ${y - 4} ${x + node.width} ${y + 12} V${y + node.height - 12} C${x + node.width} ${y + node.height + 4} ${x} ${y + node.height + 4} ${x} ${y + node.height - 12} Z" fill="${colors.data}" stroke="${colors.edge}" stroke-width="1.5"/>`;
  if (node.kind === 'queue') return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${Math.min(18, node.height / 2)}" fill="${colors.data}" stroke="${colors.edge}" stroke-width="1.5"/>`;
  if (node.kind === 'person') return `<circle data-node-id="${escapeXml(node.id)}" cx="${x + node.width / 2}" cy="${y + 14}" r="9" fill="${colors.external}" stroke="${colors.edge}" stroke-width="1.5"/><path d="M${x + node.width / 2 - 18} ${y + 43} Q${x + node.width / 2} ${y + 24} ${x + node.width / 2 + 18} ${y + 43}" fill="none" stroke="${colors.edge}" stroke-width="1.5"/>`;
  const radius = node.kind === 'system' || node.kind === 'container' ? 10 : 3;
  const fill = node.external ? colors.external : node.kind === 'system' ? colors.system : node.kind === 'container' ? colors.container : colors.component;
  return `<rect data-node-id="${escapeXml(node.id)}" x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="${radius}" fill="${fill}" stroke="${colors.edge}" stroke-width="1.5"/>`;
}
function renderNode(node: PositionedArchitectureNode, colors: ArchitecturePalette, showDetails: boolean): string {
  const centerX = node.x + MARGIN + node.width / 2;
  const detail = showDetails ? node.technology ?? node.description : undefined;
  const detailMetrics = detail ? measureLabel(detail, node.width - 20, 10, 2) : undefined;
  const footerHeight = 14 + (detailMetrics ? detailMetrics.height + 4 : 0);
  const centerY = node.y + MARGIN + (node.height - footerHeight) / 2 + (node.kind === 'person' ? 8 : 0);
  const label = node.kind === 'person'
    ? wrappedTextBelow(centerX, node.y + MARGIN + 56, node.width - 20, node.label, FONT_SIZE, 2).replace('<text ', `<text data-node-label-id="${escapeXml(node.id)}" `)
    : node.children.length
    ? wrappedTextBelow(centerX, node.y + MARGIN + 18, node.width - 20, node.label, FONT_SIZE, 2).replace('<text ', `<text data-node-label-id="${escapeXml(node.id)}" `)
    : wrappedTextCentered(centerX, centerY, node.width - 20, node.label, FONT_SIZE, 5).replace('<text ', `<text data-node-label-id="${escapeXml(node.id)}" `);
  const typeY = node.y + MARGIN + node.height - (detailMetrics ? detailMetrics.height + 17 : 12);
  const type = `<text data-node-type-id="${escapeXml(node.id)}" x="${centerX}" y="${typeY}" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="${colors.muted}">${escapeXml(nodeTypeLabel(node.kind))}</text>`;
  const detailText = detailMetrics
    ? wrappedTextCentered(centerX, node.y + MARGIN + node.height - detailMetrics.height / 2 - 4, node.width - 20, detail!, 10, 2)
      .replace('<text ', `<text data-node-detail-id="${escapeXml(node.id)}" font-family="Arial,sans-serif" fill="${colors.muted}" `)
    : '';
  return `${shape(node, colors)}${label}${type}${detailText}${node.children.map((child) => renderNode(child, colors, showDetails)).join('')}`;
}
export function renderArchitecture(positioned: PositionedArchitecture): string {
  const colors = palette(positioned.theme);
  const contentHeight = positioned.height + MARGIN * 2;
  const footerHeight = positioned.legend ? LEGEND_HEIGHT : 0;
  const svgHeight = contentHeight + TITLE_HEIGHT + footerHeight;
  const viewLabel = positioned.viewType ? ` · ${positioned.viewType}${positioned.viewKey ? ` (${positioned.viewKey})` : ''}` : '';
  const title = escapeXml(positioned.title ?? 'Architecture diagram');
  const subtitle = escapeXml(`${positioned.description ?? 'C4 architecture view'}${viewLabel}`);
  const edgePaths = positioned.edges.map((edge) => {
    const points = edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y + MARGIN }));
    return `<path data-edge-id="${escapeXml(edge.id)}" d="${polylinePathD(points, 'round')}" stroke="${colors.edge}" stroke-width="1.5" fill="none" marker-end="url(#architecture-arrow)"/>`;
  }).join('');
  const edgeLabels = positioned.edges.map((edge) => {
    const displayLabel = edge.displayLabel ?? edge.label;
    // A system landscape is the orientation page, not the relationship catalogue.
    // Keeping every projected label here turns many-to-one mappings into large text
    // blocks on long routes. Detailed context/container views retain labels only when
    // the layout found a collision-free position for them.
    if (displayLabel === undefined || !edge.labelRect || positioned.viewType === 'systemLandscape') return '';
    const label = (() => {
      const rect = { ...edge.labelRect, x: edge.labelRect.x + MARGIN, y: edge.labelRect.y + MARGIN };
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const text = wrappedTextCentered(centerX, centerY, rect.width - 8, displayLabel, 11, 3).replace('<text ', `<text data-edge-label-id="${escapeXml(edge.id)}" data-edge-label="${escapeXml(edge.id)}" `);
      return `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="3" fill="white" opacity="0.92"/>${text}`;
    })();
    return label;
  }).join('');
  const legendItems = [['Person', colors.external], ['Software System', colors.system], ['Container', colors.container], ['Component', colors.component], ['Database / Queue', colors.data]];
  const legend = positioned.legend ? `<g data-architecture-legend="true" transform="translate(${MARGIN} ${TITLE_HEIGHT + contentHeight + 22})">${legendItems.map(([label, fill], index) => `<rect x="${index * 145}" y="-11" width="12" height="12" rx="2" fill="${fill}" stroke="${colors.edge}"/><text x="${index * 145 + 18}" y="0" font-family="Arial,sans-serif" font-size="10" fill="${colors.text}">${label}</text>`).join('')}</g>` : '';
  const showDetails = positioned.viewType !== 'systemLandscape';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${positioned.width + MARGIN * 2}" height="${svgHeight}" viewBox="0 0 ${positioned.width + MARGIN * 2} ${svgHeight}"><defs><marker id="architecture-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,7 L7,3.5 z" fill="${colors.edge}"/></marker></defs><text x="${MARGIN}" y="22" font-family="Arial,sans-serif" font-size="16" font-weight="600" fill="${colors.text}">${title}</text><text x="${MARGIN}" y="36" font-family="Arial,sans-serif" font-size="10" fill="${colors.muted}">${subtitle}</text><g transform="translate(0 ${TITLE_HEIGHT})">${edgePaths}${positioned.nodes.map((node) => renderNode(node, colors, showDetails)).join('')}${edgeLabels}</g>${legend}</svg>`;
}
