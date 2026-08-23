# Competitive gap assessment

_Assessment date: 2026-08-22. Audience: product stakeholders and maintainers._

## Executive Summary

`bpm` already has a credible technical foundation: a text-first multi-family diagram pipeline, BPMN XML export/import, a real `bpmn-js` editor, validation, AI generation/repair/review, project-local persistence, and editable presentation exports. The CLI increment is now largely complete as a usable local automation surface: human defaults, stable JSON, aliases, stdin/stdout, atomic writes, explicit non-destructive repair, and real-binary acceptance tests.

The largest competitive weakness is not another diagram family. It is the unfinished contract between source text, the visual editor, and the semantic BPMN model. Today those are two authoring paths joined by an explicit one-shot conversion; BPMN execution semantics are still partial; and projects remain local and single-user. Event payload round-tripping, structured conversion-loss accounting, BPMN XML snapshots in project bundles, and an explicit safer AI-key policy now improve the trust boundary without claiming full synchronization.

### Recommendation

Prioritize a **trustworthy source ↔ canvas ↔ BPMN interchange loop** and a **Git-native review/CI workflow** before adding more notation or building a hosted collaboration platform. This creates a differentiated category between Mermaid/PlantUML-style text generation and Camunda/draw.io-style visual modeling:

- the source remains reviewable and reproducible;
- the canvas is useful for business users;
- edits round-trip with an explicit loss report rather than silently degrading;
- validation and rendered diffs work naturally in pull requests and agents.

Do not pursue full process execution, forms, DMN, real-time collaboration, or a broad enterprise platform until there is evidence that users need that expansion. Those are separate product directions, not small feature additions.

## Update after the CLI increment

The CLI gap is no longer a top product weakness. The current implementation and documentation now cover human-readable defaults, `--json` machine output, `check`/`import` aliases, stdin/stdout pipelines, `--version`, generated command help, atomic artifact writes, an explicit `fix` command, runtime capability discovery, changed-file checks, SARIF, and a dependency-aware clean CLI build path. The remaining CLI work is maintainability and distribution: a fully discriminated command-args/service layer and eventual standalone package publication.

This shifts the product priority back to the web/editor and semantic layers. Fresh verification passed `npm run build`, `npm test` with 929 tests, `npm run check:style`, and `git diff --check`.

## What is already strong

| Capability | Current evidence | Competitive meaning |
|---|---|---|
| Text-first authoring | Five families, deterministic parsing/layout/rendering, examples, CLI | Stronger than a visual-only BPMN modeler for Git, code review, and automation |
| BPMN visual editing | Embedded `bpmn-js` Modeler with open/new/save/export and zoom | Avoids the usual text-only adoption barrier |
| Interchange | BPMN XML export, external XML import, and explicit Import to Text | Good foundation, but not yet a complete round-trip contract |
| Quality automation | `validate`, geometry inspection, legality subset, AI review/repair/generation | Strong foundation for agents and CI; semantic coverage remains incomplete |
| Local-first workflow | IndexedDB projects, portable project bundle, no backend or default telemetry | A real privacy and deployment advantage for regulated or offline work |
| Output | SVG/PNG, BPMN XML, editable PPTX, CLI-only semantic DOCX, family exports | Better than many code-first tools for editable stakeholder deliverables |
| Diagram breadth | BPMN, mind map, flowchart, architecture, bounded Gantt | Useful portfolio, but creates a family-parity and product-focus burden |

## Competitive baseline

The comparison uses official product/documentation sources and the current repository, not customer win/loss data.

