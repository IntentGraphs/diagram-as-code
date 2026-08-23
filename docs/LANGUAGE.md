# BPM Text Language Reference

_Authoritative grammar and vocabulary for the text format. The BPMN grammar is parsed by `@bpm/parser`; the `diagram:` family grammars and shared header directives are parsed by `packages/diagram-runtime` and the family packages. This reference is verified against those implementations and describes currently accepted syntax, not aspirational syntax._

_This document is self-contained: it's meant to be handed to any AI assistant — regardless of provider or model — as the sole source needed to write a correct, well-laid-out diagram on the first try, including complex, multi-pool, multi-feature diagrams. §8–§11 exist specifically to make first-attempt output reliable; read them before generating anything non-trivial._

## 1. File shape

```
[diagram: <family>]            ← optional; first non-blank line for a family file
[layout: <engine>]              ← optional, leading directive for BPMN
[positioning: manual]           ← optional, first line(s)
[layoutSpacing: <preset>]       ← optional, first line(s)
[routing: quality|hybrid|fast]  ← optional automatic-routing profile
[page: 6in x 9in]               ← optional, common output page
[fit: contain]                  ← optional, page fit policy
[direction: right|left|down|up] ← optional process/tree direction
[laneDirection: horizontal|vertical] ← optional BPMN pool-lane orientation
[timescale: monthly]            ← optional, Gantt visual time scale
[render: auto]                  ← optional, live-preview policy

<node declarations>
<edge declarations>
```

- For BPMN, `layout:`, `positioning:`, `layoutSpacing:`, `routing:`, `direction:`, `laneDirection:`, `paginate:`, and `pageBreak:` are optional leading directives. They may appear in any order before the first body line; do not insert a blank line inside this leading block. `paginate:` and `pageBreak:` reject duplicates; the other core directives currently use the last value when repeated. For family files, `diagram: <family>` must be the first non-blank line; shared header directives are described in §2.1.
- `page:` and `fit:` are common output directives. For non-BPMN families, place them after the required first-line `diagram: <family>` selector. `page:` accepts positive dimensions in `in`, `mm`, or `px`; omitted units default to inches. `fit:` defaults to `contain` and may be set to `strict` to reject diagrams that would be rendered below the minimum readable scale. These directives are accepted for every diagram family and do not change the layout coordinate system.
- `timescale:` is Gantt-only and changes the visual horizontal time scale without changing task dates, weekday durations, dependencies, or structured schedule exports. It accepts `day`/`daily`, `week`/`weekly`, `fortnight`/`fortnightly`/`biweekly`, `month`/`monthly`, `quarter`/`quarterly`, `halfyear`/`half-year`/`half a year`/`semiannual`/`semiannually`, or `auto`. A Gantt `calendar:` value of `weekdays`/`weekday` retains the fixed Monday-Friday scheduling calendar; cadence values are shorthand for the same visual scale. When a page is declared, Gantt distributes the start/end date range across the available page width. `auto` selects a coarser scale from the timeline span.
- `render: auto` and `render: manual` control the web editor's live preview. `auto` is the default for light diagrams; the editor automatically switches heavy diagrams to an explicit Render action. A heavy diagram that explicitly requests `render: auto` shows a warning instead of starting repeated live layouts. `manual` always requires the Render action. This directive does not affect CLI/export rendering.
- For CLI/export verification, a page declaration is consumed by both SVG and structured exporters. Use `validate --json` to inspect the resolved geometry before rendering or exporting; see `docs/CLI.md` for a copy-safe SVG/PPTX workflow.
- DOCX export is CLI-only and uses one vector-backed SVG image per semantic page. If semantic pages derive different intrinsic dimensions, provide a common `page:` directive so the Word document has one consistent physical page size; incompatible aspect ratios are rejected rather than silently distorted. DOCX is not a native Word-shape or semantic round-trip format.
- SVG/page fitting and editable-PPTX readability are separate checks. `fit: contain` allows the complete SVG to be scaled into the declared page, even when labels become small; `fit: strict` blocks supported runtime/export paths when the complete diagram or semantic page falls below the shared minimum page scale. Editable PPTX export still writes the native-shape deck when a label's projected text box or font is small, but reports an `editable_text_density` warning so the user can review readability, split the diagram, or choose a visual/image-based presentation workflow. Structural PPTX/DOCX limits, invalid geometry, invalid continuation structure, unsupported families, and Gantt slide-count limits remain blocking errors.
- Everything else is either a **node declaration** (§3) or an **edge declaration** (§5), one per line.
- Nesting (pools/lanes, subprocess bodies) is by indentation: each nested level is indented deeper than the line it belongs to.
- **Nesting indentation must be exactly 2 spaces per level, using space characters only — never tabs, never 3 or 4 spaces.** This is a hard parser requirement, not a style preference: the parser expects each child line at precisely `parent indent + 2`, not merely "deeper than the parent." A 4-space or tab habit (the common default for many editors and most other languages) will fail to parse, and the resulting error — `Could not parse line: "..."` — gives no hint that indentation width is the cause. When generating multi-line diagrams (any pool/lane or subprocess), indent every nested level by exactly 2 spaces, consistently, for the whole file.
- Blank lines are ignored in diagram bodies. A blank line ends the BPMN leading-directive block, so keep all leading directives contiguous.

## 2. Directives

