import { runtimeCapabilities, canonicalCommand, optionMetadata, CLI_COMMANDS } from './commandRegistry.js';
import type { DiagramFamilyId } from '@bpm/diagram-runtime';
export type { CliCommand } from './commandRegistry.js';
import type { CliCommand } from './commandRegistry.js';

export interface ParsedArgs {
  command: CliCommand;
  file: string;
  out?: string;
  engine?: string;
  target?: string;
  json: boolean;
  help: boolean;
  helpCommand?: CliCommand;
  version: boolean;
  fix: boolean;
  format: 'svg' | 'png' | 'text' | 'json' | 'sarif';
  outputFormat: 'text' | 'json' | 'sarif';
  changed: boolean;
  base?: string;
  provider?: string;
  positioning?: 'auto' | 'manual';
  visualReview: boolean;
  maxVisualAttempts: number;
  imageOut?: string;
  maxAttempts: number;
  family: DiagramFamilyId;
  /** generate only: the plain-language process description (the "file" positional repurposed). */
  description?: string;
}

function helpArgs(command?: CliCommand): ParsedArgs {
  return {
    command: command ?? 'validate', file: '', json: false, help: true, helpCommand: command,
    version: false, fix: false, format: 'svg', outputFormat: 'text', changed: false,
    maxAttempts: 3, visualReview: false, maxVisualAttempts: 2, family: 'bpmn',
  };
}

function assertOptionAllowed(flag: string, command: CliCommand): void {
  const option = optionMetadata(flag);
  if (option && !option.commands.includes(command)) {
    throw new Error(`${flag} is not supported by bpm ${command}`);
  }
}

