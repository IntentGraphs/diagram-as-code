# CLI Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch:** `llm-diagram-extensions` (continue on the current branch; do not create a new one).

**Design reference:** `docs/superpowers/specs/2026-08-10-cli-packaging-design.md` — read it before starting.

**Goal:** Ship a workspace `@bpm/cli` package with a `bpm` binary that runs `validate`, `render`, and `export` against `.bpm` files so LLM agents and humans can drive the core pipeline from the shell.

**Architecture:** Thin argv router over existing libraries (`@bpm/validate`, `@bpm/parser`, `@bpm/layout`, `@bpm/render`, `@bpm/export-xml`). No new layout logic and no LLM client inside the CLI. Hand-rolled argv (no `commander`).

**Tech Stack:** TypeScript, Vitest, npm workspaces — same as the monorepo. Zero new runtime dependencies.

## Global Constraints

- Stay on `llm-diagram-extensions`; commits are additive on this branch.
- Do not add `commander` / `yargs` / `chalk` — parse `process.argv` locally.
- Reuse `ValidationResult` from `@bpm/validate` verbatim for `bpm validate` JSON output.
- Call `layout()` only via `@bpm/layout` (engines already registered there).
- Exit codes: `0` success, `1` failure; do not implement exit `2` / `--max-crossings` in v1.
- TDD for every task; run `npm test` after each feature commit.
- Rebuild packages that publish `dist/` before any smoke that imports `@bpm/*` from Node outside Vitest (`layout-core`, `parser`, `layout`, engines, `validate`, `render`, `export-xml`, `cli`).

---

## File Structure

```
packages/cli/                         # NEW
  package.json
  tsconfig.json
  src/
    bin.ts                            # shebang entry, process.exit
    args.ts                           # parseArgv()
    readInput.ts                      # readFileUtf8(path)
    commands/
      validate.ts                     # runValidateCommand
      render.ts                       # runRenderCommand
      export.ts                       # runExportCommand
  test/
    args.test.ts
    validate.cli.test.ts
    render.cli.test.ts
    export.cli.test.ts
    fixtures/
      clean.bpm
      bad-syntax.bpm
      overlap-manual.bpm
package.json                          # root: add "bpm" script
docs/STATUS.md
docs/ROADMAP.md
docs/LANGUAGE.md                      # §12 CLI pointer
```

Dependency direction:

```
ast ← parser ← layout ← render / export-xml / validate
validate + render + export-xml + parser + layout ← cli
```

---

## Task 1: Scaffold `@bpm/cli` package

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/bin.ts` (stub)

**Interfaces:**
- Produces: workspace package discoverable by Vitest / npm workspaces.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@bpm/cli",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "bpm": "./dist/bin.js"
  },
  "main": "dist/bin.js",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@bpm/parser": "*",
    "@bpm/layout": "*",
    "@bpm/layout-core": "*",
    "@bpm/render": "*",
    "@bpm/export-xml": "*",
    "@bpm/validate": "*"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Stub bin.ts**

```ts
#!/usr/bin/env node
console.error('bpm: not implemented');
process.exit(1);
```

- [ ] **Step 4: Link workspace**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/bin.ts package-lock.json
git commit -m "$(cat <<'EOF'
chore(cli): scaffold @bpm/cli workspace package

EOF
)"
```

---

## Task 2: Argv parser

**Files:**
- Create: `packages/cli/src/args.ts`
- Create: `packages/cli/test/args.test.ts`

**Interfaces:**
- Produces:

```ts
export type CliCommand = 'validate' | 'render' | 'export';

export interface ParsedArgs {
  command: CliCommand;
  file: string;
  out?: string;
  engine?: string;
  json: boolean;
  help: boolean;
}

export function parseArgv(argv: string[]): ParsedArgs;
// throws Error with message suitable for stderr on bad usage
```

- [ ] **Step 1: Write failing tests**

