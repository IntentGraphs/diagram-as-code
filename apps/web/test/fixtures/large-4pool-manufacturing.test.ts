import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@bpm/parser';
import { executeDiagramSource } from '@bpm/diagram-runtime';
import { assessRenderCost } from '../../src/renderPolicy.js';

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'large-4pool-manufacturing.bpm');
const source = readFileSync(fixturePath, 'utf8');

// This fixture is deliberately large enough to trigger the pathological
// laneBanding/routing cost this branch works around (see
// the render-worker architecture and large-diagram safety work.
// — running the real layout on it can take minutes of pegged CPU, so this
// suite only parse-checks it (cheap, no layout). Full-pipeline behavior for
// this fixture is exercised through the worker (with its 30s timeout) in the
// e2e suite, never synchronously in a unit test.
describe('large-4pool-manufacturing fixture', () => {
  it('parses with no syntax or semantic errors', () => {
    const { errors, semanticErrors } = parse(source.replace(/^render: manual\n\n?/, ''));
    expect(errors).toEqual([]);
    expect(semanticErrors).toEqual([]);
  });

  it('is heavy and admitted (not blocked) under the tiered complexity policy', () => {
    const assessment = assessRenderCost(source);
    expect(assessment.heavy).toBe(true);
    expect(assessment.admission).not.toBe('block');
    expect(assessment.nodeCount).toBeGreaterThan(60);
    expect(assessment.crossPoolEdgeCount).toBeGreaterThan(15);
  });

  it('supports the explicit fast routing profile for a responsive degraded preview', async () => {
    const fastSource = source.replace('render: manual', `render: manual\nrouting: fast`);
    const result = await executeDiagramSource(fastSource);
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned).not.toBeNull();
  });

  it('supports the hybrid routing profile for quality local routes and bounded global routes', async () => {
    const hybridSource = source.replace('render: manual', `render: manual\nrouting: hybrid`);
    const result = await executeDiagramSource(hybridSource);
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned).not.toBeNull();
  });

  it('accepts hybrid as an explicit runtime override when the source has no routing directive', async () => {
    const result = await executeDiagramSource(source, { routing: 'hybrid' });
    expect(result.diagnostics).toEqual([]);
    expect(result.positioned).not.toBeNull();
  });
});
