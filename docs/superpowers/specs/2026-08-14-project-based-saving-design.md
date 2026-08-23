# Project-Based Diagram Saving — Design

## Purpose

Give the web editor a **persistent project model** so text-DSL diagrams survive browser reloads and can be organized as named diagrams inside a named project — without requiring the user to manually export files or keep text in an external note. Today, Text mode is a single in-memory textarea (`apps/web/src/main.ts` seeds `STARTER_TEXT` on every load); Diagram mode can Open/Save only via **file download** (`diagramSaveBtn` → `downloadFile('diagram.bpmn', …)`), with no reload survival.

This is scoped as its own design pass (roadmap item 4) before any implementation, per the project's established process.

## Background

**What exists today**

| Concern | Text mode | Diagram mode (`bpmn-js`) |
|---|---|---|
| Source persistence | None — reload resets to starter text | None — reload loses canvas |
| Save | Export SVG / BPMN XML only (derived artifacts) | "Save" = download `.bpmn` file |
| Open | None (paste / Clear) | File picker → import XML |
| Multi-diagram | Single tab | Single canvas |
| localStorage usage | UI prefs only (engine override, splitter width, review settings) | — |

Text and Diagram mode remain **independent authoring paths** (roadmap: no text ↔ diagram round-trip). Project saving must respect that boundary in v1.

## Scoping decisions (explicit)

### 1. What is a "project"?

A **project** is a **named, client-side container** for one or more **diagram records**, each with its own id, display name, source kind, and body text.

- **v1 storage:** browser **IndexedDB** (via a thin wrapper — e.g. `idb-keyval` or native IDB). Not the filesystem, not `localStorage` (size limits, no structured multi-key queries).
- **Not** "a folder of `.bpm` files on disk" in v1. That maps to a **deferred** "Open project folder" / sync story (File System Access API or a future backend). v1 optimizes for **reload survival in the hosted web app** with zero server.
- **On-disk interchange (optional v1.1):** export/import a project as a single `.bpm-project.json` (manifest + diagrams) for backup/portability — not required for the smallest v1 slice.

**Project record (manifest)**

```ts
interface Project {
  id: string;           // uuid
  name: string;         // user-visible, e.g. "Order-to-Cash"
  createdAt: string;    // ISO-8601
  updatedAt: string;
  activeDiagramId: string | null;
}
```

**Diagram record**

```ts
type DiagramKind = 'text';  // v1 only — see Diagram mode decision below

interface StoredDiagram {
  id: string;
  projectId: string;
  name: string;         // e.g. "main", "subprocess-detail"
  kind: DiagramKind;
  body: string;         // raw `.bpm` source for kind === 'text'
  createdAt: string;
  updatedAt: string;
}
```

Default bootstrap on first visit: one project `"Untitled project"` with one diagram `"main"` containing today's starter text (or empty), so existing users aren't blocked.

### 2. Does v1 cover Diagram mode `.bpmn` files?

**No — explicitly out of scope for v1.**

| | In v1 | Deferred |
|---|---|---|
| Text DSL (`.bpm` source) | ✅ create / save / reload / rename / delete | — |
| Diagram mode BPMN XML | ❌ | v2+ after roadmap item 12 (Diagram mode corruption investigation) |

**Rationale**

- Diagram mode edits **BPMN XML + DI**, not `.bpm` text; storing it in the same project store is doable but couples persistence to a separate, currently error-prone path.
- Text and Diagram mode don't sync; persisting both without clear UX ("which is canonical?") creates false expectations.
- Diagram mode keeps today's **Open file / Save download** workflow unchanged in v1.

**v2 note (not v1):** add `kind: 'diagram'` with `body` = BPMN XML string, plus a project-level flag or separate list — only after Diagram mode export quality is gated.

### 3. Single-diagram vs multi-diagram per project?

**Multi-diagram per project in v1**, with a **minimal sidebar** (or toolbar dropdown) listing diagrams in the active project.

- Minimum UX: **New diagram**, **Rename**, **Delete** (with confirm), **Switch active diagram**.
- One **active diagram** drives the textarea; switching saves the outgoing diagram (if dirty) then loads the incoming body.
- v1 does **not** require nested folders, tags, or search — flat list only.
- A project always has ≥1 diagram; deleting the last diagram is forbidden (or auto-creates a blank `"main"`).

Single-diagram-only would not satisfy the roadmap's "project containing multiple named diagrams" goal and barely differs from "persist the one tab"; multi-diagram is the smallest shape that matches the product noun **project**.

### 4. Client-side only, or backend?

