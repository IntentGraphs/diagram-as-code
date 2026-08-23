# Pluggable Layout Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `@bpm/layout` package into a pluggable engine architecture (`layout-core` + `layout-elk-base` + `layout-engine-swimlane` + `layout-engine-flat` + thin `@bpm/layout` facade) while preserving today's verified layout behavior, renaming the `layout:` directive to engine names (`swimlane` / `flat`), and surfacing unknown engine names at layout-time instead of parse-time.

**Architecture:** Engines implement a `LayoutEngine` contract and register with `layout-core`. The facade selects an engine (explicit directive override, else first `matches`), runs it, then applies shared `positionBoundaryEvents`. ELK scaffolding lives in `layout-elk-base` (not a registered engine). `@bpm/layout` keeps its package name so `@bpm/render` and `apps/web` need no import-path changes.

**Tech Stack:** TypeScript, npm workspaces, Vitest, elkjs, Vite (apps/web).

## Global Constraints

- Pure architectural restructure — preserve stacked-band, flat/linear, and boundary-event behavior exactly (only deliberate change: unknown engine name fails at layout-time, not parse-time).
- Layout quality improvements (edge-edge crossing reduction, etc.) are out of scope.
- No new engines beyond `swimlane` and `flat`.
- `@bpm/layout` public API stays `layout(diagram): Promise<PositionedDiagram>` plus the same type re-exports.
- Parser must not know about registered engines — only checks `layout: <identifier>` is well-formed.
- Web preview must never blank on layout-time errors (same "keep last valid diagram" behavior as parse errors).
- Geometric analyzer from a prior session is **not checked into this repo** — verification is the relocated unit suites + facade smoke tests + full 42-test monorepo run. Do not invent a new analyzer in this plan.

---

## File Structure

```
packages/
  ast/
    src/types.ts                         # layout?: string (drop LayoutMode)
    src/index.ts                         # stop exporting LayoutMode
  parser/
    src/parser.ts                        # accept any identifier; no closed-list error
    test/parser.test.ts                  # swimlane/flat; unknown name is NOT a parse error
  layout-core/                           # NEW
    package.json
    tsconfig.json
    src/types.ts                         # moved from layout/src/types.ts
    src/engine.ts                        # LayoutEngine + registerEngine/selectEngine/clearEngines
    src/boundaryEvents.ts                # moved unchanged from layout
    src/index.ts
    test/registry.test.ts
  layout-elk-base/                       # NEW
    package.json
    tsconfig.json
    src/toElkGraph.ts                    # moved from layout
    src/fromElkLayout.ts                 # moved; import types from @bpm/layout-core
    src/index.ts                         # export toElkGraph, fromElkLayout, runElkLayout helper
  layout-engine-swimlane/                # NEW
    package.json
    tsconfig.json
    src/laneBanding.ts                   # moved; remove diagram.layout === 'linear' early-return
    src/engine.ts                        # swimlane LayoutEngine
    src/index.ts
    test/swimlane.test.ts                # pool/lane banding cases moved from layout.test.ts
  layout-engine-flat/                    # NEW
    package.json
    tsconfig.json
    src/engine.ts                        # flat LayoutEngine
    src/index.ts
    test/flat.test.ts                    # no-pool / boundary cases moved from layout.test.ts
  layout/                                # becomes thin facade
    package.json                         # deps: layout-core + both engines (drop elkjs)
    src/index.ts                         # register engines; layout(); re-export types
    test/facade.test.ts                  # smoke: auto-detect, override, unknown throws
  render/                                # unchanged imports (@bpm/layout)
  ...
apps/web/
  src/pipeline.ts                        # catch layout-time errors
  test/pipeline.test.ts                  # NEW: unknown engine surfaces without svg
  vite.config.ts                         # aliases for new packages
```

Dependency direction (never invert):

```
ast ← parser
ast ← layout-core ← layout-elk-base ← layout-engine-{swimlane,flat} ← layout ← render / apps/web
```

