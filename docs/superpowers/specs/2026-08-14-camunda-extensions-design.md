# Camunda Extension Attributes — Design

_Date: 2026-08-14. Roadmap item 6. Prioritized by [feature-gap survey](./2026-08-14-bpmn-feature-gap-survey.md) G5–G7._

## Problem

`@bpm/export-xml` produces spec-compliant BPMN 2.0 XML that opens in Camunda Modeler, but lacks `camunda:` namespace attributes needed for **deployment** (service implementation, forms, async, I/O).

## Goal

Express a minimal Camunda deployment surface in `.bpm` text without polluting core notation for non-Camunda users.

## Syntax (proposed)

Opt-in diagram directive:

```
extensions: camunda
```

Task-level attribute block (extends existing `[...]` pattern):

```
task "Approve" as t1 [camunda:formKey=order-approval]
task "Charge" as t2 [camunda:class=com.example.ChargeDelegate, camunda:asyncBefore=true]
task "Notify" as t3 [camunda:expression=${mailService.send(order)}]
```

Timer/conditional bodies (gap G5):

```
event start timer "Daily" as s1 [camunda:timeCycle=0 0 12 * * ?]
gateway exclusive "OK?" as g1 [camunda:condition=${amount > 1000}]
```

## Export mapping

| Text attribute | XML |
|----------------|-----|
| `camunda:formKey` | `camunda:formKey` on `bpmn:userTask` |
| `camunda:class` | `camunda:class` on `bpmn:serviceTask` |
| `camunda:delegateExpression` | `camunda:delegateExpression` |
| `camunda:expression` | `camunda:expression` |
| `camunda:asyncBefore` / `asyncAfter` | same |
| `camunda:timeDuration` / `timeCycle` | under `bpmn:timerEventDefinition` etc. |

Namespace declaration on `<bpmn:definitions>`:

```xml
xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
```

## Phase scope

**Phase 1 (first implementation):** `extensions: camunda` directive; service-task `class`/`expression`/`delegateExpression`; user-task `formKey`; export-only (no import).

**Phase 2:** I/O mappings (`camunda:inputOutput`), job retry, execution listeners.

**Phase 3:** DMN/CMMN links — out of scope.

## Validation

- Unknown `camunda:*` keys → parse warning, not error
- Attributes ignored in export when `extensions: camunda` absent

## Non-goals

- Camunda REST deployment CLI
- Signavio-specific extensions (separate vendor block if needed later)
