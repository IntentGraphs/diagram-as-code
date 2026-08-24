import type { RoutedEdge } from '@bpm/layout';
import { escapeXml, pointAlongPolyline, polylinePathD } from '@bpm/render-core';

export interface RenderedEdge {
  /** The path/markers only — drawn before any label so a label can never end up under a line painted later. */
  body: string;
  /** Text (plus a background halo so a line crossing under it doesn't make it unreadable). */
  label: string;
}

/**
 * The visible stroke is intentionally thin, but it is not a practical pointer target for
 * diagram inspection. Keep the hit area separate so selection/hover can be generous without
 * changing the exported appearance, route geometry, dash pattern, or marker placement.
 */
const EDGE_HIT_STROKE_WIDTH = 12;

function arrowhead(last: { x: number; y: number }, secondLast: { x: number; y: number }): string {
  const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
  const size = 8;
  const p1 = { x: last.x - size * Math.cos(angle - Math.PI / 6), y: last.y - size * Math.sin(angle - Math.PI / 6) };
  const p2 = { x: last.x - size * Math.cos(angle + Math.PI / 6), y: last.y - size * Math.sin(angle + Math.PI / 6) };
  return `<polygon points="${last.x},${last.y} ${p1.x},${p1.y} ${p2.x},${p2.y}" fill="black"/>`;
}

function sourceMarker(flowType: RoutedEdge['flowType'], start: { x: number; y: number }, next: { x: number; y: number }): string {
  const angle = Math.atan2(next.y - start.y, next.x - start.x);
  if (flowType === 'conditionalSequence') {
    const size = 7;
    const tip = { x: start.x + size * Math.cos(angle), y: start.y + size * Math.sin(angle) };
    const perp = angle + Math.PI / 2;
    const left = { x: start.x + (size / 2) * Math.cos(perp), y: start.y + (size / 2) * Math.sin(perp) };
    const right = { x: start.x - (size / 2) * Math.cos(perp), y: start.y - (size / 2) * Math.sin(perp) };
    return `<polygon class="conditional-marker" points="${start.x},${start.y} ${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}" fill="white" stroke="black"/>`;
  }
  if (flowType === 'defaultSequence') {
    const perp = angle + Math.PI / 2;
    const half = 5;
    return `<line class="default-marker" x1="${start.x + half * Math.cos(perp)}" y1="${start.y + half * Math.sin(perp)}" x2="${start.x - half * Math.cos(perp)}" y2="${start.y - half * Math.sin(perp)}" stroke="black"/>`;
  }
  return '';
}

export function renderEdge(edge: RoutedEdge): RenderedEdge {
  const { id, points, label, flowType } = edge;
  // A route with fewer than two points has no direction, so there is nothing to draw.
  if (points.length < 2) return { body: '', label: '' };
  const pathD = polylinePathD(points, edge.corner === 'round' ? 'round' : 'sharp');
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2] ?? last;

  const strokeStyle =
    edge.style === 'dashed' ? 'stroke-dasharray="6 4"' :
    edge.style === 'dotted' ? 'stroke-dasharray="2 3"' :
    edge.style === 'solid' ? '' :
    flowType === 'message' ? 'stroke-dasharray="6 4"' :
    flowType === 'association' ? 'stroke-dasharray="1 3"' : '';

  const arrow = flowType === 'association' ? '' : arrowhead(last, secondLast);
  const startMarker = flowType === 'message'
    ? `<circle cx="${points[0].x}" cy="${points[0].y}" r="4" fill="white" stroke="black"/>`
    : sourceMarker(flowType, points[0], points[1] ?? points[0]);

  let labelEl = '';
  if (label) {
    const placement = edge.labelPlacement;
    const at = placement?.at ?? 0.5;
    const { x: baseX, y: baseY, tx, ty } = pointAlongPolyline(points, at);
    let lx = baseX;
    let ly = baseY - 4;
    const side = placement?.side;
    const offsetAmt = 10;
    if (side === 'above') { ly = baseY - offsetAmt; }
    else if (side === 'below') { ly = baseY + offsetAmt; }
    else if (side === 'left') { lx = baseX - offsetAmt; ly = baseY; }
    else if (side === 'right') { lx = baseX + offsetAmt; ly = baseY; }
    if (placement?.offset) {
      lx += placement.offset.x;
      ly += placement.offset.y;
    }
    void tx; void ty;
    const haloWidth = Math.max(16, label.length * 6.5);
    const halo = `<rect x="${lx - haloWidth / 2}" y="${ly - 11}" width="${haloWidth}" height="14" fill="white" opacity="0.85"/>`;
    labelEl = `<g data-edge-label-id="${escapeXml(id)}" class="diagram-edge-label">${halo}<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11">${escapeXml(label)}</text></g>`;
  }

  return {
    body: `<g data-edge-id="${escapeXml(id)}"><path class="diagram-edge-hit-area" d="${pathD}" fill="none" stroke="transparent" stroke-width="${EDGE_HIT_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" aria-hidden="true"/><path class="diagram-edge-visible" d="${pathD}" fill="none" stroke="black" stroke-width="1.5" ${strokeStyle}/>${arrow}${startMarker}</g>`,
    label: labelEl,
  };
}
