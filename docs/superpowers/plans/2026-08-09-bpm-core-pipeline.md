# BPM Core Pipeline (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full text → AST → layout → SVG pipeline end-to-end, live, in a browser split-pane editor, for a foundational BPMN element set (start/end events, task, exclusive gateway, parallel gateway, sequence flow, pool/lane). This proves the architecture from the design spec works before extending element coverage toward the full BPMN 2.0 target.

**Architecture:** TypeScript npm-workspaces monorepo with independent packages (`ast`, `parser`, `layout`, `render`) connected by a strict one-directional pipeline, plus a Vite-based web app that wires them together with debounced re-rendering.

**Tech Stack:** TypeScript, npm workspaces, Vitest (unit tests), Playwright (e2e), elkjs (layout), Vite (web app dev server/bundler).

## Global Constraints

- Full BPMN 2.0 element coverage is the eventual v1 target (per spec); this plan intentionally covers only the foundational subset listed above — see "Deferred to later milestones" at the end of this plan.
- The concrete text syntax below is a first working syntax, not final — per spec, it's isolated entirely inside `@bpm/parser` and can change later without touching `@bpm/ast`, `@bpm/layout`, or `@bpm/render`.
- The parser must never throw on invalid input — it returns structured `{ line, column, message }` errors alongside a best-effort partial AST.
- The web editor must keep the last valid diagram rendered when the current text is invalid — never blank the preview.
- No BPMN XML import/export in this plan (deferred, per spec).
- Re-render pipeline runs on a 300ms debounce after the user stops typing; no incremental diffing in this milestone.

---

## File Structure

```
bpm/
  package.json                       # workspace root
  tsconfig.base.json
  packages/
    ast/
      package.json
      tsconfig.json
      src/types.ts                   # Node, Edge, Lane, Pool, Diagram types
      src/index.ts                   # public exports
      test/types.test.ts
    parser/
      package.json
      tsconfig.json
      src/errors.ts                  # ParseError type + helpers
      src/tokenizer.ts                # text -> lines with indentation info
      src/parser.ts                   # lines -> Diagram AST
      src/index.ts                    # public exports: parse(text): ParseResult
      test/parser.test.ts
    layout/
      package.json
      tsconfig.json
      src/toElkGraph.ts               # Diagram -> ELK input graph
      src/fromElkLayout.ts            # ELK output -> PositionedDiagram
      src/index.ts                    # public exports: layout(diagram): Promise<PositionedDiagram>
      test/layout.test.ts
    render/
      package.json
      tsconfig.json
      src/shapes.ts                   # node type -> SVG shape markup
      src/edges.ts                    # routed edge -> SVG path + arrowhead + label
      src/index.ts                    # public exports: render(positioned): string (SVG)
      test/render.test.ts
  apps/
    web/
      package.json
      tsconfig.json
      index.html
      src/main.ts                     # wires editor -> parse -> layout -> render -> preview
      src/pipeline.ts                 # debounced orchestration + error-state handling
      test/e2e/live-render.spec.ts    # Playwright smoke test
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `packages/ast/package.json`, `packages/ast/tsconfig.json`
- Create: `packages/parser/package.json`, `packages/parser/tsconfig.json`
- Create: `packages/layout/package.json`, `packages/layout/tsconfig.json`
- Create: `packages/render/package.json`, `packages/render/tsconfig.json`
- Create: `vitest.workspace.ts`

**Interfaces:**
- Produces: an npm workspace where `packages/ast`, `packages/parser`, `packages/layout`, `packages/render` are installable as `@bpm/ast`, `@bpm/parser`, `@bpm/layout`, `@bpm/render`, each with `npm run build` (tsc) and `npm test` (vitest) working.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "bpm",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Create each package's `package.json` and `tsconfig.json`**

`packages/ast/package.json`:
```json
{
  "name": "@bpm/ast",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" }
}
```

`packages/ast/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Repeat the same two files for `packages/parser`, `packages/layout`, `packages/render`, substituting the package name (`@bpm/parser`, `@bpm/layout`, `@bpm/render`). `@bpm/parser` depends on `@bpm/ast`; `@bpm/layout` depends on `@bpm/ast`; `@bpm/render` depends on `@bpm/ast`. Add these as `"dependencies": { "@bpm/ast": "*" }` in the respective `package.json`.

- [ ] **Step 4: Create `vitest.workspace.ts`**

```ts
export default ['packages/*'];
```

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: installs cleanly, creates a single root `node_modules` with workspace symlinks for `@bpm/*` packages.

