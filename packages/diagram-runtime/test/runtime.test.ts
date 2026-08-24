import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFamilies,
  DiagramRuntimeError,
  parseDiagramSource,
  getFamily,
  listFamilies,
  readDiagramHeader,
  registerFamily,
  resetFamilies,
  resolveDiagramFamily,
  executeDiagramSource,
  validateDiagramSource,
  exportStructuredDiagram,
  exportPositionedDiagram,
  type DiagramFamilyAdapter,
} from '../src/index.js';

describe('@bpm/diagram-runtime', () => {
  beforeEach(() => resetFamilies());

  it('defaults a directive-free source to BPMN and preserves the source exactly', () => {
    const source = '\n\ntask "Review" as review';
    const header = readDiagramHeader(source);
    expect(header.family).toBe('bpmn');
    expect(header.sourceWithoutDirective).toBe(source);
    expect(header.bodyLine).toBe(3);
    expect(header.diagnostics).toEqual([]);
  });

  it('recognizes an explicit family and removes only its directive line', () => {
    const source = '\ndiagram: mindmap\n\nmindmap "Root" as root';
    const header = readDiagramHeader(source);
    expect(header.family).toBe('mindmap');
    expect(header.directiveLine).toBe(2);
    expect(header.directiveFamily).toBe('mindmap');
    expect(header.sourceWithoutDirective).toBe('\n\n\nmindmap "Root" as root');
    expect(header.bodyLine).toBe(4);
    expect(header.bodyOffset).toBe(source.indexOf('mindmap "Root" as root'));
    expect(header.diagnostics).toEqual([]);
  });

  it('keeps source-map line numbers aligned after shared directives are removed for family parsing', () => {
    const parsed = parseDiagramSource('diagram: bpmn\n\ntask "Review" as review\nreview -> review');
    expect(parsed.result.sourceLocations?.nodes.review).toMatchObject({ line: 3 });
    expect(parsed.result.sourceLocations?.edges.e1).toMatchObject({ line: 4 });
  });

  it('resolves shared defaults and reports laneDirection compatibility diagnostics', () => {
    expect(readDiagramHeader('task "A" as a')).toMatchObject({ family: 'bpmn', direction: 'right', laneDirection: 'horizontal' });
    expect(readDiagramHeader('diagram: flowchart\nbox "A" as a')).toMatchObject({ direction: 'down' });
    expect(readDiagramHeader('diagram: mindmap\nmindmap "A" as a')).toMatchObject({ direction: 'right' });
    expect(readDiagramHeader('diagram: flowchart\nlaneDirection: vertical\nbox "A" as a').diagnostics[0]).toMatchObject({ code: 'lane_direction_wrong_family', token: 'vertical' });
  });

  it('blocks directions that are not implemented by a family adapter', () => {
    expect(readDiagramHeader('diagram: bpmn\ndirection: left\ntask "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported_direction', token: 'left' }),
    ]));
    expect(readDiagramHeader('diagram: architecture\ndirection: right\nsystem "A" as a').diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unsupported_direction', token: 'right' }),
    ]));
    expect(readDiagramHeader('diagram: flowchart\ndirection: left\nbox "A" as a').diagnostics).toEqual([]);
  });

  it('reports structured lane readability findings from positioned BPMN containers', async () => {
    const { inspectPositionedDiagram } = await import('../src/inspection.js');
    const inspection = inspectPositionedDiagram('bpmn', {
      pools: [{ id: 'p', name: 'P', x: 0, y: 0, width: 100, height: 100, lanes: [
        { id: 'l1', name: 'A label that cannot fit', x: 0, y: 0, width: 40, height: 100 },
        { id: 'l2', name: 'B', x: 30, y: 0, width: 40, height: 100 },
      ] }], nodes: [], edges: [],
    });
    expect(inspection.issueDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'lane_label_too_narrow' }),
      expect.objectContaining({ code: 'lane_overlap' }),
    ]));
  });

  it('reports degraded routes, label conflicts, bounds overflow, and containment violations', async () => {
    const { inspectPositionedDiagram } = await import('../src/inspection.js');
    const inspection = inspectPositionedDiagram('flowchart', {
      width: 100, height: 100,
      nodes: [
        { id: 'parent', kind: 'container', label: 'Parent', x: 0, y: 0, width: 50, height: 50, children: [{ id: 'child', label: 'Child', x: 40, y: 40, width: 20, height: 20 }] },
        { id: 'other', label: 'Other', x: 70, y: 70, width: 20, height: 20 },
      ],
      edges: [{ id: 'e1', sourceId: 'child', targetId: 'other', points: [{ x: 45, y: 45 }, { x: 80, y: 80 }], routeStatus: 'degraded', label: 'bad', labelGeometry: { x: 75, y: 85, width: 40, height: 20 } }],
    });
    expect(inspection.metrics).toMatchObject({ degradedRoutes: 1, labelOverlaps: 1, boundsOverflows: 1, containmentViolations: 1 });
    expect(inspection.issueDetails.map((issue) => issue.code)).toEqual(expect.arrayContaining(['route_degraded', 'label_overlap', 'bounds_overflow', 'containment_violation']));
  });

  it('reports degraded routes, label collisions, bounds overflow, and containment violations', async () => {
    const { inspectPositionedDiagram } = await import('../src/inspection.js');
    const inspection = inspectPositionedDiagram('flowchart', {
      width: 100, height: 100,
      nodes: [
        { id: 'parent', kind: 'container', label: 'Parent', x: 0, y: 0, width: 50, height: 50, children: [{ id: 'child', label: 'Child', x: 40, y: 40, width: 30, height: 30 }] },
        { id: 'target', label: 'Target', x: 80, y: 80, width: 30, height: 30 },
      ],
      edges: [{ id: 'e1', sourceId: 'child', targetId: 'target', routeStatus: 'degraded', points: [{ x: 45, y: 45 }, { x: 90, y: 90 }], label: 'x', labelGeometry: { x: 85, y: 85, width: 20, height: 10 } }],
    });
    expect(inspection.metrics).toMatchObject({ degradedRoutes: 1, labelOverlaps: expect.any(Number), boundsOverflows: expect.any(Number), containmentViolations: 1 });
    expect(inspection.issueDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'route_degraded' }),
      expect.objectContaining({ code: 'bounds_overflow' }),
      expect.objectContaining({ code: 'containment_violation' }),
    ]));
  });

  it('passes explicit direction options through the runtime adapter boundary', async () => {
    clearFamilies();
    const layoutSpy = vi.fn(async () => ({}));
    registerFamily({
      id: 'mindmap', parse: () => ({ ast: {}, errors: [], semanticErrors: [] }), layout: layoutSpy,
      render: () => '<svg />', capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    await executeDiagramSource('diagram: mindmap\ndirection: left\nmindmap "Root" as root');
    expect(layoutSpy.mock.calls[0][1]).toEqual({ direction: 'left' });
  });

  it('returns structured diagnostics for unknown, malformed, duplicate, and late directives', () => {
    expect(readDiagramHeader('diagram: uml\nclass "A" as a').diagnostics[0]).toMatchObject({
      code: 'unknown_family',
      line: 1,
      token: 'uml',
    });
    expect(readDiagramHeader('diagram:\ntask "A" as a').diagnostics[0]).toMatchObject({
      code: 'malformed_directive',
      line: 1,
    });
    expect(readDiagramHeader('task "A" as a\ndiagram: mindmap').diagnostics[0]).toMatchObject({
      code: 'late_directive',
      line: 2,
      token: 'mindmap',
    });
    expect(readDiagramHeader('diagram: mindmap\ndiagram: bpmn\nmindmap "A" as a').diagnostics[0]).toMatchObject({
      code: 'duplicate_directive',
      line: 2,
      token: 'bpmn',
    });
  });

  it('registers the built-in family adapters through the runtime composition layer', () => {
    expect(listFamilies()).toEqual(['bpmn', 'mindmap', 'flowchart', 'architecture', 'gantt']);
    expect(getFamily('bpmn').capabilities.structuredExport).toEqual(['bpmn-xml']);
    expect(getFamily('mindmap').capabilities.structuredExport).toEqual(['mindmap-drawio-xml']);
    expect(getFamily('flowchart').capabilities.structuredExport).toEqual(['flowchart-drawio-xml']);
    expect(getFamily('architecture').capabilities.structuredExport).toEqual(['architecture-drawio-xml', 'architecture-c4-json']);
    expect(getFamily('gantt').capabilities.structuredExport).toEqual(['gantt-json', 'gantt-csv']);
  });

  it('advertises capability metadata that distinguishes bpmn-js editing from other editor modes', () => {
    const capabilities = getFamily('bpmn').capabilities;
    expect(capabilities.editorMode).toBe('bpmn-js');
    expect(capabilities.engineOverride).toBe(true);
    expect(capabilities.pptx).toBe(true);
    expect(getFamily('mindmap').capabilities.editorMode).toBe('external-export');
    expect(getFamily('mindmap').capabilities.pptx).toBe(true);
    expect(getFamily('mindmap').capabilities.structuredExports?.[0]).toMatchObject({ format: 'mindmap-drawio-xml', editable: true, roundTrip: 'none', fidelity: 'lossy' });
  });

  it('exports mindmap draw.io XML only through its declared capability', async () => {
    const xml = await exportStructuredDiagram('diagram: mindmap\nmindmap "Root" as root\n  mindmap as child', 'mindmap-drawio-xml');
    expect(xml).toContain('<mxfile');
    await expect(exportStructuredDiagram('diagram: mindmap\nmindmap "Root" as root', 'bpmn-xml')).rejects.toThrow(/does not support structured export/);
  });

  it('exports flowchart draw.io XML through the public runtime API', async () => {
    const xml = await exportStructuredDiagram('diagram: flowchart\nbox "Start" as start\ndecision "Go?" as go\nstart -> go', 'flowchart-drawio-xml');
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('shape=rhombus;');
  });

  it('exports architecture C4 JSON through the public runtime API', async () => {
    const json = await exportStructuredDiagram('diagram: architecture\nsystem "Ordering" as ordering\ndatabase "Orders" as orders\nordering -> orders: "stores"', 'architecture-c4-json');
    expect(JSON.parse(json).elements[0]).toMatchObject({ id: 'ordering', type: 'SoftwareSystem' });
  });

  it('dispatches directive-free and explicit BPMN sources to the BPMN adapter', () => {
    expect(resolveDiagramFamily('task "Review" as review').adapter.id).toBe('bpmn');
    expect(resolveDiagramFamily('diagram: bpmn\ntask "Review" as review').adapter.id).toBe('bpmn');
  });

  it('dispatches mindmap sources through the registered adapter', async () => {
    const result = await executeDiagramSource('diagram: mindmap\nmindmap "Root" as root\n  mindmap as child');
    expect(result.adapter.id).toBe('mindmap');
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('<svg');
  });

  it('returns common geometry inspection for every non-BPMN family', async () => {
    const sources = [
      'diagram: mindmap\nmindmap "Root" as root\n  mindmap "Child" as child',
      'diagram: flowchart\nbox "Start" as start\nbox "End" as end\nstart -> end',
      'diagram: architecture\nperson "Customer" as customer\nsystem "Ordering" as ordering\n  container "API" as api\ncustomer -> api',
      'diagram: gantt\ntask "Release" as release start 2026-01-01 duration 3d',
    ];
    for (const source of sources) {
      const result = await validateDiagramSource(source);
      expect(result.valid).toBe(true);
      expect(result.metrics).toMatchObject({ edgeCrossings: expect.any(Number), nodeOverlaps: expect.any(Number), edgeThroughNode: expect.any(Number), edgeOvershootsOwnEndpoint: expect.any(Number), routeFallbacks: expect.any(Number) });
      expect(result.inspection).toMatchObject({ nodes: expect.any(Array), edges: expect.any(Array), contentBounds: expect.any(Object), renderBounds: expect.any(Object), issueDetails: expect.any(Array) });
      expect(result.inspection?.nodes.length).toBeGreaterThan(0);
    }
  });

  it('fails unknown families before adapter dispatch', () => {
    expect(() => resolveDiagramFamily('diagram: uml\nclass "A" as a')).toThrowError(DiagramRuntimeError);
    try {
      resolveDiagramFamily('diagram: uml\nclass "A" as a');
    } catch (error) {
      expect(error).toBeInstanceOf(DiagramRuntimeError);
      expect((error as DiagramRuntimeError).diagnostics[0]).toMatchObject({
        code: 'unknown_family',
        token: 'uml',
      });
    }
  });

  it('parses directive-free sources through the BPMN adapter without changing the body', () => {
    const parsed = parseDiagramSource('task "Review" as review');
    expect(parsed.adapter.id).toBe('bpmn');
    expect(parsed.header.sourceWithoutDirective).toBe('task "Review" as review');
    expect(parsed.result.errors).toEqual([]);
  });

  it('executes directive-free and explicit BPMN sources through the same adapter', async () => {
    const plain = await executeDiagramSource('task "Review" as review');
    const explicit = await executeDiagramSource('diagram: bpmn\ntask "Review" as review');
    expect(plain.adapter.id).toBe('bpmn');
    expect(explicit.adapter.id).toBe('bpmn');
    expect(plain.svg).toBe(explicit.svg);
  });

  it('renders the manual-tier complexity band and returns a warning instead of blocking', async () => {
    const source = [
      ...Array.from({ length: 72 }, (_, index) => `task "Task ${index}" as n${index}`),
      ...Array.from({ length: 70 }, (_, index) => `n${index} -> n${index + 1}`),
    ].join('\n');
    const result = await executeDiagramSource(source);
    expect(result.svg).toContain('<svg');
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout_complexity_warning', severity: 'warning' }),
    ]));
    const validation = await validateDiagramSource(source);
    expect(validation.warnings.filter((warning) => warning.code === 'layout_complexity_warning')).toHaveLength(1);
  });

  it('enforces structured export capabilities before adapter export code', async () => {
    clearFamilies();
    let invoked = false;
    registerFamily({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: async () => ({}),
      render: () => '<svg />',
      exportStructured: () => { invoked = true; return 'must not be reached'; },
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    await expect(exportStructuredDiagram('diagram: mindmap\nroot', 'bpmn-xml')).rejects.toThrow(/does not support structured export/);
    expect(invoked).toBe(false);
  });

  it('never forwards engineOverride to an adapter whose capabilities do not support it', async () => {
    clearFamilies();
    const layoutSpy = vi.fn(async () => ({}));
    registerFamily({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: layoutSpy,
      render: () => '<svg />',
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    await executeDiagramSource('diagram: mindmap\nroot', { engineOverride: 'flat' });
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    expect(layoutSpy.mock.calls[0][1]).toBeUndefined();
  });

  it('forwards engineOverride to an adapter whose capabilities declare support for it', async () => {
    clearFamilies();
    const layoutSpy = vi.fn(async () => ({}));
    registerFamily({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: layoutSpy,
      render: () => '<svg />',
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: true },
    });
    await executeDiagramSource('diagram: mindmap\nroot', { engineOverride: 'flat' });
    expect(layoutSpy.mock.calls[0][1]).toEqual({ engineOverride: 'flat' });
  });

  it('strips engineOverride before validate() too when the adapter does not support it', async () => {
    clearFamilies();
    const validateSpy = vi.fn(async () => ({ valid: true, errors: [], semanticErrors: [], warnings: [] }));
    registerFamily({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: async () => ({}),
      render: () => '<svg />',
      validate: validateSpy,
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    await validateDiagramSource('diagram: mindmap\nroot', { engineOverride: 'flat' });
    expect(validateSpy.mock.calls[0][1]).toBeUndefined();
  });

  it('exports already-executed ast/positioned values without re-parsing the source', async () => {
    const executed = await executeDiagramSource<unknown, unknown>('task "Review" as review');
    expect(executed.diagnostics).toEqual([]);
    const xml = exportPositionedDiagram('bpmn', executed.result.ast, executed.positioned, 'bpmn-xml');
    expect(xml).toMatch(/definitions/);
  });

  it('rejects exportPositionedDiagram for a family that lacks the requested structured export', () => {
    clearFamilies();
    let invoked = false;
    registerFamily({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: async () => ({}),
      render: () => '<svg />',
      exportStructured: () => { invoked = true; return 'must not be reached'; },
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    expect(() => exportPositionedDiagram('mindmap', {}, {}, 'bpmn-xml')).toThrowError(DiagramRuntimeError);
    expect(invoked).toBe(false);
  });

  it('registers, replaces, lists, and resolves custom family adapters', () => {
    clearFamilies();
    const adapter = (rendered: string): DiagramFamilyAdapter => ({
      id: 'mindmap',
      parse: () => ({ ast: {}, errors: [], semanticErrors: [] }),
      layout: async () => ({}),
      render: () => rendered,
      capabilities: { svg: true, png: true, structuredExport: [], editorMode: 'none', engineOverride: false },
    });
    registerFamily(adapter('first'));
    expect(listFamilies()).toEqual(['mindmap']);
    expect(getFamily('mindmap').render({})).toBe('first');
    registerFamily(adapter('second'));
    expect(listFamilies()).toEqual(['mindmap']);
    expect(getFamily('mindmap').render({})).toBe('second');
  });
});
