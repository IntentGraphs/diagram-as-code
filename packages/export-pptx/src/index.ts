import pptxgen from 'pptxgenjs';
import { diagnosePaginatedScene, MIN_PAGE_SCALE, pageFitScale, pageSizeInches, type PageSpec, type PaginatedScene, type PaginatedScenePage } from '@bpm/diagram-core';

export type PptxFamily = 'bpmn' | 'mindmap' | 'flowchart' | 'architecture' | 'gantt';
export type PptxShape = 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'hexagon' | 'line';
export interface PptxPoint { x: number; y: number; }
export interface PositionedNode { id: string; label?: string; x: number; y: number; width: number; height: number; shape?: PptxShape; kind?: string; style?: { fill?: string; line?: string; text?: string; dash?: 'solid' | 'dash' | 'dot'; fontSizePx?: number; lineWidthPx?: number; fillTransparency?: number; labelAlign?: 'left' | 'center' | 'right'; labelValign?: 'top' | 'mid' | 'bottom' }; }
export interface PositionedEdge { id: string; source: string; target: string; label?: string; points?: PptxPoint[]; style?: { line?: string; dash?: 'solid' | 'dash' | 'dot'; width?: number; fontSizePx?: number }; }
export interface PositionedSnapshot { family: PptxFamily; title?: string; width: number; height: number; nodes: PositionedNode[]; edges: PositionedEdge[]; page?: PageSpec; metadata?: Record<string, string>; paginated?: PaginatedScene; }
export interface GanttSnapshot extends PositionedSnapshot { family: 'gantt'; tasks?: Array<{ id: string; label: string; x: number; y: number; width: number; height: number; milestone?: boolean; phase?: string; start?: string; end?: string; progress?: number }>; axisLabels?: Array<{ label: string; x: number; y: number }>; }
export interface PptxLimits { maxNodes: number; maxEdges: number; maxWidth: number; maxHeight: number; maxSlides: number; }
export interface PptxExportWarning { code: 'editable_text_density' | 'page_scale' | 'pagination_continuation' | 'pagination_fallback'; severity: 'warning'; message: string; nodeId?: string; edgeId?: string; affectedIds?: string[]; scale?: number; }
export interface PptxOptions { layout?: 'LAYOUT_STANDARD' | 'LAYOUT_WIDE'; page?: PageSpec; title?: string; deterministic?: boolean; limits?: Partial<PptxLimits>; warnings?: PptxExportWarning[]; }
export type RuntimePositionedResult = { family: PptxFamily; positioned: unknown; ast?: unknown; title?: string; page?: PageSpec; paginated?: PaginatedScene };
export interface FamilyAdapter { family: PptxFamily; map(snapshot: PositionedSnapshot, slide: PptxSlide, options?: PptxOptions): void; }
export interface PptxSlide { addShape(shape: PptxShape, options: Record<string, unknown>): void; addText(text: string, options: Record<string, unknown>): void; addConnector(options: Record<string, unknown>): void; }
export class PptxExportError extends Error { constructor(public readonly code: 'LIMIT' | 'INVALID' | 'UNSUPPORTED', message: string) { super(message); this.name = 'PptxExportError'; } }

