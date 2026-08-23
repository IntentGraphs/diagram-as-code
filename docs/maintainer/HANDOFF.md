# Session handoff — 2026-08-20

_Resume here._ Product truth: `docs/STATUS.md`. Numbered items: `docs/maintainer/ROADMAP.md`.

## Workspace

| | |
|---|---|
| Branch | `main` at the current direction/pagination integration snapshot; direction, semantic pagination, PPTX/DOCX export hardening, and CLI diagnostics are committed. |
| Release snapshot | The clean public snapshot targets `v1.0.0`; the earlier private workspace history is intentionally not copied into the public repository. |
| Tests | Current integration verification: 95 test files and 778 tests PASS, all 26 workspace builds PASS, style PASS, and `git diff --check` PASS. The older coverage/Playwright/clean-install evidence remains recorded below; full exact-snapshot, consumer, and prerelease verification is still required. |
| Remote | The staging workspace remains on its existing remote. The clean public snapshot targets `https://github.com/IntentGraphs/diagram-as-code.git`; GitHub visibility, Pages, branch rules, and security settings remain owner-controlled setup steps. |
| Merge status | No feature merge is pending on `main`; direction, pagination, export-hardening, and CLI follow-up commits are present in the integration history. The three older WIP histories are archived locally under `archive/...` branch names. The linked QA worktree is preserved at `.worktrees/archive-mindmap-browser-qa` with its untracked QA artifacts. |

Do not start from `docs/archive/ASSESSMENT-HANDOFF.md` for current status; that brief is a v1.0.0 architecture overview.

## Done (roadmap 1–11, 14–16; 15a–15c)

| Item | What shipped |
|---|---|
| 1 | BPMN legality → `semanticErrors` (`packages/parser/src/bpmnLegality.ts`) |
| 2 | CLI `check`/`validate` / `render` / `export` / read-only `review` / explicit `fix` / `generate` / `import` / `freeze` / `capabilities`, with stable `--json`, stdin, aliases, typed help metadata, changed-file SARIF, and atomic writes |
| 3 | BPMN PathMap event icons |
| 4 v1 | Text-mode IndexedDB projects (`apps/web/src/project/`). Diagram-mode `.bpmn` **not** stored. |
| 5 | `docs/BPMN-GAP-SURVEY.md` |
| 6 v1 | `camundaClass` / `camundaExpression` / `camundaFormKey` export |
| 7 | Mixed `at (x,y)` pins + nested manual subprocess content |
| 8 | `@bpm/validate` |
| 9 | Actionable overlap shift hints |
| 10 | Text-only `repairDiagram()` when `validate()` is blocking; CLI `--max-attempts`; web Apply/Skip |
| 11 | Prompt template committed; review panel split (`reviewProviders.ts`); `bpm render` stdout-default; stray `out.svg` gone |
| 14 | `generateDiagram()` (`@bpm/review`) drafts a `.bpm` file from a description, falls back into the item-10 repair loop when invalid. CLI `bpm generate`; web **Generate** panel (offline/ollama/openai). Design: `docs/superpowers/specs/2026-08-17-ai-diagram-generation-design.md` |
| 15a | Mindmap family: `diagram: mindmap`, indentation-nested tree grammar, left-to-right layout, SVG and lossy draw.io XML export. Design: `docs/superpowers/specs/mindmap-hardening-spec.md`. |
| 15b | Flowchart family: `diagram: flowchart`, box/decision grammar, layered orthogonal layout, SVG and lossy draw.io XML export. Design: `docs/superpowers/specs/2026-08-18-flowchart-diagram-family-design.md`. |
| 15c | Architecture family: `diagram: architecture`, C4-style containment grammar, layered orthogonal layout, SVG, lossy draw.io XML, and project-specific C4 JSON export. No architecture-specific design spec was found under `docs/superpowers/specs/`. |
| 16 | One-shot, reviewable **Import to Text** (Diagram mode → `.bpm` text). New `@bpm/print-dsl` (AST → text) and `@bpm/import-xml` (BPMN XML → AST, via `bpmn-moddle`); `verifyExportedXml()` corruption gate on Diagram-mode Save/Export (also partially resolves item 12); web Import-to-Text panel + CLI `bpm import` (`import-diagram` remains compatible). Design + post-implementation findings: `docs/superpowers/specs/2026-08-17-diagram-mode-text-import-design.md`. |

Also shipped with this work (not numbered as their own items): BPMN **task subtypes** (`userTask` … `scriptTask`).

Also shipped: the family-neutral AI capability contract. BPMN retains generation, repair, and visual review; non-BPMN families fail closed with structured unsupported results until family-specific prompts and validation/geometry contracts are implemented.

Engineering review artifacts: [docs/maintainer/ENGINEERING-REVIEW.md](ENGINEERING-REVIEW.md) and the editable [docs/architecture.drawio](../architecture.drawio). The review identifies async render races, silent persistence failures, inconsistent snapshots, provider cancellation gaps, type/controller debt, missing quality gates, release/legal gaps, and residual layout-quality debt.

## Pending — pick next

**Direction/lane orientation** — complete (shared contract, BPMN vertical lanes, flowchart/mind-map directions, CLI/web/PPTX diagnostics, and integration fixes). Do not reopen this as new implementation work; include its fixtures in item 18m's cross-family acceptance corpus.

