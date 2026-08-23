import { describe, it, expect } from 'vitest';
import { escapeXml } from '../src/xml.js';
import { render } from '../src/index.js';
import type { PositionedDiagram, PositionedNode } from '@bpm/layout';

describe('escapeXml for attribute ids', () => {
  it('escapes quotes and angle brackets', () => {
    expect(escapeXml('a"b')).toBe('a&quot;b');
    expect(escapeXml('a<b>')).toBe('a&lt;b&gt;');
  });

  it('escapes a hostile id in data-node-id attributes', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      edges: [],
      nodes: [{
        id: 'a"b',
        kind: 'activity',
        label: 'X',
        activityType: 'task',
        collapsed: false,
        children: [],
        childEdges: [],
        x: 0, y: 0, width: 100, height: 50,
      } as PositionedNode],
    };
    const svg = render(diagram);
    expect(svg).not.toContain('data-node-id="a"b"');
    expect(svg).toContain('data-node-id="a&quot;b"');
  });
});
