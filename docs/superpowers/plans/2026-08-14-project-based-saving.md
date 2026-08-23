# Project-Based Diagram Saving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Gate:** Do not start Task 1 until this plan and `docs/superpowers/specs/2026-08-14-project-based-saving-design.md` are reviewed/approved.

**Goal:** Persist text-DSL diagrams in a browser-local **project** (IndexedDB) with create / autosave / reload / rename / delete for multiple named `.bpm` diagrams — surviving full page reload. Diagram mode unchanged.

**Architecture:** New `apps/web/src/project/` module (`types`, `store`, `session`, `autosave`) backed by IndexedDB. Text mode shell (`main.ts`) bootstraps from session on load, wires a minimal diagram list UI, and debounces editor writes. No backend, no Diagram mode integration in v1.

**Tech Stack:** TypeScript, Vite, IndexedDB (`idb-keyval` or native IDB), Vitest + `fake-indexeddb` for unit tests, Playwright for e2e round-trip.

## Global Constraints

- **Text mode only** — Diagram mode `.bpmn` persistence is explicitly out of scope (see spec §2).
- **Client-side only** — no API routes, no new npm workspace package until a second consumer exists.
- **Zero regression** — existing live-render and diagram-mode e2e specs stay green; Diagram mode Open/Save/download behavior unchanged.
- **Last-write-wins** — no version history, snapshots, or publish flow in v1.
- Design reference: `docs/superpowers/specs/2026-08-14-project-based-saving-design.md`.

---

## Task 1: Project types + IndexedDB store

**Files:**
- Create: `apps/web/src/project/types.ts`
- Create: `apps/web/src/project/store.ts`
- Create: `apps/web/src/project/store.test.ts`
- Modify: `apps/web/package.json` (add `fake-indexeddb` devDependency if using native IDB in tests)

**Interfaces:** `Project`, `StoredDiagram`, `DiagramKind = 'text'` per spec.

- [ ] **Step 1: Write failing unit tests**

Create `apps/web/src/project/store.test.ts` covering:
- `createDefaultProject()` → one project, one diagram `"main"`, body matches starter or empty
- `updateDiagramBody(id, body)` → read back same body
- `renameDiagram(id, name)` → name updated, `updatedAt` bumped
- `deleteDiagram(id)` → removed; deleting last diagram throws or is blocked
- `createDiagram(name)` → new id, empty body, appended to project

Run: `npm test -w @bpm/web -- store.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 2: Implement types + store**

Implement IDB schema:
- DB name: `bpm-projects`
- Stores: `projects`, `diagrams` (keyed by id; diagrams indexed by `projectId` via in-memory filter or IDB index)

Use `idb-keyval` **or** a minimal native IDB wrapper — pick one, keep dependency count low.

- [ ] **Step 3: Run unit tests**

Run: `npm test -w @bpm/web -- store.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/project/ apps/web/package.json package-lock.json
git commit -m "feat(web): add IndexedDB project store for text diagrams"
```

---

## Task 2: Session bootstrap + autosave hook

**Files:**
- Create: `apps/web/src/project/session.ts`
- Create: `apps/web/src/project/autosave.ts`
- Modify: `apps/web/src/project/store.test.ts` (session bootstrap cases)

- [ ] **Step 1: Write failing tests for session**

Add tests:
- First visit (empty IDB) → bootstrap creates default project + `"main"` diagram
- Subsequent visit → returns same active project/diagram ids from IDB meta key `session`

- [ ] **Step 2: Implement session + autosave**

`session.ts`:
- `initSession(): Promise<{ project, activeDiagram, diagrams }>`
- Persists `activeProjectId` + `activeDiagramId` in IDB meta

`autosave.ts`:
- `createAutosave(editor: HTMLTextAreaElement, diagramId: string, debounceMs = 1000)`
- Tracks dirty flag; exposes `flush()` and `isDirty()`

- [ ] **Step 3: Run unit tests**

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/project/
git commit -m "feat(web): session bootstrap and debounced autosave hook"
```

