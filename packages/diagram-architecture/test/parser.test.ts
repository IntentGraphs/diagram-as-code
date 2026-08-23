import { describe, expect, it } from 'vitest';
import { parseArchitecture } from '../src/parser.js';

describe('architecture parser', () => {
  it('parses C4 containment and directed relationships', () => {
    const result = parseArchitecture(`person "Customer" as customer
system "Ordering System" as ordering
  container "API" as api
    component "Checkout" as checkout
database "Orders" as orders
queue "Events" as events
customer -> ordering: "places orders"
checkout -> orders: "reads and writes"
ordering -> events: "publishes"`);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.nodes[1].children[0].children[0].id).toBe('checkout');
    expect(result.ast.edges[0]).toMatchObject({ sourceId: 'customer', targetId: 'ordering', label: 'places orders' });
  });

  it('rejects duplicate ids, invalid containment, and missing endpoints', () => {
    const result = parseArchitecture(`database "One" as db
  component "Illegal" as child
database "Two" as db
db -> missing`);
    expect(result.semanticErrors.map((error) => error.code)).toEqual(expect.arrayContaining(['invalid_containment', 'duplicate_id', 'unknown_edge_endpoint']));
  });

  it('accepts cycles and Unicode labels', () => {
    const result = parseArchitecture(`system "Übersicht & API" as api
system "Payments" as payments
api -> payments: "réserviert → zahlt"
payments -> api: "callback"`);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
  });

  it('validates containment, relationship ids, duplicate relationships, and draw.io reserved ids', () => {
    const result = parseArchitecture(`container "Root container" as root
system "System" as system
  container "API" as api
database "Reserved" as 0
system -> api: "uses" as rel
system -> api: "uses" as rel`);
    expect(result.semanticErrors.map((error) => error.code)).toEqual(expect.arrayContaining(['invalid_containment', 'reserved_drawio_id', 'duplicate_relationship_id', 'duplicate_relationship']));
  });
});
