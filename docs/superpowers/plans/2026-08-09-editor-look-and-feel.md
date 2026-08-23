# Editor Look and Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the live editor (`apps/web`) a real visual identity (technical/blueprint, dark-first with a light variant) and wire in the SVG/BPMN-XML export actions the pipeline can already produce but has no UI surface for.

**Architecture:** Three additive layers, each independently testable: (1) `pipeline.ts` starts returning the already-computed `diagram`/`positioned`/`engineName` instead of discarding them, (2) `index.html`'s structure and CSS get redesigned around a toolbar + error strip + two panes, with `main.ts` driving the dynamic states (badge text, button enable/disable, error strip visibility, stale-preview dimming), (3) a small `downloads.ts` helper plus two button click handlers wire in client-side file downloads for SVG and BPMN XML.

**Tech Stack:** No new runtime dependencies beyond `@bpm/export-xml` (already built, already tested, just not yet consumed by `apps/web`). Plain CSS custom properties for theming (no CSS framework). Verification via the existing Vitest unit-test setup (`apps/web/test/pipeline.test.ts`) for Task 1, and the existing Playwright e2e setup (`apps/web/test/e2e/live-render.spec.ts`) for Tasks 2 and 3 — download-triggering behavior is a real-browser concern, so it's verified with Playwright's `page.waitForEvent('download')` rather than adding a new jsdom test environment just for two small DOM-triggering functions.

## Global Constraints

- Dark theme is the default; light theme applies via `prefers-color-scheme: light` only — no manual toggle in this pass (per the approved design spec).
- The rendered diagram SVG itself (black ink on white, from `@bpm/render`) stays completely unthemed — it's a deliberate visual contrast with the app chrome, not something to restyle per dark/light mode.
- No draggable pane resizer, no code-editor component (line numbers/syntax highlighting), no manual theme toggle — all explicitly deferred per the spec's "Deferred" section.
- The project's existing "never blank the preview" behavior (last valid diagram stays visible on parse error) must not change — only its visual presentation (dimming) is new.
- Export buttons must be disabled whenever the current text has parse errors (nothing valid to export), enabled otherwise.

---

## Task 1: Pipeline exposes `diagram`, `positioned`, and `engineName`

**Files:**
- Modify: `packages/layout/src/index.ts`
- Modify: `apps/web/src/pipeline.ts`
- Modify: `apps/web/test/pipeline.test.ts`

**Interfaces:**
- Consumes: `selectEngine(diagram: Diagram): LayoutEngine` from `@bpm/layout-core` (already exists, exported via `packages/layout-core/src/index.ts:7`); `LayoutEngine.name: string`.
- Produces: `PipelineResult` gains `diagram: Diagram | null`, `positioned: PositionedDiagram | null`, `engineName: string | null` — consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/pipeline.test.ts`:

```ts
it('exposes the diagram, positioned layout, and selected engine name for a valid diagram', async () => {
  const result = await runPipeline('task "Review" as n1');
  expect(result.errors).toEqual([]);
  expect(result.diagram).not.toBeNull();
  expect(result.diagram!.nodes).toHaveLength(1);
  expect(result.positioned).not.toBeNull();
  expect(result.engineName).toBe('flat');
});

