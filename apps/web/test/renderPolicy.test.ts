import { describe, expect, it } from 'vitest';
import { assessRenderCost, renderDebounceMs } from '../src/renderPolicy.js';

describe('renderDebounceMs', () => {
  it('keeps small diagrams responsive', () => {
    expect(renderDebounceMs('task "A" as a')).toBe(300);
  });

  it('gives large swimlane diagrams more time to settle', () => {
    const source = `layout: swimlane\n${Array.from({ length: 120 }, (_, index) => `task "Task ${index}" as n${index}`).join('\n')}`;
    expect(renderDebounceMs(source)).toBe(800);
  });

  it('classifies dense multi-pool routing as heavy before layout', () => {
    const source = [
      'layout: swimlane',
      'pool "A"',
      '  lane "Work"',
      ...Array.from({ length: 48 }, (_, index) => `    task "Task ${index}" as n${index}`),
      ...Array.from({ length: 58 }, (_, index) => `n${index % 48} -> n${(index + 1) % 48}`),
    ].join('\n');
    const assessment = assessRenderCost(source);
    expect(assessment.heavy).toBe(true);
    expect(assessment.nodeCount).toBe(48);
    expect(assessment.edgeCount).toBe(58);
    expect(assessment.admission).toBe('allow');
  });

  it('keeps small diagrams on the live path', () => {
    const assessment = assessRenderCost('task "A" as a\ntask "B" as b\na -> b');
    expect(assessment.heavy).toBe(false);
    expect(assessment.reasons).toEqual([]);
  });

  it('classifies a diagram just above the soft budget as manual-render eligible', () => {
    const source = [
      ...Array.from({ length: 101 }, (_, index) => `task "Task ${index}" as n${index}`),
      ...Array.from({ length: 100 }, (_, index) => `n${index} -> n${index + 1}`),
    ].join('\n');
    const assessment = assessRenderCost(source);
    expect(assessment.layoutComplexity).toBe(10_100);
    expect(assessment.admission).toBe('manual');
    expect(assessment.heavy).toBe(true);
  });
});