export function parseArgv(argv: string[]): ParsedArgs {
  if (argv.includes('--version') || argv.includes('-v') || argv[0] === 'version') {
    return { ...helpArgs(), help: false, version: true };
  }
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    const requested = argv[0] === 'help' ? argv[1] : argv.find((value) => canonicalCommand(value));
    return helpArgs(canonicalCommand(requested));
  }
  if (argv.length === 0) {
    throw new Error(`usage: bpm <${CLI_COMMANDS.join('|')}> <file> [options]`);
  }
  const [cmd, ...rest] = argv;
  const command = canonicalCommand(cmd);
  if (!command) {
    throw new Error(`unknown command "${cmd}" — expected ${CLI_COMMANDS.join(', ')}`);
  }
  let file = '';
  let out: string | undefined;
  let engine: string | undefined;
  let target: string | undefined;
  let json = false;
  let format: 'svg' | 'png' | 'text' | 'json' | 'sarif' | undefined;
  let provider: string | undefined;
  let positioning: 'auto' | 'manual' | undefined;
  let visualReview = false;
  let maxVisualAttempts = 2;
  let imageOut: string | undefined;
  let maxAttempts = 3;
  let family: DiagramFamilyId = 'bpmn';
  let fix = false;
  let changed = false;
  let base: string | undefined;
  let outputFormat: 'text' | 'json' | 'sarif' = 'text';
  let optionsEnded = false;
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!optionsEnded && a === '--') { optionsEnded = true; continue; }
    if (a === '--json') { assertOptionAllowed(a, command); json = true; outputFormat = 'json'; continue; }
    if (a === '-o' || a === '--out' || a === '--output') {
      assertOptionAllowed(a, command);
      out = rest[++i];
      if (!out) throw new Error('missing path after -o/--output');
      continue;
    }
    if (a === '--engine' || a === '--layout') {
      assertOptionAllowed(a, command);
      engine = rest[++i];
      if (!engine) throw new Error(`missing name after ${a}`);
      continue;
    }
    if (a === '--target') {
      assertOptionAllowed(a, command);
      target = rest[++i];
      if (!target) throw new Error('missing value after --target');
      continue;
    }
    if (a === '--format') {
      assertOptionAllowed(a, command);
      const value = rest[++i];
      if (!value) throw new Error('missing value after --format');
      if (command === 'render') {
        if (value !== 'svg' && value !== 'png') {
          throw new Error(`unknown format "${value}" — expected svg or png`);
        }
        format = value;
      } else if (command === 'export') {
        target = value;
      } else if (command === 'validate') {
        if (value !== 'text' && value !== 'json' && value !== 'sarif') {
          throw new Error(`unknown check format "${value}" — expected text, json, or sarif`);
        }
        format = value;
        outputFormat = value;
        if (value === 'json') json = true;
      } else {
        throw new Error(`--format is only supported by validate, render, and export`);
      }
      continue;
    }
    if (a === '--provider') {
      assertOptionAllowed(a, command);
      provider = rest[++i];
      if (!provider) throw new Error('missing name after --provider');
      continue;
    }
    if (a === '--family') {
      assertOptionAllowed(a, command);
      const value = rest[++i];
      if (!value || !runtimeCapabilities().families.some((entry) => entry.id === value)) {
        throw new Error(`unknown family "${value ?? ''}"`);
      }
      // The value has been checked against the current public family list above. The
      // explicit assertion keeps this source compiling while a workspace build refreshes
      // the generated @bpm/diagram-runtime declaration consumed through the package export.
      family = value as DiagramFamilyId;
      continue;
    }
    if (a === '--positioning') {
      assertOptionAllowed(a, command);
      const value = rest[++i];
      if (!value) throw new Error('missing value after --positioning');
      if (value !== 'auto' && value !== 'manual') {
        throw new Error(`unknown positioning "${value}" — expected auto or manual`);
      }
      positioning = value;
      continue;
    }
    if (a === '--manual') { assertOptionAllowed(a, command); positioning = 'manual'; continue; }
    if (a === '--visual-review') { assertOptionAllowed(a, command); visualReview = true; continue; }
    if (a === '--fix') {
      assertOptionAllowed(a, command);
      if (command !== 'review') throw new Error('--fix is only supported by review; use bpm fix for an explicit write workflow');
      fix = true;
      continue;
    }
    if (a === '--max-visual-attempts') {
      assertOptionAllowed(a, command);
      const raw = rest[++i];
      if (!raw) throw new Error('missing value after --max-visual-attempts');
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) throw new Error(`invalid --max-visual-attempts "${raw}" — expected a positive integer`);
      maxVisualAttempts = n;
      continue;
    }
    if (a === '--image-out') {
      assertOptionAllowed(a, command);
      imageOut = rest[++i];
      if (!imageOut) throw new Error('missing path after --image-out');
      continue;
    }
    if (a === '--max-attempts') {
      assertOptionAllowed(a, command);
      const raw = rest[++i];
      if (!raw) throw new Error('missing value after --max-attempts');
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`invalid --max-attempts "${raw}" — expected a positive integer`);
      }
      maxAttempts = n;
      continue;
    }
    if (a === '--changed') {
      assertOptionAllowed(a, command);
      changed = true;
      continue;
    }
    if (a === '--base') {
      assertOptionAllowed(a, command);
      base = rest[++i];
      if (!base) throw new Error('missing ref after --base');
      continue;
    }
    if (!optionsEnded && a.startsWith('-') && a !== '-') throw new Error(`unknown option "${a}"`);
    positionals.push(a);
  }
  if (command === 'generate') {
    file = positionals.join(' ');
  } else if (command === 'capabilities') {
    file = '';
    if (positionals.length > 0) throw new Error(`unexpected argument "${positionals[0]}"`);
  } else {
    file = positionals[0] ?? '';
    if (positionals.length > 1) throw new Error(`unexpected argument "${positionals[1]}"`);
  }
  if (!file && command !== 'capabilities' && !changed) {
    throw new Error(command === 'generate' ? 'missing "<description>" for bpm generate' : `missing <file> for bpm ${command}`);
  }
  if (base && !changed) throw new Error('--base requires --changed');
  if (json && outputFormat === 'sarif') throw new Error('--json cannot be combined with --format sarif');
  const resolvedFormat = format ?? (out?.endsWith('.png') ? 'png' : 'svg');
  return {
    command, file, out, engine, target, json, help: false, version: false, fix, outputFormat, changed, base,
    format: resolvedFormat, provider, positioning, visualReview, maxVisualAttempts, imageOut, maxAttempts, family,
    description: command === 'generate' ? file : undefined,
  };
}
