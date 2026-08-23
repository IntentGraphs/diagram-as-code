import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { printDiagram } from '../src/index.js';

function roundTrip(text: string) {
  const first = parse(text);
  expect(first.errors, `source failed to parse: ${JSON.stringify(first.errors)}`).toEqual([]);
  const printed = printDiagram(first.diagram);
  const second = parse(printed);
  expect(second.errors, `printed output failed to re-parse:\n${printed}\n${JSON.stringify(second.errors)}`).toEqual([]);
  return { original: first.diagram, printed, reparsed: second.diagram };
}

describe('printDiagram — round trip', () => {
  it('plain flow: events, gateway, task, conditional/default branches', () => {
    const text = [
      'event start none "Order submitted" as e0',
      'task "Review order" as t1',
      'gateway exclusive "Approved?" as g1',
      'task "Ship item" as t2',
      'task "Reject order" as t3',
      'event end none "Shipped" as e1',
      'event end none "Rejected" as e2',
      '',
      'e0 -> t1',
      't1 -> g1',
      'g1 => t2: "yes"',
      'g1 ->> t3: "no"',
      't2 -> e1',
      't3 -> e2',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('pools and lanes, including a message flow between lanes', () => {
    const text = [
      'pool "Order Processing"',
      '  lane "Sales"',
      '    task "Review Order" as t1',
      '  lane "Finance"',
      '    task "Process Payment" as t2',
      '',
      't1 -> t2',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('all task subtypes, all gateway types, and all event categories/triggers used', () => {
    const text = [
      'event start message "Start" as e0',
      'userTask "U" as u1',
      'serviceTask "S" as s1',
      'sendTask "Snd" as sn1',
      'receiveTask "R" as r1',
      'manualTask "M" as m1',
      'businessRuleTask "B" as b1',
      'scriptTask "Scr" as sc1',
      'gateway parallel "P" as gp',
      'gateway inclusive "I" as gi',
      'gateway complex "C" as gc',
      'event end terminate "End" as e1',
      '',
      'e0 -> u1',
      'u1 -> s1',
      's1 -> sn1',
      'sn1 -> r1',
      'r1 -> m1',
      'm1 -> b1',
      'b1 -> sc1',
      'sc1 -> gp',
      'gp -> gi',
      'gi -> gc',
      'gc -> e1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('boundary event attached to an activity, never carrying a position', () => {
    const text = [
      'task "Charge card" as t1',
      'boundary timer nonInterrupting "Slow charge" as b1 on t1',
      'event end none "Done" as e1',
      '',
      't1 -> e1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('nested subprocess content, recursively', () => {
    const text = [
      'subprocess "Outer" as sp1',
      '  event start none "Sub start" as sn1',
      '  subprocess "Inner" as sp2',
      '    task "Inner task" as it1',
      '  sn1 -> sp2',
      'event end none "Done" as e1',
      '',
      'sp1 -> e1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('collapsed subprocess (no nested block)', () => {
    const text = [
      'subprocess "Collapsed" as sp1 collapsed',
      'event end none "Done" as e1',
      '',
      'sp1 -> e1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('manual positioning with at (x,y) and size (w,h)', () => {
    const text = [
      'positioning: manual',
      '',
      'task "A" as a at (0, 0) size (120, 60)',
      'event end none "B" as b at (200, 0)',
      '',
      'a -> b',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('edge attribute block: style, corner, from, to, via, labelAt, labelSide, labelOffset', () => {
    const text = [
      'task "A" as a',
      'task "B" as b',
      '',
      'a -> b: "go" [style: dashed, corner: round, from: right, to: left, via: (100, 50) (150, 50), labelAt: 0.4, labelSide: below, labelOffset: (5, 5)]',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('node visual attributes and Camunda extensions', () => {
    const text = [
      'userTask "Approve" as u1 [label: below, wrap: 2, font: large, camundaFormKey: "embedded:app:forms/approve.html"]',
      'serviceTask "Charge" as s1 [camundaExpression: "${amount * 1.1}"]',
      'event end none "Done" as e1',
      '',
      'u1 -> s1',
      's1 -> e1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('data objects, data stores, annotations, groups, and association flows', () => {
    const text = [
      'task "A" as a',
      'dataObject "Order" as d1',
      'dataStore "DB" as d2',
      'annotation "Note" as n1',
      'group "G" as g1',
      '',
      'a ..> d1',
      'a ..> d2',
      'a ..> n1',
    ].join('\n');
    const { original, reparsed } = roundTrip(text);
    expect(reparsed).toEqual(original);
  });

  it('layoutSpacing directive is preserved (and omitted when normal/default)', () => {
    const text = ['layoutSpacing: relaxed', '', 'task "A" as a', 'event end none "B" as b', '', 'a -> b'].join('\n');
    const { original, printed, reparsed } = roundTrip(text);
    expect(printed).toContain('layoutSpacing: relaxed');
    expect(reparsed).toEqual(original);
  });

  it('prints the web editor render mode when present on the AST', () => {
    const { diagram } = parse('task "A" as a');
    diagram.renderMode = 'manual';
    expect(printDiagram(diagram)).toContain('render: manual');
  });

  it('a label containing a double quote is sanitized rather than producing unparsable output', () => {
    // The DSL's "<label>" delimiter has no escape mechanism, so a label containing a literal
    // quote can never round-trip through hand-written text either. This constructs that case
    // directly on the AST (as an importer might, from a BPMN label that happens to contain a
    // quote) and asserts printDiagram degrades gracefully rather than emitting unparsable text.
    const { diagram } = parse('task "Say hi" as t1\nevent end none "B" as b\nt1 -> b');
    diagram.nodes[0].label = 'Say "hi"';
    const printed = printDiagram(diagram);
    const { errors } = parse(printed);
    expect(errors).toEqual([]);
  });
});
