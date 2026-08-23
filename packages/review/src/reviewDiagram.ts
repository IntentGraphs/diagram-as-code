import { getFamily, type DiagramFamilyId } from '@bpm/diagram-runtime';
import type { LayoutOptions } from '@bpm/layout';
import { Resvg } from '@resvg/resvg-js';
import { geometryFindingsFromValidation } from './geometryFindings.js';
import { getProvider } from './registry.js';
import type { DiagramReviewResult, ReviewBundle } from './types.js';
import { manualProvider } from './providers/manual.js';
import { registerProvider } from './registry.js';
import { aiCapabilitiesFor, resolveValidation, toValidationResult, unsupportedAiResult } from './validation.js';
import type { ProviderRequestOptions } from './request.js';

registerProvider(manualProvider);

export interface ReviewDiagramOptions {
  provider?: string;
  layout?: LayoutOptions;
  reviewInvalid?: boolean;
  family?: DiagramFamilyId;
  request?: ProviderRequestOptions;
}

export async function reviewDiagram(
  text: string,
  options: ReviewDiagramOptions = {},
): Promise<DiagramReviewResult | ReturnType<typeof unsupportedAiResult>> {
  const family = options.family ?? 'bpmn';
  if (!aiCapabilitiesFor(family).visualReview) return unsupportedAiResult(family, 'visualReview');
  const providerId = options.provider ?? 'manual';
  const provider = getProvider(providerId);
  const adapter = getFamily(family);
  const validation = await resolveValidation(family, text, adapter, options.layout);
  const validationResult = toValidationResult(validation);

  const { ast: diagram } = adapter.parse(text) as { ast: import('@bpm/ast').Diagram };
  const meta = {
    nodes: diagram.nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label })),
    edges: diagram.edges.map((e) => ({
      id: e.id, sourceId: e.sourceId, targetId: e.targetId, label: e.label,
    })),
  };

  const bundle: ReviewBundle = { family, text, validation: validationResult, meta };
  const findings = geometryFindingsFromValidation(validationResult);
  let png: Uint8Array | undefined;

  if (validation.valid) {
    const positioned = await adapter.layout(diagram, options.layout);
    const svg = adapter.render(positioned);
    png = new Resvg(svg).render().asPng();
    bundle.positioned = positioned as import('@bpm/layout-core').PositionedDiagram;
    bundle.svg = svg;
    bundle.png = png;
    findings.push(...await provider.review(bundle, options.request));
  } else if (options.reviewInvalid) {
    findings.push(...await provider.review(bundle, options.request));
  }

  return { family, validation: validationResult, visualFindings: findings, providerId, png };
}