---

## Task 3: Wire Text mode UI — diagram list + CRUD

**Files:**
- Modify: `apps/web/index.html` (diagram sidebar / list markup in Text mode panel)
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/styles.css` or inline styles in `index.html` (match existing toolbar patterns)

**UI (minimal):**
- Left of editor or below toolbar: project name (read-only label v1), list of diagram names, `+ New`, rename (inline or prompt), delete (with confirm)
- Active diagram highlighted; click switches diagram (flush autosave first)
- Dirty indicator: `*` suffix on active diagram name when `autosave.isDirty()`

- [ ] **Step 1: Write failing e2e test (persistence round-trip)**

Create `apps/web/test/e2e/project-saving.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('text diagram persists across reload', async ({ page }) => {
  await page.goto('/');
  // Ensure Text mode
  const editor = page.locator('#editor');
  await editor.fill('pool P\n  lane L\n    start s\n    task t\n    end e\n    s -> t -> e');
  // Wait for autosave debounce
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(editor).toHaveValue(/pool P/);
});
```

Run: `cd apps/web && npx playwright test project-saving.spec.ts`
Expected: FAIL — content resets to starter text.

- [ ] **Step 2: Wire main.ts to project session**

On `DOMContentLoaded`:
1. `const session = await initSession()`
2. Set `editor.value = session.activeDiagram.body`
3. Start autosave
4. Render diagram list; wire switch/rename/delete/create handlers

Remove unconditional `STARTER_TEXT` seed when session has stored body.

- [ ] **Step 3: Add rename/delete/create e2e cases**

Extend `project-saving.spec.ts`:
- Create second diagram, switch, verify distinct bodies
- Rename via UI, reload, name persists
- Delete non-last diagram

- [ ] **Step 4: Run e2e**

Run: `cd apps/web && npx playwright test project-saving.spec.ts`
Expected: PASS

- [ ] **Step 5: Run full e2e regression**

Run: `cd apps/web && npx playwright test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/index.html apps/web/src/main.ts apps/web/test/e2e/project-saving.spec.ts
git commit -m "feat(web): project-based text diagram save/reload UI"
```

---

## Task 4: Error handling + docs

**Files:**
- Modify: `apps/web/src/project/store.ts` (quota / IDB unavailable banner hook)
- Modify: `docs/STATUS.md`
- Modify: `docs/ROADMAP.md`

- [ ] **Step 1: IDB failure banner**

If `indexedDB` is null or open fails, show `#project-warning` banner; editor works in-memory only.

- [ ] **Step 2: Update STATUS.md**

Add under Editor UI: project saving (Text mode), IndexedDB, multi-diagram, Diagram mode still file-based.

- [ ] **Step 3: Update ROADMAP.md item 4**

Mark v1 slice done; list deferred: Diagram mode blobs, export/import bundle, version history, backend sync.

- [ ] **Step 4: Run full test suite**

Run: `npm test` (root) + `cd apps/web && npx playwright test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add docs/STATUS.md docs/ROADMAP.md apps/web/src/project/
git commit -m "docs: record project-based saving v1 and deferred items"
```

---

## Verification checklist (Definition of Done)

- [ ] Spec at `docs/superpowers/specs/2026-08-14-project-based-saving-design.md` answers all five scoping questions
- [ ] Plan reviewed before implementation started
- [ ] Diagram mode `.bpmn` explicitly out of scope in spec
- [ ] Playwright `project-saving.spec.ts` proves save/reload round-trip
- [ ] `docs/STATUS.md` and `docs/ROADMAP.md` updated after ship

## Deferred (do not implement in this plan)

- Diagram mode `.bpmn` in project store
- Project export/import JSON bundle
- Multi-project picker UI
- File System Access API / on-disk `.bpm` folders
- Backend, sync, version history (roadmap 13)
