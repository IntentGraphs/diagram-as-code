# Known issues and triage plan

_Investigation date: 2026-08-19. Scope: `apps/web` and the parser, validator,
layout, runtime, and export packages. This is a maintainer investigation log,
not a claim that every item is a confirmed production bug._

This repository copy records the durable findings, evidence state, release
impact, and next actions from the separately provided read-only investigation,
without including user-provided diagram content or machine-local paths.

## Status vocabulary

- **CONFIRMED (live)** — reproduced in the running application.
- **CONFIRMED (code)** — the mechanism is directly evidenced in source but was
  not reproduced as a live user failure.
- **UNCONFIRMED** — the reported behavior was attempted but not reproduced.
- **RETRACTED** — an earlier hypothesis was tested and found to be false.
- **NEEDS FURTHER ASSESSMENT** — a real gap is visible, but impact or scope is
  not yet established.

## Findings

| ID | Finding | Evidence state | Priority | Release treatment |
|---|---|---|---|---|
| KI-01 | Large multi-pool text renders can freeze the browser for minutes and require a restart. | **CONFIRMED (live; bounded on current branch)** | Resolved for public scope | Tiered admission keeps source/node/edge ceilings hard, treats 10,000 routing-aware work units as a soft budget, permits explicit manual rendering through 25,000, and blocks above the hard ceiling. Runtime performance optimization remains deferred. |
| KI-02 | The live render path bypasses the existing source/node/edge limits before expensive layout. | **CONFIRMED (code; fixed on current branch)** | Resolved | Adapter guard and user-facing limit regression are implemented. |
| KI-03 | “Edit as Diagram” can be clicked while a long render is still in flight; the result can be a blank canvas and “Diagram mode is not active.” | **CONFIRMED (live; fixed on current branch)** | Resolved | Busy-state gating, committed-source checks, and browser regression are implemented. |
| KI-04 | PowerPoint text is not scaled with a whole-diagram fit-to-slide scale, causing severe wrapping on wide diagrams. | **CONFIRMED (live + code; fixed for declared projection scope)** | Resolved for public scope | Projection scaling, bounded too-small rejection, and editable OOXML geometry/font regression coverage are implemented. PPTX remains an editable visual projection, not a pixel-identical canvas round trip. |
| KI-05 | Duplicate IDs, self-loops, orphan nodes, cycles, missing terminal events, and unbalanced gateway joins are not comprehensively diagnosed. | **CONFIRMED (code; addressed on current branch)** | Resolved for public scope | Duplicate/self-loop cases block invalid BPMN; the remaining topology cases produce conservative warnings, with cycles explicitly allowed. |
| KI-06 | “Edit as Diagram” reload/crash during editing could not be reproduced in clean headless Chromium. | **UNCONFIRMED** | Unknown | Request a real-browser trace before implementing a speculative fix. |

### KI-01 — large-document render freeze (bounded on current branch)

The live reproduction used a roughly 90-node, 120-edge, four-pool document.
After the edit, the browser stopped answering even simple DOM queries for more
than four minutes. The likely cost center is sequential obstacle accumulation in
`packages/diagram-core/src/routing/router.ts` and
`packages/layout-engine-swimlane/src/laneBanding.ts`, combined with synchronous
ELK work from `packages/layout-elk-base/src/runElkLayout.ts`.

This is separate from a missing typing debounce: the editor already debounces
typing. The current public contract now rejects only diagrams above the hard
routing-work ceiling before the expensive path. Diagrams in the manual tier can
be rendered explicitly, while the editor avoids repeated live layouts. Accepted
diagrams can still benefit from future worker/offload optimization, but the
confirmed unbounded browser freeze is no longer a public-release blocker.

**Update (`codex/bpmn-render-worker` branch):** the main-thread freeze itself is
now fixed at the *execution* layer, independent of the admission tiers above —
layout/routing for manual-tier diagrams now runs inside a Web Worker with
cancellation, a 30s timeout, and previous-preview preservation (see
`docs/maintainer/RENDER-WORKER-ARCHITECTURE.md`). A generated ~96-node,
four-pool reproduction fixture
(`apps/web/test/fixtures/large-4pool-manufacturing.bpm`) pegs a single CPU core
for several minutes running the unmodified pipeline directly in Node, which
confirms the `laneBanding.ts`/`router.ts` cost-center concern above is still
real and unchanged — this branch does not touch either file's algorithm. What
changes is that this cost no longer blocks the browser tab: it now runs off
the UI thread and is either cancelled by the user or auto-terminated at the
30s timeout, with the editor remaining fully responsive throughout.

### KI-02 — missing live-editor resource guard (fixed on current branch)

`@bpm/validate` already defines source, node, and edge limits in
`packages/validate/src/index.ts`. The current branch shares those checks with
the BPMN runtime adapter before layout, returns structured limit diagnostics,
and covers an oversized live render with a Playwright regression. This bounds
the input but does not make a valid large diagram fast; the public-safety
containment is resolved, while performance optimization remains open.

