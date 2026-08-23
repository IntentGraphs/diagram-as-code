import { deflateRawSync } from 'node:zlib';
import { diagnosePaginatedScene, pageSizeInches, type PaginatedScene, type PaginatedScenePage, type SceneEdge, type SceneNode } from '@bpm/diagram-core';
import { escapeXml } from '@bpm/render-core';

export interface DocxOptions { title?: string; family?: 'bpmn'; }
export class DocxExportError extends Error {
  constructor(public readonly code: 'INVALID' | 'UNSUPPORTED' | 'LIMIT', message: string) { super(message); this.name = 'DocxExportError'; }
}

export const DOCX_EXPORT_LIMITS = {
  maxPages: 100,
  maxSvgBytes: 10_000_000,
  maxNodes: 10_000,
  maxEdges: 20_000,
  maxContainers: 5_000,
} as const;

const finite = (value: number): boolean => Number.isFinite(value);
const n = (value: number): string => Number(value.toFixed(3)).toString();

function shape(node: SceneNode): string {
  const fill = node.kind === 'pool' ? '#ffffff' : node.kind === 'lane' ? '#f8fafc' : '#ffffff';
  const stroke = node.kind === 'pool' ? '#334155' : '#64748b';
  const label = node.label ? `<text x="${n(node.x + node.width / 2)}" y="${n(node.y + node.height / 2 + 4)}" text-anchor="middle" font-family="Arial" font-size="12" fill="#111827">${escapeXml(node.label)}</text>` : '';
  if (node.kind.includes('event')) return `<ellipse cx="${n(node.x + node.width / 2)}" cy="${n(node.y + node.height / 2)}" rx="${n(node.width / 2)}" ry="${n(node.height / 2)}" fill="${fill}" stroke="${stroke}"/>${label}`;
  if (node.kind.includes('gateway')) {
    const points = `${n(node.x + node.width / 2)},${n(node.y)} ${n(node.x + node.width)},${n(node.y + node.height / 2)} ${n(node.x + node.width / 2)},${n(node.y + node.height)} ${n(node.x)},${n(node.y + node.height / 2)}`;
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}"/>${label}`;
  }
  return `<rect x="${n(node.x)}" y="${n(node.y)}" width="${n(node.width)}" height="${n(node.height)}" rx="${node.kind.includes('activity') ? 4 : 0}" fill="${fill}" stroke="${stroke}"/>${label}`;
}

function edge(value: SceneEdge): string {
  if (value.points.length < 2) return '';
  const d = value.points.map((point, index) => `${index ? 'L' : 'M'} ${n(point.x)} ${n(point.y)}`).join(' ');
  const label = value.label ? `<text x="${n(value.points[Math.floor(value.points.length / 2)].x)}" y="${n(value.points[Math.floor(value.points.length / 2)].y - 4)}" font-family="Arial" font-size="11" fill="#334155">${escapeXml(value.label)}</text>` : '';
  return `<path d="${d}" fill="none" stroke="#475569" stroke-width="1.5" marker-end="url(#arrow)"/>${label}`;
}

