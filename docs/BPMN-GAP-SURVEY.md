# BPMN 2.0 Modeling Feature Gap Survey

_Survey date: 2026-08-14; documentation sync: 2026-08-20. This is a historical expressiveness audit, not a live implementation inventory. Use `docs/LANGUAGE.md` and `docs/STATUS.md` for current syntax and shipped behavior. The audit baseline was verified against `packages/parser`, `packages/ast`, and `packages/export-xml`; no implementation was performed in the original survey pass._

## Executive summary

This tool covers **BPMN 2.0 collaboration/process diagramming at the shape-and-control-flow level** well: events (by trigger icon), gateways, generic and specialized task types, subprocesses/transactions/call activities, pools/lanes, sequence/conditional/default/message/association flows, and core artifacts. That is enough to sketch most **intra- and inter-participant control-flow** diagrams.

It does **not** cover large parts of BPMN 2.0 **semantic richness**: intermediate throw events, event-definition payloads (timer cycles, message refs, error codes), loop/multi-instance/ad-hoc markers, compensation wiring, data I/O on activities, global item definitions, conversation/choreography diagrams, and execution-oriented attributes. Export emits structurally valid XML for what is modeled, often with **empty placeholder** event definitions.

**Highest-impact gaps for real processes** (see §5): timer/conditional/message definition detail, intermediate throw events, multi-instance loops, compensation flows, inclusive/complex gateway condition semantics, black-box participants, and directed data associations.

Full gap catalog: **§4** (one entry per audited BPMN category). Suggested future roadmap one-liners: **§6**.

---

## 1. Methodology

1. Read `docs/STATUS.md` § "Notation coverage" as the **claimed** baseline.
2. Verify each claim against `docs/LANGUAGE.md` and source (`parser.ts`, `types.ts`, `export-xml`, `bpmnLegality.ts`).
3. Audit BPMN 2.0.2 element categories from the spec's metamodel (FlowElements, ConnectingObjects, Swimlanes, Artifacts, Choreography/Conversation, ItemDefinitions, execution attributes).
4. For each gap: spec reference, support status, concrete blocked example, priority (P0–P3), implementation cost (S/M/L/XL).

**Priority key**

| | Meaning |
|---|---|
| **P0** | Blocks modeling common real-world processes today |
| **P1** | Important for enterprise / engine-ready BPMN |
| **P2** | Spec completeness; niche but legitimate BPMN |
| **P3** | Rare; alternate diagram types or meta-model edge cases |

**Cost key:** **S** = parser+render+export only; **M** = +layout/validate; **L** = cross-cutting language design; **XL** = new diagram type or major metamodel extension.

---

## 2. Historical STATUS.md accuracy audit

These are discrepancies between **what STATUS.md claimed** (before this survey) and **what LANGUAGE.md / the parser actually support**. STATUS.md is corrected in the same doc pass; details here for audit trail.

| STATUS.md claim | Actual support (LANGUAGE.md / code) | Verdict |
|---|---|---|
| Intro: "full BPMN 2.0 **semantics**" | Shape-level triggers and flow types; almost no event-definition payloads, no loops, no execution attributes | **Overstated** — "BPMN 2.0 **notation**" is accurate; "semantics" is not |
| "Milestone 2, **full BPMN 2.0 element set**" | Covers core FlowElements + collaboration pools/lanes + 4 artifact kinds; missing throw events, choreography/conversation, data I/O, loop markers, global definitions | **Overstated** — "core process/collaboration **notation**" is accurate |
| "All 13 event triggers … across start/intermediate/end/boundary" | Parser accepts triggers per category; validate enforces BPMN legality (§3.6). **No** separate intermediate **throw** category; export always uses `intermediateCatchEvent` for `event intermediate …` | **Partially accurate** — triggers yes; throw/catch distinction and definition payloads no |
| "All 5 gateway types" | All five parse and render | **Accurate** (shape level) |
| "Tasks, sub-processes … call activities, collapsed/expanded" | Generic `task`, all documented BPMN task subtypes, subprocess/transaction/callActivity supported | **Accurate for the documented notation subset**; task subtype support shipped on 2026-08-14 |
| "All 5 flow types … styled distinctly" | `->`, `=>`, `->>`, `~>`, `..>` map to sequence, conditional, default, message, association | **Accurate** |
| "Pools and lanes" | Multi-pool collaboration works (`LANGUAGE.md` §8 cross-pool example); empty pool shells parse, but process nodes must be inside lanes; no nested lanes or black-box participant semantics | **Partially accurate** — multi-pool **supported**; pool/lane **variants** remain missing |

