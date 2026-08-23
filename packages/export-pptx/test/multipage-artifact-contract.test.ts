import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { exportPptx, type PositionedSnapshot } from '../src/index.js';

function entries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('missing ZIP end record');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const result = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('malformed ZIP central directory');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const local = view.getUint32(cursor + 42, true);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error('malformed ZIP local header');
    const localNameLength = view.getUint16(local + 26, true);
    const localExtraLength = view.getUint16(local + 28, true);
    const start = local + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(start, start + compressedSize);
    result.set(name, method === 8 ? new Uint8Array(inflateRawSync(compressed)) : compressed);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

const paginated: PositionedSnapshot = {
  family: 'bpmn', width: 576, height: 864,
  paginated: {
    mode: 'semantic', pageSpec: { width: 6, height: 9, unit: 'in', fit: 'contain' },
    sourceWidth: 576, sourceHeight: 864,
    pages: [1, 2].map((pageNumber) => ({
      pageNumber, width: 576, height: 864, title: '注文 & Prüfung <流程>',
      containers: [{ id: `pool-${pageNumber}`, kind: 'pool', x: 0, y: 0, width: 576, height: 864 }],
      nodes: [
        { id: `task-${pageNumber}`, kind: 'activity', label: `审核 & <${pageNumber}>`, x: 120, y: 160, width: 220, height: 70 },
        { id: `result-${pageNumber}`, kind: 'activity', label: 'Result', x: 120, y: 320, width: 220, height: 70 },
      ],
      edges: [{ id: `edge-${pageNumber}`, sourceId: `task-${pageNumber}`, targetId: `result-${pageNumber}`, points: [{ x: 230, y: 230 }, { x: 230, y: 320 }] }], continuations: [],
    })),
  }, nodes: [], edges: [],
};

describe('PPTX multipage artifact contract', () => {
  it('has one structurally readable, correctly sized editable slide per page', async () => {
    const bytes = await exportPptx(paginated, { deterministic: true });
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
    const files = entries(bytes);
    const presentation = new TextDecoder().decode(files.get('ppt/presentation.xml'));
    expect((presentation.match(/<p:sldId /g) ?? []).length).toBe(paginated.paginated?.pages.length);
    expect(presentation).toContain('<p:sldSz cx="5486400" cy="8229600"');
    for (const page of paginated.paginated?.pages ?? []) {
      const slide = new TextDecoder().decode(files.get(`ppt/slides/slide${page.pageNumber}.xml`));
      expect(slide).toContain('<p:sp>');
      expect(slide).toMatch(/<a:prstGeom prst="line">/);
      expect(slide).toContain('审核 &amp; &lt;');
      expect(slide).toContain('Page ' + page.pageNumber + ' of 2');
    }
  });

  it('keeps warning-only pagination export successful', async () => {
    const warnings: NonNullable<Parameters<typeof exportPptx>[1]>['warnings'] = [];
    const scene = { ...paginated, paginated: { ...paginated.paginated!, pages: paginated.paginated!.pages.map((page) => ({ ...page, warnings: ['review readability'] })) } };
    await expect(exportPptx(scene, { warnings, deterministic: true })).resolves.toBeInstanceOf(Uint8Array);
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning' })]));
  });
});