---

### Task 1: AST — `Diagram.layout` becomes a raw string

**Files:**
- Modify: `packages/ast/src/types.ts`
- Modify: `packages/ast/src/index.ts`

**Interfaces:**
- Produces: `Diagram.layout?: string` (engine-name override; unvalidated). Removes `LayoutMode`.

- [ ] **Step 1: Update `Diagram.layout` and remove `LayoutMode`**

In `packages/ast/src/types.ts`, replace:

```ts
export type LayoutMode = 'stacked' | 'linear';

export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** How pool/lane content is arranged. Defaults to 'stacked' when omitted. */
  layout?: LayoutMode;
}
```

with:

```ts
export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /**
   * Optional layout-engine name override (from a leading `layout: <name>` directive).
   * Unvalidated at parse-time — `selectEngine` resolves it against registered engines.
   */
  layout?: string;
}
```

In `packages/ast/src/index.ts`, remove `LayoutMode` from the type export list.

- [ ] **Step 2: Build and confirm AST still compiles**

Run: `npm run build -w @bpm/ast`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add packages/ast/src/types.ts packages/ast/src/index.ts
git commit -m "$(cat <<'EOF'
refactor(ast): store layout directive as unvalidated engine name string

EOF
)"
```

---

### Task 2: Parser — accept any `layout:` identifier

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Modify: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: `Diagram.layout?: string` from Task 1
- Produces: parse stores raw directive value; no closed-list validation; unknown names are not parse errors

- [ ] **Step 1: Update failing tests first**

Replace the layout-directive tests in `packages/parser/test/parser.test.ts` with:

```ts
  it('parses a leading "layout: swimlane" directive', () => {
    const text = ['layout: swimlane', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('swimlane');
    expect(diagram.nodes).toHaveLength(1);
  });

  it('parses a leading "layout: flat" directive', () => {
    const text = ['layout: flat', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('flat');
  });

  it('tolerates leading blank lines before the directive', () => {
    const text = ['', '  ', 'layout: flat', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('flat');
  });

  it('stores an unrecognized engine name without a parse error', () => {
    const text = ['layout: diagonal', 'task "Review" as n1'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.layout).toBe('diagonal');
  });

  it('does not treat "layout:" appearing after the first line as a directive', () => {
    const text = ['task "Review" as n1', 'layout: flat'].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors.length).toBeGreaterThan(0);
    expect(diagram.layout).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests — expect failures on old vocabulary / closed-list behavior**

Run: `npm test -w @bpm/parser -- packages/parser/test/parser.test.ts`
Expected: FAIL (still validates stacked/linear; rejects diagonal)

- [ ] **Step 3: Implement parser change**

In `packages/parser/src/parser.ts`, replace the directive block:

```ts
  let layoutMode: 'stacked' | 'linear' | undefined;

  // The layout directive, if present, must be the very first non-blank line.
  const firstContentIndex = lines.findIndex((l) => l.trim() !== '');
  let bodyStartIndex = 0;
  if (firstContentIndex !== -1) {
    const directiveMatch = lines[firstContentIndex].trim().match(LAYOUT_DIRECTIVE_LINE);
    if (directiveMatch) {
      const value = directiveMatch[1];
      if (value === 'stacked' || value === 'linear') {
        layoutMode = value;
      } else {
        errors.push({ line: firstContentIndex + 1, column: 1, message: `Unknown layout mode "${value}" (expected "stacked" or "linear")` });
      }
      bodyStartIndex = firstContentIndex + 1;
    }
  }
```

with:

```ts
  let layoutMode: string | undefined;

  // The layout directive, if present, must be the very first non-blank line.
  // Value is an opaque engine-name string — validation happens at layout-time.
  const firstContentIndex = lines.findIndex((l) => l.trim() !== '');
  let bodyStartIndex = 0;
  if (firstContentIndex !== -1) {
    const directiveMatch = lines[firstContentIndex].trim().match(LAYOUT_DIRECTIVE_LINE);
    if (directiveMatch) {
      layoutMode = directiveMatch[1];
      bodyStartIndex = firstContentIndex + 1;
    }
  }
```

(`LAYOUT_DIRECTIVE_LINE = /^layout:\s*(\S+)$/` stays as-is — that is the well-formedness check.)

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -w @bpm/parser -- packages/parser/test/parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "$(cat <<'EOF'
feat(parser): treat layout directive as opaque engine name

EOF
)"
```

---

### Task 3: `@bpm/layout-core` — types, registry, boundary events

**Files:**
- Create: `packages/layout-core/package.json`
- Create: `packages/layout-core/tsconfig.json`
- Create: `packages/layout-core/src/types.ts` (move from `packages/layout/src/types.ts`)
- Create: `packages/layout-core/src/engine.ts`
- Create: `packages/layout-core/src/boundaryEvents.ts` (move from `packages/layout/src/boundaryEvents.ts`)
- Create: `packages/layout-core/src/index.ts`
- Create: `packages/layout-core/test/registry.test.ts`

**Interfaces:**
- Consumes: `Diagram` from `@bpm/ast`
- Produces:
  - `interface LayoutEngine { name: string; matches(diagram: Diagram): boolean; layout(diagram: Diagram): Promise<PositionedDiagram> }`
  - `registerEngine(engine: LayoutEngine): void`
  - `clearEngines(): void` (test isolation)
  - `selectEngine(diagram: Diagram): LayoutEngine`
  - positioned types + `positionBoundaryEvents(diagram, positioned): PositionedDiagram`

- [ ] **Step 1: Scaffold the package**

`packages/layout-core/package.json`:
```json
{
  "name": "@bpm/layout-core",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": { "@bpm/ast": "*" }
}
```

`packages/layout-core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

Copy `packages/layout/src/types.ts` → `packages/layout-core/src/types.ts` unchanged.
Copy `packages/layout/src/boundaryEvents.ts` → `packages/layout-core/src/boundaryEvents.ts`, changing the types import to `./types.js` (same relative path as before).

- [ ] **Step 2: Write failing registry tests**

`packages/layout-core/test/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Diagram } from '@bpm/ast';
import {
  registerEngine, clearEngines, selectEngine, type LayoutEngine,
} from '../src/index.js';
import type { PositionedDiagram } from '../src/types.js';

const emptyPositioned: PositionedDiagram = { pools: [], nodes: [], edges: [] };

function fakeEngine(name: string, matches: (d: Diagram) => boolean): LayoutEngine {
  return {
    name,
    matches,
    async layout() { return emptyPositioned; },
  };
}

const baseDiagram: Diagram = { pools: [], nodes: [], edges: [] };
const pooledDiagram: Diagram = {
  pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: [] }] }],
  nodes: [],
  edges: [],
};

describe('selectEngine', () => {
  beforeEach(() => clearEngines());

  it('picks the first registered engine whose matches() returns true', () => {
    registerEngine(fakeEngine('swimlane', (d) => d.pools.some((p) => p.lanes.length > 0)));
    registerEngine(fakeEngine('flat', () => true));
    expect(selectEngine(pooledDiagram).name).toBe('swimlane');
    expect(selectEngine(baseDiagram).name).toBe('flat');
  });

  it('honors an explicit diagram.layout override over matches()', () => {
    registerEngine(fakeEngine('swimlane', (d) => d.pools.some((p) => p.lanes.length > 0)));
    registerEngine(fakeEngine('flat', () => true));
    expect(selectEngine({ ...pooledDiagram, layout: 'flat' }).name).toBe('flat');
  });

  it('throws a clear error when an explicit name has no registered engine', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(() => selectEngine({ ...baseDiagram, layout: 'bogus' })).toThrow(
      /Unknown layout engine "bogus"/,
    );
  });

  it('throws when no engine matches and no directive is set', () => {
    registerEngine(fakeEngine('swimlane', () => false));
    expect(() => selectEngine(baseDiagram)).toThrow(/No layout engine matched/);
  });
});
```

- [ ] **Step 3: Run tests — expect fail (module missing)**

Run: `npm install && npm test -- packages/layout-core/test/registry.test.ts`
Expected: FAIL (cannot resolve `@bpm/layout-core` / missing exports)

- [ ] **Step 4: Implement registry + public exports**

`packages/layout-core/src/engine.ts`:

```ts
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from './types.js';

export interface LayoutEngine {
  name: string;
  matches(diagram: Diagram): boolean;
  layout(diagram: Diagram): Promise<PositionedDiagram>;
}

const engines: LayoutEngine[] = [];

export function registerEngine(engine: LayoutEngine): void {
  engines.push(engine);
}

/** Clears the registry — for tests only. */
export function clearEngines(): void {
  engines.length = 0;
}

export function selectEngine(diagram: Diagram): LayoutEngine {
  if (diagram.layout !== undefined) {
    const named = engines.find((e) => e.name === diagram.layout);
    if (!named) {
      throw new Error(
        `Unknown layout engine "${diagram.layout}". Registered: ${engines.map((e) => e.name).join(', ') || '(none)'}`,
      );
    }
    return named;
  }
  const matched = engines.find((e) => e.matches(diagram));
  if (!matched) {
    throw new Error('No layout engine matched this diagram');
  }
  return matched;
}
```

`packages/layout-core/src/index.ts`:

```ts
export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from './types.js';
export { positionBoundaryEvents } from './boundaryEvents.js';
export {
  registerEngine, clearEngines, selectEngine, type LayoutEngine,
} from './engine.js';
```

- [ ] **Step 5: Build and run registry tests — expect pass**

Run:
```bash
npm install
npm run build -w @bpm/layout-core
npm test -- packages/layout-core/test/registry.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/layout-core
git commit -m "$(cat <<'EOF'
feat(layout-core): add LayoutEngine registry and shared positioned types

EOF
)"
```

---

### Task 4: `@bpm/layout-elk-base` — shared ELK scaffolding

**Files:**
- Create: `packages/layout-elk-base/package.json`
- Create: `packages/layout-elk-base/tsconfig.json`
- Create: `packages/layout-elk-base/src/toElkGraph.ts` (move from layout)
- Create: `packages/layout-elk-base/src/fromElkLayout.ts` (move; import types from `@bpm/layout-core`)
- Create: `packages/layout-elk-base/src/runElkLayout.ts`
- Create: `packages/layout-elk-base/src/index.ts`

**Interfaces:**
- Consumes: `Diagram` from `@bpm/ast`; positioned types from `@bpm/layout-core`
- Produces: `toElkGraph`, `fromElkLayout`, `runElkLayout(diagram): Promise<PositionedDiagram>` (ELK only — no banding, no boundary events)

- [ ] **Step 1: Scaffold and move files**

`packages/layout-elk-base/package.json`:
```json
{
  "name": "@bpm/layout-elk-base",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "elkjs": "^0.9.3"
  }
}
```

`packages/layout-elk-base/tsconfig.json`: same pattern as layout-core.

Copy `toElkGraph.ts` unchanged.
Copy `fromElkLayout.ts` and change:
```ts
import type { PositionedDiagram, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout-core';
```

- [ ] **Step 2: Add `runElkLayout` helper**

`packages/layout-elk-base/src/runElkLayout.ts`:

```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { toElkGraph } from './toElkGraph.js';
import { fromElkLayout } from './fromElkLayout.js';

const elk = new ELK();

/** Runs ELK layout only — no banding, no boundary-event pass. */
export async function runElkLayout(diagram: Diagram): Promise<PositionedDiagram> {
  const elkGraph = toElkGraph(diagram);
  const laidOut = await elk.layout(elkGraph);
  return fromElkLayout(diagram, laidOut as Parameters<typeof fromElkLayout>[1]);
}
```

`packages/layout-elk-base/src/index.ts`:

```ts
export { toElkGraph } from './toElkGraph.js';
export { fromElkLayout } from './fromElkLayout.js';
export { runElkLayout } from './runElkLayout.js';
```

Update comments in `toElkGraph.ts` / `fromElkLayout.ts` that mention `'stacked'` / `'linear'` to say swimlane banding happens in `@bpm/layout-engine-swimlane` (cosmetic only; do not change logic).

- [ ] **Step 3: Build**

Run: `npm install && npm run build -w @bpm/layout-elk-base`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add packages/layout-elk-base
git commit -m "$(cat <<'EOF'
feat(layout-elk-base): extract shared ELK toElkGraph/fromElkLayout scaffolding

EOF
)"
```

---

### Task 5: `@bpm/layout-engine-swimlane` — stacked banding engine

**Files:**
- Create: `packages/layout-engine-swimlane/package.json`
- Create: `packages/layout-engine-swimlane/tsconfig.json`
- Create: `packages/layout-engine-swimlane/src/laneBanding.ts` (from layout; remove linear early-return)
- Create: `packages/layout-engine-swimlane/src/engine.ts`
- Create: `packages/layout-engine-swimlane/src/index.ts`
- Create: `packages/layout-engine-swimlane/test/swimlane.test.ts`

**Interfaces:**
- Consumes: `runElkLayout` from `@bpm/layout-elk-base`; `LayoutEngine` / types from `@bpm/layout-core`
- Produces: `swimlaneEngine: LayoutEngine` with `name: 'swimlane'`; `matches` true when any pool has ≥1 lane; `layout` = ELK + `bandLanes` (no boundary pass)

- [ ] **Step 1: Scaffold package + move `laneBanding`**

Package deps: `@bpm/ast`, `@bpm/layout-core`, `@bpm/layout-elk-base`.

Copy `laneBanding.ts`. **Remove** the early-return and update the docstring:

```ts
/**
 * Arranges each pool's lanes as full-width horizontal bands stacked top-to-bottom in
 * declaration order — the standard BPMN swimlane convention — instead of letting ELK's
 * layered algorithm place each lane as an independently-sized, independently-positioned
 * box. Runs on the flat pool layout toElkGraph/fromElkLayout already produced.
 *
 * Called only by the swimlane engine; the flat engine never invokes this pass.
 */
export function bandLanes(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  // DELETE: if (diagram.layout === 'linear') return positioned;
  ...
}
```

Import types from `@bpm/layout-core`.

- [ ] **Step 2: Implement engine**

`packages/layout-engine-swimlane/src/engine.ts`:

```ts
import type { Diagram } from '@bpm/ast';
import type { LayoutEngine, PositionedDiagram } from '@bpm/layout-core';
import { runElkLayout } from '@bpm/layout-elk-base';
import { bandLanes } from './laneBanding.js';

export const swimlaneEngine: LayoutEngine = {
  name: 'swimlane',
  matches(diagram: Diagram): boolean {
    return diagram.pools.some((p) => p.lanes.length > 0);
  },
  async layout(diagram: Diagram): Promise<PositionedDiagram> {
    const positioned = await runElkLayout(diagram);
    return bandLanes(diagram, positioned);
  },
};
```

`packages/layout-engine-swimlane/src/index.ts`:
```ts
export { swimlaneEngine } from './engine.js';
export { bandLanes } from './laneBanding.js';
```

- [ ] **Step 3: Move pool/lane tests from `layout.test.ts`**

Create `packages/layout-engine-swimlane/test/swimlane.test.ts` that imports `{ layout }` temporarily **won’t work yet** — instead import `swimlaneEngine` and call `await swimlaneEngine.layout(diagram)`, then apply `positionBoundaryEvents` from layout-core for tests that need boundary behavior **only if** those cases live here.

Split rule from the design:
- Pool/lane containment + cross-lane + cross-pool cases → swimlane tests (call `swimlaneEngine.layout` then `positionBoundaryEvents` to mirror the facade pipeline for assertions that need boundary-free routing only — most of these have no boundary events, so just `swimlaneEngine.layout` is enough).
- Move these cases from `packages/layout/test/layout.test.ts` **verbatim**, swapping `layout(diagram)` for:

```ts
import { positionBoundaryEvents } from '@bpm/layout-core';
import { swimlaneEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await swimlaneEngine.layout(diagram));
}
```

Include at least:
- `keeps lane bounds containing their nodes`
- `routes an edge that crosses lanes within a pool`
- `routes an edge that crosses two pools`

- [ ] **Step 4: Build and run swimlane tests**

Run:
```bash
npm install
npm run build -w @bpm/layout-engine-swimlane
npm test -- packages/layout-engine-swimlane/test/swimlane.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane
git commit -m "$(cat <<'EOF'
feat(layout-engine-swimlane): extract stacked lane-banding layout engine

EOF
)"
```

---

### Task 6: `@bpm/layout-engine-flat` — linear / catch-all engine

**Files:**
- Create: `packages/layout-engine-flat/package.json`
- Create: `packages/layout-engine-flat/tsconfig.json`
- Create: `packages/layout-engine-flat/src/engine.ts`
- Create: `packages/layout-engine-flat/src/index.ts`
- Create: `packages/layout-engine-flat/test/flat.test.ts`

**Interfaces:**
- Consumes: `runElkLayout` from `@bpm/layout-elk-base`; `LayoutEngine` from `@bpm/layout-core`
- Produces: `flatEngine: LayoutEngine` with `name: 'flat'`; `matches` always `true`; `layout` = ELK only

- [ ] **Step 1: Implement engine**

```ts
import type { LayoutEngine } from '@bpm/layout-core';
import { runElkLayout } from '@bpm/layout-elk-base';

