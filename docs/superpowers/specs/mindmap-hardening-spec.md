# Mindmap adapter hardening spec

_Reviews the implementation of `@bpm/diagram-mindmap` on `integration/mindmap-adapter`
(commit `37c0fc6`) against its design handoff,
`docs/superpowers/specs/2026-08-18-mindmap-diagram-family-design.md` (present on
`design/mindmap-adapter-spec`, not yet merged to this branch). This is a review artifact
only — no production files were edited to produce it. All findings below were reproduced
against the built package (`packages/diagram-mindmap/dist`) with throwaway scripts in the
session scratchpad; none of those scripts are part of the deliverable._

## Summary

The parser, safety limits, and error-diagnostics layer match the design closely and are
solid: every documented error code fires at the right line with the right boundary
semantics (verified `MAX_DEPTH=50`, `MAX_NODES=500`, `MAX_SOURCE_CHARS=100_000` all trigger
exactly where the design's fixture descriptions say they should, including the
incremental-rejection behavior for pathological deep/wide input). SVG escaping is correctly
applied to every rendered label via `@bpm/render-core`'s `escapeXml`, and the CLI/web
integration (generic `executeDiagramSource` pipeline, BPMN-only command guards,
`editorMode: 'none'` disabling export/edit UI) all behave correctly end-to-end.

The layout/render pair, however, has a real geometry-contract bug: the box-sizing pass and
the text-rendering pass independently re-wrap the same label with **different** width and
line-height constants, and internal-node subtree sizing ignores the node's own box height.
Together these produce reproducible node overlap and label overflow — not edge-case-only,
but triggerable by any everyday multi-word label once it wraps past one line. This is the
one category of confirmed defect below; everything else is either a coverage gap or a
documented non-goal.

## 1. Confirmed issues

### Issue A — Internal-node box height is excluded from subtree reservation → sibling overlap

`layout.ts`'s `size()` computes `subtreeHeight` for a branching node as the **sum of its
children's `subtreeHeight`** only — it never compares that sum against the node's own
`height`. When a node has a multi-line wrapped label (any label that wraps to 2–3 lines)
and its child subtree reserves less vertical space than the node's own box needs, the node
is centered inside a band too small for it and spills into the neighboring sibling's band.

Reproduced: four siblings, each an internal node with one small leaf child and a label long
enough to wrap to 3 lines (`height=60`, reserved band from its one child = `56`), lay out
with **every consecutive pair overlapping by 4px** (`p0` bottom `58` vs `p1` top `54`, `p1`
bottom `114` vs `p2` top `110`, etc.). This is not a rare adversarial shape — any parent
label that wraps to more lines than its child subtree "needs" triggers it.

A correct two-pass tree layout reserves `max(ownHeight + ROW_GAP, sum(children subtreeHeight))`
per node; the current code only ever computes the second term for non-leaf nodes.

### Issue B — Sizing pass and render pass re-wrap the same label at different widths/line-heights → text overflows its box

`layout.ts`'s `size()` sizes the box using
`wrapLabel(node.label, MAX_LABEL_WIDTH /* 200 */, FONT_SIZE)` and derives `height` from that
line count using `LINE_HEIGHT = 16`. `render.ts` then **re-wraps the same label from
scratch** via `wrappedTextCentered(..., node.width - 16, node.label, 13)` — a narrower width
(up to `184px` once a box is capped at `MAX_LABEL_WIDTH`) — and `wrappedTextCentered`
internally uses `lineHeight = fontSize * 1.25 = 16.25`, not `layout.ts`'s `LINE_HEIGHT = 16`.
Two independent inconsistencies (wrap width, line height) between the pass that decides box
height and the pass that actually draws text into it.

