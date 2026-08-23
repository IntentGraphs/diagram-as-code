import { describe, expect, it, beforeAll } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SaxesParser } from 'saxes';
import { DOCX_EXPORT_LIMITS, exportDocx, type DocxOptions } from '../src/index.js';
import type { PaginatedScene } from '@bpm/diagram-core';

/**
 * Artifact-level cross-export contract for multi-page DOCX (roadmap 18m, P0
 * "real PPTX/DOCX consumer checks"). This writes an actual .docx file,
 * unzips it, and independently parses every embedded page SVG as XML. It
 * does not open the file in Word or another real consumer; see the report
 * for that limitation.
 */

const PAGE_SPEC = { width: 11, height: 8.5, unit: 'in' as const, fit: 'contain' as const };
const PAGE_WIDTH_PX = 1056; // 11in * 96
const PAGE_HEIGHT_PX = 816; // 8.5in * 96

const REVIEW_LABEL = 'Review order — 検証 <urgent> "priority" & \'confirm\'\nSecond line: escalate immediately if the review deadline has passed and notify the operations lane supervisor without delay.';
const SHIP_LABEL = 'Ship & deliver order <fragile>\n配送 — confirm "handle with care" before dispatch.';

function twoPageBpmnScene(): PaginatedScene {
  return {
    mode: 'semantic',
    pageSpec: PAGE_SPEC,
    sourceWidth: 2000,
    sourceHeight: 1400,
    pages: [
      {
        pageNumber: 1, width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX, title: 'Order fulfillment',
        containers: [
          { id: 'pool', kind: 'pool', x: 0, y: 0, width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX },
          { id: 'lane-ops', kind: 'lane', x: 0, y: 0, width: PAGE_WIDTH_PX, height: 400 },
        ],
        nodes: [
          { id: 'start', kind: 'event', label: 'Begin', x: 40, y: 60, width: 60, height: 60 },
          { id: 'review', kind: 'activity', label: REVIEW_LABEL, x: 150, y: 40, width: 260, height: 100 },
          { id: 'gw1', kind: 'gateway', label: 'OK?', x: 460, y: 60, width: 60, height: 60 },
        ],
        edges: [
          { id: 'e1', sourceId: 'start', targetId: 'review', points: [{ x: 100, y: 90 }, { x: 150, y: 90 }] },
          { id: 'e2', sourceId: 'review', targetId: 'gw1', points: [{ x: 410, y: 90 }, { x: 460, y: 90 }] },
          { id: 'cross', sourceId: 'gw1', targetId: 'ship', points: [{ x: 520, y: 90 }, { x: PAGE_WIDTH_PX, y: 90 }] },
        ],
        continuations: [{ kind: 'both', sourcePage: 1, targetPage: 2, nodeIds: ['gw1', 'ship'], edgeIds: ['cross'] }],
      },
      {
        pageNumber: 2, width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX, title: 'Order fulfillment',
        containers: [
          { id: 'pool', kind: 'pool', x: 0, y: 0, width: PAGE_WIDTH_PX, height: PAGE_HEIGHT_PX },
          { id: 'lane-ops', kind: 'lane', x: 0, y: 0, width: PAGE_WIDTH_PX, height: 400 },
        ],
        nodes: [
          { id: 'ship', kind: 'activity', label: SHIP_LABEL, x: 0, y: 60, width: 240, height: 100 },
          { id: 'end', kind: 'event', label: 'Done', x: 900, y: 60, width: 60, height: 60 },
        ],
        edges: [
          { id: 'cross', sourceId: 'gw1', targetId: 'ship', points: [{ x: 0, y: 90 }, { x: 240, y: 90 }] },
          { id: 'e3', sourceId: 'ship', targetId: 'end', points: [{ x: 240, y: 90 }, { x: 900, y: 90 }] },
        ],
        continuations: [{ kind: 'both', sourcePage: 1, targetPage: 2, nodeIds: ['gw1', 'ship'], edgeIds: ['cross'] }],
      },
    ],
  };
}