export const flatEngine: LayoutEngine = {
  name: 'flat',
  matches: () => true,
  layout: runElkLayout,
};
```

`index.ts`: `export { flatEngine } from './engine.js';`

Deps: `@bpm/ast`, `@bpm/layout-core`, `@bpm/layout-elk-base`.

- [ ] **Step 2: Move remaining layout tests**

Create `packages/layout-engine-flat/test/flat.test.ts` with the no-pool / subprocess / boundary-event cases from `layout.test.ts`, using:

```ts
import { positionBoundaryEvents } from '@bpm/layout-core';
import { flatEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await flatEngine.layout(diagram));
}
```

Include:
- assigns coordinates…
- recursively lays out expanded subprocess
- positions nested boundary event…
- positions boundary events on host…
- routes edge into boundary event
- routes edge leaving expanded sub-process

- [ ] **Step 3: Build and run**

Run:
```bash
npm install
npm run build -w @bpm/layout-engine-flat
npm test -- packages/layout-engine-flat/test/flat.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/layout-engine-flat
git commit -m "$(cat <<'EOF'
feat(layout-engine-flat): extract catch-all flat ELK layout engine

EOF
)"
```

---

### Task 7: `@bpm/layout` facade — register engines + public `layout()`

**Files:**
- Modify: `packages/layout/package.json`
- Modify: `packages/layout/src/index.ts`
- Create: `packages/layout/test/facade.test.ts`
- Delete: `packages/layout/src/types.ts`, `toElkGraph.ts`, `fromElkLayout.ts`, `laneBanding.ts`, `boundaryEvents.ts`, `test/layout.test.ts` (moved)

**Interfaces:**
- Consumes: `selectEngine`, `positionBoundaryEvents`, types from `@bpm/layout-core`; `swimlaneEngine`; `flatEngine`
- Produces: same public `layout(diagram)` + type re-exports as today

- [ ] **Step 1: Rewrite facade `index.ts`**

```ts
import type { Diagram } from '@bpm/ast';
import {
  registerEngine,
  selectEngine,
  positionBoundaryEvents,
  type PositionedDiagram,
} from '@bpm/layout-core';
import { swimlaneEngine } from '@bpm/layout-engine-swimlane';
import { flatEngine } from '@bpm/layout-engine-flat';

