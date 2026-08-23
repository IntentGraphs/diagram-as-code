> Archived 2026-08-10 — engine removed from main; see docs/superpowers/plans/2026-08-10-prune-experimental-engines.md.

# ELK-Native Layout Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third, opt-in-only layout engine (`@bpm/layout-engine-elk-native`) that lets ELK.js own the full `Pool → Lane → Task` hierarchy as native compound nodes, plus a UI toggle in `apps/web` to A/B it against the existing `flat`/`swimlane` engines on the same diagram text.

**Architecture:** `packages/layout-engine-elk-native` follows the exact same `LayoutEngine` pattern as `layout-engine-flat`/`layout-engine-swimlane` (`packages/layout-core/src/engine.ts`'s `LayoutEngine` interface), but with `matches: () => false` so it is never auto-selected — reachable only via an explicit `layout:` directive or a new `engineOverride` option threaded through the `@bpm/layout` facade. It reuses (via new additive exports) `@bpm/layout-elk-base`'s existing node-sizing/subprocess-recursion and coordinate-mapping helpers rather than duplicating them, adding one more nesting level (`Lane`) on top of what those helpers already do for `Pool`/sub-process containers.

**Tech Stack:** TypeScript (ES2022/ESNext, strict), npm workspaces, `elkjs` 0.9.3, Vitest, Playwright (for the `apps/web` e2e check).

## Global Constraints

- TypeScript strict mode, matching `tsconfig.base.json` (`target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, `declaration: true`, `esModuleInterop: true`, `skipLibCheck: true`) — every new package's `tsconfig.json` extends this unchanged.
- New workspace packages need no changes to root `package.json` (`workspaces: ["packages/*", "apps/*"]` already globs new `packages/*` dirs) or `vitest.workspace.ts` (`['packages/*', 'apps/web']` already globs new packages).
- Package manager is npm workspaces; cross-package imports resolve at runtime through each package's built `dist/` (gitignored, already present locally for existing packages) — any task that adds a runtime (non-`import type`) cross-package import must run `npm run build --workspaces --if-present` before its consuming package's tests can pass.
- No changes to the *behavior* of `layout-engine-flat`, `layout-engine-swimlane`, or any currently-exported function's signature — only additive new exports are introduced in `layout-elk-base`/`layout-core`.
- The new engine's `matches()` always returns `false` — it must never be auto-selected for a real diagram; only reachable via the `layout: elk-native` directive or explicit `engineOverride`.
- All work stays on the `explore/elk-native-layout` branch (already created, spec committed at `08e4d46`). Nothing in this plan merges to `main`.
- No new `BASELINE_CROSSINGS`-style hard assertions for the elk-native engine — its crossing-regression test is report-only (`console.log`, no `expect` on the counts).

---

## Task 1: Export shared ELK-mapping helpers from `@bpm/layout-elk-base`

**Files:**
- Modify: `packages/layout-elk-base/src/toElkGraph.ts` (add `export` to two existing functions, no logic changes)
- Modify: `packages/layout-elk-base/src/fromElkLayout.ts` (add `export` to three existing functions, no logic changes)
- Modify: `packages/layout-elk-base/src/index.ts`
- Test: `packages/layout-elk-base/test/exports.test.ts` (new)

**Interfaces:**
- Produces: `toElkNode(node: DiagramNode): any`, `toElkChildren(nodes: DiagramNode[]): any[]` from `toElkGraph.ts`; `collectOrigins(nodes, offsetX: number, offsetY: number, into: Map<string, {x:number;y:number}>): void`, `positionNode(astNode: DiagramNode, elkNode, offsetX: number, offsetY: number, origins): PositionedNode`, `routeEdges(elkEdges, astByEdgeId: Map<string, any>, origins, fallback: {x:number;y:number}): RoutedEdge[]` from `fromElkLayout.ts`. All five newly exported from `@bpm/layout-elk-base`'s package root — Task 5/6 import them to build the elk-native engine without duplicating sizing/subprocess-recursion/coordinate-mapping logic.
- Consumes: nothing new — these functions already exist and are already exercised indirectly by every existing `layout-engine-flat`/`layout-engine-swimlane` test. This task only changes their visibility.

Currently `layout-engine-swimlane` avoids nesting Pool/Lane as real ELK containers (see the comment in `toElkGraph.ts` around line 80-85), so the subprocess-recursion logic in `toElkNode`/`positionNode` has never needed to go one level deeper than Pool. The new elk-native engine needs that same recursion logic one level deeper (`Pool → Lane → Task`, where a `Task` can itself be an expanded sub-process) — reusing these functions avoids a second, drifting copy of "how a sub-process becomes an ELK node and back."

- [ ] **Step 1: Add `export` to `toElkNode` and `toElkChildren` in `toElkGraph.ts`**

In `packages/layout-elk-base/src/toElkGraph.ts`, change:
```ts
function toElkNode(node: DiagramNode): any {
```
to:
```ts
export function toElkNode(node: DiagramNode): any {
```
and change:
```ts
function toElkChildren(nodes: DiagramNode[]): any[] {
```
to:
```ts
export function toElkChildren(nodes: DiagramNode[]): any[] {
```
No other changes to either function's body.

- [ ] **Step 2: Add `export` to `collectOrigins`, `positionNode`, `routeEdges` in `fromElkLayout.ts`**

In `packages/layout-elk-base/src/fromElkLayout.ts`, change:
```ts
function collectOrigins(nodes: ElkNode[] | undefined, offsetX: number, offsetY: number, into: Map<string, Origin>): void {
```
to:
```ts
export function collectOrigins(nodes: ElkNode[] | undefined, offsetX: number, offsetY: number, into: Map<string, Origin>): void {
```
Change:
```ts
function routeEdges(
```
to:
```ts
export function routeEdges(
```
Change:
```ts
function positionNode(astNode: DiagramNode, elkNode: ElkNode, offsetX: number, offsetY: number, origins: Map<string, Origin>): PositionedNode {
```
to:
```ts
export function positionNode(astNode: DiagramNode, elkNode: ElkNode, offsetX: number, offsetY: number, origins: Map<string, Origin>): PositionedNode {
```
Also export the two small local interfaces these signatures reference so consumers can name the types:
```ts
export interface ElkNode {
  id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; edges?: ElkEdge[];
}
export interface ElkEdgeSection {
  startPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[]; endPoint: { x: number; y: number };
}
export interface ElkEdge { id: string; sections?: ElkEdgeSection[]; container?: string }
export type Origin = { x: number; y: number };
```
(These already exist as unexported `interface`/`type` declarations right above — just add `export` to each of the four, don't redeclare them.)

- [ ] **Step 3: Re-export the five new names from the package's `index.ts`**

Replace the contents of `packages/layout-elk-base/src/index.ts` with:
```ts
export { toElkGraph, toElkNode, toElkChildren } from './toElkGraph.js';
export {
  fromElkLayout, collectOrigins, positionNode, routeEdges,
  type ElkNode, type ElkEdge, type ElkEdgeSection, type Origin,
} from './fromElkLayout.js';
export { runElkLayout } from './runElkLayout.js';
```

- [ ] **Step 4: Write a smoke test proving the new exports are usable**

Create `packages/layout-elk-base/test/exports.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { DiagramNode } from '@bpm/ast';
import { toElkNode, toElkChildren, collectOrigins, positionNode, routeEdges } from '../src/index.js';

describe('layout-elk-base shared exports', () => {
  it('toElkNode sizes a leaf activity', () => {
    const node: DiagramNode = { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] };
    const elkNode = toElkNode(node);
    expect(elkNode).toEqual({ id: 't1', width: 100, height: 60 });
  });

  it('toElkChildren filters out boundary events', () => {
    const nodes: DiagramNode[] = [
      { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
    ];
    expect(toElkChildren(nodes).map((n) => n.id)).toEqual(['t1']);
  });

  it('collectOrigins records absolute offsets recursively', () => {
    const origins = new Map<string, { x: number; y: number }>();
    collectOrigins([{ id: 'a', x: 10, y: 5, children: [{ id: 'b', x: 1, y: 2 }] }], 100, 200, origins);
    expect(origins.get('a')).toEqual({ x: 110, y: 205 });
    expect(origins.get('b')).toEqual({ x: 111, y: 207 });
  });

  it('positionNode applies the offset to a leaf node', () => {
    const astNode: DiagramNode = { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] };
    const positioned = positionNode(astNode, { id: 't1', x: 5, y: 5, width: 100, height: 60 }, 10, 20, new Map());
    expect(positioned.x).toBe(15);
    expect(positioned.y).toBe(25);
  });

  it('routeEdges maps section points through the given offset', () => {
    const astEdge = { id: 'e1', sourceId: 's', targetId: 't', flowType: 'sequence' as const };
    const routed = routeEdges(
      [{ id: 'e1', sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } }] }],
      new Map([['e1', astEdge]]),
      new Map(),
      { x: 5, y: 5 },
    );
    expect(routed[0].points).toEqual([{ x: 5, y: 5 }, { x: 15, y: 5 }]);
  });
});
```

- [ ] **Step 5: Run the test and the full existing suite for this package**

Run: `npx vitest run packages/layout-elk-base`
Expected: all pass, including the 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-elk-base
git commit -m "refactor(layout-elk-base): export shared node-sizing and coordinate-mapping helpers"
```

---

## Task 2: Move `VERIFICATION_DIAGRAMS` to a shared location

**Files:**
- Create: `packages/layout-core/test-utils/verificationDiagrams.ts` (copy of existing file, unchanged content)
- Modify: `packages/layout-core/package.json` (add an `exports` subpath, mirroring the existing `./test-utils/geometry` one)
- Modify: `packages/layout-engine-swimlane/test/crossing-regression.test.ts` (import path only)
- Delete: `packages/layout-engine-swimlane/test/verificationDiagrams.ts`

**Interfaces:**
- Produces: `VERIFICATION_DIAGRAMS: Record<string, string>` importable from `@bpm/layout-core/test-utils/verificationDiagrams` — Task 7's elk-native crossing-regression test imports it from here.
- Consumes: nothing new.

- [ ] **Step 1: Read the current file to copy verbatim**

Run: `cat packages/layout-engine-swimlane/test/verificationDiagrams.ts`
(161 lines — six named diagram texts: `screenshot`, `poolLaneTwoBoundary`, `fanOut`, `nestedSubprocess`, `crowdedBoundary`, `orderToCashStacked`.)

- [ ] **Step 2: Create the shared copy**

Create `packages/layout-core/test-utils/verificationDiagrams.ts` with byte-for-byte the same content as `packages/layout-engine-swimlane/test/verificationDiagrams.ts` (same `export const VERIFICATION_DIAGRAMS: Record<string, string> = { ... }`).

- [ ] **Step 3: Add the export subpath to `layout-core`'s `package.json`**

In `packages/layout-core/package.json`, change the `exports` block from:
```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./test-utils/geometry": { "types": "./test-utils/geometry.ts", "default": "./test-utils/geometry.ts" }
  },
```
to:
```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./test-utils/geometry": { "types": "./test-utils/geometry.ts", "default": "./test-utils/geometry.ts" },
    "./test-utils/verificationDiagrams": { "types": "./test-utils/verificationDiagrams.ts", "default": "./test-utils/verificationDiagrams.ts" }
  },
```

- [ ] **Step 4: Delete the old copy and update the swimlane test's import**

Delete `packages/layout-engine-swimlane/test/verificationDiagrams.ts`.

In `packages/layout-engine-swimlane/test/crossing-regression.test.ts`, change:
```ts
import { VERIFICATION_DIAGRAMS } from './verificationDiagrams.js';
```
to:
```ts
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';
```

- [ ] **Step 5: Run the swimlane package's tests to confirm the import resolves and baselines are unaffected**

Run: `npx vitest run packages/layout-engine-swimlane`
Expected: same pass results as before this task (same `BASELINE_CROSSINGS` numbers, same zero-overlap assertions) — this task only moves where the diagram texts live.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-core packages/layout-engine-swimlane
git commit -m "refactor: move verification diagrams to shared layout-core test-utils"
```

---

## Task 3: Add `getEngineByName` to `@bpm/layout-core`

**Files:**
- Modify: `packages/layout-core/src/engine.ts`
- Modify: `packages/layout-core/src/index.ts`
- Test: `packages/layout-core/test/registry.test.ts` (add cases; existing cases unchanged)

**Interfaces:**
- Produces: `getEngineByName(name: string): LayoutEngine` — throws `Unknown layout engine "<name>". Registered: <comma-separated names>` if not found. Task 4's facade uses this for `engineOverride`.
- Consumes: the existing internal `engines: LayoutEngine[]` array in `engine.ts` (unchanged).

- [ ] **Step 1: Write the failing test for the new function**

In `packages/layout-core/test/registry.test.ts`, add (inside the existing `describe('selectEngine', ...)` block is fine, but since this is a new function, add a sibling `describe`):
```ts
import { getEngineByName } from '../src/index.js';
```
(add to the existing top import line, or as its own import line)
```ts
describe('getEngineByName', () => {
  beforeEach(() => clearEngines());

  it('returns the engine with a matching name', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(getEngineByName('flat').name).toBe('flat');
  });

  it('throws a clear error when no engine has that name', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(() => getEngineByName('bogus')).toThrow(/Unknown layout engine "bogus"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/layout-core -t getEngineByName`
Expected: FAIL — `getEngineByName` is not exported yet (import error).

- [ ] **Step 3: Implement `getEngineByName` and refactor `selectEngine` to use it**

Replace the body of `packages/layout-core/src/engine.ts` from the `selectEngine` function onward with:
```ts
export function getEngineByName(name: string): LayoutEngine {
  const named = engines.find((e) => e.name === name);
  if (!named) {
    throw new Error(
      `Unknown layout engine "${name}". Registered: ${engines.map((e) => e.name).join(', ') || '(none)'}`,
    );
  }
  return named;
}

export function selectEngine(diagram: Diagram): LayoutEngine {
  if (diagram.layout !== undefined) return getEngineByName(diagram.layout);
  const matched = engines.find((e) => e.matches(diagram));
  if (!matched) {
    throw new Error('No layout engine matched this diagram');
  }
  return matched;
}
```
(This is a pure extraction — the error message and control flow for the `diagram.layout !== undefined` branch are unchanged, just delegated.)

- [ ] **Step 4: Export it from the package root**

In `packages/layout-core/src/index.ts`, change:
```ts
export {
  registerEngine, clearEngines, selectEngine, type LayoutEngine,
} from './engine.js';
```
to:
```ts
export {
  registerEngine, clearEngines, selectEngine, getEngineByName, type LayoutEngine,
} from './engine.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/layout-core`
Expected: PASS — all existing `registry.test.ts` cases plus the 2 new ones, plus `boundaryEvents.test.ts`/`geometry.test.ts` unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-core
git commit -m "feat(layout-core): add getEngineByName for explicit engine lookup"
```

---

## Task 4: Add `engineOverride` to the `@bpm/layout` facade

**Files:**
- Modify: `packages/layout/src/index.ts`
- Test: `packages/layout/test/facade.test.ts` (add cases; existing cases unchanged)

**Interfaces:**
- Produces: `layout(diagram: Diagram, options?: { engineOverride?: string }): Promise<PositionedDiagram>` — `options` is optional and additive; calling `layout(diagram)` with no second argument is unaffected. `LayoutOptions` type exported alongside.
- Consumes: `getEngineByName` from Task 3, `selectEngine` (already imported), `positionBoundaryEvents` (already imported).

- [ ] **Step 1: Write the failing tests**

In `packages/layout/test/facade.test.ts`, add at the end of the `describe('@bpm/layout facade', ...)` block:
```ts
  it('lets an engineOverride force flat even for a pool/lane diagram', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram, { engineOverride: 'flat' });
    expect(positioned.pools).toEqual([]);
  });

  it('lets an engineOverride win over an explicit layout: directive', async () => {
    const diagram: Diagram = {
      layout: 'swimlane',
      pools: [],
      nodes: [task('n1', 'Work')],
      edges: [],
    };
    const positioned = await layout(diagram, { engineOverride: 'flat' });
    expect(positioned.nodes).toHaveLength(1);
  });

  it('throws for an unknown engineOverride name', async () => {
    const diagram: Diagram = { pools: [], nodes: [task('n1', 'Work')], edges: [] };
    await expect(layout(diagram, { engineOverride: 'bogus' })).rejects.toThrow(/Unknown layout engine "bogus"/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/layout -t engineOverride`
Expected: FAIL — `layout()` doesn't accept a second argument yet, so `engineOverride` has no effect (the first two new tests fail on their assertions; the third fails because no error is thrown for an unrecognized-but-ignored option).

- [ ] **Step 3: Implement the option**

Replace the contents of `packages/layout/src/index.ts` with:
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
   */
  engineOverride?: string;
}

export async function layout(diagram: Diagram, options?: LayoutOptions): Promise<PositionedDiagram> {
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/layout`
Expected: PASS — all existing facade tests plus the 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/layout
git commit -m "feat(layout): add engineOverride option to the layout() facade"
```

---

## Task 5: Scaffold `@bpm/layout-engine-elk-native` and build the nested ELK graph

**Files:**
- Create: `packages/layout-engine-elk-native/package.json`
- Create: `packages/layout-engine-elk-native/tsconfig.json`
- Create: `packages/layout-engine-elk-native/src/toElkGraphNative.ts`
- Test: `packages/layout-engine-elk-native/test/toElkGraphNative.test.ts`

**Interfaces:**
- Produces: `toElkGraphNative(diagram: Diagram): { id: 'root'; layoutOptions: object; children: any[]; edges: any[] }` — a nested ELK input graph (`root → Pool → Lane → leaf`, loose nodes flat under `root`). Task 6 feeds this into `elk.layout()`.
- Consumes: `toElkChildren` from `@bpm/layout-elk-base` (Task 1).

- [ ] **Step 1: Create the package manifest**

Create `packages/layout-engine-elk-native/package.json`:
```json
{
  "name": "@bpm/layout-engine-elk-native",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-elk-base": "*",
    "elkjs": "^0.9.3"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Create `packages/layout-engine-elk-native/tsconfig.json`:
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

- [ ] **Step 3: Install workspace dependencies so the new package is linked**

Run: `npm install`
Expected: npm links the new workspace package; `elkjs` resolves for it.

- [ ] **Step 4: Write the failing test for `toElkGraphNative`**

Create `packages/layout-engine-elk-native/test/toElkGraphNative.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { toElkGraphNative } from '../src/toElkGraphNative.js';

describe('toElkGraphNative', () => {
  it('nests lanes as ELK containers inside their pool container', () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1', name: 'Order Process',
          lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }],
        },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const graph = toElkGraphNative(diagram);

    expect(graph.children).toHaveLength(1);
    const pool = graph.children[0];
    expect(pool.id).toBe('pool1');
    expect(pool.layoutOptions['elk.algorithm']).toBe('layered');
    expect(pool.layoutOptions['elk.hierarchyHandling']).toBe('INCLUDE_CHILDREN');
    expect(pool.children).toHaveLength(1);

    const lane = pool.children[0];
    expect(lane.id).toBe('lane1');
    expect(lane.layoutOptions['elk.padding']).toBe('[top=40,left=40,bottom=40,right=40]');
    expect(lane.children.map((n: any) => n.id)).toEqual(['n1', 'n2']);

    expect(graph.edges).toEqual([{ id: 'e1', sources: ['n1'], targets: ['n2'] }]);
  });

  it('keeps nodes outside any lane as flat children of root', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{ kind: 'activity', id: 't1', label: 'Standalone', activityType: 'task', collapsed: false, children: [], childEdges: [] }],
      edges: [],
    };
    const graph = toElkGraphNative(diagram);
    expect(graph.children).toEqual([{ id: 't1', width: 100, height: 60 }]);
  });

  it('excludes boundary events and their edges from the graph entirely', () => {
    const diagram: Diagram = {
      pools: [
        { id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'L', nodeIds: ['t1', 'b1'] }] },
      ],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
        { kind: 'activity', id: 't2', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 't2', flowType: 'sequence' }],
    };
    const graph = toElkGraphNative(diagram);
    const lane = graph.children[0].children[0];
    expect(lane.children.map((n: any) => n.id)).toEqual(['t1']);
    expect(graph.edges).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/layout-engine-elk-native`
Expected: FAIL — `../src/toElkGraphNative.js` doesn't exist yet.

- [ ] **Step 6: Implement `toElkGraphNative`**

Create `packages/layout-engine-elk-native/src/toElkGraphNative.ts`:
```ts
import type { Diagram, DiagramNode } from '@bpm/ast';
import { toElkChildren } from '@bpm/layout-elk-base';

