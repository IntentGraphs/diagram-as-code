import type { Diagram, DiagramEdge, DiagramNode } from '@bpm/ast';
import type { LayoutOptions } from '@bpm/layout';
import { parse } from '@bpm/parser';
import { printDiagram } from '@bpm/print-dsl';
import { validate, type ValidationResult } from '@bpm/validate';

export interface GeometryRepairOptions {
  layout?: LayoutOptions;
  maxAttempts?: number;
}

export interface GeometryRepairResult {
  status: 'valid' | 'budget_exhausted';
  clean: boolean;
  attempts: number;
  text: string;
  validation: ValidationResult;
  actions: string[];
}

function isManual(text: string): boolean {
  return parse(text).diagram.positioning === 'manual';
}

function shiftNodes(nodes: DiagramNode[], id: string, dx: number, dy: number): { nodes: DiagramNode[]; changed: boolean } {
  let changed = false;
  const next = nodes.map((node) => {
    let updated: DiagramNode = node;
    if (node.id === id && node.position) {
      updated = {
        ...node,
        position: { x: node.position.x + dx, y: node.position.y + dy },
      } as DiagramNode;
      changed = true;
    }
    if (updated.kind === 'activity' && updated.children.length > 0) {
      const nested = shiftNodes(updated.children, id, dx, dy);
      if (nested.changed) {
        updated = { ...updated, children: nested.nodes } as DiagramNode;
        changed = true;
      }
    }
    return updated;
  });
  return { nodes: next, changed };
}

function clearWaypoints(edges: DiagramEdge[]): DiagramEdge[] {
  return edges.map((edge) => {
    const next = { ...edge };
    delete next.waypoints;
    return next;
  });
}

function clearWaypointsDeep(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nextNodes = nodes.map((node) => {
    if (node.kind !== 'activity' || node.children.length === 0) return node;
    const nested = clearWaypointsDeep(node.children, node.childEdges);
    return { ...node, children: nested.nodes, childEdges: nested.edges } as DiagramNode;
  });
  return { nodes: nextNodes, edges: clearWaypoints(edges) };
}

function qualityClean(validation: ValidationResult): boolean {
  const metrics = validation.metrics;
  return Boolean(validation.valid && metrics && metrics.edgeCrossings === 0 && metrics.nodeOverlaps === 0
    && metrics.edgeThroughNode === 0 && metrics.edgeOvershootsOwnEndpoint === 0);
}

function parseShift(message: string): { id: string; dx: number; dy: number } | undefined {
  const match = message.match(/shift\s+"([^"]+)"\s+(right|left|down|up)\s+by\s+(\d+(?:\.\d+)?)/i);
  if (!match) return undefined;
  const amount = Math.ceil(Number(match[3]));
  return {
    id: match[1],
    dx: match[2].toLowerCase() === 'right' ? amount : match[2].toLowerCase() === 'left' ? -amount : 0,
    dy: match[2].toLowerCase() === 'down' ? amount : match[2].toLowerCase() === 'up' ? -amount : 0,
  };
}

/**
 * Bounded geometry repair for manual diagrams. It consumes the existing actionable overlap
 * hints, then removes stale explicit routes once so the shared router can recompute them.
 * Semantic and syntax repair remains the responsibility of repairDiagram().
 */
export async function repairGeometry(
  text: string,
  options: GeometryRepairOptions = {},
): Promise<GeometryRepairResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!isManual(text)) {
    const validation = await validate(text, options.layout);
    return { status: validation.valid ? 'valid' : 'budget_exhausted', clean: qualityClean(validation), attempts: 0, text, validation, actions: [] };
  }

  let current = text;
  let validation = await validate(current, options.layout);
  let attempts = 0;
  const actions: string[] = [];

  while (attempts < maxAttempts && !qualityClean(validation)) {
    attempts += 1;
    const parsed = parse(current);
    if (parsed.errors.length > 0 || parsed.semanticErrors.length > 0) break;

    let candidate: Diagram | undefined;
    let action = '';
    const shift = validation.errors.map((error) => parseShift(error.suggestion ?? error.message)).find(Boolean);
    if (shift) {
      const moved = shiftNodes(parsed.diagram.nodes, shift.id, shift.dx, shift.dy);
      if (moved.changed) {
        candidate = { ...parsed.diagram, nodes: moved.nodes };
        action = `shifted "${shift.id}" by (${shift.dx}, ${shift.dy})`;
      }
    }

    if (!candidate && validation.valid && (validation.metrics?.edgeThroughNode || validation.metrics?.edgeOvershootsOwnEndpoint || validation.metrics?.edgeCrossings)) {
      const cleared = clearWaypointsDeep(parsed.diagram.nodes, parsed.diagram.edges);
      candidate = { ...parsed.diagram, nodes: cleared.nodes, edges: cleared.edges };
      action = 'removed explicit via points so the shared router could recompute affected routes';
    }

    if (!candidate) break;
    const next = printDiagram(candidate);
    const nextValidation = await validate(next, options.layout);
    if (nextValidation.valid && (!validation.valid || (nextValidation.metrics?.edgeCrossings ?? Infinity) < (validation.metrics?.edgeCrossings ?? Infinity) ||
      (nextValidation.metrics?.edgeThroughNode ?? Infinity) < (validation.metrics?.edgeThroughNode ?? Infinity))) {
      current = next;
      validation = nextValidation;
      actions.push(action);
      continue;
    }
    if (!nextValidation.valid && validation.valid) break;
    current = next;
    validation = nextValidation;
    actions.push(action);
  }

  return {
    status: validation.valid ? 'valid' : 'budget_exhausted',
    clean: qualityClean(validation),
    attempts,
    text: current,
    validation,
    actions,
  };
}
