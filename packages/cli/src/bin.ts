#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgv } from './args.js';
import { renderCliHelp } from './commandRegistry.js';
import { runValidateCommand } from './commands/validate.js';
import { runRenderCommand } from './commands/render.js';
import { runExportCommand } from './commands/export.js';
import { runReviewCommand } from './commands/review.js';
import { runFixCommand } from './commands/review.js';
import { runGenerateCommand } from './commands/generate.js';
import { runImportDiagramCommand } from './commands/importDiagram.js';
import { runFreezeCommand } from './commands/freeze.js';
import { runCheckCommand } from './commands/check.js';
import { runCapabilitiesCommand } from './commands/capabilities.js';

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgv(process.argv.slice(2));
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    return 1;
  }
  if (args.help) {
    process.stdout.write(renderCliHelp(args.helpCommand));
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${PACKAGE.version}\n`);
    return 0;
  }
  try {
    const runner =
      args.command === 'capabilities' ? runCapabilitiesCommand
      : args.command === 'validate' && (args.changed || args.outputFormat === 'sarif') ? runCheckCommand
      : args.command === 'validate' ? runValidateCommand
      : args.command === 'render' ? runRenderCommand
      : args.command === 'export' ? runExportCommand
      : args.command === 'generate' ? runGenerateCommand
      : args.command === 'import-diagram' ? runImportDiagramCommand
      : args.command === 'freeze' ? runFreezeCommand
      : args.command === 'fix' || (args.command === 'review' && args.fix) ? runFixCommand
      : runReviewCommand;
    const result = await runner(args);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.exitCode;
  } catch (err) {
    process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
    return 1;
  }
}

const code = await main();
process.exit(code);