/**
 * Unlike @bpm/layout-elk-base/toElkGraph.ts (which keeps lanes flat and bands them
 * as a post-process — see the comment there on why), this builds a genuinely nested
 * Pool -> Lane -> leaf ELK graph so ELK's own layered algorithm sizes and positions
 * lanes from their children, per the "compound nodes" approach documented for
 * BPMN-oriented ELK usage. Reuses toElkChildren (leaf sizing + boundary-event
 * exclusion + sub-process recursion) so this doesn't drift from the production
 * engines' notion of "how big is this node."
 */
const CONTAINER_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.edgeNode': '25',
  'elk.spacing.edgeEdge': '15',
  'elk.spacing.edgeLabel': '10',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.layered.spacing.edgeNodeBetweenLayers': '30',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
  'elk.spacing.componentComponent': '60',
};

function isBoundaryEventId(nodes: DiagramNode[], id: string): boolean {
  const node = nodes.find((n) => n.id === id);
  return node?.kind === 'event' && node.attachedToId !== undefined;
}

export function toElkGraphNative(diagram: Diagram) {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const laneNodeIds = new Set(diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds)));
  const unassignedNodes = diagram.nodes.filter((n) => !laneNodeIds.has(n.id));

  const poolChildren = diagram.pools.map((pool) => ({
    id: pool.id,
    layoutOptions: CONTAINER_LAYOUT_OPTIONS,
    children: pool.lanes.map((lane) => ({
      id: lane.id,
      layoutOptions: CONTAINER_LAYOUT_OPTIONS,
      children: toElkChildren(lane.nodeIds.map((id) => nodeById.get(id)!)),
    })),
  }));

  const looseNodeChildren = toElkChildren(unassignedNodes);

  return {
    id: 'root',
    layoutOptions: CONTAINER_LAYOUT_OPTIONS,
    children: [...poolChildren, ...looseNodeChildren],
    edges: diagram.edges
      .filter((edge) => !isBoundaryEventId(diagram.nodes, edge.sourceId) && !isBoundaryEventId(diagram.nodes, edge.targetId))
      .map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
  };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/layout-engine-elk-native`
Expected: PASS — all 3 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/layout-engine-elk-native
git commit -m "feat(layout-engine-elk-native): build a nested Pool>Lane>Task ELK graph"
```

