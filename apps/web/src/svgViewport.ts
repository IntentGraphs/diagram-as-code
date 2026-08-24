const MIN_ZOOM = 0.25;
// Zoom is relative to the fitted diagram size. 1200% gives detailed inspection of large
// diagrams while keeping the stage bounded enough for reliable browser scrolling.
const MAX_ZOOM = 12;
// A slightly shallower curve makes high-resolution trackpad deltas feel deliberate while
// still allowing a mouse wheel to cover the full range in a few notches.
const ZOOM_BASE = 1.0012;

interface ViewportMetrics {
  contentWidth: number;
  contentHeight: number;
  stageWidth: number;
  stageHeight: number;
  svgWidth: number;
  svgHeight: number;
  paddingLeft: number;
  paddingTop: number;
  fitScale: number;
}

export interface SvgViewportSnapshot {
  zoom: number;
  scale: number;
  contentWidth: number;
  contentHeight: number;
  stageWidth: number;
  stageHeight: number;
  svgWidth: number;
  svgHeight: number;
  paddingLeft: number;
  paddingTop: number;
  scrollLeft: number;
  scrollTop: number;
}

export type SvgViewportRestoreState = Pick<SvgViewportSnapshot, 'zoom' | 'scrollLeft' | 'scrollTop'>;

export interface SvgViewport {
  sync(restore?: SvgViewportRestoreState): void;
  setZoom(zoom: number): void;
  zoomBy(factor: number): void;
  getSnapshot(): SvgViewportSnapshot | undefined;
  subscribe(listener: (snapshot: SvgViewportSnapshot | undefined) => void): () => void;
  destroy(): void;
}

function finitePositive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } | undefined {
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const width = finitePositive(Number.parseFloat(svg.getAttribute('width') ?? ''));
  const height = finitePositive(Number.parseFloat(svg.getAttribute('height') ?? ''));
  return width && height ? { width, height } : undefined;
}

