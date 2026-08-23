import { getRouteFallbackCount, rectsOverlap, segmentIntersectsRect, segmentsIntersect, overshootsAnchor } from '@bpm/diagram-core';
import type { DiagramFamilyId, DiagramInspection, DiagramInspectionEdge, DiagramInspectionIssue, DiagramInspectionNode, DiagramInspectionRect } from './types.js';

type RawRecord = Record<string, unknown>;
type RawPoint = { x: number; y: number };

function record(value: unknown): RawRecord | null {
  return value && typeof value === 'object' ? value as RawRecord : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function label(value: unknown): string { return typeof value === 'string' ? value : ''; }

function nodeOf(value: unknown, parentId?: string): DiagramInspectionNode | null {
  const item = record(value);
  if (!item || typeof item.id !== 'string') return null;
  if (![item.x, item.y, item.width, item.height].every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;
  return {
    id: item.id,
    kind: typeof item.kind === 'string' ? item.kind : 'node',
    label: label(item.label ?? item.name),
    x: item.x as number,
    y: item.y as number,
    width: item.width as number,
    height: item.height as number,
    ...(typeof item.parentId === 'string' ? { parentId: item.parentId } : parentId ? { parentId } : {}),
  };
}

function childrenOf(value: unknown): unknown[] {
  const item = record(value);
  return item && Array.isArray(item.children) ? item.children : [];
}

function flatten(values: unknown[], parentId?: string, into: DiagramInspectionNode[] = []): DiagramInspectionNode[] {
  for (const value of values) {
    const node = nodeOf(value, parentId);
    if (node) {
      into.push(node);
      flatten(childrenOf(value), node.id, into);
    }
  }
  return into;
}

function pointsOf(value: unknown): RawPoint[] {
  const item = record(value);
  if (!item || !Array.isArray(item.points)) return [];
  return item.points
    .filter((point): point is RawRecord => Boolean(record(point)))
    .map((point) => ({ x: number(point.x), y: number(point.y) }));
}

function edgeOf(value: unknown, index: number): DiagramInspectionEdge | null {
  const item = record(value);
  if (!item) return null;
  const sourceId = item.sourceId ?? item.source ?? item.from;
  const targetId = item.targetId ?? item.target ?? item.to;
  if (typeof sourceId !== 'string' || typeof targetId !== 'string') return null;
  return {
    id: typeof item.id === 'string' ? item.id : `e${index}`,
    sourceId,
    targetId,
    points: pointsOf(value),
    ...(typeof item.label === 'string' ? { label: item.label } : {}),
    ...(record(item.labelGeometry) && typeof record(item.labelGeometry)!.x === 'number' && typeof record(item.labelGeometry)!.y === 'number' && typeof record(item.labelGeometry)!.width === 'number' && typeof record(item.labelGeometry)!.height === 'number'
      ? { labelRect: item.labelGeometry as DiagramInspectionEdge['labelRect'] } : {}),
  };
}

function isAncestor(nodes: Map<string, DiagramInspectionNode>, ancestor: string, descendant: string): boolean {
  let current = nodes.get(descendant)?.parentId;
  while (current) {
    if (current === ancestor) return true;
    current = nodes.get(current)?.parentId;
  }
  return false;
}

function isContainer(node: DiagramInspectionNode, containers: Set<string>): boolean {
  return containers.has(node.id) || node.kind === 'container' || node.kind === 'group' || node.kind === 'pool' || node.kind === 'lane';
}

function boundsFor(nodes: DiagramInspectionNode[], edges: DiagramInspectionEdge[], width: number, height: number): { contentBounds: DiagramInspection['contentBounds']; renderBounds: DiagramInspection['renderBounds'] } {
  const xValues = [0, width, ...nodes.flatMap((node) => [node.x, node.x + node.width]), ...edges.flatMap((edge) => [ ...edge.points.map((point) => point.x), ...(edge.labelRect ? [edge.labelRect.x, edge.labelRect.x + edge.labelRect.width] : [])])];
  const yValues = [0, height, ...nodes.flatMap((node) => [node.y, node.y + node.height]), ...edges.flatMap((edge) => [ ...edge.points.map((point) => point.y), ...(edge.labelRect ? [edge.labelRect.y, edge.labelRect.y + edge.labelRect.height] : [])])];
  const minX = Math.min(...xValues), minY = Math.min(...yValues), maxX = Math.max(...xValues), maxY = Math.max(...yValues);
  const contentBounds = { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  const margin = 20;
  return { contentBounds, renderBounds: { x: minX - margin, y: minY - margin, width: contentBounds.width + margin * 2, height: contentBounds.height + margin * 2 } };
}

function extraction(family: DiagramFamilyId, positioned: RawRecord): { nodes: DiagramInspectionNode[]; edges: DiagramInspectionEdge[]; containers: DiagramInspectionNode[]; width: number; height: number } {
  let nodes: DiagramInspectionNode[] = [];
  let containers: DiagramInspectionNode[] = [];
  let rawEdges: unknown[] = [];
  if (family === 'mindmap' && positioned.root) {
    nodes = flatten([positioned.root]);
    rawEdges = Array.isArray(positioned.edges) ? positioned.edges : [];
  } else if (family === 'gantt') {
    const rows = Array.isArray(positioned.rows) ? positioned.rows : [];
    nodes = rows.flatMap((row) => { const node = nodeOf(row); return node ? [node] : []; });
    containers = nodes.filter((node) => node.kind === 'group');
    rawEdges = Array.isArray(positioned.dependencies) ? positioned.dependencies : [];
  } else {
    const rawNodes = Array.isArray(positioned.nodes) ? positioned.nodes : [];
    nodes = flatten(rawNodes);
    rawEdges = Array.isArray(positioned.edges) ? positioned.edges : [];
    if (family === 'bpmn' && Array.isArray(positioned.pools)) {
      containers = positioned.pools.flatMap((pool) => {
        const poolNode = nodeOf({ ...record(pool), kind: 'pool' });
        const lanes = record(pool) && Array.isArray(record(pool)!.lanes) ? (record(pool)!.lanes as unknown[]).flatMap((lane) => {
          const laneRecord = record(lane);
          const laneNode = nodeOf({ ...laneRecord, kind: 'lane' }, poolNode?.id);
          return laneNode ? [laneNode] : [];
        }) : [];
        return [...(poolNode ? [poolNode] : []), ...lanes];
      });
    }
  }
  const edges = rawEdges.map(edgeOf).filter((edge): edge is DiagramInspectionEdge => Boolean(edge));
  const width = number(positioned.width, Math.max(1, ...nodes.map((node) => node.x + node.width)));
  const height = number(positioned.height, Math.max(1, ...nodes.map((node) => node.y + node.height)));
  return { nodes, edges, containers, width, height };
}

export function inspectPositionedDiagram(family: DiagramFamilyId, value: unknown, routeFallbacks = getRouteFallbackCount()): DiagramInspection {
  const positioned = record(value) ?? {};
  const extracted = extraction(family, positioned);
  const nodes = extracted.nodes;
  const edges = extracted.edges;
  const containers = extracted.containers;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const containerIds = new Set([
    ...containers.map((node) => node.id),
    ...nodes.filter((node) => nodes.some((child) => child.parentId === node.id)).map((node) => node.id),
  ]);
  const nodeOverlaps: string[] = [];
  const edgeThroughNode: string[] = [];
  const edgeOvershootsOwnEndpoint: string[] = [];
  const laneOverlaps: string[] = [];
  const narrowLaneLabels: string[] = [];
  const routeDegraded: string[] = [];
  const labelOverlaps: string[] = [];
  const boundsOverflows: string[] = [];
  const containmentViolations: string[] = [];

  const inside = (rect: DiagramInspectionRect, outer: DiagramInspectionRect): boolean =>
    rect.x >= outer.x && rect.y >= outer.y && rect.x + rect.width <= outer.x + outer.width && rect.y + rect.height <= outer.y + outer.height;
  const pageBounds = { x: 0, y: 0, width: extracted.width, height: extracted.height };

  for (const node of nodes) {
    if (!inside(node, pageBounds)) boundsOverflows.push(`node "${node.label}" (${node.id}) exceeds the positioned bounds`);
    if (node.parentId) {
      const parent = nodeById.get(node.parentId) ?? containers.find((container) => container.id === node.parentId);
      if (parent && !inside(node, parent)) containmentViolations.push(`node "${node.label}" (${node.id}) exceeds container "${parent.label}" (${parent.id})`);
    }
  }
  for (const edge of edges) {
    const item = (value as RawRecord).edges;
    const raw = Array.isArray(item) ? item.find((candidate) => record(candidate)?.id === edge.id) : undefined;
    const rawRecord = record(raw);
    const status = rawRecord?.routeStatus ?? rawRecord?.status;
    if (status === 'degraded' || status === 'fallback' || rawRecord?.degraded === true || rawRecord?.routeFallback === true) routeDegraded.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) used a degraded route`);
    if (edge.labelRect) {
      if (!inside(edge.labelRect, pageBounds)) boundsOverflows.push(`label on edge ${edge.id} exceeds the positioned bounds`);
      for (const node of nodes) if (!isContainer(node, containerIds) && rectsOverlap(edge.labelRect, node)) labelOverlaps.push(`label on edge ${edge.id} overlaps node "${node.label}" (${node.id})`);
      for (const other of edges) if (other.id !== edge.id && other.labelRect && rectsOverlap(edge.labelRect, other.labelRect)) labelOverlaps.push(`labels on edges ${edge.id} and ${other.id} overlap`);
    }
  }

  const lanes = containers.filter((container) => container.kind === 'lane');
  for (let i = 0; i < lanes.length; i += 1) {
    const lane = lanes[i];
    if (lane.width < lane.label.length * 7 + 28) {
      narrowLaneLabels.push(`lane "${lane.label}" (${lane.id}) is too narrow for a readable label`);
    }
    for (let j = i + 1; j < lanes.length; j += 1) {
      const other = lanes[j];
      if (lane.parentId === other.parentId && rectsOverlap(lane, other)) {
        laneOverlaps.push(`lane "${lane.label}" (${lane.id}) overlaps lane "${other.label}" (${other.id})`);
      }
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i], b = nodes[j];
      if (isAncestor(nodeById, a.id, b.id) || isAncestor(nodeById, b.id, a.id)) continue;
      if (isContainer(a, containerIds) || isContainer(b, containerIds)) continue;
      if (rectsOverlap(a, b)) nodeOverlaps.push(`"${a.label}" (${a.id}) overlaps "${b.label}" (${b.id})`);
    }
  }

  for (const edge of edges) {
    for (const node of nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId || isContainer(node, containerIds)) continue;
      if (isAncestor(nodeById, node.id, edge.sourceId) && isAncestor(nodeById, node.id, edge.targetId)) continue;
      for (let i = 0; i < edge.points.length - 1; i += 1) {
        if (segmentIntersectsRect(edge.points[i], edge.points[i + 1], node)) {
          edgeThroughNode.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) passes through "${node.label}" (${node.id})`);
          break;
        }
      }
    }
    const source = nodeById.get(edge.sourceId), target = nodeById.get(edge.targetId);
    if (source && edge.points.length > 1 && overshootsAnchor(source, edge.points[1], edge.points[0])) edgeOvershootsOwnEndpoint.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) cuts through its own source "${source.label}" (${source.id})`);
    if (target && edge.points.length > 1 && overshootsAnchor(target, edge.points[edge.points.length - 2], edge.points[edge.points.length - 1])) edgeOvershootsOwnEndpoint.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) cuts through its own target "${target.label}" (${target.id})`);
  }

  let edgeCrossings = 0;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i], b = edges[j];
      if ([a.sourceId, a.targetId].some((id) => id === b.sourceId || id === b.targetId)) continue;
      for (let ai = 0; ai < a.points.length - 1; ai += 1) for (let bi = 0; bi < b.points.length - 1; bi += 1) if (segmentsIntersect(a.points[ai], a.points[ai + 1], b.points[bi], b.points[bi + 1])) edgeCrossings += 1;
    }
  }

  const issueDetails: DiagramInspectionIssue[] = [
    ...laneOverlaps.map((message) => {
      const ids = [...message.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
      return { code: 'lane_overlap' as const, message, ...(ids.length >= 2 ? { nodeIds: [ids[0], ids[1]] } : {}) };
    }),
    ...narrowLaneLabels.map((message) => {
      const match = message.match(/\(([^()]+)\)/);
      return { code: 'lane_label_too_narrow' as const, message, ...(match ? { nodeIds: [match[1]] } : {}) };
    }),
    ...nodeOverlaps.map((message) => {
      const ids = [...message.matchAll(/\(([^()]+)\)/g)].map((match) => match[1]);
      return { code: 'node_overlap' as const, message, ...(ids.length >= 2 ? { nodeIds: [ids[0], ids[1]] } : {}) };
    }),
    ...edgeThroughNode.map((message) => {
      const match = message.match(/^edge\s+([^\s]+)\s+\(([^>]+)->([^\)]+)\).*\(([^()]+)\)$/);
      return { code: 'edge_through_node' as const, message, ...(match ? { edgeIds: [match[1]], nodeIds: [match[2], match[3], match[4]] } : {}) };
    }),
    ...edgeOvershootsOwnEndpoint.map((message) => {
      const match = message.match(/^edge\s+([^\s]+)\s+\(([^>]+)->([^\)]+)\).*\(([^()]+)\)$/);
      return { code: 'edge_overshoot' as const, message, ...(match ? { edgeIds: [match[1]], nodeIds: [match[2], match[3], match[4]] } : {}) };
    }),
    ...(edgeCrossings > 0 ? [{ code: 'edge_crossing' as const, message: `${edgeCrossings} edge-edge crossing(s) detected` }] : []),
    ...routeDegraded.map((message) => ({ code: 'route_degraded' as const, message })),
    ...labelOverlaps.map((message) => ({ code: 'label_overlap' as const, message })),
    ...boundsOverflows.map((message) => ({ code: 'bounds_overflow' as const, message })),
    ...containmentViolations.map((message) => ({ code: 'containment_violation' as const, message })),
  ];
  const metrics = { edgeCrossings, nodeOverlaps: nodeOverlaps.length, edgeThroughNode: edgeThroughNode.length, edgeOvershootsOwnEndpoint: edgeOvershootsOwnEndpoint.length, routeFallbacks: Math.max(0, routeFallbacks), degradedRoutes: routeDegraded.length, labelOverlaps: labelOverlaps.length, boundsOverflows: boundsOverflows.length, containmentViolations: containmentViolations.length };
  return {
    nodes,
    edges,
    ...(containers.length ? { containers } : {}),
    ...boundsFor(nodes, edges, extracted.width, extracted.height),
    metrics,
    issues: { nodeOverlaps, edgeThroughNode, edgeOvershootsOwnEndpoint, routeDegraded, labelOverlaps, boundsOverflows, containmentViolations },
    issueDetails,
  };
}
