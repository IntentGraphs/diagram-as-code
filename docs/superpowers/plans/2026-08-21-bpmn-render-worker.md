# BPMN Render Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop large BPMN diagrams from freezing the browser main thread by moving ELK/swimlane/routing layout work into a Web Worker, and give the web editor a real loading/cancel/timeout/recovery experience built on top of it.

**Architecture:** `apps/web/src/renderController.ts` gains an `execute: RenderExecutor` seam that, in production, spawns one dedicated Web Worker per render attempt (`apps/web/src/renderWorker.ts`, wrapped by `apps/web/src/renderExecutors.ts`) and runs the existing `runPipeline`/`executeDiagramSource` pipeline inside it unchanged. The controller owns an `AbortController` + 30s timeout per attempt, a monotonically increasing "generation" counter that lets a newer `render()` call silently supersede an older one, and an extended `RenderControllerState` (phase, elapsed time, cancel affordance) that `apps/web/src/main.ts` renders as a spinner/status/cancel-button strip. `packages/diagram-runtime/src/registry.ts` gains one optional, additive `onPhase` callback so the worker can report coarse progress without touching any layout/routing algorithm.

**Tech Stack:** TypeScript, Vite 8 (native `new Worker(new URL(...), { type: 'module' })`), Vitest 4, Playwright.

## Global Constraints

- Work on a new branch `codex/bpmn-render-worker`, branched from the current `codex/layout-quality-complete` (commit `a425dfd`). Never reset/discard/overwrite existing work on that branch.
- Do not raise `MAX_LAYOUT_HARD_COMPLEXITY` (25,000, in `packages/validate/src/index.ts:58`) and do not change `MAX_LAYOUT_COMPLEXITY` (10,000, line 56) or `LAYOUT_COMPLEXITY_WARNING` (5,000, line 60).
- Do not alter port-allocation, shape-placement, or edge-routing algorithms: no behavioral changes inside `packages/layout-engine-swimlane/src/laneBanding.ts` or `packages/diagram-core/src/routing/router.ts`. Only additive, optional instrumentation is allowed at the `registry.ts` composition-root boundary.
- CLI/non-web callers (`packages/cli/src/commands/{export,render,validate}.ts`) call `executeDiagramSource`/`validateDiagramSource` directly and must keep behaving identically when they omit the new optional `onPhase` option.
- All worker messages must be structured-clone-safe: plain data only, no functions, no DOM nodes, no class instances with methods relied upon after cloning.
- `render: manual` must still require the explicit Render button; heavy `render: auto` diagrams must still show the one-time warning dialog instead of auto-rendering repeatedly (`apps/web/src/main.ts:381-396`, unchanged).
- Diagnostic objects must conform to the existing shape used across the codebase (`ValidationIssue`/`DiagramDiagnostic`): `{ message, line?, column?, severity: 'error'|'warning', code?, nodeIds?, edgeIds?, suggestion? }`.
- No blocking sleeps or polling loops for the timeout; use `setTimeout`/`AbortController`.

---

### Task 1: Branch setup + optional phase hooks in the diagram-runtime composition root

**Files:**
- Modify: `packages/diagram-runtime/src/types.ts` (add `DiagramExecutionPhase` type, export it)
- Modify: `packages/diagram-runtime/src/registry.ts:120-175` (`executeDiagramSource`)
- Modify: `packages/diagram-runtime/src/index.ts` (re-export `DiagramExecutionPhase` if not using a wildcard export already — check first)
- Modify: `apps/web/src/pipeline.ts` (`runPipeline` gains an optional 3rd `onPhase` parameter, forwards it)
- Test: `packages/diagram-runtime/test/registry.test.ts` (create if it doesn't already cover this file's `executeDiagramSource`; otherwise add to the existing suite — check `packages/diagram-runtime/test/` first)
- Test: `apps/web/test/pipeline.test.ts` (extend existing suite)

**Interfaces:**
- Produces: `DiagramExecutionPhase = 'parsing' | 'layout' | 'rendering'` from `@bpm/diagram-runtime`.
- Produces: `executeDiagramSource(source, { engineOverride?, onPhase?: (phase: DiagramExecutionPhase) => void })` — `onPhase` is optional and additive; omitting it must reproduce today's exact behavior and return value.
- Produces: `runPipeline(text, engineOverride?, onPhase?: (phase: DiagramExecutionPhase) => void): Promise<PipelineResult>` in `apps/web/src/pipeline.ts`.

- [ ] **Step 1: Create the branch**

```bash
git status
git checkout -b codex/bpmn-render-worker
```

- [ ] **Step 2: Write the failing tests for the phase hook**

