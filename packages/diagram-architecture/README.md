# Architecture diagram family

The architecture family is a deliberately constrained C4-style v1.

Containment is explicit and limited to `system > container > component`. `person`, `database`, and `queue` are leaf nodes. Systems, people, databases, and queues are root-level nodes; containers must be children of systems and components must be children of containers. Relationships use `source -> target: "description"`, preserve direction, and may cross containment boundaries. Cycles are valid; self-relationships are not.

The family exports SVG and lossy draw.io XML. It also exports `architecture-c4-json`, a project-specific C4 model serialization. It is intentionally **not** advertised as a Structurizr `workspace.json` file: Structurizr's JSON is a compiled workspace format containing model, views, and layout data, and is not intended for hand editing.
