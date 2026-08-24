import type { SvgViewportSnapshot } from './svgViewport.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(Math.max(raw, 0.000001)));
  const base = raw / Math.pow(10, exponent);
  const normalized = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return normalized * Math.pow(10, exponent);
}

function formatValue(value: number, step: number): string {
  const decimals = Math.max(0, Math.min(3, Math.ceil(-Math.log10(step))));
  return value.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function svgElement(name: string): SVGElement {
  return document.createElementNS(SVG_NS, name);
}

function line(parent: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, major: boolean): void {
  const tick = svgElement('line');
  tick.setAttribute('x1', String(x1));
  tick.setAttribute('y1', String(y1));
  tick.setAttribute('x2', String(x2));
  tick.setAttribute('y2', String(y2));
  tick.setAttribute('class', major ? 'canvas-ruler-major' : 'canvas-ruler-minor');
  parent.append(tick);
}

function label(parent: SVGSVGElement, textValue: string, x: number, y: number, vertical: boolean): void {
  const text = svgElement('text');
  text.textContent = textValue;
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  if (vertical) text.setAttribute('text-anchor', 'end');
  text.setAttribute('class', 'canvas-ruler-label');
  parent.append(text);
}

function clear(element: HTMLElement): void {
  element.replaceChildren();
}

export function renderCanvasRulers(
  horizontal: HTMLElement,
  vertical: HTMLElement,
  snapshot: SvgViewportSnapshot | undefined,
  rulerSize = 30,
): void {
  clear(horizontal);
  clear(vertical);
  if (!snapshot || snapshot.scale <= 0) return;

  const horizontalWidth = Math.max(1, horizontal.clientWidth);
  const verticalHeight = Math.max(1, vertical.clientHeight);
  const horizontalSvg = document.createElementNS(SVG_NS, 'svg');
  horizontalSvg.setAttribute('width', String(horizontalWidth));
  horizontalSvg.setAttribute('height', String(rulerSize));
  horizontalSvg.setAttribute('aria-hidden', 'true');
  const verticalSvg = document.createElementNS(SVG_NS, 'svg');
  verticalSvg.setAttribute('width', String(rulerSize));
  verticalSvg.setAttribute('height', String(verticalHeight));
  verticalSvg.setAttribute('aria-hidden', 'true');

  const majorStep = niceStep(56 / snapshot.scale);
  const minorStep = majorStep / 5;
  const horizontalOrigin = (snapshot.stageWidth - snapshot.svgWidth) / 2;
  const verticalOrigin = (snapshot.stageHeight - snapshot.svgHeight) / 2;
  const horizontalMinimum = (snapshot.scrollLeft - horizontalOrigin) / snapshot.scale;
  const verticalMinimum = (snapshot.scrollTop - verticalOrigin) / snapshot.scale;

  const firstHorizontal = Math.floor(horizontalMinimum / minorStep) - 1;
  const lastHorizontal = Math.ceil((snapshot.scrollLeft + snapshot.contentWidth - horizontalOrigin) / snapshot.scale / minorStep) + 1;
  for (let index = firstHorizontal; index <= lastHorizontal; index += 1) {
    const value = index * minorStep;
    const x = horizontalOrigin + value * snapshot.scale - snapshot.scrollLeft;
    if (x < 0 || x > horizontalWidth) continue;
    const major = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.00001;
    line(horizontalSvg, x, rulerSize, x, major ? 12 : 20, major);
    if (major) label(horizontalSvg, formatValue(value, majorStep), x + 3, 11, false);
  }

  const firstVertical = Math.floor(verticalMinimum / minorStep) - 1;
  const lastVertical = Math.ceil((snapshot.scrollTop + snapshot.contentHeight - verticalOrigin) / snapshot.scale / minorStep) + 1;
  for (let index = firstVertical; index <= lastVertical; index += 1) {
    const value = index * minorStep;
    const y = verticalOrigin + value * snapshot.scale - snapshot.scrollTop;
    if (y < 0 || y > verticalHeight) continue;
    const major = Math.abs(value / majorStep - Math.round(value / majorStep)) < 0.00001;
    line(verticalSvg, rulerSize, y, major ? 12 : 20, y, major);
    if (major) label(verticalSvg, formatValue(value, majorStep), 26, y - 3, true);
  }

  horizontal.append(horizontalSvg);
  vertical.append(verticalSvg);
}
