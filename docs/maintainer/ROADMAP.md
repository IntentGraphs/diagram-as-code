# Roadmap

_Last updated: 2026-08-22. See `docs/STATUS.md` for what's already built and verified. Session resume: `docs/maintainer/HANDOFF.md`._

**Next numbered items:** 18m adversarial contract verification, 16a browser verification, 18n CLI capability/consumer-install follow-through, 18o web-editor loading-state consistency, 18f family-specific layout calibration, 18l's remaining browser evidence request, 17a exact release-snapshot work, and 18p freeform page/canvas/output contracts. Items 12 (Diagram mode XML corruption — partially addressed by item 16's T2) and 13 (manual-editor UX candidates — design, not a build) remain open. Item 17 (public repository readiness) is in progress: the mandatory Gantt/PPTX v1 scope, direction/lane orientation, and local release-hardening are shipped, while exact commit/tag curation and organization-side repository settings remain. Items 1–11, 14–16, 15a–15c, 19, and 18a–18k are done or shipped with the explicitly marked residuals.

Each remaining item below is scoped to stand alone — pick one, and it gets its own design/plan cycle before implementation (per this project's established process: brainstorm → spec → plan → build → verify).

## Done

- ✅ **BPMN 2.0 XML export** — `@bpm/export-xml`, verified via real `bpmn-js` round-trip import.
- ✅ **Edge-edge crossing reduction** — left-edge channel/track routing for cross-lane edges; boundary-event routing now direction-aware (sweeps toward its actual target instead of always right) with exit/entry stubs and partial obstacle-awareness on its final approach.
- ✅ **Look and feel — editor UI** — technical/blueprint visual identity (dark-first, light variant), toolbar with engine-type badge, structured error strip with dimmed stale-preview, and SVG/BPMN-XML export buttons wired to `@bpm/export-xml`.
- ✅ **Diagram mode** — a second editor mode embedding the real `bpmn-js` `Modeler` for direct drag-and-drop editing (New/Open/Save/Export), independent of the text pipeline.
- ✅ **Unified obstacle-avoiding edge router** — shared orthogonal visibility-graph router (geometry → visibility graph → Dijkstra) replacing hand-rolled per-engine routing for both boundary events and cross-lane edges.
- ✅ **Manual positioning mode** — opt-in `positioning: manual` directive: exact `at (x, y)` node coordinates instead of auto-layout, lane-relative within pools/lanes. See `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md`. This directly supersedes the "explicitly not planned" note this section used to carry — it went through the fresh brainstorming cycle that note called for.
- ✅ **Per-edge style/anchor overrides** — `[style, corner, from, to]` attribute block, available in both manual and auto-layout diagrams.
- ✅ **Language reference** — `docs/LANGUAGE.md`, full grammar/vocabulary for both modes.
- ✅ **Removed experimental comparison engines** — `dagre`/`elk-native`/`graphviz` were opt-in research spikes that had leaked into the default engine registry and editor toggle; removed, only `swimlane`/`flat` remain.
- ✅ **Actionable manual-mode overlap errors** — overlap messages include a cheapest axis-aligned shift hint (roadmap item 9).
- ✅ **Manual-mode nested subprocess/transaction content** — expanded children place relative to the subprocess origin (roadmap item 7b).
- ✅ **Partial/mixed pinning** — optional `at (x, y)` on individual nodes without `positioning: manual` (roadmap item 7a).
- `@bpm/validate` — scriptable `validate(text)` returning `{ valid, errors, semanticErrors, warnings, metrics }` over parse → layout → `analyzeLayout`. Syntax/grammar failures populate `errors`; BPMN 2.0 structural legality violations populate `semanticErrors` (§3.6 in `docs/LANGUAGE.md`).
- ✅ **CLI packaging** — `@bpm/cli` / `npm run bpm -- validate|check|render|export|review|fix|generate|import|freeze|capabilities` (roadmap item 2).
- ✅ **Phase A — Manual text controls** — `via` waypoints, `size (w,h)`, node/edge label visuals, `layoutSpacing:` directive (compact/normal/relaxed/spacious) wired into ELK/swimlane engines. Validate warns on label clipping, edge-label/node overlap, non-orthogonal vias, undersized nodes. Spec/plan under `docs/superpowers/*manual-text-controls*`.
- ✅ **Accurate BPMN event icon set** — `@bpm/render` uses BPMN 2.0 PathMap-scaled inline SVG glyphs (no external font/assets). Before/after comparison: `packages/render/test/fixtures/bpmn-event-icons-comparison.svg`.
- ✅ **Project-based diagram saving and portability** — Text mode `.bpm` source persists in browser IndexedDB (`apps/web/src/project/`): multi-diagram project, debounced autosave, reload survival, rename/delete, and versioned `.bpm-project.json` Save Project/Open Source bundles with available render snapshots. Diagram mode `.bpmn` remains file-based and is not stored in the project. Spec/plan: `docs/superpowers/specs/2026-08-14-project-based-saving-design.md`, `docs/superpowers/plans/2026-08-14-project-based-saving.md`. E2e: `apps/web/test/e2e/project-saving.spec.ts`.
- ✅ **BPMN modeling feature gap survey** — `docs/BPMN-GAP-SURVEY.md`: full BPMN 2.0 expressiveness audit vs `docs/LANGUAGE.md`; STATUS notation claims corrected; 12 paste-ready roadmap candidates for follow-on work.
- ✅ **BPMN task subtypes** — `userTask`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `businessRuleTask`, `scriptTask` in text DSL; SVG corner markers (`packages/render/src/taskMarkers.ts`); distinct BPMN 2.0 XML export tags; `receiveTask` legal on event-based gateway (gap survey item 1 + 11).
- ✅ **Camunda 7 export extensions (v1)** — `camundaClass` / `camundaExpression` / `camundaFormKey` in the node `[...]` block; gated `camunda:` namespace in `@bpm/export-xml`. Spec: `docs/superpowers/specs/2026-08-14-camunda-export-extensions-design.md`.
- ✅ **AI-assisted DSL repair** — `repairDiagram()` text-only loop when `validate()` is blocking; CLI `bpm review --max-attempts`; web Review Apply/Skip. See `docs/AI_REVIEW.md` (roadmap item 10).
- ✅ **Workspace cleanup** — prompt-template committed; review panel split; `bpm render` stdout-default confirmed, stray `out.svg` removed (roadmap item 11).
- ✅ **AI-assisted diagram generation from a description** — `generateDiagram()` (`@bpm/review`) drafts a full `.bpm` file from a plain-language description via a grammar-grounded prompt, then hands off into the existing repair loop if the draft is invalid. CLI `bpm generate "<description>"`; web **Generate** panel (next to Review) with an explicit Insert-into-editor action and a no-key offline-skeleton provider. See `docs/AI_REVIEW.md` and roadmap item 14.

## Deferred, tracked separately (layout-only, not part of the current focus)

- **Remaining boundary-routing gaps**: initial exit-segment obstacle blindness (found via independently-authored example diagrams, not yet fixed) and dogleg-collision track separation. Per-lane sizing is now content-based and is no longer an outstanding gap. See `docs/STATUS.md`'s known limitations and `docs/superpowers/specs/2026-08-14-layout-routing-hardening-design.md` for the hardening plan (L1–L4). Intentionally paused to focus on the rest of the roadmap first; will resume as its own round.

## 1. BPMN legality validation — done

**What**: ~~parser-level checks for BPMN's actual structural rules…~~ **Done** — `@bpm/parser` rule table (`bpmnLegality.ts`) with BPMN 2.0.2 spec citations; violations in `semanticErrors`; fixture and focused unit-test coverage; docs in `docs/LANGUAGE.md` §3.6.

**Why**: self-contained, parser-only change with no dependency on anything else; mainly a matter of encoding the rule table and adding structured errors (reuses the existing `{line, column, message}` error mechanism).

## 2. CLI packaging — done

**What**: ~~expose the existing Node-compatible core…~~ **Done as `@bpm/cli`**: validation/checking, rendering, export, review/repair, generation, XML import, manual freezing, and runtime capability discovery. Invoke via `npm run bpm -- <command> …`; see [`docs/CLI.md`](../CLI.md) for the current contract.

## 3. Visual polish — accurate BPMN icon set — done

**What**: ~~replace the current simplified geometric icon approximations…~~ **Done** — `packages/render/src/icons.ts` + `pathMap.ts` render BPMN 2.0 PathMap glyphs (message envelope, timer with ticks, error bolt, pentagon multiple, etc.) scaled to each event's bounds; catch vs throw fill follows event category. Comparison fixture: `packages/render/test/fixtures/bpmn-event-icons-comparison.svg`.

**Why lower priority**: current icons are distinct and readable, just not pixel-perfect; this is pure visual refinement with no functional impact.

## 4. Project-based diagram saving — v1 done

**What**: ~~today, a diagram is one block of text…~~ **v1 shipped** — Text mode diagrams persist in browser IndexedDB as a multi-diagram project (create / autosave / reload / rename / delete), and the project can be saved/restored as a versioned `.bpm-project.json` bundle containing source plus available render snapshots. Diagram mode remains file-based (Open/Save/download only).

**Scoping decisions** (see `docs/superpowers/specs/2026-08-14-project-based-saving-design.md`):
- **Project** = named client-side container (IndexedDB), not an on-disk folder in v1.
- **Diagram mode `.bpmn`** = **out of scope for project persistence**; it remains a separate file-based workflow after roadmap item 12.
- **Multi-diagram per project** = yes (flat list, create/rename/delete/switch).
- **Backend** = none in v1 (client-side only).
- **History/versioning** = last-write-wins autosave only; bundle format is versioned for compatibility, but revision history/publish remains deferred (roadmap 13).

**Deferred:** Diagram mode `.bpmn` blobs in project store, multi-project picker, filesystem folders, backend sync, version history.

**Why**: real usage at any volume needs the tool to hold onto your work without manual export/file juggling.

## 5. BPMN modeling feature gap survey — done

**What**: ~~deliberate audit of full BPMN 2.0 against what this tool's notation covers…~~ **Done** — `docs/BPMN-GAP-SURVEY.md` catalogs every audited BPMN 2.0 category with spec reference, support status (none/partial/workaround), concrete blocked example, and priority/cost estimate. Includes STATUS.md vs LANGUAGE.md accuracy audit; STATUS notation claims corrected. Twelve suggested one-line roadmap candidates for follow-on implementation items (task subtypes, event payloads, throw events, loops/MI, compensation, etc.) — each to get its own scoped entry when picked.

**Why**: BPMN legality validation (item 1, done) covers *rule-checking* what's already expressible; this covers *expressiveness* — what real-world processes still can't be modeled at all in this tool's notation.

## 6. Export compatibility with Camunda/Signavio-style tooling — v1 done

**What**: ~~vendor extension attributes in the `camunda:` namespace…~~ **v1 shipped** — opt-in node attribute keys `camundaClass`, `camundaExpression` (service tasks) and `camundaFormKey` (user tasks) export as `camunda:class` / `camunda:expression` / `camunda:formKey`. The `camunda` xmlns is omitted when unused, so BPMN-only diagrams are unchanged. Spec: `docs/superpowers/specs/2026-08-14-camunda-export-extensions-design.md`. Fixtures: `packages/export-xml/test/fixtures/camunda-*.bpm`. Round-trip via bpmn-js + `camunda-bpmn-moddle`.

**Deferred:** `delegateExpression` / `type=external`, async/job markers, assignee/candidate groups, start-event formKey, Camunda 8 `zeebe:` namespace, `isExecutable` flag.

**Why lower priority than items 1–5**: current export is already broadly compatible for modeling/interchange; this only matters once someone wants to *run* an exported diagram on a real engine, not just view or edit it elsewhere.

## 7. Manual-mode incremental editing (partial positioning + nested subprocess support)

**What**: relax two current all-or-nothing restrictions on `positioning: manual` (`docs/LANGUAGE.md` §6.4): (a) ~~allow mixing manually-positioned nodes with auto-laid-out nodes~~ **done** — optional `at (x, y)` pins individual nodes in otherwise auto-laid-out diagrams; (b) ~~support nested subprocess/transaction content under manual positioning~~ **done on `llm-diagram-extensions`** — expanded subprocess/transaction children are placed relative to the subprocess origin.

**Why**: partial pinning is now available for the natural single-node nudge workflow; the remaining manual-mode work is layout/editor ergonomics rather than the former all-or-nothing restriction.

## 8. Structured validation entry point (parse/layout/geometry as one scriptable check) — library done

**What**: ~~expose the parse → layout → geometry-check pipeline…~~ **Done as `@bpm/validate`** (`validate(text)` → `{ valid, errors, warnings, metrics }`) and CLI `bpm validate` (roadmap item 2).

**Why**: an AI (or any external tool/script) generating or iterating on diagram text today has no way to check its own work without a human relaying browser errors back. A `bpm validate diagram.bpm` that returns structured findings closes that loop — arguably the single highest-leverage change for reliable, self-correcting iterative generation, since every other gap in this section is secondary to being able to check your own output at all.

## 9. Actionable manual-mode overlap errors — done

**What**: ~~when `positioning: manual` rejects two overlapping nodes…~~ **Done** — messages now include e.g. `shift "b" right by 14 (or the other node left)`.

## 10. AI-assisted DSL repair when generation fails — done

**What**: ~~text-only repair when `validate()` is blocking…~~ **Done.** When `validate()` returns `valid: false` (syntax `errors` or `semanticErrors`), `@bpm/review`'s `repairDiagram()` sends the source plus structured `{line, column, message}` issues to the same provider registry (`manual` / `ollama` / `openai`) — no PNG. Providers return the existing `{ find, replace }` patch shape. The loop applies patches and re-validates until the file is valid or `--max-attempts` (default 3) is exhausted. CLI `bpm review` auto-enters this path for invalid files and prints `repair.status` / `repair.attempts` / `repair.repairedText` (it does not overwrite the source). Warning-only diagrams keep the image-based review path. Web Review uses the same Apply/Skip UI for repair patches. See `docs/AI_REVIEW.md`.

**Why**: this is the one case current AI review explicitly can't help with — a generation failure with nothing to look at — and it's also the highest-value case for an agent iterating on `.bpm` text, since `@bpm/validate` (roadmap item 8, done) already gives structured errors a script or model could act on; this closes that loop from "here are the errors" to "here's a fixed file."

## 11. Workspace cleanup — done

**What**: small hygiene items found during a workspace pass:
- ~~`docs/PROMPT-TEMPLATE-MANUAL-MODE.md` untracked~~ **done** — committed.
- ~~`.worktrees/feat` stale worktree~~ **done** — the active QA worktree is now preserved under `.worktrees/archive-mindmap-browser-qa`; no unarchived feature worktree remains.
- ~~`apps/web/src/reviewPanel.ts` ~500-line mix of DOM and fetch~~ **done** — provider fetch/prompts live in `apps/web/src/reviewProviders.ts`; panel DOM/Apply/Skip stay in `reviewPanel.ts`.
- ~~`out.svg` in the repo root~~ **done** — `bpm render` already writes SVG to stdout when `-o` is omitted (PNG still requires `-o`). Leftover root `out.svg` removed. CLI test asserts omitting `-o` does not create `out.svg` in the working directory.

**Why**: none of these affect correctness or block other roadmap items; grouped here so they're not lost and can be picked up opportunistically (e.g. the `reviewPanel.ts` split pairs naturally with implementing item 10, which touches the same file).

## 14. AI-assisted diagram generation from a description — done

**What**: `generateDiagram()` (`@bpm/review`) drafts a full `.bpm` file from a plain-language description, bullet list of steps, or rough draft — instead of only fixing an existing file (item 10). It calls a provider's new `generate(description)` method for a first draft, validates it, and — if invalid — hands off into the existing `repairDiagram()` loop rather than building a second retry mechanism. `manual` provider gets a deterministic no-network skeleton generator; `ollama`/`openai` use a grammar-grounded system prompt condensed from `docs/LANGUAGE.md`. CLI: `bpm generate "<description>" [--provider …] [-o out.bpm]`. Web: a **Generate** panel next to Review, with an offline no-key provider option and an explicit **Insert into editor** action (never auto-overwrites the live text). Design: `docs/superpowers/specs/2026-08-17-ai-diagram-generation-design.md`.

**Why**: this is the other half of "AI iterates on `.bpm` text" that item 10 didn't cover — item 10 assumes a file already exists and is merely broken; this covers going from nothing (a description) to a first valid draft, which is the actual entry point most non-expert users or agents would want before they ever have DSL text to repair.

## 15. Diagram families beyond BPMN — starting with mind maps

**What**: extend the text → parse → layout → render pipeline to notations other than BPMN, reusing the parts of the stack that are already generation-agnostic (`packages/layout-core`'s geometry/anchors/obstacle-avoiding router, `render`'s edge/text/label code, the nested-children pattern already built for subprocess, the `at (x, y)` / `layout:`-directive precedent) behind a new top-of-file `diagram: <family>` directive, without touching BPMN's closed `DiagramNode` union or its exhaustive `.kind` switches (`icons.ts`, `taskMarkers.ts`, `export-xml`'s serializer, `bpmnLegality.ts`) — those stay BPMN-only, and each new family gets its own parser + AST + glyph set instead of widening the existing ones. Full architecture rationale: `docs/superpowers/specs/2026-08-17-diagram-family-extensibility-notes.md` (excerpted from the "Extending bpm" research artifact this item is based on).

