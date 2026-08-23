# Editor Toolbar & Panel Grouping — Design

## Purpose

The live editor's toolbar and panels grew organically across several sessions (mode toggle, layout-engine override, family badge, project sidebar toggle, Review/Generate/Settings toggles, Clear, Fullscreen, Edit as Diagram, three export buttons) into a single 15-button row with no visual grouping, and four structurally-duplicated bottom panels (Review, Generate, Settings, Import) with no way to close one except re-clicking the toolbar button that opened it. Diagram mode has a second, differently-organized toolbar. This pass reorganizes the existing controls — same IDs, same behavior, same visual identity (`docs/superpowers/specs/2026-08-09-editor-look-and-feel-design.md`'s monospace/blueprint direction) — into legible groups, adds a couple of small new affordances (panel close buttons, export-format dropdowns, two icons), and moves one control (layout-engine override) into Settings where it belongs alongside other preferences.

Scope: `apps/web`'s chrome only — toolbar layout, panel headers, the two icons, the export dropdown, and the Settings panel's new "Layout engine" row. No change to the pipeline, renderer, `bpmn-js` integration, or diagram-family/capability logic. Diagram mode's `bpmn-js` canvas and its own palette/context-pad are third-party UI and stay untouched, per the existing diagram-mode-editor design doc's non-goal of writing custom shape/palette code.

## Toolbar — grouping

`#toolbar-actions` (Text mode) reorganizes into five `.toolbar-group` clusters, each a `<div>` with a `border-left: 1px solid var(--border)` divider (except the first) and its own internal `gap`. No buttons are removed except the two folded into the new export dropdown described below; every remaining element keeps its existing `id`.

```
▣ BPM LIVE EDITOR │ [✎ Text | ⬡ Diagram] │ ⊙ BPMN  FLAT │ Projects ‖ Review · Generate · Settings │ Clear  Fullscreen │ Edit as Diagram  Export ▾
```

