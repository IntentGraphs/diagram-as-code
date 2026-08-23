# Project-Based Diagram Saving — Design

_Date: 2026-08-14. Roadmap item 4. Scope informed by [feature-gap survey](./2026-08-14-bpmn-feature-gap-survey.md)._

## Problem

Diagrams live in a single editor tab. Persistence is manual (copy text, export SVG/XML). No multi-diagram workspace, no reload of `.bpm` source, no history.

## Goal (v1)

A **project** is a folder the user opens in the web app (or CLI `--project` root):

```
my-process/
  project.json          # manifest (optional v1 — can infer from tree)
  diagrams/
    order-to-cash.bpm   # text pipeline diagrams
    exceptions.bpm
  models/               # optional: Diagram-mode-only .bpmn files
    legacy-import.bpmn
```

No backend required for v1 — `File System Access API` in browser or local folder via CLI/Electron later.

## Manifest (`project.json`)

```json
{
  "name": "Order to Cash",
  "version": 1,
  "defaultDiagram": "diagrams/order-to-cash.bpm",
  "diagrams": [
    { "path": "diagrams/order-to-cash.bpm", "title": "Order to Cash" },
    { "path": "diagrams/exceptions.bpm", "title": "Exception Handling" }
  ]
}
```

## UX (web)

1. **Open Project** — pick folder; sidebar lists diagrams from manifest or `**/*.bpm` scan.
2. **New Diagram** — creates `diagrams/<slug>.bpm`, opens in text editor.
3. **Save** — writes current tab back to disk (debounced auto-save optional).
4. **Diagram mode** — `.bpmn` entries open in bpmn-js; still not round-tripped to text.

## Non-goals (v1)

- Git integration / branching
- Cloud sync or multi-user
- Text ↔ Diagram mode sync
- Import of external BPMN into text (see gap G10)

## Security

- Browser: only user-granted folder handles; no upload without explicit action.
- Validate size limits (`@bpm/validate` caps) before loading.

## Open questions

- Single-file "project" (one `.bpm` without folder) as degenerate case?
- Whether `project.json` is required or optional with convention-over-configuration.
