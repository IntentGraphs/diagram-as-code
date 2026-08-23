# Family-platform hardening review

_Read-only review of the current three-family integration (BPMN, mindmap, flowchart) on
`integration/mindmap-adapter` at `207a3b8`. No production files were edited to produce this —
the one exception below (a live bug reproduced against a scratch script, not committed) is
explicitly called out as such. Scope: `apps/web/src/main.ts`, `apps/web/src/familyUi.ts`,
`packages/diagram-runtime`, CLI commands, project persistence, structured-export capability
handling, and default adapter registration._

## Issues, most severe first

### 1. [High] `runPipeline` crashes with an unhandled rejection on any recognized-but-unregistered family

**File**: `apps/web/src/pipeline.ts:41-42`

```ts
const family = header.diagnostics.length === 0 ? header.family : null;
return { family, header: family ? header : null, capabilities: family ? getFamily(family).capabilities : null, ... };
```

This is inside `runPipeline`'s `catch` block — reached whenever `executeDiagramSource` throws. `getFamily(family)` is called **unguarded** a second time here. `DIAGRAM_FAMILIES` (`packages/diagram-runtime/src/types.ts:1`) already lists `'architecture'` as a valid family id — `readDiagramHeader` accepts `diagram: architecture` with zero diagnostics — but no adapter is registered for it yet. Trace: `executeDiagramSource` → `parseDiagramSource` → `resolveDiagramFamily` → `getFamily('architecture')` throws `DiagramRuntimeError` (correctly) → caught by `runPipeline`'s `catch` → `family` resolves to `'architecture'` (header diagnostics were empty) → the capabilities line calls `getFamily('architecture')` **again**, throws again, this time with no enclosing try/catch. `runPipeline`'s promise rejects. Its only caller, `rerender()` in `apps/web/src/main.ts:397`, awaits it with no try/catch, so the rejection is unhandled — the render loop dies silently mid-keystroke, no error is shown to the user, and every button stays in whatever state it was in from the last successful render.

**Reproduction**: type `diagram: architecture\nx "y" as z` into the live editor today, on this branch, before any architecture adapter exists. This is not hypothetical or Wave-5-only — it is live right now and will be the very first thing anyone hits while iterating on the architecture family in Wave 5 (or by curiosity, since the id is already accepted).

**Fix**: don't call `getFamily` a second time inside the catch block; the first throw already carries the diagnostics needed.
```ts
const family = header.diagnostics.length === 0 ? header.family : null;
let capabilities: FamilyCapabilities | null = null;
if (family) { try { capabilities = getFamily(family).capabilities; } catch { /* unregistered family; diagnostics already cover it */ } }
return { family, header: family ? header : null, capabilities, ... };
```

**Test required**: `runPipeline('diagram: architecture\n...')` (or any id in `DIAGRAM_FAMILIES` with no registered adapter) resolves — does not reject — with non-empty `diagnostics`/`errors` and `capabilities: null`. This is the "unregistered future family" test the plan asks for, and it already has a real, present-tense repro without needing to fabricate a fake family id.

### 2. [Medium] Engine-override tooltip is hardcoded to "Mindmap," wrong for flowchart and any future family

**File**: `apps/web/src/main.ts:404`

```ts
engineOverrideSelect.title = engineOverrideSelect.disabled ? 'Mindmap layout does not support BPMN engine overrides.' : 'Choose the BPMN layout engine.';
```

`engineOverrideSelect.disabled` is already capability-driven (`capabilities?.engineOverride !== true`), but the *message* is not — it says "Mindmap" even when the loaded diagram is a flowchart (`capabilities.engineOverride` is `false` for both). This is exactly the class of bug the plan called out by name. Confirmed live: load a flowchart, hover the engine-override selector, tooltip reads "Mindmap layout does not support BPMN engine overrides."

