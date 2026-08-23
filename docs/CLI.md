# CLI — complete usage and verification reference

How to install, use, and verify `@bpm/cli` without exercising the web app.

Package: `packages/cli` (`@bpm/cli`). Entry: `npm run bpm -- …` from the repo root. The
root script builds the complete CLI dependency closure first, so a clean checkout needs
only `npm install`; use `npm run build:cli` when you want the build without running a
command.

The CLI contract is implemented in `packages/cli` and covered by `packages/cli/test`.

## Current CLI contract (2026-08-22)

The CLI keeps semantic verbs, with a small set of safe aliases:

```bash
bpm check process.bpm                         # alias for validate
bpm validate process.bpm --json                # stable machine-readable result
bpm render process.bpm --output process.svg
bpm export process.bpm --format bpmn-xml -o process.bpmn
bpm review process.bpm                        # read-only human review
bpm fix process.bpm --provider openai -o fixed.bpm
bpm generate customer submits an order -o process.bpm
bpm import process.bpmn -o process.bpm         # alias for import-diagram
bpm freeze process.bpm -o process.manual.bpm
```

Human-readable summaries are the default for validation, review, generation-to-file,
import-to-file, and freeze-to-file. Add `--json` for a stable JSON payload on stdout.
Artifact-producing commands preserve pipeline semantics: `render` and structured text
`export` write the artifact to stdout when `-o` is omitted; `generate`, `import`, and
`freeze` do the same for their converted `.bpm` text. Binary exports require an output
path. JSON diagnostics also go to stdout, while non-JSON failures go to stderr; all
commands use exit `0` for success and `1` for failure.

`-` means stdin for input. `-o`, `--output`, and the legacy `--out` are equivalent.
`--layout` is the preferred spelling of the legacy `--engine`; export accepts both
`--format` (preferred) and `--target`. `--version` prints the package version and
`bpm <command> --help` prints command-specific help. Source files are never overwritten
by `fix`; an explicit output path is required.

Runtime capabilities are discoverable instead of being inferred from documentation:

```bash
npm run --silent bpm -- capabilities
npm run --silent bpm -- capabilities --json
```

The capability payload reports registered families, AI operations, PPTX support, and
structured export descriptors. Help choices and export metadata are derived from the
same runtime registry used by validation and rendering.

---

## Why check this separately

The CLI is a thin wrapper around the parser, layout, validation, rendering, and export
packages. Verify it with the checklist below so a CLI regression is not confused with a
layout or parser regression.

| Concern | Where to test |
|---|---|
| CLI argv, exit codes, file I/O, JSON shape | This doc + `npx vitest run packages/cli` |
| Parse / layout / geometry quality | `packages/validate`, `packages/layout-*`, LANGUAGE.md |
| Live editor | `apps/web` |

---

## Prerequisites

From repo root:

```bash
npm install
npm run build:cli
```

`npm run bpm` rebuilds the same dependency closure before executing a command. Use the
full `npm run build` only when you also need the web app or unrelated workspace packages.

---

## Commands

```bash
npm run bpm -- validate <file.bpm|-> [--layout swimlane|flat] [--json]
npm run bpm -- check <file.bpm|-> [--json]
npm run bpm -- check --changed [--base origin/main] [--format text|json|sarif]
npm run bpm -- render  <file.bpm> [-o out.svg|out.png] [--engine …] [--format svg|png] [--json]
npm run bpm -- export  <file.bpm> [-o out] [--format <format>] [--target <format>] [--engine …] [--json]
npm run bpm -- review  <file.bpm> [--provider manual|ollama|openai] [--image-out review.png] [--max-attempts 3] [--json]
npm run bpm -- fix     <file.bpm> -o fixed.bpm [--provider manual|ollama|openai] [--max-attempts 3] [--json]
npm run bpm -- generate <description words…> [--provider manual|ollama|openai] [--manual] [--positioning auto|manual] [--visual-review] [-o out.bpm] [--json]
npm run bpm -- import <file.bpmn|-> [-o out.bpm] [--json]
npm run bpm -- freeze <file.bpm|-> [-o manual.bpm] [--json]
npm run bpm -- --help
npm run bpm -- --version
```

