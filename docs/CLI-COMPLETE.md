# BPM CLI — Complete Reference

This is the comprehensive command reference for `@bpm/cli` (current contract updated
2026-08-22). It is a companion to
[`docs/CLI.md`](./CLI.md); it does not replace or modify that document.

The CLI is implemented in `packages/cli` and exposes the `bpm` executable. From the
repository root, the supported commands are:

```text
bpm validate
bpm render
bpm export
bpm review
bpm fix
bpm generate
bpm import
bpm import-diagram
bpm freeze
bpm capabilities
```

The default input language is the BPMN-oriented `.bpm` DSL. A source file can select one
of the other built-in families with a first-line `diagram:` directive. See
[`docs/LANGUAGE.md`](./LANGUAGE.md) for the complete source grammar.

## 1. Installation and invocation

Install workspace dependencies once:

```bash
npm install
```

The simplest repository-local invocation is:

```bash
npm run bpm -- <command> <file-or-description> [options]
```

The `--` is npm's separator: arguments after it are passed to `bpm`.

`npm run bpm` rebuilds the complete CLI dependency closure before running it. The
standalone build command is useful when you want to build without executing a command:

```bash
npm run build:cli
npm run bpm -- --help
```

After the workspace has been built, the CLI can also be run directly:

```bash
node packages/cli/dist/bin.js --help
node packages/cli/dist/bin.js validate diagram.bpm
```

The package binary name is `bpm` when `@bpm/cli` is installed or linked:

```bash
bpm validate diagram.bpm
```

## 2. Command overview

| Command | Positional input | Primary purpose | Default output |
|---|---|---|---|
| `validate` / `check` | `.bpm` file or `-` | Parse, lay out, inspect geometry, and report diagnostics | Human summary, or JSON with `--json` |
| `check --changed` | Git working tree | Validate changed tracked/untracked `.bpm` files | Text, aggregate JSON, or SARIF |
| `render` | `.bpm` file | Produce SVG or PNG | SVG on stdout, or a file with `-o` |
| `export` | `.bpm` file | Produce a structured family export, BPMN XML, PPTX, or DOCX | Text on stdout, or a file |
| `review` | `.bpm` file or `-` | Read-only validation and geometry/model visual findings; invalid repair remains in memory | Human summary, or JSON with `--json` |
| `fix` | `.bpm` file or `-` | Write an explicit repaired copy; source is never overwritten | Human completion, or JSON with `--json` |
| `generate` | Description words | Draft a valid `.bpm` diagram with a provider | `.bpm` text on stdout, output path, or JSON |
| `import` / `import-diagram` | BPMN XML file or `-` | Convert BPMN 2.0 XML to `.bpm` text | `.bpm` text on stdout, output path, or JSON |
| `freeze` | BPMN `.bpm` file or `-` | Convert auto-layout BPMN into manual-positioned DSL | `.bpm` text on stdout, output path, or JSON |
| `capabilities` | none | Discover runtime families, AI operations, and export formats | Human table or JSON |

All commands return process exit code `0` on success and `1` on command, input, validation,
export, or provider failure. There is currently no separate quality-gate exit code.

## 3. Help, positional arguments, and parsing

```bash
npm run bpm -- --help
npm run bpm -- -h
npm run bpm -- help
```

Help prints the command synopsis and exits `0`. No command prints usage and exits `1`.
Unknown commands and unknown options also exit `1`.

General syntax:

```text
bpm <command> <file-or-description> [options]
```

Every file command accepts one positional input. `generate` treats all positional words as
the description rather than a path, so the complete description may be one quoted shell
argument or several words:

```bash
npm run bpm -- generate "A customer submits an order and the warehouse ships it"
```

Without quotes, words after the first are joined with spaces.

Option values must be separate arguments. For example, use `-o output.svg`, not a line
break between `-o` and the path. Paths containing spaces should be shell-quoted.

## 4. Shared options

The typed command registry recognizes the following options and rejects options that do
not belong to the selected command. Family and export choices come from runtime
capabilities rather than a duplicated CLI list.

Runtime discovery is available directly:

```bash
npm run --silent bpm -- capabilities
npm run --silent bpm -- capabilities --json
npm run --silent bpm -- check --changed --format sarif > diagram-check.sarif
```

