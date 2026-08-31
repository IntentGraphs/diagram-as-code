import ELK from 'elkjs/lib/elk.bundled.js';
import { createSequentialRouter, facingSides, outlineAnchor, type Point, type Rect } from '@bpm/diagram-core';
import { wrapLabel } from '@bpm/render-core';
import type { DiagramDirection } from '@bpm/ast';
import type { DfdDiagram, DfdNode } from './ast.js';

const MIN_WIDTH = 120;
const MAX_WIDTH = 260;
const PADDING_X = 22;
const PADDING_Y = 18;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.58;
const elk = new ELK();
export interface PositionedDfdNode extends Rect { id: string; kind: DfdNode['kind']; label: string; labelLines: string[]; }
export interface PositionedDfdEdge { id: string; sourceId: string; targetId: string; label?: string; points: Point[]; }
export interface PositionedDfd { nodes: PositionedDfdNode[]; edges: PositionedDfdEdge[]; width: number; height: number; }
const directions: Record<DiagramDirection, 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'> = { down: 'DOWN', up: 'UP', right: 'RIGHT', left: 'LEFT' };
function size(node: DfdNode) { const labelLines = wrapLabel(node.label, MAX_WIDTH - PADDING_X, FONT_SIZE, 5); const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(...labelLines.map((line) => line.length * CHAR_WIDTH), 0) + PADDING_X)); const height = Math.max(56, labelLines.length * LINE_HEIGHT + PADDING_Y); return { node, labelLines, width, height }; }
export async function layoutDfd(ast: DfdDiagram, options?: { direction?: DiagramDirection }): Promise<PositionedDfd> {
  const sized = ast.nodes.map(size);
  const direction = options?.direction ?? ast.direction ?? 'right';
  const graph = { id: 'dfd', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': directions[direction], 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': '48', 'elk.layered.spacing.nodeNodeBetweenLayers': '72' }, children: sized.map(({ node, width, height }) => ({ id: node.id, width, height })), edges: ast.edges.map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })) };
  const laid = await elk.layout(graph as never) as { children?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }>; width?: number; height?: number };
  const byId = new Map(sized.map((entry) => [entry.node.id, entry]));
  const nodes = (laid.children ?? []).map((child) => { const entry = byId.get(child.id)!; return { id: child.id, kind: entry.node.kind, label: entry.node.label, labelLines: entry.labelLines, x: Math.round(child.x ?? 0), y: Math.round(child.y ?? 0), width: entry.width, height: entry.height }; });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const obstacles = nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const router = createSequentialRouter();
  const edges = ast.edges.flatMap((edge) => { const source = nodeMap.get(edge.sourceId), target = nodeMap.get(edge.targetId); if (!source || !target) return []; const sides = facingSides(source, target); const start = outlineAnchor(source, sides.from, 'rect', { x: target.x + target.width / 2, y: target.y + target.height / 2 }); const end = outlineAnchor(target, sides.to, 'rect', { x: source.x + source.width / 2, y: source.y + source.height / 2 }); return [{ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, label: edge.label, points: router.route(start, end, obstacles.filter((node) => node.id !== source.id && node.id !== target.id)) }]; });
  const points = edges.flatMap((edge) => edge.points);
  return { nodes, edges, width: Math.max(1, laid.width ?? 0, ...nodes.map((node) => node.x + node.width), ...points.map((point) => point.x)), height: Math.max(1, laid.height ?? 0, ...nodes.map((node) => node.y + node.height), ...points.map((point) => point.y)) };
}
