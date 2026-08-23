export type {
  FindingCategory, VisualFinding, ReviewBundle, DiagramReviewResult, ReviewProvider,
  TextPatch, RepairStatus, DiagramRepairResult, DiagramGenerateResult,
} from './types.js';
export { reviewDiagram, type ReviewDiagramOptions } from './reviewDiagram.js';
export {
  repairDiagram, applyTextPatches, DEFAULT_MAX_ATTEMPTS, type RepairDiagramOptions,
} from './repairDiagram.js';
export { generateDiagram, type GenerateDiagramOptions } from './generateDiagram.js';
export { repairGeometry, type GeometryRepairOptions, type GeometryRepairResult } from './geometryRepair.js';
export {
  evaluateDiagramSet,
  type DiagramEvaluationCase,
  type DiagramEvaluationResult,
  type DiagramEvaluationSummary,
} from './evaluate.js';
export { BPM_GRAMMAR, GENERATE_SYSTEM_PROMPT } from './generatePrompt.js';
export { getProvider, registerProvider } from './registry.js';
export { resolveValidation } from './validation.js';
export { manualProvider } from './providers/manual.js';
export { createOllamaProvider } from './providers/ollama.js';
export { createOpenAIProvider } from './providers/openai.js';
export type { RepairSuggestion, RepairProvider, RepairDiagramResult } from './repairTypes.js';
export { applyTextPatch } from './applyPatch.js';
export { createOpenAIRepairProvider } from './providers/repairOpenAI.js';
export { ProviderRequestError, type ProviderRequestOptions } from './request.js';
