import { parse } from '@bpm/parser';
import { layout, type LayoutOptions } from '@bpm/layout';
import { getRouteFallbackCount, inspectLayout, resetRouteFallbackCount, type LayoutInspection } from '@bpm/layout-core';
import { isActivity, isEvent, isGateway, type Diagram, type DiagramNode, type DiagramEdge } from '@bpm/ast';

export interface ValidationIssue {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  code?: string;
  nodeIds?: string[];
  edgeIds?: string[];
  suggestion?: string;
}

export type LayoutQualityGrade = 'A' | 'B' | 'C' | 'D' | 'invalid';

export interface LayoutQuality {
  grade: LayoutQualityGrade;
  /** A deterministic 0–100 presentation score; semantic validity is reported separately. */
  score: number;
  presentationReady: boolean;
  reasons: string[];
}

export interface ValidationMetrics {
  edgeCrossings: number;
  nodeOverlaps: number;
  edgeThroughNode: number;
  edgeOvershootsOwnEndpoint: number;
  routeFallbacks: number;
  quality: LayoutQuality;
}

export interface ValidationResult {
  valid: boolean;
  /** Syntactic parse errors and layout-time blocking failures. */
  errors: ValidationIssue[];
  /** BPMN 2.0 structural legality violations from the parser rule table. */
  semanticErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  metrics?: ValidationMetrics;
  /** Absolute layout and resolved-route data for AI/CLI consumers. Present only after layout succeeds. */
  inspection?: LayoutInspection;
}

/** Soft limits for safe local / future hosted use (see SECURITY.md). */
export const MAX_SOURCE_CHARS = 100_000;
export const MAX_NODES = 500;
export const MAX_EDGES = 1000;
/**
 * Soft layout-cost budget. Diagrams above this value are still eligible for an explicit
 * manual render, but should not be repeatedly rendered while typing.
 */
export const MAX_LAYOUT_COMPLEXITY = 10_000;
/** Hard admission ceiling for the current synchronous layout path. */
export const MAX_LAYOUT_HARD_COMPLEXITY = 25_000;
/** Below this value a layout is considered ordinary; above it the UI should warn. */
export const LAYOUT_COMPLEXITY_WARNING = 5_000;

export type LayoutComplexityLevel = 'allow' | 'warn' | 'manual' | 'block';

export interface LayoutComplexityAssessment {
  /** Legacy node × edge units, retained for compatibility and diagnostics. */
  nodeEdgeUnits: number;
  /** Deterministic routing-aware admission estimate. */
  estimatedWork: number;
  nodeCount: number;
  edgeCount: number;
  crossPoolEdgeCount: number;
  gatewayFanOutCount: number;
  feedbackEdgeCount: number;
  labelledEdgeCount: number;
  level: LayoutComplexityLevel;
}

export function classifyLayoutComplexity(estimatedWork: number): LayoutComplexityLevel {
  if (estimatedWork > MAX_LAYOUT_HARD_COMPLEXITY) return 'block';
  if (estimatedWork > MAX_LAYOUT_COMPLEXITY) return 'manual';
  if (estimatedWork > LAYOUT_COMPLEXITY_WARNING) return 'warn';
  return 'allow';
}

function enrichLayoutIssue(message: string): Pick<ValidationIssue, 'code' | 'nodeIds' | 'suggestion'> {
  const overlap = message.match(/Nodes\s+"([^"]+)"\s+and\s+"([^"]+)"\s+overlap/i);
  const shift = message.match(/(shift\s+"[^"]+"\s+(?:right|left|up|down)\s+by\s+\d+(?:\.\d+)?[^.]*)/i);
  return {
    ...(overlap ? { code: 'node_overlap', nodeIds: [overlap[1], overlap[2]] } : {}),
    ...(shift ? { suggestion: shift[1] } : {}),
  };
}

function countNodes(nodes: DiagramNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1;
    if (node.kind === 'activity' && node.children.length > 0) {
      total += countNodes(node.children);
    }
  }
  return total;
}

function countEdges(edges: DiagramEdge[], nodes: DiagramNode[]): number {
  let total = edges.length;
  for (const node of nodes) {
    if (node.kind === 'activity') {
      total += countEdges(node.childEdges, node.children);
    }
  }
  return total;
}

