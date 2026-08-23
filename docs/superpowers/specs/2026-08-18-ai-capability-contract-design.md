# Family-neutral AI capability contract — design

_Design only. No implementation in this doc or its landing commit._

_Revision 2: an independent read-only review (Codex) found several factual errors in the first
draft's description of current behavior. Corrections are folded in below (§1, §5, §7, §12) rather
than kept as a separate errata section — this is the design to build from._

## 1. Problem

The platform has four diagram families (BPMN, mindmap, flowchart, architecture) behind a genuinely
family-neutral `DiagramFamilyAdapter` contract (`packages/diagram-runtime/src/types.ts`): `parse`,
`layout`, `render`, optional `validate`, optional `exportStructured`, and a `FamilyCapabilities`
descriptor the web UI already gates every export/editor-mode decision on (Wave 3's fix for the
mindmap/flowchart/architecture rollout).

AI review/repair/generation (`packages/review`) never went through that abstraction. It predates the
family system and still talks directly to BPMN's concrete packages:

- `reviewDiagram.ts` imports `@bpm/parser`'s `parse`, `@bpm/layout`'s `layout`, `@bpm/render`'s
  `render`, and `@bpm/validate`'s `validate` directly — all four are BPMN-typed.
- `generateDiagram.ts` additionally imports `@bpm/print-dsl`'s `freezeDiagram`/`printDiagram`
  (BPMN AST → text serializer) for `positioning: manual` freezing.
