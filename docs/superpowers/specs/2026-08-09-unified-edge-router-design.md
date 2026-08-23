# Unified Obstacle-Avoiding Edge Router — Design

_Date: 2026-08-09_
_Branch: `explore/unified-edge-router`_

## Problem

The pipeline (`text → parser → layout → render`) already achieves zero node-node
overlaps and zero edge-through-node on its primary swimlane engine, verified by a
permanent regression suite (`packages/layout-engine-swimlane/test/crossing-regression.test.ts`)
built on a geometric analysis harness (`packages/layout-core/test-utils/geometry.ts`).
That guarantee comes from two independent, hand-rolled routing layers:

- `packages/layout-core/src/boundaryEvents.ts` — routes edges touching boundary
  events (ELK never sees these nodes, so it can't route around them) via
  `routeAroundScope`/`clearFinalApproachY`: sweep outside every obstacle's bounding
  box, then dogleg the final approach if it would clip something.
- `packages/layout-engine-swimlane/src/channelRouting.ts` — routes cross-lane edges
  through reserved channel gaps, using `assignTracks` (left-edge interval
  scheduling) to keep overlapping spans on separate tracks.

Both are correct for the cases they were built to handle, but neither generalizes:
each new interaction (a boundary dogleg landing on the same avoidance line as
another boundary dogleg, a boundary edge's *initial* exit segment sharing a host's
x-column with an unrelated node) has needed its own bespoke rule, documented as
known gaps in `docs/STATUS.md`:

1. Boundary-event edges are obstacle-checked only on their *final* approach
   segment, not their initial exit segment straight down from the host.
2. Two boundary-event doglegs avoiding the same obstacle at the same y-level can
   independently compute the identical avoidance line and cross each other — the
   same "shared corridor" problem `assignTracks` already solves for channel
   routing, not applied to boundary routing.
3. `layout: flat` mode has one known edge-through-node case (a boundary event's
   edge cutting through an unrelated end event), most likely the same root cause
   as (1) surfacing without lane banding to mask it.

This pattern — enumerate an overlap case, patch it, discover the next case — is
exactly the failure mode the requester has hit repeatedly across prior projects.
The goal here is not to patch these three cases; it's to replace the enumeration
approach with an algorithm that makes edge-through-node and edge-edge coincidence
geometrically impossible by construction.

## Approach

Replace both hand-rolled routing layers with one shared, general-purpose
**orthogonal obstacle-avoiding router**:

```
routeOrthogonal(start: Point, end: Point, obstacles: Rect[]): Point[]
```

**Algorithm**: build an orthogonal visibility graph — a graph node at every
obstacle corner (each obstacle rectangle inflated by a fixed clearance margin)
plus `start` and `end` — with a graph edge between any two nodes that share an x
or y coordinate and have an unobstructed line of sight between them. Run
Dijkstra (or A* with Manhattan-distance heuristic) over that graph for the
shortest rectilinear path from `start` to `end`.

Because a path can only be composed of edges in the visibility graph, and no
visibility-graph edge crosses an inflated obstacle, "the returned path never
passes through a node's interior" is a structural property of the algorithm, not
a case that was checked for. This is the core reason this approach is expected to
close the bug class permanently rather than incrementally: it doesn't matter what
new node/edge shape or diagram topology shows up later, the guarantee doesn't
depend on anticipating it.

**Edge-edge separation**: route edges one at a time, in a fixed deterministic
order (e.g., by declaration order, or shortest Manhattan span first — exact
tie-break rule to be settled during implementation). After each edge is routed,
inflate its resulting polyline into a thin rectangle (a few px wide) and add it to
the obstacle set used for every edge routed afterward. Later edges then
automatically avoid earlier edges' paths as obstacles, using the same mechanism
that avoids node interiors — no separate "assign a lane/track index" rule is
needed, generalizing what `assignTracks` did for channel routing to every routed
edge in the diagram.

## Scope boundary (deliberate)

This unifies the two **hand-rolled, post-processing** routing layers only:

- boundary-event edge routing (`layout-core/src/boundaryEvents.ts`)
- swimlane cross-lane channel edge routing (`layout-engine-swimlane/src/channelRouting.ts`)

It explicitly does **not** touch edges produced natively by the underlying layout
engines (ELK, Dagre, Graphviz) for ordinary sequence flow. Those come from
mature, independently-tested routing already inside those libraries, and are not
where the diagnosed bugs live. Lane-banding macro layout (`laneBanding.ts` —
deciding lane heights/positions) is also unchanged; only the choice of *how a
routed edge's polyline is computed* moves to the shared router.

## Components touched

- **New**: `packages/layout-core/src/routing/visibilityGraph.ts` — builds the
  inflated-obstacle visibility graph from a set of rectangles plus start/end
  points.
- **New**: `packages/layout-core/src/routing/pathfind.ts` — Dijkstra/A* shortest
  path over a visibility graph.
- **New**: `packages/layout-core/src/routing/router.ts` — public
  `routeOrthogonal(start, end, obstacles)` plus a stateful wrapper that
  accumulates previously routed edges as thin-rectangle obstacles for
  subsequent calls within one layout pass.
- **Modified**: `boundaryEvents.ts` — replaces `routeAroundScope` and
  `clearFinalApproachY` with calls to the shared router; boundary-event
  *positioning* (spacing events across a host's border) is unchanged, only the
  routing of their edges changes.
- **Modified**: `channelRouting.ts` — replaces `assignTracks`'s hand-rolled track
  math with calls to the shared router for the actual polyline; channel gap
  reservation (the space between lane bands that routing has to work within)
  stays as-is, since that's macro layout, not routing.
- **Unchanged**: `test-utils/geometry.ts` — this is the independent verification
  ground truth (node-node overlap, edge-through-node, edge-edge crossing
  detection) that the new router is being validated against, not something
  adjusted to accommodate it.

## Testing

- New unit tests directly on `routeOrthogonal`: for synthetic obstacle sets,
  assert the returned polyline never intersects any obstacle rectangle (reusing
  the existing Liang-Barsky segment-vs-AABB test already duplicated in
  `boundaryEvents.ts` and `test-utils/geometry.ts` — this is a good point to
  de-duplicate that logic into one shared function during implementation).
- New unit tests for the sequential-obstacle wrapper: route edge A, then edge B,
  assert B's polyline doesn't overlap/cross A's.
- Re-run `crossing-regression.test.ts` against the existing
  `VERIFICATION_DIAGRAMS` fixture set:
  - `nodeOverlaps` and `edgeThroughNode` must remain `[]` for every diagram (no
    regression on the guarantee that already holds).
  - `BASELINE_CROSSINGS` gets re-measured and updated — expected to drop, since
    the two documented crossing gaps become structurally unreachable rather than
    patched around.
- Add explicit regression fixtures for the three known cases from
  `docs/STATUS.md`: the shared-avoidance-line boundary dogleg conflict, and the
  `layout: flat` edge-through-end-event case, so they're pinned as permanent
  regression tests rather than only implicitly covered by the general fixture
  set.

## Error handling & performance

If no visibility path exists at all (a target fully enclosed with no clearance —
not expected given how BPM layouts pad space around nodes, but must not crash the
pipeline), fall back to a direct straight line between `start` and `end` rather
than throwing.

Visibility-graph construction is O(n²) on the number of obstacle corners; this is
acceptable at BPM-diagram scale (dozens to low hundreds of nodes per diagram) and
is not being optimized for much larger graphs — an explicit non-goal, not an
oversight, revisited only if it becomes an actual bottleneck.

## Rollout

Developed and verified on `explore/unified-edge-router` before merging to `main`,
per the requester's preference to validate this approach in isolation first,
given it replaces logic in two files that a permanent regression suite already
depends on.