Add to `apps/web/test/pipeline.test.ts` (a new `describe` block; check the file's current imports first and reuse its existing `parse`/fixture helpers where present):

```ts
import { describe, expect, it, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

describe('runPipeline onPhase', () => {
  it('reports parsing, layout, and rendering in order for a valid diagram', async () => {
    const phases: string[] = [];
    await runPipeline('task "A" as a', undefined, (phase) => phases.push(phase));
    expect(phases).toEqual(['parsing', 'layout', 'rendering']);
  });

  it('does not report layout/rendering when parsing fails', async () => {
    const phases: string[] = [];
    await runPipeline('not a valid diagram @@@', undefined, (phase) => phases.push(phase));
    expect(phases).toEqual(['parsing']);
  });

  it('omitting onPhase behaves exactly as before', async () => {
    const withCallback = await runPipeline('task "A" as a', undefined, () => {});
    const without = await runPipeline('task "A" as a');
    expect(without).toEqual(withCallback);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/pipeline.test.ts -t "onPhase"`
Expected: FAIL — `runPipeline` does not accept a 3rd argument yet, and no `'parsing'`/`'layout'`/`'rendering'` events are ever emitted.

- [ ] **Step 4: Add `DiagramExecutionPhase` and wire it through `executeDiagramSource`**

In `packages/diagram-runtime/src/types.ts`, add near the other exported types:

```ts
export type DiagramExecutionPhase = 'parsing' | 'layout' | 'rendering';
```

In `packages/diagram-runtime/src/index.ts`, confirm `types.ts` is already re-exported with `export * from './types.js'` (or equivalent); if it isn't, add an explicit `export type { DiagramExecutionPhase } from './types.js';`.

In `packages/diagram-runtime/src/registry.ts`, change the `executeDiagramSource` signature and body (lines 120-175):

```ts
export async function executeDiagramSource<Ast = unknown, Positioned = unknown>(
  source: string,
  options?: { engineOverride?: string; onPhase?: (phase: DiagramExecutionPhase) => void },
): Promise<DiagramExecutionResult<Ast, Positioned>> {
  const { onPhase, ...layoutOptions } = options ?? {};
  onPhase?.('parsing');
  const parsed = parseDiagramSource<Ast, Positioned>(source);
  const diagnostics = [...parsed.result.errors, ...parsed.result.semanticErrors];
  const parseWarnings = parsed.result.warnings ?? [];
  if (diagnostics.length > 0) {
    return { ...parsed, positioned: null, svg: null, diagnostics, warnings: parseWarnings };
  }
  if (parsed.header.paginate === 'tile' || parsed.header.paginate === 'hybrid' || (parsed.header.paginate === 'semantic' && parsed.header.family !== 'bpmn')) {
    const diagnostic: DiagramDiagnostic = {
      line: 1,
      column: 1,
      message: `Pagination mode "${parsed.header.paginate}" is not supported for family "${parsed.header.family}"`,
      code: 'pagination_unsupported_combination',
      severity: 'error',
    };
    return { ...parsed, positioned: null, svg: null, diagnostics: [diagnostic], warnings: parseWarnings };
  }
  try {
    resetRouteFallbackCount();
    onPhase?.('layout');
    const astOptions = parsed.result.ast && typeof parsed.result.ast === 'object' ? parsed.result.ast as { direction?: string; laneDirection?: string } : {};
    const positioned = await parsed.adapter.layout(parsed.result.ast, scopedLayoutOptions(parsed.adapter, { ...layoutOptions, direction: astOptions.direction as FamilyLayoutOptions['direction'], laneDirection: astOptions.laneDirection as FamilyLayoutOptions['laneDirection'] }));
    const routeFallbacks = getRouteFallbackCount();
    onPhase?.('rendering');
    const rawSvg = parsed.adapter.render(positioned);
    // ...(rest of the function body is unchanged from lines 146-175)
```

Only the three lines above are new (`const { onPhase, ...layoutOptions } = options ?? {};`, `onPhase?.('parsing');`, `onPhase?.('layout');`, `onPhase?.('rendering');`); every other statement in the function keeps its exact current text, just referencing `layoutOptions` instead of `options` in the `scopedLayoutOptions(parsed.adapter, { ...options, ... })` call. Do not add `onPhase` calls to `validateDiagramSource` or `exportStructuredDiagram` — they are unaffected by this task.

- [ ] **Step 5: Wire `onPhase` through `runPipeline`**

In `apps/web/src/pipeline.ts`, change line 24 and the `executeDiagramSource` call on line 27:

```ts
import type { AiCapabilities, DiagramDiagnostic, DiagramExecutionPhase, DiagramFamilyId, DiagramHeader, FamilyCapabilities } from '@bpm/diagram-runtime';

export async function runPipeline(
  text: string,
  engineOverride?: string,
  onPhase?: (phase: DiagramExecutionPhase) => void,
): Promise<PipelineResult> {
  const header = readDiagramHeader(text);
  try {
    const result = await executeDiagramSource(text, { ...(engineOverride ? { engineOverride } : {}), onPhase });
    // ...(rest of the try body is unchanged)
```

The `catch` branch is unchanged.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run apps/web/test/pipeline.test.ts`
Expected: PASS, all existing `pipeline.test.ts` tests plus the 3 new ones.

- [ ] **Step 7: Run diagram-runtime and CLI suites to confirm no regression**

Run: `npx vitest run packages/diagram-runtime packages/cli`
Expected: PASS — confirms CLI callers (which never pass `onPhase`) are unaffected.

- [ ] **Step 8: Commit**

```bash
git add packages/diagram-runtime/src/types.ts packages/diagram-runtime/src/registry.ts packages/diagram-runtime/src/index.ts apps/web/src/pipeline.ts apps/web/test/pipeline.test.ts
git commit -m "feat: add optional phase-progress hook to executeDiagramSource/runPipeline"
```

---

### Task 2: Author the large 4-pool BPMN fixture

**Files:**
- Create: `scripts/gen-large-bpmn-fixture.mjs` (one-off generator, kept in the repo so the fixture is reproducible/regenerable, matching the existing `scripts/*.mjs` convention used by `scripts/build-workspaces.mjs`)
- Create: `apps/web/test/fixtures/large-4pool-manufacturing.bpm` (generated output, committed)
- Test: `apps/web/test/fixtures/large-4pool-manufacturing.test.ts`

**Interfaces:**
- Produces: the fixture file's exported text (read via `fs.readFileSync` in tests) — a `render: manual\n...` BPMN DSL source with 4 pools, ~93 nodes, ~110 sequence-flow edges, ~24 cross-pool message flows (`~>`), several exclusive gateways with fan-out, and a few feedback (back-)edges.

- [ ] **Step 1: Write the generator script**

```js
// scripts/gen-large-bpmn-fixture.mjs
// Regenerates apps/web/test/fixtures/large-4pool-manufacturing.bpm.
// Run: node scripts/gen-large-bpmn-fixture.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(root, '..', 'apps', 'web', 'test', 'fixtures', 'large-4pool-manufacturing.bpm');

const pools = [
  { name: 'Customer Portal', lanes: ['Intake', 'Order Desk'] },
  { name: 'Design Engineering', lanes: ['Spec Review', 'CAD', 'QA Sign-off'] },
  { name: 'Shop Floor', lanes: ['Fabrication', 'Assembly', 'Inspection'] },
  { name: 'Logistics', lanes: ['Packaging', 'Shipping'] },
];

const lines = ['render: manual', ''];
let nodeSeq = 0;
let edgeCount = 0;
let crossPoolCount = 0;
const poolNodeIds = pools.map(() => []);
const gatewayFanoutBudget = 6; // gateways with >=3 branches, spread across pools

for (const [poolIndex, pool] of pools.entries()) {
  lines.push(`pool "${pool.name}"`);
  for (const [laneIndex, lane] of pool.lanes.entries()) {
    lines.push(`  lane "${lane}"`);
    const nodesInLane = poolIndex === 0 && laneIndex === 0 ? 5 : 8; // first lane is the entry lane, kept small
    const laneNodeIds = [];
    for (let i = 0; i < nodesInLane; i += 1) {
      nodeSeq += 1;
      const id = `n${nodeSeq}`;
      const isFirstOverall = poolIndex === 0 && laneIndex === 0 && i === 0;
      const isGateway = gatewayFanoutBudget > 0 && i === Math.floor(nodesInLane / 2) && laneIndex > 0;
      if (isFirstOverall) {
        lines.push(`    event start none "Order received" as ${id}`);
      } else if (isGateway) {
        lines.push(`    gateway exclusive "${pool.name} check ${id}?" as ${id}`);
      } else {
        lines.push(`    task "${pool.name} step ${id}" as ${id}`);
      }
      laneNodeIds.push({ id, isGateway });
    }
    poolNodeIds[poolIndex].push(...laneNodeIds);
  }
}

// Sequential flow within each pool (covers ~most of the ~110 target edge count),
// with exclusive-gateway fan-out (3 downstream branches) and a few feedback edges.
const flowEdges = [];
for (const laneNodes of poolNodeIds) {
  for (let i = 0; i < laneNodes.length - 1; i += 1) {
    flowEdges.push([laneNodes[i].id, laneNodes[i + 1].id]);
  }
}
// Gateway fan-out: each gateway also points two steps ahead and one step back (feedback).
for (const laneNodes of poolNodeIds) {
  for (let i = 0; i < laneNodes.length; i += 1) {
    if (!laneNodes[i].isGateway) continue;
    if (i + 2 < laneNodes.length) flowEdges.push([laneNodes[i].id, laneNodes[i + 2].id]);
    if (i - 1 >= 0) flowEdges.push([laneNodes[i].id, laneNodes[Math.max(0, i - 3)].id]); // feedback
  }
}

lines.push('');
for (const [from, to] of flowEdges) {
  lines.push(`${from} -> ${to}`);
  edgeCount += 1;
}

// Cross-pool message flows: connect each pool's last lane's tasks to the next pool's first lane.
lines.push('');
for (let p = 0; p < pools.length - 1; p += 1) {
  const fromLane = poolNodeIds[p][poolNodeIds[p].length - 1];
  const toLane = poolNodeIds[p + 1][0];
  const hops = Math.min(fromLane.length, toLane.length, 8);
  for (let i = 0; i < hops; i += 1) {
    lines.push(`${fromLane[i].id} ~> ${toLane[i].id}`);
    crossPoolCount += 1;
  }
}

writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`nodes=${nodeSeq} sequenceEdges=${edgeCount} crossPoolEdges=${crossPoolCount}`);
```

- [ ] **Step 2: Run the generator and inspect the counts**

Run: `node scripts/gen-large-bpmn-fixture.mjs`
Expected: prints `nodes=`, `sequenceEdges=`, `crossPoolEdges=` close to the target 93/110/24 (adjust the per-lane node counts in the script — the `nodesInLane` values and `hops` cap — if the printed counts are off by more than ~15%, then re-run until they land near target; do not hand-edit the generated `.bpm` file directly, only the generator).

- [ ] **Step 3: Write the fixture verification test**

```ts
// apps/web/test/fixtures/large-4pool-manufacturing.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assessRenderCost } from '../../src/renderPolicy.js';

const fixturePath = path.join(__dirname, 'large-4pool-manufacturing.bpm');
const source = readFileSync(fixturePath, 'utf8');

describe('large-4pool-manufacturing fixture', () => {
  it('parses with no diagnostics and lands in the manual complexity tier', async () => {
    const { runPipeline } = await import('../../src/pipeline.js');
    const result = await runPipeline(source);
    expect(result.errors).toEqual([]);
    expect(result.svg).toBeTruthy();
  });

  it('is heavy and admitted (not blocked) under the tiered complexity policy', () => {
    const assessment = assessRenderCost(source);
    expect(assessment.heavy).toBe(true);
    expect(assessment.admission).not.toBe('block');
    expect(assessment.nodeCount).toBeGreaterThan(60);
    expect(assessment.crossPoolEdgeCount).toBeGreaterThan(15);
  });
});
```

- [ ] **Step 4: Run the test, tune the generator if it fails**

Run: `npx vitest run apps/web/test/fixtures/large-4pool-manufacturing.test.ts`
Expected: PASS. If `result.errors` is non-empty, read the diagnostic messages, fix the generator's DSL syntax (most likely cause: a gateway/task label collision or an out-of-range index in the feedback-edge loop), regenerate, and re-run. If `admission === 'block'`, reduce `nodesInLane`/`hops` in the generator and regenerate; if not `heavy`, increase them.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-large-bpmn-fixture.mjs apps/web/test/fixtures/large-4pool-manufacturing.bpm apps/web/test/fixtures/large-4pool-manufacturing.test.ts
git commit -m "test: add generated 4-pool large-diagram fixture for render-worker tests"
```

---

### Task 3: Worker-side entry point (`renderWorker.ts`)

**Files:**
- Create: `apps/web/src/renderWorker.ts`
- Test: `apps/web/test/renderWorker.test.ts`

**Interfaces:**
- Consumes: `runPipeline` from `./pipeline.js` (Task 1's 3-arg version).
- Produces: `WorkerRequest`, `WorkerResponse` types and `handleRenderRequest(request: WorkerRequest, post: (message: WorkerResponse) => void): Promise<void>`, all re-used by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/test/renderWorker.test.ts
import { describe, expect, it, vi } from 'vitest';
import { handleRenderRequest, type WorkerResponse } from '../src/renderWorker.js';

describe('handleRenderRequest', () => {
  it('posts phase events then a successful result, tagged with the request id', async () => {
    const messages: WorkerResponse[] = [];
    await handleRenderRequest(
      { type: 'render', requestId: 7, source: 'task "A" as a' },
      (message) => messages.push(message),
    );
    const phases = messages.filter((m) => m.type === 'phase').map((m) => (m as { phase: string }).phase);
    expect(phases).toEqual(['queued', 'parsing', 'layout', 'rendering']);
    expect(messages.every((m) => m.requestId === 7)).toBe(true);
    const result = messages[messages.length - 1];
    expect(result).toMatchObject({ type: 'result', ok: true });
  });

  it('posts an error result for invalid source without throwing', async () => {
    const messages: WorkerResponse[] = [];
    await handleRenderRequest(
      { type: 'render', requestId: 1, source: 'not a valid diagram @@@' },
      (message) => messages.push(message),
    );
    const result = messages[messages.length - 1];
    expect(result).toMatchObject({ type: 'result', ok: true }); // runPipeline never throws for parse errors — errors travel in diagnostics
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/web/test/renderWorker.test.ts`
Expected: FAIL — `apps/web/src/renderWorker.ts` does not exist yet.

- [ ] **Step 3: Write `renderWorker.ts`**

```ts
// apps/web/src/renderWorker.ts
import { runPipeline, type PipelineResult } from './pipeline.js';
import type { DiagramExecutionPhase } from '@bpm/diagram-runtime';
import type { DiagramDiagnostic } from '@bpm/diagram-runtime';

export interface WorkerRequest {
  type: 'render';
  requestId: number;
  source: string;
  engineOverride?: string;
}

export type WorkerPhaseEvent = 'queued' | DiagramExecutionPhase;

export type WorkerResponse =
  | { type: 'phase'; requestId: number; phase: WorkerPhaseEvent }
  | { type: 'result'; requestId: number; ok: true; result: PipelineResult }
  | { type: 'result'; requestId: number; ok: false; diagnostics: DiagramDiagnostic[] };

export async function handleRenderRequest(
  request: WorkerRequest,
  post: (message: WorkerResponse) => void,
): Promise<void> {
  post({ type: 'phase', requestId: request.requestId, phase: 'queued' });
  try {
    const result = await runPipeline(request.source, request.engineOverride, (phase) => {
      post({ type: 'phase', requestId: request.requestId, phase });
    });
    post({ type: 'result', requestId: request.requestId, ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: 'result',
      requestId: request.requestId,
      ok: false,
      diagnostics: [{ line: 1, column: 1, severity: 'error', message }],
    });
  }
}

// Real worker wiring — inert under Vitest/Node, where `self.postMessage` does not exist.
declare const self: DedicatedWorkerGlobalScope | undefined;
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    void handleRenderRequest(event.data, (message) => self.postMessage(message));
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/web/test/renderWorker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/renderWorker.ts apps/web/test/renderWorker.test.ts
git commit -m "feat: add renderWorker entry point running the pipeline off the main thread"
```

---

### Task 4: Main-thread executors (`renderExecutors.ts`) — worker client, sync fallback, unavailability handling

**Files:**
- Create: `apps/web/src/renderExecutors.ts`
- Test: `apps/web/test/renderExecutors.test.ts`

**Interfaces:**
- Consumes: `WorkerRequest`, `WorkerResponse`, `WorkerPhaseEvent` from `./renderWorker.js`; `RenderAssessment` from `./renderPolicy.js`; `PipelineResult`, `runPipeline` from `./pipeline.js`.
- Produces: `RenderExecutorContext { signal: AbortSignal; assessment: RenderAssessment; onPhase?: (phase: WorkerPhaseEvent) => void }`, `RenderExecutor = (source: string, engineOverride: string | undefined, context: RenderExecutorContext) => Promise<PipelineResult>`, `isWorkerSupported(): boolean`, `createWorkerRenderExecutor(createWorker?: () => Worker): RenderExecutor`, `createFallbackRenderExecutor(execute?: typeof runPipeline): RenderExecutor`, `createDefaultRenderExecutor(): RenderExecutor`, `WORKER_REQUIRED_DIAGNOSTIC: DiagramDiagnostic` — all consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/test/renderExecutors.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  createWorkerRenderExecutor,
  createFallbackRenderExecutor,
  isWorkerSupported,
  WORKER_REQUIRED_DIAGNOSTIC,
} from '../src/renderExecutors.js';
import type { WorkerRequest, WorkerResponse } from '../src/renderWorker.js';
import type { RenderAssessment } from '../src/renderPolicy.js';

function assessment(overrides: Partial<RenderAssessment> = {}): RenderAssessment {
  return { heavy: false, score: 0, layoutComplexity: 0, admission: 'allow', nodeCount: 0, edgeCount: 0, poolCount: 0, laneCount: 0, crossPoolEdgeCount: 0, reasons: [], ...overrides };
}

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: WorkerRequest[] = [];
  postMessage(message: WorkerRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(message: WorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }
}

describe('createWorkerRenderExecutor', () => {
  it('resolves with the result posted for the matching request id', async () => {
    let worker!: FakeWorker;
    const executor = createWorkerRenderExecutor(() => { worker = new FakeWorker(); return worker as unknown as Worker; });
    const controller = new AbortController();
    const phases: string[] = [];
    const pending = executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment(), onPhase: (p) => phases.push(p) });
    const requestId = worker.posted[0].requestId;
    worker.emit({ type: 'phase', requestId, phase: 'queued' });
    worker.emit({ type: 'phase', requestId: requestId + 999, phase: 'layout' }); // mismatched id — ignored
    worker.emit({ type: 'result', requestId, ok: true, result: { family: 'bpmn' } as never });
    const result = await pending;
    expect(phases).toEqual(['queued']);
    expect(result).toMatchObject({ family: 'bpmn' });
    expect(worker.terminated).toBe(true); // executor always cleans up its worker once settled
  });

  it('terminates the worker and rejects when the signal aborts', async () => {
    let worker!: FakeWorker;
    const executor = createWorkerRenderExecutor(() => { worker = new FakeWorker(); return worker as unknown as Worker; });
    const controller = new AbortController();
    const pending = executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment() });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect(worker.terminated).toBe(true);
  });

  it('rejects immediately without creating a worker if already aborted', async () => {
    const create = vi.fn(() => new FakeWorker() as unknown as Worker);
    const executor = createWorkerRenderExecutor(create);
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted'));
    await expect(executor('x', undefined, { signal: controller.signal, assessment: assessment() })).rejects.toThrow('pre-aborted');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('createFallbackRenderExecutor', () => {
  it('runs synchronously for a light diagram', async () => {
    const run = vi.fn(async () => ({ svg: '<svg/>' }) as never);
    const executor = createFallbackRenderExecutor(run as never);
    const controller = new AbortController();
    const result = await executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment({ admission: 'allow' }) });
    expect(run).toHaveBeenCalled();
    expect(result).toMatchObject({ svg: '<svg/>' });
  });

  it('returns worker_required_for_large_render without running the pipeline for a manual/block-tier diagram', async () => {
    const run = vi.fn();
    const executor = createFallbackRenderExecutor(run as never);
    const controller = new AbortController();
    const result = await executor('big', undefined, { signal: controller.signal, assessment: assessment({ admission: 'manual' }) });
    expect(run).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatchObject(WORKER_REQUIRED_DIAGNOSTIC);
  });
});

describe('isWorkerSupported', () => {
  it('reflects the global Worker constructor', () => {
    expect(isWorkerSupported()).toBe(typeof Worker !== 'undefined');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/renderExecutors.test.ts`
Expected: FAIL — `apps/web/src/renderExecutors.ts` does not exist.

- [ ] **Step 3: Write `renderExecutors.ts`**

```ts
// apps/web/src/renderExecutors.ts
import { runPipeline, type PipelineResult } from './pipeline.js';
import type { WorkerRequest, WorkerResponse, WorkerPhaseEvent } from './renderWorker.js';
import type { RenderAssessment } from './renderPolicy.js';
import type { DiagramDiagnostic } from '@bpm/diagram-runtime';

export interface RenderExecutorContext {
  signal: AbortSignal;
  assessment: RenderAssessment;
  onPhase?: (phase: WorkerPhaseEvent) => void;
}

export type RenderExecutor = (
  source: string,
  engineOverride: string | undefined,
  context: RenderExecutorContext,
) => Promise<PipelineResult>;

export const WORKER_REQUIRED_DIAGNOSTIC: DiagramDiagnostic = {
  line: 1,
  column: 1,
  severity: 'error',
  code: 'worker_required_for_large_render',
  message: 'This diagram is too large to render without Web Worker support, which this browser does not provide. Reduce the diagram size, or open the editor in a browser that supports Web Workers.',
};

export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

let requestCounter = 0;

export function createWorkerRenderExecutor(
  createWorker: () => Worker = () => new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' }),
): RenderExecutor {
  return (source, engineOverride, { signal, onPhase }) => new Promise<PipelineResult>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Render aborted'));
      return;
    }
    const requestId = ++requestCounter;
    const worker = createWorker();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
      fn();
    };

    const onAbort = () => finish(() => reject(signal.reason ?? new Error('Render aborted')));
    signal.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== requestId) return;
      if (message.type === 'phase') {
        onPhase?.(message.phase);
        return;
      }
      finish(() => {
        if (message.ok) resolve(message.result);
        else reject(Object.assign(new Error('Render failed in worker'), { diagnostics: message.diagnostics }));
      });
    };
    worker.onerror = (event: ErrorEvent) => {
      finish(() => reject(event.error instanceof Error ? event.error : new Error(event.message)));
    };

    const request: WorkerRequest = { type: 'render', requestId, source, ...(engineOverride ? { engineOverride } : {}) };
    worker.postMessage(request);
  });
}

export function createFallbackRenderExecutor(
  execute: typeof runPipeline = runPipeline,
): RenderExecutor {
  return async (source, engineOverride, { assessment, onPhase }) => {
    if (assessment.admission === 'manual' || assessment.admission === 'block') {
      return {
        family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
        executionPositioned: null, engineName: null, ast: null,
        diagnostics: [WORKER_REQUIRED_DIAGNOSTIC], errors: [WORKER_REQUIRED_DIAGNOSTIC], warnings: [], paginated: null,
      };
    }
    return execute(source, engineOverride, (phase) => onPhase?.(phase));
  };
}

export function createDefaultRenderExecutor(): RenderExecutor {
  return isWorkerSupported() ? createWorkerRenderExecutor() : createFallbackRenderExecutor();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run apps/web/test/renderExecutors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/renderExecutors.ts apps/web/test/renderExecutors.test.ts
git commit -m "feat: add worker/fallback render executors with worker-unavailability handling"
```

---

### Task 5: Rewrite `renderController.ts` — phases, cancellation, timeout, supersede-by-generation

**Files:**
- Modify: `apps/web/src/renderController.ts` (full rewrite of the file)
- Modify: `apps/web/test/renderController.test.ts` (full rewrite of the test suite)

**Interfaces:**
- Consumes: `RenderExecutor`, `RenderExecutorContext`, `createDefaultRenderExecutor` from `./renderExecutors.js`; `assessRenderCost` from `./renderPolicy.js`; `createRevisionTracker` from `./renderRevision.js`.
- Produces: `RenderPhase`, `RenderControllerState { rendering, phase, startedAt?, elapsedMs?, canCancel, assessment?, detail? }`, `RenderController { render(): Promise<void>; invalidate(): void; cancel(): void; isCurrent(snapshot): boolean; isRendering(): boolean; getState(): RenderControllerState }`, `RENDER_TIMEOUT_MS`, `createRenderController(getSource, getEngineOverride, onCommit, execute?, onStateChange?)`. This is the exact API `apps/web/src/main.ts` (Task 7) consumes.

- [ ] **Step 1: Write the failing tests (full replacement of `renderController.test.ts`)**

```ts
// apps/web/test/renderController.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createRenderController, RENDER_TIMEOUT_MS, type RenderControllerState } from '../src/renderController.js';
import type { RenderExecutor, RenderExecutorContext } from '../src/renderExecutors.js';
import type { PipelineResult } from '../src/pipeline.js';

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    family: 'bpmn', header: null, capabilities: null, svg: '<svg/>', diagram: null,
    positioned: null, executionPositioned: null, engineName: 'flat', ast: null,
    diagnostics: [], errors: [], warnings: [], paginated: null, ...overrides,
  };
}

describe('createRenderController', () => {
  it('transitions idle -> queued/running -> completed and clears rendering', async () => {
    const states: RenderControllerState[] = [];
    let resolveExec!: (r: PipelineResult) => void;
    const execute: RenderExecutor = () => new Promise((resolve) => { resolveExec = resolve; });
    const controller = createRenderController(() => 'task "A" as a', () => undefined, () => {}, execute, (s) => states.push(s));
    const pending = controller.render();
    expect(states[0]).toMatchObject({ rendering: true, phase: 'queued', canCancel: true });
    resolveExec(result());
    await pending;
    expect(states[states.length - 1]).toMatchObject({ rendering: false, phase: 'completed', canCancel: false });
  });

  it('commits results through onCommit only when the result is still current', async () => {
    const committed: string[] = [];
    let resolveExec!: (r: PipelineResult) => void;
    const execute: RenderExecutor = () => new Promise((resolve) => { resolveExec = resolve; });
    const controller = createRenderController(() => 'source', () => undefined, (snapshot) => committed.push(snapshot.source), execute);
    const pending = controller.render();
    controller.invalidate();
    resolveExec(result());
    await pending;
    expect(committed).toEqual([]); // invalidated before commit — stale result must not overwrite the preview
  });

  it('a newer render supersedes an older one without emitting a visible cancelled state for it', async () => {
    const calls: string[] = [];
    const resolvers: Array<(r: PipelineResult) => void> = [];
    const states: RenderControllerState[] = [];
    let source = 'old';
    const execute: RenderExecutor = (text) => new Promise((resolve, reject) => {
      calls.push(text);
      resolvers.push(resolve);
    });
    const controller = createRenderController(() => source, () => undefined, () => {}, execute, (s) => states.push(s));
    const first = controller.render();
    source = 'new';
    const second = controller.render();
    resolvers[0]?.(result());
    resolvers[1]?.(result());
    await Promise.allSettled([first, second]);
    expect(calls).toEqual(['old', 'new']);
    expect(states.some((s) => s.phase === 'cancelled')).toBe(false);
    expect(states[states.length - 1]).toMatchObject({ phase: 'completed' });
  });

  it('cancel() terminates the active render and leaves state cancelled without committing', async () => {
    const committed: string[] = [];
    let capturedSignal!: AbortSignal;
    const execute: RenderExecutor = (source, engineOverride, ctx: RenderExecutorContext) => {
      capturedSignal = ctx.signal;
      return new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
      });
    };
    const controller = createRenderController(() => 'source', () => undefined, (snapshot) => committed.push(snapshot.source), execute);
    const pending = controller.render();
    expect(controller.getState().canCancel).toBe(true);
    controller.cancel();
    await pending;
    expect(capturedSignal.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ phase: 'cancelled', rendering: false, canCancel: false });
    expect(committed).toEqual([]);
  });

  it('times out after RENDER_TIMEOUT_MS, terminates the render, and commits a layout_timeout diagnostic', async () => {
    vi.useFakeTimers();
    try {
      const committed: PipelineResult[] = [];
      const execute: RenderExecutor = (source, engineOverride, ctx) => new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
      });
      const controller = createRenderController(() => 'source', () => undefined, (snapshot) => { committed.push(snapshot.value); }, execute);
      const pending = controller.render();
      await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS + 10);
      await pending;
      expect(controller.getState().phase).toBe('timed_out');
      expect(committed).toHaveLength(1);
      expect(committed[0].errors[0]).toMatchObject({ code: 'layout_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the loading state on every terminal path (success, cancel, timeout, failure)', async () => {
    // success path
    const successStates: RenderControllerState[] = [];
    const successController = createRenderController(() => 'source', () => undefined, () => {}, async () => result(), (s) => successStates.push(s));
    await successController.render();
    expect(successStates[successStates.length - 1].rendering).toBe(false);

    // cancel path
    const cancelStates: RenderControllerState[] = [];
    const cancellableExecutor: RenderExecutor = (_source, _engineOverride, ctx) => new Promise((_resolve, reject) => {
      ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
    });
    const cancelController = createRenderController(() => 'source', () => undefined, () => {}, cancellableExecutor, (s) => cancelStates.push(s));
    const pending = cancelController.render();
    cancelController.cancel();
    await pending.catch(() => {});
    expect(cancelStates[cancelStates.length - 1].rendering).toBe(false);

    // timeout path is covered by the dedicated timeout test above.

    // failure path (executor throws a non-abort error)
    const failStates: RenderControllerState[] = [];
    const failController = createRenderController(() => 'source', () => undefined, () => {}, async () => { throw new Error('boom'); }, (s) => failStates.push(s));
    await failController.render();
    expect(failStates[failStates.length - 1]).toMatchObject({ rendering: false, phase: 'failed' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/renderController.test.ts`
Expected: FAIL — current `renderController.ts` has none of `cancel()`, `getState()`, `RENDER_TIMEOUT_MS`, or the `RenderExecutorContext`-style executor signature.

- [ ] **Step 3: Rewrite `renderController.ts`**

```ts
// apps/web/src/renderController.ts
import { type PipelineResult } from './pipeline.js';
import { createRevisionTracker, type ExecutionSnapshot } from './renderRevision.js';
import { assessRenderCost, type RenderAssessment } from './renderPolicy.js';
import { createDefaultRenderExecutor, type RenderExecutor } from './renderExecutors.js';
import type { WorkerPhaseEvent } from './renderWorker.js';
import type { DiagramDiagnostic } from '@bpm/diagram-runtime';

export interface RenderControllerSnapshot extends ExecutionSnapshot<PipelineResult> {}

export type RenderPhase = 'idle' | 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'timed_out' | 'failed';

export interface RenderControllerState {
  rendering: boolean;
  phase: RenderPhase;
  startedAt?: number;
  elapsedMs?: number;
  canCancel: boolean;
  assessment?: RenderAssessment;
  /** Human-readable current step, e.g. "Running layout and routing…". Undefined when idle/terminal. */
  detail?: string;
}

