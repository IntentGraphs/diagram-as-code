import BpmnModdle, { type ModdleElement } from 'bpmn-moddle';
import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import type { PositionedNode, RoutedEdge } from '@bpm/layout-core';
import { layout } from '@bpm/layout';
import { importXml } from './index.js';

export interface FidelityIssue {
  kind: 'missing-shape' | 'extra-shape' | 'missing-edge' | 'extra-edge'
    | 'position-mismatch' | 'via-count-mismatch' | 'count-mismatch';
  id?: string;
  message: string;
}

export interface FidelityCounts {
  shapes: number;
  edges: number;
  pools: number;
  lanes: number;
}

export interface FidelityReport {
  ok: boolean;
  sourceCounts: FidelityCounts;
  resultCounts: FidelityCounts;
  issues: FidelityIssue[];
}

export interface FidelityOptions {
  /** Max allowed |dx|/|dy| between a source DI position and the result's placed position. */
  positionTolerance?: number;
}

interface Bounds { x: number; y: number; width: number; height: number }

interface Inventory {
  shapeIds: Set<string>;
  shapeBounds: Map<string, Bounds>;
  edgeIds: Set<string>;
  /** Interior waypoint count — excludes the first/last (exit/entry stub) points on purpose: those
   * are auto-picked by the router when `from`/`to` aren't pinned, and legitimately differ from
   * the original without indicating any real routing-fidelity loss (see the item 16 design doc's
   * findings section). Only the interior bends are a meaningful fidelity signal. */
  edgeInteriorWaypointCounts: Map<string, number>;
  poolCount: number;
  laneCount: number;
}

/**
 * Ground truth extracted directly from the BPMN DI (`bpmndi:BPMNShape`/`bpmndi:BPMNEdge`) —
 * independent of @bpm/import-xml's own element-type mapping, on purpose: DI is what bpmn-js (or
 * any BPMN 2.0 tool) considers actually present on the canvas, regardless of which underlying
 * semantic element type produced it (a plain `bpmn:Association` and a `dataInputAssociation`
 * both get their own `bpmndi:BPMNEdge` — this doesn't need to know the difference to notice one
 * went missing, which is exactly the class of bug this check is meant to catch on its own).
 */
async function extractSourceInventory(xml: string): Promise<Inventory> {
  const moddle = new BpmnModdle();
  const { rootElement } = await moddle.fromXML(xml);

  const shapeIds = new Set<string>();
  const shapeBounds = new Map<string, Bounds>();
  const edgeIds = new Set<string>();
  const edgeInteriorWaypointCounts = new Map<string, number>();
  let poolCount = 0;
  let laneCount = 0;

  const diagrams = (rootElement.diagrams as ModdleElement[] | undefined) ?? [];
  for (const dg of diagrams) {
    const plane = dg.plane as ModdleElement | undefined;
    for (const el of (plane?.planeElement as ModdleElement[] | undefined) ?? []) {
      const target = el.bpmnElement as ModdleElement | undefined;
      if (!target?.id) continue;

      if (el.$type === 'bpmndi:BPMNShape') {
        if (target.$type === 'bpmn:Participant') { poolCount += 1; continue; }
        if (target.$type === 'bpmn:Lane') { laneCount += 1; continue; }
        shapeIds.add(target.id);
        const b = el.bounds as ModdleElement | undefined;
        if (b) {
          shapeBounds.set(target.id, {
            x: Number(b.x), y: Number(b.y), width: Number(b.width), height: Number(b.height),
          });
        }
      } else if (el.$type === 'bpmndi:BPMNEdge') {
        edgeIds.add(target.id);
        const waypoints = (el.waypoint as ModdleElement[] | undefined) ?? [];
        edgeInteriorWaypointCounts.set(target.id, Math.max(0, waypoints.length - 2));
      }
    }
  }

  return { shapeIds, shapeBounds, edgeIds, edgeInteriorWaypointCounts, poolCount, laneCount };
}

function flattenPositionedNodes(nodes: PositionedNode[]): PositionedNode[] {
  return nodes.flatMap((n) => (n.children ? [n, ...flattenPositionedNodes(n.children)] : [n]));
}

function flattenPositionedEdges(nodes: PositionedNode[], edges: RoutedEdge[]): RoutedEdge[] {
  return [
    ...edges,
    ...nodes.flatMap((n) => (n.childEdges ? flattenPositionedEdges(n.children ?? [], n.childEdges) : [])),
  ];
}

/**
 * Ground truth for the RESULT side: lays the converted Diagram out (via @bpm/layout — always
 * `positioning: manual` for an import-xml result) to get canvas-absolute positions/routed
 * points, the same frame the source DI bounds/waypoints are already in.
 */
