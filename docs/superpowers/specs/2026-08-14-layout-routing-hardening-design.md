# Layout Routing Hardening — Deferred Gaps

_Date: 2026-08-14. Roadmap deferred section + STATUS known limitations._

## Context

The unified orthogonal visibility-graph router (`@bpm/layout-core`) replaced hand-rolled boundary and cross-lane routing. Residual issues are **layout-only** and independent of notation gaps (see feature-gap survey).

## Deferred gaps (unchanged priority)

| ID | Gap | Location | Proposed fix |
|----|-----|----------|--------------|
| L1 | **Initial exit-segment obstacle blindness** | `layout-core` boundary router | Seed visibility graph with host-adjacent clearance nodes before first segment |
| L2 | **Dogleg-collision track separation** | `layout-engine-swimlane` `assignTracks` | Increase track penalty when two boundaries on different hosts share x-column |
| L3 | **Per-lane uniform height** | `laneBanding.ts` | **Implemented** — variable lane heights from each lane's content bbox plus padding; older golden coordinates need regeneration |
| L4 | **Residual edge-edge crossings** | verification diagrams | `screenshot: 1`, `crowdedBoundary: 2`, `nestedSubprocess: 1`, `fanOut: 1`, `orderToCashStacked: 4` — mostly inter-pool message flows and dense same-lane content conflicts |

## Hardening plan (when resumed)

### Sprint A — Boundary exit (L1)

1. Reproduce with `boundaryExitColumnClip` fixture (already `edgeCrossings: 0`; add **obstacle-proximity** metric).
2. Extend router seed points to sample host border ± clearance.
3. Regression: no increase in `edgeThroughNode`.

### Sprint B — Track separation (L2)

1. Extend `assignTracks` cost function with host-pair collision term.
2. Target `crowdedBoundary` crossing count reduction without new through-node violations.

### Sprint C — Lane height refactor (L3)

1. Feature flag `layoutSpacing` + variable lane height behind `layout: swimlane-v2`.
2. Re-record verification coordinates in one batch.

## Explicit non-goals

- Changing `.bpm` grammar for routing
- Per-edge manual router overrides beyond existing `via` / `from` / `to`

## Tests

Existing harness: `packages/layout-engine-swimlane/test/crossing-regression.test.ts`, `packages/layout-core/test/routing/router.test.ts`.

Add when implementing L1: `packages/layout-core/test/routing/boundaryExitObstacle.test.ts`.

## Status

**Design only** — implementation deferred per ROADMAP; this document satisfies the hardening design artifact for the work package.
