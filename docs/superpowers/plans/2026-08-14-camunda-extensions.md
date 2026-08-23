# Camunda Extension Attributes — Implementation Plan

_Date: 2026-08-14._

**Goal:** Phase 1 Camunda export attributes from `.bpm` text.

## Task breakdown

### 1. AST + parser

| Step | File | Change |
|------|------|--------|
| 1.1 | `@bpm/ast` | `extensions?: 'camunda'` on `Diagram`; optional `camunda?: Record<string, string>` on activities/events/gateways |
| 1.2 | `@bpm/parser` | Parse `extensions: camunda` directive; `camunda:key=value` in existing `[...]` blocks |
| 1.3 | Tests | `packages/parser/test/camunda-attrs.test.ts` (parse only, export in export-xml) |

### 2. Export

| Step | File | Change |
|------|------|--------|
| 2.1 | `@bpm/export-xml` | Emit `xmlns:camunda`; map task attrs; timer/conditional definitions when present |
| 2.2 | Tests | Round-trip fixture through bpmn-js importer; assert `camunda:class` survives |

### 3. Docs

- `docs/LANGUAGE.md` § extensions
- `docs/STATUS.md` Camunda deployment note

## Verification

```bash
npm test -- packages/parser/test/camunda-attrs.test.ts packages/export-xml/test/camunda-export.test.ts
```

## Order relative to other work

After legality validation (this PR). Independent of project saving and layout hardening.

## Estimate

Phase 1: ~2–3 days.
