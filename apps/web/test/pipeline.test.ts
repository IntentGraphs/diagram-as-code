import { describe, it, expect } from 'vitest';
import { runPipeline } from '../src/pipeline.js';

describe('runPipeline', () => {
  it('surfaces an unknown layout engine as an error without returning svg', async () => {
    const text = ['layout: bogus', 'task "Review" as n1'].join('\n');
    const result = await runPipeline(text);
    expect(result.svg).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/Unknown layout engine "bogus"/);
  });

  it('still returns svg for a valid diagram', async () => {
    const result = await runPipeline('task "Review" as n1');
    expect(result.errors).toEqual([]);
    expect(result.family).toBe('bpmn');
    expect(result.capabilities?.editorMode).toBe('bpmn-js');
    expect(result.header?.family).toBe('bpmn');
    expect(result.ast).toBe(result.diagram);
    expect(result.svg).toContain('<svg');
  });

  it('returns grouped shape-size deviations as warnings while still rendering the SVG', async () => {
    const result = await runPipeline([
      'positioning: manual',
      'render: auto',
      'shapeSize: task (220, 60)',
      '',
      'event start none "Start" as s at (0, 10) size (40, 40)',
      'task "Work" as a at (80, 0) size (198, 60)',
      'event end none "End" as e at (320, 10)',
      '',
      's -> a',
      'a -> e',
    ].join('\n'));
    expect(result.errors).toEqual([]);
    expect(result.svg).toContain('<svg');
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'shape_size_override', severity: 'warning' }),
    ]));
  });

  it('accepts an explicit BPMN directive and rejects an unknown family before parsing', async () => {
    const explicit = await runPipeline('diagram: bpmn\ntask "Review" as n1');
    expect(explicit.errors).toEqual([]);
    expect(explicit.svg).toContain('<svg');
    const unknown = await runPipeline('diagram: uml\ntask "Review" as n1');
    expect(unknown.svg).toBeNull();
    expect(unknown.errors[0]).toMatchObject({ code: 'unknown_family', token: 'uml' });
  });

  it('preserves render mode metadata without passing the directive to the family parser', async () => {
    const result = await runPipeline('render: manual\ntask "Review" as n1');
    expect(result.errors).toEqual([]);
    expect(result.header?.renderMode).toBe('manual');
    expect(result.svg).toContain('<svg');
  });

  it('runs the architecture family through the same web pipeline', async () => {
    const result = await runPipeline('diagram: architecture\nx "y" as z');
    expect(result.family).toBe('architecture');
    expect(result.capabilities?.editorMode).toBe('external-export');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('runs the mindmap family through the same web pipeline', async () => {
    const result = await runPipeline('diagram: mindmap\nmindmap "Root" as root\n  mindmap as child');
    expect(result.family).toBe('mindmap');
    expect(result.capabilities?.editorMode).toBe('external-export');
    expect(result.engineName).toBeNull();
    expect(result.svg).toContain('<svg');
    expect(result.executionPositioned).not.toBeNull();
    expect(result.errors).toEqual([]);
  });

  it('preserves family identity when a known family has invalid body text', async () => {
    const result = await runPipeline('diagram: mindmap\nmindmap "Root" as root\n   mindmap "Bad" as bad');
    expect(result.family).toBe('mindmap');
    expect(result.capabilities?.structuredExport).toContain('mindmap-drawio-xml');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exposes the diagram, positioned layout, and selected engine name for a valid diagram', async () => {
    const result = await runPipeline('task "Review" as n1');
    expect(result.errors).toEqual([]);
    expect(result.diagram).not.toBeNull();
    expect(result.diagram!.nodes).toHaveLength(1);
    expect(result.positioned).not.toBeNull();
    expect(result.engineName).toBe('flat');
  });

  it('keeps semantic pagination warnings separate from blocking errors', async () => {
    const result = await runPipeline('paginate: semantic\npool "A"\n  lane "L1"\n    task "a" as a\npool "B"\n  lane "L2"\n    task "b" as b\na -> b');
    expect(result.errors).toEqual([]);
    expect(result.paginated?.pages).toHaveLength(2);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'pagination_cross_page_edge', severity: 'warning' })]));
  });

  it('leaves diagram, positioned, and engineName null when there are parse errors', async () => {
    const result = await runPipeline('layout: bogus\ntask "Review" as n1');
    expect(result.diagram).toBeNull();
    expect(result.positioned).toBeNull();
    expect(result.engineName).toBeNull();
  });

  it('rejects an oversized BPMN graph before layout in the live path', async () => {
    const source = Array.from({ length: 501 }, (_, i) => `task "T${i}" as n${i}`).join('\n');
    const result = await runPipeline(source);
    expect(result.errors).toMatchObject([{ code: 'max_nodes_exceeded', severity: 'error' }]);
    expect(result.positioned).toBeNull();
    expect(result.svg).toBeNull();
  });

  it('rejects a densely cross-linked BPMN graph before layout in the live path', async () => {
    const nodes = Array.from({ length: 251 }, (_, i) => `task "T${i}" as n${i}`);
    const edges = Array.from({ length: 250 }, (_, i) => `n${i} -> n${i + 1}`);
    const result = await runPipeline([...nodes, ...edges].join('\n'));
    expect(result.errors).toMatchObject([{ code: 'layout_complexity_exceeded', severity: 'error' }]);
    expect(result.positioned).toBeNull();
    expect(result.svg).toBeNull();
  });
});

describe('runPipeline onPhase', () => {
  it('reports parsing, layout, and rendering in order for a valid diagram', async () => {
    const phases: string[] = [];
    await runPipeline('task "A" as a', undefined, (phase) => phases.push(phase));
    expect(phases).toEqual(['parsing', 'layout', 'rendering']);
  });

  it('does not report layout/rendering when parsing fails', async () => {
    const phases: string[] = [];
    await runPipeline('diagram: uml\ntask "A" as a', undefined, (phase) => phases.push(phase));
    expect(phases).toEqual(['parsing']);
  });

  it('omitting onPhase behaves exactly as before', async () => {
    const withCallback = await runPipeline('task "A" as a', undefined, () => {});
    const without = await runPipeline('task "A" as a');
    expect(without).toEqual(withCallback);
  });
});
