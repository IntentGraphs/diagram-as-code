# AI DSL Repair — Design

_Date: 2026-08-14. Roadmap item 10. Companion plan: [`../plans/2026-08-14-ai-dsl-repair.md`](../plans/2026-08-14-ai-dsl-repair.md)._

## Problem

`@bpm/review` and the web Review panel require a rendered PNG. When `validate()` fails (parse error, layout error, legality violation), there is no image and no automated repair path — the highest-value case for agents generating `.bpm` text.

## Goal

Add a **text-only repair loop** in `@bpm/review`:

1. Run `validate(text)`.
2. If invalid, call a `RepairProvider` with source text + structured errors (no PNG).
3. Apply returned find/replace patches (same shape as web Review Apply/Skip).
4. Re-validate until valid or `--max-attempts` exhausted.

## API

```ts
export interface TextPatch { find: string; replace: string; }

export interface RepairProvider {
  readonly id: string;
  suggestRepairs(bundle: RepairBundle): Promise<RepairSuggestion[]>;
}

export function repairDiagram(text: string, options?: RepairDiagramOptions): Promise<RepairDiagramResult>;
export function applyTextPatch(text: string, patch: TextPatch): string | null;
```

## Providers

| id | Behavior |
|----|----------|
| `manual` | Deterministic pattern fixes for CI (e.g. `event start terminate` → `event end terminate`, typo `evnt` → `event`) |
| `openai` | Text-only GPT repair via `createOpenAIRepairProvider()` |

## CLI

`bpm repair diagram.bpm [--provider manual|openai] [--max-attempts 3]` → JSON with `repairedText`, `appliedPatches`, `validation`.

## Non-goals (v1)

- Auto-writing repaired text to disk without explicit caller action
- Web UI integration (follow-up; reuses same patch shape)
- Structural diagram synthesis (add/remove many nodes)

## Dependencies

Informed by feature-gap survey (G1–G13) and legality validation — repair targets parse/legality errors, not missing notation features.
