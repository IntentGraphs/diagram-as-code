/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { mountSvg } from '../src/mountSvg.js';
import { createSvgViewport } from '../src/svgViewport.js';

function setViewportSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

describe('createSvgViewport', () => {
  it('keeps ordinary wheel scrolling native and zooms only with Ctrl/Cmd-wheel', () => {
    const host = document.createElement('div');
    setViewportSize(host, 500, 300);
    document.body.append(host);
    expect(mountSvg(host, '<svg width="1000" height="600" viewBox="0 0 1000 600"><rect width="1000" height="600"/></svg>')).toBe(true);

    const viewport = createSvgViewport(host);
    viewport.sync();
    const svg = host.querySelector('svg')!;
    const initialWidth = Number.parseFloat(svg.getAttribute('width')!);

    const ordinaryWheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true });
    host.dispatchEvent(ordinaryWheel);
    expect(ordinaryWheel.defaultPrevented).toBe(false);
    expect(Number.parseFloat(svg.getAttribute('width')!)).toBe(initialWidth);

    const zoomWheel = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    expect(zoomWheel.ctrlKey).toBe(true);
    expect(zoomWheel.deltaY).toBe(-100);
    host.dispatchEvent(zoomWheel);
    expect(zoomWheel.defaultPrevented).toBe(true);
    expect(Number.parseFloat(svg.getAttribute('width')!)).toBeGreaterThan(initialWidth);

    viewport.destroy();
    host.remove();
  });
});
