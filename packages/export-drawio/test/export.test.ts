import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SaxesParser } from 'saxes';
import { exportToDrawioXml } from '../src/index.js';

const fixture = { nodes: [
  { id: 'root', label: 'Root & <ready>', x: 10, y: 20, width: 120, height: 40, shape: 'rounded' as const },
  { id: 'child', label: 'Child "quoted"', x: 260, y: 20, width: 120, height: 40 },
], edges: [{ id: 'root-to-child', source: 'root', target: 'child', label: 'go;now=1', points: [{ x: 130, y: 40 }, { x: 260, y: 40 }] }] };

describe('@bpm/export-drawio', () => {
  it('emits the draw.io skeleton, positioned cells, labels, ids, and edge points', () => {
    const xml = exportToDrawioXml(fixture);
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('<mxGraphModel>');
    expect(xml).toContain('id="root"');
    expect(xml).toContain('x="10" y="20"');
    expect(xml).toContain('source="root" target="child"');
    expect(xml).toContain('<mxPoint x="130" y="40" />');
  });

  it('matches the checked-in fixture and passes structural XML validation', () => {
    const xml = exportToDrawioXml(fixture);
    const expected = readFileSync(fileURLToPath(new URL('./fixture.drawio', import.meta.url)), 'utf8').trim();
    expect(xml).toBe(expected);
    const parser = new SaxesParser({ xmlns: false });
    expect(() => parser.write(xml).close()).not.toThrow();
    expect(xml.match(/<mxCell\b/g)?.length).toBe(5);
    expect(xml).toContain('<mxCell id="0" />');
    expect(xml).toContain('<mxCell id="1" parent="0" />');
  });

  it('escapes labels and does not place label text in style attributes', () => {
    const xml = exportToDrawioXml(fixture);
    expect(xml).toContain('Root &amp; &lt;ready&gt;');
    expect(xml).toContain('Child &quot;quoted&quot;');
    expect(xml).toContain('go;now=1');
    expect(xml).not.toContain('style="Root');
  });

  it('writes page metadata and scales cells and waypoints into the page', () => {
    const xml = exportToDrawioXml({
      ...fixture,
      page: { width: 6, height: 9, unit: 'in', fit: 'contain' },
    });
    expect(xml).toContain('page="1" pageScale="1" pageWidth="576" pageHeight="864"');
    expect(xml).not.toContain('x="10" y="20"');
    expect(xml).toContain('<mxPoint x="');
    const parser = new SaxesParser({ xmlns: false });
    expect(() => parser.write(xml).close()).not.toThrow();
  });

  it('rejects strict page exports when geometry would become too small', () => {
    expect(() => exportToDrawioXml({
      nodes: [{ id: 'wide', label: 'Wide', x: 0, y: 0, width: 5000, height: 60 }],
      edges: [],
      page: { width: 6, height: 9, unit: 'in', fit: 'strict' },
    })).toThrow(/too dense/);
  });

  it('rejects duplicate, reserved, and dangling ids', () => {
    expect(() => exportToDrawioXml({ nodes: [{ ...fixture.nodes[0], id: '0' }], edges: [] })).toThrow(/reserved/);
    expect(() => exportToDrawioXml({ nodes: [{ ...fixture.nodes[0] }, { ...fixture.nodes[1], id: 'root' }], edges: [] })).toThrow(/Duplicate/);
    expect(() => exportToDrawioXml({ nodes: fixture.nodes, edges: [{ id: 'e', source: 'root', target: 'missing' }] })).toThrow(/missing node/);
    expect(() => exportToDrawioXml({ nodes: [{ ...fixture.nodes[0], shape: 'hexagon' as never }], edges: [] })).toThrow(/Unsupported draw.io shape/);
  });
});
