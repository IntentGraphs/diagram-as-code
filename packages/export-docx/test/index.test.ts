import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DOCX_EXPORT_LIMITS, exportDocx, DocxExportError } from '../src/index.js';
import type { PaginatedScene } from '@bpm/diagram-core';

function scene(pageCount = 2): PaginatedScene {
  return {
    mode: 'semantic', sourceWidth: 600, sourceHeight: 400,
    pageSpec: { width: 8, height: 6, unit: 'in', fit: 'contain' },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1, width: 768, height: 576,
      title: 'Order process',
      containers: [],
      nodes: [{ id: `task-${index}`, kind: 'activity', label: `Task ${index + 1}`, x: 120, y: 100, width: 160, height: 60 }],
      edges: [], continuations: pageCount > 1 && index < 2 ? [{ kind: 'node', sourcePage: 1, targetPage: 2, nodeIds: ['task-0'] }] : [],
    })),
  };
}

function zipEntry(bytes: Uint8Array, name: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let cursor = view.getUint32(bytes.length - 6, true); // EOCD central-directory offset
  const count = view.getUint16(bytes.length - 12, true); const decoder = new TextDecoder();
  for (let i = 0; i < count; i += 1) { const method = view.getUint16(cursor + 10, true); const size = view.getUint32(cursor + 20, true); const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true); const entryName = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)); const local = view.getUint32(cursor + 42, true); if (entryName === name) { const localNameLength = view.getUint16(local + 26, true); const localExtraLength = view.getUint16(local + 28, true); const data = bytes.slice(local + 30 + localNameLength + localExtraLength, local + 30 + localNameLength + localExtraLength + size); return decoder.decode(method === 8 ? inflateRawSync(data) : data); } cursor += 46 + nameLength + extraLength + commentLength; }
  throw new Error(`Missing ZIP entry ${name}`);
}

describe('@bpm/export-docx', () => {
  it('writes one Word page and one embedded scene per PaginatedScene page', async () => {
    const bytes = await exportDocx(scene()); const document = zipEntry(bytes, 'word/document.xml');
    expect((document.match(/w:type="page"/g) ?? []).length).toBe(1);
    expect((document.match(/<wp:inline/g) ?? []).length).toBe(2);
    expect((document.match(/Page [12] of 2/g) ?? []).length).toBe(2);
    expect(document).not.toContain('w:type="oddPage"');
  });

  it('preserves declared page dimensions in Word twips', async () => {
    const document = zipEntry(await exportDocx(scene()), 'word/document.xml');
    expect(document).toContain('<w:pgSz w:w="11520" w:h="8640"');
  });

  it('allows equal intrinsic page dimensions without a common page spec', async () => {
    const value = scene(); value.pageSpec = undefined;
    await expect(exportDocx(value)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('requires a common page spec for unequal intrinsic page dimensions', async () => {
    const value = scene(); value.pageSpec = undefined; value.pages[1].width = 900;
    await expect(exportDocx(value)).rejects.toMatchObject({
      code: 'INVALID',
      message: expect.stringContaining('common page directive'),
    });
  });

  it('allows unequal compatible pages when a common page spec is explicit', async () => {
    const value = scene(); value.pages[1].width = 900; value.pages[1].height = 675;
    await expect(exportDocx(value)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects unequal pages with an incompatible aspect ratio', async () => {
    const value = scene(); value.pages[1].width = 900;
    await expect(exportDocx(value)).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('emits stable titles, continuation markers, and no blank page', async () => {
    const bytes = await exportDocx(scene()); const document = zipEntry(bytes, 'word/document.xml');
    expect(document).toContain('Order process — Page 1 of 2 — Continues on page 2');
    expect(document).toContain('Order process — Page 2 of 2');
    expect(document).not.toContain('Page 3');
    expect(zipEntry(bytes, 'word/media/page-1.svg')).toContain('Task 1');
    expect(zipEntry(bytes, 'word/media/page-2.svg')).toContain('Task 2');
  });

  it('fails clearly for invalid scenes', async () => {
    await expect(exportDocx({ ...scene(), pages: [] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportDocx({ ...scene(), pages: [{ ...scene().pages[0], nodes: [], edges: [], containers: [] }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportDocx({ ...scene(), pages: [{ ...scene().pages[0], width: 0 }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportDocx({ ...scene(), pages: [{ ...scene().pages[0], nodes: [{ ...scene().pages[0].nodes[0], width: Number.NaN }] }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportDocx({ ...scene(), pages: [{ ...scene().pages[0], edges: [{ id: 'bad', source: 'task-0', target: 'task-0', points: [{ x: 1, y: Number.POSITIVE_INFINITY }] }] }] })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(exportDocx(scene(), { family: 'bpmn' })).resolves.toBeInstanceOf(Uint8Array);
    expect(DocxExportError).toBeDefined();
  });

  it('enforces page and aggregate content limits', async () => {
    await expect(exportDocx(scene(DOCX_EXPORT_LIMITS.maxPages + 1))).rejects.toMatchObject({ code: 'LIMIT' });
    const oversized = scene(); oversized.pages[0].nodes = [scene().pages[0].nodes[0], ...Array.from({ length: DOCX_EXPORT_LIMITS.maxNodes }, (_, i) => ({ id: `n-${i}`, kind: 'activity', label: 'x', x: 1, y: 1, width: 2, height: 2 }))];
    await expect(exportDocx(oversized)).rejects.toMatchObject({ code: 'LIMIT' });
    const hugeLabel = scene(1); hugeLabel.pages[0].nodes[0].label = 'x'.repeat(DOCX_EXPORT_LIMITS.maxSvgBytes);
    await expect(exportDocx(hugeLabel)).rejects.toMatchObject({ code: 'LIMIT' });
  });

  it('rejects page sizes that cannot contain the heading and image', async () => {
    await expect(exportDocx({ ...scene(), pageSpec: { width: 8, height: 0.55, unit: 'in', fit: 'contain' } })).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('XML-escapes non-ASCII labels and documents vector-backed semantics', async () => {
    const value = scene(1); value.pages[0].nodes[0].label = '注文 & Prüfung <1>';
    const bytes = await exportDocx(value); const svg = zipEntry(bytes, 'word/media/page-1.svg');
    expect(svg).toContain('注文 &amp; Prüfung &lt;1&gt;');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(zipEntry(bytes, '[Content_Types].xml')).toContain('image/svg+xml');
    expect(zipEntry(bytes, 'word/document.xml')).not.toContain('nativeShape');
  });

  it('removes invalid XML control characters from labels', async () => {
    const value = scene(1); value.pages[0].nodes[0].label = 'Task\u0001 label';
    const bytes = await exportDocx(value);
    const svg = zipEntry(bytes, 'word/media/page-1.svg');
    expect(svg).toContain('Task� label');
    expect([...new TextEncoder().encode(svg)]).not.toContain(0x01);
  });
});