**Explicitly out of scope**: an open-ended "any diagram type" ambition. Each family below is its own scoped item, picked up one at a time, each going through the project's normal brainstorm → spec → plan → build → verify cycle before work starts — this entry is the intake list, not a commitment to build all of it.

**Sequencing, ordered by implementation complexity:** 15a, 15b, and 15c are shipped.

### 15a. Mind maps — done first: single root, tree-only, no BPMN concepts to avoid

**Shape**: one root node, children radiating outward, children-of-children nesting arbitrarily deep. No pools/lanes, no gateways, no flow-type distinctions — every edge is the same "parent → child" relationship.

**Why first**: strictly simpler than BPMN's own AST subset already in the codebase — a mind map is a tree, and `ActivityNode.children`/`childEdges` (built for BPMN subprocess nesting) is already a tree-shaped container. This family can reuse layout-core's geometry/anchors directly, needs the *smallest* possible new grammar (two productions: a labeled node, and a nesting indent rule that already exists per `docs/LANGUAGE.md` §1), and needs no new edge semantics at all — making it the cheapest way to prove out the `diagram:`-family directive and a pluggable glyph renderer before committing to anything harder.

**New work**: a radial or left-right tree layout mode in `layout-core` (BPMN's swimlane/flat engines assume left-to-right process flow, not a root-outward tree — this is the one genuinely new layout algorithm this item needs); a minimal grammar/AST (`mindmap "<label>" as <id>` + indentation-nested children, no edge declarations needed since parent/child *is* the edge); a single generic node glyph (rounded rect or plain text, no BPMN icon set).

**Work product**: `docs/superpowers/specs/mindmap-hardening-spec.md`, a `diagram: mindmap` directive, `examples/mind-maps/*.bpm`-equivalent fixtures, SVG output and structured draw.io XML export. The draw.io export is intentionally lossy with no import or round-trip guarantee; it preserves the rendered tree's basic nodes, edges, labels, and geometry rather than mapping the family to BPMN 2.0 XML.

### 15b. Flowcharts / generic process diagrams — next: reuses BPMN's own edge vocabulary almost unchanged

**Shape**: boxes and decision diamonds connected by arrows — essentially BPMN's `task`/`gateway`/edge vocabulary with the BPMN-specific vocabulary (event triggers, pools/lanes, task subtypes) stripped out. The closest family to what's already built, which is exactly the risk: it's tempting to reuse BPMN's AST directly instead of a parallel one, and that temptation is why this is sequenced *after* mind maps proves the parallel-family pattern works, not before.

**New work**: a reduced grammar (`box "<label>" as <id>`, `decision "<label>" as <id>`, same `->`/`=>`/`->>` edges BPMN already has); reuses swimlane/flat layout engines almost as-is (no new layout algorithm, unlike mind maps).

Structured draw.io XML export is now available through the web toolbar. It is intentionally lossy and has no import or round-trip guarantee: edge-kind semantics and decision-diamond sizing are not preserved on reopen.

**Work product**: `docs/superpowers/specs/2026-08-18-flowchart-diagram-family-design.md`.

### 15c. Simple software/cloud architecture diagrams — shipped

**Shape**: boxes (services, databases, queues) with containment (a VPC/system contains components) and freeform relationship arrows that don't carry BPMN's sequence-flow semantics (no "default branch," no gateways).

**Shipped**: `diagram: architecture` with C4-style node kinds, direct containment rules, directed relationship edges, ELK layered rightward layout with orthogonal routing, SVG rendering, lossy draw.io XML, and project-specific (non-Structurizr-compatible) C4 JSON export. The C4 JSON target is CLI-only today; the web toolbar exposes the first structured export, draw.io XML.

**Work product**: architecture adapter package and CLI/web family integration; no architecture-specific design spec was found under `docs/superpowers/specs/`.

### 15d. Diagram-family public-v1 parity contract

Fresh multi-role assessment: the existing four-family portfolio is a sound base, and the user has now made Gantt mandatory for public v1. “Supported” must mean the same minimum contract for every family. For BPMN, mind maps, flowcharts, architecture, and Gantt, publish and test a capability matrix covering:

- dedicated parser/AST or documented family-owned representation with bounded input and semantic diagnostics;
- deterministic layout with finite, bounded geometry and stable identifiers;
- escaped SVG rendering and at least one representative, invalid, oversized, and long-label fixture;
- CLI validate/render behavior and web preview behavior;
- structured export behavior, including whether it is lossless, lossy, editable, or round-trippable;
- browser export smoke coverage and explicit unsupported-action messaging;
- editable PPTX capability truthfulness: native shapes, editable text, and connectors are required for every public-v1 family; a full-diagram raster image is not an editable PPTX export;
- capability truthfulness for advertised formats (the runtime currently declares PNG while the web surface exposes SVG/structured exports, and architecture C4 JSON is CLI-only);
- examples and documentation that match actual web/CLI capabilities;
- explicit limits for visual editing, AI generation/review, import, persistence, and round-trip claims.

**Definition of done**: one cross-family release acceptance suite verifies the same minimum path for every supported family, including native editable PPTX export, without implying that non-BPMN families have BPMN's visual editor, AI features, or lossless XML interchange.

### 15e. Diagram-family adoption and dependency matrix

Maintain this priority order as an intake decision, not a commitment to implement every type. The current market reference set includes sequence, state, ER, Gantt, timeline, class, C4, and other diagram families; their minimum contracts differ materially, so each must receive its own design/test plan before implementation. See the official [Mermaid syntax index](https://mermaid.js.org/config/setup/mermaid/README.html) and [new-diagram guidance](https://mermaid.js.org/community/new-diagram) as interoperability and accessibility reference points, not as dependencies to adopt.

| Candidate | Adoption value | Minimum credible scope | Dependency / architecture impact | Priority |
|---|---:|---|---|---|
| ER / data model | High for data, analytics, and manufacturing solutions | Entities, attributes, PK/FK, cardinality, identifying/non-identifying relations, SVG and explicit lossy export | Reuses ELK/graph routing; no mandatory new dependency | First post-v1 family |
| State machine | Medium-high for software and lifecycle modeling | States, transitions, guards/actions, initial/final states, composite states | Reuses graph validation/layout more than sequence/Gantt | Second post-v1 family |
| Gantt / project timeline | High for planning and delivery users | Tasks, ISO dates, duration, milestones, groups, finish-to-start dependencies, deterministic time axis, JSON/CSV plus SVG/PNG/PPTX | New temporal model, date/calendar policy, cycle validation, time-axis layout; high risk | Mandatory public v1 |
| Editable PowerPoint export | High for workshops, presentations, and handoff | Native shapes, editable text, connectors, and family-specific mappings for all five v1 families; no raster-only primary export | New `@bpm/export-pptx` package, PPTX writer dependency, OOXML validation, font/scale/pagination compatibility | Mandatory public v1 |
| Sequence | High for APIs, agents, and integrations | Lifelines, messages/returns, ordering, activation, notes, loop/alt/parallel fragments | New horizontal message layout and interaction semantics | Post-v1 P1/P2 |
| Data-flow | High for data/AI architecture | Processes, stores, actors, directional flows, trust-boundary annotations | Prefer architecture-family enhancement before a separate family | V1.x architecture enhancement |
| Network/topology | Medium for infrastructure users | Devices/services, ports, zones, directional links, vendor-neutral icons | Extends architecture relationships; new port/zone semantics | V2 |
| Org chart | Medium | Hierarchy, roles, departments, reporting/assistant relations | Reuses mind-map tree layout; low technical risk but weaker product fit | V2 / opportunistic |
| UML class/component | Medium | Classes, fields, methods, interfaces, multiplicities, inheritance/composition | Broad relationship semantics overlap ER and architecture | V2 |
| Timeline/calendar | Medium | Dated events/periods, grouping, locale/timezone contract | Simpler than Gantt but still temporal; avoid until demand exists | V2 |
| Sankey/value-stream | Niche | Weighted flows, measures, conservation/validation rules | New weighted-flow layout; likely specialized dependency risk | V2+ |
| Kanban/roadmap board | Useful product surface, not a graph | Columns, cards, status, owner, dates, interaction | Separate board UI/state model; do not force into diagram adapters | Separate future product surface |
| Decision table | Useful business artifact, not a graph | Conditions, rules, outcomes, validation | Table renderer/editor rather than diagram-family layout | Separate future artifact |

### 15f. Gantt/project timeline — shipped public-v1 family; contract retained for reference

Gantt is now a public-v1 release blocker. The product contract is: **bounded project timelines with deterministic visualization, not a scheduling engine**. It is visually simple but introduces a temporal model, calendar policy, dependency validation, and a dedicated time-axis layout; the scope must stay deliberately bounded.

Minimum first scope if user evidence makes it P1:

- task IDs and labels with strict ISO `YYYY-MM-DD` date-only values;
- explicit `start`, `finish`, or `duration`, with invalid/negative/missing values rejected;
- milestones, hierarchical groups/phases, finish-to-start dependencies, and optional non-negative calendar-day lag;
- deterministic UTC/day arithmetic and one declared Monday–Friday scheduling calendar, with page-aware start/end distribution and a separate daily/weekly/fortnightly/monthly/quarterly/halfyear/auto presentation timescale;
- dependency cycle detection, task/dependency/render-size limits, and a readable day/week/month time axis with coarser fortnightly/quarterly/halfyear options for fixed-page exports;
- display-only progress from 0–100%; no automatic rescheduling;
- text-mode only, no interactive scheduling editor, resource leveling, baseline/variance, critical-path promise, holidays, timezone conversion, or date-time timestamps in the first scope;
- SVG/PNG plus lossless supported-scope JSON and intentionally lossy CSV export; no Microsoft Project/Primavera interoperability claim;
- native editable PPTX projection: separate task bars, milestones, group labels, time-axis labels, and dependency connectors;
- schedule persistence and browser performance tests for a bounded large fixture.

Required implementation changes: create a family-owned `packages/diagram-gantt` package with AST, parser, limits, date-only arithmetic, semantic validation, dedicated temporal layout, renderer, JSON/CSV adapters, and runtime adapter/registry entry. Integrate the family with the CLI, web capability metadata, text-project persistence, committed-snapshot export path, and the cross-family acceptance suite. Reuse the existing CLI PNG renderer rather than adding a Gantt-specific renderer.

Dependency posture: no new third-party date or Gantt dependency is required for this bounded v1 contract. Use a small internal date-only model and add `date-fns` only if business-day calendars, locale formatting, holidays, or timezones become an explicitly supported contract. Do not add a full third-party Gantt renderer, Mermaid runtime, scheduling engine, or project-file parser in v1; each would add bundle/licensing, determinism, or semantic-fidelity risk.

Official Gantt references show why this is more than bars: common implementations include sections, dependencies, milestones, date formats, exclusions, and vertical markers; see [Mermaid Gantt syntax](https://mermaid.js.org/syntax/gantt.html). Treat those as scope prompts, not a requirement to copy the full feature set.

**Decision**: Gantt is mandatory for public v1. The deferred features above remain outside the v1 promise; ER, state, sequence, network, and other families remain post-v1.

### 15g. ER diagrams — first post-v1 candidate

Scope entities, attributes, primary/foreign/unique keys, cardinality, identifying/non-identifying relations, bounded labels, deterministic ELK-compatible layout, SVG, and explicitly lossy draw.io/JSON export. Defer database-engine-specific types, schema import, migrations, and full UML semantics. The minimum contract should reflect common ER expectations around entities, cardinality, and attributes; see [Mermaid ER syntax](https://mermaid.js.org/syntax/entityRelationshipDiagram).

### 15h. State machines — second post-v1 candidate

Scope states, transitions, guards/actions, initial/final states, notes, and bounded composite states. Reuse graph validation and routing where safe, but keep a dedicated AST and family-owned semantics. Defer full UML state semantics, orthogonal regions, and execution/runtime claims. See [Mermaid state-diagram syntax](https://mermaid.js.org/syntax/stateDiagram.html) for the minimum vocabulary to evaluate.

### 15i. Sequence diagrams — deferred horizontal-layout track

Scope participants/lifelines, synchronous/asynchronous messages, returns, activation bars, notes, and loop/alt/parallel fragments. This requires a dedicated time/order layout and should not be implemented by widening the graph AST or pretending ordinary routed edges preserve message ordering. See [Mermaid sequence-diagram syntax](https://mermaid.js.org/syntax/sequenceDiagram.html) for the minimum interaction vocabulary.

### 15j. Architecture-family expansion before new network/data-flow families

Evaluate data-flow and network/topology needs as constrained architecture enhancements first: relationship direction/protocol labels, ports, zones/trust boundaries, and vendor-neutral infrastructure nodes. Create a separate family only if those semantics cannot remain coherent within the existing C4-style contract. Do not add network, class, org, Kanban, decision-table, or Sankey support to public v1 merely to increase the family count.

### 15k. Editable PowerPoint export — shipped public-v1 capability; contract retained for reference

PPTX is a visual projection of the validated, positioned snapshot, not a replacement source format. BPMN 2.0 XML remains the canonical semantic/round-trip export for BPMN; PPTX edits are not promised to round-trip into `.bpm` or BPMN XML. The exporter must generate genuinely editable PowerPoint objects: native shapes for nodes/bars/milestones, editable text, and native connectors where supported. A single embedded SVG/PNG is not sufficient for the v1 “editable” claim.

Required implementation changes:

- Add a dedicated `packages/export-pptx` package consuming the committed family-neutral AST/geometry snapshot, never reparsing live editor text.
- Use one maintained PPTX writer as the initial implementation dependency; the recommended candidate is `pptxgenjs`, subject to a proof fixture and exact-version lock before install. It exposes slide, shape, text, image, and browser/Node generation APIs; see the [PptxGenJS project](https://github.com/gitbrent/PptxGenJS) and [usage documentation](https://gitbrent.github.io/PptxGenJS/docs/usage-add-slide.html).
- Validate generated files as structured OOXML/PresentationML, not merely by checking the `.pptx` extension; record the [ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/) compatibility boundary.
- Add mappings for flowchart/architecture first, then mind maps, BPMN, and Gantt. BPMN maps activities, events, gateways, pools/lanes, labels, and routed connectors; Gantt maps task bars, milestones, phase labels, time-axis labels, and dependency connectors as separate editable objects.
- Add CLI and web exports, capability metadata, browser download coverage, export-failure dirty-state coverage, and lazy loading/code splitting if the dependency materially increases the web bundle.
- Define slide size/orientation, scaling, clipping, fonts, colors, connector fidelity, long-label behavior, and deterministic pagination or a bounded large-diagram failure.

Do not add Office SaaS/API services, direct hand-written OOXML, PPTX-to-source import, PPTX semantic round-tripping, or native Word-shape authoring to v1. A bounded CLI-only DOCX exporter now exists as a vector-backed, one-page-per-semantic-page projection; it embeds SVG rather than producing individually editable Word shapes. Native Word-shape DOCX and PDF remain deferred.

**Definition of done**: every supported v1 family (BPMN, mind map, flowchart, C4-style architecture, and Gantt) produces a valid PPTX whose primary text and diagram objects are independently selectable/editable; OOXML structure and compatibility checks pass; long labels and bounded large diagrams are handled; SVG, BPMN XML, structured exports, and PPTX derive from the same committed validated snapshot; and documentation states the visual-only/semantic distinction.

### 15l. Gantt review and generation — planned deep-assessment follow-up

**Current state**: Gantt is deliberately fail-closed for AI. `packages/diagram-gantt/src/adapter.ts` advertises semantic validation only; generation, repair, visual review, and geometry inspection are all `false`. The web toolbar consequently disables **Generate** and **Review** from family capability metadata. This is the correct safety behavior today, but enabling the two buttons cannot be reduced to flipping capability flags: the existing AI prompts, validation entry points, review metadata, and browser panels still contain BPMN-specific assumptions.

**Product contract to settle before implementation**:

- Define what **Review** means for Gantt as four separate capabilities: (1) parser/schedule validation, (2) deterministic geometry inspection, (3) model-based visual review of the rendered timeline, and (4) text repair. Do not make a vision model the authority for dates, dependencies, cycle validity, or schedule arithmetic.
- Decide whether deterministic validation/geometry review should become available before model-based review. The family-neutral runtime already extracts Gantt rows and dependencies for inspection, but Gantt currently advertises `geometryInspection: false`, and the web Review button is gated by `visualReview` rather than exposing deterministic inspection independently.
- Keep the shipped Gantt contract authoritative: strict ISO date-only values, one Monday–Friday scheduling calendar, page-aware period distribution, task/group/milestone syntax, finish-to-start dependencies with non-negative lag, cycle detection, bounded limits, display-only progress, and presentation-only timescales. Review or repair must not imply holidays, timezones, resource leveling, baselines, critical-path analysis, automatic rescheduling, or a general scheduling engine.
- Define what a generated schedule may infer. Relative prose such as “in three weeks” needs an explicit anchor-date policy supplied by the user or CLI; the implementation must not silently use the machine’s current date. Generated output should make assumptions visible and must not invent false precision when the description does not provide dates or durations.

**Generation scope and guardrails**:

- Generate a complete `diagram: gantt` source containing `calendar: weekdays`, bounded tasks, groups/phases, milestones, dates/durations, and dependencies where the description supports them. The prompt must teach the exact Gantt grammar and prohibit BPMN events, gateways, pools/lanes, unsupported calendars, and invented scheduling features.
- Require or explicitly collect the minimum scheduling inputs: anchor date or concrete dates, duration convention, calendar, and whether dependencies are explanatory or intended to constrain a plan. Preserve the current rule that generation does not auto-reschedule tasks from dependencies.
- Validate every draft through the family runtime (`validateDiagramSource`/the Gantt adapter), including date arithmetic, weekday duration agreement, unknown references, duplicate IDs, cycles, source/task/dependency/timeline limits, and page-density behavior. Invalid output must enter a bounded repair loop and never be inserted or written automatically.
- Treat date changes and dependency changes as higher-risk than cosmetic label fixes. Repairs should use exact source patches, revalidate after every round, show a diff/preview, and require explicit user acceptance in the web UI. The CLI must retain structured status, attempts, diagnostics, and no-output-on-failure behavior.

**Review scope and visual contract**:

- Extend deterministic inspection for timeline-specific findings: task-label clipping, bar/label collisions, milestone visibility, dependency routing through rows or bars, dependency crossings, dense or unreadable time-axis labels, weekend shading alignment, out-of-bounds bars, and bounded canvas/page readability. Existing generic overlap/crossing checks are useful but do not cover all of these cases.
- Add a Gantt-specific vision prompt only after the deterministic findings and source contract are stable. The prompt must explain that horizontal position encodes dates, bar length encodes duration, milestones are point events, groups are hierarchy, progress is display-only, and dependency arrows are finish-to-start relationships.
- Define image handling for wide timelines before sending them to a provider: preserve enough axis/task detail to be reviewable, bound raster dimensions and payload size, and decide whether a single scaled image, tiled review, or deterministic-only fallback is the honest behavior. A successful provider response must not be interpreted as schedule correctness.
- Limit model patches to safe, exact replacements. Patches that change dates, durations, milestones, groups, or dependencies need stronger confirmation because one edit can affect multiple downstream relationships; structural changes should remain suggestions unless explicitly requested.

**Required architecture changes**:

- Register family-specific generation, repair, and visual-review prompts in one shared family-aware contract used by CLI and web. The browser currently passes `'bpmn'` explicitly in Review and Generate and validates generated text through the BPMN-only helper; both paths must receive the active family and use the family runtime validator.
- Remove BPMN-shaped assumptions from `@bpm/review`: `reviewDiagram()` and `repairDiagram()` currently construct metadata by reading `diagram.nodes`/`diagram.edges` and `repairDiagram()` parses with the BPMN parser. Provide a family-neutral metadata/inspection adapter that can represent Gantt rows, groups, ticks, and dependencies without weakening BPMN typing or semantics.
- Keep capability flags independent: `generation`, `repair`, `visualReview`, and `geometryInspection` should be enabled only when their individual contracts and tests exist. The CLI and web must return the same structured unsupported result for any operation not yet implemented.
- Make the web Generate panel family-aware, including description help, provider prompts, validation, rewrite/repair, active-family labels, and explicit insert behavior. Make the Review panel pass the active family to providers and display whether a finding came from deterministic inspection or a model.
- Preserve provider privacy and reliability controls already documented for AI: explicit opt-in, BYOK/local endpoints, visible cancellation, timeouts, bounded responses/images, no credentials in diagnostics, and no automatic telemetry. Gantt source may contain project names, dates, delivery status, and dependency information, so the data-handling warning must remain visible before remote review.

**Delivery and verification sequence**:

1. Write a Gantt AI contract/spec with the anchor-date and assumption policy, capability matrix, patch-risk policy, wide-image behavior, and non-goals.
2. Add family-neutral metadata and runtime validation plumbing; expose deterministic Gantt validation/geometry review first if its findings are complete and useful without a provider.
3. Add Gantt repair with fixtures for invalid dates, weekday mismatches, missing schedules, duplicate IDs, unknown dependencies, cycles, limits, and unsafe structural edits.
4. Add deterministic/offline generation with explicit anchor inputs, then add Ollama/OpenAI generation behind the same prompt and validation contract.
5. Add model-based visual review only after representative wide, dense, milestone-heavy, grouped, and dependency-heavy fixtures establish a useful image contract.
6. Verify unit, contract, CLI, browser/E2E, cancellation, provider-mock, privacy, malformed-input, oversized-input, deterministic-output, and no-data-loss behavior. Test both valid and unsupported capability combinations so future family work cannot accidentally re-enable an incomplete path.

**Explicit non-goals**: interactive drag-to-reschedule editing, automatic dependency-driven scheduling, critical-path or resource optimization, holidays/timezones/date-time support, Microsoft Project/Primavera import or round-trip, baseline/variance semantics, and treating AI visual review as a project-management correctness guarantee.

**Definition of done**: Gantt exposes only the independently verified AI capabilities in its runtime descriptor; CLI and web behavior agree; generated sources are valid under the exact Gantt grammar and explicit date policy; repairs are bounded, reviewable, and non-destructive; deterministic findings and model findings are distinguishable; wide timelines have a truthful review fallback; provider data handling is explicit; and the existing Gantt parser, renderer, exports, persistence, and PPTX behavior remain unchanged.

### Public-v1 completion priority order

Use this order for the remaining work. A later phase cannot close the public release while an earlier mandatory phase is incomplete.

1. **P0 — Cross-family contract confidence.** Complete 18m's P0 corpus, invariants, cross-export checks, real-consumer checks, and prerelease CI gates; include the now-shipped direction/lane fixtures.
2. **P1 — External BPMN web import.** Implement 16a using the shipped XML importer/DSL printer, revision-safe rendering, persistence recovery, and explicit confirmation.
3. **P1 — CLI/web operational consistency.** Complete 18n and 18o; keep 18f layout calibration and 18l browser evidence as focused follow-ups.
4. **P1 — Release snapshot.** Complete 17a after 18m and the remaining local gates are committed, then run exact release checks against the intended commit.
5. **P2 — Freeform page/canvas contracts.** Take 18p through design/spec first; it is a shared cross-family architecture change.
6. **Post-v1 — Family and AI expansion.** Keep 15g–15j post-v1; start 15l Gantt AI only after deterministic review and contract confidence are strong enough for date/dependency safety.
7. **P8 — Organization deployment.** Verify repository settings, Pages, branch protection, security controls, and the visibility decision as an external release action.

## 16. Diagram-mode → Text import (one-shot, reviewable) — done

**What**: an explicit **Import to Text** action in Diagram mode — export the current `bpmn-js` model, validate it, convert it to `.bpm` text, and show it as a preview the user must explicitly confirm before it replaces the Text-mode editor's content. This deliberately reverses part of the old "Explicitly not planned" stance (see below), but only the scoped, one-shot version — **not** continuous live sync, which was considered and rejected. Full option analysis (serializer design, importer design, position strategy, feedback-loop guard, corruption safety net — five option sets, each with a chosen approach and rejected alternatives) plus a findings section written after implementation: `docs/superpowers/specs/2026-08-17-diagram-mode-text-import-design.md`.

**Why**: cleaning up a diagram by dragging nodes in Diagram mode (e.g. removing overlap) used to be silently lost the moment you switched back to Text mode — Diagram mode's Save only downloads a file, it never wrote back to the `.bpm` source. This closes that gap for the common "I fixed the layout by hand, now I want that in my text" case, without taking on the risk of full bidirectional live sync (permanent auto-layout loss, feedback-loop races, and item 12's DI-corruption bugs, which this item's T2 task also partially addresses — see item 12 below).

**What shipped** (multi-agent work package under `.workspace/agent-queue/` on this branch, seven child tasks T2–T8, all `completed/`):
- **T2** — round-trip corruption safety net gating Diagram-mode Save/Export (`apps/web/src/diagramMode.ts`'s `verifyExportedXml()`); also the mechanism item 12 itself asked for.
- **T3** — `@bpm/print-dsl`, the `.bpm` text serializer this codebase never had (AST → text, the inverse of `@bpm/parser`).
- **T4** — `@bpm/import-xml`, a BPMN XML → AST importer built on `bpmn-moddle`, covering events/gateways/task subtypes/nested subprocess/boundary events/pools+lanes/Camunda extensions/data objects/annotations/associations/message flows.
- **T5** — web **Import to Text** panel in Diagram mode (`apps/web/src/importPanel.ts`), explicit preview/confirm, mode-switch latch (no live sync).
- **T6** — CLI `bpm import-diagram <file.bpmn> [-o out.bpm]`.
- **T7** — integration test suite driving the real browser UI end-to-end across 5 fixtures; found and fixed two real position-mapping bugs in T4 (lane-relative and subprocess-content-relative coordinates) that T4's own package tests had masked.
- **T8** — this doc pass.

**Known limitation** (not a bug, documented in the design doc's findings section): a round trip specifically through bpmn-js's own rendering can occasionally recompute an expanded subprocess's box slightly differently than this tool's own layout engine assumed (two independently developed renderers, no shared padding contract), which can produce a real geometry overlap `@bpm/validate` correctly flags. Content (labels, nesting, kinds) always survives; exact subprocess geometry occasionally needs a manual nudge after import. Not scoped to fix further in v1.

**Explicitly not built** (see design doc for why): continuous/automatic live sync; re-importing an already-imported diagram a second time. Partial pinning is shipped separately and is no longer a pending item here.

## 16a. External `.bpmn` import into the web text/render pipeline — implemented; browser verification pending

**Status**: the web editor now accepts an external `.bpmn` file, converts it through `@bpm/import-xml` and `@bpm/print-dsl`, previews it in Text mode, and requires explicit confirmation before replacing the active source. Browser runtime verification remains pending.

**Goal**: let a user select or drag a `.bpmn` file into the web editor, validate and parse it, convert it to this project's `.bpm` text DSL, preview the resulting diagram in Text mode, and explicitly confirm before replacing the current text source. The existing Diagram-mode Open action must remain available as the lossless/native BPMN editing path.

**Required behavior**:

- [x] Add a clearly named **Import BPMN file** action in the web editor, accepting `.bpmn`/XML files through file selection.
- [ ] Parse through `@bpm/import-xml`, preserve supported BPMN semantics, and report structured diagnostics for malformed XML, unsupported elements, duplicate IDs, missing references, and conversion warnings.
- [x] Convert the imported AST through `@bpm/print-dsl`; render the converted `.bpm` source through the ordinary revision-safe Text-mode pipeline so the user sees the resulting diagram before commit.
- [x] Show a preview/diff or explicit confirmation state; never overwrite the active editor or IndexedDB project until the user confirms. Preserve the current source on parse/conversion failure.
- [ ] Define the fidelity contract: unsupported BPMN/vendor extensions are either preserved in documented DSL fields or reported as lossy conversion warnings. Do not claim XML round-trip fidelity for the text path.
- [ ] Decide how positions are handled. The initial version should use the existing documented import strategy (`positioning: manual` where needed) or clearly state when source BPMNDI coordinates are intentionally discarded and the normal layout engine is used.
- [ ] Complete browser runtime verification for import success, malformed input, unsupported elements, cancel/confirm, stale-render protection, and project persistence.
- [ ] Update `docs/STATUS.md`, `docs/CLI.md`, and the import design documentation when the web workflow ships.

**Dependencies**: `@bpm/import-xml`, `@bpm/print-dsl`, the revision/snapshot render controller from item 18a, project autosave/error recovery from item 18b, and the existing web import-panel/file-download patterns. No new diagram family or continuous bidirectional sync is required.

**Risks and guardrails**: BPMN XML has broader semantic and vendor-extension coverage than the text DSL; silent loss is the primary risk. The import must be one-shot and confirmation-based, surface conversion warnings, keep the original source recoverable, and distinguish “rendered successfully” from “fully preserved.” Large or malicious XML should inherit parser limits and be covered by the quality/fuzz work in item 18e.

**Definition of done**: an external `.bpmn` file can be imported from the web UI, converted and rendered in Text mode, reviewed before replacement, and safely persisted after confirmation; failures are visible and non-destructive; representative fixtures and E2E tests pass; documentation states the exact fidelity and positioning contract.

## 12. Diagram mode (bpmn-js) is error-prone and produces bad XML — partially addressed by item 16's T2, investigation still open

**What**: Diagram mode wraps the real `bpmn-js` `Modeler` for direct drag-and-drop editing (`apps/web/src/diagramMode.ts`), and in practice this path has produced invalid/corrupted BPMN XML during editing. This is a known class of problem in bpmn-js itself, not unique to us: DI (`BPMNDI`) is a loosely-coupled overlay on the semantic process model (shape/edge geometry vs. process elements), and edits that update one without carefully syncing the other are a corruption vector — documented failure modes include namespace loss on re-export (`xmlns:dc`/`xmlns:di`/`xmlns:bpmndi` dropped from `<definitions>`, schema-invalid output that still renders), waypoint/DI corruption (`unparsable content <di:waypoint> detected`, edges vanishing on re-import), and historically poor error surfacing on malformed XML or missing DI.

**Progress**: item 16's T2 task shipped exactly the gating mechanism this item called for — `verifyExportedXml()` (`apps/web/src/diagramMode.ts`) runs a namespace-usage check (a prefix used in the XML but never declared — the real "namespace loss" signature, not merely "declaration absent," since a legitimately edge-less diagram never uses `xmlns:di` at all) plus a round-trip re-import into a scratch `bpmn-js` `Viewer` with an element-id diff against the live model, and now gates both Save and Export. **Still open**: reproducing the *specific* historical corruption(s) that motivated this item against the currently pinned `bpmn-js` version, and checking whether an upstream fix already exists — T2's regression test used a synthetic corrupted-XML fixture representative of the documented failure signature (organic reproduction via live drag-and-drop editing wasn't forced in automated tests, the same judgment call item 16's other tasks made for similar cases).

**Why**: Diagram mode is one of only two authoring paths in this tool (`docs/STATUS.md`) and currently has no safety net — a corrupted export isn't caught until it fails to open elsewhere. Distinct from item 6 (Camunda vendor-extension export) — this is about correctness of what's already exported, not adding new extension attributes.

## 13. Manual editor mode — aspects to consider from ADONIS/Camunda/Signavio

**What**: a survey-informed set of candidate UX aspects for our manual editing experience (both `positioning: manual` in the text DSL and Diagram mode), drawn from how established BPMN tools handle manual/free-form editing. Not a commitment to build any of these — each would need its own scoped design pass. Candidates, roughly by cost/value:
- **"Tidy selection" / align & distribute on a subset**: Camunda Modeler exposes align-left/right/center, top/bottom/middle, and equal-spacing distribution as an explicit action on the *current selection* rather than a full-diagram re-layout — a useful primitive for nudging a few manually-positioned nodes without hand-computing coordinates. Pairs naturally with item 7 (incremental manual-mode edits).
- **Space-insertion tool**: Camunda's "space tool" inserts or removes empty space between already-placed elements, shifting everything downstream — relevant to the same incremental-edit gap in item 7 (today, one node's `at (x,y)` nudge doesn't ripple to neighbors).
- **Predictable snapping**: ADONIS users specifically flag snap-together behavior for intermediate events as clunky/inconsistent — a concrete anti-pattern worth avoiding if any snap-to-grid/snap-to-node behavior is ever added to Diagram mode.
- **Auto-tidy connector routing on demand**: ADONIS offers an explicit "minimize connector crossings" action distinct from continuous auto-layout — closer to our existing obstacle-avoiding router, but worth noting as a manual-mode-compatible on-demand action rather than an always-on layout mode.
- **Inline XML/text escape hatch**: Camunda's Modeler keeps an XML editor tab alongside the visual canvas specifically because the properties panel doesn't expose every vendor extension (e.g. `camunda:formKey` isn't editable in Camunda 8's panel) — analogous to our text DSL already being the "escape hatch" relative to Diagram mode; worth keeping in mind if Diagram mode ever grows a properties panel of its own.
- **Version history as autosave + explicit publish checkpoints**: Signavio auto-saves every edit but keeps a separate list of explicitly "published" versions — relevant only if/when item 4 (project-based diagram saving) is scoped, as a model for history without forcing manual save discipline.
- **Lightweight comment-only collaboration**: Signavio lets external reviewers get a comment-only view without a full license — worth keeping in mind if collaboration/review ever extends beyond the current single-user AI review panel (`docs/AI_REVIEW.md`).
- Lower priority / not clearly applicable here: Signavio's shared glossary/dictionary for risk-and-control terms is governance-oriented and doesn't map to this tool's scope.

**Why**: these are tools our users (or evaluators) will naturally compare us against; several candidates here (align/distribute on selection, space-insertion) directly overlap with the incremental-editing gap already tracked in item 7, so scoping them together avoids solving the same problem twice under different names.

## 17. Public repository readiness and future commercial boundary — in progress

**What**: complete the release, legal, security, documentation, governance, and supply-chain work required to make the source repository public and safe for outside users and contributors. This track does **not** change the locked MIT decision and does **not** require npm publication, a hosted demo, or a commercial licensing decision.

**Current baseline**: the workspace passes `npm run test:coverage` (655 tests across 88 files; Vitest 4 baseline 66.06% statements, 66.85% lines, 68.77% functions, 60.35% branches), the Playwright suite (57 tests), the production build, workflow/style validation, deterministic notices, a clean `npm ci`, and `npm audit --omit=dev` with 0 vulnerabilities. Public v1 remains blocked only by release-snapshot curation/tagging and organization-side GitHub settings; the local hardening items below are now implemented unless explicitly marked residual.

### 17a. Public-source release blockers

- [ ] **Release-integrity commit** — curate the working tree into one intentional release-candidate commit before treating the shipped checklist as verified. Exclude or explicitly classify undecided content; do not tag from a mixed staged/untracked state.
- [ ] **Exact-snapshot verification** — run clean-install, build, coverage, E2E, notice, workflow, and production-audit checks against that commit and record the results in the handoff.
- [ ] **Release tag** — publish the prepared `v1.0.0` tag from the exact clean public snapshot; earlier private tags are intentionally not copied.

These are required before changing the GitHub repository to public:

- [x] **Third-party license inventory** — `THIRD-PARTY-NOTICES.md` is generated from the lockfile and installed tree, with exact versions, package metadata, source information, and applicable license text; missing upstream license files are explicitly flagged for manual review. Regenerate with `node scripts/generate-third-party-notices.mjs`.
- [x] **bpmn.io attribution** — `docs/maintainer/OPEN-SOURCE-READINESS.md` records the bpmn.io license/watermark obligation, and the Playwright suite asserts the visible, in-canvas `.bjs-powered-by` attribution on Diagram mode.
- [x] **Other copyleft/notice obligations** — the generated inventory records production dependencies including `elkjs` (EPL-2.0) and `@resvg/resvg-js` (MPL-2.0), with their license text where shipped.
- [x] **Release truth** — package `0.0.1` values are documented as unpublished internal workspace metadata; current candidate release tagging remains open.
- [x] **Documentation truth pass** — `README.md`, `STATUS.md`, `ROADMAP.md`, `HANDOFF.md`, and `ASSESSMENT-HANDOFF.md` describe the shipped one-shot Import to Text path, limited Camunda 7 export attributes, implemented legality diagnostics, and Save/Export integrity gate consistently.
- [x] **AI data-handling disclosure** — `docs/AI-DATA-HANDLING.md` documents remote source/image submission, Ollama/local behavior, browser storage, IndexedDB persistence, and no default telemetry.
- [x] **Public-tree review** — `.workspace/agent-queue/` was reviewed as internal orchestration metadata, removed from the tracked tree, and added to `.gitignore` before the public handoff.
- [x] **Secret and history scan** — scanned all reachable Git history and the current tracked tree for common API-key/token/private-key patterns, reviewed sensitive-looking tracked filenames, and confirmed no matching secret hits; no release artifact directory is tracked. This is a repository hygiene scan, not a substitute for legal/privacy review.
- [ ] **Repository settings** — create or verify the GitHub remote, default branch, branch protection, required CI checks, security-advisory settings, and public issue/discussion policy.
- [x] **Free public playground (GitHub Pages) — prepared for the clean public repo** — `apps/web` is already a pure client-side build (no backend, no account; IndexedDB for project storage; AI Review/Generate panels are opt-in and reuse the API key stored in browser Settings/local storage). `.github/workflows/pages.yml` builds and deploys `apps/web/dist` via `actions/deploy-pages` on every push to `main`; `apps/web/vite.config.ts` emits `/diagram-as-code/`-prefixed asset paths when `GITHUB_PAGES=true` (verified with a local build) so it resolves correctly at `https://intentgraphs.github.io/diagram-as-code/`. Remaining steps: create the public repository, enable Settings → Pages → Source: "GitHub Actions" (one-time), then push to `main`. This gives users a bpmn.io/draw.io-style try-it-now editor with no signup.

**Why**: passing tests alone does not establish that users may legally redistribute the application, understand where their diagram data goes, or receive a coherent and maintainable public project.

### 17b. Public-contributor baseline

Complete before actively inviting external contributions, but these do not need to delay a read-only public launch:

- [x] Add `.github/CODEOWNERS`, issue templates, and a pull-request template. The current fallback owner is the maintainer account; replace it with an organization team after repository setup.
- [x] Add a concrete security-reporting contact; `SECURITY.md` names the maintainer fallback. Enabling GitHub private vulnerability reporting remains an organization-side setting in item 17a.
- [x] Add GitHub Actions least-privilege `permissions`, dependency review, CodeQL where applicable, and an action pinning/maintenance policy; secret scanning and push protection remain maintainer-side settings on the organization repository.
- [x] Add and run the repository style gate (`npm run check:style`) in CI; it rejects carriage returns and trailing whitespace in authored source/config files. An opinionated formatter remains optional follow-up work.
- [x] Add coverage measurement with an intentionally chosen threshold; do not present test count as coverage. The CI gate is `npm run test:coverage`.
- [x] Decide and document supported Node versions and whether the project promises Windows/macOS support in addition to Linux CI. Node 20–22/npm 10 are supported; Linux CI is authoritative, macOS is maintainer-verified, and Windows is not a v1 promise. See `CONTRIBUTING.md` and `docs/BROWSER-SUPPORT.md`.
- [x] Add a contributor-facing architecture map, package ownership map, browser support statement, and accessibility expectations.
- [x] Add deterministic seeded parser/XML mutation corpora covering malformed input, non-finite geometry, oversized values, element/depth budgets, and typed failure behavior. A third-party generative fuzzing service remains optional follow-up work.

**Why**: these controls make outside participation predictable and reduce the chance that the first public contributions create inconsistent style, unsupported platform expectations, or unreviewed security regressions.

### 17e. Public launch messaging and adoption baseline

Fresh launch-blueprint assessment. These items are about whether a new visitor can understand the product, try it quickly, and choose it for the right job; they are separate from package publication and hosted-product work.

- [x] Name the public audiences and promise in the README: diagram-as-code developers, AI/LLM tooling builders, and process/business analysts.
- [x] Add a five-minute first-use path covering the browser playground destination, local CLI validation/rendering, examples, and the current no-published-packages expectation.
- [x] Add direct expectations for local-first storage, BPMN XML versus editable PPTX fidelity, optional AI/BYOK behavior, supported platforms, and the absence of hosted collaboration/execution in v1.
- [x] Add a cautious comparison/positioning table with links to draw.io, bpmn-js, PlantUML, and Camunda Modeler, plus a [`Coming from draw.io/bpmn-js`](../COMING-FROM-DRAWIO-BPMNJS.md) migration guide.
- [x] Add an optional [`Mermaid syntax comparison`](../MERMAID-SYNTAX-COMPARISON.md) for adjacent-user adoption only; do not add Mermaid parsing, runtime, import/export, or compatibility support to v1.
- [x] Add a contributor Dev Container path so the monorepo's Node/build prerequisites are reproducible without a host Node setup.
- [x] Surface the current trust signal and limitation links in the README; release notes lead with searchable capabilities rather than internal roadmap numbers.
- [x] Capture and commit a hello-diagram screenshot for the README. This is the highest-leverage documentation/adoption item before public visibility; a short GIF can replace it later.
- [ ] After creating `IntentGraphs/diagram-as-code`, enable GitHub Pages, verify the playground URL, and configure the repository description/topics from the release plan. The local workflow, URL, description, and topics are prepared; Pages still needs the GitHub-side enablement.
- [x] Keep scoped npm publication and a zero-install `npx` path outside v1; packages remain unpublished until package metadata, ownership, semver, and consumer smoke tests are deliberately prepared.

**Definition of done**: a first-time visitor can identify the target user, understand the fidelity/security boundaries, reach the browser or CLI quick start, and find a migration path from draw.io or bpmn-js without mistaking v1 for a hosted execution platform.

### 17c. Optional npm/package release track

Do this only if npm distribution becomes an explicit Phase 6 goal. It is not required for a public source repository:

- [ ] Decide which packages are public and which remain private (`@bpm/web` and `@bpm/review` are currently private in package metadata).
- [ ] Add package-level `license`, `repository`, `homepage`, `bugs`, `engines`, `files`, and stable `exports` metadata.
- [ ] Replace internal wildcard dependency ranges with a deliberate publication/versioning strategy.
- [ ] Decide whether the project uses whole-repository releases or independently versioned packages; publish matching changelog and migration guidance.
- [ ] Add package smoke tests from a clean consumer project, provenance/attestation where available, and a release workflow that includes third-party notices.
- [ ] Do not publish packages merely because the repository is public; package API stability is a separate maturity decision.

**Why**: the current whole-repository Git-tag model is adequate for source collaboration, while npm consumers need stable package boundaries, installable artifacts, and semver guarantees.

### 17d. Future commercial product boundary — design only

The current licensing direction remains:

- [ ] Keep the existing project/core code MIT-licensed.
- [ ] Treat hosted collaboration, team administration, enterprise identity, audit/compliance, managed AI, and support as separate commercial product surfaces.
- [ ] Require accounts or commercial contact only for those hosted/enterprise services, not for use of the MIT source code.
- [ ] Define what usage metrics are collected, why, retention, tenant isolation, and opt-out behavior before adding telemetry or account checks.
- [ ] Obtain legal advice before introducing AGPL dual licensing, source-available terms, usage restrictions, or any relicensing of existing contributions.

**Explicit non-goal**: do not add phone-home enforcement to the MIT core. A restriction that permits personal use but requires commercial users to connect or request permission would not satisfy the project's stated open-source goal. If a future commercial restriction is preferred, it must be described as source-available/proprietary rather than open source.

**Safe to defer until the commercial product exists**: billing, SSO/SAML, hosted usage metering, tenant isolation, backend synchronization, enterprise support contracts, managed-provider credentials, and commercial license enforcement.

## 18. Engineering stability and risk reduction — in progress (18a–18k shipped; residual calibration remains)

**What**: address the engineering review's correctness, data-safety, type-safety, provider, quality-gate, and layout-quality findings before adding another diagram family or a larger editor feature. This is deliberately staged as small behavior-preserving increments, not a broad rewrite.

**Source artifacts**: [engineering review](ENGINEERING-REVIEW.md) and the validated editable [architecture diagram](../architecture.drawio). The review baseline was 590 unit tests across 78 files; the current verification is 655 tests across 88 files, 57 passing Playwright tests, a passing production build, and successful XML/draw.io/PPTX structural validation. Native draw.io image export was unavailable because the installed wrapper points to a missing desktop application bundle; the `.drawio` source remains the canonical editable artifact.

### 18a. Committed render snapshot and async race safety — shipped 2026-08-18

- [x] Add a monotonically increasing render revision to the web render pipeline.
- [x] Capture the exact source and revision at request start; only the latest request may commit SVG, diagnostics, capabilities, `lastResult`, or export state.
- [x] Keep the committed family-neutral execution snapshot in the web revision tracker and use its validated AST/layout pair for structured export.
- [x] Make every text-mode structured export consume the committed snapshot rather than reparsing the live editor value.
- [x] Add deterministic revision-gate tests proving an older request cannot overwrite a newer preview or export.

**Definition of done**: rapid edits cannot display or export stale content; all enabled exports correspond to the same validated snapshot; existing unit, build, and Playwright suites remain green.

### 18b. Persistence failure visibility and recovery — shipped 2026-08-18

- [x] Replace silent autosave failure handling with explicit `saving`, `saved`, and `error` state.
- [x] Surface IndexedDB/quota/transaction failures in the project UI with the actual recoverable message and a retry action.
- [x] Add controller-level rejection handling for UI-launched asynchronous project operations: create, rename, switch, delete, and autosave.
- [x] Add failure-injection tests that reject writes and verify dirty-state retention and retry behavior.

**Definition of done**: a failed save cannot appear successful, the user receives an actionable warning, and no project operation produces an unhandled promise rejection.

### 18c. AI provider request controls — shipped 2026-08-18

- [x] Add a shared timeout and `AbortSignal` contract for Ollama/OpenAI-compatible requests in the Node review package and browser providers.
- [x] Bound response size, classify timeout/cancellation/provider errors, and avoid automatic retries for provider failures.
- [x] Add visible Cancel actions to browser Review and Generate panels; propagate cancellation through repair loops.
- [x] Add provider tests for timeout, cancellation, and bounded response failure behavior.

The default provider timeout is 30 seconds and the default response cap is 1 MB; callers can override both through the request options. The remaining public-readiness disclosure work stays in item 17: remote providers can receive source text and rendered images, Ollama is local by default, web API keys are stored in browser local storage through Settings, CLI keys remain environment-only, project text remains in IndexedDB, and the application has no default telemetry.

**Definition of done**: review/generation cannot wait indefinitely, cancellation is observable in the UI/CLI, and provider failures do not leak credentials or raw oversized responses into diagnostics.

### 18d. Type and controller boundary hardening — shipped 2026-08-18

- [x] Replace production `any` and unsafe boundary casts in parser pool bookkeeping, ELK graph conversion, render unions, architecture layout/export, and AI validation/repair results with typed adapters or narrowing helpers.
- [x] Add a focused render-controller seam that owns revision capture, pipeline execution, latest-result commit, and invalidation; cover delayed old/new requests and explicit invalidation with deterministic tests.
- [x] Enable stricter compiler checks globally (`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`) without weakening existing package builds.
- [x] Split `apps/web/src/main.ts` along tested state boundaries: render controller, project controller, and diagram-mode controller; keep DOM composition in the entrypoint.
- [x] Preserve the explicit runtime composition root and family-owned adapters as an ongoing architecture invariant; do not widen the BPMN AST to accommodate new families.

**Definition of done**: typed parser/layout/render/review boundaries compile cleanly, the render/project/diagram controllers have explicit seams, stricter compiler checks pass across the workspace, and full unit/build/E2E verification remains green without behavior change.

### 18e. Quality and release gates

- [x] Add a repository style/lint gate and run it in CI. `npm run check:style` checks authored source/config files for carriage returns and trailing whitespace; adding an opinionated formatter is deliberately deferred to avoid a broad release-only reformat.
- [x] Add coverage measurement with a documented baseline threshold; do not use test count as a coverage proxy. `npm run test:coverage` measures authored TypeScript source (excluding generated `dist/`) with Vitest 4 and enforces 60% statements, 60% lines, 65% functions, and 55% branches; the 2026-08-19 baseline is 66.06% / 66.85% / 68.77% / 60.35% respectively. The Vitest 4 migration changed function/branch accounting, so this baseline is tracked explicitly rather than compared numerically with the historical Vitest 2 report.
- [x] Add deterministic adversarial and seeded mutation parser/XML input tests for malformed, oversized, pathological, and numerically unsafe input handling. External generative fuzzing remains optional.
- [x] Make the Playwright host explicit and cross-platform (`127.0.0.1`); the staging pass updated `apps/web/playwright.config.ts` and verified 57/57 e2e tests with local socket access.
- [x] Add explicit least-privilege CI permissions, PR dependency review, and a CodeQL workflow; maintainer-only secret-scanning enablement and the documented action pinning/maintenance policy remain repository-side controls.
- [x] Complete the local portion of item 17's license notices, bpmn.io attribution/watermark verification, version truth, security policy, and history scan; organization repository settings remain the separate external go/no-go.

**Definition of done**: CI enforces the chosen maintainability/security gates, release documentation has one version truth, and public visibility remains blocked until item 17a is complete.

### 18f. Layout quality budget and residual crossing debt

- [x] Keep the existing deterministic crossing fixtures and add seeded adversarial input coverage around layout/validation boundaries.
- [x] Classify crossings and route fallbacks and expose a machine-readable `quality` grade (`A`–`D` or `invalid`) with score, reasons, and `presentationReady`.
- [ ] Calibrate family-specific thresholds for “valid” versus “presentation-ready” output. The initial workspace-wide thresholds are explicit and safe for v1; calibration is follow-up quality work, not a release blocker.

**Definition of done**: callers can distinguish semantic validity from layout quality, and residual crossings/route fallbacks are measured rather than treated as an unbounded visual debt.

### 18g. Release snapshot, notice, and CI supply-chain integrity

Fresh multi-role assessment finding. This is separate from GitHub repository creation: the local release unit itself must be reproducible and legally reviewable.

- [x] Correct third-party notice generation for nested workspace installs. The generator resolves package-local license metadata and marks missing upstream license text for review rather than inheriting the repository `LICENSE`.
- [x] Regenerate `THIRD-PARTY-NOTICES.md` from the lockfile and a clean `npm ci`; `npm run check:third-party-notices` now fails when deterministic output differs, and CI runs that check.
- [x] Scope `.github/workflows/pages.yml` permissions to the deploy job; `npm run validate:workflows` checks workflow semantics and the approved official major-tag action policy, and CI runs it.
- [x] Encode the supported runtime contract (`engines`, npm version, and `.nvmrc`); CI now uses the root build plus clean install, coverage, notices, audit, and E2E commands. Commit/tag identity and release-scope decisions remain final handoff work.
- [x] Make the root `npm run build` dependency-ordered through [`scripts/build-workspaces.mjs`](../../scripts/build-workspaces.mjs); the first GitHub Actions run exposed that unordered workspace builds passed locally only because stale `dist/` outputs were present.
- [x] Exclude domain-specific staging plans and examples from the v1 public candidate per release-scope decision. They are not part of the candidate.
- [x] Refresh `docs/maintainer/HANDOFF.md` from the final committed release-candidate snapshot; verify the exact SHA with `git rev-parse HEAD` and repeat after any subsequent release-snapshot change before tagging/pushing.

**Definition of done**: the release snapshot can be recreated from a clean checkout, notices are not misattributed, workflows meet the documented permission policy, runtime expectations are explicit, and every shipped artifact has an intentional release-scope decision.

### 18h. Persistence integrity and untrusted-input resource budgets

Fresh multi-role assessment finding. Existing 18b makes persistence failures visible, but does not guarantee cross-store consistency; existing parser limits do not cover imported XML or numeric geometry.

- [x] Make project/diagram/session mutations atomic across IndexedDB stores, with failure-injection coverage proving a failed related write rolls back the transaction and preserves the previous saved body.
- [x] Add a versioned IndexedDB schema migration path (`DB_VERSION = 2` with persisted `schemaVersion`) plus persisted-record recovery for missing session references and malformed diagrams. A user-facing reset/export recovery flow remains optional follow-up work.
- [x] Centralize resource budgets across DSL and external import: XML bytes/elements/depth/waypoints, browser pre-read, persisted-body limits, import cancellation/timeout, and numeric geometry validation are covered. Generated-canvas bounds remain a follow-up guard.
- [x] Add regression tests for `NaN`/`Infinity`/huge geometry, pathological XML, oversized browser files, seeded parser/XML mutations, and partial persistence failures without weakening the existing user-visible error/retry behavior.

**Definition of done**: malformed, oversized, or numerically pathological input fails predictably before expensive layout/render work, and a failed persistence operation cannot leave an unrepairable project/session state.

### 18i. Web interaction truthfulness and accessibility acceptance

Fresh product/UX assessment finding. The current accessibility test is a smoke test, and Diagram-mode export can clear dirty state before the export integrity lifecycle has completed.

- [x] Keep Diagram-mode dirty state until export integrity succeeds and the download operation is invoked; focused tests cover the integrity gate, unsaved-change behavior, and injected browser download failure.
- [x] Add semantic live regions/status or alert roles for parse errors, import warnings, save failures, and stale-preview state; distinguish warnings from blocking errors visually and to assistive technology.
- [x] Give splitters separator semantics and keyboard resizing, add panel labels/`aria-controls`, focus movement on open and focus return on close, and automate the primary keyboard/focus checks in Playwright.
- [x] Document the v1 browser/viewport contract in [`../BROWSER-SUPPORT.md`](../BROWSER-SUPPORT.md): Chromium CI coverage and a tested 900×800 narrow desktop viewport are supported; mobile and Firefox/WebKit remain explicitly outside the v1 promise.
- [x] Replace native `prompt()` project naming with an accessible validation flow; the dialog supports validation, cancel, Enter-to-submit, create, and rename. Diagram-mode `.bpmn` persistence remains explicitly documented as out of scope.

**Definition of done**: key editor operations remain truthful under failure, keyboard and assistive-technology users can navigate the primary workflow, and the support contract matches tested browser/viewport behavior.

### 18j. Test-toolchain and workspace reproducibility alignment

Fresh architecture assessment finding, now implemented. Vitest 4 is the canonical workspace runner; the web project has an explicit package-root config, and the root `test.projects` boundary excludes linked worktrees and Playwright E2E files.

- [x] Explicitly isolate the root Vitest/coverage toolchain from the web-only Vitest entry point with a documented rationale and independent commands.
- [x] Add clean-install CI verification using the root build, coverage, notice, audit, and web E2E commands; the web config remains discoverable at `apps/web/vitest.config.ts`.

**Definition of done**: a new contributor can install once and run the documented test command with the same runner/coverage behavior used in CI.

### 18k. PPTX production dependency security exception — resolved 2026-08-19

The editable PPTX exporter remains on PptxGenJS 3.12.0, but the vulnerable transitive `image-size` package is replaced in this workspace by the private, bounded `vendor/image-size-safe` compatibility package. It accepts only the raster headers needed for compatibility, caps input at 8 MiB, rejects unsupported formats, and contains no upstream vulnerable parser implementation. The v1 exporter itself emits native vector shapes and does not accept user-provided raster images.

- [x] Replace the vulnerable `image-size` path without downgrading PptxGenJS or losing editable PPTX output.
- [x] Keep CI's strict `npm audit --omit=dev` check; clean-install verification reports 0 production vulnerabilities. No risk acceptance exception is required for v1.

**Definition of done**: strict production audit passes with no exception, and the replacement remains covered by the lockfile/notice/style gates.

### 18l. Known-issue triage after the v1.1.2 release snapshot — newly recorded

The 2026-08-19 live-editor investigation is recorded in
[`KNOWN-ISSUES-2026-08-19.md`](KNOWN-ISSUES-2026-08-19.md). It is intentionally
separate from the completed release snapshot so confirmed post-release defects
are not confused with shipped capability claims.

- [x] Record evidence state, reproduction boundaries, and the retracted gateway
  hypothesis without presenting it as a bug.
- [x] **P0 containment** — apply the existing source/node/edge limits before the
  live parser/layout path; show a clear limit error and gate render-dependent
  actions while a render is active (KI-02/KI-03). Covered by adapter, controller,
  unit, and Playwright regressions on this branch.
- [x] **P0 export correctness** — scale editable PPTX text with the scaled
  geometry, define bounded too-small behavior, and add OOXML regression coverage
  for native editable geometry/font projection (KI-04). Pixel-identical
  renderer output is explicitly outside the v1 PPTX projection promise. Wide
  Gantt timelines use family-specific pagination so the label column and
  timeline text remain readable and editable.
- [x] **P1 large-diagram public safety** — bound synchronous parser/layout work
  with tiered routing-aware complexity admission: warning at 5,001 units,
  explicit/manual rendering through 25,000, and hard rejection above that
  ceiling, with unit, runtime, and live-pipeline coverage (KI-01).
- [x] **P2 structural diagnostics** — define accepted warning/error semantics
  for duplicates, self-loops, orphan nodes, terminal reachability, cycles, and
  mixed gateway join/split topology, with parser and validator fixtures (KI-05).
- [ ] **P3 evidence request** — obtain a real-browser trace for the unconfirmed
  reload/crash report before scoping a fix (KI-06).

**Triage sequencing rule**: the public-scope fixes are implemented and verified.
Future routing optimization and renderer-specific PPTX fidelity work are
follow-up improvements, not release blockers. Keep them separate from the
unconfirmed Diagram-mode crash investigation.

### 18m. Adversarial contract verification and prerelease confidence — active P0

The current unit suite is green, but ordinary example-based coverage cannot reliably
detect silent data loss or fidelity drift between parser, layout, SVG, BPMN XML,
draw.io, JSON/CSV, and PPTX paths. This workstream makes cross-boundary correctness
an explicit release concern. The governing principle is: every pipeline boundary
needs an oracle for what must be preserved; test count and line coverage are not
substitutes for that oracle.

**Current implementation status**: the shared pagination contract, BPMN semantic
pagination, editable multi-slide PPTX, vector-backed multi-page DOCX, CLI/web
pagination diagnostics, strict PPTX/Gantt fit handling, DOCX resource/page-size
guards, exporter error-code preservation, and structured continuation validation
are implemented and covered by focused tests. The current integration snapshot
passes the full workspace test suite, build, style check, and diff check. These
changes advance the implementation but do not close this item: real PPTX/DOCX
consumer checks, the complete cross-family corpus, prerelease CI gates, and the
broader property/metamorphic/stress/security work remain required.

#### Public-release gates — P0 before the next public tag

- [ ] Define a shared contract corpus covering representative, invalid, oversized,
  long-label, nested, manual-positioned, paged, and semantically mixed diagrams for
  all five families. Include BPMN subprocesses with internal flows, message/
  association/conditional/default edges, Gantt page/timescale directives, and extreme page
  dimensions.
- [ ] Add universal output invariants to the corpus: no `NaN`/`Infinity`, finite
  positive geometry, resolved edge endpoints, deterministic output, valid SVG/XML,
  declared page containment, and no silent loss of source nodes, edges, labels, or
  nested child edges where the target format claims to preserve them.
- [ ] Add cross-export contract tests. Compare structural identities and semantics
  across runtime SVG, BPMN XML, draw.io, JSON/CSV, and PPTX without requiring pixel
  identity. The first required regressions are strict-fit consistency, nested BPMN
  edge preservation, BPMN edge-type mapping, and Gantt declared-page/timescale sizing.
- [ ] Add real-consumer checks for generated artifacts: parse SVG/draw.io XML,
  re-import BPMN XML with the available BPMN consumer, inspect PPTX ZIP/OOXML
  structure and slide dimensions, and use a headless office consumer where the
  environment provides one.
- [ ] Add a release acceptance check proving that a valid source either exports
  correctly or fails with a typed, user-actionable diagnostic. A successful export
  that silently omits content is a release failure even when the file opens.
- [ ] Require this contract corpus and consumer validation in the prerelease CI
  path. A green `npm test` alone is not sufficient evidence for a public tag.

#### Next-version hardening — P1 after the public-release gates

- [ ] Build grammar-aware property generators rather than relying on blind random
  strings. Generate valid and near-valid BPMN, mindmap, flowchart, architecture,
  and Gantt sources, including duplicate IDs, dangling references, deep nesting,
  dense graphs, large labels, Unicode, extreme numeric values, and malformed
  directives.
- [ ] Add metamorphic tests with predictable transformations: ID renaming,
  whitespace changes, translation of manual coordinates, page scaling, insertion
  of isolated nodes, source/export/import/reprint cycles, and nested-edge moves.
  Assert preserved topology, geometry relationships, page behavior, and semantic
  content rather than exact serialized output.
- [ ] Add differential tests between `executeDiagramSource()` and
  `validateDiagramSource()`, between auto and frozen/manual layouts, and between
  each supported exporter. Compare node/edge IDs, hierarchy, labels, page sizes,
  edge kinds, and object counts.
- [ ] Add dedicated XML mutation/security testing for missing namespaces, duplicate
  IDs, malformed CDATA/comments, DTD/entity declarations, deep nesting, huge
  coordinates, missing DI, and unknown BPMN elements. Enforce bounded completion,
  no external reads/fetches, typed failures, and no silent semantic deletion.
- [ ] Add mutation testing against page parsing/fitting, nested traversal, import/
  export mapping, legality checks, and family adapters. The suite must fail when
  a child-edge traversal, page-fit check, or semantic mapping is deliberately
  removed.
- [ ] Add bounded stress tests for maximum node/edge counts, dense cross-links,
  deep subprocess trees, large waypoint lists, many Gantt groups/dependencies,
  and tiny/huge pages. Enforce time, memory, output-size, and slide-count limits.
- [ ] Add visual regression support for representative SVG/PPTX projections using
  rasterized snapshots plus geometry heuristics. Visual comparison is a secondary
  oracle; structural and semantic checks remain authoritative.

#### Automation and failure handling

- [ ] Run a small deterministic seed set on every pull request, with the seed and
  minimized `.bpm`/XML input attached to failures.
- [ ] Run a larger randomized corpus nightly and retain failing seeds as fixtures.
- [ ] Make every generated failure reproducible from: family, seed, source/XML,
  operation, elapsed time, node/edge counts, and the first failing pipeline stage.
- [ ] Keep generated artifacts and temporary fuzz output outside the tracked source
  tree unless promoted into a regression fixture.
- [ ] Track separate statuses for semantic validity, geometry quality, export
  fidelity, consumer compatibility, performance, and security; do not collapse
  them into one passing test count.

**Definition of done**: the prerelease pipeline can demonstrate that supported
content is preserved across every advertised export boundary, malformed and
pathological input fails predictably within resource limits, generated files open
in real consumers, and future failures produce minimized reproducible fixtures.
The P0 gates are a public-release requirement; P1 fuzzing, metamorphic testing,
mutation testing, nightly stress, and visual regression are next-version quality
commitments unless a release-risk review explicitly promotes them earlier.

**Sequencing rule**: implement 18a and 18b first, in separate small commits. Implement 18c next. Do 18d only after behavior is protected by those tests. Run 18e before publishing or inviting broad contributors. Keep 18f independent of the editor-controller refactor. Do not start another diagram family until 18a–18c are complete unless a separate risk review explicitly accepts the race, persistence, and provider debt.

### 18n. CLI contract, ergonomics, and packaging hardening — incremental; not closed

The CLI is functionally useful and its current package suite is green, but its command
handlers still combine argument interpretation, domain orchestration, diagnostics, and
filesystem output. That makes each new command or export target add duplicated behavior
and makes the shell contract harder for humans, agents, and CI scripts to predict. The
assessment is recorded in [`maintainer/ENGINEERING-REVIEW.md`](ENGINEERING-REVIEW.md),
with the current command contract in [`CLI.md`](../CLI.md).

#### Implemented increment — 2026-08-22

The first CLI usability slice is shipped and covered by package tests plus real-binary
acceptance checks:

- [x] Human-readable defaults with `--json` machine output on stdout; JSON failures no
  longer require scraping stderr.
- [x] Safe aliases: `check` → `validate`, `import` → `import-diagram`; preferred
  `--output`, `--layout`, and export `--format` spellings retain legacy flags.
- [x] `bpm fix <input> -o <output>` is explicit and non-destructive; `review` remains
  read-only. Output-producing commands use atomic replacement and avoid partial files.
- [x] `-` stdin input, artifact stdout for text conversion/generation/freeze, `--` option
  termination, multi-word generation descriptions, `--version`, and command-specific help.
- [x] CLI docs, README, status, AI-review guidance, and this roadmap describe the same
  stream, output, alias, and repair contract.

The P2 CLI slice is now complete: runtime capability discovery, typed command metadata,
format discovery, SARIF/changed-file checks, and a clean dependency-aware CLI build path
are shipped. The remaining 18n work is the deeper discriminated parser/service refactor
and the broader 18m adversarial corpus.

#### Public-contract gates — P0 before treating the CLI as release-stable

- [x] Define one command-by-command contract for positional arguments, supported options,
  stdout/stderr behavior, JSON shape, exit codes, binary-output restrictions, and
  unsupported-family/format diagnostics.
- [x] Add subprocess acceptance tests against the real `bpm` binary for help, invalid
  usage, missing input, invalid diagrams, output-file failures, text stdout, binary
  output, and exit-code/stream separation.
- [x] Keep `validate`, `render`, `export`, `review`, `fix`, `generate`, `import-diagram`, and
  `freeze` behavior aligned with the documented contract as family adapters and targets
  expand.

#### Simplification and maintainability — P1

- [x] Add a typed command registry and command metadata. Generate command help from that
  registry; reject irrelevant options, support `--`, and derive family/format choices
  from runtime capabilities instead of duplicating lists in the CLI parser. A deeper
  discriminated `ParsedArgs` union remains a follow-up refactor.
- [x] Centralize typed CLI errors, diagnostic formatting, JSON serialization, exit-code
  selection, and text/binary output handling. Preserve artifact stdout semantics while
  keeping human diagnostics on stderr and machine JSON on stdout.
- [x] Add shared input/output services: stdin/stdout via `-`, atomic output writes, and
  consistent read/write failure handling. Do not create
  or partially overwrite an output file when the operation fails.
- [x] Move reusable orchestration such as source freezing, import-and-validation,
  review/repair, and exporter selection into domain/runtime services so CLI commands stay
  thin adapters over existing libraries.
- [x] Simplify common workflows with safe aliases (`check` for `validate`, `import` for
  `import-diagram`), multi-word generation descriptions without shell-specific quoting
  traps, and discoverable export-format listing. Keep semantic verbs rather than hiding
  every operation behind a generic conversion command.
- [x] Make the CLI usable from a clean workspace install with `npm install && npm run bpm`
  or `npm run build:cli`; document the boundary between workspace development execution
  and a future publishable `bpm` binary.

#### Git-native checking and SARIF

- [x] `bpm check --changed` validates changed tracked and untracked `.bpm` files using
  `git diff`/`git ls-files` and supports `--base` for CI branch comparisons.
- [x] `--format sarif` emits SARIF 2.1.0 with stable rule IDs, source-relative URIs,
  line/column locations, and warning/error levels.
- [x] `bpm capabilities [--json]` exposes runtime family, AI, PPTX, and export metadata.

**Definition of done for the remaining 18n work**: the CLI has one versioned, tested
stream/error contract; each command accepts only its own typed options; shared runtime
capabilities drive help and validation; successful operations write complete artifacts
atomically; stdin/stdout pipelines work; and a clean-install or documented workspace path
runs `bpm` without a manual sequence of package rebuilds. The first contract,
stdin/atomic/alias, capability, SARIF, and clean-build slice is complete; the deeper
discriminated parser/service refactor remains open.

### 18o. Web editor loading-state consistency — incremental; not closed

The web editor has useful loading/status fragments, but they are not yet consistent across
the whole editor lifecycle. Text rendering exposes a busy flag and a `Rendering…` toolbar
status; AI Review, Generate, and Diagram-mode Text import expose more detailed phase text;
autosave exposes saving/saved/error states. The gaps are initial project bootstrap, source
file reads and project switching/import, Diagram-mode XML load/new/export, project-bundle
preparation, and the interval between an editor change and the start of a debounced render.
The current text pipeline also exposes one async execution promise around synchronous
parse/render work and asynchronous layout, so it cannot honestly report percentage progress
without a deeper runtime contract.

**Recommended first slice — UI-level, named states**:

- [ ] Distinguish `Waiting to render…`, active rendering, committed, and error states in the
  existing toolbar status; mark the previous preview stale while a new render is pending,
  while keeping it visible rather than replacing it with a blank screen.
- [ ] Add matching status callbacks for project bootstrap/switch/import, source-file import,
  Diagram-mode XML load/new/export, and multi-diagram project-bundle preparation. Show item
  counts for serial work such as `Preparing diagram 2 of 5…` where available.
- [ ] Disable only actions that conflict with the active operation, preserve the existing
  revision/race guards, and use one accessible polite status convention for screen readers.
- [ ] Align existing autosave, Review, Generate, and Import panel wording with the shared
  operation vocabulary rather than introducing duplicate spinners or competing messages.
- [ ] Add unit and browser coverage for initial load, debounce/render transitions, Diagram-mode
  XML loading, project switching/import, operation failure, and stale-status suppression after
  a newer request commits.

**Deeper option**: if named states are insufficient for large diagrams, add an optional phase
callback to the runtime pipeline (`parse`, `validate`, `layout`, `render`, `mount`). This should
remain indeterminate/named progress, not a fabricated percentage: parsing and SVG generation
are synchronous today, while layout duration is engine- and diagram-dependent. A unified
operation state model in the web layer is a possible follow-up if more async editor operations
continue to accumulate.

**Definition of done**: every user-visible asynchronous editor operation has a truthful,
accessible pending/completed/failed state; the previous valid preview remains usable or is
clearly marked stale; conflicting actions are gated; status messages cannot be overwritten by
obsolete requests; and the behavior is covered by focused unit and Playwright tests.

### 18p. Freeform page, intrinsic canvas, and output-target contracts — planned

The current `page:` directive already accepts arbitrary positive dimensions in `in`, `mm`,
and `px`, but its semantics are narrower than the name suggests: a declared page is a fixed
output rectangle, and the shared runtime scales and centers the complete rendered diagram into
that rectangle. `fit: strict` rejects a result below the shared minimum page scale. This is
useful for paper, presentations, and fixed-size SVG, but does not fully cover very wide banners,
tall HTML regions, responsive SVG, intrinsic/infinite-style canvases, or consumer-specific
aspect ratios that are not known when the source is authored.

This item makes page behavior an explicit cross-family contract. It must be implemented as
shared infrastructure rather than separately by BPMN, mind map, flowchart, architecture, or
Gantt. Preserve the current deterministic fixed-page behavior, then add an intentional
freeform/intrinsic path and make every output target state which policy it applies.

#### Current behavior to preserve

- [ ] Record compatibility requirements before implementation: `page: <width> x <height>`
  accepts positive decimal dimensions, omitted units default to inches, units must agree,
  `fit: contain` is the default, and `fit: strict` requires a page.
- [ ] Preserve existing valid files. `page: 6in x 9in` must continue to produce the same
  aspect-preserving fixed SVG, draw.io page geometry, Gantt page-aware layout, and PPTX custom
  slide dimensions.
- [ ] Keep page fitting separate from intrinsic layout geometry. Non-Gantt families generally
  lay out in logical canvas units and fit after rendering; Gantt intentionally consumes page
  width and height during layout for timeline distribution and row density.
- [ ] Keep readability, resource-safety, raster, slide, and external-consumer limits. Freeform
  means user-selectable geometry, not unbounded memory allocation or removal of safeguards.

#### Model and syntax decisions

Define three independent concepts in the shared model:

1. **Intrinsic canvas** — natural positioned geometry and SVG `viewBox`, without a forced
   physical-page wrapper, white background, or centering transform.
2. **Declared page** — a physical or logical rectangle such as `50in x 12in` or
   `2400px x 800px`, used for stable output dimensions and aspect ratios.
3. **Consumer projection** — target-specific rules for SVG/HTML, PNG, draw.io, PPTX, BPMN XML,
   and the browser preview. A page choice must not silently imply identical limits or fidelity
   across consumers.

The design/spec phase must select one additive intrinsic syntax. Candidates include
`canvas: intrinsic`, `fit: intrinsic`, or `page: intrinsic`; do not implement several competing
syntaxes. Prefer a distinct canvas/output mode over changing the meaning of existing `fit`
without a migration story. Also decide whether a declared page supports `fit: none`, whether
overflow is clipped or preserved, and whether margins/background/anchoring are source settings
or export options.

Required decisions:

- [ ] Define whether intrinsic SVG preserves original `width`/`height`, emits only a `viewBox`,
  or emits responsive attributes suitable for CSS such as `width="100%" height="auto"`.
- [ ] Define configurable transparent/white backgrounds while keeping existing fixed-page
  output visually compatible by default.
- [ ] Define margin, alignment/anchoring, clipping/overflow, and browser-independent coordinate
  behavior.
- [ ] Add typed page metrics: intrinsic dimensions, declared dimensions/unit, effective output
  dimensions, scale, margins, overflow state, and warnings. Reuse this in CLI, web, tests, and
  agent-facing diagnostics.
- [ ] Define precedence between source directives and CLI/web overrides. Source remains
  reproducible and authoritative by default; transient overrides must be reported and must not
  cause an export to use a page different from the inspected/validated snapshot silently.

The final contract should make these cases unambiguous:

```text
# Existing fixed output, unchanged
page: 50in x 12in
fit: contain

# Explicit readable-scale gate
page: 6in x 9in
fit: strict

# Future responsive/HTML-oriented output; exact spelling is a design decision
canvas: intrinsic
```

#### Family parity requirements

The implementation is incomplete until the contract is exercised for every current family and
is included in the intake checklist for every future family:

- [ ] **BPMN** — fixed and intrinsic output preserve pools, lanes, subprocesses, boundary
  events, routed edges, labels, and manual coordinates. BPMN XML remains semantic and must not
  claim to carry a visual page policy it cannot represent.
- [ ] **Mind map** — support portrait, landscape, very wide, very tall, and intrinsic output;
  preserve nested tree geometry and draw.io behavior.
- [ ] **Flowchart** — support arbitrary aspect ratios and large pages without unexpectedly
  changing logical graph layout; verify decision shapes, labels, routed edges, and draw.io.
- [ ] **Architecture** — support arbitrary ratios and intrinsic HTML/SVG while preserving
  hierarchy, containers, people, systems, databases, queues, and draw.io/C4 separation.
- [ ] **Gantt** — explicitly define which page properties affect axis budget, row sizing,
  pagination, and intrinsic output. Preserve exact dates/durations/dependencies in JSON/CSV.
  Large pages must not bypass render bounds; small pages must report scale/pagination/readability
  rather than distorting schedule meaning.
- [ ] **Future families** — ER, state-machine, sequence, expanded architecture/network, and
  any later family must adopt the same page/canvas capability matrix before parity is claimed.
  Unsupported modes must fail clearly rather than being advertised and partially implemented.
- [ ] **Diagram mode (`bpmn-js`)** — keep its independent canvas/export path explicit. If page
  controls are later offered there, define a separate mapping for bpmn-js viewport, BPMN DI,
  SVG export, and text import; text-mode `PageSpec` must not silently control the modeler.

#### Required implementation surfaces

- [ ] `packages/diagram-core`: extend the typed page/canvas model, parser, finite-value and
  safe-range validation, unit conversion, fitting, intrinsic SVG handling, metrics, and shared
  warning/error codes. Keep it target-neutral.
- [ ] `packages/diagram-runtime`: parse/remove the new directive, merge it into every family
  AST/header result, apply the policy, and make strict failures consistent between execute and
  validate paths.
- [ ] Family AST/parser/adapter packages: retain common page metadata while preserving
  family-specific layout semantics. Add capability metadata for intrinsic, fixed-page,
  pagination, or structured-export exceptions where needed.
- [ ] `packages/export-drawio`: map fixed versus intrinsic output to `mxGraphModel` attributes,
  preserve safe geometry, and keep strict-fit diagnostics consistent with runtime. Draw.io's
  editable canvas is not the same as the SVG page wrapper.
- [ ] `packages/export-pptx`: retain `pptxgenjs` custom layout support, validate page dimensions
  separately from logical snapshot bounds, preserve editable-text warnings, and document
  practical Office/consumer limits for unusual slides.
- [ ] CLI: add the approved page/canvas override syntax, effective-page reporting, JSON page
  metrics, typed diagnostics, and examples for fixed, intrinsic, wide, tall, and HTML-oriented
  workflows. Overrides must not modify source files.
- [ ] Web text editor: add a page/canvas inspector, show intrinsic/effective dimensions and
  scale, distinguish preview fit from output fit, and make source-write versus preview-only
  behavior explicit. Preserve stale-preview and render-revision protections.
- [ ] Web SVG/HTML path: provide a responsive/intrinsic export whose sizing is controlled by
  the embedding page. Browser preview fitting must not rewrite the exported SVG contract.
- [ ] Documentation: update `docs/LANGUAGE.md`, `docs/CLI.md`, `docs/STATUS.md`, README
  examples, and family capability documentation after implementation, including migration
  guidance and a target matrix for page, intrinsic, pagination, transparency, and editability.

No new dependency should be needed for the shared model. Existing integrations remain relevant:
`@resvg/resvg-js` for CLI PNG rasterization, `pptxgenjs` for custom PPTX layouts, draw.io's
`mxGraphModel` page attributes for editable XML, browser SVG/CSS behavior for HTML, and
`bpmn-js` only for independent Diagram mode. Any dependency upgrade must include compatibility
fixtures for each affected output.

#### CLI and web acceptance examples

The final contract should support workflows equivalent to these, with exact option names settled
by the design/spec:

```bash
# Validate and inspect effective page metrics
bpm validate diagram.bpm --json

# Render intrinsic/responsive SVG without changing the source
bpm render diagram.bpm --canvas intrinsic -o diagram.svg

# Try a banner output for one export only
bpm render diagram.bpm --page 2400px x 800px -o banner.svg

# Produce a custom editable presentation page
bpm export diagram.bpm --target pptx --page 50in x 12in -o banner.pptx
```

The web editor should expose the same effective choices and report when a page is only a
preview override. Export actions must use the committed/validated snapshot and the same page
metrics shown to the user.

#### Verification matrix

- [ ] Core tests cover unit conversion, arbitrary dimensions, zero/negative/non-finite/
  excessive values, intrinsic output, fixed contain/strict behavior, margins, anchoring,
  clipping/overflow, empty diagrams, negative coordinates, deterministic metrics, and safe
  large-page failures.
- [ ] Runtime tests cover every current family with fixed, intrinsic, portrait, landscape,
  ultra-wide, ultra-tall, tiny, and large pages. Validate and execute must agree on errors versus
  warnings.
- [ ] Family tests prove page handling does not drop nodes, edges, labels, nested content,
  dates, dependencies, groups, or manual coordinates. Gantt separately covers page-aware axis/
  row behavior, render bounds, pagination, and JSON/CSV invariance.
- [ ] Draw.io tests parse generated XML and verify page attributes, containment, strict-fit
  diagnostics, and intrinsic/infinite-canvas behavior.
- [ ] PPTX tests inspect OOXML slide dimensions, custom layouts, editable geometry, warnings,
  and hard limits for standard, custom, and extreme page sizes.
- [ ] CLI subprocess/command tests cover overrides, JSON metrics, stdout/stderr, exit codes,
  invalid values, unsupported combinations, and no partial output on failure.
- [ ] Web unit/E2E tests cover the inspector, source-write/preview-only choice, page metrics,
  preview-fit versus export-fit, responsive SVG, large-page status behavior, project
  save/reload, stale-render protection, and accessibility.
- [ ] Add HTML embedding fixtures using CSS `aspect-ratio`, responsive width, transparent
  background, and very wide/tall layouts.
- [ ] Add these cases to item 18m's adversarial corpus, including extreme dimensions,
  malformed directives, `NaN`/`Infinity`/overflow attempts, all five current families, and
  future-family capability declarations.

**Definition of done**: fixed-page output remains backward-compatible; every current family
has an explicit fixed/intrinsic capability result; future families have a required parity
checklist; HTML/responsive use has a documented intrinsic path; CLI and web expose equivalent
effective-page diagnostics; draw.io, PPTX, SVG, PNG, Gantt, and Diagram-mode boundaries are
truthful; unsafe dimensions fail predictably; and the full parser/layout/render/export/web
verification matrix passes before this item is marked shipped.

## 19. Diagram direction and BPMN lane orientation — done 2026-08-20

**Delivered**: the six-session work package is committed through `c329028`:

- `66d9243` — shared `direction`/`laneDirection` types, defaults, directive parsing, runtime forwarding, structured invalid/family diagnostics, and focused contract tests.
- `4ffeeba` — BPMN vertical pool lanes arranged left-to-right with content-based widths, readable-label checks, containment, orthogonal routing repair, lane overlap/narrow-label inspection, and horizontal-lane regression coverage.
- `ffa3b25` — flowchart `direction: right|left|down|up` mapped to ELK layered layout with default `down` preserved.
- `527195c` — mind-map direction mirroring/transposition with default `right` preserved and root-tree/flat-edge representations retained.
- `7b67a45`, `1514ac8`, `4d12da2`, `6676b2f`, `c329028` — capability-aware CLI/web/PPTX diagnostics, successful-warning export semantics, supported-process-direction guardrails, validation/export blocker separation, and page-dimension diagnostic correction.

**Released contract**:

- Flowcharts and mind maps support all four directions; BPMN process direction remains rightward and BPMN pool lanes support horizontal or vertical orientation.
- Architecture and Gantt reject explicit direction semantics with structured unsupported-capability diagnostics.
- Existing defaults remain unchanged. Valid PPTX exports with editable-text or page-readability warnings remain successful; invalid geometry and unsupported capabilities block without partial output.
- CLI JSON, web diagnostics, SVG, and PPTX use the same resolved direction/lane metadata and positioned scene.
- BPMN semantic pagination is implemented for the supported BPMN page-break modes. Tile/hybrid pagination, PDF, BPMN process-direction reversal, architecture/Gantt direction semantics, native Word-shape DOCX, and unrelated live-sync behavior remain out of scope.

**Verification**: focused parser/runtime/layout/CLI tests and direction-specific browser coverage are included in the commits above. The work remains subject to the broader 18m cross-family acceptance corpus and final release-snapshot checks.

## Explicitly not planned

- **Continuous/automatic Diagram-mode ↔ text sync** — item 16 (above) closes the one-shot, explicitly-confirmed direction (Diagram mode → text, on request). What remains out of scope, and was deliberately rejected during item 16's design rather than merely deferred: a live, automatic, always-on sync between the two editors. That would mean every Diagram-mode edit continuously overwrites the `.bpm` source (permanently trading away this tool's auto-layout headline feature — see item 16's design doc option set 3) and a two-way feedback loop between two independently-timed editors (option set 4) — a genuine architecture change, not an incremental item, and should go through its own fresh brainstorming cycle if ever wanted.
