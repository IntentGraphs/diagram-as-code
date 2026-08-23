import type { PositionedNode } from '@bpm/layout';
import type { GatewayType } from '@bpm/ast';
import { escapeXml, wrappedTextBelow, wrappedTextCentered } from '@bpm/render-core';
import { triggerIcon } from './icons.js';
import { taskMarkerSvg } from './taskMarkers.js';
import { renderEdge } from './edges.js';

export interface RenderedNode {
  /** Shapes only — safe to draw before any label so a later shape can never paint over text. */
  body: string;
  /** Text only, drawn in a final pass across the whole diagram. */
  label: string;
}

const BELOW_LABEL_WIDTH = 100;

function labelForNode(
  node: PositionedNode,
  defaultMode: 'below' | 'inside',
): string {
  const mode = node.visual?.label ?? defaultMode;
  const wrap = node.visual?.wrap ?? 3;
  const fontSize = node.visual?.font === 'small' ? 10 : node.visual?.font === 'large' ? 14 : 12;
  const { x, y, width, height, label } = node;
  if (mode === 'inside') return wrappedTextCentered(x + width / 2, y + height / 2, width - 12, label, fontSize, wrap);
  if (mode === 'above') return wrappedTextBelow(x + width / 2, y - 6, Math.max(width, BELOW_LABEL_WIDTH), label, fontSize, wrap);
  if (mode === 'left') return wrappedTextBelow(x - 4, y + height / 2, Math.max(width, BELOW_LABEL_WIDTH), label, fontSize, wrap);
  if (mode === 'right') return wrappedTextBelow(x + width + 4, y + height / 2, Math.max(width, BELOW_LABEL_WIDTH), label, fontSize, wrap);
  return wrappedTextBelow(x + width / 2, y + height + 14, Math.max(width, BELOW_LABEL_WIDTH), label, fontSize, wrap);
}

function labelBelow(x: number, y: number, width: number, height: number, label: string): string {
  return wrappedTextBelow(x + width / 2, y + height + 14, Math.max(width, BELOW_LABEL_WIDTH), label);
}

type PositionedEvent = Extract<PositionedNode, { kind: 'event' }>;
type PositionedGateway = Extract<PositionedNode, { kind: 'gateway' }>;
type PositionedActivity = Extract<PositionedNode, { kind: 'activity' }>;

function renderEvent(node: PositionedEvent): RenderedNode {
  const { x, y, width, height, id } = node;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(width, height) / 2;
  const isBoundary = node.attachedToId !== undefined;
  const isEnd = node.category === 'end';
  const dash = isBoundary && !node.interrupting ? ' stroke-dasharray="4 3"' : '';
  const outerStroke = isEnd ? 'stroke-width="3"' : 'stroke-width="1.5"';
  let circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" ${outerStroke}${dash}/>`;
  if (node.category === 'intermediate') {
    circles += `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="black" stroke-width="1"${dash}/>`;
  }
  return {
    body: `<g data-node-id="${escapeXml(id)}">${circles}${triggerIcon(node.trigger, { x, y, width, height }, node.category)}</g>`,
    label: labelForNode(node, 'below'),
  };
}

const GATEWAY_MARKERS: Record<GatewayType, (cx: number, cy: number, half: number) => string> = {
  exclusive: (cx, cy) =>
    `<line x1="${cx - 8}" y1="${cy - 8}" x2="${cx + 8}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy + 8}" x2="${cx + 8}" y2="${cy - 8}" stroke="black"/>`,
  parallel: (cx, cy) =>
    `<line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="black"/>`,
  inclusive: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="black" stroke-width="2"/>`,
  complex: (cx, cy) =>
    [0, 60, 120].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return `<line x1="${cx - 8 * Math.cos(rad)}" y1="${cy - 8 * Math.sin(rad)}" x2="${cx + 8 * Math.cos(rad)}" y2="${cy + 8 * Math.sin(rad)}" stroke="black"/>`;
    }).join(''),
  eventBased: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="black"/><circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="black"/>`,
};

function renderGateway(node: PositionedGateway): RenderedNode {
  const { x, y, width, height, id } = node;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const half = width / 2;
  const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
  const marker = GATEWAY_MARKERS[node.gatewayType]?.(cx, cy, half) ?? '';
  return {
    body: `<g data-node-id="${escapeXml(id)}"><polygon points="${points}" fill="white" stroke="black"/>${marker}</g>`,
    label: labelForNode(node, 'below'),
  };
}

