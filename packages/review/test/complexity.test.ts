import { describe, expect, it } from 'vitest';
import { assessDiagramComplexity, recommendAgentWorkflow } from '../src/complexity.js';

describe('complexity-aware agent routing', () => {
  it('keeps a small architecture diagram on deterministic checks', () => {
    const assessment = assessDiagramComplexity(`diagram: architecture
person "Customer" as customer
system "Ordering" as ordering
  container "API" as api
customer -> api: "places order"`);
    expect(assessment.family).toBe('architecture');
    expect(assessment.nodeCount).toBe(3);
    expect(assessment.nestedNodeCount).toBe(1);
    expect(assessment.tier).toBe('deterministic');
    expect(recommendAgentWorkflow(assessment).agents.map((agent) => agent.role)).toEqual(['layout', 'geometry-critic']);
  });

  it('escalates dense nested topology while keeping layout deterministic', () => {
    const nodes = Array.from({ length: 60 }, (_, index) => `  container "Container ${index}" as c${index}`).join('\n');
    const edges = Array.from({ length: 59 }, (_, index) => `c${index} -> c${index + 1}: "relationship ${index}"`).join('\n');
    const assessment = assessDiagramComplexity(`diagram: architecture
system "Large system" as system
${nodes}
${edges}`);
    expect(assessment.nodeCount).toBe(61);
    expect(assessment.edgeCount).toBe(59);
    expect(assessment.tier).toBe('strong-review');
    const recommendation = recommendAgentWorkflow(assessment);
    expect(recommendation.agents.find((agent) => agent.role === 'layout')?.execution).toBe('deterministic');
    expect(recommendation.agents.find((agent) => agent.role === 'visual-critic')?.execution).toBe('strong-review');
  });
});
