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

  it('renders a mindmap through the generic SVG path', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('mindmap.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^<svg /);
    expect(result.stdout).toContain('Planning');
  });

  it('renders a flowchart through the generic SVG path', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('flowchart.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^<svg /);
    expect(result.stdout).toContain('Approved?');
  });

  it('returns structured diagnostics for an invalid mindmap', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('mindmap-bad-indent.bpm'), '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, errors: [expect.objectContaining({ code: 'bad_indent_step', line: 3 })] });
  });

  it('writes a valid PNG for a mindmap', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'mindmap.png');
    const result = await runRenderCommand(parseArgv(['render', fix('mindmap.bpm'), '-o', out, '--format', 'png']));
    expect(result.exitCode).toBe(0);
    expect(readFileSync(out).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('does not write out.svg in the working directory when -o is omitted', async () => {
    const stray = path.join(process.cwd(), 'out.svg');
    const { existsSync, statSync } = await import('node:fs');
    const existed = existsSync(stray);
    const before = existed ? { mtimeMs: statSync(stray).mtimeMs, size: statSync(stray).size } : null;
    const result = await runRenderCommand(parseArgv(['render', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^<svg /);
    if (!existed) {
      expect(existsSync(stray)).toBe(false);
    } else {
      const after = statSync(stray);
      expect(after.mtimeMs).toBe(before!.mtimeMs);
      expect(after.size).toBe(before!.size);
    }
  });

  it('returns exit 1 for bad syntax', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('bad-syntax.bpm'), '--json']));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).errors.length).toBeGreaterThan(0);
  });

  it('writes a PNG file when --format png is set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'out.png');
    const result = await runRenderCommand(
      parseArgv(['render', fix('clean.bpm'), '-o', out, '--format', 'png']),
    );
    expect(result.exitCode).toBe(0);
    const png = readFileSync(out);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.length).toBeGreaterThan(0);
  });

  it('infers PNG format from a -o path ending in .png', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bpm-cli-'));
    const out = path.join(dir, 'out.png');
    const result = await runRenderCommand(parseArgv(['render', fix('clean.bpm'), '-o', out]));
    expect(result.exitCode).toBe(0);
    const png = readFileSync(out);
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
  });

  it('errors when --format png is used without -o', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('clean.bpm'), '--format', 'png']));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--format png requires -o/);
  });

  it('reports semantic pagination metadata and warnings in JSON', async () => {
    const result = await runRenderCommand(parseArgv(['render', fix('multipage.bpm'), '--json']));
    const json = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(json.pagination).toMatchObject({ mode: 'semantic', pageCount: 2 });
    expect(json.errors).toEqual([]);
    expect(json.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'pagination_cross_page_edge' })]));
  });
});