---

## Task 6: Map ELK's output back and wire up the engine

**Files:**
- Create: `packages/layout-engine-elk-native/src/fromElkNativeLayout.ts`
- Create: `packages/layout-engine-elk-native/src/engine.ts`
- Create: `packages/layout-engine-elk-native/src/index.ts`
- Test: `packages/layout-engine-elk-native/test/engine.test.ts`
- Modify: `packages/layout/src/index.ts`
- Modify: `packages/layout/package.json`
- Modify: `packages/layout/test/facade.test.ts`

**Interfaces:**
- Produces: `fromElkNativeLayout(diagram: Diagram, elkGraph): PositionedDiagram`; `elkNativeEngine: LayoutEngine` (`name: 'elk-native'`, `matches: () => false`) exported from `@bpm/layout-engine-elk-native`. Registered in `@bpm/layout`'s `ensureDefaultEngines()` so `getEngineByName('elk-native')` and the `layout: elk-native` directive both resolve it.
- Consumes: `collectOrigins`, `positionNode`, `routeEdges` from `@bpm/layout-elk-base` (Task 1); `toElkGraphNative` from Task 5; `LayoutEngine`/`PositionedDiagram`/`PositionedLane`/`PositionedPool` from `@bpm/layout-core`.

- [ ] **Step 1: Write the failing end-to-end tests**

