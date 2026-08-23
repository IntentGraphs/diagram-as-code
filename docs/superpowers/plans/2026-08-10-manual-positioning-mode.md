# Manual Positioning Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `positioning: manual` diagram mode where every node carries an exact `at (x, y)` coordinate instead of being auto-laid-out, plus per-edge `[style, corner, from, to]` overrides available in both manual and auto-layout diagrams — with zero behavior change to existing auto-layout diagrams.

**Architecture:** A new package `@bpm/layout-engine-manual`, invoked directly by the `@bpm/layout` facade (not through the `layout-core` engine registry, since it's never auto-detected) when `diagram.positioning === 'manual'`. It reads `node.position` from the AST instead of invoking ELK, and reuses the existing shared orthogonal router and `positionBoundaryEvents` pass unchanged. Per-edge `from`/`to` anchor overrides are consumed by both `boundaryEvents.ts` and `layout-engine-swimlane`'s `laneBanding.ts` (auto-layout's two edge-routing sites) as well as the new manual engine; `style`/`corner` are consumed only by `@bpm/render`.

**Tech Stack:** TypeScript, Vitest, npm workspaces — same as the rest of the monorepo. No new dependencies.

## Global Constraints

- Zero behavior change to existing auto-layout diagrams that don't use `positioning: manual` or edge attribute blocks — every existing test must keep passing unmodified except where a task explicitly says otherwise.
- Follow TDD: write the failing test, run it, confirm it fails for the stated reason, then implement, then confirm green, then commit.
- Node width/height stay auto-sized (reuse `sizeOf` from `@bpm/layout-elk-base`) in manual mode — never user-specified, per the approved design spec.
- Manual mode does not support nested subprocess/transaction content in this version — an expanded subprocess with children in a manual diagram throws a clear error rather than producing silently-wrong geometry. This is a deliberate v1 scope boundary, not an oversight.
- Design reference: `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md`.

---

## Task 1: AST types for position, edge style, and positioning mode

**Files:**
- Modify: `packages/ast/src/types.ts`
- Modify: `packages/ast/src/index.ts`
- Test: `packages/ast/test/types.test.ts`

**Interfaces:**
- Produces: `Position { x: number; y: number }`, `Side = 'left' | 'right' | 'top' | 'bottom'`, `EdgeStyle = 'solid' | 'dashed' | 'dotted'`, `EdgeCorner = 'sharp' | 'round'`, `position?: Position` on every `DiagramNode` variant, `style?: EdgeStyle`, `corner?: EdgeCorner`, `from?: Side`, `to?: Side` on `DiagramEdge`, `positioning?: 'manual'` on `Diagram`.

- [ ] **Step 1: Write the failing test**

Add to `packages/ast/test/types.test.ts`:

```ts
it('supports node positions, edge style overrides, and manual positioning mode', () => {
  const t1: ActivityNode = {
    kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false,
    children: [], childEdges: [], position: { x: 40, y: 40 },
  };
  const edge: DiagramEdge = {
    id: 'e1', sourceId: 't1', targetId: 't1', flowType: 'sequence',
    style: 'dashed', corner: 'round', from: 'right', to: 'top',
  };
  const diagram: Diagram = { pools: [], nodes: [t1], edges: [edge], positioning: 'manual' };

  expect(diagram.positioning).toBe('manual');
  expect(diagram.nodes[0]).toMatchObject({ position: { x: 40, y: 40 } });
  expect(diagram.edges[0]).toMatchObject({ style: 'dashed', corner: 'round', from: 'right', to: 'top' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: FAIL with a TypeScript error (`position` does not exist on type `ActivityNode`, `positioning` does not exist on type `Diagram`, etc.) or a runtime type-check failure — confirms the fields don't exist yet.

- [ ] **Step 3: Implement the type changes**

In `packages/ast/src/types.ts`, add near the top (after `FlowType`):

```ts
export interface Position {
  x: number;
  y: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export type EdgeStyle = 'solid' | 'dashed' | 'dotted';

export type EdgeCorner = 'sharp' | 'round';
```

Add `position?: Position;` as the last field on each of these seven interfaces: `EventNode`, `GatewayNode`, `ActivityNode`, `DataObjectNode`, `DataStoreNode`, `TextAnnotationNode`, `GroupNode`. Example for `EventNode`:

```ts
export interface EventNode {
  kind: 'event';
  id: string;
  label: string;
  category: EventCategory;
  trigger: EventTrigger;
  interrupting: boolean;
  attachedToId?: string;
  position?: Position;
}
```

Update `DiagramEdge`:

```ts
export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  flowType: FlowType;
  /** Optional per-edge line style override; falls back to the flowType default when unset. */
  style?: EdgeStyle;
  /** Optional cosmetic corner-rounding override for orthogonal bends; sharp (today's default) when unset. */
  corner?: EdgeCorner;
  /** Optional override for which side of the source node this edge exits from; auto-picked when unset. */
  from?: Side;
  /** Optional override for which side of the target node this edge enters; auto-picked when unset. */
  to?: Side;
}
```

Update `Diagram`:

```ts
export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  layout?: string;
  /** Optional diagram-level directive: 'manual' means every node must carry an explicit position and no layout engine runs. */
  positioning?: 'manual';
}
```

In `packages/ast/src/index.ts`, add `Position, Side, EdgeStyle, EdgeCorner` to the `export type { ... }` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src/types.ts packages/ast/src/index.ts packages/ast/test/types.test.ts
git commit -m "feat(ast): add node position, edge style/anchor, and manual positioning types"
```

---

## Task 2: Parser token vocabulary for style/corner/side

**Files:**
- Modify: `packages/parser/src/tokens.ts`
- Test: `packages/parser/test/tokens.test.ts` (new file)

**Interfaces:**
- Consumes: `EdgeStyle`, `EdgeCorner`, `Side` from `@bpm/ast` (Task 1).
- Produces: `EDGE_STYLES: EdgeStyle[]`, `EDGE_CORNERS: EdgeCorner[]`, `EDGE_SIDES: Side[]`, `isEdgeStyle(token: string): token is EdgeStyle`, `isEdgeCorner(token: string): token is EdgeCorner`, `isEdgeSide(token: string): token is Side`.

- [ ] **Step 1: Write the failing test**

Create `packages/parser/test/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isEdgeStyle, isEdgeCorner, isEdgeSide } from '../src/tokens.js';

describe('edge attribute token guards', () => {
  it('accepts known values and rejects unknown ones', () => {
    expect(isEdgeStyle('dashed')).toBe(true);
    expect(isEdgeStyle('squiggly')).toBe(false);
    expect(isEdgeCorner('round')).toBe(true);
    expect(isEdgeCorner('curvy')).toBe(false);
    expect(isEdgeSide('left')).toBe(true);
    expect(isEdgeSide('northwest')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/tokens.test.ts`
Expected: FAIL — `isEdgeStyle` is not exported from `../src/tokens.js`.

- [ ] **Step 3: Implement**

In `packages/parser/src/tokens.ts`, update the import line and add at the end:

```ts
import type { EventCategory, EventTrigger, GatewayType, FlowType, EdgeStyle, EdgeCorner, Side } from '@bpm/ast';
```

```ts
export const EDGE_STYLES: EdgeStyle[] = ['solid', 'dashed', 'dotted'];
export const EDGE_CORNERS: EdgeCorner[] = ['sharp', 'round'];
export const EDGE_SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

export function isEdgeStyle(token: string): token is EdgeStyle {
  return (EDGE_STYLES as string[]).includes(token);
}
export function isEdgeCorner(token: string): token is EdgeCorner {
  return (EDGE_CORNERS as string[]).includes(token);
}
export function isEdgeSide(token: string): token is Side {
  return (EDGE_SIDES as string[]).includes(token);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/tokens.ts packages/parser/test/tokens.test.ts
git commit -m "feat(parser): add edge style/corner/side token vocabulary"
```

---

## Task 3: Parser — `positioning: manual` directive

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Produces: `Diagram.positioning` set from a leading `positioning: manual` directive line; a parse error when the value isn't `manual`, and a parse error when both `layout:` and `positioning: manual` directives are present together.

- [ ] **Step 1: Write the failing tests**

Add to `packages/parser/test/parser.test.ts`:

```ts
describe('parse — positioning directive', () => {
  it('parses a leading "positioning: manual" directive', () => {
    const { diagram, errors } = parse('positioning: manual\n\ntask "Review" as t1 at (40, 40)');
    expect(errors).toEqual([]);
    expect(diagram.positioning).toBe('manual');
  });

  it('reports a structured error for an unknown positioning value', () => {
    const { errors } = parse('positioning: bogus\n\ntask "Review" as t1');
    expect(errors).toContainEqual({ line: 1, column: 1, message: 'Unknown positioning mode "bogus"' });
  });

  it('reports a structured error when both layout: and positioning: manual are set', () => {
    const text = 'layout: flat\npositioning: manual\n\ntask "Review" as t1 at (40, 40)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 2, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  });

  it('allows layout: and positioning: manual to appear in either order', () => {
    const text = 'positioning: manual\nlayout: flat\n\ntask "Review" as t1 at (40, 40)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 1, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts -t "positioning directive"`
Expected: FAIL — `diagram.positioning` is `undefined`, no errors reported for `bogus`/combined directives.

- [ ] **Step 3: Implement**

In `packages/parser/src/parser.ts`, add near the other line-pattern constants (after `LAYOUT_DIRECTIVE_LINE`):

```ts
const POSITIONING_DIRECTIVE_LINE = /^positioning:\s*(\S+)$/;
```

Replace the directive-parsing block (currently lines 51–63, the `let layoutMode` through the `if (directiveMatch)` block) with:

```ts
  let layoutMode: string | undefined;
  let positioningMode: string | undefined;
  let positioningLine = 0;

  // Up to two leading directive lines (layout: and/or positioning:), any order, each once.
  // Validation (unknown value, mutual exclusivity) happens after both are collected so the
  // error always points at the positioning: line regardless of which came first.
  const firstContentIndex = lines.findIndex((l) => l.trim() !== '');
  let bodyStartIndex = 0;
  if (firstContentIndex !== -1) {
    let cursor = firstContentIndex;
    while (cursor < lines.length) {
      const trimmed = lines[cursor].trim();
      if (trimmed === '') break;
      const layoutDirectiveMatch = trimmed.match(LAYOUT_DIRECTIVE_LINE);
      if (layoutDirectiveMatch) {
        layoutMode = layoutDirectiveMatch[1];
        cursor += 1;
        continue;
      }
      const positioningDirectiveMatch = trimmed.match(POSITIONING_DIRECTIVE_LINE);
      if (positioningDirectiveMatch) {
        positioningMode = positioningDirectiveMatch[1];
        positioningLine = cursor + 1;
        cursor += 1;
        continue;
      }
      break;
    }
    bodyStartIndex = cursor;
  }

  if (positioningMode !== undefined && positioningMode !== 'manual') {
    errors.push({ line: positioningLine, column: 1, message: `Unknown positioning mode "${positioningMode}"` });
  }
  if (layoutMode !== undefined && positioningMode === 'manual') {
    errors.push({
      line: positioningLine, column: 1,
      message: '"layout:" and "positioning: manual" directives cannot both be set',
    });
  }
```

Update the final return statement (currently line 234):

```ts
  return {
    diagram: {
      pools: (root as any)._pools ?? [], nodes: root.nodes, edges: root.edges,
      layout: layoutMode,
      positioning: positioningMode === 'manual' ? 'manual' : undefined,
    },
    errors,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS — including all pre-existing tests in this file (confirms the two-directive-line change didn't break the single `layout:`-only case).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): add positioning: manual directive"
```

---

## Task 4: Parser — node `at (x, y)` position syntax

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: `positioningMode` from Task 3 (in-scope local variable in `parse()`).
- Produces: every node-declaring line optionally ends with `at (x, y)`; parsed into `position: {x, y}` on the resulting `DiagramNode`. Parse error if present in an auto-layout diagram, parse error if absent (and the node isn't a boundary event) in a manual diagram. Boundary events (`boundary ... on <host>` lines) never accept a position — parse error if one is given.

- [ ] **Step 1: Write the failing tests**

Add to `packages/parser/test/parser.test.ts`:

```ts
describe('parse — node position syntax', () => {
  it('parses "at (x, y)" on a node in a manual-positioning diagram', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)';
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({ id: 't1', position: { x: 40, y: 40 } });
  });

  it('requires a position for every non-boundary node in manual mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 3, column: 1,
      message: 'Node "t1" is missing a required position ("at (x, y)") in a manual-positioning diagram',
    });
  });

  it('rejects a position on a node in an auto-layout diagram', () => {
    const { errors } = parse('task "Review" as t1 at (40, 40)');
    expect(errors).toContainEqual({
      line: 1, column: 1,
      message: 'Node "t1" specifies a position ("at (x, y)"), but this diagram does not use "positioning: manual"',
    });
  });

  it('rejects a position on a boundary event, in either mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)\nboundary timer interrupting "Timeout" as b1 on t1 at (10, 10)';
    const { errors } = parse(text);
    expect(errors).toContainEqual({
      line: 4, column: 1,
      message: 'Boundary event "b1" cannot have a position — it is always placed relative to its host "t1"',
    });
  });

  it('does not require a position for a boundary event in manual mode', () => {
    const text = 'positioning: manual\n\ntask "Review" as t1 at (40, 40)\nboundary timer interrupting "Timeout" as b1 on t1';
    const { errors } = parse(text);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts -t "node position syntax"`
Expected: FAIL — no `position` field parsed, no missing/extra-position errors raised.

- [ ] **Step 3: Implement**

In `packages/parser/src/parser.ts`, add near the top pattern constants:

```ts
const POSITION_SUFFIX = /\s+at\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/;
```

Replace the six match-computation lines (currently `const eventMatch = line.match(EVENT_LINE); ... const edgeMatch = ...`) with:

```ts
    let bodyLine = line;
    let position: { x: number; y: number } | undefined;
    const positionSuffixMatch = bodyLine.match(POSITION_SUFFIX);
    if (positionSuffixMatch) {
      position = { x: Number(positionSuffixMatch[1]), y: Number(positionSuffixMatch[2]) };
      bodyLine = bodyLine.slice(0, positionSuffixMatch.index).trimEnd();
    }

    const eventMatch = bodyLine.match(EVENT_LINE);
    const boundaryMatch = bodyLine.match(BOUNDARY_LINE);
    const gatewayMatch = bodyLine.match(GATEWAY_LINE);
    const activityMatch = bodyLine.match(ACTIVITY_LINE);
    const dataMatch = bodyLine.match(DATA_LINE);
    const edgeMatch = !eventMatch && !boundaryMatch && !gatewayMatch && !activityMatch && !dataMatch
      ? bodyLine.match(EDGE_LINE) : null;
```

Inside the `lines.forEach` callback, immediately after the `addNode` function definition, add:

```ts
    function checkPosition(id: string): boolean {
      if (positioningMode === 'manual' && !position) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Node "${id}" is missing a required position ("at (x, y)") in a manual-positioning diagram`,
        });
        return false;
      }
      if (positioningMode !== 'manual' && position) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Node "${id}" specifies a position ("at (x, y)"), but this diagram does not use "positioning: manual"`,
        });
        return false;
      }
      return true;
    }
```