async function extractResultInventory(diagram: Diagram): Promise<Inventory> {
  const positioned = await layout(diagram);
  const flatNodes = flattenPositionedNodes(positioned.nodes);
  const flatEdges = flattenPositionedEdges(positioned.nodes, positioned.edges as RoutedEdge[]);

  const shapeIds = new Set(flatNodes.map((n) => n.id));
  const shapeBounds = new Map(flatNodes.map((n) => [n.id, { x: n.x, y: n.y, width: n.width, height: n.height }]));
  const edgeIds = new Set(flatEdges.map((e) => e.id));
  const edgeInteriorWaypointCounts = new Map(flatEdges.map((e) => [e.id, Math.max(0, e.points.length - 2)]));

  return {
    shapeIds, shapeBounds, edgeIds, edgeInteriorWaypointCounts,
    poolCount: diagram.pools.length,
    laneCount: diagram.pools.reduce((sum, p) => sum + p.lanes.length, 0),
  };
}

function countsOf(inv: Inventory): FidelityCounts {
  return { shapes: inv.shapeIds.size, edges: inv.edgeIds.size, pools: inv.poolCount, lanes: inv.laneCount };
}

function compareInventories(source: Inventory, result: Inventory, tolerance: number): FidelityIssue[] {
  const issues: FidelityIssue[] = [];

  for (const id of source.shapeIds) {
    if (!result.shapeIds.has(id)) {
      issues.push({ kind: 'missing-shape', id, message: `Shape "${id}" is present in the source but missing from the converted diagram` });
    }
  }
  for (const id of result.shapeIds) {
    if (!source.shapeIds.has(id)) {
      issues.push({ kind: 'extra-shape', id, message: `Shape "${id}" appears in the converted diagram but has no counterpart in the source` });
    }
  }

  for (const id of source.edgeIds) {
    if (!result.edgeIds.has(id)) {
      issues.push({ kind: 'missing-edge', id, message: `Edge "${id}" is present in the source but missing from the converted diagram` });
    }
  }
  for (const id of result.edgeIds) {
    if (!source.edgeIds.has(id)) {
      issues.push({ kind: 'extra-edge', id, message: `Edge "${id}" appears in the converted diagram but has no counterpart in the source` });
    }
  }

  for (const [id, sBounds] of source.shapeBounds) {
    const rBounds = result.shapeBounds.get(id);
    if (!rBounds) continue;
    const dx = Math.abs(sBounds.x - rBounds.x);
    const dy = Math.abs(sBounds.y - rBounds.y);
    if (dx > tolerance || dy > tolerance) {
      issues.push({
        kind: 'position-mismatch', id,
        message: `Shape "${id}" moved by (${dx.toFixed(1)}, ${dy.toFixed(1)}) beyond the ${tolerance}px tolerance — source (${sBounds.x}, ${sBounds.y}), result (${rBounds.x}, ${rBounds.y})`,
      });
    }
  }

  for (const [id, sCount] of source.edgeInteriorWaypointCounts) {
    const rCount = result.edgeInteriorWaypointCounts.get(id);
    if (rCount === undefined) continue; // already reported as missing-edge above
    if (sCount !== rCount) {
      issues.push({
        kind: 'via-count-mismatch', id,
        message: `Edge "${id}" has ${sCount} interior bend point(s) in the source but ${rCount} in the result — its routing wasn't preserved`,
      });
    }
  }

  return issues;
}

/**
 * Compares a BPMN XML file against what `importXml()` converts it to, using the DI's own
 * shapes/edges as ground truth (not @bpm/import-xml's own element-type mapping) so this check
 * catches gaps in that mapping rather than agreeing with them. Also serves the "back conversion"
 * direction (docs/superpowers/specs/2026-08-17-diagram-mode-text-import-design.md's T7 findings):
 * `extractResultInventory()` operates on any `Diagram`, so the same comparator can validate an
 * `@bpm/export-xml`-produced XML against the hand-written `.bpm` text it came from.
 */
export async function checkImportFidelity(xml: string, options: FidelityOptions = {}): Promise<FidelityReport> {
  const tolerance = options.positionTolerance ?? 2;
  const [source, { diagram }] = await Promise.all([
    extractSourceInventory(xml),
    importXml(xml),
  ]);
  const result = await extractResultInventory(diagram);

  const issues = compareInventories(source, result, tolerance);
  const sourceCounts = countsOf(source);
  const resultCounts = countsOf(result);
  if (sourceCounts.pools !== resultCounts.pools || sourceCounts.lanes !== resultCounts.lanes) {
    issues.unshift({
      kind: 'count-mismatch',
      message: `Container count mismatch — source: ${sourceCounts.pools} pool(s)/${sourceCounts.lanes} lane(s), result: ${resultCounts.pools}/${resultCounts.lanes}`,
    });
  }

  return { ok: issues.length === 0, sourceCounts, resultCounts, issues };
}

export { flattenPositionedNodes, flattenPositionedEdges };
export type { DiagramNode, DiagramEdge };
