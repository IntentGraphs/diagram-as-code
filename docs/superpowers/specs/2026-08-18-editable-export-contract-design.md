# Editable-export contract for the diagram runtime

Design-only artifact. No production files were edited to produce this — it proposes
changes to `packages/diagram-runtime/src/types.ts`, a new `packages/export-drawio`
package, and CLI/UI wiring, none of which are made here.

## Where this sits in the pipeline

The canonical path is unchanged and stays the only *required* path:

```
text DSL → family AST → positioned diagram → native SVG/PNG
```

Editable export is an optional side-channel hanging off the existing extension points
that `packages/diagram-runtime` already ships: `FamilyCapabilities.structuredExport`,
`FamilyCapabilities.editorMode`, and `DiagramFamilyAdapter.exportStructured`
(`packages/diagram-runtime/src/types.ts:40-56`). The `'external-export'` value of
`FamilyEditorMode` already exists and its doc comment already names this exact case
("`'external-export'` only produces a structured format editable in a *different* tool
(e.g. draw.io/Mermaid, once those exist)") — this design fills in the part that was left
as `// once those exist`. Nothing about the canonical pipeline changes; a family that
declares no editable export still round-trips only through SVG/PNG, exactly as
`diagram-mindmap` does today (`capabilities.editorMode: 'none'`).

## Vocabulary: four distinct claims, not one

The current `FamilyCapabilities.structuredExport: string[]` conflates four separable
questions into one boolean-ish "is this format in the list." A contract that lets an
adapter advertise editable export safely needs to answer each independently, because
BPMN's `bpmn-xml` already answers them differently than a future draw.io export would:

| Question | BPMN's `bpmn-xml` today | A future draw.io export |
|---|---|---|
| Is it a structured (non-SVG) serialization? | Yes | Yes |
| Is a human meant to hand-edit it in some *other* tool? | No — it round-trips back into `bpmn-js`, the app's *own* embedded editor | Yes — draw.io/diagrams.net, external to this app |
| Does bpm know how to import it back? | Not via `exportStructured`'s counterpart (diagram-mode↔text sync is its own subsystem, `docs/superpowers/specs/2026-08-17-diagram-mode-text-import-design.md`) | No, not in this contract's v1 |
| Is the export a complete, faithful serialization or a visual approximation? | Lossless for everything the grammar models (see `docs/STATUS.md`'s payload caveats) | Lossy by construction (see comparison below) |

"Structured export," "editable export," "external editor support," and "round-trip
support" are four separate capability axes. A format can be structured without being
editable (e.g. a debug JSON dump nobody is meant to hand-edit); editable without having
external-editor backing (nothing enforces you *can't* open a `.drawio` in a text editor);
round-trippable only if there's an importer for that exact format id; and lossy or
lossless independent of all three.

## Proposed TypeScript interfaces

Additive only — every new field is optional or has a safe default, so `bpmnAdapter`
(`packages/diagram-runtime/src/bpmn.ts:11-45`) and `mindmapAdapter`
(`packages/diagram-mindmap/src/adapter.ts:7-10`) both continue compiling and behaving
identically without being touched.

```ts
// packages/diagram-runtime/src/types.ts

/** Stable id for one exportable structured format. Namespace non-BPMN formats as
 * `${family}-${target}` (e.g. `mindmap-drawio-xml`) so a future family's export can never
 * collide with another family's — see "Security considerations" for why collision matters.
 * `bpmn-xml` itself is grandfathered un-namespaced; do not add a second un-namespaced id. */
export type StructuredExportFormatId = string;

export interface StructuredExportDescriptor {
  format: StructuredExportFormatId;
  /** UI label, e.g. "draw.io XML". */
  label: string;
  mimeType: string;
  /** Includes the leading dot, e.g. ".drawio". */
  fileExtension: string;
  /** Whether a human editing this artifact in some tool is a sensible, intended operation —
   * distinct from merely being structured. False for e.g. a machine-only debug dump. */
  editable: boolean;
  /** Name of the external tool this format targets. Present only when `editable` is true
   * and the target is a specific outside application; used for UI copy only ("Open in
   * draw.io"), never for a deep link — see recommendation below on why v1 stays
   * download-only. */
  externalEditor?: string;
  /**
   * - 'none': one-way export; bpm has no importer for this format id.
   * - 'full': export → external edit → import reconstructs an equivalent AST. Requires a
   *   matching `DiagramFamilyAdapter.importStructured` for the *same* format id.
   * This is a contract-only claim — the runtime does not enforce it at export time. See
   * "Test strategy" for the one place it *is* checked (adapter conformance test).
   */
  roundTrip: 'none' | 'full';
  /** Whether every AST-level semantic fact and every layout-level geometric fact the
   * positioned diagram holds is recoverable from the export alone ('lossless'), or the
   * export is a visual approximation only ('lossy') — e.g. shape/position/label but not
   * node kind, semantic ids, or family-specific metadata. */
  fidelity: 'lossless' | 'lossy';
}

export interface FamilyCapabilities {
  svg: true;
  png: true;
  /** Unchanged. Existing call sites (`apps/web/src/main.ts:419`,
   * `exportStructuredDiagram`'s `.includes(format)` check) keep working as-is. Always kept
   * in sync with `structuredExports.map(d => d.format)` where the latter is present. */
  structuredExport: string[];
  /** New, optional. Adapters that don't set it (BPMN, mindmap today) are unaffected;
   * callers that want the richer metadata check for its presence and fall back to treating
   * every id in `structuredExport` as `editable: false, roundTrip: 'none'` if absent. */
  structuredExports?: StructuredExportDescriptor[];
  editorMode: FamilyEditorMode;
  engineOverride: boolean;
}

// DiagramFamilyAdapter itself gains nothing new in v1 — see the recommendation below for
// why `importStructured` is deliberately *not* added yet, even as an optional stub.
```

## Capability changes

- `FamilyEditorMode` is unchanged; `'external-export'` starts actually being used instead
  of only documented.
- `structuredExport: string[]` is unchanged in shape and meaning — it stays the
  authoritative gate `exportStructuredDiagram`/`exportPositionedDiagram` already check
  (`packages/diagram-runtime/src/registry.ts:131,160`).
- `structuredExports?: StructuredExportDescriptor[]` is new, optional, additive. It exists
  purely so UI code can ask richer questions ("is this editable," "what do I label the
  download button," "what extension") without re-deriving them from a bare string id by
  convention.
- No change to `DiagramFamilyAdapter`'s required members. `exportStructured` is reused
  as-is for draw.io the same way it's used for BPMN XML today.

## Dependency direction

Mirrors the shape BPMN already establishes and that
`docs/superpowers/specs/2026-08-17-diagram-family-extensibility-notes.md:27` explicitly
warns not to violate ("reuse `@bpm/export-xml` for non-BPMN diagrams" → **Don't**, "worse
than no export"):

```
packages/diagram-runtime   (generic: types, registry — knows StructuredExportDescriptor
                             as a shape, knows nothing about draw.io or BPMN specifically)
        ^ depended on by
packages/diagram-mindmap --------------------------> packages/export-drawio (new, generic
        (or any future        depends on               shape+tree serializer — no @bpm/ast,
         non-BPMN family)                               no @bpm/export-xml, no BPMN types)
packages/diagram-runtime/src/bpmn.ts --------------> packages/export-xml (existing,
                                       depends on       untouched, BPMN-only, unaware
                                                         draw.io export exists)
```

Two invariants this preserves:

1. `diagram-runtime` never imports `export-drawio` or `export-xml` directly — only the
   per-family adapter modules do, exactly like `bpmn.ts` does today
   (`packages/diagram-runtime/src/bpmn.ts:6`).
2. `export-drawio` takes a generic `{ nodes, edges }`-shaped input, not a family's AST or
   positioned type. The calling adapter maps its own type into that shape before calling
   it. This is what keeps `export-drawio` reusable for a later family (architecture, 15c)
   without a new package, and is what keeps BPMN's `export-xml` — which legitimately needs
   BPMN-specific types (gateways, events, lanes) — completely uninvolved.

## Comparison

| | draw.io XML (mxGraph) | Mermaid | Structurizr DSL/JSON | tldraw snapshot | Excalidraw data |
|---|---|---|---|---|---|
| Structured | Yes, plain XML | Yes, but it's a second *text DSL*, not a data format | Yes | Yes, JSON | Yes, JSON |
| Externally editable | Yes — draw.io/diagrams.net, mature, offline-capable desktop app | Yes — mermaid live editor, many IDE plugins | Yes — Structurizr Lite / structurizr.com, mature *within the C4 niche* | Yes — tldraw app/embed, newer | Yes — excalidraw.com/embed, mature |
| What we'd have to build | A hand-written XML serializer for a small `<mxCell>` subset (rect nodes + tree edges) | A *second grammar and parser* per family (mermaid has no shared vocabulary across mindmap/flowchart/etc., and no way to carry pinned x/y at all — it re-lays-out) | Meaningful only once an "architecture" family exists (15c); a category error for BPMN or mindmap, same problem `export-xml` reuse already has | Adoption of tldraw's versioned SDK/schema as a runtime dependency, not just a serializer | Hand-serializable JSON schema (documented, stable enough), no SDK dependency required |
| Round-trip feasibility | Plausible long-term — well-documented format — but reconstructing family-AST semantics (node "kind", not just shape) from arbitrary user-edited XML is a real import project, not a parser tweak | Ironically hard despite being text: mermaid has no position model, so "round-trip" would only ever recover structure, never our layout | Only ever meaningful for the future architecture family | Plausible (JSON) but tldraw has no typed "node vs. edge vs. family" concept — everything is generic shapes, so reconstruction is *more* lossy than draw.io, not less | Similar profile to tldraw — sketch-oriented shape model, no diagram-semantic typing |
| Fidelity from our AST | Lossy (positions/shapes/labels; node "kind" and other semantic metadata not representable unless smuggled into custom `mxCell` attributes external editors will preserve but can't populate) | Lossy on layout always; can be structurally lossless only where our AST maps cleanly onto mermaid's own vocabulary (mindmap does, BPMN mostly doesn't) | Lossy for anything not a C4 model | Lossy, arguably most lossy of the group — no diagram-semantic typing at all | Lossy, same profile as tldraw |
| New security surface | Text/attribute injection into XML/`style` strings if labels aren't escaped through a dedicated encoder; XXE is import-only, out of scope until an importer exists | Text injection into mermaid syntax (label containing `-->`, quotes) — parser is downstream of us, but still worth escaping at generation time | Line-oriented DSL, lower injection surface, but the "false semantics" risk from forcing non-C4 content through it | JSON has no XXE class, but may embed asset/image references — bounded if we never import | Same JSON-safety profile as tldraw |
| Effort | **Low** — small documented XML subset, zero new runtime deps | Medium-high — a grammar per family, and layout is thrown away regardless | Medium, but premature (no architecture family yet) | Medium-high — pulls in an external SDK as a real dependency, more volatile than a plain-XML subset | Low-medium — hand-serializable, but still sketch-shaped, not diagram-shaped |

## Recommendation: smallest safe contract

Given the four constraints (draw.io export only; no draw.io import; no round-trip
claims; BPMN XML stays BPMN-only), draw.io XML is the clear pick — it's the only option
in the table with *zero* new runtime dependencies and a small, hand-writable encoder.
Concretely:

1. **Add the two new types above** (`StructuredExportDescriptor`,
   `structuredExports?:` on `FamilyCapabilities`) to `diagram-runtime/src/types.ts`.
   Nothing else in that file changes. BPMN's adapter is not touched — it satisfies the
   new optional field vacuously.
2. **New leaf package `packages/export-drawio`**, one function,
   `exportToDrawioXml(input: { nodes: DrawioNode[]; edges: DrawioEdge[] }): string`,
   over a generic shape it defines itself — not `@bpm/ast`, not BPMN's `Diagram` type. The
   `diagram-mindmap` adapter (first consumer, per roadmap 15a/15b precedent) maps
   `PositionedMindmap` into that shape and calls it from `exportStructured`, exactly the
   way `bpmn.ts` calls `exportToXml` today.
3. **Format id**: `mindmap-drawio-xml`, never bare `drawio-xml` — enforces the
   per-family namespacing that keeps this from ever colliding with `bpmn-xml`.
4. **Capabilities for the mindmap adapter become**:
   ```ts
   editorMode: 'external-export',
   structuredExport: ['mindmap-drawio-xml'],
   structuredExports: [{
     format: 'mindmap-drawio-xml', label: 'draw.io XML',
     mimeType: 'application/xml', fileExtension: '.drawio',
     editable: true, externalEditor: 'draw.io / diagrams.net',
     roundTrip: 'none', fidelity: 'lossy',
   }],
   ```
5. **Do not add `importStructured` to `DiagramFamilyAdapter` at all yet** — not even as an
   unused optional stub. An interface member nothing implements is exactly the
   "half-finished implementation" this project's own conventions rule out; add it in a
   later, separately-scoped item together with a real importer and the conformance test
   below, when import is actually being built.
6. **`roundTrip` is `'none'` everywhere in this contract's v1.** The `'full'` arm exists
   in the type purely so the *shape* of a future importer's declaration is settled now,
   not so it gets used yet.
7. **CLI gap this surfaces**: `packages/cli/src/commands/export.ts:11` hardcodes
   `exportStructuredDiagram(text, 'bpmn-xml', ...)` — the export command has no format
   selector at all today. It needs one before `mindmap-drawio-xml` is reachable from the
   CLI. Don't reuse `--format`: `args.ts:10,38` already defines `--format` as the
   *render* command's `svg | png` output kind, and overloading it for the export
   command's structured-format id would silently misparse `bpm render --format png` style
   invocations if the two commands ever share arg-parsing code. Add a distinct flag (e.g.
   `--target`) to the export command, defaulting to `'bpmn-xml'` so existing invocations
   and `packages/cli/test/export.cli.test.ts` keep passing unmodified.
8. **UI wiring**: add an "Export draw.io" action in `apps/web/src/main.ts` gated the same
   way the existing BPMN export button is (`main.ts:419`), i.e.
   `result.capabilities?.structuredExport.includes('mindmap-drawio-xml')`. **Download
   only** — no "Open in draw.io" deep link or clipboard handoff in v1. That's scope and
   security surface neither requested nor needed: a downloaded `.drawio` file opens in
   draw.io by drag-and-drop already, and a deep-link/URL-scheme integration is a distinct,
   separately-securable feature (arbitrary content getting silently pushed into a
   URL/scheme handler that another application — outside this codebase's control — parses).

## Security considerations

- **XML/attribute injection**: draw.io's `mxCell` shapes carry a semicolon-separated
  `style="key=value;key=value"` attribute. A label containing `;` or `=` must never be
  concatenated raw into that attribute — it must go through the `label`/`value` attribute
  (itself XML-escaped, reusing the same discipline `render-core`'s `escapeXml` already
  applies to SVG text) and never through `style`. This mirrors the escaping discipline
  `packages/export-xml/test/escape-ids.test.ts` already enforces for BPMN XML ids — the
  new package needs its own equivalent test, not a shared one (different attribute rules).
- **XXE is out of scope for v1 by construction**: no importer exists, so nothing in this
  contract ever parses untrusted draw.io XML. This must be re-litigated the moment import
  is scoped — a naive XML parser on arbitrary uploaded `.drawio` files is a textbook XXE
  vector, and whatever XML parser is chosen then needs external-entity resolution
  disabled explicitly.
- **Format id collision across families**: `exportStructuredDiagram` and
  `exportPositionedDiagram` (`registry.ts:131,160`) both gate purely on
  `adapter.capabilities.structuredExport.includes(format)` scoped to the *resolved*
  family, so a same-named format registered by two different adapters wouldn't silently
  cross-call today — but UI code that hardcodes a format string against a *specific*
  family assumption (`main.ts:419`'s `result.family !== 'bpmn'` guard) would misbehave if
  a future family ever claimed `bpmn-xml` for itself. The per-family namespacing
  convention (`${family}-${target}`) is the mitigation; back it with the conformance test
  below rather than trusting convention alone.
- **No external editor deep link in v1** removes an entire class of concern (URL-scheme
  or clipboard handoff to an application outside this codebase's control) rather than
  needing to secure it — see point 8 above.
- **Existing size limits are reused, not bypassed**: `diagram-mindmap`'s
  `MAX_NODES`/`MAX_SOURCE_CHARS` (`packages/diagram-mindmap/src/limits.ts`) already bound
  the AST before it ever reaches export, so `export-drawio` doesn't need its own DoS
  bound — it only ever sees an already-limited node/edge set.

## Test strategy

- **Unit tests, `packages/export-drawio`**: fixture-based, same style as
  `packages/export-xml/test/export.test.ts` — small node/edge fixture in, exact XML
  structure out (`mxGraphModel` root, one `mxCell` per node/edge).
- **Escaping test**: labels containing `<`, `&`, `"`, `'`, `;`, `=` must not corrupt
  either the XML structure or a neighboring cell's `style` attribute — the `export-xml`
  analogue is `escape-ids.test.ts`; this needs its own version since the attribute rules
  differ (style-string metacharacters, not just XML metacharacters).
- **Adapter conformance test** (new, in `diagram-runtime/test/`, or extending
  `runtime.test.ts`): iterate every registered adapter's `structuredExports` once
  populated and assert (a) format ids are globally unique across *all* registered
  families — the automated backstop for the namespacing convention above — and (b) no
  descriptor claims `roundTrip: 'full'` without the adapter also exposing a matching
  importer for that same format id. This is the one place the "contract-only, not
  runtime-enforced" round-trip claim actually gets checked, and it fires immediately if
  anyone flips `roundTrip` to `'full'` without building the importer.
- **CLI test**: extend `packages/cli/test/export.cli.test.ts` with a case for
  `bpm export --target mindmap-drawio-xml` producing well-formed XML to stdout and to
  `--out`, matching the existing bpmn-xml cases' structure; add one negative case
  confirming an unsupported target on a family that doesn't declare it still produces the
  existing `unsupported_export` diagnostic shape (`registry.ts:131-136`) unchanged.
- **Manual smoke check, not CI-automated**: open one generated `.drawio` fixture in the
  actual draw.io desktop/web app before each release that touches the encoder, confirming
  it opens without warnings. Automating this (headless Electron or similar) is worth
  revisiting only if the encoder's surface grows past the current small shape+tree
  subset.

## Definition of done

- [ ] `StructuredExportDescriptor` and `FamilyCapabilities.structuredExports?` land in
      `diagram-runtime/src/types.ts`; `bpmnAdapter` and `mindmapAdapter` compile and all
      existing tests pass unmodified.
- [ ] `packages/export-drawio` exists with its own `package.json`/tests, zero dependency
      on `@bpm/ast`, `@bpm/export-xml`, or any BPMN-specific type.
- [ ] `diagram-mindmap`'s adapter implements `exportStructured` for `mindmap-drawio-xml`
      and sets `editorMode: 'external-export'` plus both `structuredExport` and
      `structuredExports`.
- [ ] `bpmn-xml` behavior, format id, and `editorMode: 'bpmn-js'` are byte-for-byte
      unchanged — verified by the existing BPMN test suite passing with no diffs.
- [ ] CLI export command gains a `--target` flag (default `'bpmn-xml'`); existing
      `export.cli.test.ts` cases pass unmodified; a new case covers
      `--target mindmap-drawio-xml`.
- [ ] Web UI gains a download-only "Export draw.io" action gated on the capability check;
      no deep link, no clipboard integration.
- [ ] The adapter conformance test (format-id uniqueness + round-trip/importer pairing)
      exists and passes.
- [ ] Escaping tests for the draw.io encoder pass, covering both XML metacharacters and
      `style`-attribute metacharacters.
- [ ] `docs/STATUS.md` / `docs/ROADMAP.md` updated to record that mindmap (15a) now has
      an optional lossy draw.io export, explicitly still no import and no round-trip
      claim — keeping the roadmap's existing "SVG-only... until/unless a specific export
      target is separately scoped" note accurate rather than stale.
- [ ] Nothing added here required touching `packages/export-xml`, `packages/diagram-core`,
      or any BPMN-specific module.
