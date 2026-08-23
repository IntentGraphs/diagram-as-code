# AI diagram review and generation

Optional in-repo review, repair, and generation on top of `@bpm/validate` and SVG/PNG render.

```bash
npm run bpm -- review examples/getting-started/hello.bpm --provider manual
npm run bpm -- review examples/getting-started/hello.bpm --provider manual --image-out /tmp/review.png
```

## Providers

| Id | Status |
|---|---|
| `manual` | Shipped — geometry findings only (CI-safe, no network). No repair patches. |
| `ollama` | Shipped — PNG to a local Ollama vision model for valid diagrams (default: `llava`); text-only repair when invalid. Set `BPM_OLLAMA_MODEL` / `BPM_OLLAMA_URL` |
| `openai` | Shipped — OpenAI-compatible BYOK. Vision review when valid; text-only repair when invalid. Set `OPENAI_API_KEY`, optionally `OPENAI_BASE_URL` and `BPM_OPENAI_MODEL` |

## Two paths

**Valid diagram (warnings only, or clean):** existing image review. Rasterize SVG → PNG, send to the provider, collect visual findings. Optional `{ find, replace }` patches use the same shape as the web Apply/Skip UI.

**Blocking `validate()` failure** (`valid: false` from `errors` or `semanticErrors`): text-only repair. No PNG. The provider receives the source plus structured `{line, column, message}` issues and returns find/replace patches. `repairDiagram()` applies them and re-validates, up to `--max-attempts` (default 3). Result status is `valid` or `budget_exhausted`.

```bash
# Invalid file: review is read-only and reports repair.status / attempts / repairedText.
# Add --json for machine output; the source file is not overwritten.
npm run bpm -- review packages/cli/test/fixtures/repairable.bpm --provider ollama --max-attempts 3 --json

# Apply a repair only through an explicit output path; the source file is never overwritten.
npm run bpm -- fix packages/cli/test/fixtures/repairable.bpm --provider ollama --max-attempts 3 -o repaired.bpm
```

`manual` never emits patches, so an invalid file with `--provider manual` reports `budget_exhausted` after one attempt.

## Generate a diagram from a description

`generateDiagram()` (`@bpm/review`) drafts a full `.bpm` file from a plain-language description instead of fixing an existing one: it calls `provider.generate(description)` for a draft, runs it through `@bpm/validate`, and — if the draft is invalid — hands off into the same `repairDiagram()` loop used above, so a broken first draft gets one more chance to self-correct before it ever reaches you.

```bash
npm run bpm -- generate "customer submits an order, we check stock, ship if available, otherwise notify them" --provider manual
npm run bpm -- generate "loan application with credit check and approval" --provider openai -o loan.bpm
npm run bpm -- generate "loan application with credit check and approval" --provider openai --positioning manual -o loan-manual.bpm
npm run bpm -- generate "loan application with credit check and approval" --provider openai --positioning manual --visual-review -o loan-reviewed.bpm
```

Providers:

| Id | `generate()` behavior |
|---|---|
| `manual` | Deterministic single-task skeleton (start → one task named from the description → end). No network; CI-safe; exists so the generate→validate→insert plumbing is testable without a model. |
| `ollama` | Sends the description to a local Ollama model with a grammar-grounded system prompt (condensed from `docs/LANGUAGE.md`); returns raw `.bpm` source. |
| `openai` | Same prompt, OpenAI-compatible BYOK. |

The generation prompt intentionally leaves `layout:`/`positioning: manual` unset. Generation therefore uses auto-layout by default, never asking the model to hand-compute coordinates. An explicit `--positioning manual` option is available as a post-generation freeze: the validated auto-layout geometry is serialized into the DSL's actual coordinate frames, and resolved route interiors become `via` points where safe. Manual geometry repair runs within a bounded budget, and `--visual-review` optionally renders the result and sends it through the provider's existing PNG review path. Use `bpm freeze <file.bpm>` for the same conversion on an existing valid source. See `docs/MANUAL_LAYOUT_AI.md` for the complete contract.

**Multi-participant descriptions get one pool, not several.** The prompt's own rule collapses every named role/department into lanes of a single `pool` (§4 of `docs/LANGUAGE.md`) rather than one `pool` per participant — so a generated diagram essentially never has a legitimate use for the message-flow arrow (`~>`, meant for communication *between* two different pools). The prompt says so explicitly and forbids `~>` in a single-pool diagram, including for steps that feel asynchronous ("Warehouse triggers Finance") — those are ordinary cross-lane sequence flows. This was tightened after an observed generation used `~>` for a same-pool cross-lane edge, which `@bpm/parser`'s legality checks don't currently catch (there's no rule requiring message-flow endpoints to be in different pools) but is not standards-compliant BPMN. If a future description genuinely needs multiple pools (two separate organizations), that's currently unhandled by the generation prompt — it would need its own worked example before `~>` could be trusted.

**Web editor**: a **Generate** toolbar button (next to **Review**) opens a panel with a description box and the same provider settings as Review, plus an **offline skeleton** option that needs no API key. It never overwrites the editor's text automatically — it shows the draft and an explicit **Insert into editor** button, matching the Apply/Skip discipline used for review patches. If a draft comes back invalid, the browser (like Review) runs one repair pass, not the full bounded retry loop the CLI runs.

Remote browser requests use a 30-second timeout, a 1 MB response limit, and a visible **Cancel** action. OpenAI-compatible requests can send the source text and, for visual review, a rendered PNG to the configured endpoint. Ollama uses the configured local endpoint by default. Web AI credentials are stored in browser session storage by default; Settings provides an explicit opt-in to persist the key in local storage on a private device. Review, Generate, and the Diagram agent share the same setting. CLI cloud providers read keys from environment variables only. Project editor content is stored in IndexedDB; the application has no default telemetry.

**Why this isn't just a bigger "patch"**: the review/repair `{find, replace}` patch shape is deliberately restricted to cosmetic fixes on an *existing* file (its own prompt says not to add/remove nodes). Generation always produces a complete replacement file, never a patch — there's no existing structure to patch against, and later structural amendments ("add an approval step") should regenerate the whole file with the prior source as context rather than trying to extend patches to do something they were built to avoid.

## Usage with cloud/local providers

```bash
# Ollama (requires local Ollama with a vision model for image review)
npm run bpm -- review my-diagram.bpm --provider ollama

# OpenAI (requires OPENAI_API_KEY env var)
OPENAI_API_KEY=sk-... npm run bpm -- review my-diagram.bpm --provider openai
```

## Web editor

The Review panel shows blocking errors as well as geometry warnings. **Run AI Review** on an invalid file calls the text repair path (no SVG required) once and shows patches in the existing Apply / Skip / Apply All UI. The browser does not run `repairDiagram()`'s retry loop — apply a patch, then run review again if the file is still invalid. `--max-attempts` is CLI-only.

Default Ollama model is `llava` (vision). For text-only repair, set `BPM_OLLAMA_MODEL` to a text model.

## Privacy

- No API keys in the repository.
- CLI cloud providers read keys from environment variables only.
- Core packages (`parser`, `layout*`, `render`, `validate`) do **not** depend on `@bpm/review`.

## Related

- External agent PNG loop (no in-repo LLM): `docs/CLI.md` vision loop section
- Language and capability boundaries: `docs/LANGUAGE.md` and `docs/STATUS.md`
