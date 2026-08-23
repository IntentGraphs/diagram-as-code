import ELK from 'elkjs/lib/elk.bundled.js';
import { createSequentialRouter, facingSides, outlineAnchor, type Point, type Rect } from '@bpm/diagram-core';
import { wrapLabel } from '@bpm/render-core';
import type { ArchitectureDiagram, ArchitectureEdge, ArchitectureNode } from './ast.js';
import type { DiagramDirection } from '@bpm/ast';

const elk = new ELK();
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const CHAR_WIDTH = FONT_SIZE * 0.58;
const MIN_WIDTH = 120;
const MAX_WIDTH = 260;
const NODE_PADDING_X = 22;
const NODE_PADDING_Y = 18;
const CONTAINER_PADDING = 32;

export interface PositionedArchitectureNode extends Rect { id: string; kind: ArchitectureNode['kind']; label: string; labelLines: string[]; children: PositionedArchitectureNode[]; parentId?: string; }
export interface PositionedArchitectureEdge { id: string; sourceId: string; targetId: string; label?: string; points: Point[]; }
export interface PositionedArchitecture { nodes: PositionedArchitectureNode[]; edges: PositionedArchitectureEdge[]; width: number; height: number; }

interface ElkArchitectureNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkArchitectureNode[];
}

interface ElkArchitectureEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface ElkArchitectureGraph extends ElkArchitectureNode {
  children: ElkArchitectureNode[];
  edges: ElkArchitectureEdge[];
}

function sizeNode(node: ArchitectureNode) {
  const labelLines = wrapLabel(node.label, MAX_WIDTH - NODE_PADDING_X, FONT_SIZE, 5);
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.max(...labelLines.map((line) => line.length * CHAR_WIDTH), 0) + NODE_PADDING_X));
  const height = Math.max(52, labelLines.length * LINE_HEIGHT + NODE_PADDING_Y);
  return { node, labelLines, width, height };
}
const ELK_DIRECTIONS: Record<DiagramDirection, 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'> = { down: 'DOWN', up: 'UP', right: 'RIGHT', left: 'LEFT' };

function elkNode(node: ArchitectureNode, direction: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT'): ElkArchitectureNode {
  const sized = sizeNode(node);
  const result: ElkArchitectureNode = { id: node.id, width: sized.width, height: sized.height };
  if (node.children.length) {
    result.layoutOptions = { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.padding': `[top=${CONTAINER_PADDING},left=${CONTAINER_PADDING},bottom=${CONTAINER_PADDING},right=${CONTAINER_PADDING}]`, 'elk.spacing.nodeNode': '36', 'elk.layered.spacing.nodeNodeBetweenLayers': '56' };
    result.children = node.children.map((child) => elkNode(child, direction));
  }
  return result;
}
function flatten(nodes: PositionedArchitectureNode[], into: PositionedArchitectureNode[] = []): PositionedArchitectureNode[] { for (const node of nodes) { into.push(node); flatten(node.children, into); } return into; }
function absoluteNode(ast: ArchitectureNode, laid: ElkArchitectureNode, ox: number, oy: number, parentId?: string): PositionedArchitectureNode {
  const x = ox + (laid.x ?? 0), y = oy + (laid.y ?? 0), sized = sizeNode(ast);
  return { id: ast.id, kind: ast.kind, label: ast.label, labelLines: sized.labelLines, x, y, width: laid.width ?? sized.width, height: laid.height ?? sized.height, parentId, children: ast.children.map((child) => absoluteNode(child, (laid.children ?? []).find((entry) => entry.id === child.id) ?? { id: child.id }, x, y, ast.id)) };
}
function allEdges(ast: ArchitectureDiagram): ArchitectureEdge[] { return ast.edges; }

export async function layoutArchitecture(ast: ArchitectureDiagram, options?: { direction?: DiagramDirection; engineOverride?: string }): Promise<PositionedArchitecture> {
  const direction = ELK_DIRECTIONS[options?.direction ?? ast.direction ?? 'right'];
  const graph: ElkArchitectureGraph = { id: 'architecture', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': direction, 'elk.edgeRouting': 'ORTHOGONAL', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.spacing.nodeNode': '48', 'elk.layered.spacing.nodeNodeBetweenLayers': '72' }, children: ast.nodes.map((node) => elkNode(node, direction)), edges: ast.edges.map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })) };
  const laid = await elk.layout(graph as never) as ElkArchitectureGraph;
  const nodes = ast.nodes.map((node) => absoluteNode(node, laid.children.find((entry) => entry.id === node.id) ?? { id: node.id }, 0, 0));
  const flat = flatten(nodes);
  const byId = new Map(flat.map((node) => [node.id, node]));
  const router = createSequentialRouter();
  const obstacles = flat.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  const edges = allEdges(ast).flatMap((edge) => {
    const source = byId.get(edge.sourceId), target = byId.get(edge.targetId);
    if (!source || !target) return [];
    const sides = facingSides(source, target);
    const start = outlineAnchor(source, sides.from, source.kind === 'database' ? 'rect' : 'rect', { x: target.x + target.width / 2, y: target.y + target.height / 2 });
    const end = outlineAnchor(target, sides.to, target.kind === 'database' ? 'rect' : 'rect', { x: source.x + source.width / 2, y: source.y + source.height / 2 });
    return [{ id: edge.id, sourceId: edge.sourceId, targetId: edge.targetId, ...(edge.label === undefined ? {} : { label: edge.label }), points: router.route(start, end, obstacles.filter((node) => node.id !== source.id && node.id !== target.id)) }];
  });
  const points = edges.flatMap((edge) => edge.points);
  const width = Math.max(1, laid.width ?? 0, ...flat.map((node) => node.x + node.width), ...points.map((point) => point.x));
  const height = Math.max(1, laid.height ?? 0, ...flat.map((node) => node.y + node.height), ...points.map((point) => point.y));
  return { nodes, edges, width, height };
}
