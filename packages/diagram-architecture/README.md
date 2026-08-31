# Architecture diagram family

The architecture family is a deliberately constrained C4-style v1.

Containment is explicit and limited to `system > container > component`. `person`, `database`, and `queue` are leaf nodes. Systems, people, databases, and queues are root-level nodes; containers must be children of systems and components must be children of containers. Relationships use `source -> target: "description"`, preserve direction, and may cross containment boundaries. Cycles are valid; self-relationships are not.

The family exports SVG and lossy draw.io XML. It also exports `architecture-c4-json`, a project-specific C4 model serialization. It is intentionally **not** advertised as a Structurizr `workspace.json` file: Structurizr's JSON is a compiled workspace format containing model, views, and layout data, and is not intended for hand editing.

## Layout and edit contract

Architecture layout supports `direction: right|left|down|up`, hierarchical ELK layout, orthogonal routing, readable edge-label placement, and explicit route status (`clean`, `fallback`, or `degraded`) in the positioned result. Container titles reserve a header band so child labels do not overwrite the container name. Geometry must be checked after layout for node overlap, edge-through-node, crossings, label overlap, containment, and page readability; a valid parse alone is not a quality approval.

The web editor's architecture path is text-first. `Edit / Open Diagram` opens an embedded draw.io/diagrams.net editor; its `Download .drawio` action persists the edited XML. It does not claim continuous synchronization or a lossless import back into the DSL. The draw.io export preserves C4 containment using nested cells, local child coordinates, architecture-kind metadata, container styling, edge endpoints, and orthogonal waypoints. Use the C4 JSON export for model interchange and the draw.io editor/XML for visual editing.

For complex architecture, prefer separate C4 views (system context, container, component, deployment/data-flow) over one overloaded page. The source model may remain shared while each view selects a bounded subset of nodes and relationships. `fit: strict` should be used for deliverables where unreadable scaling must block export; `fit: contain` is appropriate for exploratory overview output.
