> Archived 2026-08-10 — engine removed from main; see docs/superpowers/plans/2026-08-10-prune-experimental-engines.md.

# Dagre and Graphviz Comparison Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two more opt-in-only, flat comparison layout engines —
`@bpm/layout-engine-dagre` (Mermaid's default engine) and
`@bpm/layout-engine-graphviz` (PlantUML's default engine, via WASM) — selectable in
the same toolbar toggle as `elk-native`, so all three common JS/embeddable layout
engines can be compared side by side on the same diagram text.

**Architecture:** Both engines put every node (regardless of pool/lane membership)
into one flat graph — no compound/cluster nesting attempted in either library (a
confirmed, deliberate scope decision — see the design spec's non-goals). Each
computes a pool's bounding box *after* layout, as the min/max of wherever its nodes
actually landed, with `lanes: []` — identical in shape to what
`layout-engine-flat` already returns for pool/lane diagrams. Both reuse the
newly-exported `sizeOf` helper so node dimensions are identical across every engine
being compared.

**Tech Stack:** `@dagrejs/dagre` 3.1.1 (+ its `@dagrejs/graphlib` peer),
`@hpcc-js/wasm-graphviz` (confirmed working API this session via direct smoke
tests), TypeScript strict, Vitest.

## Global Constraints

- Same constraints as `docs/superpowers/plans/2026-08-09-elk-native-layout-comparison.md`: TS strict via `tsconfig.base.json`, npm workspaces auto-glob `packages/*`, cross-package runtime imports need `npm run build --workspaces --if-present` before dependents' tests pass, all work stays on `explore/elk-native-layout`, no merge to `main`.
- Both new engines' `matches()` always returns `false` — opt-in only, same as `elk-native`.
- Neither engine attempts compound/cluster nesting — confirmed scope decision. Pool bounding boxes are derived from final node positions after the fact, never a layout hint given to either library. Expanded sub-processes are sized via `sizeOf` (an opaque box) with no recursion into `children`.
- `@hpcc-js/wasm-graphviz`'s `Graphviz.load()` must be called lazily (inside `engine.layout()`, cached module-level after first call) — never at module import time.
- Node/edge units: dagre and Graphviz both need explicit unit handling documented per-task below (dagre: center-based coordinates; Graphviz: inches, `yInvert: true`) — get these conversions right, they were verified empirically this session and are load-bearing.

---

## Task 1: Export `sizeOf` from `@bpm/layout-elk-base`

**Files:**
- Modify: `packages/layout-elk-base/src/toElkGraph.ts`
- Modify: `packages/layout-elk-base/src/index.ts`
- Modify: `packages/layout-elk-base/test/exports.test.ts`

**Interfaces:**
- Produces: `sizeOf(node: DiagramNode): { width: number; height: number }` — Tasks 3 and 6 (the two new engines' graph-builders) use this so every engine agrees on node dimensions.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

In `packages/layout-elk-base/test/exports.test.ts`, add the import and a new case:
```ts
import { toElkNode, toElkChildren, collectOrigins, positionNode, routeEdges, sizeOf } from '../src/index.js';
```
```ts
  it('sizeOf returns the standard per-kind pixel dimensions', () => {
    expect(sizeOf({ kind: 'event', id: 'e1', label: 'Start', category: 'start', trigger: 'none', interrupting: true })).toEqual({ width: 40, height: 40 });
    expect(sizeOf({ kind: 'gateway', id: 'g1', label: 'X', gatewayType: 'exclusive' })).toEqual({ width: 50, height: 50 });
    expect(sizeOf({ kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] })).toEqual({ width: 100, height: 60 });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/layout-elk-base -t sizeOf`
Expected: FAIL — `sizeOf` is not exported yet.

- [ ] **Step 3: Add `export` to `sizeOf`**

In `packages/layout-elk-base/src/toElkGraph.ts`, change:
```ts
function sizeOf(node: DiagramNode): { width: number; height: number } {
```
to:
```ts
export function sizeOf(node: DiagramNode): { width: number; height: number } {
```
No other change.

- [ ] **Step 4: Re-export from the package root**

In `packages/layout-elk-base/src/index.ts`, change:
```ts
export { toElkGraph, toElkNode, toElkChildren, isBoundaryEventId } from './toElkGraph.js';
```
to:
```ts
export { toElkGraph, toElkNode, toElkChildren, isBoundaryEventId, sizeOf } from './toElkGraph.js';
```

- [ ] **Step 5: Run the tests, then rebuild the package**

Run: `npx vitest run packages/layout-elk-base && npm run build --workspace=@bpm/layout-elk-base`
Expected: all pass; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-elk-base
git commit -m "refactor(layout-elk-base): export sizeOf for reuse by comparison engines"
```

---

## Task 2: Scaffold `@bpm/layout-engine-dagre` and build the flat graph

**Files:**
- Create: `packages/layout-engine-dagre/package.json`
- Create: `packages/layout-engine-dagre/tsconfig.json`
- Create: `packages/layout-engine-dagre/src/toDagreGraph.ts`
- Test: `packages/layout-engine-dagre/test/toDagreGraph.test.ts`

**Interfaces:**
- Produces: `toDagreGraph(diagram: Diagram): dagre.graphlib.Graph` — a dagre graph with every non-boundary node and edge from the *entire* diagram (pool/lane membership ignored). Task 3 runs `dagre.layout()` on this and maps the result back.
- Consumes: `sizeOf`, `isBoundaryEventId` from `@bpm/layout-elk-base` (Task 1).

- [ ] **Step 1: Create the package manifest**

Create `packages/layout-engine-dagre/package.json`:
```json
{
  "name": "@bpm/layout-engine-dagre",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-elk-base": "*",
    "@dagrejs/dagre": "^3.1.1"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Create `packages/layout-engine-dagre/tsconfig.json`:
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

- [ ] **Step 3: Install workspace dependencies**

Run: `npm install`
Expected: `@dagrejs/dagre` (and its `@dagrejs/graphlib` peer) resolve for the new package.

- [ ] **Step 4: Write the failing test**

Create `packages/layout-engine-dagre/test/toDagreGraph.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { toDagreGraph } from '../src/toDagreGraph.js';

describe('toDagreGraph', () => {
  it('puts every node into one flat graph regardless of pool/lane membership', () => {
    const diagram: Diagram = {
      pools: [{ id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };

    const g = toDagreGraph(diagram);

    expect(g.nodes().sort()).toEqual(['n1', 'n2']);
    expect(g.node('n1')).toEqual({ width: 40, height: 40 });
    expect(g.node('n2')).toEqual({ width: 100, height: 60 });
    expect(g.edges()).toHaveLength(1);
    expect(g.graph()).toMatchObject({ rankdir: 'LR' });
  });

  it('excludes boundary events and their edges from the graph', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
        { kind: 'activity', id: 't2', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 't2', flowType: 'sequence' }],
    };
    const g = toDagreGraph(diagram);
    expect(g.nodes().sort()).toEqual(['t1', 't2']);
    expect(g.edges()).toHaveLength(0);
  });

  it('sizes an expanded sub-process as one opaque box, not recursed into', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        {
          kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
          children: [{ kind: 'activity', id: 'sn1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] }],
          childEdges: [],
        },
      ],
      edges: [],
    };
    const g = toDagreGraph(diagram);
    expect(g.nodes()).toEqual(['sp1']);
    expect(g.node('sp1')).toEqual({ width: 100, height: 60 });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/layout-engine-dagre`
Expected: FAIL — `../src/toDagreGraph.js` doesn't exist yet.

- [ ] **Step 6: Implement `toDagreGraph`**

Create `packages/layout-engine-dagre/src/toDagreGraph.ts`:
```ts
import dagre from '@dagrejs/dagre';
import type { Diagram } from '@bpm/ast';
import { sizeOf, isBoundaryEventId } from '@bpm/layout-elk-base';

/**
 * Flat-only by design: every node in the diagram goes into one graph, regardless of
 * pool/lane membership, and an expanded sub-process is sized as a single opaque box
 * (never recursed into) — see the design spec's non-goals. This mirrors what
 * @bpm/layout-engine-flat does structurally, but the "no compound nesting" choice is
 * explicit here rather than an ELK-hierarchy-handling side effect.
 */
export function toDagreGraph(diagram: Diagram): dagre.graphlib.Graph {
  // multigraph: true, and setEdge's 4th "name" argument set to our own edge id below,
  // is required so two parallel edges between the same pair of nodes (e.g. a
  // gateway's normal-flow and default-flow both targeting the same next step) don't
  // collapse into one dagre edge — dagre otherwise de-dupes by (v, w) alone.
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: 'LR', ranksep: 60, nodesep: 40 });
  graph.setDefaultEdgeLabel(() => ({}));

  const nonBoundaryNodes = diagram.nodes.filter((n) => !isBoundaryEventId(diagram.nodes, n.id));
  for (const node of nonBoundaryNodes) {
    graph.setNode(node.id, sizeOf(node));
  }

  const nonBoundaryEdges = diagram.edges.filter(
    (edge) => !isBoundaryEventId(diagram.nodes, edge.sourceId) && !isBoundaryEventId(diagram.nodes, edge.targetId),
  );
  for (const edge of nonBoundaryEdges) {
    graph.setEdge(edge.sourceId, edge.targetId, {}, edge.id);
  }

  return graph;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/layout-engine-dagre`
Expected: PASS — all 3 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/layout-engine-dagre
git commit -m "feat(layout-engine-dagre): build a flat dagre graph from the diagram"
```

---

## Task 3: Run Dagre's layout and map results back

**Files:**
- Create: `packages/layout-engine-dagre/src/fromDagreLayout.ts`
- Create: `packages/layout-engine-dagre/src/engine.ts`
- Create: `packages/layout-engine-dagre/src/index.ts`
- Test: `packages/layout-engine-dagre/test/engine.test.ts`
- Modify: `packages/layout/src/index.ts`
- Modify: `packages/layout/package.json`
- Modify: `packages/layout/test/facade.test.ts`

**Interfaces:**
- Produces: `fromDagreLayout(diagram: Diagram, graph: dagre.graphlib.Graph): PositionedDiagram`; `dagreEngine: LayoutEngine` (`name: 'dagre'`, `matches: () => false`) exported from `@bpm/layout-engine-dagre`. Registered in `@bpm/layout`'s `ensureDefaultEngines()`.
- Consumes: `toDagreGraph` (Task 2); `positionNode`-equivalent logic written fresh here (dagre nodes are always leaves in this flat model, so no recursion helper is needed, unlike the ELK case).

- [ ] **Step 1: Write the failing tests**

Create `packages/layout-engine-dagre/test/engine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents } from '@bpm/layout-core';
import { dagreEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await dagreEngine.layout(diagram));
}

describe('dagre engine', () => {
  it('is never auto-selected', () => {
    expect(dagreEngine.matches({ pools: [], nodes: [], edges: [] })).toBe(false);
  });

  it('assigns top-left coordinates and size to every node, and routes every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
    for (const node of positioned.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;
    expect(n1.x).toBeLessThan(n2.x); // rankdir: LR — n1 comes before n2
    expect(positioned.edges).toHaveLength(1);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('derives a pool bounding box from its nodes final positions, with no lanes', async () => {
    const diagram: Diagram = {
      pools: [{ id: 'pool1', name: 'P', lanes: [{ id: 'lane1', name: 'L', nodeIds: ['n1', 'n2'] }] }],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.pools).toHaveLength(1);
    const pool = positioned.pools[0];
    expect(pool.lanes).toEqual([]);
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;
    for (const n of [n1, n2]) {
      expect(n.x).toBeGreaterThanOrEqual(pool.x);
      expect(n.y).toBeGreaterThanOrEqual(pool.y);
      expect(n.x + n.width).toBeLessThanOrEqual(pool.x + pool.width);
      expect(n.y + n.height).toBeLessThanOrEqual(pool.y + pool.height);
    }
  });

  it('positions boundary events on their host activity border', async () => {
    const diagram: Diagram = {
      pools: [],
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

Run: `npx vitest run packages/layout-engine-dagre`
Expected: FAIL — `../src/index.js` doesn't export `dagreEngine` yet.

- [ ] **Step 3: Implement `fromDagreLayout`**

Create `packages/layout-engine-dagre/src/fromDagreLayout.ts`:
```ts
import type dagre from '@dagrejs/dagre';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout-core';

/**
 * dagre.node(id) gives CENTER x/y (unlike ELK's top-left), so every node position is
 * converted here. Pool bounding boxes are never a layout hint given to dagre — they're
 * computed after the fact from wherever dagre actually placed that pool's nodes, with
 * lanes: [] (no lane bands attempted — see the design spec's non-goals).
 */
export function fromDagreLayout(diagram: Diagram, graph: dagre.graphlib.Graph): PositionedDiagram {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  const positionedNodes: PositionedNode[] = [];
  for (const id of graph.nodes()) {
    const astNode = nodeById.get(id);
    if (!astNode) continue;
    const { x: cx, y: cy, width, height } = graph.node(id);
    positionedNodes.push({ ...astNode, x: cx - width / 2, y: cy - height / 2, width, height } as PositionedNode);
  }

  const positionedById = new Map(positionedNodes.map((n) => [n.id, n]));
  const positionedPools: PositionedPool[] = diagram.pools.map((pool) => {
    const poolNodes = pool.lanes.flatMap((lane) => lane.nodeIds).map((id) => positionedById.get(id)).filter((n): n is PositionedNode => Boolean(n));
    if (poolNodes.length === 0) return { id: pool.id, name: pool.name, x: 0, y: 0, width: 0, height: 0, lanes: [] };
    const x = Math.min(...poolNodes.map((n) => n.x));
    const y = Math.min(...poolNodes.map((n) => n.y));
    const maxX = Math.max(...poolNodes.map((n) => n.x + n.width));
    const maxY = Math.max(...poolNodes.map((n) => n.y + n.height));
    return { id: pool.id, name: pool.name, x, y, width: maxX - x, height: maxY - y, lanes: [] };
  });

  // e.name carries our own edge id (set via setEdge(v, w, {}, edge.id) in
  // toDagreGraph) — looking edges up by that id, not by (source, target), is what
  // keeps two parallel edges between the same pair of nodes from colliding.
  const astEdgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const edges: RoutedEdge[] = graph.edges().map((e) => {
    const astEdge = astEdgeById.get(e.name!)!;
    return { ...astEdge, points: graph.edge(e).points };
  });

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
```

- [ ] **Step 4: Implement the engine and package entry point**

Create `packages/layout-engine-dagre/src/engine.ts`:
```ts
import dagre from '@dagrejs/dagre';
import type { Diagram } from '@bpm/ast';
import type { LayoutEngine, PositionedDiagram } from '@bpm/layout-core';
import { toDagreGraph } from './toDagreGraph.js';
import { fromDagreLayout } from './fromDagreLayout.js';

export const dagreEngine: LayoutEngine = {
  name: 'dagre',
  // Comparison engine only — never auto-selected. Reachable via the `layout: dagre`
  // directive or the @bpm/layout facade's engineOverride option.
  matches: () => false,
  async layout(diagram: Diagram): Promise<PositionedDiagram> {
    const graph = toDagreGraph(diagram);
    dagre.layout(graph);
    return fromDagreLayout(diagram, graph);
  },
};
```

Create `packages/layout-engine-dagre/src/index.ts`:
```ts
export { dagreEngine } from './engine.js';
```

- [ ] **Step 5: Build the package**

Run: `npm run build --workspace=@bpm/layout-engine-dagre`
Expected: compiles cleanly.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run packages/layout-engine-dagre`
Expected: PASS — all 3 tests in `engine.test.ts` plus the 3 from `toDagreGraph.test.ts`.

- [ ] **Step 7: Register the engine in the `@bpm/layout` facade**

In `packages/layout/package.json`, add:
```json
    "@bpm/layout-engine-elk-native": "*",
    "@bpm/layout-engine-dagre": "*"
```
(as new lines in the existing `dependencies` object, alongside the other engines.)

In `packages/layout/src/index.ts`:
```ts
import { elkNativeEngine } from '@bpm/layout-engine-elk-native';
import { dagreEngine } from '@bpm/layout-engine-dagre';
```
and in `ensureDefaultEngines`:
```ts
function ensureDefaultEngines(): void {
  registerEngine(swimlaneEngine);
  registerEngine(flatEngine);
  registerEngine(elkNativeEngine);
  registerEngine(dagreEngine);
}
```

- [ ] **Step 8: Add a facade test**

In `packages/layout/test/facade.test.ts`, add:
```ts
  it('lets engineOverride reach dagre and produce a valid layout', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram, { engineOverride: 'dagre' });
    expect(positioned.nodes).toHaveLength(2);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 9: Rebuild and run the full workspace test suite**

Run: `npm run build --workspaces --if-present && npx vitest run`
Expected: PASS across every package.

- [ ] **Step 10: Commit**

```bash
git add packages/layout-engine-dagre packages/layout
git commit -m "feat(layout-engine-dagre): wire up the dagre engine and register it"
```

---

## Task 4: Report-only crossing/overlap comparison for dagre

**Files:**
- Modify: `packages/layout-engine-dagre/package.json` (add `@bpm/parser` devDependency)
- Test: `packages/layout-engine-dagre/test/crossing-comparison.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_DIAGRAMS` from `@bpm/layout-core/test-utils/verificationDiagrams`, `analyzeLayout` from `@bpm/layout-core/test-utils/geometry`, `dagreEngine` (Task 3).

- [ ] **Step 1: Add the dev dependency**

In `packages/layout-engine-dagre/package.json`, add:
```json
  "devDependencies": {
    "@bpm/parser": "*"
  }
```

- [ ] **Step 2: Write the report-only test**

Create `packages/layout-engine-dagre/test/crossing-comparison.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';
import { dagreEngine } from '../src/index.js';

/** Report-only — dagre is a comparison engine, not a production candidate. See
 * docs/superpowers/specs/2026-08-09-dagre-graphviz-engines-design.md. */
describe('dagre geometry comparison — report only', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('diagram "%s"', async (name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await dagreEngine.layout(diagram);
    const result = analyzeLayout(positioned);
    // eslint-disable-next-line no-console
    console.log(
      `[dagre] ${name}: nodeOverlaps=${result.nodeOverlaps.length} edgeThroughNode=${result.edgeThroughNode.length} edgeCrossings=${result.edgeCrossings}`,
    );
  });
});
```

- [ ] **Step 3: Install and run**

Run: `npm install && npx vitest run packages/layout-engine-dagre/test/crossing-comparison.test.ts`
Expected: PASS (no assertions on the counts). Console prints one line per verification diagram.

- [ ] **Step 4: Commit**

```bash
git add packages/layout-engine-dagre
git commit -m "test(layout-engine-dagre): report-only geometry comparison vs. verification diagrams"
```

---

## Task 5: Scaffold `@bpm/layout-engine-graphviz` and build the DOT source

**Files:**
- Create: `packages/layout-engine-graphviz/package.json`
- Create: `packages/layout-engine-graphviz/tsconfig.json`
- Create: `packages/layout-engine-graphviz/src/toDotSource.ts`
- Test: `packages/layout-engine-graphviz/test/toDotSource.test.ts`

**Interfaces:**
- Produces: `toDotSource(diagram: Diagram): string` — DOT-language source for the entire diagram, flat (no clusters). Task 6 feeds this into `Graphviz.layout()`.
- Consumes: `sizeOf`, `isBoundaryEventId` from `@bpm/layout-elk-base` (Task 1).

- [ ] **Step 1: Create the package manifest**

Create `packages/layout-engine-graphviz/package.json`:
```json
{
  "name": "@bpm/layout-engine-graphviz",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*",
    "@bpm/layout-elk-base": "*",
    "@hpcc-js/wasm-graphviz": "^1.6.1"
  }
}
```

- [ ] **Step 2: Create the TypeScript config**

Create `packages/layout-engine-graphviz/tsconfig.json`:
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

- [ ] **Step 3: Install workspace dependencies**

Run: `npm install`
Expected: `@hpcc-js/wasm-graphviz` resolves for the new package. If the exact `^1.6.1` range doesn't resolve, run `npm view @hpcc-js/wasm-graphviz version` first and use whatever the registry currently reports — this was verified working via `@hpcc-js/wasm` 2.35.0's `Graphviz` re-export earlier this session, and `@hpcc-js/wasm-graphviz` is that same underlying package.

- [ ] **Step 4: Write the failing test**

Create `packages/layout-engine-graphviz/test/toDotSource.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { toDotSource } from '../src/toDotSource.js';

describe('toDotSource', () => {
  it('emits every node with inches-converted fixed size and every edge', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const dot = toDotSource(diagram);
    expect(dot).toContain('rankdir=LR');
    // 40/72 and 100/72, matching @bpm/layout-elk-base's EVENT_SIZE/DEFAULT_SIZE — verified
    // by direct API test that fixedsize=true round-trips these exactly through Graphviz.
    expect(dot).toContain(`"n1" [width="${40 / 72}", height="${40 / 72}", fixedsize=true]`);
    expect(dot).toContain(`"n2" [width="${100 / 72}", height="${60 / 72}", fixedsize=true]`);
    // label carries our own edge id — Graphviz's "plain" output doesn't preserve
    // declaration order (confirmed via a direct API test this session: two parallel
    // edges between the same pair came back reordered), but it does echo back a set
    // label, which is the only reliable way to map an output edge back to its
    // source diagram edge, including for parallel edges between the same two nodes.
    expect(dot).toContain('"n1" -> "n2" [label="e1"]');
  });

  it('excludes boundary events and their edges', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
      ],
      edges: [{ id: 'e1', sourceId: 'b1', targetId: 't1', flowType: 'sequence' }],
    };
    const dot = toDotSource(diagram);
    expect(dot).not.toContain('"b1"');
    expect(dot).not.toContain('->');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run packages/layout-engine-graphviz`
Expected: FAIL — `../src/toDotSource.js` doesn't exist yet.

- [ ] **Step 6: Implement `toDotSource`**

Create `packages/layout-engine-graphviz/src/toDotSource.ts`:
```ts
import type { Diagram } from '@bpm/ast';
import { sizeOf, isBoundaryEventId } from '@bpm/layout-elk-base';

const POINTS_PER_INCH = 72;

/**
 * Flat-only: every node in the diagram, regardless of pool/lane membership, becomes
 * one DOT node — no `subgraph cluster_*` blocks, matching the confirmed non-goal of
 * not attempting compound nesting. Widths/heights are divided by 72 (DOT's default
 * unit is inches) with fixedsize=true so Graphviz can't override them — verified via
 * a direct API smoke test this session that this round-trips exactly back to our
 * pixel sizes when the "plain" output is multiplied by 72 again.
 *
 * Every edge gets a `label` set to its own diagram edge id. This isn't for display
 * (only the "plain" text format is ever requested, never "svg") — it's the only
 * reliable way to map an edge in Graphviz's output back to its source diagram edge,
 * confirmed via a direct API test this session that "plain" output does NOT
 * preserve edge declaration order, but does echo back a set label.
 */
export function toDotSource(diagram: Diagram): string {
  const nonBoundaryNodes = diagram.nodes.filter((n) => !isBoundaryEventId(diagram.nodes, n.id));
  const nonBoundaryEdges = diagram.edges.filter(
    (edge) => !isBoundaryEventId(diagram.nodes, edge.sourceId) && !isBoundaryEventId(diagram.nodes, edge.targetId),
  );

  const nodeLines = nonBoundaryNodes.map((node) => {
    const { width, height } = sizeOf(node);
    return `  "${node.id}" [width="${width / POINTS_PER_INCH}", height="${height / POINTS_PER_INCH}", fixedsize=true];`;
  });
  const edgeLines = nonBoundaryEdges.map((edge) => `  "${edge.sourceId}" -> "${edge.targetId}" [label="${edge.id}"];`);

  return [
    'digraph {',
    '  rankdir=LR;',
    '  node [shape=box];',
    ...nodeLines,
    ...edgeLines,
    '}',
  ].join('\n');
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/layout-engine-graphviz`
Expected: PASS — both tests.

- [ ] **Step 8: Commit**

```bash
git add packages/layout-engine-graphviz
git commit -m "feat(layout-engine-graphviz): build flat DOT source from the diagram"
```

---

## Task 6: Run Graphviz's layout and parse the `plain` output

**Files:**
- Create: `packages/layout-engine-graphviz/src/fromPlainOutput.ts`
- Create: `packages/layout-engine-graphviz/src/engine.ts`
- Create: `packages/layout-engine-graphviz/src/index.ts`
- Test: `packages/layout-engine-graphviz/test/fromPlainOutput.test.ts`
- Test: `packages/layout-engine-graphviz/test/engine.test.ts`
- Modify: `packages/layout/src/index.ts`
- Modify: `packages/layout/package.json`
- Modify: `packages/layout/test/facade.test.ts`

**Interfaces:**
- Produces: `fromPlainOutput(diagram: Diagram, plainText: string): PositionedDiagram`; `graphvizEngine: LayoutEngine` (`name: 'graphviz'`, `matches: () => false`) exported from `@bpm/layout-engine-graphviz`. Registered in `@bpm/layout`'s `ensureDefaultEngines()`.
- Consumes: `toDotSource` (Task 5).

- [ ] **Step 1: Write the failing parser test using real captured output**

The exact `plain` format was confirmed this session via a direct API call, including
with a `label` set (required — see Task 5's note on why every edge carries one). For
a two-node left-to-right graph (`n1 -> n2 [label="e1"]`, sized 0.55556in × 0.55556in
and 1.5in × 0.83333in), Graphviz returns (with `yInvert: true`):
```
graph 1 2.7391 0.83333
node n1 0.27778 0.41667 0.55556 0.55556 n1 solid box black lightgrey
node n2 1.9891 0.41667 1.5 0.83333 n2 solid box black lightgrey
edge n1 n2 4 0.56215 0.41667 0.70448 0.41667 0.88806 0.41667 1.0755 0.41667 e1 0.89732 0.3 solid black
stop
```
Note the `e1 0.89732 0.3` right after the 4 point pairs on the edge line — that's the
label (our edge id) and its own x/y, per the `plain` format's optional
`[label xl yl]` group, present here because every edge we emit now has a label.

Create `packages/layout-engine-graphviz/test/fromPlainOutput.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { fromPlainOutput } from '../src/fromPlainOutput.js';

const PLAIN_TEXT = [
  'graph 1 2.7391 0.83333',
  'node n1 0.27778 0.41667 0.55556 0.55556 n1 solid box black lightgrey',
  'node n2 1.9891 0.41667 1.5 0.83333 n2 solid box black lightgrey',
  'edge n1 n2 4 0.56215 0.41667 0.70448 0.41667 0.88806 0.41667 1.0755 0.41667 e1 0.89732 0.3 solid black',
  'stop',
].join('\n');

describe('fromPlainOutput', () => {
  it('converts inches to pixels and center-coordinates to top-left', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review order', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = fromPlainOutput(diagram, PLAIN_TEXT);

    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    expect(n1.width).toBeCloseTo(40, 0);
    expect(n1.height).toBeCloseTo(40, 0);
    expect(n1.x).toBeCloseTo(0.27778 * 72 - 20, 0);
    expect(n1.y).toBeCloseTo(0.41667 * 72 - 20, 0);

    expect(positioned.edges).toHaveLength(1);
    expect(positioned.edges[0].id).toBe('e1');
    expect(positioned.edges[0].points).toHaveLength(4);
    expect(positioned.edges[0].points[0].x).toBeCloseTo(0.56215 * 72, 0);
  });

  it('maps two parallel edges between the same nodes back to their own diagram edge via the label', () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 'n1', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n2', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e_alpha', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' },
        { id: 'e_beta', sourceId: 'n1', targetId: 'n2', flowType: 'conditionalSequence' },
      ],
    };
    // Confirmed via a direct API test this session: Graphviz's plain output does NOT
    // preserve declaration order for parallel edges — this fixture's ordering
    // (e_beta's line appearing before e_alpha's) is deliberately "wrong" order to
    // prove the parser uses the label, not position, to map them back.
    const text = [
      'graph 1 3 1',
      'node n1 0.25 0.25 0.5 0.5 n1 solid box black lightgrey',
      'node n2 2 0.25 0.5 0.5 n2 solid box black lightgrey',
      'edge n1 n2 2 0.6 0.6 1.6 0.6 e_beta 1.1 0.6 solid black',
      'edge n1 n2 2 0.6 0.25 1.6 0.25 e_alpha 1.1 0.25 solid black',
      'stop',
    ].join('\n');
    const positioned = fromPlainOutput(diagram, text);
    const alpha = positioned.edges.find((e) => e.id === 'e_alpha')!;
    const beta = positioned.edges.find((e) => e.id === 'e_beta')!;
    expect(alpha.points[0].y).toBeCloseTo(0.25 * 72, 0);
    expect(beta.points[0].y).toBeCloseTo(0.6 * 72, 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/layout-engine-graphviz/test/fromPlainOutput.test.ts`
Expected: FAIL — `../src/fromPlainOutput.js` doesn't exist yet.

- [ ] **Step 3: Implement `fromPlainOutput`**

Create `packages/layout-engine-graphviz/src/fromPlainOutput.ts`:
```ts
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, PositionedPool, RoutedEdge } from '@bpm/layout-core';

const POINTS_PER_INCH = 72;

interface ParsedNode { id: string; cx: number; cy: number; width: number; height: number }
interface ParsedEdge { id: string; points: Array<{ x: number; y: number }> }

/**
 * Parses Graphviz's "plain" text format (confirmed via a direct API smoke test this
 * session). All numbers are in inches; multiplying by 72 gives back our pixel space
 * (verified: feeding width=40/72 with fixedsize=true returns exactly 40/72 in the
 * output). Node x/y are CENTER coordinates, same convention as dagre — converted to
 * top-left here. `yInvert: true` (passed by the caller to Graphviz.layout) makes y
 * increase downward already, matching our SVG convention, so no y-flip is needed
 * here — only the unit and center-to-top-left conversions.
 *
 * Every edge line is `edge tail head n x1 y1 .. xn yn label xl yl style color` —
 * toDotSource always sets a label (our own edge id), so that field is always
 * present at index `4 + 2n` and is read directly as the id, rather than trying to
 * infer which diagram edge a line corresponds to from (tail, head) alone — dot's
 * plain output does not preserve edge declaration order (confirmed empirically),
 * so two parallel edges between the same pair of nodes would otherwise be
 * ambiguous.
 */
function parsePlain(text: string): { nodes: ParsedNode[]; edges: ParsedEdge[] } {
  const nodes: ParsedNode[] = [];
  const edges: ParsedEdge[] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'node') {
      const [, id, x, y, w, h] = parts;
      nodes.push({ id, cx: Number(x) * POINTS_PER_INCH, cy: Number(y) * POINTS_PER_INCH, width: Number(w) * POINTS_PER_INCH, height: Number(h) * POINTS_PER_INCH });
    } else if (parts[0] === 'edge') {
      const n = Number(parts[3]);
      const pointsStart = 4;
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < n; i++) {
        points.push({ x: Number(parts[pointsStart + i * 2]) * POINTS_PER_INCH, y: Number(parts[pointsStart + i * 2 + 1]) * POINTS_PER_INCH });
      }
      const id = parts[pointsStart + n * 2];
      edges.push({ id, points });
    }
  }
  return { nodes, edges };
}

export function fromPlainOutput(diagram: Diagram, plainText: string): PositionedDiagram {
  const { nodes: parsedNodes, edges: parsedEdges } = parsePlain(plainText);
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  const positionedNodes: PositionedNode[] = [];
  for (const parsed of parsedNodes) {
    const astNode = nodeById.get(parsed.id);
    if (!astNode) continue;
    positionedNodes.push({
      ...astNode,
      x: parsed.cx - parsed.width / 2,
      y: parsed.cy - parsed.height / 2,
      width: parsed.width,
      height: parsed.height,
    } as PositionedNode);
  }

  const positionedById = new Map(positionedNodes.map((n) => [n.id, n]));
  const positionedPools: PositionedPool[] = diagram.pools.map((pool) => {
    const poolNodes = pool.lanes.flatMap((lane) => lane.nodeIds).map((id) => positionedById.get(id)).filter((n): n is PositionedNode => Boolean(n));
    if (poolNodes.length === 0) return { id: pool.id, name: pool.name, x: 0, y: 0, width: 0, height: 0, lanes: [] };
    const x = Math.min(...poolNodes.map((n) => n.x));
    const y = Math.min(...poolNodes.map((n) => n.y));
    const maxX = Math.max(...poolNodes.map((n) => n.x + n.width));
    const maxY = Math.max(...poolNodes.map((n) => n.y + n.height));
    return { id: pool.id, name: pool.name, x, y, width: maxX - x, height: maxY - y, lanes: [] };
  });

  const astEdgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const edges: RoutedEdge[] = parsedEdges.map((e) => {
    const astEdge = astEdgeById.get(e.id)!;
    return { ...astEdge, points: e.points };
  });

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
```

- [ ] **Step 4: Run the parser test to verify it passes**

Run: `npx vitest run packages/layout-engine-graphviz/test/fromPlainOutput.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing end-to-end engine tests**

Create `packages/layout-engine-graphviz/test/engine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '@bpm/ast';
import { positionBoundaryEvents } from '@bpm/layout-core';
import { graphvizEngine } from '../src/index.js';

async function layout(diagram: Diagram) {
  return positionBoundaryEvents(diagram, await graphvizEngine.layout(diagram));
}

describe('graphviz engine', () => {
  it('is never auto-selected', () => {
    expect(graphvizEngine.matches({ pools: [], nodes: [], edges: [] })).toBe(false);
  });

  it('assigns top-left coordinates and size to every node, and routes every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram);
    expect(positioned.nodes).toHaveLength(2);
    for (const node of positioned.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;
    expect(n1.x).toBeLessThan(n2.x); // rankdir=LR
    expect(positioned.edges).toHaveLength(1);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('positions boundary events on their host activity border', async () => {
    const diagram: Diagram = {
      pools: [],
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

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run packages/layout-engine-graphviz/test/engine.test.ts`
Expected: FAIL — `../src/index.js` doesn't export `graphvizEngine` yet.

- [ ] **Step 7: Implement the engine and package entry point**

Create `packages/layout-engine-graphviz/src/engine.ts`:
```ts
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import type { Diagram } from '@bpm/ast';
import type { LayoutEngine, PositionedDiagram } from '@bpm/layout-core';
import { toDotSource } from './toDotSource.js';
import { fromPlainOutput } from './fromPlainOutput.js';

// Loaded lazily on first use, not at module import time — this is a WASM binary and
// should never affect app startup unless this engine is actually selected.
let graphvizPromise: Promise<Graphviz> | undefined;
function getGraphviz(): Promise<Graphviz> {
  if (!graphvizPromise) graphvizPromise = Graphviz.load();
  return graphvizPromise;
}

export const graphvizEngine: LayoutEngine = {
  name: 'graphviz',
  // Comparison engine only — never auto-selected. Reachable via the `layout:
  // graphviz` directive or the @bpm/layout facade's engineOverride option.
  matches: () => false,
  async layout(diagram: Diagram): Promise<PositionedDiagram> {
    const graphviz = await getGraphviz();
    const dot = toDotSource(diagram);
    // yInvert: true confirmed via direct API test this session to make y increase
    // downward, matching our SVG/top-left convention — no manual flip needed.
    const plainText = graphviz.layout(dot, 'plain', 'dot', { yInvert: true });
    return fromPlainOutput(diagram, plainText);
  },
};
```

Create `packages/layout-engine-graphviz/src/index.ts`:
```ts
export { graphvizEngine } from './engine.js';
```

- [ ] **Step 8: Build the package**

Run: `npm run build --workspace=@bpm/layout-engine-graphviz`
Expected: compiles cleanly.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run packages/layout-engine-graphviz`
Expected: PASS — all tests across `toDotSource.test.ts`, `fromPlainOutput.test.ts`, `engine.test.ts`.

- [ ] **Step 10: Register the engine in the `@bpm/layout` facade**

In `packages/layout/package.json`, add:
```json
    "@bpm/layout-engine-dagre": "*",
    "@bpm/layout-engine-graphviz": "*"
```

In `packages/layout/src/index.ts`:
```ts
import { dagreEngine } from '@bpm/layout-engine-dagre';
import { graphvizEngine } from '@bpm/layout-engine-graphviz';
```
and in `ensureDefaultEngines`:
```ts
function ensureDefaultEngines(): void {
  registerEngine(swimlaneEngine);
  registerEngine(flatEngine);
  registerEngine(elkNativeEngine);
  registerEngine(dagreEngine);
  registerEngine(graphvizEngine);
}
```

- [ ] **Step 11: Add a facade test**

In `packages/layout/test/facade.test.ts`, add:
```ts
  it('lets engineOverride reach graphviz and produce a valid layout', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        task('n2', 'Work'),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' }],
    };
    const positioned = await layout(diagram, { engineOverride: 'graphviz' });
    expect(positioned.nodes).toHaveLength(2);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 12: Rebuild and run the full workspace test suite**

Run: `npm run build --workspaces --if-present && npx vitest run`
Expected: PASS across every package.

- [ ] **Step 13: Commit**

```bash
git add packages/layout-engine-graphviz packages/layout
git commit -m "feat(layout-engine-graphviz): wire up the graphviz engine and register it"
```

---

## Task 7: Report-only crossing/overlap comparison for graphviz

**Files:**
- Modify: `packages/layout-engine-graphviz/package.json` (add `@bpm/parser` devDependency)
- Test: `packages/layout-engine-graphviz/test/crossing-comparison.test.ts`

**Interfaces:**
- Consumes: `VERIFICATION_DIAGRAMS`, `analyzeLayout`, `graphvizEngine` (Task 6) — identical shape to Task 4's dagre version.

- [ ] **Step 1: Add the dev dependency**

In `packages/layout-engine-graphviz/package.json`, add:
```json
  "devDependencies": {
    "@bpm/parser": "*"
  }
```

- [ ] **Step 2: Write the report-only test**

Create `packages/layout-engine-graphviz/test/crossing-comparison.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';
import { graphvizEngine } from '../src/index.js';

/** Report-only — graphviz is a comparison engine, not a production candidate. See
 * docs/superpowers/specs/2026-08-09-dagre-graphviz-engines-design.md. */
describe('graphviz geometry comparison — report only', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('diagram "%s"', async (name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await graphvizEngine.layout(diagram);
    const result = analyzeLayout(positioned);
    // eslint-disable-next-line no-console
    console.log(
      `[graphviz] ${name}: nodeOverlaps=${result.nodeOverlaps.length} edgeThroughNode=${result.edgeThroughNode.length} edgeCrossings=${result.edgeCrossings}`,
    );
  });
});
```

- [ ] **Step 3: Install and run**

Run: `npm install && npx vitest run packages/layout-engine-graphviz/test/crossing-comparison.test.ts`
Expected: PASS. Console prints one line per verification diagram.

- [ ] **Step 4: Commit**

```bash
git add packages/layout-engine-graphviz
git commit -m "test(layout-engine-graphviz): report-only geometry comparison vs. verification diagrams"
```

---

## Task 8: Toolbar toggle options for both engines

**Files:**
- Modify: `apps/web/index.html`
- Test: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: the `dagre`/`graphviz` engine names now registered in the facade (Tasks 3, 6) — no code changes needed in `apps/web/src/pipeline.ts` or `main.ts`, since both already thread an arbitrary `engineOverride` string through (built for `elk-native` and generic by construction).

- [ ] **Step 1: Add the two options**

In `apps/web/index.html`, change:
```html
        <select id="engine-override" class="toolbar-btn">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
          <option value="elk-native">ELK-native</option>
        </select>
```
to:
```html
        <select id="engine-override" class="toolbar-btn">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
          <option value="elk-native">ELK-native</option>
          <option value="dagre">Dagre</option>
          <option value="graphviz">Graphviz</option>
        </select>
```

- [ ] **Step 2: Rebuild and manually verify in the browser**

Run: `npm run build --workspaces --if-present && cd apps/web && npm run dev`
Open the printed local URL. Confirm:
- Both `Dagre` and `Graphviz` appear in the dropdown.
- Selecting `Dagre` or `Graphviz` on a pool/lane diagram (e.g. paste
  `poolLaneTwoBoundary` from `packages/layout-core/test-utils/verificationDiagrams.ts`)
  re-renders with all nodes flat — no lane bands — and the badge shows `DAGRE` /
  `GRAPHVIZ` respectively.
- No console errors on first selecting `Graphviz` (the WASM module loads lazily on
  that first call — expect a brief delay, not an error).

- [ ] **Step 3: Write the e2e test**

In `apps/web/test/e2e/live-render.spec.ts`, add:
```ts
test('dagre and graphviz engine options render without lane bands', async ({ page }) => {
  await page.goto('/');
  await page.locator('#engine-override').selectOption('dagre');
  await page.waitForTimeout(400);
  await expect(page.locator('#engine-badge')).toHaveText('dagre');
  await expect(page.locator('#preview svg')).toBeVisible();

  await page.locator('#engine-override').selectOption('graphviz');
  await page.waitForTimeout(800); // WASM load on first use
  await expect(page.locator('#engine-badge')).toHaveText('graphviz');
  await expect(page.locator('#preview svg')).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e suite**

Run: `cd apps/web && npx playwright test`
Expected: PASS — all existing e2e tests plus the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Dagre and Graphviz options to the engine-override toggle"
```

---

## Task 9: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Rebuild every workspace package**

Run: `npm run build --workspaces --if-present`
Expected: no errors.

- [ ] **Step 2: Run the full unit/integration test suite**

Run: `npx vitest run`
Expected: every package passes, including all tasks' new tests from this plan. Note
the printed `[dagre]`/`[graphviz]` comparison lines alongside the existing
`[elk-native]` ones and the swimlane engine's `BASELINE_CROSSINGS` for a full
five-way comparison.

- [ ] **Step 3: Run the e2e suite**

Run: `cd apps/web && npx playwright test`
Expected: PASS.

- [ ] **Step 4: Confirm branch state**

Run: `git log --oneline explore/elk-native-layout -15 && git status`
Expected: new commits for Tasks 1-8 on top of the existing elk-native work, clean
working tree, still on `explore/elk-native-layout`.