| Directive | Values | Effect |
|---|---|---|
| `layout: <name>` | `swimlane`, `flat`, or any future registered engine name | Forces a specific auto-layout engine, overriding auto-detection. Unrecognized names fail at **layout time**, not parse time. |
| `positioning: manual` | `manual` (only accepted value) | Every node must carry `at (x, y)` (§6); no layout engine runs. Cannot be combined with `layout:` — parse error if both are present. |
| `layoutSpacing: <preset>` | `compact` &#124; `normal` &#124; `relaxed` &#124; `spacious` | Controls inter-node and inter-edge spacing for all layout engines. `normal` matches the original defaults. `compact` tightens gaps; `relaxed`/`spacious` widen them progressively. |
| `routing: <mode>` | `quality` &#124; `hybrid` &#124; `fast` | Automatic edge-routing profile. `quality` is the default; `hybrid` keeps quality routing inside pools while using bounded routing for global message flows; `fast` skips expensive post-layout edge separation entirely. Both degraded modes can contain edge crossings and edge-through-node findings. |
| `page: <width> x <height>` | Positive dimensions in `in`, `mm`, or `px`; default unit is `in` | Fits the rendered diagram into a fixed output page while preserving its aspect ratio. `page: 6 x 9` is a portrait 2:3 page. |
| `fit: contain` | Requires `page:` | Shows the complete diagram with uniform scaling and safe margins; this is the default. |
| `fit: strict` | Requires `page:` | Fails when the complete diagram would fall below the minimum readable scale instead of silently producing a tiny diagram. |
| `paginate: none` | `none` (default) | Keep the existing single-page render. `semantic` enables BPMN pool/lane multi-page output; `tile` and `hybrid` are reserved and unsupported. |
| `pageBreak: pool|lane|group|branch` | `pool` for semantic BPMN | Break semantic BPMN by pool, or by lane with `lane`; `group` and `branch` fall back to pool grouping and report a warning. |
| `direction: <value>` | `right` &#124; `left` &#124; `down` &#124; `up` | Selects process/tree growth. Flowcharts support all four and default to `down`; mind maps support all four and default to `right`; BPMN supports `right` and defaults to it. Architecture and Gantt do not support this directive. |
| `laneDirection: <value>` | BPMN only: `horizontal` &#124; `vertical` | Selects BPMN pool-lane composition independently of process direction. `horizontal` remains the default; `vertical` arranges lanes left-to-right. Non-BPMN use is invalid. |
| `timescale: <scale>` | Gantt only: canonical `daily` &#124; `weekly` &#124; `fortnightly` &#124; `monthly` &#124; `quarterly` &#124; `halfyear` &#124; `auto`, plus documented aliases | Compresses or expands the visual Gantt axis while preserving the exact schedule dates and durations. `auto` chooses a scale from the date span. |
| `render: auto` | `auto` &#124; `manual` | Allows live preview for light diagrams; heavy diagrams require an explicit Render action and show a warning if auto-render was requested. |
| `render: manual` | `auto` &#124; `manual` | Never schedules live preview from typing; the web editor waits for the Render action. |
| `diagram: <family>` | `bpmn` &#124; `mindmap` &#124; `flowchart` &#124; `architecture` &#124; `gantt` | Selects the family parser. Omit it for the backwards-compatible BPMN grammar. |

If no directive is given: the diagram auto-detects `swimlane` (has ≥1 pool with ≥1 lane) or falls back to `flat`, with `normal` spacing.

### 2.1 Diagram family directive

```
diagram: mindmap
diagram: flowchart
diagram: architecture
diagram: gantt
```

`diagram: <family>` must be the first non-blank line and may appear only once. It selects a family parser and renderer; `bpmn` is accepted explicitly, while omission selects BPMN for backwards compatibility. Family-specific files do not use the BPMN node/edge grammar below.

#### Mind maps

`diagram: mindmap` accepts one root and indentation-nested children. Each declaration is:

```
mindmap "<label>" as <id>
mindmap as <id>
```

The label is optional; when omitted, the id is used as the displayed label. Children are exactly two spaces deeper than their parent, and the parent/child relationship is the edge — do not write separate edge declarations. A mind map must have exactly one root at indent 0. Ids match `[A-Za-z_][A-Za-z0-9_.-]*`.

Representative diagnostics include `bad_indent_step` (tabs or non-2-space indentation), `unparseable_line`, `invalid_id`, `duplicate_id`, `orphan_indent`, `indent_skips_level`, `multiple_roots`, and `missing_root`.

Example:

```
diagram: mindmap
mindmap "Product launch" as launch
  mindmap "Research" as research
  mindmap "Delivery" as delivery
    mindmap "Packaging" as packaging
```

The implementation caps source size, node count, and nesting depth; these failures use `source_too_large`, `max_nodes_exceeded`, or `max_depth_exceeded`.

#### Architecture

`diagram: architecture` accepts C4-style nodes and directed relationships:

```
person|system|container|component|database|queue "<label>" as <id>
<sourceId> -> <targetId>[: "<label>"][as <id>]
```

Containment uses exactly two spaces per level. Systems are root-only; containers must be directly inside systems; components must be directly inside containers; person, database, queue, and component nodes are leaves. Ids match `[A-Za-z_][A-Za-z0-9_.-]*`; `0` and `1` are reserved by the draw.io export. Representative diagnostics include `invalid_indentation`, `unparseable_line`, `invalid_id`, `duplicate_id`, `invalid_containment`, `unknown_edge_endpoint`, `self_relationship`, `reserved_drawio_id`, `duplicate_relationship`, `source_too_large`, `max_nodes_exceeded`, `max_edges_exceeded`, and `max_depth_exceeded`.

Example:

```
diagram: architecture
person "Customer" as customer
system "Ordering" as ordering
  container "API" as api
    component "Checkout" as checkout
database "Orders" as orders
customer -> api: "places orders"
checkout -> orders: "stores order"
```

#### Flowcharts

`diagram: flowchart` accepts labeled boxes, labeled decisions, and directed edges:

```
box "<label>" as <id>
decision "<label>" as <id>
<sourceId> -> <targetId>[: "<label>"]
<sourceId> => <targetId>[: "<label>"]
<sourceId> ->> <targetId>[: "<label>"]
```

