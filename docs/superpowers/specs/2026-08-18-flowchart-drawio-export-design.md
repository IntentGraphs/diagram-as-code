# Flowchart draw.io export — design

_Wave 4. Targeted design review of adding flowchart structured export at commit `6db7593`
(`integration/mindmap-adapter`, post Wave 3 platform hardening). Read-only — no production
files were edited to produce this. Precedent: `packages/diagram-mindmap/src/adapter.ts`
already implements the identical pattern for mindmap (`MINDMAP_DRAWIO_EXPORT_FORMAT =
'mindmap-drawio-xml'`); this document is deliberately the smallest possible delta from that
precedent, not a redesign._

## Summary

`@bpm/export-drawio` (`packages/export-drawio/src/index.ts`) is already fully family-neutral
— `DrawioNode`/`DrawioEdge` take id/label/position/size/shape and an optional `points` array,
nothing mindmap- or BPMN-specific. `packages/diagram-flowchart/src/layout.ts`'s
`PositionedFlowchartNode`/`PositionedFlowchartEdge` (id, kind, label, x/y/width/height,
routed `points`, optional edge `label`) already carry every field the exporter needs, in the
same shape mindmap's `PositionedMindmapNode` does. **No changes to `@bpm/export-drawio`
itself are needed.** The entire Wave 4 implementation is one new `exportStructured` method on
`flowchartAdapter`, mirroring `mindmapAdapter`'s almost line for line, plus a capabilities
descriptor and a documentation update. This is a low-risk, additive change.

## Node and decision-shape mapping

`DrawioShape` already includes `'rhombus'` (diamond) — added for exactly this case, per its
own comment history alongside `AnchorShape`'s `'diamond'` in `@bpm/diagram-core`. Map:

| Flowchart `kind` | `DrawioShape` | Rationale |
|---|---|---|
| `'box'` | `'rounded'` | Matches flowchart's own SVG render (`rx="8"` rounded rect in `render.ts`) — mindmap's export uses the *default* shape (`undefined` → `'rectangle'`, `rounded=0`) which does **not** match its own rounded SVG boxes; don't repeat that inconsistency here, use `'rounded'` explicitly. |
| `'decision'` | `'rhombus'` | Matches the diamond `<polygon>` flowchart's `render.ts` already draws. |

## Edge and arrow preservation