| Command | Success | Failure |
|---|---|---|
| `validate` | human summary by default; `ValidationResult` JSON with `--json`; exit `0` if valid | human diagnostics by default; same JSON with `--json`; exit `1` |
| `check --changed` | validates changed tracked/untracked `.bpm` files; supports text, aggregate JSON, and SARIF | exit `1` when any changed diagram is invalid |
| `render` | SVG on stdout when `-o` is omitted; writes a file only with `-o`. PNG requires `-o`. Exit `0` | human messages on stderr, or JSON on stdout with `--json`; exit `1` |
| `export` | writes the selected structured export to `-o`, or text output on stdout; binary PPTX/DOCX requires `-o`; exit `0` | same failure shape as render |
| `review` | human read-only review by default; JSON with `--json`; invalid files add an in-memory `repair` result and never overwrite the source | exit `1` if still invalid or a review finding is blocking |
| `fix` | explicit repaired copy; `-o` is mandatory and the source is never overwritten; JSON with `--json` | exit `1` and no output replacement when the repaired text is still invalid |
| `generate` | generated `.bpm` text on stdout without `-o`, a human completion line with `-o`, or JSON with `--json`; writes only after validation succeeds | exit `1` when generation is exhausted or description is empty |
| `import` / `import-diagram` | converted `.bpm` text on stdout without `-o`, a human completion line with `-o`, or JSON with `--json`; writes only after validation succeeds | exit `1` when XML conversion or validation fails |
| `freeze` | frozen `.bpm` text on stdout without `-o`, a human completion line with `-o`, or JSON with `--json`; writes only after validation succeeds | exit `1` when input or frozen output is invalid |

`generate` takes a plain-language description instead of a file. Quoting remains valid, but multiple positional words are joined, so shell-specific quoting is optional. It calls the same provider registry as `review`: `manual` produces a deterministic single-task skeleton (no network, CI-safe, useful for testing the plumbing); `ollama`/`openai` draft a real diagram from the description, then run it through the same text-repair loop `review` uses if the draft is invalid. See `docs/AI_REVIEW.md`.

Generation uses auto-layout by default. Pass `--positioning manual` to freeze the validated resolved geometry into manual DSL: node coordinates are rebased into the correct canvas, lane, and subprocess frames, and resolved edge interiors are emitted as `via` points where they can be represented safely. This is an opt-in serialization step after generation; the model is still not asked to invent coordinates. The equivalent standalone conversion for an existing valid file is `bpm freeze <file.bpm> [-o manual.bpm]`. Pass `--visual-review` to render the result and run the selected provider's visual-review loop with bounded patch attempts.

