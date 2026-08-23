# Editor Look and Feel — Design

## Purpose

The live editor (`apps/web`) has never been designed — it's a bare `<textarea>` next to a raw preview `<div>`, default sans-serif, no colors, no controls, no export access despite `@bpm/export-xml` already existing and being fully tested. This pass gives it a real visual identity and wires in the two export actions the pipeline can already produce (SVG, BPMN XML) but currently has no UI surface for.

Scope: the editor's own chrome (toolbar, panes, error display, export actions). Diagram layout quality is out of scope — tracked separately in `docs/ROADMAP.md`'s deferred layout items. The diagram's own rendering (black ink on white, from `@bpm/render`) is intentionally left unthemed — it reads as a blueprint print sitting on a drafting table, a deliberate visual contrast with the app chrome around it, not something restyled per dark/light mode.

## Visual system

**Direction**: technical/blueprint — schematic, precise, monospace-forward. Reads as a serious engineering tool, fits a BPMN authoring tool's own subject matter (diagrams are themselves technical drawings).

**Palette** (CSS custom properties, dark-first with a light variant, following `prefers-color-scheme`):

| Token | Dark | Light |
|---|---|---|
| `--bg` (ground) | `#14171a` | `#f2f4f5` |
| `--surface` (panels) | `#1c2024` | `#ffffff` |
| `--border` | `#2a2f34` | `#d8dcdf` |
| `--ink` (text) | `#e8eaec` | `#1c2024` |
| `--muted` (secondary text) | `#8b939a` | `#5b6570` |
| `--accent` | `#4fc1c9` | `#1f8a95` |
| `--error` | `#e2685a` | `#b5433a` |
| `--success` | `#6fbf8a` | `#2f7a52` |

Dark is the deliberate default (matches the "ink on dark paper" drafting feel); the light variant follows `prefers-color-scheme: light` for daytime/bright-environment use. No manual toggle in this pass — system preference only.

**Type**: system monospace stacks throughout (`ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace`) for both the editor pane and UI chrome — no custom webfonts, since reliability matters more than a bespoke face for a working tool. Chrome labels (toolbar, panel headers, the diagram-type indicator) use the same family, uppercase, with slight letter-spacing (`0.05em`–`0.08em`) — a "blueprint title block" treatment that gives UI text a distinct register from body/code text without needing a second typeface.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ▣ BPM LIVE EDITOR                    [SWIMLANE]  [Export SVG] [Export XML] │  ← toolbar
├──────────────────────────────┬─────────────────────────────────┤
│                                │  ⚠ Line 4: Could not parse line │  ← error strip (conditional)
│                                ├─────────────────────────────────┤
│  event start message "..."    │                                  │
│  task "Review order" as n2    │        [rendered SVG diagram]     │  ← preview pane
│  ...                          │        on a faint drafting grid   │
│                                │                                  │
└──────────────────────────────┴─────────────────────────────────┘
   editor pane (50%)                    preview pane (50%)
```

- **Toolbar**: product mark left; diagram-type indicator (`SWIMLANE` / `FLAT`, whichever engine actually matched) and the two export buttons on the right. Export buttons are disabled (dimmed, not hidden) whenever the current text has parse errors.

  `@bpm/layout`'s `layout()` currently calls `selectEngine(diagram)` internally and discards the chosen engine's name, returning only the `PositionedDiagram`. This needs a small, non-breaking addition: export `selectEngine` from `@bpm/layout` (it's already exported from `@bpm/layout-core`, just needs re-exporting) so `pipeline.ts` can call `selectEngine(diagram).name` once per render alongside the existing `layout(diagram)` call, with no change to `layout()`'s existing signature or behavior.
- **Editor pane**: styled `<textarea>`, monospace, generous line-height, subtle accent-colored left border that brightens on focus. No line numbers in this pass (would require replacing the plain textarea with a real code-editor component — out of scope, tracked as a future item if wanted).
- **Preview pane**: SVG diagram over a low-contrast dot/line grid background (graph-paper feel). When errors are present, the pane gets a subtle dimming/desaturation overlay to signal "this is the last valid render, not current text" — the actual diagram stays fully visible underneath, per the project's existing "never blank the preview" principle (unchanged behavior, only the visual signal is new).
- **Error strip**: appears between toolbar and preview pane only when `errors.length > 0`; collapses away (not just empties) when errors clear, to avoid layout jumping on every keystroke fix. Left accent bar in `--error`, monospace `Line N:` prefix in bold, message in regular weight.
- **Split**: fixed 50/50. A draggable resizer is a reasonable future addition but is deliberately out of scope here — it's an interaction-state feature (drag handling, persistence), not a visual-design change.

## Data flow — export wiring

`apps/web/src/pipeline.ts`'s `runPipeline()` currently computes `diagram` and `positioned` internally and discards both, returning only `{ svg, errors }`. Both are already fully computed by the time `render()` runs, so extending the return type costs nothing extra at render time:

```ts
export interface PipelineResult {
  svg: string | null;
  diagram: Diagram | null;
  positioned: PositionedDiagram | null;
  engineName: string | null;
  errors: ParseError[];
}
```

`main.ts` keeps the latest successful `diagram`/`positioned` in module state (mirroring how it already keeps the last-good `svg` implicitly via not touching `preview.innerHTML` on error). The two export buttons:

- **Export SVG**: `new Blob([svg], {type: 'image/svg+xml'})` → object URL → synthetic `<a download="diagram.svg">` click. No new dependencies.
- **Export BPMN XML**: `exportToXml(diagram, positioned)` from `@bpm/export-xml` (already built and tested this session), called on click — not on every debounced re-render, since XML generation has no reason to run on every keystroke. Same Blob/download pattern, `diagram.bpmn` extension, `application/xml` MIME type.

`apps/web/package.json` gains a dependency on `@bpm/export-xml` (workspace package, already exists).

## Testing

- Existing Playwright e2e smoke test (`apps/web/test/e2e/live-render.spec.ts`) continues to verify live-render behavior; extend it with: (a) export buttons are disabled when the starter text has a parse error injected, enabled otherwise, (b) clicking "Export XML" triggers a download containing well-formed XML (Playwright can intercept the download and check for a root `<bpmn2:definitions>` element).
- No new unit-test surface needed in the core packages — this pass only touches `apps/web`.

## Deferred (explicitly out of scope this pass)

- Draggable pane resizer.
- Real code-editor component (line numbers, syntax highlighting) replacing the plain `<textarea>`.
- Manual dark/light toggle (system-preference-only for now).
- Any diagram layout changes (tracked separately in `docs/ROADMAP.md`).