Box and decision labels are required and must be double-quoted. Ids match `[A-Za-z_][A-Za-z0-9_.-]*`; edge endpoints must name declared nodes. `->`, `=>`, and `->>` map to sequence, conditional-sequence, and default-sequence edges. `~>` and `..>` are rejected as `unsupported_edge_kind`, and pools/lanes, `at`/`size` positioning hints, and attribute blocks are rejected as `unsupported_declaration`. Other malformed lines use `unparseable_line`; missing labels use `missing_label`, duplicate ids use `duplicate_id`, and unknown endpoints use `unknown_edge_endpoint`.

Example:

```
diagram: flowchart
box "Receive request" as receive
decision "Approved?" as approved
box "Ship" as ship
box "Reject" as reject
receive -> approved
approved => ship: "yes"
approved ->> reject: "no"
```

#### Gantt charts

`diagram: gantt` accepts a bounded project timeline with a fixed weekday scheduling calendar,
optional visual calendar cadence, nested groups, scheduled tasks, milestones, progress values,
and finish-to-start dependencies.
It is independent of the BPMN node/edge grammar above.

The canonical file shape is:

```
diagram: gantt
calendar: weekdays
timescale: monthly

[group "<label>" as <id>]
  [group "<nested label>" as <id>]
    task "<label>" as <id> <schedule> [progress <0-100%>]
  task "<label>" as <id> <schedule> [progress <0-100%>]
task "<label>" as <id> <schedule> [progress <0-100%>]
milestone "<label>" as <id> start <YYYY-MM-DD>

<sourceTaskId> -> <targetTaskId> [lag <Nd>]
```

Use exactly two spaces for each nested group level. Groups may contain tasks or other groups;
tasks outside a group are top-level tasks. The `calendar: weekdays` line is optional because
Monday-Friday is the scheduling default. For the visual axis, `calendar: fortnightly`,
`calendar: monthly`, `calendar: quarterly`, and `calendar: half a year` are accepted shorthand
values. The equivalent canonical form is `timescale: fortnightly|monthly|quarterly|halfyear`.
Do not provide conflicting `calendar:` and `timescale:` cadences.

Normal tasks must specify exactly two of these scheduling fields:

```
start <YYYY-MM-DD>
end <YYYY-MM-DD>
duration <Nd>
```

The valid combinations are `start` + `duration`, `start` + `end`, or `end` + `duration`.
Durations and date consistency are resolved against the fixed Monday-Friday calendar. A
milestone must have exactly one `start` date and must not have `end` or `duration`. `progress`
is optional and must be a percentage from `0%` through `100%`. Dependency lag is optional and
uses a non-negative duration such as `lag 2d`.

`timescale:` is presentation-only. `daily` is the default and preserves the original detailed
axis. `weekly` and `fortnightly` use fixed seven- and fourteen-day visual units. `monthly`,
`quarterly`, and `halfyear` use proportional calendar-period positions, so bars that cross a
period retain their relative placement. If `page:` is present, the resolved start/end range is
given the page's horizontal budget and the period units are distributed across that budget;
without `page:`, the compact intrinsic layout is retained. `auto` selects daily, weekly,
fortnightly, monthly, quarterly, or halfyear from the overall date span. SVG and editable PPTX
consume the same resolved timescale and page-aware geometry; Gantt JSON remains lossless for the
schedule and includes an explicit timescale when one was set.

Ids match `[A-Za-z_][A-Za-z0-9_.-]*`. Dependency endpoints must reference tasks, not groups;
self-dependencies and dependency cycles are invalid. Dates must be real ISO calendar dates,
and labels are double-quoted. The implementation bounds source size, task count, dependency
count, nesting depth, label length, and the overall timeline; validation reports the exact
limit when one is exceeded.

Example:

```
diagram: gantt
calendar: weekdays

group "Discovery" as discovery
  task "Interview users" as interviews start 2026-09-01 duration 3d progress 50%
  task "Approve scope" as scope start 2026-09-04 duration 2d
task "Build release" as build start 2026-09-08 end 2026-09-18
milestone "Public v1" as release start 2026-09-21

interviews -> scope lag 1d
scope -> build
build -> release
```

Mind maps, flowcharts, architecture diagrams, and Gantt charts have family-specific
parse/layout validation, but they do not use BPMN legality rules such as event-trigger or
gateway-target checks.

**Which to pick:** default to giving neither directive. Auto-layout computes non-overlapping positions and routes every edge for you from topology alone — no coordinate math, nothing to get wrong. Reach for `positioning: manual` only when the user explicitly asks for exact pixel/coordinate placement; it trades away all of that automatic work for hand-computed `at (x, y)` values (§6). Individual nodes may also carry optional `at (x, y)` without this directive (§6.6).

### 2.2 Direction and BPMN lane orientation

Roadmap item 19 defines two deliberately separate controls:

- `direction` controls process/tree growth for flowcharts and mind maps. Flowcharts and mind maps default to `down` and `right` respectively, and both support `right`, `left`, `down`, and `up`. BPMN supports `right` and defaults to it.
- `laneDirection` controls the arrangement of lanes inside a BPMN pool. BPMN defaults to `horizontal`; `vertical` arranges lanes left-to-right while keeping process-flow direction independent.
- `routing: hybrid` and `routing: fast` are explicit performance tradeoffs for dense automatic diagrams. They are not semantic changes to the BPMN graph and do not affect manual positioning. Use them for responsive previews; inspect the result before treating it as presentation-ready.

Architecture and Gantt do not accept direction semantics. Invalid values, duplicate directives, wrong-family `laneDirection`, and family-unsupported directions produce structured diagnostics. `fit: contain` keeps valid diagrams renderable; strict page-fit failures and unsupported capabilities block export.

See the directive table above and [`docs/CLI.md`](CLI.md) for the machine-readable validation/export contract.

## 3. Node declarations

