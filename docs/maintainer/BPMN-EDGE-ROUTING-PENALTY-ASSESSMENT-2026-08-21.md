# BPMN edge-routing penalty assessment

_Assessment date: 2026-08-21_

This assessment defines the next routing experiment after the placement and
port checkpoint. It does not change node placement or endpoint-port allocation.
Those are treated as resolved inputs for this phase.

## Current baseline

The current router uses an orthogonal visibility graph and sequential edge
obstacles. Shape rectangles are hard obstacles. The recent bounded soft-edge
experiment permits a direct shape-safe L-path when the hard edge-avoidance path
is a severe detour. It is scoped to cross-lane local-pool routes; same-lane and
cross-pool routes retain hard edge avoidance.

The exact manufacturing/quality DSL now has the intended short route for
`pbr_oos -> pbr_dev` with these results:

```text
valid:                    true
nodeOverlaps:             0
edgeThroughNode:          0
edgeOvershootsOwnEndpoint: 0
labelOverlaps:             0
routeFallbacks:           0
edgeCrossings:             1
```

The remaining crossing is an intentional result of allowing a short route to
cross an earlier edge. The current geometry analyzer does not count collinear
edge overlap as an edge crossing, so visual inspection and a dedicated
collinear-overlap metric are still required.

## Design objective

Choose the cleanest legal route for each edge while preserving BPMN meaning:

- The edge must leave and enter through the already assigned ports.
- An edge must not pass through a shape, gateway, event, container, or its own
  endpoint interior.
- Labels, arrowheads, gateway markers, and lane/pool labels must remain readable.
- Edge crossings and overlaps should be avoided when affordable, but should not
  force extreme detours through a crowded part of the diagram.
- The result must remain deterministic and stable for the same DSL.
- A route should look intentional to a human reader, not merely be geometrically
  valid.

## Hard constraints versus penalties

The router should use two distinct classes of rules.

### Hard rejection or infinite cost

These should never be traded away for a shorter route when a legal alternative
exists:

- Segment enters the interior of an unrelated task, event, gateway, data
  object, subprocess, pool, or lane label host.
- Segment cuts through its own source or target to reach the assigned port.
- Endpoint does not finish at the assigned destination port.
- Edge exits from the wrong side after port allocation.
- Route escapes a contractual page/canvas boundary.
- Route crosses a container boundary illegally for the edge type.
- Route creates a zero-length or non-orthogonal segment when orthogonal routing
  is required.

If no hard-safe route exists, the router may use a deterministic degraded
fallback, but it must emit a structured diagnostic. A fallback must never be
silently considered a successful clean route.

### Weighted readability penalties

Among hard-safe candidates, use penalties to choose the best visual route:

| Priority | Condition | Relative penalty |
|---|---|---:|
| 1 | Label, arrowhead, gateway marker, or lane label collision | Very high |
| 2 | Collinear overlap with an unrelated edge | High |
| 3 | Proper crossing near a gateway, label, or arrowhead | High |
| 4 | Any other proper edge crossing | Medium/high |
| 5 | Edge runs too close to another edge without clear parallel intent | Medium |
| 6 | Unnecessary lane-boundary crossing or repeated lane zigzag | Medium |
| 7 | Extra bend, U-turn, or direction reversal | Medium |
| 8 | Poor parallel spacing or uneven fan-out spacing | Low/medium |
| 9 | Excess route length or detour ratio | Low/medium |
| 10 | Small alignment or spacing imperfection | Low |

The priorities should be implemented lexicographically first, then with numeric
weights inside a tier. A single flat sum is risky because many minor edge
penalties could incorrectly outweigh one serious gateway or label collision.

## BPMN-specific readability rules

The penalty system must include BPMN semantics, not only generic geometry.

### Flow direction and branch identity

- Preserve the visual left-to-right process direction unless a feedback loop
  requires a deliberate return path.
- Keep an outgoing gateway branch visually separate from the incoming flow.
- Keep conditional/default labels close to their own edge and away from sibling
  branches.
- Do not let a branch cross the gateway diamond or its internal marker.
- Avoid making two branches appear to originate from one shared line when they
  have different conditions.
- Prefer parallel fan-out channels with consistent spacing.
- Prefer converging flows that approach a task or gateway from distinguishable
  sides or channels.

### Reciprocal and loop flows

- A feedback edge must be visually distinguishable from the forward edge.
- Reciprocal edges must not become a single collinear line with two arrowheads
  unless the shared corridor is explicitly represented as an intentional trunk.
- Loop routes should use a stable top/bottom or outer channel rather than
  hugging the gateway's side ports.
- A loop must not obscure the gateway label or the forward branch label.

### Port and endpoint preservation

Port allocation is outside this phase, but routing must respect its output:

- Do not silently change a source or target side to make routing easier.
- Preserve gateway cardinal-vertex assignments.
- Use the assigned source stub and target entry stub as hard route anchors.
- Report a port conflict separately from a route conflict.

### Lane and pool readability

- Cross-lane sequence flows may cross lane boundaries, but should use the
  shortest clear transition channel.
- A route should not travel through a lane header or pool participant label.
- Repeated lane transitions should be penalized.
- Cross-pool message flows should use pool-facing sides and remain visually
  distinct from same-pool sequence flow.
