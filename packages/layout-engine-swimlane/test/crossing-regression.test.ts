import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';

// Baseline remeasured after fixing positionBoundaryEvents (packages/layout-core/src/boundaryEvents.ts)
// so boundary-event routing (a) no longer excludes its own host from the obstacle set wholesale
// — start already clears the host's inflated bounds, so the host can stay a normal obstacle for
// the rest of the path — and (b) scopes obstacles to the host's own subprocess siblings instead of
// every node in the diagram, so a subprocess's own container is never treated as an obstacle for
// its own children's routing. node overlaps and edge-through-node are fully clean (verified via
// `npm test` after the fix, not asserted). screenshot and orderToCashStacked's crossing counts rose
// by exactly the number of edge-through-node violations the fix removed from those two diagrams —
// paths that used to illegally cut through a node's interior now legally detour around it, which
// occasionally costs one edge-edge crossing elsewhere. That trade (a crossing instead of a shape
// being cut through) is a real improvement, not a regression.
// 2026-08-10 update: making a boundary-event edge's own target a routing obstacle, then retrying
// at reduced clearance before falling back to a direct line, raised crowdedBoundary and
// nestedSubprocess by one crossing each. Sibling-boundary obstacles and clearance retries keep
// the routes legal: both diagrams were visually verified clean of node overlaps and
// edge-through-node.
// 2026-08-17 update: same-lane edges now go through the shared sequential router (no more
// index-interpolated ELK shifts), and the router's exhausted-clearance fallback is an L-corner
// instead of a raw diagonal. orderToCashStacked dropped 11 → 4; fanOut picked up 1 residual
// from an L-fallback that used to be an uncounted diagonal.
// 2026-08-21 update: cross-lane local-pool flows may now choose a much shorter shape-safe path
// when hard edge avoidance creates a severe detour. orderToCashStacked drops 7 → 0 proper
// crossings while retaining zero node-overlap and edge-through-node findings. This does not
// claim zero edge proximity: the current analyzer does not count collinear edge overlap.
const BASELINE_CROSSINGS: Record<string, number> = {
  screenshot: 1,
  poolLaneTwoBoundary: 0,
  fanOut: 1,
  nestedSubprocess: 1,
  // Preferred first-turn routing now removes the two previously documented
  // crossings while retaining zero node-through-edge defects.
  crowdedBoundary: 0,
  // Final cross-pool routing keeps message flows out of partner-lane nodes; the
  // resulting legal detours add three edge crossings to this deliberately crowded case.
  orderToCashStacked: 0,
  boundaryExitColumnClip: 0,
  boundarySharedAvoidance: 0,
  orderToCashStackedFlat: 1,
};

describe('crossing regression — verification diagrams', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('diagram "%s" has zero node overlaps and zero edge-through-node', async (_name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const result = analyzeLayout(positioned);
    expect(result.nodeOverlaps).toEqual([]);
    expect(result.edgeThroughNode).toEqual([]);
  });

  it.each(Object.entries(BASELINE_CROSSINGS))('diagram "%s" has exactly its documented post-channel-routing crossing count', async (name, baseline) => {
    const { diagram } = parse(VERIFICATION_DIAGRAMS[name]);
    const positioned = await layout(diagram);
    const result = analyzeLayout(positioned);
    expect(result.edgeCrossings).toBe(baseline);
  });
});