Every BPMN node kind (except boundary events, §3.2) may optionally end with `at (x, y)` — see §6 for when that's required vs. optional.

**Identifiers (`as <id>`, edge endpoints, `on <hostId>`):** must match `[A-Za-z_][A-Za-z0-9_.-]*` (letter or underscore first; then letters, digits, `_`, `.`, `-`). Ids such as `1x`, `a"b`, or `a b` are parse errors.

### 3.1 Event
```
event <category> <trigger> "<label>" as <id>
```
| Field | Allowed values |
|---|---|
| `category` | `start` &#124; `intermediate` &#124; `end` |
| `trigger` | `none` &#124; `message` &#124; `timer` &#124; `error` &#124; `escalation` &#124; `cancel` &#124; `compensation` &#124; `conditional` &#124; `link` &#124; `signal` &#124; `multiple` &#124; `parallelMultiple` &#124; `terminate` |

The parser accepts any trigger token above, but `@bpm/validate` rejects category/trigger pairs that BPMN 2.0 forbids — see §3.6.

Example: `event start message "Order submitted" as c1`

Supported event-definition payloads may be added in the node attribute block. They are kept in
the AST and BPMN XML export/import instead of being reduced to a decorative trigger icon:

```text
event intermediate timer "Wait five minutes" as wait [timerDuration: "PT5M"]
event intermediate message "Order received" as received [messageRef: "OrderMessage"]
event intermediate conditional "Stock ready" as ready [condition: "stock > 0"]
```

The supported keys are `timerDate`, `timerDuration`, `timerCycle`, `messageRef`, `errorRef`,
`escalationRef`, `signalRef`, and `condition`. The XML exporter creates referenced global
message/error/escalation/signal declarations when needed. Event definitions that are not in this
list remain visible in the Import to Text conversion accounting as transformed semantics.

### 3.2 Boundary event
```
boundary <trigger> (interrupting|nonInterrupting) "<label>" as <id> on <hostId>
```
- `trigger`: same token list as §3.1; boundary legality rules in §3.6 apply.
- `hostId` must reference an already-declared node id.
- **Never accepts `at (x, y)`** — a boundary event is always positioned on its host's border, in both auto and manual diagrams. Giving it one is a parse error: `Boundary event "<id>" cannot have a position — it is always placed relative to its host "<hostId>"`.

Example: `boundary timer nonInterrupting "Slow charge" as sb1 on sn2`

### 3.3 Gateway
```
gateway <type> "<label>" as <id>
```
`type`: `exclusive` &#124; `parallel` &#124; `inclusive` &#124; `complex` &#124; `eventBased`

Example: `gateway exclusive "Approved?" as g1`

### 3.4 Activity
```
(task|userTask|serviceTask|sendTask|receiveTask|manualTask|businessRuleTask|scriptTask|subprocess|transaction|callActivity) "<label>" as <id> [collapsed]
```
- `task`: abstract/undifferentiated BPMN task (exports as `bpmn:task`).
- `userTask`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `businessRuleTask`, `scriptTask`: BPMN 2.0 task subtypes — distinct corner marker in SVG and matching export tag (`bpmn:userTask`, etc.). `receiveTask` is also a legal target for an event-based gateway outgoing flow (§3.6).
- `task`, `callActivity`: always a plain box, never nests children.
- `subprocess`, `transaction`: if **not** followed by `collapsed`, opens a nested block — every following line indented one level deeper (exactly 2 more spaces, §1) is that activity's own child node/edge declarations, until indentation returns to this level or shallower. `transaction` additionally renders a double border.
- `collapsed`: renders a `+` marker instead of expanding; no nested block follows.

Example:
```
subprocess "Handle payment" as sp1
  event start none "Sub start" as sn1
  task "Charge card" as sn2
  sn1 -> sn2
```

### 3.5 Data / annotation / group
```
(dataObject|dataStore|annotation|group) "<label>" as <id>
```
No further fields.

### 3.6 BPMN 2.0 legality (semantic validation)

After syntax parsing succeeds, `@bpm/parser` runs a BPMN 2.0.2 rule table (`packages/parser/src/bpmnLegality.ts`). Violations surface as **`semanticErrors`** — structured `{line, column, message}` items distinct from syntax **`errors`**. `bpm validate` and `@bpm/validate` return `valid: false` when either bucket is non-empty.

| Rule | Spec citation | What is rejected |
|---|---|---|
| Start-event triggers | Table 10.84 | `error`, `escalation`, `cancel`, `compensation`, `terminate` on `event start …` |
| End-event triggers | Table 10.88 | `timer`, `conditional`, `link` on `event end …` |
| Intermediate-event triggers | Table 10.89 | `error`, `cancel`, `terminate` on `event intermediate …` in normal flow |
| Boundary-event triggers | Table 10.90 | `none`, `link`, `terminate` on `boundary …` |
| Cancel boundary host | Table 10.90 | `boundary cancel … on <host>` when `<host>` is not a `transaction` |
| Event-based gateway targets | §10.6.6 / Table 10.127 | Outgoing sequence flows from `gateway eventBased …` that do not target an `event intermediate …` catch event or a `receiveTask` |
| Self-loops | BPMN control-flow constraint | Any non-association edge whose source and target are the same node |

**Allowed examples (near-misses for the rules above):**

```
event end terminate "Rejected" as e1          # terminate: end-only (not start)
event intermediate timer "Wait" as i1         # timer: intermediate catch (not end)
boundary timer interrupting "Slow" as b1 on t1   # boundary with a defined trigger (not none)
boundary cancel interrupting "Abort" as b1 on tx1   # cancel boundary on a transaction host
gateway eventBased "Wait" as g1
event intermediate message "Offer" as i1
receiveTask "Await PO" as r1
g1 -> i1                                      # event-based gateway → intermediate catch
g1 -> r1                                      # or → receive task
```

