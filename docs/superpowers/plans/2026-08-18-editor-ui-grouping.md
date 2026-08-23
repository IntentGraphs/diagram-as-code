# Editor Toolbar & Panel Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/web`'s toolbar (15 ungrouped buttons) and four bottom panels (Review/Generate/Settings/Import) into visually grouped, closable, and family-aware UI, per `docs/superpowers/specs/2026-08-18-editor-ui-grouping-design.md`.

**Architecture:** Two new small shared DOM-component modules (`panelHeader.ts`, `exportMenu.ts`) consumed by `index.html`'s restructured toolbar markup and by the four existing panel modules (`reviewPanel.ts`, `generatePanel.ts`, `settingsPanel.ts`, `importPanel.ts`) and `main.ts`. No new runtime dependencies, no framework, no CDN assets — inline SVG icons and vanilla DOM APIs only, matching the project's existing constraints.

**Tech Stack:** Vanilla TypeScript, Vite, Playwright (e2e), Vitest + jsdom (unit, opt-in per file via `/** @vitest-environment jsdom */`).

## Global Constraints

- No new npm dependencies (per spec's "Icons" section — inline SVG, no icon font/CDN).
- Every existing element `id` referenced by current Playwright specs stays unless the spec doc explicitly says it's replaced (`#export-svg`/`#export-xml`/`#export-drawio`/`#diagram-export-xml`/`#diagram-export-svg`/`#engine-override` are the only ids being removed/relocated).
- `hideReviewPanel()`, `hideGeneratePanel()`, `hideSettingsPanel()`, `hideImportPanel()` keep their existing signatures — `main.ts`'s toolbar-toggle click handlers are untouched.
- Colors/typography reuse existing CSS custom properties (`--bg`, `--surface`, `--border`, `--ink`, `--muted`, `--accent`, `--error`) — no new tokens.
- Run `npm test` (vitest, from repo root) and `npm run test:e2e` (Playwright, from `apps/web`) before the final commit of each task that touches runtime code.

---

### Task 1: Shared panel-header component

**Files:**
- Create: `apps/web/src/panelHeader.ts`
- Test: `apps/web/test/panelHeader.test.ts`
- Modify: `apps/web/index.html:301-309` (extend `.review-header` rule into a `.panel-header` flex-row rule; add `.panel-close-btn`)

**Interfaces:**
- Produces: `createPanelHeader(initialTitle: string, onClose: () => void): { el: HTMLDivElement; setTitle: (title: string) => void }` — `el` is a `<div class="panel-header">` containing a `<span class="panel-header-title">` (reuses the existing `.review-header` text styling by keeping that class on the span too, i.e. `class="review-header panel-header-title"`) and a `<button class="panel-close-btn" aria-label="Close panel" type="button">×</button>` wired to `onClose`. `setTitle` updates the title span's `textContent` without touching the close button.

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/web/test/panelHeader.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { createPanelHeader } from '../src/panelHeader.js';

describe('createPanelHeader', () => {
  it('renders a title and a close button that calls onClose', () => {
    const onClose = vi.fn();
    const { el } = createPanelHeader('Settings', onClose);
    expect(el.querySelector('.panel-header-title')?.textContent).toBe('Settings');
    const closeBtn = el.querySelector<HTMLButtonElement>('.panel-close-btn')!;
    expect(closeBtn.getAttribute('aria-label')).toBe('Close panel');
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('setTitle updates the title text without replacing the close button', () => {
    const { el, setTitle } = createPanelHeader('Review', () => {});
    const closeBtn = el.querySelector('.panel-close-btn');
    setTitle('Review (3 findings)');
    expect(el.querySelector('.panel-header-title')?.textContent).toBe('Review (3 findings)');
    expect(el.querySelector('.panel-close-btn')).toBe(closeBtn);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run test/panelHeader.test.ts`
Expected: FAIL — `Cannot find module '../src/panelHeader.js'`

- [ ] **Step 3: Implement `panelHeader.ts`**

```ts
// apps/web/src/panelHeader.ts
export interface PanelHeaderHandle {
  el: HTMLDivElement;
  setTitle: (title: string) => void;
}

export function createPanelHeader(initialTitle: string, onClose: () => void): PanelHeaderHandle {
  const el = document.createElement('div');
  el.className = 'panel-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'review-header panel-header-title';
  titleEl.textContent = initialTitle;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'panel-close-btn';
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => onClose());

  el.append(titleEl, closeBtn);

  return {
    el,
    setTitle: (title: string) => {
      titleEl.textContent = title;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run test/panelHeader.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Add CSS**

In `apps/web/index.html`, find the existing rule:

```css
      .review-header {
        padding: 6px 16px;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted);
        border-bottom: 1px solid var(--border);
      }
```

Replace it with:

```css
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--border);
      }
      .review-header {
        padding: 6px 16px;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--muted);
      }
      .panel-header .review-header { border-bottom: none; flex: 1; }
      .panel-close-btn {
        font-family: var(--font-mono);
        font-size: 14px;
        line-height: 1;
        color: var(--muted);
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px 12px;
      }
      .panel-close-btn:hover { color: var(--accent); }
```

(`.review-header` alone — without `.panel-header` as a parent — is no longer used standalone once Task 7 finishes, but stays defined since `.panel-header-title` composes it.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/panelHeader.ts apps/web/test/panelHeader.test.ts apps/web/index.html
git commit -m "feat(web): add shared panel-header component with close button"
```

---

### Task 2: Shared export-menu component

**Files:**
- Create: `apps/web/src/exportMenu.ts`
- Test: `apps/web/test/exportMenu.test.ts`
- Modify: `apps/web/index.html` (add `.export-menu`/`.export-menu-btn`/`.export-menu-list`/`.export-menu-item` CSS after the existing `.toolbar-btn` rules, i.e. after the `#edit-as-diagram`/export button rules block)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  ```ts
  export interface ExportMenuItem { id: string; label: string; onClick: () => void; }
  export interface ExportMenuHandle {
    container: HTMLDivElement;
    button: HTMLButtonElement;
    setItems: (items: ExportMenuItem[]) => void;
    setDisabled: (disabled: boolean) => void;
  }
  export function createExportMenu(idPrefix: string, buttonLabel?: string): ExportMenuHandle;
  ```
  `button.id` is `` `${idPrefix}-btn` ``, the popover's id is `` `${idPrefix}-list` ``. `setItems([])` disables the button (nothing to open). `setDisabled(true)` force-disables regardless of items (used by Diagram mode, where item availability is all-or-nothing).

- [ ] **Step 1: Write the failing unit test**

```ts
// apps/web/test/exportMenu.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { createExportMenu } from '../src/exportMenu.js';

describe('createExportMenu', () => {
  it('starts disabled with an empty menu', () => {
    const { button, container } = createExportMenu('export-menu');
    expect(button.id).toBe('export-menu-btn');
    expect(button.disabled).toBe(true);
    expect(container.querySelector('#export-menu-list')?.hidden).toBe(true);
  });

  it('setItems enables the button and renders clickable items', () => {
    const onClick = vi.fn();
    const { button, container, setItems } = createExportMenu('export-menu');
    setItems([{ id: 'export-item-svg', label: 'Export SVG', onClick }]);
    expect(button.disabled).toBe(false);

    button.click();
    const item = container.querySelector<HTMLButtonElement>('#export-item-svg')!;
    expect(item.textContent).toBe('Export SVG');
    item.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const list = container.querySelector<HTMLDivElement>('#export-menu-list')!;
    expect(list.hidden).toBe(true); // clicking an item closes the menu
  });

  it('setItems([]) disables the button again', () => {
    const { button, setItems } = createExportMenu('export-menu');
    setItems([{ id: 'x', label: 'X', onClick: () => {} }]);
    expect(button.disabled).toBe(false);
    setItems([]);
    expect(button.disabled).toBe(true);
  });

  it('setDisabled(true) force-disables even with items present', () => {
    const { button, setItems, setDisabled } = createExportMenu('diagram-export-menu');
    setItems([{ id: 'a', label: 'A', onClick: () => {} }]);
    setDisabled(true);
    expect(button.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run test/exportMenu.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `exportMenu.ts`**

```ts
// apps/web/src/exportMenu.ts
export interface ExportMenuItem {
  id: string;
  label: string;
  onClick: () => void;
}

export interface ExportMenuHandle {
  container: HTMLDivElement;
  button: HTMLButtonElement;
  setItems: (items: ExportMenuItem[]) => void;
  setDisabled: (disabled: boolean) => void;
}

export function createExportMenu(idPrefix: string, buttonLabel = 'Export'): ExportMenuHandle {
  const container = document.createElement('div');
  container.className = 'export-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = `${idPrefix}-btn`;
  button.className = 'toolbar-btn export-menu-btn';
  button.textContent = `${buttonLabel} ▾`;
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.disabled = true;

  const list = document.createElement('div');
  list.id = `${idPrefix}-list`;
  list.className = 'export-menu-list';
  list.hidden = true;

  let forceDisabled = false;
  let itemCount = 0;

  function closeMenu(): void {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  function openMenu(): void {
    if (button.disabled) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  button.addEventListener('click', () => {
    if (list.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target as Node)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  container.append(button, list);

  function refreshDisabled(): void {
    button.disabled = forceDisabled || itemCount === 0;
  }

  function setItems(items: ExportMenuItem[]): void {
    list.replaceChildren();
    for (const item of items) {
      const itemBtn = document.createElement('button');
      itemBtn.type = 'button';
      itemBtn.id = item.id;
      itemBtn.className = 'export-menu-item';
      itemBtn.textContent = item.label;
      itemBtn.addEventListener('click', () => {
        closeMenu();
        item.onClick();
      });
      list.appendChild(itemBtn);
    }
    itemCount = items.length;
    refreshDisabled();
  }

  function setDisabled(disabled: boolean): void {
    forceDisabled = disabled;
    refreshDisabled();
    if (disabled) closeMenu();
  }

  return { container, button, setItems, setDisabled };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run test/exportMenu.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add CSS**

In `apps/web/index.html`, after the existing `.toolbar-btn:disabled { opacity: 0.35; cursor: not-allowed; }` rule, add:

```css
      .export-menu { position: relative; display: inline-block; }
      .export-menu-list {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        min-width: 180px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 3px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        z-index: 10;
        display: flex;
        flex-direction: column;
      }
      .export-menu-list[hidden] { display: none; }
      .export-menu-item {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink);
        background: transparent;
        border: none;
        text-align: left;
        padding: 8px 12px;
        cursor: pointer;
      }
      .export-menu-item:hover { background: var(--bg); color: var(--accent); }
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/exportMenu.ts apps/web/test/exportMenu.test.ts apps/web/index.html
git commit -m "feat(web): add shared export-menu dropdown component"
```

---

### Task 3: Toolbar restructure — markup, groups, icons, responsive wrap

**Files:**
- Modify: `apps/web/index.html` (toolbar `<style>` block and the `#toolbar` markup in `<body>`)

**Interfaces:**
- Consumes: nothing (pure markup/CSS; JS wiring for the new `#export-menu-container`/`#diagram-export-menu-container` and `#family-badge-label` happens in Tasks 4–5).
- Produces: new element ids other tasks depend on — `#family-badge-label` (span inside `#family-badge` main.ts will target instead of the badge itself), `#export-menu-container`, `#diagram-export-menu-container`. Removes ids `#export-svg`, `#export-xml`, `#export-drawio`, `#engine-override`, `#diagram-export-xml`, `#diagram-export-svg` (relocated/replaced in later tasks — this task removes the elements; Tasks 4–6 will error until they land, so this task's own step-by-step verification only checks markup/CSS, not full app behavior).

- [ ] **Step 1: Replace the toolbar CSS rules**

Find this block (the toolbar and mode-toggle rules near the top of the `<style>` section):

```css
      #toolbar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 44px;
        padding: 0 16px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      #brand {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
      }
      #toolbar-actions { display: flex; align-items: center; gap: 10px; }
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
```

Replace with:

```css
      #toolbar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        row-gap: 4px;
        min-height: 44px;
        height: auto;
        padding: 6px 16px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      #brand {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
      }
      #toolbar-actions, #diagram-toolbar-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 16px;
      }
      .toolbar-group:first-child { padding-left: 0; }
      .toolbar-group:not(:first-child) { border-left: 1px solid var(--border); }
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
        display: inline-flex;
        align-items: center;
      }
      .mode-btn[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
      .mode-btn:hover { border-color: var(--accent); }
      .mode-btn-icon { margin-right: 5px; }
      .family-badge-icon { margin-right: 4px; vertical-align: -1px; }
      .segmented-group {
        display: flex;
        border: 1px solid var(--border);
        border-radius: 3px;
        overflow: hidden;
      }
      .segmented-group .segmented-btn {
        border: none;
        border-radius: 0;
      }
      .segmented-group .segmented-btn:not(:first-child) { border-left: 1px solid var(--border); }
      #project-toggle-btn[aria-pressed]::after,
      .segmented-btn[aria-pressed]::after {
        margin-left: 5px;
        font-size: 9px;
      }
      #project-toggle-btn[aria-pressed="true"]::after,
      .segmented-btn[aria-pressed="true"]::after { content: "\25be"; }
      #project-toggle-btn[aria-pressed="false"]::after,
      .segmented-btn[aria-pressed="false"]::after { content: "\25b8"; }
```

- [ ] **Step 2: Replace the toolbar markup**

Find (in the `<body>`):

```html
    <div id="toolbar">
      <div id="brand">&#9633; BPM LIVE EDITOR</div>
      <div id="mode-toggle">
        <button id="mode-text-btn" class="mode-btn" aria-pressed="true">Text</button>
        <button id="mode-diagram-btn" class="mode-btn" aria-pressed="false">Diagram</button>
      </div>
      <div id="toolbar-actions">
        <select id="engine-override" class="toolbar-btn" aria-label="Layout engine override">
          <option value="">Auto</option>
          <option value="flat">Flat</option>
          <option value="swimlane">Swimlane</option>
        </select>
        <span id="engine-badge" class="badge"></span>
        <span id="family-badge" class="badge" aria-live="polite">No family</span>
        <button id="project-toggle-btn" class="toolbar-btn" aria-pressed="true">Projects</button>
        <button id="review-btn" class="toolbar-btn">Review</button>
        <button id="generate-btn" class="toolbar-btn">Generate</button>
        <button id="settings-btn" class="toolbar-btn">Settings</button>
        <button id="clear-btn" class="toolbar-btn">Clear</button>
        <button id="fullscreen-btn" class="toolbar-btn">Fullscreen</button>
        <button id="edit-as-diagram" class="toolbar-btn" disabled>Edit as Diagram</button>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled title="Available for BPMN diagrams only">Export BPMN XML</button>
        <button id="export-drawio" class="toolbar-btn" disabled title="Available for mindmap diagrams only">Export draw.io</button>
      </div>
      <div id="diagram-toolbar-actions" hidden>
        <button id="diagram-new" class="toolbar-btn">New Diagram</button>
        <button id="diagram-open" class="toolbar-btn">Open</button>
        <input type="file" id="diagram-open-input" accept=".bpmn,.xml" aria-label="Open BPMN file" hidden />
        <button id="diagram-save" class="toolbar-btn" disabled>Save</button>
        <button id="diagram-export-xml" class="toolbar-btn" disabled title="Diagram mode edits BPMN only">Export BPMN XML</button>
        <button id="diagram-export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="diagram-import-text" class="toolbar-btn" disabled>Import to Text</button>
      </div>
    </div>
```

Replace with:

```html
    <div id="toolbar">
      <div class="toolbar-group">
        <div id="brand">&#9633; BPM LIVE EDITOR</div>
        <div id="mode-toggle">
          <button id="mode-text-btn" class="mode-btn" aria-pressed="true">
            <svg class="mode-btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <path d="M2 14l1-3.5L10.5 3 13 5.5 5.5 13 2 14Z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
              <path d="M9 4.5 11.5 7" stroke="currentColor" stroke-width="1.1"/>
            </svg>
            Text
          </button>
          <button id="mode-diagram-btn" class="mode-btn" aria-pressed="false">
            <svg class="mode-btn-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
              <circle cx="3" cy="4" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/>
              <circle cx="13" cy="4" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/>
              <circle cx="8" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.1"/>
              <path d="M4.5 4h7M4 5.4 7 11.2M12 5.4 9 11.2" stroke="currentColor" stroke-width="1"/>
            </svg>
            Diagram
          </button>
        </div>
      </div>
      <div id="toolbar-actions">
        <div class="toolbar-group">
          <span id="engine-badge" class="badge"></span>
          <span id="family-badge" class="badge" aria-live="polite">
            <svg class="family-badge-icon" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true" focusable="false">
              <rect x="1" y="6" width="4.5" height="4" fill="none" stroke="currentColor" stroke-width="1"/>
              <rect x="10.5" y="6" width="4.5" height="4" fill="none" stroke="currentColor" stroke-width="1"/>
              <path d="M5.5 8h5" stroke="currentColor" stroke-width="1"/>
            </svg>
            <span id="family-badge-label">No family</span>
          </span>
        </div>
        <div class="toolbar-group">
          <button id="project-toggle-btn" class="toolbar-btn" aria-pressed="true">Projects</button>
          <div class="segmented-group">
            <button id="review-btn" class="toolbar-btn segmented-btn" aria-pressed="false">Review</button>
            <button id="generate-btn" class="toolbar-btn segmented-btn" aria-pressed="false">Generate</button>
            <button id="settings-btn" class="toolbar-btn segmented-btn" aria-pressed="false">Settings</button>
          </div>
        </div>
        <div class="toolbar-group">
          <button id="clear-btn" class="toolbar-btn">Clear</button>
          <button id="fullscreen-btn" class="toolbar-btn">Fullscreen</button>
        </div>
        <div class="toolbar-group">
          <button id="edit-as-diagram" class="toolbar-btn" disabled>Edit as Diagram</button>
          <div id="export-menu-container"></div>
        </div>
      </div>
      <div id="diagram-toolbar-actions" hidden>
        <div class="toolbar-group">
          <button id="diagram-new" class="toolbar-btn">New Diagram</button>
          <button id="diagram-open" class="toolbar-btn">Open</button>
          <input type="file" id="diagram-open-input" accept=".bpmn,.xml" aria-label="Open BPMN file" hidden />
        </div>
        <div class="toolbar-group">
          <button id="diagram-save" class="toolbar-btn" disabled>Save</button>
          <div id="diagram-export-menu-container"></div>
        </div>
        <div class="toolbar-group">
          <button id="diagram-import-text" class="toolbar-btn" disabled>Import to Text</button>
        </div>
      </div>
    </div>
```

Note `#toolbar-actions` and `#diagram-toolbar-actions` are no longer the flex-wrap containers directly holding buttons — they now hold `.toolbar-group` children, and the `flex-wrap` from Step 1 applies to them so groups themselves wrap onto a new line as a unit before individual buttons would ever clip.

- [ ] **Step 3: Verify markup validity and existing structural tests**

Run: `cd apps/web && npm run dev -- --port 5190 &` then in another shell `curl -s http://localhost:5190/ | grep -c 'toolbar-group'` — expect `6` (one brand+mode group, four in `#toolbar-actions`, one... actually count the groups: 1 (brand/mode, outside `#toolbar-actions`) + 4 (inside `#toolbar-actions`) + 3 (inside `#diagram-toolbar-actions`) = 8). Expected: `8`. Stop the dev server afterward (`kill %1` or find the PID via `lsof -ti:5190`).

This task intentionally leaves `main.ts` referencing now-removed ids (`#export-svg`, `#engine-override`, etc.) — the app will throw at runtime until Tasks 4–6 land. Do not run the full Playwright suite yet; that happens at the end of Task 6.

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html
git commit -m "feat(web): restructure toolbar into grouped clusters with icons and responsive wrap"
```

---

### Task 4: Wire the Text-mode export menu into `main.ts`

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: `createExportMenu` from Task 2 (`apps/web/src/exportMenu.js`).
- Produces: module-level `textExportMenu: ExportMenuHandle`, mounted into `#export-menu-container` (from Task 3).

- [ ] **Step 1: Update the failing e2e assertions first**

In `apps/web/test/e2e/live-render.spec.ts`, replace every reference to the old individual export buttons with the new menu. Apply these replacements (search for each old block, replace with the new one):

Replace:
```ts
  await expect(page.locator('#export-svg')).toBeEnabled();
  await expect(page.locator('#export-xml')).toBeDisabled();
  await expect(page.locator('#export-drawio')).toBeEnabled();
  await expect(page.locator('#family-badge')).toHaveText('Mindmap');
```
(in the `'typing a mindmap...'` test) with:
```ts
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#export-item-structured')).toBeVisible();
  await expect(page.locator('#family-badge-label')).toHaveText('Mindmap');
```

Apply the same pattern (svg present, xml absent when not bpmn, structured present/absent per test) to the `'typing a flowchart...'`, `'typing an architecture diagram...'` tests, and change every other `#family-badge` text assertion in this file to `#family-badge-label`.

Replace the `'mindmap draw.io export is reachable from the toolbar'` test body with:
```ts
test('mindmap draw.io export is reachable from the toolbar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: mindmap\nmindmap "Roadmap" as root\n  mindmap as child');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-structured')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-structured').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.drawio');
});
```

Replace the `'flowchart draw.io export is reachable from the toolbar'` test body with:
```ts
test('flowchart draw.io export is reachable from the toolbar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: flowchart\nbox "Start" as start\ndecision "Approved?" as approved\nstart -> approved');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-structured')).toHaveText('Export draw.io XML');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-structured').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.drawio');
});
```

In the `'typing an architecture diagram...'` test, replace:
```ts
  await expect(page.locator('#export-svg')).toBeEnabled();
  await expect(page.locator('#export-xml')).toBeDisabled();
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await expect(page.locator('#export-drawio')).toBeEnabled();
  await expect(page.locator('#export-drawio')).toHaveText('Export draw.io XML');
```
with:
```ts
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#export-item-structured')).toHaveText('Export draw.io XML');
```

Replace the `'export buttons are disabled on error and enabled for a valid diagram, and trigger real downloads'` test with:
```ts
test('export menu is empty on error and populated for a valid diagram, and triggers real downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);
  await expect(page.locator('#export-menu-btn')).toBeDisabled();

  await editor.fill('task "Review" as n1');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-xml')).toBeVisible();

  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  const xmlContent = Buffer.concat(xmlChunks).toString('utf-8');
  expect(xmlContent).toContain('<bpmn2:definitions');
  expect(xmlContent).toContain('bpmn2:task');

  await page.locator('#export-menu-btn').click();
  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});
```

Replace the `'download links are attached...'` test's final interaction:
```ts
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-svg').click(),
  ]);
```
with:
```ts
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-svg').click(),
  ]);
```

Replace the `'clear button empties the editor...'` test's assertions:
```ts
  await expect(page.locator('#export-svg')).toBeEnabled();
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible();

  await page.locator('#clear-btn').click();

  await expect(page.locator('#editor')).toHaveValue('');
  await expect(page.locator('#export-svg')).toBeEnabled();
  await expect(page.locator('#export-xml')).toBeDisabled();
```
with:
```ts
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible();

  await page.locator('#clear-btn').click();

  await expect(page.locator('#editor')).toHaveValue('');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
```

Replace the two `#export-svg` assertions in `'empty but valid BPMN and flowchart diagrams remain renderable for SVG export'` with `await expect(page.locator('#export-menu-btn')).toBeEnabled();` each.

Delete the `'engine override toggle forces a specific layout engine and persists across reload'` test entirely from this file — it moves to `apps/web/test/e2e/panel-layout.spec.ts` in Task 6, since the control moves into Settings.

- [ ] **Step 2: Run the e2e file to confirm it now fails against the current (unmodified) `main.ts`**

Run: `cd apps/web && npx playwright test test/e2e/live-render.spec.ts`
Expected: FAIL (multiple tests — `#export-menu-btn` doesn't exist yet in `main.ts`'s wiring, and `main.ts` currently still references the now-removed `#export-svg` element from Task 3, so the app likely throws on load). This confirms the test changes exercise real behavior, not a tautology.

- [ ] **Step 2: Update `main.ts`**

Replace the element lookups:
```ts
const exportSvgBtn = document.querySelector<HTMLButtonElement>('#export-svg')!;
const exportXmlBtn = document.querySelector<HTMLButtonElement>('#export-xml')!;
const exportDrawioBtn = document.querySelector<HTMLButtonElement>('#export-drawio')!;
```
with:
```ts
const familyBadgeLabel = document.querySelector<HTMLSpanElement>('#family-badge-label')!;
const exportMenuContainer = document.querySelector<HTMLDivElement>('#export-menu-container')!;
```

Add the import at the top of the file, alongside the other local imports:
```ts
import { createExportMenu, type ExportMenuItem } from './exportMenu.js';
```

Right after the existing panel-mount block:
```ts
mountReviewPanel(document.querySelector('#preview-container')!);
mountGeneratePanel(document.querySelector('#preview-container')!);
mountImportPanel(document.querySelector('#import-panel-container')!);
mountSettingsPanel(document.querySelector('#settings-panel-container')!);
```
add:
```ts
const textExportMenu = createExportMenu('export-menu');
exportMenuContainer.appendChild(textExportMenu.container);
```

In the error branch of `rerender()`, replace:
```ts
    familyBadge.textContent = familyLabel(result.family);
    exportSvgBtn.disabled = true;
    exportXmlBtn.disabled = true;
    exportDrawioBtn.disabled = true;
    editAsDiagramBtn.disabled = true;
```
with:
```ts
    familyBadgeLabel.textContent = familyLabel(result.family);
    textExportMenu.setItems([]);
    editAsDiagramBtn.disabled = true;
```

In the success branch of `rerender()`, replace:
```ts
  engineBadge.textContent = result.engineName!;
  familyBadge.textContent = familyLabel(result.family);
  familyBadge.title = result.family === 'bpmn'
    ? 'BPMN: BPMN editor and BPMN XML export available.'
    : result.family === 'mindmap'
      ? 'Mindmap: SVG and draw.io export available; BPMN editor/XML unavailable.'
      : result.family === null
        ? 'No supported diagram family detected.'
        : `${familyLabel(result.family)}: SVG export available; BPMN editor/XML unavailable.`;
  const isBpmnDiagram = Boolean(result.diagram && result.diagram.nodes.length > 0);
  const isRenderable = Boolean(result.svg);
  exportSvgBtn.disabled = !isRenderable;
  exportXmlBtn.disabled = !isBpmnDiagram || result.family !== 'bpmn' || !result.capabilities?.structuredExport.includes('bpmn-xml');
  const structuredExport = firstStructuredExport(result.capabilities);
  exportDrawioBtn.disabled = structuredExport === null;
  exportDrawioBtn.textContent = structuredExport ? `Export ${structuredExport.label}` : 'Export draw.io';
  exportDrawioBtn.title = structuredExport ? '' : `${familyLabel(result.family)} has no structured export available.`;
  editAsDiagramBtn.disabled = !isBpmnDiagram || result.capabilities?.editorMode !== 'bpmn-js';
```
with:
```ts
  engineBadge.textContent = result.engineName!;
  familyBadgeLabel.textContent = familyLabel(result.family);
  familyBadge.title = result.family === 'bpmn'
    ? 'BPMN: BPMN editor and BPMN XML export available.'
    : result.family === 'mindmap'
      ? 'Mindmap: SVG and draw.io export available; BPMN editor/XML unavailable.'
      : result.family === null
        ? 'No supported diagram family detected.'
        : `${familyLabel(result.family)}: SVG export available; BPMN editor/XML unavailable.`;
  const isBpmnDiagram = Boolean(result.diagram && result.diagram.nodes.length > 0);
  const isRenderable = Boolean(result.svg);
  const structuredExport = firstStructuredExport(result.capabilities);
  const canExportXml = isBpmnDiagram && result.family === 'bpmn' && Boolean(result.capabilities?.structuredExport.includes('bpmn-xml'));
  const exportItems: ExportMenuItem[] = [];
  if (isRenderable) {
    exportItems.push({
      id: 'export-item-svg',
      label: 'Export SVG',
      onClick: () => {
        if (!lastResult?.svg) return;
        downloadFile('diagram.svg', lastResult.svg, 'image/svg+xml');
      },
    });
  }
  if (canExportXml) {
    exportItems.push({
      id: 'export-item-xml',
      label: 'Export BPMN XML',
      onClick: () => {
        if (!lastResult?.diagram || !lastResult.positioned || !lastResult.family) return;
        try {
          const xml = exportPositionedDiagram(lastResult.family, lastResult.diagram, lastResult.positioned, 'bpmn-xml');
          downloadFile('diagram.bpmn', xml, 'application/xml');
        } catch (err) {
          renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
        }
      },
    });
  }
  if (structuredExport) {
    exportItems.push({
      id: 'export-item-structured',
      label: `Export ${structuredExport.label}`,
      onClick: () => {
        void (async () => {
          try {
            const xml = await exportStructuredDiagram(editor.value, structuredExport.format);
            downloadFile(`diagram${structuredExport.fileExtension}`, xml, structuredExport.mimeType);
          } catch (err) {
            renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
          }
        })();
      },
    });
  }
  textExportMenu.setItems(exportItems);
  editAsDiagramBtn.disabled = !isBpmnDiagram || result.capabilities?.editorMode !== 'bpmn-js';
```

Delete the now-orphaned standalone listeners near the bottom of the file:
```ts
exportSvgBtn.addEventListener('click', () => {
  if (!lastResult?.svg) return;
  downloadFile('diagram.svg', lastResult.svg, 'image/svg+xml');
});

exportXmlBtn.addEventListener('click', () => {
  if (!lastResult?.diagram || !lastResult.positioned || !lastResult.family) return;
  try {
    const xml = exportPositionedDiagram(lastResult.family, lastResult.diagram, lastResult.positioned, 'bpmn-xml');
    downloadFile('diagram.bpmn', xml, 'application/xml');
  } catch (err) {
    renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
  }
});

exportDrawioBtn.addEventListener('click', async () => {
  const structuredExport = lastResult && firstStructuredExport(lastResult.capabilities);
  if (!structuredExport) return;
  try {
    const xml = await exportStructuredDiagram(editor.value, structuredExport.format);
    downloadFile(`diagram${structuredExport.fileExtension}`, xml, structuredExport.mimeType);
  } catch (err) {
    renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
  }
});
```
(their logic now lives inline in the `exportItems` closures above — deleting these avoids referencing the removed `exportSvgBtn`/`exportXmlBtn`/`exportDrawioBtn` identifiers, which would otherwise be TypeScript compile errors).

- [ ] **Step 3: Run the e2e file to confirm it passes**

Run: `cd apps/web && npx playwright test test/e2e/live-render.spec.ts`
Expected: PASS. (The `#engine-override`-dependent test was deleted in Step 1 and is not expected to pass here — Task 6 re-adds it against Settings.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/main.ts apps/web/test/e2e/live-render.spec.ts
git commit -m "feat(web): consolidate Text-mode export buttons into one Export menu"
```

---

### Task 5: Wire the Diagram-mode export menu into `main.ts`

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/diagram-mode.spec.ts`

**Interfaces:**
- Consumes: `createExportMenu` (Task 2), `#diagram-export-menu-container` (Task 3).
- Produces: module-level `diagramExportMenu: ExportMenuHandle`.

- [ ] **Step 1: Update the failing e2e assertions first**

In `apps/web/test/e2e/diagram-mode.spec.ts`, the test `'Open loads a valid .bpmn file exported from Text mode'` currently downloads via `#export-xml` (Text mode's old button). Replace:
```ts
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-xml').click(),
  ]);
```
with:
```ts
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-xml').click(),
  ]);
```

Replace the `'New Diagram clears a malformed Open error and enables diagram actions'` test's tail:
```ts
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-xml')).toBeEnabled();
  await expect(page.locator('#diagram-export-svg')).toBeEnabled();
```
with:
```ts
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeEnabled();
```

Replace the `'Save, Export XML, and Export SVG are disabled until a diagram is loaded, then trigger downloads'` test body with:
```ts
test('Save and the Export menu are disabled until a diagram is loaded, then trigger downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-save')).toBeDisabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeDisabled();

  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeEnabled();

  const [saveDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-save').click(),
  ]);
  expect(saveDownload.suggestedFilename()).toBe('diagram.bpmn');

  await page.locator('#diagram-export-menu-btn').click();
  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-item-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  expect(Buffer.concat(xmlChunks).toString('utf-8')).toContain('bpmn:definitions');

  await page.locator('#diagram-export-menu-btn').click();
  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-item-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});
```

- [ ] **Step 2: Run the e2e file to confirm it fails against the current `main.ts`**

Run: `cd apps/web && npx playwright test test/e2e/diagram-mode.spec.ts`
Expected: FAIL — `#diagram-export-menu-btn` doesn't exist yet.

- [ ] **Step 3: Update `main.ts`**

Replace:
```ts
const diagramExportXmlBtn = document.querySelector<HTMLButtonElement>('#diagram-export-xml')!;
const diagramExportSvgBtn = document.querySelector<HTMLButtonElement>('#diagram-export-svg')!;
```
with:
```ts
const diagramExportMenuContainer = document.querySelector<HTMLDivElement>('#diagram-export-menu-container')!;
```

Right after `const textExportMenu = ...; exportMenuContainer.appendChild(...)` (added in Task 4), add:
```ts
const diagramExportMenu = createExportMenu('diagram-export-menu');
diagramExportMenuContainer.appendChild(diagramExportMenu.container);
diagramExportMenu.setItems([
  {
    id: 'diagram-export-item-xml',
    label: 'Export BPMN XML',
    onClick: () => void exportDiagramXmlFile(),
  },
  {
    id: 'diagram-export-item-svg',
    label: 'Export SVG',
    onClick: () => {
      void (async () => {
        try {
          const svg = await exportSvg();
          downloadFile('diagram.svg', svg, 'image/svg+xml');
        } catch (err) {
          renderDiagramErrors([err instanceof Error ? err.message : String(err)]);
        }
      })();
    },
  },
]);
```
(this block must come after `exportDiagramXmlFile` is declared as a function — `exportDiagramXmlFile` is a hoisted `async function` declared earlier in the file, so ordering here is only a readability concern, not a correctness one; place it directly after the `textExportMenu`/`exportMenuContainer` lines from Task 4 for locality with the other menu setup).

Replace `setDiagramButtonsEnabled`:
```ts
function setDiagramButtonsEnabled(enabled: boolean): void {
  diagramSaveBtn.disabled = !enabled;
  diagramExportXmlBtn.disabled = !enabled;
  diagramExportSvgBtn.disabled = !enabled;
  diagramImportTextBtn.disabled = !enabled;
  if (!enabled) {
    importVisible = false;
    hideImportPanel();
  }
}
```
with:
```ts
function setDiagramButtonsEnabled(enabled: boolean): void {
  diagramSaveBtn.disabled = !enabled;
  diagramExportMenu.setDisabled(!enabled);
  diagramImportTextBtn.disabled = !enabled;
  if (!enabled) {
    importVisible = false;
    hideImportPanel();
  }
}
```

Delete the now-orphaned listeners:
```ts
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
replacing with just:
```ts
diagramSaveBtn.addEventListener('click', () => exportDiagramXmlFile());
```
(the XML/SVG export logic now lives in the `diagramExportMenu.setItems([...])` call above).

- [ ] **Step 4: Run the e2e file to confirm it passes**

Run: `cd apps/web && npx playwright test test/e2e/diagram-mode.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.ts apps/web/test/e2e/diagram-mode.spec.ts
git commit -m "feat(web): consolidate Diagram-mode export buttons into one Export menu"
```

---

### Task 6: Relocate the layout-engine picker into Settings

**Files:**
- Modify: `apps/web/src/settingsPanel.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/live-render.spec.ts`
- Modify: `apps/web/test/e2e/panel-layout.spec.ts`

**Interfaces:**
- Produces: `settingsPanel.ts` exports `getEngineOverrideSelect(): HTMLSelectElement`.

- [ ] **Step 1: Update the failing e2e assertions first**

In `apps/web/test/e2e/live-render.spec.ts`, the `'typing a flowchart...'` test currently checks `#engine-override`'s title directly in the toolbar:
```ts
  await expect(page.locator('#engine-override')).toHaveAttribute('title', 'Flowchart layout does not support BPMN engine overrides.');
```
Replace with:
```ts
  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toHaveAttribute('title', 'Flowchart layout does not support BPMN engine overrides.');
  await page.locator('#settings-btn').click();
```

In `apps/web/test/e2e/panel-layout.spec.ts`, add the (moved, previously deleted from `live-render.spec.ts` in Task 4) engine-override test, adapted to open Settings first:
```ts
test('engine override in Settings forces a specific layout engine and persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('flat');

  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toBeVisible();
  await page.locator('#engine-override').selectOption('swimlane');
  await page.waitForTimeout(400);
  await expect(page.locator('#engine-badge')).toHaveText('swimlane');

  await page.reload();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toHaveValue('swimlane');
  await expect(page.locator('#engine-badge')).toHaveText('swimlane');
});
```

- [ ] **Step 2: Run both files to confirm they fail against the current code**

Run: `cd apps/web && npx playwright test test/e2e/live-render.spec.ts test/e2e/panel-layout.spec.ts`
Expected: FAIL — `#engine-override` doesn't exist inside `#settings-panel` yet (it's still, per Task 3, entirely removed from the DOM until this task adds it back inside Settings).

- [ ] **Step 3: Add the select to `settingsPanel.ts`**

In `apps/web/src/settingsPanel.ts`, add a module-level element reference near the top (after the existing storage-key constants):
```ts
let engineOverrideSelectEl: HTMLSelectElement | null = null;

export function getEngineOverrideSelect(): HTMLSelectElement {
  return ensurePanel().querySelector<HTMLSelectElement>('#engine-override')!;
}
```

Inside `ensurePanel()`, after the existing `header`/`hint` block and before the AI-provider `settingsEl` is appended, insert a section label and the new layout section:
```ts
  const aiSectionLabel = document.createElement('div');
  aiSectionLabel.className = 'settings-section-label';
  aiSectionLabel.textContent = 'AI Provider';
  panelEl.appendChild(aiSectionLabel);
```
(place this immediately before the existing `const settingsEl = document.createElement('div'); settingsEl.className = 'review-settings';` block, so the AI-provider fields now sit under an explicit "AI Provider" label).

Then, after `panelEl.appendChild(settingsEl);` (the end of the existing AI-provider block), add:
```ts
  const layoutSectionLabel = document.createElement('div');
  layoutSectionLabel.className = 'settings-section-label';
  layoutSectionLabel.textContent = 'Layout';
  panelEl.appendChild(layoutSectionLabel);

  const layoutEl = document.createElement('div');
  layoutEl.className = 'review-settings';

  const engineLabel = document.createElement('label');
  engineLabel.textContent = 'Layout engine';
  engineOverrideSelectEl = document.createElement('select');
  engineOverrideSelectEl.id = 'engine-override';
  engineOverrideSelectEl.className = 'toolbar-btn';
  engineOverrideSelectEl.setAttribute('aria-label', 'Layout engine override');
  engineOverrideSelectEl.innerHTML = `
    <option value="">Auto</option>
    <option value="flat">Flat</option>
    <option value="swimlane">Swimlane</option>
  `;

  layoutEl.append(engineLabel, engineOverrideSelectEl);
  panelEl.appendChild(layoutEl);

  const layoutHint = document.createElement('div');
  layoutHint.className = 'settings-hint';
  layoutHint.textContent = 'Chooses which BPMN layout engine renders the diagram. Only applies to families that support an override — the hint on the field itself explains when it doesn\'t.';
  panelEl.appendChild(layoutHint);
```

Add the matching CSS to `apps/web/index.html`, right after the existing `#settings-panel .settings-hint { ... }` rule:
```css
      .settings-section-label {
        padding: 10px 16px 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
```

- [ ] **Step 4: Update `main.ts`**

Replace the top-level lookup:
```ts
const engineOverrideSelect = document.querySelector<HTMLSelectElement>('#engine-override')!;
```
by deleting that line entirely from its current position (near the top with the other `document.querySelector` consts).

Import `getEngineOverrideSelect` alongside the other `settingsPanel.js` imports (currently `import { mountSettingsPanel, showSettingsPanel, hideSettingsPanel } from './settingsPanel.js';`):
```ts
import { mountSettingsPanel, showSettingsPanel, hideSettingsPanel, getEngineOverrideSelect } from './settingsPanel.js';
```

Move the engine-override init block. Delete it from its current location:
```ts
const ENGINE_OVERRIDE_STORAGE_KEY = 'bpm.engineOverride';
engineOverrideSelect.value = localStorage.getItem(ENGINE_OVERRIDE_STORAGE_KEY) ?? '';
```
and delete the later `change` listener:
```ts
engineOverrideSelect.addEventListener('change', () => {
  localStorage.setItem(ENGINE_OVERRIDE_STORAGE_KEY, engineOverrideSelect.value);
  rerender();
});
```

Re-add all three (the `const engineOverrideSelect = ...` declaration plus both blocks above) together, right after `mountSettingsPanel(document.querySelector('#settings-panel-container')!);`:
```ts
mountSettingsPanel(document.querySelector('#settings-panel-container')!);

const ENGINE_OVERRIDE_STORAGE_KEY = 'bpm.engineOverride';
const engineOverrideSelect = getEngineOverrideSelect();
engineOverrideSelect.value = localStorage.getItem(ENGINE_OVERRIDE_STORAGE_KEY) ?? '';
engineOverrideSelect.addEventListener('change', () => {
  localStorage.setItem(ENGINE_OVERRIDE_STORAGE_KEY, engineOverrideSelect.value);
  rerender();
});
```

Everything else that reads `engineOverrideSelect` (the `rerender()` body's `.disabled`/`.title` updates, and `runPipeline(editor.value, engineOverrideSelect.value || undefined)`) is inside function bodies that only execute after `bootstrapProject()` runs at the very end of the file, so no other changes are needed — they resolve the same `const engineOverrideSelect` binding regardless of where in the module its declaration physically sits, as long as it's declared before first use at runtime (which it now is, since `mountSettingsPanel` and this block run near the top of the script's synchronous execution, well before `bootstrapProject()` triggers the first `rerender()`).

- [ ] **Step 5: Run both e2e files to confirm they pass**

Run: `cd apps/web && npx playwright test test/e2e/live-render.spec.ts test/e2e/panel-layout.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/settingsPanel.ts apps/web/src/main.ts apps/web/test/e2e/live-render.spec.ts apps/web/test/e2e/panel-layout.spec.ts apps/web/index.html
git commit -m "feat(web): move layout-engine picker from toolbar into Settings"
```

---

### Task 7: Apply the shared panel header (with close button) to all four panels

**Files:**
- Modify: `apps/web/src/settingsPanel.ts`
- Modify: `apps/web/src/generatePanel.ts`
- Modify: `apps/web/src/importPanel.ts`
- Modify: `apps/web/src/reviewPanel.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/panel-layout.spec.ts`

**Interfaces:**
- Consumes: `createPanelHeader` from Task 1.
- Produces: each panel module exports `setCloseHandler(fn: () => void): void`.

- [ ] **Step 1: Write the failing e2e test**

In `apps/web/test/e2e/panel-layout.spec.ts`, add:
```ts
test('each panel close button closes the panel and syncs the toolbar toggle state', async ({ page }) => {
  await page.goto('/');

  await page.locator('#review-btn').click();
  await expect(page.locator('#review-panel')).toBeVisible();
  await page.locator('#review-panel .panel-close-btn').click();
  await expect(page.locator('#review-panel')).toBeHidden();
  await expect(page.locator('#review-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel')).toBeVisible();
  await page.locator('#generate-panel .panel-close-btn').click();
  await expect(page.locator('#generate-panel')).toBeHidden();
  await expect(page.locator('#generate-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.locator('#settings-panel .panel-close-btn').click();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(page.locator('#settings-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();
  await page.locator('#diagram-import-text').click();
  await expect(page.locator('#import-panel')).toBeVisible();
  await page.locator('#import-panel .panel-close-btn').click();
  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(page.locator('#diagram-import-text')).toHaveAttribute('aria-pressed', 'false');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd apps/web && npx playwright test test/e2e/panel-layout.spec.ts -g "close button"`
Expected: FAIL — no `.panel-close-btn` exists in any panel yet.

- [ ] **Step 3: Update `settingsPanel.ts`**

Add near the top, with the other module state:
```ts
let onClose: (() => void) | null = null;

export function setCloseHandler(fn: () => void): void {
  onClose = fn;
}
```

Replace:
```ts
  const header = document.createElement('div');
  header.className = 'review-header';
  header.textContent = 'AI Provider Settings';
  panelEl.appendChild(header);
```
with:
```ts
  const header = createPanelHeader('Settings', () => onClose?.());
  panelEl.appendChild(header.el);
```

Add the import at the top of the file:
```ts
import { createPanelHeader } from './panelHeader.js';
```

(The panel title changes from "AI Provider Settings" to "Settings" since the panel now has two sections — AI Provider and Layout — so a section-spanning title reads better; each section already gets its own `.settings-section-label` from Task 6.)

- [ ] **Step 4: Update `generatePanel.ts`**

Add the same `onClose`/`setCloseHandler` pair near its module state, and the same `createPanelHeader` import. Replace:
```ts
  const header = document.createElement('div');
  header.className = 'review-header';
  header.textContent = 'Generate from description';
  panelEl.appendChild(header);
```
with:
```ts
  const header = createPanelHeader('Generate from description', () => onClose?.());
  panelEl.appendChild(header.el);
```

- [ ] **Step 5: Update `importPanel.ts`**

Same pattern. Replace:
```ts
  const header = document.createElement('div');
  header.className = 'review-header';
  header.textContent = 'Import to Text';
  panelEl.appendChild(header);
```
with:
```ts
  const header = createPanelHeader('Import to Text', () => onClose?.());
  panelEl.appendChild(header.el);
```

- [ ] **Step 6: Update `reviewPanel.ts`** (the tricky one — its header is today rebuilt on every finding update instead of created once)

Add the `onClose`/`setCloseHandler` pair and the `createPanelHeader` import as above, plus a module-level handle:
```ts
let reviewHeader: ReturnType<typeof createPanelHeader> | null = null;
```

In `ensurePanel()`, insert right at the start of the function body (before `settingsEl = document.createElement('div');`):
```ts
  reviewHeader = createPanelHeader('Review', () => onClose?.());
  panelEl.appendChild(reviewHeader.el);
```

In `updateReviewPanel()`, replace:
```ts
  if (!findingsContainer) return;
  findingsContainer.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'review-header';
  header.textContent = `Review (${findings.length} finding${findings.length !== 1 ? 's' : ''})`;
  findingsContainer.appendChild(header);

  for (const f of findings) {
```
with:
```ts
  if (!findingsContainer) return;
  findingsContainer.innerHTML = '';
  reviewHeader?.setTitle(`Review (${findings.length} finding${findings.length !== 1 ? 's' : ''})`);

  for (const f of findings) {
```

In `appendFindings()`, replace the trailing block:
```ts
  const header = panelEl?.querySelector('.review-header');
  if (header) {
    const total = findingsContainer.querySelectorAll('.review-item').length;
    header.textContent = `Review (${total} finding${total !== 1 ? 's' : ''})`;
  }
```
with:
```ts
  const total = findingsContainer.querySelectorAll('.review-item').length;
  reviewHeader?.setTitle(`Review (${total} finding${total !== 1 ? 's' : ''})`);
```

- [ ] **Step 7: Wire the close handlers from `main.ts`**

Import each module's `setCloseHandler`, aliased per module (they share the same exported name):
```ts
import { mountReviewPanel, updateReviewPanel, hideReviewPanel, setApplyPatchHandler, setSourceTextGetter, analyzeForReview, setCloseHandler as setReviewCloseHandler } from './reviewPanel.js';
import { mountGeneratePanel, showGeneratePanel, hideGeneratePanel, setInsertTextHandler, setCloseHandler as setGenerateCloseHandler } from './generatePanel.js';
import { mountImportPanel, showImportPanel, hideImportPanel, setImportInsertHandler, setCloseHandler as setImportCloseHandler } from './importPanel.js';
import { mountSettingsPanel, showSettingsPanel, hideSettingsPanel, getEngineOverrideSelect, setCloseHandler as setSettingsCloseHandler } from './settingsPanel.js';
```
(these replace the existing separate import lines for these four modules — merge the new `setCloseHandler as ...` name into each module's existing import statement rather than duplicating a second `import` line per module.)

Right after the panel-mount block (where `textExportMenu`/`diagramExportMenu` were also added in Tasks 4–5), add:
```ts
setReviewCloseHandler(() => reviewBtn.click());
setGenerateCloseHandler(() => generateBtn.click());
setSettingsCloseHandler(() => settingsBtn.click());
setImportCloseHandler(() => diagramImportTextBtn.click());
```

- [ ] **Step 8: Run to confirm the new test passes, then run the full e2e suite**

Run: `cd apps/web && npx playwright test test/e2e/panel-layout.spec.ts -g "close button"`
Expected: PASS.

Run: `cd apps/web && npx playwright test`
Expected: all tests PASS (this is the first full-suite run since Task 3 started; it exercises every prior task's changes together).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/settingsPanel.ts apps/web/src/generatePanel.ts apps/web/src/importPanel.ts apps/web/src/reviewPanel.ts apps/web/src/main.ts apps/web/test/e2e/panel-layout.spec.ts
git commit -m "feat(web): add close buttons to Review/Generate/Settings/Import panel headers"
```

---

### Task 8: Toolbar-level regression tests and final verification

**Files:**
- Create: `apps/web/test/e2e/toolbar-groups.spec.ts`

**Interfaces:**
- Consumes: nothing new — exercises the finished toolbar from Tasks 3–7.

- [ ] **Step 1: Write the new toolbar tests**

```ts
// apps/web/test/e2e/toolbar-groups.spec.ts
import { test, expect } from '@playwright/test';

test('toolbar wraps onto additional lines instead of clipping controls at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/');
  const toolbar = page.locator('#toolbar');
  const box = (await toolbar.boundingBox())!;
  expect(box.height).toBeGreaterThan(44);
  await expect(page.locator('#clear-btn')).toBeVisible();
  await expect(page.locator('#fullscreen-btn')).toBeVisible();
  await expect(page.locator('#edit-as-diagram')).toBeVisible();
});

test('mode toggle buttons render an icon before their label', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mode-text-btn svg')).toBeVisible();
  await expect(page.locator('#mode-diagram-btn svg')).toBeVisible();
});

test('Review/Generate/Settings render as a connected segmented group', async ({ page }) => {
  await page.goto('/');
  const group = page.locator('.segmented-group');
  await expect(group).toBeVisible();
  await expect(group.locator('#review-btn')).toBeVisible();
  await expect(group.locator('#generate-btn')).toBeVisible();
  await expect(group.locator('#settings-btn')).toBeVisible();
});
```

- [ ] **Step 2: Run to verify all three pass**

Run: `cd apps/web && npx playwright test test/e2e/toolbar-groups.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Run the complete verification matrix**

Run from the repo root: `npm test`
Expected: PASS (all vitest suites across every workspace package, including the two new `apps/web/test/panelHeader.test.ts` and `apps/web/test/exportMenu.test.ts` files).

Run: `cd apps/web && npx playwright test`
Expected: PASS (full e2e suite, including every file touched in Tasks 3–8).

Run: `cd apps/web && npm run build`
Expected: succeeds with no TypeScript errors — this is the first full production build since `main.ts` was restructured across Tasks 4–7, and will catch any leftover reference to a deleted identifier (e.g. `exportSvgBtn`) that an individual test file didn't happen to exercise.

- [ ] **Step 4: Commit**

```bash
git add apps/web/test/e2e/toolbar-groups.spec.ts
git commit -m "test(web): add toolbar grouping/wrap/icon regression coverage"
```