Update the four non-boundary node branches to check position and attach it. `eventMatch` branch:

```ts
    if (eventMatch) {
      const [, category, trigger, label, id] = eventMatch;
      if (!isEventCategory(category)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event category "${category}"` });
        return;
      }
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!checkPosition(id)) return;
      addNode({ kind: 'event', id, label, category, trigger, interrupting: true, ...(position ? { position } : {}) });
      return;
    }
```

`boundaryMatch` branch — add the position rejection before constructing the node:

```ts
    if (boundaryMatch) {
      const [, trigger, interrupting, label, id, attachedToId] = boundaryMatch;
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!allKnownIds.has(attachedToId)) {
        errors.push({ line: lineNumber, column: 1, message: `Boundary event references unknown activity id "${attachedToId}"` });
        return;
      }
      if (position) {
        errors.push({
          line: lineNumber, column: 1,
          message: `Boundary event "${id}" cannot have a position — it is always placed relative to its host "${attachedToId}"`,
        });
        return;
      }
      addNode({ kind: 'event', id, label, category: 'intermediate', trigger, interrupting: interrupting === 'interrupting', attachedToId });
      return;
    }
```

`gatewayMatch` branch:

```ts
    if (gatewayMatch) {
      const [, gatewayType, label, id] = gatewayMatch;
      if (!isGatewayType(gatewayType)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown gateway type "${gatewayType}"` });
        return;
      }
      if (!checkPosition(id)) return;
      addNode({ kind: 'gateway', id, label, gatewayType, ...(position ? { position } : {}) });
      return;
    }
```

`activityMatch` branch:

```ts
    if (activityMatch) {
      const [, typeToken, label, id, collapsedToken] = activityMatch;
      const activityType = ACTIVITY_TYPE_MAP[typeToken];
      const collapsed = Boolean(collapsedToken);
      if (!checkPosition(id)) return;
      const node: ActivityNode = {
        kind: 'activity', id, label, activityType, collapsed, children: [], childEdges: [],
        ...(position ? { position } : {}),
      };
      addNode(node);
      if (NESTABLE_ACTIVITY_TYPES.includes(activityType) && !collapsed) {
        stack.push({ indent: expectedChildIndent, nodes: [], edges: [], knownIds: new Set(), activity: node });
      }
      return;
    }
```

`dataMatch` branch:

```ts
    if (dataMatch) {
      const [, typeToken, label, id] = dataMatch;
      if (!checkPosition(id)) return;
      addNode({ kind: DATA_KIND_MAP[typeToken], id, label, ...(position ? { position } : {}) } as DiagramNode);
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS — including all pre-existing tests (auto-layout diagrams with no `at (...)` anywhere are completely unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): add node \"at (x, y)\" position syntax with mode-aware validation"
```

---

## Task 5: Parser — edge attribute block `[style, corner, from, to]`

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: `isEdgeStyle`, `isEdgeCorner`, `isEdgeSide` from Task 2.
- Produces: an edge line may end with `[key: value, ...]`; parsed into `style`/`corner`/`from`/`to` on the `DiagramEdge`. Unknown key or value is a parse error.

- [ ] **Step 1: Write the failing tests**

Add to `packages/parser/test/parser.test.ts`:

```ts
describe('parse — edge attribute block', () => {
  it('parses style, corner, from, and to on an edge', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [style: dashed, corner: round, from: right, to: top]'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toMatchObject({ style: 'dashed', corner: 'round', from: 'right', to: 'top' });
  });

  it('parses an edge attribute block alongside a label', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1: "Yes" [style: dashed]'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toMatchObject({ label: 'Yes', style: 'dashed' });
  });

  it('reports a structured error for an unknown attribute key', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [weight: 3]'].join('\n');
    const { errors } = parse(text);
    expect(errors).toContainEqual({ line: 3, column: 1, message: 'Unknown edge attribute "weight"' });
  });

  it('reports a structured error for an unknown style value', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1 [style: wiggly]'].join('\n');
    const { errors } = parse(text);
    expect(errors).toContainEqual({ line: 3, column: 1, message: 'Unknown edge style "wiggly"' });
  });

  it('leaves an edge with no attribute block fully unaffected', () => {
    const text = ['task "A" as a1', 'task "B" as b1', 'a1 -> b1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toEqual({ id: 'e1', sourceId: 'a1', targetId: 'b1', flowType: 'sequence' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts -t "edge attribute block"`
Expected: FAIL — attribute block is left in the line, causing an unrelated "Could not parse line" error or a mismatched edge object.

- [ ] **Step 3: Implement**

In `packages/parser/src/parser.ts`, add the import and constant:

```ts
import { isEventCategory, isEventTrigger, isGatewayType, isEdgeStyle, isEdgeCorner, isEdgeSide, EDGE_ARROW_TO_FLOW_TYPE } from './tokens.js';
import type { Diagram, DiagramNode, DiagramEdge, ActivityType, ActivityNode, Pool, Lane, EdgeStyle, EdgeCorner, Side } from '@bpm/ast';
```

```ts
const EDGE_ATTRS_SUFFIX = /\s*\[([^\]]*)\]\s*$/;
```

Add a module-level helper function (near the top, after the pattern constants):

```ts
interface EdgeAttrs {
  style?: EdgeStyle;
  corner?: EdgeCorner;
  from?: Side;
  to?: Side;
}

function parseEdgeAttrs(raw: string, lineNumber: number, errors: ParseError[]): EdgeAttrs | null {
  const result: EdgeAttrs = {};
  const pairs = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split(':').map((s) => s?.trim());
    if (!rawKey || !rawValue) {
      errors.push({ line: lineNumber, column: 1, message: `Malformed edge attribute "${pair}"` });
      return null;
    }
    if (rawKey === 'style') {
      if (!isEdgeStyle(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge style "${rawValue}"` });
        return null;
      }
      result.style = rawValue;
    } else if (rawKey === 'corner') {
      if (!isEdgeCorner(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge corner "${rawValue}"` });
        return null;
      }
      result.corner = rawValue;
    } else if (rawKey === 'from') {
      if (!isEdgeSide(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge side "${rawValue}" for "from"` });
        return null;
      }
      result.from = rawValue;
    } else if (rawKey === 'to') {
      if (!isEdgeSide(rawValue)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown edge side "${rawValue}" for "to"` });
        return null;
      }
      result.to = rawValue;
    } else {
      errors.push({ line: lineNumber, column: 1, message: `Unknown edge attribute "${rawKey}"` });
      return null;
    }
  }
  return result;
}
```

In the position-stripping block added in Task 4, add attribute-block stripping right after it (still before the six match-computation lines):

```ts
    let edgeAttrsRaw: string | undefined;
    const edgeAttrsMatch = bodyLine.match(EDGE_ATTRS_SUFFIX);
    if (edgeAttrsMatch) {
      edgeAttrsRaw = edgeAttrsMatch[1];
      bodyLine = bodyLine.slice(0, edgeAttrsMatch.index).trimEnd();
    }
```

Update the `edgeMatch` branch:

```ts
    if (edgeMatch) {
      const [, sourceId, arrow, targetId, label] = edgeMatch;
      if (!frame.knownIds.has(sourceId) && !allKnownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!frame.knownIds.has(targetId) && !allKnownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      let attrs: EdgeAttrs = {};
      if (edgeAttrsRaw !== undefined) {
        const parsed = parseEdgeAttrs(edgeAttrsRaw, lineNumber, errors);
        if (parsed === null) return;
        attrs = parsed;
      }
      edgeCounter += 1;
      frame.edges.push({
        id: `e${edgeCounter}`, sourceId, targetId,
        label: label?.trim() || undefined,
        flowType: EDGE_ARROW_TO_FLOW_TYPE[arrow],
        ...attrs,
      });
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS — including all pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): add edge attribute block for style/corner/from/to overrides"
```

---

## Task 6: `layout-core` — shared anchor-side helpers

**Files:**
- Create: `packages/layout-core/src/anchors.ts`
- Modify: `packages/layout-core/src/index.ts`
- Test: `packages/layout-core/test/anchors.test.ts` (new file)

**Interfaces:**
- Consumes: `Side` from `@bpm/ast`; a `{x,y,width,height}`-shaped rect.
- Produces: `sideOf(rect, side, delta?): {x, y}` — the midpoint of the given border (delta shifts vertically, for lane-banding's not-yet-written-back y offsets). `stubFrom(point, side, distance): {x, y}` — a point offset outward from `point` in the direction implied by `side`.

- [ ] **Step 1: Write the failing test**

Create `packages/layout-core/test/anchors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sideOf, stubFrom } from '../src/anchors.js';

const rect = { x: 100, y: 100, width: 50, height: 40 };

describe('sideOf', () => {
  it('returns the midpoint of each border', () => {
    expect(sideOf(rect, 'left')).toEqual({ x: 100, y: 120 });
    expect(sideOf(rect, 'right')).toEqual({ x: 150, y: 120 });
    expect(sideOf(rect, 'top')).toEqual({ x: 125, y: 100 });
    expect(sideOf(rect, 'bottom')).toEqual({ x: 125, y: 140 });
  });

  it('applies a vertical delta to left/right/top/bottom consistently', () => {
    expect(sideOf(rect, 'left', 10)).toEqual({ x: 100, y: 130 });
    expect(sideOf(rect, 'top', 10)).toEqual({ x: 125, y: 110 });
  });
});

describe('stubFrom', () => {
  it('offsets outward from each side', () => {
    expect(stubFrom({ x: 100, y: 120 }, 'left', 14)).toEqual({ x: 86, y: 120 });
    expect(stubFrom({ x: 150, y: 120 }, 'right', 14)).toEqual({ x: 164, y: 120 });
    expect(stubFrom({ x: 125, y: 100 }, 'top', 14)).toEqual({ x: 125, y: 86 });
    expect(stubFrom({ x: 125, y: 140 }, 'bottom', 14)).toEqual({ x: 125, y: 154 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-core/test/anchors.test.ts`
Expected: FAIL — `../src/anchors.js` does not exist.

- [ ] **Step 3: Implement**

Create `packages/layout-core/src/anchors.ts`:

```ts
import type { Side } from '@bpm/ast';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Midpoint of the given border of `rect`. `delta` shifts the y-coordinate before computing —
 * used by swimlane cross-lane routing, where a node's final banded y isn't written back onto
 * the node object until after every edge in the pool has been routed.
 */
export function sideOf(rect: Rect, side: Side, delta = 0): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2 + delta;
  switch (side) {
    case 'left': return { x: rect.x, y: cy };
    case 'right': return { x: rect.x + rect.width, y: cy };
    case 'top': return { x: cx, y: rect.y + delta };
    case 'bottom': return { x: cx, y: rect.y + rect.height + delta };
  }
}

/** A point offset `distance` outward from `point`, in the direction implied by `side`. */
export function stubFrom(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case 'left': return { x: point.x - distance, y: point.y };
    case 'right': return { x: point.x + distance, y: point.y };
    case 'top': return { x: point.x, y: point.y - distance };
    case 'bottom': return { x: point.x, y: point.y + distance };
  }
}
```

In `packages/layout-core/src/index.ts`, add:

```ts
export { sideOf, stubFrom } from './anchors.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-core/test/anchors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/anchors.ts packages/layout-core/src/index.ts packages/layout-core/test/anchors.test.ts
git commit -m "feat(layout-core): add shared sideOf/stubFrom anchor helpers"
```

---

## Task 7: `boundaryEvents.ts` — honor the `to` anchor override

**Files:**
- Modify: `packages/layout-core/src/boundaryEvents.ts`
- Test: `packages/layout-core/test/boundaryEvents.test.ts`

**Interfaces:**
- Consumes: `sideOf` from Task 6; `edge.to` (a `Side | undefined`) already present on every `DiagramEdge` per Task 1.
- Produces: when a boundary-originated edge's `DiagramEdge.to` is set, its target entry point uses that side instead of `sweepEntryPoint`'s auto-picked side.

- [ ] **Step 1: Write the failing test**

Add to `packages/layout-core/test/boundaryEvents.test.ts` (same file/helpers as the existing suite — `activity`, `edgeClipsNode` are already defined there):

```ts
describe('positionBoundaryEvents — edge.to override', () => {
  it('enters the target from the overridden side instead of the auto-picked one', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        {
          kind: 'event', id: 'b1', label: 'Escalate', category: 'intermediate', trigger: 'escalation',
          interrupting: true, attachedToId: 'host',
        },
        { kind: 'activity', id: 'target', label: 'Handler', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      // sweepEntryPoint would auto-pick target's left or right border (never top/bottom);
      // "to: bottom" must override that and produce the bottom border instead.
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 'target', flowType: 'sequence', to: 'bottom' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        activity({ id: 'host', x: 300, y: 80, width: 100, height: 80 }),
        activity({ id: 'target', x: 100, y: 300, width: 100, height: 80 }),
      ],
      edges: [],
    };

    const result = positionBoundaryEvents(diagram, positioned);
    const edge = result.edges.find((e) => e.id === 'e1')!;
    const target = result.nodes.find((n) => n.id === 'target')!;
    const last = edge.points[edge.points.length - 1];
    expect(last).toEqual({ x: target.x + target.width / 2, y: target.y + target.height });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-core/test/boundaryEvents.test.ts -t "edge.to override"`
Expected: FAIL — the route still enters via the auto-picked left/right border, not the bottom.

- [ ] **Step 3: Implement**

In `packages/layout-core/src/boundaryEvents.ts`, add the import:

```ts
import { sideOf } from './anchors.js';
```

Replace the `targetEntry` line inside the routing loop (currently `const targetEntry = sweepEntryPoint(route.start, route.target);`) with:

```ts
      const targetEntry = route.edge.to ? sideOf(route.target, route.edge.to) : sweepEntryPoint(route.start, route.target);
```

(`route.edge` already exists on the `boundaryRoutes` entries — no change needed to how routes are collected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-core/test/boundaryEvents.test.ts`
Expected: PASS — including all pre-existing tests (edges with no `to` set are byte-for-byte unaffected, since the ternary falls back to the exact original call).

- [ ] **Step 5: Commit**

```bash
git add packages/layout-core/src/boundaryEvents.ts packages/layout-core/test/boundaryEvents.test.ts
git commit -m "feat(layout-core): honor edge.to anchor override in boundary-event routing"
```

---

## Task 8: `laneBanding.ts` — honor `from`/`to` anchor overrides

**Files:**
- Modify: `packages/layout-engine-swimlane/src/laneBanding.ts`
- Test: `packages/layout-engine-swimlane/test/laneBanding.test.ts` (new file, or add to existing swimlane test file if one already covers `bandLanes` directly — check `packages/layout-engine-swimlane/test/` first and follow its existing pattern)

**Interfaces:**
- Consumes: `sideOf`, `stubFrom` from Task 6; `edge.from`/`edge.to` from Task 1.
- Produces: a cross-lane edge with `from`/`to` set exits/enters via that side instead of the auto-picked `preferRight`/`goingDown` side.

- [ ] **Step 1: Write the failing test**

First run `ls packages/layout-engine-swimlane/test/` to see existing test files and match their diagram-construction style. Add a test asserting: given a cross-lane edge from `a1` (lane 0) to `b1` (lane 1) with `from: 'left'` set (overriding the auto-computed `preferRight`, which would normally choose `right` since `b1` is to the right of `a1`), the routed edge's first point after the exit stub is on `a1`'s left border, not its right border. Structure the test the same way `packages/layout-engine-swimlane/test/swimlane.test.ts` (or equivalent) builds a pool/lane diagram and calls `bandLanes` or the full `swimlaneEngine.layout`, and assert on `result` edge points using `toEqual`/`toMatchObject` against the known lane geometry, following that file's existing assertion style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-engine-swimlane/test/laneBanding.test.ts` (or wherever the test landed)
Expected: FAIL — the edge still exits from the auto-picked side.

- [ ] **Step 3: Implement**

In `packages/layout-engine-swimlane/src/laneBanding.ts`, add the import:

```ts
import { sideOf, stubFrom } from '@bpm/layout-core';
```

Replace this block (currently around lines 139–154):

```ts
      const goingDown = sourceLane < targetLane;
      const sourceCy = source.y + source.height / 2 + sourceDelta;
      const targetCx = target.x + target.width / 2;
      const preferRight = targetCx >= source.x + source.width / 2;
      const start = preferRight
        ? { x: source.x + source.width, y: sourceCy }
        : { x: source.x, y: sourceCy };
      const exitStub = preferRight
        ? { x: start.x + EDGE_STUB, y: sourceCy }
        : { x: start.x - EDGE_STUB, y: sourceCy };
      const end = goingDown
        ? { x: targetCx, y: target.y + targetDelta }
        : { x: targetCx, y: target.y + target.height + targetDelta };
      const entryStub = goingDown
        ? { x: targetCx, y: end.y - EDGE_STUB }
        : { x: targetCx, y: end.y + EDGE_STUB };
```

with:

```ts
      const goingDown = sourceLane < targetLane;
      const targetCx = target.x + target.width / 2;
      const preferRight = targetCx >= source.x + source.width / 2;
      const autoFromSide: Side = preferRight ? 'right' : 'left';
      const autoToSide: Side = goingDown ? 'top' : 'bottom';
      const fromSide = edge.from ?? autoFromSide;
      const toSide = edge.to ?? autoToSide;
      const start = sideOf(source, fromSide, sourceDelta);
      const exitStub = stubFrom(start, fromSide, EDGE_STUB);
      const end = sideOf(target, toSide, targetDelta);
      const entryStub = stubFrom(end, toSide, EDGE_STUB);
```

Add `Side` to the existing `import type { Diagram } from '@bpm/ast';` line (change to `import type { Diagram, Side } from '@bpm/ast';`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-engine-swimlane`
Expected: PASS — including every pre-existing swimlane test and the full `crossing-regression.test.ts` suite with **unchanged** baseline numbers (edges with no `from`/`to` set reconstruct the exact same `autoFromSide`/`autoToSide` values the old `preferRight`/`goingDown` computed, so `sideOf`/`stubFrom` return the identical points the old inline expressions did).

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/src/laneBanding.ts packages/layout-engine-swimlane/test/
git commit -m "feat(layout-engine-swimlane): honor edge.from/to anchor overrides in cross-lane routing"
```

---

## Task 9: `render` — honor `style`/`corner` overrides

**Files:**
- Modify: `packages/render/src/edges.ts`
- Test: `packages/render/test/edges.test.ts` (check `packages/render/test/` for the existing file name and follow its pattern)

**Interfaces:**
- Consumes: `edge.style`, `edge.corner` (already on `RoutedEdge` since it extends `DiagramEdge`, per Task 1).
- Produces: `style` overrides the flowType-based `stroke-dasharray`; `corner: 'round'` smooths each interior bend of the path with a quadratic-bezier corner-cut instead of a sharp right angle.

- [ ] **Step 1: Write the failing tests**

Add (check the existing render edge test file's import path/style first, then match it):

```ts
describe('renderEdge — style/corner overrides', () => {
  it('overrides the flowType default dash pattern when style is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', style: 'dashed',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('stroke-dasharray="6 4"');
  });

  it('draws a dotted override distinctly from dashed', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', style: 'dotted',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('stroke-dasharray="2 3"');
  });

  it('draws solid (no dasharray) even for a normally-dashed flowType when style: solid is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'message', style: 'solid',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).not.toContain('stroke-dasharray');
  });

  it('uses a sharp right-angle path by default at an orthogonal bend', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('L 50 0 L 50 50');
  });

  it('rounds the bend with a quadratic curve when corner: round is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', corner: 'round',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toMatch(/Q 50 0/);
    expect(body).not.toContain('L 50 0 L 50 50');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/render/test/edges.test.ts -t "style/corner overrides"`
Expected: FAIL — `style`/`corner` are ignored, path is always the sharp-corner polyline.

- [ ] **Step 3: Implement**

In `packages/render/src/edges.ts`, replace the `strokeStyle` computation:

```ts
  const strokeStyle =
    edge.style === 'dashed' ? 'stroke-dasharray="6 4"' :
    edge.style === 'dotted' ? 'stroke-dasharray="2 3"' :
    edge.style === 'solid' ? '' :
    flowType === 'message' ? 'stroke-dasharray="6 4"' :
    flowType === 'association' ? 'stroke-dasharray="1 3"' : '';
```

Add a path-building helper above `renderEdge` and use it in place of the existing inline `pathD` computation:

```ts
const CORNER_RADIUS = 10;

/** Sharp-cornered polyline (today's default): straight `L` segments through every point. */
function sharpPathD(points: Array<{ x: number; y: number }>): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Cosmetic corner-rounding: at each interior bend, stop CORNER_RADIUS short of the corner on
 * the incoming segment, quadratic-curve through the corner point, and resume CORNER_RADIUS
 * past it on the outgoing segment. Never changes the underlying route, only how it's drawn —
 * segments shorter than 2*CORNER_RADIUS just curve through their full length instead.
 */
function roundedPathD(points: Array<{ x: number; y: number }>): string {
  if (points.length < 3) return sharpPathD(points);
  const segs: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLen = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    const before = {
      x: corner.x + (r / inLen) * (prev.x - corner.x),
      y: corner.y + (r / inLen) * (prev.y - corner.y),
    };
    const after = {
      x: corner.x + (r / outLen) * (next.x - corner.x),
      y: corner.y + (r / outLen) * (next.y - corner.y),
    };
    segs.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }
  const last = points[points.length - 1];
  segs.push(`L ${last.x} ${last.y}`);
  return segs.join(' ');
}
```

Replace `const pathD = points.map((p, i) => ...).join(' ');` with:

```ts
  const pathD = edge.corner === 'round' ? roundedPathD(points) : sharpPathD(points);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/render/test/edges.test.ts`
Expected: PASS — including all pre-existing tests (no `style`/`corner` set reconstructs today's exact `strokeStyle`/`sharpPathD` output).

- [ ] **Step 5: Commit**

```bash
git add packages/render/src/edges.ts packages/render/test/edges.test.ts
git commit -m "feat(render): honor edge.style/corner overrides"
```

---

## Task 10: `layout-engine-manual` — package scaffold and flat (non-pool) node placement

**Files:**
- Create: `packages/layout-engine-manual/package.json`
- Create: `packages/layout-engine-manual/tsconfig.json`
- Create: `packages/layout-engine-manual/src/index.ts`
- Create: `packages/layout-engine-manual/src/engine.ts`
- Test: `packages/layout-engine-manual/test/engine.test.ts`

**Interfaces:**
- Consumes: `sizeOf` from `@bpm/layout-elk-base`; `sideOf`, `stubFrom`, `createSequentialRouter`, `PositionedDiagram`, `PositionedNode`, `RoutedEdge` from `@bpm/layout-core`; `Diagram`, `DiagramNode` from `@bpm/ast`.
- Produces: `layoutManual(diagram: Diagram): Promise<PositionedDiagram>` — places every top-level (non-pool) node at its `position`, routes top-level edges with the shared router, throws on a missing position or an expanded subprocess with children.

- [ ] **Step 1: Scaffold the package**

Create `packages/layout-engine-manual/package.json`:

```json
{
  "name": "@bpm/layout-engine-manual",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-elk-base": "*"
  }
}
```

Create `packages/layout-engine-manual/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

Run `npm install` from the repo root so the new workspace package is linked.

- [ ] **Step 2: Write the failing test**

Create `packages/layout-engine-manual/test/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { layoutManual } from '../src/engine.js';

describe('layoutManual — flat (non-pool) diagrams', () => {
  it('places each node at its given position with auto-sized width/height', async () => {
    const diagram: Diagram = {
      pools: [],
      positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'gateway', id: 'g1', label: 'OK?', gatewayType: 'exclusive', position: { x: 220, y: 50 } },
      ],
      edges: [{ id: 'e1', sourceId: 't1', targetId: 'g1', flowType: 'sequence' }],
    };

    const positioned = await layoutManual(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    const g1 = positioned.nodes.find((n) => n.id === 'g1')!;

    expect(t1.x).toBe(40);
    expect(t1.y).toBe(40);
    expect(t1.width).toBeGreaterThan(0);
    expect(t1.height).toBeGreaterThan(0);
    expect(g1.x).toBe(220);
    expect(g1.y).toBe(50);

    const edge = positioned.edges.find((e) => e.id === 'e1')!;
    expect(edge.points.length).toBeGreaterThanOrEqual(2);
    expect(edge.points[0]).toEqual({ x: t1.x + t1.width, y: t1.y + t1.height / 2 });
  });

  it('throws a clear error when a node has no position', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [{ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] }],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(
      'Node "t1" has no position — every node needs "at (x, y)" in a manual-positioning diagram.',
    );
  });

  it('throws a clear error for an expanded subprocess with children', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [{
        kind: 'activity', id: 'sp1', label: 'Sub', activityType: 'subProcess', collapsed: false,
        position: { x: 0, y: 0 },
        children: [{ kind: 'activity', id: 'c1', label: 'Inner', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 10, y: 10 } }],
        childEdges: [],
      }],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/does not yet support nested content/);
  });

  it('throws a clear error when two nodes overlap', async () => {
    const diagram: Diagram = {
      pools: [], positioning: 'manual',
      nodes: [
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 50, y: 50 } },
      ],
      edges: [],
    };
    await expect(layoutManual(diagram)).rejects.toThrow(/overlap/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/layout-engine-manual/test/engine.test.ts`
Expected: FAIL — `../src/engine.js` does not exist.

- [ ] **Step 4: Implement**

Create `packages/layout-engine-manual/src/engine.ts`:

```ts
import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '@bpm/layout-core';
import { sideOf, stubFrom, createSequentialRouter } from '@bpm/layout-core';
import { sizeOf } from '@bpm/layout-elk-base';

const EDGE_STUB = 14;

function isBoundaryEvent(node: DiagramNode): boolean {
  return node.kind === 'event' && node.attachedToId !== undefined;
}

/** Places one node (and validates it) at `originX/originY + node.position`. No pool/lane context. */
export function placeNode(node: DiagramNode, originX: number, originY: number): PositionedNode {
  if (isBoundaryEvent(node)) {
    throw new Error(`Boundary event "${node.id}" cannot be manually positioned — it is always placed relative to its host.`);
  }
  if (!node.position) {
    throw new Error(`Node "${node.id}" has no position — every node needs "at (x, y)" in a manual-positioning diagram.`);
  }
  if (node.kind === 'activity' && !node.collapsed && node.children.length > 0) {
    throw new Error(`Node "${node.id}" is an expanded subprocess/transaction — manual positioning does not yet support nested content.`);
  }
  const { width, height } = sizeOf(node);
  return { ...node, x: originX + node.position.x, y: originY + node.position.y, width, height } as PositionedNode;
}

function assertNoOverlaps(nodes: PositionedNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) {
        throw new Error(`Nodes "${a.id}" and "${b.id}" overlap at their given positions.`);
      }
    }
  }
}

function routeFlatEdges(
  edges: Diagram['edges'],
  nodeById: Map<string, PositionedNode>,
): RoutedEdge[] {
  const router = createSequentialRouter();
  return edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return { ...edge, points: [] };
    const targetCx = target.x + target.width / 2;
    const sourceCx = source.x + source.width / 2;
    const autoFromSide = targetCx >= sourceCx ? 'right' : 'left';
    const autoToSide = targetCx >= sourceCx ? 'left' : 'right';
    const fromSide = edge.from ?? autoFromSide;
    const toSide = edge.to ?? autoToSide;
    const start = sideOf(source, fromSide);
    const exitStub = stubFrom(start, fromSide, EDGE_STUB);
    const end = sideOf(target, toSide);
    const entryStub = stubFrom(end, toSide, EDGE_STUB);
    const obstacles = [...nodeById.values()].filter((n) => n.id !== source.id && n.id !== target.id);
    const middle = router.route(exitStub, entryStub, obstacles);
    return { ...edge, points: [start, ...middle, end] };
  });
}