Reproduced end-to-end: label `"ddegac fiffj eheebd cbgfei gidf gaeibeda acfg dcaj h"` wraps
to **2 lines at 200px** (the width `size()` uses → box height `44`) but **3 lines at 184px**
(the width `render()` actually wraps at) — the SVG ships a 3-line `<text>` block inside a
box sized for 2. In a randomized search over short synthetic labels, this width/line-count
mismatch appeared in roughly 1-in-4000 trials for the general "does line count differ"
case, and reliably whenever a label sits near a wrap boundary at ~184–200px — common for
any label in the 20–40 character range with average English word lengths, i.e. ordinary
mind-map content, not contrived input.

### Issue C — Layout's declared canvas bounds are not a guaranteed bounding box of the geometry it produces

Because `PositionedMindmap.width`/`.height` are computed purely from `maxDepth` and root
`subtreeHeight` (never from the actual min/max x/y of placed nodes), a node whose own height
exceeds its reserved band — the same condition as Issue A — can be positioned with a
**negative `y`**. Reproduced: a root with a 3-line label and one small child lays out with
`root.y = -2`. `render.ts`'s fixed `MARGIN = 20` happens to absorb this today (an overflow
smaller than 20px stays inside the `viewBox`), but nothing in the contract guarantees the
overflow stays under 20px — it is bounded only by how large `size()`'s height/subtree
mismatch (Issue A) can get, which is a function of label content, not a fixed constant. This
is a latent version of Issue A/B, not a new root cause, and will start clipping visibly the
moment a future change (bigger `MAX_LABEL_WIDTH`, more `maxLines`, smaller `MARGIN`) makes
the mismatch exceed 20px.

### Issue D — `@bpm/diagram-core` is a declared dependency but is never imported anywhere

`package.json` lists `@bpm/diagram-core` as a dependency (matching the design), but no file
in `src/` or `test/` imports anything from it — including `overlap.ts`'s
`assertNoOverlaps`/`describeOverlap`, which exist specifically to catch exactly the class of
bug in Issue A. The design's own rationale for choosing left-right layout over radial was
explicitly "axis-aligned reuse" of these primitives; the implementation never reused them,
and a test built on `assertNoOverlaps` would have caught Issue A immediately.

### Issue E — `@bpm/diagram-runtime` is a declared dependency that is never imported, and it inverts the design's dependency direction

