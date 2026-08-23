# CLI Packaging — Design

## Purpose

Expose the existing Node-compatible core as a `bpm` command-line tool on branch `llm-diagram-extensions`, completing roadmap item 2 and finishing the library half of `@bpm/validate` (roadmap item 8) with a transport agents can call.

Primary consumer: an LLM / Cursor agent that writes `.bpm` text, runs `bpm validate`, and iterates. Secondary: humans rendering SVG or exporting BPMN XML without opening the web app.

## Commands

| Command | Behavior |
|---|---|
| `bpm validate <file>` | Read text → `validate(text)` → print JSON `ValidationResult` to stdout |
| `bpm render <file> [-o out.svg]` | parse → layout → render → write SVG (or stdout if `-o` omitted) |
| `bpm export <file> [-o out.bpmn]` | parse → layout → `exportToXml` → write BPMN 2.0 XML |

Shared options:

- `--engine <name>` — passed through as `LayoutOptions.engineOverride` (`swimlane` / `flat`; unknown names fail at layout-time as today).
- `--json` — for `validate`, always JSON (flag accepted as no-op / explicit). For `render`/`export` on failure, emit `{ errors }` JSON to stderr and non-zero exit instead of a prose message when `--json` is set.

Exit codes:

- `0` — success (`validate`: `valid: true`; render/export: file written / stdout written).
- `1` — parse or layout errors (`validate.valid === false`, or render/export failed before producing output).
- `2` — reserved for a future quality gate (`--max-crossings`); **out of scope for v1** — do not implement yet.

## Package layout

New workspace package `@bpm/cli`:

```
packages/cli/
  package.json          # bin: { "bpm": "./dist/bin.js" }
  tsconfig.json
  src/bin.ts            # argv router, process.exit
  src/args.ts           # minimal argv parser (no new deps)
  src/readInput.ts      # read file UTF-8; reject missing path
  src/commands/
    validate.ts
    render.ts
    export.ts
  test/
    args.test.ts
    validate.cli.test.ts
    render.cli.test.ts
    export.cli.test.ts
    fixtures/
      clean.bpm
      overlap.bpm
```

Dependencies: `@bpm/parser`, `@bpm/layout`, `@bpm/layout-core`, `@bpm/render`, `@bpm/export-xml`, `@bpm/validate`. No new runtime dependencies (no `commander` / `yargs`) — three subcommands keep hand-rolled argv smaller and consistent with the monorepo's lean package style.

Root ergonomics:

- Add `"bpm": "npm run build -w @bpm/cli --if-present && node packages/cli/dist/bin.js"` script on the root `package.json`, **or** document `npx bpm` after workspace link. Prefer a root script `bpm` that invokes the built bin so agents have one stable entry: `npm run bpm -- validate foo.bpm`.

## Design decisions

1. **Validate first, then render/export.** Agents need `validate` immediately; SVG/XML are secondary. Ship all three in one package so roadmap #2 is complete in one pass, but implement/test in that order.
2. **JSON is the validate contract.** Pretty-print with `JSON.stringify(result, null, 2)`. Do not invent a second schema — reuse `@bpm/validate`'s `ValidationResult` verbatim.
3. **No stdin for v1** unless trivial. File path required. (Stdin can be a later additive flag `-`.)
4. **No LLM API inside the CLI.** The CLI is the tool the LLM *calls*; it does not call models.
5. **Build before run.** `bin` points at `dist/bin.js` with a `#!/usr/bin/env node` shebang. Tests import TypeScript sources via Vitest (same as other packages); the published bin is compiled.
6. **Engine registration.** Call `layout()` from `@bpm/layout` only — that facade already `ensureDefaultEngines()`. Do not register engines in the CLI.

## Explicitly out of scope

- `bpm check` / `--max-crossings` quality gate (can wrap `validate` later).
- Watching files, REPL, interactive TUI.
- In-app web chat or API-key proxy.
- Publishing to npm registry (workspace-local bin is enough).
- Reading Diagram-mode `.bpmn` back into text.

## Docs

- Mark roadmap item 2 done (or “done for validate/render/export”).
- Update `docs/STATUS.md` “No CLI” limitation.
- Add a short “CLI” subsection to `docs/LANGUAGE.md` §12 or STATUS pointing agents at `bpm validate`.
- Optional one-liner in root README if one exists; otherwise STATUS is enough.

## Testing

- Unit-test argv parsing (command, file, `-o`, `--engine`).
- Integration-style CLI tests: write temp fixtures, call command functions (not necessarily spawning a subprocess — prefer testing `runValidate(argv)` exports so Vitest stays fast), assert exit code + stdout JSON shape.
- One optional spawn test of `node dist/bin.js validate …` after build if cheap; not required if command modules are fully covered.
- Full monorepo `npm test` stays green.

## Related

- `docs/ROADMAP.md` item 2
- `packages/validate` — library this CLI wraps
- `docs/superpowers/specs/2026-08-10-llm-friendly-diagram-extensions-design.md` — deferred CLI wiring from item 3
