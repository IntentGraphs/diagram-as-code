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

## elkjs inside a real Worker

`apps/web/src/renderExecutors.ts` points its `new Worker(...)` at
`apps/web/src/renderWorkerEntry.ts`, not `renderWorker.ts` directly. This indirection exists
because of a real bug surfaced by running elkjs inside an actual Web Worker for the first time:
elkjs's bundled `elk-worker.min.js` submodule decides how to export itself with
`typeof document === 'undefined' && typeof self !== 'undefined'`. On the main thread `document`
exists, so it correctly exports `{ Worker: FakeWorker }` for `elk.bundled.js` to `require(...)`.
Inside a real Worker there is no `document`, so it wrongly assumes it *is* a standalone worker
script and never sets `module.exports`, leaving `elk.bundled.js`'s internal
`require('./elk-worker.min.js').Worker` `undefined` — surfacing as `"_Worker is not a
constructor"`. `renderWorkerEntry.ts` stubs a truthy `document` (and `window`) before dynamically
importing `renderWorker.ts`, which keeps elkjs on its normal export path without any change to
elkjs itself or to any layout/routing code. The stub has to live in a separate bootstrap file and
use a dynamic `import()`: static `import` declarations are hoisted ahead of any other code in the
same file, so a statement placed before `import './renderWorker.js'` would still run after that
import's whole dependency graph (elkjs included) had already evaluated. The bootstrap also buffers
the very first `postMessage` it receives, since a dedicated Worker does not replay messages posted
before `self.onmessage` is attached, and the dynamic import delays exactly that by one microtask.

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
diagnostic instead of attempting an unbounded synchronous layout that could freeze the tab. This
fallback cannot cancel mid-render once started — that is an accepted, documented limitation of
running without Worker support, not a bug.

## Complexity tiers (unchanged by this work)

| Tier | Threshold (estimated layout work units) | Effect |
| --- | --- | --- |
| `allow` | < 5,000 | Auto-renders freely |
| `warn` | 5,000–10,000 | Auto-renders, complexity warning surfaced |
| `manual` | 10,000–25,000 | Requires explicit Render press; runs in a worker |
| `block` | ≥ 25,000 | Hard ceiling — refused before any layout work starts |

See `packages/validate/src/index.ts` for `MAX_LAYOUT_COMPLEXITY` / `MAX_LAYOUT_HARD_COMPLEXITY` /
`LAYOUT_COMPLEXITY_WARNING` and `classifyLayoutComplexity`.

## Known limitation

Moving layout to a worker fixes main-thread responsiveness; it does not change how long the
layout itself takes. `apps/web/test/fixtures/large-4pool-manufacturing.bpm` (~96 nodes, 4 pools,
24 cross-pool message flows) can take several minutes of pegged CPU to lay out with the current
`laneBanding.ts`/`router.ts` implementation — for such a diagram, the worker will very likely hit
the 30s timeout rather than complete. That is expected: the underlying algorithmic cost is out of
scope for this change (see `docs/maintainer/KNOWN-ISSUES-2026-08-19.md`, KI-01) and is unaffected
by it.
