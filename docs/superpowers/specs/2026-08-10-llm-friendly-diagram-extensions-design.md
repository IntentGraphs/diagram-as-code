# LLM-Friendly Diagram Extensions — Design

## Purpose

Four independent, additive extensions to the diagramming language and its manual-positioning mode, chosen from the roadmap survey in `docs/ROADMAP.md` items 7, 8, and 9, plus the analysis that produced this branch:

1. **Actionable manual-mode overlap errors** (roadmap #9) — an overlap error names a fix, not just the two colliding ids.
2. **Nested subprocess/transaction content in manual mode** (slice of roadmap #7b) — lift `layout-engine-manual`'s current hard rejection of expanded subprocess children.
3. **Structured validation entry point** (roadmap #8) — expose the existing parse/layout/geometry pipeline as a scriptable `validate()` API returning `{errors, warnings}`, so an LLM (or any external tool) can check its own output without a human relaying browser errors.
4. **Partial/mixed manual + auto positioning** (roadmap #7a) — let individual nodes carry `at (x, y)` inside an otherwise auto-laid-out diagram, instead of requiring the whole diagram to switch to `positioning: manual`.

Each is scoped to stand alone (buildable, testable, and shippable independently), per this project's established process. Ordered below from smallest/most certain to largest/most novel — 1 through 3 reuse patterns already proven in the codebase; 4 is the one genuinely new architectural decision this spec makes, reversing the explicit deferral in `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md`'s "Deferred" section.

## Background

`docs/LANGUAGE.md` and its manual-positioning mode (§6) are already unusually well-suited to LLM-driven generation: deterministic node sizing (§6.5), a documented pre-generation checklist (§11), and exact error-string templates a model can pattern-match against. The gap isn't the grammar — it's that generation is currently one-shot. Nothing lets a model (or a human) check its own output short of eyeballing the rendered SVG or relaying a browser error back by hand. Items 1 and 3 close that loop directly; items 2 and 4 remove two of manual mode's sharpest all-or-nothing edges, both of which push a model toward larger, more error-prone edits than the task actually requires.

## Item 1: Actionable manual-mode overlap errors

**Current state** (`packages/layout-engine-manual/src/engine.ts:28-39`):

```ts
function assertNoOverlaps(nodes: PositionedNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]; const b = nodes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) throw new Error(`Nodes "${a.id}" and "${b.id}" overlap at their given positions.`);
    }
  }
}
```

**Change**: when an overlap is found, compute the minimal axis-aligned shift that clears it and include it in the message. Given two overlapping rects `a`, `b`, the overlap on each axis is `min(a.x+a.width, b.x+b.width) - max(a.x, b.x)` (and the y-equivalent). The smaller of the two overlap amounts is the cheapest fix; report it in the direction that separates them (whichever of `a`/`b` is further right/down moves further in that direction).

```ts
function describeOverlap(a: PositionedNode, b: PositionedNode): string {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const mover = a.x <= b.x && a.y <= b.y ? b : a; // whichever sits further right/down moves
  if (overlapX <= overlapY) {
    return `shift "${mover.id}" right by ${Math.ceil(overlapX)} (or the other node left)`;
  }
  return `shift "${mover.id}" down by ${Math.ceil(overlapY)} (or the other node up)`;
}
```

New message: `Nodes "a" and "b" overlap at their given positions — shift "b" right by 14 (or the other node left).` The old message stays as a prefix so existing tests/tooling grepping for `overlap at their given positions` still match.

**Why this shape**: §6.5 already documents that sizing is fully deterministic, so the fix is always computable from data already in hand — no heuristics, no new state. This is the one item that serves both the "extend manual mode" and "help LLMs produce good output" goals at once: today's error names the problem but not the fix, breaking the otherwise-strong pattern of LANGUAGE.md documenting exact error strings for models to act on.

## Item 2: Nested subprocess/transaction content in manual mode

**Current state**: `placeNode` throws `does not yet support nested content` for any expanded (non-`collapsed`) activity with children (`engine.ts:21-23`). This is the *only* remaining structural gap between manual and auto-layout expressiveness — auto-layout already handles arbitrary subprocess nesting depth via ELK's native hierarchical children (`layout-elk-base/src/toElkGraph.ts`, `fromElkLayout.ts`'s recursive `collectOrigins`).

**Design**: mirror the lane-relative-origin pattern already built in `laneStacking.ts` — a subprocess body is structurally the same problem as a lane: a container with its own local origin, whose children's `at (x, y)` is relative to that origin, not canvas-absolute.

- A subprocess/transaction node's own `at (x, y)` remains canvas-absolute (or lane-relative, if it's inside a lane) — unchanged.
- Its children's `at (x, y)` is relative to the subprocess's own content origin: `(subprocess.x + HEADER_INSET_X, subprocess.y + HEADER_INSET_Y)`, where the inset accounts for the header band the renderer draws for an expanded subprocess (confirm the exact constant from `packages/render`'s subprocess-drawing code before hardcoding it — do not guess a number that then silently overlaps the header).
- The subprocess node's own width/height must now be **derived from its children's bounding box** (plus header inset and padding) rather than the fixed `clamp(...)` formula in §6.5 — that formula is documented as applying to `subprocess (collapsed)`, i.e. exactly the case this item does *not* touch. Compute it the same way auto-layout computes an expanded subprocess's size from its ELK-laid-out children, so the two modes stay visually consistent for the same content.
- `placeNode` becomes recursive: after placing a subprocess node, recurse into `node.children` with the new origin, producing `PositionedNode.children` (already a field `analyzeLayout`'s `flattenNodes` expects — see `packages/layout-core/test-utils/geometry.ts:37-40` — confirming this nesting shape is already a first-class concept in the geometry layer, not new).
- `node.childEdges` (edges declared inside the subprocess block, per the AST's existing `ActivityNode.childEdges` field) route the same way top-level edges do today (`routeFlatEdges`), but scoped to the subprocess's local coordinate space and its own children as obstacles — do not let a child edge treat a sibling subprocess's *interior* nodes as obstacles, only its own children, mirroring `positionBoundaryEvents`'s existing pool-scoping discipline.
- `assertNoOverlaps` must recurse the same way `analyzeLayout` already does (ignore ancestor/descendant pairs — a subprocess box legitimately "contains" its children's rectangles).

**Explicitly still out of scope** (unchanged from the current design): mixing manual and auto positioning *within* a single subprocess body, and manual mode applied to a subprocess nested inside another subprocess beyond what the recursive implementation naturally handles (recursion should make arbitrary depth work for free, but only single-mode-throughout is being tested here).

## Item 3: Structured validation endpoint

**Current state**: the exact check this item needs already exists and is fully built — `analyzeLayout` in `packages/layout-core/test-utils/geometry.ts` — but it's parked under `test-utils`, invisible outside the internal test suite, and there's no single entry point that runs parse → layout → geometry and normalizes all three stages' failure modes into one shape.

**Design**:

1. **Promote the geometry checker out of test-only code.** Move `analyzeLayout`/`LayoutAnalysis` from `packages/layout-core/test-utils/geometry.ts` into `packages/layout-core/src/geometry.ts`, export both from `packages/layout-core/src/index.ts`. Leave `test-utils/geometry.ts` as a one-line re-export (`export * from '../src/geometry.js';`) so the four existing test files that import it (`layout-core/test/geometry.test.ts`, `layout-core/test/boundaryEvents.test.ts`, `layout-engine-swimlane/test/swimlane.test.ts`, `layout-engine-swimlane/test/crossing-regression.test.ts`) need zero changes.

2. **New package `@bpm/validate`**, depending on `@bpm/parser`, `@bpm/layout`, `@bpm/layout-core`. One function:

```ts
export interface ValidationIssue {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
}

export interface ValidationMetrics {
  edgeCrossings: number;
  nodeOverlaps: number;
  edgeThroughNode: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  metrics?: ValidationMetrics; // present only when layout succeeded far enough to measure
}

export async function validate(text: string, options?: LayoutOptions): Promise<ValidationResult>;
```

3. **Pipeline, each stage's failure normalized into the same shape**:
   - `parse(text)` — if `errors.length > 0`, return immediately: `{ valid: false, errors: parseErrors.map(e => ({...e, severity: 'error'})), warnings: [] }`. No point attempting layout on unparseable text.
   - `layout(diagram, options)` — wrapped in try/catch, since layout-time failures (manual-mode overlap, the item-2 nested-content error, an unknown `layout:` engine name) throw a plain `Error` with no line/column. Catch and return `{ valid: false, errors: [{ message: err.message, severity: 'error' }], warnings: [] }`.
   - On success, run `analyzeLayout(positioned)` and translate: `nodeOverlaps`/`edgeThroughNode` entries become `warning`-severity `ValidationIssue`s (не blocking — auto-layout guarantees no overlap by construction, so seeing one here would itself be a bug worth surfacing, not a normal outcome); `edgeCrossings > 0` becomes one summary warning (`"N edge-edge crossings detected"`). Always populate `metrics` with the raw counts, whether or not they produced a warning — `metrics` is what turns §10's prose quality guidance into a number a caller can optimize against, not just a pass/fail gate.
   - Return `{ valid: true, errors: [], warnings: [...], metrics }`.

**Explicitly out of scope for this item**: CLI wiring (`bpm validate diagram.bpm`) — that's roadmap #2 (CLI packaging), not selected for this branch. `@bpm/validate` is a library entry point only; a CLI can wrap it later with zero redesign, since the whole point of the `{errors, warnings}` shape is that it's transport-agnostic.

## Item 4: Partial/mixed manual + auto positioning

This is the one item in this branch with no existing precedent to mirror directly, and the one the prior design spec explicitly deferred pending "a fresh brainstorming cycle" — this section is that cycle's conclusion. Flagged as the highest-risk, most-likely-to-need-iteration item in this branch; if it proves more expensive than expected mid-implementation, items 1–3 already stand alone and ship independently.

**Chosen approach — "auto-layout reserves a slot, then override + re-route the pinned node."** Two alternatives were considered and rejected:

- *Feed pinned coordinates into ELK as hard constraints.* More elegant in principle (ELK could route around a truly fixed point from the start), but couples this feature tightly to ELK-specific constraint APIs that aren't currently used anywhere else in the codebase — a much larger, riskier bet for a first cut, and contrary to this project's pattern of keeping ELK usage to the minimum needed (see `layout-elk-base`'s narrow surface).
- *Full mixed-mode directive (`positioning: partial` or similar), all nodes still declared with explicit opt-in.* Rejected because it adds a new keyword and a new mental model for zero benefit over the chosen approach — the natural syntax is simply: **`at (x, y)` becomes optional on any node, in any diagram, regardless of `positioning:`.** No new directive, no new keyword. A node with `at (x, y)` and no `positioning: manual` directive is "pinned"; every other node in the same diagram is auto-laid-out as today. This is the smallest possible syntax delta — item 4 is entirely a semantic/engine change, not a grammar change beyond relaxing today's "forbidden unless positioning: manual" parse error (`packages/parser/src/parser.ts:251`) to apply only when *no* nodes are pinned in a way that conflicts... concretely: remove that rejection whenever `diagram.positioning !== 'manual'`, full stop. `positioning: manual` continues to mean what it means today (every node required); omitting it now means "auto-layout, with any individually-pinned nodes honored."

**Facade changes** (`packages/layout/src/index.ts`):

```
if diagram.positioning === 'manual':
  // unchanged — full manual mode, every node required
else:
  pinnedNodes = diagram.nodes.filter(n => n.position)
  if pinnedNodes.length === 0:
    // unchanged — today's exact auto-layout path, byte-for-byte
  else:
    strippedDiagram = diagram with each pinned node's `position` field removed
    autoPositioned = engine.layout(strippedDiagram)   // ELK lays out a "slot" for every node, pinned or not
    positioned = overridePinnedNodes(diagram, autoPositioned, pinnedNodes)
  return positionBoundaryEvents(diagram, positioned)
```

`overridePinnedNodes`, a new function (new module, e.g. `packages/layout-core/src/pinnedOverride.ts`, since both the swimlane and flat engines need to share it):

1. For each pinned node, resolve its final `(x, y)`: canvas-absolute at top level, or `laneOrigin + position` if the node belongs to a lane — `laneOrigin` is now known, because ELK already ran (this is the key ordering insight that makes lane-relative pinning well-defined: auto-layout computes the lane's real geometry first, exactly the same way full manual mode's `stackLanes` computes it deterministically up front).
2. Overwrite that node's `x`/`y` in `autoPositioned` (width/height stay whatever ELK/`sizeOf` already computed — unchanged from both existing modes' rule that size is never user-specified).
3. Run the same overlap check `layout-engine-manual/src/engine.ts` uses (extract `assertNoOverlaps` + item 1's `describeOverlap` into a shared `packages/layout-core/src/overlap.ts` so both engines use one implementation) against the full node set post-override. A pinned node moving off its ELK-assigned slot can now collide with a neighbor ELK placed assuming the original slot — that's a real conflict, not a bug to paper over, so it fails loudly with the same actionable message as item 1, consistent with manual mode's existing "reject, don't silently misdraw" philosophy (§6.4).
4. Re-route every edge touching a pinned node (its position just changed from what the engine originally routed against) using the same shared obstacle-aware router (`createSequentialRouter`) item 2 and the existing manual engine already use — leave every edge that touches no pinned node completely untouched, which is what keeps this additive: a diagram with zero pinned nodes produces byte-for-byte the same output as today.

**Parser change**: in `packages/parser/src/parser.ts`, the `checkPosition` rejection (`"Node ... specifies a position ..., but this diagram does not use positioning: manual"`) is removed for the non-manual case — `at (x, y)` is now always syntactically legal; `positioning: manual` continues to be what makes it *required* rather than optional.

**Boundary events**: unaffected — they never take `at (x, y)` in any mode (§3.2), and `positionBoundaryEvents` already runs after this whole pass, unchanged.

## Cross-cutting notes

- Items 1 and 4 both need `assertNoOverlaps`/`describeOverlap`; item 4's design above already calls for extracting them into a shared `packages/layout-core/src/overlap.ts` rather than duplicating. Build item 1 first, in `layout-engine-manual` as today, then move it during item 4 rather than pre-extracting speculatively — YAGNI until a second caller actually exists.
- Item 3's `@bpm/validate` should be built and tested against the *pre-item-2/4* engine first (it only depends on `parse`/`layout`/`analyzeLayout`'s existing public shapes), then re-verified once items 2 and 4 land, since both add new layout-time failure modes it should also normalize correctly (a nested-content success now, and a pinned-node overlap).
- None of the four items change any existing diagram's output when unused — every one is additive and gated behind either an explicit directive, an explicit `at (x, y)`, or a new opt-in package. The full existing test suite (151/151 per `docs/STATUS.md`) must stay green throughout, same discipline as the original manual-positioning-mode plan.

## Testing

- **Item 1**: `layout-engine-manual` unit tests asserting the new message format for a horizontal-overlap case, a vertical-overlap case, and a tie (equal overlap both axes — pick x per the `<=` in `describeOverlap`).
- **Item 2**: new `layout-engine-manual` tests mirroring the existing flat/lane-relative cases but with a subprocess containing 2-3 children and its own internal edge; assert recursive `PositionedNode.children` shape and that `analyzeLayout` reports zero false-positive overlaps between a subprocess and its own children.
- **Item 3**: new `@bpm/validate` package tests covering all four terminal shapes — parse error, layout-time error (both an existing manual-mode overlap and, once item 2 lands, a nested-content case that now *succeeds*), a valid diagram with residual crossings (warning + metrics), and a fully clean diagram (`valid: true`, empty `warnings`).
- **Item 4**: new tests at both the `layout-engine-swimlane` and `layout-engine-flat` level — a diagram with one pinned node and several auto nodes, asserting (a) the pinned node lands exactly at its resolved coordinate, (b) every other node's position is identical to the same diagram with the pinned node's `at (x, y)` removed (proves the "reserved slot" framing), (c) a pinned-node/neighbor overlap throws the shared actionable error, (d) a diagram with zero pinned nodes produces byte-for-byte identical output to the current engine (the critical non-regression guarantee).
- **Regression**: full existing suite re-run unchanged after every item — no existing baseline (including the crossing-regression counts) should move, since no existing code path is touched when the new opt-in surface isn't used.

## Related docs

- `docs/LANGUAGE.md` §6, §11 — update after each item lands (new error message text for item 1; lift the §6.4 nested-content limitation for item 2; document `at (x, y)` outside `positioning: manual` for item 4; add a §12-adjacent pointer to `@bpm/validate` for item 3).
- `docs/ROADMAP.md` items 7, 8, 9 — mark done/superseded as each item ships, same convention used for the original manual-positioning-mode entry.
- `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md` — the design this one extends; item 4 explicitly reverses that spec's "Deferred" note on mixing modes.
