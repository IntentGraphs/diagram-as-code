# Flowchart diagram family — design

_Roadmap item 15b (`docs/ROADMAP.md`). Backs `docs/superpowers/specs/2026-08-17-diagram-family-extensibility-notes.md`'s verdicts — read that doc first; this one does not re-derive its reasoning, only applies it. Prior art: `packages/diagram-mindmap` (15a, already shipped on `integration/mindmap-adapter`) is the structural template for "own parser + own AST + own package, wired into `@bpm/diagram-runtime`'s adapter contract" — follow its file layout (`ast.ts`, `parser.ts`, `layout.ts`, `render.ts`, `adapter.ts`, `types.ts`, `limits.ts`) unless a concrete reason forces a deviation. This is a design document only — no production files are part of this deliverable; implementation is a separate, later step against this spec, in a dedicated worktree._

## Scope

**Shape**: boxes and decision diamonds connected by directed arrows — BPMN's own `task`/`gateway`/sequence-flow vocabulary with everything BPMN-specific (event triggers, pools/lanes, task subtypes, boundary events) stripped out. Two node kinds only: `box` (a process step) and `decision` (a branch point, rendered as a diamond). No terminators, no swimlanes, no subprocess nesting — those are explicitly not in this item; if a later need for them shows up, it is its own scoped follow-up, not silently added here.

**Explicitly out of scope for this item** (do not implement unless separately asked):
- `terminal`/start-end oval nodes, input/output parallelograms, or any node kind beyond `box`/`decision`.
- Pools/lanes, subprocess containment, or any nesting.
- Structured export (draw.io/etc.) — SVG-only for v1, same as mind maps' v1. A follow-up wave can add it the same way mind maps added draw.io export after their v1 shipped, reusing `@bpm/export-drawio` (already family-neutral: `DrawioNode`/`DrawioEdge` take id/label/position/size, nothing BPMN- or mindmap-specific).
- Manual `at (x,y)` / `size (w,h)` positioning hints (§5 of `docs/LANGUAGE.md`). BPMN's manual mode is a large, separate feature; flowchart v1 is auto-layout only, matching mind maps.
- Reusing `@bpm/layout-elk-base` or `@bpm/layout` directly. Both are hard-typed to `@bpm/ast`'s `Diagram`/`DiagramNode` (`runElkLayout(diagram: Diagram)`, confirmed by reading `packages/layout-elk-base/src/runElkLayout.ts`) — importing them would either force flowchart's AST into BPMN's shape (the exact anti-pattern the extensibility notes rule out) or require widening `@bpm/ast`, which the notes explicitly rule out too. "Reuses swimlane/flat layout engines almost as-is" in the roadmap entry means *the same technique* (an ELK layered-graph layout via `elkjs`), not the same code path. `elkjs` is already a workspace dependency (pulled in by `@bpm/layout-elk-base`) — add it as a direct dependency of the new flowchart package rather than importing BPMN-typed wrapper code.

## Grammar