**Not a STATUS error but worth noting:** `docs/LANGUAGE.md` is the accurate, parser-verified reference. STATUS should defer to it for coverage claims.

---

## 3. Current baseline (confirmed supported)

Use this as the **floor** when reading gaps below.

| BPMN area | Supported in text DSL today |
|---|---|
| **Events** | `event start\|intermediate\|end <trigger>`; `boundary <trigger> interrupting\|nonInterrupting … on <host>`; 13 triggers; legality rules in `LANGUAGE.md` §3.6 |
| **Gateways** | `exclusive`, `parallel`, `inclusive`, `complex`, `eventBased` |
| **Activities** | `task`, `userTask`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `businessRuleTask`, `scriptTask`, `subprocess`, `transaction`, `callActivity`; `collapsed`; nested subprocess/transaction children |
| **Flows** | Sequence, conditional (`=>` + label), default (`->>`), message (`~>`), association (`..>`); edge attribute block (§5.3) |
| **Collaboration** | Multiple top-level `pool` / `lane` blocks; cross-pool message flows; export as `bpmn2:collaboration` + per-pool `process` |
| **Artifacts** | `dataObject`, `dataStore`, `annotation`, `group` |
| **Layout / export** | Auto swimlane/flat; manual positioning; BPMN XML + DI export; conditional edge label → `conditionExpression` in XML |

---

## 4. Gap catalog

Each row is one audited BPMN concept. **Status:** **none** = not representable; **partial** = shape or workaround only; **workaround** = related feature covers some cases.

### 4.1 Activities — Task types (BPMN 2.0 §10.2)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost | Roadmap one-liner (§6) |
|---|---|---|---|---|---|---|
| **User Task** | §10.2.2 / Table 10.50 | **supported** | `userTask "Approve" as u1` — marker + `bpmn:userTask` export (2026-08-14) | — | — | (shipped) |
| **Service Task** | §10.2.3 / Table 10.51 | **supported** | `serviceTask` keyword | — | — | (shipped) |
| **Send Task** | §10.2.4 | **supported** | `sendTask` keyword | — | — | (shipped) |
| **Receive Task** | §10.2.5 | **supported** | `receiveTask` keyword; legal event-based gateway target | — | — | (shipped) |
| **Manual Task** | §10.2.6 | **supported** | `manualTask` keyword | — | — | (shipped) |
| **Business Rule Task** | §10.2.7 | **supported** | `businessRuleTask` keyword | — | — | (shipped) |
| **Script Task** | §10.2.8 | **supported** | `scriptTask` keyword | — | — | (shipped) |
| **Abstract / undifferentiated Task** | §10.2.1 | **partial** | Generic `task` maps to `bpmn:task` — OK for abstract modeling | — | — | (baseline) |

### 4.2 Activities — Sub-process & call behavior (§10.2.9–§10.2.13)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Expanded / collapsed SubProcess** | §10.2.13 | **partial** | Nested content works; no triggered-by-event subprocess | — | — |
| **Event SubProcess** | §10.2.13 / §10.4.6 | **none** | SLA escalation subprocess triggered by timer start inside parent | P1 | L | — |
| **Ad-hoc SubProcess** | §10.2.13 (adHoc) | **none** | Knowledge-worker case where steps run in any order until completion | P2 | L | — |
| **Transaction** | §10.2.13 | **partial** | Double border + cancel boundary on transaction host; no full ACID/compensation protocol modeling | P1 | L | — |
| **Call Activity (`calledElement`)** | §10.2.9 | **partial** | Thick border only; cannot reference reusable process definition by id | P1 | M | — |
| **Global Task** | §10.2.10 | **none** | Shared task definition reused across processes | P3 | L | — |

### 4.3 Activities — Loop & multi-instance (§10.2.14–§10.2.15)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Standard loop** (`loopCharacteristics`) | §10.2.14 | **none** | "Retry invoice until paid" loop on same task | P0 | M | — |
| **Multi-instance parallel** | §10.2.15 | **none** | "Approve by any 3 of 5 committee members" (parallel MI) | P0 | L | — |
| **Multi-instance sequential** | §10.2.15 | **none** | Sequential approval chain as one task with MI sequential | P1 | L | — |
| **Loop input collection / cardinality** | §10.2.15 | **none** | For-each order line item in one subprocess | P1 | L | — |
| **Activity `isForCompensation`** | §10.2.1 | **none** | Dedicated compensation handler task linked to compensated activity | P1 | M | — |

