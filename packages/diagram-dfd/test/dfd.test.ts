import { describe, expect, it } from 'vitest';
import { layoutDfd } from '../src/layout.js';
import { parseDfd } from '../src/parser.js';
import { renderDfd } from '../src/render.js';
import { dfdScene } from '../src/scene.js';
import { DFD_JSON_EXPORT_FORMAT, dfdAdapter } from '../src/adapter.js';

const source = `diagram: dfd
direction: down
external "Customer" as customer
process "Submit order" as submit
dataStore "Orders" as orders
dataFlow customer -> submit: "order details"
dataFlow submit -> orders: "new order"`;

describe('@bpm/diagram-dfd', () => {
  it('parses the bounded DFD vocabulary with stable source locations', () => {
    const result = parseDfd(source);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.nodes.map((node) => node.kind)).toEqual(['external', 'process', 'dataStore']);
    expect(result.sourceLocations?.nodes.customer).toMatchObject({ line: 3 });
    expect(result.sourceLocations?.edges.f0).toMatchObject({ line: 6 });
  });

  it('rejects missing labels, unknown endpoints, and self flows', () => {
    const result = parseDfd('external "" as a\ndataFlow a -> missing: "x"\ndataFlow a -> a: "loop"');
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors.map((error) => error.code)).toEqual(expect.arrayContaining(['missing_label', 'unknown_flow_endpoint', 'self_flow']));
  });

  it('lays out, renders, and converts to the family-neutral scene', async () => {
    const parsed = parseDfd(source);
    const positioned = await layoutDfd(parsed.ast, { direction: 'down' });
    const scene = dfdScene(positioned);
    expect(scene.nodes).toHaveLength(3);
    expect(scene.edges).toHaveLength(2);
    expect(renderDfd(positioned)).toMatch(/data-node-id="customer"/);
    expect(renderDfd(positioned)).toMatch(/data-edge-id="f0"/);
  });

  it('validates and exports through the family adapter contract', async () => {
    const validation = await dfdAdapter.validate(source);
    expect(validation).toEqual({ valid: true, errors: [], semanticErrors: [], warnings: [] });

    const parsed = dfdAdapter.parse(source);
    const positioned = await dfdAdapter.layout(parsed.ast, { direction: 'down' });
    const exported = dfdAdapter.exportStructured?.(parsed.ast, positioned, DFD_JSON_EXPORT_FORMAT);
    expect(JSON.parse(exported ?? '')).toEqual(parsed.ast);
    expect(dfdAdapter.capabilities.pptx).toBeUndefined();
    expect(() => dfdAdapter.exportStructured?.(parsed.ast, positioned, 'pptx')).toThrow(/Unsupported structured export/);
  });
});