Create `packages/layout-engine-elk-native/test/engine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents } from '@bpm/layout-core';
import { elkNativeEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await elkNativeEngine.layout(diagram));
}

describe('elk-native engine', () => {
  it('is never auto-selected', () => {
    expect(elkNativeEngine.matches({ pools: [], nodes: [], edges: [] })).toBe(false);
  });

  it('lets ELK size and position a lane so it contains its own nodes', async () => {
    const diagram: Diagram = {
      pools: [
        { id: 'pool1', name: 'Order Process', lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }] },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const positioned = await layout(diagram);
    const lane = positioned.pools[0].lanes[0];
    expect(lane.width).toBeGreaterThan(0);
    expect(lane.height).toBeGreaterThan(0);
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;
    for (const n of [n1, n2]) {
      expect(n.x).toBeGreaterThanOrEqual(lane.x);
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.x + n.width).toBeLessThanOrEqual(lane.x + lane.width);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });

  it('positions the pool container to contain all of its lanes', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1', name: 'P',
          lanes: [
            { id: 'lane1', name: 'A', nodeIds: ['n1'] },
            { id: 'lane2', name: 'B', nodeIds: ['n2'] },
          ],
        },
      ],
      nodes: [
        { kind: 'activity', id: 'n1', label: 'Task A', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n2', label: 'Task B', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [],
    };
    const positioned = await layout(diagram);
    const pool = positioned.pools[0];
    for (const lane of pool.lanes) {
      expect(lane.x).toBeGreaterThanOrEqual(pool.x);
      expect(lane.y).toBeGreaterThanOrEqual(pool.y);
      expect(lane.x + lane.width).toBeLessThanOrEqual(pool.x + pool.width);
      expect(lane.y + lane.height).toBeLessThanOrEqual(pool.y + pool.height);
    }
  });

  it('still positions nodes that belong to no pool', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.pools).toEqual([]);
    expect(positioned.nodes).toHaveLength(2);
    for (const n of positioned.nodes) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    }
  });

  it('recursively lays out an expanded sub-process nested inside a lane', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'L', nodeIds: ['sp1'] }] }],
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          children: [
            { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true },
            { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
          ],
          childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
        },
      ],
      edges: [],
    };
    const positioned = await layout(diagram);
    const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;
    expect(sp1.children).toHaveLength(2);
    for (const child of sp1.children!) {
      expect(child.x).toBeGreaterThanOrEqual(sp1.x);
      expect(child.y).toBeGreaterThanOrEqual(sp1.y);
    }
  });

  it('positions boundary events on their host activity border inside a lane', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'L', nodeIds: ['t1', 'b1', 't2'] }] }],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
        { kind: 'activity', id: 't2', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 't2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    const t1 = positioned.nodes.find((n) => n.id === 't1')!;
    const b1 = positioned.nodes.find((n) => n.id === 'b1')!;
    expect(b1.x).toBeGreaterThanOrEqual(t1.x);
    expect(b1.x).toBeLessThanOrEqual(t1.x + t1.width);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/layout-engine-elk-native`
