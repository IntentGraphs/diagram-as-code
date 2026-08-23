export type PageUnit = 'in' | 'mm' | 'px';
export type PageFit = 'contain' | 'strict';

/** A physical or logical output page declared by a diagram source. */
export interface PageSpec {
  width: number;
  height: number;
  unit: PageUnit;
  fit: PageFit;
}

export interface PagePoint { x: number; y: number; }
export interface PageRect { x: number; y: number; width: number; height: number; }
export interface PageGeometryEdge { points?: PagePoint[]; }

/** 24 logical px is the same safe margin used by the existing diagram renderers. */
export const DEFAULT_PAGE_MARGIN_PX = 24;
/** Below this scale, diagrams are usually technically visible but no longer readable. */
export const MIN_PAGE_SCALE = 0.25;

const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;

export function pageSizeInPixels(page: PageSpec): { width: number; height: number } {
  const multiplier = page.unit === 'in' ? PX_PER_INCH : page.unit === 'mm' ? PX_PER_INCH / MM_PER_INCH : 1;
  return { width: page.width * multiplier, height: page.height * multiplier };
}

export function pageSizeInches(page: PageSpec): { width: number; height: number } {
  const multiplier = page.unit === 'mm' ? 1 / MM_PER_INCH : page.unit === 'px' ? 1 / PX_PER_INCH : 1;
  return { width: page.width * multiplier, height: page.height * multiplier };
}

export function pageFitScale(
  sourceWidth: number,
  sourceHeight: number,
  page: PageSpec,
  marginPx = DEFAULT_PAGE_MARGIN_PX,
): number {
  const { width, height } = pageSizeInPixels(page);
  const availableWidth = Math.max(1, width - marginPx * 2);
  const availableHeight = Math.max(1, height - marginPx * 2);
  return Math.min(
    availableWidth / Math.max(1, sourceWidth),
    availableHeight / Math.max(1, sourceHeight),
  );
}

export interface FittedGeometry<N extends PageRect, E extends PageGeometryEdge> {
  nodes: N[];
  edges: E[];
  pageWidth: number;
  pageHeight: number;
  scale: number;
}

function geometryBounds<N extends PageRect, E extends PageGeometryEdge>(nodes: N[], edges: E[]): PageRect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const node of nodes) {
    xs.push(node.x, node.x + node.width);
    ys.push(node.y, node.y + node.height);
  }
  for (const edge of edges) {
    for (const point of edge.points ?? []) {
      xs.push(point.x);
      ys.push(point.y);
    }
  }
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;
  const maxY = ys.length ? Math.max(...ys) : 1;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Uniformly scales and centers positioned geometry inside the declared page. */
export function fitGeometryToPage<N extends PageRect, E extends PageGeometryEdge>(
  nodes: N[],
  edges: E[],
  page: PageSpec,
  marginPx = DEFAULT_PAGE_MARGIN_PX,
): FittedGeometry<N, E> {
  const bounds = geometryBounds(nodes, edges);
  const dimensions = pageSizeInPixels(page);
  const scale = pageFitScale(bounds.width, bounds.height, page, marginPx);
  const innerWidth = dimensions.width - marginPx * 2;
  const innerHeight = dimensions.height - marginPx * 2;
  const offsetX = marginPx + (innerWidth - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = marginPx + (innerHeight - bounds.height * scale) / 2 - bounds.y * scale;
  const point = (value: PagePoint): PagePoint => ({ x: value.x * scale + offsetX, y: value.y * scale + offsetY });
  return {
    nodes: nodes.map((node) => ({ ...node, x: node.x * scale + offsetX, y: node.y * scale + offsetY, width: node.width * scale, height: node.height * scale })),
    edges: edges.map((edge) => ({ ...edge, ...(edge.points ? { points: edge.points.map(point) } : {}) })),
    pageWidth: dimensions.width,
    pageHeight: dimensions.height,
    scale,
  };
}

function dimension(value: number, unit: PageUnit): string {
  return unit === 'px' ? String(value) : `${value}${unit}`;
}

function numericAttribute(attributes: string, name: string): number | undefined {
  const match = attributes.match(new RegExp(`\\b${name}="([^\"]+)"`));
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function viewBox(attributes: string): { x: number; y: number; width: number; height: number } | undefined {
  const match = attributes.match(/\bviewBox="([^\"]+)"/);
  if (!match) return undefined;
  const values = match[1].trim().split(/[ ,]+/).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return undefined;
  return { x: values[0], y: values[1], width: Math.max(1, values[2]), height: Math.max(1, values[3]) };
}

export interface FittedSvg {
  svg: string;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

/** Wraps an already-rendered SVG in a fixed-size page without distorting its content. */
export function fitSvgToPage(svg: string, page: PageSpec, marginPx = DEFAULT_PAGE_MARGIN_PX): FittedSvg {
  const opening = svg.match(/^<svg\b([^>]*)>/);
  const closing = svg.lastIndexOf('</svg>');
  if (!opening || closing < 0) throw new Error('Cannot fit an invalid SVG document to a page');
  const attributes = opening[1];
  const source = viewBox(attributes) ?? {
    x: 0,
    y: 0,
    width: numericAttribute(attributes, 'width') ?? 1,
    height: numericAttribute(attributes, 'height') ?? 1,
  };
  const dimensions = pageSizeInPixels(page);
  const scale = pageFitScale(source.width, source.height, page, marginPx);
  const innerWidth = dimensions.width - marginPx * 2;
  const innerHeight = dimensions.height - marginPx * 2;
  const offsetX = marginPx + (innerWidth - source.width * scale) / 2;
  const offsetY = marginPx + (innerHeight - source.height * scale) / 2;
  const cleanAttributes = attributes
    .replace(/\s+width="[^"]*"/g, '')
    .replace(/\s+height="[^"]*"/g, '')
    .replace(/\s+viewBox="[^"]*"/g, '')
    .trim();
  const inner = svg.slice(opening[0].length, closing);
  const fitted = `<svg ${cleanAttributes} width="${dimension(page.width, page.unit)}" height="${dimension(page.height, page.unit)}" viewBox="0 0 ${dimensions.width} ${dimensions.height}"><rect width="100%" height="100%" fill="white"/><g transform="translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-source.x} ${-source.y})">${inner}</g></svg>`;
  return { svg: fitted, scale, pageWidth: dimensions.width, pageHeight: dimensions.height };
}

export function parsePageDirective(value: string): PageSpec | null {
  const match = value.match(/^page:\s*(\d+(?:\.\d+)?)\s*(in|mm|px)?\s*x\s*(\d+(?:\.\d+)?)\s*(in|mm|px)?\s*$/i);
  if (!match) return null;
  const firstUnit = (match[2]?.toLowerCase() ?? 'in') as PageUnit;
  const secondUnit = (match[4]?.toLowerCase() ?? firstUnit) as PageUnit;
  if (firstUnit !== secondUnit) return null;
  const width = Number(match[1]);
  const height = Number(match[3]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height, unit: firstUnit, fit: 'contain' };
}

export function parseFitDirective(value: string): PageFit | null {
  const match = value.match(/^fit:\s*(contain|strict)\s*$/i);
  return match ? match[1].toLowerCase() as PageFit : null;
}
