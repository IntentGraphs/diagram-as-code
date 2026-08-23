import { describe, expect, it } from 'vitest';
import { SaxesParser } from 'saxes';
import { executeDiagramSource, exportStructuredDiagram, getFamily, listFamilies } from '@bpm/diagram-runtime';
import { flowchartAdapter } from '../src/index.js';

describe('flowchart adapter', () => {
  it('is registered and executes through the runtime', async () => {
    expect(listFamilies()).toContain('flowchart');
    expect(getFamily('flowchart').capabilities).toMatchObject({ svg: true, png: true, structuredExport: ['flowchart-drawio-xml'], editorMode: 'external-export', engineOverride: false });
    expect(getFamily('flowchart').capabilities.structuredExports?.[0]).toMatchObject({ format: 'flowchart-drawio-xml', label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, roundTrip: 'none', fidelity: 'lossy' });
    const result = await executeDiagramSource('diagram: flowchart\nbox "A" as a\nbox "B" as b\na -> b');
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('<svg');
  });

  it.each(['right', 'left', 'up'] as const)('renders all nodes and edges for direction %s', async (direction) => {
    const result = await executeDiagramSource(`diagram: flowchart\ndirection: ${direction}\nbox "A" as a\nbox "B" as b\na -> b`);
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned?.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(result.positioned?.edges.map((edge) => [edge.from, edge.to])).toEqual([['a', 'b']]);
    expect(result.svg).toContain('data-node-id="a"');
    expect(result.svg).toContain('data-node-id="b"');
    expect(result.svg).toContain('data-edge-id="e0"');
  });

  it('preserves structured invalid-direction diagnostics before the adapter runs', async () => {
    await expect(executeDiagramSource('diagram: flowchart\ndirection: diagonal\nbox "A" as a')).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'invalid_direction', token: 'diagonal' })],
    });
  });

  it('exports rounded boxes, rhombus decisions, routed edges, and escaped labels', async () => {
    const xml = await exportStructuredDiagram('diagram: flowchart\nbox "Start & <go>" as start\ndecision "Approved?" as approved\nbox "Done" as done\nstart -> approved\napproved => done: "yes & <retry>"', 'flowchart-drawio-xml');
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('id="start" value="Start &amp; &lt;go&gt;" style="rounded=1;');
    expect(xml).toContain('id="approved" value="Approved?" style="shape=rhombus;');
    expect(xml).toContain('id="e1" value="yes &amp; &lt;retry&gt;"');
    expect(xml).toContain('source="approved" target="done"');
    expect(xml).toContain('<Array as="points">');
  });

  it('rejects unsupported structured formats through the capability-gated runtime API', async () => {
    await expect(exportStructuredDiagram('diagram: flowchart\nbox "A" as a', 'other-format')).rejects.toThrow('Family "flowchart" does not support structured export "other-format"');
  });

  it('exports hostile labels as well-formed escaped draw.io XML', async () => {
    const parsed = flowchartAdapter.parse('box "safe" as node');
    parsed.ast.nodes[0].label = '<script>& " \' \n\u0001';
    const positioned = await flowchartAdapter.layout(parsed.ast);
    const xml = flowchartAdapter.exportStructured!(parsed.ast, positioned, 'flowchart-drawio-xml');
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
    expect(xml).toContain('\uFFFD');
    expect(() => new SaxesParser({ xmlns: false }).write(xml).close()).not.toThrow();
  });
});
