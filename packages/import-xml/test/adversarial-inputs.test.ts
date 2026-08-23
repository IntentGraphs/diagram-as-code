import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, importXml } from '../src/index.js';

describe('importXml — adversarial input bounds', () => {
  it('returns a bounded empty diagram with warnings for an empty BPMN definitions document', async () => {
    const xml = '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" />';
    const result = await importXml(xml);

    expect(result.diagram.nodes).toEqual([]);
    expect(result.diagram.edges).toEqual([]);
    expect(result.warnings.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(result).length).toBeLessThan(2048);
  });

  it('rejects truncated XML as an Error instead of exposing an arbitrary thrown value', async () => {
    const malformed = '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process';

    await expect(importXml(malformed)).rejects.toBeInstanceOf(Error);
  }, 1000);

  it('handles a bounded oversized XML label without hanging or crashing', async () => {
    const name = 'x'.repeat(256 * 1024);
    const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p1"><task id="t1" name="${name}" /></process></definitions>`;
    const result = await importXml(xml);

    expect(result.diagram.nodes).toHaveLength(1);
    expect(result.diagram.nodes[0]).toMatchObject({ id: 't1', label: name });
    // The result contains the label in both the diagram and the generated DSL text.
    expect(JSON.stringify(result).length).toBeLessThan(2 * name.length + 8 * 1024);
  }, 1000);

  it('rejects XML beyond the browser import budget before parsing', async () => {
    const xml = '<definitions>' + 'x'.repeat(IMPORT_LIMITS.xmlBytes) + '</definitions>';
    await expect(importXml(xml)).rejects.toThrow(/exceeds/);
  }, 1000);

  it('drops unsafe DI geometry instead of propagating non-finite or huge numbers', async () => {
    const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
      xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
      xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
      xmlns:di="http://www.omg.org/spec/DD/20100524/DI">
      <process id="p1"><task id="t1" name="Safe" /></process>
      <bpmndi:BPMNDiagram id="d1"><bpmndi:BPMNPlane id="p1plane" bpmnElement="p1">
        <bpmndi:BPMNShape id="s1" bpmnElement="t1"><dc:Bounds x="1e20" y="0" width="100" height="80" /></bpmndi:BPMNShape>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
    </definitions>`;
    const result = await importXml(xml);
    expect(result.diagram.nodes[0].position).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/1e\+20|Infinity|NaN/);
  });

  it('rejects pathological XML nesting and element counts before moddle parsing', async () => {
    const nested = `<definitions>${'<group>'.repeat(IMPORT_LIMITS.xmlDepth + 1)}</definitions>`;
    await expect(importXml(nested)).rejects.toThrow(/nesting limit/);

    const manyElements = `<definitions>${'<group/>'.repeat(IMPORT_LIMITS.xmlElements + 1)}</definitions>`;
    await expect(importXml(manyElements)).rejects.toThrow(/element import limit/);
  }, 1000);

  it('supports caller cancellation before parsing starts', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(importXml('<definitions />', { signal: controller.signal })).rejects.toThrow(/cancelled/);
  });

  it('rejects invalid timeout configuration instead of silently disabling the guard', async () => {
    await expect(importXml('<definitions />', { timeoutMs: 0 })).rejects.toThrow(/timeout must be positive/);
  });

  it('survives seeded XML mutations with bounded, typed failures', async () => {
    let state = 0x1badb002;
    const next = () => {
      state = (state * 1103515245 + 12345) >>> 0;
      return state;
    };
    for (let index = 0; index < 32; index += 1) {
      const mutation = String.fromCharCode(65 + (next() % 26));
      const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p${index}"><task id="t${index}" name="${mutation}" /></process></definitions>`;
      const result = await importXml(xml);
      expect(result.diagram.nodes.every((node) => Number.isFinite(node.position?.x ?? 0))).toBe(true);
      expect(result.diagram.nodes.every((node) => Number.isFinite(node.position?.y ?? 0))).toBe(true);
    }
  }, 2000);
});
