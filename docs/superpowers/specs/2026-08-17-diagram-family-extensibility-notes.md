# Diagram family extensibility — architecture notes

_Backs roadmap item 15 (`docs/ROADMAP.md`). Not a design for a specific family — that's item 15a/15b/15c's job, each getting its own dated design doc. This is the shared reasoning about what's reusable, what's new, and what shouldn't be done, so each family's design doesn't re-derive it._

## How BPMN-specific the core actually is today

The AST (`packages/ast/src/types.ts`) is a *closed* discriminated union, and the vocabulary is BPMN itself, not generic diagramming: `EventTrigger` (message/timer/error/…), `GatewayType` (exclusive/parallel/…), `TaskType` (userTask/serviceTask/…), `FlowType` restricted to BPMN's sequence/message/association flows, `Pool`/`Lane` named for process swimlanes. Rendering (`icons.ts`, `pathMap.ts`, `taskMarkers.ts`) draws literal BPMN 2.0 PathMap glyphs. `bpmnLegality.ts` encodes rules with BPMN 2.0.2 spec citations. `@bpm/export-xml` targets the BPMN 2.0 XML schema specifically.

## What's already generic (reusable kernel)

| Component | Why it's already generic |
|---|---|
| `packages/layout-core` — `geometry.ts`, `anchors.ts`, `overlap.ts`, `routing/` | The obstacle-avoiding visibility-graph router operates on position/size/edge geometry only — no node kind ever enters the routing math. |
| `render`'s `edges.ts` / `text.ts` | Label wrapping, placement, and orthogonal edge drawing are shape-agnostic; they consume points and strings. |
| Nested-children pattern (`ActivityNode.children`/`childEdges`, built for subprocess) | Structurally identical to "a system contains components" or "a mind-map node has children." |
| `at (x, y)` manual pins + `layout:`/`positioning:` directives | A working template for a `diagram: <family>` family-select directive at the top of a file. |
| `@bpm/validate`'s parse → layout → analyze shape | The harness pattern is notation-agnostic; only the parse and legality steps are BPMN-specific today. |

## Verdicts

| Move | Verdict | Reason |
|---|---|---|
| New parser + AST per family, sharing tokenizer patterns but its own keywords | **Can, with work** | Same technique as the existing grammar, different vocabulary. Doesn't touch BPMN's exhaustiveness guarantees. |
| Pluggable glyph renderer (kind → draw function registry) replacing today's hard-coded BPMN icon switch | **Can, with work** | `icons.ts` is already one dispatch table; generalizing its shape is additive, not a rewrite of layout or routing. |
| Widen the existing `DiagramNode` union with new kinds like `'component'` or `'mindmapNode'` | **Don't** | `icons.ts`, `taskMarkers.ts`, `export-xml`'s serializer, and `bpmnLegality.ts`'s rule table all switch exhaustively on `.kind`. TypeScript's exhaustiveness checking is what keeps that correct today; adding a variant to the *same* union either breaks that guarantee everywhere or forces BPMN-specific modules to grow cases they have no business handling. A parallel AST per family, not a widened one, is the sound path. |
| Reuse `bpmnLegality.ts` structural rules against a non-BPMN diagram | **Don't** | Its rules cite BPMN 2.0.2 clauses directly (start/end event cardinality, gateway fan-in/out). Running them against a mind map or architecture diagram produces false positives/negatives against a spec that was never describing that notation. |
| Reuse `@bpm/export-xml` for non-BPMN diagrams | **Don't** | BPMN 2.0 XML has no element for a mind-map node or "AWS Lambda." Forcing one through is either lossy or a semantically false export — worse than no export. SVG-only output is fine for v1 of any new family; add a structured export target later, per-family, only once something concrete needs it. |
| Support every diagram type Mermaid-style, open-ended | **Explicitly out of scope** | The project's own `README.md` already draws this line: "Is not: a Mermaid replacement for every diagram type." Treat this as a short, deliberately chosen list of families (roadmap item 15a/b/c…), not an unbounded ambition. |

## Sequencing principle

Order new families by how much *new* work they need beyond the reusable kernel above, not by how commonly requested they are — see roadmap item 15's 15a (mind maps) → 15b (flowcharts) → 15c (architecture) ordering and its per-item complexity notes. Proving the `diagram:`-family directive and glyph registry once on the *cheapest* family (mind maps: no new edge semantics, tree-only) de-risks every family that follows.
