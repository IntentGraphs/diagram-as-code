# Manual Positioning Mode — Design

## Purpose

Give text-based diagrams an opt-in escape hatch from auto-layout: a `positioning: manual` diagram can place every node at an exact coordinate instead of letting a layout engine decide, and any diagram (manual or auto) can override an individual edge's line style and which side of each box it leaves/enters from. Auto-layout diagrams are otherwise untouched — this is a purely additive second path through the pipeline, not a replacement for the existing `swimlane`/`flat` engines.

This reverses a prior explicit design decision (`docs/ROADMAP.md`'s "Explicitly not planned: Manual layout override... this is a one-directional, pure auto-layout tool by design"). That decision is being revisited deliberately here, per its own stated condition ("should go through a fresh brainstorming cycle if ever wanted").

## Background

The tool today is Mermaid-style: text in, auto-laid-out BPMN diagram out, via a pluggable `LayoutEngine` (`swimlane` or `flat`, selected by a `layout: <name>` directive or auto-detected from pool/lane presence — see `docs/superpowers/specs/2026-08-09-pluggable-layout-engines-design.md`). Some users want pixel-level control over where boxes sit and exactly how a specific line is drawn (straight-angle vs. dashed, which border an arrow leaves from) — control auto-layout can't offer by definition. Rather than compromise the auto-layout engines to support this, manual mode is a parallel, opt-in path that reuses everything downstream of "where do nodes go."

## Architecture

`layout()` (the `@bpm/layout` facade) branches at the top on `diagram.positioning`:

- **`undefined` (default)**: today's behavior, byte-for-byte unchanged — `selectEngine` picks `swimlane` or `flat`, that engine's `layout()` runs, then the shared `positionBoundaryEvents` pass.
- **`'manual'`**: a new `@bpm/layout-engine-manual` package, invoked directly by the `@bpm/layout` facade's `positioning` check — **not** registered into the `layout-core` engine registry (`registerEngine`/`selectEngine`), since that registry's `matches()` contract is for auto-detection, and manual mode is never auto-detected. It reads each node's `at (x, y)` coordinate straight from the AST instead of invoking ELK. Pools/lanes get a parallel stacking pass mirroring `layout-engine-swimlane/src/laneBanding.ts`: lanes still auto-stack top-to-bottom and auto-size to content, but a node's `at (x, y)` is relative to its lane's own top-left rather than canvas-absolute, so placing content in a later lane never requires knowing how tall earlier lanes ended up.

Everything after node placement — `positionBoundaryEvents`, the shared orthogonal router (`packages/layout-core/src/routing`), and all of `@bpm/render` — runs unchanged on top of either engine's output. This is what makes the mode purely additive: no auto-layout code path is modified, and manual mode inherits the router's current behavior (including its known diagonal-fallback limitation, discussed and explicitly not being fixed here) identically to auto diagrams.

Per-edge style/anchor overrides (see Syntax) are consumed at two points regardless of mode: `from`/`to` feed the router's start/end anchor calculation (replacing today's auto-picked side, e.g. `sweepEntryPoint` in `boundaryEvents.ts` or the `preferRight`/`goingDown` logic in `channelRouting.ts`), and `style`/`corner` are consumed only by `@bpm/render`, purely cosmetic.

## Syntax

```
positioning: manual

pool "Order-to-Cash"
  lane "Sales"
    task "Review order" as t1 at (40, 40)
    gateway exclusive "Approved?" as g1 at (220, 40)
  lane "Fulfillment"
    task "Ship item" as t2 at (40, 40)

t1 -> g1
g1 -> t2 [style: dashed, from: bottom, to: top]
```

