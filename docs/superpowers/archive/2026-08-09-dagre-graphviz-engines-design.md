> Archived 2026-08-10 — engine removed from main; see docs/superpowers/plans/2026-08-10-prune-experimental-engines.md.

# Dagre and Graphviz comparison engines — design

_2026-08-09_

## Why

The elk-native comparison spike (see
`docs/superpowers/specs/2026-08-09-elk-native-layout-comparison-design.md`) found
that ELK's compound-node nesting doesn't cleanly solve BPMN swimlane layout once
real cross-lane edges exist. Researching how the two most-used text-to-diagram tools
handle the same problem confirmed the pattern independently:

- **Mermaid** defaults to **Dagre** for flowcharts (a JS port of the same
  Sugiyama/layered approach Graphviz's `dot` uses), and added an ELK.js option later
  specifically because Dagre struggles with larger/more nested graphs. Mermaid's
  subgraphs are generic nested boxes, not row/band swimlanes, so its ELK path never
  has to solve our specific lane-ordering problem.
- **PlantUML** runs most diagrams through **Graphviz `dot`** (or its own pure-Java
  reimplementation, "Smetana"), but hand-rolls its activity-diagram swimlanes with
  custom placement rules rather than delegating to dot — and renders them as
  columns, not rows.

Neither tool trusts its general-purpose graph-layout engine with swimlane placement.
This spec adds Dagre and Graphviz as two more **opt-in-only, flat comparison
engines** (same experimental status as `elk-native`) so the toolbar toggle can show,
side by side, what each of the three most common JS/embeddable layout engines
(ELK, Dagre, Graphviz) actually produces for the same diagram text — while being
explicit that none of them are being asked to solve swimlanes.

## Non-goals

- Not attempting compound/cluster nesting in either library (confirmed decision —
  see the elk-native spec's precedent). Pools/lanes are not visually banded by these
  two engines; expanded sub-processes render as a single opaque box, not recursed
  into.
- Not claiming either is better than the production engines — comparison only.
- Not merging to `main` — this stays on `explore/elk-native-layout`.

## 1. Shared prerequisite: export `sizeOf`

**`packages/layout-elk-base/src/toElkGraph.ts`**: add `export` to the existing
`sizeOf` function (currently private) — no logic change. Both new engines need the
exact same per-node-kind pixel dimensions (`EVENT_SIZE`, `GATEWAY_SIZE`,
`activitySize(label)`, etc.) that `layout-engine-flat`/`swimlane`/`elk-native`
already use, so the only variable being compared across all five engines is the
layout algorithm, not node sizing.

**`packages/layout-elk-base/src/index.ts`**: re-export `sizeOf` alongside the four
helpers already exported for elk-native.

## 2. `packages/layout-engine-dagre`

New package, `LayoutEngine` with `name: 'dagre'`, `matches: () => false`.

- `toDagreGraph(diagram)`: builds a `dagre.graphlib.Graph()` — `setGraph({ rankdir:
  'LR', ranksep: 60, nodesep: 40 })`, `setNode(id, sizeOf(node))` for every
  non-boundary node (pool/lane membership ignored — every node in the diagram goes
  into this one graph), `setEdge(sourceId, targetId, {})` for every non-boundary
  edge. Boundary-event exclusion reuses the now-exported `isBoundaryEventId`.
- `engine.ts`: `dagre.layout(graph)` (synchronous, mutates in place), then map back:
  - `graph.node(id)` returns **center-x/y** — convert to the top-left convention
    `PositionedNode` uses: `x: cx - width / 2, y: cy - height / 2`.
  - `graph.edge(sourceId, targetId).points` is already an `Array<{x,y}>` usable
    directly as `RoutedEdge.points`.
  - Pool bounding boxes: for each pool, compute the min/max bbox of its own nodes'
    *final* positions (no grouping hint was given to dagre — this is a purely
    derived visual box after the fact), `lanes: []`. Nodes with no pool assignment
    aren't wrapped in anything, matching `layout-engine-flat`'s existing shape.
  - Sub-processes: sized via `sizeOf` (which returns `activitySize(label)` for any
    activity kind, expanded or not) with no `children`/`childEdges` populated — an
    opaque box, consistent with the confirmed non-goal.

## 3. `packages/layout-engine-graphviz`

New package, `LayoutEngine` with `name: 'graphviz'`, `matches: () => false`.

- Dependency: `@hpcc-js/wasm-graphviz` (confirmed API via a real smoke test this
  session: `Graphviz.load()` returns a promise once; `.layout(dotSource, "plain",
  "dot", { yInvert: true })` returns the `plain` text format synchronously).
  `Graphviz.load()` is called lazily on first use inside `engine.layout()`, not at
  module import time, and the loaded instance is cached module-level (mirrors how
  `layout-elk-base/runElkLayout.ts` keeps a single `new ELK()` instance) — this
  keeps the WASM load off the critical path unless this engine is actually selected.
- `toDotSource(diagram)`: emits `digraph { rankdir=LR; node [shape=box];
  <id> [width=<w/72>, height=<h/72>, fixedsize=true]; <id> -> <id>; }` for every
  non-boundary node/edge. Width/height divided by 72 — confirmed by direct test
  this session that Graphviz's `plain` output, fed `width=40/72` in the DOT source,
  returns that exact node at `width: 0.55556` (= 40/72) with `fixedsize=true`
  preventing dot from re-sizing it — multiplying every output number by 72
  round-trips back to our pixel space exactly.
- `fromPlainOutput(diagram, text)`: parses the `plain` format line-by-line —
  - `node <id> <cx> <cy> <w> <h> ...` → `x: cx*72 - w*72/2, y: cy*72 - h*72/2` (center
    → top-left, same conversion as dagre).
  - `edge <tail> <head> <n> <x1> <y1> ... <xn> <yn> ...` → `points:
    [{x: x1*72, y: y1*72}, ...]`. `n` tells you how many coordinate pairs follow
    before any trailing label/style fields, so the parser reads exactly `n` pairs.
  - `graph`/`stop` lines are ignored.
  - Pool bboxes and sub-process handling: identical approach to dagre (derived bbox
    after the fact, opaque sub-process boxes).

## 4. Facade, toggle, and comparison harness

Same mechanics as elk-native, extended to two more names:

- `packages/layout/src/index.ts`: import and `registerEngine()` both in
  `ensureDefaultEngines()`.
- `apps/web/index.html`: two more `<option>`s in `#engine-override`
  (`value="dagre"` → `Dagre`, `value="graphviz"` → `Graphviz`).
- `packages/layout-engine-dagre/test/crossing-comparison.test.ts` and
  `packages/layout-engine-graphviz/test/crossing-comparison.test.ts`: report-only,
  same shape as elk-native's, against the shared `VERIFICATION_DIAGRAMS`.

## Testing

- Unit tests per engine: node sizing/positioning correctness (center→top-left
  conversion), edge point mapping, pool-bbox-derived-after-layout containment,
  boundary-event exclusion, opaque sub-process sizing.
- Facade test: `engineOverride: 'dagre'` and `engineOverride: 'graphviz'` both
  resolve and produce a valid `PositionedDiagram`.
- Report-only crossing-comparison tests for both, across all `VERIFICATION_DIAGRAMS`.
- Manual: toolbar toggle through all 6 options (`Auto/Flat/Swimlane/ELK-native/
  Dagre/Graphviz`) on a pool/lane diagram, confirm Dagre/Graphviz render everything
  flat with no lane bands and the badge updates correctly.