Run: `npm test`
Expected: Vitest runs with "No test files found" (expected — no source yet) and exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.base.json packages/*/package.json packages/*/tsconfig.json vitest.workspace.ts
git commit -m "chore: scaffold npm workspaces monorepo"
```

---

### Task 2: `@bpm/ast` core types

**Files:**
- Create: `packages/ast/src/types.ts`
- Create: `packages/ast/src/index.ts`
- Test: `packages/ast/test/types.test.ts`

**Interfaces:**
- Produces:
  - `type NodeType = 'start' | 'end' | 'task' | 'exclusiveGateway' | 'parallelGateway'`
  - `interface DiagramNode { id: string; type: NodeType; label: string }`
  - `interface DiagramEdge { id: string; sourceId: string; targetId: string; label?: string }`
  - `interface Lane { id: string; name: string; nodeIds: string[] }`
  - `interface Pool { id: string; name: string; lanes: Lane[] }`
  - `interface Diagram { pools: Pool[]; nodes: DiagramNode[]; edges: DiagramEdge[] }`

- [ ] **Step 1: Write the failing test**

`packages/ast/test/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram } from '../src/index.js';

describe('Diagram AST shape', () => {
  it('supports a minimal one-pool, one-lane, two-node diagram', () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }],
        },
      ],
      nodes: [
        { id: 'n1', type: 'start', label: 'Order received' },
        { id: 'n2', type: 'task', label: 'Review order' },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }],
    };

    expect(diagram.pools[0].lanes[0].nodeIds).toEqual(['n1', 'n2']);
    expect(diagram.edges[0]).toEqual({ id: 'e1', sourceId: 'n1', targetId: 'n2' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write the types**

`packages/ast/src/types.ts`:
```ts
export type NodeType = 'start' | 'end' | 'task' | 'exclusiveGateway' | 'parallelGateway';

export interface DiagramNode {
  id: string;
  type: NodeType;
  label: string;
}

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface Lane {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface Pool {
  id: string;
  name: string;
  lanes: Lane[];
}

export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
```

`packages/ast/src/index.ts`:
```ts
export type { NodeType, DiagramNode, DiagramEdge, Lane, Pool, Diagram } from './types.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ast/src packages/ast/test
git commit -m "feat(ast): add core Diagram AST types"
```

---

### Task 3: `@bpm/parser` — flat nodes and edges (no pools/lanes yet)

**Files:**
- Create: `packages/parser/src/errors.ts`
- Create: `packages/parser/src/parser.ts`
- Create: `packages/parser/src/index.ts`
- Test: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: `Diagram`, `DiagramNode`, `DiagramEdge`, `NodeType` from `@bpm/ast`.
- Produces:
  - `interface ParseError { line: number; column: number; message: string }`
  - `interface ParseResult { diagram: Diagram; errors: ParseError[] }`
  - `function parse(text: string): ParseResult`

Concrete v1 syntax (flat, no pools/lanes):
```
start "Order received" as n1
task "Review order" as n2
gateway "Approved?" as g1
end "Done" as n3
end "Rejected" as n4

n1 -> n2
n2 -> g1
g1 -> n3 : yes
g1 -> n4 : no
```
- Node line: `<type> "<label>" as <id>` where `<type>` is `start`, `end`, `task`, `gateway` (exclusive), or `parallel` (parallel gateway).
- Edge line: `<sourceId> -> <targetId>` optionally followed by `: <label>`.
- Blank lines are ignored.

- [ ] **Step 1: Write the failing test**

`packages/parser/test/parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';

describe('parse (flat nodes/edges)', () => {
  it('parses nodes and edges with no errors', () => {
    const text = [
      'start "Order received" as n1',
      'task "Review order" as n2',
      'gateway "Approved?" as g1',
      'end "Done" as n3',
      'end "Rejected" as n4',
      '',
      'n1 -> n2',
      'n2 -> g1',
      'g1 -> n3 : yes',
      'g1 -> n4 : no',
    ].join('\n');

    const { diagram, errors } = parse(text);

    expect(errors).toEqual([]);
    expect(diagram.nodes).toEqual([
      { id: 'n1', type: 'start', label: 'Order received' },
      { id: 'n2', type: 'task', label: 'Review order' },
      { id: 'g1', type: 'exclusiveGateway', label: 'Approved?' },
      { id: 'n3', type: 'end', label: 'Done' },
      { id: 'n4', type: 'end', label: 'Rejected' },
    ]);
    expect(diagram.edges).toEqual([
      { id: 'e1', sourceId: 'n1', targetId: 'n2', label: undefined },
      { id: 'e2', sourceId: 'n2', targetId: 'g1', label: undefined },
      { id: 'e3', sourceId: 'g1', targetId: 'n3', label: 'yes' },
      { id: 'e4', sourceId: 'g1', targetId: 'n4', label: 'no' },
    ]);
  });

  it('reports a structured error for an unknown node type, and keeps parsing', () => {
    const text = 'bogus "Whoops" as n1\ntask "Review" as n2';
    const { diagram, errors } = parse(text);

    expect(errors).toEqual([
      { line: 1, column: 1, message: 'Unknown node type "bogus"' },
    ]);
    expect(diagram.nodes).toEqual([{ id: 'n2', type: 'task', label: 'Review' }]);
  });

  it('reports a structured error when an edge references an unknown node id', () => {
    const text = 'task "Review" as n2\nn2 -> nope';
    const { diagram, errors } = parse(text);

    expect(errors).toEqual([
      { line: 2, column: 1, message: 'Edge references unknown node id "nope"' },
    ]);
    expect(diagram.edges).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `errors.ts`**

`packages/parser/src/errors.ts`:
```ts
export interface ParseError {
  line: number;
  column: number;
  message: string;
}
```

- [ ] **Step 4: Write `parser.ts`**

`packages/parser/src/parser.ts`:
```ts
import type { Diagram, DiagramNode, DiagramEdge, NodeType } from '@bpm/ast';
import type { ParseError } from './errors.js';

const NODE_TYPE_MAP: Record<string, NodeType> = {
  start: 'start',
  end: 'end',
  task: 'task',
  gateway: 'exclusiveGateway',
  parallel: 'parallelGateway',
};

const NODE_LINE = /^(\w+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const EDGE_LINE = /^(\S+)\s*->\s*(\S+)(?:\s*:\s*(.+))?$/;

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

export function parse(text: string): ParseResult {
  const lines = text.split('\n');
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const errors: ParseError[] = [];
  const knownIds = new Set<string>();
  let edgeCounter = 0;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') return;

    const nodeMatch = line.match(NODE_LINE);
    if (nodeMatch) {
      const [, typeToken, label, id] = nodeMatch;
      const type = NODE_TYPE_MAP[typeToken];
      if (!type) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown node type "${typeToken}"` });
        return;
      }
      nodes.push({ id, type, label });
      knownIds.add(id);
      return;
    }

    const edgeMatch = line.match(EDGE_LINE);
    if (edgeMatch) {
      const [, sourceId, targetId, label] = edgeMatch;
      if (!knownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!knownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      edgeCounter += 1;
      edges.push({ id: `e${edgeCounter}`, sourceId, targetId, label: label?.trim() });
      return;
    }

    errors.push({ line: lineNumber, column: 1, message: `Could not parse line: "${line}"` });
  });

  return {
    diagram: { pools: [], nodes, edges },
    errors,
  };
}
```

- [ ] **Step 5: Write `index.ts`**

`packages/parser/src/index.ts`:
```ts
export { parse } from './parser.js';
export type { ParseResult } from './parser.js';
export type { ParseError } from './errors.js';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/parser/src packages/parser/test
git commit -m "feat(parser): parse flat nodes and edges with structured errors"
```

---

### Task 4: `@bpm/parser` — pool/lane indentation parsing

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Test: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: same as Task 3.
- Produces: `parse()` now also populates `diagram.pools` from indented `pool`/`lane` blocks; nodes declared inside a lane are still added to `diagram.nodes` (flat) *and* referenced by id in `Lane.nodeIds`.

Extended syntax:
```
pool "Order Process"
  lane "Sales"
    start "Order received" as n1
    task "Review order" as n2
  lane "Warehouse"
    task "Pack order" as n3

n1 -> n2
n2 -> n3
```
Indentation: `pool` at column 0, `lane` indented by 2 spaces under its pool, node lines indented by 4 spaces under their lane. Edges are always unindented and come after all pool/lane blocks.

- [ ] **Step 1: Write the failing test**

Add to `packages/parser/test/parser.test.ts`:
```ts
it('parses pools and lanes, assigning nodes to their lane', () => {
  const text = [
    'pool "Order Process"',
    '  lane "Sales"',
    '    start "Order received" as n1',
    '    task "Review order" as n2',
    '  lane "Warehouse"',
    '    task "Pack order" as n3',
    '',
    'n1 -> n2',
    'n2 -> n3',
  ].join('\n');

  const { diagram, errors } = parse(text);

  expect(errors).toEqual([]);
  expect(diagram.pools).toEqual([
    {
      id: 'pool1',
      name: 'Order Process',
      lanes: [
        { id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] },
        { id: 'lane2', name: 'Warehouse', nodeIds: ['n3'] },
      ],
    },
  ]);
  expect(diagram.nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
});

it('reports a structured error for a node line indented outside any lane', () => {
  const text = '    task "Orphan" as n1';
  const { errors } = parse(text);
  expect(errors).toEqual([
    { line: 1, column: 1, message: 'Node is indented but not inside a pool/lane block' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: FAIL — new tests fail because pools are still always `[]`.

- [ ] **Step 3: Rewrite `parser.ts` to track indentation and pool/lane context**

`packages/parser/src/parser.ts`:
```ts
import type { Diagram, DiagramNode, DiagramEdge, NodeType, Pool, Lane } from '@bpm/ast';
import type { ParseError } from './errors.js';

const NODE_TYPE_MAP: Record<string, NodeType> = {
  start: 'start',
  end: 'end',
  task: 'task',
  gateway: 'exclusiveGateway',
  parallel: 'parallelGateway',
};

const POOL_LINE = /^pool\s+"([^"]*)"$/;
const LANE_LINE = /^lane\s+"([^"]*)"$/;
const NODE_LINE = /^(\w+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const EDGE_LINE = /^(\S+)\s*->\s*(\S+)(?:\s*:\s*(.+))?$/;

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

function indentOf(rawLine: string): number {
  const match = rawLine.match(/^ */);
  return match ? match[0].length : 0;
}

export function parse(text: string): ParseResult {
  const lines = text.split('\n');
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const errors: ParseError[] = [];
  const pools: Pool[] = [];
  const knownIds = new Set<string>();

  let currentPool: Pool | null = null;
  let currentLane: Lane | null = null;
  let poolCounter = 0;
  let laneCounter = 0;
  let edgeCounter = 0;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') return;
    const indent = indentOf(rawLine);

    const poolMatch = line.match(POOL_LINE);
    if (poolMatch && indent === 0) {
      poolCounter += 1;
      currentPool = { id: `pool${poolCounter}`, name: poolMatch[1], lanes: [] };
      currentLane = null;
      pools.push(currentPool);
      return;
    }

    const laneMatch = line.match(LANE_LINE);
    if (laneMatch && indent === 2 && currentPool) {
      laneCounter += 1;
      currentLane = { id: `lane${laneCounter}`, name: laneMatch[1], nodeIds: [] };
      currentPool.lanes.push(currentLane);
      return;
    }

    const nodeMatch = line.match(NODE_LINE);
    if (nodeMatch) {
      const [, typeToken, label, id] = nodeMatch;
      const type = NODE_TYPE_MAP[typeToken];
      if (!type) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown node type "${typeToken}"` });
        return;
      }
      if (indent > 0 && !currentLane) {
        errors.push({ line: lineNumber, column: 1, message: 'Node is indented but not inside a pool/lane block' });
        return;
      }
      nodes.push({ id, type, label });
      knownIds.add(id);
      if (currentLane) currentLane.nodeIds.push(id);
      return;
    }

    const edgeMatch = line.match(EDGE_LINE);
    if (edgeMatch) {
      const [, sourceId, targetId, label] = edgeMatch;
      if (!knownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!knownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      edgeCounter += 1;
      edges.push({ id: `e${edgeCounter}`, sourceId, targetId, label: label?.trim() });
      return;
    }

    errors.push({ line: lineNumber, column: 1, message: `Could not parse line: "${line}"` });
  });

  return {
    diagram: { pools, nodes, edges },
    errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): parse pool/lane indentation blocks"
```

---

### Task 5: `@bpm/layout` — Diagram to ELK graph, and running layout

**Files:**
- Create: `packages/layout/package.json` dependency addition (`elkjs`)
- Create: `packages/layout/src/toElkGraph.ts`
- Create: `packages/layout/src/fromElkLayout.ts`
- Create: `packages/layout/src/index.ts`
- Test: `packages/layout/test/layout.test.ts`

**Interfaces:**
- Consumes: `Diagram`, `DiagramNode`, `DiagramEdge`, `Pool`, `Lane` from `@bpm/ast`.
- Produces:
  - `interface PositionedNode extends DiagramNode { x: number; y: number; width: number; height: number }`
  - `interface RoutedEdge extends DiagramEdge { points: Array<{ x: number; y: number }> }`
  - `interface PositionedPool { id: string; name: string; x: number; y: number; width: number; height: number; lanes: PositionedLane[] }`
  - `interface PositionedLane { id: string; name: string; x: number; y: number; width: number; height: number }`
  - `interface PositionedDiagram { pools: PositionedPool[]; nodes: PositionedNode[]; edges: RoutedEdge[] }`
  - `function layout(diagram: Diagram): Promise<PositionedDiagram>`

- [ ] **Step 1: Add `elkjs` dependency**

`packages/layout/package.json`:
```json
{
  "name": "@bpm/layout",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "elkjs": "^0.9.3"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Write the failing test**

`packages/layout/test/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { layout } from '../src/index.js';
import type { Diagram } from '@bpm/ast';

describe('layout', () => {
  it('assigns coordinates and size to every node, and routes every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { id: 'n1', type: 'start', label: 'Start' },
        { id: 'n2', type: 'task', label: 'Do work' },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }],
    };

    const positioned = await layout(diagram);

    expect(positioned.nodes).toHaveLength(2);
    for (const node of positioned.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    expect(positioned.edges).toHaveLength(1);
    expect(positioned.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps lane bounds containing their nodes', async () => {
    const diagram: Diagram = {
      pools: [
        {
          id: 'pool1',
          name: 'Order Process',
          lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }],
        },
      ],
      nodes: [
        { id: 'n1', type: 'start', label: 'Start' },
        { id: 'n2', type: 'task', label: 'Do work' },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }],
    };

    const positioned = await layout(diagram);
    const lane = positioned.pools[0].lanes[0];
    const n1 = positioned.nodes.find((n) => n.id === 'n1')!;
    const n2 = positioned.nodes.find((n) => n.id === 'n2')!;

    for (const n of [n1, n2]) {
      expect(n.x).toBeGreaterThanOrEqual(lane.x);
      expect(n.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.x + n.width).toBeLessThanOrEqual(lane.x + lane.width);
      expect(n.y + n.height).toBeLessThanOrEqual(lane.y + lane.height);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 4: Write `toElkGraph.ts`**

`packages/layout/src/toElkGraph.ts`:
```ts
import type { Diagram, NodeType } from '@bpm/ast';

const SIZE_BY_TYPE: Record<NodeType, { width: number; height: number }> = {
  start: { width: 40, height: 40 },
  end: { width: 40, height: 40 },
  task: { width: 120, height: 60 },
  exclusiveGateway: { width: 50, height: 50 },
  parallelGateway: { width: 50, height: 50 },
};

export function toElkGraph(diagram: Diagram) {
  const laneNodeIds = new Set(
    diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds))
  );

  const unassignedNodes = diagram.nodes.filter((n) => !laneNodeIds.has(n.id));

  const poolChildren = diagram.pools.map((pool) => ({
    id: pool.id,
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    children: pool.lanes.map((lane) => ({
      id: lane.id,
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
      children: lane.nodeIds.map((id) => {
        const node = diagram.nodes.find((n) => n.id === id)!;
        return { id: node.id, ...SIZE_BY_TYPE[node.type] };
      }),
    })),
  }));

  const looseNodeChildren = unassignedNodes.map((node) => ({
    id: node.id,
    ...SIZE_BY_TYPE[node.type],
  }));

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: [...poolChildren, ...looseNodeChildren],
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
    })),
  };
}
```

- [ ] **Step 5: Write `fromElkLayout.ts`**

`packages/layout/src/fromElkLayout.ts`:
```ts
import type { Diagram } from '@bpm/ast';
import type {
  PositionedDiagram,
  PositionedNode,
  PositionedPool,
  PositionedLane,
  RoutedEdge,
} from './types.js';

// Minimal shape of elkjs's layout output that we rely on.
interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkNode[];
}
interface ElkEdgeSection {
  startPoint: { x: number; y: number };
  bendPoints?: { x: number; y: number }[];
  endPoint: { x: number; y: number };
}
interface ElkEdge {
  id: string;
  sections?: ElkEdgeSection[];
}
interface ElkGraph {
  children?: ElkNode[];
  edges?: ElkEdge[];
}

function absolutePosition(
  elkNode: ElkNode,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  return { x: offsetX + (elkNode.x ?? 0), y: offsetY + (elkNode.y ?? 0) };
}

export function fromElkLayout(diagram: Diagram, elkGraph: ElkGraph): PositionedDiagram {
  const positionedNodes: PositionedNode[] = [];
  const positionedPools: PositionedPool[] = [];

  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  function visitContainer(elkNode: ElkNode, offsetX: number, offsetY: number) {
    const { x, y } = absolutePosition(elkNode, offsetX, offsetY);
    for (const child of elkNode.children ?? []) {
      const astNode = nodeById.get(child.id);
      if (astNode) {
        const pos = absolutePosition(child, x, y);
        positionedNodes.push({
          ...astNode,
          x: pos.x,
          y: pos.y,
          width: child.width ?? 0,
          height: child.height ?? 0,
        });
      } else if (child.children) {
        visitContainer(child, x, y);
      }
    }
  }

  for (const elkChild of elkGraph.children ?? []) {
    const pool = diagram.pools.find((p) => p.id === elkChild.id);
    if (pool) {
      const poolPos = absolutePosition(elkChild, 0, 0);
      const positionedLanes: PositionedLane[] = [];
      for (const elkLane of elkChild.children ?? []) {
        const lane = pool.lanes.find((l) => l.id === elkLane.id);
        if (!lane) continue;
        const lanePos = absolutePosition(elkLane, poolPos.x, poolPos.y);
        positionedLanes.push({
          id: lane.id,
          name: lane.name,
          x: lanePos.x,
          y: lanePos.y,
          width: elkLane.width ?? 0,
          height: elkLane.height ?? 0,
        });
        for (const elkNode of elkLane.children ?? []) {
          const astNode = nodeById.get(elkNode.id);
          if (!astNode) continue;
          const nodePos = absolutePosition(elkNode, lanePos.x, lanePos.y);
          positionedNodes.push({
            ...astNode,
            x: nodePos.x,
            y: nodePos.y,
            width: elkNode.width ?? 0,
            height: elkNode.height ?? 0,
          });
        }
      }
      positionedPools.push({
        id: pool.id,
        name: pool.name,
        x: poolPos.x,
        y: poolPos.y,
        width: elkChild.width ?? 0,
        height: elkChild.height ?? 0,
        lanes: positionedLanes,
      });
    } else {
      visitContainer({ id: 'wrapper', children: [elkChild] }, 0, 0);
    }
  }

  const edges: RoutedEdge[] = (elkGraph.edges ?? []).map((elkEdge) => {
    const astEdge = diagram.edges.find((e) => e.id === elkEdge.id)!;
    const section = elkEdge.sections?.[0];
    const points = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    return { ...astEdge, points };
  });

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
```

- [ ] **Step 6: Write `types.ts` and `index.ts`**

`packages/layout/src/types.ts`:
```ts
import type { DiagramNode, DiagramEdge } from '@bpm/ast';

export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoutedEdge extends DiagramEdge {
  points: Array<{ x: number; y: number }>;
}

export interface PositionedLane {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedPool {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lanes: PositionedLane[];
}

export interface PositionedDiagram {
  pools: PositionedPool[];
  nodes: PositionedNode[];
  edges: RoutedEdge[];
}
```

`packages/layout/src/index.ts`:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from '@bpm/ast';
import { toElkGraph } from './toElkGraph.js';
import { fromElkLayout } from './fromElkLayout.js';
import type { PositionedDiagram } from './types.js';

const elk = new ELK();

export async function layout(diagram: Diagram): Promise<PositionedDiagram> {
  const elkGraph = toElkGraph(diagram);
  const laidOut = await elk.layout(elkGraph);
  return fromElkLayout(diagram, laidOut as any);
}

export type {
  PositionedDiagram,
  PositionedNode,
  RoutedEdge,
  PositionedPool,
  PositionedLane,
} from './types.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: PASS (both tests)

- [ ] **Step 8: Commit**

```bash
git add packages/layout
git commit -m "feat(layout): convert AST to ELK graph and run layout"
```

---

### Task 6: `@bpm/render` — shapes and edges to SVG

**Files:**
- Create: `packages/render/src/shapes.ts`
- Create: `packages/render/src/edges.ts`
- Create: `packages/render/src/index.ts`
- Test: `packages/render/test/render.test.ts`

**Interfaces:**
- Consumes: `PositionedDiagram`, `PositionedNode`, `RoutedEdge`, `PositionedPool`, `PositionedLane` from `@bpm/layout`.
- Produces: `function render(diagram: PositionedDiagram): string` — a complete `<svg>...</svg>` string.

- [ ] **Step 1: Write the failing test**

`packages/render/test/render.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render } from '../src/index.js';
import type { PositionedDiagram } from '@bpm/layout';

describe('render', () => {
  it('renders an svg containing one shape per node and one path per edge', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [
        { id: 'n1', type: 'start', label: 'Start', x: 0, y: 0, width: 40, height: 40 },
        { id: 'n2', type: 'task', label: 'Do work', x: 100, y: 0, width: 120, height: 60 },
      ],
      edges: [
        {
          id: 'e1',
          sourceId: 'n1',
          targetId: 'n2',
          points: [
            { x: 40, y: 20 },
            { x: 100, y: 30 },
          ],
        },
      ],
    };

    const svg = render(diagram);

    expect(svg).toContain('<svg');
    expect(svg).toContain('data-node-id="n1"');
    expect(svg).toContain('data-node-id="n2"');
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('Do work');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `shapes.ts`**

`packages/render/src/shapes.ts`:
```ts
import type { PositionedNode } from '@bpm/layout';

export function renderNode(node: PositionedNode): string {
  const { x, y, width, height, label, type, id } = node;
  const labelEl = `<text x="${x + width / 2}" y="${y + height + 14}" text-anchor="middle" font-size="12">${escapeXml(label)}</text>`;

  if (type === 'start' || type === 'end') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.min(width, height) / 2;
    const stroke = type === 'end' ? 'stroke-width="3"' : 'stroke-width="1.5"';
    return `<g data-node-id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" ${stroke}/>${labelEl}</g>`;
  }

  if (type === 'exclusiveGateway' || type === 'parallelGateway') {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const half = width / 2;
    const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
    const marker =
      type === 'exclusiveGateway'
        ? `<line x1="${cx - 8}" y1="${cy - 8}" x2="${cx + 8}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy + 8}" x2="${cx + 8}" y2="${cy - 8}" stroke="black"/>`
        : `<line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="black"/>`;
    return `<g data-node-id="${id}"><polygon points="${points}" fill="white" stroke="black"/>${marker}${labelEl}</g>`;
  }

  // task
  return `<g data-node-id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="white" stroke="black"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12">${escapeXml(label)}</text></g>`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Write `edges.ts`**

`packages/render/src/edges.ts`:
```ts
import type { RoutedEdge } from '@bpm/layout';
import { escapeXml } from './shapes.js';

export function renderEdge(edge: RoutedEdge): string {
  const { id, points, label } = edge;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2] ?? last;
  const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
  const arrowSize = 8;
  const arrowP1 = {
    x: last.x - arrowSize * Math.cos(angle - Math.PI / 6),
    y: last.y - arrowSize * Math.sin(angle - Math.PI / 6),
  };
  const arrowP2 = {
    x: last.x - arrowSize * Math.cos(angle + Math.PI / 6),
    y: last.y - arrowSize * Math.sin(angle + Math.PI / 6),
  };
  const arrow = `<polygon points="${last.x},${last.y} ${arrowP1.x},${arrowP1.y} ${arrowP2.x},${arrowP2.y}" fill="black"/>`;
  const labelEl = label
    ? `<text x="${(points[0].x + last.x) / 2}" y="${(points[0].y + last.y) / 2 - 4}" text-anchor="middle" font-size="11">${escapeXml(label)}</text>`
    : '';

  return `<g data-edge-id="${id}"><path d="${pathD}" fill="none" stroke="black" stroke-width="1.5"/>${arrow}${labelEl}</g>`;
}
```

- [ ] **Step 5: Write `index.ts`**

`packages/render/src/index.ts`:
```ts
import type { PositionedDiagram } from '@bpm/layout';
import { renderNode, escapeXml } from './shapes.js';
import { renderEdge } from './edges.js';

export function render(diagram: PositionedDiagram): string {
  const allX = [
    ...diagram.nodes.map((n) => n.x + n.width),
    ...diagram.pools.map((p) => p.x + p.width),
  ];
  const allY = [
    ...diagram.nodes.map((n) => n.y + n.height),
    ...diagram.pools.map((p) => p.y + p.height),
  ];
  const maxX = Math.max(40, ...allX) + 40;
  const maxY = Math.max(40, ...allY) + 40;

  const poolEls = diagram.pools
    .map((pool) => {
      const laneEls = pool.lanes
        .map(
          (lane) =>
            `<g data-lane-id="${lane.id}"><rect x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}" fill="none" stroke="#999"/><text x="${lane.x + 4}" y="${lane.y + 14}" font-size="11">${escapeXml(lane.name)}</text></g>`
        )
        .join('');
      return `<g data-pool-id="${pool.id}"><rect x="${pool.x}" y="${pool.y}" width="${pool.width}" height="${pool.height}" fill="none" stroke="#333" stroke-width="2"/>${laneEls}</g>`;
    })
    .join('');

  const nodeEls = diagram.nodes.map(renderNode).join('');
  const edgeEls = diagram.edges.map(renderEdge).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">${poolEls}${nodeEls}${edgeEls}</svg>`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/render
