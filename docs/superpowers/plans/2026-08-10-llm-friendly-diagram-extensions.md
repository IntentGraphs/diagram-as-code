# LLM-Friendly Diagram Extensions — Implementation Plan

**Branch:** `llm-diagram-extensions` (already checked out from `main`).

**Design reference:** `docs/superpowers/specs/2026-08-10-llm-friendly-diagram-extensions-design.md` — read it before starting; this plan assumes its architecture decisions without re-deriving them.

**Goal:** four independent, additive extensions — actionable manual-mode overlap errors, nested subprocess support in manual mode, a structured `@bpm/validate` API, and partial/mixed manual+auto positioning — with zero behavior change to any diagram that doesn't use the new opt-in surfaces.

**Tech stack:** TypeScript, Vitest, npm workspaces — same as the rest of the monorepo. No new runtime dependencies; item 3 adds one new internal workspace package (`@bpm/validate`).

## How to use this plan (for whichever agent executes it)

Work through the four parts **in order** — each part is a separate, committable unit, and later parts assume earlier ones are done (Part 4 reuses the overlap-error work from Part 1; Part 3 is easiest to get right once Parts 1–2's new failure modes exist to test against, though it can technically start anytime since it only depends on today's `parse`/`layout` shapes).

For every task:
1. Write the failing test first. Run it. Confirm it fails for the *stated* reason, not an unrelated one (e.g. a typo).
2. Implement the minimal change described.
3. Run the test again — confirm it passes.
4. Run the **full** test suite (`npm test` from repo root) — confirm nothing else broke. This project tracks an exact passing count (151/151 as of this branch's base); if that count changes for any reason other than the new tests you just added, stop and investigate before continuing.
5. Commit with the message given, using `git add` on only the files listed (don't `git add -A`).

If a task's design turns out to be wrong once you're inside the code (this is most likely in Part 4 — flagged as the highest-uncertainty item in the design doc), stop, re-read the relevant design-doc section, and adjust — don't silently improvise a different architecture than what's written without noting the deviation in the commit message.

## Global constraints

- Zero behavior change to any diagram that doesn't use the new syntax/package — every existing test must keep passing unmodified except where a task explicitly says otherwise.
- Node width/height stay auto-sized in every mode (never user-specified) — this rule from the original manual-positioning design still holds; Part 2's subprocess sizing computes a *derived* size from children, it does not accept one from the user.
- Follow TDD (see "How to use this plan" above) for every task — no task skips the failing-test step.
- Reuse existing shared infrastructure (`sideOf`/`stubFrom`/`createSequentialRouter` from `@bpm/layout-core`, `sizeOf` from `@bpm/layout-elk-base`) rather than reimplementing geometry helpers.

---

# Part 1: Actionable manual-mode overlap errors

**Files:** Modify `packages/layout-engine-manual/src/engine.ts`; test `packages/layout-engine-manual/test/engine.test.ts`.

## Task 1.1: Overlap error names the fix

**Interfaces:**
- Produces: `assertNoOverlaps` throws a message ending in `— shift "<id>" right by <N> (or the other node left).` or `— shift "<id>" down by <N> (or the other node up).`, choosing the smaller-magnitude axis.

- [ ] **Step 1: Write the failing tests**

Add to `packages/layout-engine-manual/test/engine.test.ts`:

```ts
describe('layoutManual — actionable overlap errors', () => {
  it('suggests a rightward/leftward shift when the horizontal overlap is smaller', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },   // 50x50 box
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 40, y: 0 } },   // overlaps a by 10 horizontally, 50 vertically
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/shift "b" right by 10 \(or the other node left\)/);
  });

  it('suggests a downward/upward shift when the vertical overlap is smaller', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 0, y: 40 } },   // overlaps a by 50 horizontally, 10 vertically
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/shift "b" down by 10 \(or the other node up\)/);
  });

  it('still leads with the original identifying message, for any existing tooling matching on it', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'gateway', id: 'a', label: 'A', gatewayType: 'exclusive', position: { x: 0, y: 0 } },
        { kind: 'gateway', id: 'b', label: 'B', gatewayType: 'exclusive', position: { x: 10, y: 10 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/Nodes "a" and "b" overlap at their given positions/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout-engine-manual/test/engine.test.ts -t "actionable overlap errors"`
Expected: FAIL — current message has no `shift ... by ...` suffix.

- [ ] **Step 3: Implement**

In `packages/layout-engine-manual/src/engine.ts`, replace `assertNoOverlaps` (lines 28–39) with:

```ts
function describeOverlap(a: PositionedNode, b: PositionedNode): string {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const mover = a.x <= b.x && a.y <= b.y ? b : a;
  return overlapX <= overlapY
    ? `shift "${mover.id}" right by ${Math.ceil(overlapX)} (or the other node left)`
    : `shift "${mover.id}" down by ${Math.ceil(overlapY)} (or the other node up)`;
}

function assertNoOverlaps(nodes: PositionedNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) {
        throw new Error(`Nodes "${a.id}" and "${b.id}" overlap at their given positions — ${describeOverlap(a, b)}.`);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout-engine-manual/test/engine.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-manual/src/engine.ts packages/layout-engine-manual/test/engine.test.ts
git commit -m "feat(layout-engine-manual): overlap errors suggest an actionable shift"
```

## Task 1.2: Update `LANGUAGE.md`

- [ ] Update §6.4's overlap bullet in `docs/LANGUAGE.md` to reflect the new message shape (don't invent new prose — quote the actual new message format).
- [ ] Commit: `git add docs/LANGUAGE.md && git commit -m "docs: document actionable overlap error message"`

---

# Part 2: Nested subprocess/transaction content in manual mode

**Files:** Modify `packages/layout-engine-manual/src/engine.ts`; test `packages/layout-engine-manual/test/engine.test.ts`.

Before starting, read `packages/layout-core/test-utils/geometry.ts`'s `flattenNodes`/`isAncestor` (already recurse into `PositionedNode.children` — confirms this nesting shape is a first-class concept downstream, not new) and `packages/ast/src/types.ts`'s `ActivityNode` (`children: DiagramNode[]`, `childEdges: DiagramEdge[]`).

## Task 2.1: Recursive placement with a derived container size

**Interfaces:**
- Consumes: `PositionedNode.children`/`childEdges` (already valid fields per `analyzeLayout`'s expectations).
- Produces: `placeNode` recurses into an expanded subprocess/transaction's children instead of throwing; the subprocess's own width/height is derived from its children's bounding box, not the §6.5 clamp formula (that formula stays correct for `collapsed` subprocesses only).

- [ ] **Step 1: Write the failing test**

Add to `packages/layout-engine-manual/test/engine.test.ts`:

```ts
describe('layoutManual — nested subprocess content', () => {
  it('places subprocess children relative to the subprocess own origin and sizes the subprocess to fit them', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subprocess', collapsed: false,
          position: { x: 100, y: 100 },
          children: [
            { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true, position: { x: 20, y: 20 } },
            { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 100, y: 10 } },
          ],
          childEdges: [{ id: 'ce1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };

    const positioned = await layoutManual(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;
    expect(sp1.children).toBeDefined();
    const sn1 = sp1.children!.find((n) => n.id === 'sn1')!;
    const sn2 = sp1.children!.find((n) => n.id === 'sn2')!;

    // children positioned relative to sp1's own content origin (sp1.x/y + header inset), not canvas-absolute (100,100)
    expect(sn1.x).toBeGreaterThan(sp1.x);
    expect(sn1.y).toBeGreaterThan(sp1.y);
    // sp1 must be sized to actually contain both children plus the header inset, not the fixed clamp() box formula
    expect(sp1.x + sp1.width).toBeGreaterThanOrEqual(sn2.x + sn2.width);
    expect(sp1.y + sp1.height).toBeGreaterThanOrEqual(sn1.y + sn1.height);

    expect(sp1.childEdges).toBeDefined();
    expect(sp1.childEdges![0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('still allows a collapsed subprocess with no children (unchanged v1 behavior)', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subprocess', collapsed: true, children: [], childEdges: [], position: { x: 0, y: 0 } },
      ],
      edges: [],
    };
    const positioned = await layoutManual(diagram);
    expect(positioned.nodes[0].children).toBeUndefined();
  });
});
```

Also update (don't delete — repurpose) the existing test that currently asserts the `does not yet support nested content` throw, since that behavior is being replaced. Check `packages/layout-engine-manual/test/engine.test.ts` for that test's exact name before editing.

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout-engine-manual/test/engine.test.ts -t "nested subprocess content"`
Expected: FAIL — `placeNode` still throws `does not yet support nested content`.

- [ ] **Step 3: Implement**

First, determine the header inset empirically rather than guessing: write a tiny throwaway script (or a Vitest scratch test) that runs an existing **auto-layout** subprocess diagram (e.g. adapt the `nestedSubprocess` fixture referenced in `packages/layout-core/test-utils/verificationDiagrams.ts`) through `layoutManual`'s sibling engines and inspect the resulting child node's `x`/`y` relative to its parent subprocess's `x`/`y` — that gives the real header inset ELK/ the renderer already use. If no clean signal emerges, fall back to this project's existing padding convention (`LANE_PADDING = 20`, `POOL_TOP_PADDING = 12` in `laneStacking.ts`) — use `SUBPROCESS_HEADER_INSET_Y = 32` (room for a label header band) and `SUBPROCESS_PADDING = 20` (matching `LANE_PADDING`) as the starting constants, and adjust only if the empirical check above contradicts them.

In `packages/layout-engine-manual/src/engine.ts`:

```ts
const SUBPROCESS_HEADER_INSET_Y = 32;
const SUBPROCESS_PADDING = 20;

function isExpandedSubprocess(node: DiagramNode): boolean {
  return node.kind === 'activity' && !node.collapsed && node.children.length > 0;
}

/** Recursively places a subprocess's children, then derives the subprocess's own size from their bounding box. */
function placeSubprocessContents(node: DiagramNode, originX: number, originY: number): PositionedNode {
  const contentOriginX = originX + SUBPROCESS_PADDING;
  const contentOriginY = originY + SUBPROCESS_HEADER_INSET_Y;
  const placedChildren = node.children.map((child) => placeNode(child, contentOriginX, contentOriginY));
  assertNoOverlaps(placedChildren); // a subprocess's own children must not overlap each other

  const maxRight = Math.max(...placedChildren.map((c) => c.x + c.width));
  const maxBottom = Math.max(...placedChildren.map((c) => c.y + c.height));
  const width = maxRight - originX + SUBPROCESS_PADDING;
  const height = maxBottom - originY + SUBPROCESS_PADDING;

  const nodeById = new Map(placedChildren.map((c) => [c.id, c]));
  const childEdges = routeFlatEdges(node.childEdges, nodeById);

  return {
    ...node, x: originX, y: originY, width, height,
    children: placedChildren, childEdges,
  } as PositionedNode;
}
```

Update `placeNode` (remove the throw, delegate to the new function):

```ts
export function placeNode(node: DiagramNode, originX: number, originY: number): PositionedNode {
  if (isBoundaryEvent(node)) {
    throw new Error(`Boundary event "${node.id}" cannot be manually positioned — it is always placed relative to its host.`);
  }
  if (!node.position) {
    throw new Error(`Node "${node.id}" has no position — every node needs "at (x, y)" in a manual-positioning diagram.`);
  }
  if (isExpandedSubprocess(node)) {
    return placeSubprocessContents(node, originX + node.position.x, originY + node.position.y);
  }
  const { width, height } = sizeOf(node);
  return { ...node, x: originX + node.position.x, y: originY + node.position.y, width, height } as PositionedNode;
}
```

Update `assertNoOverlaps` at the top level (`layoutManual`'s own call) to skip ancestor/descendant pairs, mirroring `analyzeLayout`'s `isAncestor` — a subprocess box legitimately contains its children's rectangles:

```ts
function isAncestor(maybeAncestor: PositionedNode, node: PositionedNode): boolean {
  if (!maybeAncestor.children) return false;
  for (const c of maybeAncestor.children) {
    if (c.id === node.id || isAncestor(c, node)) return true;
  }
  return false;
}
```

...and guard the top-level `assertNoOverlaps` loop with `if (isAncestor(a, b) || isAncestor(b, a)) continue;` before the overlap check.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout-engine-manual/test/engine.test.ts`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Verify against the geometry checker directly**

Add one more test asserting `analyzeLayout(positioned).nodeOverlaps` is empty for the nested-subprocess fixture from Step 1 — this is the concrete proof that item 2's output is legal input to item 3's validator, not just internally self-consistent.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-engine-manual/src/engine.ts packages/layout-engine-manual/test/engine.test.ts
git commit -m "feat(layout-engine-manual): support nested subprocess/transaction content"
```

## Task 2.2: Update `LANGUAGE.md`

- [ ] Remove the "No nested subprocess/transaction content" bullet from §6.4 in `docs/LANGUAGE.md`; add a worked example under §9 showing a manual-mode subprocess with children (mirror the existing auto-layout subprocess example from §3.4, adapted with `at (x, y)`).
- [ ] Update §6.5's dimension table note to clarify the clamp formula applies to collapsed subprocesses only; expanded ones are sized from content.
- [ ] Commit: `git add docs/LANGUAGE.md && git commit -m "docs: document manual-mode nested subprocess support"`

---

# Part 3: Structured validation endpoint (`@bpm/validate`)

**Files:** Move `packages/layout-core/test-utils/geometry.ts` logic into `packages/layout-core/src/geometry.ts`; create `packages/validate/{package.json,tsconfig.json,src/index.ts}`; test `packages/validate/test/validate.test.ts`.

## Task 3.1: Promote `analyzeLayout` out of test-only code

**Interfaces:**
- Produces: `analyzeLayout`/`LayoutAnalysis` exported from `@bpm/layout-core`'s public `src/index.ts`, not just `test-utils`.

- [ ] **Step 1: Write the failing test**

Add to `packages/layout-core/test/geometry.test.ts` (or wherever the existing `analyzeLayout` tests live — check first):

```ts
import { analyzeLayout } from '../src/index.js'; // currently only importable from '../test-utils/geometry.js'
```

Add one assertion confirming this import path resolves and returns the same shape as before (reuse an existing fixture from the current test file rather than inventing a new one).

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout-core/test/geometry.test.ts`
Expected: FAIL — `analyzeLayout` is not exported from `../src/index.js`.

- [ ] **Step 3: Implement**

Move the entire contents of `packages/layout-core/test-utils/geometry.ts` to `packages/layout-core/src/geometry.ts` (update its internal import of `../src/types.js` to `./types.js`). Replace `packages/layout-core/test-utils/geometry.ts` with:

```ts
export * from '../src/geometry.js';
```

Add to `packages/layout-core/src/index.ts`:

```ts
export { analyzeLayout, type LayoutAnalysis } from './geometry.js';
```

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout-core` then the full suite (`npm test`) — the four existing consumers of `test-utils/geometry.ts` (`layout-core/test/boundaryEvents.test.ts`, `layout-core/test/geometry.test.ts`, `layout-engine-swimlane/test/swimlane.test.ts`, `layout-engine-swimlane/test/crossing-regression.test.ts`) must still pass with **zero changes to their import lines** — that's the proof the re-export shim works.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/geometry.ts packages/layout-core/test-utils/geometry.ts packages/layout-core/src/index.ts packages/layout-core/test/geometry.test.ts
git commit -m "refactor(layout-core): promote analyzeLayout from test-utils to public src export"
```

## Task 3.2: `@bpm/validate` package scaffold and happy path

**Interfaces:**
- Consumes: `parse` from `@bpm/parser`; `layout`, `LayoutOptions` from `@bpm/layout`; `analyzeLayout` from `@bpm/layout-core` (Task 3.1).
- Produces: `validate(text: string, options?: LayoutOptions): Promise<ValidationResult>` per the design doc's shape (`ValidationIssue`, `ValidationMetrics`, `ValidationResult`).

- [ ] **Step 1: Scaffold the package**

`packages/validate/package.json`:

```json
{
  "name": "@bpm/validate",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/parser": "*",
    "@bpm/layout": "*",
    "@bpm/layout-core": "*"
  }
}
```

`packages/validate/tsconfig.json` — copy the pattern from `packages/layout-engine-manual/tsconfig.json` verbatim (same `extends`/`rootDir`/`outDir`/`include`).

Run `npm install` from the repo root so the new workspace package links.

- [ ] **Step 2: Write the failing tests**

Create `packages/validate/test/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validate } from '../src/index.js';

describe('validate — terminal outcomes', () => {
  it('returns a parse error immediately, without attempting layout', async () => {
    const result = await validate('this is not valid bpm syntax at all {{{');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe('error');
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toBeUndefined();
  });

  it('returns a layout-time error (manual-mode overlap) as a single structured error', async () => {
    const text = [
      'positioning: manual',
      '',
      'gateway exclusive "A" as a at (0, 0)',
      'gateway exclusive "B" as b at (10, 10)',
    ].join('\n');
    const result = await validate(text);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/overlap at their given positions/);
    expect(result.errors[0].severity).toBe('error');
  });

  it('returns valid: true with empty warnings and populated metrics for a clean diagram', async () => {
    const text = [
      'task "A" as a1',
      'task "B" as b1',
      'a1 -> b1',
    ].join('\n');
    const result = await validate(text);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toMatchObject({ edgeCrossings: 0, nodeOverlaps: 0, edgeThroughNode: 0 });
  });

  it('reports a crossings warning and non-zero metric without failing validity', async () => {
    // Reuse an existing verification fixture known to have residual crossings
    // (see packages/layout-core/test-utils/verificationDiagrams.ts — `crowdedBoundary` or
    // `orderToCashStacked` per docs/STATUS.md's "Known limitations" section) rather than
    // hand-crafting a new crossing diagram from scratch.
  });
});
```

Fill in the last test using whichever verification fixture's *text form* is easiest to reuse or reconstruct — check `verificationDiagrams.ts` for whether it exports diagram text directly or only pre-parsed `Diagram` objects; if only the latter, either add a text-form export there (small, additive) or hand-write a minimal diagram with two crossing edges (e.g. a pool with two lanes and two edges routed to force a crossing, following the pattern of any existing crossing-regression fixture).

- [ ] **Step 3: Run tests to verify they fail**

`npx vitest run packages/validate/test/validate.test.ts`
Expected: FAIL — `../src/index.js` doesn't exist yet.

- [ ] **Step 4: Implement**

Create `packages/validate/src/index.ts`:

```ts
import { parse } from '@bpm/parser';
import { layout, type LayoutOptions } from '@bpm/layout';
import { analyzeLayout } from '@bpm/layout-core';

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
  metrics?: ValidationMetrics;
}

export async function validate(text: string, options?: LayoutOptions): Promise<ValidationResult> {
  const { diagram, errors: parseErrors } = parse(text);
  if (parseErrors.length > 0) {
    return {
      valid: false,
      errors: parseErrors.map((e) => ({ ...e, severity: 'error' as const })),
      warnings: [],
    };
  }

  let positioned;
  try {
    positioned = await layout(diagram, options);
  } catch (err) {
    return {
      valid: false,
      errors: [{ message: err instanceof Error ? err.message : String(err), severity: 'error' }],
      warnings: [],
    };
  }

  const analysis = analyzeLayout(positioned);
  const warnings: ValidationIssue[] = [];
  for (const overlap of analysis.nodeOverlaps) {
    warnings.push({ message: overlap, severity: 'warning' });
  }
  for (const through of analysis.edgeThroughNode) {
    warnings.push({ message: through, severity: 'warning' });
  }
  if (analysis.edgeCrossings > 0) {
    warnings.push({ message: `${analysis.edgeCrossings} edge-edge crossing(s) detected`, severity: 'warning' });
  }

  return {
    valid: true,
    errors: [],
    warnings,
    metrics: {
      edgeCrossings: analysis.edgeCrossings,
      nodeOverlaps: analysis.nodeOverlaps.length,
      edgeThroughNode: analysis.edgeThroughNode.length,
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

`npx vitest run packages/validate/test/validate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/validate/package.json packages/validate/tsconfig.json packages/validate/src/index.ts packages/validate/test/validate.test.ts
git commit -m "feat(validate): add @bpm/validate structured parse/layout/geometry check"
```

## Task 3.3: Re-verify against Part 2's new success case

- [ ] Add one more `validate` test using a manual-mode diagram with a nested subprocess (from Part 2) that should now return `valid: true` — this is the direct proof the two items compose correctly, per the design doc's "Cross-cutting notes."
- [ ] Commit as part of Task 3.2 if done before that commit, or as a small follow-up commit otherwise.

## Task 3.4: Update `STATUS.md`/`ROADMAP.md`

- [ ] Add `@bpm/validate` to the pipeline description in `docs/STATUS.md`'s "What's built" section.
- [ ] Mark roadmap item 8 done in `docs/ROADMAP.md`, noting the CLI-wiring half is still open (that's item 2, untouched by this branch).
- [ ] Commit: `git add docs/STATUS.md docs/ROADMAP.md && git commit -m "docs: record @bpm/validate as built"`

---

# Part 4: Partial/mixed manual + auto positioning

This is the highest-uncertainty part of this branch (see design doc). Read the full "Item 4" section of the design doc before starting — this plan summarizes it into tasks but doesn't repeat every rationale.

**Files:** Modify `packages/parser/src/parser.ts`; create `packages/layout-core/src/overlap.ts` (extracted from `layout-engine-manual`); modify `packages/layout-engine-manual/src/engine.ts` (to use the extracted version); create `packages/layout-core/src/pinnedOverride.ts`; modify `packages/layout/src/index.ts`; tests across `packages/parser/test/`, `packages/layout-core/test/`, `packages/layout-engine-swimlane/test/`, `packages/layout-engine-flat/test/`.

## Task 4.1: Parser — `at (x, y)` becomes legal without `positioning: manual`

**Interfaces:**
- Produces: the `checkPosition` rejection for "position given but positioning: manual not set" (`parser.ts:251` today) fires only when... actually per the design, it never fires anymore for the non-manual case — remove it entirely for that branch. `positioning: manual`'s own "position required" rule (the other half of `checkPosition`) is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `packages/parser/test/parser.test.ts`:

```ts
describe('parse — pinned nodes without positioning: manual', () => {
  it('allows at (x, y) on a node with no positioning directive', () => {
    const text = 'task "Review" as t1 at (40, 40)\ntask "Approve" as t2\nt1 -> t2';
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({ id: 't1', position: { x: 40, y: 40 } });
    expect(diagram.nodes[1].position).toBeUndefined();
    expect(diagram.positioning).toBeUndefined();
  });

  it('still rejects at (x, y) on a boundary event with no positioning directive', () => {
    const text = 'task "Review" as t1\nboundary timer interrupting "Timeout" as b1 on t1 at (10, 10)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 2, column: 1,
      message: 'Boundary event "b1" cannot have a position — it is always placed relative to its host "t1"',
    });
  });

  it('positioning: manual still requires a position on every non-boundary node (unchanged)', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 3, column: 1,
      message: 'Node "t1" is missing a required position ("at (x, y)") in a manual-positioning diagram',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/parser/test/parser.test.ts -t "pinned nodes"`
Expected: FAIL on the first test — `at (x, y)` with no directive currently produces the "specifies a position... does not use positioning: manual" error.

- [ ] **Step 3: Implement**

In `packages/parser/src/parser.ts`'s `checkPosition` function, remove the `positioningMode !== 'manual' && position` branch entirely (keep the `positioningMode === 'manual' && !position` branch unchanged):

```ts
function checkPosition(id: string): boolean {
  if (positioningMode === 'manual' && !position) {
    errors.push({
      line: lineNumber, column: 1,
      message: `Node "${id}" is missing a required position ("at (x, y)") in a manual-positioning diagram`,
    });
    return false;
  }
  return true;
}
```

Confirm every call site of `checkPosition` still attaches `position` to the node when present (`...(position ? { position } : {})`) — this should already be true from the original manual-positioning-mode plan and needs no change, just verification.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS, including every pre-existing test — in particular, confirm no existing test asserted the now-removed rejection as a *feature* (search the test file for `"does not use \"positioning: manual\""` and delete/update that specific test case, since its assertion is now intentionally false).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): allow at (x, y) on individual nodes without positioning: manual"
```

## Task 4.2: Extract shared overlap-checking into `layout-core`

**Interfaces:**
- Produces: `assertNoOverlaps(nodes, opts?)` and `describeOverlap` moved to `packages/layout-core/src/overlap.ts`, exported from `@bpm/layout-core`; `layout-engine-manual` imports them instead of defining its own copy.

- [ ] **Step 1: Write the failing test**

Add `packages/layout-core/test/overlap.test.ts` asserting `assertNoOverlaps` (imported from `../src/overlap.js`) throws the same actionable message format Part 1 built, using a minimal two-node fixture (don't duplicate every Part 1 test case — one is enough to prove the extraction preserved behavior).

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout-core/test/overlap.test.ts`
Expected: FAIL — `../src/overlap.js` doesn't exist.

- [ ] **Step 3: Implement**

Move `describeOverlap`/`assertNoOverlaps` (and the `isAncestor` helper added in Part 2) from `packages/layout-engine-manual/src/engine.ts` into `packages/layout-core/src/overlap.ts`, export from `packages/layout-core/src/index.ts`. Update `packages/layout-engine-manual/src/engine.ts` to import them from `@bpm/layout-core` and delete its local copies.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout-core packages/layout-engine-manual`
Expected: PASS, including every Part 1 and Part 2 test unmodified (proves the extraction is behavior-preserving, not just additive).

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/overlap.ts packages/layout-core/src/index.ts packages/layout-core/test/overlap.test.ts packages/layout-engine-manual/src/engine.ts
git commit -m "refactor(layout-core): extract shared overlap-checking from layout-engine-manual"
```

## Task 4.3: `overridePinnedNodes` — resolve, override, re-route

**Interfaces:**
- Consumes: `Diagram`, `PositionedDiagram` (post-auto-layout), the subset of `diagram.nodes` with `.position` set; `assertNoOverlaps` (Task 4.2); `sideOf`/`stubFrom`/`createSequentialRouter` from `@bpm/layout-core`.
- Produces: a new `PositionedDiagram` with every pinned node's `x`/`y` overridden to its resolved coordinate (canvas-absolute at top level, lane-relative inside a lane using the *already-computed* lane geometry from the auto-layout pass), every edge touching a pinned node re-routed, every other node/edge byte-for-byte untouched.

- [ ] **Step 1: Write the failing tests**

Create `packages/layout-core/test/pinnedOverride.test.ts`. Build a minimal `Diagram`/`PositionedDiagram` pair by hand (a flat, non-pool diagram with 3 nodes auto-positioned at arbitrary ELK-style coordinates, one of them marked pinned in the source `Diagram`) and assert:

```ts
describe('overridePinnedNodes', () => {
  it('overrides only the pinned node\'s position, leaving every other node untouched', () => {
    // ... construct diagram + autoPositioned fixtures ...
    const result = overridePinnedNodes(diagram, autoPositioned);
    const pinned = result.nodes.find((n) => n.id === 'pinnedNodeId')!;
    expect(pinned.x).toBe(/* resolved absolute x from diagram.nodes[...].position */);
    const untouched = result.nodes.find((n) => n.id === 'otherNodeId')!;
    expect(untouched).toEqual(autoPositioned.nodes.find((n) => n.id === 'otherNodeId'));
  });

  it('re-routes an edge touching the pinned node but leaves other edges untouched', () => {
    // assert the edge whose source/target is the pinned node has different `points` than
    // autoPositioned's original routing for it; assert an unrelated edge's `points` are unchanged
  });

  it('throws the shared actionable overlap error if the pinned override collides with a neighbor', () => {
    // construct a fixture where the pinned coordinate deliberately lands on top of another node
    expect(() => overridePinnedNodes(diagram, autoPositioned)).toThrow(/shift ".*" (right|down) by \d+/);
  });

  it('resolves lane-relative pinned coordinates against the already-computed lane origin', () => {
    // a pinned node inside a lane: diagram.pools[...].lanes[...] with the node's id in nodeIds,
    // autoPositioned.pools[...].lanes[...] giving that lane's real x/y from the auto engine —
    // assert the final position is laneOrigin + the node's declared (x, y), not canvas-absolute
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout-core/test/pinnedOverride.test.ts`
Expected: FAIL — `../src/pinnedOverride.js` doesn't exist.

- [ ] **Step 3: Implement**

Create `packages/layout-core/src/pinnedOverride.ts`. Key logic:

```ts
import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from './types.js';
import { sideOf, stubFrom } from './anchors.js';
import { createSequentialRouter } from './routing/router.js';
import { assertNoOverlaps } from './overlap.js';

const EDGE_STUB = 14;

function resolvePinnedOrigin(diagram: Diagram, positioned: PositionedDiagram, nodeId: string): { x: number; y: number } {
  for (const pool of positioned.pools) {
    for (const lane of pool.lanes) {
      const diagramPool = diagram.pools.find((p) => p.id === pool.id)!;
      const diagramLane = diagramPool.lanes.find((l) => l.id === lane.id)!;
      if (diagramLane.nodeIds.includes(nodeId)) return { x: lane.x, y: lane.y };
    }
  }
  return { x: 0, y: 0 }; // top-level node: canvas-absolute
}

export function overridePinnedNodes(diagram: Diagram, autoPositioned: PositionedDiagram): PositionedDiagram {
  const pinnedIds = new Set(diagram.nodes.filter((n) => n.position).map((n) => n.id));
  if (pinnedIds.size === 0) return autoPositioned;

  const diagramById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const overriddenNodes = autoPositioned.nodes.map((n) => {
    if (!pinnedIds.has(n.id)) return n;
    const origin = resolvePinnedOrigin(diagram, autoPositioned, n.id);
    const position = diagramById.get(n.id)!.position!;
    return { ...n, x: origin.x + position.x, y: origin.y + position.y };
  });

  assertNoOverlaps(overriddenNodes);

  const nodeById = new Map(overriddenNodes.map((n) => [n.id, n]));
  const router = createSequentialRouter();
  const reRoutedEdges = autoPositioned.edges.map((edge) => {
    if (!pinnedIds.has(edge.sourceId) && !pinnedIds.has(edge.targetId)) return edge;
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return edge;
    const fromSide = edge.from ?? (target.x >= source.x ? 'right' : 'left');
    const toSide = edge.to ?? (target.x >= source.x ? 'left' : 'right');
    const start = sideOf(source, fromSide);
    const end = sideOf(target, toSide);
    const exitStub = stubFrom(start, fromSide, EDGE_STUB);
    const entryStub = stubFrom(end, toSide, EDGE_STUB);
    const obstacles = [...nodeById.values()].filter((n) => n.id !== source.id && n.id !== target.id);
    const middle = router.route(exitStub, entryStub, obstacles);
    return { ...edge, points: [start, ...middle, end] };
  });

  return { pools: autoPositioned.pools, nodes: overriddenNodes, edges: reRoutedEdges };
}
```

Treat this as a starting point, not a final answer — check the exact `RoutedEdge`/`PositionedNode` field names against `packages/layout-core/src/types.ts` before compiling, and adjust the re-routing logic to match whatever the existing `routeFlatEdges` in `layout-engine-manual/src/engine.ts` does (it solves the same "route between two fixed points with obstacles" problem — reuse its exact approach rather than diverging).

Export from `packages/layout-core/src/index.ts`: `export { overridePinnedNodes } from './pinnedOverride.js';`

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout-core/test/pinnedOverride.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/pinnedOverride.ts packages/layout-core/src/index.ts packages/layout-core/test/pinnedOverride.test.ts
git commit -m "feat(layout-core): add overridePinnedNodes for partial manual positioning"
```

## Task 4.4: Wire into `@bpm/layout` facade

**Interfaces:**
- Consumes: `overridePinnedNodes` (Task 4.3).
- Produces: `layout()` in `packages/layout/src/index.ts` strips pinned nodes' `position` before auto-layout, then applies the override pass — but only when at least one node is pinned, so the zero-pinned-nodes path is provably untouched.

- [ ] **Step 1: Write the failing tests**

Add to a new or existing `packages/layout/test/index.test.ts`:

```ts
describe('layout — pinned node override', () => {
  it('produces byte-for-byte identical output when no node is pinned (non-regression)', async () => {
    const diagramNoPins = /* an existing simple flat diagram with no positions */;
    const before = await layout(diagramNoPins);
    // Compare against a second call on the exact same input, and against a hand-verified
    // known-good snapshot from an existing test elsewhere in the suite if one is available —
    // the point is proving the new branch is a true no-op, not just "runs without throwing."
  });

  it('overrides one pinned node while auto-laying-out the rest', async () => {
    const text = 'task "A" as a1 at (500, 500)\ntask "B" as b1\ntask "C" as c1\na1 -> b1\nb1 -> c1';
    const { diagram } = parse(text); // from @bpm/parser
    const result = await layout(diagram);
    const a1 = result.nodes.find((n) => n.id === 'a1')!;
    expect(a1.x).toBe(500);
    expect(a1.y).toBe(500);
  });

  it('throws the actionable overlap error when a pinned node collides with an auto-placed neighbor', async () => {
    // construct a diagram where the pinned coordinate is deliberately chosen to land on
    // another node's auto-computed slot
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`npx vitest run packages/layout/test/index.test.ts -t "pinned node override"`
Expected: FAIL — pinned `position` is currently rejected at parse time before this ever reaches `layout()` (Task 4.1 must land first) or, post-4.1, `layout()` ignores `position` entirely today.

- [ ] **Step 3: Implement**

In `packages/layout/src/index.ts`, replace the body of `layout()`:

```ts
export async function layout(diagram: Diagram, options?: LayoutOptions): Promise<PositionedDiagram> {
  if (diagram.positioning === 'manual') {
    const positioned = await layoutManual(diagram);
    return positionBoundaryEvents(diagram, positioned);
  }
  ensureDefaultEngines();
  const engine = options?.engineOverride ? getEngineByName(options.engineOverride) : selectEngine(diagram);

  const pinnedIds = new Set(diagram.nodes.filter((n) => n.position).map((n) => n.id));
  if (pinnedIds.size === 0) {
    const positioned = await engine.layout(diagram);
    return positionBoundaryEvents(diagram, positioned);
  }

  const strippedDiagram: Diagram = {
    ...diagram,
    nodes: diagram.nodes.map((n) => (pinnedIds.has(n.id) ? { ...n, position: undefined } : n)),
  };
  const autoPositioned = await engine.layout(strippedDiagram);
  const overridden = overridePinnedNodes(diagram, autoPositioned);
  return positionBoundaryEvents(diagram, overridden);
}
```

Add `overridePinnedNodes` to the `@bpm/layout-core` import list at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

`npx vitest run packages/layout` then the **full suite** (`npm test`) — the zero-pinned-nodes path must produce identical output to before this task on every existing fixture; this is the single most important non-regression check in this entire branch, since every auto-layout diagram in the wild takes this path.

- [ ] **Step 5: Commit**

```bash
git add packages/layout/src/index.ts packages/layout/test/index.test.ts
git commit -m "feat(layout): honor individually-pinned node positions in auto-layout diagrams"
```

## Task 4.5: Repeat Task 4.4's fixture-level tests for lane-relative pinning

- [ ] Add a pool/lane variant of Task 4.4's tests (a pinned node inside a lane, alongside auto-placed siblings) at whichever engine test level makes sense (`packages/layout-engine-swimlane/test/`) — this is the case `resolvePinnedOrigin` (Task 4.3) was specifically built for, and needs its own direct coverage beyond the synthetic fixture in Task 4.3's unit test.
- [ ] Commit: `git commit -m "test(layout-engine-swimlane): cover lane-relative pinned node positioning"`

## Task 4.6: Update `LANGUAGE.md`/`ROADMAP.md`

- [ ] Add a new subsection to `docs/LANGUAGE.md` (near §6, but clearly distinguished from full `positioning: manual` mode) documenting: `at (x, y)` is legal on any node in any diagram; without `positioning: manual`, it pins that one node and leaves everything else auto-laid-out; coordinate origin rules (canvas-absolute / lane-relative) are the same as §6.2; overlaps between a pinned node and its auto-placed neighbors are rejected with the same actionable error as manual mode.
- [ ] Update §11's pre-generation checklist with the new case.
- [ ] Mark roadmap item 7a done in `docs/ROADMAP.md` (7b — nested subprocess — already marked done via Part 2's own doc task).
- [ ] Commit: `git add docs/LANGUAGE.md docs/ROADMAP.md && git commit -m "docs: document partial/mixed manual and auto positioning"`

---

# Final check

- [ ] Run `npm test` from the repo root one last time — confirm the full suite passes with only the intentional new tests added across all four parts.
- [ ] Run through `docs/LANGUAGE.md`'s own §11 pre-generation checklist against one hand-written diagram exercising all four new behaviors together (a pinned node, a nested manual-mode subprocess, an intentional overlap to see the new error message, and a `validate()` call on the result) — this is the closest thing to an end-to-end proof that the four parts compose the way the design doc's "Cross-cutting notes" section claims they do.
- [ ] Report back per `superpowers:requesting-code-review` conventions if that skill is available in the executing environment; otherwise, a plain summary of what shipped vs. what was deferred is sufficient.
