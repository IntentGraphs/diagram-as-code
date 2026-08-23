import { describe, expect, it } from 'vitest';
import { inspectAgentGeometry } from '../../src/agent/geometry.js';
import { planFromDescription, validatePlan, type AgentDiagramState } from '../../src/agent/diagramActions.js';
import { candidateRoutes, chooseRoute } from '../../src/agent/routes.js';
import { manualDiagramAgentProvider } from '../../src/agent/provider.js';

describe('manual diagram agent action contract', () => {
  it('creates an explicit, bounded manual plan from an offline description', () => {
    const plan = planFromDescription('Review order -> Approve payment -> Ship order');
    expect(validatePlan(plan)).toEqual([]);
    expect(plan.actions.filter((action) => action.type === 'createShape')).toHaveLength(5);
    expect(plan.actions.every((action) => action.type !== 'createShape' || Number.isFinite(action.x))).toBe(true);
  });

  it('rejects unsafe action values before they reach BPMN.js', () => {
    const errors = validatePlan({
      title: 'bad',
      explanation: '',
      actions: [{ type: 'moveShape', id: 'task', x: Number.NaN, y: 20 }],
    });
    expect(errors.some((error) => error.includes('finite'))).toBe(true);
  });
});

describe('manual geometry gates', () => {
  const base: AgentDiagramState = {
    nodes: [
      { id: 'a', type: 'bpmn:Task', label: 'A', x: 0, y: 0, width: 100, height: 80, container: false },
      { id: 'b', type: 'bpmn:Task', label: 'B', x: 40, y: 20, width: 100, height: 80, container: false },
    ],
    edges: [],
  };

  it('detects node overlap as a hard failure', () => {
    expect(inspectAgentGeometry(base).hardValid).toBe(false);
    expect(inspectAgentGeometry(base).nodeOverlaps).toEqual(['a:b']);
  });

  it('detects an edge cutting through an unrelated node', () => {
    const state: AgentDiagramState = {
      nodes: [
        { id: 'a', type: 'bpmn:Task', label: 'A', x: 0, y: 0, width: 40, height: 40, container: false },
        { id: 'blocker', type: 'bpmn:Task', label: 'Blocker', x: 80, y: 0, width: 40, height: 40, container: false },
        { id: 'b', type: 'bpmn:Task', label: 'B', x: 160, y: 0, width: 40, height: 40, container: false },
      ],
      edges: [{ id: 'flow', type: 'bpmn:SequenceFlow', sourceId: 'a', targetId: 'b', points: [{ x: 40, y: 20 }, { x: 200, y: 20 }] }],
    };
    expect(inspectAgentGeometry(state).edgeThroughNode).toEqual(['flow']);
  });
});

describe('manual route candidates', () => {
  it('offers an obstacle-clearing orthogonal route', () => {
    const routes = candidateRoutes({ x: 0, y: 20 }, { x: 200, y: 20 }, [{ x: 80, y: 0, width: 40, height: 40 }]);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.some((route) => route.length > 2)).toBe(true);
    expect(routes.every((route) => route.slice(0, -1).every((point, index) => point.x === route[index + 1].x || point.y === route[index + 1].y))).toBe(true);
  });

  it('supports a high-level corridor preference without requiring the model to calculate every bend', () => {
    const route = chooseRoute({ x: 0, y: 20 }, { x: 200, y: 20 }, [{ x: 80, y: 0, width: 40, height: 40 }], 'bottom');
    expect(Math.max(...route.map((point) => point.y))).toBeGreaterThan(40);
  });
});

describe('offline surgical agent', () => {
  it('parses a relative move without an API key', async () => {
    const plan = await manualDiagramAgentProvider.plan('fix', 'move a right of b', {
      nodes: [
        { id: 'a', type: 'bpmn:Task', label: 'A', x: 0, y: 0, width: 80, height: 40, container: false },
        { id: 'b', type: 'bpmn:Task', label: 'B', x: 200, y: 100, width: 80, height: 40, container: false },
      ],
      edges: [],
    });
    expect(plan.actions).toEqual([{ type: 'moveShape', id: 'a', x: 320, y: 100 }]);
  });
});
