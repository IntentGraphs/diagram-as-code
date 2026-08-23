import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutMindmap, parseMindmap, renderMindmap } from '../src/index.js';

describe('mindmap SVG renderer', () => {
  it('renders edges before boxes and escapes labels', async () => {
    const parsed = parseMindmap('mindmap "<Root> & \'quoted\'" as root\n  mindmap "Child & more" as child');
    const svg = renderMindmap(await layoutMindmap(parsed.ast));
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain('&lt;Root&gt; &amp;');
    expect(svg).not.toContain('<Root>');
    expect(svg.indexOf('<path')).toBeLessThan(svg.indexOf('<rect'));
    expect(svg).toContain('stroke-width="3"');
  });

  it('neutralizes hostile markup, quotes, newlines, and XML-invalid controls', async () => {
    const parsed = parseMindmap('mindmap "safe" as root');
    parsed.ast.root.label = '<script>& " \' \n\u0001';
    const svg = renderMindmap(await layoutMindmap(parsed.ast));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
    expect(svg).toContain('\uFFFD');
  });

  it('renders the precomputed wrapped lines inside the box', async () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'long-label.bpm'), 'utf8');
    const positioned = await layoutMindmap(parseMindmap(source).ast);
    const svg = renderMindmap(positioned);
    const rootRect = svg.match(/<rect x="20" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    expect(rootRect).not.toBeNull();
    const [, y, , height] = rootRect!;
    const labelBlock = svg.match(/<text[^>]*>(<tspan[^>]+>.*?<\/tspan>)+<\/text>/)?.[0] ?? '';
    const ys = [...labelBlock.matchAll(/ y="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(ys.length).toBe(positioned.root.labelLines.length);
    expect(Math.min(...ys)).toBeGreaterThan(Number(y));
    expect(Math.max(...ys)).toBeLessThan(Number(y) + Number(height));
  });
});