| Option | Default | Effective commands | Description |
|---|---|---|---|
| `-h`, `--help` | off | all | Print help and exit; `bpm <command> --help` is command-specific. |
| `--json` | off | all | Emit the stable machine-readable result on stdout. Artifact stdout is replaced by JSON. |
| `-o <path>`, `--output <path>`, `--out <path>` | none | artifact commands | Write the generated artifact or converted text atomically to this path. |
| `--layout <name>`, `--engine <name>` | automatic | `validate`, `render`, `export`, `review`, `fix`, `generate`, `freeze` | Override the BPMN layout engine. Built-in names are `swimlane` and `flat`; manual-positioned BPMN ignores the engine override. |
| `--format <format>`, `--target <format>` | `bpmn-xml` | `export` | Select a structured export target. `--target` remains compatible. |
| `--format <svg|png>` | inferred | `render` | Select the image format. Explicit `--format` wins over filename inference. |
| `--provider <manual|ollama|openai>` | `manual` | `review`, `generate` | Select the review/generation provider. Providers are loaded lazily for `ollama` and `openai`. |
| `--family <family>` | `bpmn` | `generate` | Select the generated family: `bpmn`, `mindmap`, `flowchart`, `architecture`, or `gantt`. Existing input files select their family from source, not this option. |
| `--positioning <auto|manual>`, `--manual` | `auto` | `generate` | Keep generated BPMN auto-laid out or serialize its resolved geometry as manual DSL. Manual positioning is currently BPMN-only. |
| `--visual-review` | off | `generate` | After generation, render the diagram and run the provider's visual-review/patch loop. |
| `--max-visual-attempts <n>` | `2` | `generate` | Positive integer limit for visual-review patch passes. |
| `--image-out <path>` | none | `review` | Write the reviewed or repaired diagram's rendered PNG. The source file is never overwritten. |
| `--max-attempts <n>` | `3` | `review`, `generate` | Positive integer limit for text-repair passes. |

Examples:

```bash
npm run bpm -- validate diagram.bpm --json
npm run bpm -- render diagram.bpm --format png -o diagram.png
npm run bpm -- export diagram.bpm --target pptx -o diagram.pptx
npm run bpm -- review diagram.bpm --provider manual --image-out review.png
npm run bpm -- generate "Approve and ship an order" --provider manual -o generated.bpm
```

The parser rejects missing option values, invalid enumerated values, non-positive attempt
counts, and extra positional arguments for file commands. `--` ends option parsing.

## 5. `validate` — check a diagram

```text
bpm validate <file.bpm> [--engine <name>] [--json]
```

`validate` runs the family parser, semantic checks, layout, page/pagination checks, and
post-layout geometry inspection. It does not write an artifact.

Examples:

```bash
npm run bpm -- validate packages/cli/test/fixtures/clean.bpm
npm run bpm -- validate process.bpm --engine flat
npm run bpm -- validate gantt.bpm --json > validation.json
```

By default the command prints a concise human summary. Add `--json` to emit the complete
machine-readable result on stdout. A successful result has `valid: true` and exit code
`0`; an invalid result has `valid: false` and exit code `1`.

The normal result includes:

```json
{
  "valid": true,
  "errors": [],
  "semanticErrors": [],
  "warnings": [],
  "metrics": {},
  "inspection": {},
  "effectiveFamily": "bpmn",
  "direction": "right",
  "laneDirection": "horizontal",
  "capabilities": {},
  "pageDimensions": null,
  "fitMode": null,
  "paginationMode": "none",
  "pageCount": 1,
  "pagination": { "mode": "none", "pageCount": 1 },
  "status": "completed"
}
```

Fields can be omitted or expanded by the selected family. `inspection.nodes` and
`inspection.edges` expose resolved geometry; `metrics` includes values such as
`edgeCrossings`, `nodeOverlaps`, `edgeThroughNode`, `edgeOvershootsOwnEndpoint`, and
`routeFallbacks`. Blocking results include `status: "blocked"` and a corrective-action
message.

## 6. `render` — create SVG or PNG

```text
bpm render <file.bpm> [-o <path>] [--format svg|png] [--engine <name>] [--json]
```

Supported formats are SVG and PNG for all built-in families.

### SVG behavior

```bash
# SVG to stdout
npm run bpm -- render diagram.bpm

# SVG to a file
npm run bpm -- render diagram.bpm -o diagram.svg

# Explicit format overrides the extension
npm run bpm -- render diagram.bpm --format svg -o diagram.png
```

Without `-o`, SVG is written to stdout and no file is created. With `-o`, stdout is empty
and the SVG is written to the specified path.

