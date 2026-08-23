# Diagram Mode Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `bpmn-js`-backed "Diagram mode" to `apps/web`, fully separate from the existing text pipeline, where a user can drag/resize/add/delete/connect BPMN shapes by hand, per `docs/superpowers/specs/2026-08-09-diagram-mode-editor-design.md`.

**Architecture:** A toolbar toggle swaps the main panel between today's Text mode (unchanged) and a new Diagram mode panel hosting a `bpmn-js` `Modeler` instance, created on entry and destroyed on exit. Diagram mode is seeded from "Edit as Diagram" (a snapshot export of the current text diagram via the existing `@bpm/export-xml`), "New Diagram" (bpmn-js's built-in blank diagram), or "Open" (a file picker importing a previously saved `.bpmn` file). Save/Export XML/Export SVG reuse `bpmn-js`'s native `saveXML`/`saveSVG` and the existing `downloadFile` helper. No new file format, no live sync back to text.

**Tech Stack:** TypeScript, Vite, `bpmn-js` (already a devDependency of `packages/export-xml`, pinned `^17.11.1`), Playwright for e2e.

## Global Constraints

- `bpmn-js` version stays pinned to `^17.11.1` — the same version already verified against `@bpm/export-xml`'s output in `packages/export-xml/test/roundTrip.ts`. Do not introduce a second, divergent version.
- No new UI framework (no React/Vue). `bpmn-js` embeds into a plain DOM container, consistent with `apps/web`'s current vanilla-TS setup.
- No new file/save format. Diagram mode's save/export/reopen format is exactly `bpmn-js`'s native BPMN 2.0 XML + BPMNDI output (`modeler.saveXML()`), the same shape `@bpm/export-xml` already produces.
- No live sync between Text mode and Diagram mode. Each owns its own content; entering/leaving either mode never mutates the other.
- Follow existing patterns in `apps/web`: CSS custom properties from `index.html`'s `:root`/`prefers-color-scheme` block, the `.toolbar-btn` class for buttons, the `downloadFile()` helper in `apps/web/src/downloads.ts` for all downloads, and Playwright e2e tests in `apps/web/test/e2e/` as the verification method (this app has no jsdom unit-test setup, so DOM-heavy behavior is tested end-to-end, matching `apps/web/test/e2e/live-render.spec.ts`'s existing style).

---

