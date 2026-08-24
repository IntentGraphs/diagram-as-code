/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import type { PositionedDiagram } from '@bpm/layout';
import { mountSvg } from '../src/mountSvg.js';
import { createSvgViewport } from '../src/svgViewport.js';
import { getViewportAnchor } from '../src/viewportAnchor.js';

function setViewportSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
}

describe('createSvgViewport', () => {
  it('keeps ordinary wheel scrolling native and zooms only with Ctrl/Cmd-wheel', async () => {
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
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(Number.parseFloat(svg.getAttribute('width')!)).toBeGreaterThan(initialWidth);

    viewport.destroy();
    host.remove();
  });

  it('restores zoom and the visible section when a new SVG is synced', () => {
    const host = document.createElement('div');
    setViewportSize(host, 500, 300);
    document.body.append(host);
    expect(mountSvg(host, '<svg width="1000" height="600" viewBox="0 0 1000 600"><rect width="1000" height="600"/></svg>')).toBe(true);

    const viewport = createSvgViewport(host);
    viewport.sync();
    viewport.setZoom(2);
    host.scrollLeft = 180;
    host.scrollTop = 90;
    const before = viewport.getSnapshot()!;

    expect(mountSvg(host, '<svg width="1200" height="700" viewBox="0 0 1200 700"><rect width="1200" height="700"/></svg>')).toBe(true);
    viewport.sync(before);
    const after = viewport.getSnapshot()!;
    expect(after.zoom).toBe(before.zoom);
    expect(after.scrollLeft).toBe(before.scrollLeft);
    expect(after.scrollTop).toBe(before.scrollTop);

    viewport.destroy();
    host.remove();
  });

  it('fits the complete SVG back into the preview pane', () => {
    const host = document.createElement('div');
    setViewportSize(host, 500, 300);
    document.body.append(host);
    expect(mountSvg(host, '<svg width="1000" height="600" viewBox="0 0 1000 600"><rect width="1000" height="600"/></svg>')).toBe(true);

    const viewport = createSvgViewport(host);
    viewport.sync();
    viewport.setZoom(3);
    host.scrollLeft = 240;
    host.scrollTop = 120;
    viewport.fit();

    const snapshot = viewport.getSnapshot()!;
    expect(snapshot.zoom).toBe(1);
    expect(snapshot.scrollLeft).toBe(0);
    expect(snapshot.scrollTop).toBe(0);

    viewport.destroy();
    host.remove();
  });

  it('maps the visible SVG center into the positioned scene coordinate system', () => {
    const diagram = {
      pools: [],
      nodes: [{ id: 'n', kind: 'task', label: 'Task', x: -20, y: -10, width: 100, height: 60 }],
      edges: [],
    } as unknown as PositionedDiagram;
    const anchor = getViewportAnchor({
      zoom: 2,
      scale: 2,
      contentWidth: 500,
      contentHeight: 300,
      stageWidth: 800,
      stageHeight: 500,
      svgWidth: 600,
      svgHeight: 400,
      paddingLeft: 30,
      paddingTop: 30,
      scrollLeft: 100,
      scrollTop: 80,
    }, diagram);

    expect(anchor).toEqual({
      center: { x: 105, y: 80 },
      relativeZoom: 2,
    });
  });
});
