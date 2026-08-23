import { describe, expect, it } from 'vitest';
import { architectureAdapter } from '../src/adapter.js';
import { layoutArchitecture } from '../src/layout.js';
import { parseArchitecture } from '../src/parser.js';
import { renderArchitecture } from '../src/render.js';

describe('architecture rendering and exports', () => {
  it('renders semantic shapes and escapes labels', async () => {
    const parsed = parseArchitecture(`person "A & B" as personA
database "Orders <data>" as orders
personA -> orders: "reads & writes"`);
    const positioned = await layoutArchitecture(parsed.ast);
    const svg = renderArchitecture(positioned);
    expect(svg).toContain('data-node-id="orders"');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('data-edge-label="r1"');
  });

  it('exports project-specific C4 JSON and draw.io XML', async () => {
    const parsed = parseArchitecture(`system "Ordering" as ordering
database "Orders" as orders
ordering -> orders: "stores"`);
    const positioned = await layoutArchitecture(parsed.ast);
    const json = architectureAdapter.exportStructured!(parsed.ast, positioned, 'architecture-c4-json');
    const xml = architectureAdapter.exportStructured!(parsed.ast, positioned, 'architecture-drawio-xml');
    expect(JSON.parse(json).elements[0].type).toBe('SoftwareSystem');
    expect(JSON.parse(json).elements.find((element: { type: string }) => element.type === 'Database')).toBeTruthy();
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('source="ordering"');
  });
});