function wheelPixels(event: WheelEvent, container: HTMLElement): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * container.clientHeight;
  return event.deltaY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createSvgViewport(container: HTMLElement): SvgViewport {
  let stage: HTMLDivElement | null = null;
  let svg: SVGSVGElement | null = null;
  let dimensions: { width: number; height: number } | undefined;
  let zoom = 1;
  let resizeObserver: ResizeObserver | undefined;
  let wheelDelta = 0;
  let wheelPoint: { clientX: number; clientY: number } | undefined;
  let wheelFrame: number | undefined;
  const listeners = new Set<(snapshot: SvgViewportSnapshot | undefined) => void>();

  function findSvg(): SVGSVGElement | null {
    for (const child of Array.from(container.children)) {
      if (child.localName === 'svg') return child as SVGSVGElement;
      if (child.classList.contains('svg-viewport-stage')) {
        return child.querySelector(':scope > svg') as SVGSVGElement | null;
      }
    }
    return null;
  }

  function ensureStage(): boolean {
    const nextSvg = findSvg();
    if (!nextSvg) return false;

    if (nextSvg.parentElement?.classList.contains('svg-viewport-stage')) {
      stage = nextSvg.parentElement as HTMLDivElement;
    } else {
      stage = document.createElement('div');
      stage.className = 'svg-viewport-stage';
      nextSvg.replaceWith(stage);
      stage.append(nextSvg);
    }

    svg = nextSvg;
    dimensions = svgDimensions(svg);
    return Boolean(dimensions);
  }

  function layout(): ViewportMetrics | undefined {
    if (!svg || !stage || !dimensions) return undefined;

    const style = getComputedStyle(container);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const contentWidth = Math.max(1, container.clientWidth - paddingLeft - paddingRight);
    const contentHeight = Math.max(1, container.clientHeight - paddingTop - paddingBottom);
    const fitScale = Math.min(1, contentWidth / dimensions.width, contentHeight / dimensions.height);
    const svgWidth = dimensions.width * fitScale * zoom;
    const svgHeight = dimensions.height * fitScale * zoom;
    const stageWidth = Math.max(contentWidth, svgWidth);
    const stageHeight = Math.max(contentHeight, svgHeight);

    stage.style.width = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
    svg.setAttribute('width', `${svgWidth}`);
    svg.setAttribute('height', `${svgHeight}`);

    return {
      contentWidth,
      contentHeight,
      stageWidth,
      stageHeight,
      svgWidth,
      svgHeight,
      paddingLeft,
      paddingTop,
      fitScale,
    };
  }

  function snapshot(metrics: ViewportMetrics | undefined): SvgViewportSnapshot | undefined {
    if (!metrics) return undefined;
    return {
      zoom,
      scale: metrics.fitScale * zoom,
      contentWidth: metrics.contentWidth,
      contentHeight: metrics.contentHeight,
      stageWidth: metrics.stageWidth,
      stageHeight: metrics.stageHeight,
      svgWidth: metrics.svgWidth,
      svgHeight: metrics.svgHeight,
      paddingLeft: metrics.paddingLeft,
      paddingTop: metrics.paddingTop,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  }

  function notify(metrics: ViewportMetrics | undefined): void {
    const next = snapshot(metrics);
    listeners.forEach((listener) => listener(next));
  }

  function sync(restore?: SvgViewportRestoreState): void {
    if (!ensureStage()) return;
    // A new SVG is mounted after a DSL edit. Keep the user's view when one exists; the
    // initial render still starts at the normal fit-to-viewport zoom.
    zoom = clamp(restore?.zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
    // Hidden views have no usable dimensions yet; the observer will lay them out once visible.
    if (container.clientWidth <= 0 || container.clientHeight <= 0) {
      notify(undefined);
      return;
    }
    const metrics = layout();
    if (restore) {
      // Restore after layout so the new stage's scrollable bounds are in place. The browser
      // clamps values when the edited diagram becomes smaller, while unchanged diagrams retain
      // the exact section that was visible before the source edit.
      container.scrollLeft = Math.max(0, restore.scrollLeft);
      container.scrollTop = Math.max(0, restore.scrollTop);
    }
    notify(metrics);
  }

  function applyZoomAtPoint(nextZoom: number, clientX?: number, clientY?: number): void {
    if (!svg || !stage || !dimensions) return;
    const before = layout();
    if (!before) return;

    const rect = container.getBoundingClientRect();
    const localX = (clientX ?? rect.left + container.clientWidth / 2) - rect.left - before.paddingLeft;
    const localY = (clientY ?? rect.top + container.clientHeight / 2) - rect.top - before.paddingTop;
    const contentX = container.scrollLeft + localX;
    const contentY = container.scrollTop + localY;
    const beforeOffsetX = (before.stageWidth - before.svgWidth) / 2;
    const beforeOffsetY = (before.stageHeight - before.svgHeight) / 2;
    const svgX = (contentX - beforeOffsetX) / before.svgWidth;
    const svgY = (contentY - beforeOffsetY) / before.svgHeight;

    zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    const after = layout();
    if (!after) return;

    const afterOffsetX = (after.stageWidth - after.svgWidth) / 2;
    const afterOffsetY = (after.stageHeight - after.svgHeight) / 2;
    container.scrollLeft = Math.max(0, afterOffsetX + svgX * after.svgWidth - localX);
    container.scrollTop = Math.max(0, afterOffsetY + svgY * after.svgHeight - localY);
    notify(after);
  }

  function flushWheel(): void {
    wheelFrame = undefined;
    const deltaY = wheelDelta;
    const point = wheelPoint;
    wheelDelta = 0;
    wheelPoint = undefined;
    if (deltaY === 0) return;
    applyZoomAtPoint(zoom * Math.pow(ZOOM_BASE, -deltaY), point?.clientX, point?.clientY);
  }

  function handleWheel(event: WheelEvent): void {
    if (!svg || !stage || !dimensions || (!event.ctrlKey && !event.metaKey)) return;

    const deltaY = wheelPixels(event, container);
    if (deltaY === 0) return;

    event.preventDefault();
    wheelDelta += deltaY;
    wheelPoint = { clientX: event.clientX, clientY: event.clientY };
    if (wheelFrame === undefined) wheelFrame = requestAnimationFrame(flushWheel);
  }

  function handleScroll(): void {
    notify(layout());
  }

  function handleResize(): void {
    notify(layout());
  }

  container.addEventListener('wheel', handleWheel, { passive: false });
  container.addEventListener('scroll', handleScroll, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (svg && stage && dimensions && container.clientWidth > 0 && container.clientHeight > 0) notify(layout());
    });
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', handleResize);
  }

  return {
    sync,
    destroy() {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', handleScroll);
      if (wheelFrame !== undefined) cancelAnimationFrame(wheelFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', handleResize);
      listeners.clear();
    },
    setZoom(nextZoom: number) {
      applyZoomAtPoint(nextZoom);
    },
    zoomBy(factor: number) {
      applyZoomAtPoint(zoom * factor);
    },
    getSnapshot() {
      return snapshot(layout());
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot(layout()));
      return () => listeners.delete(listener);
    },
  };
}