- A route should not leave a pool merely to avoid an edge when an in-pool
  channel is available.

### Orthogonal neatness

- Prefer horizontal/vertical segments.
- Penalize unnecessary bends, especially alternating zigzags.
- Penalize U-turns and near-zero-length segments.
- Prefer a short straight stub before the first turn and after the final turn.
- Prefer shared alignment only when it does not hide branch identity.
- Keep parallel edges separated by a stable minimum gap.
- Avoid routes that nearly touch a shape corner or create a false connection.
- Prefer consistent bend locations for edges with similar source/target roles.

## Recommended route score

The implementation should expose route diagnostics internally and score a
candidate approximately as follows:

```text
hardInvalid(candidate)       → reject

readabilityTier = (
  labelAndMarkerConflicts,
  gatewayConflicts,
  collinearEdgeOverlaps,
  edgeCrossings,
  edgeProximityConflicts,
  laneZigzags,
  bendCount,
  detourRatio,
  routeLength
)
```

Candidates are compared lexicographically by tier. Numeric weights can then be
used within each tier, with a deterministic tie-break based on:

1. edge declaration order;
2. preferred first-turn direction;
3. bend coordinate order;
4. stable edge id.

This prevents small floating-point or graph-insertion changes from changing the
rendered result unexpectedly.

## Candidate generation strategy

The current visibility graph filters obstacles as binary blocked regions. A
penalty system needs a small candidate set rather than an unrestricted search:

1. Generate the preferred direct L-path.
2. Generate the hard shape-safe visibility-graph route.
3. Generate routes around the nearest top/bottom or left/right channel.
4. Generate one route using an alternate first turn.
5. Generate a reciprocal-loop candidate through the dedicated outer channel.
6. Score candidates against shapes, labels, bounds, prior edges, and BPMN
   readability rules.

The first implementation should keep this candidate set bounded. A full global
multi-edge optimizer is not required for the initial experiment.

## Metrics that need to be added or separated

The existing validation already reports node overlaps, edge-through-node
defects, overshoots, proper crossings, labels, and route fallbacks. The routing
experiment should additionally measure:

- collinear edge overlap;
- edge-to-edge minimum distance;
- edge-to-label and edge-to-arrowhead distance;
- gateway-marker clearance;
- number of lane-boundary transitions;
- bend count and U-turn count;
- route length and direct-distance detour ratio;
- first-turn and final-approach direction;
- shared-corridor length;
- number of routes using degraded fallback.

These should be reported separately. One aggregate quality score is useful for
comparing experiments, but it must not replace the individual diagnostics.

## Experiment plan

### Experiment A — current baseline

Keep the current bounded soft-edge policy and record all new metrics. This is
the control case for the exact manufacturing/quality DSL and existing
verification corpus.

### Experiment B — label and marker obstacles

Add label, gateway-marker, arrowhead, and lane-label boxes to route scoring.
Keep shape collision hard. Confirm that no route becomes a shape-through-node
fallback merely to avoid a label.

### Experiment C — edge interaction scoring

Replace the binary edge obstacle decision with penalties for crossing,
collinear overlap, and near-edge proximity. Keep a very high penalty around
gateway branches and labels.

### Experiment D — reciprocal-loop candidates

Add explicit top/bottom outer-channel candidates for reciprocal gateway loops,
especially `Package complete?`. Compare them against the current paired-facet
solution without changing gateway port allocation.

### Experiment E — corpus and visual acceptance

Run the exact DSL, `diagram (9)`, `diagram (10)`, `diagram (11)`,
`orderToCashStacked`, fan-out, boundary-event, nested-subprocess, and cross-pool
fixtures. Accept a change only when:

- hard geometry violations do not increase;
- label/marker collisions do not increase;
- no new ambiguous gateway or reciprocal-loop route appears;
- route length and bend count improve or remain within an agreed tolerance;
- proper crossings are reduced or their visual impact is demonstrably lower;
- output remains deterministic across repeated runs.

## Main risks and controls

| Risk | Control |
|---|---|
| Weights overfit one diagram | Use a corpus of simple, fan-out, loop, boundary, and cross-pool fixtures |
| Short route hides semantics | Give gateway, label, and arrowhead conflicts higher priority than length |
| Collinear overlap is missed | Add a separate overlap metric and visual check |
| Greedy edge order biases routes | Use stable ordering now; consider bounded rerouting only after scoring evidence |
| Candidate count harms performance | Cap candidates and use the visibility graph only within the local pool |
| Dynamic bounds distort scoring | Score against declared page/pool bounds, not self-expanding render bounds |
| Port changes leak into routing | Treat allocated ports as immutable inputs and report conflicts separately |
| A crossing warning is mistaken for failure | Keep hard geometry diagnostics separate from readability warnings |

## Recommendation

Proceed with a bounded candidate-scoring experiment. Do not replace the current
router with a global optimizer yet. The most valuable next additions are:

1. explicit collinear-overlap and edge-proximity diagnostics;
2. label/arrowhead/gateway-marker scoring;
3. lexicographic candidate selection;
4. reciprocal-loop candidates for the `Package complete?` pattern;
5. visual comparison against the exact BPMN corpus.

Placement and ports should remain frozen while this experiment runs. That keeps
the evidence attributable to edge routing and avoids mixing three independent
layout variables in one change.

