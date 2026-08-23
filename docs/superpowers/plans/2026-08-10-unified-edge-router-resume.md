# Unified Edge Router — Resume Plan (PAUSED)

> **Status:** PAUSED after Task 7. Working tree clean on `explore/unified-edge-router` @ `5225cb9`. Safe to resume in Cursor anytime.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Parent plan: `docs/superpowers/plans/2026-08-09-unified-edge-router.md`. SDD ledger: `.superpowers/sdd/2026-08-09-unified-edge-router/progress.md`.

**Goal:** Finish bookkeeping (re-baseline + gap fixtures + STATUS), run the full suite, then whole-branch review before any merge decision.

**Architecture:** Unchanged from parent plan — shared orthogonal visibility-graph router already integrated into `boundaryEvents.ts` and `laneBanding.ts`. Remaining work is verification/docs only; no new routing logic.

**Tech Stack:** TypeScript, Vitest, existing `@bpm/layout-core` test-utils.

## Global Constraints

- No new npm dependencies.
- Must not regress `nodeOverlaps: []` / `edgeThroughNode: []` on any `VERIFICATION_DIAGRAMS` entry.
- Do **not** merge to `main` as part of this plan — finish Task 10 review first, then use finishing-a-development-branch for the integration choice.
- Do **not** claim STATUS gaps are closed unless dedicated fixtures + `analyzeLayout` prove it. Task 7 already measured that existing `BASELINE_CROSSINGS` did **not** drop (see Checkpoint).

---

## Checkpoint (as of pause)

| Item | State |
|------|--------|
| Branch | `explore/unified-edge-router` |
| HEAD | `5225cb9` — `refactor(layout-engine-swimlane): route cross-lane edges via shared orthogonal router` |
| Working tree | Clean (ignore untracked `.claude/`, `apps/web/.vite/`) |
| Tasks 1–7 | Complete, each reviewed clean (Task 2: 3 fix rounds; Task 4: 1 fix round) |
| Full suite at Task 7 | 189/189 across 28 files |
| Crossing baselines | Unchanged vs pre-migration: `screenshot/poolLaneTwoBoundary/fanOut/nestedSubprocess=0`, `crowdedBoundary=1`, `orderToCashStacked=9` |
| Final whole-branch review | **Not run** — last merge gate |

### Measured crossings (Task 7, temporary debug — not committed)

```
screenshot           edgeCrossings=0
poolLaneTwoBoundary  edgeCrossings=0
fanOut               edgeCrossings=0
nestedSubprocess     edgeCrossings=0
crowdedBoundary      edgeCrossings=1
orderToCashStacked   edgeCrossings=9
```

Identical to the map already in `packages/layout-engine-swimlane/test/crossing-regression.test.ts`. Re-baselining is therefore comment + confirmation, not number edits — unless new gap fixtures change the map.

### Deferred minors (ledger — non-blocking, glance before merge)