const defaults: PptxLimits = { maxNodes: 1000, maxEdges: 2000, maxWidth: 10000, maxHeight: 10000, maxSlides: 20 };
const POINTS_PER_INCH = 72;
const MIN_NODE_FONT_SIZE = 5;
const MIN_EDGE_FONT_SIZE = 4;
const MIN_AXIS_FONT_SIZE = 5;
const MIN_TEXT_BOX_WIDTH_IN = 0.18;
const MIN_TEXT_BOX_HEIGHT_IN = 0.22;
const GANTT_MIN_PRESENTATION_FONT_SIZE = 10;
const GANTT_BASE_PRESENTATION_FONT_PX = 14;
const GANTT_LABEL_WIDTH_PX = 260;
const GANTT_PAGE_MARGIN_IN = 0.25;
const GANTT_PAGE_TOP_IN = 0.55;
const GANTT_PAGE_BOTTOM_IN = 0.3;
const GANTT_TICK_GAP_PX = 42;
const finite = (n: number, name: string) => { if (!Number.isFinite(n) || n < 0) throw new PptxExportError('INVALID', `${name} must be a finite non-negative number`); return n; };
const color = (value: string | undefined, fallback: string) => (value && /^[0-9a-f]{6}$/i.test(value) ? value : fallback);
const shapeMap: Record<PptxShape, string> = { rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse', diamond: 'diamond', hexagon: 'hexagon', line: 'line' };

/**
 * Converts a canvas-pixel font size into PowerPoint points after the canvas
 * geometry has been scaled into slide inches. Keeping this tied to the same
 * projection scale as node geometry prevents wide diagrams from retaining a
 * fixed 10pt label inside a much smaller shape.
 */
export function canvasFontSize(basePixels: number, geometryScale: number, minimumPoints = MIN_NODE_FONT_SIZE): number {
  finite(basePixels, 'base font size');
  finite(geometryScale, 'geometry scale');
  finite(minimumPoints, 'minimum font size');
  return Math.max(minimumPoints, projectedFontSize(basePixels, geometryScale));
}

function projectedFontSize(basePixels: number, geometryScale: number): number {
  return Number((basePixels * geometryScale * POINTS_PER_INCH).toFixed(2));
}

function validate(snapshot: PositionedSnapshot, limits: PptxLimits, options: PptxOptions, checkPresentationFit = true): void {
  if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) throw new PptxExportError('INVALID', 'A positioned snapshot with nodes and edges is required');
  if (!limits.maxNodes || snapshot.nodes.length > limits.maxNodes) throw new PptxExportError('LIMIT', `Node count exceeds ${limits.maxNodes}`);
  if (snapshot.edges.length > limits.maxEdges) throw new PptxExportError('LIMIT', `Edge count exceeds ${limits.maxEdges}`);
  if (finite(snapshot.width, 'width') > limits.maxWidth || finite(snapshot.height, 'height') > limits.maxHeight) throw new PptxExportError('LIMIT', 'Snapshot dimensions exceed configured bounds');
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  for (const node of snapshot.nodes) [node.x, node.y, node.width, node.height].forEach((n) => finite(n, `node ${node.id} geometry`));
  for (const edge of snapshot.edges) if (!ids.has(edge.source) || !ids.has(edge.target)) throw new PptxExportError('INVALID', `Edge ${edge.id} references a missing node`);

  const page = options.page ?? snapshot.page;
  if (checkPresentationFit && page) {
    const readabilityScale = pageFitScale(snapshot.width, snapshot.height, page);
    if (readabilityScale < MIN_PAGE_SCALE && page.fit === 'strict') {
      throw new PptxExportError('INVALID', `PPTX export blocked by fit: strict because the requested page scale ${readabilityScale.toFixed(3)} is below the readable scale threshold of ${MIN_PAGE_SCALE}`);
    }
    if (readabilityScale < MIN_PAGE_SCALE) {
      options.warnings?.push({
        code: 'page_scale',
        severity: 'warning',
        scale: Number(readabilityScale.toFixed(4)),
        affectedIds: snapshot.nodes.map((node) => node.id),
        message: `PPTX exported with fit: contain, but the requested page scale is ${readabilityScale.toFixed(3)}, below the readable scale threshold of ${MIN_PAGE_SCALE}. Review readability or split the diagram.`,
      });
    }
  }

  // Gantt timelines use family-specific pagination below. Strict fit has
  // already been enforced above; contain mode may now split the timeline into
  // readable editable slides without running one-slide text-density checks.
  if (!checkPresentationFit || snapshot.family === 'gantt') return;

  const projection = scaled(snapshot, options);
  const padding = Math.max(0.02, Math.min(0.06, 6 * projection.scale));
  for (const node of snapshot.nodes) {
    if (!node.label) continue;
    const textWidth = node.width * projection.scale - padding * 2;
    const textHeight = node.height * projection.scale - padding * 2;
    const fontSize = projectedFontSize(node.style?.fontSizePx ?? 13, projection.scale);
    if (textWidth < MIN_TEXT_BOX_WIDTH_IN || textHeight < MIN_TEXT_BOX_HEIGHT_IN || fontSize < MIN_NODE_FONT_SIZE) {
      const kind = node.kind ? ` (${node.kind})` : '';
      options.warnings?.push({
        code: 'editable_text_density',
        severity: 'warning',
        nodeId: node.id,
        message: `PPTX exported, but editable text for node "${node.id}"${kind} may be too small on one slide (projected ${fontSize.toFixed(2)}pt in a ${Math.max(0, textWidth).toFixed(2)}in × ${Math.max(0, textHeight).toFixed(2)}in text box). Review readability or split the diagram.`,
      });
    }
  }
  for (const edge of snapshot.edges) {
    if (!edge.label) continue;
    const fontSize = projectedFontSize(edge.style?.fontSizePx ?? 11, projection.scale);
    if (fontSize < MIN_EDGE_FONT_SIZE) {
      options.warnings?.push({
        code: 'editable_text_density',
        severity: 'warning',
        edgeId: edge.id,
        message: `PPTX exported, but editable text for edge label "${edge.id}" may be too small on one slide (projected ${fontSize.toFixed(2)}pt). Review readability or split the diagram.`,
      });
    }
  }
}

type Box = { id: string; label?: string; x: number; y: number; width: number; height: number; kind?: string; parentId?: string };
type EdgeLike = { id?: string; source?: string; target?: string; from?: string; to?: string; sourceId?: string; targetId?: string; label?: string; points?: PptxPoint[]; style?: { line?: string; dash?: 'solid' | 'dash' | 'dot'; width?: number } };

function asBox(value: unknown): Box | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || ![item.x, item.y, item.width, item.height].every((n) => typeof n === 'number')) return null;
  return { id: item.id, label: typeof item.label === 'string' ? item.label : undefined, x: item.x as number, y: item.y as number, width: item.width as number, height: item.height as number, kind: typeof item.kind === 'string' ? item.kind : undefined, parentId: typeof item.parentId === 'string' ? item.parentId : undefined };
}

function flattenBoxes(values: unknown[], into: Box[] = []): Box[] {
  for (const value of values) {
    const box = asBox(value);
    if (box) into.push(box);
    const children = value && typeof value === 'object' && Array.isArray((value as { children?: unknown[] }).children) ? (value as { children: unknown[] }).children : [];
    flattenBoxes(children, into);
  }
  return into;
}