// Registration order matters: first match wins when no directive is set.
registerEngine(swimlaneEngine);
registerEngine(flatEngine);

export async function layout(diagram: Diagram): Promise<PositionedDiagram> {
  const engine = selectEngine(diagram);
  const positioned = await engine.layout(diagram);
  // Boundary events always attach to the host's *final* border (after banding).
  return positionBoundaryEvents(diagram, positioned);
}

export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from '@bpm/layout-core';
```

Update `packages/layout/package.json` dependencies:
```json
{
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-engine-swimlane": "*",
    "@bpm/layout-engine-flat": "*"
  }
}
```
(Remove direct `elkjs` dependency.)

Delete the moved source files listed above and `test/layout.test.ts`.

- [ ] **Step 2: Write facade smoke tests**

`packages/layout/test/facade.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { layout } from '../src/index.js';

const task = (id: string, label: string) =>
  ({ kind: 'activity' as const, id, label, activityType: 'task' as const, collapsed: false, children: [], childEdges: [] });

describe('@bpm/layout facade', () => {
  it('auto-selects swimlane for diagrams with pools and lanes', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.pools[0].lanes).toHaveLength(1);
    const lane = positioned.pools[0].lanes[0];
    for (const n of positioned.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });

  it('auto-selects flat when there are no pools', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
    expect(positioned.pools).toEqual([]);
  });

  it('lets layout: flat override a pool/lane diagram', async () => {
    const diagram: Diagram = {
      layout: 'flat',
      pools: [
        {
          id: 'p1', name: 'P',
          lanes: [
            { id: 'l1', name: 'A', nodeIds: ['n1'] },
            { id: 'l2', name: 'B', nodeIds: ['n2'] },
          ],
        },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    // Must not throw; flat engine still returns pools from ELK without swimlane banding.
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
  });

  it('throws for an explicit unknown engine name', async () => {
    const diagram: Diagram = {
      layout: 'bogus',
      pools: [],
      nodes: [task('n1', 'Work')],
      edges: [],
    };
    await expect(layout(diagram)).rejects.toThrow(/Unknown layout engine "bogus"/);
  });
});
```

- [ ] **Step 3: Update Vite aliases so the web app resolves new packages from source**

In `apps/web/vite.config.ts`, add:

```ts
      '@bpm/layout-core': path.resolve(root, '../../packages/layout-core/src/index.ts'),
      '@bpm/layout-elk-base': path.resolve(root, '../../packages/layout-elk-base/src/index.ts'),
      '@bpm/layout-engine-swimlane': path.resolve(root, '../../packages/layout-engine-swimlane/src/index.ts'),
      '@bpm/layout-engine-flat': path.resolve(root, '../../packages/layout-engine-flat/src/index.ts'),