function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('missing ZIP end-of-central-directory record');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const result = new Map<string, Uint8Array>();
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

interface ParsedSvg { width: number; height: number; viewBox: number[]; elements: string[]; texts: string[]; }

/** Parses one embedded page SVG independently as XML (structural well-formedness + content extraction). */
function parseSvg(svg: string): ParsedSvg {
  const parser = new SaxesParser({ xmlns: false });
  let width = 0; let height = 0; let viewBox: number[] = [];
  const elements: string[] = []; const texts: string[] = [];
  parser.on('opentag', (tag) => {
    elements.push(tag.name);
    if (tag.name === 'svg') {
      width = Number((tag.attributes as Record<string, string>).width);
      height = Number((tag.attributes as Record<string, string>).height);
      viewBox = String((tag.attributes as Record<string, string>).viewBox).trim().split(/\s+/).map(Number);
    }
  });
  parser.on('text', (value) => { if (value.trim()) texts.push(value); });
  parser.write(svg).close();
  return { width, height, viewBox, elements, texts };
}

async function tempDocxPath(prefix: string): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return path.join(dir, 'diagram.docx');
}

/** Attempts export then a real file write, mirroring how a CLI/consumer would use exportDocx. */
async function attemptWrite(scene: PaginatedScene, options: DocxOptions, target: string): Promise<{ wrote: boolean; error?: unknown }> {
  try {
    const bytes = await exportDocx(scene, options);
    writeFileSync(target, bytes);
    return { wrote: true };
  } catch (error) {
    return { wrote: false, error };
  }
}

