import type { Side } from '@bpm/ast';
import type { PositionedNode, RoutedEdge } from '@bpm/layout-core';

const MIN_PORT_GAP = 12;

export type PortRole = 'incoming' | 'outgoing';
export type PortFlowRole = 'sequence' | 'message';

export interface AssignedPort {
  side: Side;
  offset: number;
  role: PortRole;
  flowRole: PortFlowRole;
}

export interface AssignedEdgePorts {
  source: AssignedPort;
  target: AssignedPort;
}

interface EndpointDemand {
  key: string;
  edgeId: string;
  nodeId: string;
  role: PortRole;
  flowRole: PortFlowRole;
  candidates: Side[];
  explicit: boolean;
  order: number;
}

function endpointKey(edgeId: string, endpoint: 'source' | 'target'): string {
  return `${edgeId}:${endpoint}`;
}

function center(node: PositionedNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function gatewaySides(source: PositionedNode, target: PositionedNode, endpoint: 'source' | 'target'): Side[] {
  const a = center(source);
  const b = center(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vertical = Math.abs(dy) >= Math.max(source.height, target.height) / 2;

  if (endpoint === 'source') {
    if (vertical) return dy >= 0 ? ['bottom', 'right', 'top', 'left'] : ['top', 'right', 'bottom', 'left'];
    return dx >= 0 ? ['right', 'top', 'bottom', 'left'] : ['left', 'top', 'bottom', 'right'];
  }

  if (vertical) return dy >= 0 ? ['top', 'left', 'right', 'bottom'] : ['bottom', 'left', 'right', 'top'];
  return dx >= 0 ? ['left', 'top', 'bottom', 'right'] : ['right', 'top', 'bottom', 'left'];
}

/**
 * Directional side preference for a readable left-to-right process. The source
 * keeps the right side as its first choice, including for upward feedback; the
 * destination keeps the side facing the source as its first choice. Orthogonal
 * sides are only fallbacks when a side has no role-safe capacity.
 */
function preferredSides(source: PositionedNode, target: PositionedNode, endpoint: 'source' | 'target'): Side[] {
  if ((endpoint === 'source' && source.kind === 'gateway') || (endpoint === 'target' && target.kind === 'gateway')) {
    return gatewaySides(source, target, endpoint);
  }
  const a = center(source);
  const b = center(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const goingUp = dy < 0;
  const goingDown = dy > 0;
  if (endpoint === 'source') {
    return goingUp
      ? ['right', 'top', 'bottom', 'left']
      : goingDown
        ? ['right', 'bottom', 'top', 'left']
        : ['right', 'top', 'bottom', 'left'];
  }
  if (dx >= 0) {
    return goingUp
      ? ['left', 'bottom', 'top', 'right']
      : goingDown
        ? ['left', 'top', 'bottom', 'right']
        : ['left', 'top', 'bottom', 'right'];
  }
  return goingUp
    ? ['right', 'bottom', 'top', 'left']
    : goingDown
      ? ['right', 'top', 'bottom', 'left']
      : ['right', 'top', 'bottom', 'left'];
}

function sideLength(node: PositionedNode, side: Side): number {
  return side === 'left' || side === 'right' ? node.height : node.width;
}

function groupKey(nodeId: string, side: Side, role: PortRole): string {
  return `${nodeId}:${side}:${role}`;
}

function sideRoleKey(nodeId: string, side: Side): string {
  return `${nodeId}:${side}`;
}

function flowRole(flowType: RoutedEdge['flowType']): PortFlowRole {
  return flowType === 'message' ? 'message' : 'sequence';
}

/**
 * Assign a side before routing. Incoming and outgoing roles own separate port
 * groups; same-role fan-in/fan-out can share a side and receive stable slots,
 * while opposite roles cannot silently reuse the same physical slot.
 */
export function assignPorts(
  edges: RoutedEdge[],
  nodes: Map<string, PositionedNode>,
): Map<string, AssignedEdgePorts> {
  const demands: EndpointDemand[] = [];
  for (const [order, edge] of edges.entries()) {
    const source = nodes.get(edge.sourceId);
    const target = nodes.get(edge.targetId);
    if (!source || !target) continue;
    demands.push({
      key: endpointKey(edge.id, 'source'),
      edgeId: edge.id,
      nodeId: edge.sourceId,
      role: 'outgoing',
      flowRole: flowRole(edge.flowType),
      candidates: edge.from ? [edge.from] : preferredSides(source, target, 'source'),
      explicit: edge.from !== undefined,
      order,
    });
    demands.push({
      key: endpointKey(edge.id, 'target'),
      edgeId: edge.id,
      nodeId: edge.targetId,
      role: 'incoming',
      flowRole: flowRole(edge.flowType),
      candidates: edge.to ? [edge.to] : preferredSides(source, target, 'target'),
      explicit: edge.to !== undefined,
      order,
    });
  }

  // The source endpoint is considered before the target endpoint for the same
  // edge, then DSL/positioned edge order breaks all remaining ties.
  const roleOrder = (role: PortRole): number => (role === 'outgoing' ? 0 : 1);
  demands.sort(
    (a, b) =>
      a.order - b.order ||
      roleOrder(a.role) - roleOrder(b.role) ||
      a.key.localeCompare(b.key),
  );
  const chosen = new Map<string, AssignedPort>();
  const roleCounts = new Map<string, number>();
  const sideRoles = new Map<string, Set<PortRole>>();

  const hasCapacity = (demand: EndpointDemand, side: Side): boolean => {
    const node = nodes.get(demand.nodeId);
    if (!node) return false;
    const length = sideLength(node, side);
    const sameRoleCount = roleCounts.get(groupKey(demand.nodeId, side, demand.role)) ?? 0;
    const roles = sideRoles.get(sideRoleKey(demand.nodeId, side));
    const hasOtherRole = Boolean(roles && [...roles].some((role) => role !== demand.role));
    const availableBand = hasOtherRole ? length / 2 : length;
    return (sameRoleCount + 1) * MIN_PORT_GAP <= availableBand + 0.001;
  };

  for (const demand of demands) {
    const side = demand.explicit
      ? demand.candidates[0]
      : demand.candidates.find((candidate) => hasCapacity(demand, candidate)) ?? demand.candidates[demand.candidates.length - 1];
    if (!side) continue;
    chosen.set(demand.key, { side, offset: 0, role: demand.role, flowRole: demand.flowRole });
    const roleKey = groupKey(demand.nodeId, side, demand.role);
    roleCounts.set(roleKey, (roleCounts.get(roleKey) ?? 0) + 1);
    const sideKey = sideRoleKey(demand.nodeId, side);
    const roles = sideRoles.get(sideKey) ?? new Set<PortRole>();
    roles.add(demand.role);
    sideRoles.set(sideKey, roles);
  }

  const grouped = new Map<string, EndpointDemand[]>();
  for (const demand of demands) {
    const assigned = chosen.get(demand.key);
    if (!assigned) continue;
    const key = groupKey(demand.nodeId, assigned.side, demand.role);
    const group = grouped.get(key) ?? [];
    group.push(demand);
    grouped.set(key, group);
  }

  for (const [key, group] of grouped) {
    const [nodeId, side, role] = key.split(':') as [string, Side, PortRole];
    const node = nodes.get(nodeId);
    if (!node) continue;
    const length = sideLength(node, side);
    const otherRole: PortRole = role === 'incoming' ? 'outgoing' : 'incoming';
    const hasOtherRole = (sideRoles.get(sideRoleKey(nodeId, side))?.has(otherRole)) ?? false;
    const bandStart = hasOtherRole
      ? role === 'incoming' ? -length / 2 : MIN_PORT_GAP / 2
      : -length / 2;
    const bandEnd = hasOtherRole
      ? role === 'incoming' ? -MIN_PORT_GAP / 2 : length / 2
      : length / 2;
    // Keep message-flow reservations stable ahead of ordinary sequence flows.
    // This prevents a later message fan-in from being assigned a visually
    // ambiguous slot merely because an unrelated sequence edge was declared
    // first. The edge id is the final tie-breaker so reservations do not
    // depend on the incidental input order.
    group.sort(
      (a, b) =>
        (a.flowRole === 'message' ? 0 : 1) - (b.flowRole === 'message' ? 0 : 1) ||
        a.key.localeCompare(b.key),
    );
    const spacing = group.length === 1
      ? 0
      : Math.min(MIN_PORT_GAP, (bandEnd - bandStart) / group.length);
    const midpoint = (bandStart + bandEnd) / 2;
    group.forEach((demand, index) => {
      const assigned = chosen.get(demand.key);
      if (!assigned) return;
      assigned.offset = group.length === 1
        ? midpoint
        : (index - (group.length - 1) / 2) * spacing + (hasOtherRole ? midpoint : 0);
    });
  }

  const result = new Map<string, AssignedEdgePorts>();
  for (const edge of edges) {
    const source = chosen.get(endpointKey(edge.id, 'source'));
    const target = chosen.get(endpointKey(edge.id, 'target'));
    if (source && target) result.set(edge.id, { source, target });
  }
  return result;
}