```

- [ ] **Step 4: Install, build layout graph, run all package tests**

```bash
npm install
npm run build -w @bpm/layout-core
npm run build -w @bpm/layout-elk-base
npm run build -w @bpm/layout-engine-swimlane
npm run build -w @bpm/layout-engine-flat
npm run build -w @bpm/layout
npm test
```
Expected: all tests PASS (count will be > 42 because of new registry/facade tests; every former layout assertion must still pass in its new home)

- [ ] **Step 5: Commit**

```bash
git add packages/layout apps/web/vite.config.ts
git commit -m "$(cat <<'EOF'
refactor(layout): thin facade that registers swimlane and flat engines

EOF
)"
```

---

### Task 8: `apps/web` — catch layout-time errors without blanking preview

**Files:**
- Modify: `apps/web/src/pipeline.ts`
- Create: `apps/web/test/pipeline.test.ts`
- Modify: `vitest.workspace.ts` (include `apps/web` if needed)

**Interfaces:**
- Consumes: `layout` that may throw for unknown engines
- Produces: `PipelineResult` with `svg: null` and a structured error on layout failure; `main.ts` already keeps last preview when `errors.length > 0`

- [ ] **Step 1: Write the failing pipeline test**

`apps/web/test/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

describe('runPipeline', () => {
  it('surfaces an unknown layout engine as an error without returning svg', async () => {
    const text = ['layout: bogus', 'task "Review" as n1'].join('\n');
    const result = await runPipeline(text);
    expect(result.svg).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/Unknown layout engine "bogus"/);
  });

  it('still returns svg for a valid diagram', async () => {
    const result = await runPipeline('task "Review" as n1');
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
  });
});
```

Update `vitest.workspace.ts` to:
```ts
export default ['packages/*', 'apps/web'];
```

(If `apps/web` needs a vitest project name, rely on vitest’s default folder discovery; ensure `apps/web` is included somehow so the new test runs under `npm test`.)

- [ ] **Step 2: Run test — expect fail (layout throw escapes pipeline)**

Run: `npm test -- apps/web/test/pipeline.test.ts`
Expected: FAIL (unhandled rejection / thrown error)

- [ ] **Step 3: Catch layout errors in the pipeline**

Replace `apps/web/src/pipeline.ts` with:

```ts
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { render } from '@bpm/render';
import type { ParseError } from '@bpm/parser';