| Dimension | `bpm` | Mermaid / PlantUML | bpmn-js | Camunda Modeler / Web Modeler | draw.io / Lucidchart |
|---|---|---|---|---|---|
| Primary mode | Text plus separate visual BPMN mode | Text/code with live rendering and broad diagram coverage | Visual BPMN toolkit | Visual BPMN/DMN/forms and executable process work | Visual, freeform diagramming |
| Source control | Excellent local source model; CLI exists | Excellent | XML is the artifact; source workflow is up to the integrator | Git sync exists in Web Modeler, alongside managed projects | File-based; integrations and sharing are strong |
| BPMN semantics | Useful notation subset; many execution semantics absent | BPMN is not the core strength | BPMN modeler/interchange foundation | Strongest among this set for engine-ready modeling | Broad BPMN shape library, mainly diagramming |
| Visual editing | Real editor, but not continuously connected to text | Live editors; visual round-trip varies by product | Strong canvas and extensibility | Strong canvas, properties, templates, testing | Strong canvas, freeform editing, templates |
| Collaboration | None beyond local files/browser storage | Depends on product surface | Not provided by the base toolkit | Real-time collaboration, roles, comments, versions | Real-time collaboration, sharing, comments |
| Execution/testing | Explicitly out of scope | Out of scope | Extensible but not an engine | Deploy, run, test, monitor, forms, connectors | Out of scope |
| AI | Optional BYOK/local providers for BPMN generation/review/repair | Mermaid now advertises AI/drag-and-drop/voice in its full editor | Integrator-owned | Copilot generates executable process drafts | AI generation and iterative refinement |
| Output breadth | Strong technical/interchange outputs, no PDF target | Very broad image/document formats | Depends on integrator | BPMN/DMN/forms and image/XML outputs | Broad image/PDF/HTML/XML/JSON outputs |