Legality coverage lives under `packages/parser/test/fixtures/legality/` and `packages/parser/test/legality.test.ts`; most rules have illegal/legal fixture pairs, while self-loop coverage is a focused unit test.

## 4. Pools & lanes

```
pool "<name>"
  lane "<name>"
    <node declarations>
  lane "<name>"
    <node declarations>
```
- A `pool` line must be at indent 0.
- `lane` lines nest one level under their pool; node declarations nest one level under their lane (each level exactly 2 spaces deeper, §1).
- A node belongs to the lane it's textually declared inside; edges between nodes in different lanes of the same pool are auto-detected as cross-lane and routed accordingly.
- Presence of ≥1 pool with ≥1 lane is what triggers auto-detection of the `swimlane` engine when no `layout:`/`positioning:` directive is given.
- A pool may be declared without lanes, but it contains no lane-scoped nodes and does not trigger swimlane auto-detection; use a lane when the pool is meant to contain process nodes.

## 5. Edge declarations

```
<sourceId> <arrow> <targetId>[: "<label>"] [attr: value, attr: value, ...]
```

### 5.1 Arrows → flow type

| Arrow | Flow type | Default rendering | Typical use |
|---|---|---|---|
| `->` | `sequence` | solid line | ordinary control flow |
| `=>` | `conditionalSequence` | solid line, small diamond at source | a labeled branch out of a gateway |
| `->>` | `defaultSequence` | solid line, tick mark at source | the "else"/default branch out of a gateway |
| `~>` | `message` | dashed (`6 4`), open circle at source | communication crossing between two pools/participants |
| `..>` | `association` | dotted (`1 3`), no arrowhead | linking a data object/annotation to a node, not a flow |

### 5.2 Label
Optional `: "<text>"` immediately after the target id, before any attribute block.

### 5.3 Attribute block — full dictionary

Optional trailing `[key: value, ...]`, comma-separated, any subset, any order. This attribute block is part of the BPMN edge grammar and is available on BPMN edges in both auto-layout and manual/partially pinned diagrams. Family grammars have their own edge syntax; flowchart and architecture edges do not accept this block.

| Key | Values | Effect | Default when omitted |
|---|---|---|---|
| `style` | `solid` &#124; `dashed` &#124; `dotted` | Overrides the flowType-based dash pattern | flowType's own default (see table above) |
| `corner` | `sharp` &#124; `round` | Cosmetic bezier-smoothing at each orthogonal bend — never changes the routed path, only how it's drawn | `sharp` |
| `from` | `left` &#124; `right` &#124; `top` &#124; `bottom` | Which side of the **source** node the edge exits from | auto-picked by the router based on relative position |
| `to` | `left` &#124; `right` &#124; `top` &#124; `bottom` | Which side of the **target** node the edge enters | auto-picked by the router based on relative position |
| `via` | one or more `(x,y)` pairs | Interior waypoints between exit and entry stubs (same coordinate rules as `at (x, y)`). Prefer axis-aligned segments; non-orthogonal via pairs warn in `validate` | auto-routed |
| `labelAt` | number in `[0,1]` | Fraction along the routed polyline for the edge label | midpoint-ish default |
| `labelSide` | `above` &#124; `below` &#124; `left` &#124; `right` | Offset the label from the path | slightly above the path |
| `labelOffset` | `(dx,dy)` | Extra canvas delta after `labelSide` | `(0,0)` |

`from`/`to: bottom` (or `top`) on a `gateway` or `event` node routes the edge straight through that node's own label, which always renders directly below the shape — the label stays legible (it has a background halo), but prefer leaving `from`/`to` on those node kinds unset (auto-picked) or use `left`/`right` unless the diagram specifically needs a vertical exit.

An unknown key or an unrecognized value for a known key is a parse error naming exactly which one.

Example: `g1 -> t2: "Approved" [from: right, to: left, via: (280,115) (320,115), labelAt: 0.3, labelSide: above]`

### 5.4 Node size and label visuals

For BPMN node declarations, after `as <id>` (and optional `at (x, y)`):

```
… as <id> [at (x, y)] [size (w, h)] [label: …, wrap: …, font: …, align: …]
```

| Form | Meaning |
|---|---|
| `size (w, h)` | Requested outer bbox; layout clamps up to kind defaults/minimums |
| `label:` | `inside` &#124; `below` &#124; `above` &#124; `left` &#124; `right` |
| `wrap:` | `1`…`5` max text lines |
| `font:` | `small` &#124; `normal` &#124; `large` |
| `align:` | `left` &#124; `center` (reserved for future; centered today) |

### 5.5 Camunda vendor extensions (opt-in)

The same node `[...]` block accepts Camunda 7 keys. Diagrams that omit them export as plain BPMN 2.0 with **no** `camunda:` namespace — zero change for BPMN-only users. See `docs/superpowers/specs/2026-08-14-camunda-export-extensions-design.md`.

| Key | XML attribute | Allowed on | Example |
|---|---|---|---|
| `camundaClass` | `camunda:class` | `serviceTask` | `serviceTask "Charge" as s1 [camundaClass: com.example.ChargeDelegate]` |
| `camundaExpression` | `camunda:expression` | `serviceTask` | `serviceTask "Tax" as s1 [camundaExpression: "${amount * 1.1}"]` |
| `camundaFormKey` | `camunda:formKey` | `userTask` | `userTask "Approve" as u1 [camundaFormKey: "embedded:app:forms/approve.html"]` |

- `camundaClass` and `camundaExpression` are mutually exclusive (parse error if both are set).
- Values may be unquoted or double-quoted. Quotes are required when the value contains a comma.
- Mixing with visual keys is allowed: `userTask "Approve" as u1 [label: inside, camundaFormKey: embedded:app:forms/approve.html]`.

The `layoutSpacing:` directive (§2) controls all spacing profiles in auto-layout engines.