export interface RenderController {
  render(): Promise<void>;
  invalidate(): void;
  cancel(): void;
  isCurrent(snapshot: RenderControllerSnapshot): boolean;
  isRendering(): boolean;
  getState(): RenderControllerState;
}

export const RENDER_TIMEOUT_MS = 30_000;

class RenderTimeoutReason extends Error {
  constructor() { super('Render timed out'); this.name = 'RenderTimeoutReason'; }
}

function phaseDetail(phase: WorkerPhaseEvent): string {
  switch (phase) {
    case 'queued':
    case 'parsing':
      return 'Preparing diagram…';
    case 'layout':
      return 'Running layout and routing…';
    case 'rendering':
      return 'Rendering SVG…';
    default:
      return 'Rendering…';
  }
}

function timeoutResult(): PipelineResult {
  const diagnostic: DiagramDiagnostic = {
    line: 1, column: 1, severity: 'error', code: 'layout_timeout',
    message: `Layout did not finish within ${RENDER_TIMEOUT_MS / 1000}s and was cancelled. The previous preview is kept — reduce the diagram size or retry.`,
  };
  return {
    family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
    executionPositioned: null, engineName: null, ast: null,
    diagnostics: [diagnostic], errors: [diagnostic], warnings: [], paginated: null,
  };
}