1. **Brand + Edit mode** — `#brand`, then the Text/Diagram toggle (`#mode-text-btn`, `#mode-diagram-btn`), each button gaining a small inline-SVG icon before its label: a pen glyph for Text, a three-node connected-shapes glyph for Diagram. Same `aria-pressed` segmented-pill styling as today, just with an icon.
2. **Diagram info** — `#family-badge` (gains a small generic diagram-type glyph before the text — one fixed icon, not per-family artwork, since the label text already carries the family name) and `#engine-badge`. Both stay read-only indicators. `#engine-override` (the Auto/Flat/Swimlane `<select>`) is removed from the toolbar — see "Settings panel" below.
3. **Panel toggles** — `#project-toggle-btn` stays a standalone button (it's an independent sidebar, not part of the mutual-exclusion group). `#review-btn`, `#generate-btn`, `#settings-btn` become a connected 3-segment pill (one bordered container, 1px internal dividers) — visually documenting the mutual exclusion `main.ts` already enforces between these three. All three keep their existing ids/handlers.
4. **Utility** — `#clear-btn`, `#fullscreen-btn`, unchanged.
5. **Output** — `#edit-as-diagram`, then the new `#export-menu-btn` ("Export ▾") replacing `#export-svg` / `#export-xml` / `#export-drawio` as separate always-present buttons.

`#toolbar-actions` and `#diagram-toolbar-actions` both change from `height: 44px` (fixed) to `min-height: 44px; height: auto;` with `flex-wrap: wrap; row-gap: 6px;` on the buttons row, so a narrow window wraps to a second line instead of clipping buttons off-screen (today's actual behavior below ~1440px — verified by running the app at 1440px, where the row is already at capacity with no slack).

Toggle buttons that show/hide something (`#project-toggle-btn` and the Review/Generate/Settings segment) gain a small state glyph (▾ open / ▸ closed) after the label, so open/closed state doesn't rely solely on the existing subtle border-color change.

## Export dropdown

Replaces `#export-svg`, `#export-xml`, `#export-drawio` (Text mode) and `#diagram-export-xml`, `#diagram-export-svg` (Diagram mode) with one `Export ▾` button per mode that opens a small popover menu. Menu items are the same download actions as today (`downloadFile(...)` calls in `main.ts`, unchanged), just relocated:

- Built as a small shared component (`apps/web/src/exportMenu.ts`) — a button (`aria-haspopup="true"`, `aria-expanded`) plus a popover `<div>` of plain tabbable `<button>` items positioned under it, closed on outside click, `Escape`, or item selection. Deliberately not a full ARIA `role="menu"` widget (arrow-key roving, typeahead) — a handful of tabbable buttons in a popover is sufficient for a list this short and avoids building a second focus-management system alongside the existing panel-toggle one.
- Menu items are populated from a caller-supplied list of `{ label, disabled, title, onClick }` — `main.ts` builds this list from the exact same disabled/title logic `rerender()` already computes per-family (`isBpmnDiagram`, `structuredExport`, etc.), so an unsupported format simply isn't in the list rather than shown disabled. This is a slightly different UX than today (items disappear instead of graying out) — reasonable since a format that's never valid for the current family isn't a thing the user needs to see repeatedly disabled.
- Diagram mode's menu always has exactly BPMN XML + SVG (both always valid once a diagram is loaded), so it's simpler — two static items whose `disabled` mirrors `setDiagramButtonsEnabled`'s existing enabled flag.
- `Edit as Diagram` (Text mode) and `Import to Text` (Diagram mode) are deliberately **not** folded into the export menu — they're one-way mode-conversion actions, not exports, and blurring that distinction would undo the "Edit as Diagram" design's own framing (a snapshot conversion, not a save/export).

## Settings panel — new "Layout engine" row

`settingsPanel.ts` gains a second labeled section below the existing AI-provider fields (API key / base URL / model), under a small uppercase section label ("AI PROVIDER" / "LAYOUT") matching the toolbar's micro-label convention:

- A `<select>` with the same three options as today's removed toolbar control (`Auto` / `Flat` / `Swimlane`), same `localStorage` key (`bpm.engineOverride`) and same disabled/title logic (`engineOverrideSelect.disabled = result.capabilities?.engineOverride !== true`, with the existing "layout does not support BPMN engine overrides" hint text shown inline instead of as a title tooltip, since Settings has room for visible hint text — `settingsPanel.ts` already has a `.settings-hint` pattern for this).
- The `<select id="engine-override">` element itself moves from static markup in `index.html` to being created inside `settingsPanel.ts`'s `ensurePanel()`, which now exports `getEngineOverrideSelect(): HTMLSelectElement`. Because `settingsPanel.ts` mounts lazily (`mountSettingsPanel()` runs partway through `main.ts`'s startup, after several other top-level `querySelector` calls), `main.ts`'s `const engineOverrideSelect = document.querySelector(...)` line moves down to right after `mountSettingsPanel(...)` and becomes `const engineOverrideSelect = getEngineOverrideSelect();` — everything after that (the stored-value restore, the `change` → `rerender()` listener, the per-render `disabled`/`title` updates in `rerender()`) is unchanged, just reading from the relocated element.

**Tradeoff, named explicitly**: today the layout-engine picker is one click away at all times; after this move, changing it mid-iteration means opening Settings first. This was requested explicitly, so going ahead with it, but flagging it here in case it's worth revisiting once real usage shows how often people actually switch engines while iterating.

## Panel headers — shared close affordance

Today, `settingsPanel.ts`, `generatePanel.ts`, and `importPanel.ts` each independently build a `<div class="review-header">` with static title text, and `reviewPanel.ts` rebuilds a dynamic one (finding count) on every update. All four duplicate the same markup pattern with no close button.

New shared helper `apps/web/src/panelHeader.ts`:

```ts
export function createPanelHeader(title: string, onClose: () => void): { el: HTMLDivElement; setTitle: (title: string) => void };
```

Returns a `.panel-header` flex row: title span (reuses today's `.review-header` text styling) on the left, a small `×` button (`.panel-close-btn`, hover → `--accent`, matches the existing `.toolbar-btn` hover pattern) on the right, calling `onClose`. Each of the four panel modules calls this once in `ensurePanel()` instead of hand-building a header `<div>`, wiring `onClose` to their existing `hide*Panel()` function. `reviewPanel.ts`'s dynamic count-title case calls the returned `setTitle()` from within `appendFindings()`/`updateReviewPanel()` instead of replacing the whole header element, so the close button isn't destroyed and re-created on every finding update.

No panel's `id`, content structure below the header, or show/hide function signatures change — `hideReviewPanel()`, `hideGeneratePanel()`, `hideSettingsPanel()`, `hideImportPanel()` stay exactly as called from `main.ts` today, so the toolbar toggle buttons and the new close buttons both end up calling the same function (clicking either one closes the panel and updates `aria-pressed`/the state glyph via the existing toggle handlers in `main.ts` — the close button's `onClose` callback is literally `() => reviewBtn.click()` etc., not a second code path, so state stays in sync for free).

## Diagram-mode toolbar

Same `.toolbar-group` divider treatment applied to `#diagram-toolbar-actions`:

```
[New Diagram  Open] │ [Save  Export ▾] │ [Import to Text]
```

`#diagram-save` and the new diagram-mode export menu are visually grouped as "output" actions (mirroring Text mode's Output group); `#diagram-new`, `#diagram-open` as "file" actions; `#diagram-import-text` stands alone as the mode-conversion escape hatch (mirrors `#edit-as-diagram`'s treatment in Text mode).

## Icons

Two new inline-SVG icons (pen, three-connected-nodes) plus one generic diagram-type glyph, defined once in a small `apps/web/src/icons.ts` module exporting SVG strings, ~14px, single-stroke, `stroke="currentColor"` (no fill) so they inherit `--ink`/`--accent`/`--muted` automatically in both themes without any icon-specific CSS variables. No icon font, no external asset, consistent with the existing "no custom webfonts" reliability rationale in the look-and-feel design doc.

## Non-goals

- No change to `bpmn-js`'s own palette/context-pad/canvas.
- No change to the Project panel's structure (it already collapses/resizes/persists correctly per `panel-layout.spec.ts`) beyond whatever falls out incidentally from shared CSS token reuse.
- No consolidation of Review/Generate/Settings into a single tabbed panel (considered and explicitly rejected in favor of the lower-risk "keep three panels, group the three toggle buttons visually" approach).
- No new AI/provider behavior, no new diagram-family capability logic.

## Testing

- Existing `panel-layout.spec.ts`, `generate-panel.spec.ts`, `diagram-mode.spec.ts`, `diagram-import.spec.ts`, `diagram-import-roundtrip.spec.ts`, `live-render.spec.ts`, `preview-fit.spec.ts`, `accessibility-smoke.spec.ts` keep passing largely unmodified since element ids are preserved; `live-render.spec.ts`'s export-button assertions (from the original look-and-feel spec) need updating to open the Export menu first, then assert on the menu item instead of the toolbar button directly.
- New coverage: panel close button closes the panel and syncs the toolbar toggle's `aria-pressed`/state glyph; export menu only lists formats valid for the current family and each item triggers the same download as before; toolbar wraps (doesn't clip) at a narrow viewport width; Settings panel's layout-engine select changes the rendered diagram the same way the old toolbar select did.
