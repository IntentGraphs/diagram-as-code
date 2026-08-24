import { describe, it, expect } from 'vitest';
import { VERIFICATION_DIAGRAMS } from '@bpm/layout-core/test-utils/verificationDiagrams';
import { classifyLayoutComplexity, validate } from '../src/index.js';

describe('validate — terminal outcomes', () => {
  it('returns a parse error immediately, without attempting layout', async () => {
    const result = await validate('this is not valid bpm syntax at all {{{');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].severity).toBe('error');
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toBeUndefined();
  });

  it('returns a semantic error immediately, without attempting layout', async () => {
    const result = await validate('event start terminate "Bad" as s1\ntask "Work" as t1\ns1 -> t1');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors.length).toBe(1);
    expect(result.semanticErrors[0]).toMatchObject({ line: 1, column: 1, severity: 'error' });
    expect(result.semanticErrors[0].message).toMatch(/Start event "s1" cannot use trigger "terminate"/);
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toBeUndefined();
  });

  it('returns a layout-time error (manual-mode overlap) as a single structured error', async () => {
    const text = [
      'positioning: manual',
      '',
      'gateway exclusive "A" as a at (0, 0)',
      'gateway exclusive "B" as b at (10, 10)',
    ].join('\n');
    const result = await validate(text);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toMatch(/overlap at their given positions/);
    expect(result.errors[0].severity).toBe('error');
    expect(result.errors[0]).toMatchObject({ code: 'node_overlap', nodeIds: ['a', 'b'] });
    expect(result.errors[0].suggestion).toMatch(/shift "b"/);
    expect(result.metrics).toBeUndefined();
  });

  it('returns valid: true with empty warnings and populated metrics for a clean diagram', async () => {
    const text = [
      'task "A" as a1',
      'task "B" as b1',
      'a1 -> b1',
    ].join('\n');
    const result = await validate(text);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.metrics).toMatchObject({ edgeCrossings: 0, nodeOverlaps: 0, edgeThroughNode: 0, quality: { grade: 'A', presentationReady: true, score: 100 } });
  });

  it('reports a crossings warning and non-zero metric without failing validity', async () => {
    const result = await validate(VERIFICATION_DIAGRAMS.screenshot);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.metrics!.edgeCrossings).toBeGreaterThan(0);
    expect(result.metrics!.quality.grade).not.toBe('A');
    expect(result.warnings.some((w) => /edge-edge crossing/.test(w.message))).toBe(true);
  });

  it('warns when an edge overshoots through its own target node', async () => {
    const text = `
positioning: manual

task "Host" as host at (300, 80)
boundary timer interrupting "Timeout" as b1 on host
task "Blocker" as blocker at (60, 190)
task "Issue refund" as target at (100, 400)

b1 -> target
`.trim();
    const result = await validate(text);
    expect(result.valid).toBe(true);
    expect(result.metrics?.edgeOvershootsOwnEndpoint).toBe(0);
  });

  it('accepts a manual-mode nested subprocess that Part 2 made legal', async () => {
    const text = [
      'positioning: manual',
      '',
      'subprocess "Handle payment" as sp1 at (40, 40)',
      '  event start none "Sub start" as sn1 at (20, 40)',
      '  task "Charge card" as sn2 at (100, 30)',
      '  sn1 -> sn2',
    ].join('\n');
    const result = await validate(text);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.metrics).toBeDefined();
  });

  it('reports conservative graph-structure warnings without blocking valid BPMN', async () => {
    const result = await validate([
      'event start none "Start" as s1',
      'task "Work" as t1',
      'task "Unused" as orphan',
      's1 -> t1',
      't1 -> t1',
    ].join('\n'));
    expect(result.valid).toBe(false);
    expect(result.semanticErrors).toEqual([expect.objectContaining({ code: 'self_loop' })]);

    const warningResult = await validate([
      'event start none "Start" as s1',
      'task "Work" as t1',
      'task "Unused" as orphan',
      's1 -> t1',
    ].join('\n'));
    expect(warningResult.valid).toBe(true);
    expect(warningResult.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'orphan_node', nodeIds: ['orphan'] }),
      expect.objectContaining({ code: 'missing_terminal_event' }),
    ]));
  });

  it('reports cycles as non-blocking warnings because BPMN loops are allowed', async () => {
    const result = await validate([
      'task "A" as a',
      'task "B" as b',
      'a -> b',
      'b -> a',
    ].join('\n'));
    expect(result.valid).toBe(true);
    expect(result.semanticErrors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'cycle_detected' }),
    ]));
  });
});

describe('validate size limits', () => {
  it('warns about node-size deviations from grouped shapeSize without blocking rendering', async () => {
    const result = await validate([
      'positioning: manual',
      'shapeSize: task (220, 60)',
      'shapeSize: event (50, 50)',
      '',
      'event start none "Start" as s at (0, 10) size (40, 40)',
      'task "Work" as a at (80, 0) size (198, 60)',
      'event end none "End" as e at (320, 10)',
      '',
      's -> a',
      'a -> e',
    ].join('\n'));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'shape_size_override', nodeIds: ['s'] }),
      expect.objectContaining({ code: 'shape_size_override', nodeIds: ['a'] }),
    ]));
  });

  it('rejects source longer than 100000 characters before parse', async () => {
    const text = 'x'.repeat(100_001);
    const result = await validate(text);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /100000|characters|too large|size/i.test(e.message))).toBe(true);
  });

  it('rejects diagrams with more than 500 nodes', async () => {
    const lines = Array.from({ length: 501 }, (_, i) => `task "T${i}" as n${i}`);
    const result = await validate(lines.join('\n'));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /500|nodes/i.test(e.message))).toBe(true);
  });

  it('allows the old 10000-unit threshold to become a manual-render tier', async () => {
    const nodes = Array.from({ length: 72 }, (_, i) => `task "T${i}" as n${i}`);
    const edges = Array.from({ length: 70 }, (_, i) => `n${i} -> n${i + 1}`);
    const result = await validate([...nodes, ...edges].join('\n'));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout_complexity_warning', severity: 'warning' }),
    ]));
  });

  it('rejects diagrams above the hard complexity ceiling before expensive layout', async () => {
    const nodes = Array.from({ length: 201 }, (_, i) => `task "T${i}" as n${i}`);
    const edges = Array.from({ length: 200 }, (_, i) => `n${i} -> n${i + 1}`);
    const result = await validate([...nodes, ...edges].join('\n'));
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout_complexity_exceeded' }),
    ]));
    expect(result.metrics).toBeUndefined();
  });

  it('classifies complexity into warning, manual, and hard-block tiers', () => {
    expect(classifyLayoutComplexity(4_999)).toBe('allow');
    expect(classifyLayoutComplexity(5_000)).toBe('allow');
    expect(classifyLayoutComplexity(5_001)).toBe('warn');
    expect(classifyLayoutComplexity(10_001)).toBe('manual');
    expect(classifyLayoutComplexity(25_001)).toBe('block');
  });
});
