import { describe, it, expect, beforeEach } from 'vitest';
import type { Diagram } from '@bpm/ast';
import {
  registerEngine, clearEngines, selectEngine, getEngineByName, type LayoutEngine,
} from '../src/index.js';
import type { PositionedDiagram } from '../src/types.js';

const emptyPositioned: PositionedDiagram = { pools: [], nodes: [], edges: [] };

function fakeEngine(name: string, matches: (d: Diagram) => boolean): LayoutEngine {
  return {
    name,
    matches,
    async layout() { return emptyPositioned; },
  };
}

const baseDiagram: Diagram = { pools: [], nodes: [], edges: [] };
const pooledDiagram: Diagram = {
  pools: [{ id: 'p1', name: 'P', lanes: [{ id: 'l1', name: 'L', nodeIds: [] }] }],
  nodes: [],
  edges: [],
};

describe('selectEngine', () => {
  beforeEach(() => clearEngines());

  it('picks the first registered engine whose matches() returns true', () => {
    registerEngine(fakeEngine('swimlane', (d) => d.pools.some((p) => p.lanes.length > 0)));
    registerEngine(fakeEngine('flat', () => true));
    expect(selectEngine(pooledDiagram).name).toBe('swimlane');
    expect(selectEngine(baseDiagram).name).toBe('flat');
  });

  it('honors an explicit diagram.layout override over matches()', () => {
    registerEngine(fakeEngine('swimlane', (d) => d.pools.some((p) => p.lanes.length > 0)));
    registerEngine(fakeEngine('flat', () => true));
    expect(selectEngine({ ...pooledDiagram, layout: 'flat' }).name).toBe('flat');
  });

  it('throws a clear error when an explicit name has no registered engine', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(() => selectEngine({ ...baseDiagram, layout: 'bogus' })).toThrow(
      /Unknown layout engine "bogus"/,
    );
  });

  it('throws when no engine matches and no directive is set', () => {
    registerEngine(fakeEngine('swimlane', () => false));
    expect(() => selectEngine(baseDiagram)).toThrow(/No layout engine matched/);
  });
});

describe('getEngineByName', () => {
  beforeEach(() => clearEngines());

  it('returns the engine with a matching name', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(getEngineByName('flat').name).toBe('flat');
  });

  it('throws a clear error when no engine has that name', () => {
    registerEngine(fakeEngine('flat', () => true));
    expect(() => getEngineByName('bogus')).toThrow(/Unknown layout engine "bogus"/);
  });
});
