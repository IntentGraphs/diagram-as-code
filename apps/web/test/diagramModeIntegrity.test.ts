import { describe, it, expect } from 'vitest';
import { checkRequiredNamespaces } from '../src/diagramMode.js';

const withDc = '<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://x" xmlns:bpmndi="http://x" xmlns:dc="http://x"><bpmndi:BPMNShape><dc:Bounds x="0" y="0"/></bpmndi:BPMNShape></bpmn2:definitions>';
const withDcAndDi = '<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://x" xmlns:bpmndi="http://x" xmlns:dc="http://x" xmlns:di="http://x"><bpmndi:BPMNEdge><di:waypoint x="0" y="0"/></bpmndi:BPMNEdge></bpmn2:definitions>';

describe('checkRequiredNamespaces', () => {
  it('is clean for a node-only diagram that never uses the "di:" prefix (no edges, so no di:waypoint)', () => {
    // This mirrors a real "New Diagram" export: a lone start event, no edges — omitting
    // xmlns:di is legitimate here, not corruption. Regression test for a false positive found
    // in manual verification (Save was blocked on every brand-new diagram before this fix).
    expect(checkRequiredNamespaces(withDc)).toEqual([]);
  });

  it('is clean when a prefix is both used and declared', () => {
    expect(checkRequiredNamespaces(withDcAndDi)).toEqual([]);
  });

  it('flags content that uses "di:" but never declares "xmlns:di" — the documented namespace-loss corruption mode', () => {
    const corrupted = withDcAndDi.replace(' xmlns:di="http://x"', '');
    const issues = checkRequiredNamespaces(corrupted);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/di:/);
  });

  it('flags content that uses "dc:" but never declares "xmlns:dc"', () => {
    const corrupted = withDc.replace(' xmlns:dc="http://x"', '');
    const issues = checkRequiredNamespaces(corrupted);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/dc:/);
  });
});
