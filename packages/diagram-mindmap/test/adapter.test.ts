import { describe, expect, it } from 'vitest';
import { SaxesParser } from 'saxes';
import { mindmapAdapter } from '../src/index.js';

describe('mindmap adapter', () => {
  it('advertises capability-gated draw.io export and performs the complete adapter pipeline', async () => {
    const parsed = mindmapAdapter.parse('mindmap "Root" as root');
    const positioned = await mindmapAdapter.layout(parsed.ast);
    expect(mindmapAdapter.id).toBe('mindmap');
    expect(parsed.errors).toEqual([]);
    expect(mindmapAdapter.capabilities).toMatchObject({ svg: true, png: true, structuredExport: ['mindmap-drawio-xml'], editorMode: 'external-export', engineOverride: false });
    expect(mindmapAdapter.render(positioned)).toContain('<svg');
    expect(mindmapAdapter.exportStructured?.(parsed.ast, positioned, 'mindmap-drawio-xml')).toContain('<mxfile');
  });

  it('exports hostile labels as well-formed escaped draw.io XML', async () => {
    const parsed = mindmapAdapter.parse('mindmap "safe" as root');
    parsed.ast.root.label = '<script>& " \' \n\u0001';
    const positioned = await mindmapAdapter.layout(parsed.ast);
    const xml = mindmapAdapter.exportStructured!(parsed.ast, positioned, 'mindmap-drawio-xml');
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
    expect(xml).toContain('\uFFFD');
    expect(() => new SaxesParser({ xmlns: false }).write(xml).close()).not.toThrow();
  });

  it.each(['right', 'left', 'down', 'up'] as const)('renders and exports every direction: %s', async (direction) => {
    const parsed = mindmapAdapter.parse(`direction: ${direction}\nmindmap "Root" as root\n  mindmap "Child" as child`);
    const positioned = await mindmapAdapter.layout(parsed.ast);
    const svg = mindmapAdapter.render(positioned);
    const xml = mindmapAdapter.exportStructured!(parsed.ast, positioned, 'mindmap-drawio-xml');
    expect(svg).toContain('<svg');
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(xml).toContain('source="root" target="child"');
    expect(xml).toContain('<Array as="points">');
  });
});