export async function layoutManual(diagram: Diagram): Promise<PositionedDiagram> {
  const laneNodeIds = new Set(diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds)));
  const unassigned = diagram.nodes.filter((n) => !laneNodeIds.has(n.id) && !isBoundaryEvent(n));
  const placed = unassigned.map((n) => placeNode(n, 0, 0));

  assertNoOverlaps(placed);

  const nodeById = new Map(placed.map((n) => [n.id, n]));
  const edges = routeFlatEdges(diagram.edges, nodeById);

  return { pools: [], nodes: placed, edges };
}
```

Create `packages/layout-engine-manual/src/index.ts`:

```ts
export { layoutManual, placeNode } from './engine.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/layout-engine-manual/test/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/layout-engine-manual
git commit -m "feat(layout-engine-manual): scaffold package with flat node placement and edge routing"
```

---

## Task 11: `layout-engine-manual` — pool/lane-relative stacking

**Files:**
- Create: `packages/layout-engine-manual/src/laneStacking.ts`
- Modify: `packages/layout-engine-manual/src/engine.ts`
- Test: `packages/layout-engine-manual/test/laneStacking.test.ts`

**Interfaces:**
- Consumes: `placeNode` from Task 10; `Diagram`, `Pool` from `@bpm/ast`; `PositionedPool`, `PositionedLane`, `PositionedNode` from `@bpm/layout-core`.
- Produces: `stackLanes(diagram, placeNode): { positionedPool: PositionedPool; placedNodes: PositionedNode[] }[]` — lanes auto-stack top-to-bottom and auto-size to content; a node's `at (x, y)` is relative to its lane's own top-left.

- [ ] **Step 1: Write the failing test**

Create `packages/layout-engine-manual/test/laneStacking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { stackLanes } from '../src/laneStacking.js';
import { placeNode } from '../src/engine.js';

