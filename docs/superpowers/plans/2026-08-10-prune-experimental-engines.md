# Prune experimental comparison engines — execution plan

_2026-08-10. Written for autonomous execution (e.g. via Cursor) with no
per-step approval. Review the result against the checklist at the bottom
afterward._

## Why

`docs/superpowers/specs/2026-08-09-dagre-graphviz-engines-design.md` and
`2026-08-09-elk-native-layout-comparison-design.md` both scope `elk-native`,
`dagre`, and `graphviz` as **opt-in-only, flat comparison engines** —
explicitly "not claiming either is better than the production engines —
comparison only" and "not merging to `main`."

They merged anyway (`explore/elk-native-layout` and the dagre/graphviz work
are both ancestors of `main` today). The result:

- 3 full packages (`packages/layout-engine-dagre`, `packages/layout-engine-elk-native`,
  `packages/layout-engine-graphviz`) — own `package.json`, `tsconfig.json`,
  `dist/`, test suites — registered as defaults in `packages/layout/src/index.ts`.
- A user-facing toggle in `apps/web/index.html` (lines 193–195) exposing them
  in the shipped editor, despite `docs/STATUS.md` documenting only `swimlane`
  and `flat` as the product's supported engines.

None of this is load-bearing: `selectEngine` (`packages/layout-core/src/engine.ts`)
only auto-picks `swimlane` or `flat`; the other three are reachable only via
explicit `layout: <name>` directive or the UI dropdown — a research spike
left wired into the product surface.

## Scope

**In scope**: remove `dagre`, `elk-native`, and `graphviz` engines and every
reference to them. Nothing else.

**Out of scope — do not touch:**
- `packages/layout-elk-base` — confirmed used by `swimlane` and `flat` via
  `runElkLayout`; stays as-is.
- `packages/layout-core`, the unified edge router (`routing/`), `laneBanding.ts`,
  `channelRouting.ts` — production code, not part of this prune.
