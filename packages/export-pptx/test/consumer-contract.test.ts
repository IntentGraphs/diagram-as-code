import { describe, expect, it, beforeAll } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportPptx, type PositionedSnapshot, type PptxOptions } from '../src/index.js';
import type { PaginatedScene } from '@bpm/diagram-core';

/**
 * Artifact-level cross-export contract for multi-page PPTX (roadmap 18m, P0
 * "real PPTX/DOCX consumer checks"). This inspects the actual ZIP/OOXML
 * structure of a written .pptx file rather than only the in-memory bytes.
 * It does not open the file in PowerPoint or another real consumer; see the
 * report for that limitation.
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

function positionedSnapshot(): PositionedSnapshot {
  return { family: 'bpmn', title: 'Order fulfillment', width: 2000, height: 1400, nodes: [], edges: [], paginated: twoPageBpmnScene() };
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

async function tempPptxPath(prefix: string): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return path.join(dir, 'diagram.pptx');
}

/** Attempts export then a real file write, mirroring how a CLI/consumer would use exportPptx. */
async function attemptWrite(snapshot: PositionedSnapshot, options: PptxOptions, target: string): Promise<{ wrote: boolean; error?: unknown }> {
  try {
    const bytes = await exportPptx(snapshot, options);
    writeFileSync(target, bytes);
    return { wrote: true };
  } catch (error) {
    return { wrote: false, error };
  }
}

