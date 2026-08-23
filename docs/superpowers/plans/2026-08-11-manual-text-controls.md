# Manual Text Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A manual `.bpm` controls (via waypoints, size hints, node/edge label placement, spacing presets) with tests, examples, and LANGUAGE updates — no AI.

**Architecture:** Extend `@bpm/ast` + parser attribute/suffix grammar; teach layout engines to honor waypoints/size/spacing; teach render to honor label visuals; extend `@bpm/validate` with new warnings. Default behavior unchanged when new syntax is absent.

**Tech Stack:** TypeScript, Vitest, existing monorepo packages (`ast`, `parser`, `layout*`, `render`, `validate`, `cli`).

**Spec:** `docs/superpowers/specs/2026-08-11-manual-text-controls-design.md`

## Global Constraints

- No `@bpm/review`, no API keys, no AI calls.
- Coordinate space for `via` and sizes matches existing `at (x, y)` rules (canvas / lane / subprocess).
- Non-orthogonal `via` segments → validate **warning**, not parse error.
- XML DI export of waypoints/labels is **out of scope** for this plan (SVG + validate only).
- Preserve default layout metrics when `layoutSpacing` is unset (A5 regression).
- Follow existing ID alphabet and size limits from open-source readiness.

## File map

| Path | Role |
|---|---|
| `packages/ast/src/types.ts` | AST fields |
| `packages/parser/src/parser.ts`, `tokens.ts` | Grammar |
| `packages/layout-core/src/routing/*`, `anchors.ts` | Via path assembly |
| `packages/layout/src/index.ts` + engines | Size + spacing + via |
| `packages/render/src/*` | Label placement |
| `packages/validate/src/index.ts` + geometry helpers | New warnings |
| `examples/manual-controls/*.bpm` | Fixtures |
| `docs/LANGUAGE.md`, `STATUS.md`, `ROADMAP.md` | Docs |

**Branch:** `feature/manual-text-controls` (worktree recommended).

---

### Task 1: AST — waypoints, sizeHint, visual, labelPlacement, layoutSpacing

**Files:**
- Modify: `packages/ast/src/types.ts`
- Modify: `packages/ast/test/types.test.ts` (smoke compile / type presence)

- [ ] **Step 1: Add fields** exactly as in the design spec §6 (`waypoints`, `labelPlacement`, `sizeHint`, `visual`, `layoutSpacing`).

- [ ] **Step 2: Build ast package**

```bash
npm run build -w @bpm/ast
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/ast
git commit -m "$(cat <<'EOF'
feat(ast): add manual text-control fields for via, size, labels, spacing

EOF
)"
```

---

### Task 2: A1 — Parse `via: (x,y)…` in edge attribute blocks

**Files:**
- Modify: `packages/parser/src/parser.ts` (`parseEdgeAttrs`)
- Create/Modify: `packages/parser/test/edge-via.test.ts`

- [ ] **Step 1: Write failing tests**

Accept:

```bpm
task "A" as a
task "B" as b
a -> b [via: (10,20) (30,20)]
```

Assert `diagram.edges[0].waypoints` deep-equals `[{x:10,y:20},{x:30,y:20}]`.

Reject malformed `via:` (missing paren, odd token) with parse error mentioning `via`.

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run packages/parser/test/edge-via.test.ts
```

- [ ] **Step 3: Implement** — extend `parseEdgeAttrs` to parse `via` as a list of `(number,number)` pairs (comma-separated points after `via:`). Keep existing keys.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/parser
git commit -m "$(cat <<'EOF'
feat(parser): parse edge via waypoints

EOF
)"
```

---

### Task 3: A1 — Layout honors explicit waypoints

**Files:**
- Modify: `packages/layout-core/src/routing/router.ts` (or call site that builds `RoutedEdge.points`)
- Modify: engine integration that calls the sequential router
- Test: `packages/layout-core/test/routing/via.test.ts` and/or layout facade test

**Interfaces:**
- When `edge.waypoints?.length`, path = exit anchor → waypoints → entry anchor (existing `from`/`to` anchors).

- [ ] **Step 1: Failing test** — diagram with two nodes and `via` midpoints; assert routed `points` include those coordinates in order (allow stub endpoints to differ).

- [ ] **Step 2: Implement bypass** of Dijkstra when waypoints present.

- [ ] **Step 3: Run layout-core + layout tests**

```bash
npx vitest run packages/layout-core packages/layout
```

- [ ] **Step 4: Commit**

```bash
git add packages/layout-core packages/layout packages/layout-engine-*
git commit -m "$(cat <<'EOF'
feat(layout): route edges along explicit via waypoints

EOF
)"
```

---

### Task 4: A1 — Validate warnings for via geometry

**Files:**
- Modify: `packages/validate/src/index.ts` and/or `packages/layout-core` analyze helpers
- Test: `packages/validate/test/via-warnings.test.ts`

- [ ] **Step 1: Failing tests**
  - Diagonal via → warning matching `/orthogonal|diagonal|axis/i`
  - Via segment through unrelated node → warning (reuse through-node wording if possible)

- [ ] **Step 2: Implement warnings** (`valid` stays true if layout succeeded).

- [ ] **Step 3: Commit**

```bash
git add packages/validate packages/layout-core
git commit -m "$(cat <<'EOF'
feat(validate): warn on diagonal or through-node via segments

EOF
)"
```

---

### Task 5: A1 — Example + LANGUAGE snippet

**Files:**
- Create: `examples/manual-controls/01-via-waypoints.bpm`
- Modify: `docs/LANGUAGE.md` §5.3

- [ ] **Step 1: Add example** using `positioning: manual` + `via` (coordinates lane-safe).