- `geometryRepair.ts` (used by `generateDiagram`'s `positioning: 'manual'` path) is not just
  "imports BPMN packages" — it directly imports and mutates `@bpm/ast`'s `DiagramNode`/`DiagramEdge`
  shapes (`position`, `children`, `childEdges`, `waypoints`), reads BPMN-specific
  `ValidationResult.metrics` fields (`edgeCrossings`, `nodeOverlaps`, `edgeThroughNode`,
  `edgeOvershootsOwnEndpoint`), and serializes candidates back to text via `printDiagram`
  (`@bpm/print-dsl`, a BPMN-only AST→text serializer). None of that is reachable through
  `DiagramFamilyAdapter`'s generic `parse`/`layout`/`render`/`validate` hooks — this function is
  BPMN-coupled at a structural level, not an import-swap level (see §5's corrected plan).
- `providers/manual.ts`'s CI-safe fallback `generate()` hardcodes a BPMN skeleton
  (`event start none ... task ... event end none`) as its deterministic draft.
- `apps/web/src/reviewProviders.ts`'s `VISUAL_SYSTEM_PROMPT` opens with "You are a BPMN diagram
  reviewer" and its grammar excerpt is BPMN-only.
- `apps/web/src/main.ts` gates the **Generate** button off for non-BPMN with an ad hoc
  `result.family !== 'bpmn'` check; **Review** is not gated at the button level at all — it stays
  clickable, and `validateForReview()` contains a hardcoded rejection string
  ("Review currently supports BPMN diagrams only…") that only fires once the user actually opens the
  panel. Both are functionally safe (fail closed, no crash) but neither is a formal, inspectable
  capability the way `structuredExport`/`editorMode` are, and the two aren't even gated the same way
  as each other.
- **Corrected from the first draft**: `packages/cli`'s `review` command is *not* unguarded — 
  `runReviewCommand` (`packages/cli/src/commands/review.ts`) already calls
  `requireBpmnSource(text, 'review')` (`packages/cli/src/commands/bpmnOnly.ts`), which fails closed
  with a clean error for non-BPMN input today. The real gap is narrower than originally stated: the
  guard is a special-cased BPMN-only allowlist function, not a capability-driven check, so extending
  it to "which families are actually supported" means replacing `requireBpmnSource` with an
  `aiCapabilities` read — but there is no silent-corruption risk to fix here, unlike the original
  draft implied.
- **Corrected from the first draft**: `bpm generate` (`packages/cli/src/commands/generate.ts`) takes
  a free-text `<description>`, not a diagram file — there is no existing diagram source to read a
  `diagram:` header from, so "family" is not a concept the command has *any* notion of today. Adding
  family-aware generation therefore requires new CLI surface (a `--family` flag, defaulting to
  `bpmn` for compatibility), not just a guard on existing input — this is additive design work the
  first draft didn't address at all (see §9).
- **Corrected from the first draft**: only the BPMN adapter (`packages/diagram-runtime/src/bpmn.ts`)
  implements `DiagramFamilyAdapter.validate`. Mindmap, flowchart, and architecture's adapters have no
  `validate` method — their families' "validation" today is only ever whatever `errors`/
  `semanticErrors` their `parse()` call returns via `FamilyParseResult`. The first draft's routing
  plan assumed all four adapters already had a same-shaped `validate()` to call through; they don't,
  and `FamilyValidationResult` (what a hypothetical non-BPMN `validate()` would return) and BPMN's
  `ValidationResult` (which additionally carries `metrics`) are not the same type. §5 below no longer
  assumes this.

None of this is a bug in the sense of broken behavior for BPMN users — BPMN's AI path works and is
well-tested. The gap is that "does this diagram support AI review?" is answered by scattered,
inconsistent, per-button logic instead of one queryable capability, the same shape problem
`FamilyCapabilities` already solved once for exports.

## 2. Goals

- One queryable, per-family AI capability descriptor, parallel to `FamilyCapabilities`, that the web
  UI, the CLI, and `packages/review` itself all read instead of re-deriving family-specific logic.
- `packages/review`'s core functions (`reviewDiagram`, `generateDiagram`, `repairDiagram`,
  `geometryRepair`) become family-parameterized by routing through the existing
  `DiagramFamilyAdapter` abstraction (`getFamily()` from `@bpm/diagram-runtime`) instead of importing
  concrete BPMN packages.
- BPMN's existing behavior, prompts, and test coverage are unchanged bit-for-bit — this is a
  capability-and-routing refactor, not a BPMN rewrite.
- Unsupported operations return a structured result (a typed "unsupported" outcome, matching how
  `exportStructured` already fails closed with a caught, well-typed error) instead of throwing an
  opaque exception or silently misbehaving on foreign grammar.
- Prompts become family-selected, with an explicit "no prompt registered for this family" fallback
  that resolves to "unsupported," never a crash or a BPMN prompt applied to non-BPMN text.

## 3. Non-goals (explicitly out of scope for this design)

- Building real generation/repair/visual-review prompts for mindmap, flowchart, or architecture.
  Writing a good prompt per family is prompt-engineering work with its own review cycle — this
  design only makes it *possible* to add one family at a time without another cross-cutting change.
- The family-neutral **geometry inspection contract** itself (node bounds, edge-through-node,
  crossings, label clipping, route-fallback counts as a shared, reusable analysis — the "P1" item
  the user's own reassessment listed as a companion, dependency-relevant follow-up). This design
  defines the `geometryInspection` *capability flag* and where it plugs in, but does not build the
  shared analyzer. Until that follow-up lands, `geometryInspection` is honestly `false` for every
  non-BPMN family (see §6 capability matrix) — BPMN keeps its existing rich `@bpm/validate` metrics.
- `positioning: manual` generation/freezing for non-BPMN families — only BPMN has a
  `print-dsl`-equivalent serializer today. Not building one for other families here.
- **`repairGeometry` itself stays untouched and BPMN-only, structurally, not just by policy.** It
  isn't a capability a family could opt into even in principle without first gaining a
  `positioning: manual` grammar mode and a freeze/print serializer — neither exists for mindmap,
  flowchart, or architecture, and building either is its own separately-scoped feature, not part of
  this contract. Concretely: `generateDiagram`'s `positioning: 'manual'` option remains meaningful
  only for `family: 'bpmn'`; requesting it for another family returns the `AiUnsupportedResult` shape
  (§7), and `repairGeometry.ts`'s source is not modified by this wave at all. This also means
  `AiCapabilities.repair` (§4) covers only the provider text-patch path (`repairDiagram`/
  `applyTextPatches`), never geometry repair — the two were conflated in the first draft.
- Changing `providers/manual.ts`'s or `providers/ollama.ts`'s/`openai.ts`'s actual model-calling
  logic beyond making them accept a family-aware prompt instead of a hardcoded BPMN one.
- CLI/web UX polish beyond the minimum capability-gating needed (mirrors Wave 3's scope discipline:
  wire the gate, don't redesign the panel).

## 4. New types

Add to `packages/diagram-runtime/src/types.ts`, alongside the existing `FamilyCapabilities`:

```ts
export interface AiCapabilities {
  /** Draft a full diagram source from a plain-language description. */
  generation: boolean;
  /** Text-only patch suggestions from a review provider (repairDiagram/applyTextPatches) when
   *  validate() is blocking. Does NOT cover geometry/manual-positioning repair (repairGeometry.ts,
   *  §3) — that stays BPMN-only structurally, gated by grammar support, not this flag. */
  repair: boolean;
  /** Render → send to a vision-capable provider for layout/legibility findings. */
  visualReview: boolean;
  /** Family-neutral geometry findings (overlap, edge-through-node, crossings, label clipping)
   *  computed without a model call. False until the geometry-inspection contract (see §3) lands
   *  for a given family, even if the family's layout is otherwise solid. */
  geometryInspection: boolean;
  /** The family's own parser/adapter surfaces meaningful semanticErrors (structural legality)
   *  that the AI layer can present as findings without any family-specific code. */
  semanticValidation: boolean;
}

export const NO_AI_CAPABILITIES: AiCapabilities = {
  generation: false,
  repair: false,
  visualReview: false,
  geometryInspection: false,
  semanticValidation: false,
};
```

Add an optional `aiCapabilities?: AiCapabilities` field to `DiagramFamilyAdapter`. Optional (not
required, unlike `capabilities`) so existing adapters compile unchanged until each family opts in;
`packages/review` and the UI treat a missing descriptor as `NO_AI_CAPABILITIES`. BPMN's adapter sets
every flag `true` on landing, matching its current real behavior.

`semanticValidation` is worth calling out: every family's parser *already* returns `semanticErrors`
via `FamilyParseResult` (duplicate ids, invalid containment, unknown edge endpoints, and so on), so
this flag reflects real, existing data — but (corrected from the first draft) only BPMN's adapter
currently exposes it through a `validate()` method; the other three families' equivalent data lives
only in `parse()`'s return value. §5 defines the normalization this requires.

## 5. Routing refactor (corrected)

**In scope**: `reviewDiagram` and `generateDiagram`'s non-manual-positioning path, plus
`repairDiagram`. **Explicitly not touched**: `geometryRepair.ts` (per §3 — BPMN-only structurally,
not by policy) and `generateDiagram`'s `positioning: 'manual'` branch, which continues to call
`repairGeometry` exactly as today, only now behind an early capability check that routes any
non-BPMN family straight to `AiUnsupportedResult` before reaching BPMN-specific code at all.

For the in-scope functions, replace the direct `@bpm/parser`/`@bpm/layout`/`@bpm/render` imports with
calls through `getFamily(familyId)` (already exported by `@bpm/diagram-runtime`, already the
mechanism `apps/web/src/pipeline.ts` and the CLI's `export`/`render` commands use): `parse` →
`adapter.parse`, `layout` → `adapter.layout`, `render` → `adapter.render`.

`validate` is the one hook that needs a real normalization step, not a straight swap, since — 
corrected from the first draft — only BPMN's adapter implements it, and its `ValidationResult` (with
`metrics`) isn't the same shape as the other three families' `FamilyValidationResult` (no `metrics`).
Introduce:

```ts
export interface AiValidationResult extends FamilyValidationResult {
  /** Present only when the family's adapter provides rich geometry metrics (BPMN today). */
  metrics?: ValidationMetrics; // reuse @bpm/validate's existing metrics shape
}

async function resolveValidation(family: DiagramFamilyId, source: string, adapter: DiagramFamilyAdapter, options?: FamilyLayoutOptions): Promise<AiValidationResult> {
  if (adapter.validate) return adapter.validate(source, options); // BPMN today; metrics included
  const parsed = adapter.parse(source);
  const valid = parsed.errors.length === 0 && parsed.semanticErrors.length === 0;
  return { valid, errors: parsed.errors, semanticErrors: parsed.semanticErrors, warnings: [] };
}
```

This is additive — it does not change `@bpm/validate`'s own `ValidationResult` type or BPMN's
existing callers of it directly; `resolveValidation` is new, internal to `packages/review`, and is
what `reviewDiagram`/`generateDiagram`/`repairDiagram` call instead of importing `validate` from
`@bpm/validate` directly.

Each in-scope function gains a `family: DiagramFamilyId` parameter, **defaulting to `'bpmn'`** so
every existing caller (BPMN's own tests included) compiles and behaves identically without being
touched — this is the concrete backward-compatibility mechanism, not just an intention. Callers that
do have diagram text with a `diagram:` header (the web review panel, `bpm review`) pass the family
read via the same `readDiagramHeader` the runtime already uses, rather than re-deriving it.
`ReviewBundle`/`DiagramReviewResult`/`DiagramRepairResult`/`DiagramGenerateResult` gain a `family:
DiagramFamilyId` field (defaulting to `'bpmn'` in existing call paths) so downstream consumers (the
web review panel, CLI JSON output) can tell which grammar a finding applies to instead of assuming
BPMN — this is the concrete fix for "review metadata is not typed directly to BPMN ASTs" from the
definition of done.

Before doing any of this work: check `PNG` rendering (`new Resvg(svg).render().asPng()` in
`reviewDiagram.ts`) — `Resvg` rasterizes an SVG string with no BPMN dependency, so `visualReview`'s
render step is *already* family-neutral once `render` comes from the adapter instead of the direct
`@bpm/render` import. No new work needed there beyond the routing swap.

One more spot found by re-checking the source directly (not caught by the independent review, but
worth recording): `repairDiagram.ts`'s internal `toBundle()` builds `ReviewBundle.meta` by reading
BPMN's flat `diagram.nodes`/`diagram.edges` shape (`n.kind`, `e.sourceId`/`e.targetId`) directly —
this does not generalize as-is (mindmap's AST is a nested tree with no flat edge list; flowchart's
edges are `from`/`to`, not `sourceId`/`targetId`). **Leave `toBundle()` BPMN-shaped and untouched.**
It's naturally out of reach for every other family under §8's landing matrix, since `repair: false`
for all three means their capability check returns `AiUnsupportedResult` before `toBundle()` is ever
called. Do not attempt to generalize `meta` extraction in this wave — that's real, separate work
(effectively its own mini geometry/AST-normalization problem, same family as §3's deferred inspection
contract) that only matters once a family's `repair` flag actually flips to `true`.

## 6. Prompt selection

Move `VISUAL_SYSTEM_PROMPT` (currently in `apps/web/src/reviewProviders.ts`) and the equivalent
generation prompt (`packages/review/src/generatePrompt.ts`) behind a small per-family registry:

```ts
interface FamilyPrompts {
  visualReviewSystemPrompt?: string;
  generationSystemPrompt?: string;
}
const prompts: Partial<Record<DiagramFamilyId, FamilyPrompts>> = { bpmn: { ... } };
```

A missing entry for a requested operation resolves to the "unsupported" outcome (§7), never a
fallback to BPMN's prompt run against foreign grammar — that would silently produce garbage output
rather than fail closed, which is worse than refusing.

## 7. Failure mode for unsupported operations

Mirror `exportStructured`'s existing pattern: the runtime already throws a caught, well-typed error
when a format isn't in a family's `capabilities.structuredExport` list, and callers (web, CLI) catch
it and surface a clean message rather than letting it propagate as an unhandled rejection (this is
literally what Wave 3 fixed for the *export* path — reuse the same shape here). Concretely:

```ts
export interface AiUnsupportedResult {
  status: 'unsupported';
  family: DiagramFamilyId;
  operation: keyof AiCapabilities;
  message: string; // e.g. `Family "mindmap" does not support AI generation yet.`
}
```

`reviewDiagram`/`generateDiagram`/`repairDiagram` check the relevant `aiCapabilities` flag first and
return this shape instead of calling a provider or touching a missing prompt. CLI JSON output and the
web panel both already have a place to render a clean "not supported" message (the export path's
existing pattern), so this is additive, not a new UI concept.

## 8. Capability matrix at landing (this refactor, not future prompt work)

| Family | generation | repair | visualReview | geometryInspection | semanticValidation |
|---|---|---|---|---|---|
| bpmn | true (unchanged) | true (unchanged) | true (unchanged) | true (unchanged, `@bpm/validate` metrics) | true (unchanged) |
| mindmap | false | false | false | false (pending §3's follow-up) | true |
| flowchart | false | false | false | false (pending §3's follow-up) | true |
| architecture | false | false | false | false (pending §3's follow-up) | true |

This looks conservative, and it is deliberately so: the point of this wave is the *contract*, not
new prompts. The visible product change is that mindmap/flowchart/architecture go from "silently
BPMN-shaped ad hoc gating with one hardcoded string" to "explicitly and correctly advertise nothing
generation/repair/visual-review-related is supported yet, and CLI `bpm review`/`bpm generate` against
a non-BPMN file return a clean structured diagnostic instead of undefined parser behavior." That is
real, shippable value on its own, and it's the same shape of win Wave 3 delivered for exports before
any new export format existed for mindmap.

`semanticValidation: true` across all four families is the one flag that's real, useful, and free —
every family's existing `semanticErrors` become visible through the generic AI-layer types
immediately.

## 9. CLI/web wiring (corrected)

- **CLI `review`** (corrected from the first draft): `runReviewCommand` already reads the file and
  already fails closed via `requireBpmnSource` — this is not a new guard, it's replacing an existing
  BPMN-only allowlist with a capability read. Swap `requireBpmnSource` for reading the `diagram:`
  header (`readDiagramHeader`, already used elsewhere in the CLI) and checking `aiCapabilities.repair`
  / the operation being invoked; an unsupported family prints the `AiUnsupportedResult` message and
  exits non-zero, same externally-visible behavior as today for BPMN, same exit-code shape as
  `bpm export --target` already uses for an unregistered format.
- **CLI `generate`** (corrected from the first draft — this is new surface, not a guard): today
  `runGenerateCommand` takes a free-text description with no family concept at all. Add a `--family
  <id>` flag, defaulting to `bpmn` (so every existing invocation and test is unaffected), threaded
  into `generateDiagram(description, { family, ... })`. Requesting a family whose
  `aiCapabilities.generation` is `false` returns `AiUnsupportedResult` before any provider is called
  — cheap, since the capability check happens before the (potentially costly) provider call, not
  after.
- **Web**: Generate and Review currently use two different, inconsistent gating mechanisms (§1) —
  unify both onto `result.capabilities?.aiCapabilities`, parallel to how
  `firstStructuredExport(result.capabilities)` already reads `structuredExports`. Review gains
  button-level disabling to match Generate's existing pattern, instead of only rejecting once opened.
  Disabled-button title text is generated from the capability + family name instead of a fixed
  string, so it can't drift out of sync the way the old hardcoded engine-override tooltip did before
  Wave 3 fixed it.

## 10. Definition of done

- BPMN's review/repair/generation behavior, output shape, and existing test suite are unchanged.
- `mindmap`, `flowchart`, `architecture` each expose an `aiCapabilities` descriptor (§8's matrix at
  minimum) reachable from both the CLI and the web UI.
- `bpm review`/`bpm generate` against a non-BPMN file return a structured `AiUnsupportedResult`
  message and a non-zero exit, not a crash or silently-wrong BPMN-grammar parsing of foreign text.
- `ReviewBundle`/`DiagramReviewResult`/`DiagramRepairResult`/`DiagramGenerateResult` carry an
  explicit `family` field; nothing in `packages/review`'s public types assumes BPMN implicitly.
- Prompts are selected per family via the registry in §6; no family without a registered prompt can
  reach a provider call for that operation.
- No package under `packages/bpmn-*`-equivalent (parser/ast/layout/layout-core/layout-elk-base/
  layout/render/export-xml) gains a new dependency on `packages/review` or `packages/diagram-runtime`
  — the dependency direction stays AI-layer → family-adapter-layer → concrete family packages, never
  the reverse. (It already is; this is a regression check, not new work.)
- `repairGeometry.ts` is byte-for-byte unmodified; `generateDiagram`'s `positioning: 'manual'` branch
  still calls it exactly as today for `family: 'bpmn'`, and returns `AiUnsupportedResult` for every
  other family before reaching it.
- `bpm generate --family <id>` exists and defaults to `bpmn`; every pre-existing `bpm generate`
  invocation (no `--family`) is unaffected.
- `npm test`, `npm run build --workspaces --if-present`, and `npm run test:e2e -w @bpm/web` all pass;
  the existing BPMN review/generate CLI and web e2e specs are unmodified in *assertion*, only in
  whatever import paths the refactor touches.

## 11. Implementation checklist (for the build step, not this design step)

1. Add `AiCapabilities`/`NO_AI_CAPABILITIES`/`AiUnsupportedResult`/`AiValidationResult` types to
   `packages/diagram-runtime/src/types.ts`; set BPMN's adapter to the all-`true` descriptor.
2. Add the `resolveValidation()` normalizer (§5) to `packages/review`, used by all three in-scope
   functions instead of importing `validate` from `@bpm/validate` directly.
3. Refactor `reviewDiagram.ts`/`generateDiagram.ts` (non-manual-positioning path only)/
   `repairDiagram.ts` to accept a `family: DiagramFamilyId = 'bpmn'` parameter and call through
   `getFamily()` instead of direct BPMN package imports; add the capability check +
   `AiUnsupportedResult` early-return to each. **Do not touch `geometryRepair.ts`** — `generateDiagram`
   gates the `positioning: 'manual'` branch on `family === 'bpmn'` before calling it, unchanged
   otherwise.
4. Add `family` (default `'bpmn'`) to the four result/bundle types in `packages/review/src/types.ts`
   and `repairTypes.ts`.
5. Move `VISUAL_SYSTEM_PROMPT` and the generation system prompt behind the per-family registry
   (§6); BPMN's existing prompt text moves unchanged, nothing rewritten.
6. Set `mindmap`/`flowchart`/`architecture`'s `aiCapabilities` to §8's matrix.
7. CLI: swap `requireBpmnSource` in `review.ts` for a capability read (§9); add `--family` to
   `generate.ts`/`args.ts`, defaulting to `bpmn`.
8. Wire `apps/web/src/main.ts` to read `aiCapabilities` for both Generate and Review (unifying their
   currently-different gating mechanisms, §9); update `apps/web/src/reviewProviders.ts`'s hardcoded
   message.
9. Re-run the full suite; confirm BPMN review/generate CLI and e2e specs pass unmodified in
   assertion, and that no existing `bpm generate` invocation without `--family` changed behavior.

## 12. Open questions for the build step

- Should `AiCapabilities` live on `DiagramFamilyAdapter` directly (this design's proposal, endorsed
  by the independent review as "conceptually sound and consistent with `FamilyCapabilities`; a
  second registry risks drift") or as a separate registry inside `packages/review`? **Resolved: keep
  it on the adapter**, per that review and for symmetry with the existing `capabilities` field —
  prompts specifically (not the capability flags) stay registered inside `packages/review`, since
  prompt text has no reason to live in the dependency-light `diagram-runtime` package.
- The independent review flagged that `semanticValidation`/`geometryInspection` should describe
  *operation prerequisites*, not bare policy flags — addressed above by splitting `repair` (§4) and
  excluding `geometryRepair` entirely (§3/§5) rather than trying to make one flag cover two different
  mechanisms with different real prerequisites.
