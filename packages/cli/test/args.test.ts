import { describe, it, expect } from 'vitest';
import { parseArgv } from '../src/args.js';

describe('parseArgv', () => {
  it('parses validate with a file path', () => {
    expect(parseArgv(['validate', 'a.bpm'])).toMatchObject({
      command: 'validate', file: 'a.bpm', json: false, help: false, format: 'svg',
    });
  });

  it('supports the short workflow aliases and ergonomic option names', () => {
    expect(parseArgv(['check', 'a.bpm', '--json'])).toMatchObject({ command: 'validate', json: true });
    expect(parseArgv(['import', 'a.bpmn', '--output', 'out.bpm'])).toMatchObject({ command: 'import-diagram', out: 'out.bpm' });
    expect(parseArgv(['render', 'a.bpm', '--output', 'out.svg', '--layout', 'flat'])).toMatchObject({ out: 'out.svg', engine: 'flat' });
    expect(parseArgv(['generate', 'ship', 'an', 'order', '--manual'])).toMatchObject({ description: 'ship an order', positioning: 'manual' });
  });

  it('supports explicit fix and command-specific help/version parsing', () => {
    expect(parseArgv(['fix', 'a.bpm', '-o', 'fixed.bpm'])).toMatchObject({ command: 'fix', out: 'fixed.bpm' });
    expect(parseArgv(['review', '--help'])).toMatchObject({ help: true, helpCommand: 'review' });
    expect(parseArgv(['--version'])).toMatchObject({ version: true, help: false });
  });

  it('parses changed-file and SARIF check options', () => {
    expect(parseArgv(['check', '--changed', '--base', 'origin/main', '--format', 'sarif'])).toMatchObject({
      command: 'validate', changed: true, base: 'origin/main', outputFormat: 'sarif', format: 'sarif', file: '',
    });
  });

  it('rejects options that do not belong to the selected command', () => {
    expect(() => parseArgv(['render', 'a.bpm', '--provider', 'manual'])).toThrow(/not supported/);
    expect(() => parseArgv(['fix', 'a.bpm', '--visual-review'])).toThrow(/not supported/);
  });

  it('parses render with -o and --engine', () => {
    expect(parseArgv(['render', 'a.bpm', '-o', 'out.svg', '--engine', 'flat'])).toMatchObject({
      command: 'render', file: 'a.bpm', out: 'out.svg', engine: 'flat', json: false, help: false, format: 'svg',
    });
  });

  it('parses review with --provider and --image-out', () => {
    expect(parseArgv(['review', 'a.bpm', '--provider', 'manual', '--image-out', 'r.png'])).toMatchObject({
      command: 'review', file: 'a.bpm', provider: 'manual', imageOut: 'r.png', maxAttempts: 3,
    });
  });

  it('parses --max-attempts for review', () => {
    expect(parseArgv(['review', 'a.bpm', '--max-attempts', '5'])).toMatchObject({
      command: 'review', file: 'a.bpm', maxAttempts: 5,
    });
  });

  it('rejects invalid --max-attempts', () => {
    expect(() => parseArgv(['review', 'a.bpm', '--max-attempts', '0'])).toThrow(/max-attempts/);
  });

  it('parses export with --json flag', () => {
    expect(parseArgv(['export', 'a.bpm', '--json', '-o', 'out.bpmn'])).toMatchObject({
      command: 'export', file: 'a.bpm', out: 'out.bpmn', json: true,
    });
  });

  it('accepts the gantt family for runtime and CLI dispatch', () => {
    expect(parseArgv(['validate', 'plan.bpm', '--family', 'gantt'])).toMatchObject({ family: 'gantt' });
    expect(parseArgv(['export', 'plan.bpm', '--target', 'gantt-json'])).toMatchObject({ target: 'gantt-json' });
    expect(parseArgv(['export', 'plan.bpm', '--target', 'gantt-csv'])).toMatchObject({ target: 'gantt-csv' });
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

  it('parses generate with a quoted description and --provider', () => {
    expect(parseArgv(['generate', 'ship an order', '--provider', 'openai', '-o', 'out.bpm'])).toMatchObject({
      command: 'generate', description: 'ship an order', provider: 'openai', out: 'out.bpm', maxAttempts: 3,
    });
  });

  it('parses the opt-in generate positioning mode', () => {
    expect(parseArgv(['generate', 'ship an order', '--positioning', 'manual'])).toMatchObject({
      command: 'generate', positioning: 'manual',
    });
  });

  it('rejects an unknown generate positioning mode', () => {
    expect(() => parseArgv(['generate', 'ship an order', '--positioning', 'grid'])).toThrow(/positioning/);
  });

  it('parses the opt-in visual review loop', () => {
    expect(parseArgv(['generate', 'ship an order', '--visual-review', '--max-visual-attempts', '4'])).toMatchObject({
      command: 'generate', visualReview: true, maxVisualAttempts: 4,
    });
  });

  it('throws when description is missing for generate', () => {
    expect(() => parseArgv(['generate'])).toThrow(/description/i);
  });

  it('accepts an unquoted multi-word description', () => {
    expect(parseArgv(['generate', 'ship', 'an', 'order']).description).toBe('ship an order');
  });

  it('parses import-diagram with a file path and -o', () => {
    expect(parseArgv(['import-diagram', 'a.bpmn', '-o', 'out.bpm'])).toMatchObject({
      command: 'import-diagram', file: 'a.bpmn', out: 'out.bpm',
    });
  });

  it('throws when file is missing for import-diagram', () => {
    expect(() => parseArgv(['import-diagram'])).toThrow(/file/i);
  });

  it('parses freeze with a source file and output path', () => {
    expect(parseArgv(['freeze', 'a.bpm', '-o', 'manual.bpm'])).toMatchObject({
      command: 'freeze', file: 'a.bpm', out: 'manual.bpm',
    });
  });
});

describe('--format', () => {
  it('defaults to svg when --format is omitted', () => {
    const args = parseArgv(['render', 'x.bpm']);
    expect(args.format).toBe('svg');
  });

  it('accepts --format png', () => {
    const args = parseArgv(['render', 'x.bpm', '--format', 'png']);
    expect(args.format).toBe('png');
  });

  it('infers png format from a -o path ending in .png', () => {
    const args = parseArgv(['render', 'x.bpm', '-o', 'out.png']);
    expect(args.format).toBe('png');
  });

  it('explicit --format wins over -o extension', () => {
    const args = parseArgv(['render', 'x.bpm', '-o', 'out.png', '--format', 'svg']);
    expect(args.format).toBe('svg');
  });

  it('rejects unknown --format values', () => {
    expect(() => parseArgv(['render', 'x.bpm', '--format', 'jpg'])).toThrow(
      /unknown format "jpg"/,
    );
  });

  it('missing value after --format throws', () => {
    expect(() => parseArgv(['render', 'x.bpm', '--format'])).toThrow(
      /missing value after --format/,
    );
  });
});