function edgeOf(value: unknown, index: number): PositionedEdge | null {
  if (!value || typeof value !== 'object') return null;
  const edge = value as EdgeLike;
  const source = edge.source ?? edge.from ?? edge.sourceId;
  const target = edge.target ?? edge.to ?? edge.targetId;
  if (typeof source !== 'string' || typeof target !== 'string') return null;
  return { id: edge.id ?? `e${index}`, source, target, ...(typeof edge.label === 'string' ? { label: edge.label } : {}), ...(Array.isArray(edge.points) ? { points: edge.points } : {}), ...(edge.style ? { style: edge.style } : {}) };
}

function bounds(nodes: PositionedNode[], positioned: Record<string, unknown>): { width: number; height: number } {
  const width = typeof positioned.width === 'number' ? positioned.width : Math.max(1, ...nodes.map((node) => node.x + node.width));
  const height = typeof positioned.height === 'number' ? positioned.height : Math.max(1, ...nodes.map((node) => node.y + node.height));
  return { width, height };
}

/** Converts the existing family-specific positioned layouts without reparsing source text. */
export function snapshotFromRuntime(result: RuntimePositionedResult): PositionedSnapshot {
  if (!result || !result.positioned || typeof result.positioned !== 'object') throw new PptxExportError('INVALID', 'A positioned diagram result is required');
  const positioned = result.positioned as Record<string, unknown>;
  if (result.family === 'gantt') {
    const rows = Array.isArray(positioned.rows) ? positioned.rows : [];
    const nodes = rows.map((row, index) => {
      const box = asBox({ ...(row as object), id: (row as { id?: unknown }).id ?? `row-${index}`, kind: (row as { kind?: unknown }).kind === 'group' ? 'group' : ((row as { milestone?: unknown }).milestone ? 'milestone' : 'task') });
      if (!box) throw new PptxExportError('INVALID', `Gantt row ${index} has invalid geometry`);
      return { ...box, shape: box.kind === 'milestone' ? 'diamond' : box.kind === 'group' ? 'rect' : 'roundRect' } satisfies PositionedNode;
    });
    const edges = (Array.isArray(positioned.dependencies) ? positioned.dependencies : []).map(edgeOf).filter((edge): edge is PositionedEdge => Boolean(edge));
    const axisLabels = Array.isArray(positioned.ticks) ? positioned.ticks.map((tick) => ({ label: String((tick as { label?: unknown }).label ?? ''), x: Number((tick as { x?: unknown }).x ?? 0), y: 18 })) : [];
    const size = bounds(nodes, positioned);
    return { family: 'gantt', title: result.title, page: result.page, paginated: result.paginated, ...size, nodes, edges, tasks: rows.filter((row) => (row as { kind?: string }).kind === 'task').map((row) => row as NonNullable<GanttSnapshot['tasks']>[number]), axisLabels } as GanttSnapshot;
  }
  const runtimeNodes = result.family === 'mindmap' && positioned.root ? [positioned.root] : (Array.isArray(positioned.nodes) ? positioned.nodes : []);
  const nodes = flattenBoxes(runtimeNodes).map((node) => ({ ...node, shape: node.kind === 'gateway' || node.kind === 'decision' ? 'diamond' : node.kind === 'event' ? 'ellipse' : node.kind === 'activity' || result.family === 'mindmap' ? 'roundRect' : 'rect' } satisfies PositionedNode));
  const pools = Array.isArray(positioned.pools) ? positioned.pools.map(asBox).filter((pool): pool is Box => Boolean(pool)) : [];
  const laneNodes = Array.isArray(positioned.pools)
    ? positioned.pools.flatMap((pool) => {
      if (!pool || typeof pool !== 'object' || !Array.isArray((pool as { lanes?: unknown[] }).lanes)) return [];
      return (pool as { lanes: unknown[] }).lanes.flatMap((lane) => {
        const box = asBox(lane);
        if (!box) return [];
        const laneName = lane && typeof lane === 'object' && typeof (lane as { name?: unknown }).name === 'string' ? (lane as { name: string }).name : box.label;
        return [{ ...box, label: laneName, kind: 'lane', shape: 'rect' as const, style: { fill: 'FFFFFF', line: '999999', text: '111827', lineWidthPx: 1, fillTransparency: 100, fontSizePx: 11, labelAlign: 'left' as const, labelValign: 'top' as const } } satisfies PositionedNode];
      });
    })
    : [];
  const poolNodes = pools.map((pool) => ({ ...pool, kind: 'pool', shape: 'rect' as const, style: { fill: 'FFFFFF', line: '333333', lineWidthPx: 2, fillTransparency: 100 } } satisfies PositionedNode));
  const allNodes = [...poolNodes, ...laneNodes, ...nodes];
  const edges = (Array.isArray(positioned.edges) ? positioned.edges : []).map(edgeOf).filter((edge): edge is PositionedEdge => Boolean(edge));
  const size = bounds(allNodes, positioned);
  return { family: result.family, title: result.title, page: result.page, paginated: result.paginated, ...size, nodes: allNodes, edges };
}