Expected: FAIL — `../src/index.js` doesn't export `elkNativeEngine` yet.

- [ ] **Step 3: Implement `fromElkNativeLayout`**

Create `packages/layout-engine-elk-native/src/fromElkNativeLayout.ts`:
```ts
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedLane, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout-core';
import { collectOrigins, positionNode, routeEdges, type ElkNode, type ElkEdge } from '@bpm/layout-elk-base';

interface ElkGraph { id?: string; children?: ElkNode[]; edges?: ElkEdge[] }

/**
 * Mirrors @bpm/layout-elk-base/fromElkLayout.ts, but one nesting level deeper:
 * that module flattens a Pool's ELK children straight into top-level PositionedNodes
 * (lane bands don't exist yet at that stage — @bpm/layout-engine-swimlane assigns them
 * afterward). Here Lane is a real ELK container ELK already positioned, so this walks
 * Pool -> Lane -> leaf and flattens leaves into the same top-level PositionedNode[]
 * shape, while also emitting real PositionedLane entries with ELK's own computed
 * bounds (not hand-assigned bands).
 */
export function fromElkNativeLayout(diagram: Diagram, elkGraph: ElkGraph): PositionedDiagram {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const poolById = new Map(diagram.pools.map((p) => [p.id, p]));
  const laneById = new Map(diagram.pools.flatMap((p) => p.lanes.map((l) => [l.id, l] as const)));

  const origins = new Map<string, { x: number; y: number }>();
  collectOrigins(elkGraph.children, 0, 0, origins);
  if (elkGraph.id) origins.set(elkGraph.id, { x: 0, y: 0 });

  const positionedNodes: PositionedNode[] = [];
  const positionedPools: PositionedPool[] = [];

  for (const elkChild of elkGraph.children ?? []) {
    const pool = poolById.get(elkChild.id);
    if (pool) {
      const poolPos = origins.get(pool.id)!;
      const positionedLanes: PositionedLane[] = [];
      for (const elkLane of elkChild.children ?? []) {
        const lane = laneById.get(elkLane.id);
        if (!lane) continue;
        const lanePos = origins.get(lane.id)!;
        positionedLanes.push({
          id: lane.id, name: lane.name,
          x: lanePos.x, y: lanePos.y,
          width: elkLane.width ?? 0, height: elkLane.height ?? 0,
        });
        for (const elkNode of elkLane.children ?? []) {
          const astNode = nodeById.get(elkNode.id);
          if (!astNode) continue;
          positionedNodes.push(positionNode(astNode, elkNode, lanePos.x, lanePos.y, origins));
        }
      }
      positionedPools.push({
        id: pool.id, name: pool.name,
        x: poolPos.x, y: poolPos.y,
        width: elkChild.width ?? 0, height: elkChild.height ?? 0,
        lanes: positionedLanes,
      });
    } else {
      const astNode = nodeById.get(elkChild.id);
      if (astNode) positionedNodes.push(positionNode(astNode, elkChild, 0, 0, origins));
    }
  }

  const astEdgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const edges: RoutedEdge[] = routeEdges(elkGraph.edges, astEdgeById, origins, { x: 0, y: 0 });

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
```

