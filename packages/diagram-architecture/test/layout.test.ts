import { describe, expect, it } from 'vitest';
import { layoutArchitecture } from '../src/layout.js';
import { parseArchitecture } from '../src/parser.js';

describe('architecture layout', () => {
  it.each(['right', 'left', 'down', 'up'] as const)('honors explicit %s direction', async (direction) => {
    const parsed = parseArchitecture(`direction: ${direction}\nperson "A" as a\nperson "B" as b\na -> b`);
    expect(parsed.errors).toEqual([]);
    const positioned = await layoutArchitecture(parsed.ast);
    const a = positioned.nodes.find((node) => node.id === 'a')!;
    const b = positioned.nodes.find((node) => node.id === 'b')!;
    const deltaX = (b.x + b.width / 2) - (a.x + a.width / 2);
    const deltaY = (b.y + b.height / 2) - (a.y + a.height / 2);
    if (direction === 'right') expect(deltaX).toBeGreaterThan(0);
    if (direction === 'left') expect(deltaX).toBeLessThan(0);
    if (direction === 'down') expect(deltaY).toBeGreaterThan(0);
    if (direction === 'up') expect(deltaY).toBeLessThan(0);
  });
  it('lays out compound nodes and includes edge geometry in bounds', async () => {
    const parsed = parseArchitecture(`person "Customer" as customer
system "Ordering" as ordering
  container "API" as api
    component "Checkout" as checkout
database "Orders" as orders
customer -> checkout: "places order"
checkout -> orders: "stores order"`);
    expect(parsed.semanticErrors).toEqual([]);
    const positioned = await layoutArchitecture(parsed.ast);
    const all = positioned.nodes.flatMap((node) => [node, ...node.children, ...node.children.flatMap((child) => child.children)]);
    expect(all.find((node) => node.id === 'checkout')?.parentId).toBe('api');
    expect(positioned.edges).toHaveLength(2);
    expect(positioned.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(positioned.width).toBeGreaterThan(0);
    expect(positioned.height).toBeGreaterThan(0);
  });

  it.each(['right', 'left', 'down', 'up'] as const)('honors the %s direction', async (direction) => {
    const ast = parseArchitecture('person "A" as a\nperson "B" as b\na -> b').ast;
    const positioned = await layoutArchitecture(ast, { direction });
    const a = positioned.nodes.find((node) => node.id === 'a')!;
    const b = positioned.nodes.find((node) => node.id === 'b')!;
    if (direction === 'right') expect(b.x).toBeGreaterThan(a.x);
    if (direction === 'left') expect(b.x).toBeLessThan(a.x);
    if (direction === 'down') expect(b.y).toBeGreaterThan(a.y);
    if (direction === 'up') expect(b.y).toBeLessThan(a.y);
  });
});
