# BPMN 2.0 Feature Gap Survey

_Date: 2026-08-14. Roadmap item 5 (expressiveness audit). Informs scope for project saving, Camunda extensions, and future notation work._

## Method

Compared BPMN 2.0 semantic model categories against what `@bpm/parser` + `@bpm/ast` can express today (see `docs/STATUS.md` notation coverage and `docs/LANGUAGE.md`). Each gap is rated **P0** (blocks real processes), **P1** (common in production), **P2** (nice-to-have / niche).

## Covered today (baseline)

| Category | Coverage |
|----------|----------|
| Events | All 13 triggers × start/intermediate/end/boundary; interrupting vs non-interrupting boundary |
| Gateways | exclusive, parallel, inclusive, complex, eventBased |
| Activities | task, subProcess, transaction, callActivity; nested to arbitrary depth; collapsed/expanded |
| Artifacts | dataObject, dataStore, textAnnotation, group |
| Flows | sequence, conditional, default, message, association |
| Pools/lanes | Single-pool multi-lane; multiple pools with message flows |
| Layout | swimlane / flat engines; manual positioning; per-edge style/anchor overrides |
| Export | BPMN 2.0 XML + BPMNDI (bpmn-js round-trip verified) |

## Prioritized gaps

### P0 — Cannot model at all

| # | Gap | Notes | Suggested roadmap entry |
|---|-----|-------|-------------------------|
| G1 | **Multiple independent pools with full collaboration semantics** | Multiple pools render, but there is no first-class `participant` / `messageFlow` declaration syntax beyond `~>` edges; no correlation keys, no envelope payload typing | `collaboration-syntax` |
| G2 | **Event subprocess (global / local)** | No `event subprocess` keyword; interrupting/non-interrupting event subprocess containers missing | `event-subprocess` |
| G3 | **Ad-hoc subprocess** | No ad-hoc marker or ordering semantics | `ad-hoc-subprocess` |
| G4 | **Loop / multi-instance markers on activities** | No `loop`, `parallel multiInstance`, `sequential multiInstance` in text | `activity-loop-markers` |

### P1 — Common in Camunda / Signavio deployments

| # | Gap | Notes | Suggested roadmap entry |
|---|-----|-------|-------------------------|
| G5 | **Conditional / timer expression bodies** | Triggers accepted (`conditional`, `timer`) but no expression text (`condition`, `timeDuration`, `timeCycle`) | Covered by Camunda extension plan |
| G6 | **Service task implementation** | No `camunda:class`, `camunda:delegateExpression`, `camunda:expression` | Covered by Camunda extension plan |
| G7 | **Form keys and input/output mappings** | No form metadata on user tasks | Covered by Camunda extension plan |
| G8 | **Script / business rule / send / receive task types** | All activities are generic `task` | `specialized-task-types` |
| G9 | **Lane set across multiple pools** | Lanes are per-pool only | `cross-pool-lanes` |

### P2 — Lower priority / visual-only

| # | Gap | Notes | Suggested roadmap entry |
|---|-----|-------|-------------------------|
| G10 | **BPMN XML import** | Export only; cannot open external `.bpmn` in text pipeline | `xml-import` |
| G11 | **Diagram ↔ text round-trip** | Diagram mode and text mode are independent | Explicitly not planned (see ROADMAP) |
| G12 | **Richer artifact set** | No image, no sequence-flow annotation beyond textAnnotation | `extended-artifacts` |
| G13 | **Pixel-accurate BPMN icon pack** | Simplified geometric icons today | Partially addressed in this work package (icon improvements) |

## Impact on downstream items (this work package)

| Item | Scope decision |
|------|----------------|
| **Legality validation** | Enforce BPMN category×trigger table only; do not block G1–G4 gaps (they are unexpressible, not illegal syntax) |
| **Project saving** | Design for folder of `.bpm` files + optional `.bpmn` from Diagram mode; no backend required for v1 |
| **Camunda extensions** | Phase 1: service-task implementation + formKey on user tasks; defer I/O mappings to phase 2 |
| **Layout hardening** | Unchanged — deferred boundary-routing gaps are layout-only, independent of notation gaps |
| **Icon rendering** | Improve message/timer/error/escalation/cancel/compensation glyphs; defer full icon-pack parity |

## Recommended next implementation order (post this PR)

1. BPMN legality validation (done in this PR)
2. Camunda extension phase 1 (service task + formKey)
3. Activity loop / multi-instance markers (G4)
4. Event subprocess (G2)
5. Collaboration / message-flow syntax (G1)

## Verification

This survey is referenced by tests in `packages/parser/test/feature-gap-survey.test.ts` (doc presence + required gap IDs).