### PNG behavior

```bash
npm run bpm -- render diagram.bpm --format png -o diagram.png
```

PNG requires `-o`; it cannot be streamed to stdout. If `--format` is omitted, an output
path ending in `.png` selects PNG. All other output paths default to SVG.

### JSON behavior

With `--json`, successful file output reports a machine-readable artifact contract instead
of the SVG/binary content:

```json
{
  "valid": true,
  "status": "completed",
  "output": { "generated": true, "path": "diagram.svg", "format": "svg" },
  "warnings": [],
  "errors": []
}
```

The payload also includes family, page, pagination, and dimension metadata. For SVG
stdout mode, it reports `output.generated: false`, `format: "svg"`, and `inline: true`.
On a rendering failure, human diagnostics are written to stderr; with `--json`, JSON
diagnostics are written to stdout and the exit code is `1`.

## 7. `export` — structured and editable exports

```text
bpm export <file.bpm> [-o <path>] [--target <format>] [--engine <name>] [--json]
```

If `--target` is omitted, the target is `bpmn-xml`. Text-based exports can be written to
stdout when `-o` is omitted. Binary targets require `-o`.

### Structured target matrix

| Family | `--target` value | Output | Typical extension | Fidelity / notes |
|---|---|---|---|---|
| BPMN | `bpmn-xml` | BPMN 2.0 XML | `.bpmn` or `.xml` | Semantic BPMN export; default target. |
| BPMN | `pptx` | Editable PowerPoint projection | `.pptx` | Native editable shapes; not a BPMN round trip. |
| BPMN | `docx` | Word document with vector-backed SVG page images | `.docx` | Requires BPMN `paginate: semantic`; not native Word shapes. |
| Mindmap | `mindmap-drawio-xml` | diagrams.net/draw.io XML | `.drawio` | Editable in draw.io; lossy and no import round trip. |
| Mindmap | `pptx` | Editable PowerPoint projection | `.pptx` | Visual projection. |
| Flowchart | `flowchart-drawio-xml` | diagrams.net/draw.io XML | `.drawio` | Editable in draw.io; lossy and no import round trip. |
| Flowchart | `pptx` | Editable PowerPoint projection | `.pptx` | Visual projection. |
| Architecture | `architecture-drawio-xml` | diagrams.net/draw.io XML | `.drawio` | Editable in draw.io; lossy and no import round trip. |
| Architecture | `architecture-c4-json` | C4 model JSON | `.json` | Lossy structured projection. |
| Architecture | `pptx` | Editable PowerPoint projection | `.pptx` | Visual projection. |
| Gantt | `gantt-json` | Schedule JSON | `.json` | Lossless schedule data; contains groups, tasks, dependencies, and dates. |
| Gantt | `gantt-csv` | Schedule CSV | `.csv` | Tabular schedule export; lossy relative to the DSL. |
| Gantt | `pptx` | Editable PowerPoint projection | `.pptx` | Visual projection; slide limits still apply. |

The target must be supported by the source family's capability list. An unsupported target
fails before an artifact is written.

Examples:

```bash
# BPMN XML on stdout
npm run bpm -- export process.bpm

# BPMN XML file
npm run bpm -- export process.bpm --target bpmn-xml -o process.bpmn

# Draw.io
npm run bpm -- export flowchart.bpm --target flowchart-drawio-xml -o flowchart.drawio

# Architecture formats
npm run bpm -- export architecture.bpm --target architecture-drawio-xml -o architecture.drawio
npm run bpm -- export architecture.bpm --target architecture-c4-json -o architecture.json

# Gantt data
npm run bpm -- export plan.bpm --target gantt-json -o plan.json
npm run bpm -- export plan.bpm --target gantt-csv -o plan.csv

# Binary exports must have -o
npm run bpm -- export process.bpm --target pptx -o process.pptx
npm run bpm -- export process.bpm --target docx -o process.docx
```

### PPTX and DOCX constraints

PPTX is available for all five built-in families, but invalid geometry, unsupported
directions, resource limits, invalid pagination continuation structure, and Gantt slide
limits block the export. Readability warnings about projected editable text are non-blocking:
the file is still written and the command exits `0`.

DOCX is BPMN-only and requires semantic pagination:

```text
page: 13.333in x 7.5in
paginate: semantic
```

If semantic pages have different intrinsic dimensions, declare a common `page:` size.
DOCX contains one vector SVG image per semantic page; it is not a native Word-shape or
semantic round-trip format.