describe('stackLanes', () => {
  it('positions a node relative to its own lane, and stacks a second lane below the first', () => {
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'Order-to-Cash',
        lanes: [
          { id: 'lane1', name: 'Sales', nodeIds: ['t1'] },
          { id: 'lane2', name: 'Fulfillment', nodeIds: ['t2'] },
        ],
      }],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
        { kind: 'activity', id: 't2', label: 'Ship', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      ],
      edges: [],
    };

    const [pool] = stackLanes(diagram, placeNode);
    const t1 = pool.placedNodes.find((n) => n.id === 't1')!;
    const t2 = pool.placedNodes.find((n) => n.id === 't2')!;

    // Both nodes were placed at lane-relative (40, 40); lane2 is not at canvas y=40 too —
    // it's stacked below lane1's full height.
    expect(t1.x).toBe(40);
    expect(t2.x).toBe(40);
    expect(t2.y).toBeGreaterThan(t1.y);
    expect(pool.positionedPool.lanes).toHaveLength(2);
    expect(pool.positionedPool.lanes[1].y).toBeGreaterThan(pool.positionedPool.lanes[0].y);
    // lane2's band starts at or below lane1's band's bottom edge.
    expect(pool.positionedPool.lanes[1].y).toBeGreaterThanOrEqual(
      pool.positionedPool.lanes[0].y + pool.positionedPool.lanes[0].height,
    );
  });

  it('never lets a later lane\'s content collide with an earlier lane\'s content', () => {
    const diagram: Diagram = {
      positioning: 'manual',
      pools: [{
        id: 'pool1', name: 'P',
        lanes: [
          { id: 'lane1', name: 'Tall', nodeIds: ['t1'] },
          { id: 'lane2', name: 'Short', nodeIds: ['t2'] },
        ],
      }],
      nodes: [
        // t1 placed far down within its own lane (tests that lane1's height grows to fit it).
        { kind: 'activity', id: 't1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 400 } },
        { kind: 'activity', id: 't2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      ],
      edges: [],
    };

    const [pool] = stackLanes(diagram, placeNode);
    const t1 = pool.placedNodes.find((n) => n.id === 't1')!;
    const t2 = pool.placedNodes.find((n) => n.id === 't2')!;
    expect(t2.y).toBeGreaterThanOrEqual(t1.y + t1.height);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-engine-manual/test/laneStacking.test.ts`
Expected: FAIL — `../src/laneStacking.js` does not exist.

- [ ] **Step 3: Implement**

Create `packages/layout-engine-manual/src/laneStacking.ts`:

```ts
import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedNode, PositionedPool, PositionedLane } from '@bpm/layout-core';

const LANE_PADDING = 20;
const POOL_TOP_PADDING = 12;
const POOL_X = 0;

export interface StackedPool {
  positionedPool: PositionedPool;
  placedNodes: PositionedNode[];
}

export function stackLanes(
  diagram: Diagram,
  placeNode: (node: DiagramNode, originX: number, originY: number) => PositionedNode,
): StackedPool[] {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  return diagram.pools.map((pool) => {
    let currentY = POOL_TOP_PADDING;
    const lanes: PositionedLane[] = [];
    const placedNodes: PositionedNode[] = [];
    let poolContentWidth = 0;

    for (const lane of pool.lanes) {
      const laneNodes = lane.nodeIds
        .map((id) => nodeById.get(id))
        .filter((n): n is DiagramNode => Boolean(n));
      const laneOriginY = currentY;
      const placed = laneNodes.map((n) => placeNode(n, POOL_X, laneOriginY));

      const contentBottom = placed.length > 0 ? Math.max(...placed.map((n) => n.y - laneOriginY + n.height)) : 0;
      const contentRight = placed.length > 0 ? Math.max(...placed.map((n) => n.x - POOL_X + n.width)) : 0;
      const laneHeight = contentBottom + LANE_PADDING * 2;
      poolContentWidth = Math.max(poolContentWidth, contentRight);

      lanes.push({ id: lane.id, name: lane.name, x: POOL_X, y: laneOriginY, width: 0, height: laneHeight });
      placedNodes.push(...placed);
      currentY += laneHeight;
    }

    const poolWidth = poolContentWidth + LANE_PADDING * 2;
    const finalLanes = lanes.map((l) => ({ ...l, width: poolWidth }));

    return {
      positionedPool: { id: pool.id, name: pool.name, x: POOL_X, y: 0, width: poolWidth, height: currentY, lanes: finalLanes },
      placedNodes,
    };
  });
}
```

In `packages/layout-engine-manual/src/engine.ts`, update `layoutManual` to include pooled nodes and route edges across all placed nodes (not just the unassigned/flat ones). `routeFlatEdges` from Task 10 already takes a plain `Map<string, PositionedNode>` regardless of whether those nodes came from pools or not, so it needs no signature change — only the `layoutManual` body changes, to build that map from the combined node set:

```ts
import { stackLanes } from './laneStacking.js';
```

Replace the body of `layoutManual`:

```ts
export async function layoutManual(diagram: Diagram): Promise<PositionedDiagram> {
  const laneNodeIds = new Set(diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds)));
  const unassigned = diagram.nodes.filter((n) => !laneNodeIds.has(n.id) && !isBoundaryEvent(n));
  const placedLoose = unassigned.map((n) => placeNode(n, 0, 0));

  const stackedPools = stackLanes(diagram, placeNode);
  const placedPooled = stackedPools.flatMap((p) => p.placedNodes);

  const allPlaced = [...placedLoose, ...placedPooled];
  assertNoOverlaps(allPlaced);

  const nodeById = new Map(allPlaced.map((n) => [n.id, n]));
  const edges = routeFlatEdges(diagram.edges, nodeById);

  return {
    pools: stackedPools.map((p) => p.positionedPool),
    nodes: allPlaced,
    edges,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-engine-manual`
Expected: PASS — all tests in the package, including Task 10's.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-manual/src/laneStacking.ts packages/layout-engine-manual/src/engine.ts packages/layout-engine-manual/test/laneStacking.test.ts
git commit -m "feat(layout-engine-manual): add pool/lane-relative stacking"
```

---

## Task 12: Wire `positioning: manual` into the `@bpm/layout` facade

**Files:**
- Modify: `packages/layout/src/index.ts`
- Modify: `packages/layout/package.json`
- Test: `packages/layout/test/facade.test.ts`

**Interfaces:**
- Consumes: `layoutManual` from `@bpm/layout-engine-manual` (Tasks 10–11).
- Produces: `layout(diagram)` routes to `layoutManual` when `diagram.positioning === 'manual'`, bypassing `selectEngine` entirely; auto-layout diagrams are completely unaffected.

- [ ] **Step 1: Write the failing test**

Add to `packages/layout/test/facade.test.ts`:

```ts
it('routes a manual-positioning diagram to the manual engine, bypassing engine selection', async () => {
  const diagram: Diagram = {
    pools: [], positioning: 'manual',
    nodes: [{ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } }],
    edges: [],
  };
  const positioned = await layout(diagram);
  const t1 = positioned.nodes.find((n) => n.id === 't1')!;
  expect(t1.x).toBe(40);
  expect(t1.y).toBe(40);
});

it('still runs positionBoundaryEvents on top of a manual-positioning diagram', async () => {
  const diagram: Diagram = {
    pools: [], positioning: 'manual',
    nodes: [
      { kind: 'activity', id: 'host', label: 'Host', activityType: 'task', collapsed: false, children: [], childEdges: [], position: { x: 40, y: 40 } },
      { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 'host' },
    ],
    edges: [],
  };
  const positioned = await layout(diagram);
  expect(positioned.nodes.some((n) => n.id === 'b1')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout/test/facade.test.ts -t "manual"`
Expected: FAIL — `selectEngine` throws (`No layout engine matched this diagram`, since no registered engine's `matches()` returns true for a diagram with `positioning: 'manual'` — `swimlaneEngine.matches` requires pools+lanes, `flatEngine.matches` always returns true, so it would actually run `flatEngine`'s ELK-based layout and ignore `position` entirely, producing wrong coordinates and failing the `x`/`y` assertions).

- [ ] **Step 3: Implement**

In `packages/layout/package.json`, add `"@bpm/layout-engine-manual": "*"` to `dependencies`.

In `packages/layout/src/index.ts`:

```ts
import type { Diagram } from '@bpm/ast';
import {
  registerEngine,
  selectEngine,
  getEngineByName,
  positionBoundaryEvents,
  type PositionedDiagram,
} from '@bpm/layout-core';
import { swimlaneEngine } from '@bpm/layout-engine-swimlane';
import { flatEngine } from '@bpm/layout-engine-flat';
import { layoutManual } from '@bpm/layout-engine-manual';

/** Re-registers defaults so layout still works after tests call clearEngines(). */
function ensureDefaultEngines(): void {
  registerEngine(swimlaneEngine);
  registerEngine(flatEngine);
}

ensureDefaultEngines();

export interface LayoutOptions {
  /**
   * Forces a specific registered engine by name, overriding both the diagram's own
   * `layout:` directive and auto-detect. Throws the same "Unknown layout engine"
   * error as an unrecognized `layout:` directive if no engine with that name exists.
   * Ignored (and meaningless) when `diagram.positioning === 'manual'`.
   */
  engineOverride?: string;
}

export async function layout(diagram: Diagram, options?: LayoutOptions): Promise<PositionedDiagram> {
  if (diagram.positioning === 'manual') {
    const positioned = await layoutManual(diagram);
    return positionBoundaryEvents(diagram, positioned);
  }
  ensureDefaultEngines();
  const engine = options?.engineOverride ? getEngineByName(options.engineOverride) : selectEngine(diagram);
  const positioned = await engine.layout(diagram);
  // Boundary events always attach to the host's *final* border (after banding).
  return positionBoundaryEvents(diagram, positioned);
}

export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from '@bpm/layout-core';

export { selectEngine, getEngineByName } from '@bpm/layout-core';
```

Run `npm install` from the repo root so the new dependency is linked.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout/test/facade.test.ts`
Expected: PASS — including all pre-existing facade tests.

- [ ] **Step 5: Commit**

```bash
git add packages/layout/src/index.ts packages/layout/package.json packages/layout/test/facade.test.ts package-lock.json
git commit -m "feat(layout): route positioning: manual diagrams to the manual engine"
```

---

## Task 13: Full regression, docs update, and final verification

**Files:**
- Modify: `docs/STATUS.md`
- No other file changes — this task is verification plus one doc update.

- [ ] **Step 1: Build every workspace**

Run: `npm run build --workspaces --if-present`
Expected: succeeds with no errors, including the new `@bpm/layout-engine-manual` package.

- [ ] **Step 2: Run the full test suite three times**

Run: `npm test` (three times in a row)
Expected: all three runs pass identically (same pass count each time — this is the check that ruled out nondeterminism in the earlier boundary-routing fix this session; apply the same discipline here). Every pre-existing test must still pass unmodified — this is the proof that auto-layout diagrams and non-attribute-block edges are byte-for-byte unaffected. The `layout-engine-swimlane` crossing-regression baseline numbers must be **identical** to their current values (no change expected — Task 8 only takes a new code path when `edge.from`/`edge.to` is actually set, which none of the verification diagrams use).

- [ ] **Step 3: Manual end-to-end smoke check**

Write a throwaway diagram to a scratch file and run it through the pipeline directly (mirrors how this session verified the boundary-routing fix):

```bash
node -e "
import(process.cwd() + '/packages/parser/dist/index.js').then(async ({ parse }) => {
  const { layout } = await import(process.cwd() + '/packages/layout/dist/index.js');
  const { render } = await import(process.cwd() + '/packages/render/dist/index.js');
  const text = [
    'positioning: manual',
    '',
    'pool \"Order-to-Cash\"',
    '  lane \"Sales\"',
    '    task \"Review order\" as t1 at (40, 40)',
    '    gateway exclusive \"Approved?\" as g1 at (220, 40)',
    '  lane \"Fulfillment\"',
    '    task \"Ship item\" as t2 at (40, 40)',
    '',
    't1 -> g1',
    'g1 -> t2 [style: dashed, from: bottom, to: top]',
  ].join('\n');
  const { diagram, errors } = parse(text);
  if (errors.length) { console.error('parse errors', errors); process.exit(1); }
  const positioned = await layout(diagram);
  const svg = render(positioned);
  console.log('rendered', svg.length, 'bytes of SVG, nodes:', positioned.nodes.map((n) => n.id));
});
"
```

Expected: prints `rendered <n> bytes of SVG, nodes: [ 't1', 'g1', 't2' ]` with no thrown errors. This confirms the whole pipeline (parse → manual layout → boundary pass → render) works end-to-end, not just each package's unit tests in isolation.

- [ ] **Step 4: Update `docs/STATUS.md`**

Add a bullet to the "What's built" section (after the existing "Layout" bullet list, following the doc's existing style) describing the new capability:

```markdown
- **Manual positioning mode**: an opt-in `positioning: manual` diagram directive places every node at an exact `at (x, y)` coordinate instead of auto-layout; pools/lanes still auto-stack top-to-bottom with coordinates relative to each lane's own origin. Any diagram (manual or auto-layout) can also override an individual edge's line style (`style: dashed|dotted|solid`, `corner: round`) and which side of a box it exits/enters from (`from`/`to: left|right|top|bottom`) via a `[...]` attribute block. Nested subprocess content is not yet supported in manual mode (throws a clear error rather than producing wrong geometry) — see `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: note manual positioning mode and edge attribute overrides in STATUS"
```