function pageNode(node: { id: string; kind: string; label?: string; parentId?: string; x: number; y: number; width: number; height: number }): PositionedNode {
  const shape: PptxShape = node.kind === 'gateway' || node.kind === 'decision' ? 'diamond' : node.kind === 'event' ? 'ellipse' : node.kind === 'activity' ? 'roundRect' : 'rect';
  return { ...node, shape };
}

function snapshotFromPage(scene: PaginatedScene, page: PaginatedScenePage, family: PptxFamily, title?: string): PositionedSnapshot {
  const containers = (page.containers ?? []).map(pageNode);
  const nodes = [...containers, ...page.nodes.map(pageNode)];
  const ids = new Set(nodes.map((node) => node.id));
  // A cross-page edge is represented by the shared continuation annotation; it cannot be
  // drawn as a native connector on a slide that does not contain both endpoint shapes.
  const edges = page.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)).map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, label: edge.label, points: edge.points }));
  return { family, title: page.title ?? title, width: page.width, height: page.height, nodes, edges, page: scene.pageSpec };
}

function paginatedWarnings(scene: PaginatedScene, options: PptxOptions): void {
  const warnings = options.warnings;
  if (!warnings) return;
  for (const diagnostic of diagnosePaginatedScene(scene)) {
    if (diagnostic.severity !== 'warning') continue;
    if (diagnostic.code === 'pagination_readability') warnings.push({ code: 'page_scale', severity: 'warning', message: diagnostic.message, affectedIds: diagnostic.nodeIds });
    else if (diagnostic.code === 'pagination_cross_page_edge') warnings.push({ code: 'pagination_continuation', severity: 'warning', message: diagnostic.message, affectedIds: [...(diagnostic.nodeIds ?? []), ...(diagnostic.edgeIds ?? [])] });
  }
  for (const page of scene.pages) for (const message of page.warnings ?? []) warnings.push({ code: message.includes('pageBreak') ? 'pagination_fallback' : 'page_scale', severity: 'warning', message, affectedIds: page.nodes.map((node) => node.id) });
}

function validatePaginatedScene(scene: PaginatedScene, limits: PptxLimits, pageSpec?: PageSpec): void {
  if (!scene || typeof scene !== 'object' || !Array.isArray(scene.pages)) throw new PptxExportError('INVALID', 'A paginated scene with pages is required');
  if (!Number.isFinite(scene.sourceWidth) || scene.sourceWidth <= 0 || !Number.isFinite(scene.sourceHeight) || scene.sourceHeight <= 0) throw new PptxExportError('INVALID', 'Paginated scene source dimensions must be finite and positive');
  const diagnostics = diagnosePaginatedScene(scene);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length) throw new PptxExportError('INVALID', errors.map((diagnostic) => diagnostic.message).join('; '));
  if (scene.pages.length > limits.maxSlides) throw new PptxExportError('LIMIT', `Paginated scene requires more than ${limits.maxSlides} PowerPoint slides`);
  for (const page of scene.pages) {
    if (page.nodes.length > limits.maxNodes || page.edges.length > limits.maxEdges) throw new PptxExportError('LIMIT', `Page ${page.pageNumber} exceeds configured node or edge bounds`);
    const ids = new Set(page.nodes.map((node) => node.id));
    for (const container of page.containers ?? []) ids.add(container.id);
    for (const edge of page.edges) {
      const isContinuation = page.continuations.some((continuation) => continuation.edgeIds?.includes(edge.id));
      if ((!ids.has(edge.sourceId) || !ids.has(edge.targetId)) && !isContinuation) throw new PptxExportError('INVALID', `Page ${page.pageNumber} edge ${edge.id} references a missing node`);
      if (edge.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new PptxExportError('INVALID', `Page ${page.pageNumber} edge ${edge.id} has invalid geometry`);
    }
    if (pageSpec?.fit === 'strict') {
      const readabilityScale = page.readabilityScale ?? pageFitScale(page.width, page.height, pageSpec);
      if (readabilityScale < MIN_PAGE_SCALE) throw new PptxExportError('INVALID', `PPTX export blocked by fit: strict because page ${page.pageNumber} can only meet scale ${readabilityScale.toFixed(3)}, below the readable scale threshold of ${MIN_PAGE_SCALE}`);
    }
  }
}

function drawPageAnnotations(page: PaginatedScenePage, pageCount: number, slide: PptxSlide, options: PptxOptions, allContinuations: PaginatedScenePage['continuations'] = page.continuations): void {
  const dimensions = pageSizeInches(options.page ?? { width: page.width, height: page.height, unit: 'px', fit: 'contain' });
  const title = page.title ?? options.title;
  if (title) slide.addText(title, { x: 0.25, y: 0.08, w: Math.max(1, dimensions.width - 0.5), h: 0.22, fontFace: 'Aptos', fontSize: 12, bold: true, color: '111827', margin: 0, fit: 'shrink' });
  slide.addText(`Page ${page.pageNumber} of ${pageCount}`, { x: 0.25, y: Math.max(0.25, dimensions.height - 0.25), w: Math.max(1, dimensions.width - 0.5), h: 0.14, fontFace: 'Aptos', fontSize: 7, color: '6B7280', margin: 0, align: 'right' });
  const outgoing = allContinuations.filter((continuation) => continuation.sourcePage === page.pageNumber && continuation.targetPage !== page.pageNumber);
  const incoming = allContinuations.filter((continuation) => continuation.targetPage === page.pageNumber && continuation.sourcePage !== page.pageNumber);
  const markers = [
    ...(outgoing.length ? [`↗ continues on page ${[...new Set(outgoing.map((continuation) => continuation.targetPage))].join(', ')}`] : []),
    ...(incoming.length ? [`↙ continued from page ${[...new Set(incoming.map((continuation) => continuation.sourcePage))].join(', ')}`] : []),
  ];
  if (markers.length) slide.addText(markers.join('  '), { x: 0.25, y: Math.max(0.34, dimensions.height - 0.47), w: Math.max(1.2, dimensions.width - 0.5), h: 0.16, fontFace: 'Aptos', fontSize: 8, italic: true, color: '2563EB', margin: 0, align: 'right' });
}

