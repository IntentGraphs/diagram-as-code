# AI Diagram Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `@bpm/review` with pluggable providers, `bpm review` CLI, docs, and a minimal web Review panel — without changing `.bpm` grammar or making core packages depend on review.

**Architecture:** `reviewDiagram(text)` builds a deterministic `ReviewBundle` (validate + positioned + SVG + PNG + meta), maps geometry warnings into findings, then calls a `ReviewProvider`. Providers are registered by id; cloud SDKs load only when selected.

**Tech Stack:** TypeScript, Vitest, existing validate/layout/render, `@resvg/resvg-js` (PNG), optional HTTP fetch to local/Ollama/BYOK APIs.

**Spec:** `docs/superpowers/specs/2026-08-11-ai-diagram-review-design.md`

## Global Constraints

- `packages/parser|layout*|render|validate` must **not** depend on `@bpm/review`.
- No grammar changes in this plan (Phase A is separate).
- No API keys in repo; env-only for CLI; web keys only by explicit user opt-in to localStorage.
- CI uses `--provider manual` only (no network).
- Supersede the “no in-repo LLM” deferral in vision-loop docs by documenting both loops in `docs/AI_REVIEW.md` + CLI.md.
- Reuse validate size limits; refuse oversize reviews.

## File map

| Path | Role |
|---|---|
| `packages/review/` | New package |
| `packages/cli/src/commands/review.ts` | CLI |
| `apps/web/src/*` | Optional Review UI |
| `docs/AI_REVIEW.md` | User docs |
| `docs/CLI.md`, `SECURITY.md` | Cross-links |

**Branch:** `feature/ai-diagram-review` (separate worktree from Phase A).

---

### Task 1: Scaffold `@bpm/review` package

**Files:**
- Create: `packages/review/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`

```json
{
  "name": "@bpm/review",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/parser": "*",
    "@bpm/layout": "*",
    "@bpm/layout-core": "*",
    "@bpm/render": "*",
    "@bpm/validate": "*",
    "@resvg/resvg-js": "^2.6.0"
  }
}
```

- [ ] **Step 1: Create package files** and add workspace visibility (root workspaces already include `packages/*`).

- [ ] **Step 2: Export empty `reviewDiagram` throwing `not implemented`**

- [ ] **Step 3: `npm install` && `npm run build -w @bpm/review`**

- [ ] **Step 4: Commit** `feat(review): scaffold @bpm/review package`

---

### Task 2: Types + manual provider

**Files:**
- Create: `packages/review/src/types.ts`, `providers/manual.ts`, `registry.ts`
- Test: `packages/review/test/manual.test.ts`

- [ ] **Step 1: Implement types** from spec §6 (`ReviewBundle`, `VisualFinding`, `DiagramReviewResult`, `ReviewProvider`).

- [ ] **Step 2: Manual provider** returns `[]` findings (or optional fixture via options).

- [ ] **Step 3: Registry** `getProvider('manual')`.

- [ ] **Step 4: Tests** — registry resolves manual; unknown id throws.

- [ ] **Step 5: Commit** `feat(review): add ReviewProvider types and manual provider`

---

### Task 3: Deterministic bundle + geometry findings

**Files:**
- Create: `packages/review/src/bundle.ts`, `geometryFindings.ts`
- Implement: `packages/review/src/reviewDiagram.ts`
- Test: `packages/review/test/reviewDiagram.test.ts`

- [ ] **Step 1: Failing test** — `reviewDiagram(hello)` with manual provider: `validation.valid === true`, PNG magic bytes in bundle path, geometry findings array defined.

- [ ] **Step 2: Implement bundle** — validate → if oversize, return early; layout+render SVG; rasterize PNG with resvg; build meta ids/labels.

- [ ] **Step 3: Map validate warnings/metrics** to `VisualFinding` with `source: 'geometry'` (crossings, overlaps, through-node, overshoots).

- [ ] **Step 4: Call provider** only when valid (unless `reviewInvalid: true`).

- [ ] **Step 5: Commit** `feat(review): build review bundle and map geometry findings`

---

### Task 4: Prompt contract module

**Files:**
- Create: `packages/review/src/prompt.ts`
- Test: assert checklist strings exported / snapshot

- [ ] **Step 1: Encode checklist** from spec (label clipping, overlap, edge through node, crowding, unbalanced, ambiguous routing, unreadable text).

- [ ] **Step 2: `buildProviderPrompt(bundle)`** returns text instructions + compact meta JSON (not full SVG in the string if huge — attach image separately for vision providers).

- [ ] **Step 3: Commit** `feat(review): add review checklist prompt contract`

---

### Task 5: Local HTTP provider

**Files:**
- Create: `packages/review/src/providers/local.ts`
- Test: mock `fetch` returning JSON findings

**Interfaces:**
- Options: `{ url: string }` from `BPM_REVIEW_URL` or providerOptions.
- POST JSON `{ prompt, meta, validation }` + optional PNG base64 field `imageBase64`.
- Expect response `{ findings: VisualFinding[] }` (ignore unknown fields).

- [ ] **Step 1: Failing test with mocked fetch**

- [ ] **Step 2: Implement + register `local`**

- [ ] **Step 3: Commit** `feat(review): add local HTTP review provider`

---

### Task 6: Ollama provider

**Files:**
- Create: `packages/review/src/providers/ollama.ts`