`packages/diagram-mindmap/package.json` lists `"@bpm/diagram-runtime": "*"`, but nothing in
`src/` imports from it — `types.ts` explicitly re-declares `DiagramDiagnostic`,
`FamilyParseResult`, and `DiagramFamilyAdapter` as local structural copies specifically
*to avoid* that import ("Structural copies of the runtime contract keep this leaf package's
declarations cycle-free"). The dependency in `package.json` is dead weight left over from
the design's original plan (a type-only import of `@bpm/diagram-runtime`) that the
implementation correctly avoided in code but forgot to remove from the manifest. Because
`packages/diagram-runtime/package.json` also depends on `@bpm/diagram-mindmap` (to register
the adapter), this declares an actual **circular workspace dependency**
(`diagram-runtime → diagram-mindmap → diagram-runtime`) that directly contradicts the
design's explicit one-directional dependency diagram. It does not break today's build
(`npm run build --workspaces` here isn't topologically ordered), but it is a real hazard for
any future switch to a dependency-graph-aware build tool, and it fails a literal reading of
the design's own "definition of done" self-check ("checkable by grepping the package's own
`package.json` dependencies").

### Issue F — Duplicate-id detection has a gap for ids skipped due to the depth limit

In `parser.ts`, a node whose `depth > MAX_DEPTH` is `continue`d *before* `ids.set(id, ...)`
runs, so an id used only on a depth-limit-skipped line is never registered. A later,
in-range node reusing that same id would not be flagged `duplicate_id`. Low impact — the
diagram is already blocked by `max_depth_exceeded` regardless — but it means the
`duplicate_id` diagnostic is not fully reliable once `max_depth_exceeded` has fired, which
could surprise a future consumer that tries to report *all* semantic errors, not just the
first blocking one.

### Non-issue, but worth documenting: CJK / wide-glyph label sizing

`@bpm/render-core`'s `wrapLabel` estimates character width with a single constant
(`CHAR_WIDTH_FACTOR = 0.58`) tuned for average Latin-glyph proportional width. A CJK-heavy
or full-width-glyph label will be significantly under-measured by this estimate and will
visually overflow its box in an actual font-rendering SVG viewer, independent of Issues A–C.
This is **inherited, shared behavior in `@bpm/render-core`**, already exercised by the BPMN
family today — it is not a mindmap-specific defect and fixing it is out of scope for
`@bpm/diagram-mindmap` (fixing it in `render-core` would also change BPMN label rendering,
which this review was not asked to touch). Flagged here only so it isn't mistaken for a gap
in this review's coverage.

## 2. Severity

| Issue | Severity | Rationale |
|---|---|---|
| A — sibling overlap | **High** | Visibly broken output (overlapping boxes) on ordinary multi-line-label input; violates the design's implicit no-overlap contract; user-facing on first realistic use. |
| B — label/box height mismatch | **High** | Text rendered outside its box on ordinary input; same root class as A, independently reproducible even where A doesn't fire. |
| C — canvas bounds not a true bounding box | **Medium** | Not yet visibly broken (current constants keep it under the 20px margin) but is an unbounded latent version of A/B with no guardrail; will regress silently if any nearby constant changes. |
| D — unused `@bpm/diagram-core` dependency | **Medium** | Not a runtime bug, but a direct, avoidable process failure: the exact tool that would have caught Issue A pre-merge was available and unused. |
| E — unused/circular `@bpm/diagram-runtime` dependency | **Low** | No runtime failure today; a design-contract violation and a latent build-tooling hazard. |
| F — duplicate-id gap under depth-limit skip | **Low** | Only reachable on already-invalid (over-depth) input; diagnostic completeness issue, not a correctness issue for valid diagrams. |
| CJK/wide-glyph sizing (non-issue for this package) | **Info** | Real limitation, but inherited/shared and out of scope for `diagram-mindmap` itself. |

## 3. Exact files to change

- `packages/diagram-mindmap/src/layout.ts`
  - Fix Issue A: change `subtreeHeight` for branching nodes to
    `Math.max(height + ROW_GAP, children.reduce((sum, c) => sum + c.subtreeHeight, 0))` in
    `size()`.
  - Fix Issue B (layout half): stop re-deriving box height from a wrap pass that uses a
    different width than what `render.ts` will actually wrap at. Either (a) size using
    `MAX_LABEL_WIDTH - PADDING_X` to match what `render.ts` passes as `node.width - 16`
    once width is capped, or (b) have `render.ts` render using the **same** wrapped lines
    `size()` already computed instead of re-wrapping (see below) — (b) is preferred since it
    removes the duplicate-computation root cause entirely rather than re-aligning two
    constants that can drift again later.
  - Fix Issue B (line-height half): use one shared line-height constant between the sizing
    pass and whatever renders text, instead of `layout.ts`'s own `LINE_HEIGHT = 16` diverging
    from `render-core`'s internal `fontSize * 1.25`.
- `packages/diagram-mindmap/src/render.ts`
  - If adopting fix (b) above: accept precomputed wrapped lines per node (threaded through
    `PositionedMindmapNode` from `layout.ts`, e.g. `label: string[]` already wrapped, or a
    new field) instead of calling `wrappedTextCentered` with a recomputed width — removes
    the second independent wrap call entirely.
- `packages/diagram-mindmap/src/parser.ts`
  - Fix Issue F: move `ids.set(id, lineNumber)` earlier, before the `MAX_DEPTH`/`MAX_NODES`
    `continue` branches (registering the id even for a node that will otherwise be dropped),
    or explicitly document why over-limit ids are intentionally exempt from duplicate
    detection if that's judged not worth fixing.
- `packages/diagram-mindmap/package.json`
  - Fix Issue E: remove the unused `"@bpm/diagram-runtime": "*"` dependency entry.
- `packages/diagram-mindmap/test/layout.test.ts`, new `test/overlap.test.ts` (or extend
  `layout.test.ts`)
  - Add the regression tests in §4, including one built on `@bpm/diagram-core`'s
    `assertNoOverlaps` (Issue D — this is also the fix for D: actually use the declared
    dependency).
- `packages/diagram-mindmap/test/render.test.ts`
  - Add the label/box-height regression test in §4.
- `packages/diagram-mindmap/test/fixtures/` (new directory)
  - Add fixture files per §4 — currently does not exist; all current tests use inline
    source strings.

No other package needs to change. This stays entirely inside `@bpm/diagram-mindmap`; none
of the fixes above require touching `@bpm/render-core`, `@bpm/diagram-core`,
`@bpm/diagram-runtime`, the CLI, or the web app.

## 4. Required tests and fixtures

### New/missing fixtures (`packages/diagram-mindmap/test/fixtures/`, `.bpm` extension, matching the design's originally planned set — none of these currently exist on disk)

| Fixture | Purpose | Status |
|---|---|---|
| `single-root.bpm` | Smallest valid diagram | missing (covered inline only) |
| `three-levels.bpm` | Column/row assignment, edge count | missing (covered inline only) |
| `omitted-labels.bpm` | Label-resolution + `hasExplicitLabel` | missing (covered inline only) |
| `max-depth-exceeded.bpm` | 51-level chain → `max_depth_exceeded` at line 52 | missing (covered inline only) |
| `max-nodes-exceeded.bpm` | 501 siblings → `max_nodes_exceeded` | missing (covered inline only) |
| `multiple-roots.bpm` | Second root → `multiple_roots` with back-reference | missing (covered inline only) |
| `bad-indent.bpm` | 3-space child → `bad_indent_step` | missing (covered inline only) |
| `indent-skips-level.bpm` | Indent jumps 4 from a fresh root → `indent_skips_level` | missing (covered inline only) |
| `tabs.bpm` | Tab-indented child → `bad_indent_step` names the tab | missing (covered inline only) |
| `duplicate-id.bpm` | Reused id at two depths → `duplicate_id` with both lines | missing (covered inline only) |
| `invalid-id.bpm` | Id starting with a digit → `invalid_id` | missing (covered inline only) |
| `unparseable-line.bpm` | Missing `as <id>` clause → `unparseable_line` | missing (covered inline only) |
| `unicode-labels.bpm` | Non-ASCII + `<`/`&` in labels → `escapeXml` round-trip | missing (covered inline only) |
| `orphan-indent.bpm` | **First line indented (no root yet)** → `orphan_indent` | **missing — zero test coverage of this code path anywhere today** |

Recommendation: move the existing inline-string cases into these fixture files (`.each`
tests can still drive them) both to match the design and, more importantly, to close the
`orphan_indent` gap, which is currently untested by any test in the suite.

### New regression tests (behavioral, not just fixture parity)

1. **No-overlap invariant, direct** (`layout.test.ts` or new `overlap.test.ts`): lay out a
   tree with an internal node whose label wraps to 3 lines and a single small leaf child,
   as a first child of root, followed by a sibling; assert via `@bpm/diagram-core`'s
   `assertNoOverlaps` (imported and actually used) that no two node boxes in the resulting
   `PositionedMindmap` overlap. This must fail against the current code and pass after
   fixing Issue A.
2. **No-overlap invariant, general/randomized**: generate N trees with randomized branching
   factor and randomized label lengths (seeded, so still deterministic across runs) and
   assert `assertNoOverlaps` holds for every generated tree. Catches shapes beyond the
   specific hand-built repro.
3. **Box-fits-text invariant** (`render.test.ts`): for a label that wraps to a different
   number of lines depending on wrap width near the 184px/200px boundary (use the confirmed
   repro label or an equivalent), assert the rendered `<tspan>` `y` positions all fall
   within `[rect.y, rect.y + rect.height]` (accounting for `fontSize` ascent/descent). Must
   fail against current code, pass after fixing Issue B.
4. **Canvas-bounds invariant**: for the same tall-internal-node-with-small-child shape used
   in test 1, assert every placed node's `x >= 0` and `y >= 0` (or, more precisely, that
   `PositionedMindmap.width`/`.height` are a true bounding box of every node's
   `[x, x+width] × [y, y+height]`) — the currently-passing-by-luck root `y = -2` case should
   fail this assertion pre-fix.
5. **`orphan_indent` diagnostic test** (`parser.test.ts`): source starting with an indented
   line (e.g. `'  mindmap "x" as x'` as the very first non-blank line) asserts code
   `orphan_indent` fires — currently has zero coverage.
6. **`duplicate_id` under depth-limit-skip** (`parser.test.ts`, only if Issue F is fixed):
   a chain exceeding `MAX_DEPTH` that reuses an id both inside and outside the allowed depth
   range asserts `duplicate_id` still fires for the in-range reuse.
7. **CLI: mindmap error path** (`packages/cli/test/render.cli.test.ts` /
   `validate.cli.test.ts`): a malformed mindmap fixture (e.g. bad indent) through
   `runRenderCommand`/`runValidateCommand` asserts exit code 1 and a well-formed JSON error
   payload — today only the happy path (`mindmap.bpm`) is exercised.
8. **CLI: mindmap PNG export** (`render.cli.test.ts`): render `mindmap.bpm` with
   `--format png -o <path>` and assert the file is written and is a valid PNG (e.g. starts
   with the PNG magic bytes) — today PNG is only manually verified, not tested, despite
   `capabilities.png: true`.
9. **CLI: BPMN-only commands reject mindmap** (`packages/cli/test/*.cli.test.ts` for
   `freeze`/`review`/`import-diagram`): feed `mindmap.bpm` through each BPMN-only command and
   assert `unsupported_family` is returned — `bpmnOnly.ts`'s logic is correct today but has
   no direct test using a non-BPMN fixture.
10. **Web e2e: mindmap error display** (`apps/web/test/e2e/live-render.spec.ts`): typing an
    invalid mindmap (e.g. two roots, or exceeding `MAX_DEPTH`) shows the correct diagnostic
    in `#errors` and keeps `#preview` in its `stale` state — today only the single happy-path
    mindmap test exists.

## 5. Visual acceptance criteria

- **No node box may overlap any other node box** in a rendered mindmap, for any valid input
  up to the documented limits (`MAX_NODES`, `MAX_DEPTH`) — enforced by test 1/2 in §4 using
  `@bpm/diagram-core`'s `assertNoOverlaps`.
- **All rendered label text must stay within its node's box**, i.e. every `<tspan>`'s
  effective glyph extent (accounting for `dominant-baseline="middle"` centering and font
  ascent/descent) falls inside `[rect.y, rect.y + rect.height]` — enforced by test 3.
- **The declared SVG `viewBox`/`width`/`height` must be a true bounding box** of every
  rendered node and edge — no node may be positioned at `x < 0` or `y < 0`, and no node's
  right/bottom edge may exceed `width`/`height` before the fixed `MARGIN` is added —
  enforced by test 4.
- **Root visually distinct from descendants**: `stroke-width="3"` on the root, `"1.5"`
  elsewhere — already correct, keep as a regression assertion (already covered by
  `render.test.ts`).
- **Edges drawn before boxes before labels**, whole-diagram order (not per-node) — already
  correct, keep as a regression assertion (already covered by `render.test.ts`).
- **No unescaped `<`, `>`, `&`, `"` from label content ever appears in the SVG string** —
  already correct; extend the existing test to also cover a label containing a literal
  backtick, a zero-width character, and a very long single unbroken word (already verified
  manually to hard-wrap and truncate with `...` correctly; promote to a fixture-based test).
- **Truncation marker (`...`) only appears when a label was actually truncated past
  `maxLines`**, never when it happened to end with those characters naturally — worth one
  explicit test since it isn't today.

## 6. Performance limits

Measured against the built package on this machine (informal, not a committed benchmark,
but useful as a sanity ceiling for CI performance tests if the team wants one):

| Shape | Nodes | Parse+layout+render time |
|---|---|---|
| Wide: 1 root + 499 leaf siblings (at `MAX_NODES`) | 500 | ~5ms total, SVG ~180KB |
| Deep: single chain at `MAX_DEPTH` | 51 | ~1ms total |
| Source at `MAX_SOURCE_CHARS` (100,000 chars) rejected by the size guard | — | rejected before any line scan — confirmed the guard runs first, per design |

No performance regression risk was found — both `MAX_NODES` and `MAX_DEPTH` boundaries are
enforced **incrementally during the single parse pass** (confirmed by reading `parser.ts`:
depth/node checks happen inline in the same loop that builds nodes, with `continue` before
any child-tree construction), so a pathological "10,000 nodes at depth 1" or "10,000-line
single-chain" input is rejected within the first ~50–500 lines, never building the rest of
the tree. Recursive functions (`size`, `place`, `connect` in `layout.ts`; `nodes` in
`render.ts`) are all bounded by `MAX_DEPTH = 50` stack frames, not `MAX_NODES` — no stack
overflow risk at either limit.

Recommended limits to encode as an explicit perf test (not currently present): assert
`executeDiagramSource` on a `MAX_NODES`-sized wide fixture and a `MAX_DEPTH`-sized deep
fixture each complete in under, say, 200ms — generous relative to the ~5ms/~1ms measured
above, enough headroom to catch an accidental quadratic regression (e.g., someone
reintroducing an O(n²) tree walk) without being flaky on slower CI hardware.

## 7. Definition of done

- [ ] Issue A fixed: `size()`'s `subtreeHeight` for branching nodes is
      `max(ownHeight + ROW_GAP, sum(children.subtreeHeight))`.
- [ ] Issue B fixed: layout's sizing pass and render's text-drawing pass use the same wrap
      width and the same line-height constant (ideally by rendering the lines `size()`
      already computed, rather than re-wrapping in `render.ts`).
- [ ] Issue C's underlying cause resolved as a side effect of A+B; canvas-bounds test (§4
      test 4) passes with no node at negative `x`/`y`.
