# BPMN edge-routing penalty experiment

This experiment is isolated on `codex/edge-routing-penalty`. Shape placement and allocated ports are
unchanged. The experiment applies only to the existing `soft` edge-obstacle policy, which is used for
local cross-lane sequence flows. Same-lane, cross-pool, boundary-event, and manual-layout routes keep
their existing behavior.

## What changed

`packages/diagram-core/src/routing/routeCost.ts` provides deterministic, render-independent route
diagnostics for:

- collinear/shared-corridor overlap;
- proper edge crossings;
- edge proximity below an 8px readable gap;
- bend and U-turn counts;
- Manhattan route length.

The scoring order gives collinear overlap a much higher cost than a clean perpendicular crossing. A
crossing is still reported and can be selected when avoiding it would create a severe detour. Shape
intersections remain hard constraints and are never traded for a shorter route.

The sequential router evaluates a bounded candidate set:

1. the existing hard edge-avoidance route;
2. preferred-first-turn shape-safe L route;
3. alternate-first-turn shape-safe L route;
4. shape-only visibility-graph route.

The soft candidates are considered only when the existing severe-detour gate is met. Ties are resolved
by the serialized point sequence so identical input remains deterministic.

## Deliberate scope limit

This is not yet a complete visual-geometry optimizer. Labels, arrowheads, gateway markers, lane labels,
pool labels, and page bounds are not yet passed into routing. They remain follow-up diagnostics because
their geometry currently originates in the renderer. The experiment therefore must be accepted with
both structured metrics and visual review of the supplied BPMN fixture.

## Safety and rollback

The experiment was created from the protected baseline tag:

```text
bpmn-routing-penalty-baseline-2026-08-21
```

To discard only this experiment, switch away from the worktree and remove the worktree/branch after
review. To restore the pre-experiment implementation, use the protected tag or commit `1260b2f`.
Do not reset the shared `main` branch as part of routine review.

## Acceptance checks

For the Manufacturing and Quality DSL, confirm visually and structurally that:

- no route enters a task, event, or gateway;
- ports and gateway cardinal vertices remain unchanged;
- the `pbr_oos -> pbr_dev` route remains shape-safe and readable;
- the reciprocal `pbr_complete -> pbr_package` loop is distinguishable;
- collinear routes are not silently merged;
- the intentional clean crossing remains reported;
- SVG output is deterministic across repeated renders.

The experiment does not claim that label/marker collision or full global route optimization is solved.
