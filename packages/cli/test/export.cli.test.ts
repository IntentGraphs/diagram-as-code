import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgv } from '../src/args.js';
import { runExportCommand } from '../src/commands/export.js';
import * as docxExporter from '@bpm/export-docx';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const cliBinary = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'bin.js');

function runCli(...argv: string[]) {
  return spawnSync(process.execPath, [cliBinary, ...argv], { encoding: 'utf8' });
}

describe('bpm subprocess contract', () => {
  it('keeps help on stdout and exits successfully', () => {
    const result = runCli('--help');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/usage: bpm/);
    expect(result.stderr).toBe('');
  });

  it('keeps usage failures on stderr with a non-zero exit', () => {
    const result = runCli('export');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/missing|usage|requires/i);
  });

  it('keeps JSON results on stdout and diagnostics on stderr', () => {
    const result = runCli('validate', fix('clean.bpm'), '--json');
    expect(result.status).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stderr).toBe('');
  });

  it('supports version output and the human-readable check alias', () => {
    const version = runCli('--version');
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe('0.0.1');
    const check = runCli('check', fix('clean.bpm'));
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/valid/);
    expect(check.stderr).toBe('');
  });
});

describe('runExportCommand', () => {
  it('writes BPMN XML for a clean diagram', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'out.bpmn');
    const result = await runExportCommand(parseArgv(['export', fix('clean.bpm'), '-o', out]));
    expect(result.exitCode).toBe(0);
    const xml = readFileSync(out, 'utf8');
    expect(xml).toMatch(/definitions/);
    expect(xml).toMatch(/bpmn/i);
  });

  it('exports an architecture target selected by format id', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'architecture.drawio');
    const result = await runExportCommand(parseArgv(['export', '-o', out, '--target', 'architecture-drawio-xml', fix('architecture.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('<mxfile');
  });

  it('returns XML on stdout when -o is omitted', async () => {
    const result = await runExportCommand(parseArgv(['export', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/definitions/);
  });

  it('returns exit 1 for bad syntax', async () => {
    const result = await runExportCommand(parseArgv(['export', fix('bad-syntax.bpm'), '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).errors.length).toBeGreaterThan(0);
  });

  it('does not create or replace an output when validation fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'invalid.bpmn');
    const result = await runExportCommand(parseArgv(['export', fix('bad-syntax.bpm'), '-o', out, '--json']));
    expect(result.exitCode).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  it('preserves an existing output when export validation fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'existing.bpmn');
    const original = 'keep this artifact';
    writeFileSync(out, original);
    const result = await runExportCommand(parseArgv(['export', fix('bad-syntax.bpm'), '-o', out]));
    expect(result.exitCode).toBe(1);
    expect(readFileSync(out, 'utf8')).toBe(original);
  });

  it('writes an editable PPTX package to a binary output path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'diagram.pptx');
    const result = await runExportCommand(parseArgv(['export', fix('clean.bpm'), '--target', 'pptx', '-o', out]));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
  });

  it('writes an editable PPTX package for a mindmap with nested nodes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'mindmap.pptx');
    const result = await runExportCommand(parseArgv(['export', fix('mindmap.bpm'), '--target', 'pptx', '-o', out]));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
  });

  it('writes PPTX and reports editable-text warnings without failing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'warning.pptx');
    const result = await runExportCommand(parseArgv(['export', fix('pptx-text-warning.bpm'), '--target', 'pptx', '-o', out, '--json']));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, status: 'completed', output: { generated: true, format: 'pptx' }, effectiveFamily: 'bpmn', warnings: expect.arrayContaining([expect.objectContaining({ code: 'editable_text_density' })]), errors: [] });
  });

  it('reports a blocked unsupported direction export without writing output', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'blocked.pptx');
    const result = await runExportCommand(parseArgv(['export', fix('unsupported-direction.bpm'), '--target', 'pptx', '-o', out, '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, status: 'blocked', errors: [expect.objectContaining({ code: 'invalid_direction', message: expect.stringContaining('Export blocked') })] });
  });

  it('exports semantic pages to PPTX and reports pagination metadata separately from warnings', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'multipage.pptx');
    const result = await runExportCommand(parseArgv(['export', fix('multipage.bpm'), '--target', 'pptx', '-o', out, '--json']));
    const json = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
    expect(json.pagination).toMatchObject({ mode: 'semantic', pageCount: 2 });
    expect(json.errors).toEqual([]);
    expect(json.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'pagination_cross_page_edge' })]));
  });

  it('exports warning-only semantic pages to DOCX', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'multipage.docx');
    const result = await runExportCommand(parseArgv(['export', fix('multipage.bpm'), '--target', 'docx', '-o', out, '--json']));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 2).toString()).toBe('PK');
    expect(JSON.parse(result.stdout)).toMatchObject({ output: { format: 'docx' }, pagination: { mode: 'semantic', pageCount: 2 }, errors: [] });
  });

  it('does not write binary PPTX to stdout', async () => {
    const result = await runExportCommand(parseArgv(['export', fix('clean.bpm'), '--target', 'pptx']));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('binary');
  });

  it('preserves a DOCX exporter limit code and blocked exit status', async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'bpm-cli-')), 'limited.docx');
    const exportSpy = vi.spyOn(docxExporter, 'exportDocx').mockRejectedValueOnce(Object.assign(new Error('DOCX export is limited to 100 pages'), { code: 'LIMIT' }));
    const result = await runExportCommand(parseArgv(['export', fix('multipage.bpm'), '--target', 'docx', '-o', out, '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'blocked', errors: [expect.objectContaining({ code: 'LIMIT', message: expect.stringContaining('Export blocked') })], correctiveAction: expect.stringContaining('retry') });
    expect(exportSpy).toHaveBeenCalled();
    exportSpy.mockRestore();
  });

  it('preserves an invalid exporter code in text diagnostics', async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'bpm-cli-')), 'invalid.docx');
    const exportSpy = vi.spyOn(docxExporter, 'exportDocx').mockRejectedValueOnce(Object.assign(new Error('DOCX page dimensions are invalid'), { code: 'INVALID' }));
    const result = await runExportCommand(parseArgv(['export', fix('multipage.bpm'), '--target', 'docx', '-o', out]));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('[INVALID] DOCX page dimensions are invalid');
    expect(result.stderr).toContain('Export blocked. Corrective action: fix this diagnostic and retry.');
    expect(exportSpy).toHaveBeenCalled();
    exportSpy.mockRestore();
  });
});
