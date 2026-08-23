# BPM Diagramming Language — Design

## Purpose

A text-based language and live-rendering tool for BPMN 2.0 process diagrams, combining the authoring experience of Mermaid (write text, see a diagram render live) with the semantic completeness of BPMN, and specifically solving the edge-routing and swimlane-layout problems that plague existing tools like draw.io (overlapping/crossing connector lines, lanes not respected by auto-layout).

The text syntax must be easy for both a human to hand-write and an LLM to generate reliably.

## Scope

- **v1 target audience**: both developers (via a shared TypeScript core, usable from a CLI later) and business/process analysts (via a live web editor). v1 itself ships the web editor; CLI is a later phase built on the same core.
- **BPMN element coverage**: full BPMN 2.0 semantics from v1 — all event types (start/end/timer/message/error/signal, etc.), all gateway types, boundary events, sub-processes, data objects/associations, pools and lanes.
- **BPMN XML interchange** (export to / import from standard BPMN 2.0 XML, for compatibility with Camunda, bpmn.io Modeler, etc.) is explicitly **out of scope for v1** — a later phase, once the core diagramming tool works.
- **Exact text syntax** is intentionally not finalized in this spec (see Syntax below) — deferred until the pipeline is working and can be iterated on live.

## Architecture

A TypeScript monorepo with clean package boundaries, so each pipeline stage can be built, tested, and swapped independently:

- **`@bpm/ast`** — the core intermediate model: pure data types for BPMN elements (events, tasks, gateways, pools/lanes, sequence/message flows, sub-processes, data objects, associations). No parsing or rendering knowledge lives here.
- **`@bpm/parser`** — text → AST. This is the one package the concrete syntax lives behind. It exposes a stable interface so the grammar can change or be replaced later without touching layout or rendering.
- **`@bpm/layout`** — AST → positioned graph, via **ELK.js**. Converts the AST into an ELK graph (pools/lanes become ELK hierarchical containers; edges use ELK's orthogonal routing with overlap avoidance), runs `elk.layout()`, and returns the AST annotated with coordinates and routed edge waypoints.
- **`@bpm/render`** — positioned graph → SVG. Pure rendering of BPMN-standard shapes (rounded-rect tasks, diamond gateways with correct markers, circles with the right icon per event type).
- **`apps/web`** — the v1 deliverable: a split-pane live editor (text on the left, live SVG on the right) wiring the pipeline together on each edit.

### Why ELK.js over dagre

BPMN pools/lanes are nested containers, and readable connector routing is a stated priority (the draw.io failure mode to avoid). dagre has no first-class support for nested/hierarchical graphs and only does simple bezier-curve edges with no obstacle avoidance. ELK.js treats hierarchical containment as a first-class concept (so lane boundaries are actually respected during layout) and supports orthogonal edge routing with overlap avoidance — this is also why `bpmn-auto-layout` (bpmn.io's own auto-layout tool) uses ELK.js for the same problem.

## Syntax

Not finalized by design. The parser/AST boundary means a syntax decision later only requires rewriting `@bpm/parser` — nothing in `@bpm/layout`, `@bpm/render`, or `apps/web` needs to change. The concrete grammar will be designed once the pipeline is working end-to-end and can be iterated on against a live preview.

## Data Flow

```
text (editor)
  → parse()   → AST                (nodes/edges/pools/lanes, no coordinates)
  → layout()  → ELK graph → elk.layout() → positioned AST (x/y/width/height + routed edge waypoints)
  → render()  → SVG string
  → injected into preview pane
```

The pipeline re-runs on a debounced text change (e.g., 300ms after typing stops). v1 does a full re-parse/re-layout/re-render on every change — no incremental diffing. This is the simplest approach that works; diagram sizes in scope don't yet warrant the optimization.

## Error Handling

- The parser never throws on invalid input. It returns structured errors (line/column + message) alongside whatever it could still parse.
- Invalid text shows inline error markers in the editor. The **last valid diagram stays rendered** rather than the preview going blank — matching how Mermaid Live behaves, which keeps a live-editing loop usable instead of flickery.
- Errors that only surface after parsing (e.g., an edge referencing a lane that doesn't exist) are treated the same way: caught as validation errors before reaching ELK, surfaced via the same inline-marker mechanism.

## Testing

- **`@bpm/ast`** — construction/type-level tests, one per element type.
- **`@bpm/parser`** — snapshot tests (text → AST) covering every element in the full BPMN 2.0 set.
- **`@bpm/layout`** — golden-graph tests asserting pools/lanes containment is respected and no unexpected node/edge overlaps in ELK's output geometry.
- **`@bpm/render`** — SVG snapshot tests.
- **`apps/web`** — a handful of Playwright smoke tests: type text, confirm a diagram renders.

## Deferred (explicitly out of scope for this spec)

- BPMN 2.0 XML import/export and round-trip compatibility with Camunda / bpmn.io Modeler.
- CLI packaging.
- Final text syntax/grammar.
- Manual layout overrides (pinning node positions) — v1 is pure auto-layout, like Mermaid.
- Diagram-to-text editing (dragging a shape and having the text update) — v1 is one-directional, text → diagram.
