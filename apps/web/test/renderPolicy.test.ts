import { describe, expect, it } from 'vitest';
import { assessIncrementalRender, assessRenderCost, renderDebounceMs } from '../src/renderPolicy.js';

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

  it('allows a complex diagram to keep auto-rendering when it grows in small steps', () => {
    const previous = [
      ...Array.from({ length: 100 }, (_, index) => `task "Task ${index}" as n${index}`),
      ...Array.from({ length: 99 }, (_, index) => `n${index} -> n${index + 1}`),
    ].join('\n');
    const next = `${previous}\ntask "Task 100" as n100\nn99 -> n100`;
    const assessment = assessIncrementalRender(previous, next, 400);
    expect(assessment.incremental).toBe(true);
    expect(assessment.allowed).toBe(true);
    expect(assessment.nodeDelta).toBe(1);
    expect(assessment.edgeDelta).toBe(1);
  });

  it('rejects a bulk increase immediately instead of starting automatic layout', () => {
    const previous = 'task "Start" as start';
    const next = Array.from({ length: 80 }, (_, index) => `task "Task ${index}" as n${index}`).join('\n');
    const assessment = assessIncrementalRender(previous, next);
    expect(assessment.incremental).toBe(false);
    expect(assessment.allowed).toBe(false);
    expect(assessment.reason).toContain('too large');
  });
});
