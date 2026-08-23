import type { EdgeCorner, EdgeStyle, Position, Side, EdgeLabelPlacement, LabelPlacementSide } from '@bpm/ast';
import type { ParseError } from './errors.js';
import { isEdgeCorner, isEdgeSide, isEdgeStyle } from './tokens.js';

export interface EdgeAttrs {
  style?: EdgeStyle;
  corner?: EdgeCorner;
  from?: Side;
  to?: Side;
  waypoints?: Position[];
  labelPlacement?: EdgeLabelPlacement;
}

const POINT_RE = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;

function parsePointList(raw: string, lineNumber: number, errors: ParseError[], label: string): Position[] | null {
  const points: Position[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(POINT_RE.source, 'g');
  while ((match = re.exec(raw)) !== null) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  if (points.length === 0) {
    errors.push({ line: lineNumber, column: 1, message: `Malformed ${label} — expected one or more (x, y) points` });
    return null;
  }
  const leftover = raw.replace(POINT_RE, '').trim();
  if (leftover.length > 0) {
    errors.push({ line: lineNumber, column: 1, message: `Malformed ${label} — unexpected "${leftover}"` });
    return null;
  }
  return points;
}

function isLabelSide(value: string): value is LabelPlacementSide {
  return value === 'above' || value === 'below' || value === 'left' || value === 'right';
}

/**
 * Parse edge `[...]` contents. Extracts `via:` / `labelOffset:` before comma-splitting
 * so commas inside parentheses do not break attributes.
 */
export function parseEdgeAttrs(raw: string, lineNumber: number, errors: ParseError[]): EdgeAttrs | null {
  const result: EdgeAttrs = {};
  let rest = raw;

  const viaMatch = rest.match(/\bvia:\s*((?:\([^)]*\)\s*)+)/);
  if (viaMatch) {
    const points = parsePointList(viaMatch[1], lineNumber, errors, 'via');
    if (points === null) return null;
    result.waypoints = points;
    rest = (rest.slice(0, viaMatch.index!) + rest.slice(viaMatch.index! + viaMatch[0].length)).replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '').trim();
  }

  const offsetMatch = rest.match(/\blabelOffset:\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))/);
  if (offsetMatch) {
    const points = parsePointList(offsetMatch[1], lineNumber, errors, 'labelOffset');
    if (points === null || points.length !== 1) {
      errors.push({ line: lineNumber, column: 1, message: 'Malformed labelOffset — expected a single (dx, dy)' });
      return null;
    }
    result.labelPlacement = { ...(result.labelPlacement ?? {}), offset: points[0] };
    rest = (rest.slice(0, offsetMatch.index!) + rest.slice(offsetMatch.index! + offsetMatch[0].length)).replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '').trim();
  }

  const pairs = rest.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  for (const pair of pairs) {
    const colon = pair.indexOf(':');
    if (colon <= 0) {
      errors.push({ line: lineNumber, column: 1, message: `Malformed edge attribute "${pair}"` });
      return null;
    }
    const rawKey = pair.slice(0, colon).trim();
    const rawValue = pair.slice(colon + 1).trim();
    if (!rawValue) {
      errors.push({ line: lineNumber, column: 1, message: `Malformed edge attribute "${pair}"` });
      return null;
    }
    if (rawKey === 'style') {
      if (!isEdgeStyle(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge style "${rawValue}"` });
        return null;
      }
      result.style = rawValue;
    } else if (rawKey === 'corner') {
      if (!isEdgeCorner(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge corner "${rawValue}"` });
        return null;
      }
      result.corner = rawValue;
    } else if (rawKey === 'from') {
      if (!isEdgeSide(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge side "${rawValue}" for "from"` });
        return null;
      }
      result.from = rawValue;
    } else if (rawKey === 'to') {
      if (!isEdgeSide(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge side "${rawValue}" for "to"` });
        return null;
      }
      result.to = rawValue;
    } else if (rawKey === 'labelAt') {
      const at = Number(rawValue);
      if (!Number.isFinite(at) || at < 0 || at > 1) {
        errors.push({ line: lineNumber, column: 1, message: `labelAt must be a number between 0 and 1 (got "${rawValue}")` });
        return null;
      }
      result.labelPlacement = { ...(result.labelPlacement ?? {}), at };
    } else if (rawKey === 'labelSide') {
      if (!isLabelSide(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown labelSide "${rawValue}"` });
        return null;
      }
      result.labelPlacement = { ...(result.labelPlacement ?? {}), side: rawValue };
    } else if (rawKey === 'via' || rawKey === 'labelOffset') {
      errors.push({ line: lineNumber, column: 1, message: `Malformed ${rawKey} attribute` });
      return null;
    } else {
      errors.push({ line: lineNumber, column: 1, message: `Unknown edge attribute "${rawKey}"` });
      return null;
    }
  }
  return result;
}
