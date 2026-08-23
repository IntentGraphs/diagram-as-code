# Assessment Handoff — bpm workspace

_Audience: external assessment LLM or human reviewer._
_Version context: architecture brief originally written for `v1.0.0` (2026-08-10). **This is a historical architecture brief; current public product truth is `docs/STATUS.md` for the clean `v1.0.0` snapshot.** Session resume / done vs pending: `docs/maintainer/HANDOFF.md`._

**Suggested reading order:** `docs/maintainer/HANDOFF.md` → `docs/STATUS.md` → this document for architecture maps → (as needed) `docs/LANGUAGE.md` → named workflow files in §7 → `docs/maintainer/ROADMAP.md` for open gaps.

---

## 1. What this workspace is used for

**bpm** is a text-based BPMN 2.0 diagramming tool. You write a process as plain text (Mermaid-like authoring), and the system lays it out and renders a proper BPMN diagram in the browser — with automated swimlane layout, SVG preview, and standard BPMN 2.0 XML export.

Primary uses:

- **Human authoring** — type process text in a split-pane editor; see live SVG.
- **Agent / LLM authoring** — generate `.bpm` text, then self-check via `@bpm/validate` or `npm run bpm -- validate` (structured JSON: errors, warnings, geometry metrics).
- **Interchange** — export BPMN 2.0 XML (semantic model + BPMNDI) that opens in bpmn-js / Camunda-style modelers.
- **Visual BPMN editing (second path)** — Diagram mode embeds the real `bpmn-js` Modeler for drag-and-drop; an explicit **Import to Text** action previews a one-shot conversion, but there is no continuous sync.

This is an npm workspaces monorepo (`packages/*`, `apps/*`). Packages are not published to npm; the project is versioned as a whole via git tags.

---

## 2. Main solutions

| Solution | What it delivers |
|---|---|
| **Text → diagram pipeline** | Custom BPM language → parse → AST → layout → SVG (and optionally BPMN XML). |
| **Pluggable layout** | Auto-detect `swimlane` vs `flat`; optional `layout:` override; opt-in `positioning: manual` with `at (x, y)`. |
| **Shared edge routing & geometry checks** | Orthogonal visibility-graph router in `@bpm/layout-core`; `analyzeLayout` for overlaps, edge-through-node, edge-edge crossings. |
| **Full BPMN 2.0 notation coverage (M2)** | Events (13 triggers × categories), 5 gateway types, tasks/subprocesses/transactions/call activities, data artifacts, 5 flow types, pools/lanes, boundary events. |
| **Web editor** | Text mode (live pipeline) + independent Diagram mode (`bpmn-js`); SVG and BPMN XML download. |
| **CLI + validate API** | `validate` / `render` / `export` for scripts and agents (`docs/CLI.md`). |
| **Language reference for generators** | `docs/LANGUAGE.md` — grammar, indentation rules, auto vs manual positioning, first-attempt guidance for LLMs. |

---

## 3. How it works

### 3.1 End-to-end data flow (text path)

```
.bpm text
  → @bpm/parser  (+ @bpm/ast types)
  → @bpm/layout  (facade)
       ├─ positioning: manual  →  @bpm/layout-engine-manual
       ├─ layout: swimlane / auto (pools+lanes)  →  @bpm/layout-engine-swimlane
       └─ layout: flat / default                →  @bpm/layout-engine-flat
            (both auto engines use @bpm/layout-elk-base → ELK.js)
  → shared post-pass: positionBoundaryEvents (+ pinned-node override when used)
  → @bpm/layout-core routing (orthogonal stubs + visibility graph + Dijkstra)
  → @bpm/render → SVG
  → and/or @bpm/export-xml → BPMN 2.0 XML (+ BPMNDI)
  → apps/web preview  |  @bpm/cli / @bpm/validate
```

Web text mode wires this in `apps/web/src/pipeline.ts`: `parse` → `layout` → `render`.

### 3.2 Engine selection

- Optional first-line directives: `layout: swimlane|flat`, `positioning: manual` (not combined with `layout:`).
- No directive: **swimlane** if the diagram has ≥1 pool with ≥1 lane; else **flat**.
- Unknown `layout:` names fail at **layout** time, not parse time.
- Without `positioning: manual`, individual nodes may still carry optional `at (x, y)` pins; the facade strips pins, runs auto-layout, then re-applies pins (`overridePinnedNodes`).

### 3.3 Diagram mode (separate authoring path)

`apps/web/src/diagramMode.ts` embeds `bpmn-js` `Modeler` (New / Open `.bpmn` / Save / Export SVG). Its Save/Export path is gated by `verifyExportedXml()`; **Import to Text** performs a one-shot, preview-and-confirm conversion into `.bpm` text. Treat text mode and Diagram mode as two independent authoring paths, not a continuously round-tripping editor.

