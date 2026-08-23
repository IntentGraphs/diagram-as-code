const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_BASE = 1.0015;

interface ViewportMetrics {
  contentWidth: number;
  contentHeight: number;
  stageWidth: number;
  stageHeight: number;
  svgWidth: number;
  svgHeight: number;
  paddingLeft: number;
  paddingTop: number;
}

export interface SvgViewport {
  sync(): void;
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

  function findSvg(): SVGSVGElement | null {
    const first = container.firstElementChild;
    if (first?.localName === 'svg') return first as SVGSVGElement;
    if (first?.classList.contains('svg-viewport-stage')) {
      return first.querySelector(':scope > svg') as SVGSVGElement | null;
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
    };
  }

  function sync(): void {
    if (!ensureStage()) return;
    zoom = 1;
    // Hidden views have no usable dimensions yet; the observer will lay them out once visible.
    if (container.clientWidth > 0 && container.clientHeight > 0) layout();
  }

  function handleWheel(event: WheelEvent): void {
    if (!svg || !stage || !dimensions || (!event.ctrlKey && !event.metaKey)) return;

    const deltaY = wheelPixels(event, container);
    if (deltaY === 0) return;

    const before = layout();
    if (!before) return;

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const localX = event.clientX - rect.left - before.paddingLeft;
    const localY = event.clientY - rect.top - before.paddingTop;
    const contentX = container.scrollLeft + localX;
    const contentY = container.scrollTop + localY;
    const beforeOffsetX = (before.stageWidth - before.svgWidth) / 2;
    const beforeOffsetY = (before.stageHeight - before.svgHeight) / 2;
    const svgX = (contentX - beforeOffsetX) / before.svgWidth;
    const svgY = (contentY - beforeOffsetY) / before.svgHeight;

    zoom = clamp(zoom * Math.pow(ZOOM_BASE, -deltaY), MIN_ZOOM, MAX_ZOOM);
    const after = layout();
    if (!after) return;

    const afterOffsetX = (after.stageWidth - after.svgWidth) / 2;
    const afterOffsetY = (after.stageHeight - after.svgHeight) / 2;
    container.scrollLeft = Math.max(0, afterOffsetX + svgX * after.svgWidth - localX);
    container.scrollTop = Math.max(0, afterOffsetY + svgY * after.svgHeight - localY);
  }

  container.addEventListener('wheel', handleWheel, { passive: false });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (svg && stage && dimensions && container.clientWidth > 0 && container.clientHeight > 0) layout();
    });
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', layout);
  }

  return {
    sync,
    destroy() {
      container.removeEventListener('wheel', handleWheel);
      resizeObserver?.disconnect();
      if (!resizeObserver) window.removeEventListener('resize', layout);
    },
  };
}
