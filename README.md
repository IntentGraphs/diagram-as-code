# bpm

A text-first diagramming tool for five supported families — BPMN, mind maps, flowcharts, architecture, and bounded Gantt timelines. Write a diagram as plain text, select its family with the optional `diagram:` directive, and render it live in the browser or via the CLI. BPMN adds BPMN 2.0 semantics and canonical XML export; Gantt adds deterministic date-based planning; all families support SVG and editable PowerPoint projection.

**Version and capability detail:** [`docs/STATUS.md`](docs/STATUS.md) is the source of truth. License: [MIT](LICENSE).

> **Public-v1 promise:** describe a BPMN process, project timeline, or technical diagram as text; validate and render it locally or in the browser; export a canonical BPMN model or an editable presentation; and keep the source reviewable in Git. `bpm` is aimed at teams that want diagram-as-code workflows without giving up BPMN semantics or a visual editor.

**Try it:** the browser playground will be available at [intentgraphs.github.io/diagram-as-code](https://intentgraphs.github.io/diagram-as-code/) after the IntentGraphs repository and GitHub Pages deployment are enabled. For a local five-minute path, follow the [quick start](#quick-start) below. The current public snapshot is version 1.0.2; see [`docs/STATUS.md`](docs/STATUS.md) for verified capabilities and limitations.

_A refreshed Diagram Editor screenshot will be added in a follow-up once the final public
editor view is selected._

## Who this is for

- **Diagram-as-code developers** who want versionable text, deterministic rendering, BPMN 2.0 XML, editable PowerPoint, and more than one diagram family in the same repository.
- **AI and LLM tooling builders** who need a machine-readable `validate` contract, bounded `generate`/`review` workflows, and structured diagnostics suitable for agents and CI.
- **Process and business analysts** who want a lighter, local-first BPMN authoring path with an embedded visual Diagram Editor and standard XML export.

The shortest useful task is: copy [`examples/getting-started/hello.bpm`](examples/getting-started/hello.bpm), run `bpm validate`, and render it to SVG. The browser playground removes the local setup step once Pages is enabled; the CLI remains the reproducible path for repositories and automation.

The example below is the existing BPMN quick start; use `diagram: mindmap`, `diagram: flowchart`, or `diagram: architecture` as the first line when selecting another family.

```
task "Review order" as t1
gateway exclusive "Approved?" as g1
task "Ship item" as t2
event end none "Done" as e1

t1 -> g1
g1 -> t2: "yes"
t2 -> e1
```

Same sample on disk: [`examples/getting-started/hello.bpm`](examples/getting-started/hello.bpm).

## Is / is not

**Is**

- Text-first authoring for BPMN, mind maps, flowcharts, architecture, and Gantt; the optional `diagram: <family>` directive selects the grammar and renderer (omitted for backwards-compatible BPMN)
- Shared direction directives use `direction: right|left|down|up` (BPMN defaults right, flowcharts down, mind maps right); BPMN pools also accept `laneDirection: horizontal|vertical` (default horizontal)
- Family-specific auto-layout and SVG rendering; BPMN exports standard BPMN 2.0 XML, while non-BPMN structured exports document their lossiness and Gantt exports JSON/CSV
- Editable PowerPoint export with native shapes, text, bars, milestones, and connectors; wide Gantt timelines paginate into readable editable slides; PPTX is a visual projection, not a semantic round-trip format
- BPMN semantic pagination with one editable PPTX slide per page and CLI-only multi-page DOCX using embedded vector SVG pages; DOCX is not native Word-shape editing, and PDF/tile/hybrid/group/branch pagination are explicitly unsupported
- Agent-oriented CLI with human summaries by default and stable `--json` output: `check`/`validate`, `render`, `export`, read-only `review`, explicit `fix`, `generate`, `import`/`import-diagram`, and `freeze`; includes `bpm export --format pptx -o diagram.pptx`
- Optional AI: review + repair an existing BPMN diagram, or draft one from a plain-language description (`docs/AI_REVIEW.md`); non-BPMN families fail closed until family-specific AI contracts are implemented
- One-shot, reviewable **Import to Text**: convert Diagram-mode edits into `.bpm` text on demand, with an explicit preview/confirm step

**Is not**

- A Camunda (or other) process execution engine
- A complete BPMN semantics or execution engine; the parser and validator do enforce the documented subset of BPMN structural legality rules and return `semanticErrors`
- A replacement for every diagram type — the supported families are deliberately scoped to BPMN, mindmap, flowchart, architecture, and bounded Gantt
- A **continuously, automatically** synced text ↔ Diagram-mode editor — Text and Diagram mode remain two independent authoring paths; **Import to Text** (above) bridges them one-shot, on explicit request, not live

## Choose the right tool

This is a positioning guide, not a claim that other tools are static or incomplete. Choose based on the artifact and workflow you need:

| Tool | Strong fit | Choose `bpm` when you need |
|---|---|---|
| **bpm** | BPMN diagram as code, multi-family text diagrams, CLI/agent workflows | Versionable source, structured validation, BPMN XML, editable PPTX, Gantt, and a local web editor in one workspace |
| [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) / Diagram Editor | Interactive BPMN canvas and direct visual editing | Versionable text source, CLI validation, deterministic layout, or an explicit visual-to-text conversion path |
| [PlantUML](https://plantuml.com/) | Text-first UML and software architecture diagrams | BPMN-first process notation, project timelines, or the five-family pipeline in this repository |
| [Camunda Modeler](https://camunda.com/download/modeler/) | Visual BPMN/DMN modeling for executable process work | Git-friendly text authoring, deterministic CLI checks, or presentation-oriented editable exports |
| [draw.io](https://www.drawio.com/) | Freeform visual diagramming and broad shape libraries | A constrained text grammar, reproducible layouts, and source-based review/automation |

## Public-v1 expectations

- **Local-first:** there is no hosted backend, account system, team collaboration, or process execution engine in this release. Text projects persist in browser IndexedDB; **Save Project** downloads a portable `.bpm-project.json` bundle containing the text diagrams, BPMN XML snapshots when available, and render snapshots, and **Open Source** can restore that bundle or load a `.bpm`/BPMN XML file.
- **BPMN fidelity:** BPMN XML is the canonical semantic export. The DSL covers the supported notation and reports structural diagnostics, but it is not a full BPMN execution engine or complete semantic legality checker.
- **PPTX/DOCX fidelity:** PowerPoint is an editable visual projection of shapes, text, bars, milestones, and connectors. Gantt uses a declared page width as the date-range budget and paginates only when the range cannot remain readable; `calendar:`/`timescale:` can select fortnightly, monthly, quarterly, or half-year periods. PPTX export writes valid native geometry even when projected editable text may be small, and surfaces an `editable_text_density` warning for review; strict-fit failures, invalid geometry, and hard export limits remain blocking. CLI-only DOCX creates one page per BPMN semantic page with an embedded vector SVG image and requires a common page size when intrinsic pages differ; it is not native Word-shape editing or semantic round-tripping. PDF/tile/hybrid/group/branch pagination are not included. PowerPoint edits do not round-trip into `.bpm`; keep the source and BPMN XML alongside the deck.
- **AI behavior:** AI is optional and BYOK/local-provider based. Review and generation are bounded, cancellable, and explicit; no provider is contacted by default and there is no default telemetry.
- **Support contract:** Node 20–22 with npm 10 is supported for development; Linux CI is authoritative and macOS is maintainer-verified. Windows, mobile browsers, and Firefox/WebKit are not v1 promises.

For the most relevant migration path from visual tools, see [`docs/COMING-FROM-DRAWIO-BPMNJS.md`](docs/COMING-FROM-DRAWIO-BPMNJS.md). For the full product truth, see [`docs/STATUS.md`](docs/STATUS.md) and [`SECURITY.md`](SECURITY.md).

## Quick start

```bash
npm install
npm run build
npm test
npm run bpm -- validate examples/getting-started/hello.bpm
npm run bpm -- render examples/getting-started/hello.bpm -o /tmp/hello.svg
npm run bpm -- validate examples/getting-started/hello.bpm --json > /tmp/hello.validation.json
```

For the CLI alone after a clean checkout, `npm install` followed by `npm run bpm -- --help`
is sufficient; `npm run build:cli` builds only the CLI dependency closure. Runtime family
and export support can be inspected with `npm run --silent bpm -- capabilities --json`.

Common CLI shortcuts are intentionally small: `bpm check` aliases `validate`, `bpm import`
aliases `import-diagram`, `-o`/`--output` write atomically, and `-` reads from stdin. Use
`bpm review` for a non-destructive report and `bpm fix input.bpm -o fixed.bpm` when an
explicit repaired copy is wanted. See [`docs/CLI.md`](docs/CLI.md) for the full stream,
exit-code, and compatibility contract.

Web editor:

npm run dev -w @bpm/web

```bash
cd apps/web && npm run dev
```

This is an npm workspaces monorepo (`packages/*`, `apps/*`). Packages are **not** published to npm yet; the project is versioned as a whole via git tags. See the [documentation map](docs/README.md) for the stable product and contributor guides.

For contributors who want a reproducible setup without installing Node directly, open the repository in the included [Dev Container](.devcontainer/devcontainer.json). The browser playground and scoped npm package publication are separate release tracks; the first public repository does not promise a zero-install CLI until packages are intentionally published.

## What this is (pipeline)

- **Pipeline**: `text → family parser/AST → family layout → family renderer (SVG)` plus family-specific structured exports: BPMN 2.0 XML, Gantt JSON/CSV, lossy draw.io/C4 formats, and editable PPTX projection.
- **Web**: text live-preview mode, plus an optional Diagram mode (`bpmn-js` Modeler) that does **not automatically** sync back to text — an explicit **Import to Text** action converts and previews Diagram-mode edits on demand.
- **Project portability**: the web editor can save the current multi-diagram text project as `.bpm-project.json` and import it into a new local project; BPMN project entries retain the reviewable source alongside the latest generated or saved visual XML snapshot.
- **Positioning**: auto-layout by default, or `positioning: manual` / per-node `at (x, y)` pins; optional page-aware output such as `page: 6in x 9in` with aspect-preserving fit. Gantt distributes its start/end date range across the declared page width and supports presentation-only `timescale: daily|weekly|fortnightly|monthly|quarterly|halfyear|auto`; `calendar: monthly` and related period aliases are also accepted.

## Where to look

| Doc | What's in it |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | What's built, verified, and limited |
| [`docs/LANGUAGE.md`](docs/LANGUAGE.md) | Full grammar for humans and agents |
| [`docs/CLI.md`](docs/CLI.md) | CLI validate / render / export / review / generate / import-diagram / freeze |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Exact verification and GitHub publication sequence |
| [`docs/COMING-FROM-DRAWIO-BPMNJS.md`](docs/COMING-FROM-DRAWIO-BPMNJS.md) | draw.io/bpmn-js-to-`bpm` migration guide |
| [`docs/README.md`](docs/README.md) | Product and contributor documentation map |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to develop and open PRs |
| [`SECURITY.md`](SECURITY.md) | Threat model and vulnerability reporting |
| [`examples/getting-started/hello.bpm`](examples/getting-started/hello.bpm) | Minimal getting-started diagram |
| [`examples/manual-mode/`](examples/manual-mode/) | Explicit-coordinate BPMN examples |

## Development

```bash
npm install
npm run build
npm test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for more.