### 3.4 Agent feedback loop

```
generate .bpm → validate(text) → { valid, errors, warnings, metrics, inspection }
             → fix text → re-validate → render / export when clean enough
```

`valid: true` means parse + layout succeeded; geometry problems surface as **warnings** + numeric **metrics** (crossings, overlaps, edge-through-node, overshoots). See `packages/validate/src/index.ts`.

Successful validation also exposes `inspection.nodes` (absolute box geometry, including nested nodes), `inspection.edges` (resolved orthogonal points, length, bend count, and explicit-waypoint usage), structured `inspection.issueDetails`, route-fallback counts, and content/render bounds. This lets an agent reason from the renderer's resolved geometry instead of trying to simulate the layout engines from source text.

For the manual-mode workflow, `bpm freeze <file.bpm> -o manual.bpm` and `generateDiagram(..., { positioning: 'manual' })` first obtain a valid auto-layout result, then serialize it into the DSL's canvas-, lane-, and subprocess-relative coordinate frames. Edge interiors are retained as `via` points where representable; boundary-event placement remains shared and automatic. Manual generation can run bounded geometry repair and optional rendered provider review. Auto-layout remains the default.

---

## 4. Tech stack

### 4.1 Language & monorepo

| Layer | Choice |
|---|---|
| Language | TypeScript (`tsconfig.base.json`) |
| Package management | npm workspaces (`packages/*`, `apps/*`) |
| Unit tests | Vitest (`vitest.workspace.ts`) |
| Web bundler | Vite (`apps/web`) |
| E2E | Playwright (`apps/web`) |

### 4.2 Packages and responsibilities

| Package | Role | Notable deps |
|---|---|---|
| `@bpm/ast` | Shared AST / diagram types | — |
| `@bpm/parser` | Text → AST | `@bpm/ast` |
| `@bpm/layout-core` | Engine registry, boundary placement, orthogonal router, `analyzeLayout` / `inspectLayout`, pin override | `@bpm/ast` |
| `@bpm/layout-elk-base` | Build/run ELK graphs | `elkjs` |
| `@bpm/layout-engine-swimlane` | Full-width lane bands + cross-lane channel tracks | elk-base, layout-core |
| `@bpm/layout-engine-flat` | Non-banded ELK layout | elk-base, layout-core |
| `@bpm/layout-engine-manual` | Exact coordinates + lane stacking | layout-core |
| `@bpm/layout` | Facade: select engine, manual path, pins, boundary post-pass | engines above |
| `@bpm/render` | Positioned diagram → SVG string | layout types |
| `@bpm/export-xml` | Positioned diagram → BPMN 2.0 XML; round-trip tests via real importer | `bpmn-js`, `jsdom` |
| `@bpm/validate` | `validate(text)` → structured result + resolved inspection | parser, layout, layout-core |
| `@bpm/print-dsl` | Mechanical AST printer + auto-layout-to-manual freezer | ast, layout-core |
| `@bpm/cli` | CLI: validate / render / export / generate / freeze | validate, render, export-xml, print-dsl; optional PNG via `@resvg/resvg-js` |
| `@bpm/web` | Browser UI | parser, layout, render, export-xml, `bpmn-js` |

### 4.3 Key third-party pieces

- **ELK.js** — automatic node placement for flat/swimlane engines.
- **bpmn-js** — Diagram mode modeler; also used to verify XML export by importing it.
- **Vite / Playwright** — web app and e2e (including download interception).
- **No** dagre/graphviz in the current default registry (experimental comparison engines were removed).

---

## 5. How it differs from similar products

| Product class | Typical strength | How this workspace differs |
|---|---|---|
| **Mermaid / flowchart text** | Fast, ubiquitous text→SVG | Domain-specific **BPMN 2.0** vocabulary (events, gateways, boundary events, pools/lanes, message flows); **BPMN XML** export; geometry **metrics** for iteration — not a generic flowchart DSL. |
| **bpmn-js / Camunda Modeler** | Canonical visual BPMN editing & execution tooling ecosystem | **Text-first** authoring with **auto swimlane layout** and shared edge routing; Diagram mode uses the same visual engine as a second authoring path. The exporter supports a documented, limited Camunda 7 attribute subset; it is not a complete deployment profile. |
| **draw.io / Lucidchart / general whiteboards** | Arbitrary shapes and freeform layout | Constrained BPM language + **automated** layout/routing; agent-oriented **validate/render/export** CLI; less freeform drawing, more process modeling. |
| **Raw LLM SVG or hand-written BPMN XML** | One-shot generation | Structured intermediate language, deterministic layout engines, and `analyzeLayout` so generators can **measure and repair** crossings/overlaps instead of hoping the SVG looks right. |

