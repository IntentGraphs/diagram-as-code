import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runCheckCommand } from '../src/commands/check.js';
import { runCapabilitiesCommand } from '../src/commands/capabilities.js';

const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

describe('bpm check and capability discovery', () => {
  it('emits SARIF for a single diagram with source locations', async () => {
    const result = await runCheckCommand(parseArgv(['check', fixture('bad-syntax.bpm'), '--format', 'sarif']));
    expect(result.exitCode).toBe(1);
    const sarif = JSON.parse(result.stdout);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('bpm');
    expect(sarif.runs[0].results[0]).toMatchObject({ level: 'error', locations: [{ physicalLocation: { region: { startLine: 1 } } }] });
  });

  it('checks changed .bpm files and returns a stable aggregate JSON result', async () => {
    const result = await runCheckCommand(parseArgv(['check', '--changed', '--json']));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ command: 'check', changed: true, valid: true, files: expect.any(Array) });
  });

  it('exposes runtime families and export formats', () => {
    const result = runCapabilitiesCommand(parseArgv(['capabilities', '--json']));
    const payload = JSON.parse(result.stdout);
    expect(payload.families.map((family: { id: string }) => family.id)).toEqual(['bpmn', 'mindmap', 'flowchart', 'architecture', 'gantt']);
    expect(payload.exportFormats).toContain('bpmn-xml');
    expect(payload.exportFormats).toContain('gantt-csv');
  });
});