### 4.4 Events — Categories & throw/catch (§10.5)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Start / End / Intermediate Catch** (by trigger) | Tables 10.84–10.89 | **partial** | Triggers and icons work; definition bodies empty in export | — | — |
| **Intermediate Throw Events** | §10.5.4 / Table 10.89 | **none** | `intermediateThrowEvent` for signal/message escalation mid-flow — all `event intermediate` export as **catch** | P0 | M | — |
| **Implicit vs explicit throw on End** | §10.5.3 | **partial** | End events render as throw (filled icon) but no throw payload | — | — |
| **Event SubProcess start triggers** | §10.4.6 | **none** | Non-interrupting timer start inside embedded subprocess | P1 | L | — |
| **Multiple / ParallelMultiple composition** | §10.5.1 | **partial** | Trigger token exists; export uses placeholder `messageEventDefinition` (`export-xml/eventDefinitions.ts`) | P2 | M | — |

### 4.5 Event definitions — Payloads (§10.5.1, ItemDefinitions §13)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Timer: timeDate / timeDuration / timeCycle** | §10.5.1.3 | **none** | "Wait 48 hours" or cron `0 0 * * *` on boundary timer — icon only | P0 | M | — |
| **Conditional: conditionExpression** | §10.5.1.4 | **none** | Intermediate conditional catch on `order.total > 10000` without a gateway | P1 | M | — |
| **Message: messageRef / operationRef** | §10.5.1.2 | **none** | Distinguish `OrderCreated` vs `OrderCancelled` message at model level | P0 | M | — |
| **Signal: signalRef** | §10.5.1.5 | **none** | Broadcast "InventoryUpdated" to multiple catching activities | P1 | M | — |
| **Error: errorRef / errorCode** | §10.5.1.6 | **none** | Catch `PaymentDeclined` vs generic error boundary | P1 | M | — |
| **Escalation: escalationRef** | §10.5.1.7 | **none** | L2 support escalation code on boundary | P2 | M | — |
| **Link: name (throw/catch pair)** | §10.5.1.8 | **none** | Off-page link between distant diagram areas | P2 | S | — |
| **Compensate: activityRef** | §10.5.1.9 | **none** | Boundary compensation → specific handler activity | P1 | M | — |
| **Cancel / Terminate definition detail** | §10.5.1 | **partial** | Structural triggers only | P2 | S | — |

### 4.6 Gateways (§10.6)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Exclusive (XOR) fork/join** | §10.6.2 | **partial** | Modeled; no validate for XOR join balance | P2 | M | — |
| **Parallel fork/join** | §10.6.3 | **partial** | Modeled; no validate for sync join semantics | P2 | M | — |
| **Inclusive (OR) gateway** | §10.6.4 | **partial** | Shape + `=>` labels; no per-flow inclusive condition set or OR-join semantics | P1 | L | — |
| **Complex gateway** | §10.6.5 | **partial** | Diamond only; no activation condition expressions | P2 | L | — |
| **Event-based gateway** | §10.6.6 | **partial** | Shape + validate targets intermediate catch **or receiveTask** | P1 | M | — |
| **Default sequence flow on gateway** | §10.6.2 | **partial** | `->>` works visually and in export (`default` attr) | — | — |

### 4.7 Sequence flows & conditions (§10.6.2, §10.6.4)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Sequence flow conditionExpression** | §10.6.2 | **partial** | Edge label on `=>` exported as formalExpression; not on plain `->` | — | — |
| **Formal expression language URI** | §10.6.2 | **none** | FEEL/XPath language indicator on conditions | P3 | S | — |
| **Sequence flow across subprocess boundary rules** | §10.4 | **partial** | Nested flows work; no validate for illegal boundary crossing | P2 | M | — |