export interface PptxProjection { page: { w: number; h: number }; scale: number; x: number; y: number; }

export function projectionFor(width: number, height: number, layout: PptxOptions['layout'] = 'LAYOUT_WIDE', pageSpec?: PageSpec): PptxProjection {
  finite(width, 'width');
  finite(height, 'height');
  const page = pageSpec ? pageSizeInches(pageSpec) : layout === 'LAYOUT_STANDARD' ? { width: 10, height: 7.5 } : { width: 13.333, height: 7.5 };
  const margin = 0.25;
  const scale = Math.min((page.width - margin * 2) / Math.max(width, 1), (page.height - margin * 2) / Math.max(height, 1));
  return { page: { w: page.width, h: page.height }, scale: Math.min(scale, 1), x: margin, y: margin };
}

function scaled(snapshot: PositionedSnapshot, options: PptxOptions): PptxProjection {
  return projectionFor(snapshot.width, snapshot.height, options.layout ?? 'LAYOUT_WIDE', options.page ?? snapshot.page);
}

function drawSnapshot(snapshot: PositionedSnapshot, slide: PptxSlide, options: PptxOptions): void {
  const s = scaled(snapshot, options); const byId = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const xy = (x: number, y: number) => ({ x: s.x + x * s.scale, y: s.y + y * s.scale });
  for (const node of snapshot.nodes) {
    const p = xy(node.x, node.y); const shape = node.shape && shapeMap[node.shape] ? node.shape : 'rect';
    const fillTransparency = Math.max(0, Math.min(100, node.style?.fillTransparency ?? 0));
    const lineWidthPx = node.style?.lineWidthPx ?? 1.5;
    slide.addShape(shape, { x: p.x, y: p.y, w: Math.max(node.width * s.scale, 0.03), h: Math.max(node.height * s.scale, 0.03), fill: { color: color(node.style?.fill, 'FFFFFF'), transparency: fillTransparency }, line: { color: color(node.style?.line, '334155'), width: Math.max(0.5, lineWidthPx * s.scale * POINTS_PER_INCH), dashType: node.style?.dash === 'dot' ? 'sysDot' : node.style?.dash === 'dash' ? 'dash' : 'solid' }, radius: 0.05 });
  }
  for (const edge of snapshot.edges) {
    const from = byId.get(edge.source); const to = byId.get(edge.target); if (!from || !to) continue;
    const points = edge.points?.length ? edge.points : [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }, { x: to.x + to.width / 2, y: to.y + to.height / 2 }];
    for (let i = 1; i < points.length; i++) { const a = xy(points[i - 1].x, points[i - 1].y); const b = xy(points[i].x, points[i].y); slide.addConnector({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, line: { color: color(edge.style?.line, '475569'), width: Math.max(0.5, (edge.style?.width ?? 1.5) * s.scale * POINTS_PER_INCH), dashType: edge.style?.dash === 'dot' ? 'sysDot' : edge.style?.dash === 'dash' ? 'dash' : 'solid', beginArrowType: 'none', endArrowType: 'triangle' } }); }
  }
  for (const node of snapshot.nodes) {
    if (!node.label) continue;
    const p = xy(node.x, node.y);
    const lane = node.kind === 'lane';
    const padding = lane ? Math.max(0.02, 4 * s.scale) : Math.max(0.02, Math.min(0.06, 6 * s.scale));
    const fontSize = canvasFontSize(node.style?.fontSizePx ?? 13, s.scale, MIN_NODE_FONT_SIZE);
    slide.addText(node.label, { x: p.x + padding, y: p.y + (lane ? Math.max(0.01, 2 * s.scale) : padding), w: Math.max(node.width * s.scale - padding * 2, 0.05), h: Math.max(node.height * s.scale - (lane ? padding : padding * 2), 0.05), fontFace: 'Aptos', fontSize, color: color(node.style?.text, '111827'), margin: lane ? 0 : 0.02, align: node.style?.labelAlign ?? 'center', valign: node.style?.labelValign ?? 'mid', fit: 'shrink' });
  }
  for (const edge of snapshot.edges) {
    const from = byId.get(edge.source); const to = byId.get(edge.target); if (!from || !to) continue;
    const points = edge.points?.length ? edge.points : [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }, { x: to.x + to.width / 2, y: to.y + to.height / 2 }];
    if (edge.label) {
      const p = xy(points[Math.floor(points.length / 2)].x, points[Math.floor(points.length / 2)].y);
      const fontSize = canvasFontSize(edge.style?.fontSizePx ?? 11, s.scale, MIN_EDGE_FONT_SIZE);
      const width = Math.max(0.45, Math.min(3, edge.label.length * fontSize * 0.055));
      const height = Math.max(0.18, fontSize / POINTS_PER_INCH * 1.5);
      slide.addText(edge.label, { x: p.x - width / 2, y: p.y - height / 2, w: width, h: height, fontSize, color: '334155', margin: 0.01, align: 'center', valign: 'mid', fit: 'shrink' });
    }
  }
}