`packages/cli/test/args.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/args.js';

describe('parseArgv', () => {
  it('parses validate with a file path', () => {
    expect(parseArgv(['validate', 'a.bpm'])).toEqual({
      command: 'validate', file: 'a.bpm', json: false, help: false,
    });
  });

  it('parses render with -o and --engine', () => {
    expect(parseArgv(['render', 'a.bpm', '-o', 'out.svg', '--engine', 'flat'])).toEqual({
      command: 'render', file: 'a.bpm', out: 'out.svg', engine: 'flat', json: false, help: false,
    });
  });

  it('parses export with --json flag', () => {
    expect(parseArgv(['export', 'a.bpm', '--json', '-o', 'out.bpmn'])).toMatchObject({
      command: 'export', file: 'a.bpm', out: 'out.bpmn', json: true,
    });
  });

  it('parses --help', () => {
    expect(parseArgv(['--help']).help).toBe(true);
  });

  it('throws when command is missing', () => {
    expect(() => parseArgv([])).toThrow(/usage/i);
  });

  it('throws when file is missing for validate', () => {
    expect(() => parseArgv(['validate'])).toThrow(/file/i);
  });

  it('throws on unknown command', () => {
    expect(() => parseArgv(['nope', 'a.bpm'])).toThrow(/unknown command/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run packages/cli/test/args.test.ts
```

- [ ] **Step 3: Implement `args.ts`**

```ts
export type CliCommand = 'validate' | 'render' | 'export';

export interface ParsedArgs {
  command: CliCommand;
  file: string;
  out?: string;
  engine?: string;
  json: boolean;
  help: boolean;
}

const COMMANDS = new Set<string>(['validate', 'render', 'export']);

export function parseArgv(argv: string[]): ParsedArgs {
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    return { command: 'validate', file: '', json: false, help: true };
  }
  if (argv.length === 0) {
    throw new Error('usage: bpm <validate|render|export> <file> [-o out] [--engine name] [--json]');
  }
  const [cmd, ...rest] = argv;
  if (!COMMANDS.has(cmd)) {
    throw new Error(`unknown command "${cmd}" — expected validate, render, or export`);
  }
  let file = '';
  let out: string | undefined;
  let engine: string | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--json') { json = true; continue; }
    if (a === '-o' || a === '--out') {
      out = rest[++i];
      if (!out) throw new Error('missing path after -o');
      continue;
    }
    if (a === '--engine') {
      engine = rest[++i];
      if (!engine) throw new Error('missing name after --engine');
      continue;
    }
    if (a.startsWith('-')) throw new Error(`unknown option "${a}"`);
    if (!file) { file = a; continue; }
    throw new Error(`unexpected argument "${a}"`);
  }
  if (!file) throw new Error(`missing <file> for bpm ${cmd}`);
  return { command: cmd as CliCommand, file, out, engine, json, help: false };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run packages/cli/test/args.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/args.ts packages/cli/test/args.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): add argv parser for validate/render/export

EOF
)"
```

---

## Task 3: `bpm validate`

**Files:**
- Create: `packages/cli/src/readInput.ts`
- Create: `packages/cli/src/commands/validate.ts`
- Create: `packages/cli/test/fixtures/clean.bpm`
- Create: `packages/cli/test/fixtures/bad-syntax.bpm`
- Create: `packages/cli/test/fixtures/overlap-manual.bpm`
- Create: `packages/cli/test/validate.cli.test.ts`
- Modify: `packages/cli/src/bin.ts`

**Interfaces:**
- Consumes: `validate` from `@bpm/validate`; `parseArgv`.
- Produces:

```ts
export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runValidateCommand(args: ParsedArgs): Promise<CommandResult>;
```

- [ ] **Step 1: Add fixtures**

`clean.bpm`:

```
task "A" as a1
task "B" as b1
a1 -> b1
```

`bad-syntax.bpm`:

```
this is not {{{ valid
```

`overlap-manual.bpm`:

```
positioning: manual

gateway exclusive "A" as a at (0, 0)
gateway exclusive "B" as b at (10, 10)
```

- [ ] **Step 2: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgv } from '../src/args.js';
import { runValidateCommand } from '../src/commands/validate.js';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