git commit -m "feat(render): render positioned diagram to SVG"
```

---

### Task 7: `apps/web` — Vite scaffold with split-pane editor and live pipeline

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/pipeline.ts`
- Create: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: `parse` from `@bpm/parser`, `layout` from `@bpm/layout`, `render` from `@bpm/render`.
- Produces: `function runPipeline(text: string): Promise<{ svg: string; errors: ParseError[] }>` in `pipeline.ts`, used by `main.ts` to wire the DOM together. This is what Playwright will exercise indirectly through the running app.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@bpm/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@bpm/parser": "*",
    "@bpm/layout": "*",
    "@bpm/render": "*"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@playwright/test": "^1.47.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/web/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>BPM Live Editor</title>
    <style>
      body { margin: 0; display: flex; height: 100vh; font-family: sans-serif; }
      #editor { width: 50%; height: 100%; font-family: monospace; font-size: 14px; border: none; border-right: 1px solid #ccc; padding: 8px; box-sizing: border-box; }
      #preview { width: 50%; height: 100%; overflow: auto; padding: 8px; box-sizing: border-box; }
      #errors { color: #b00020; font-size: 12px; white-space: pre-wrap; padding: 0 8px; }
    </style>
  </head>
  <body>
    <textarea id="editor" spellcheck="false"></textarea>
    <div id="preview-container">
      <div id="errors"></div>
      <div id="preview"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Write `pipeline.ts`**