function pageSvg(page: PaginatedScenePage): string {
  const containers = (page.containers ?? []).map(shape).join('');
  const edges = page.edges.map(edge).join('');
  const nodes = page.nodes.filter((node) => !(page.containers ?? []).some((container) => container.id === node.id)).map(shape).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(page.width)}" height="${n(page.height)}" viewBox="0 0 ${n(page.width)} ${n(page.height)}"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" fill="#475569"/></marker></defs><rect width="100%" height="100%" fill="white"/>${containers}${edges}${nodes}</svg>`;
}

function validate(scene: PaginatedScene, options: DocxOptions): void {
  if (options.family && options.family !== 'bpmn') throw new DocxExportError('UNSUPPORTED', `DOCX export does not support the ${options.family} family yet`);
  if (!scene || !Array.isArray(scene.pages)) throw new DocxExportError('INVALID', 'A PaginatedScene with pages is required');
  if (scene.pages.length > DOCX_EXPORT_LIMITS.maxPages) throw new DocxExportError('LIMIT', `DOCX export is limited to ${DOCX_EXPORT_LIMITS.maxPages} pages`);
  const diagnostics = diagnosePaginatedScene(scene);
  const errors = diagnostics.filter((item) => item.severity === 'error');
  if (errors.length) throw new DocxExportError('INVALID', errors.map((item) => item.message).join('; '));
  if (!finite(scene.sourceWidth) || !finite(scene.sourceHeight) || scene.sourceWidth <= 0 || scene.sourceHeight <= 0) throw new DocxExportError('INVALID', 'PaginatedScene source dimensions must be positive and finite');
  const first = scene.pages[0];
  if (!first) throw new DocxExportError('INVALID', 'PaginatedScene must contain at least one page');
  if (scene.pages.some((page) => (page.nodes.length + page.edges.length + (page.containers?.length ?? 0)) === 0)) throw new DocxExportError('INVALID', 'PaginatedScene contains a blank page');
  if (![first.width, first.height].every((value) => finite(value) && value > 0)) throw new DocxExportError('INVALID', 'DOCX page dimensions must be positive and finite');
  const dimensionsDiffer = scene.pages.some((page) => page.width !== first.width || page.height !== first.height);
  if (dimensionsDiffer && !scene.pageSpec) {
    throw new DocxExportError('INVALID', 'DOCX requires a common page size for pages with different intrinsic dimensions; add a common page directive such as page: 8.5in x 11in');
  }
  if (scene.pageSpec && dimensionsDiffer) {
    const aspect = first.width / first.height;
    if (scene.pages.some((page) => Math.abs(page.width / page.height - aspect) > 1e-6)) {
      throw new DocxExportError('INVALID', 'DOCX common page size is incompatible with one or more page aspect ratios; use a common page size that preserves each page ratio');
    }
  }
  let nodes = 0; let edges = 0; let containers = 0;
  for (const page of scene.pages) {
    nodes += page.nodes.length; edges += page.edges.length; containers += page.containers?.length ?? 0;
    if (nodes > DOCX_EXPORT_LIMITS.maxNodes) throw new DocxExportError('LIMIT', `DOCX export is limited to ${DOCX_EXPORT_LIMITS.maxNodes} nodes`);
    if (edges > DOCX_EXPORT_LIMITS.maxEdges) throw new DocxExportError('LIMIT', `DOCX export is limited to ${DOCX_EXPORT_LIMITS.maxEdges} edges`);
    if (containers > DOCX_EXPORT_LIMITS.maxContainers) throw new DocxExportError('LIMIT', `DOCX export is limited to ${DOCX_EXPORT_LIMITS.maxContainers} containers`);
    for (const node of [...page.nodes, ...(page.containers ?? [])]) {
      if (![node.x, node.y, node.width, node.height].every(finite) || node.width <= 0 || node.height <= 0) throw new DocxExportError('INVALID', `Page ${page.pageNumber} contains invalid geometry for ${node.id}`);
    }
    for (const item of page.edges) if (item.points.length < 2 || item.points.some((point) => ![point.x, point.y].every(finite))) throw new DocxExportError('INVALID', `Page ${page.pageNumber} contains invalid edge geometry for ${item.id}`);
    for (const continuation of page.continuations) if (!Number.isInteger(continuation.sourcePage) || !Number.isInteger(continuation.targetPage)) throw new DocxExportError('INVALID', `Page ${page.pageNumber} contains an invalid continuation marker`);
  }
}

function textParagraph(value: string, style = ''): string { return `<w:p${style ? `><w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '>'}<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`; }
function imageParagraph(index: number, widthEmu: number, heightEmu: number): string { return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${widthEmu}" cy="${heightEmu}"/><wp:docPr id="${index}" name="Diagram page ${index}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index}" name="page-${index}.svg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId${index}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`; }

function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zip(entries: Array<[string, Uint8Array]>): Uint8Array {
  const locals: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  const encoder = new TextEncoder();
  for (const [name, data] of entries) { const file = encoder.encode(name), compressed = deflateRawSync(data), header = new ArrayBuffer(30 + file.length), view = new DataView(header); view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(8, 8, true); view.setUint32(14, crc32(data), true); view.setUint32(18, compressed.length, true); view.setUint32(22, data.length, true); view.setUint16(26, file.length, true); new Uint8Array(header, 30).set(file); locals.push(new Uint8Array(header), compressed); const c = new ArrayBuffer(46 + file.length), cv = new DataView(c); cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(data), true); cv.setUint32(20, compressed.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, file.length, true); cv.setUint32(42, offset, true); new Uint8Array(c, 46).set(file); central.push(new Uint8Array(c)); offset += 30 + file.length + compressed.length; }
  const centralBytes = central.reduce((sum, item) => sum + item.length, 0), localBytes = locals.reduce((sum, item) => sum + item.length, 0), end = new ArrayBuffer(22), ev = new DataView(end); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralBytes, true); ev.setUint32(16, localBytes, true); const out = new Uint8Array(localBytes + centralBytes + 22); let cursor = 0; for (const item of locals) { out.set(item, cursor); cursor += item.length; } for (const item of central) { out.set(item, cursor); cursor += item.length; } out.set(new Uint8Array(end), cursor); return out;
}

/**
 * Exports the shared semantic scene as one SVG-backed Word page per scene page.
 * The SVG is deliberately embedded as one vector image: it preserves the existing
 * renderer-independent visual contract, but diagram nodes and edges are not editable
 * as native Word shapes. BPMN is the first supported family; other family adapters
 * must opt in once they produce the shared paginated scene contract.
 */
export async function exportDocx(scene: PaginatedScene, options: DocxOptions = {}): Promise<Uint8Array> {
  validate(scene, options);
  const first = scene.pages[0]; let inches: { width: number; height: number };
  try { inches = scene.pageSpec ? pageSizeInches(scene.pageSpec) : { width: first.width / 96, height: first.height / 96 }; } catch (error) { throw new DocxExportError('INVALID', `Invalid DOCX page dimensions: ${error instanceof Error ? error.message : String(error)}`); }
  if (![inches.width, inches.height].every((value) => finite(value) && value > 0) || inches.height <= 0.55) throw new DocxExportError('INVALID', 'DOCX page dimensions must leave a positive image extent after the heading');
  const twips = (value: number) => Math.round(value * 1440); const emu = (value: number) => Math.round(value * 914400); const title = options.title ?? 'BPMN diagram';
  const rels = scene.pages.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${index + 1}.svg"/>`).join('');
  const body = scene.pages.map((page, index) => { const continuations = page.continuations.flatMap((item) => page.pageNumber === item.sourcePage ? [`Continues on page ${item.targetPage}`] : page.pageNumber === item.targetPage ? [`Continues from page ${item.sourcePage}`] : []).filter((value, i, all) => all.indexOf(value) === i); const marker = continuations.length ? ` — ${continuations.join('; ')}` : ''; const before = index ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''; return `${before}${textParagraph(`${page.title ?? title} — Page ${page.pageNumber} of ${scene.pages.length}${marker}`, 'Heading1')}${imageParagraph(index + 1, emu(inches.width), emu(Math.max(0.1, inches.height - 0.55)))}`; }).join('');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="${twips(inches.width)}" w:h="${twips(inches.height)}"/><w:pgMar w:top="360" w:right="360" w:bottom="360" w:left="360" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const entries: Array<[string, Uint8Array]> = [['[Content_Types].xml', new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)], ['_rels/.rels', new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)], ['word/document.xml', new TextEncoder().encode(document)], ['word/_rels/document.xml.rels', new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`)], ['word/styles.xml', new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`)]];
  let svgBytes = 0;
  scene.pages.forEach((page, index) => { const bytes = new TextEncoder().encode(pageSvg(page)); svgBytes += bytes.byteLength; if (svgBytes > DOCX_EXPORT_LIMITS.maxSvgBytes) throw new DocxExportError('LIMIT', `DOCX SVG content is limited to ${DOCX_EXPORT_LIMITS.maxSvgBytes} bytes`); entries.push([`word/media/page-${index + 1}.svg`, bytes]); });
  return zip(entries);
}

export { pageSvg };