describe('DOCX multi-page consumer contract (18m)', () => {
  let filePath: string;
  let onDisk: Uint8Array;
  let files: Map<string, Uint8Array>;
  let text: (name: string) => string;
  let svgs: ParsedSvg[];

  beforeAll(async () => {
    filePath = await tempDocxPath('bpm-docx-contract-');
    const bytes = await exportDocx(twoPageBpmnScene());
    writeFileSync(filePath, bytes);
    onDisk = readFileSync(filePath);
    files = zipEntries(onDisk);
    text = (name) => new TextDecoder().decode(files.get(name) ?? new Uint8Array());
    svgs = [text('word/media/page-1.svg'), text('word/media/page-2.svg')].map(parseSvg);
  });

  it('exports successfully to a real temporary file and produces a structurally readable ZIP', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(onDisk.subarray(0, 2).toString()).toBe('PK');
    expect(files.has('[Content_Types].xml')).toBe(true);
    expect(files.has('word/document.xml')).toBe(true);
    expect(files.has('word/_rels/document.xml.rels')).toBe(true);
  });

  it('embeds exactly one SVG per semantic page', () => {
    expect(files.has('word/media/page-1.svg')).toBe(true);
    expect(files.has('word/media/page-2.svg')).toBe(true);
    expect(files.has('word/media/page-3.svg')).toBe(false);
    expect((text('word/document.xml').match(/<wp:inline/g) ?? []).length).toBe(2);
  });

  it('parses every embedded page SVG independently as well-formed XML', () => {
    expect(() => parseSvg(text('word/media/page-1.svg'))).not.toThrow();
    expect(() => parseSvg(text('word/media/page-2.svg'))).not.toThrow();
  });

  it('gives every SVG a valid, positive viewport consistent with the declared page dimensions', () => {
    for (const svg of svgs) {
      expect(Number.isFinite(svg.width)).toBe(true);
      expect(Number.isFinite(svg.height)).toBe(true);
      expect(svg.width).toBeGreaterThan(0);
      expect(svg.height).toBeGreaterThan(0);
      expect(svg.width).toBe(PAGE_WIDTH_PX);
      expect(svg.height).toBe(PAGE_HEIGHT_PX);
      expect(svg.viewBox).toHaveLength(4);
      expect(svg.viewBox.every((value) => Number.isFinite(value))).toBe(true);
      expect(svg.viewBox[2]).toBe(PAGE_WIDTH_PX);
      expect(svg.viewBox[3]).toBe(PAGE_HEIGHT_PX);
    }
  });

  it('represents nodes, containers, and edges as real SVG shapes on every page', () => {
    // page 1: pool + lane containers (rect), start event (ellipse), review
    // activity (rect), gw1 gateway (polygon), 3 edges (path)
    expect(svgs[0].elements.filter((name) => name === 'rect').length).toBeGreaterThanOrEqual(3);
    expect(svgs[0].elements).toContain('ellipse');
    expect(svgs[0].elements).toContain('polygon');
    // +1 path for the shared arrowhead marker definition in <defs>
    expect(svgs[0].elements.filter((name) => name === 'path').length).toBe(3 + 1);
    // page 2: pool + lane containers (rect), ship activity (rect), end event (ellipse), 2 edges (path)
    expect(svgs[1].elements.filter((name) => name === 'rect').length).toBeGreaterThanOrEqual(3);
    expect(svgs[1].elements).toContain('ellipse');
    expect(svgs[1].elements.filter((name) => name === 'path').length).toBe(2 + 1);
  });

  it('preserves node labels and continuation markers without silently dropping content', () => {
    expect(svgs[0].texts.join(' ')).toContain('Begin');
    expect(svgs[0].texts.join(' ')).toContain('OK?');
    expect(svgs[1].texts.join(' ')).toContain('Done');
    const document = text('word/document.xml');
    expect(document).toContain('Order fulfillment — Page 1 of 2 — Continues on page 2');
    expect(document).toContain('Order fulfillment — Page 2 of 2 — Continues from page 1');
  });

  it('keeps XML-sensitive and non-ASCII labels safely encoded, and round-trips them through parsing', () => {
    const rawPage1 = text('word/media/page-1.svg');
    expect(rawPage1).toContain('&lt;urgent&gt;');
    expect(rawPage1).toContain('&amp;');
    expect(rawPage1).toContain('検証');
    const rawPage2 = text('word/media/page-2.svg');
    expect(rawPage2).toContain('&lt;fragile&gt;');
    expect(rawPage2).toContain('配送');
    // The parser decodes entities back to the original characters -- this
    // proves the encoding round-trips correctly, not just that it looks escaped.
    expect(svgs[0].texts.some((value) => value.includes('<urgent>'))).toBe(true);
    expect(svgs[0].texts.some((value) => value.includes('検証'))).toBe(true);
    expect(svgs[1].texts.some((value) => value.includes('<fragile>'))).toBe(true);
  });

  it('keeps declared page count and dimensions consistent between document.xml and every SVG', () => {
    const document = text('word/document.xml');
    const twipsWidth = Math.round(PAGE_SPEC.width * 1440);
    const twipsHeight = Math.round(PAGE_SPEC.height * 1440);
    expect(document).toContain(`<w:pgSz w:w="${twipsWidth}" w:h="${twipsHeight}"`);
    expect((document.match(/Page [12] of 2/g) ?? []).length).toBe(2);
    expect(svgs.every((svg) => svg.width === PAGE_WIDTH_PX && svg.height === PAGE_HEIGHT_PX)).toBe(true);
  });

  it('produces no NaN/Infinity anywhere in document.xml or the embedded SVGs', () => {
    expect(text('word/document.xml')).not.toMatch(/NaN|Infinity/);
    expect(text('word/media/page-1.svg')).not.toMatch(/NaN|Infinity/);
    expect(text('word/media/page-2.svg')).not.toMatch(/NaN|Infinity/);
  });

  it('resolves without throwing for a valid cross-page continuation (warning, not blocking)', async () => {
    await expect(exportDocx(twoPageBpmnScene())).resolves.toBeInstanceOf(Uint8Array);
  });

  it('requires a common page directive for unequal intrinsic page sizes, with the documented actionable error', async () => {
    const unequal = twoPageBpmnScene();
    unequal.pageSpec = undefined;
    // Larger than page 1 so every existing node/edge on page 2 still fits --
    // this isolates the dimension-mismatch diagnostic from unrelated bounds errors.
    unequal.pages[1].width = 1200;
    unequal.pages[1].height = 900;
    const target = await tempDocxPath('bpm-docx-contract-unequal-');
    const result = await attemptWrite(unequal, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID', message: expect.stringContaining('common page directive') });
    expect(existsSync(target)).toBe(false);
  });

  it('allows unequal intrinsic page sizes once a compatible common page spec is declared', async () => {
    const compatible = twoPageBpmnScene();
    const factor = 0.5;
    const page2 = compatible.pages[1];
    const scaleRect = <T extends { x: number; y: number; width: number; height: number }>(item: T): T => ({ ...item, x: item.x * factor, y: item.y * factor, width: item.width * factor, height: item.height * factor });
    page2.width = Math.round(page2.width * factor);
    page2.height = Math.round(page2.height * factor);
    page2.containers = page2.containers!.map(scaleRect);
    page2.nodes = page2.nodes.map(scaleRect);
    page2.edges = page2.edges.map((edge) => ({ ...edge, points: edge.points.map((point) => ({ x: point.x * factor, y: point.y * factor })) }));
    // Uniform scaling preserves page 1's aspect ratio exactly, satisfying the
    // aspect-compatibility check that only applies when pageSpec is declared.
    await expect(exportDocx(compatible)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('does not leave a successful output artifact for an invalid scene (forged continuation)', async () => {
    const forged = twoPageBpmnScene();
    forged.pages[0].continuations[0].edgeIds = ['forged'];
    forged.pages[1].continuations[0].edgeIds = ['forged'];
    const target = await tempDocxPath('bpm-docx-contract-forged-');
    const result = await attemptWrite(forged, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('does not leave a successful output artifact for an asymmetric (missing counterpart) continuation', async () => {
    const asymmetric = twoPageBpmnScene();
    asymmetric.pages[1].continuations = [];
    const target = await tempDocxPath('bpm-docx-contract-asymmetric-');
    const result = await attemptWrite(asymmetric, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('does not leave a successful output artifact for a one-point continuation route', async () => {
    const onePoint = twoPageBpmnScene();
    onePoint.pages[0].edges[2].points = [{ x: 520, y: 90 }];
    const target = await tempDocxPath('bpm-docx-contract-onepoint-');
    const result = await attemptWrite(onePoint, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('does not leave a successful output artifact for a neither-local continuation route', async () => {
    const neitherLocal = twoPageBpmnScene();
    neitherLocal.pages[0].nodes = neitherLocal.pages[0].nodes.filter((node) => node.id !== 'gw1');
    const target = await tempDocxPath('bpm-docx-contract-neitherlocal-');
    const result = await attemptWrite(neitherLocal, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('does not leave a successful output artifact when the SVG resource limit is exceeded', async () => {
    const source = twoPageBpmnScene().pages[0];
    // Isolate a single valid page (drop the cross-page edge/continuation, which
    // would otherwise reference the now-removed page 2 and fail for an
    // unrelated reason) before growing one label past the SVG byte limit.
    const oversized: PaginatedScene = {
      mode: 'semantic', pageSpec: PAGE_SPEC, sourceWidth: 2000, sourceHeight: 1400,
      pages: [{
        ...source,
        edges: source.edges.filter((edge) => edge.id !== 'cross'),
        continuations: [],
        nodes: source.nodes.map((node) => (node.id === 'review' ? { ...node, label: 'x'.repeat(DOCX_EXPORT_LIMITS.maxSvgBytes) } : node)),
      }],
    };
    const target = await tempDocxPath('bpm-docx-contract-oversized-');
    const result = await attemptWrite(oversized, {}, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'LIMIT' });
    expect(existsSync(target)).toBe(false);
  });
});