export interface PipelineResult {
  svg: string | null;
  errors: ParseError[];
}

export async function runPipeline(text: string): Promise<PipelineResult> {
  const { diagram, errors } = parse(text);
  if (errors.length > 0) {
    return { svg: null, errors };
  }
  try {
    const positioned = await layout(diagram);
    const svg = render(positioned);
    return { svg, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { svg: null, errors: [{ line: 1, column: 1, message }] };
  }
}
```

(`main.ts` already leaves `#preview` untouched when `errors.length > 0`.)

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test -- apps/web/test/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pipeline.ts apps/web/test/pipeline.test.ts vitest.workspace.ts
git commit -m "$(cat <<'EOF'
fix(web): surface layout-time engine errors without blanking preview

EOF
)"
```

---

### Task 9: Docs + final verification

**Files:**
- Modify: `docs/STATUS.md` (directive vocabulary `swimlane` / `flat`; note pluggable engines)
- Optionally touch comments only — do not rewrite historical plans/specs

- [ ] **Step 1: Update STATUS vocabulary**

Replace mentions of `layout: linear` / `layout: stacked` with `layout: flat` / `layout: swimlane`, and note that `@bpm/layout` is now a facade over registered engines. Keep known-limitation honesty intact (rename `layout: linear` limitation to `layout: flat`).

- [ ] **Step 2: Full verification**

```bash
npm install
npm run build
npm test
```

Expected: all packages build; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add docs/STATUS.md
git commit -m "$(cat <<'EOF'
docs: update status for pluggable layout engines

EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| `layout-core` contract + registry + types + `positionBoundaryEvents` | Task 3 |
| `layout-elk-base` (`toElkGraph` / `fromElkLayout`) | Task 4 |
| `layout-engine-swimlane` (+ banding) | Task 5 |
| `layout-engine-flat` (catch-all) | Task 6 |
| `@bpm/layout` facade registers swimlane then flat; same public API | Task 7 |
| Directive rename stacked→swimlane, linear→flat | Tasks 2, 7, 9 |
| Parser stores raw string, no closed list | Task 2 |
| `selectEngine` override / auto / throw | Task 3 |
| Boundary pass after engine in facade | Task 7 |
| Web catches layout-time errors | Task 8 |
| Registry + facade + moved engine tests | Tasks 3, 5, 6, 7 |
| Geometric analyzer | Out of repo — skipped; noted in Global Constraints |

## Placeholder scan

No TBD/TODO steps; all code blocks are concrete. `clearEngines` is an explicit test helper (not in the design doc but required for registry test isolation).
