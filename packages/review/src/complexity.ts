import { getFamily, readDiagramHeader, type DiagramFamilyId } from '@bpm/diagram-runtime';

export type AgentModelTier = 'deterministic' | 'small-local' | 'general' | 'strong-review';

export interface DiagramComplexityAssessment {
  family: DiagramFamilyId;
  nodeCount: number;
  edgeCount: number;
  nestedNodeCount: number;
  maxDepth: number;
  maxDegree: number;
  labelCharacters: number;
  score: number;
  tier: AgentModelTier;
  reasons: string[];
}

export interface AgentWorkflowRecommendation {
  modelTier: AgentModelTier;
  agents: Array<{
    role: 'layout' | 'geometry-critic' | 'semantic-critic' | 'visual-critic' | 'repair';
    execution: 'deterministic' | 'small-local' | 'general' | 'strong-review';
    required: boolean;
  }>;
  rationale: string[];
}

interface RecordLike { [key: string]: unknown; }

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function childNodes(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.children)) return [];
  return value.children;
}

function childEdges(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.childEdges)) return [];
  return value.childEdges;
}

function labelLength(value: unknown): number {
  return isRecord(value) && typeof value.label === 'string' ? value.label.length : 0;
}

function complexityTier(score: number): AgentModelTier {
  if (score <= 35) return 'deterministic';
  if (score <= 85) return 'small-local';
  if (score <= 170) return 'general';
  return 'strong-review';
}

/**
 * Computes a cheap, provider-independent routing signal before any model call. The score is
 * intentionally explainable: node/edge volume, nesting, fan-out, and label density are the
 * main sources of layout and review cost. It is a work-allocation hint, not a quality score.
 */
export function assessDiagramComplexity(source: string, family?: DiagramFamilyId): DiagramComplexityAssessment {
  const header = readDiagramHeader(source);
  const resolvedFamily = family ?? header.family;
  const parsed = getFamily(resolvedFamily).parse(header.sourceWithoutDirective) as { ast: unknown };
  const root = parsed.ast;
  const roots = isRecord(root) && Array.isArray(root.nodes) ? root.nodes : [];
  let nodeCount = 0;
  let nestedNodeCount = 0;
  let maxDepth = 0;
  let maxDegree = 0;
  let labelCharacters = 0;

  const visit = (nodes: unknown[], depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    for (const value of nodes) {
      if (!isRecord(value)) continue;
      nodeCount += 1;
      if (depth > 0) nestedNodeCount += 1;
      labelCharacters += labelLength(value);
      maxDegree = Math.max(maxDegree, childNodes(value).length);
      visit(childNodes(value), depth + 1);
    }
  };
  visit(roots, 0);

  let edgeCount = isRecord(root) && Array.isArray(root.edges) ? root.edges.length : 0;
  const countNestedEdges = (nodes: unknown[]): void => {
    for (const node of nodes) {
      if (!isRecord(node)) continue;
      edgeCount += childEdges(node).length;
      countNestedEdges(childNodes(node));
    }
  };
  countNestedEdges(roots);

  const score = Math.round(nodeCount + edgeCount * 1.5 + nestedNodeCount * 3 + maxDepth * 5 + maxDegree * 2 + labelCharacters / 100);
  const tier = complexityTier(score);
  const reasons: string[] = [];
  if (nodeCount >= 40) reasons.push(`${nodeCount} nodes increase layout and review cost`);
  if (edgeCount >= 50) reasons.push(`${edgeCount} relationships increase routing and crossing risk`);
  if (nestedNodeCount >= 8 || maxDepth >= 3) reasons.push(`nested hierarchy reaches depth ${maxDepth}`);
  if (maxDegree >= 8) reasons.push(`fan-out reaches ${maxDegree} children from one node`);
  if (labelCharacters >= 1200) reasons.push(`${labelCharacters} label characters increase readability pressure`);
  if (reasons.length === 0) reasons.push('small topology with limited nesting and label density');

  return { family: resolvedFamily, nodeCount, edgeCount, nestedNodeCount, maxDepth, maxDegree, labelCharacters, score, tier, reasons };
}

/**
 * Selects the least expensive useful agent chain. Deterministic validation/layout always runs;
 * models are reserved for semantic planning or visual review where they add information.
 */
export function recommendAgentWorkflow(assessment: DiagramComplexityAssessment): AgentWorkflowRecommendation {
  if (assessment.tier === 'deterministic') {
    return {
      modelTier: 'deterministic',
      agents: [
        { role: 'layout', execution: 'deterministic', required: true },
        { role: 'geometry-critic', execution: 'deterministic', required: true },
      ],
      rationale: ['No model call is required for a small diagram.', 'Escalate only if deterministic findings remain after bounded repair.'],
    };
  }
  if (assessment.tier === 'small-local') {
    return {
      modelTier: 'small-local',
      agents: [
        { role: 'layout', execution: 'deterministic', required: true },
        { role: 'geometry-critic', execution: 'deterministic', required: true },
        { role: 'semantic-critic', execution: 'small-local', required: true },
        { role: 'repair', execution: 'small-local', required: false },
      ],
      rationale: ['Use a local/small model for bounded semantic suggestions.', 'Keep geometry decisions and acceptance gates deterministic.'],
    };
  }
  if (assessment.tier === 'general') {
    return {
      modelTier: 'general',
      agents: [
        { role: 'layout', execution: 'deterministic', required: true },
        { role: 'geometry-critic', execution: 'deterministic', required: true },
        { role: 'semantic-critic', execution: 'general', required: true },
        { role: 'visual-critic', execution: 'general', required: true },
        { role: 'repair', execution: 'small-local', required: false },
      ],
      rationale: ['Use a general model for ambiguity and multi-view recommendations.', 'Run visual review only after geometry is stable.'],
    };
  }
  return {
    modelTier: 'strong-review',
    agents: [
      { role: 'layout', execution: 'deterministic', required: true },
      { role: 'geometry-critic', execution: 'deterministic', required: true },
      { role: 'semantic-critic', execution: 'general', required: true },
      { role: 'visual-critic', execution: 'strong-review', required: true },
      { role: 'repair', execution: 'general', required: false },
    ],
    rationale: ['Reserve the strongest model for final visual ambiguity on large or dense diagrams.', 'Prefer splitting into C4 views before spending more inference on one crowded page.'],
  };
}