### Task 1: Mode toggle UI shell (Text ⇄ Diagram panel swap, no `bpmn-js` yet)

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts` (new file)

**Interfaces:**
- Produces: `#mode-text-btn`, `#mode-diagram-btn` (toggle buttons), `#body` (existing, now hideable), `#diagram-body` (new empty container), `#toolbar-actions` (existing, now hideable), `#diagram-toolbar-actions` (new empty container). A module-level `setMode(mode: 'text' | 'diagram'): void` function in `main.ts` that later tasks extend.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('mode toggle switches between text and diagram panels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();

  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-body')).toBeVisible();
  await expect(page.locator('#body')).toBeHidden();
  await expect(page.locator('#mode-diagram-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'true');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts`
Expected: FAIL — `#mode-text-btn` etc. don't exist yet.

- [ ] **Step 3: Add the mode toggle and diagram-mode containers to `index.html`**

In the `<style>` block, add (near the existing `.toolbar-btn` rules, after the `#toolbar-actions` rule at line 59):

```css
      #mode-toggle { display: flex; gap: 4px; }
      .mode-btn {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 6px 12px;
        cursor: pointer;
      }
      .mode-btn[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
      .mode-btn:hover { border-color: var(--accent); }

      /* ID selectors otherwise beat the [hidden] attribute selector's specificity. */
      #toolbar-actions[hidden],
      #diagram-toolbar-actions[hidden],
      #body[hidden],
      #diagram-body[hidden] { display: none; }

      #diagram-body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
      #diagram-errors { flex: 0 0 auto; }
      #diagram-canvas { flex: 1; min-height: 0; background: var(--bg); }
```

Replace the toolbar block (lines 157–173):

```html
    <div id="toolbar">
      <div id="brand">&#9633; BPM LIVE EDITOR</div>
      <div id="toolbar-actions">
        <select id="engine-override" class="toolbar-btn">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
          <option value="elk-native">ELK-native</option>
          <option value="dagre">Dagre</option>
          <option value="graphviz">Graphviz</option>
        </select>
        <span id="engine-badge" class="badge"></span>
        <button id="fullscreen-btn" class="toolbar-btn">Fullscreen</button>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled>Export BPMN XML</button>
      </div>
    </div>
```

with:

```html
    <div id="toolbar">
      <div id="brand">&#9633; BPM LIVE EDITOR</div>
      <div id="mode-toggle">
        <button id="mode-text-btn" class="mode-btn" aria-pressed="true">Text</button>
        <button id="mode-diagram-btn" class="mode-btn" aria-pressed="false">Diagram</button>
      </div>
      <div id="toolbar-actions">
        <select id="engine-override" class="toolbar-btn">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
          <option value="elk-native">ELK-native</option>
          <option value="dagre">Dagre</option>
          <option value="graphviz">Graphviz</option>
        </select>
        <span id="engine-badge" class="badge"></span>
        <button id="fullscreen-btn" class="toolbar-btn">Fullscreen</button>
        <button id="edit-as-diagram" class="toolbar-btn" disabled>Edit as Diagram</button>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled>Export BPMN XML</button>
      </div>
      <div id="diagram-toolbar-actions" hidden>
        <button id="diagram-new" class="toolbar-btn">New Diagram</button>
        <button id="diagram-open" class="toolbar-btn">Open</button>
        <input type="file" id="diagram-open-input" accept=".bpmn,.xml" hidden />
        <button id="diagram-save" class="toolbar-btn" disabled>Save</button>
        <button id="diagram-export-xml" class="toolbar-btn" disabled>Export XML</button>
        <button id="diagram-export-svg" class="toolbar-btn" disabled>Export SVG</button>
      </div>
    </div>
```

After the existing `#body` div (which currently ends right before `<script type="module" src="/src/main.ts"></script>`), add a sibling:

```html
    <div id="diagram-body" hidden>
      <div id="diagram-errors"></div>
      <div id="diagram-canvas"></div>
    </div>
```

- [ ] **Step 4: Wire the toggle in `main.ts`**

Add near the top of `apps/web/src/main.ts`, after the existing `const fullscreenBtn = ...` block (line 12):

```ts
const modeTextBtn = document.querySelector<HTMLButtonElement>('#mode-text-btn')!;
const modeDiagramBtn = document.querySelector<HTMLButtonElement>('#mode-diagram-btn')!;
const body = document.querySelector<HTMLDivElement>('#body')!;
const diagramBody = document.querySelector<HTMLDivElement>('#diagram-body')!;
const toolbarActions = document.querySelector<HTMLDivElement>('#toolbar-actions')!;
const diagramToolbarActions = document.querySelector<HTMLDivElement>('#diagram-toolbar-actions')!;

type Mode = 'text' | 'diagram';
let currentMode: Mode = 'text';

function setMode(mode: Mode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  const isDiagram = mode === 'diagram';
  modeTextBtn.setAttribute('aria-pressed', String(!isDiagram));
  modeDiagramBtn.setAttribute('aria-pressed', String(isDiagram));
  body.hidden = isDiagram;
  diagramBody.hidden = !isDiagram;
  toolbarActions.hidden = isDiagram;
  diagramToolbarActions.hidden = !isDiagram;
}

modeTextBtn.addEventListener('click', () => setMode('text'));
modeDiagramBtn.addEventListener('click', () => setMode('diagram'));
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/index.html apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): add Text/Diagram mode toggle shell"
```

---

### Task 2: `bpmn-js` dependency, `diagramMode.ts` lifecycle wrapper, and "New Diagram"

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/src/diagramMode.ts`
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond the DOM elements it created.
- Produces (from `diagramMode.ts`, consumed by later tasks): `createModeler(container: HTMLElement): void`, `destroyModeler(): void`, `newDiagram(): Promise<void>`, `hasUnsavedChanges(): boolean`. (`importXml`, `exportXml`, `exportSvg` are added in Tasks 3 and 5.)

- [ ] **Step 1: Add the `bpmn-js` dependency**

In `apps/web/package.json`, add to `"dependencies"`:

```json
    "bpmn-js": "^17.11.1",
```

Run: `npm install` (from the repo root, so the workspace lockfile picks it up)

- [ ] **Step 2: Allow CSS imports in TypeScript**

In `apps/web/tsconfig.json`, add `"types": ["vite/client"]` to `compilerOptions` (Vite's client types declare ambient `*.css` modules, needed for the CSS imports in the next step):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing e2e test**

Add to `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
test('entering diagram mode creates a bpmn-js canvas; New Diagram loads a start event with the palette visible', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-canvas .djs-container')).toBeVisible();

  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-canvas .djs-palette')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id]').first()).toBeVisible();
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "New Diagram"`
Expected: FAIL — `#diagram-new` has no handler, no `bpmn-js` canvas is created.

- [ ] **Step 5: Write `diagramMode.ts`**

Create `apps/web/src/diagramMode.ts`:

```ts
import BpmnModeler from 'bpmn-js/lib/Modeler.js';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

let modeler: BpmnModeler | null = null;
let dirty = false;

export function createModeler(container: HTMLElement): void {
  modeler = new BpmnModeler({ container });
  modeler.on('commandStack.changed', () => {
    dirty = true;
  });
}

export function destroyModeler(): void {
  modeler?.destroy();
  modeler = null;
  dirty = false;
}

export function hasUnsavedChanges(): boolean {
  return dirty;
}

function requireModeler(): BpmnModeler {
  if (!modeler) throw new Error('Diagram mode is not active');
  return modeler;
}

export async function newDiagram(): Promise<void> {
  await requireModeler().createDiagram();
  dirty = false;
}
```

- [ ] **Step 6: Wire lifecycle and "New Diagram" into `main.ts`**

Add the import near the top of `apps/web/src/main.ts`:

```ts
import { createModeler, destroyModeler, newDiagram } from './diagramMode.js';
```

Add the diagram canvas element lookup near the other element lookups:

```ts
const diagramCanvas = document.querySelector<HTMLDivElement>('#diagram-canvas')!;
const diagramNewBtn = document.querySelector<HTMLButtonElement>('#diagram-new')!;
```

Extend `setMode` (from Task 1) to create/destroy the modeler on transition:

```ts
function setMode(mode: Mode): void {
  if (mode === currentMode) return;
  const leavingDiagram = currentMode === 'diagram';
  currentMode = mode;
  const isDiagram = mode === 'diagram';
  modeTextBtn.setAttribute('aria-pressed', String(!isDiagram));
  modeDiagramBtn.setAttribute('aria-pressed', String(isDiagram));
  body.hidden = isDiagram;
  diagramBody.hidden = !isDiagram;
  toolbarActions.hidden = isDiagram;
  diagramToolbarActions.hidden = !isDiagram;

  if (isDiagram) {
    createModeler(diagramCanvas);
  } else if (leavingDiagram) {
    destroyModeler();
  }
}
```

Add the "New Diagram" handler:

```ts
diagramNewBtn.addEventListener('click', () => {
  newDiagram();
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "New Diagram"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/tsconfig.json apps/web/src/diagramMode.ts apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts package-lock.json
git commit -m "feat(web): embed bpmn-js modeler lifecycle and New Diagram"
```

(If the repo uses a single root `package-lock.json` rather than per-workspace lockfiles, only add that one — check with `git status` before staging.)

---

### Task 3: "Edit as Diagram" — snapshot the current text diagram into Diagram mode

**Files:**
- Modify: `apps/web/src/diagramMode.ts`
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: `exportToXml(diagram, positioned)` from `@bpm/export-xml` (already imported in `main.ts`), `PipelineResult` (`lastResult`, already tracked in `main.ts`), `setMode` and `diagramCanvas` from Tasks 1–2.
- Produces: `importXml(xml: string): Promise<string[]>` in `diagramMode.ts` (returns import warnings). `renderDiagramErrors(messages: string[]): void` and `loadDiagramXml(xml: string): Promise<void>` in `main.ts`, reused by Task 4's Open handler.

- [ ] **Step 1: Write the failing e2e tests**

Add to `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
test('Edit as Diagram seeds the bpmn-js canvas from the current text diagram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#edit-as-diagram')).toBeEnabled();

  await page.locator('#edit-as-diagram').click();
  await expect(page.locator('#diagram-body')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="n1"]')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="n2"]')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="g1"]')).toBeVisible();
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
});

test('Edit as Diagram is disabled while there is a parse error', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Edit as Diagram"`
Expected: FAIL — `#edit-as-diagram` has no handler and is never enabled/disabled.

- [ ] **Step 3: Add `importXml` to `diagramMode.ts`**

Append to `apps/web/src/diagramMode.ts`:

```ts
export async function importXml(xml: string): Promise<string[]> {
  const { warnings } = await requireModeler().importXML(xml);
  dirty = false;
  return warnings;
}
```

- [ ] **Step 4: Wire "Edit as Diagram" and the error strip in `main.ts`**

Update the import from `diagramMode.js`:

```ts
import { createModeler, destroyModeler, newDiagram, importXml } from './diagramMode.js';
```

Add the element lookups and helpers (near the other diagram-mode lookups from Task 2):

```ts
const editAsDiagramBtn = document.querySelector<HTMLButtonElement>('#edit-as-diagram')!;
const diagramErrorsEl = document.querySelector<HTMLDivElement>('#diagram-errors')!;

function renderDiagramErrors(messages: string[]): void {
  diagramErrorsEl.replaceChildren();
  for (const message of messages) {
    const item = document.createElement('div');
    item.className = 'error-item';
    item.textContent = message;
    diagramErrorsEl.append(item);
  }
}

async function loadDiagramXml(xml: string): Promise<void> {
  try {
    const warnings = await importXml(xml);
    renderDiagramErrors(warnings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    renderDiagramErrors([message]);
  }
}

editAsDiagramBtn.addEventListener('click', async () => {
  if (!lastResult?.diagram || !lastResult.positioned) return;
  const xml = exportToXml(lastResult.diagram, lastResult.positioned);
  setMode('diagram');
  await loadDiagramXml(xml);
});
```

In `rerender()`, alongside the existing `exportSvgBtn.disabled` / `exportXmlBtn.disabled` toggling, add `editAsDiagramBtn.disabled` in both branches:

```ts
  if (result.errors.length > 0) {
    renderErrors(result.errors);
    preview.classList.add('stale');
    exportSvgBtn.disabled = true;
    exportXmlBtn.disabled = true;
    editAsDiagramBtn.disabled = true;
    return;
  }
  renderErrors([]);
  preview.classList.remove('stale');
  preview.innerHTML = result.svg!;
  engineBadge.textContent = result.engineName!;
  exportSvgBtn.disabled = false;
  exportXmlBtn.disabled = false;
  editAsDiagramBtn.disabled = false;
  lastResult = result;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Edit as Diagram"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/diagramMode.ts apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): add Edit as Diagram snapshot import into Diagram mode"
```

---

### Task 4: "Open" — load a previously saved `.bpmn` file

**Files:**
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: `loadDiagramXml` and `diagramErrorsEl` from Task 3; the existing `#export-xml` Text-mode button (already tested in `live-render.spec.ts`) as the source of a known-valid `.bpmn` file for the "valid" test case, so this task needs no new fixture file.

- [ ] **Step 1: Write the failing e2e tests**

Add to `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
test('Open loads a valid .bpmn file exported from Text mode', async ({ page }) => {
  await page.goto('/');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-xml').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const xml = Buffer.concat(chunks).toString('utf-8');

  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'reopened.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from(xml),
  });
  await expect(page.locator('#diagram-canvas [data-element-id="n1"]')).toBeVisible();
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
});

test('Open surfaces an error for malformed XML instead of failing silently', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'bad.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from('this is not xml'),
  });
  await expect(page.locator('#diagram-errors .error-item')).not.toHaveCount(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Open"`
Expected: FAIL — `#diagram-open` / `#diagram-open-input` have no handler.

- [ ] **Step 3: Wire the Open button and file input in `main.ts`**

Add the element lookups (near the other diagram-mode lookups) and handler:

```ts
const diagramOpenBtn = document.querySelector<HTMLButtonElement>('#diagram-open')!;
const diagramOpenInput = document.querySelector<HTMLInputElement>('#diagram-open-input')!;

diagramOpenBtn.addEventListener('click', () => diagramOpenInput.click());

diagramOpenInput.addEventListener('change', async () => {
  const file = diagramOpenInput.files?.[0];
  diagramOpenInput.value = '';
  if (!file) return;
  const xml = await file.text();
  await loadDiagramXml(xml);
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Open"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): add Open file picker for reloading a saved .bpmn diagram"
```

---

### Task 5: Save / Export XML / Export SVG

**Files:**
- Modify: `apps/web/src/diagramMode.ts`
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: `downloadFile` from `apps/web/src/downloads.ts` (already imported in `main.ts`); `renderDiagramErrors` from Task 3.
- Produces: `exportXml(): Promise<string>`, `exportSvg(): Promise<string>` in `diagramMode.ts`.

- [ ] **Step 1: Write the failing e2e test**

Add to `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
test('Save, Export XML, and Export SVG are disabled until a diagram is loaded, then trigger downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-save')).toBeDisabled();
  await expect(page.locator('#diagram-export-xml')).toBeDisabled();
  await expect(page.locator('#diagram-export-svg')).toBeDisabled();

  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-xml')).toBeEnabled();
  await expect(page.locator('#diagram-export-svg')).toBeEnabled();

  const [saveDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-save').click(),
  ]);
  expect(saveDownload.suggestedFilename()).toBe('diagram.bpmn');

  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  expect(Buffer.concat(xmlChunks).toString('utf-8')).toContain('bpmn2:definitions');

  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Save, Export XML"`
Expected: FAIL — buttons stay disabled and have no handlers.

- [ ] **Step 3: Add `exportXml`/`exportSvg` to `diagramMode.ts`**

Append to `apps/web/src/diagramMode.ts`:

```ts
export async function exportXml(): Promise<string> {
  const { xml } = await requireModeler().saveXML({ format: true });
  dirty = false;
  return xml!;
}

export async function exportSvg(): Promise<string> {
  const { svg } = await requireModeler().saveSVG();
  return svg;
}
```

- [ ] **Step 4: Wire the buttons and enable/disable state in `main.ts`**

Update the import from `diagramMode.js`:

```ts
import { createModeler, destroyModeler, newDiagram, importXml, exportXml, exportSvg } from './diagramMode.js';
```

Add the element lookups:

```ts
const diagramSaveBtn = document.querySelector<HTMLButtonElement>('#diagram-save')!;
const diagramExportXmlBtn = document.querySelector<HTMLButtonElement>('#diagram-export-xml')!;
const diagramExportSvgBtn = document.querySelector<HTMLButtonElement>('#diagram-export-svg')!;

function setDiagramButtonsEnabled(enabled: boolean): void {
  diagramSaveBtn.disabled = !enabled;
  diagramExportXmlBtn.disabled = !enabled;
  diagramExportSvgBtn.disabled = !enabled;
}

async function exportDiagramXmlFile(): Promise<void> {
  try {
    const xml = await exportXml();
    downloadFile('diagram.bpmn', xml, 'application/xml');
  } catch (err) {
    renderDiagramErrors([err instanceof Error ? err.message : String(err)]);
  }
}

diagramSaveBtn.addEventListener('click', () => exportDiagramXmlFile());
diagramExportXmlBtn.addEventListener('click', () => exportDiagramXmlFile());

diagramExportSvgBtn.addEventListener('click', async () => {
  try {
    const svg = await exportSvg();
    downloadFile('diagram.svg', svg, 'image/svg+xml');
  } catch (err) {
    renderDiagramErrors([err instanceof Error ? err.message : String(err)]);
  }
});
```

Enable the buttons after every successful load. Update `diagramNewBtn`'s handler (from Task 2):

```ts
diagramNewBtn.addEventListener('click', async () => {
  await newDiagram();
  setDiagramButtonsEnabled(true);
});
```

Update `loadDiagramXml` (from Task 3) to enable the buttons only when the import didn't error:

```ts
async function loadDiagramXml(xml: string): Promise<void> {
  try {
    const warnings = await importXml(xml);
    renderDiagramErrors(warnings);
    setDiagramButtonsEnabled(true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    renderDiagramErrors([message]);
    setDiagramButtonsEnabled(false);
  }
}
```

Also disable the diagram-mode export buttons when leaving Diagram mode, in `setMode`'s `leavingDiagram` branch:

```ts
  } else if (leavingDiagram) {
    destroyModeler();
    setDiagramButtonsEnabled(false);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "Save, Export XML"`
Expected: PASS

- [ ] **Step 6: Run the full e2e suite to check for regressions**

Run: `cd apps/web && npx playwright test`
Expected: all tests pass, including the pre-existing `live-render.spec.ts` suite.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/diagramMode.ts apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): add Save, Export XML, and Export SVG to Diagram mode"
```

---

### Task 6: Unsaved-changes guard on mode switch and page unload

**Files:**
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: `hasUnsavedChanges()` from `diagramMode.ts` (already produced in Task 2).

- [ ] **Step 1: Write the failing e2e test**

Add to `apps/web/test/e2e/diagram-mode.spec.ts`:

```ts
test('unsaved changes in diagram mode prompt before leaving; dismissing stays, accepting leaves', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();

  const element = page.locator('#diagram-canvas [data-element-id]').first();
  const box = (await element.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#diagram-body')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
});

