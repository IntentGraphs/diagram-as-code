> Archived 2026-08-10 — engine removed from main; see docs/superpowers/plans/2026-08-10-prune-experimental-engines.md.

# ELK-native layout comparison — design

_2026-08-09_

## Why

`@bpm/layout-engine-swimlane` deliberately does **not** build Pool/Lane as nested ELK
compound containers. `layout-elk-base/src/toElkGraph.ts` explains why: letting ELK's
layered algorithm size and place each lane independently produced "scattered,
inconsistently sized lane boxes," so lane bands are instead assigned as a custom
post-process (`laneBanding.ts`) after a flat, per-pool ELK layout.

External guidance (an architecture note on text-to-BPMN pipelines, provided by the
user) argues the opposite: pass ELK.js a genuinely nested `Pool → Lane → Task` graph
with `elk.algorithm: layered`, `elk.direction: RIGHT`, `elk.edgeRouting: ORTHOGONAL`,
and `elk.padding` on the containers, and let ELK own sizing and placement of lanes
from their children — the same "compound node" mechanism the codebase already uses
successfully for expanded sub-processes/transactions.

This spec adds a third, **opt-in-only, experimental** layout engine that does exactly
that, plus a UI toggle to A/B it against the two production engines on the same
diagram text, so the question "is raw ELK actually better for lanes now?" can be
answered with real diagrams and real overlap/crossing numbers instead of re-litigated
from the old comment.

## Non-goals

- Not claiming ELK-native is better — this is a comparison tool, not a migration.
- Not fixing any of the known limitations listed in `docs/STATUS.md` for the existing
  engines.
- Not adding a settings panel/framework beyond one toolbar control — this is the
  first persisted UI setting in `apps/web`; no broader settings infrastructure is in
  scope.
- Not merging to `main` as part of this spec — work happens on a dedicated branch.

## 1. New package: `packages/layout-engine-elk-native`

Follows the existing engine package pattern (`layout-engine-flat`,
`layout-engine-swimlane`): a `LayoutEngine` (from `@bpm/layout-core`) with `name`,
`matches`, `layout`.

- `matches(): false` always — never auto-selected by `selectEngine`. Reachable only
  via the diagram's own `layout: elk-native` directive or the new facade override
  (section 2).
- `layout(diagram)`:
  1. Build an ELK graph with real nesting: `root` → one child per `Pool` (compound) →
     one child per `Lane` (compound) → leaf nodes for that lane's tasks/gateways/
     events/data objects, using the same per-node sizing (`sizeOf`/`activitySize`)
     logic already in `layout-elk-base/toElkGraph.ts`. Loose nodes (not in any
     pool/lane) stay as today: flat children of `root`.
     - Pool and Lane containers carry `layoutOptions: { 'elk.algorithm': 'layered',
       'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
       'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.padding': '[top=40,
       left=40, bottom=40, right=40]' }`, no explicit width/height — same free-sizing
       approach already used for expanded sub-process containers.
     - Boundary events stay excluded from the ELK graph entirely (same as today —
       `positionBoundaryEvents` runs after any engine, unconditionally, in the
       `@bpm/layout` facade).
  2. Run `elk.layout()` on that graph.
  3. Map the result back to `PositionedDiagram` with a new `fromElkNativeLayout.ts`
     in this package (not a change to the shared `layout-elk-base/fromElkLayout.ts`,
     to avoid touching code the two production engines depend on). This is
     structurally one more recursion level than `fromElkLayout.ts`'s existing
     Pool→children handling: `Pool → Lane → leaf`, producing real `PositionedLane`
     entries (`x`, `y`, `width`, `height` all taken from ELK's computed Lane
     container bounds, not assigned by hand) alongside the existing flat
     `PositionedNode[]` list (lane membership isn't represented in nesting there,
     matching the existing `PositionedDiagram` contract — only sub-process/
     transaction children nest).

No changes to `layout-elk-base`, `layout-engine-flat`, or `layout-engine-swimlane`.

## 2. Engine-override plumbing

