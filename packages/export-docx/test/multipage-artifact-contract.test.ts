import { describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import { exportDocx } from '../src/index.js';
import type { PaginatedScene } from '@bpm/diagram-core';

function zipEntries(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('missing ZIP end record');
  const count = view.getUint16(end + 10, true); let cursor = view.getUint32(end + 16, true);
  const decoder = new TextDecoder(); const result = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('malformed ZIP central directory');
    const method = view.getUint16(cursor + 10, true); const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength)); const local = view.getUint32(cursor + 42, true);
    const localNameLength = view.getUint16(local + 26, true); const localExtraLength = view.getUint16(local + 28, true);
    const data = bytes.slice(local + 30 + localNameLength + localExtraLength, local + 30 + localNameLength + localExtraLength + size);
    result.set(name, decoder.decode(method === 8 ? inflateRawSync(data) : data)); cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

function parseXml(value: string): void {
  const parser = new SaxesParser({ xmlns: true }); parser.on('error', (error) => { throw error; }); parser.write(value).close();
}

const scene: PaginatedScene = {
  mode: 'semantic', sourceWidth: 768, sourceHeight: 576,
  pageSpec: { width: 8, height: 6, unit: 'in', fit: 'contain' },
  pages: [1, 2].map((pageNumber) => ({ pageNumber, width: 768, height: 576, title: '流程 & Prüfung', containers: [],
    nodes: [{ id: `node-${pageNumber}`, kind: 'activity', label: `注文 & <${pageNumber}>`, x: 120, y: 100, width: 220, height: 60 }], edges: [], continuations: [] })),
};

describe('DOCX multipage artifact contract', () => {
  it('contains one parseable SVG and page relationship per semantic page', async () => {
    const files = zipEntries(await exportDocx(scene));
    expect(files.has('word/document.xml')).toBe(true);
    expect(files.has('word/_rels/document.xml.rels')).toBe(true);
    expect((files.get('word/document.xml')!.match(/<wp:inline/g) ?? []).length).toBe(2);
    for (const page of scene.pages) {
      const svg = files.get(`word/media/page-${page.pageNumber}.svg`)!;
      expect(svg).toBeTruthy(); parseXml(svg);
      const viewport = svg.match(/<svg[^>]+width="([\d.]+)"[^>]+height="([\d.]+)"[^>]+viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      expect(viewport).not.toBeNull();
      expect(Number(viewport![1])).toBeGreaterThan(0); expect(Number(viewport![2])).toBeGreaterThan(0);
      expect(svg).toContain('注文 &amp; &lt;');
    }
  });
});