- [ ] **Step 1: Implement** against Ollama chat/generate HTTP API (model from `BPM_OLLAMA_MODEL`, host `BPM_OLLAMA_HOST` default `http://127.0.0.1:11434`).

- [ ] **Step 2: Parse model JSON** findings defensively (on failure → one `note` finding with parse error, don’t throw away geometry findings).

- [ ] **Step 3: Unit test** with mocked fetch.

- [ ] **Step 4: Commit** `feat(review): add Ollama review provider`

---

### Task 7: BYOK Google + OpenAI providers

**Files:**
- Create: `providers/google.ts`, `providers/openai.ts`
- Optional peerDependencies in package.json — **do not** add heavy SDKs if raw `fetch` suffices.

- [ ] **Step 1: Read API keys** from env (`BPM_GOOGLE_API_KEY` / `GOOGLE_API_KEY`, `BPM_OPENAI_API_KEY` / `OPENAI_API_KEY`). Missing key → clear error finding/throw before network.

- [ ] **Step 2: Send** prompt + PNG (inline data) per each API’s multimodal shape; parse findings JSON.

- [ ] **Step 3: Mocked-fetch tests** (no real network in CI).

- [ ] **Step 4: Commit** `feat(review): add Google and OpenAI BYOK providers`

---

### Task 8: CLI `bpm review`

**Files:**
- Modify: `packages/cli/src/args.ts`, `bin.ts`
- Create: `packages/cli/src/commands/review.ts`
- Test: `packages/cli/test/review.cli.test.ts`
- Modify: `packages/cli/package.json` dependency on `@bpm/review`

- [ ] **Step 1: Failing CLI test** — `review` on fixture with `--provider manual --json` exits 0 and prints `validation` + `visualFindings`.

- [ ] **Step 2: Implement** `--provider`, `--image-out`, `--json`, exit codes per spec.

- [ ] **Step 3: Wire `npm run bpm -- review …`**

- [ ] **Step 4: Commit** `feat(cli): add bpm review command`

---

### Task 9: Docs — AI_REVIEW + CLI + SECURITY + vision-loop note

**Files:**
- Create: `docs/AI_REVIEW.md`
- Modify: `docs/CLI.md`, `SECURITY.md`
- Modify: `docs/superpowers/specs/2026-08-10-vision-agent-loop-design.md` (short “Supersession” note pointing to Phase B)

- [ ] **Step 1: Write AI_REVIEW.md** — providers, env vars, privacy, relationship to validate + external PNG loop.

- [ ] **Step 2: CLI.md** — `bpm review` section.

- [ ] **Step 3: SECURITY.md** — BYOK / web key storage rules.

- [ ] **Step 4: Commit** `docs: add AI diagram review guide`

---

### Task 10: Web Review panel (optional but in-plan)

**Files:**
- Modify: `apps/web/src/main.ts`, `index.html`
- Create: `apps/web/src/reviewPanel.ts`
- E2E: Playwright smoke — open panel, run manual provider if bundled, or skip cloud.

**Constraints:**
- Provider select; key fields only for cloud; “Remember key” checkbox default **off**.
- Findings list from `reviewDiagram` (bundle review in browser: prefer calling validate+render locally; PNG via existing pipeline or skip model and show geometry-only unless provider is manual).

**Note:** Browser cannot use Node `resvg` — for web, either geometry-only review or call a local endpoint. **Locked for this task:** web uses geometry findings from validate + optional `local` provider URL; cloud BYOK in web may send SVG/PNG from client-side canvas rasterization **or** document “cloud review is CLI-only in v1”.

**Decision for implementer (locked here):** **Cloud BYOK review is CLI-first;** web v1 = geometry findings panel + optional POST to user `local` URL with SVG text. Avoid embedding cloud keys in browser until a follow-up design.

- [ ] **Step 1: Geometry findings panel** from `validate()` in the browser pipeline.

- [ ] **Step 2: Optional local URL field** + fetch findings.

- [ ] **Step 3: Playwright** smoke for panel open.

- [ ] **Step 4: Commit** `feat(web): add geometry review findings panel`

---

### Task 11: ROADMAP / STATUS + full verify

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/STATUS.md`

- [ ] **Step 1: Mark Phase B deliverables**

- [ ] **Step 2: Verify**

```bash
npm test
npm run bpm -- review examples/getting-started/hello.bpm --provider manual --json
```

- [ ] **Step 3: Confirm** `npm ls` / package.json: no `validate` → `review` dependency.

- [ ] **Step 4: Commit** `docs: record AI diagram review in STATUS and ROADMAP`

---

## Spec coverage

| Spec item | Task |
|---|---|
| Package + types | 1–2 |
| Bundle + geometry | 3 |
| Prompt | 4 |
| local / ollama / BYOK | 5–7 |
| CLI | 8 |
| Docs / vision supersession | 9 |
| Web | 10 |
| STATUS/ROADMAP | 11 |

## Execution

1. Prefer completing **Phase A** (or at least A1–A4) before expecting rich `suggestedFix` text from models.
2. Use branch `feature/ai-diagram-review`.
3. Run Tasks 1→11 in order; Task 10 may be deferred if CLI+docs are the MVP — if deferred, note in STATUS.

## MVP cut line (if time-boxed)

**Must ship:** Tasks 1–4, 8–9, 11.  
**Should ship:** Tasks 5–6.  
**Nice:** Tasks 7, 10.