- [ ] **Step 4: Implement the engine and package entry point**

Create `packages/layout-engine-elk-native/src/engine.ts`:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from '@bpm/ast';
import type { LayoutEngine, PositionedDiagram } from '@bpm/layout-core';
import { toElkGraphNative } from './toElkGraphNative.js';
import { fromElkNativeLayout } from './fromElkNativeLayout.js';

const elk = new ELK();

export const elkNativeEngine: LayoutEngine = {
  name: 'elk-native',
  // Experimental/comparison engine only — never auto-selected. Reachable via the
  // `layout: elk-native` directive or the @bpm/layout facade's engineOverride option.
  matches: () => false,
  async layout(diagram: Diagram): Promise<PositionedDiagram> {
    const elkGraph = toElkGraphNative(diagram);
    const laidOut = await elk.layout(elkGraph);
    return fromElkNativeLayout(diagram, laidOut as Parameters<typeof fromElkNativeLayout>[1]);
  },
};
```

Create `packages/layout-engine-elk-native/src/index.ts`:
```ts
export { elkNativeEngine } from './engine.js';
```

- [ ] **Step 5: Build the package**

Run: `npm run build --workspace=@bpm/layout-engine-elk-native`
Expected: compiles cleanly, `dist/` populated.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/layout-engine-elk-native`
Expected: PASS — all 6 tests in `engine.test.ts` plus the 3 from `toElkGraphNative.test.ts`.