`apps/web/src/pipeline.ts`:
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
  const positioned = await layout(diagram);
  const svg = render(positioned);
  return { svg, errors: [] };
}
```

- [ ] **Step 5: Write `main.ts`**

`apps/web/src/main.ts`:
```ts
import { runPipeline } from './pipeline.js';

const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const errorsEl = document.querySelector<HTMLDivElement>('#errors')!;

const STARTER_TEXT = [
  'start "Order received" as n1',
  'task "Review order" as n2',
  'n1 -> n2',
].join('\n');

editor.value = STARTER_TEXT;

let debounceHandle: ReturnType<typeof setTimeout> | undefined;

async function rerender() {
  const result = await runPipeline(editor.value);
  if (result.errors.length > 0) {
    errorsEl.textContent = result.errors
      .map((e) => `Line ${e.line}: ${e.message}`)
      .join('\n');
    // Last valid diagram stays rendered: do not touch `preview.innerHTML`.
    return;
  }
  errorsEl.textContent = '';
  preview.innerHTML = result.svg!;
}

editor.addEventListener('input', () => {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(rerender, 300);
});

rerender();
```

- [ ] **Step 6: Manual verification**

Run: `npm install && npm run dev --workspace=@bpm/web`
Open the printed local URL in a browser. Expected: left pane has starter text, right pane shows a start circle, a task box, and an arrow between them. Typing an invalid line (e.g., `bogus "x" as n9`) shows a red error message below the preview, and the previous valid diagram stays visible.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): live split-pane editor wiring parse/layout/render"
```

