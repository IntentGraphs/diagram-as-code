import { describe, it, expect } from 'vitest';
import { activityElementXml, eventElementXml } from '../src/elements.js';

describe('export-xml escapes ids in attributes', () => {
  it('escapes quotes in activity id attributes', () => {
    const xml = activityElementXml(
      {
        kind: 'activity',
        id: 'a"b',
        label: 'Task',
        activityType: 'task',
        collapsed: false,
        children: [],
        childEdges: [],
      } as any,
      () => '',
    );
    expect(xml).not.toMatch(/id="a"b"/);
    expect(xml).toContain('id="a&quot;b"');
  });

  it('escapes attachedToRef on boundary events', () => {
    const xml = eventElementXml({
      kind: 'event',
      id: 'b1',
      label: 'T',
      category: 'intermediate',
      trigger: 'timer',
      interrupting: true,
      attachedToId: 'host"1',
    } as any);
    expect(xml).toContain('attachedToRef="host&quot;1"');
  });
});
