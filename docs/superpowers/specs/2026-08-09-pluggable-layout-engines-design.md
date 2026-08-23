# Pluggable Layout Engines — Design

## Purpose

Restructure the current single, monolithic `@bpm/layout` package into a set of independently developable layout engines, selected per diagram based on the diagram's own shape (has pools/lanes? something else entirely, later?), with an explicit directive available to override the automatic choice. This is a **pure architectural restructure** — today's already-verified layout behavior (stacked swimlane bands, flat/linear diagrams, boundary-event positioning) is preserved exactly, with one narrow, deliberate exception noted below. Layout **quality** improvements (e.g. reducing edge-edge crossings in dense diagrams) are explicitly out of scope — that remains a separate, later roadmap item.

## Background

Two prior sessions found and fixed real layout bugs (boundary-edge routing cutting through shapes, lanes not forming proper stacked bands) directly inside `@bpm/layout`, which today hard-codes exactly two behaviors (`stacked` vs `linear`) via an internal branch. The next round of layout quality work — and any future diagram type BPMN might need a materially different layout strategy for — needs a real seam: a `LayoutEngine` contract that new engines can implement and register without modifying `@bpm/ast`, `@bpm/parser`, `@bpm/render`, or `apps/web`.

## Package Architecture

Five packages, replacing today's single `@bpm/layout`:

- **`@bpm/layout-core`** — the contract and shared post-processing:
  - `LayoutEngine` interface: `{ name: string; matches(diagram: Diagram): boolean; layout(diagram: Diagram): Promise<PositionedDiagram> }`
  - Engine registry: `registerEngine(engine)`, `selectEngine(diagram): LayoutEngine`
  - `PositionedNode`, `RoutedEdge`, `PositionedPool`, `PositionedLane`, `PositionedDiagram` types (moved here, unchanged, from today's `@bpm/layout/src/types.ts`)
  - `positionBoundaryEvents` (moved here, unchanged) — genuinely engine-agnostic: it operates on an already-positioned diagram plus the original AST, regardless of which engine produced the positions.
- **`@bpm/layout-elk-base`** — the shared ELK scaffolding (`toElkGraph`, `fromElkLayout`, moved unchanged from today's `@bpm/layout`). Not itself a registered engine — an implementation detail the two current engines both happen to need. A future non-ELK engine would not depend on this package.
- **`@bpm/layout-engine-swimlane`** — today's `stacked` behavior: `layout-elk-base` + `laneBanding` (moved unchanged). `matches(diagram)` returns true when the diagram has at least one pool with at least one lane, unless overridden.
- **`@bpm/layout-engine-flat`** — today's `linear` behavior: `layout-elk-base` alone, no banding step. Registered as the catch-all default (`matches` always returns true).
- **`@bpm/layout`** — thin facade. **Package name unchanged** so `@bpm/render` and `apps/web` require zero import changes. Registers both engines (swimlane first, flat last), exposes the same public `layout(diagram): Promise<PositionedDiagram>` function and re-exports the same types (now sourced from `layout-core`).

## Directive Vocabulary Change

The `layout:` directive's accepted values rename to match engine names directly: `stacked` → `swimlane`, `linear` → `flat`. This makes the directive a literal engine-name override, extensible to any future engine's name without further vocabulary changes.

## The One Deliberate Behavior Change

Today, `@bpm/parser` validates the directive's value against a closed list (`stacked` | `linear`) and emits a structured parse error for anything else. After this restructure, the parser **cannot** validate against a closed list — doing so would require it to know about every registered engine, which defeats the purpose of engines being addable as separate packages without touching `@bpm/parser`. So:

- `@bpm/parser` now only checks the directive line is well-formed (`layout: <identifier>`) and stores the raw string in `Diagram.layout: string | undefined`, without judging whether it names a real engine.
- `selectEngine` (in `layout-core`) is responsible for resolving it: if `diagram.layout` is set, find the registered engine with that exact `name`; if none matches, **throw** a clear error. If `diagram.layout` is unset, iterate registered engines in registration order and use the first whose `matches(diagram)` returns true.

Net effect: an invalid engine name (e.g. `layout: bogus`) now surfaces as a **layout-time** error instead of a **parse-time** error. This is a small, deliberate consequence of the architecture goal, not an oversight.

## Data Flow

```
text → parse() → Diagram { ..., layout?: string }        // raw directive string, unvalidated
  → @bpm/layout.layout(diagram):
       engine = selectEngine(diagram)                       // layout-core
       positioned = await engine.layout(diagram)             // delegates to the chosen engine
       return positionBoundaryEvents(diagram, positioned)     // shared pass, layout-core
  → render(positioned) → SVG
```

## Error Handling

Because an unknown explicit engine name now throws at layout-time rather than failing at parse-time, `apps/web`'s pipeline needs to catch this the same way it already handles parse errors: surface it as an error message, and leave the last valid diagram rendered rather than blanking the preview. This is a small, necessary addition to keep the existing "never blank the preview" behavior intact for this one new failure mode — not new scope.

## Testing

- **`layout-core`**: registry tests — auto-detect dispatch respects registration order, an explicit directive override wins over auto-detect, `selectEngine` throws a clear error for an explicit name with no matching registered engine.
- **`layout-elk-base`**, **`layout-engine-swimlane`**, **`layout-engine-flat`**: today's existing test suites, moved with the code they test, assertions unchanged — this is the proof that behavior didn't change.
- **`layout`** (facade): a handful of end-to-end smoke tests (pools+lanes with no directive → swimlane engine handles it; no pools → flat engine handles it; explicit `layout: flat` overrides a pool/lane diagram; explicit unknown name throws) plus re-running the full pre-existing 42-test suite and the geometric analyzer (node-overlap / edge-through-node / edge-edge-crossing checks across the same 7 diagrams used in the prior session) to confirm identical results.
- **`apps/web`**: one test confirming a layout-time exception (unknown engine name) is caught and surfaced like a parse error, without blanking the preview.

## Deferred (explicitly out of scope for this restructure)

- Any layout **quality** improvement (edge-edge crossing reduction, etc.) — separate, later roadmap item.
- Any new layout engine beyond `swimlane` and `flat` — this restructure only builds the seam; new engines (e.g. for a future diagram type that needs a materially different strategy) are separate work once the seam exists.
- BPMN XML export, CLI packaging, BPMN legality validation — unrelated, already tracked in `docs/ROADMAP.md`.