`import-diagram` converts a BPMN 2.0 XML file (e.g. from Diagram mode's Save/Export, or any standards-compliant BPMN tool) into `.bpm` text via `@bpm/import-xml`, always emitting `positioning: manual`. This is the CLI counterpart to the web app's **Import to Text** action — it validates the *converted text* with `@bpm/validate` as its own portable success gate, since the browser-only DOM/`bpmn-js` round-trip check is not available in Node.

`validate --json` uses the `@bpm/validate` shape: `{ valid, errors, semanticErrors, warnings, metrics?, inspection? }`. Successful layouts for all five built-in families include `inspection.nodes`, `inspection.edges`, content/render bounds, resolved route statistics, and machine-readable geometry issue details used to explain warnings. The JSON also reports `effectiveFamily`, the resolved `direction`, BPMN `laneDirection`, `capabilities`, `pageDimensions`, and `fitMode`. BPMN keeps its richer legacy inspection fields; the other families use the same common fields and metrics contract. Unsupported direction/lane combinations are blocking structured diagnostics. Do not invent a second schema.

### Changed-file checks and SARIF

`check --changed` uses `git diff` plus untracked non-ignored files and validates every
changed `.bpm` source. The default base is `HEAD`, which includes staged and unstaged
working-tree changes; `--base origin/main` compares the committed branch range. A clean
set of changed files succeeds with an empty result set.

```bash
npm run --silent bpm -- check --changed
npm run --silent bpm -- check --changed --format json > /tmp/diagram-check.json
npm run --silent bpm -- check --changed --format sarif > /tmp/diagram-check.sarif
```

SARIF uses source-relative artifact URIs, diagnostic line/column locations, stable rule
IDs, and error/warning levels. Warnings do not fail the check; syntax, semantic, layout,
or geometry errors do.

### Pagination and multi-page export

`paginate: none` is the default. `paginate: semantic` is currently implemented for BPMN: pools (or lanes with `pageBreak: lane`) become pages, cross-page flows are retained with structurally validated continuation markers, and the shared runtime reports page count and dimensions. `tile` and `hybrid` are reserved and unsupported. `fit: contain` permits readability warnings; `fit: strict` makes an unreadable ordinary, Gantt, or semantic page a blocking error for supported exporters.

`render --json` and `export --json` report `pagination: { mode, pageCount }`, resolved dimensions, `warnings`, `errors`, and `output`. Warning-only exports succeed and write output. Unsupported exporters, invalid scenes, impossible fit, strict-fit failures, invalid continuation structure, resource-limit failures, and unplaceable geometry block without writing output; exporter codes such as `LIMIT`, `INVALID`, and `UNSUPPORTED` are preserved in structured diagnostics. PPTX creates one editable native slide per semantic page. DOCX creates one Word page per semantic page with an embedded vector SVG image; it currently supports BPMN semantic pagination only, requires a common page directive when intrinsic page sizes differ, and is not a native Word-shape round trip. No PDF target is provided.

### Diagram families

Put `diagram: mindmap`, `diagram: flowchart`, `diagram: architecture`, or `diagram: gantt` on the first non-blank line to select the family; omit it for backwards-compatible BPMN. `validate` and `render` resolve and process all five families, including SVG/PNG rendering. `export` accepts `--target <format>` for a family's structured exports; for example:

```bash
bpm export --target architecture-c4-json diagram.bpm
bpm export --target gantt-json release-plan.bpm
bpm export --target gantt-csv release-plan.bpm
bpm export --target pptx -o diagram.pptx diagram.bpm
```

Architecture also supports `architecture-drawio-xml`; the web toolbar exposes the family-supported structured exports. Mindmap and flowchart draw.io XML exports likewise remain available through their family-aware web toolbar entries. `pptx` is a binary editable visual projection only for families that declare PPTX capability and requires `-o`; unsupported families fail at the CLI boundary. BPMN XML remains the semantic round-trip format.

PPTX export separates correctness from editability warnings. Invalid source, unsupported families/directions, invalid geometry, hard size limits, and Gantt slide-count limits fail without writing a deck. If the native PPTX geometry is valid but projected editable labels or a declared page may be too small, export still writes the `.pptx` and exits `0`: normal CLI output prints warnings to stderr, while `--json` prints a completed payload with `output.generated: true` and `warnings` to stdout. The web editor downloads the deck and shows the same warnings in the warning area while keeping the SVG preview available.

### Reliable shell workflow

Keep each command on one line, or use a shell continuation (`\`) at the end of the previous line. The value after `-o` must be the next argument in the same command; a newline without `\` starts a new shell command and produces errors such as `missing path after -o` or `command not found`.

For a page-sized diagram, declare the page in the `.bpm` source and use the same source for validation, SVG, and PPTX:

```bash
npm run --silent bpm -- validate my-diagram.bpm --json > /tmp/my-diagram.validation.json 2> /tmp/my-diagram.routing.log
npm run --silent bpm -- render my-diagram.bpm --format svg -o /tmp/my-diagram.svg
npm run --silent bpm -- export my-diagram.bpm --target pptx -o /tmp/my-diagram.pptx
```

For a 50-by-12-inch output page, the source begins with:

```text
page: 50in x 12in
fit: strict
```

For a six-month Gantt on a standard 16:9 page, add a visual calendar cadence while keeping the
weekday scheduling calendar and exact dates unchanged. The declared page width becomes the
horizontal budget for the complete start/end range:

```text
diagram: gantt
page: 13.333in x 7.5in
fit: strict
calendar: weekdays
timescale: monthly
```

Use `weekly`, `fortnightly`, `monthly`, `quarterly`, or `halfyear` when the detailed daily axis would force
PPTX pagination. `calendar: monthly` is shorthand for `timescale: monthly`; `calendar: quarterly`
and `calendar: half a year` are also accepted. `timescale: auto` chooses a scale from the timeline
span. These settings affect shared SVG/PPTX geometry only; Gantt JSON/CSV still describe the
original schedule dates and durations.

The JSON inspection is the machine-readable check. SVG is the visual preview, and PPTX is an editable visual projection; neither is a semantic replacement for BPMN XML.

---

## Automated check (CLI package only)

```bash
npx vitest run packages/cli
```

Expect all tests in:

- `packages/cli/test/args.test.ts`
- `packages/cli/test/validate.cli.test.ts`
- `packages/cli/test/render.cli.test.ts`
- `packages/cli/test/export.cli.test.ts`
- `packages/cli/test/review.cli.test.ts`
- `packages/cli/test/generate.cli.test.ts`
- `packages/cli/test/import-diagram.cli.test.ts`

Fixtures live under `packages/cli/test/fixtures/` (`clean.bpm`, `bad-syntax.bpm`, `overlap-manual.bpm`, `repairable.bpm`).

---

## Manual checklist

Run from repo root. Tick each item when it matches.

### Help and usage

- [x] `npm run bpm -- --help` prints usage and lists `validate` / `check` / `render` / `export` / `review` / `fix` / `generate` / `import` / `freeze`.
- [ ] `npm run bpm --` (no args) exits non-zero and mentions usage.
- [ ] `npm run bpm -- nope x.bpm` exits non-zero with unknown-command text.

### `validate`

- [ ] Clean file → exit 0 and `valid: true`, empty `errors` and `semanticErrors`, metrics present:

```bash
npm run bpm -- validate packages/cli/test/fixtures/clean.bpm
echo exit:$?
```

- [ ] Bad syntax → exit 1 and `valid: false` with parse `errors`:

```bash
npm run bpm -- validate packages/cli/test/fixtures/bad-syntax.bpm
echo exit:$?
```

- [ ] Manual overlap → exit 1; error message includes `overlap at their given positions` (and on this branch, an actionable `shift "…" …` hint):

```bash
npm run bpm -- validate packages/cli/test/fixtures/overlap-manual.bpm
echo exit:$?
```

### `check --changed` / SARIF

- [x] Runtime capability discovery is available:

```bash
npm run --silent bpm -- capabilities --json
```

- [x] Changed-file JSON and SARIF output are available:

```bash
npm run --silent bpm -- check --changed --format json
npm run --silent bpm -- check --changed --format sarif > /tmp/bpm-check.sarif
```

### `render`

- [ ] File output is SVG:

```bash
npm run bpm -- render packages/cli/test/fixtures/clean.bpm -o /tmp/bpm-cli-check.svg
head -c 80 /tmp/bpm-cli-check.svg
```

Expect starts with `<svg `.

- [ ] Stdout mode (no `-o`) prints SVG to the terminal; exit 0.
- [ ] PNG output:

```bash
npm run bpm -- render packages/cli/test/fixtures/clean.bpm --format png -o /tmp/bpm-cli-check.png
head -c 8 /tmp/bpm-cli-check.png | xxd
```

Expect the first bytes to be the PNG signature `89 50 4e 47 0d 0a 1a 0a`.

- [x] Bad syntax with `--json` → exit 1; stdout JSON has `errors` and stderr is empty.

### `export`

- [ ] File output is BPMN XML:

```bash
npm run bpm -- export packages/cli/test/fixtures/clean.bpm -o /tmp/bpm-cli-check.bpmn
head -c 200 /tmp/bpm-cli-check.bpmn
```

Expect `definitions` and a `bpmn` namespace/tag.

- [ ] Bad syntax → exit 1 (same pattern as render).

### `generate`

- [ ] Offline/deterministic draft (no network):

```bash
npm run bpm -- generate "customer submits an order and it gets shipped" --provider manual
echo exit:$?
```

Expect exit 0, `generation.status: "valid"`, `generation.text` containing a start event, one task, and an end event.

- [ ] `-o` writes only on success:

```bash
npm run bpm -- generate "do a thing" --provider manual -o /tmp/bpm-cli-generated.bpm
cat /tmp/bpm-cli-generated.bpm
```

- [ ] Empty description fails fast: `npm run bpm -- generate "   "` exits 1 with a `missing "<description>"` message.

### `freeze`

- [ ] A valid auto-layout source can be converted without changing its semantic graph:

```bash
npm run bpm -- freeze packages/cli/test/fixtures/clean.bpm -o /tmp/bpm-cli-frozen.bpm
npm run bpm -- validate /tmp/bpm-cli-frozen.bpm
```

Expect `positioning: manual` in the output and `valid: true` from the second command. The JSON emitted by `validate` includes `inspection.nodes` and `inspection.edges`, so an agent can inspect absolute box geometry and resolved route shape without parsing SVG.

### Optional engine override

- [ ] `npm run bpm -- render packages/cli/test/fixtures/clean.bpm --engine flat -o /tmp/flat.svg` exits 0.
- [ ] `--engine bogus` on render/validate fails at layout-time (exit 1; message mentions unknown engine).

---

## Agent / LLM loop (CLI-only)

Use this when generating diagrams from Cursor or another agent — no web UI required:

1. Write or overwrite a `.bpm` file using `docs/LANGUAGE.md`.
2. `npm run bpm -- validate that-file.bpm`
3. If `valid: false`, either fix using `errors[].message` / `semanticErrors[].message`, or `npm run bpm -- review that-file.bpm --provider ollama` (text-only repair; does not overwrite the file — apply `repair.repairedText` yourself). Then repeat.
4. If `valid: true` but `metrics.edgeCrossings` (or other metrics) are high, simplify topology per LANGUAGE §10, then re-validate.
5. Optionally `render` / `export` for human review or interchange.

## Vision loop (optional)

> **Note**: `bpm review` (see `docs/AI_REVIEW.md`) now wraps this loop as a single command with pluggable providers — `manual` for geometry-only CI checks, `ollama`/`openai` for model-based image review. The manual steps below remain valid for agents that prefer to supply their own vision capability without using a provider.

The text loop above catches rule-encoded defects only. Some real layout
problems — label crowding, an edge that visually reads as crossing an
unrelated node, uneven spacing, an unbalanced overall layout — aren't
encoded as `@bpm/validate` rules and won't show up as JSON errors. If your
agent can view images, close the loop visually after the text loop passes:

1. Finish the text loop above until `validate` returns `valid: true`.
2. `npm run bpm -- render that-file.bpm --format png -o /tmp/review.png`
3. View `/tmp/review.png` with your own image-reading capability (for
   example, Claude Code's `Read` tool on the PNG path).
4. Check the image against this checklist:
   - Do any labels crowd a corner or overlap another label/node, even if
     `validate` didn't flag a geometric overlap?
   - Does any edge visually read as cutting through an unrelated node, even
     if it doesn't touch that node's registered bounding box?
   - Is spacing or alignment inconsistent in a way that reads as sloppy
     (e.g. one lane cramped, another sparse)?
   - Does the overall layout look balanced, or lopsided/cluttered in one
     region?
5. If something looks wrong, revise the `.bpm` source and repeat from step 1.

This loop needs no API key and no LLM integration in this repo — the
calling agent supplies its own model and vision capability.

---

## Out of scope for this check

- In-app chat or LLM API keys (not part of the CLI).
- Web editor live preview (`apps/web`).
- `--max-crossings` / exit code `2` quality gate (deferred).
- Publishing `@bpm/cli` to the npm registry (workspace-local `npm run bpm` is enough).

---

## Related

- `packages/validate` — library behind `bpm validate`
- `docs/LANGUAGE.md` — grammar for generated text
- `docs/STATUS.md` — current capabilities and limitations
