import type { CamundaExtensions, EventDefinition, FontSizeHint, NodeLabelPosition, NodeVisual, SizeHint } from '@bpm/ast';
import type { ParseError } from './errors.js';

export const SIZE_SUFFIX = /\s+size\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/;
export const NODE_ATTRS_SUFFIX = /\s*\[([^\]]*)\]\s*$/;

export interface NodeAttrs {
  visual?: NodeVisual;
  camunda?: CamundaExtensions;
  eventDefinition?: EventDefinition;
}

function isNodeLabel(value: string): value is NodeLabelPosition {
  return value === 'inside' || value === 'below' || value === 'above' || value === 'left' || value === 'right';
}

function isFont(value: string): value is FontSizeHint {
  return value === 'small' || value === 'normal' || value === 'large';
}

function splitAttrPairs(raw: string): string[] {
  const pairs: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') inQuotes = !inQuotes;
    if (c === ',' && !inQuotes) {
      if (current.trim()) pairs.push(current.trim());
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) pairs.push(current.trim());
  return pairs;
}

function parseAttrValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseNodeVisualAttrs(raw: string, lineNumber: number, errors: ParseError[]): NodeVisual | null {
  const parsed = parseNodeAttrs(raw, lineNumber, errors);
  if (parsed === null) return null;
  return parsed.visual ?? {};
}

export function parseNodeAttrs(raw: string, lineNumber: number, errors: ParseError[]): NodeAttrs | null {
  const visual: NodeVisual = {};
  const camunda: CamundaExtensions = {};
  const eventDefinition: EventDefinition = {};
  let hasVisual = false;
  let hasCamunda = false;
  let hasEventDefinition = false;

  for (const pair of splitAttrPairs(raw)) {
    const colon = pair.indexOf(':');
    if (colon <= 0) {
      errors.push({ line: lineNumber, column: 1, message: `Malformed node attribute "${pair}"` });
      return null;
    }
    const rawKey = pair.slice(0, colon).trim();
    const rawValue = parseAttrValue(pair.slice(colon + 1));
    if (!rawValue) {
      errors.push({ line: lineNumber, column: 1, message: `Malformed node attribute "${pair}"` });
      return null;
    }
    if (rawKey === 'label') {
      if (!isNodeLabel(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown node label position "${rawValue}"` });
        return null;
      }
      visual.label = rawValue;
      hasVisual = true;
    } else if (rawKey === 'wrap') {
      const n = Number(rawValue);
      if (![1, 2, 3, 4, 5].includes(n)) {
        errors.push({ line: lineNumber, column: 1, message: `wrap must be an integer 1..5 (got "${rawValue}")` });
        return null;
      }
      visual.wrap = n as 1 | 2 | 3 | 4 | 5;
      hasVisual = true;
    } else if (rawKey === 'font') {
      if (!isFont(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown font "${rawValue}"` });
        return null;
      }
      visual.font = rawValue;
      hasVisual = true;
    } else if (rawKey === 'align') {
      if (rawValue !== 'left' && rawValue !== 'center') {
        errors.push({ line: lineNumber, column: 1, message: `Unknown align "${rawValue}"` });
        return null;
      }
      visual.align = rawValue;
      hasVisual = true;
    } else if (rawKey === 'camundaClass') {
      camunda.class = rawValue;
      hasCamunda = true;
    } else if (rawKey === 'camundaExpression') {
      camunda.expression = rawValue;
      hasCamunda = true;
    } else if (rawKey === 'camundaFormKey') {
      camunda.formKey = rawValue;
      hasCamunda = true;
    } else if (rawKey === 'timerDate' || rawKey === 'timerDuration' || rawKey === 'timerCycle'
      || rawKey === 'messageRef' || rawKey === 'errorRef' || rawKey === 'escalationRef'
      || rawKey === 'signalRef' || rawKey === 'condition') {
      eventDefinition[rawKey] = rawValue;
      hasEventDefinition = true;
    } else {
      errors.push({ line: lineNumber, column: 1, message: `Unknown node attribute "${rawKey}"` });
      return null;
    }
  }

  if (camunda.class && camunda.expression) {
    errors.push({
      line: lineNumber,
      column: 1,
      message: 'camundaClass and camundaExpression cannot be combined — Camunda treats them as alternative service-task bindings',
    });
    return null;
  }

  return {
    ...(hasVisual ? { visual } : {}),
    ...(hasCamunda ? { camunda } : {}),
    ...(hasEventDefinition ? { eventDefinition } : {}),
  };
}

export function parseSizeHint(wRaw: string, hRaw: string, lineNumber: number, errors: ParseError[]): SizeHint | null {
  const width = Number(wRaw);
  const height = Number(hRaw);
  if (!(width > 0) || !(height > 0)) {
    errors.push({ line: lineNumber, column: 1, message: `size (w, h) requires positive width and height (got ${wRaw}, ${hRaw})` });
    return null;
  }
  return { width, height };
}