describe('runValidateCommand', () => {
  it('returns exit 0 and metrics for a clean diagram', async () => {
    const result = await runValidateCommand(parseArgv(['validate', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(true);
    expect(body.errors).toEqual([]);
    expect(body.metrics).toMatchObject({ edgeCrossings: 0, nodeOverlaps: 0, edgeThroughNode: 0 });
  });

  it('returns exit 1 and parse errors for bad syntax', async () => {
    const result = await runValidateCommand(parseArgv(['validate', fix('bad-syntax.bpm')]));
    expect(result.exitCode).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('returns exit 1 for manual-mode overlap with actionable message', async () => {
    const result = await runValidateCommand(parseArgv(['validate', fix('overlap-manual.bpm')]));
    expect(result.exitCode).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(false);
    expect(body.errors[0].message).toMatch(/overlap at their given positions/);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npx vitest run packages/cli/test/validate.cli.test.ts
```

- [ ] **Step 4: Implement readInput + validate command**

`readInput.ts`:

```ts
import { readFileSync } from 'node:fs';

export function readFileUtf8(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

`commands/validate.ts`:

```ts
import { validate } from '@bpm/validate';
import type { ParsedArgs } from '../args.js';
import { readFileUtf8 } from '../readInput.js';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runValidateCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  const result = await validate(text, args.engine ? { engineOverride: args.engine } : undefined);
  return {
    exitCode: result.valid ? 0 : 1,
    stdout: JSON.stringify(result, null, 2) + '\n',
    stderr: '',
  };
}
```

Wire `bin.ts` (validate + help only for now; other commands can throw “not implemented” until later tasks):

```ts
#!/usr/bin/env node
import { parseArgv } from './args.js';
import { runValidateCommand } from './commands/validate.js';

const HELP = `usage: bpm <validate|render|export> <file> [-o out] [--engine name] [--json]

Commands:
  validate   parse → layout → geometry; print ValidationResult JSON
  render     write SVG (-o or stdout)
  export     write BPMN 2.0 XML (-o or stdout)
`;

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgv(process.argv.slice(2));
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    return 1;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  try {
    if (args.command === 'validate') {
      const result = await runValidateCommand(args);
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      return result.exitCode;
    }
    process.stderr.write(`bpm ${args.command}: not implemented yet\n`);
    return 1;
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    return 1;
  }
}

const code = await main();
process.exit(code);
```

- [ ] **Step 5: Run tests + build smoke**

```bash
npx vitest run packages/cli
npm run build -w @bpm/validate
npm run build -w @bpm/cli
node packages/cli/dist/bin.js validate packages/cli/test/fixtures/clean.bpm
```

Expected: JSON with `"valid": true`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): add bpm validate command wrapping @bpm/validate

EOF
)"
```

---

## Task 4: `bpm render`

**Files:**
- Create: `packages/cli/src/commands/render.ts`
- Create: `packages/cli/test/render.cli.test.ts`
- Modify: `packages/cli/src/bin.ts`

**Interfaces:**
- Consumes: `parse`, `layout`, `render`.
- Produces: `runRenderCommand(args): Promise<CommandResult>` — SVG on `stdout` if no `-o`, else writes file and prints nothing (or a one-line path on stderr — prefer silent success with empty stdout when `-o` is set).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runRenderCommand } from '../src/commands/render.js';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

describe('runRenderCommand', () => {
  it('writes an SVG file for a clean diagram', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'out.svg');
    const result = await runRenderCommand(parseArgv(['render', fix('clean.bpm'), '-o', out]));
    expect(result.exitCode).toBe(0);
    const svg = readFileSync(out, 'utf8');
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('</svg>');
  });

  it('returns SVG on stdout when -o is omitted', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^<svg /);
  });

  it('returns exit 1 for bad syntax', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('bad-syntax.bpm'), '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run packages/cli/test/render.cli.test.ts
```

- [ ] **Step 3: Implement**

```ts
import { writeFileSync } from 'node:fs';
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { render } from '@bpm/render';
import type { ParsedArgs } from '../args.js';
import { readFileUtf8 } from '../readInput.js';
import type { CommandResult } from './validate.js';

export async function runRenderCommand(args: ParsedArgs): Promise<CommandResult> {
  const text = readFileUtf8(args.file);
  const { diagram, errors } = parse(text);
  if (errors.length > 0) {
    const payload = JSON.stringify({ valid: false, errors }, null, 2) + '\n';
    return args.json
      ? { exitCode: 1, stdout: '', stderr: payload }
      : { exitCode: 1, stdout: '', stderr: errors.map((e) => e.message).join('\n') + '\n' };
  }
  try {
    const positioned = await layout(diagram, args.engine ? { engineOverride: args.engine } : undefined);
    const svg = render(positioned);
    if (args.out) {
      writeFileSync(args.out, svg, 'utf8');
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: svg.endsWith('\n') ? svg : svg + '\n', stderr: '' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (args.json) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: JSON.stringify({ valid: false, errors: [{ message, severity: 'error' }] }, null, 2) + '\n',
      };
    }
    return { exitCode: 1, stdout: '', stderr: message + '\n' };
  }
}
```

Move `CommandResult` to `packages/cli/src/types.ts` if both validate and render import it — avoid circular imports (validate currently defines it; extract to `src/commandResult.ts`).

Update `bin.ts` to dispatch `render`.

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run packages/cli
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): add bpm render command for SVG output

EOF
)"
```

---

## Task 5: `bpm export`

**Files:**
- Create: `packages/cli/src/commands/export.ts`
- Create: `packages/cli/test/export.cli.test.ts`
- Modify: `packages/cli/src/bin.ts`

**Interfaces:**
- Consumes: `parse`, `layout`, `exportToXml` from `@bpm/export-xml`.
- Produces: `runExportCommand(args): Promise<CommandResult>`.

- [ ] **Step 1: Write failing tests**

Mirror render tests: clean fixture → XML containing `bpmn` / `definitions`; bad syntax → exit 1; `-o` writes file.

```ts
expect(xml).toMatch(/definitions/);
expect(xml).toMatch(/bpmn/i);
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run packages/cli/test/export.cli.test.ts
```

- [ ] **Step 3: Implement** (same structure as render, but `exportToXml(diagram, positioned)` instead of `render`)

- [ ] **Step 4: Wire bin.ts** fully — all three commands + help; remove “not implemented” branches.

- [ ] **Step 5: Run full cli suite + build smoke**

```bash
npx vitest run packages/cli
npm run build -w @bpm/cli
node packages/cli/dist/bin.js export packages/cli/test/fixtures/clean.bpm -o /tmp/clean.bpmn
head -c 200 /tmp/clean.bpmn
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli
git commit -m "$(cat <<'EOF'
feat(cli): add bpm export command for BPMN 2.0 XML

EOF
)"
```

---

## Task 6: Root `npm run bpm` script + docs

**Files:**
- Modify: `package.json` (root)
- Modify: `docs/STATUS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/LANGUAGE.md` (§12)

- [ ] **Step 1: Root script**

In root `package.json` `scripts`:

```json
"bpm": "npm run build -w @bpm/cli --silent && node packages/cli/dist/bin.js",
"build": "npm run build --workspaces --if-present",
"test": "vitest run --passWithNoTests"
```

Usage for agents: `npm run bpm -- validate path/to/file.bpm`

- [ ] **Step 2: Docs**

STATUS: remove/replace “No CLI” bullet with: CLI `@bpm/cli` — `bpm validate|render|export` (via `npm run bpm -- …`).

ROADMAP item 2: mark done, noting commands shipped.

LANGUAGE §12: add bullet —

```
- CLI: `npm run bpm -- validate <file.bpm>` prints `@bpm/validate` JSON for LLM/agent self-checks; also `render` / `export`.
```

- [ ] **Step 3: End-to-end agent-style smoke**

```bash
npm run bpm -- validate packages/cli/test/fixtures/clean.bpm
npm run bpm -- validate packages/cli/test/fixtures/overlap-manual.bpm ; echo exit:$?
npm run bpm -- render packages/cli/test/fixtures/clean.bpm -o /tmp/clean.svg
npm test
```

Expected: clean → exit 0; overlap → exit 1 + actionable message; SVG written; full suite green (208+ new cli tests).

- [ ] **Step 4: Commit**

```bash
git add package.json docs/STATUS.md docs/ROADMAP.md docs/LANGUAGE.md
git commit -m "$(cat <<'EOF'
docs: record bpm CLI and wire npm run bpm entrypoint

EOF
)"
```

---

## Final check

- [ ] `npm test` — all packages green including `@bpm/cli`.
- [ ] Document for agents (in commit message or STATUS): typical loop is write `.bpm` → `npm run bpm -- validate file.bpm` → fix from JSON → `render`/`export` as needed.
- [ ] Do **not** implement in-app chat or LLM API calls in this plan.

---

## Self-review

| Design requirement | Task |
|---|---|
| `bpm validate` JSON | 3 |
| `bpm render` SVG | 4 |
| `bpm export` XML | 5 |
| Hand-rolled argv / no new deps | 2 |
| Root entry + docs / roadmap #2 | 6 |
| No `--max-crossings` / no LLM client | Global constraints |
| Same branch | Header |

No TBD placeholders remain.