- **`positioning: manual`**: new diagram-level directive, parsed the same way as the existing `layout:` directive (a dedicated regex-matched line, stored as `Diagram.positioning: 'manual' | undefined`). Mutually exclusive with an explicit `layout: <engine>` directive — both present is a parse error, since engine selection is meaningless once positioning is manual.
- **`at (x, y)`** on a node declaration: **required** when `positioning: manual` is set, and a **parse error** when it isn't (keeps the two modes unambiguous — no silent partial-manual diagrams). Width/height are never specified — they stay auto-sized from the label via the existing `@bpm/render` sizing logic, per the earlier decision to keep sizing automatic in both modes.
- **Edge attribute block** `[style: ..., corner: ..., from: ..., to: ...]`, all optional, appended after an edge's label if any, available in **every** diagram regardless of `positioning`:
  - `style`: `solid | dashed | dotted`, overriding the flowType-based default in `render/src/edges.ts`.
  - `corner`: `sharp | round`, a cosmetic bezier-smoothing pass at each orthogonal bend — does not change the routed path, only how it's drawn.
  - `from` / `to`: `left | right | top | bottom`, overriding the router's auto-picked exit/entry side for that edge's source/target respectively.

## Data Flow

```
text → parse() → Diagram { ..., positioning?: 'manual', nodes: [{ ..., position?: {x,y} }], edges: [{ ..., style?, corner?, from?, to? }] }
  → @bpm/layout.layout(diagram):
       if diagram.positioning === 'manual':
         positioned = await manualEngine.layout(diagram)   // reads position, stacks lanes
       else:
         engine = selectEngine(diagram)                     // unchanged
         positioned = await engine.layout(diagram)
       return positionBoundaryEvents(diagram, positioned)    // unchanged, both paths
  → render(positioned) → SVG                                  // style/corner consumed here
```

## Error Handling

- **Missing `at (x, y)` in manual mode** / **present `at (x, y)` in auto mode**: parse-time structured error (`{line, column, message}`), reusing the existing mechanism.
- **`positioning: manual` combined with an explicit `layout:` directive**: parse-time error.
- **Overlapping manually-placed nodes**: manual mode still runs the existing geometry analyzer (`analyzeLayout`) on its output before rendering; a detected overlap surfaces as a structured error rather than a silently broken diagram. (Auto-layout diagrams don't need this check today because the engines guarantee no overlap by construction; manual mode has no such guarantee, so this is new, mode-specific validation, not a change to existing behavior.)
- **Unrecognized `style`/`corner`/`from`/`to` value**: parse-time error, same closed-vocabulary validation style as the existing arrow-token-to-flowType table.

## Testing

- **`parser`**: new grammar tests for `positioning: manual`, `at (x, y)`, and the edge attribute block, including each new error case above.
- **`ast`**: type tests confirming the new optional fields round-trip.
- **`layout-engine-manual`** (new package): hand-built diagram tests mirroring `boundaryEvents.test.ts`'s style — assert exact output positions for simple cases, and lane-relative stacking for pooled cases (a later lane's content never shifts if an earlier lane's content changes size, mirroring the equivalent `bandLanes` guarantee).
- **`layout-core`**: routing tests confirming `from`/`to` overrides are honored by the router's anchor calculation, in both auto and manual diagrams.
- **`render`**: snapshot/geometry tests for `style`/`corner` overrides rendering distinctly from the flowType default.
- **Regression**: full existing suite re-run unchanged — this is the proof auto-layout behavior didn't move. No existing baseline (including the crossing-regression counts) should change, since no existing code path is touched.

## Deferred (explicitly out of scope for this design)

- **Fixing the router's diagonal-fallback limitation** — a separate, already-scoped investigation (see prior session's evaluation); manual mode inherits current behavior as-is.
- **True curved/spline routing** (reshaping the path itself, not just rounding corners) — `corner: round` covers the common cosmetic case; a genuine second routing algorithm is a much larger change, not needed to satisfy the stated requirement.
- **Per-node manual override inside an otherwise auto-laid-out diagram** (mixing modes within one diagram) — explicitly deferred per the earlier scoping decision; `positioning: manual` is all-or-nothing per diagram.
- **Explicit node width/height in manual mode** — sizing stays automatic, per the earlier scoping decision.