function ganttAdapter(snapshot: GanttSnapshot, slide: PptxSlide, options: PptxOptions): void {
  drawSnapshot(snapshot, slide, options);
  const s = scaled(snapshot, options); for (const label of snapshot.axisLabels ?? []) { const p = { x: s.x + label.x * s.scale, y: s.y + label.y * s.scale }; const fontSize = canvasFontSize(GANTT_BASE_PRESENTATION_FONT_PX, s.scale, MIN_AXIS_FONT_SIZE); const width = Math.max(32, label.label.length * 8 + 4) * s.scale; slide.addText(label.label, { x: p.x, y: p.y, w: Math.max(0.45, width), h: Math.max(0.18, fontSize / POINTS_PER_INCH * 1.5), fontSize, color: '334155', margin: 0.01, fit: 'shrink' }); }
}

type GanttPage = { sliceStart: number; sliceEnd: number; firstRow: number; lastRow: number };

function ganttPageSize(options: PptxOptions): { w: number; h: number } {
  if (options.page) {
    const page = pageSizeInches(options.page);
    return { w: page.width, h: page.height };
  }
  return options.layout === 'LAYOUT_STANDARD' ? { w: 10, h: 7.5 } : { w: 13.333, h: 7.5 };
}

function ganttTimelineBounds(snapshot: GanttSnapshot): { labelWidth: number; start: number; end: number } {
  const taskStarts = snapshot.nodes.filter((node) => node.kind === 'task').map((node) => node.x);
  const labelWidth = taskStarts.length ? Math.max(180, Math.min(...taskStarts)) : GANTT_LABEL_WIDTH_PX;
  const rowEnds = snapshot.nodes.map((node) => node.x + node.width);
  const end = Math.max(snapshot.width - 40, ...rowEnds, labelWidth + 1);
  return { labelWidth, start: labelWidth, end: Math.max(labelWidth + 1, end) };
}

function ganttPages(snapshot: GanttSnapshot, options: PptxOptions, maxSlides: number): GanttPage[] {
  const { labelWidth, start, end } = ganttTimelineBounds(snapshot);
  const timelineWidth = end - start;
  const page = ganttPageSize(options);
  const targetScale = GANTT_MIN_PRESENTATION_FONT_SIZE / (GANTT_BASE_PRESENTATION_FONT_PX * POINTS_PER_INCH);
  const maxContentWidth = (page.w - GANTT_PAGE_MARGIN_IN * 2) / targetScale;
  const maxTimelineWidth = Math.max(240, Math.floor(maxContentWidth - labelWidth));
  const sliceWidth = Math.min(timelineWidth, maxTimelineWidth);
  const rows = [...snapshot.nodes].sort((a, b) => a.y - b.y);
  const maxRowHeight = Math.max(1, Math.floor((page.h - GANTT_PAGE_TOP_IN - GANTT_PAGE_BOTTOM_IN) / targetScale));
  const rowChunks: Array<{ firstRow: number; lastRow: number }> = [];
  let firstRow = 0;
  while (firstRow < rows.length) {
    let lastRow = firstRow;
    const firstY = rows[firstRow].y;
    while (lastRow + 1 < rows.length && rows[lastRow + 1].y + rows[lastRow + 1].height - firstY <= maxRowHeight) lastRow += 1;
    rowChunks.push({ firstRow, lastRow });
    firstRow = lastRow + 1;
  }
  if (rowChunks.length === 0) rowChunks.push({ firstRow: 0, lastRow: -1 });
  const pages: GanttPage[] = [];
  for (const chunk of rowChunks) {
    for (let offset = 0; offset < timelineWidth || (offset === 0 && timelineWidth === 0); offset += sliceWidth) {
      pages.push({ sliceStart: start + offset, sliceEnd: Math.min(end, start + offset + sliceWidth), ...chunk });
      if (pages.length > maxSlides) throw new PptxExportError('LIMIT', `Gantt requires more than ${maxSlides} readable PowerPoint slides; shorten the date range or split the source into smaller exports`);
    }
  }
  return pages;
}