## 6. Manual positioning mode

Turned on with a leading `positioning: manual` directive (§2).

### 6.1 `at (x, y)` syntax
```
<node declaration...> at (<x>, <y>)
```
- `x`/`y` are plain numbers (integer or decimal, negative allowed): `at (240, 120)`, `at (-10.5, 0)`.
- **Required** on every node except boundary events, when `positioning: manual` is set. Missing it is a parse error: `Node "<id>" is missing a required position ("at (x, y)") in a manual-positioning diagram`.
- Optional when `positioning: manual` is *not* set. A node with `at (x, y)` is pinned while every other eligible node remains auto-laid-out; see §6.6. Boundary events remain the exception and cannot carry their own position.

### 6.2 Coordinate origin
- A node declared directly at the top level (not inside a pool/lane): `(x, y)` is canvas-absolute, origin at the top-left.
- A node declared inside a `lane`: `(x, y)` is relative to **that lane's own top-left** — lanes still auto-stack top-to-bottom and auto-size to whatever content is placed in them, so placing content in a later lane never requires knowing how tall earlier lanes ended up.

### 6.3 What stays automatic even in manual mode
- **Node width/height** — auto-sized from the label by default; optionally overridden with `size (w, h)` (§5.4), which clamps up to kind minimums. See §6.5 for the default sizes.
- **Lane band sizing and stacking order** — computed from content, same as auto-layout.
- **Edge routing between fixed points** — the same shared obstacle-avoiding orthogonal router used by auto-layout; `from`/`to` (§5.3) only pick which side each end anchors to, not the bends in between.
- **Boundary event placement** — always computed relative to its host's border; never given its own `at (x, y)`.

### 6.4 Current limitations
- **Overlapping nodes are rejected**, not silently drawn on top of each other — a layout-time error names both node ids and a cheapest axis-aligned fix, e.g. `Nodes "a" and "b" overlap at their given positions — shift "b" right by 14 (or the other node left).` Use §6.5's dimension table to compute non-overlapping coordinates up front rather than discovering the overlap after the fact.
- **Live-render resource limits are explicit and tiered.** The BPMN parser/validator caps sources at 100,000 characters, 500 nodes, and 1,000 edges. Layout complexity uses a routing-aware estimate with the legacy `nodeCount × max(edgeCount, 1)` value as its baseline. Up to 5,000 estimated work units is ordinary, 5,001–10,000 emits a warning, 10,001–25,000 requires an explicit/manual render, and values above 25,000 fail before layout with a structured diagnostic. Cross-pool edges, gateway fan-out, feedback edges, and labelled edges add bounded cost. These thresholds protect the synchronous browser path without rejecting a diagram merely because it is slightly above the old 10,000-unit soft budget; runtime/layout failures remain blocking.

### 6.5 Node dimensions (compute these before choosing coordinates)

Width/height default to node kind and, for activities, label length — optionally overridden with `size (w, h)` (§5.4) which clamps up to kind minimums. The default formula is deterministic, so you can precompute every box's footprint and pick non-overlapping `at (x, y)` values on the first attempt instead of hitting the overlap error (§6.4) and resubmitting:

| Node kind | Width | Height |
|---|---|---|
| `event`, `boundary` | 40 | 40 |
| `gateway` | 50 | 50 |
| `dataObject`, `dataStore`, `annotation` | 50 | 60 |
| `group` | 200 | 150 |
| `task`, all task subtypes, `subprocess` (collapsed), `transaction` (collapsed), `callActivity` | `clamp(24 + 7 × label.length, 100, 220)` | 60 |

- Two nodes overlap (and are rejected) if their axis-aligned boxes intersect at all: box = `[x, x + width] × [y, y + height]`. Check every pair before finalizing coordinates, using the table above for each node's width/height.
- Leave meaningful clearance (roughly 20–40 units) between adjacent boxes — the router needs room to route edge stubs in and out without hugging node edges.
- Expanded (non-`collapsed`) `subprocess`/`transaction` boxes are sized from their children's bounding box plus padding — not the collapsed clamp formula above. Children's `at (x, y)` is relative to the subprocess content origin (parent origin + padding / header inset), same idea as lane-relative coordinates in §6.2.
- Boundary events use the `event` size but are never given their own `at (x, y)` — their footprint only matters if you're eyeballing how much room they'll take on their host's border.


### 6.6 Partial pinning without `positioning: manual`

Without `positioning: manual`, any node may optionally carry `at (x, y)`. That node is pinned to the resolved coordinate (canvas-absolute at top level, lane-relative inside a lane — same origin rules as §6.2); every other node is auto-laid-out as usual. Overlaps between a pinned node and an auto-placed neighbor are rejected with the same actionable error as §6.4. Size remains automatic. Boundary events still cannot take `at (x, y)`.

## 7. Quick-reference keyword index

