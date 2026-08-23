# AI DSL Repair — Implementation Plan

_Date: 2026-08-14._

**Goal:** Ship `@bpm/review` repair API + `bpm repair` CLI for text-only iterative fix when validation fails.

## Tasks

### 1. Core utilities — `@bpm/review`

- [x] `applyTextPatch` / `applyTextPatches` — unique substring replace
- [x] `RepairProvider` registry + `repairDiagram` loop
- [x] `manualRepairProvider` for CI-safe deterministic fixes

### 2. OpenAI provider

- [x] `createOpenAIRepairProvider` — text + errors in, JSON patches out

### 3. CLI

- [x] `bpm repair` command, `--provider`, `--max-attempts`
- [x] Tests in `packages/review/test/repair.test.ts`

### 4. Follow-up (not this PR)

- [ ] Wire web Review panel to offer repair when validate fails
- [ ] Ollama repair provider
- [ ] Export repaired text via `bpm repair -o fixed.bpm`

## Verification

```bash
npm test -- packages/review/test/repair.test.ts
npm run bpm -- repair packages/cli/test/fixtures/bad-syntax.bpm --provider manual
```
