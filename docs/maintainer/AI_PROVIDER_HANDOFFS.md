# AI provider handoff phases

The repository now contains the shared geometry, repair, render-review, and evaluation contract.
Provider work can be parallelized without changing the core DSL or layout engines.

## Handoff A — generation quality

Prompt for another LLM:

> Read `docs/LANGUAGE.md`, `docs/MANUAL_LAYOUT_AI.md`, and `packages/review/src/generatePrompt.ts`.
> Improve the generation prompt for semantic BPMN correctness and topology, while keeping layout
> automatic. Do not add manual coordinates to model output. Add provider tests using deterministic
> fixtures and ensure generated text passes `validate()`.

Deliverables: prompt changes, provider tests, and a first-pass validity report.

## Handoff B — geometry critic and repair

Prompt:

> Read `packages/layout-core/src/inspection.ts`, `packages/validate/src/index.ts`, and
> `packages/review/src/geometryRepair.ts`. Add or improve structured geometry findings for
> crossings, through-node routes, label collisions, and route fallbacks. Repairs must be bounded,
> deterministic, and revalidated after every change. Preserve existing DSL coordinate-frame rules.

Deliverables: issue schema extensions, repair tests for flat/lane/nested diagrams, and no changes to
the existing `analyzeLayout()` compatibility output.

## Handoff C — visual provider

Prompt:

> Read `packages/review/src/reviewDiagram.ts`, the Ollama/OpenAI providers, and
> `docs/MANUAL_LAYOUT_AI.md`. Improve visual review for label clipping, crowding, imbalance,
> ambiguous routing, and unreadable text. Findings must include confidence, affected ids when
> possible, and exact patches only when safe. Do not make the generation loop unbounded.

Deliverables: provider prompt changes, mocked PNG-review tests, and a bounded visual-loop report.

## Handoff D — evaluation and model comparison

Prompt:

> Use `evaluateDiagramSet()` and create a fixture corpus covering gateways, fan-out/fan-in,
> cross-lane flows, multiple pools, nested subprocesses, boundary events, long labels, and dense
> diagrams. Compare providers using first-pass validity, geometry metrics, route fallbacks, repair
> attempts, and visual findings. Record per-fixture budgets; do not hide documented residual crossings.

Deliverables: fixtures, JSON/Markdown scorecard, and a recommendation for default provider/model.

## Handoff E — browser integration

Prompt:

> Add the same opt-in pipeline to the web Generate panel: auto-generation by default, manual freeze
> as an explicit action, inspection summary, geometry repair preview, rendered visual review, and
> Apply/Skip controls. Never overwrite editor text without explicit user confirmation.

Deliverables: browser tests, loading/error states, and a privacy note for image uploads.