| Keyword / token | Where it's used |
|---|---|
| `layout:` | directive |
| `diagram:` | family selector directive |
| `positioning:` | directive |
| `manual` | value of `positioning:` |
| `swimlane`, `flat` | values of `layout:` (registered engine names) |
| `page:`, `fit:`, `paginate:`, `pageBreak:`, `direction:`, `laneDirection:`, `routing:`, `timescale:`, `render:` | shared/header directives (§2) |
| `bpmn`, `mindmap`, `flowchart`, `architecture`, `gantt` | `diagram:` family values |
| `mindmap`, `box`, `decision`, `person`, `system`, `container`, `component`, `database`, `queue` | family-specific node declarations (§2.1) |
| `calendar:`, `group`, `milestone`, `duration`, `progress`, `lag` | Gantt syntax (§2.1) |
| `event` | node kind |
| `boundary` | node kind (boundary event) |
| `gateway` | node kind |
| `task`, `userTask`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `businessRuleTask`, `scriptTask`, `subprocess`, `transaction`, `callActivity` | node kind (activity) |
| `dataObject`, `dataStore`, `annotation`, `group` | node kind |
| `pool`, `lane` | container declarations |
| `as` | assigns an id to a node |
| `on` | attaches a boundary event to its host |
| `collapsed` | suffix on an activity, suppresses its nested block |
| `at (x, y)` | node position — required in `positioning: manual`; optional pin in auto-layout (§6.6) |
| `start`, `intermediate`, `end` | event categories |
| `none`, `message`, `timer`, `error`, `escalation`, `cancel`, `compensation`, `conditional`, `link`, `signal`, `multiple`, `parallelMultiple`, `terminate` | event/boundary triggers |
| `interrupting`, `nonInterrupting` | boundary event interruption mode |
| `exclusive`, `parallel`, `inclusive`, `complex`, `eventBased` | gateway types |
| `->`, `=>`, `->>`, `~>`, `..>` | edge arrows (flow type) |
| `size (w, h)` | BPMN node size hint — optional except boundary events (§5.4) |
| `layoutSpacing:` | directive — spacing preset for layout engines (§2) |
| `compact`, `normal`, `relaxed`, `spacious` | `layoutSpacing:` values |
| `routing:` | directive — automatic edge-routing profile (§2) |
| `quality`, `hybrid`, `fast` | `routing:` values |
| `[style: ..., corner: ..., from: ..., to: ..., via: ..., labelAt: ..., labelSide: ..., labelOffset: ...]` | edge attribute block |
| `solid`, `dashed`, `dotted` | `style` values |
| `sharp`, `round` | `corner` values |
| `left`, `right`, `top`, `bottom` | `from`/`to` values; also `labelSide` values |
| `above`, `below` | `labelSide` values; also `label:` position values |
| `via` | edge waypoints — one or more `(x,y)` pairs (§5.3) |
| `labelAt` | edge label position fraction `[0,1]` along the polyline (§5.3) |
| `labelSide` | edge label offset direction (§5.3) |
| `labelOffset` | edge label extra `(dx,dy)` delta (§5.3) |
| `label:` | node label position: `inside` &#124; `below` &#124; `above` &#124; `left` &#124; `right` (§5.4) |
| `wrap:` | node max text lines: `1`–`5` (§5.4) |
| `font:` | node font size: `small` &#124; `normal` &#124; `large` (§5.4) |
| `camundaClass` | service-task Java delegate — exports `camunda:class` (§5.5) |
| `camundaExpression` | service-task expression — exports `camunda:expression` (§5.5) |
| `camundaFormKey` | user-task form id — exports `camunda:formKey` (§5.5) |

## 8. Composed patterns

The sections above define individual keywords; real diagrams are these combined. Each pattern below is complete, valid on its own (auto-layout, no directives needed), parses cleanly against the current grammar, and can be pasted into a larger diagram as a building block — see §9 for a full example combining several. Node ids are local to each snippet; rename them to fit the surrounding diagram.

**Exclusive branch + merge:**
```
gateway exclusive "Approved?" as g1
task "Fulfill order" as t1
task "Notify rejection" as t2
event end none "Done" as e1

g1 -> t1: "yes"
g1 -> t2: "no"
t1 -> e1
t2 -> e1
```

**Parallel split + join:**
```
gateway parallel "Split" as g1
task "Pick items" as t1
task "Pack shipment" as t2
gateway parallel "Join" as g2

g1 -> t1
g1 -> t2
t1 -> g2
t2 -> g2
```

**Boundary-event exception handling:**
```
task "Capture payment" as t1
boundary timer interrupting "Payment timeout" as b1 on t1
task "Issue refund" as t2
task "Continue order" as t3

b1 -> t2
t1 -> t3
```

**Cross-pool messaging (two independent participants):**
```
pool "Buyer"
  lane "Ordering"
    event start none "Start" as a1
    task "Send order" as a2
pool "Seller"
  lane "Fulfillment"
    event start message "Order received" as b1
    task "Ship order" as b2

a1 -> a2
a2 ~> b1
b1 -> b2
```
`~>` is the `message` flow type (§5.1) — always the arrow for edges crossing between pools.

## 9. Worked examples

**Auto-layout with edge overrides:**
```
task "Apply fix" as f1
gateway exclusive "Fix successful?" as g1
task "Update incident record" as u1
task "Create problem record" as p1

f1 -> g1
g1 -> u1: "yes" [style: solid, corner: round]
g1 -> p1: "no" [from: bottom, to: left]
```

**Manual mode with pools:**
```
positioning: manual

pool "Order-to-Cash"
  lane "Sales"
    task "Review order" as t1 at (40, 40)
    gateway exclusive "Approved?" as g1 at (240, 50)
  lane "Fulfillment"
    task "Ship item" as t2 at (40, 40)

t1 -> g1
g1 -> t2 [style: dashed, from: bottom, to: top]
```

**Manual mode with nested subprocess:**
```
positioning: manual

subprocess "Handle payment" as sp1 at (40, 40)
  event start none "Sub start" as sn1 at (20, 40)
  task "Charge card" as sn2 at (100, 30)
  event end none "Sub end" as sn3 at (280, 40)
  sn1 -> sn2
  sn2 -> sn3

task "Send receipt" as t1 at (480, 70)
sp1 -> t1
```


