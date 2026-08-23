import { describe, expect, it } from 'vitest';
import { layoutFlowchart, parseFlowchart, renderFlowchart } from '../src/index.js';

describe('flowchart SVG renderer', () => {
  it('renders diamonds, escaped labels, arrowheads, and edge labels', async () => {
    const parsed = parseFlowchart('box "A &lt; B" as a\ndecision "Choose <now>" as d\na => d: "yes & no"');
    const svg = renderFlowchart(await layoutFlowchart(parsed.ast));
    expect(svg).toContain('<polygon');
    expect(svg).toContain('marker-end="url(#flowchart-arrow)"');
    expect(svg).toContain('yes &amp; no');
    expect(svg).toContain('Choose &lt;now&gt;');
    expect(svg).toContain('<tspan');
    expect(svg).toContain('data-edge-label');
  });

  it('neutralizes hostile markup, quotes, newlines, and XML-invalid controls', async () => {
    const parsed = parseFlowchart('box "safe" as node');
    parsed.ast.nodes[0].label = '<script>& " \' \n\u0001';
    const svg = renderFlowchart(await layoutFlowchart(parsed.ast));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;&amp;');
    expect(svg).toContain('&quot;');
    expect(svg).toContain('&apos;');
    expect(svg).toContain('\uFFFD');
  });
});