function errorResult(err: unknown): PipelineResult {
  const diagnostic: DiagramDiagnostic = {
    line: 1, column: 1, severity: 'error',
    message: err instanceof Error ? err.message : String(err),
  };
  return {
    family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
    executionPositioned: null, engineName: null, ast: null,
    diagnostics: [diagnostic], errors: [diagnostic], warnings: [], paginated: null,
  };
}

export function createRenderController(
  getSource: () => string,
  getEngineOverride: () => string | undefined,
  onCommit: (snapshot: RenderControllerSnapshot) => Promise<void> | void,
  execute: RenderExecutor = createDefaultRenderExecutor(),
  onStateChange?: (state: RenderControllerState) => void,
): RenderController {
  const revisions = createRevisionTracker<PipelineResult>();
  let generation = 0;
  let activeAbort: AbortController | undefined;
  let elapsedTimer: ReturnType<typeof setInterval> | undefined;
  let state: RenderControllerState = { rendering: false, phase: 'idle', canCancel: false };

  const emit = () => onStateChange?.({ ...state });
  const setState = (patch: Partial<RenderControllerState>) => { state = { ...state, ...patch }; emit(); };
  const stopTicker = () => { if (elapsedTimer !== undefined) { clearInterval(elapsedTimer); elapsedTimer = undefined; } };

  return {
    async render() {
      const myGeneration = ++generation;
      activeAbort?.abort();
      const controller = new AbortController();
      activeAbort = controller;

      const source = getSource();
      const engineOverride = getEngineOverride();
      const assessment = assessRenderCost(source);
      const token = revisions.begin(source);
      const startedAt = Date.now();

      setState({ rendering: true, phase: 'queued', startedAt, elapsedMs: 0, canCancel: true, assessment, detail: 'Preparing diagram…' });
      elapsedTimer = setInterval(() => {
        if (myGeneration !== generation) return;
        setState({ elapsedMs: Date.now() - startedAt });
      }, 250);
      const timeoutHandle = setTimeout(() => controller.abort(new RenderTimeoutReason()), RENDER_TIMEOUT_MS);

      try {
        const execResult = await execute(source, engineOverride, {
          signal: controller.signal,
          assessment,
          onPhase: (phase) => {
            if (myGeneration !== generation) return;
            setState({ phase: 'running', detail: phaseDetail(phase) });
          },
        });
        clearTimeout(timeoutHandle);
        if (myGeneration !== generation) return;
        stopTicker();
        const snapshot = revisions.commit(token, execResult);
        setState({ rendering: false, phase: 'completed', canCancel: false, detail: undefined });
        if (snapshot) await onCommit(snapshot);
      } catch (err) {
        clearTimeout(timeoutHandle);
        if (myGeneration !== generation) return;
        stopTicker();
        if (controller.signal.aborted) {
          if (controller.signal.reason instanceof RenderTimeoutReason) {
            setState({ rendering: false, phase: 'timed_out', canCancel: false, detail: `Render timed out after ${RENDER_TIMEOUT_MS / 1000}s — previous preview kept` });
            const snapshot = revisions.commit(token, timeoutResult());
            if (snapshot) await onCommit(snapshot);
          } else {
            setState({ rendering: false, phase: 'cancelled', canCancel: false, detail: 'Render cancelled — previous preview kept' });
          }
        } else {
          setState({ rendering: false, phase: 'failed', canCancel: false, detail: undefined });
          const snapshot = revisions.commit(token, errorResult(err));
          if (snapshot) await onCommit(snapshot);
        }
      } finally {
        if (myGeneration === generation) activeAbort = undefined;
      }
    },
    invalidate() { revisions.invalidate(); },
    cancel() {
      if (!activeAbort) return;
      setState({ phase: 'cancelling' });
      activeAbort.abort();
    },
    isCurrent(snapshot) { return revisions.isCurrent(snapshot); },
    isRendering() { return state.rendering; },
    getState() { return { ...state }; },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run apps/web/test/renderController.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full web test suite to catch any other break**

Run: `npx vitest run apps/web`
Expected: other suites currently importing `createRenderController` with the old 2-arg `execute` signature will fail to typecheck/compile at this point — this is expected and is fixed in Task 7 (main.ts) and any other call site found by this run. Note any failing files here for Task 7 to address; do not fix `main.ts` in this task.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/renderController.ts apps/web/test/renderController.test.ts
git commit -m "feat: rewrite renderController with worker-backed phases, cancel, and timeout"
```

---

### Task 6: `index.html` markup + styles for the loading strip

**Files:**
- Modify: `apps/web/index.html`

**Interfaces:**
- Produces: new DOM ids `#render-spinner`, `#render-elapsed`, `#render-cancel-btn`, consumed by Task 7.

- [ ] **Step 1: Add the elements next to `#render-status` (around line 748)**

```html
<span id="render-status" class="badge" role="status" aria-live="polite"></span>
<span id="render-spinner" class="render-spinner" hidden aria-hidden="true"></span>
<span id="render-elapsed" class="badge" hidden></span>
<button id="render-cancel-btn" class="toolbar-btn" hidden>Cancel Render</button>
```

- [ ] **Step 2: Add the spinner CSS near the other `#render-status`/`#heavy-render-dialog` rules (around line 260)**

```css
#render-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: render-spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 4px;
}
@media (prefers-reduced-motion: reduce) {
  #render-spinner { animation: none; }
}
@keyframes render-spin {
  to { transform: rotate(360deg); }
}
#render-elapsed { color: var(--muted); }
```

- [ ] **Step 3: Manually verify markup validity**

Run: `npx vite build --config apps/web/vite.config.ts` isn't necessary here — instead visually confirm via `git diff apps/web/index.html` that the new tags are well-formed and inside the existing `.toolbar-group` (do not add a new `.toolbar-group` wrapper; the existing one at line 737-750 already groups render-status-adjacent elements, per the file read in this task).

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html
git commit -m "feat: add render loading spinner, elapsed time, and cancel button markup"
```

---

### Task 7: Wire the loading UI into `main.ts`

**Files:**
- Modify: `apps/web/src/main.ts` (DOM refs block ~line 40-70; `onStateChange` callback ~line 699-712; add a cancel-button listener near line 901)

**Interfaces:**
- Consumes: `RenderControllerState`, `createRenderController` (Task 5), the new DOM ids from Task 6.

- [ ] **Step 1: Add the new DOM refs**

Next to the existing refs (`apps/web/src/main.ts:66-70`):

```ts
const renderStatusEl = document.querySelector<HTMLSpanElement>('#render-status')!;
const renderSpinnerEl = document.querySelector<HTMLSpanElement>('#render-spinner')!;
const renderElapsedEl = document.querySelector<HTMLSpanElement>('#render-elapsed')!;
const renderCancelBtn = document.querySelector<HTMLButtonElement>('#render-cancel-btn')!;
```

- [ ] **Step 2: Replace the `onStateChange` callback passed to `createRenderController` (lines 699-712)**

```ts
const renderController = createRenderController(
  () => editor.value,
  () => engineOverrideSelect.value || undefined,
  commitRender,
  undefined,
  (state) => {
    renderBusy = state.rendering;
    renderSpinnerEl.hidden = !state.rendering;
    renderCancelBtn.hidden = !state.canCancel;
    renderCancelBtn.disabled = !state.canCancel;
    if (state.rendering && state.elapsedMs !== undefined && state.elapsedMs >= 2000) {
      renderElapsedEl.hidden = false;
      renderElapsedEl.textContent = `${(state.elapsedMs / 1000).toFixed(1)}s`;
    } else {
      renderElapsedEl.hidden = true;
    }
    if (state.detail) {
      setRenderStatus(state.detail);
    } else if (state.phase === 'completed') {
      setRenderStatus(currentRenderAssessment.heavy ? (lastResultSource === editor.value ? 'Large diagram — rendered' : 'Large diagram — press Render') : (currentRenderMode() === 'manual' ? 'Manual render mode — press Render' : ''));
    } else if (state.phase === 'failed') {
      setRenderStatus('Render failed — press Render to retry');
    } else if (state.phase === 'idle') {
      setRenderStatus(currentRenderMode() === 'manual' ? 'Manual render mode — press Render' : '');
    }
    updateRenderDependentActions();
  },
);
```

Note: the 4th positional argument (`execute`) is passed as `undefined` so the controller falls back to its own default (`createDefaultRenderExecutor()`), which picks the worker path in the browser. Do not pass `runPipeline` here anymore — `runPipeline` now runs *inside* the worker via `renderWorker.ts`, not on the main thread.

- [ ] **Step 3: Remove the now-redundant manual status-setting in `renderNow()` (lines 408-413)**

```ts
function renderNow(): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  renderController.invalidate();
  void rerender();
}
```

(The `setRenderStatus(...)` call is deleted — the `onStateChange` callback above now owns all status text, including the `'queued'`/`'running'` phase text, so this function no longer needs to guess a message up front.)

- [ ] **Step 4: Wire the Cancel Render button**

Near the other button listeners (`apps/web/src/main.ts:901`):

```ts
renderCancelBtn.addEventListener('click', () => renderController.cancel());
```

- [ ] **Step 5: Run the full web unit suite**

Run: `npx vitest run apps/web`
Expected: PASS (this resolves the Task 5 Step 5 failures — `main.ts` now matches the new controller/executor signatures).

- [ ] **Step 6: Manual smoke check**

Run: `cd apps/web && npm run dev` (leave running), then in a browser open the dev URL, type a small diagram, confirm it still renders, confirm the Render button still works for `render: manual` sources, then stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/main.ts
git commit -m "feat: wire worker-backed loading state, spinner, elapsed time, and cancel into the editor"
```

---

### Task 8: Browser/e2e tests for the loading, cancel, timeout, and responsiveness behavior

**Files:**
- Create: `apps/web/test/e2e/render-worker.spec.ts`
- Modify: none in `apps/web/test/e2e/live-render.spec.ts` (must keep passing unmodified — verified, not edited)

**Interfaces:**
- Consumes: the fixture from Task 2 (`apps/web/test/fixtures/large-4pool-manufacturing.bpm`), DOM ids from Task 6/7.

- [ ] **Step 1: Write the e2e tests**

```ts
// apps/web/test/e2e/render-worker.spec.ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const largeFixture = readFileSync(
  path.join(__dirname, '..', 'fixtures', 'large-4pool-manufacturing.bpm'),
  'utf8',
);

test('a large diagram shows a visible loading state with a cancel button, and the page stays responsive', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill(largeFixture);
  await page.locator('#render-btn').click();
  await expect(page.locator('#render-spinner')).toBeVisible();
  await expect(page.locator('#render-cancel-btn')).toBeVisible();
  // Responsiveness proxy: the settings button must still respond to a click while the layout is running.
  const start = Date.now();
  await page.locator('#settings-btn').click({ timeout: 2000 });
  expect(Date.now() - start).toBeLessThan(2000);
  await page.locator('#settings-btn').click(); // close it back
});

test('cancel leaves the previous preview visible and the editor usable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('task "Kept" as kept');
  await page.locator('#render-btn').click();
  await expect(page.locator('#preview')).toContainText('Kept');
  await page.locator('#editor').fill(largeFixture);
  await page.locator('#render-btn').click();
  await expect(page.locator('#render-cancel-btn')).toBeVisible();
  await page.locator('#render-cancel-btn').click();
  await expect(page.locator('#render-status')).toContainText('cancelled');
  await expect(page.locator('#preview')).toContainText('Kept'); // previous preview preserved, not blanked
  await expect(page.locator('#render-btn')).toBeEnabled(); // retry available
});

test('small diagrams still render immediately without a visible loading strip', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('task "Small" as s');
  await page.waitForTimeout(400);
  await expect(page.locator('#preview')).toContainText('Small');
  await expect(page.locator('#render-cancel-btn')).toBeHidden();
});

test('render: manual still waits for the Render action even for the worker path', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill(['render: manual', 'task "Manual" as manual'].join('\n'));
  await expect(page.locator('#render-status')).toContainText('Manual render mode');
  await expect(page.locator('#preview')).not.toContainText('Manual');
  await page.locator('#render-btn').click();
  await expect(page.locator('#preview')).toContainText('Manual');
});

test('a heavy diagram does not repeatedly auto-render while the editor is idle', async ({ page }) => {
  await page.goto('/');
  const nodes = Array.from({ length: 101 }, (_, i) => `task "T${i}" as t${i}`);
  const edges = Array.from({ length: 100 }, (_, i) => `t${i} -> t${i + 1}`).slice(0, 99);
  await page.locator('#editor').fill(['render: auto', ...nodes, ...edges].join('\n'));
  await expect(page.locator('#heavy-render-dialog')).toBeVisible();
  await page.locator('#heavy-render-close').click();
  await page.waitForTimeout(1000);
  await expect(page.locator('#render-cancel-btn')).toBeHidden(); // never auto-started a render
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `cd apps/web && npx playwright test test/e2e/render-worker.spec.ts test/e2e/live-render.spec.ts`
Expected: PASS on all specs, including the untouched `live-render.spec.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/test/e2e/render-worker.spec.ts
git commit -m "test: add e2e coverage for worker-backed loading, cancel, and responsiveness"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/maintainer/RENDER-WORKER-ARCHITECTURE.md`
- Modify: `docs/maintainer/KNOWN-ISSUES-2026-08-19.md` (update the entry describing the 90-node/120-edge/4-pool main-thread freeze — check the file first for the exact heading/wording to update)

**Interfaces:** none (docs only).

- [ ] **Step 1: Write `docs/maintainer/RENDER-WORKER-ARCHITECTURE.md`**

```markdown
# Render Worker Architecture

## Complexity admission vs. runtime execution

`packages/validate`'s `classifyLayoutComplexity` (allow / warn / manual / block) only decides
*whether the web editor is allowed to attempt a render at all*. It runs on a source-text
heuristic (`apps/web/src/renderPolicy.ts`'s `assessRenderCost`) before anything is parsed. It has
never been, and still is not, a promise that the render will be fast or that it runs off the main
thread — those are separate concerns, described below.

## `render: manual` does not mean main-thread rendering

`render: manual` only gates *when* a render is allowed to start (on explicit Render-button press,
never on keystroke). Once a render starts — whether triggered by `render: manual`'s Render button
or `render: auto`'s debounce — it always runs inside a Web Worker (`apps/web/src/renderWorker.ts`)
when the browser supports one. There is no code path left that runs ELK/swimlane/routing
synchronously on the main thread except the reduced fallback described below.

## Worker-based layout isolation

`apps/web/src/renderController.ts` calls a `RenderExecutor` (`apps/web/src/renderExecutors.ts`).
In the browser this spawns one dedicated Worker per render attempt
(`createWorkerRenderExecutor`), which runs the exact same `runPipeline`/`executeDiagramSource`
pipeline used everywhere else (CLI included) — parsing, layout, and SVG rendering all happen on
the worker's thread, never the DOM/UI thread. Structured-clone-safe messages only cross the worker
boundary: a request `{ requestId, source, engineOverride? }` and a response carrying either
`{ ok: true, result: PipelineResult }` or `{ ok: false, diagnostics }`, plus coarse phase events
(`queued`, `parsing`, `layout`, `rendering`). `routing` is not surfaced as a separate phase: it runs
inside the same `adapter.layout()` call as `layout`, and neither `laneBanding.ts` nor `router.ts`
were touched to add hooks there — only the composition root
(`packages/diagram-runtime/src/registry.ts`) got optional, additive phase callbacks.

## Cancellation and timeout

Every render attempt owns an `AbortController` and a `setTimeout(RENDER_TIMEOUT_MS)` (currently
30,000ms, defined once in `apps/web/src/renderController.ts` as `RENDER_TIMEOUT_MS`). Cancelling
(`renderController.cancel()`, wired to the toolbar's Cancel Render button) and timing out both
abort that controller, which terminates the active Worker (`worker.terminate()`) — a cancelled or
timed-out render can never later commit an SVG, because the controller tags every render attempt
with a monotonically increasing generation number and only accepts state/commit updates from the
attempt matching the current generation. A timeout additionally commits a structured
`layout_timeout` diagnostic so the failure is visible and explained; a user-initiated cancel does
not, since it isn't an error.

## Previous-preview preservation

The render controller never clears the preview at render start. `apps/web/src/main.ts`'s
`commitRender` only replaces `#preview`'s SVG on a successful, error-free result; on any error
result (including the synthetic `layout_timeout` one) it shows the diagnostic and leaves the last
good SVG in place. A newer render always supersedes (aborts) an older in-flight one rather than
queuing behind it, so there is never more than one active layout job competing for a CPU core.

## Worker fallback

If the browser has no `Worker` global (`apps/web/src/renderExecutors.ts`'s `isWorkerSupported()`),
the controller falls back to `createFallbackRenderExecutor()`: diagrams in the `allow`/`warn`
complexity tier still render synchronously on the main thread exactly as before this change;
diagrams in the `manual`/`block` tier are refused with a `worker_required_for_large_render`
diagnostic instead of attempting an unbounded synchronous layout that could freeze the tab.

## Complexity tiers (unchanged by this work)

| Tier | Threshold (estimated layout work units) | Effect |
| --- | --- | --- |
| `allow` | < 5,000 | Auto-renders freely |
| `warn` | 5,000–10,000 | Auto-renders, complexity warning surfaced |
| `manual` | 10,000–25,000 | Requires explicit Render press; runs in a worker |
| `block` | ≥ 25,000 | Hard ceiling — refused before any layout work starts |

See `packages/validate/src/index.ts` for `MAX_LAYOUT_COMPLEXITY` / `MAX_LAYOUT_HARD_COMPLEXITY` /
`LAYOUT_COMPLEXITY_WARNING` and `classifyLayoutComplexity`.
```

- [ ] **Step 2: Update `docs/maintainer/KNOWN-ISSUES-2026-08-19.md`**

Read the file first to find the exact freeze-related entry (referenced in this plan's research as describing "sequential obstacle accumulation" in `laneBanding.ts`/`router.ts` as the likely cost centers for the 90-node/120-edge/4-pool freeze). Append a short note under that entry:

```markdown
**Update (render-worker branch, `codex/bpmn-render-worker`):** the main-thread freeze itself is
now fixed at the *execution* layer — layout/routing runs inside a Web Worker
(see `docs/maintainer/RENDER-WORKER-ARCHITECTURE.md`), with cancellation, a 30s timeout, and
previous-preview preservation. The underlying `laneBanding.ts`/`router.ts` cost-center concerns
noted above are unchanged and still apply to *how long* a worker-isolated render takes; they are
out of scope for this change.
```

- [ ] **Step 3: Commit**

```bash
git add docs/maintainer/RENDER-WORKER-ARCHITECTURE.md docs/maintainer/KNOWN-ISSUES-2026-08-19.md
git commit -m "docs: document worker-based render isolation, cancellation, timeout, and fallback"
```

---

### Task 10: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the focused suites**

```bash
npx vitest run apps/web/test/renderController.test.ts apps/web/test/renderExecutors.test.ts apps/web/test/renderWorker.test.ts apps/web/test/pipeline.test.ts apps/web/test/renderPolicy.test.ts apps/web/test/fixtures/large-4pool-manufacturing.test.ts
```
Expected: PASS.

- [ ] **Step 2: Run validation and diagram-runtime package suites**

```bash
npx vitest run packages/validate packages/diagram-runtime packages/cli
```
Expected: PASS.

- [ ] **Step 3: Run the full web unit suite**

```bash
npx vitest run apps/web
```
Expected: PASS.

- [ ] **Step 4: Run the full workspace test suite**

```bash
npm run test
```
Expected: PASS.

- [ ] **Step 5: Run the e2e suite**

```bash
cd apps/web && npx playwright test
```
Expected: PASS, including the unmodified `live-render.spec.ts` and the new `render-worker.spec.ts`.

- [ ] **Step 6: Style checks and full build**

```bash
npm run check:style
npm run build
```
Expected: PASS.

- [ ] **Step 7: Whitespace/diff hygiene**

```bash
git diff --check
```
Expected: no output.

- [ ] **Step 8: Manual responsiveness confirmation**

```bash
cd apps/web && npm run dev
```
Open the dev server, paste the contents of `apps/web/test/fixtures/large-4pool-manufacturing.bpm` into the editor, press Render, and confirm: the tab's other controls (menus, tab switching) keep responding immediately, a spinner and elapsed-time counter are visible, and the Cancel Render button works. Stop the dev server afterward.

- [ ] **Step 9: Report**

Summarize for the user: branch name (`codex/bpmn-render-worker`), final commit hash (`git log -1 --format=%H`), the list of changed files (`git diff --stat main...codex/bpmn-render-worker` or against the branch point commit `a425dfd`), which test suites were run, any known limitations (e.g., the synchronous fallback path for worker-unavailable browsers cannot cancel mid-run once started — this is a documented, accepted limitation, not a bug), and confirmation that the large fixture no longer freezes the page.