**Client-side only for v1 — no backend, no auth, no sync.**

- All reads/writes go to IndexedDB in the browser profile.
- Works for `apps/web` dev server and static hosting (e.g. GitHub Pages) as long as the origin stays stable (IDB is origin-scoped).
- **Deferred:** server-backed projects, collaboration, shared glossary (roadmap 13), Signavio-style published versions.

**Limits (document honestly)**

- Clearing site data / another browser / incognito = project gone unless user exported a backup (v1.1).
- No cross-device sync without a future backend or manual export/import.

### 5. History / versioning — v1 vs deferred

| Capability | v1 | Deferred |
|---|---|---|
| Autosave current editor text to IDB | ✅ debounced (~1s after last keystroke, same order of magnitude as live render debounce) | — |
| Survive full page reload | ✅ | — |
| Dirty indicator (`*` in tab/title or diagram name) | ✅ | — |
| Confirm discard on delete diagram / switch with unsaved edits | ✅ (reuse Diagram mode `confirmDiscardUnsaved` pattern) | — |
| `updatedAt` on project + diagram | ✅ | — |
| Undo/redo stack persistence | ❌ | never (editor-native undo only) |
| Version history / snapshots / "published" checkpoints | ❌ | roadmap 13 / Signavio-style |
| Autosave recovery dialog ("restore unsaved session?") | ❌ v1.1 | optional |
| Per-keystroke revision log | ❌ | — |

v1 is **last-write-wins** autosave, not time-travel.

## Architecture

New browser-only module under `apps/web/src/project/` (no new npm workspace package until a second consumer exists — YAGNI).

```
apps/web/src/project/
  types.ts          # Project, StoredDiagram, DiagramKind
  store.ts          # IndexedDB CRUD (projects + diagrams)
  session.ts        # active project/diagram ids, bootstrap, migrate
  autosave.ts       # debounced persist hook
```

**Data flow (Text mode)**

```
load app → session.bootstrap() → read active project + diagram from IDB
  → editor.value = diagram.body
  → user edits → debounced autosave → store.updateDiagram(id, { body, updatedAt })
  → user switches diagram → flush pending save → load other body
  → reload → same diagram body restored
```

Diagram mode: **unchanged** in v1 (no reads/writes to project store).

**UI (minimal v1)**

- Toolbar or left rail: project name (rename inline or dialog), diagram list, `+ New diagram`.
- Text toolbar: optional **Save now** (flush debounce — mostly reassurance; autosave is primary).
- No change to Diagram mode toolbar except maybe a one-line doc hint that project save is Text-only for now.

## Error handling

- **IDB unavailable** (private mode quirks, quota exceeded): surface a non-blocking banner; fall back to in-memory-only session with warning that reload will lose work.
- **Duplicate diagram name** within project: allowed in v1 (ids are unique); disambiguate in UI with `(2)` suffix optional v1.1.
- **Delete active diagram:** switch to another first; if only one, block delete.
- **Corrupt IDB row:** skip row, log, offer reset project store.

## Testing

- **Unit:** `store.ts` against fake IndexedDB (`fake-indexeddb` devDependency) — create project, CRUD diagram, round-trip body.
- **E2e (Playwright):** edit text → wait for autosave debounce → `page.reload()` → expect editor content persisted; rename/delete covered in one spec each.
- **Regression:** Diagram mode Open/Save/download unchanged; existing live-render e2e green.

## Deferred (explicitly out of scope for v1)

- Diagram mode `.bpmn` blobs in project store
- Filesystem project folders / File System Access API
- Backend sync, auth, sharing
- Version history, snapshots, publish
- Text ↔ Diagram round-trip or "sync active diagram to project"
- CLI `@bpm/project` package
- Import/export project bundle (v1.1 candidate)
- Multi-project UI beyond one active project + "New project" (v1 can use **single active project** with "New project" replacing store — multi-project list deferred to v1.1 if needed)

**v1 simplification:** one **active project** at a time in the UI, persisted in IDB. "New project" wipes/replaces or creates a second project entry but v1 UI only lists diagrams **within** the current project. Multi-project picker deferred unless trivial.

Actually re-read roadmap - "project containing multiple named diagrams" - single active project with many diagrams is enough.

## Related docs

- `docs/ROADMAP.md` item 4, item 12 (Diagram mode quality), item 13 (Signavio versioning)
- `docs/superpowers/specs/2026-08-09-diagram-mode-editor-design.md` — independent Diagram path
- `apps/web/src/main.ts` — current Text mode shell
- `apps/web/src/diagramMode.ts` — dirty flag + export only today