Reuses `docs/LANGUAGE.md` conventions already established: 2-space indentation is not used here (flowchart nodes are a flat list, like BPMN's non-pool node declarations — indentation has no structural meaning for `box`/`decision`), quoted labels, `as <id>` identifiers, and the exact same edge tokens BPMN already uses.

```
diagram: flowchart

box "<label>" as <id>
decision "<label>" as <id>

<id> -> <id>              # ordinary control flow
<id> => <id>: "<label>"   # a labeled branch out of a decision (e.g. "yes"/"no")
<id> ->> <id>              # the default/else branch out of a decision
```

- `box "<label>" as <id>` and `decision "<label>" as <id>` — label is required and quoted (unlike mind maps, which allow an omitted label falling back to the id; flowchart nodes read poorly unlabeled, and BPMN's own `task`/`gateway` forms already require a label — stay consistent with that, not with mind maps' shorthand).
- Edge lines: `<id> (->|=>|->>) <id>` optionally followed by `: "<label>"`. Reuse the exact regex shape `docs/LANGUAGE.md` §5 documents for BPMN edges (arrow token, optional `: "<label>"`), restricted to these three tokens — `~>`/`..>` (message/association flows) are BPMN-only concepts with no flowchart meaning and must be rejected as a parse error, not silently accepted.
- No `pool`/`lane`, no `size`/`at`/`[...]` bracket suffix, no boundary events. A line using any of those is a parse error naming what's unsupported, not a silent no-op.
- Node declarations may appear in any order relative to the edges that reference them (parse all node lines and all edge lines, then resolve edge endpoints against the id table — same two-pass shape BPMN's own parser already uses for forward references).

## AST (`packages/diagram-flowchart/src/ast.ts`)

Own closed union, not a BPMN import, per the extensibility notes' "parallel AST per family" verdict:

```ts
export type FlowchartNodeKind = 'box' | 'decision';
export interface FlowchartNode {
  kind: FlowchartNodeKind;
  id: string;
  label: string;
  line: number;
}
export type FlowchartEdgeKind = 'sequence' | 'conditionalSequence' | 'defaultSequence';
export interface FlowchartEdge {
  kind: FlowchartEdgeKind;
  from: string;
  to: string;
  label?: string;
  line: number;
}
export interface FlowchartDiagram {
  kind: 'flowchartDiagram';
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}
```

## Safety limits (`packages/diagram-flowchart/src/limits.ts`)

Mind maps bounded on source size, node count, and tree depth. Flowcharts are a general directed graph (cycles are legitimate — a retry loop is a normal flowchart shape), so "depth" isn't the right second axis; bound source size, node count, and edge count instead:

```ts
export const MAX_SOURCE_CHARS = 100_000; // same as mindmap
export const MAX_NODES = 500;             // same as mindmap
export const MAX_EDGES = 1_000;           // new: a dense graph can have far more edges than nodes
```

**Cycle safety is a correctness requirement, not just a limit.** Any rank-assignment or topological step in `layout.ts` must terminate on a cyclic graph (e.g. break cycles for ranking purposes with a DFS back-edge pass, same standard technique layered-graph algorithms use) — never assume acyclicity. This must be covered by a fixture with a deliberate loop (e.g. a `decision` branching back to an earlier `box`) and a test asserting layout still completes and produces a valid, overlap-free result.

## Diagnostics / error codes

Mirror `packages/diagram-mindmap/src/parser.ts`'s pattern: `{line, column, message, code, token?}`, syntax errors in `errors`, semantic issues in `semanticErrors`.

| Code | Condition |
|---|---|
| `source_too_large` | source exceeds `MAX_SOURCE_CHARS` |
| `unparseable_line` | a non-blank line matches none of the node/edge productions |
| `invalid_id` | id fails the same identifier pattern mind maps use (`MINDMAP_ID_PATTERN` — reuse or duplicate the exact rule, don't invent a new one) |
| `duplicate_id` | a `box`/`decision` id is declared twice |
| `unknown_edge_endpoint` | an edge references an id with no matching node declaration |
| `unsupported_edge_kind` | `~>` or `..>` used (BPMN-only, explicitly rejected here) |
| `unsupported_declaration` | `pool`/`lane`/`size (...)`/`at (...)`/any bracket-suffix form used |
| `max_nodes_exceeded` | node count exceeds `MAX_NODES` |
| `max_edges_exceeded` | edge count exceeds `MAX_EDGES` |
| `missing_label` | `box`/`decision` declared without a quoted label |

Register duplicate-node-ids into the id table **before** the node-count-limit check discards later occurrences, mirroring the exact ordering fix mind maps' hardening review required (`docs/superpowers/specs/mindmap-hardening-spec.md` Issue A/parser fix) — get it right the first time here rather than needing a second hardening pass.

## Layout (`packages/diagram-flowchart/src/layout.ts`)

- Add `elkjs` as a direct dependency (already vetted in this workspace's lockfile via `@bpm/layout-elk-base`; no new supply-chain surface).
- Build an ELK graph directly (own minimal `toElkGraph`-equivalent — a handful of lines: node id/width/height, edge id/source/target — not a reuse of `@bpm/layout-elk-base`'s BPMN-typed version) and run the `layered` algorithm, direction `DOWN` (top-to-bottom flowcharts are the conventional reading direction, unlike mind maps' left-to-right tree).
- Node sizing: same wrap-once-reuse-everywhere discipline the mindmap hardening fix established — compute wrapped label lines once (box width/height from that), carry the same `labelLines` through to `render.ts` rather than re-wrapping there. Decision (diamond) nodes need extra width/height margin beyond the wrapped label's bounding box for the diamond's inscribed-rectangle geometry (a diamond's usable interior for a given label is smaller than its bounding box — undersizing here reproduces mind maps' Issue B in a new shape).
- Anchors and edge geometry: use `@bpm/diagram-core`'s `outlineAnchor(rect, side, shape, toward)` with `shape: 'diamond'` for decision nodes and `shape: 'rect'` for boxes (this is exactly what `AnchorShape` already anticipates) and `@bpm/diagram-core`'s `routeOrthogonal`/`createSequentialRouter` for orthogonal edge routing, rather than mind maps' straight polyline (flowcharts commonly have edges that must route around intervening nodes — mind maps' tree shape never needed that, flowcharts' branch/merge shape does).
- Determinism: same seeded/property-style test mind maps added after their overlap bug (`layout.test.ts`'s 20-seed loop) — run layout twice on the same parsed AST and assert deep equality.
- Overlap: assert `@bpm/diagram-core`'s `assertNoOverlaps` holds for every generated fixture in tests, from the start — mind maps only wired this in during the hardening pass; do it in the initial implementation here instead of needing a second pass.

## Render (`packages/diagram-flowchart/src/render.ts`)

- `box`: rounded rect (reuse the mind map convention: `rx="8"`, white fill, black stroke), label centered using the same `labelLines`/`tspan` approach the mindmap hardening fix established (`escapeXml` per line — never re-derive wrapping in the render pass).
- `decision`: SVG `<polygon>` diamond inscribed in the node's bounding box, same stroke/fill convention.
- Edges: orthogonal polyline (`@bpm/render-core`'s `polylinePathD`, already family-neutral — mind maps already use it) with an arrowhead marker at the target end (flowcharts are directed; mind maps' parent→child edges never needed an arrowhead, this does), plus the edge's label (if any) placed at its midpoint for `=>`/`->>` edges, XML-escaped.

## Adapter & runtime wiring (`packages/diagram-flowchart/src/adapter.ts`, `packages/diagram-runtime/src/registry.ts`)

```ts
capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false }
```

Register `flowchartAdapter` in `defaultAdapters` alongside `bpmnAdapter`/`mindmapAdapter`. `'flowchart'` is already a listed member of `DIAGRAM_FAMILIES` (`packages/diagram-runtime/src/types.ts`) — the registry and header-directive parsing require no changes beyond adding the one registry entry; `readDiagramHeader`'s `diagram: flowchart` directive already resolves correctly today (it round-trips through `isFamily()`'s check against `DIAGRAM_FAMILIES`) and will simply reach "no adapter registered" until this entry exists.

Web/CLI: no new code needed beyond registration — `apps/web/src/familyUi.ts`'s `familyLabel`/`unsupportedActionMessage` already take `DiagramFamilyId` generically; add `'flowchart'` to `familyLabel`'s switch (currently only handles `'bpmn'`/`'mindmap'`, falls through to `'No family'` otherwise — a one-line addition) and confirm `main.ts`'s `isRenderable`/`exportSvgBtn` gating (already generalized in the mindmap-hardening UX pass to `Boolean(result.svg) && (isBpmnDiagram || result.family === 'mindmap')`) is widened to include `'flowchart'` rather than left mindmap-only — this is the same class of bug the mindmap QA pass caught (`docs/mindmap-browser-qa.md` scenario 11), don't reintroduce it for the next family.

## Fixtures (`packages/diagram-flowchart/test/fixtures/`)

At minimum: `linear.bpm` (box → box → box), `branching.bpm` (decision with `=>` yes/no branches merging back to one box), `loop.bpm` (a `->>` default edge back to an earlier node — cycle-safety case), `long-label.bpm` (wraps to multiple lines on both a box and a decision), `unknown-endpoint.bpm`, `duplicate-id.bpm`, `unsupported-edge.bpm` (`~>`), `bad-declaration.bpm` (a `pool`/`size(...)` line, asserting `unsupported_declaration`).

## Tests

Parser: one test per error code above, plus valid-parse tests for linear/branching/loop fixtures. Layout: overlap-free + deterministic (seeded loop, mirroring mind maps' post-hardening test) + the loop fixture completing without hanging. Render: SVG contains escaped labels, diamond `<polygon>`, arrowhead markers, edge label placement. Adapter: registered under `'flowchart'` in `packages/diagram-runtime`, round-trips through `executeDiagramSource`. CLI: `bpm validate`/`bpm render` against a flowchart fixture (mirroring the mindmap CLI test pattern in `packages/cli/test/*.cli.test.ts`). Web: `apps/web/test/familyUi.test.ts` gains a `'flowchart'` case; one e2e case in `live-render.spec.ts` mirroring the existing mindmap live-render coverage (renders, export SVG enabled, BPMN-only actions disabled).

## Definition of done

- All fixtures/tests above pass; `npm test` still reports every existing suite green (BPMN and mindmap untouched).
- `npm run build` clean.
- `npm run test:e2e -w @bpm/web` includes and passes the new flowchart case(s), all existing cases still pass.
- No import of `@bpm/ast`, `@bpm/parser`, `@bpm/layout-core`, `@bpm/layout-elk-base`, `@bpm/layout`, or any BPMN-specific package from `packages/diagram-flowchart` — only `@bpm/diagram-core`, `@bpm/render-core`, `@bpm/diagram-runtime` (types only, structural-copy convention mind maps already established to stay cycle-free — see `packages/diagram-mindmap/src/types.ts`'s comment), and `elkjs`.
- No BPMN or mindmap production file behavior changes, except the two documented one-line widenings in `apps/web/src/familyUi.ts` and `apps/web/src/main.ts`'s capability-gating.
- `diagram: flowchart` round-trips end to end in both the CLI and the web preview; invalid flowchart source produces the same structured-diagnostic UX (`unsupported_family`-style CLI exit code 1 + JSON errors) mind maps already have.
