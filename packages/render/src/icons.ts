import type { EventCategory, EventTrigger } from '@bpm/ast';
import { scaledPathInBounds } from './pathMap.js';

export interface IconBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ThrowStyle = 'catch' | 'throw';

function iconStyle(category: EventCategory): ThrowStyle {
  return category === 'end' ? 'throw' : 'catch';
}

function pathTag(d: string, style: ThrowStyle, strokeWidth = 1): string {
  const fill = style === 'throw' ? 'black' : 'white';
  return `<path d="${d}" fill="${fill}" stroke="black" stroke-width="${strokeWidth}"/>`;
}

function scaleConfig(
  xScaleFactor: number,
  yScaleFactor: number,
  mx: number,
  my: number,
) {
  return { xScaleFactor, yScaleFactor, position: { mx, my } };
}

function renderPathIcon(
  pathId: string,
  bounds: IconBounds,
  config: ReturnType<typeof scaleConfig>,
  style: ThrowStyle,
  strokeWidth = 1,
): string {
  const d = scaledPathInBounds(pathId, bounds.x, bounds.y, bounds.width, bounds.height, config);
  return pathTag(d, style, strokeWidth);
}

function renderTimer(bounds: IconBounds): string {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.round((width + height) / 4 - 0.2 * height);
  const center = scaleConfig(0.75, 0.75, 0.5, 0.5);

  let markup = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" stroke-width="2"/>`;
  markup += pathTag(
    scaledPathInBounds('EVENT_TIMER_WH', x, y, width, height, center),
    'catch',
    2,
  );

  for (let i = 0; i < 12; i++) {
    const d = scaledPathInBounds('EVENT_TIMER_LINE', x, y, width, height, center);
    markup += `<path d="${d}" fill="none" stroke="black" stroke-width="1" transform="rotate(${i * 30},${cx},${cy})"/>`;
  }

  return markup;
}

function renderTerminate(bounds: IconBounds): string {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.round((width + height) / 4 - 8);
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="black" stroke="black" stroke-width="4"/>`;
}

function renderCancel(bounds: IconBounds, style: ThrowStyle): string {
  const d = scaledPathInBounds(
    'EVENT_CANCEL_45',
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    scaleConfig(1, 1, 0.638, -0.055),
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const fill = style === 'throw' ? 'black' : 'none';
  return `<g transform="rotate(45,${cx},${cy})"><path d="${d}" fill="${fill}" stroke="black" stroke-width="1"/></g>`;
}

const ICON_RENDERERS: Record<
  Exclude<EventTrigger, 'none'>,
  (bounds: IconBounds, style: ThrowStyle) => string
> = {
  message: (b, s) => renderPathIcon('EVENT_MESSAGE', b, scaleConfig(0.9, 0.9, 0.235, 0.315), s),
  timer: (b) => renderTimer(b),
  error: (b, s) => renderPathIcon('EVENT_ERROR', b, scaleConfig(1.1, 1.1, 0.2, 0.722), s),
  escalation: (b, s) => renderPathIcon('EVENT_ESCALATION', b, scaleConfig(1, 1, 0.5, 0.2), s),
  cancel: (b, s) => renderCancel(b, s),
  compensation: (b, s) => renderPathIcon('EVENT_COMPENSATION', b, scaleConfig(1, 1, 0.22, 0.5), s),
  conditional: (b, s) => renderPathIcon('EVENT_CONDITIONAL', b, scaleConfig(1, 1, 0.5, 0.222), s),
  link: (b, s) => renderPathIcon('EVENT_LINK', b, scaleConfig(1, 1, 0.57, 0.263), s),
  signal: (b, s) => renderPathIcon('EVENT_SIGNAL', b, scaleConfig(0.9, 0.9, 0.5, 0.2), s),
  multiple: (b, s) => renderPathIcon('EVENT_MULTIPLE', b, scaleConfig(1.1, 1.1, 0.222, 0.36), s),
  parallelMultiple: (b, s) => renderPathIcon(
    'EVENT_PARALLEL_MULTIPLE',
    b,
    scaleConfig(1.2, 1.2, 0.458, 0.194),
    s,
  ),
  terminate: (b) => renderTerminate(b),
};

/** Inline BPMN 2.0 event-definition glyphs (PathMap-scaled, no external assets). */
export function triggerIcon(
  trigger: EventTrigger,
  bounds: IconBounds,
  category: EventCategory = 'start',
): string {
  if (trigger === 'none') return '';
  return `<g data-icon="${trigger}">${ICON_RENDERERS[trigger](bounds, iconStyle(category))}</g>`;
}

/** @deprecated Use bounds-based triggerIcon; kept for tests comparing legacy center-only API. */
export function triggerIconAtCenter(
  trigger: EventTrigger,
  cx: number,
  cy: number,
  size = 36,
  category: EventCategory = 'start',
): string {
  const half = size / 2;
  return triggerIcon(trigger, { x: cx - half, y: cy - half, width: size, height: size }, category);
}
