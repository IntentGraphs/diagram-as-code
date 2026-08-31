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
    expect(svg).toContain('data-node-label-id="personA"');
    expect(svg).toContain('fill="white" opacity="0.92"');
  });

  it('exports project-specific C4 JSON, Structurizr DSL, and draw.io XML', async () => {
    const parsed = parseArchitecture(`direction: down
person "Planner" as planner
system "Ordering" as ordering
  container "API" as api
    component "Checkout" as checkout
database "Orders" as orders
queue "Events" as events
planner -> ordering: "uses"
ordering -> checkout: "routes"
checkout -> orders: "stores"
ordering -> events: "publishes"`);
    const positioned = await layoutArchitecture(parsed.ast);
    const json = architectureAdapter.exportStructured!(parsed.ast, positioned, 'architecture-c4-json');
    const dsl = architectureAdapter.exportStructured!(parsed.ast, positioned, 'architecture-structurizr-dsl');
    const xml = architectureAdapter.exportStructured!(parsed.ast, positioned, 'architecture-drawio-xml');
    expect(JSON.parse(json).elements.find((element: { type: string }) => element.type === 'SoftwareSystem')).toBeTruthy();
    expect(JSON.parse(json).elements.find((element: { type: string }) => element.type === 'Database')).toBeTruthy();
    expect(dsl).toContain('workspace "Architecture diagram"');
    expect(dsl).toContain('n_ordering = softwareSystem "Ordering"');
    expect(dsl).toContain('n_api = container "API"');
    expect(dsl).toContain('n_orders = element "Orders" { tags "Database" }');
    expect(dsl).toContain('!impliedRelationships false');
    expect(dsl).toContain('custom "CustomElements" "Data stores and queues"');
    expect(dsl).toContain('systemContext n_ordering');
    expect(dsl).toContain('component n_api');
    expect(dsl).toContain('autoLayout tb');
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('source="ordering"');
    expect(xml).toContain('architectureKind="system"');
  });
});