1. Task 3: `shortestPath` has no bounds guard on `startIndex`/`endIndex` (dormant; Task 4 always passes 0/1).
2. Task 6: `boundaryEvents.test.ts` describe blocks still named after deleted `routeAroundScope`.
3. Task 6: `VERIFICATION_DIAGRAMS` has no fixture where two boundary-event edges from **different hosts** interact/cross (shared-router inter-edge avoidance gap in coverage).
4. Task 7: `SequentialRouter` scoped per-pool not per-`bandLanes` call — confirmed non-hazardous (pools don't share coordinate space).
5. Task 7: `analyzeLayout` edgeCrossings uses strict segment intersection (colinear/touching not flagged) — pre-existing test-utility property.

### Reality check vs design optimism

Parent design expected `BASELINE_CROSSINGS` to **drop** because STATUS's two residual gaps would become structurally unreachable. They did not drop. Resume Tasks 8–9 must reconcile that: pin fixtures, measure honestly, rewrite STATUS from evidence — not from the design's hoped-for outcome.

Also note (Task 7 report): simple no-obstacle cross-lane paths are visually more direct (fewer bends, no forced channel-gap dip). Numeric suite is green; optional visual smoke in Task 9.

---

## File Structure (remaining)

Modified:
- `packages/layout-engine-swimlane/test/crossing-regression.test.ts` — comment re-baseline; possibly new keys if fixtures added.
- `packages/layout-core/test-utils/verificationDiagrams.ts` — only if gap cases need new named diagrams.
- `docs/STATUS.md` — describe router; residual limitations only if still true after fixtures.
- `.superpowers/sdd/2026-08-09-unified-edge-router/progress.md` — mark Tasks 8–10 complete when done.

Unchanged: all routing implementation under `packages/layout-core/src/routing/`, `boundaryEvents.ts`, `laneBanding.ts` (unless review finds a correctness bug).

---

### Task 8: Re-baseline crossing regression and pin STATUS gap cases

**Files:**
- Modify: `packages/layout-engine-swimlane/test/crossing-regression.test.ts`
- Possibly modify: `packages/layout-core/test-utils/verificationDiagrams.ts`

**Interfaces:**
- Consumes: `analyzeLayout`, `VERIFICATION_DIAGRAMS` (unchanged APIs).
- Produces: confirmed `BASELINE_CROSSINGS` + explicit fixtures for STATUS gap cases that aren't already covered.

- [ ] **Step 1: Confirm existing baselines still match**

Run:

```bash
npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts
```

Expected: PASS (12 tests). If any baseline fails, stop — investigate; do not paper over a regression.

- [ ] **Step 2: Update the baseline comment (numbers stay unless Step 1 failed)**

Replace the stale header comment in `crossing-regression.test.ts` with:

```typescript
// Baseline remeasured after migrating boundary-event and cross-lane channel routing
// to the shared orthogonal visibility-graph router
// (docs/superpowers/specs/2026-08-09-unified-edge-router-design.md).
// node overlaps and edge-through-node remain fully clean.
// Counts did not change vs the pre-migration map (Task 7 measured identical values).
const BASELINE_CROSSINGS: Record<string, number> = {
  screenshot: 0,
  poolLaneTwoBoundary: 0,
  fanOut: 0,
  nestedSubprocess: 0,
  crowdedBoundary: 1,
  orderToCashStacked: 9,
};
```

Do not invent lower numbers. If a later fixture step adds diagrams, append measured keys only.

- [ ] **Step 3: Inventory STATUS gap cases against `VERIFICATION_DIAGRAMS`**

From `docs/STATUS.md` Known limitations, the three cases to pin:

| # | Case | Likely coverage today |
|---|------|------------------------|
| A | Boundary initial exit (straight down from host) clips a node sharing the host's x-column | May be absent as a *minimal* fixture; `orderToCashStacked` / `crowdedBoundary` are noisy |
| B | Two boundary-event doglegs sharing an avoidance line at the same y (inter-edge) | `poolLaneTwoBoundary` / `crowdedBoundary` partial; deferred minor #3 notes different-host interaction missing |
| C | `layout: flat` boundary edge through unrelated end event (Order-to-Cash) | Swimlane suite won't exercise `layout: flat` unless fixture text starts with `layout: flat` |

Read `packages/layout-core/test-utils/verificationDiagrams.ts` end-to-end. For each case not covered by a **minimal, named** diagram:

1. Add a short diagram string under a clear key (e.g. `boundaryExitColumnClip`, `boundarySharedAvoidance`, `orderToCashFlat`).
2. Layout + `analyzeLayout` once (debug `it` or a one-off script) and record `edgeCrossings`, `edgeThroughNode`, `nodeOverlaps`.
3. Add the key to `BASELINE_CROSSINGS` with the measured `edgeCrossings`.
4. Keep asserting `nodeOverlaps: []` and `edgeThroughNode: []` via the existing `it.each(VERIFICATION_DIAGRAMS)` — **except** if case C still has edge-through-node under flat: then either (a) do not put it in `VERIFICATION_DIAGRAMS` (use a separate describe that allows/documents the through-node), or (b) only add it after confirming the router cleared it. Prefer honesty over forcing a green lie.

Example minimal skeleton for case B (adjust IDs/layout until it reproduces the conflict or proves absence):

```typescript
  boundarySharedAvoidance: `
pool "P"
  lane "A"
    task "Host1" as h1
    boundary timer interrupting "T1" as b1 on h1
    task "Host2" as h2
    boundary error interrupting "E1" as b2 on h2
    task "Obstacle" as o1
    task "Target1" as t1
    task "Target2" as t2
  lane "B"
    task "Pad" as p1

h1 -> h2
h2 -> o1
b1 -> t1
b2 -> t2
`.trim(),
```

Refine until the diagram actually stresses shared y-avoidance (or document that the router makes the conflict unreachable and baseline `edgeCrossings: 0`).

- [ ] **Step 4: Re-run crossing-regression**

```bash
npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts
```

Expected: PASS for all diagrams in the map, including any new keys.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/test/crossing-regression.test.ts \
  packages/layout-core/test-utils/verificationDiagrams.ts
git commit -m "$(cat <<'EOF'
test: re-baseline crossings and pin unified-router gap fixtures

EOF
)"
```

Only stage files you actually changed.

---

### Task 9: Update `docs/STATUS.md` and run full `npm test`

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Rewrite Known limitations from evidence**

Re-read current `docs/STATUS.md` and the Task 8 fixture measurements. Then:

1. In **What's built → Layout**, add that boundary-event and cross-lane middle paths go through `@bpm/layout-core`'s `routeOrthogonal` / `createSequentialRouter` (anchors + channel-gap sizing unchanged).
2. In **Known limitations**, do **not** delete residual-crossing bullets unless Task 8 fixtures show those cases are clean:
   - If A/B still produce crossings or through-node: keep them, note they remain after the shared-router migration (and point at the new fixture names).
   - If A/B are clean: remove those two gap bullets; say the shared router closed them by construction.
   - Case C (`layout: flat`): keep or remove based on Task 8 measurement only.
3. Keep unrelated limitations (per-lane uniform height, BPMN legality, no XML import, no CLI, icons, no manual override).
4. Update **Verified state**: branch `explore/unified-edge-router`, full suite count from Step 2, not yet merged to `main`.
5. Update `_Last updated:` to the resume date.
6. Add plan/spec links under **Where to look**.

Do not paste the optimistic parent-plan STATUS snippet verbatim if evidence contradicts it.

- [ ] **Step 2: Full workspace suite**

```bash
npm test
```

Expected: 0 failures. Record the new total (was 189/189 at Task 7; may rise if fixtures added tests).

Optional visual smoke: open `apps/web` on `orderToCashStacked` / a simple two-lane diagram and confirm cross-lane edges still look sane (more direct paths are expected).

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "$(cat <<'EOF'
docs: update STATUS for unified edge router migration

EOF
)"
```