- [ ] **Step 2: Document `via` in LANGUAGE.

- [ ] **Step 3: Verify**

```bash
npm run bpm -- validate examples/manual-controls/01-via-waypoints.bpm
npm run bpm -- render examples/manual-controls/01-via-waypoints.bpm -o /tmp/via.svg
```

- [ ] **Step 4: Commit**

```bash
git add examples/manual-controls docs/LANGUAGE.md
git commit -m "$(cat <<'EOF'
docs: document edge via waypoints and add example

EOF
)"
```

---

### Task 6: A2 — Parse `size (w, h)` node suffix

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/node-size.test.ts`

- [ ] **Step 1: Failing tests** for `task "A" as a size (120, 60)` and `… at (1,2) size (120, 60)`; reject non-positive sizes.

- [ ] **Step 2: Implement** suffix parse after optional `at`, before optional node `[…]` block (node attr block may land in Task 8 — for now only `size`).

- [ ] **Step 3: Commit** `feat(parser): parse node size (w, h) hints`

---

### Task 7: A2 — Layout applies sizeHint + validate size warnings

**Files:**
- Modify: manual engine + flat/swimlane sizing paths (shared helper preferred under `layout-core`)
- Test: layout + validate

**Kind minimums (initial table — put in helper + LANGUAGE):**

| Kind | Min w×h |
|---|---|
| task / callActivity | 80×40 |
| gateway | 40×40 |
| event | 30×30 (circle diameter) |
| dataObject / annotation | 60×30 |

- [ ] **Step 1: Failing tests** — manual node with `size (200, 80)` gets that bbox; undersized hint clamped + validate warning `nodeSizeBelowMinimum` when author hint below min before clamp **or** document clamp-silent + separate clipping warning — **prefer:** clamp for layout, warn when raw hint &lt; minimum.

- [ ] **Step 2: Implement**

- [ ] **Step 3: Example** `examples/manual-controls/02-node-size.bpm`

- [ ] **Step 4: Commit** `feat(layout): apply node size hints with per-kind minimums`

---

### Task 8: A3 — Parse node visual `[label/wrap/font/align]`

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/node-visual.test.ts`

- [ ] **Step 1: Failing tests** for combined `size` + `[label: below, wrap: 2, font: small, align: left]`

- [ ] **Step 2: Implement** node `[…]` parser (mirror edge attr style; unknown key → error).

- [ ] **Step 3: Commit** `feat(parser): parse node label visual attributes`

---

### Task 9: A3 — Render node labels from `visual` + validate clipping/overlap

**Files:**
- Modify: `packages/render/src/shapes.ts`, `text.ts`
- Modify: validate / analyzeLayout label AABB helper (new file under layout-core or render test-utils — prefer `layout-core` if used by validate)

- [ ] **Step 1: Failing render tests** — `label: above` places text above box; `wrap: 2` caps tspans.

- [ ] **Step 2: Implement render defaults** when `visual` absent = today’s behavior.

- [ ] **Step 3: Validate warnings** `labelClippingLikely`, label overlap (approximate).

- [ ] **Step 4: Example** `03-node-labels.bpm` + LANGUAGE

- [ ] **Step 5: Commit** `feat(render): honor node label placement and wrap hints`

---

### Task 10: A4 — Edge `labelAt` / `labelSide` / `labelOffset`

**Files:**
- Modify: parser edge attrs; `packages/render/src/edges.ts`; validate

- [ ] **Step 1: Parser tests** for the three keys.

- [ ] **Step 2: Render tests** — label near 0.25 along path; side offset.

- [ ] **Step 3: Validate** `edgeLabelOverlapsNode` warning fixture.

- [ ] **Step 4: Example** `04-edge-labels.bpm` + LANGUAGE

- [ ] **Step 5: Commit** `feat: edge label placement controls`

---

### Task 11: A5 — `layoutSpacing` directive + engine profiles

**Files:**
- Modify: parser directives; `Diagram.layoutSpacing`; layout-elk-base / swimlane / manual padding constants
- Test: facade + **regression** on existing verification diagrams without the directive

- [ ] **Step 1: Define numeric profiles** (`compact` / `normal` / `relaxed` / `spacious`) in one module `packages/layout-core/src/spacing.ts`.

- [ ] **Step 2: Wire engines** to read profile; `normal` === current constants.

- [ ] **Step 3: Regression** — `crossing-regression` / facade tests still match STATUS residuals for default diagrams.

- [ ] **Step 4: Example** `05-spacing-relaxed.bpm`

- [ ] **Step 5: Commit** `feat(layout): add layoutSpacing presets`

---

### Task 12: A6 — Docs polish + ROADMAP/STATUS/CLI

**Files:**
- Modify: `docs/LANGUAGE.md`, `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/CLI.md`
- Modify: `examples/manual-controls/README.md`

- [ ] **Step 1: Write examples README** listing 01–05.

- [ ] **Step 2: Mark Phase A items on ROADMAP** as Done (or In progress → Done).

- [ ] **Step 3: STATUS** — note new controls + honest limits (no XML DI for vias yet).

- [ ] **Step 4: Full verify**

```bash
npm test
npm run bpm -- validate examples/manual-controls/01-via-waypoints.bpm
```

- [ ] **Step 5: Commit** `docs: complete manual text-controls language and status`

---

## Spec coverage

| Spec slice | Tasks |
|---|---|
| A1 via | 2–5 |
| A2 size | 6–7 |
| A3 node labels | 8–9 |
| A4 edge labels | 10 |
| A5 spacing | 11 |
| A6 docs | 5, 9–12 |

## Execution

Use branch `feature/manual-text-controls`. Complete Tasks 1→12 in order. Do not start Phase B on this branch.