describe('PPTX multi-page consumer contract (18m)', () => {
  let filePath: string;
  let onDisk: Uint8Array;
  let files: Map<string, Uint8Array>;
  let text: (name: string) => string;

  beforeAll(async () => {
    filePath = await tempPptxPath('bpm-pptx-contract-');
    const bytes = await exportPptx(positionedSnapshot(), { deterministic: true });
    writeFileSync(filePath, bytes);
    onDisk = readFileSync(filePath);
    files = zipEntries(onDisk);
    text = (name) => new TextDecoder().decode(files.get(name) ?? new Uint8Array());
  });

  it('exports successfully to a real temporary file and produces a structurally readable ZIP', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(onDisk.subarray(0, 2).toString()).toBe('PK');
    expect(files.has('[Content_Types].xml')).toBe(true);
    expect(files.has('ppt/presentation.xml')).toBe(true);
  });

  it('creates one slide per semantic page, sized to the declared page dimensions', () => {
    const presentation = text('ppt/presentation.xml');
    expect((presentation.match(/<p:sldId /g) ?? []).length).toBe(2);
    const widthEmu = Math.round(PAGE_SPEC.width * 914400);
    const heightEmu = Math.round(PAGE_SPEC.height * 914400);
    expect(presentation).toContain(`<p:sldSz cx="${widthEmu}" cy="${heightEmu}"`);
    expect(files.has('ppt/slides/slide1.xml')).toBe(true);
    expect(files.has('ppt/slides/slide2.xml')).toBe(true);
    expect(files.has('ppt/slides/slide3.xml')).toBe(false);
  });

  it('renders native editable shapes, text, and connectors on every page rather than one raster image', () => {
    for (const slideName of ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']) {
      const slide = text(slideName);
      expect(slide).toContain('<p:sp>');
      expect(slide).toMatch(/<a:prstGeom prst="line">/);
      expect(slide).not.toContain('<p:pic>');
    }
  });

  it('keeps page labels and continuation annotations on both sides of the boundary', () => {
    const first = text('ppt/slides/slide1.xml');
    const second = text('ppt/slides/slide2.xml');
    expect(first).toContain('Page 1 of 2');
    expect(second).toContain('Page 2 of 2');
    expect(first).toContain('continues on page 2');
    expect(second).toContain('continued from page 1');
  });

  it('does not silently drop nodes, edges, or labels on either page', () => {
    const first = text('ppt/slides/slide1.xml');
    const second = text('ppt/slides/slide2.xml');
    expect(first).toContain('Begin');
    expect(first).toContain('OK?');
    expect(first).toContain('&lt;urgent&gt;');
    expect(first).toContain('&amp;');
    expect(first).toContain('検証');
    expect(second).toContain('Done');
    expect(second).toContain('&lt;fragile&gt;');
    expect(second).toContain('配送');
    // Local connectors: e1 + e2 on page 1, e3 on page 2. The cross-page
    // 'cross' edge is never drawn as a connector on either slide because no
    // single slide holds both endpoint shapes -- it is represented only by
    // the continuation annotation asserted above.
    expect((first.match(/<a:prstGeom prst="line">/g) ?? []).length).toBe(2);
    expect((second.match(/<a:prstGeom prst="line">/g) ?? []).length).toBe(1);
  });

  it('keeps a valid cross-page continuation a warning, never a blocking error', async () => {
    const warnings: NonNullable<PptxOptions['warnings']> = [];
    await expect(exportPptx(positionedSnapshot(), { warnings, deterministic: true })).resolves.toBeInstanceOf(Uint8Array);
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'pagination_continuation', severity: 'warning' })]));
  });

  it('produces no NaN/Infinity or non-finite geometry in emitted slide XML', () => {
    for (const slideName of ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']) {
      const slide = text(slideName);
      expect(slide).not.toMatch(/NaN/);
      expect(slide).not.toMatch(/Infinity/);
    }
  });

  it('does not leave a successful output artifact when node geometry is invalid', async () => {
    const invalid = positionedSnapshot();
    invalid.paginated!.pages[0].nodes[0].width = Number.NaN;
    const target = await tempPptxPath('bpm-pptx-contract-invalid-');
    const result = await attemptWrite(invalid, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('does not leave a successful output artifact when strict fit cannot be met', async () => {
    const strict = positionedSnapshot();
    strict.paginated!.pageSpec = { width: 6, height: 9, unit: 'in', fit: 'strict' };
    strict.paginated!.pages[0].readabilityScale = 0.05;
    const target = await tempPptxPath('bpm-pptx-contract-strict-');
    const result = await attemptWrite(strict, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID', message: expect.stringContaining('fit: strict') });
    expect(existsSync(target)).toBe(false);
  });

  it('blocks forged continuation ids without leaving an artifact', async () => {
    const forged = positionedSnapshot();
    forged.paginated!.pages[0].continuations[0].edgeIds = ['forged'];
    forged.paginated!.pages[1].continuations[0].edgeIds = ['forged'];
    const target = await tempPptxPath('bpm-pptx-contract-forged-');
    const result = await attemptWrite(forged, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('blocks an asymmetric (missing counterpart) continuation without leaving an artifact', async () => {
    const asymmetric = positionedSnapshot();
    asymmetric.paginated!.pages[1].continuations = [];
    const target = await tempPptxPath('bpm-pptx-contract-asymmetric-');
    const result = await attemptWrite(asymmetric, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('blocks a one-point continuation route without leaving an artifact', async () => {
    const onePoint = positionedSnapshot();
    onePoint.paginated!.pages[0].edges[2].points = [{ x: 520, y: 90 }];
    const target = await tempPptxPath('bpm-pptx-contract-onepoint-');
    const result = await attemptWrite(onePoint, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });

  it('blocks a neither-local continuation route without leaving an artifact', async () => {
    const neitherLocal = positionedSnapshot();
    neitherLocal.paginated!.pages[0].nodes = neitherLocal.paginated!.pages[0].nodes.filter((node) => node.id !== 'gw1');
    const target = await tempPptxPath('bpm-pptx-contract-neitherlocal-');
    const result = await attemptWrite(neitherLocal, { deterministic: true }, target);
    expect(result.wrote).toBe(false);
    expect(result.error).toMatchObject({ code: 'INVALID' });
    expect(existsSync(target)).toBe(false);
  });
});
