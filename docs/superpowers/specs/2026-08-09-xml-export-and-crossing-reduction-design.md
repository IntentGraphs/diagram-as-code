# BPMN XML Export + Layout Crossing Reduction — Design

## Purpose

Two independent workstreams, bundled into one build cycle at the user's request:

- **Part A**: export a diagram to standard BPMN 2.0 XML, so it can be opened in Camunda Modeler, bpmn.io Modeler, or any other BPMN 2.0-compliant tool.
- **Part B**: reduce edge-edge crossings in dense multi-lane diagrams via a real channel-routing algorithm (not further option-tuning), targeting zero on the existing 7-diagram verification set, with any genuine residual documented rather than chased indefinitely.

These touch entirely separate code (a new export package vs. the existing swimlane engine's edge-repair logic) and have independent test surfaces, so they're structured as two clearly separated task groups sharing one plan document.

## Part A — BPMN 2.0 XML Export

### Package

New `@bpm/export-xml`, depending on `@bpm/ast` and `@bpm/layout-core` (for `Diagram` and `PositionedDiagram` types only — no dependency on any specific layout engine).

```ts
export function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string
```

### Document structure

- Root `<bpmn2:definitions>` with the standard namespace set (`bpmn2`, `bpmndi`, `dc`, `di`, plus a generated `xmlns:tns` targetNamespace).
- **Pools present** (`diagram.pools.length > 0`): a `<bpmn2:collaboration>` containing one `<bpmn2:participant processRef="...">` per pool, and one `<bpmn2:process>` per pool (each pool's process contains a `<bpmn2:laneSet>` with one `<bpmn2:lane>` per lane, each listing its member node ids via `<bpmn2:flowNodeRef>`). Nodes not in any pool (rare — see parser's "unassigned nodes" path) are collected into an implicit unnamed process.
- **No pools**: a single `<bpmn2:process>` containing all flow elements directly, no collaboration wrapper.
- `<bpmndi:BPMNDiagram>` / `<bpmndi:BPMNPlane>`: one `<bpmndi:BPMNShape>` per node (from `PositionedNode.x/y/width/height`) and one `<bpmndi:BPMNEdge>` per edge (from `RoutedEdge.points` as `<di:waypoint>` elements), plus a `<bpmndi:BPMNShape>` per pool/lane (from `PositionedPool`/`PositionedLane` bounds).

### Element mapping

| AST node | BPMN XML element | Notes |
|---|---|---|
| `EventNode` (category=start) | `<bpmn2:startEvent>` | + trigger's event-definition child (see below), omitted for `trigger: 'none'` |
| `EventNode` (category=end) | `<bpmn2:endEvent>` | + trigger's event-definition child |
| `EventNode` (category=intermediate, no `attachedToId`) | `<bpmn2:intermediateCatchEvent>` | this tool doesn't distinguish throw/catch explicitly; catch is the correct default for all currently-supported intermediate triggers |
| `EventNode` (`attachedToId` set) | `<bpmn2:boundaryEvent attachedToRef="{attachedToId}" cancelActivity="{interrupting}">` | + trigger's event-definition child |
| `GatewayNode` | `<bpmn2:exclusiveGateway>` / `parallelGateway` / `inclusiveGateway` / `complexGateway` / `eventBasedGateway` | direct 1:1 on `gatewayType` |
| `ActivityNode` (task) | `<bpmn2:task>` | |
| `ActivityNode` (subProcess) | `<bpmn2:subProcess>` | expanded ones contain nested `flowElements` from `children`/`childEdges`; collapsed ones are empty with no special attribute (this tool has no "triggeredByEvent" concept) |
| `ActivityNode` (transaction) | `<bpmn2:transaction>` | same nesting rule as subProcess |
| `ActivityNode` (callActivity) | `<bpmn2:callActivity>` | |
| `DataObjectNode` | `<bpmn2:dataObject id="{id}_do"/>` + `<bpmn2:dataObjectReference id="{id}" dataObjectRef="{id}_do"/>` | BPMN formally separates the object from its reference; both are emitted for compatibility |
| `DataStoreNode` | `<bpmn2:dataStoreReference id="{id}"/>` | |
| `TextAnnotationNode` | `<bpmn2:textAnnotation><bpmn2:text>{label}</bpmn2:text></bpmn2:textAnnotation>` | |
| `GroupNode` | `<bpmn2:group id="{id}"/>` | artifact, no special content |

**Event-definition children** (by `EventTrigger`): `message`→`<messageEventDefinition/>`, `timer`→`<timerEventDefinition/>`, `error`→`<errorEventDefinition/>`, `escalation`→`<escalationEventDefinition/>`, `cancel`→`<cancelEventDefinition/>`, `compensation`→`<compensateEventDefinition/>`, `conditional`→`<conditionalEventDefinition/>`, `link`→`<linkEventDefinition/>`, `signal`→`<signalEventDefinition/>`, `multiple`→ two or more event-definition children (best-effort: emits a `<messageEventDefinition/>` as a structural placeholder, since this tool doesn't currently model *which* triggers compose a multiple-event — noted as a known limitation, not solved here), `parallelMultiple`→ same approach plus `parallelMultiple="true"` on the event element, `terminate`→`<terminateEventDefinition/>`.

**Flows** (by `DiagramEdge.flowType`):
- `sequence` / `conditionalSequence` → `<bpmn2:sequenceFlow id sourceRef targetRef>`, the latter additionally carrying a `<bpmn2:conditionExpression xsi:type="bpmn2:tFormalExpression">{label}</bpmn2:conditionExpression>` child when a label is present.
- `defaultSequence` → the same `<bpmn2:sequenceFlow>`, **plus** a `default="{edgeId}"` attribute added to the *source* node's own XML element (BPMN's default-flow convention — an attribute on the gateway/activity, not a flag on the flow).
- `message` → `<bpmn2:messageFlow>`, placed inside the `<collaboration>` (not inside any `<process>`), since message flows connect across participants.
- `association` → `<bpmn2:association sourceRef targetRef/>`, inside the owning process.

### Verification

A test feeds the exported XML for each of the project's existing 7 verification diagrams back through `bpmn-js`'s `BpmnModeler.importXML()` (added as a dev dependency) — if it resolves without throwing, the XML is valid enough for a real BPMN tool to open, which is meaningfully stronger evidence than a structural/string assertion.

### Deferred within Part A

- Import (XML → text) — separate, larger effort, not attempted here.
- Full fidelity for `multiple`/`parallelMultiple` event triggers (which specific sub-triggers compose them) — the AST doesn't model this today; exporting a structurally-valid placeholder is accepted as a known limitation.

## Part B — Crossing Reduction via Channel Routing

### Where this lives

Inside `@bpm/layout-engine-swimlane`, replacing the current linear-interpolation edge repair in `laneBanding.ts` for edges that cross between different lanes. Same-lane edges keep the existing exact-shift behavior unchanged (they're already using ELK's near-optimal native routing, just translated).

### The technique

**Channel routing**: the gap between two adjacent lane bands is treated as a routing channel. Every edge that transitions between those two specific lanes gets a horizontal span `[minX, maxX]` (the x-range its transition segment must cover). Using the classic **left-edge / interval-graph-coloring algorithm** (sort spans by start x; assign each to the lowest-numbered track whose most recently assigned span doesn't overlap it; open a new track otherwise), edges whose spans overlap are guaranteed to land on different vertical tracks within the channel — so transition segments between the same two lanes cannot cross each other by construction, not by luck.

Concretely, for each pair of adjacent lanes with at least one transitioning edge:
1. Collect every edge whose source and target lanes are exactly this pair (in either direction).
2. Compute each edge's transition span from its (already-computed) source/target x-positions.
3. Run left-edge track assignment to get each edge a track index.
4. Space tracks evenly within the band gap (gap height grows if more tracks are needed than fit at the default spacing — same "let it extend rather than overlap" principle used for boundary-event spacing).
5. Rebuild each edge's path through its assigned track y-level instead of the current linear interpolation.

Edges spanning more than two lanes (skipping one) are decomposed into per-adjacent-pair segments for the purposes of channel assignment, then stitched into one path.

### Verification harness (promoted, not new)

The scratch geometric analyzer used in prior sessions becomes a permanent, reusable test utility: `@bpm/layout-core/test-utils/geometry.ts`, exporting `analyzeLayout(positioned: PositionedDiagram): { nodeOverlaps: string[]; edgeThroughNode: string[]; edgeCrossings: number }`. Every layout-related test package can import it. The project's existing 7 verification diagrams (screenshot diagram, two-boundary-events pool/lane, parallel fan-out, nested sub-process, three-boundary-event stress test, Order-to-Cash stacked, Order-to-Cash flat) move from ad-hoc scratch scripts into real `*.test.ts` files asserting on `analyzeLayout`'s output, so results can never silently regress.

### Target and honesty clause

The target is zero `edgeCrossings` (and zero `edgeThroughNode`, zero `nodeOverlaps`, already achieved) across all 7 diagrams. If, after implementing channel routing correctly and verifying it functions as designed (tracks correctly assigned, no overlapping spans sharing a track), any diagram still shows a residual crossing — e.g. from two same-lane edges ELK's own native routing couldn't separate, which channel routing doesn't touch — that residual gets documented in the plan's completion notes and in `docs/STATUS.md`, not treated as an incomplete task. The algorithm must be genuinely implemented and correct; it is not required to make an impossible number achievable.

## File Structure (new/changed)

```
packages/export-xml/
  package.json, tsconfig.json
  src/
    index.ts                 # exportToXml(diagram, positioned)
    elements.ts               # AST node -> BPMN element XML builders
    eventDefinitions.ts        # EventTrigger -> event-definition XML
    diagramInterchange.ts       # BPMNShape/BPMNEdge builders from Positioned* types
  test/
    export.test.ts              # bpmn-js round-trip verification, per diagram

packages/layout-core/
  test-utils/
    geometry.ts                # promoted analyzeLayout() helper

packages/layout-engine-swimlane/
  src/
    channelRouting.ts           # left-edge track assignment + channel path building (new)
    laneBanding.ts               # modified: cross-lane edges routed via channelRouting.ts
  test/
    crossing-regression.test.ts   # the 7 diagrams, asserting analyzeLayout() results
```