- [ ] **Step 7: Register the engine in the `@bpm/layout` facade**

In `packages/layout/package.json`, add the new dependency:
```json
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-engine-swimlane": "*",
    "@bpm/layout-engine-flat": "*",
    "@bpm/layout-engine-elk-native": "*"
  }
```

In `packages/layout/src/index.ts`, add the import and registration:
```ts
import { swimlaneEngine } from '@bpm/layout-engine-swimlane';
import { flatEngine } from '@bpm/layout-engine-flat';
import { elkNativeEngine } from '@bpm/layout-engine-elk-native';

/** Re-registers defaults so layout still works after tests call clearEngines(). */
function ensureDefaultEngines(): void {
  registerEngine(swimlaneEngine);
  registerEngine(flatEngine);
  registerEngine(elkNativeEngine);
}
```
(Only the import list and the body of `ensureDefaultEngines` change — everything else in the file from Task 4 stays as-is.)

- [ ] **Step 8: Add a facade-level test proving the override reaches the new engine**

In `packages/layout/test/facade.test.ts`, add:
```ts
  it('lets engineOverride reach elk-native and produce real lane bounds', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram, { engineOverride: 'elk-native' });
    expect(positioned.pools).toHaveLength(1);
    expect(positioned.pools[0].lanes).toHaveLength(1);
    expect(positioned.pools[0].lanes[0].width).toBeGreaterThan(0);
  });
```

- [ ] **Step 9: Rebuild and run the full workspace test suite**

Run: `npm run build --workspaces --if-present && npx vitest run`
Expected: PASS across every package, including the new facade test.

- [ ] **Step 10: Commit**

```bash
git add packages/layout-engine-elk-native packages/layout
git commit -m "feat(layout-engine-elk-native): wire up the elk-native engine and register it"
```

---

## Task 7: Report-only crossing/overlap comparison for elk-native

**Files:**
- Create: `packages/layout-engine-elk-native/test/crossing-comparison.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_DIAGRAMS` from `@bpm/layout-core/test-utils/verificationDiagrams` (Task 2), `analyzeLayout` from `@bpm/layout-core/test-utils/geometry` (existing), `elkNativeEngine` (Task 6).
- Produces: nothing consumed by later tasks — this is the terminal comparison artifact for this plan.

- [ ] **Step 1: Add the dev dependency needed to parse verification diagram text**

In `packages/layout-engine-elk-native/package.json`, add a `devDependencies` block:
```json
  "devDependencies": {
    "@bpm/parser": "*"
  }
```

- [ ] **Step 2: Write the report-only test**

Create `packages/layout-engine-elk-native/test/crossing-comparison.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';
import { elkNativeEngine } from '../src/index.js';

/**
 * Report-only: elk-native is an experimental comparison engine (see
 * docs/superpowers/specs/2026-08-09-elk-native-layout-comparison-design.md), not a
 * production candidate yet, so this does not assert on the counts the way
 * layout-engine-swimlane's BASELINE_CROSSINGS does. It exists purely to produce
 * numbers directly comparable to that file's documented baselines.
 */
describe('elk-native geometry comparison — report only', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('diagram "%s"', async (name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await elkNativeEngine.layout(diagram);
    const result = analyzeLayout(positioned);
    // eslint-disable-next-line no-console
    console.log(
      `[elk-native] ${name}: nodeOverlaps=${result.nodeOverlaps.length} edgeThroughNode=${result.edgeThroughNode.length} edgeCrossings=${result.edgeCrossings}`,
    );
  });
});
```

- [ ] **Step 3: Install and run**

Run: `npm install && npx vitest run packages/layout-engine-elk-native/test/crossing-comparison.test.ts`
Expected: PASS (no assertions fail — `parse` errors would still fail the `expect(errors).toEqual([])` line, which is the one real correctness check here). Console output shows one line per verification diagram with its counts.

- [ ] **Step 4: Copy the printed numbers into the commit message for a durable record**

Run the command from Step 3 again if needed and note the six printed lines — they'll go verbatim into the commit message so the comparison is preserved in git history even though the test doesn't assert on them.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-elk-native
git commit -m "$(cat <<'EOF'
test(layout-engine-elk-native): report-only geometry comparison vs. verification diagrams

Prints nodeOverlaps/edgeThroughNode/edgeCrossings per verification diagram
for elk-native, directly comparable to layout-engine-swimlane's
BASELINE_CROSSINGS. No assertions on the counts — see the design spec for
why this is exploratory, not a production candidate.
EOF
)"
```

---

## Task 8: UI toggle in `apps/web`

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/pipeline.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/package.json`
- Test: `apps/web/test/e2e/live-render.spec.ts` (add a case)

**Interfaces:**
- Produces: nothing consumed by later tasks — this is the plan's UI-facing deliverable.
- Consumes: `layout(diagram, { engineOverride })` (Task 4), `getEngineByName` (Task 3), `elkNativeEngine`'s registered name `'elk-native'` (Task 6).

- [ ] **Step 1: Add the dependency and the toolbar control**

In `apps/web/package.json`, `@bpm/layout` is already a dependency — no change needed there. (`getEngineByName` is exported from `@bpm/layout` per Task 4, so no new package dependency is required.)

