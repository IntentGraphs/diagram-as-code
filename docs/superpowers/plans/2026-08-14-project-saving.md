# Project-Based Diagram Saving — Implementation Plan

_Date: 2026-08-14._

**Goal:** Client-side multi-diagram projects as folders of `.bpm` files.

## Phase 1 — Manifest + file I/O (web)

| Step | Work |
|------|------|
| 1.1 | Add `apps/web/src/project/types.ts` — `ProjectManifest`, `ProjectDiagram` |
| 1.2 | `loadProjectFromHandle(dirHandle)` — scan or read `project.json` |
| 1.3 | Sidebar UI: diagram list, active tab, unsaved indicator |
| 1.4 | Save/load `.bpm` via File System Access API |
| 1.5 | E2e: open fixture project folder, switch diagrams, save round-trip |

## Phase 2 — CLI convenience

| Step | Work |
|------|------|
| 2.1 | `bpm validate --project ./my-process` — validate all diagrams |
| 2.2 | Optional `bpm project init` scaffolds `project.json` + `diagrams/` |

## Phase 3 — Polish

- Recent projects list (localStorage paths only, not contents)
- New diagram wizard (name → empty starter template from `docs/LANGUAGE.md`)

## Dependencies

- None on Camunda extensions or layout hardening
- Feature-gap survey G11 explicitly excludes diagram↔text sync

## Estimate

Phase 1: ~3–5 days. Phase 2: ~1 day.