function renderActivity(node: PositionedActivity): RenderedNode {
  const { x, y, width, height, label, id, activityType, collapsed } = node;
  const doubleBorder = activityType === 'transaction' ? `<rect x="${x + 4}" y="${y + 4}" width="${width - 8}" height="${height - 8}" rx="4" fill="none" stroke="black" stroke-width="1"/>` : '';
  const boldBorder = activityType === 'callActivity' ? 'stroke-width="3"' : 'stroke-width="1.5"';
  const outer = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="white" stroke="black" ${boldBorder}/>`;

  const isNestable = activityType === 'subProcess' || activityType === 'transaction';
  const taskMarker = taskMarkerSvg(activityType, x, y);
  const marker = isNestable && collapsed
    ? `<g data-plus-marker="true" class="plus-marker"><rect x="${x + width / 2 - 6}" y="${y + height - 16}" width="12" height="12" fill="none" stroke="black"/><line x1="${x + width / 2 - 3}" y1="${y + height - 10}" x2="${x + width / 2 + 3}" y2="${y + height - 10}" stroke="black"/><line x1="${x + width / 2}" y1="${y + height - 13}" x2="${x + width / 2}" y2="${y + height - 7}" stroke="black"/></g>`
    : '';

  if (isNestable && !collapsed && node.children) {
    const children = node.children.map(renderNode);
    const childEdges = (node.childEdges ?? []).map(renderEdge);
    return {
      body: `<g data-node-id="${escapeXml(id)}">${outer}${doubleBorder}${children.map((c) => c.body).join('')}${childEdges.map((e) => e.body).join('')}</g>`,
      label: `<text x="${x + 6}" y="${y + 14}" font-size="11">${escapeXml(label)}</text>` +
        children.map((c) => c.label).join('') + childEdges.map((e) => e.label).join(''),
    };
  }

  return {
    body: `<g data-node-id="${escapeXml(id)}">${outer}${doubleBorder}${taskMarker}${marker}</g>`,
    label: labelForNode(node, 'inside'),
  };
}

function renderDataObject(node: PositionedNode): RenderedNode {
  const { x, y, width, height, label, id } = node;
  const fold = 10;
  const path = `M${x},${y} H${x + width - fold} L${x + width},${y + fold} V${y + height} H${x} Z`;
  return {
    body: `<g data-node-id="${escapeXml(id)}"><path d="${path}" fill="white" stroke="black"/></g>`,
    label: labelBelow(x, y, width, height, label),
  };
}

function renderDataStore(node: PositionedNode): RenderedNode {
  const { x, y, width, height, label, id } = node;
  const rx = width / 2;
  const ry = 8;
  return {
    body: `<g data-node-id="${escapeXml(id)}">` +
      `<path d="M${x},${y + ry} V${y + height - ry} A${rx},${ry} 0 0 0 ${x + width},${y + height - ry} V${y + ry}" fill="white" stroke="black"/>` +
      `<ellipse cx="${x + rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="white" stroke="black"/></g>`,
    label: labelBelow(x, y, width, height, label),
  };
}

function renderTextAnnotation(node: PositionedNode): RenderedNode {
  const { x, y, width, height, label, id } = node;
  return {
    body: `<g data-node-id="${escapeXml(id)}"><path d="M${x + 10},${y} H${x} V${y + height} H${x + 10}" fill="none" stroke="black"/></g>`,
    label: wrappedTextCentered(x + 14 + Math.max(0, width - 14) / 2, y + height / 2, Math.max(width - 14, 60), label, 11)
      .replace('text-anchor="middle"', 'text-anchor="start"'),
  };
}

function renderGroup(node: PositionedNode): RenderedNode {
  const { x, y, width, height, label, id } = node;
  return {
    body: `<g data-node-id="${escapeXml(id)}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="none" stroke="#666" stroke-dasharray="6 4"/></g>`,
    label: `<text x="${x + 6}" y="${y + 14}" font-size="11" fill="#666">${escapeXml(label)}</text>`,
  };
}

export function renderNode(node: PositionedNode): RenderedNode {
  switch (node.kind) {
    case 'event': return renderEvent(node);
    case 'gateway': return renderGateway(node);
    case 'activity': return renderActivity(node);
    case 'dataObject': return renderDataObject(node);
    case 'dataStore': return renderDataStore(node);
    case 'textAnnotation': return renderTextAnnotation(node);
    case 'group': return renderGroup(node);
  }
}

export { escapeXml };