### 4.8 Connecting objects — Message & association (§10.3)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Message flow** | §10.3.2 | **partial** | `~>` cross-pool works; no `messageRef`, no validate that endpoints are in different pools / message-appropriate | P1 | M | — |
| **Sequence flow inside pool only** | §10.3.1 | **partial** | Cross-pool `->` not forbidden by validate — illegal BPMN possible | P2 | M | — |
| **Association (undirected)** | §10.3.3 | **partial** | `..>` for data/annotation links | — | — |
| **Directed association (DataInputAssociation / DataOutputAssociation)** | §10.3.3 / §10.2 | **none** | Explicit data input/output wiring to task pins | P1 | L | — |
| **Association: data store persistent ref** | §10.3.3 | **partial** | Visual link only; no `dataStoreRef` on activity | P2 | M | — |

### 4.9 Swimlanes & collaboration (§11.1–§11.2)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Multiple pools (participants)** | §11.1 | **workaround** | Supported — `LANGUAGE.md` §8 cross-pool example | — | — |
| **Message flow between participants** | §11.2 | **workaround** | `~>` between pools | — | — |
| **Single pool, multiple lanes** | §11.1 | **supported** | Core swimlane layout | — | — |
| **Nested lanes** | §11.1 | **none** | Department → team hierarchy in one pool | P2 | L | — |
| **Black-box participant (empty pool)** | §11.1 | **none** | External partner shown without exposing internal flow | P1 | M | — |
| **Nodes directly inside pool without lanes** | §11.1 | **none** | Empty pools parse as shells, but node declarations directly under a pool are not supported; use a `lane` wrapper | P2 | M | — |
| **Participant multiplicity** | §11.1 | **none** | "Two carriers bid in parallel" participant multiplicity | P3 | L | — |
| **Lane as resource / role semantics** | §11.1 | **none** | Lane is layout-only; no `humanPerformer` / `potentialOwner` | P2 | L | — |

### 4.10 Artifacts (§10.7)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Data Object** | §10.7.1 | **partial** | Shape + label; no state, collection, or item definition | P2 | M | — |
| **Data Object collection / multiple** | §10.7.1 | **none** | Collection of invoices vs single invoice | P2 | M | — |
| **Data Store** | §10.7.2 | **partial** | Shape + label; no global store reference id | P2 | M | — |
| **Text Annotation** | §10.7.3 | **partial** | Supported | — | — |
| **Group (category)** | §10.7.4 | **partial** | Visual bracket; `categoryValueRef` not modeled | P3 | S | — |
| **Image / other artifact extensions** | vendor | **none** | Custom stencil artifacts in Signavio | P3 | — | — |

### 4.11 Data modeling on activities (§10.2, §10.7)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **DataInput / DataOutput on Activity** | §10.2.1 | **none** | Task inputs/outputs in execution semantics | P1 | L | — |
| **InputSet / OutputSet** | §10.2.1 | **none** | Required vs optional data for task completion | P3 | XL | — |
| **Property / extensionElements on any element** | §14 | **partial** | Camunda `formKey` / service-task `class`/`expression` via opt-in `[camundaFormKey]` / `[camundaClass]` / `[camundaExpression]` (2026-08-14). Other custom attrs still none | P1 | M | — |
| **IOSpecification** | §10.2.1 | **none** | Machine-readable data interface for service tasks | P2 | L | — |

### 4.12 Item definitions & global elements (§13)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Message definition** | §13.2 | **none** | Shared message catalog across diagrams | P0 | M | — |
| **Signal / Error / Escalation definitions** | §13 | **none** | Central signal dictionary | P1 | M | — |
| **Interface / Operation** | §13.3 | **none** | WSDL-style service interface on send/receive | P2 | L | — |
| **Global conversation / choreography** | §13.4–§13.5 | **none** | See §4.13 | P3 | XL | — |

### 4.13 Alternate diagram types (BPMN 2.0 Part II)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Conversation diagram** | §12.1 | **none** | C-level view of message exchange between partners without task detail | P3 | XL | — |
| **Choreography diagram** | §12.2 | **none** | B2B choreography: who sends what when (no internal process) | P3 | XL | — |
| **Case / CMMN** | separate spec | **none** | Out of BPMN scope | — | — | — |

### 4.14 Execution & deployment semantics (§15, vendor)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **`isExecutable` / process executable flag** | §10.1 | **partial** | Export sets `isExecutable="false"` on processes | P2 | S | — |
| **Job/async, job priority** | vendor | **none** | Camunda async before/after on service task | P1 | M | — |
| **Listener (execution/task)** | vendor | **none** | Task create listener for audit | P2 | L | — |
| **Form key / I/O binding (Camunda)** | vendor | **partial** | `camundaFormKey` on `userTask`; `camundaClass` / `camundaExpression` on `serviceTask` — shipped 2026-08-14. Assignee, async, delegateExpression still none | P1 | M | — |
| **Process variables / expressions** | vendor | **none** | `${amount}` in gateway condition | P1 | L | — |

