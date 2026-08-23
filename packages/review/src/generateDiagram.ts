import type { LayoutOptions } from '@bpm/layout';
import { layout } from '@bpm/layout';
import { parse } from '@bpm/parser';
import { getFamily, type DiagramFamilyId } from '@bpm/diagram-runtime';
import { freezeDiagram, printDiagram } from '@bpm/print-dsl';
import type { ValidationResult } from '@bpm/validate';
import { applyTextPatches } from './repairDiagram.js';
import { getProvider } from './registry.js';
import { reviewDiagram } from './reviewDiagram.js';
import { repairDiagram } from './repairDiagram.js';
import { repairGeometry } from './geometryRepair.js';
import type { DiagramGenerateResult, VisualFinding } from './types.js';
import { aiCapabilitiesFor, resolveValidation, toValidationResult, unsupportedAiResult } from './validation.js';
import { getGenerationSystemPrompt } from './generatePrompt.js';
import type { ProviderRequestOptions } from './request.js';

export interface GenerateDiagramOptions {
  provider?: string;
  layout?: LayoutOptions;
  maxAttempts?: number;
  /** Keep auto-layout as the default; manual freezes the validated resolved geometry into DSL. */
  positioning?: 'auto' | 'manual';
  /** Run bounded manual geometry cleanup after freezing. Defaults to true for manual positioning. */
  geometryRepair?: boolean;
  maxGeometryAttempts?: number;
  /** Render and send the result through the selected provider's visual review path. */
  visualReview?: boolean;
  maxVisualAttempts?: number;
  family?: DiagramFamilyId;
  request?: ProviderRequestOptions;
}

async function materializePositioning(
  text: string,
  options: GenerateDiagramOptions,
): Promise<{ text: string; validation: ValidationResult }> {
  const family = options.family ?? 'bpmn';
  const adapter = getFamily(family);
  if (options.positioning !== 'manual') {
    return { text, validation: toValidationResult(await resolveValidation(family, text, adapter, options.layout)) };
  }

  if (family !== 'bpmn') return { text, validation: toValidationResult(await resolveValidation(family, text, adapter, options.layout)) };

  const parsed = parse(text);
  if (parsed.errors.length > 0 || parsed.semanticErrors.length > 0 || !parsed.diagram) {
    return { text, validation: toValidationResult(await resolveValidation(family, text, adapter, options.layout)) };
  }

  const positioned = await layout(parsed.diagram, options.layout);
  const frozenText = printDiagram(freezeDiagram(parsed.diagram, positioned));
  return { text: frozenText, validation: toValidationResult(await resolveValidation(family, frozenText, adapter, options.layout)) };
}

async function improveGeneratedDiagram(
  text: string,
  options: GenerateDiagramOptions,
): Promise<{ text: string; validation: ValidationResult; findings: VisualFinding[] }> {
  let current = await materializePositioning(text, options);
  const findings: VisualFinding[] = [];

  if (options.positioning === 'manual' && options.geometryRepair !== false) {
    const repaired = await repairGeometry(current.text, {
      layout: options.layout,
      maxAttempts: options.maxGeometryAttempts ?? options.maxAttempts,
    });
    current = { text: repaired.text, validation: repaired.validation };
  }

  if (!options.visualReview || !current.validation.valid) {
    return { ...current, findings };
  }

  const maxAttempts = options.maxVisualAttempts ?? 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const review = await reviewDiagram(current.text, { provider: options.provider, layout: options.layout, request: options.request });
    if ('status' in review && review.status === 'unsupported') break;
    const visualFindings = 'visualFindings' in review ? review.visualFindings : [];
    findings.push(...visualFindings);
    const patched = applyTextPatches(current.text, visualFindings);
    if (patched.applied === 0 || patched.text === current.text) break;
    let next = { text: patched.text, validation: toValidationResult(await resolveValidation(options.family ?? 'bpmn', patched.text, getFamily(options.family ?? 'bpmn'), options.layout)) };
    if (options.positioning === 'manual' && options.geometryRepair !== false && next.validation.valid) {
      const repaired = await repairGeometry(next.text, {
        layout: options.layout,
        maxAttempts: options.maxGeometryAttempts ?? options.maxAttempts,
      });
      next = { text: repaired.text, validation: repaired.validation };
    }
    current = next;
    if (!current.validation.valid) break;
  }

  return { ...current, findings };
}

/**
 * Drafts a full .bpm source from a plain-language description, then validates it and — if the
 * draft is invalid — hands off into the same repair loop used for hand-authored files.
 */
export async function generateDiagram(
  description: string,
  options: GenerateDiagramOptions = {},
): Promise<DiagramGenerateResult | ReturnType<typeof unsupportedAiResult>> {
  const family = options.family ?? 'bpmn';
  if (options.positioning === 'manual' && family !== 'bpmn') return unsupportedAiResult(family, 'generation');
  if (!aiCapabilitiesFor(family).generation) return unsupportedAiResult(family, 'generation');
  if (!getGenerationSystemPrompt(family)) return unsupportedAiResult(family, 'generation');
  const providerId = options.provider ?? 'manual';
  const provider = getProvider(providerId);

  if (!provider.generate) {
    throw new Error(`Provider "${providerId}" does not support generation (no generate() method).`);
  }

  const draft = await provider.generate(description, family, options.request);
  const validation = toValidationResult(await resolveValidation(family, draft, getFamily(family), options.layout));

  if (validation.valid) {
    const materialized = await improveGeneratedDiagram(draft, options);
    return {
      status: materialized.validation.valid ? 'valid' : 'budget_exhausted',
      attempts: 0,
      text: materialized.text,
      validation: materialized.validation,
      findings: materialized.findings,
      providerId, family,
    };
  }

  const repaired = await repairDiagram(draft, options);
  if (repaired.status === 'unsupported') return repaired;
  if (repaired.status !== 'valid') return repaired;
  const materialized = await improveGeneratedDiagram(repaired.text, options);
  return {
    status: materialized.validation.valid ? 'valid' : 'budget_exhausted',
    attempts: repaired.attempts,
    text: materialized.text,
    validation: materialized.validation,
    findings: repaired.findings,
    providerId, family,
  };
}