it('leaves diagram, positioned, and engineName null when there are parse errors', async () => {
  const result = await runPipeline('layout: bogus\ntask "Review" as n1');
  expect(result.diagram).toBeNull();
  expect(result.positioned).toBeNull();
  expect(result.engineName).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @bpm/web`
Expected: FAIL — `result.diagram` is `undefined`, not present on the current `PipelineResult` type (TypeScript compile error surfaces as a test failure since `diagram`/`positioned`/`engineName` don't exist yet).

- [ ] **Step 3: Re-export `selectEngine` from `@bpm/layout`**

`@bpm/layout`'s `layout()` (`packages/layout/src/index.ts`) already calls `selectEngine(diagram)` internally and discards the result's `name`. Add a re-export so callers can ask the same question without duplicating the registry:

```ts
// packages/layout/src/index.ts — add alongside the existing exports at the bottom of the file:
export { selectEngine } from '@bpm/layout-core';
```

- [ ] **Step 4: Extend `PipelineResult` and `runPipeline`**

```ts
// apps/web/src/pipeline.ts — full replacement
import { parse } from '@bpm/parser';
import { layout, selectEngine } from '@bpm/layout';
import { render } from '@bpm/render';
import type { ParseError } from '@bpm/parser';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';

export interface PipelineResult {
  svg: string | null;
  diagram: Diagram | null;
  positioned: PositionedDiagram | null;
  engineName: string | null;
  errors: ParseError[];
}

export async function runPipeline(text: string): Promise<PipelineResult> {
  const { diagram, errors } = parse(text);
  if (errors.length > 0) {
    return { svg: null, diagram: null, positioned: null, engineName: null, errors };
  }
  try {
    const engineName = selectEngine(diagram).name;
    const positioned = await layout(diagram);
    const svg = render(positioned);
    return { svg, diagram, positioned, engineName, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { svg: null, diagram: null, positioned: null, engineName: null, errors: [{ line: 1, column: 1, message }] };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @bpm/web` and `npm test -w @bpm/layout` (the re-export doesn't change `@bpm/layout`'s existing test behavior, but confirm its own suite still passes)
Expected: PASS, all tests including the two new ones.

- [ ] **Step 6: Run the full repo suite to confirm no regression**

Run: `npm run build && npm test` (from repo root)
Expected: 100% green — this is a purely additive change to `PipelineResult`'s shape, no existing consumer's behavior changes.

- [ ] **Step 7: Commit**

```bash
git add packages/layout/src/index.ts apps/web/src/pipeline.ts apps/web/test/pipeline.test.ts
git commit -m "feat(web): expose diagram, positioned layout, and engine name from pipeline"
```

---

## Task 2: Visual redesign — toolbar, panes, error strip, dark/light theme

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: `PipelineResult` from Task 1 (`diagram`, `positioned`, `engineName` fields — `positioned`/`diagram` are read but not yet used here; wired to export buttons in Task 3).
- Produces: new DOM structure/ids (`#toolbar`, `#engine-badge`, `#export-svg`, `#export-xml`, `#errors` restructured to hold discrete error-item elements, `.stale` class toggled on `#preview`) that Task 3's click handlers attach to.

- [ ] **Step 1: Write the failing e2e assertions**

Extend `apps/web/test/e2e/live-render.spec.ts` (add these to the existing file, don't replace the two existing tests — they keep passing against the new markup since `#editor`, `#preview`, `#errors` ids are preserved):

```ts
test('toolbar shows the auto-selected engine name and the editor uses monospace styling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('flat'); // starter text has no pools
  await expect(page.locator('#toolbar')).toBeVisible();
  const fontFamily = await page.locator('#editor').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('mono');
});

test('invalid text dims the stale preview and shows a structured error item', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);

  await expect(page.locator('#preview')).toHaveClass(/stale/);
  await expect(page.locator('.error-item .error-line')).toContainText('Line 1:');

  await editor.fill('task "Review" as n1');
  await page.waitForTimeout(400);
  await expect(page.locator('#preview')).not.toHaveClass(/stale/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:e2e -w @bpm/web`
Expected: FAIL — `#toolbar`, `#engine-badge`, `.stale`, `.error-item`/`.error-line` don't exist in the current markup.

- [ ] **Step 3: Rewrite `index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>BPM Live Editor</title>
    <style>
      :root {
        --bg: #14171a;
        --surface: #1c2024;
        --border: #2a2f34;
        --ink: #e8eaec;
        --muted: #8b939a;
        --accent: #4fc1c9;
        --accent-ink: #08181a;
        --error: #e2685a;
        --error-bg: rgba(226, 104, 90, 0.12);
        --grid-line: rgba(232, 234, 236, 0.045);
        --font-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
      }
      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f2f4f5;
          --surface: #ffffff;
          --border: #d8dcdf;
          --ink: #1c2024;
          --muted: #5b6570;
          --accent: #1f8a95;
          --accent-ink: #ffffff;
          --error: #b5433a;
          --error-bg: rgba(181, 67, 58, 0.08);
          --grid-line: rgba(28, 32, 36, 0.045);
        }
      }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body {
        display: flex;
        flex-direction: column;
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font-mono);
      }

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
      .badge {
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 2px 8px;
      }
      .toolbar-btn {
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink);
        background: transparent;
        border: 1px solid var(--border);
        border-radius: 3px;
        padding: 6px 12px;
        cursor: pointer;
      }
      .toolbar-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .toolbar-btn:disabled { opacity: 0.35; cursor: not-allowed; }

      #body { flex: 1; display: flex; min-height: 0; }

      #editor {
        flex: 1;
        height: 100%;
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.6;
        border: none;
        border-left: 3px solid var(--border);
        border-right: 1px solid var(--border);
        padding: 16px;
        resize: none;
        transition: border-left-color 0.15s;
      }
      #editor:focus { outline: none; border-left-color: var(--accent); }

      #preview-container { flex: 1; display: flex; flex-direction: column; min-height: 0; }

      #errors {
        flex: 0 0 auto;
      }
      .error-item {
        font-size: 12px;
        padding: 8px 16px;
        border-left: 3px solid var(--error);
        background: var(--error-bg);
        white-space: pre-wrap;
      }
      .error-line { font-weight: 700; margin-right: 4px; }

      #preview {
        flex: 1;
        overflow: auto;
        padding: 16px;
        background-color: var(--bg);
        background-image:
          linear-gradient(var(--grid-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
        background-size: 24px 24px;
        transition: filter 0.2s, opacity 0.2s;
      }
      #preview.stale { filter: grayscale(0.4); opacity: 0.55; }
    </style>
  </head>
  <body>
    <div id="toolbar">
      <div id="brand">&#9633; BPM LIVE EDITOR</div>
      <div id="toolbar-actions">
        <span id="engine-badge" class="badge"></span>
        <button id="export-svg" class="toolbar-btn" disabled>Export SVG</button>
        <button id="export-xml" class="toolbar-btn" disabled>Export BPMN XML</button>
      </div>
    </div>
    <div id="body">
      <textarea id="editor" spellcheck="false"></textarea>
      <div id="preview-container">
        <div id="errors"></div>
        <div id="preview"></div>
      </div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Note: `&#9633;` is the same "white square" glyph as `▣`'s outline cousin (safe HTML entity, no encoding-in-source-file concerns); either is fine visually as the brand mark.

- [ ] **Step 4: Rewrite `main.ts`**

```ts
import { runPipeline } from './pipeline.js';

const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const errorsEl = document.querySelector<HTMLDivElement>('#errors')!;
const engineBadge = document.querySelector<HTMLSpanElement>('#engine-badge')!;
const exportSvgBtn = document.querySelector<HTMLButtonElement>('#export-svg')!;
const exportXmlBtn = document.querySelector<HTMLButtonElement>('#export-xml')!;

const STARTER_TEXT = [
  'event start message "Order placed" as n1',
  'task "Review order" as n2',
  'boundary timer nonInterrupting "SLA breach" as b1 on n2',
  'gateway exclusive "Approved?" as g1',
  'task "Ship order" as n3',
  'event end none "Done" as n4',
  'event end terminate "Rejected" as n5',
  'dataObject "Invoice" as d1',
  '',
  'n1 -> n2',
  'n2 -> g1',
  'g1 => n3 : "yes"',
  'g1 ->> n5',
  'n3 -> n4',
  'd1 ..> n2',
  'b1 ~> n5',
].join('\n');

editor.value = STARTER_TEXT;

let debounceHandle: ReturnType<typeof setTimeout> | undefined;

function renderErrors(errors: { line: number; message: string }[]): void {
  errorsEl.replaceChildren();
  for (const error of errors) {
    const item = document.createElement('div');
    item.className = 'error-item';
    const lineSpan = document.createElement('span');
    lineSpan.className = 'error-line';
    lineSpan.textContent = `Line ${error.line}:`;
    item.append(lineSpan, document.createTextNode(` ${error.message}`));
    errorsEl.append(item);
  }
}

async function rerender() {
  const result = await runPipeline(editor.value);
  if (result.errors.length > 0) {
    renderErrors(result.errors);
    preview.classList.add('stale');
    exportSvgBtn.disabled = true;
    exportXmlBtn.disabled = true;
    // Last valid diagram stays rendered: do not touch `preview.innerHTML`.
    return;
  }
  renderErrors([]);
  preview.classList.remove('stale');
  preview.innerHTML = result.svg!;
  engineBadge.textContent = result.engineName!;
  exportSvgBtn.disabled = false;
  exportXmlBtn.disabled = false;
}

editor.addEventListener('input', () => {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(rerender, 300);
});

rerender();
```

Note: the export buttons' click handlers are added in Task 3 — this task only establishes their enabled/disabled state, which is independently verifiable now.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:e2e -w @bpm/web`
Expected: PASS, all four tests in `live-render.spec.ts` (the two original plus the two new ones).

- [ ] **Step 6: Manually verify in a browser**

Run: `npm run dev -w @bpm/web`, open `http://localhost:5173`. Confirm: dark toolbar with brand mark and engine badge reading "FLAT" (uppercase via CSS), monospace editor with a visible left accent border on focus, preview pane shows a faint grid behind the diagram. Type invalid text and confirm the preview visibly dims while the error strip shows a bolded "Line N:" prefix. Toggle OS dark/light mode (or use browser devtools' "Emulate CSS media feature prefers-color-scheme") and confirm the light variant renders with readable contrast throughout.

- [ ] **Step 7: Commit**

```bash
git add apps/web/index.html apps/web/src/main.ts apps/web/test/e2e/live-render.spec.ts
git commit -m "feat(web): redesign editor with technical/blueprint visual identity"
```

---

## Task 3: Wire SVG and BPMN XML export buttons

**Files:**
- Create: `apps/web/src/downloads.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: `PipelineResult.diagram`/`PipelineResult.positioned` from Task 1; `exportToXml(diagram: Diagram, positioned: PositionedDiagram): string` from `@bpm/export-xml` (already built and tested — see `packages/export-xml/src/index.ts`); `PipelineResult.svg` (already existed).
- Produces: `downloadFile(filename: string, content: string, mimeType: string): void`, exported from `downloads.ts` — a small, generic helper with no other planned consumers right now, but kept as a named export in case a future "export PNG" or similar is added.

- [ ] **Step 1: Add the `@bpm/export-xml` dependency and Vite alias**

```json
// apps/web/package.json — add to "dependencies"
"@bpm/export-xml": "*",
```

```ts
// apps/web/vite.config.ts — add to the resolve.alias object, alongside the existing entries
'@bpm/export-xml': path.resolve(root, '../../packages/export-xml/src/index.ts'),
```

Run `npm install` from the repo root afterward so the workspace symlink is created.

- [ ] **Step 2: Write the failing e2e test**

Extend `apps/web/test/e2e/live-render.spec.ts`:

```ts
test('export buttons are disabled on error and enabled for a valid diagram, and trigger real downloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#export-svg')).toBeEnabled();
  await expect(page.locator('#export-xml')).toBeEnabled();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);
  await expect(page.locator('#export-svg')).toBeDisabled();
  await expect(page.locator('#export-xml')).toBeDisabled();

  await editor.fill('task "Review" as n1');
  await page.waitForTimeout(400);
  await expect(page.locator('#export-xml')).toBeEnabled();

  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  const xmlContent = Buffer.concat(xmlChunks).toString('utf-8');
  expect(xmlContent).toContain('<bpmn2:definitions');
  expect(xmlContent).toContain('bpmn2:task');

  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:e2e -w @bpm/web`
Expected: FAIL — clicking `#export-svg`/`#export-xml` currently does nothing (no click handlers attached yet), so `page.waitForEvent('download')` times out.

- [ ] **Step 4: Create `downloads.ts`**

```ts
// apps/web/src/downloads.ts
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Wire click handlers in `main.ts`**

```ts
// apps/web/src/main.ts — add these imports at the top, alongside the existing one
import { exportToXml } from '@bpm/export-xml';
import { downloadFile } from './downloads.js';
import type { PipelineResult } from './pipeline.js';
```

```ts
// apps/web/src/main.ts — add near the bottom, after the existing `editor.addEventListener('input', ...)` block,
// replacing the two now-unused-until-here button references' declarations with actual behavior:
let lastResult: PipelineResult | undefined;

exportSvgBtn.addEventListener('click', () => {
  if (!lastResult?.svg) return;
  downloadFile('diagram.svg', lastResult.svg, 'image/svg+xml');
});

exportXmlBtn.addEventListener('click', () => {
  if (!lastResult?.diagram || !lastResult.positioned) return;
  const xml = exportToXml(lastResult.diagram, lastResult.positioned);
  downloadFile('diagram.bpmn', xml, 'application/xml');
});
```

```ts
// apps/web/src/main.ts — modify `rerender()` to record `lastResult` on success (only line changed shown in context):
async function rerender() {
  const result = await runPipeline(editor.value);
  if (result.errors.length > 0) {
    renderErrors(result.errors);
    preview.classList.add('stale');
    exportSvgBtn.disabled = true;
    exportXmlBtn.disabled = true;
    return;
  }
  renderErrors([]);
  preview.classList.remove('stale');
  preview.innerHTML = result.svg!;
  engineBadge.textContent = result.engineName!;
  exportSvgBtn.disabled = false;
  exportXmlBtn.disabled = false;
  lastResult = result; // <- new line: keep the latest valid result available to the export handlers
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:e2e -w @bpm/web`
Expected: PASS, all five tests in `live-render.spec.ts`.

- [ ] **Step 7: Run the full repo suite**

Run: `npm run build && npm test` (from repo root), then `npm run test:e2e -w @bpm/web`
Expected: 100% green across both.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/downloads.ts apps/web/src/main.ts apps/web/package.json apps/web/vite.config.ts apps/web/test/e2e/live-render.spec.ts
git commit -m "feat(web): wire SVG and BPMN XML export buttons"
```

---

## Self-Review Notes

- **Spec coverage**: every section of `docs/superpowers/specs/2026-08-09-editor-look-and-feel-design.md` maps to a task — palette/type/layout → Task 2, data flow/export wiring → Task 1 + Task 3, error handling treatment → Task 2's dimming + structured error items, testing section → each task's own test step.
- **Placeholder scan**: no TBDs; every code block is complete, runnable content, not a description of what to write.
- **Type consistency**: `PipelineResult`'s new fields (Task 1) are consumed with matching names/types in Task 2 (`engineName`, read in `rerender()`) and Task 3 (`diagram`, `positioned`, read in the export click handlers) — verified by re-reading Task 1's final interface against Tasks 2 and 3's usage before finalizing this plan.
- **Deferred items respected**: no draggable resizer, no code-editor component, no manual theme toggle appear anywhere in the three tasks, matching the spec's explicit "Deferred" list.