### KI-03 — action available during render (fixed on current branch)

The current branch exposes render-active state from the render controller and
tracks whether the committed result matches the editor source. Diagram mode,
Edit as Diagram, and text exports are disabled while rendering or after source
divergence, with unit and browser coverage for the gate. The original report
should remain in this log as historical evidence.

### KI-04 — PPTX font scaling (addressed for declared projection scope)

`packages/export-pptx/src/index.ts` projects editable text sizes from the same
geometry scale used for the slide and rejects snapshots whose labeled content
would become too dense to remain editable. Unit coverage and an OOXML slide
regression protect the geometry, escaping, editable text, and projected font
size. PPTX is intentionally an editable visual projection, not a semantic or
pixel-identical canvas round trip.

#### Post-attempt assessment — `d42f297` (2026-08-19)

The focused branch `agent/pptx-canvas-fidelity` includes projection-based font
calculation, bounded too-small behavior, and OOXML/package checks confirming
native editable objects. Exact renderer-specific pixel fidelity remains outside
the declared v1 export promise.

### KI-05 — structural validation debt (addressed on current branch)

The parser now rejects duplicate ids and control-flow self-loops. Validation
adds conservative warnings for orphan flow nodes, unreachable terminal ends,
cycles, and mixed gateway join/split topology. Cycles and partial processes are
not rejected because both can be intentional BPMN; the diagnostics explain
that policy and preserve `valid: true` for those cases.

### KI-06 — unconfirmed reload/crash

Clean headless Chromium testing covered loading, dragging connected nodes,
multi-select movement, inline editing, and waypoint movement without a reload or
uncaught error. This does not disprove the report in the user’s browser. The
next useful evidence is a screen recording or DevTools Console/Performance/
Memory trace with browser version, OS, exact fixture, and interaction sequence.

## Historical first-step options

These options record the original sequencing decision. KI-01 through KI-05 are
now bounded or addressed on the current branch; only KI-06 still needs external
evidence before any code change.

### Option A — containment-first (lowest release risk)

Completed on the current branch: apply the existing limits before live
parse/layout, disable render-dependent actions while work is active, and cover
both with focused unit and Playwright regressions.

- Benefit: prevents the worst unbounded work quickly and improves error clarity.
- Cost: large valid diagrams will be rejected sooner rather than rendered.
- Follow-up: optimize/offload layout under KI-01 after the guard is shipped.

### Option B — user-visible export fix first

Completed on the current branch: projection-scaled font calculation, bounded
too-small behavior, and OOXML assertions for editable text and geometry.

- Benefit: small, high-confidence change to a promised v1 capability.
- Cost: does not address editor freezes.
- Follow-up: return immediately to Option A for the editor safety gate.

### Option C — performance track

Future optimization only: profile router obstacle growth, test ELK worker
offload, and measure render time against a seeded complexity corpus. The public
complexity budget already prevents the confirmed unbounded work.

- Benefit: preserves more large-diagram capability.
- Cost: largest scope and highest regression risk; must still begin with a
  cheap guard so pathological input cannot monopolize the browser.

### Option D — diagnostic hardening

Completed on the current branch: structural diagnostics use explicit
blocking-error versus non-blocking-warning semantics and fixtures.

- Benefit: improves feedback for agents and users producing invalid graphs.
- Cost: does not fix the confirmed freezes or PPTX rendering defect.

### Option E — evidence-first crash investigation

Collect real-browser evidence for KI-06 before coding.

- Benefit: avoids fixing a hypothesis that clean browser tests do not support.
- Cost: depends on a reproducible user trace and may leave the issue open.

## Issue-tracker policy

The repository should contain this durable triage log and roadmap linkage. Once
an item has a safe minimal fixture, create one focused GitHub Issue using the
bug template rather than one issue for the entire log. Include the status label,
commit/tag, reproduction, expected behavior, and acceptance tests. Do not paste
proprietary or regulated diagram source into a public issue. Link the issue from
the roadmap only after the issue exists; the local documentation remains valid
if the remote tracker is unavailable.

The suggested issue split is:

1. `bug: guard live render complexity before layout` — KI-02 and the containment
   part of KI-01.
2. `bug: scale editable PPTX text with slide geometry` — KI-04.
3. `bug: block diagram-mode actions during render` — KI-03.
4. `enhancement: add explicit structural graph diagnostics` — KI-05.
5. `bug: investigate Diagram-mode reload during editing` — KI-06, only after a
   safe reproduction is available.

## Definition of done for this log

- Every active item has a reproducible fixture or an explicit evidence request.
- Confirmed bugs have focused tests that fail before the fix and pass after it.
- User-facing limitations are reflected in `docs/STATUS.md`.
- The roadmap records priority and sequencing.
- GitHub Issues, if created, contain no sensitive diagram source and link back to
  the relevant repository documentation.