function poolMembership(diagram: Diagram): Map<string, string> {
  const membership = new Map<string, string>();
  for (const pool of diagram.pools) {
    for (const lane of pool.lanes) {
      for (const nodeId of lane.nodeIds) membership.set(nodeId, pool.id);
    }
  }
  return membership;
}

/**
 * Estimates admission cost without laying out the diagram. The legacy product is kept as
 * the baseline, while topology that increases route interaction receives bounded additions.
 * This is an admission signal, not a promise about elapsed time; runtime limits remain the
 * final safety net.
 */
export function assessLayoutComplexity(diagram: Diagram): LayoutComplexityAssessment {
  const nodes = collectNodes(diagram.nodes);
  const edges = collectEdges(diagram.edges, diagram.nodes);
  const nodeCount = countNodes(diagram.nodes);
  const edgeCount = countEdges(diagram.edges, diagram.nodes);
  const nodeEdgeUnits = nodeCount * Math.max(1, edgeCount);
  const poolByNode = poolMembership(diagram);
  const crossPoolEdgeCount = edges.filter((edge) => {
    const sourcePool = poolByNode.get(edge.sourceId);
    const targetPool = poolByNode.get(edge.targetId);
    return sourcePool !== undefined && targetPool !== undefined && sourcePool !== targetPool;
  }).length;
  const outgoing = new Map<string, number>();
  for (const edge of edges) outgoing.set(edge.sourceId, (outgoing.get(edge.sourceId) ?? 0) + 1);
  const gatewayIds = new Set(nodes.filter((node) => node.kind === 'gateway').map((node) => node.id));
  const gatewayFanOutCount = [...gatewayIds].reduce((total, id) => Math.max(0, (outgoing.get(id) ?? 0) - 1) + total, 0);
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const feedbackEdgeCount = edges.filter((edge) => {
    const source = nodeOrder.get(edge.sourceId);
    const target = nodeOrder.get(edge.targetId);
    return source !== undefined && target !== undefined && source > target && edge.flowType !== 'association';
  }).length;
  const labelledEdgeCount = edges.filter((edge) => Boolean(edge.label?.trim())).length;
  const estimatedWork = nodeEdgeUnits
    + crossPoolEdgeCount * 25
    + gatewayFanOutCount * 50
    + feedbackEdgeCount * 20
    + labelledEdgeCount * 2;
  return {
    nodeEdgeUnits,
    estimatedWork,
    nodeCount,
    edgeCount,
    crossPoolEdgeCount,
    gatewayFanOutCount,
    feedbackEdgeCount,
    labelledEdgeCount,
    level: classifyLayoutComplexity(estimatedWork),
  };
}

export function layoutComplexityWarning(diagram: Diagram): ValidationIssue | undefined {
  const assessment = assessLayoutComplexity(diagram);
  if (assessment.level === 'allow' || assessment.level === 'block') return undefined;
  const mode = assessment.level === 'manual' ? 'manual rendering' : 'live rendering';
  return {
    message: `Diagram has an estimated layout cost of ${assessment.estimatedWork} (baseline ${assessment.nodeEdgeUnits} node-edge units); prefer ${mode} because it contains ${assessment.crossPoolEdgeCount} cross-pool edge(s) and ${assessment.gatewayFanOutCount} gateway fan-out unit(s)`,
    severity: 'warning',
    code: 'layout_complexity_warning',
    suggestion: assessment.level === 'manual' ? 'Use the explicit Render action; split the diagram only if layout exceeds the runtime budget.' : 'Avoid repeated live renders while editing this diagram.',
  };
}

/**
 * Checks the resource limits that must be enforced before layout. Runtime adapters use this
 * lightweight parse-time helper so callers cannot reach an expensive layout with an oversized
 * BPMN graph. The full validate() path reuses the same rules to keep CLI and web diagnostics
 * aligned.
 */
