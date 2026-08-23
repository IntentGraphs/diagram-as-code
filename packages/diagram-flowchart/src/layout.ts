import ELK from 'elkjs/lib/elk.bundled.js';
import { createSequentialRouter, facingSides, outlineAnchor, type Point, type Rect } from '@bpm/diagram-core';
import { wrapLabel } from '@bpm/render-core';
import type { FlowchartDiagram, FlowchartNode } from './ast.js';
import type { DiagramDirection } from '@bpm/ast';

const MIN_WIDTH = 100;
const MAX_LABEL_WIDTH = 220;
const PADDING_X = 18;
const PADDING_Y = 14;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.58;
const DIAMOND_MARGIN = 28;
const elk = new ELK();

export interface PositionedFlowchartNode extends Rect { id: string; kind: FlowchartNode['kind']; label: string; labelLines: string[]; }
export interface PositionedFlowchartEdge { id: string; kind: string; from: string; to: string; label?: string; points: Point[]; labelPosition?: Point; }
export interface PositionedFlowchart { nodes: PositionedFlowchartNode[]; edges: PositionedFlowchartEdge[]; width: number; height: number; }

interface SizedNode { node: FlowchartNode; labelLines: string[]; width: number; height: number; }

const ELK_DIRECTIONS: Record<DiagramDirection, 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'> = {
  down: 'DOWN',
  up: 'UP',
  right: 'RIGHT',
  left: 'LEFT',
};

function sizeNode(node: FlowchartNode): SizedNode {
  const labelLines = wrapLabel(node.label, MAX_LABEL_WIDTH - PADDING_X, FONT_SIZE);
  const textWidth = Math.max(...labelLines.map((line) => line.length * CHAR_WIDTH), 0);
  const boxWidth = Math.max(MIN_WIDTH, Math.min(MAX_LABEL_WIDTH, textWidth + PADDING_X));
  const boxHeight = Math.max(44, labelLines.length * LINE_HEIGHT + PADDING_Y);
  return node.kind === 'decision'
    ? { node, labelLines, width: Math.max(MIN_WIDTH, boxWidth + DIAMOND_MARGIN), height: Math.max(72, boxHeight + DIAMOND_MARGIN) }
    : { node, labelLines, width: boxWidth, height: boxHeight };
}

export async function layoutFlowchart(ast: FlowchartDiagram, options?: { direction?: DiagramDirection }): Promise<PositionedFlowchart> {
  const sized = ast.nodes.map(sizeNode);
  const direction = options?.direction ?? ast.direction ?? 'down';
  const graph = {
    id: 'flowchart',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': ELK_DIRECTIONS[direction], 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': '40', 'elk.layered.spacing.nodeNodeBetweenLayers': '60' },
    children: sized.map(({ node, width, height }) => ({ id: node.id, width, height })),
    edges: ast.edges.map((edge, index) => ({ id: `e${index}`, sources: [edge.from], targets: [edge.to] })),
  };
  // ELK's layered algorithm handles directed cycles by reversing edges for ranking internally.
  // That keeps legitimate retry loops finite without changing the source AST.
  const laidOut = await elk.layout(graph as never) as { children?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }> };
  const byId = new Map(sized.map((entry) => [entry.node.id, entry]));
  const nodes = (laidOut.children ?? []).map((child) => {
    const entry = byId.get(child.id)!;
    return { id: child.id, kind: entry.node.kind, label: entry.node.label, labelLines: entry.labelLines, x: Math.round(child.x ?? 0), y: Math.round(child.y ?? 0), width: entry.width, height: entry.height };
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const obstacles = nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const router = createSequentialRouter();
  const edges = ast.edges.map((edge, index) => {
    const source = nodeMap.get(edge.from)!;
    const target = nodeMap.get(edge.to)!;
    const sides = facingSides(source, target);
    const start = outlineAnchor(source, sides.from, source.kind === 'decision' ? 'diamond' : 'rect', { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    const end = outlineAnchor(target, sides.to, target.kind === 'decision' ? 'diamond' : 'rect', { x: source.x + source.width / 2, y: source.y + source.height / 2 });
    const points = router.route(start, end, obstacles.filter((node) => node.id !== edge.from && node.id !== edge.to));
    const segments = points.slice(1).map((point, i) => ({ a: points[i], b: point, length: Math.abs(point.x - points[i].x) + Math.abs(point.y - points[i].y) }));
    const best = segments.filter((segment) => segment.length > 0).sort((a, b) => b.length - a.length)[0];
    const labelPosition = best ? { x: (best.a.x + best.b.x) / 2, y: best.a.y === best.b.y ? best.a.y - 8 : (best.a.y + best.b.y) / 2 } : undefined;
    return { id: `e${index}`, kind: edge.kind, from: edge.from, to: edge.to, ...(edge.label === undefined ? {} : { label: edge.label }), points, ...(labelPosition ? { labelPosition } : {}) };
  });
  // Declared bounds must cover routed edge geometry, not just node boxes — orthogonal
  // routing can bulge slightly past the rightmost/bottommost node while clearing an
  // obstacle, and a bounding box derived from nodes alone can then clip that segment.
  const edgePoints = edges.flatMap((edge) => edge.points);
  const width = Math.max(1, ...nodes.map((node) => node.x + node.width), ...edgePoints.map((point) => point.x));
  const height = Math.max(1, ...nodes.map((node) => node.y + node.height), ...edgePoints.map((point) => point.y));
  return { nodes, edges, width, height };
}
