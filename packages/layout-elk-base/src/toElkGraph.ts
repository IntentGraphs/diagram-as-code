import type { Diagram, DiagramEdge, DiagramNode, ShapeSizes, SizeHint } from '@bpm/ast';
import { getSpacingProfile, elkSpacingOptions } from '@bpm/layout-core';
import { measureLabel } from '@bpm/render-core';
import type { DiagramDirection } from '@bpm/ast';

const HIERARCHY_OPTIONS = { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' };

const DEFAULT_SIZE = { width: 100, height: 60 };
const EVENT_SIZE = { width: 40, height: 40 };
const GATEWAY_SIZE = { width: 50, height: 50 };
const DATA_SIZE = { width: 50, height: 60 };

export interface ElkGraphNode {
  id: string;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkGraphNode[];
  edges?: ElkGraphEdge[];
}

export interface ElkGraphEdge {
  id: string;
  sources: string[];
  targets: string[];
}

export interface ElkGraph extends ElkGraphNode {
  children: ElkGraphNode[];
  edges: ElkGraphEdge[];
}

/** Only control-flow edges should determine ELK's layered ranks and columns. */
export function isLayoutEdge(edge: DiagramEdge): boolean {
  return edge.flowType === 'sequence'
    || edge.flowType === 'conditionalSequence'
    || edge.flowType === 'defaultSequence';
}

/**
 * A short label fits the default box fine; a long one needs a wider box before the renderer's
 * text-wrapping even comes into play, or every activity with more than a couple of words would
 * wrap unnecessarily. Capped so one very long label can't blow out the whole layout — beyond
 * the cap the renderer's own wrapping (see @bpm/render/text.ts) takes over.
 */
function activitySize(label: string, visual?: DiagramNode['visual']): { width: number; height: number } {
  const fontSize = visual?.font === 'small' ? 10 : visual?.font === 'large' ? 14 : 12;
  const maxLines = visual?.wrap ?? 3;
  const width = Math.min(220, Math.max(DEFAULT_SIZE.width, label.length * fontSize * 0.58 + 24));
  const metrics = measureLabel(label, width - 12, fontSize, maxLines);
  return { width, height: Math.max(DEFAULT_SIZE.height, metrics.height + 20) };
}

function shapeSizeGroup(node: DiagramNode): keyof ShapeSizes | undefined {
  if (node.kind === 'event') return 'event';
  if (node.kind === 'gateway') return 'gateway';
  if (node.kind === 'activity') return 'task';
  if (node.kind === 'dataObject' || node.kind === 'dataStore') return 'data';
  if (node.kind === 'textAnnotation') return 'annotation';
  if (node.kind === 'group') return 'group';
  return undefined;
}

function minimumSize(node: DiagramNode): { width: number; height: number } {
  if (node.kind === 'event') return EVENT_SIZE;
  if (node.kind === 'gateway') return GATEWAY_SIZE;
  if (node.kind === 'dataObject' || node.kind === 'dataStore' || node.kind === 'textAnnotation') return DATA_SIZE;
  if (node.kind === 'group') return { width: 200, height: 150 };
  return { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height };
}

function sizeFromHint(node: DiagramNode, hint: SizeHint, minimum = minimumSize(node)): { width: number; height: number } {
  if (node.kind === 'event' || node.kind === 'gateway') {
    const d = Math.max(minimum.width, hint.width, hint.height);
    return { width: d, height: d };
  }
  return {
    width: Math.max(minimum.width, hint.width),
    height: Math.max(minimum.height, hint.height),
  };
}

export function sizeOf(node: DiagramNode, shapeSizes?: ShapeSizes): { width: number; height: number } {
  let base: { width: number; height: number };
  if (node.kind === 'event') base = EVENT_SIZE;
  else if (node.kind === 'gateway') base = GATEWAY_SIZE;
  else if (node.kind === 'dataObject' || node.kind === 'dataStore' || node.kind === 'textAnnotation') base = DATA_SIZE;
  else if (node.kind === 'group') base = { width: 200, height: 150 };
  else base = activitySize(node.label, node.visual);

  const group = shapeSizeGroup(node);
  const diagramSize = (group ? shapeSizes?.[group] : undefined) ?? shapeSizes?.all;
  // Diagram-level shape sizes are the parent contract. A node-level size is only
  // used when no matching parent size exists; mismatches are reported as warnings
  // by @bpm/validate rather than changing the rendered geometry.
  if (diagramSize) return sizeFromHint(node, diagramSize);
  return node.sizeHint ? sizeFromHint(node, node.sizeHint, base) : base;
}

function elkDirection(direction: DiagramDirection = 'right'): string {
  return direction.toUpperCase();
}

export function toElkNode(node: DiagramNode, spacingOpts?: Record<string, string>, direction: DiagramDirection = 'right', shapeSizes?: ShapeSizes): ElkGraphNode {
  if (node.kind === 'activity' && !node.collapsed && (node.activityType === 'subProcess' || node.activityType === 'transaction')) {
    const opts = spacingOpts ?? elkSpacingOptions(getSpacingProfile());
    return {
      id: node.id,
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': elkDirection(direction), 'elk.edgeRouting': 'ORTHOGONAL', ...HIERARCHY_OPTIONS, ...opts },
      children: toElkChildren(node.children, spacingOpts, direction, shapeSizes),
      edges: node.childEdges
        .filter((edge) => isLayoutEdge(edge) && !isBoundaryEventId(node.children, edge.sourceId) && !isBoundaryEventId(node.children, edge.targetId))
        .map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
    };
  }
  return { id: node.id, ...sizeOf(node, shapeSizes) };
}

export function toElkChildren(nodes: DiagramNode[], spacingOpts?: Record<string, string>, direction: DiagramDirection = 'right', shapeSizes?: ShapeSizes): ElkGraphNode[] {
  const nonBoundary = nodes.filter((n) => !(n.kind === 'event' && n.attachedToId !== undefined));
  return nonBoundary.map((n) => toElkNode(n, spacingOpts, direction, shapeSizes));
}

export function toElkGraph(diagram: Diagram): ElkGraph {
  const profile = getSpacingProfile(diagram.layoutSpacing);
  const spacingOpts = elkSpacingOptions(profile);

  const laneNodeIds = new Set(
    diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds))
  );

  const unassignedNodes = diagram.nodes.filter((n) => !laneNodeIds.has(n.id));

  const poolChildren = diagram.pools.map((pool) => ({
    id: pool.id,
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': elkDirection(diagram.direction), ...HIERARCHY_OPTIONS, ...spacingOpts },
    children: toElkChildren(
      pool.lanes.flatMap((lane) => lane.nodeIds).map((id) => diagram.nodes.find((n) => n.id === id)!),
      spacingOpts, diagram.direction, diagram.shapeSizes,
    ),
  }));

  const looseNodeChildren = toElkChildren(unassignedNodes, spacingOpts, diagram.direction, diagram.shapeSizes);

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection(diagram.direction),
      'elk.edgeRouting': 'ORTHOGONAL',
      ...HIERARCHY_OPTIONS,
      ...spacingOpts,
    },
    children: [...poolChildren, ...looseNodeChildren],
    edges: diagram.edges
      .filter((edge) => isLayoutEdge(edge) && !isBoundaryEventId(diagram.nodes, edge.sourceId) && !isBoundaryEventId(diagram.nodes, edge.targetId))
      .map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
  };
}

export function isBoundaryEventId(nodes: DiagramNode[], id: string): boolean {
  const node = nodes.find((n) => n.id === id);
  return node?.kind === 'event' && node.attachedToId !== undefined;
}