export function checkDiagramResourceLimits(text: string, diagram: Diagram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (text.length > MAX_SOURCE_CHARS) {
    issues.push({
      message: `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${text.length})`,
      severity: 'error',
      code: 'source_too_large',
    });
  }

  const nodeCount = countNodes(diagram.nodes);
  if (nodeCount > MAX_NODES) {
    issues.push({
      message: `Diagram exceeds the maximum of ${MAX_NODES} nodes (got ${nodeCount})`,
      severity: 'error',
      code: 'max_nodes_exceeded',
    });
  }

  const edgeCount = countEdges(diagram.edges, diagram.nodes);
  if (edgeCount > MAX_EDGES) {
    issues.push({
      message: `Diagram exceeds the maximum of ${MAX_EDGES} edges (got ${edgeCount})`,
      severity: 'error',
      code: 'max_edges_exceeded',
    });
  }
  const assessment = assessLayoutComplexity(diagram);
  if (assessment.level === 'block') {
    issues.push({
      message: `Diagram layout complexity exceeds the hard maximum of ${MAX_LAYOUT_HARD_COMPLEXITY} estimated work units (got ${assessment.estimatedWork}; baseline ${assessment.nodeEdgeUnits} node-edge units); split the diagram or reduce cross-links`,
      severity: 'error',
      code: 'layout_complexity_exceeded',
    });
  }
  return issues;
}

function collectNodes(nodes: DiagramNode[], into: DiagramNode[] = []): DiagramNode[] {
  for (const node of nodes) {
    into.push(node);
    if (isActivity(node)) collectNodes(node.children, into);
  }
  return into;
}

function collectEdges(edges: DiagramEdge[], nodes: DiagramNode[], into: DiagramEdge[] = []): DiagramEdge[] {
  into.push(...edges);
  for (const node of nodes) {
    if (isActivity(node)) collectEdges(node.childEdges, node.children, into);
  }
  return into;
}

function controlFlow(edge: DiagramEdge): boolean {
  return edge.flowType === 'sequence' || edge.flowType === 'conditionalSequence' || edge.flowType === 'defaultSequence';
}

function structuralWarnings(diagram: Diagram): ValidationIssue[] {
  const nodes = collectNodes(diagram.nodes);
  const edges = collectEdges(diagram.edges, diagram.nodes).filter(controlFlow);
  const flowNodes = nodes.filter((node) => isActivity(node) || isEvent(node) || isGateway(node));
  const incoming = new Map<string, DiagramEdge[]>();
  const outgoing = new Map<string, DiagramEdge[]>();
  for (const edge of edges) {
    const inEdges = incoming.get(edge.targetId) ?? [];
    inEdges.push(edge);
    incoming.set(edge.targetId, inEdges);
    const outEdges = outgoing.get(edge.sourceId) ?? [];
    outEdges.push(edge);
    outgoing.set(edge.sourceId, outEdges);
  }

  const warnings: ValidationIssue[] = [];
  for (const node of flowNodes) {
    if (isEvent(node) && node.attachedToId !== undefined) continue;
    if ((incoming.get(node.id)?.length ?? 0) + (outgoing.get(node.id)?.length ?? 0) === 0) {
      warnings.push({
        message: `Flow node "${node.id}" is not connected to a control flow`,
        severity: 'warning',
        code: 'orphan_node',
        nodeIds: [node.id],
        suggestion: 'Connect the node to the process flow or remove it if it is only illustrative.',
      });
    }
  }

  const starts = flowNodes.filter((node) => isEvent(node) && node.category === 'start');
  const ends = new Set(flowNodes.filter((node) => isEvent(node) && node.category === 'end').map((node) => node.id));
  if (starts.length > 0) {
    const visited = new Set<string>();
    const queue = starts.map((node) => node.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const edge of outgoing.get(id) ?? []) queue.push(edge.targetId);
    }
    if (![...visited].some((id) => ends.has(id))) {
      warnings.push({
        message: 'The reachable process flow has no terminal end event',
        severity: 'warning',
        code: 'missing_terminal_event',
        suggestion: 'Add an end event, or keep this warning if the diagram intentionally represents a partial process.',
      });
    }
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  let cycleReported = false;
  const visit = (id: string): void => {
    if (cycleReported) return;
    const current = state.get(id);
    if (current === 'visiting') {
      warnings.push({
        message: `Control-flow cycle detected at node "${id}" — BPMN loops are allowed, but verify that the cycle has an intentional exit`,
        severity: 'warning',
        code: 'cycle_detected',
        nodeIds: [id],
      });
      cycleReported = true;
      return;
    }
    if (current === 'visited') return;
    state.set(id, 'visiting');
    for (const edge of outgoing.get(id) ?? []) visit(edge.targetId);
    state.set(id, 'visited');
  };
  for (const node of flowNodes) visit(node.id);

  for (const node of flowNodes) {
    if (!isGateway(node)) continue;
    const inDegree = incoming.get(node.id)?.length ?? 0;
    const outDegree = outgoing.get(node.id)?.length ?? 0;
    if (inDegree > 1 && outDegree > 1) {
      warnings.push({
        message: `Gateway "${node.id}" combines multiple incoming and outgoing control flows; verify its join/split behavior is intentional`,
        severity: 'warning',
        code: 'gateway_mixed_join_split',
        nodeIds: [node.id],
      });
    }
  }
  return warnings;
}