---

### Task 8: `apps/web` — Playwright smoke test

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: the running `apps/web` dev server (started by Playwright's `webServer` config).

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:5173' },
});
```

- [ ] **Step 2: Write the failing test**

`apps/web/test/e2e/live-render.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('typing valid diagram text renders an svg with nodes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible();
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();
});

test('invalid text shows an inline error and keeps the last valid diagram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400); // debounce window

  await expect(page.locator('#errors')).toContainText('Unknown node type');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();
});
```

- [ ] **Step 3: Run test to verify it fails, then install browsers if needed**

Run: `npx playwright install --with-deps chromium` (first time only)
Run: `npm run test:e2e --workspace=@bpm/web`
Expected: FAIL initially if Task 7 isn't complete; once Task 7's `main.ts`/`pipeline.ts` are in place, this should PASS on first run.

- [ ] **Step 4: Confirm passing**

Run: `npm run test:e2e --workspace=@bpm/web`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/test
git commit -m "test(web): add Playwright smoke test for live rendering"
```

---

## Self-Review Notes

- **Spec coverage:** This plan implements the architecture (5 packages, decoupled parser, ELK-based layout, SVG render, live debounced web editor), the error-handling behavior (structured parse errors, last-valid-diagram-stays-rendered), and the testing shape (unit tests per package + Playwright smoke test) exactly as specified. It deliberately implements a **foundational element subset**, not the full BPMN 2.0 set, as an explicit phased first milestone — see below.
- **Type consistency:** `NodeType`, `DiagramNode`, `DiagramEdge`, `Pool`, `Lane` from Task 2 are the exact types consumed unchanged through parser (Task 3–4), layout (Task 5), and render (Task 6). `PositionedNode`/`RoutedEdge`/`PositionedPool`/`PositionedLane` from Task 5 are the exact types consumed by Task 6. `ParseError`/`ParseResult` from Task 3 are consumed unchanged by Task 7's `pipeline.ts`.

## Deferred to later milestones

- Remaining BPMN event types (timer, message, error, signal), boundary events, sub-processes, data objects/associations, inclusive gateway.
- BPMN 2.0 XML import/export.
- CLI packaging of the shared core.
- Manual layout overrides / diagram-to-text editing.
- Final syntax design (current syntax is a deliberately simple v1 starting point, isolated in `@bpm/parser`).
