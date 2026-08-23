# Diagram Mode — Direct-Manipulation Editor — Design

## Purpose

The app is a one-directional, text-only diagramming tool by original design decision (`docs/ROADMAP.md`'s "Explicitly not planned" note): text in, auto-laid-out diagram out, no dragging shapes, no diagram-to-text editing. This spec reverses that decision for a bounded, explicitly separate part of the app — a **Diagram mode** where a user can drag, resize, add, delete, and connect BPMN shapes by hand — while leaving the existing text pipeline (Text mode) completely untouched.

Scope: adding Diagram mode as a second, independent mode alongside Text mode, built on `bpmn-js`. Improving auto-layout quality, BPMN legality validation, and CLI packaging are out of scope — tracked separately in `docs/ROADMAP.md`.

## Non-goals

- **No live sync** between Text mode and Diagram mode. They are two fully separate modes. Editing in one never edits the other. There is no "diagram is now authoritative, stop reading text" state machine to build — each mode simply owns its own content.
- **No new file format.** Diagram mode's save/load/export formats are exactly what `bpmn-js` and `@bpm/export-xml` already produce (BPMN 2.0 XML + BPMNDI). No JSON project format is introduced.
- **No new UI framework.** `apps/web` stays framework-free; `bpmn-js` embeds into a plain DOM container.

## Architecture

**Mode toggle.** The existing toolbar (`docs/superpowers/specs/2026-08-09-editor-look-and-feel-design.md`) gains a **Text / Diagram** toggle. It swaps the main panel's contents:

- **Text mode**: today's app, byte-for-byte unchanged — editor pane, preview pane, error strip, `Export SVG` / `Export XML` buttons wired to `@bpm/export-xml`.
- **Diagram mode**: a full-panel `bpmn-js` `Modeler` canvas with `bpmn-js`'s own palette, context pad, and properties behavior enabled.

**Lifecycle.** A new `apps/web/src/diagramMode.ts` owns the `Modeler` instance: constructed when Diagram mode is entered, `destroy()`-ed when left. No instance persists across a mode switch — re-entering Diagram mode later always starts from an explicit "New diagram" or "Edit as diagram" action, never from stale in-memory state.

**Entry points into Diagram mode:**

1. **"Edit as diagram"** (button in Text mode's toolbar, enabled only when Text mode currently has a valid, error-free rendered diagram). Runs the current AST through the existing `@bpm/export-xml` to produce BPMN XML, switches to Diagram mode, and seeds it via `modeler.importXML(xml)`. This is a one-time snapshot — after import, the diagram in `bpmn-js` has no further relationship to the text it came from.
2. **"New diagram"** (button available inside Diagram mode). Starts `bpmn-js` on its own built-in empty diagram, for a from-scratch blank canvas.
3. **"Open"** (button inside Diagram mode). File picker → read a previously saved `.bpmn` XML file → `modeler.importXML()`. This is how a diagram-mode session is resumed after being closed.

**Editing.** Once a diagram is loaded, all move/resize/add/delete/connect/relabel interactions are `bpmn-js`'s own built-in modeler behavior (palette, context pad, direct editing) — no custom shape or connection-routing code is written for this feature.

**Save / export.** Because `bpmn-js`'s native serialization format is already BPMN 2.0 XML with BPMNDI (the same shape `@bpm/export-xml` produces, verified via `bpmn-js`'s importer in that package's tests), no new format is needed:

- **Save** → `modeler.saveXML({ format: true })`, offered as a file download (`.bpmn`). This file is also what **Open** reads back in — it's the diagram-mode project file.
- **Export XML** → same `saveXML()` call, exposed as an explicit export action (kept as a separate, clearly-labeled button from Save for discoverability, even though the underlying call is identical).
- **Export SVG** → `modeler.saveSVG()`, offered as a `.svg` download.

All three reuse the existing download-interception pattern already established in `apps/web/src/downloads.ts` for Text mode's export buttons.

**Unsaved-changes guard.** Because there's no auto-sync fallback, leaving Diagram mode (toggling to Text mode) or closing/navigating away with unsaved edits shows a confirmation prompt ("Diagram has unsaved changes — leave anyway?"). Tracked via `bpmn-js`'s `commandStack` — any state where `commandStack.canUndo()` is true since the last successful Save/Open/New counts as unsaved.

## Dependencies

- **`bpmn-js`** moves from a test-only devDependency (currently only in `packages/export-xml`, used to verify XML round-tripping) to a runtime dependency of `apps/web`. Pin the same version already vetted there (`^17.11.1`) to avoid introducing a second, potentially divergent copy of the BPMN semantics the rest of the project already trusts.
- **`bpmn-js`'s bundled CSS** (`diagram-js.css`, `bpmn-font` icon font) is imported into `apps/web`'s build via Vite, scoped to Diagram mode's container so it doesn't leak into Text mode's styling.
- No other new dependencies. No React/Vue/state-management library — `bpmn-js` is self-contained and framework-agnostic, consistent with the app's current vanilla-TS setup.

## Error handling

- **Import failure** (malformed XML fed to `modeler.importXML()`): shouldn't occur in practice since `@bpm/export-xml`'s output is already tested against `bpmn-js`'s own importer, and "Open" only accepts files the user selects. If it happens anyway (e.g. a hand-edited or foreign `.bpmn` file with unsupported constructs), show the same error-strip pattern Text mode already uses, with `bpmn-js`'s import warnings/errors surfaced verbatim.
- **Export failure**: `saveXML`/`saveSVG` calls are wrapped and surfaced through the same error strip if they reject.

## Testing

Playwright e2e, extending the existing suite:

- Mode toggle switches the panel and preserves each mode's own state independently.
- "Edit as diagram" from a known text example seeds the `bpmn-js` canvas with the expected element count/types.
- "New diagram" produces an empty canvas with palette available.
- Save / Export XML / Export SVG trigger downloads (reusing the existing download-interception helpers).
- Unsaved-changes prompt appears after a drag/edit and blocks/confirms mode switch appropriately.

Not covered: `bpmn-js`'s own internal modeling correctness (drag math, connection routing, palette behavior) — that's a vetted third-party library's responsibility, not this project's. Tests here only verify our integration glue: mode switching, import/export wiring, and the unsaved-changes guard.
