# AI-assisted diagram generation from a description

_Design for "query the AI directly to build the graph by providing text, high-level steps, or a draft DSL, and have it draft/update the text panel." Companion to `docs/superpowers/specs/2026-08-11-ai-diagram-review-design.md`, which covers reviewing and repairing an existing diagram — this covers drafting one from nothing._

## Problem

`@bpm/review` already closes the loop for *fixing* a `.bpm` file: `repairDiagram()` sends invalid source plus structured errors to a provider and retries patches until `@bpm/validate` passes (roadmap item 10, `docs/AI_REVIEW.md`). There was no path for *writing* a diagram from a plain-language description — a user (or an agent) had to already know the DSL well enough to produce a first draft by hand.

## Design

**Core (`packages/review`)**

- `ReviewProvider` gains an optional `generate(description: string): Promise<string>` — returns raw `.bpm` source, distinct from `review`/`repair`'s findings-array shape, because there is no existing text to produce patches against.
- `generateDiagram(description, options)` (`packages/review/src/generateDiagram.ts`): calls `provider.generate()`, validates the draft, and — if invalid — hands off directly into the existing `repairDiagram()` loop (no new retry logic). Returns `DiagramGenerateResult`: `{ status: 'valid' | 'budget_exhausted', attempts, text, validation, findings, providerId }`. `attempts` counts repair passes only; the initial draft is attempt 0.
- `GENERATE_SYSTEM_PROMPT` (`packages/review/src/generatePrompt.ts`): a grammar cheat-sheet condensed from `docs/LANGUAGE.md` §1-5 plus one worked example, instructing the model to output only raw `.bpm` source (no JSON wrapper, no fences) and to leave layout automatic (never emit `layout:`/`positioning: manual`).
- `manual` provider's `generate()` is a deterministic skeleton (start event → one task named from the description → end event) — no network, so the generate→validate→repair plumbing is testable in CI without a model, matching `manual`'s existing role for review/repair.
- `ollama`/`openai` providers implement `generate()` with the same transport pattern as their existing `repair()`, using `GENERATE_SYSTEM_PROMPT`.

**CLI (`packages/cli`)**

- `bpm generate "<description>" [--provider manual|ollama|openai] [--max-attempts 3] [-o out.bpm]`. The single positional argument is repurposed as the description (quoted as one shell argument) rather than a file path.
- `runGenerateCommand` mirrors `runReviewCommand`'s JSON-on-stdout convention: `{ description, providerId, generation: {status, attempts, text}, validation }`. Writes `-o` only when `generation.status === 'valid'`; exits 1 with no file written on `budget_exhausted`.

**Web (`apps/web/src`)**

- `generatePanel.ts`, a sibling to `reviewPanel.ts` using the same DOM/CSS conventions (`.review-settings`, `.review-run-btn`, `.review-status`): a description textarea, a provider select, and provider-specific settings inputs (API key / base URL / model), reusing `localStorage`/`sessionStorage` keys already used by the review panel.
- A third provider option, **offline skeleton**, calls a client-side deterministic generator (`generateOfflineSkeleton()` in `reviewProviders.ts`, same logic as the `manual` provider) — no network, no API key, so the feature is exercisable and end-to-end testable without credentials.
- Flow: draft → `validate()` (browser-side, via `@bpm/validate`) → if invalid and not offline, one repair pass (reusing the existing `callOpenAIRepair`/`callOllamaRepair` functions and applying patches locally) → render the result with an explicit **Insert into editor** button. Generation never silently replaces the live editor text — matching the existing Apply/Skip discipline for review patches.
- `#generate-btn` toggles a panel mounted next to the Review panel in `#preview-container`; Review and Generate are mutually exclusive (opening one hides the other), same toggle pattern as the existing Review button.

**Why generation is a full-file replace, not a patch**

The `{find, replace}` patch shape used by review/repair is deliberately scoped to cosmetic fixes — its own prompt instructs providers not to add or remove nodes. Generation has no existing structure to patch against, so it always produces (and, on later structural amendments like "add an approval step," would regenerate) a complete file, with the **Insert into editor** action making the replacement an explicit, reversible user choice rather than an automatic overwrite.

## Testing

- `packages/review/test/generateDiagram.test.ts`: valid-on-first-draft (manual provider), fallback into repair (scripted provider), `budget_exhausted`, and the "provider doesn't support generation" error.
- `packages/cli/test/generate.cli.test.ts`: JSON shape, `-o` written only on success, `budget_exhausted` exit code, empty-description rejection. `packages/cli/test/args.test.ts` covers argv parsing, including the "quote the whole description" hint.
- `apps/web/test/e2e/generate-panel.spec.ts` (Playwright, real browser): the offline-skeleton path end to end — open panel, describe, generate, see the valid badge, insert into the editor, confirm the live preview renders — plus a check that Review/Generate panels are mutually exclusive. This is also how the feature was verified manually, since no API keys were available in the build environment.

## Out of scope (deferred)

- Multi-turn conversational refinement ("now split that into two lanes") — provider calls are single-shot; a real conversation needs a history object threaded through the registry.
- CLI/agent structural amendment of an existing file via generation (today an agent would call `generate` again with an updated description and diff the result itself).