**Positioning in one line:** Mermaid’s authoring speed + BPMN’s semantics + automated swimlane layout + interchange XML + an agent-checkable geometry loop — with an optional visual modeler on the side.

**Claims that must stay honest (do not oversell):**

- Residual **edge-edge crossings** remain on some large verification diagrams (see `STATUS.md`).
- Parser accepts structurally well-formed text and reports the implemented **BPMN legality rules** as structured `semanticErrors`; this is not a complete BPMN conformance checker.
- BPMN XML → text import is available as a one-shot CLI/web conversion with documented lossy warnings; it is not a general round-trip guarantee.
- **No continuous Diagram mode ↔ text sync**; the explicit Import to Text action is previewed and confirmed by the user.
- Icons use inline BPMN 2.0 PathMap glyphs; they are not a promise of pixel-identical rendering across every BPMN tool.
- Swimlane bands are sized from each lane's own content; sparse lanes no longer inherit the tallest lane's height.

---

## 6. Directory map

```
bpm/
├── README.md                 # Short product intro + how to build/test
├── package.json              # Workspaces root; `npm test`, `npm run bpm`
├── apps/
│   └── web/                  # Vite app: text mode + Diagram mode
│       ├── src/main.ts       # UI shell, mode toggle, error strip
│       ├── src/pipeline.ts   # parse → layout → render
│       ├── src/diagramMode.ts
│       ├── src/downloads.ts
│       └── test/e2e/         # Playwright
├── packages/                 # Core library pipeline (see §4.2)
├── examples/
│   └── manual-mode/          # Sample .bpm files for visual / manual review
├── docs/
│   ├── ASSESSMENT-HANDOFF.md # This file
│   ├── STATUS.md             # Built / verified / known limits (source of truth)
│   ├── LANGUAGE.md           # Full grammar for humans and LLMs
│   ├── ROADMAP.md            # Done / deferred / next / explicitly not planned
│   ├── CLI.md                # CLI-only verification checklist
│   └── superpowers/
│       ├── specs/            # Design docs per major feature
│       └── plans/            # Implementation plans matching those specs
└── .superpowers/sdd/         # Session worktrees / SDD artifacts (process, not product runtime)
```

---

## 7. File-based workflows for reviewers

Use each row as an independent review lens. Start from the listed files; follow imports only as needed.

### 7.1 Parse the language

| Files | Why |
|---|---|
| `packages/parser/src/parser.ts`, `tokens.ts`, `errors.ts` | Grammar implementation |
| `packages/ast/src/types.ts` | Canonical diagram model |
| `docs/LANGUAGE.md` | Spec of what generators must emit (2-space indent, directives, `at (x,y)`) |
| `packages/parser/test/*.ts` | Accepted / rejected forms |

### 7.2 Choose and run a layout engine

| Files | Why |
|---|---|
| `packages/layout/src/index.ts` | Facade: manual vs auto, pins, boundary post-pass |
| `packages/layout-core/src/engine.ts` (registry / `selectEngine`) | Engine registration and auto-detect |
| `packages/layout/test/facade.test.ts` | Selection and override behavior |

### 7.3 Swimlane layout

| Files | Why |
|---|---|
| `packages/layout-engine-swimlane/src/engine.ts` | Engine entry |
| `laneBanding.ts` | Full-width stacked bands |
| `channelRouting.ts` | Cross-lane track assignment |
| `test/crossing-regression.test.ts`, `swimlane.test.ts` | Geometry regression fixtures |

### 7.4 Flat / ELK layout

| Files | Why |
|---|---|
| `packages/layout-elk-base/src/{toElkGraph,runElkLayout,fromElkLayout}.ts` | ELK bridge |
| `packages/layout-engine-flat/src/engine.ts` | Flat engine |
| `packages/layout-engine-flat/test/flat.test.ts` | Flat behavior |

### 7.5 Manual positioning

| Files | Why |
|---|---|
| `packages/layout-engine-manual/src/engine.ts` | Exact coordinates |
| `laneStacking.ts` | Pool/lane stacking with lane-relative coords |
| `packages/layout-core/src/pinnedOverride.ts` | Partial pins in auto diagrams |
| `examples/manual-mode/*.bpm` | Human-readable fixtures |
| Spec: `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md` | Design intent |

### 7.6 Boundary events + orthogonal edge routing