**`packages/layout-core/src/engine.ts`**
Extract the named-lookup logic already inside `selectEngine` into
`getEngineByName(name: string): LayoutEngine` (throws the same "Unknown layout
engine..." error). `selectEngine` calls it for the `diagram.layout` branch — pure
refactor, no behavior change. Export `getEngineByName` from the package.

**`packages/layout/src/index.ts`**
```ts
export async function layout(
  diagram: Diagram,
  options?: { engineOverride?: string },
): Promise<PositionedDiagram> {
  ensureDefaultEngines();
  const engine = options?.engineOverride
    ? getEngineByName(options.engineOverride)
    : selectEngine(diagram);
  const positioned = await engine.layout(diagram);
  return positionBoundaryEvents(diagram, positioned);
}
```
`engineOverride`, when set, wins over both auto-detect and the diagram's own
`layout:` directive. Fully additive/optional — existing call sites (`layout(diagram)`
with no second argument) are unaffected.

**`packages/layout-engine-elk-native` must be registered** alongside the two existing
engines in `ensureDefaultEngines()` — required for `getEngineByName('elk-native')` to
resolve it, even though `matches()` keeps it out of auto-detect.

## 3. `apps/web` changes

**`apps/web/index.html`**
Add a `<select id="engine-override">` in `#toolbar-actions`, next to
`#engine-badge`, styled with the existing `.toolbar-btn` conventions:
- `Auto` (default) — no override, existing behavior.
- `Flat`, `Swimlane`, `ELK-native` — force that engine regardless of the diagram's
  own directive or pool/lane auto-detect.

**`apps/web/src/pipeline.ts`**
`runPipeline(text: string, engineOverride?: string): Promise<PipelineResult>` —
threads `engineOverride` into both `layout(diagram, { engineOverride })` and the
badge's engine-name lookup (`getEngineByName(engineOverride).name` when set, else the
existing `selectEngine(diagram).name`).

**`apps/web/src/main.ts`**
- Read/write the selection to `localStorage` (key: `bpm.engineOverride`) so it
  survives reloads — first persisted setting in this app, no existing pattern to
  follow beyond plain `localStorage.getItem`/`setItem`.
- On `change`, re-run `rerender()` with the new override value.
- `#engine-badge` keeps reflecting whichever engine *actually ran* (unchanged
  behavior when `Auto` is selected; shows the forced engine's name otherwise) — so a
  pool/lane diagram forced to `Flat` visibly shows `FLAT` in the badge, confirming the
  override took effect.

## 4. Test/metrics harness

Move `VERIFICATION_DIAGRAMS` from
`packages/layout-engine-swimlane/test/verificationDiagrams.ts` to
`packages/layout-core/test-utils/verificationDiagrams.ts` (alongside the existing
`geometry.ts`, already the shared test-support location) so it's importable from any
package without cross-package reach-into-test-dir imports. Update the swimlane test's
import path; no change to its assertions or baselines.

Add `packages/layout-engine-elk-native/test/crossing-regression.test.ts`:
```ts
it.each(Object.entries(VERIFICATION_DIAGRAMS))(
  'diagram "%s" — elk-native geometry (report only)',
  async (name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await elkNativeEngine.layout(diagram);
    const result = analyzeLayout(positioned);
    console.log(name, result.nodeOverlaps.length, result.edgeThroughNode.length, result.edgeCrossings);
  },
);
```
No pass/fail assertions on overlap/crossing counts — this engine is exploratory, and
a failing spike shouldn't block the suite. The test exists purely to produce
comparable numbers against swimlane's documented `BASELINE_CROSSINGS`
(`docs/STATUS.md` / `crossing-regression.test.ts`).

## 5. Branch & scope

New branch off `main`: `explore/elk-native-layout`. All work lands there; nothing
merges to `main` as part of this spec. Manual comparison happens by running the web
app (`npm run dev` in `apps/web` or existing dev workflow) and flipping the new
toolbar toggle across the existing starter diagram and the verification diagrams
(typed/pasted into the editor).

## Testing

- Unit tests for `fromElkNativeLayout.ts`'s Pool→Lane→leaf coordinate mapping
  (mirroring the existing coverage style for `fromElkLayout.ts`).
- `crossing-regression.test.ts` (report-only, section 4) across all
  `VERIFICATION_DIAGRAMS`.
- Facade test: `layout(diagram, { engineOverride: 'elk-native' })` returns a
  `PositionedDiagram` with populated `PositionedLane[]` for a pool/lane diagram, and
  that `layout(diagram, { engineOverride: 'flat' })` overrides an explicit `layout:
  swimlane` directive.
- Manual: toggle through all four toolbar options against the starter diagram and at
  least the `poolLaneTwoBoundary` and `orderToCashStacked` verification diagrams,
  confirm the engine badge updates correctly and no console errors.
