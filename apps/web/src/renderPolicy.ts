import { classifyLayoutComplexity, type LayoutComplexityLevel } from '@bpm/validate';

export interface RenderAssessment {
  heavy: boolean;
  score: number;
  layoutComplexity: number;
  admission: LayoutComplexityLevel;
  nodeCount: number;
  edgeCount: number;
  poolCount: number;
  laneCount: number;
  crossPoolEdgeCount: number;
  reasons: string[];
}

const EDGE_PATTERN = /(?:->>|=>|->|~>|\.\.>)/;
const NODE_DECLARATION_PATTERN = /^\s*(?:event|task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subProcess|transaction|callActivity|gateway|dataObject|dataStore|textAnnotation|group|box|decision|person|system|container|component|database|queue|mindmap|milestone)\b/i;

/**
 * Cheap source-only preflight. It deliberately does not parse or lay out the diagram, so it is
 * safe to run on every keystroke. The thresholds are conservative because routing cost is driven
 * by graph density and pools/lanes, not just source length.
 */
export function assessRenderCost(source: string): RenderAssessment {
  const lines = source.split('\n');
  const nodeCount = lines.filter((line) => NODE_DECLARATION_PATTERN.test(line) || /\bas\s+[A-Za-z_][A-Za-z0-9_.-]*\b/.test(line)).length;
  const edgeCount = lines.filter((line) => EDGE_PATTERN.test(line)).length;
  const poolCount = lines.filter((line) => /^\s*pool\b/i.test(line)).length;
  const laneCount = lines.filter((line) => /^\s*lane\b/i.test(line)).length;
  const crossPoolEdgeCount = lines.filter((line) => /~>/.test(line)).length;
  const layoutComplexity = nodeCount * Math.max(1, edgeCount);
  const admission = classifyLayoutComplexity(layoutComplexity);
  const score = Math.round(
    nodeCount * 1.25
    + edgeCount * 1.75
    + poolCount * 12
    + laneCount * 4
    + crossPoolEdgeCount * 6
    + source.length / 10,
  );
  const reasons: string[] = [];
  if (nodeCount >= 40) reasons.push(`${nodeCount} nodes`);
  if (edgeCount >= 50) reasons.push(`${edgeCount} relationships`);
  if (poolCount >= 3 || laneCount >= 6) reasons.push(`${poolCount} pools / ${laneCount} lanes`);
  if (crossPoolEdgeCount >= 5) reasons.push(`${crossPoolEdgeCount} cross-pool relationships`);
  const heavy = admission !== 'allow' || score >= 150 || nodeCount >= 40 || edgeCount >= 60 || (poolCount >= 3 && laneCount >= 6);
  return { heavy, score, layoutComplexity, admission, nodeCount, edgeCount, poolCount, laneCount, crossPoolEdgeCount, reasons };
}

/**
 * Returns a typing debounce that gives layout-heavy sources a chance to settle before starting
 * another main-thread layout. The render controller also coalesces edits that arrive after a
 * layout has started; this delay mainly avoids starting work for every keystroke in the first
 * place.
 */
export function renderDebounceMs(source: string): number {
  return assessRenderCost(source).heavy ? 800 : 300;
}