**Pagination/export status** — implementation is substantially complete for BPMN semantic pagination, multi-slide editable PPTX, and CLI-only vector-backed multi-page DOCX. Strict-fit, continuation structure, DOCX page-size, resource-limit, and exporter-code diagnostics are hardened. The remaining gate is 18m real-consumer and cross-export verification; tile/hybrid pagination, PDF, and native Word-shape DOCX remain deferred.

**Recommended next order** — 18m P0 contract corpus and real-consumer/export verification; 16a external BPMN web import; the remaining 18n discriminated command/service layer and standalone package decision; 18o web loading-state consistency; 18f layout calibration and 18l browser evidence; 17a exact release snapshot; 18p page/canvas contracts; then post-v1 family and Gantt AI expansion.

**Known issues after the release snapshot** — the historical large-document
render freeze and renderer-specific PPTX fidelity limitations remain recorded
in [`KNOWN-ISSUES-2026-08-19.md`](KNOWN-ISSUES-2026-08-19.md). The
live-editor resource guard and render-dependent action gating are now
implemented on this branch with focused browser coverage. PPTX projection now
scales editable text, rejects diagrams that would become too dense, and has
editable OOXML geometry/font regression coverage; pixel-identical renderer
fidelity is outside the declared v1 projection promise. The reported
Diagram-mode reload/crash is still unconfirmed and needs a real-browser trace.

**18a–18k. Engineering stability** — shipped locally: render revision/snapshot protection, snapshot-based structured exports, visible IndexedDB save failures with retry, atomic IndexedDB writes with rollback coverage, timeout/cancellation/response bounds for browser and Node AI providers, bounded XML import and seeded mutation tests, typed parser/ELK/render/architecture/review boundaries, stricter compiler checks, tested render/project/diagram controller seams, thresholded source coverage, layout-quality grading, truthful download failure handling, least-privilege CI, dependency review, CodeQL, and the bounded internal PPTX `image-size` compatibility package. Current release work also includes the bounded Gantt family, editable PPTX projection, semantic BPMN pagination, vector-backed multi-page DOCX, strict-fit and continuation validation, export resource limits, live-render resource limits, render-dependent action gating, and structural diagnostics. Verification is tracked by the current full workspace suite/build/style checks plus the remaining exact-snapshot and consumer gates. Organization-side repository settings remain the gate before changing visibility.

**17e. Launch messaging and adoption** — shipped locally: public audience/promise, five-minute CLI/browser path, draw.io/bpmn-js migration guide, comparison positioning, explicit fidelity/storage/AI/platform expectations, contributor Dev Container, and the README hello-diagram screenshot. The clean public snapshot uses the `diagram-as-code` Pages path; enabling Pages remains an owner-controlled setup step.

**12. Diagram mode XML corruption** — partially addressed: item 16's T2 shipped the round-trip validation gate this item called for (`verifyExportedXml()`), gating Save/Export. Still open: reproduce the *specific* historical corruption(s) that motivated this item against the currently pinned `bpmn-js` version, and check for an upstream fix. See `docs/maintainer/ROADMAP.md` item 12 for the updated status.

**13. Manual editor UX candidates** — survey list, not a build. Align/distribute, space tool, snapping, on-demand connector tidy, XML tab, version history, comment-only review. Each needs its own design pass. Overlaps item 7.

**v2 candidate from item 16**: diff-based partial pinning for imported diagrams (option set 3, choice C in the item 16 design doc) — only pin nodes that actually moved from where auto-layout would place them, instead of always emitting `positioning: manual` for every node. Worth revisiting once the always-manual v1 has shipped and is trusted in practice.

## Deferred (do not treat as next)

- **Item 4 v2:** Diagram-mode blobs in the project store, multi-project picker, version history. Text-project export/import bundles shipped in the current web portability work.
- **Item 6 extras:** `delegateExpression`, assignee/candidates, Camunda 8 `zeebe:`, `isExecutable`.
- **Gap survey follow-ons:** event payloads, throw events, loops/MI, compensation, etc. (`docs/BPMN-GAP-SURVEY.md`).
- **Layout:** residual crossings, per-lane uniform height (`docs/STATUS.md` known limitations); item 16's documented cross-renderer subprocess-geometry limitation (see its design doc's findings section) is in this same category.
- **Explicitly not planned:** continuous/automatic Diagram-mode ↔ text sync (item 16 shipped the one-shot direction only — see `docs/maintainer/ROADMAP.md`'s "Explicitly not planned" section for what's still rejected and why).

## How to resume

1. Read this file, then the chosen item in `docs/maintainer/ROADMAP.md`.
2. The 15a–15c implementation artifacts and family notes/specs are recorded above; no family item is currently pending.
3. For item 12's remaining investigation: start with `apps/web/src/diagramMode.ts` (now has `verifyExportedXml()`) and `docs/STATUS.md`'s Diagram mode paragraph.
4. Verify with `npm test`; for CLI-only work, `npm run build:cli` rebuilds the complete dependency closure before real-binary checks. The full `npm run build` remains the web-inclusive gate.
5. Do not commit secrets or push any branch unless asked.
