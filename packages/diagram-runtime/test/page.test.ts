import { describe, expect, it } from 'vitest';
import { executeDiagramSource, readDiagramHeader, validateDiagramSource } from '../src/index.js';

describe('page DSL and runtime fitting', () => {
  it('defaults pagination to none and reads the shared pagination directives', () => {
    expect(readDiagramHeader('task "A" as a').paginate).toBe('none');
    const header = readDiagramHeader('paginate: semantic\npageBreak: lane\ntask "A" as a');
    expect(header).toMatchObject({ paginate: 'semantic', pageBreak: 'lane' });
    expect(header.diagnostics).toEqual([]);
    expect(header.sourceWithoutDirective).toBe('\n\ntask "A" as a');
  });

  it('reports malformed and unsupported pagination combinations', () => {
    expect(readDiagramHeader('paginate: someday\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'malformed_paginate' }),
    ]));
    expect(readDiagramHeader('pageBreak: pool\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported_pagination_combination' }),
    ]));
  });

  it('reports unsupported modes and page-break strategies before layout', async () => {
    for (const mode of ['tile', 'hybrid']) {
      await expect(executeDiagramSource(`paginate: ${mode}\ntask "A" as a`)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'pagination_unsupported_combination', severity: 'error', message: expect.stringContaining(`"${mode}"`) }),
      ]) });
    }
    for (const strategy of ['group', 'branch']) {
      await expect(executeDiagramSource(`paginate: semantic\npageBreak: ${strategy}\ntask "A" as a`)).rejects.toMatchObject({ diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'pagination_unsupported_combination', severity: 'error', message: expect.stringContaining(`pageBreak: ${strategy}`) }),
      ]) });
    }
  });
  it('reads a common page directive without leaking it to family parsers', async () => {
    const source = 'page: 6in x 9in\n\nbox "A" as a';
    const header = readDiagramHeader(`diagram: flowchart\n${source}`);
    expect(header.diagnostics).toEqual([]);
    expect(header.page).toEqual({ width: 6, height: 9, unit: 'in', fit: 'contain' });
    const result = await executeDiagramSource(`diagram: flowchart\n${source}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('width="6in" height="9in" viewBox="0 0 576 864"');
    expect(result.svg).toContain('<rect width="100%" height="100%" fill="white"/>');
  });

  it('reads and strips a Gantt visual timescale directive', async () => {
    const source = 'diagram: gantt\ntimescale: monthly\ntask "A" as a start 2026-01-01 duration 5d';
    const header = readDiagramHeader(source);
    expect(header.diagnostics).toEqual([]);
    expect(header.timescale).toBe('monthly');
    expect(header.sourceWithoutDirective).not.toContain('timescale:');
    const result = await executeDiagramSource(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned).toMatchObject({ timescale: 'monthly' });
  });

  it('supports calendar cadence aliases and canonicalizes half-year spelling', async () => {
    const source = 'diagram: gantt\npage: 13.333in x 7.5in\ncalendar: half a year\ntask "A" as a start 2026-01-01 duration 5d';
    const result = await executeDiagramSource(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned).toMatchObject({ timescale: 'halfyear' });
    expect((result.positioned as { width: number }).width).toBeCloseTo(1279.968, 3);
  });

  it('rejects malformed or non-Gantt visual timescales', () => {
    expect(readDiagramHeader('diagram: gantt\ntimescale: yearly\ntask "A" as a start 2026-01-01 duration 1d').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'malformed_timescale' }),
    ]));
    expect(readDiagramHeader('diagram: flowchart\ntimescale: monthly\nbox "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'timescale_wrong_family' }),
    ]));
  });

  it('reports conflicting calendar and timescale directives', async () => {
    const result = await executeDiagramSource('diagram: gantt\ntimescale: monthly\ncalendar: quarterly\ntask "A" as a start 2026-01-01 duration 1d');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'conflicting_timescale' }),
    ]));
  });

  it('supports strict fitting and reports when content would become unreadable', async () => {
    const source = [
      'page: 6in x 9in',
      'fit: strict',
      'positioning: manual',
      '',
      'task "A" as a at (0, 0)',
      'task "B" as b at (5000, 0)',
      'a -> b',
    ].join('\n');
    const result = await executeDiagramSource(source);
    expect(result.svg).toBeNull();
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'page_too_dense', severity: 'error' }),
    ]));
    const validation = await validateDiagramSource(source);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'page_too_dense' }),
    ]));
  });

  it('rejects malformed and inconsistent page directives', () => {
    expect(readDiagramHeader('page: 6cm x 9in\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'malformed_page' }),
    ]));
    expect(readDiagramHeader('fit: strict\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'fit_without_page' }),
    ]));
  });

  it('reads and strips the explicit live-render mode directive', () => {
    const header = readDiagramHeader('render: auto\ntask "A" as a');
    expect(header.renderMode).toBe('auto');
    expect(header.sourceWithoutDirective).toBe('\ntask "A" as a');
    expect(readDiagramHeader('render: manual\ntask "A" as a').renderMode).toBe('manual');
    expect(readDiagramHeader('render: sometimes\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'malformed_render' }),
    ]));
  });

  it('fits every registered family through the common SVG page wrapper', async () => {
    const sources = [
      'page: 6 x 9\ntask "A" as a',
      'diagram: mindmap\npage: 6 x 9\nmindmap "Root" as root',
      'diagram: flowchart\npage: 6 x 9\nbox "A" as a',
      'diagram: architecture\npage: 6 x 9\nsystem "A" as a',
      'diagram: gantt\npage: 6 x 9\ntask "A" as a start 2026-01-01 duration 1d',
    ];
    for (const source of sources) {
      const result = await executeDiagramSource(source);
      expect(result.diagnostics, source).toEqual([]);
      expect(result.svg, source).toContain('width="6in" height="9in" viewBox="0 0 576 864"');
    }
  });
});
