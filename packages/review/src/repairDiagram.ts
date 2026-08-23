import { type DiagramFamilyId, getFamily } from '@bpm/diagram-runtime';
import { parse } from '@bpm/parser';
import type { LayoutOptions } from '@bpm/layout';
import type { ValidationResult } from '@bpm/validate';
import { getProvider } from './registry.js';
import type { DiagramRepairResult, ReviewBundle, VisualFinding } from './types.js';
import { aiCapabilitiesFor, resolveValidation, toValidationResult, unsupportedAiResult } from './validation.js';
import type { ProviderRequestOptions } from './request.js';

export const DEFAULT_MAX_ATTEMPTS = 3;

export interface RepairDiagramOptions {
  provider?: string;
  layout?: LayoutOptions;
  maxAttempts?: number;
  family?: DiagramFamilyId;
  request?: ProviderRequestOptions;
}

export function applyTextPatches(text: string, findings: VisualFinding[]): { text: string; applied: number } {
  let next = text;
  let applied = 0;
  for (const f of findings) {
    const patch = f.patch;
    if (!patch?.find) continue;
    const idx = next.indexOf(patch.find);
    if (idx === -1) continue;
    next = next.slice(0, idx) + patch.replace + next.slice(idx + patch.find.length);
    applied += 1;
  }
  return { text: next, applied };
}

function toBundle(text: string, validation: ValidationResult): ReviewBundle {
  const { diagram } = parse(text);
  return {
    family: 'bpmn', text,
    validation,
    meta: {
      nodes: diagram.nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label })),
      edges: diagram.edges.map((e) => ({
        id: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.label,
      })),
    },
  };
}

export async function repairDiagram(
  text: string,
  options: RepairDiagramOptions = {},
): Promise<DiagramRepairResult | ReturnType<typeof unsupportedAiResult>> {
  const family = options.family ?? 'bpmn';
  if (!aiCapabilitiesFor(family).repair) return unsupportedAiResult(family, 'repair');
  const providerId = options.provider ?? 'manual';
  const provider = getProvider(providerId);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  let current = text;
  const adapter = getFamily(family);
  let validation = toValidationResult(await resolveValidation(family, current, adapter, options.layout));
  let findings: VisualFinding[] = [];
  let attempts = 0;

  if (validation.valid) {
    return { family, status: 'valid', attempts: 0, text: current, validation, findings, providerId };
  }

  while (attempts < maxAttempts) {
    attempts += 1;
    const bundle = { ...toBundle(current, validation), family };
    findings = provider.repair ? await provider.repair(bundle, options.request) : [];
    const { text: next, applied } = applyTextPatches(current, findings);
    if (applied === 0) {
      return { family, status: 'budget_exhausted', attempts, text: current, validation, findings, providerId };
    }
    current = next;
    validation = toValidationResult(await resolveValidation(family, current, adapter, options.layout));
    if (validation.valid) {
      return { family, status: 'valid', attempts, text: current, validation, findings, providerId };
    }
  }

  return { family, status: 'budget_exhausted', attempts, text: current, validation, findings, providerId };
}