Evidence: [Mermaid overview and syntax](https://mermaid.js.org/intro/), [PlantUML capabilities and formats](https://plantuml.com/), [bpmn-js walkthrough](https://bpmn.io/toolkit/bpmn-js/walkthrough/), [Camunda Modeler](https://camunda.com/platform/modeler/), [Camunda collaboration](https://docs.camunda.io/docs/8.7/components/modeler/web-modeler/collaboration/), [Camunda resources/templates](https://docs.camunda.io/docs/components/modeler/web-modeler/modeling/import-resources/), [Camunda Play/testing](https://docs.camunda.io/docs/components/modeler/web-modeler/validation/play-your-process/), [draw.io capabilities](https://www.drawio.com/docs/manual/), [draw.io BPMN](https://www.drawio.com/docs/diagram-types/bpmn-2-0/), and [Lucidchart process mapping](https://www.lucidchart.com/pages/examples/process-mapping-software).

## Highest-value gaps

### 1. Source, canvas, and semantic model are not one product yet — P0

Current behavior is intentionally one-shot: Text mode and Diagram mode are independent, and Import to Text requires an explicit conversion/confirm step. The project bundle now retains BPMN XML snapshots when available, and Import to Text reports preserved, transformed, and dropped conversion outcomes. The importer can still warn or skip BPMN constructs that have no DSL equivalent, and the repository documents a real cross-renderer geometry limitation for expanded subprocesses.

**Why it matters:** Mermaid/PlantUML users expect source reproducibility; visual BPMN users expect canvas fidelity. `bpm` is close to offering both, but the seam is where trust is lost.

**Build next:**

- stable semantic IDs and a canonical intermediate representation for both modes;
- a round-trip report with preserved, transformed, and dropped elements;
- deterministic text formatting and semantic diff output;
- import refusal thresholds for unsafe loss instead of warning-only conversion;
- project bundles that include diagram-mode BPMN/XML state and source relationships;
- a deliberate “reflow vs preserve geometry” choice on import.

**Acceptance signal:** an external BPMN file can be imported, edited visually, converted to text, and re-exported with an inspectable loss report and no silent semantic loss.

### 2. BPMN semantics are visually broad but operationally shallow — P0/P1

The latest implementation now preserves a useful first slice of event semantics: timer date/duration/cycle values, message/error/escalation/signal references, and conditional expressions round-trip through the AST, text attributes, and BPMN XML. The remaining gap survey items are intermediate throw events, standard loops and multi-instance activities, compensation wiring, inclusive/complex gateway semantics, black-box participants, and execution metadata.

Directed data associations are supported through the generic `..>` association form, and event-definition payloads now have explicit AST/text/XML support. The remaining semantics are still not explicit enough for execution-oriented users or tooling.

**Build order for interoperability:**

1. Intermediate throw events and explicit event semantics.
2. Loops and multi-instance markers/cardinality/completion conditions.
3. Call activity references, data input/output metadata, and gateway condition semantics.
4. Compensation/transaction semantics and vendor extension namespaces only when a target engine is chosen.

**Do not start with:** full execution, deployment, monitoring, or every BPMN edge case. First make exported/imported models honest and interoperable.

### 3. No team review or shareable workflow — P1

The product has local persistence and portable bundles, but no accounts, permissions, real-time collaboration, comments, mentions, review states, version history, or share/presentation link. Camunda Web Modeler documents roles, real-time editing, element discussions, mentions, and versioned projects; draw.io and Lucidchart also emphasize collaboration and sharing.

**Recommended local-first version:** add GitHub/GitLab-oriented review before a backend:

- `bpm check` for changed files and stable machine-readable diagnostics;
- a GitHub Action that consumes the shipped SARIF output;
- rendered SVG/PPTX artifacts attached to CI;
- semantic diagram diff with changed nodes/edges and a loss report;
- canonical formatting/freeze checks to make reviews readable.

This serves the current developer/agent audience without changing the local-first promise. Add hosted comments/presence only after demand is demonstrated.

### 4. CLI capability discovery and distribution remain — P2

The first public-contract slice is now shipped and tested. The follow-up slice now ships runtime capability discovery, typed command metadata/help generation, SARIF/changed-file checks, and a dependency-aware clean CLI build path. These matter for scale and adoption, but they no longer block the core product promise.

**Build next:** a fully discriminated command-args/service layer and standalone package publication when release ownership, bundling, and provenance are settled. Keep the shipped stdin/stdout, JSON, alias, atomic-write, capability, and SARIF behavior protected by contract tests.

### 5. Browser AI credential policy is now explicit — release-readiness follow-through

The web settings code now stores the OpenAI-compatible API key in session storage by default and exposes an explicit “Remember API key on this device” opt-in for private devices. The UI, `docs/AI_REVIEW.md`, and `docs/AI-DATA-HANDLING.md` now agree; older persistent keys are migrated back to session-only storage. This removes the product-truth conflict, while the release checklist should still verify the reset path and public-host threat model.

**Release follow-through:** retain the storage-policy unit tests, keep the checkbox label and disclosure synchronized, and verify that clearing the field removes both session and persistent copies.

### 6. Project assets stop at text diagrams — P1 if execution is pursued

Camunda’s Web Modeler treats BPMN, DMN, forms, Markdown, connectors, and templates as project resources. `bpm` currently stores a flat list of named text diagrams; BPMN XML snapshots can now travel with a project entry, but there is no linked resource model for forms, decision tables, message catalogs, or reusable element templates.

**Decision:** either keep the product explicitly diagram-as-code and document this boundary, or introduce a versioned multi-file project manifest. Do not add isolated forms/DMN fields without the resource model that gives them ownership, import/export, and versioning.

### 7. Presentation and publishing are less complete than the authoring core — P2

Current exports are useful, but the CLI documentation explicitly says there is no PDF target, semantic pagination is narrow, DOCX is an embedded vector image rather than native Word shapes, and the web surface is not a clean share/presentation mode. PlantUML and draw.io advertise broad PDF/HTML/image/export options.

**Build after the source contract:** a `publish` bundle with validated SVG, PNG, PDF, BPMN XML, and editable PPTX; stable page/pagination presets; and a clean read-only HTML presentation view. This is more valuable than adding another diagram family.

### 8. Family breadth is ahead of family parity — P2

The five-family portfolio is a differentiator, but AI capabilities are BPMN-focused, architecture and Gantt reject explicit direction, structured exports are uneven, and the visual editor is BPMN-only. The repository already recognizes this as a family parity contract problem.

**Build:** a public capability matrix generated from runtime metadata, with per-family guarantees for validate/render/export/PPTX/AI/import/persistence. Either complete parity for the promised families or narrow the public promise until the matrix is consistently true.

## Prioritized roadmap

| Priority | Initiative | User problem solved | Why now | Defer until |
|---|---|---|---|---|
| P0 | Round-trip and semantic-loss contract | “Will my visual edit or external BPMN survive?” | This is the product’s unique wedge and current trust gap | — |
| P0 | BPMN interoperability core | “Can I model real timer/message/approval/retry processes?” | Current event/loop gaps make many diagrams decorative | Round-trip inventory is stable |
| P1 | Git-native review/CI package | “Can my team and agent review diagram changes like code?” | Uses existing local-first architecture; competes with hosted collaboration on its own terms | Hosted collaboration demand |
| P2 | CLI capability/distribution follow-through | “Can every command and format be discovered and installed cleanly?” | The core contract is already shipped; these are scale improvements | — |
| P1 | Project manifest and linked resources | “Can a process include forms, decisions, and reusable templates?” | Needed only if moving toward executable process tooling | A clear execution strategy |
| P2 | Publish/presentation bundle | “Can I share a clean, printable artifact?” | Closes a practical adoption gap against draw.io/PlantUML | Core round-trip and CI |
| P2 | Family parity or scope reduction | “Does supported mean the same thing everywhere?” | Prevents portfolio sprawl and misleading promises | Current capability matrix |
| P3 | Hosted collaboration | “Can multiple stakeholders edit/comment together?” | Competitively important, but changes architecture and operating model | Evidence of team demand |
| P3 | Execution/deployment platform | “Can this model run and be monitored?” | Camunda already owns this category well | Product strategy explicitly chooses that market |

## What not to prioritize next

- Another diagram family before the existing family capability contract is complete.
- More AI generation surface area before AI can preserve/import the BPMN semantics listed above.
- Full real-time collaboration while the source/canvas round-trip remains lossy.
- Camunda-specific execution extensions before a vendor-neutral semantic core and a chosen execution target exist.
- Large routing polish work as the main growth bet; the worker and complexity admission already contain the safety risk, while the adoption gap is semantic/interchange trust.

## Evidence limits and open questions

This assessment is capability-based. The workspace contains engineering tests, documentation, examples, and implementation evidence, but no customer interviews, product analytics, support tickets, win/loss data, or competitor usage data. The priority order should therefore be validated with:

- five to ten target-user interviews split between developers/agents and process analysts;
- a corpus of external BPMN files from Camunda, Signavio, draw.io, and other common exporters;
- a task study comparing source-first, visual-first, and round-trip workflows;
- demand testing for Git-native review versus hosted collaboration;
- success metrics: time to first valid diagram, successful external import rate, semantic-loss rate, re-export validity, CI adoption, and review turnaround.

## Source inventory

Internal sources: [`README.md`](../README.md), [`docs/STATUS.md`](STATUS.md), [`docs/BPMN-GAP-SURVEY.md`](BPMN-GAP-SURVEY.md), [`docs/maintainer/ROADMAP.md`](maintainer/ROADMAP.md), [`docs/maintainer/ENGINEERING-REVIEW.md`](maintainer/ENGINEERING-REVIEW.md), [`docs/maintainer/KNOWN-ISSUES-2026-08-19.md`](maintainer/KNOWN-ISSUES-2026-08-19.md), `packages/ast`, `packages/parser`, `packages/import-xml`, `packages/export-xml`, `packages/print-dsl`, `packages/validate`, and `apps/web`.

Fresh verification on 2026-08-22: `npm run build` passed; `npm test` passed with 929 tests; `npm run check:style` passed; `git diff --check` passed; the focused import-loss browser regression passed, and the full browser suite had 91/92 passing with the single project-dialog timeout passing on isolated rerun.
