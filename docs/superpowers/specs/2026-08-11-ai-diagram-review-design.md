# AI Diagram Review — Design

_Date: 2026-08-11. Phase B of the manual-controls / AI-review program. Companion plan: [`../plans/2026-08-11-ai-diagram-review.md`](../plans/2026-08-11-ai-diagram-review.md)._

## 1. Problem

`@bpm/validate` catches geometry defects as JSON, and `bpm render --format png` plus CLI docs let an **external** agent eyeball a PNG. There is still no in-repo optional review API that: bundles validation + geometry + images, calls a pluggable vision/text provider, and returns structured visual findings with optional `.bpm` fix suggestions.

## 2. Goal

Add `@bpm/review` and `bpm review` (plus optional web UI) that:

1. Run the existing deterministic pipeline (parse → layout → validate → SVG → PNG).
2. Optionally call a **ReviewProvider** (manual/no-op, local HTTP, Ollama, BYOK cloud).
3. Return structured findings without changing `.bpm` grammar.

Grammar improvements stay in Phase A. Phase B must work without Phase A; if Phase A exists, providers may suggest `via` / `size` / label attrs in `suggestedFix` text.

## 3. Relationship to prior vision-loop work

The 2026-08-10 vision-agent-loop design deferred in-repo LLM calls and documented an external-agent PNG loop. **Phase B deliberately supersedes that deferral** for an *optional* in-repo review path. Keep the external PNG loop documented; add `docs/AI_REVIEW.md` for the new path. Update CLI.md so both loops are listed without contradiction.

## 4. Non-goals

- Changing parser/AST grammar
- Core packages depending on `@bpm/review`
- Storing API keys in the repo or in committed config
- Requiring cloud providers for CI (CI uses manual/no-op only)
- Auto-applying suggested fixes to files without an explicit user/agent write

## 5. Package & dependency rules

```
@bpm/review  →  parser, layout, layout-core, render, validate, (cli resvg or shared png helper)
parser | layout* | render | validate  ↛  @bpm/review
```

Provider SDKs are **optional peer dependencies** or dynamically imported so default `npm install` / CI does not require cloud credentials or heavy SDKs.

## 6. Public API

```ts
export interface ReviewProvider {
  readonly id: string;
  review(bundle: ReviewBundle, options?: ProviderOptions): Promise<VisualFinding[]>;
}

export interface ReviewBundle {
  text: string;
  validation: ValidationResult;
  positioned: PositionedDiagram;
  svg: string;
  png: Uint8Array;
  meta: { nodes: Array<{ id: string; kind: string; label: string }>; edges: Array<{ id: string; sourceId: string; targetId: string; label?: string }> };
}

export interface VisualFinding {
  severity: 'error' | 'warning' | 'note';
  category:
    | 'label_clipping'
    | 'label_overlap'
    | 'edge_through_node'
    | 'edge_crossing'
    | 'crowding'
    | 'unbalanced_layout'
    | 'ambiguous_routing'
    | 'text_unreadable'
    | 'other';
  nodeIds?: string[];
  edgeIds?: string[];
  message: string;
  suggestedFix?: string;
  confidence?: number;
  source: 'geometry' | 'model';
}

export interface DiagramReviewResult {
  /** Same meaning as ValidationResult.valid (parse+layout succeeded). Visual issues never clear this. */
  validation: ValidationResult;
  visualFindings: VisualFinding[];
  providerId: string;
}

export function reviewDiagram(
  text: string,
  options?: {
    provider?: string;
    layout?: LayoutOptions;
    providerOptions?: ProviderOptions;
  },
): Promise<DiagramReviewResult>;
```

### 6.1 Finding merge rules

1. Always run `@bpm/validate` and map known geometry warnings/metrics into `visualFindings` with `source: 'geometry'` (stable messages).
2. Call provider only if `validation.valid === true` **or** options say `reviewInvalid: true` (default: skip model when invalid).
3. Provider findings use `source: 'model'`. Dedupe loosely by category+nodeIds+edgeIds when identical.

## 7. Providers (order of delivery)

| Id | Role |
|---|---|
| `manual` | No-op / fixture findings for tests; default in CI |
| `local` | POST multipart/JSON to user URL (SVG/PNG + meta) |
| `ollama` | Local vision/chat endpoint |
| `google` | Gemini BYOK via `BPM_GOOGLE_API_KEY` / `GOOGLE_API_KEY` |
| `openai` | OpenAI BYOK via `BPM_OPENAI_API_KEY` / `OPENAI_API_KEY` |
| `anthropic` | Optional later via `BPM_ANTHROPIC_API_KEY` |

Prompt/checklist contract lives in package (`prompt.ts`) and is mirrored in `docs/AI_REVIEW.md`.

## 8. CLI

```bash
npm run bpm -- review file.bpm [--provider manual|local|ollama|google|openai] [--image-out review.png] [--json]
```

- Exit `0` if `validation.valid` and no `severity: 'error'` visual findings; else `1`.
- Keys **only** from environment (never flags that echo secrets in shell history docs as primary).
- `--image-out` writes the PNG bundle image.

## 9. Web (optional slice)

- Review button + provider select + findings panel.
- API keys: user-entered; persist only if user checks “remember in localStorage”; never log keys.
- Document in SECURITY.md.

## 10. Size / safety limits

Reuse validate caps (100k chars / 500 nodes / 1000 edges). Refuse review with a clear error if over limit. Do not send source to a cloud provider when `validation.valid === false` unless opted in.

## 11. Success criteria

- `@bpm/review` + `manual` provider tested without network.
- `bpm review --provider manual --json` works on `examples/getting-started/hello.bpm`.
- Dependency lint or package.json review shows no core → review edges.
- `docs/AI_REVIEW.md` covers BYOK, local/Ollama, privacy.