### JSON behavior

`--json` makes successful exports report metadata and the output contract instead of
writing text to stdout:

```json
{
  "valid": true,
  "status": "completed",
  "output": { "generated": true, "path": "process.pptx", "format": "pptx" },
  "warnings": [],
  "errors": []
}
```

For a failed export, human diagnostics are written to stderr; with `--json`, JSON
diagnostics are written to stdout. Blocking exporter codes such
as `LIMIT`, `INVALID`, and `UNSUPPORTED` are preserved when provided by the exporter.
Warning-only exports succeed and write the artifact.

## 8. `review` — validate, inspect, and optionally repair

```text
bpm review <file.bpm> [--provider manual|ollama|openai]
                 [--image-out <path>] [--max-attempts <n>] [--engine <name>]
                 [--json]
```

`review` is currently supported for BPMN visual review. It combines:

1. validation and geometry findings;
2. optional provider-based visual findings when the diagram validates; and
3. a bounded text-repair loop when the input is invalid.

The source file is never overwritten. If repair succeeds, the repaired text is returned in
the JSON response and must be applied by the caller if desired.

Examples:

```bash
# Deterministic geometry-only review
npm run bpm -- review process.bpm --provider manual

# Review and save the rendered PNG
npm run bpm -- review process.bpm --provider manual --image-out review.png

# Allow up to five repair passes
npm run bpm -- review process.bpm --provider openai --max-attempts 5
```

The default output is a human summary. With `--json`, the machine-readable shape is:

```json
{
  "validation": {},
  "visualFindings": [],
  "providerId": "manual"
}
```

When the initial source is invalid, the response also includes:

```json
{
  "repair": {
    "status": "valid",
    "attempts": 1,
    "repairedText": "..."
  }
}
```

Exit code is `0` when validation succeeds and no visual finding has severity `error`.
It is `1` when the file remains invalid, a visual error is reported, the family does not
support visual review, or `--image-out` cannot be produced.

## 8a. `fix` — write an explicit repaired copy

```text
bpm fix <file.bpm> -o <fixed.bpm> [--provider manual|ollama|openai]
                     [--max-attempts <n>] [--engine <name>] [--json]
```

`fix` uses the same bounded repair/review services as `review`, but requires an output
path and writes only after the repaired source validates. It never replaces the input.
Without `--json` it prints a human completion summary; with `--json` it reports the
provider, findings, attempts, validation, and output path.

## 9. `generate` — draft a diagram from a description

```text
bpm generate <description words...>
                 [--family bpmn|mindmap|flowchart|architecture|gantt]
                 [--provider manual|ollama|openai]
                 [--positioning auto|manual]
                 [--visual-review]
                 [--max-visual-attempts <n>]
                 [--max-attempts <n>]
                 [--engine <name>]
                 [-o <out.bpm>] [--json]
```

Generation currently has a full generation prompt only for the BPMN family. The other
families are recognized by the parser but return a structured `unsupported` result for
generation.

`manual` is deterministic, offline, and CI-safe: it creates a start event, one task based
on the description, an end event, and the connecting flows. `ollama` and `openai` call
their configured provider, then the result is validated and can enter the bounded repair
loop.

### Positioning

`--positioning auto` is the default. With `--positioning manual`, a valid BPMN result is
serialized with resolved node positions and representable edge interior points. The
geometry is then checked again. This option is BPMN-only.

### Visual review

`--visual-review` runs a bounded render/review/patch loop after generation. It is off by
default. `--max-visual-attempts` defaults to `2`; `--max-attempts` controls text repair and
defaults to `3`.

### Output and success rules

The command prints JSON with this shape:

```json
{
  "description": "Approve and ship an order",
  "providerId": "manual",
  "positioning": "auto",
  "visualReview": false,
  "generation": {
    "status": "valid",
    "attempts": 0,
    "text": "..."
  },
  "validation": {}
}
```

`-o` is written only when `generation.status` is `valid`. Empty descriptions, unsupported
families, provider failures, and `budget_exhausted` results exit `1` and do not write the
requested output.

Provider setup:

| Provider | Behavior | Configuration |
|---|---|---|
| `manual` | Offline deterministic generation; no model visual findings | None |
| `ollama` | Local visual review/generation provider | `BPM_OLLAMA_URL` (default `http://localhost:11434`), `BPM_OLLAMA_MODEL` (default `llava`) |
| `openai` | OpenAI-compatible review/generation provider | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `BPM_OPENAI_MODEL` (default `gpt-4o`) |

