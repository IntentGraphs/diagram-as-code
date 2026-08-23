import type { Diagram, DiagramEdge, DiagramNode } from '@bpm/ast';
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

export function sizeOf(node: DiagramNode): { width: number; height: number } {
  let base: { width: number; height: number };
  if (node.kind === 'event') base = EVENT_SIZE;
  else if (node.kind === 'gateway') base = GATEWAY_SIZE;
  else if (node.kind === 'dataObject' || node.kind === 'dataStore' || node.kind === 'textAnnotation') base = DATA_SIZE;
  else if (node.kind === 'group') base = { width: 200, height: 150 };
  else base = activitySize(node.label, node.visual);

  if (!node.sizeHint) return base;
  if (node.kind === 'event') {
    const d = Math.max(base.width, node.sizeHint.width, node.sizeHint.height);
    return { width: d, height: d };
  }
  return {
    width: Math.max(base.width, node.sizeHint.width),
    height: Math.max(base.height, node.sizeHint.height),
  };
}

function elkDirection(direction: DiagramDirection = 'right'): string {
  return direction.toUpperCase();
}

export function toElkNode(node: DiagramNode, spacingOpts?: Record<string, string>, direction: DiagramDirection = 'right'): ElkGraphNode {
  if (node.kind === 'activity' && !node.collapsed && (node.activityType === 'subProcess' || node.activityType === 'transaction')) {
    const opts = spacingOpts ?? elkSpacingOptions(getSpacingProfile());
    return {
      id: node.id,
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': elkDirection(direction), 'elk.edgeRouting': 'ORTHOGONAL', ...HIERARCHY_OPTIONS, ...opts },
      children: toElkChildren(node.children, spacingOpts, direction),
      edges: node.childEdges
        .filter((edge) => isLayoutEdge(edge) && !isBoundaryEventId(node.children, edge.sourceId) && !isBoundaryEventId(node.children, edge.targetId))
        .map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
    };
  }
  return { id: node.id, ...sizeOf(node) };
}

export function toElkChildren(nodes: DiagramNode[], spacingOpts?: Record<string, string>, direction: DiagramDirection = 'right'): ElkGraphNode[] {
  const nonBoundary = nodes.filter((n) => !(n.kind === 'event' && n.attachedToId !== undefined));
  return nonBoundary.map((n) => toElkNode(n, spacingOpts, direction));
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
      spacingOpts, diagram.direction,
    ),
  }));

  const looseNodeChildren = toElkChildren(unassignedNodes, spacingOpts, diagram.direction);

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
