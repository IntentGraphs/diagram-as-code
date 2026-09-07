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
    expect(svg).toContain('data-architecture-legend="true"');
    expect(svg).toContain('Architecture diagram');
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

  it('keeps verbose node details out of a system landscape', async () => {
    const parsed = parseArchitecture(`person "Planner" as planner [description: "Owns demand, supply, production, purchasing, transport and master data planning"]
system "Planning" as planning [description: "Enterprise planning, procurement, logistics and warehouse capabilities"]
planner -> planning: "uses"
view systemLandscape as landscape "Planning Landscape"`);
    const positioned = await layoutArchitecture(parsed.ast);
    const svg = renderArchitecture(positioned);
    expect(svg).not.toContain('Owns demand, supply, production');
    expect(svg).not.toContain('Enterprise planning, procurement, logistics');
  });

  it('keeps relationship text in detailed views instead of the system landscape', async () => {
    const parsed = parseArchitecture(`person "Planner" as planner
system "Planning" as planning
planner -> planning: "owns demand, supply and capacity planning"
view systemLandscape as landscape "Planning Landscape"`);
    const positioned = await layoutArchitecture(parsed.ast);
    const svg = renderArchitecture(positioned);
    expect(positioned.edges).toHaveLength(1);
    expect(svg).toContain('data-edge-id="r1"');
    expect(svg).not.toContain('data-edge-label="r1"');
  });
});