## 10. `import` / `import-diagram` — BPMN XML to `.bpm`

```text
bpm import <file.bpmn|-> [-o <out.bpm>] [--json]
```

The command accepts BPMN 2.0 XML, including XML exported by the web Diagram mode, and
converts it to BPMN `.bpm` text with manual positioning. It validates the converted text
before treating the import as successful.

Examples:

```bash
npm run bpm -- import diagram.bpmn
npm run bpm -- import diagram.bpmn -o diagram.bpm
```

The JSON response is:

```json
{
  "file": "diagram.bpmn",
  "warnings": [],
  "conversion": {
    "status": "valid",
    "text": "..."
  },
  "validation": {}
}
```

The output file is written only when the conversion is non-empty and validates. Unparseable
XML, an empty conversion, or invalid converted DSL exits `1` without writing `-o`.

## 11. `freeze` — auto-layout BPMN to manual DSL

```text
bpm freeze <file.bpm|-> [-o <manual.bpm>] [--layout <name>] [--json]
```

`freeze` is BPMN-only. It validates the input, runs layout, and prints a new manual-mode
source containing resolved coordinates and representable edge interior points. Pool/lane
and subprocess coordinates are rebased into their appropriate frames where needed.

Examples:

```bash
# Print the frozen source; add --json for the conversion object
npm run bpm -- freeze process.bpm

# Write the frozen source
npm run bpm -- freeze process.bpm --engine swimlane -o process-manual.bpm

# Verify the frozen file
npm run bpm -- validate process-manual.bpm
```

The response has this shape:

```json
{
  "file": "process.bpm",
  "conversion": {
    "status": "valid",
    "text": "positioning: manual\n..."
  },
  "validation": {}
}
```

Invalid BPMN input, a non-BPMN family directive, layout failure, or a frozen result that
does not validate exits `1`. The requested output is written only after validation succeeds.

## 12. Diagram families and source directives

### Family support

| Family | Selector | Validate | Render | Structured exports | AI review/generation | `--engine` |
|---|---|---:|---:|---|---|---:|
| BPMN | omitted or `diagram: bpmn` | yes | SVG/PNG | `bpmn-xml`, `pptx`, `docx` | review and generation | yes |
| Mindmap | `diagram: mindmap` | yes | SVG/PNG | `mindmap-drawio-xml`, `pptx` | unsupported | no |
| Flowchart | `diagram: flowchart` | yes | SVG/PNG | `flowchart-drawio-xml`, `pptx` | unsupported | no |
| Architecture | `diagram: architecture` | yes | SVG/PNG | `architecture-drawio-xml`, `architecture-c4-json`, `pptx` | unsupported | no |
| Gantt | `diagram: gantt` | yes | SVG/PNG | `gantt-json`, `gantt-csv`, `pptx` | unsupported | no |

For existing files, the first non-blank `diagram:` directive determines the family. Do not
use `--family` to validate or render a file; that option is only used by `generate`.

### Shared source-level directives

These are part of the input DSL, not CLI flags:

| Directive | Values | Effect |
|---|---|---|
| `diagram:` | `bpmn`, `mindmap`, `flowchart`, `architecture`, `gantt` | Select the family. |
| `layout:` | `swimlane`, `flat`, or a registered engine name | Select a BPMN auto-layout engine. `--engine` overrides it for commands that support engine overrides. |
| `positioning:` | `manual` | Use hand-authored positions; BPMN `freeze` and `generate --positioning manual` produce this form. |
| `layoutSpacing:` | `compact`, `normal`, `relaxed`, `spacious` | Change automatic layout spacing. |
| `routing:` | `quality`, `hybrid`, `fast`, `corridor` | Select the automatic routing profile. |
| `page:` | positive `<width> x <height>` with `in`, `mm`, or `px` | Declare output page dimensions. Omitted units default to inches. |
| `fit:` | `contain`, `strict` | Fit to the declared page; `strict` blocks unreadable scale. Requires `page:`. |
| `paginate:` | `none`, `semantic`, `tile`, `hybrid` | `none` is the default. Only BPMN semantic pagination is implemented. `tile` and `hybrid` are rejected. |
| `pageBreak:` | `pool`, `lane`, `group`, `branch` | Semantic BPMN page grouping. `pool`/`lane` are supported; `group`/`branch` are rejected. Requires `paginate: semantic`. |
| `direction:` | `right`, `left`, `down`, `up` | Family direction where supported. BPMN defaults right; flowchart defaults down. |
| `laneDirection:` | `horizontal`, `vertical` | BPMN lane orientation. Defaults to horizontal. |
| `timescale:` | Gantt scale values | Gantt visual axis cadence; does not change schedule dates or JSON/CSV data. |
| `calendar:` | Gantt calendar/cadence values | Gantt scheduling calendar or timescale shorthand. |
| `render:` | `auto`, `manual` | Controls web-editor live preview only; it does not change CLI rendering or export. |