| Files | Why |
|---|---|
| `packages/layout-core/src/boundaryEvents.ts` | Host-border placement; routing scoped to pool |
| `packages/layout-core/src/routing/geometry.ts` | Routing primitives |
| `visibilityGraph.ts`, `pathfind.ts`, `router.ts` | Visibility graph → Dijkstra → public router |
| `packages/layout-core/src/anchors.ts` | Exit/entry sides |
| Spec: `docs/superpowers/specs/2026-08-09-unified-edge-router-design.md` | Design intent |

### 7.7 Render SVG

| Files | Why |
|---|---|
| `packages/render/src/{shapes,edges,icons,text,xml}.ts` | Shape vocabulary, edge styles, label pass |
| `packages/render/test/*.ts` | Render contracts |

### 7.8 Export BPMN XML

| Files | Why |
|---|---|
| `packages/export-xml/src/{elements,eventDefinitions,collaboration,diagramInterchange,xml}.ts` | Semantic + DI |
| `packages/export-xml/test/roundTrip.ts`, `export.test.ts` | Real bpmn-js import verification |

### 7.9 Web text mode

| Files | Why |
|---|---|
| `apps/web/src/main.ts` | Editor chrome, errors, theme, exports |
| `pipeline.ts` | Browser pipeline |
| `downloads.ts` | SVG / XML download |
| `apps/web/test/e2e/*.ts` | Playwright coverage |
| Spec: `docs/superpowers/specs/2026-08-09-editor-look-and-feel-design.md` | UI design |

### 7.10 Diagram mode (independent)

| Files | Why |
|---|---|
| `apps/web/src/diagramMode.ts` | bpmn-js Modeler integration |
| Spec: `docs/superpowers/specs/2026-08-09-diagram-mode-editor-design.md` | Explicit non-sync with text |

### 7.11 Agent validate / CLI

| Files | Why |
|---|---|
| `packages/validate/src/index.ts` | Scriptable API |
| `packages/cli/src/bin.ts`, `commands/{validate,render,export}.ts` | CLI surface |
| `docs/CLI.md` | Isolated CLI verification checklist |

### 7.12 Quality / geometry gates

| Files | Why |
|---|---|
| `packages/layout-core` geometry / `analyzeLayout` (see `geometry.ts` and test-utils re-exports) | Metric definitions |
| Swimlane `crossing-regression.test.ts` | Named residual cases called out in STATUS |
| Root: `npm test` | Full Vitest workspace |

---

## 8. Honest limits and verification snapshot

From `docs/STATUS.md` (re-check that file for numbers after new commits):

- Unit/package tests expected green on main (`npm test`).
- Unified edge router and pluggable engines are in; experimental dagre/elk-native/graphviz comparison engines were removed.
- Residual edge-edge crossings still appear on some large swimlane fixtures; node overlaps and edge-through-node are empty across verification diagrams cited in STATUS.
- Roadmap open themes: BPMN legality validation, visual icon polish, project-based saving, Camunda extension attributes, expressiveness survey — see `docs/maintainer/ROADMAP.md`.
- Explicitly **not** planned without a fresh design cycle: Diagram ↔ text round-tripping.

---

## 9. Suggested assessment checklist

**Product / positioning**

- [ ] Is the problem statement clear (text-first BPMN vs Mermaid vs visual-only modelers)?
- [ ] Are differentiation claims accurate given STATUS limitations?
- [ ] Is the dual-mode editor (text vs Diagram) explained without implying sync?

**Architecture**

- [ ] Are package boundaries coherent (parser / layout engines / layout-core / render / export / validate / cli / web)?
- [ ] Does the facade correctly isolate manual vs auto vs pinned overrides?
- [ ] Is shared routing actually shared (boundary + swimlane paths), not duplicated?

**Workflows / quality**

- [ ] Can an LLM author from `LANGUAGE.md` alone for non-trivial multi-pool diagrams?
- [ ] Does `validate` expose enough signal for iterative repair?
- [ ] Are geometry regressions and XML round-trips the right primary quality gates?
- [ ] Are known residuals documented rather than hidden?

**Gaps to weigh**

- [ ] BPMN legality not enforced
- [ ] No XML→text; no Diagram↔text sync
- [ ] Residual crossings on dense diagrams
- [ ] Camunda runtime extensions absent

---

## 10. Pointers (do not duplicate here)

| Need | Go to |
|---|---|
| Exact built vs limited | `docs/STATUS.md` |
| Grammar for generation | `docs/LANGUAGE.md` |
| What’s next / not planned | `docs/maintainer/ROADMAP.md` |
| CLI-only check | `docs/CLI.md` |
| Feature design history | `docs/superpowers/specs/` |
| Implementation plans | `docs/superpowers/plans/` |
| Sample diagrams | `examples/manual-mode/` |

---

_End of handoff. Prefer citing STATUS/LANGUAGE over inventing newer capability claims._
