# BPMN Legality Validation — Design

_Date: 2026-08-14. Roadmap item 1. Implemented in `@bpm/parser`._

## Problem

Parser accepted any category × trigger combination structurally. Real BPMN restricts which event definitions attach to start, intermediate, end, and boundary events.

## Rule table

Enforced in `packages/parser/src/legality.ts` via `checkEventTriggerLegality()`:

| Category | Allowed triggers |
|----------|------------------|
| start | none, message, timer, conditional, signal, multiple, parallelMultiple, error, escalation |
| intermediate | none, message, timer, error, escalation, conditional, link, signal, multiple, parallelMultiple, compensation |
| end | none, message, error, escalation, cancel, compensation, signal, multiple, parallelMultiple, terminate |
| boundary | message, timer, error, escalation, cancel, compensation, conditional, signal, multiple, parallelMultiple |

## Error shape

Reuses existing `{ line, column, message }` parse errors — e.g.:

```
Trigger "terminate" is not valid on a start event in BPMN — allowed: none, message, ...
```

## Non-goals (v1)

- Graph-level rules (e.g. "every flow must have exactly one start")
- Gateway combination semantics
- Flow-type legality (message flow must cross pools)

## Tests

`packages/parser/test/legality.test.ts`