function qualityFor(metrics: Omit<ValidationMetrics, 'quality'>): LayoutQuality {
  const reasons: string[] = [];
  if (metrics.nodeOverlaps > 0) reasons.push(`${metrics.nodeOverlaps} node overlap(s)`);
  if (metrics.edgeThroughNode > 0) reasons.push(`${metrics.edgeThroughNode} edge-through-node issue(s)`);
  if (metrics.edgeOvershootsOwnEndpoint > 0) reasons.push(`${metrics.edgeOvershootsOwnEndpoint} edge endpoint overshoot(s)`);
  if (metrics.edgeCrossings > 0) reasons.push(`${metrics.edgeCrossings} edge crossing(s)`);
  if (metrics.routeFallbacks > 0) reasons.push(`${metrics.routeFallbacks} route fallback(s)`);
  const score = Math.max(0, Math.min(100,
    100
    - metrics.nodeOverlaps * 40
    - metrics.edgeThroughNode * 30
    - metrics.edgeOvershootsOwnEndpoint * 30
    - metrics.edgeCrossings * 5
    - metrics.routeFallbacks * 2,
  ));
  const hasGeometryDefect = metrics.nodeOverlaps > 0 || metrics.edgeThroughNode > 0 || metrics.edgeOvershootsOwnEndpoint > 0;
  const grade: LayoutQualityGrade = hasGeometryDefect ? 'invalid'
    : metrics.edgeCrossings === 0 && metrics.routeFallbacks === 0 ? 'A'
      : metrics.edgeCrossings <= 2 && metrics.routeFallbacks <= 2 ? 'B'
        : metrics.edgeCrossings <= 6 && metrics.routeFallbacks <= 6 ? 'C' : 'D';
  return { grade, score, presentationReady: grade === 'A' || grade === 'B', reasons };
}