**Full auto-layout diagram, no directives** — combining pools/lanes across two participants, every gateway/boundary-event pattern from §8, and a cross-pool message flow in one diagram:
```
pool "Order-to-Cash"
  lane "Sales"
    event start message "Order submitted" as s1
    task "Validate order" as s2
    gateway exclusive "Credit OK?" as s3
    task "Create sales order" as s4
    event end terminate "Rejected" as s5
  lane "Finance"
    task "Capture payment" as f1
    boundary timer interrupting "Payment timeout" as fb1 on f1
    task "Issue refund" as f2
  lane "Warehouse"
    gateway parallel "Split fulfillment" as w1
    task "Pick items" as w2
    task "Pack shipment" as w3
    gateway parallel "Join fulfillment" as w4
    task "Ship order" as w5
    event end none "Shipped" as w6
  s1 -> s2
  s2 -> s3
  s3 => s4: "yes"
  s3 ->> s5: "no"
  s4 -> f1
  f1 -> w1
  fb1 -> f2
  w1 -> w2
  w1 -> w3
  w2 -> w4
  w3 -> w4
  w4 -> w5
  w5 -> w6

pool "External Carrier"
  lane "Logistics"
    event start message "Booking request" as e1
    task "Allocate truck" as e2
  e1 -> e2

w5 ~> e1
```

**Manual text controls — via, size, labels, spacing:**
```
layoutSpacing: relaxed

task "Review application" as review size (180, 70) [label: inside, wrap: 3]
gateway exclusive "Approved?" as g1 [label: below]
task "Approve" as approve size (120, 50)
event end none "Done" as e1

review -> g1 [via: (240,75) (260,75), labelAt: 0.5, labelSide: above]
g1 -> approve: "yes" [labelAt: 0.35, labelSide: above]
approve -> e1
```
This combines `layoutSpacing:` (wider gaps), `size (w, h)` (custom node dimensions), node visual `[label: inside, wrap: 3]`, edge `via` waypoints, and edge label placement (`labelAt`, `labelSide`) — all in a single auto-layout diagram (no `positioning: manual` needed for these features). See `examples/manual-controls/` for more.

More canonical examples exercising every node/trigger/gateway kind: `packages/layout-core/test-utils/verificationDiagrams.ts` (`crowdedBoundary`, `nestedSubprocess`, `orderToCashStacked`, etc.) — useful for browsing the repo, but everything needed to generate a first-attempt-correct diagram is already above.

## 10. Designing for neat output at scale

Auto-layout is deterministic and guarantees non-overlapping, fully-routed geometry for any valid input — but "valid" and "visually neat" aren't the same thing, and the current engines have known rough edges worth designing around rather than discovering after the fact:

- **Large, densely cross-linked diagrams can show residual edge-edge crossings**, mostly from inter-pool message flows and dense same-lane content. Fewer, more direct flows render more cleanly than many crisscrossing shortcuts — don't add an edge the process doesn't actually need.
- **Lanes are sized from their own content.** A sparse lane no longer inherits the busiest lane's height, although channel gaps and dense cross-lane routing can still make a pool tall. Keep labels and lane content concise when presentation space matters.
- **Activity labels wrap at 3 lines**, and the box only widens up to the cap in §6.5's table before wrapping takes over. Keep labels to a short phrase (roughly 3–6 words) — a full sentence as a label will wrap or read awkwardly rather than growing the box indefinitely.
- **The documented BPMN legality subset is enforced at validate time.** Illegal category/trigger/gateway combinations, invalid cancel-boundary hosts, and non-association self-loops (§3.6) fail with `semanticErrors` — e.g. `event start terminate …` is syntactically valid but semantically rejected. Use `bpm validate` to catch these before render/export.

## 11. Pre-generation checklist

Whatever produced this text — human or AI, whichever model — verify all of the following before treating the output as final. Most first-attempt failures trace back to this list, not to unfamiliar grammar:

- [ ] Every nested line (pool → lane → node, or subprocess/transaction → children) is indented exactly 2 more spaces than its parent, spaces only, no tabs (§1).
- [ ] Every id referenced as an edge endpoint or in a boundary event's `on <hostId>` is declared with `as <id>` somewhere in the file, and every declared id is unique.
- [ ] If `positioning: manual` is set: every node except boundary events has `at (x, y)`, and coordinates were computed against §6.5's dimension table (and nested-subprocess padding rules) to avoid overlaps.
- [ ] If `positioning: manual` is **not** set: any `at (x, y)` pins that one node; omit it to leave the node auto-laid-out. Pins must not overlap auto-placed neighbors (§6.6).
- [ ] `layout:` and `positioning: manual` never both appear.
- [ ] No boundary event has `at (x, y)` — forbidden in both modes (§3.2).
- [ ] Edge arrows match intent: `->` normal flow, `=>` conditional branch, `->>` default branch, `~>` message (cross-pool), `..>` association (data/annotation link, not a flow) (§5.1).
- [ ] Labels are short phrases, not sentences (§10).
- [ ] If `layoutSpacing:` is used, it's one of `compact`, `normal`, `relaxed`, `spacious` (§2).
- [ ] Event category/trigger and gateway combinations obey BPMN 2.0 legality (§3.6) — run `bpm validate` and fix any `semanticErrors`.
- [ ] If `size (w, h)` is used, values are reasonable for the node kind — `validate` warns on undersized nodes (§5.4).

## 12. Related docs

- `docs/STATUS.md` — what's built and verified, including known limitations.
- `docs/maintainer/ROADMAP.md` — planned/deferred work.
- `docs/BPMN-GAP-SURVEY.md` — BPMN 2.0 expressiveness gaps vs current notation.
- CLI: `docs/CLI.md` — how to run and **separately verify** `npm run bpm -- validate|render|export` (agent self-check loop).
- `@bpm/validate` — scriptable self-check for generated diagram text (`validate(text)` → `{ valid, errors, semanticErrors, warnings, metrics }`).
- `docs/AI_REVIEW.md` — AI diagram review with pluggable providers (manual/ollama/openai).
- `examples/manual-controls/` — worked examples for via, size, labels, spacing presets.
- `docs/superpowers/specs/2026-08-10-manual-positioning-mode-design.md` — design rationale for §6 and §5.3.
- `docs/superpowers/plans/2026-08-10-manual-positioning-mode.md` — implementation plan (exact grammar source locations per feature).
