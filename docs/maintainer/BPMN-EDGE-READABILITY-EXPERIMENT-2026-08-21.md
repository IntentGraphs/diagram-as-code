# BPMN edge readability experiment

This experiment is based on `0925517` and is isolated on `codex/edge-routing-readability`.
Placement remains sequence-aware and existing shape geometry is preserved.

## Implemented

- Port reservations distinguish sequence and message flows.
- Multiple same-role message fan-in edges receive stable, distinct slots.
- Gateway branches retain one cardinal side with deterministic offsets.
- Cross-pool routing uses the assigned ports rather than midpoint ports.
- Route scoring now includes shape-clearance proximity, edge proximity, crossings,
  collinear overlap, bends, U-turns, length, and message-flow weighting.
- Duplicate and redundant collinear route points are removed.
- Shape-safe alternatives replace an edge-obstacle fallback when the fallback would
  pass through an unrelated shape.
- Lane channel and pool stack gaps are spacing-profile aware and bounded.
- Relaxed inner lane content padding remains 30px.

## Penalty model delivered in this experiment

The route selector now uses a bounded, tiered readability score. Shape interior
collisions remain hard failures. Among shape-safe candidates, the score prefers
readable clearance and distinct endpoints before reducing bends and distance:

1. Shape-safe routes and valid endpoint approaches.
2. Shape-clearance deficits and close shape pairs.
3. Collinear edge overlap, crossings, and edge-to-edge proximity.
4. Gateway fan-out and message fan-in separation through stable ports.
5. Bends, U-turns, short corrective jogs, and route length.

Message flows receive stronger interaction weighting and are routed with their
assigned source/target ports. The score is intentionally bounded: existing edges
are soft interaction costs, not universal obstacles. This preserves a viable
route when a diagram contains feedback loops or dense pool-to-pool traffic.

The post-route simplifier removes duplicate points, redundant collinear points,
and small corrective jogs when endpoint and shape-clearance constraints remain
valid. Explicit gateway fan-out points are preserved.

## Layout and port updates delivered

- Sequence and message ports are reserved independently by flow role.
- Same-role message fan-in uses stable, distinct target slots rather than sharing
  a midpoint destination.
- Gateway branches on one side retain deterministic, distinct offsets.
- Cross-pool routes consume the assigned port geometry, so route selection does
  not silently reconnect at a midpoint.
- Lane channel gaps and pool stack gaps are spacing-profile aware with bounded
  demand. Existing relaxed lane content padding is retained while the channel
  budget is made explicit.

These changes address endpoint ambiguity and hard shape defects first. They do
not claim to solve all global edge ordering or label placement problems.

## Deliberate limits

The router still does not receive final measured SVG label, arrowhead, or gateway-marker
geometry. Label and marker-aware routing remains a follow-up integration with the renderer.
Message-flow reverse-direction interaction is also kept in directed pool-pair contexts for
this bounded experiment; a global interaction context requires external edge scoring rather
than converting every opposite-direction route into a hard obstacle.

## Validation

The exact Manufacturing and Quality fixture remains clean:

```text
nodeOverlaps: 0
edgeThroughNode: 0
edgeOvershootsOwnEndpoint: 0
routeFallbacks: 0
labelOverlaps: 0
edgeCrossings: 1
```

Diagram 14 remains free of hard shape defects and has distinct message fan-in ports. Its
current structured result is:

```text
nodeOverlaps: 0
edgeThroughNode: 0
edgeOvershootsOwnEndpoint: 0
routeFallbacks: 12
edgeCrossings: 18
```

The crossing increase is intentionally not hidden. It is a visual-review gate: distinct
message ports improve endpoint traceability, but the current bounded scorer still needs a
global external-edge interaction pass before it can optimize all cross-pool corridors.

## Further layout work to consider

The next work should remain separate from this merge so that routing regressions
can be isolated from placement changes.

- **Shared visual geometry:** feed the router the renderer's measured label boxes,
  lane/pool labels, arrowheads, gateway markers, conditional/default markers, and
  source markers. Approximate text widths are not sufficient for reliable hard
  collision decisions.
- **Global external-edge scoring:** score reverse-direction pool traffic,
  feedback loops, and edges from different pool pairs in one interaction context.
  Keep edge intersections soft where possible; do not turn every existing edge
  into a hard obstacle, which can cause excessive detours or route failure.
- **Gateway fan-out channels:** after choosing a cardinal gateway exit, create a
  short shared trunk and separate branches in a deterministic open channel. The
  current implementation separates ports but does not yet provide a full trunk
  layout for three or more branches in the same direction.
- **Message-flow bundles:** reserve channel capacity for repeated source/destination
  pool pairs and keep target corridors separated when multiple messages enter one
  receive task.
- **Two-pass lane and pool sizing:** estimate edge-track and message-track demand,
  allocate bounded gaps, route, measure actual clearances, then expand insufficient
  gaps once and reroute. This should avoid both squeezed routes and unbounded
  diagram growth.
- **Hard visual constraints and diagnostics:** reject shape, gateway-marker,
  arrowhead, unreadable-label, invalid-bound, and illegal-container routes. Report
  the rejected reason so a fallback is explainable.
- **Quality metrics:** add minimum edge-to-shape distance, label/marker collisions,
  collinear overlap, shared destination corridors, crossing severity, and route
  fallback counts to fixture validation.
- **Deterministic global ordering:** use stable edge IDs and geometric tie-breakers
  so results do not depend on incidental declaration order. A bounded reroute pass
  may be needed for diagrams where the first greedy edge consumes the only clean
  corridor.

### Risks to manage

More clearance and bundle capacity can enlarge diagrams, especially in relaxed
profiles. Strong edge-crossing penalties can produce long, hard-to-follow detours;
an open-space crossing may be preferable to a severe detour. Label measurements
can differ between layout and SVG rendering, and manual layouts may intentionally
violate automatic spacing assumptions. Each follow-up should therefore compare
hard-defect counts, readability metrics, route fallbacks, total bounds, and
deterministic output on both the exact fixture and diagram 14.

### Acceptance gate for the next iteration

For the supplied fixtures, require zero node overlaps, zero edge-through-shape
defects, zero endpoint overshoots, distinct repeated message targets, no marker
or label collisions, bounded lane/pool growth, deterministic SVG output, and no
increase in route fallbacks. Treat remaining open-space crossings as a measured
trade-off until global external-edge scoring is implemented.

## Rollback

The pre-experiment checkpoint is:

```text
bpmn-readability-baseline-2026-08-21
```

The previous penalty-only branch remains available at `codex/edge-routing-penalty`.
