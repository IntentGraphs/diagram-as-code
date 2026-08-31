# Architecture diagram assessment and implementation recommendation

This assessment treats the supplied C4-style example as one stress case, not as the target layout. The same rules must work for a small two-node sketch, a deeply nested system, and a dense architecture with high fan-in/fan-out.

## Findings from the supplied example

The JSON model contains nested C4 structure, but the accompanying draw.io file places every vertex directly under the root cell. That loses system/container/component ownership in the editable artifact. The SVG also shows the common failure modes that become worse as a diagram grows:

- one page mixes system context, container detail, operational controls, data stores, and process/data-flow detail;
- labels are small at fit-to-page scale and several edge labels compete with nodes or other labels;
- high fan-in/fan-out around shared systems creates long corridors, repeated bends, and ambiguous arrowheads;
- parent labels compete with child labels when the container has no reserved title band;
- actors and external systems are crowded at the boundary;
- styling does not consistently distinguish context, system, container, component, and data-store semantics.

These are layout and view-design problems, not merely coordinates to patch in this one file. A layout that passes syntax validation can still be unreadable.

## Recommended architecture contract

Keep the architecture source as the semantic authority. Generate one or more views from it:

| View | Intended question | Content budget |
| --- | --- | --- |
| System context | What systems and people interact? | systems, people, external dependencies; no internal containers |
| Container | How does one system work? | one system, its containers, direct dependencies |
| Component | How does one container work? | one container, its components, selected external dependencies |
| Data/operational | Where do data and control flows go? | selected data stores, queues, protocols, and operational systems |
| Deployment | Where does it run? | deployment nodes and mapped containers; future family/view support |

For small diagrams, a single view is fine. For complex diagrams, splitting views is the primary readability control; more routing logic cannot make unrelated semantic levels equally legible on one page.

## Edit modes

The implementation should expose the capability honestly:

1. **Text mode (canonical)** — edit declarations, containment, relationships, view directives, and labels.
2. **In-app visual mode** — currently available for BPMN through bpmn-js. It is not silently advertised for architecture because bpmn-js does not understand C4 nodes or containment.
3. **Architecture export handoffs** — download draw.io XML for visual editing in draw.io/diagrams.net, or download Structurizr DSL for semantic C4 editing in Structurizr Playground/Local. Both are projections, not lossless round trips into the source language.
4. **Import/reconciliation (future)** — if draw.io or Structurizr import is added, require explicit conflict handling and preserve semantic IDs/metadata. Do not overwrite canonical text from an arbitrary edited artifact without a preview and a user confirmation.

The architecture draw.io export now preserves parent cells, local child geometry, `architectureKind` metadata, container cells, endpoint references, and orthogonal waypoints. The C4 JSON export remains project-specific model interchange and should not be called a Structurizr workspace export. The Structurizr DSL export generates native people, software systems, containers, and components; maps root-level database/queue nodes to tagged custom elements; emits system-landscape, system-context, container, component, and custom-element views; disables implied relationships; and carries the selected layout direction into Structurizr auto-layout. It is intentionally marked lossy/no-round-trip because generated views/styles and custom-element mappings do not exist in the source DSL.

Structurizr is a good complement for architecture semantics, not a replacement for the local renderer. The upstream repository provides the DSL parser, C4 model, themes, renderers, and exporters as a Java ecosystem. The project should consume its portable DSL at the file boundary and let users open it in Structurizr Playground/Local; vendoring the upstream runtime into the TypeScript browser bundle would duplicate layout/rendering responsibility and increase maintenance and bundle cost.

## Layout quality gates

Every automatic or imported layout should run deterministic checks after rendering:

- zero node overlaps and zero edges through unrelated node interiors;
- no edge endpoint overshoot and no degraded route unless explicitly reported;
- zero label/node and label/label overlap where the view budget allows;
- containment is preserved and child bounds stay inside the parent content area;
- parent title bands do not collide with children;
- crossings are minimized, with a documented exception only when topology makes zero crossings impossible;
- page-fit scale meets the readable threshold for deliverables (`fit: strict`), while exploratory views may use `fit: contain`;
- high-degree nodes get a deliberate fan-out strategy, such as grouped ports, an edge corridor, or a separate view.

The layout implementation uses orthogonal routing, soft obstacles, ancestor-container exclusions, reserved container title space, deterministic edge-label candidates, and route-status reporting. These mechanisms are reusable across diagram sizes; they are not a fixture-specific coordinate patch.

## Complexity-aware multi-agent workflow

The cheapest safe workflow is staged. Deterministic agents own facts and acceptance; models advise on semantics and visual ambiguity.

| Complexity | Deterministic agents | Model usage | Recommended outcome |
| --- | --- | --- | --- |
| Small | layout + geometry critic | none by default | one view, bounded repair |
| Moderate | layout + geometry critic | small/local semantic critic and optional repair | one or a few views, explainable suggestions |
| Complex | layout + geometry critic | general semantic critic + general visual critic | split C4 views before polishing |
| Very complex | same deterministic gates | strongest model only for final visual ambiguity; general model for repair | view decomposition, page-specific exports, human approval |

`@bpm/review` exposes `assessDiagramComplexity()` and `recommendAgentWorkflow()` for this routing. The score is based on node/edge volume, nesting depth, fan-out, and label density. It is a cost-allocation signal, not a quality score. The recommended sequence is:

1. parse and semantically validate;
2. choose the view and complexity tier;
3. run deterministic layout and geometry inspection;
4. apply bounded deterministic repair where possible;
5. ask a small/local model for semantic or text-only suggestions when needed;
6. ask a general/strong vision model only after geometry is stable;
7. re-render, re-validate, and require explicit human approval for source/view changes.

Do not use a model to invent coordinates that the layout engine can compute. Do not send the strongest model the full diagram when a view slice or a deterministic finding is sufficient. Redact secrets before any external provider call.

## Next implementation phases

The current branch implements the reusable layout/export foundation, source-backed metadata/views, visible architecture capability status, and download handoffs. The next phases should be:

- add a richer view manifest with explicit include/exclude expressions and per-view page policies;
- add a safe draw.io import preview that reconciles metadata and reports dropped/ambiguous cells;
- add optional Structurizr DSL validation in CI/CLI when the Structurizr CLI is available, without making Java/Docker a browser or core build dependency;
- add an architecture visual-review prompt/provider capability after the deterministic inspection contract is stable;
- add deployment/relationship styles and a formal theme contract;
- benchmark representative simple, nested, fan-out, and multi-view fixtures in CI with readable page-fit budgets.
