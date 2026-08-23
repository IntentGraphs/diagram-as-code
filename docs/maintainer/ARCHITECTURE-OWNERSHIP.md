# Architecture and package ownership

This is a contributor orientation map for the v1 monorepo. It describes where
changes belong; it is not a CODEOWNERS replacement.

| Area | Location | Responsibility |
|---|---|---|
| Shared AST and language primitives | `packages/ast`, `packages/parser`, `packages/print-dsl` | Parse, represent, and serialize diagram source. |
| Layout and geometry | `packages/layout-*`, `packages/layout-core` | Family-neutral layout contracts, routing, and geometry checks. |
| Rendering | `packages/render`, `packages/render-core` | SVG shapes, labels, edges, and shared rendering utilities. |
| Diagram families | `packages/diagram-*` | Family-specific parsing, layout, rendering, and structured export adapters. |
| Import/export | `packages/import-xml`, `packages/export-*` | External model conversion and structured projections. |
| CLI | `packages/cli` | Scriptable validation, rendering, import, and export commands. |
| AI capabilities | `packages/review` | Provider contracts, generation, review, repair, limits, and redaction. |
| Web application | `apps/web` | Editor composition, persistence, controllers, accessibility, and browser flows. |
| Release controls | `.github`, `scripts`, `docs/maintainer` | CI, notices, workflow validation, release evidence, and maintainer decisions. |

## Change guidance

- Keep family-specific behavior in its family package and adapter.
- Keep shared contracts family-neutral; do not widen the BPMN AST to fit a new family.
- Add focused package tests and update `docs/STATUS.md` when user-visible behavior changes.
- Treat `docs/maintainer/ROADMAP.md` as the release-gate checklist and the
  package README as the local implementation contract.