For semantic BPMN pagination, pools become pages by default. Use `pageBreak: lane` when
lanes should drive page grouping. Cross-page flows receive continuation markers and remain
part of the page scene. `fit: contain` permits a readability warning; `fit: strict` turns
an unreadable supported page into a blocking diagnostic.

For Gantt, accepted visual scale aliases include daily/day, weekly/week, fortnightly/
fortnight/biweekly, monthly/month, quarterly/quarter, halfyear/half-year/half a year/
semiannual, and `auto`. The scheduling calendar remains weekday-based unless the language
document specifies otherwise.

## 13. Output streams, diagnostics, and artifact safety

The CLI keeps machine-readable results and human messages separated where the command
supports both:

- successful text streaming: artifact on stdout;
- successful JSON mode: result object on stdout;
- warnings: stderr;
- command failures: diagnostics on stderr, or JSON diagnostics on stdout when JSON mode is
  active;
- binary artifacts: always written with `-o`.

`render` and non-binary `export` do not write a default file when `-o` is omitted. Generated,
imported, and frozen source files also write only when their result has passed its success
gate. Binary export writes use a temporary file and rename, so exporter failures do not
publish a partial replacement.

Typical failure messages include:

```text
missing <file> for bpm validate
missing "<description>" for bpm generate
unknown command "..."
unknown option "..."
--format png requires -o <path>
PPTX export requires -o <path> because it is binary
Unknown layout engine "..."
```

## 14. Recommended automation workflows

### Validate then render

```bash
set -e
npm run bpm -- validate process.bpm --json > process.validation.json
npm run bpm -- render process.bpm --format svg -o process.svg
```

### Validate then export

```bash
set -e
npm run bpm -- validate process.bpm --json > process.validation.json
npm run bpm -- export process.bpm --target bpmn-xml -o process.bpmn
npm run bpm -- export process.bpm --target pptx -o process.pptx
```

### Generate, validate, and retain the source

```bash
set -e
npm run bpm -- generate "A customer submits an order and it is shipped" \
  --provider manual -o generated.bpm > generation.json
npm run bpm -- validate generated.bpm --json > generated.validation.json
```

### Import and verify

```bash
set -e
npm run bpm -- import-diagram external.bpmn -o imported.bpm > import.json
npm run bpm -- validate imported.bpm --json > imported.validation.json
```

### Agent repair loop

1. Run `validate` and inspect `errors`, `semanticErrors`, and `warnings`.
2. Fix the source, or run `review` with a provider and inspect `repair.repairedText`.
3. Apply repaired text explicitly if it is acceptable; `review` never overwrites the input.
4. Validate again.
5. Use `inspection` and geometry metrics before treating a diagram as ready for export.

## 15. Developer verification

Run the CLI package tests:

```bash
npx vitest run packages/cli
```

The suite covers argument parsing, validation, rendering, structured exports, review,
generation, BPMN import, freezing, and multi-page artifact contracts. The implementation
entry points are:

```text
packages/cli/src/args.ts
packages/cli/src/bin.ts
packages/cli/src/commandRegistry.ts
packages/cli/src/sarif.ts
packages/cli/src/commands/check.ts
packages/cli/src/commands/capabilities.ts
packages/cli/src/commands/validate.ts
packages/cli/src/commands/render.ts
packages/cli/src/commands/export.ts
packages/cli/src/commands/review.ts
packages/cli/src/commands/generate.ts
packages/cli/src/commands/importDiagram.ts
packages/cli/src/commands/freeze.ts
```

Related references:

- [`docs/CLI.md`](./CLI.md) — existing CLI-specific verification guide
- [`docs/LANGUAGE.md`](./LANGUAGE.md) — `.bpm` language grammar and directives
- [`docs/AI_REVIEW.md`](./AI_REVIEW.md) — provider and review workflow details
- [`packages/cli/test`](../packages/cli/test) — executable CLI contract tests