- Any doc content unrelated to the three engines (STATUS.md's "known
  limitations" section, ROADMAP.md items, the unified-edge-router specs/plans).
- `explore/unified-edge-router` branch or its content — active, unmerged WIP,
  unrelated to this cleanup.

If you find yourself editing a file not listed below, stop and re-check
whether it's actually a dagre/graphviz/elk-native reference — don't drift
into unrelated cleanup in this pass.

## Steps

### 1. Delete the three packages entirely
```
rm -rf packages/layout-engine-dagre
rm -rf packages/layout-engine-elk-native
rm -rf packages/layout-engine-graphviz
```

### 2. Deregister them in the layout facade
Edit `packages/layout/src/index.ts`:
- Remove the three imports (`elkNativeEngine`, `dagreEngine`, `graphvizEngine`).
- Remove their `registerEngine(...)` calls inside `ensureDefaultEngines()`.
- Keep `swimlaneEngine` and `flatEngine` registration as-is.

### 3. Drop the workspace dependency
Edit `packages/layout/package.json`: remove the three `@bpm/layout-engine-*`
entries for dagre/elk-native/graphviz from `dependencies` (keep swimlane and
flat).

### 4. Remove the UI toggle options
Edit `apps/web/index.html`: delete the three `<option>` lines (currently
193–195: `elk-native`, `dagre`, `graphviz`). Check `apps/web/src/*.ts`
(`pipeline.ts`, `diagramMode.ts`, `main.ts`) for any code branching on those
option values (e.g. select-handler logic) and remove the now-dead branches —
grep for `'dagre'`, `'graphviz'`, `'elk-native'` across `apps/web/src` to be
sure nothing references them by string after the dropdown options are gone.

### 5. Archive (don't delete) the spec/plan docs for the removed engines
These docs are historical record of a real design decision (why the spike
was tried, why it didn't become the production approach) — keep them, but
move them out of the active specs/plans directories so they don't read as
current:
```
mkdir -p docs/superpowers/archive
git mv docs/superpowers/specs/2026-08-09-dagre-graphviz-engines-design.md docs/superpowers/archive/
git mv docs/superpowers/specs/2026-08-09-elk-native-layout-comparison-design.md docs/superpowers/archive/
git mv docs/superpowers/plans/2026-08-09-dagre-graphviz-engines.md docs/superpowers/archive/
git mv docs/superpowers/plans/2026-08-09-elk-native-layout-comparison.md docs/superpowers/archive/
```
Add a one-line note at the top of each moved file: `> Archived 2026-08-10 —
engine removed from main; see docs/superpowers/plans/2026-08-10-prune-experimental-engines.md.`

### 6. Update STATUS.md / ROADMAP.md if they mention the toggle
Grep both files for `dagre|graphviz|elk-native`. As of this writing they
don't reference the three engines directly, so this step may be a no-op —
confirm rather than assume.

### 7. Reinstall and rebuild
```
npm install
npm run build --workspaces --if-present
```
This updates `package-lock.json` automatically (do not hand-edit it) and
regenerates `dist/` for the remaining packages.

### 8. Verify nothing else references the removed packages
```
grep -rln "layout-engine-dagre\|layout-engine-graphviz\|layout-engine-elk-native" \
  --include="*.json" --include="*.ts" --include="*.html" --include="*.md" . \
  | grep -v node_modules | grep -v /dist/ | grep -v docs/superpowers/archive
```
Expect zero output (aside from this plan file itself and the archived docs,
which are allowed to mention them historically).

### 9. Run the full test suite
```
npm test
```
Expect all tests to pass (204/204 minus whatever share of that count belonged
to the three removed packages — a lower total is correct, a *failure* is not).

### 10. Minor housekeeping (optional, low-risk — do only if the above is clean)
- Delete the stale local branch `feat/bpm-core-pipeline-m1` — it's already
  merged into `main` (`git merge-base --is-ancestor feat/bpm-core-pipeline-m1 main`
  returns true), so it's pure clutter: `git branch -d feat/bpm-core-pipeline-m1`.
- Delete the stale local branch `explore/elk-native-layout` — also already
  merged into `main`: `git branch -d explore/elk-native-layout`.
- Do **not** touch `explore/unified-edge-router` — unmerged active work.
- `.worktrees/` at repo root is empty — leave it; not worth a step of its own.

## Commit

One commit for the code/package removal, one for the doc archive move, so
the diff reviews cleanly:
```
git add packages/layout packages/layout-engine-dagre packages/layout-engine-elk-native \
  packages/layout-engine-graphviz apps/web/index.html apps/web/src package-lock.json
git commit -m "remove experimental dagre/elk-native/graphviz comparison engines

These were explicitly scoped as opt-in-only research spikes (see the
archived design specs) and never intended to merge to main, but ended up
registered as defaults in the layout facade and exposed in the editor's
engine toggle. Only swimlane and flat are the product's supported engines
per docs/STATUS.md."

git add docs/superpowers/archive docs/superpowers/specs docs/superpowers/plans
git commit -m "archive dagre/elk-native comparison-engine design docs"
```

## Review checklist (for me, after Cursor runs this)

- [ ] `packages/layout-engine-dagre`, `-elk-native`, `-graphviz` no longer exist.
- [ ] `packages/layout/src/index.ts` only imports/registers `swimlaneEngine` and `flatEngine`.
- [ ] `apps/web/index.html` toggle only offers the engines actually supported.
- [ ] `npm test` passes, `npm run build --workspaces --if-present` succeeds.
- [ ] Grep in step 8 returns nothing outside the archive.
- [ ] Two clean, separately-reviewable commits (or one, if Cursor squashed —
      check the diff either way).
- [ ] Nothing outside this scope was touched — diff the full commit range
      against `main` before this work started and confirm every changed file
      is one listed above.