function drawGanttPage(snapshot: GanttSnapshot, page: GanttPage, pageIndex: number, pageCount: number, slide: PptxSlide, options: PptxOptions): void {
  const { labelWidth } = ganttTimelineBounds(snapshot);
  const rows = [...snapshot.nodes].sort((a, b) => a.y - b.y);
  const visibleRows = page.lastRow >= page.firstRow ? rows.slice(page.firstRow, page.lastRow + 1) : [];
  const firstY = visibleRows[0]?.y ?? 0;
  const lastY = visibleRows.at(-1) ? visibleRows.at(-1)!.y + visibleRows.at(-1)!.height : firstY + 1;
  const contentWidth = labelWidth + page.sliceEnd - page.sliceStart;
  const contentHeight = Math.max(1, lastY - firstY);
  const dimensions = ganttPageSize(options);
  const scale = Math.min(
    (dimensions.w - GANTT_PAGE_MARGIN_IN * 2) / contentWidth,
    (dimensions.h - GANTT_PAGE_TOP_IN - GANTT_PAGE_BOTTOM_IN) / contentHeight,
  );
  const originX = GANTT_PAGE_MARGIN_IN;
  const originY = GANTT_PAGE_TOP_IN;
  const taskById = new Map((snapshot.tasks ?? []).map((task) => [task.id, task]));
  const pageLabel = pageCount > 1 ? ` — page ${pageIndex + 1} of ${pageCount}` : '';
  slide.addText(`${snapshot.title ?? 'Gantt timeline'}${pageLabel}`, { x: originX, y: 0.08, w: dimensions.w - originX * 2, h: 0.3, fontFace: 'Aptos', fontSize: 16, bold: true, color: '111827', margin: 0 });
  const rowY = (value: number) => originY + (value - firstY) * scale;
  const timelineX = (value: number) => originX + (labelWidth + value - page.sliceStart) * scale;
  const labelWidthIn = labelWidth * scale;
  const pageWidthIn = contentWidth * scale;
  const nodeFontSize = canvasFontSize(GANTT_BASE_PRESENTATION_FONT_PX, scale, GANTT_MIN_PRESENTATION_FONT_SIZE);
  const axisFontSize = canvasFontSize(GANTT_BASE_PRESENTATION_FONT_PX, scale, GANTT_MIN_PRESENTATION_FONT_SIZE);
  const taskLabelOptions = (node: PositionedNode, y: number) => ({ x: originX + 0.04, y, w: Math.max(0.4, labelWidthIn - 0.08), h: Math.max(0.18, node.height * scale), fontFace: 'Aptos', fontSize: nodeFontSize, color: '111827', margin: 0.01, valign: 'mid', fit: 'shrink' });
  for (const node of visibleRows) {
    const y = rowY(node.y);
    if (node.kind === 'group') {
      slide.addShape('rect', { x: originX, y, w: pageWidthIn, h: Math.max(0.18, node.height * scale), fill: { color: 'E5E7EB' }, line: { color: 'E5E7EB', width: 0.5 } });
      if (node.label) slide.addText(node.label, { ...taskLabelOptions(node, y), bold: true });
      continue;
    }
    if (node.label) slide.addText(node.label, taskLabelOptions(node, y));
    const visibleStart = Math.max(node.x, page.sliceStart);
    const visibleEnd = Math.min(node.x + node.width, page.sliceEnd);
    const task = taskById.get(node.id);
    if (node.kind === 'milestone') {
      const center = node.x + node.width / 2;
      if (center >= page.sliceStart && center <= page.sliceEnd) {
        const x = timelineX(center) - 0.08;
        slide.addShape('diamond', { x, y: y + Math.max(0, node.height * scale / 2 - 0.08), w: 0.16, h: 0.16, fill: { color: 'F59E0B' }, line: { color: '92400E', width: 1 } });
      }
      continue;
    }
    if (visibleEnd <= visibleStart) continue;
    const x = timelineX(visibleStart);
    const width = Math.max(0.04, (visibleEnd - visibleStart) * scale);
    const height = Math.max(0.12, node.height * scale);
    slide.addShape('roundRect', { x, y, w: width, h: height, rectRadius: 0.04, fill: { color: 'BFDBFE' }, line: { color: '1D4ED8', width: 1 } });
    if (task?.progress !== undefined) slide.addShape('roundRect', { x, y, w: Math.max(0.02, width * Math.max(0, Math.min(100, task.progress)) / 100), h: height, rectRadius: 0.04, fill: { color: '2563EB', transparency: 25 }, line: { color: '2563EB', transparency: 100, width: 0 } });
  }
  let previousTickX = Number.NEGATIVE_INFINITY;
  for (const tick of snapshot.axisLabels ?? []) {
    if (tick.x < page.sliceStart || tick.x > page.sliceEnd || tick.x - previousTickX < GANTT_TICK_GAP_PX) continue;
    previousTickX = tick.x;
    const x = timelineX(tick.x);
    const tickWidth = Math.max(32, tick.label.length * 8 + 4) * scale;
    slide.addText(tick.label, { x, y: rowY(firstY) - 0.25, w: Math.max(0.45, tickWidth), h: 0.2, fontFace: 'Aptos', fontSize: axisFontSize, color: '334155', margin: 0, fit: 'shrink' });
  }
  const visibleYStart = firstY;
  const visibleYEnd = lastY;
  for (const edge of snapshot.edges) {
    const points = edge.points?.length ? edge.points : [];
    if (points.length < 2) continue;
    const hasVisiblePoint = points.some((point) => point.x >= page.sliceStart && point.x <= page.sliceEnd && point.y >= visibleYStart && point.y <= visibleYEnd);
    if (!hasVisiblePoint) continue;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]; const b = points[i];
      const ax = timelineX(Math.max(page.sliceStart, Math.min(page.sliceEnd, a.x)));
      const bx = timelineX(Math.max(page.sliceStart, Math.min(page.sliceEnd, b.x)));
      const ay = rowY(Math.max(visibleYStart, Math.min(visibleYEnd, a.y)));
      const by = rowY(Math.max(visibleYStart, Math.min(visibleYEnd, b.y)));
      slide.addConnector({ x: ax, y: ay, w: bx - ax, h: by - ay, line: { color: '6B7280', width: 1, endArrowType: i === points.length - 1 ? 'triangle' : 'none' } });
    }
  }
  slide.addText(`Editable Gantt detail${pageLabel}`, { x: originX, y: dimensions.h - 0.22, w: dimensions.w - originX * 2, h: 0.12, fontFace: 'Aptos', fontSize: 7, color: '6B7280', margin: 0, align: 'right' });
}