In `apps/web/index.html`, add a `<select>` next to the existing engine badge. Change:
```html
      <div id="toolbar-actions">
        <span id="engine-badge" class="badge"></span>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled>Export BPMN XML</button>
      </div>
```
to:
```html
      <div id="toolbar-actions">
        <select id="engine-override" class="toolbar-btn">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
          <option value="elk-native">ELK-native</option>
        </select>
        <span id="engine-badge" class="badge"></span>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled>Export BPMN XML</button>
      </div>
```
`<select>` already inherits the `.toolbar-btn` look (font, border, sizing) from the existing CSS rule since it targets the class, not the tag — no new CSS needed.

- [ ] **Step 2: Thread `engineOverride` through the pipeline**

Replace the contents of `apps/web/src/pipeline.ts` with:
```ts
import { parse } from '@bpm/parser';
import { layout, getEngineByName, selectEngine } from '@bpm/layout';
import { render } from '@bpm/render';
import type { ParseError } from '@bpm/parser';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout';

export interface PipelineResult {
  svg: string | null;
  diagram: Diagram | null;
  positioned: PositionedDiagram | null;
  engineName: string | null;
  errors: ParseError[];
}

export async function runPipeline(text: string, engineOverride?: string): Promise<PipelineResult> {
  const { diagram, errors } = parse(text);
  if (errors.length > 0) {
    return { svg: null, diagram: null, positioned: null, engineName: null, errors };
  }
  try {
    const engineName = engineOverride ? getEngineByName(engineOverride).name : selectEngine(diagram).name;
    const positioned = await layout(diagram, engineOverride ? { engineOverride } : undefined);
    const svg = render(positioned);
    return { svg, diagram, positioned, engineName, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { svg: null, diagram: null, positioned: null, engineName: null, errors: [{ line: 1, column: 1, message }] };
  }
}
```

- [ ] **Step 3: Wire the toggle in `main.ts` with `localStorage` persistence**

In `apps/web/src/main.ts`, add the element reference near the other `querySelector` calls (after the `engineBadge` line):
```ts
const engineOverrideSelect = document.querySelector<HTMLSelectElement>('#engine-override')!;
```

Add, right after that block (before `editor.value = STARTER_TEXT;`):
```ts
const ENGINE_OVERRIDE_STORAGE_KEY = 'bpm.engineOverride';
engineOverrideSelect.value = localStorage.getItem(ENGINE_OVERRIDE_STORAGE_KEY) ?? '';
```

Change the `rerender` function's first line and the badge assignment:
```ts
async function rerender() {
  const result = await runPipeline(editor.value, engineOverrideSelect.value || undefined);
```
(only the `runPipeline` call changes — the rest of `rerender`'s body is unchanged, including `engineBadge.textContent = result.engineName!;`.)

Add a listener alongside the existing `editor.addEventListener('input', ...)` block:
```ts
engineOverrideSelect.addEventListener('change', () => {
  localStorage.setItem(ENGINE_OVERRIDE_STORAGE_KEY, engineOverrideSelect.value);
  rerender();
});
```

- [ ] **Step 4: Manually verify in the browser**

Run: `cd apps/web && npm run dev`
Open the printed local URL. Confirm:
- The toolbar shows the new `Auto/Flat/Swimlane/ELK-native` dropdown next to the engine badge.
- Typing a pool/lane diagram (paste one of the `VERIFICATION_DIAGRAMS`, e.g. `poolLaneTwoBoundary`, from `packages/layout-core/test-utils/verificationDiagrams.ts`) with `Auto` selected shows `SWIMLANE` in the badge.
- Switching to `ELK-native` re-renders and shows `ELK-NATIVE` in the badge, with visibly different lane sizing/positioning (this is the actual thing being evaluated — no assertion, just look at it).
- Switching to `Flat` on the same pool/lane diagram shows `FLAT` and lanes disappear from the rendering (flat has no lane bands).
- Reloading the page keeps the last-selected option (localStorage persistence).

- [ ] **Step 5: Write the e2e test**

In `apps/web/test/e2e/live-render.spec.ts`, add:
```ts
test('engine override toggle forces a specific layout engine and persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('flat');

  await page.locator('#engine-override').selectOption('elk-native');
  await page.waitForTimeout(400);
  await expect(page.locator('#engine-badge')).toHaveText('elk-native');

  await page.reload();
  await expect(page.locator('#engine-override')).toHaveValue('elk-native');
  await expect(page.locator('#engine-badge')).toHaveText('elk-native');
});
```

- [ ] **Step 6: Run the e2e suite**

Run: `cd apps/web && npx playwright test`
Expected: PASS — all existing e2e tests plus the new one.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): add engine-override toggle to A/B layout engines"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild every workspace package**

Run: `npm run build --workspaces --if-present`
Expected: no errors.

- [ ] **Step 2: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: every package passes, including all tasks' new tests from this plan.

- [ ] **Step 3: Run the e2e suite**

Run: `cd apps/web && npx playwright test`
Expected: PASS.

- [ ] **Step 4: Confirm branch state**

Run: `git log --oneline explore/elk-native-layout -9 && git status`
Expected: 9 new commits (Tasks 1-8 plus the spec commit already made) on top of `main`, clean working tree, still on `explore/elk-native-layout`.