`positioned.edges[].points` (already the router's final orthogonal path, identical shape to
mindmap's) maps directly to `DrawioEdge.points`. Draw.io's default edge style renders an
arrowhead at the target end already — no extra style configuration needed to convey
direction; `source`/`target` on the `mxCell` already encode it structurally, independent of
rendering. Edge `label` (present on `conditionalSequence`/`defaultSequence` edges carrying
e.g. `"yes"`/`"retry"`) maps directly to `DrawioEdge.label`.

**Not carrying edge `kind` (sequence/conditionalSequence/defaultSequence) into any draw.io
style distinction** — matches the "smallest safe design" brief. Draw.io has no built-in
visual convention matching BPMN's default/conditional-branch markers, and the edge label
already conveys the semantic distinction when one exists (an unlabeled `defaultSequence`
edge is indistinguishable from a plain `sequence` edge in the export, same information loss
mindmap accepted implicitly by not carrying its own edge semantics into style either — this
is exactly the "lossy" fidelity the capability descriptor should declare, not a gap to
engineer around).

## Labels and XML escaping

Already fully handled inside `@bpm/export-drawio`'s `exportToDrawioXml` — every `label`
passed through `escapeXml` before being written into `value="..."` attributes, confirmed
already covered by `packages/export-drawio/test/export.test.ts`'s escaping test. No new
escaping logic needed in the adapter; just pass flowchart's `label`/`node.label` strings
through unchanged, same as mindmap does.

## IDs and bounds

- **Node ids**: flowchart node ids (`box "..." as <id>`) pass straight through as
  `DrawioNode.id` — `FLOWCHART_ID_PATTERN` (`/^[A-Za-z_][A-Za-z0-9_.-]*$/`) already excludes
  the two drawio-reserved ids `'0'`/`'1'` (both start with a digit, illegal per the pattern),
  so no additional guard is needed there.
- **Edge ids**: mindmap uses `${edge.from}->${edge.to}` as the drawio edge id. Flowchart's
  own `PositionedFlowchartEdge.id` is already a distinct, index-based `e${index}` (assigned
  in `layout.ts`, guaranteed unique per edge already) — reuse it directly rather than
  reintroducing mindmap's `from->to` scheme. Two caveats to note, not to solve:
  - A pathological flowchart could declare a node literally named `e0` (legal per
    `FLOWCHART_ID_PATTERN`), which would collide with the first edge's auto-id `e0` in the
    drawio id space (drawio's `mxCell` ids are one flat namespace across vertices and
    edges — confirmed in `exportToDrawioXml`'s duplicate check, which checks edge ids
    against `nodeIds` too). This is a pre-existing class of risk mindmap's `from->to` scheme
    has too (a node id containing the literal substring `->` — legal per mindmap's own id
    pattern — could collide the same way). **`exportToDrawioXml` already fails closed**: on
    any collision it throws `Duplicate or reserved draw.io node id` before writing anything,
    it does not silently corrupt output. Given that safety property already exists and the
    collision requires a deliberately adversarial id choice, no code change is needed — just
    document it as a known limitation (see Documentation, below), matching how mindmap's
    equivalent risk was already implicitly accepted rather than engineered around.
- **Bounds**: `positioned.nodes[].{x,y,width,height}` map straight to
  `DrawioNode.{x,y,width,height}` — already absolute, already the same coordinate space
  `render.ts` uses (pre-`MARGIN` offset; drawio doesn't need the SVG's `MARGIN` padding,
  reuse the raw positioned values exactly as mindmap does).

## Capability descriptor shape

Mirror `mindmapAdapter.capabilities` exactly, changing only the format id and keeping
`editorMode` consistent with what adding *any* structured export means for a family:

```ts
export const FLOWCHART_DRAWIO_EXPORT_FORMAT = 'flowchart-drawio-xml';

capabilities: {
  svg: true, png: true,
  structuredExport: [FLOWCHART_DRAWIO_EXPORT_FORMAT],
  editorMode: 'external-export',   // was 'none' — same change mindmap made when it gained a structured export
  engineOverride: false,
  structuredExports: [{
    format: FLOWCHART_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml',
    fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net',
    roundTrip: 'none', fidelity: 'lossy',
  }],
}
```

`editorMode` going from `'none'` to `'external-export'` is a real, deliberate capability
change (not incidental) — it's what `modeDiagramBtn` in `apps/web/src/main.ts` reads to keep
"Edit as Diagram" BPMN-only, and it's semantically correct: flowchart now *does* have an
external-editable form, same reasoning as mindmap. Verify no web code assumed
`editorMode === 'none'` specifically for flowchart (it shouldn't, per Wave 3's cleanup —
`main.ts` reads `editorMode !== 'bpmn-js'` generically for the diagram-mode gate, and
`firstStructuredExport(capabilities)` for the export button, neither hardcodes `'none'`).

## Should export be lossy / non-round-trippable?

Yes, same as mindmap: `roundTrip: 'none'`, `fidelity: 'lossy'`. Concretely lossy in the same
two ways mindmap's export already is, plus one flowchart-specific one:
1. No import path exists at all (`@bpm/export-drawio` has no `importFromDrawioXml`) —
   `roundTrip: 'none'` is categorically true regardless of format-level fidelity.
2. Edge semantics (`conditionalSequence` vs `defaultSequence` vs plain `sequence`) collapse
   to "an edge, maybe with a label" in draw.io — the distinction is not recoverable from the
   exported file alone without re-parsing the label text.
3. Decision-diamond *sizing* (the extra `DIAMOND_MARGIN` flowchart's `layout.ts` adds beyond
   the wrapped label's bounding box, to fit the diamond's inscribed-rectangle interior) is
   flowchart-specific geometry that has no equivalent concept in draw.io's own rhombus
   sizing — draw.io will size/wrap the label according to its own rhombus rules once
   reopened, not flowchart's. Cosmetic only, not a data-loss concern, but worth naming
   alongside the others in the "lossy" documentation.

## Tests required

- **Unit** (new, in `packages/diagram-flowchart/test/`, mirroring mindmap's coverage): valid
  XML produced for a linear + branching fixture; decision nodes get `shape="rhombus"` (via
  the exported XML's `style` attribute), box nodes get `rounded=1`; edge `source`/`target`
  and `points` preserved; edge labels preserved and escaped (reuse a fixture with a label
  containing `&`/`<`/`"`); unsupported format string still throws (mirroring
  `mindmapAdapter`'s `Unsupported structured export "..." for mindmap` pattern — same
  message shape for flowchart); capability metadata exposed correctly via
  `getFamily('flowchart').capabilities`.
- **Runtime** (`packages/diagram-runtime/test/runtime.test.ts`): `exportStructuredDiagram`
  round-trips a flowchart source to drawio XML through the public runtime API, mirroring the
  existing mindmap case there.
- **Web** (`apps/web/test/familyUi.test.ts` or e2e): the *existing* `firstStructuredExport`-
  driven button (Wave 3) requires no new production code, but add an e2e case proving it —
  load a flowchart, confirm the draw.io export button is enabled and its label reads
  `Export draw.io XML` (from the descriptor, same assertion style as the existing mindmap
  draw.io e2e test in `live-render.spec.ts`), and that clicking it downloads a `.drawio` file
  (existing download-interception pattern already used for mindmap's case). This test is the
  actual proof that Wave 3's generalization work paid off — it should require zero new
  `main.ts` code to pass.
- **Regression**: existing 75/568/44 baseline must stay green throughout.

## Documentation

Update `docs/ROADMAP.md` item 15b (flowchart) to note structured export was added, and add a
short note to this design doc's own summary (or a follow-up note in
`packages/diagram-flowchart`'s own history) stating explicitly: *flowchart's draw.io export
is structured but lossy — no import, no round-trip guarantee, edge-kind semantics and
decision-diamond sizing are not preserved on reopen.* This satisfies the wave's own
definition-of-done line ("Documentation records that the export is structured but
potentially lossy") without inventing new documentation surface — one paragraph in the
existing roadmap entry is sufficient, no new standalone doc file needed beyond this design
spec itself.

## Explicitly out of scope

- **CLI wiring**: `bpm export` (`packages/cli/src/commands/export.ts`) is hardcoded to
  `'bpmn-xml'` today and mindmap's draw.io export was never wired into it either — web-only
  is the existing, accepted scope for structured exports beyond BPMN XML. Don't add CLI
  support as part of this wave; it would be new scope beyond mindmap's own precedent, not a
  gap this wave introduces.
- **`@bpm/export-drawio` changes**: none needed, as established above. Do not add anything
  to that package as part of this wave — if it turns out something's missing, that's a sign
  the design assumption above was wrong and worth flagging back, not a reason to expand the
  package's scope speculatively.
- **Multi-format export UI**: still only one structured export per family exists after this
  wave (flowchart's and mindmap's are each singular). `firstStructuredExport` picking index
  `[0]` remains correct; a format-picker UI is not needed and not in scope.

## Risks / compatibility concerns

- **Low risk overall** — this is the same pattern already proven in production by mindmap's
  Wave 1B export, applied to a second family with no new package-level code.
- The `editorMode: 'none' → 'external-export'` capability change is the one line that could
  theoretically affect existing behavior if some other code path keyed off flowchart's
  *current* `editorMode: 'none'` specifically (as opposed to reading capabilities generically
  per Wave 3). Verify during implementation that nothing does — Wave 3's audit already
  checked for this pattern generally and found none, but re-check specifically for
  flowchart's editorMode value now that it's changing.
- The id-collision edge case documented above is real but pre-existing in kind (mindmap has
  the equivalent risk) and fails closed — treat as documented, not blocking.

## Implementation checklist (for Codex)

1. `packages/diagram-flowchart/src/adapter.ts`: add `exportStructured`, mirroring
   `mindmapAdapter`'s implementation — map `kind: 'decision' → shape: 'rhombus'`,
   `kind: 'box' → shape: 'rounded'`; reuse `positioned.nodes[].id/label/x/y/width/height` and
   `positioned.edges[].{id,from,to,label,points}` directly (no `DIAMOND_MARGIN`-specific
   adjustment needed — export the box as already sized, per "Should export be lossy" above).
2. Update `capabilities` on `flowchartAdapter`: add `structuredExport`/`structuredExports`
   entries as specified above, change `editorMode` to `'external-export'`.
3. Export `FLOWCHART_DRAWIO_EXPORT_FORMAT` constant, same pattern as
   `MINDMAP_DRAWIO_EXPORT_FORMAT`.
4. Add the unit/runtime/web tests listed above.
5. Update `docs/ROADMAP.md`'s item 15b with the one-paragraph lossy/no-round-trip note.
6. Run `npm test`, `npm run build`, `npm run test:e2e -w @bpm/web`, `git diff --check` (catch
   whitespace/line-ending issues before commit).
7. Do not touch `@bpm/export-drawio`, the CLI, or mindmap's adapter/capabilities.

## Definition of done

- `flowchartAdapter.capabilities.structuredExport` includes `'flowchart-drawio-xml'`.
- Export produces well-formed XML (structural validation, same `saxes`-based approach
  `@bpm/export-drawio`'s own tests already use) containing a `rhombus`-styled cell per
  decision node and a `rounded=1`-styled cell per box node.
- Mindmap's export (`mindmap-drawio-xml`) is byte-for-byte unchanged — no shared code path
  was altered in a way that affects it.
- The web export button works through `firstStructuredExport(capabilities)` alone — no new
  `family === 'flowchart'` conditional appears anywhere in `apps/web/src/main.ts`.
- 75+/568+/44+ suite green (exact new counts depend on how many tests are added).
- No `@bpm/ast`/BPMN import introduced anywhere in `packages/diagram-flowchart`.
- No claim of round-trip fidelity anywhere in code or docs — `roundTrip: 'none'` is explicit
  in the capability descriptor, and the lossy/no-import limitation is documented in
  `docs/ROADMAP.md`.
