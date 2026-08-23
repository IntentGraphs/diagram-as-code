# AI-aware manual layout workflow

This document defines the supported path for an AI that must produce a neat BPM diagram while
understanding how the DSL will render.

## Recommended pipeline

```text
description
  → provider generates semantic .bpm source (auto-layout)
  → validate() parses and resolves layout
  → inspection exposes absolute boxes and routed points
  → optional manual freeze rebases coordinates into DSL frames
  → geometry repair removes actionable overlap/stale-route problems
  → optional SVG/PNG provider review
  → bounded patch/revalidate loop
  → final source + validation + inspection
```

The model should not calculate coordinates when the auto-layout engines can produce them. Use
`positioning: manual` when the resolved result must be frozen, exported, or hand-tuned.

## Geometry contract available to an AI

`validate(source)` returns `inspection` after successful layout:

- `inspection.nodes`: absolute `x`, `y`, `width`, `height`, kind, parent, and boundary host;
- `inspection.edges`: resolved points, Manhattan length, bend count, orthogonality, and whether
  explicit `via` points were used;
- `inspection.contentBounds` and `inspection.renderBounds`;
- `inspection.issueDetails`: structured issue codes and affected node/edge ids;
- `metrics`: crossings, overlaps, edge-through-node, endpoint overshoots, and route fallbacks.

This is the renderer-facing ground truth. An AI should inspect this output rather than trying to
reimplement ELK or the visibility-graph router in its prompt.

## Coordinate rules when frozen

- root nodes use canvas-absolute coordinates;
- pooled nodes use lane-local coordinates;
- expanded subprocess/transaction children use subprocess-content-local coordinates;
- boundary events remain automatically placed relative to their host;
- resolved edge interiors become source-frame `via` points where they can be represented safely.

Use `bpm freeze input.bpm -o manual.bpm` or `generateDiagram(..., { positioning: 'manual' })`.

## Quality gates

Use zero as the default budget for node overlaps, edge-through-node, and endpoint overshoots.
Treat crossings and route fallbacks as topology-dependent warnings: some existing large diagrams
have documented residual crossings, so provider evaluations should define an explicit per-fixture
budget instead of assuming every non-trivial graph can be crossing-free.

The reusable harness is `evaluateDiagramSet(cases)`. Each case can set budgets for crossings,
overlaps, edge-through-node, and route fallbacks.

## Provider phases

Provider-specific work can be delegated independently:

1. **Generation provider** — produce valid semantic DSL only; keep layout automatic.
2. **Geometry critic** — consume `inspection` and return structured findings or exact patches.
3. **Visual critic** — consume rendered PNG plus source/inspection and identify clipping, crowding,
   imbalance, or ambiguous routing.
4. **Repair provider** — apply bounded text patches, then revalidate.
5. **Evaluation provider** — run the same fixture set and report first-pass validity and geometry
   budgets.

Each provider must be optional. The `manual` provider remains offline and deterministic for CI.
