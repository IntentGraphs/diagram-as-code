# Extending diagram families

This document is the implementation guide for adding a new `diagram: <family>`
notation. It is intentionally more prescriptive than the public language reference:
the goal is to keep a new family independent from BPMN internals while making it a
first-class citizen of the CLI, web application, exports, validation, and tests.

Current status: the repository ships six families — BPMN, mind map, flowchart,
architecture, Gantt, and bounded Level-0 DFD. The DFD syntax below is the supported
initial scope; deeper DFD levels and additional interchange formats remain future work.

## Architectural boundary

Each family owns its domain model and grammar. A family should provide an adapter
with these responsibilities:

1. Parse source into a typed family AST and return syntax, semantic, warning, and
   source-location diagnostics.
2. Lay out the AST into a positioned family representation using reusable geometry
   and routing primitives from `@bpm/diagram-core` where appropriate.
3. Convert positioned output to the family-neutral `DiagramScene` contract from
   `@bpm/diagram-core`. The scene contains stable node/edge IDs, geometry,
   containment, route points, and optional containers; generic runtime inspection
   must consume this contract rather than branch on family IDs.
4. Implement adapter-level `validate()` with the same `{ valid, errors,
   semanticErrors, warnings }` result shape. Runtime validation adds shared
   post-layout geometry inspection and metrics.
5. Render SVG and declare only the structured exports it can actually produce.
6. Expose capability metadata for editor mode, direction/lane options, PPTX, and
   AI operations.

`@bpm/diagram-runtime` is the composition root. It should dispatch through the
adapter contract; family-specific behavior should not leak into the runtime, web
pipeline, or generic inspection code. If a feature needs repeated `family === ...`
branches, first consider extending the adapter or introducing a family-neutral
scene type.

The existing BPMN AST is not a suitable base type for a non-BPMN notation. DFD,
for example, should not model a data store as a BPMN artifact merely to reuse a
renderer. Reuse geometry, routing, inspection, and export infrastructure at the
generic layer; keep domain semantics in the family package.

## Required vertical slice

Before calling a family supported, implement and test all of the following:

- family package with AST, parser, semantic validation, layout, SVG renderer, and
  adapter;
- runtime registration and header/directive support;
- CLI parse, render, validate, capabilities, and supported export behavior;
- web capability-driven labels and export actions, with no hard-coded assumptions
  that the canvas is BPMN;
- source maps for nodes, edges, pools, and lanes so editor diagnostics can select
  source text; empty categories are still returned for families that do not use
  pools or lanes;
- stable SVG `data-node-id`, `data-node-label-id`, `data-edge-id`, and
  `data-edge-label-id` identities matching the source-map keys;
- geometry inspection and deterministic quality metrics;
- representative unit tests, parser error tests, export tests, and at least one
  end-to-end fixture;
- `docs/LANGUAGE.md`, `docs/STATUS.md`, README support claims, and a changelog
  entry updated in the same change.

The adapter contract test in `packages/diagram-runtime/test/runtime.test.ts` is a
small guard against incomplete registration. It does not replace family-specific
behavioral tests.

## DFD supported scope and future work

DFD exercises concepts not represented by the current process and architecture
families. The shipped first release is deliberately limited to a Level-0/context
notation:

```text
diagram: dfd
external "Customer" as customer
process "Submit order" as submit
dataStore "Orders" as orders
dataFlow customer -> submit: "order details"
dataFlow submit -> orders: "new order"
```

The shipped DFD AST distinguishes `external`, `process`, `dataStore`, and directed
`dataFlow` nodes/edges. Its semantic rules are explicit before layout: IDs are
unique and bounded, node and flow labels are required, endpoints must resolve to
declared nodes, self-flows are rejected, and all three node kinds may participate
in a directed flow (including process-to-process and store-to-store flows).

Use explicit DFD shapes in the renderer: processes, external entities, and data
stores should not be inferred from BPMN event/activity kinds. Reuse orthogonal
routing and geometry inspection, but add DFD-specific shape clearance and label
tests. The shipped structured export is a documented, lossless `dfd-json` format.
Do not advertise draw.io round-tripping until import/export fidelity is tested.

## Recommended delivery order

1. Extend the bounded DFD grammar only with explicit semantic rules and tests.
2. Integrate any new DFD capabilities through the runtime contract.
3. Add structured export or external interchange only when fidelity is tested.
4. Add golden fixtures, E2E coverage, documentation, and release notes.

This order keeps the reusable foundation ahead of a second wave of family-specific
conditionals. The scene, source-map, renderer-identity, and validation foundations
are now uniform; deeper DFD levels should still wait until their complete vertical
slice is verified.

## Acceptance criteria

A family is ready for a public release when a fresh checkout can parse, validate,
render, inspect, and export a documented example; unsupported operations fail with
structured diagnostics; the CLI and web advertise the same capabilities; source
locations are stable; all supported Node versions pass CI; and the family has no
unexplained geometry defects in its regression fixtures.
