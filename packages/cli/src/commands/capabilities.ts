import type { ParsedArgs } from '../args.js';
import type { CommandResult } from '../commandResult.js';
import { jsonResult } from '../formatOutput.js';
import { runtimeCapabilities } from '../commandRegistry.js';

export function runCapabilitiesCommand(args: ParsedArgs): CommandResult {
  const payload = { command: 'capabilities', ...runtimeCapabilities() };
  if (args.json) return jsonResult(0, payload);
  const lines = ['Families:'];
  for (const family of payload.families) {
    const exports = family.structuredExports.map((entry) => String(entry.format)).join(', ') || 'none';
    const ai = Object.entries(family.ai).filter(([, enabled]) => enabled).map(([name]) => name).join(', ') || 'none';
    lines.push(`  ${family.id}: exports=${exports}; pptx=${family.pptx ? 'yes' : 'no'}; ai=${ai}`);
  }
  lines.push(`Export formats: ${payload.exportFormats.join(', ')}\n`);
  return { exitCode: 0, stdout: lines.join('\n'), stderr: '' };
}