**Fix**: derive the message from `familyLabel(result.family)` generically, same pattern already used for `unsupportedActionMessage`:
```ts
engineOverrideSelect.title = engineOverrideSelect.disabled
  ? `${familyLabel(result.family)} layout does not support BPMN engine overrides.`
  : 'Choose the BPMN layout engine.';
```

### 3. [Medium] Draw.io export button is hardcoded to family `'mindmap'` and format `'mindmap-drawio-xml'` in the click handler

**File**: `apps/web/src/main.ts:605-613`

```ts
exportDrawioBtn.addEventListener('click', async () => {
  if (lastResult?.family !== 'mindmap') return;
  try {
    const xml = await exportStructuredDiagram(editor.value, 'mindmap-drawio-xml');
    ...
```

The *gating* (`exportDrawioBtn.disabled = !supportsStructuredExport(result.family, result.capabilities, 'mindmap-drawio-xml')` at line 444) is already capability-driven in the sense that it checks `capabilities.structuredExport.includes(format)`, not `family === 'mindmap'` — but the format string itself, and the click handler's family/format, are still literal. `FamilyCapabilities.structuredExports?: StructuredExportDescriptor[]` (added in the mindmap wave) already carries everything needed to generalize this without knowing the format id in advance: `format`, `label`, `mimeType`, `fileExtension`.

