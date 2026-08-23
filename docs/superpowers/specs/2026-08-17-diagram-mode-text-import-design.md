# Diagram-mode → Text import (one-shot, reviewable)

_Design/context doc for roadmap item 16. Read this before claiming any task card under `.workspace/agent-queue/` for this feature — it's the shared context every card assumes you already have, so cards themselves stay short._

## Problem

Text mode and Diagram mode are two independent authoring paths (`README.md`: "Is not: a synced text ↔ Diagram-mode editor"; `docs/ROADMAP.md`: "Explicitly not planned"). Diagram mode's Save/Export only downloads a `.bpmn` file — it never writes back to the `.bpm` text or the project store. A user who cleans up overlap by dragging nodes in Diagram mode loses that work the moment they switch back to Text mode, because nothing there changed.

## Decision: one-shot reviewable import, not live sync

Full continuous bidirectional sync was considered and **rejected** for this iteration — see `docs/ROADMAP.md` item 16 for the risk summary (permanent auto-layout loss, feedback-loop races, and item 12's known DI-corruption bugs with no existing safety net). Instead: an explicit **"Import to Text"** action in Diagram mode, mirroring the Insert-into-editor / Apply-Skip discipline already used by Generate and Review — never a silent overwrite.

## Two components that don't exist yet, and are needed regardless of approach

1. **A `.bpm` text serializer (AST → text).** Everything today is one-directional (`text → @bpm/parser → AST`). There is no "print this AST back out as DSL text" step anywhere in the codebase.
2. **A BPMN XML → this project's AST importer.** `@bpm/export-xml` only goes AST → XML. The reverse mapping — `bpmn:userTask`/`bpmn:exclusiveGateway`/lanes/`conditionExpression`/`default`/camunda extensions back into this DSL's vocabulary — doesn't exist.

Below, each of these plus three supporting concerns gets its real design options, not just a chosen answer, so whoever picks up the task card can see the tradeoff space rather than re-deriving it.

---

## Option set 1 — the `.bpm` text serializer

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **A. Mechanical/deterministic printer** (recommended) | One `printDiagram(ast): string` that walks pools → lanes → nodes → edges in AST order with fixed formatting rules (2-space indent, always-quoted labels, nodes then edges per scope). | Simple, fast to build, exhaustively testable via `parse(print(parse(text)))` round-trip equivalence. | Output won't stylistically match how a human originally wrote the source (acceptable — there is no "original" text in the one-shot-import case; Diagram mode is the source). |
| B. Format-preserving printer | Track a source-map back to the original text (when one exists) and only rewrite the parts that changed. | Minimal diffs when re-importing a diagram that started from hand-written text. | Real complexity jump — needs a concrete syntax tree, not just an AST. Not needed for the Diagram-mode-only import case this feature targets. |
| C. Opinionated pretty-printer with configurable ordering | Like B's readability goal without full format-preservation; adds a node-ordering strategy (declaration order vs. BFS-from-start vs. lane-then-topological). | Nicer output for human editing afterward. | Ordering heuristics are themselves a design decision with no single right answer — scope creep for v1. |

**Chosen**: A. Revisit B/C only if generated text readability becomes a real complaint once this ships.

## Option set 2 — the BPMN XML → AST importer

| Option | What it is | Pros | Cons |
|---|---|---|---|
| A. Hand-rolled XML parsing | Parse raw BPMN XML directly, independent of any BPMN library — mirrors how `@bpm/export-xml` independently emits XML. | No new runtime dependency; symmetric with the existing export package. | Reinvents BPMN 2.0 XML parsing/schema edge cases that `bpmn-moddle` already handles correctly. |
| B. Read bpmn-js's live in-memory model directly (web-only, skip XML entirely) | Convert `elementRegistry`/moddle objects straight to AST inside `apps/web`. | Avoids any XML-serialization fidelity loss for the Diagram-mode entry point. | Web-only — unusable from a future CLI `bpm import` command; couples core conversion logic to bpmn-js's internal object shapes, fragile across bpmn-js version bumps. |
| **C. Parse via `bpmn-moddle`, map its object tree to this project's AST** (recommended) | Reuse `bpmn-moddle` (already a transitive dependency, battle-tested for BPMN XML schema correctness) purely as the XML-reading layer; write the AST-mapping logic new, as the direct inverse of `export-xml`'s existing mapping table. | Avoids reinventing XML parsing (lowest risk of subtle bugs); works as a real package usable from both web and CLI, not web-only. | Adds `bpmn-moddle` as an explicit dependency of the new package (it's already pulled in transitively by `bpmn-js`, so this mostly makes an implicit dependency explicit). |

**Chosen**: C — new package `packages/import-xml`, symmetric with `packages/export-xml`, built on `bpmn-moddle` for parsing.

## Option set 3 — position strategy (how bpmn-js coordinates become DSL positions)

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **A. Always `positioning: manual`, `at (x,y)` on every node** (ship first) | Faithful 1:1 translation of whatever bpmn-js reports. | Simplest to build and test — no ambiguity, nothing is ever wrong. | Permanent auto-layout loss for the whole diagram, every time (this tool's headline feature, per `README.md`, is exactly what this throws away). |
| B. Heuristic "snap back to auto-layout" | After import, run the diagram through the existing auto-layout engine; if computed positions are close (some tolerance) to bpmn-js's actual positions, drop `at (x,y)` entirely. | Preserves the "just add a node" benefit for lightly-touched diagrams. | Fuzzy tolerance threshold is itself a UX judgment call; harder to test deterministically; risk of flip-flopping between runs. |
| C. Diff-based partial pinning | Compare bpmn-js's reported positions against what fresh auto-layout would compute from the same topology; only pin (`at (x,y)`) the nodes that actually deviate, using the project's existing partial-pinning support (`docs/LANGUAGE.md` §6.6, no diagram-wide `positioning: manual` needed) — everything else, including edge routing, stays auto. | Most surgical: a diagram where the user only nudged two overlapping nodes stays otherwise auto-laid-out. Per-node pin/don't-pin is a binary decision, more testable than B's fuzzy tolerance. | Still needs the "what would auto-layout have done" comparison baseline; defining "moved enough to count as intentional" per node is a real design call to nail down before building. |

**Chosen for v1**: A, for correctness and shippability — it never misrepresents a position, and it's the easiest to get right and fully test. **Flagged as a real v2 follow-up**: C, once A has shipped and is trusted, since it directly preserves the tool's core value proposition for the common case (a few nodes nudged to fix overlap, not a full redraw). B is likely not worth its fragility relative to C.

## Option set 4 — feedback-loop guard (two editors, one source)

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **A. No live sync — one-shot explicit action only** (already the chosen overall design) | Only one write, on an explicit click; never continuous. | Sidesteps the race-condition problem entirely — there's nothing to race. | Doesn't give "automatic" sync; the user must click Import each time. |
| **B. Mode-switch latch** (recommended, paired with A) | After Import, tear down the live bpmn-js instance (same as today's mode-switch behavior); re-entering Diagram mode re-derives a fresh session from the (now updated) text via the existing "Edit as Diagram" path. | No new "who owns state right now" machinery — this is exactly how the app already behaves for Text→Diagram today, just applied symmetrically. | None significant — it's the natural consequence of choosing A. |
| C. True bidirectional live sync with an "owner" flag | Whichever editor was last touched becomes source of truth; the other re-renders from it on a debounce. | Closest to literal "automatic" sync the user described. | The exact complex/fragile state machine this design explicitly avoids building; needs careful debounce tuning and real race-condition test coverage. |

**Chosen**: A + B together. C is not being built as part of this item.

## Option set 5 — corruption safety net (this also unblocks roadmap item 12)

| Option | What it is | Pros | Cons |
|---|---|---|---|
| A. XSD schema validation only | Validate bpmn-js's exported XML against the official BPMN 2.0 XSD before conversion. | Cheap; catches structurally invalid XML (missing required attributes, bad namespaces) with a clear error. | Won't catch "schema-valid XML that silently lost semantic information" (e.g., DI waypoints dropped but the XML is still valid). |
| B. Round-trip import-and-diff | Re-import bpmn-js's exported XML into a scratch instance (or compare against the live model) and diff node/edge counts before accepting it. | Catches the subtler DI/geometry-loss corruption modes item 12 documents. | Doesn't catch outright schema violations as cheaply/clearly as A does alone. |
| **C. Both, sequenced** (recommended) | Schema-validate first (cheap, clear message on gross corruption), then round-trip-diff (catches subtler loss) — only then hand off to the XML→AST converter. | Matches what item 12 itself already proposes as its own fix; building it here satisfies that prerequisite too, not just this feature. | Most implementation work of the three, but it's the only option that's actually sufficient. |

**Chosen**: C. This is why Task T2 below is a prerequisite for the importer task, not an optional nice-to-have.

---

## What ships (v1 scope)

1. `packages/import-xml` — BPMN XML → this project's AST, via `bpmn-moddle`, always emitting `positioning: manual` (option-set-3 choice A).
2. A `.bpm` DSL serializer (mechanical printer, option-set-1 choice A) — lives alongside the importer or as its own small package; whichever task claims T3 decides the exact home and says so in its PR/handoff notes.
3. A round-trip validation gate (option-set-5 choice C) in front of the importer — this also directly advances roadmap item 12.
4. Web: an explicit **Import to Text** action in Diagram mode with a preview/confirm step (never auto-overwrite), and mode-switch latch behavior (option-set-4 choice A+B — no new live-sync machinery).
5. CLI parity: `bpm import-diagram <file.bpmn> -o out.bpm`, for consistency with every other pipeline stage already having a CLI front door.
6. Docs: reverse `README.md`'s "Is not" bullet and `docs/ROADMAP.md`'s "Explicitly not planned" entry; new roadmap item 16 (done); `docs/LANGUAGE.md` unchanged (no new DSL syntax — this only ever emits `positioning: manual`/`at (x,y)`, which already exists).

## Explicitly deferred (not in this item)

- Option-set-3 choice C (diff-based partial pinning) — real v2 candidate, not v1.
- Any form of live/automatic sync (option-set-4 choice C).
- Round-tripping *from* text-mode manual edits back through Diagram mode a second time (i.e., re-editing an already-imported diagram) — not tested or claimed as supported in v1; treat each Import as a one-time snapshot.

## Findings from building and testing this (T7)

**Real bug, fixed**: the first implementation of T4's importer wrote each node's `at (x, y)` as the raw absolute canvas coordinate from the BPMN DI data, for every node. That's correct for a genuinely top-level node, but wrong for two cases the DSL treats specially (`docs/LANGUAGE.md` §6.2, §6.5): a node inside a `lane` needs a position relative to *that lane's own top-left*, and a node inside an expanded `subprocess`/`transaction` needs a position relative to *the subprocess's content origin* (its own origin plus a fixed padding/header inset). Using raw absolute coordinates for both cases produced text that round-tripped through `@bpm/parser` just fine syntactically, but failed `@bpm/validate`'s geometry check with real (not spurious) node-overlap errors — caught by the T7 end-to-end Playwright suite, not by T4's own package-level tests, because those used `@bpm/export-xml` (this tool's own writer) as the XML source, which happens to make the same coordinate-frame assumptions T4 was getting wrong, masking the bug. **Fixed**: `packages/import-xml/src/index.ts` now re-bases node positions against the lane's own DI bounds (looked up directly, no assumption needed — a lane has its own `bpmndi:BPMNShape`) and against a `SUBPROCESS_CONTENT_PADDING` constant matching `packages/layout-engine-manual/src/engine.ts`'s `SUBPROCESS_PADDING`/`SUBPROCESS_HEADER_INSET_Y` exactly.

**Real limitation, not fixed, documented instead**: even with that fix, a round trip specifically *through bpmn-js's own rendering* (Diagram mode, not this tool's own `@bpm/export-xml`) can still occasionally produce a genuine geometry overlap for expanded subprocess content. Cause: an expanded subprocess's box is always *recomputed from its children's positions* by this tool's layout engine (§6.5 again — any declared `size(...)` on the subprocess itself is advisory only), and that recomputation assumes this tool's own fixed padding/inset constants. bpmn-js is an independently developed renderer with its own internal padding convention for subprocess content, which isn't guaranteed to match this tool's constants. When it doesn't, the position math T4 does (which is internally consistent with *this tool's* conventions) can produce a subprocess content box that's wider than what was originally declared, occasionally colliding with a neighboring top-level node. This is a real geometry conflict once it happens (`@bpm/validate` isn't wrong to reject it) — not a bug in the coordinate conversion itself, but an inherent consequence of round-tripping content through two independently-developed renderers with different internal layout conventions for the same semantic construct (an expanded container). No general fix exists without either (a) this tool detecting and matching bpmn-js's exact internal subprocess padding, which isn't part of any stable public contract, or (b) always re-running this tool's own auto-layout on subprocess content after import instead of trusting DI positions verbatim — both are real follow-on design questions, not scoped into v1. `apps/web/test/e2e/diagram-import-roundtrip.spec.ts`'s nested-subprocess test documents this explicitly and only asserts structural content survival (labels, nesting) for that one case, not clean geometry.

**Scope note**: none of the fixtures used for T2–T7's tests exercised a BPMN construct with genuinely no DSL equivalent (e.g., escalation sub-processes with complex event definitions, ad-hoc sub-processes, multi-instance markers) — T4's `warnings` array is designed to surface these when they occur (see "Unsupported BPMN element" in `mapFlowElementsAndArtifacts`), but that path itself is only unit-tested with a synthetic unmappable element, not with a real-world "exotic BPMN tool export" fixture. Worth a follow-up if this importer is ever pointed at BPMN files from outside this tool's own ecosystem in anger.