export async function validate(text: string, options?: LayoutOptions): Promise<ValidationResult> {
  if (text.length > MAX_SOURCE_CHARS) {
    return {
      valid: false,
      errors: checkDiagramResourceLimits(text, { pools: [], nodes: [], edges: [] }),
      semanticErrors: [],
      warnings: [],
    };
  }
  const { diagram, errors: parseErrors, semanticErrors: parseSemanticErrors } = parse(text);
  if (parseErrors.length > 0) {
    return {
      valid: false,
      errors: parseErrors.map((e) => ({ ...e, severity: 'error' as const })),
      semanticErrors: [],
      warnings: [],
    };
  }
  if (parseSemanticErrors.length > 0) {
    return {
      valid: false,
      errors: [],
      semanticErrors: parseSemanticErrors.map((e) => ({ ...e, severity: 'error' as const })),
      warnings: [],
    };
  }

  const resourceIssues = checkDiagramResourceLimits(text, diagram);
  if (resourceIssues.length > 0) {
    return {
      valid: false,
      errors: resourceIssues,
      semanticErrors: [],
      warnings: [],
    };
  }

  let positioned;
  try {
    resetRouteFallbackCount();
    positioned = await layout(diagram, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ message, severity: 'error', ...enrichLayoutIssue(message) }],
      semanticErrors: [],
      warnings: [],
    };
  }

  const inspection = inspectLayout(positioned, getRouteFallbackCount());
  const analysis = inspection.metrics;
  const complexityWarning = layoutComplexityWarning(diagram);
  const warnings: ValidationIssue[] = [
    ...(complexityWarning ? [complexityWarning] : []),
    ...structuralWarnings(diagram),
  ];

  for (const edge of positioned.edges) {
    const wps = edge.waypoints;
    if (!wps?.length) continue;
    for (let i = 0; i < wps.length - 1; i++) {
      const a = wps[i];
      const b = wps[i + 1];
      if (a.x !== b.x && a.y !== b.y) {
        warnings.push({
          message: `Edge "${edge.id}" has a non-orthogonal via segment (via waypoints should be axis-aligned)`,
          severity: 'warning',
        });
        break;
      }
    }
  }

  for (const node of diagram.nodes) {
    if (!node.sizeHint) continue;
    const base = node.kind === 'event' ? 36 : node.kind === 'gateway' ? 40 : 80;
    if (node.sizeHint.width < base || node.sizeHint.height < (node.kind === 'event' || node.kind === 'gateway' ? base : 40)) {
      warnings.push({
        message: `Node "${node.id}" sizeHint is below the recommended minimum for its kind`,
        severity: 'warning',
      });
    }
  }

  for (const pNode of positioned.nodes) {
    if (pNode.kind === 'event' || pNode.kind === 'gateway') continue;
    const textWidth = pNode.label.length * 7;
    const availableWidth = pNode.width - 16;
    if (textWidth > availableWidth * 3) {
      warnings.push({
        message: `Node "${pNode.id}" label likely clips — text is much wider than the node (consider size or shorter label)`,
        severity: 'warning',
      });
    }
  }

  for (const edge of positioned.edges) {
    if (!edge.label || edge.points.length < 2) continue;
    const t = edge.labelPlacement?.at ?? 0.5;
    const totalLen = edge.points.reduce((sum, p, i) => {
      if (i === 0) return 0;
      const prev = edge.points[i - 1];
      return sum + Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    }, 0);
    const targetLen = totalLen * t;
    let accum = 0;
    let labelX = edge.points[0].x, labelY = edge.points[0].y;
    for (let i = 1; i < edge.points.length; i++) {
      const prev = edge.points[i - 1];
      const segLen = Math.abs(edge.points[i].x - prev.x) + Math.abs(edge.points[i].y - prev.y);
      if (accum + segLen >= targetLen) {
        const frac = segLen > 0 ? (targetLen - accum) / segLen : 0;
        labelX = prev.x + (edge.points[i].x - prev.x) * frac;
        labelY = prev.y + (edge.points[i].y - prev.y) * frac;
        break;
      }
      accum += segLen;
    }
    for (const pNode of positioned.nodes) {
      if (pNode.id === edge.sourceId || pNode.id === edge.targetId) continue;
      if (labelX >= pNode.x && labelX <= pNode.x + pNode.width &&
          labelY >= pNode.y && labelY <= pNode.y + pNode.height) {
        warnings.push({
          message: `Edge "${edge.id}" label likely overlaps node "${pNode.id}"`,
          severity: 'warning',
        });
        break;
      }
    }
  }

  for (const overlap of inspection.issues.nodeOverlaps) {
    warnings.push({ message: overlap, severity: 'warning' });
  }
  for (const through of inspection.issues.edgeThroughNode) {
    warnings.push({ message: through, severity: 'warning' });
  }
  for (const overshoot of inspection.issues.edgeOvershootsOwnEndpoint) {
    warnings.push({ message: overshoot, severity: 'warning' });
  }
  if (analysis.edgeCrossings > 0) {
    warnings.push({
      message: `${analysis.edgeCrossings} edge-edge crossing(s) detected`,
      severity: 'warning',
    });
  }
  if (analysis.routeFallbacks > 0) {
    warnings.push({
      message: `${analysis.routeFallbacks} route fallback(s) used an L-corner after clearance search failed`,
      severity: 'warning',
    });
  }

  const metrics = {
    edgeCrossings: analysis.edgeCrossings,
    nodeOverlaps: analysis.nodeOverlaps,
    edgeThroughNode: analysis.edgeThroughNode,
    edgeOvershootsOwnEndpoint: analysis.edgeOvershootsOwnEndpoint,
    routeFallbacks: analysis.routeFallbacks,
  };
  return {
    valid: true,
    errors: [],
    semanticErrors: [],
    warnings,
    metrics: { ...metrics, quality: qualityFor(metrics) },
    inspection,
  };
}