### 4.15 Compensation & transactions (§10.4.6, §10.6.7)

| BPMN concept | Spec ref | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|---|
| **Compensation boundary → handler flow** | §10.6.7 | **partial** | `compensation` trigger exists; no handler link or throw compensation event | P1 | L | — |
| **Compensation end / throw** | §10.5 | **none** | Explicit compensation throw after rollback decision | P1 | M | — |
| **Transaction rollback protocol** | §10.2.13 | **partial** | Cancel boundary on transaction validated; no full cancel/rollback graph | P1 | L | — |

### 4.16 Interchange & tooling (not BPMN metamodel, but expressiveness)

| Concept | Status | Blocked example | Priority | Cost |
|---|---|---|---|---|
| **BPMN XML import → text** | **none** | Open external `.bpmn` in text editor | P1 | XL | — |
| **Text ↔ Diagram mode round-trip** | **none** | Edit in bpmn-js, sync to `.bpm` source | P2 | XL | — |
| **Validate cross-pool sequence flow** | **none** | Accidental `->` between pools passes today | P2 | S | — |

---

## 5. Priority summary (top gaps)

| Rank | Gap | Why it matters |
|---|---|---|
| 1 | ~~BPMN task subtypes~~ | **Shipped 2026-08-14** — see `docs/LANGUAGE.md` §3.4 |
| 2 | Message / timer / conditional **definition payloads** | Without them, events are decorative; engines and B2B specs need the data |
| 3 | Intermediate **throw** events | Common for signal/message emission mid-process |
| 4 | Multi-instance & standard **loops** | Approvals, batch processing, retries |
| 5 | **Compensation** wiring | Order cancel / payment refund flows in transactional BPMN |
| 6 | **Inclusive/complex** gateway semantics | Real branching logic beyond XOR labels |
| 7 | **Black-box participant** pools | Partner modeling without internal detail |
| 8 | **Data I/O associations** on tasks | Data-centric process notation |
| 9 | Global **message/signal/error** definitions | Reuse and engine deployment |

---

## 6. Suggested roadmap one-liners

Paste-ready entries for future numbered roadmap items (not scoped here):

1. ~~**BPMN task subtypes in text DSL**~~ — **Done 2026-08-14**: `userTask`, `serviceTask`, `sendTask`, `receiveTask`, `manualTask`, `businessRuleTask`, `scriptTask` + generic `task`; markers in `@bpm/render`, export tags in `@bpm/export-xml`.
2. **Event definition payloads** — timer duration/cycle/date, conditional expression, and message/signal/error refs on events; export populated ItemDefinition refs.
3. **Intermediate throw events** — separate throw vs catch intermediate events in grammar, render, export, and legality rules.
4. **Loop and multi-instance characteristics** — standard loop plus parallel/sequential MI with cardinality or collection on activities.
5. **Compensation flow modeling** — compensation handler tasks, associations, and throw compensation events wired to BPMN 2.0 compensation semantics.
6. **Inclusive and complex gateway conditions** — per-outgoing-flow condition sets and validation for OR/complex join behavior.
7. **Black-box and laneless pool variants** — participant with no expanded process, or pool containing nodes without mandatory lane wrapper.
8. **Directed data associations and activity data I/O** — data input/output associations from data objects/stores to task boundaries.
9. **Global message/signal/error catalog** — top-level or inline definition blocks referenced by events and message flows.
10. **Cross-pool flow validation** — semanticErrors for sequence flows across pool boundaries; require `~>` for inter-participant communication.
11. ~~**Receive task as event-based gateway target**~~ — **Done 2026-08-14**: `bpmnLegality` allows `receiveTask` targets (Table 10.127).
12. **Call activity calledElement reference** — bind call activities to named reusable process definitions in export.

---

## 7. Related docs

- `docs/LANGUAGE.md` — authoritative **current** text notation
- `docs/STATUS.md` — project status (notation claims corrected post-survey)
- `docs/maintainer/ROADMAP.md` item 5 — survey complete; items above become candidates for new entries
- `packages/parser/src/bpmnLegality.ts` — structural rules already enforced
- `packages/export-xml/src/eventDefinitions.ts` — placeholder definition export behavior
