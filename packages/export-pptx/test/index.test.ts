import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { canvasFontSize, exportPptx, familyAdapters, projectionFor, snapshotFromRuntime, PptxExportError, type PositionedSnapshot } from '../src/index.js';

const snapshot: PositionedSnapshot = { family: 'flowchart', width: 500, height: 300, nodes: [{ id: 'a', label: 'Safe < & " text', x: 20, y: 20, width: 120, height: 50, shape: 'roundRect' }, { id: 'b', label: 'B', x: 300, y: 180, width: 80, height: 40, shape: 'ellipse' }], edges: [{ id: 'e', source: 'a', target: 'b', label: 'connect', points: [{ x: 80, y: 45 }, { x: 340, y: 200 }] }] };

function zipEntry(bytes: Uint8Array, entryName: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('PPTX end-of-central-directory record is missing');
  const entries = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0; i < entries; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('PPTX central directory is malformed');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localOffset = view.getUint32(cursor + 42, true);
    if (name === entryName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('PPTX local file header is malformed');
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      const content = method === 8 ? inflateRawSync(compressed) : compressed;
      return decoder.decode(content);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`PPTX entry ${entryName} is missing`);
}

describe('@bpm/export-pptx', () => {
  it('scales editable text with the same projection as diagram geometry', () => {
    const projection = projectionFor(1000, 500, 'LAYOUT_WIDE');
    expect(projection.scale).toBeGreaterThan(0);
    expect(canvasFontSize(13, projection.scale, 0)).toBeGreaterThan(0);
    expect(canvasFontSize(13, projection.scale / 4, 0)).toBeCloseTo(canvasFontSize(13, projection.scale, 0) / 4, 2);
    expect(canvasFontSize(13, 0.001)).toBe(5);
  });

  it('projects a declared 6 x 9 page without changing its portrait ratio', () => {
    const projection = projectionFor(1000, 500, 'LAYOUT_WIDE', { width: 6, height: 9, unit: 'in', fit: 'contain' });
    expect(projection.page).toEqual({ w: 6, h: 9 });
    expect(projection.scale).toBeCloseTo(0.0055, 4);
  });

  it('uses scaled font sizes and PowerPoint dashType for editable mappings', () => {
    const textCalls: Array<Record<string, unknown>> = [];
    const connectorCalls: Array<Record<string, unknown>> = [];
    familyAdapters.flowchart.map(
      { ...snapshot, edges: [{ ...snapshot.edges[0], style: { dash: 'dash' } }] },
      {
        addShape() {},
        addText(_text, options) { textCalls.push(options); },
        addConnector(options) { connectorCalls.push(options); },
      },
      {},
    );
    expect(textCalls[0].fontSize).toBeGreaterThan(0);
    expect(connectorCalls[0].line).toMatchObject({ dashType: 'dash' });
  });

  it('converts flowchart runtime geometry into a typed editable snapshot', () => {
    const converted = snapshotFromRuntime({
      family: 'flowchart',
      positioned: {
        width: 420,
        height: 240,
        nodes: [{ id: 'start', kind: 'event', label: 'Start', x: 10, y: 20, width: 80, height: 40 }],
        edges: [{ id: 'e1', from: 'start', to: 'start', points: [{ x: 50, y: 40 }, { x: 50, y: 40 }] }],
      },
    });
    expect(converted).toMatchObject({ family: 'flowchart', width: 420, height: 240 });
    expect(converted.nodes[0]).toMatchObject({ id: 'start', shape: 'ellipse', label: 'Start' });
    expect(converted.edges[0]).toMatchObject({ source: 'start', target: 'start' });
  });

  it('walks the nested mindmap root when creating an editable snapshot', () => {
    const converted = snapshotFromRuntime({
      family: 'mindmap',
      positioned: {
        width: 520,
        height: 80,
        root: { id: 'root', label: 'Root', x: 0, y: 20, width: 100, height: 40, children: [{ id: 'child', label: 'Child', x: 300, y: 20, width: 100, height: 40, children: [] }] },
        edges: [{ from: 'root', to: 'child', points: [{ x: 100, y: 40 }, { x: 300, y: 40 }] }],
      },
    });
    expect(converted.nodes).toHaveLength(2);
    expect(converted.nodes.map((node) => node.id)).toEqual(['root', 'child']);
    expect(converted.nodes[0].shape).toBe('roundRect');
    expect(converted.edges[0]).toMatchObject({ source: 'root', target: 'child' });
  });

  it('preserves Gantt rows, milestones, dependencies, and axis labels', () => {
    const converted = snapshotFromRuntime({
      family: 'gantt',
      positioned: {
        width: 700,
        height: 260,
        rows: [
          { id: 'phase', kind: 'group', label: 'Phase', x: 0, y: 0, width: 700, height: 28 },
          { id: 'release', kind: 'task', label: 'Release', x: 280, y: 40, width: 100, height: 26, milestone: true },
        ],
        dependencies: [{ id: 'd1', from: 'release', to: 'release', points: [{ x: 380, y: 50 }, { x: 280, y: 50 }] }],
        ticks: [{ date: '2026-09-01', x: 280, y: 0, label: '09-01', major: true }],
      },
    });
    expect(converted.nodes).toHaveLength(2);
    expect(converted.nodes[1]).toMatchObject({ id: 'release', shape: 'diamond' });
    expect(converted.edges[0]).toMatchObject({ source: 'release', target: 'release' });
    expect((converted as { axisLabels?: unknown[] }).axisLabels).toEqual([{ label: '09-01', x: 280, y: 18 }]);
  });

  it('rejects a missing positioned runtime result', () => {
    expect(() => snapshotFromRuntime({ family: 'mindmap', positioned: null })).toThrowError(/positioned diagram/);
  });

  it('rejects missing endpoints and oversized snapshots structurally', async () => {
    await expect(exportPptx({ ...snapshot, edges: [{ id: 'bad', source: 'a', target: 'missing' }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportPptx({ ...snapshot, width: 10001 })).rejects.toMatchObject({ code: 'LIMIT' });
  });
  it('exports a labeled diagram and reports when projected text may be too small on one slide', async () => {
    const tooDense: PositionedSnapshot = {
      family: 'flowchart', width: 10000, height: 10000,
      nodes: [{ id: 'a', label: 'Too small', x: 0, y: 0, width: 80, height: 40 }], edges: [],
    };
    const warnings: NonNullable<Parameters<typeof exportPptx>[1]>['warnings'] = [];
    const bytes = await exportPptx(tooDense, { warnings });
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(warnings).toEqual([expect.objectContaining({ code: 'editable_text_density', nodeId: 'a', severity: 'warning' })]);
  });
  it('produces a non-empty OOXML package when pptxgenjs is installed', async () => {
    const bytes = await exportPptx(snapshot, { deterministic: true }); expect(bytes.byteLength).toBeGreaterThan(100); expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
  });

  it('keeps editable OOXML geometry and projected font size aligned', async () => {
    const wide: PositionedSnapshot = {
      ...snapshot,
      width: 1200,
      height: 400,
      nodes: [{ ...snapshot.nodes[0], width: 240, height: 80 }],
      edges: [],
    };
    const bytes = await exportPptx(wide, { deterministic: true });
    const slideXml = zipEntry(bytes, 'ppt/slides/slide1.xml');
    const scale = projectionFor(wide.width, wide.height, 'LAYOUT_WIDE').scale;
    const expectedFontSize = Math.round(canvasFontSize(13, scale, 5) * 100);
    expect(slideXml).toContain('<p:sp>');
    expect(slideXml).toContain('Safe &lt; &amp;');
    expect(slideXml).toContain(`sz="${expectedFontSize}"`);
    expect(slideXml).toMatch(/<a:off x="\d+" y="\d+"\/><a:ext cx="\d+" cy="\d+"\/>/);
  });

  it('writes a declared page size into the actual PowerPoint slide layout', async () => {
    const page = { width: 6, height: 9, unit: 'in' as const, fit: 'contain' as const };
    const bytes = await exportPptx({ ...snapshot, page }, { deterministic: true });
    const presentationXml = zipEntry(bytes, 'ppt/presentation.xml');
    expect(presentationXml).toContain('<p:sldSz cx="5486400" cy="8229600"');
  });

  it('rejects an over-dense ordinary scene when PPTX fit is strict', async () => {
    const page = { width: 6, height: 9, unit: 'in' as const, fit: 'strict' as const };
    const tooDense: PositionedSnapshot = {
      family: 'flowchart', width: 10000, height: 10000, page,
      nodes: [{ id: 'dense', label: 'Dense', x: 0, y: 0, width: 80, height: 40 }], edges: [],
    };
    await expect(exportPptx(tooDense)).rejects.toMatchObject({
      code: 'INVALID',
      message: expect.stringContaining('fit: strict'),
    });
  });

  it('keeps over-dense contain exports non-blocking and reports page scale', async () => {
    const warnings: NonNullable<Parameters<typeof exportPptx>[1]>['warnings'] = [];
    const tooDense: PositionedSnapshot = {
      family: 'flowchart', width: 10000, height: 10000,
      page: { width: 6, height: 9, unit: 'in', fit: 'contain' },
      nodes: [{ id: 'dense', label: 'Dense', x: 0, y: 0, width: 80, height: 40 }], edges: [],
    };
    const bytes = await exportPptx(tooDense, { warnings, deterministic: true });
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'page_scale', severity: 'warning', scale: expect.any(Number) }),
    ]));
  });

  it('exports each shared paginated BPMN page as editable native slide content', async () => {
    const paginated = {
      mode: 'semantic' as const,
      pageSpec: { width: 6, height: 9, unit: 'in' as const, fit: 'strict' as const },
      sourceWidth: 576,
      sourceHeight: 864,
      pages: [
        {
          pageNumber: 1, width: 576, height: 864, title: 'Order flow',
          containers: [{ id: 'pool', kind: 'pool', x: 0, y: 0, width: 576, height: 864 }],
          nodes: [{ id: 'a', kind: 'activity', label: 'Approve order', x: 120, y: 160, width: 180, height: 60 }],
          edges: [], continuations: [{ kind: 'node' as const, sourcePage: 1, targetPage: 2, nodeIds: ['a'] }],
        },
        {
          pageNumber: 2, width: 576, height: 864, title: 'Order flow',
          containers: [{ id: 'pool', kind: 'pool', x: 0, y: 0, width: 576, height: 864 }],
          nodes: [{ id: 'b', kind: 'activity', label: 'Ship order', x: 120, y: 160, width: 180, height: 60 }],
          edges: [], continuations: [{ kind: 'node' as const, sourcePage: 1, targetPage: 2, nodeIds: ['a'] }],
        },
      ],
    };
    const bytes = await exportPptx({ ...snapshot, family: 'bpmn', paginated }, { deterministic: true });
    const presentationXml = zipEntry(bytes, 'ppt/presentation.xml');
    expect((presentationXml.match(/<p:sldId /g) ?? []).length).toBe(2);
    const first = zipEntry(bytes, 'ppt/slides/slide1.xml');
    const second = zipEntry(bytes, 'ppt/slides/slide2.xml');
    expect(first).toContain('Approve order');
    expect(first).toContain('Page 1 of 2');
    expect(first).toContain('continues on page 2');
    expect(second).toContain('Ship order');
    expect(second).toContain('continued from page 1');
    expect(first).toContain('<p:sp>');
    expect(first).not.toContain('<p:pic>');
  });

  it('writes paginated PPTX when pagination diagnostics are warnings only', async () => {
    const warnings: NonNullable<Parameters<typeof exportPptx>[1]>['warnings'] = [];
    const paginated = {
      mode: 'semantic' as const, sourceWidth: 1000, sourceHeight: 1000,
      pages: [{ pageNumber: 1, width: 100, height: 100, nodes: [{ id: 'a', kind: 'task', label: 'Dense', x: 0, y: 0, width: 100, height: 20 }], edges: [], continuations: [], warnings: ['review readability'] }],
    };
    const bytes = await exportPptx({ ...snapshot, paginated }, { warnings, deterministic: true });
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'page_scale', severity: 'warning' })]));
  });

  it('rejects a strict paginated page below the shared readability threshold', async () => {
    const paginated = {
      mode: 'semantic' as const,
      pageSpec: { width: 6, height: 9, unit: 'in' as const, fit: 'strict' as const },
      sourceWidth: 1000,
      sourceHeight: 1000,
      pages: [{
        pageNumber: 1, width: 576, height: 864, readabilityScale: 0.1,
        nodes: [{ id: 'a', kind: 'task', label: 'Dense', x: 0, y: 0, width: 100, height: 20 }],
        edges: [], continuations: [], warnings: ['review readability'],
      }],
    };
    await expect(exportPptx({ ...snapshot, paginated })).rejects.toMatchObject({
      code: 'INVALID',
      message: expect.stringContaining('page 1'),
    });
  });

  it('rejects impossible paginated page geometry clearly', async () => {
    const paginated = { mode: 'semantic' as const, sourceWidth: 100, sourceHeight: 100, pages: [{ pageNumber: 1, width: 0, height: 100, nodes: [], edges: [], continuations: [] }] };
    await expect(exportPptx({ ...snapshot, paginated })).rejects.toMatchObject({ code: 'INVALID', message: expect.stringContaining('impossible dimensions') });
  });

  it('preserves swimlane rectangles and labels in the editable PowerPoint snapshot', async () => {
    const converted = snapshotFromRuntime({
      family: 'bpmn',
      positioned: {
        width: 420,
        height: 220,
        pools: [{ id: 'pool', name: 'Pool', x: 0, y: 0, width: 420, height: 220, lanes: [{ id: 'lane', name: 'Operations', x: 0, y: 0, width: 420, height: 110 }] }],
        nodes: [{ id: 'a', kind: 'activity', label: 'Task', x: 80, y: 40, width: 100, height: 40 }],
        edges: [],
      },
    });
    expect(converted.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pool', kind: 'pool' }),
      expect.objectContaining({ id: 'lane', kind: 'lane', label: 'Operations' }),
    ]));
    const bytes = await exportPptx(converted, { deterministic: true });
    expect(zipEntry(bytes, 'ppt/slides/slide1.xml')).toContain('Operations');
  });

  it('keeps gantt objects separate', async () => {
    const bytes = await exportPptx({ family: 'gantt', width: 600, height: 300, nodes: [], edges: [], tasks: [{ id: 't', label: 'Task', x: 100, y: 80, width: 140, height: 20 }, { id: 'm', label: 'Milestone', x: 300, y: 80, width: 20, height: 20, milestone: true }], axisLabels: [{ label: '2026-09', x: 100, y: 20 }] } as never); expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it('paginates wide Gantt timelines and keeps labels in the label column', async () => {
    const bytes = await exportPptx({
      family: 'gantt', width: 2100, height: 470,
      nodes: [
        { id: 'mobilize', kind: 'group', label: '1. Mobilize and Baseline', x: 0, y: 54, width: 2060, height: 28 },
        { id: 'baseline', kind: 'task', label: 'Confirm AS-IS baseline', x: 260, y: 82, width: 168, height: 26 },
        { id: 'scope', kind: 'task', label: 'Approve transformation scope', x: 572, y: 184, width: 72, height: 26 },
      ],
      edges: [{ id: 'e1', source: 'baseline', target: 'scope', points: [{ x: 428, y: 95 }, { x: 520, y: 95 }, { x: 520, y: 197 }, { x: 572, y: 197 }] }],
      tasks: [{ id: 'baseline', label: 'Confirm AS-IS baseline', x: 260, y: 82, width: 168, height: 26, progress: 50 }],
      axisLabels: [{ label: '09-01', x: 260, y: 18 }, { label: '09-08', x: 428, y: 18 }, { label: '10-01', x: 1000, y: 18 }, { label: '11-01', x: 1720, y: 18 }],
    } as never, { deterministic: true });
    const presentationXml = zipEntry(bytes, 'ppt/presentation.xml');
    expect((presentationXml.match(/<p:sldId /g) ?? []).length).toBeGreaterThan(1);
    const firstSlideXml = zipEntry(bytes, 'ppt/slides/slide1.xml');
    expect(firstSlideXml).toContain('1. Mobilize and Baseline');
    expect(firstSlideXml).toContain('Confirm AS-IS baseline');
  });

  it('rejects an over-dense Gantt instead of silently paginating strict fit', async () => {
    const rows = [{ id: 'task', kind: 'task', label: 'Long project', x: 260, y: 54, width: 9600, height: 26 }];
    await expect(exportPptx({
      family: 'gantt', width: 10000, height: 300, nodes: rows, edges: [], tasks: rows,
      axisLabels: [{ label: 'Start', x: 260, y: 18 }, { label: 'End', x: 9860, y: 18 }],
      page: { width: 13.333, height: 7.5, unit: 'in', fit: 'strict' },
    } as never)).rejects.toMatchObject({
      code: 'INVALID',
      message: expect.stringContaining('fit: strict'),
    });
  });

  it('keeps a compressed monthly Gantt timeline on one declared 16:9 slide', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `row-${index}`, kind: 'task', label: `Phase ${index + 1}`, x: 260 + index * 18, y: 54 + index * 34, width: 120 + index * 4, height: 26 }));
    const bytes = await exportPptx({
      family: 'gantt', width: 540, height: 482, nodes: rows, edges: [],
      tasks: rows.map((row) => ({ ...row })),
      axisLabels: [{ label: '2026-09', x: 260, y: 18 }, { label: '2027-03', x: 500, y: 18 }],
      page: { width: 13.333, height: 7.5, unit: 'in', fit: 'strict' },
    } as never, { deterministic: true });
    const presentationXml = zipEntry(bytes, 'ppt/presentation.xml');
    expect((presentationXml.match(/<p:sldId /g) ?? []).length).toBe(1);
  });
});