- [ ] **Step 4: Update SDD ledger**

Append to `.superpowers/sdd/2026-08-09-unified-edge-router/progress.md`:

```markdown
Task 8: complete (…commits…, review …)
Task 9: complete (…commits…, review …)
```

---

### Task 10: Whole-branch review (merge gate)

**Files:** none required (review only); fix commits only if Critical/Important findings.

**Scope:** Entire branch vs merge-base with `main` (`9b3495e` at pause time — re-resolve with `git merge-base HEAD main`).

- [ ] **Step 1: Capture SHAs**

```bash
BASE_SHA=$(git merge-base HEAD main)
HEAD_SHA=$(git rev-parse HEAD)
echo "$BASE_SHA..$HEAD_SHA"
```

- [ ] **Step 2: Dispatch whole-branch code review**

Use `superpowers:requesting-code-review` / code-reviewer subagent with:

- **DESCRIPTION:** Unified obstacle-avoiding edge router — geometry, visibility graph, Dijkstra, public API, barrel export, boundaryEvents + laneBanding integration, crossing re-baseline, STATUS.
- **PLAN_OR_REQUIREMENTS:** `docs/superpowers/plans/2026-08-09-unified-edge-router.md` + this resume plan; design `docs/superpowers/specs/2026-08-09-unified-edge-router-design.md`.
- **BASE_SHA / HEAD_SHA:** from Step 1.
- Ask reviewer to also glance at the 5 deferred minors in the ledger (cosmetics/coverage — not required to fix unless they disagree that they're non-blocking).

- [ ] **Step 3: Act on findings**

- Critical / Important → fix, commit, re-review that delta.
- Minor → append to ledger or fix if trivial (e.g. rename describe blocks).

- [ ] **Step 4: Pause for human integration choice**

Only after review is clean (or minors explicitly deferred), invoke `superpowers:finishing-a-development-branch`: verify `npm test` one last time, then present merge / PR / keep-as-is options. Do not merge or open a PR unless the human chooses.

---

## Resume checklist (first actions when unpausing)

1. `git status` / `git log -1` — confirm still clean @ expected HEAD (or note drift).
2. Read this file + `progress.md`.
3. Start Task 8 Step 1 (crossing-regression confirm).
4. Do not re-open Tasks 1–7 unless review finds a regression.

---

## Self-Review Notes

- **Spec coverage:** Task 8 covers design testing (re-baseline + pin STATUS cases). Task 9 covers STATUS accuracy. Task 10 is the missing merge gate called out at pause.
- **Optimism corrected:** Plan no longer assumes baselines drop or that STATUS gaps are auto-closed; evidence gates the docs.
- **Scope:** Still no ELK/Dagre/Graphviz routing changes; no lane-height refactor.
- **Parent plan:** Tasks 1–7 remain the historical source of implementation detail; this file owns the remaining path.