This is squarely a Wave 3 concern (make the gating and the click handler read the descriptor generically), separate from Wave 4 (which *adds* a flowchart draw.io descriptor and, per that wave's own scope, may add multi-format selection if a family ever exposes more than one). Doing the Wave 3 half now means Wave 4 needs zero `main.ts` changes to light this button up for flowchart — only a new `exportStructured`/`structuredExports` entry in `packages/diagram-flowchart`'s adapter.

**Fix**: generalize to read the first (today: only) structured export descriptor generically:
```ts
function firstStructuredExport(capabilities: FamilyCapabilities | null): StructuredExportDescriptor | null {
  return capabilities?.structuredExports?.[0] ?? null;
}
// gating:
const structuredExport = firstStructuredExport(result.capabilities);
exportDrawioBtn.disabled = structuredExport === null;
exportDrawioBtn.textContent = structuredExport ? `Export ${structuredExport.label}` : 'Export draw.io';
exportDrawioBtn.title = structuredExport ? '' : `${familyLabel(result.family)} has no structured export available.`;
// click handler:
exportDrawioBtn.addEventListener('click', async () => {
  const structuredExport = lastResult && firstStructuredExport(lastResult.capabilities);
  if (!structuredExport) return;
  const xml = await exportStructuredDiagram(editor.value, structuredExport.format);
  downloadFile(`diagram${structuredExport.fileExtension}`, xml, structuredExport.mimeType);
  ...
```
Note this also fixes a small pre-existing wart: the download filename/mimetype (`'diagram.drawio'`, `'application/xml'`) were hardcoded too, when the descriptor already carries `fileExtension`/`mimeType`.

**Do not** rename the button id or add a multi-format picker here — that's Wave 4 territory if it turns out to be needed; today there's still at most one structured export per family.

### 4. [Low-medium] `isRenderable`'s emptiness check depends on BPMN-typed internals and is inconsistent across families

**File**: `apps/web/src/main.ts:440-441`, `apps/web/src/pipeline.ts:6-17`

```ts
const isBpmnDiagram = Boolean(result.diagram && result.diagram.nodes.length > 0);
const isRenderable = Boolean(result.svg) && (isBpmnDiagram || result.family === 'mindmap' || result.family === 'flowchart');
```

`PipelineResult.diagram`/`.positioned` are typed `Diagram | null`/`PositionedDiagram | null` — both BPMN-specific types from `@bpm/ast`/`@bpm/layout` (`pipeline.ts:11-12`, populated only `if (result.header.family === 'bpmn')`, `pipeline.ts:28-29`). `isBpmnDiagram` exists to treat a *valid-but-empty* BPMN diagram (parses fine, zero nodes) as not worth exporting. Mind maps can never be empty-but-valid (`missing_root` is a semantic error), so they never needed this and the `family === 'mindmap'` disjunct always resolves via `Boolean(result.svg)` alone. Flowcharts *can* be empty-but-valid (zero `box`/`decision` declarations, zero edges is syntactically fine) and get no equivalent guard — an empty flowchart's `Export SVG` is enabled today, exporting a blank 21×21 canvas, while an empty BPMN diagram's is correctly disabled. Not a security issue, just an inconsistency that architecture (which will also permit an empty-but-valid diagram, e.g. before any `component` is declared) would inherit.

**Two options, pick one rather than doing both**:
- (a) Drop the emptiness special-case entirely: `isRenderable = Boolean(result.svg)`. Simplest, fully family-neutral, and the "don't export a blank canvas" nicety was incidental, not a documented requirement — minor, acceptable behavior widening (BPMN's blank-diagram export becomes newly allowed).
- (b) Keep the nicety but make it generic: add an optional `isEmpty(ast): boolean` to `DiagramFamilyAdapter`, default undefined = "never empty" (so mindmap/flowchart opt out by omission, same as today), and only BPMN's adapter implements it. More faithful to current UX, more surface area added to the adapter contract for one cosmetic guard.

**Recommendation**: (a). The cost of (b) is a permanent addition to every future family's adapter contract to preserve a minor cosmetic guard on one already-uncommon input shape (a diagram with literally zero nodes). Flag this choice for Step 3.3 rather than deciding it silently — it's a small but real behavior change either way and deserves a one-line call-out in Codex's return report.

**Test required**: whichever is chosen, add a regression test asserting the decided behavior for an empty-but-valid flowchart (`diagram: flowchart` with no body) and an empty-but-valid BPMN source, so this doesn't drift again.

## Non-issues (checked, found clean)

- **CLI** (`packages/cli/src/**`): zero family-literal strings anywhere. Every command goes through `@bpm/diagram-runtime`'s `DiagramRuntimeError`, which already carries structured, family-agnostic diagnostics; `bin.ts` has a top-level catch as a second safety net. This is the shape `pipeline.ts` (issue 1) should have matched and didn't.
- **`exportXmlBtn`/`editAsDiagramBtn` BPMN-only gating** (`main.ts:443,445`, plus the `exportPositionedDiagram(lastResult.family, lastResult.diagram, lastResult.positioned, 'bpmn-xml')` calls): legitimately BPMN-only — bpmn-js and BPMN 2.0 XML are BPMN-specific machinery, not a generalizable capability. Leave as `family !== 'bpmn'` / `editorMode !== 'bpmn-js'`; capabilities already model this correctly and nothing here needs to change.
- **`validateForReview`'s BPMN-only gate** (`main.ts:361-369`, "Review currently supports BPMN diagrams only"): an intentional, correctly-labeled scope restriction (Review's geometry-analysis findings are BPMN-specific today), not an oversight — the message already names the actual family via `familyLabel`-equivalent phrasing. No change needed.
- **Project persistence** (`apps/web/src/project/store.ts`, `project/types.ts`): `family` is stored as `DiagramFamilyId | undefined`, written generically off `readDiagramHeader(...).family` in every path (`store.ts:179,202,205,231`) with no per-family branching. Already family-neutral; old projects saved before family tracking existed simply have `family: undefined`, which every consumer already treats as "unknown," not as a crash.
- **`registerFamily`/`resetFamilies`/`clearFamilies`** (`registry.ts:24-36`): already a clean, minimal registration API; tests use `clearFamilies`/`resetFamilies` for isolation today (confirmed in `packages/diagram-runtime/test/runtime.test.ts`).
- **Dependency direction**: `packages/diagram-mindmap` and `packages/diagram-flowchart` both structurally copy the adapter-contract types (documented comment at the top of each `types.ts`) specifically to avoid importing `@bpm/diagram-runtime` itself — confirmed no runtime import in either package's `src/`.

## Family-neutral interfaces (proposed)

No new types needed for issues 1-2. Issue 3 leans on the `StructuredExportDescriptor` type that already exists (`packages/diagram-runtime/src/types.ts:41-50`) — it was designed generically in the mindmap wave and is simply not yet *consumed* generically in the web layer. Issue 4 either needs no new type (option a) or one optional adapter method (option b, not recommended).

## Runtime composition root — recommendation

**Keep `packages/diagram-runtime/src/registry.ts` as the composition root.** Do not extract a separate defaults/composition package for this. Reasoning: registering a new family today is a 2-line diff in one file (`registry.ts`'s import + `defaultAdapters` map entry) plus one `package.json` dependency line — there is no cyclic-dependency risk (the runtime package already depends on every family package, and no family package depends back on the runtime package, only on its structurally-copied types), and no family currently needs conditional/lazy registration. Splitting this into its own package would add a second package to keep in sync with `DIAGRAM_FAMILIES` for a problem that isn't actually occurring (production edits *are* required to add a family — one file, two lines — and that's fine; the actual bugs found here are all about *messaging derived from* family checks in the web layer, not about the registration mechanism itself). Revisit only if a real need for pluggable/optional registration shows up (e.g. a family gated behind a feature flag) — not speculatively.

Document this explicitly (a short comment at the top of `registry.ts`, one paragraph, stating this file is the intentional single composition root and new families register here) so the next family's implementer doesn't go looking for a different extension point.

## Migration order

1. Fix issue 1 (`pipeline.ts`) first — it's a standalone bug fix, zero interaction with the others, and is the one that actually breaks something today.
2. Fix issue 2 (engine-override message) — one-line, independent.
3. Fix issue 3 (draw.io button generalization) — touches the same button issue 4 doesn't, low interaction risk, but do it before Wave 4 so Wave 4 has nothing to do in `main.ts`.
4. Decide + fix issue 4 (emptiness semantics) — do last since it's the one genuine behavior-change call; land it separately if the team wants to review that specific diff on its own.
5. Add the composition-root doc comment in `registry.ts` (no behavior change, do anytime).

## Tests required

- `apps/web/test/pipeline.test.ts`: `runPipeline` on a source declaring a recognized-but-unregistered family (e.g. `diagram: architecture`) resolves with diagnostics, does not throw/reject, `capabilities: null`.
- `apps/web/test/e2e/live-render.spec.ts`: engine-override tooltip text is family-labeled correctly for flowchart (not "Mindmap").
- `apps/web/test/e2e/live-render.spec.ts` or a unit test around the new helper: draw.io export button reads label/filename/mimetype from `capabilities.structuredExports[0]` rather than a literal string — can be tested today against mindmap's existing descriptor without waiting for Wave 4's flowchart descriptor.
- Whichever emptiness option is chosen for issue 4: one test per family (BPMN, flowchart) on empty-but-valid input, asserting the decided `isRenderable` value.
- Regression: existing 75 files / 567 tests / 43 e2e must stay green throughout.

## Definition of done

- `runPipeline` cannot reject on a recognized-but-unregistered family; it returns structured diagnostics like every other invalid-input path.
- No string literal `'mindmap'` or `'flowchart'` remains in `apps/web/src/main.ts` for messaging/gating purposes that a capability or `familyLabel` can already express (the legitimate BPMN-only literals — `exportXmlBtn`, `editAsDiagramBtn`, `validateForReview` — are explicitly exempt, see "non-issues" above).
- Draw.io export button/handler reads its format/label/mimetype/extension from `capabilities.structuredExports[0]`, not a hardcoded string.
- `registry.ts` carries a comment documenting it as the intentional composition root.
- The emptiness-check decision (issue 4) is made explicitly and tested, not left ambiguous.
- 75/567/43 baseline stays green; new tests above are added and green.
- Adding the architecture family later requires: one adapter package (own AST/parser/layout/render), one `registry.ts` entry, and — per the fixes above — zero further edits to `main.ts` for label/tooltip/export-gating purposes.
