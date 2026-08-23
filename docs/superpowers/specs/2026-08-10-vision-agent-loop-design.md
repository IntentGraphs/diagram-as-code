# Vision agent loop — design spec

_Date: 2026-08-10_

## Problem

The repo has no mechanism for an LLM/agent to visually inspect a rendered
diagram. `@bpm/validate` catches rule-encoded defects (overlaps, edge
overshoots) as text/JSON, but the `diagram-rendering-quality-fixes` plan shows
this text-only path misses real visual defects (label crowding, edges reading
as crossing unrelated content, imbalanced layout) that only a human eyeballing
the SVG caught. There is no LLM API key or vision integration anywhere in the
repo, and the existing "Agent/LLM loop" in `docs/CLI.md` treats `render` as
output "for human review" only — never fed back to the agent itself.

## Goal

Let an external coding agent (Claude Code, Cursor, etc.) — using its own model
access, not a key stored in this repo — close the loop itself: render a
diagram to an image it can view, judge it against a short checklist of known
visual failure modes, and revise the `.bpm` source if needed. This is additive
to the existing text `validate` loop, not a replacement.

## Non-goals

- No API key or LLM client added to this repo (`in-app chat or LLM API keys`
  is explicitly out of scope per `docs/CLI.md`).
- No in-repo automated "review" command that itself calls a vision LLM —
  deferred; the immediate goal is enabling any external agent, not building
  one in.
- No headless-browser screenshot pipeline — adds a heavy dependency for no
  benefit over direct SVG rasterization.
- No pixel-diff/golden-image automated testing — the agent is the visual
  judge, not a pixel comparator.

## Design

### 1. `bpm render --format png`

`packages/cli/src/commands/render.ts` gains a `--format png` option (also
inferred from `-o path.png`). After the existing parse → layout → `@bpm/render`
SVG-string pipeline runs unchanged, a new rasterization step converts the SVG
string to PNG bytes using `@resvg/resvg-js` (native binding, no browser,
deterministic) before writing to `-o` or binary stdout.

`packages/cli/src/args.ts` gains a `--format` option (values: `svg` default,
`png`); `-o file.png` without an explicit `--format` also selects PNG.

New dependency: `@resvg/resvg-js` added to `packages/cli/package.json`.

### 2. Documented vision loop

`docs/CLI.md` gets a new subsection after the existing "Agent / LLM loop",
titled "Vision loop (optional)":

1. Run the existing text loop first (`validate` → fix from `errors[].message`
   → re-validate) until `valid: true`.
2. `bpm render that-file.bpm --format png -o /tmp/review.png`
3. View the PNG using whatever image-reading capability the calling agent has
   (e.g. Claude Code's `Read` tool on an image path).
4. Check the image against this checklist, drawn from known gaps
   `@bpm/validate` cannot catch today:
   - Do any labels crowd a corner or overlap another label/node, even if not
     flagged as a geometric overlap?
   - Does any edge visually read as cutting through an unrelated node, even
     if it doesn't touch that node's registered bounding box?
   - Is spacing/alignment inconsistent in a way that reads as sloppy (e.g.
     one lane cramped, another sparse)?
   - Does the overall layout look balanced, or lopsided/cluttered in one
     region?
5. If something looks wrong, revise the `.bpm` source and repeat from step 1.

No new schema, no new exit codes — this is a documentation + CLI-flag
addition on top of the existing `render` command.

### 3. Testing

`packages/cli/test/render.png.test.ts`: render a known-clean fixture
(`clean.bpm`) with `--format png`, assert stdout/output-file bytes start with
the PNG magic number (`\x89PNG\r\n\x1a\n`) and have nonzero length. Existing
`render.cli.test.ts` SVG behavior is unchanged (default format stays `svg`).

## Open questions / risks

- `@resvg/resvg-js` ships prebuilt native binaries per platform; confirm it
  installs cleanly in CI before relying on it (fallback: pure-JS `resvg-wasm`
  build if native binaries are a problem, at a performance cost — decide at
  implementation time only if the native package fails to install).
