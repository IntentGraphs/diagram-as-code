# Architecture diagram family

The architecture family is a deliberately constrained C4-style v1.

Containment is explicit and limited to `system > container > component`. `person`, `database`, and `queue` are leaf nodes. Systems, people, databases, and queues are root-level nodes; containers must be children of systems and components must be children of containers. Relationships use `source -> target: "description"`, preserve direction, and may cross containment boundaries. Cycles are valid; self-relationships are not.

The family exports SVG and lossy draw.io XML. It also exports `architecture-c4-json`, a project-specific C4 model serialization, and `architecture-structurizr-dsl`, a generated Structurizr workspace containing the model, standard C4 views, auto-layout direction, and styles. It is intentionally **not** advertised as a Structurizr `workspace.json` file: Structurizr's JSON is a compiled workspace format containing model, views, and layout data, and is not intended for hand editing.

## Layout and edit contract

Architecture layout supports `direction: right|left|down|up`, hierarchical ELK layout, orthogonal routing, readable edge-label placement, and explicit route status (`clean`, `fallback`, or `degraded`) in the positioned result. Container titles reserve a header band so child labels do not overwrite the container name. Geometry must be checked after layout for node overlap, edge-through-node, crossings, label overlap, containment, and page readability; a valid parse alone is not a quality approval.

The web editor's architecture path is text-first and download-only for structured artifacts. The toolbar exposes draw.io XML, C4 model JSON, and Structurizr DSL downloads; it does not claim continuous synchronization or a lossless import back into the DSL. The draw.io export preserves C4 containment using nested cells, local child coordinates, architecture-kind metadata, container styling, edge endpoints, and orthogonal waypoints. Use the C4 JSON export for project model interchange, the Structurizr DSL export for semantic C4 editing in Structurizr Playground/Local, and draw.io XML for visual editing.

Structurizr is integrated as a format boundary rather than vendored into the browser bundle. The upstream project is a Java-based models-as-code tool with its own DSL parser, renderers, themes, and export modules. Keeping the generated DSL as a download gives users the upstream renderer and editor while avoiding a second layout engine and a large runtime dependency in this application. The export is intentionally marked lossy/no round trip: generated views and styles are preserved in the `.dsl`, but manual Structurizr changes are not imported back into the Diagram as Code source.

For complex architecture, prefer separate C4 views (system context, container, component, deployment/data-flow) over one overloaded page. The source model may remain shared while each view selects a bounded subset of nodes and relationships. `fit: strict` should be used for deliverables where unreadable scaling must block export; `fit: contain` is appropriate for exploratory overview output.