function addGanttSlides(pptx: { addSlide: () => { background: Record<string, unknown>; addShape: (shape: string, options: Record<string, unknown>) => void; addText: (text: string, options: Record<string, unknown>) => void } }, snapshot: GanttSnapshot, options: PptxOptions, limits: PptxLimits): void {
  const pages = ganttPages(snapshot, options, limits.maxSlides);
  pages.forEach((page, index) => {
    const rawSlide = pptx.addSlide(); rawSlide.background = { color: 'FFFFFF' };
    drawGanttPage(snapshot, page, index, pages.length, {
      addShape: (shape, values) => rawSlide.addShape(shapeMap[shape], values),
      addText: (text, values) => rawSlide.addText(text, values),
      addConnector: (values) => rawSlide.addShape(shapeMap.line, values),
    }, options);
  });
}

export const familyAdapters: Record<PptxFamily, FamilyAdapter> = {
  bpmn: { family: 'bpmn', map: drawSnapshot }, mindmap: { family: 'mindmap', map: drawSnapshot }, flowchart: { family: 'flowchart', map: drawSnapshot }, architecture: { family: 'architecture', map: drawSnapshot }, gantt: { family: 'gantt', map: ganttAdapter },
};

export async function exportPptx(snapshot: PositionedSnapshot, options: PptxOptions = {}): Promise<Uint8Array> {
  const limits = { ...defaults, ...options.limits }; const paginated = snapshot.paginated && snapshot.paginated.mode !== 'none' ? snapshot.paginated : undefined;
  validate(snapshot, limits, options, !paginated);
  const page = paginated?.pageSpec ?? options.page ?? snapshot.page;
  if (paginated) { validatePaginatedScene(paginated, limits, page); paginatedWarnings(paginated, options); }
  const pptx = new pptxgen();
  if (page) {
    const dimensions = pageSizeInches(page);
    // The installed pptxgenjs runtime exposes defineLayout(), but its bundled
    // declaration does not include the method on the default constructor type.
    // Keep the narrow compatibility surface local instead of weakening the
    // type of the whole exporter.
    (pptx as unknown as { defineLayout(layout: { name: string; width: number; height: number }): void }).defineLayout({ name: 'BPM_CUSTOM_PAGE', width: dimensions.width, height: dimensions.height });
    pptx.layout = 'BPM_CUSTOM_PAGE';
  } else {
    pptx.layout = options.layout ?? 'LAYOUT_WIDE';
  }
  pptx.author = 'BPM'; pptx.subject = `Editable ${snapshot.family} diagram`; pptx.title = options.title ?? snapshot.title ?? `${snapshot.family} diagram`; pptx.company = 'BPM'; pptx.lang = 'en-US';
  if (paginated) {
    paginated.pages.forEach((paginatedPage) => {
      const pageSnapshot = snapshotFromPage(paginated, paginatedPage, snapshot.family, snapshot.title);
      const pageOptions = { ...options, ...(paginated.pageSpec ? { page: paginated.pageSpec } : {}) };
      validate(pageSnapshot, limits, pageOptions);
      const slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' };
      const adapter = familyAdapters[pageSnapshot.family];
      adapter.map(pageSnapshot, { addShape: (shape, o) => slide.addShape(shapeMap[shape], o as never), addText: (text, o) => slide.addText(text, o as never), addConnector: (o) => slide.addShape(shapeMap.line, o as never) }, pageOptions);
      drawPageAnnotations(paginatedPage, paginated.pages.length, { addShape: (shape, o) => slide.addShape(shapeMap[shape], o as never), addText: (text, o) => slide.addText(text, o as never), addConnector: (o) => slide.addShape(shapeMap.line, o as never) }, pageOptions, paginated.pages.flatMap((candidate) => candidate.continuations));
    });
  } else if (snapshot.family === 'gantt') addGanttSlides(pptx, snapshot as GanttSnapshot, options, limits);
  else {
    const slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' }; const adapter = familyAdapters[snapshot.family]; adapter.map(snapshot, { addShape: (shape, o) => slide.addShape(shapeMap[shape], o as never), addText: (text, o) => slide.addText(text, o as never), addConnector: (o) => slide.addShape(shapeMap.line, o as never) }, options);
  }
  const bytes = await pptx.write({ outputType: 'uint8array', compression: options.deterministic === false ? true : false }) as Uint8Array; return bytes;
}
