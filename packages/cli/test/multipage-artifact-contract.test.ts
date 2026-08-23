import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgv } from '../src/args.js';
import { runExportCommand } from '../src/commands/export.js';
import * as docx from '@bpm/export-docx';
import * as pptx from '@bpm/export-pptx';

const fixture = path.resolve('packages/cli/test/fixtures/multipage.bpm');
const output = () => path.join(mkdtempSync(path.join(tmpdir(), 'bpm-contract-')), 'out.docx');

describe('CLI multipage artifact diagnostics', () => {
  it('preserves exporter LIMIT, INVALID, and UNSUPPORTED codes', async () => {
    for (const [target, exporter, code] of [['docx', docx, 'LIMIT'], ['docx', docx, 'INVALID'], ['pptx', pptx, 'UNSUPPORTED']] as const) {
      const spy = vi.spyOn(exporter, target === 'docx' ? 'exportDocx' : 'exportPptx').mockRejectedValueOnce(Object.assign(new Error(`${code} failure`), { code }));
      const result = await runExportCommand(parseArgv(['export', fixture, '--target', target, '-o', output(), '--json']));
      expect(result.exitCode).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ status: 'blocked', errors: [expect.objectContaining({ code })] }); spy.mockRestore();
    }
  });

  it('does not create or overwrite output after a failed export', async () => {
    const out = output(); writeFileSync(out, 'preserve');
    const spy = vi.spyOn(docx, 'exportDocx').mockRejectedValueOnce(Object.assign(new Error('LIMIT failure'), { code: 'LIMIT' }));
    const result = await runExportCommand(parseArgv(['export', fixture, '--target', 'docx', '-o', out, '--json']));
    expect(result.exitCode).toBe(1); expect(existsSync(out)).toBe(true); expect(readFileSync(out, 'utf8')).toBe('preserve'); spy.mockRestore();
  });

  it('keeps warning-only exports successful and writes the artifact', async () => {
    const out = output(); const result = await runExportCommand(parseArgv(['export', fixture, '--target', 'docx', '-o', out, '--json']));
    expect(result.exitCode).toBe(0); expect(existsSync(out)).toBe(true); expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, status: 'completed', output: { generated: true }, errors: [] });
  });
});