- [ ] Issue D fixed: `@bpm/diagram-core`'s `assertNoOverlaps` is actually imported and used
      in at least one test (§4 tests 1–2).
- [ ] Issue E fixed: `"@bpm/diagram-runtime"` removed from
      `packages/diagram-mindmap/package.json`'s `dependencies`; `npm run build` still
      succeeds for the workspace with no circular dependency between `diagram-mindmap` and
      `diagram-runtime`.
- [ ] Issue F fixed or explicitly deferred with a one-line comment explaining why
      depth-limit-skipped ids are exempt from duplicate detection.
- [ ] All fixtures in §4's table exist under `packages/diagram-mindmap/test/fixtures/`,
      including the previously-uncovered `orphan-indent.bpm`.
- [ ] All 10 regression tests in §4 exist and pass, including the four
      (`overlap`/`box-fits-text`/`canvas-bounds`) that are expected to fail against the
      current code before the corresponding fix lands.
- [ ] `npm test --workspace=@bpm/diagram-mindmap` and `npm run build` both pass with zero
      changes to any package other than `@bpm/diagram-mindmap` and its own test/fixture
      files.
- [ ] No grammar change: `ast.ts`'s `MINDMAP_ID_PATTERN`, the node production, and the
      2-space-indent rule are untouched — every fix above is layout/render/package-metadata
      only.
- [ ] CLI and web e2e coverage from §4 (tests 7–10) added; no CLI or web application code
      needs to change to pass them — they exercise existing, already-correct wiring.