test('a freshly loaded diagram with no edits switches modes without a prompt', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();

  page.on('dialog', (dialog) => {
    throw new Error(`unexpected dialog: ${dialog.message()}`);
  });
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "unsaved changes"`
Expected: FAIL — no confirmation dialog appears, so `dialog.dismiss()`/`dialog.accept()` never fire and the "stays" assertion fails.

- [ ] **Step 3: Add the guard to `setMode` and wire `beforeunload`**

Update `setMode` in `apps/web/src/main.ts` to check before switching away from Diagram mode:

```ts
function setMode(mode: Mode): void {
  if (mode === currentMode) return;
  if (currentMode === 'diagram' && hasUnsavedChanges()) {
    if (!confirm('Diagram has unsaved changes — leave anyway?')) return;
  }
  const leavingDiagram = currentMode === 'diagram';
  currentMode = mode;
  const isDiagram = mode === 'diagram';
  modeTextBtn.setAttribute('aria-pressed', String(!isDiagram));
  modeDiagramBtn.setAttribute('aria-pressed', String(isDiagram));
  body.hidden = isDiagram;
  diagramBody.hidden = !isDiagram;
  toolbarActions.hidden = isDiagram;
  diagramToolbarActions.hidden = !isDiagram;

  if (isDiagram) {
    createModeler(diagramCanvas);
  } else if (leavingDiagram) {
    destroyModeler();
    setDiagramButtonsEnabled(false);
  }
}
```

Update the `diagramMode.js` import to include `hasUnsavedChanges`:

```ts
import { createModeler, destroyModeler, newDiagram, importXml, exportXml, exportSvg, hasUnsavedChanges } from './diagramMode.js';
```

Add a `beforeunload` guard near the bottom of `main.ts`, before the final `rerender();` call:

```ts
window.addEventListener('beforeunload', (event) => {
  if (currentMode === 'diagram' && hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx playwright test diagram-mode.spec.ts -g "unsaved changes|no edits"`
Expected: PASS

- [ ] **Step 5: Run the full e2e suite one more time**

Run: `cd apps/web && npx playwright test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): guard unsaved Diagram mode edits on mode switch and unload"
```

---

## Post-plan check

After Task 6, re-read `docs/superpowers/specs/2026-08-09-diagram-mode-editor-design.md` end to end and confirm every section has a corresponding task:

- Mode toggle → Task 1
- `bpmn-js` lifecycle → Task 2
- "Edit as Diagram" entry point → Task 3
- "New Diagram" entry point → Task 2
- "Open" entry point → Task 4
- Save / Export XML / Export SVG → Task 5
- Unsaved-changes guard → Task 6
- Error handling (import/export failures via the error strip) → Tasks 3–5
- Dependencies (`bpmn-js` promotion, CSS import, no new framework) → Task 2
