import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';

describe('parse edge via / label placement', () => {
  it('parses via waypoints with commas inside parentheses', () => {
    const { errors, diagram } = parse([
      'task "A" as a',
      'task "B" as b',
      'a -> b [via: (10,20) (30,20)]',
    ].join('\n'));
    expect(errors).toEqual([]);
    expect(diagram.edges[0].waypoints).toEqual([{ x: 10, y: 20 }, { x: 30, y: 20 }]);
  });

  it('parses via together with from/to', () => {
    const { errors, diagram } = parse([
      'task "A" as a',
      'task "B" as b',
      'a -> b [from: right, to: left, via: (280,115) (320,115)]',
    ].join('\n'));
    expect(errors).toEqual([]);
    expect(diagram.edges[0]).toMatchObject({
      from: 'right',
      to: 'left',
      waypoints: [{ x: 280, y: 115 }, { x: 320, y: 115 }],
    });
  });

  it('parses labelAt, labelSide, labelOffset', () => {
    const { errors, diagram } = parse([
      'task "A" as a',
      'task "B" as b',
      'a -> b: "yes" [labelAt: 0.3, labelSide: above, labelOffset: (0,-4)]',
    ].join('\n'));
    expect(errors).toEqual([]);
    expect(diagram.edges[0].labelPlacement).toEqual({
      at: 0.3,
      side: 'above',
      offset: { x: 0, y: -4 },
    });
  });

  it('rejects malformed via', () => {
    const { errors } = parse('task "A" as a\ntask "B" as b\na -> b [via: nope]');
    expect(errors.some((e) => /via/i.test(e.message))).toBe(true);
  });
});

describe('parse node size and visual', () => {
  it('parses size and visual on a task', () => {
    const { errors, diagram } = parse(
      'task "Review" as review at (120, 80) size (180, 70) [label: inside, wrap: 3, font: normal, align: center]',
    );
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({
      position: { x: 120, y: 80 },
      sizeHint: { width: 180, height: 70 },
      visual: { label: 'inside', wrap: 3, font: 'normal', align: 'center' },
    });
  });

  it('rejects non-positive size', () => {
    const { errors } = parse('task "A" as a size (0, 10)');
    expect(errors.some((e) => /size/i.test(e.message))).toBe(true);
  });
});

describe('parse layoutSpacing', () => {
  it('accepts layoutSpacing: relaxed', () => {
    const { errors, diagram } = parse('layoutSpacing: relaxed\n\ntask "A" as a');
    expect(errors).toEqual([]);
    expect(diagram.layoutSpacing).toBe('relaxed');
  });

  it('rejects unknown layoutSpacing', () => {
    const { errors } = parse('layoutSpacing: huge\n\ntask "A" as a');
    expect(errors.some((e) => /layoutSpacing/i.test(e.message))).toBe(true);
  });
});

describe('parse routing', () => {
  it('accepts the opt-in fast routing profile', () => {
    const { errors, diagram } = parse('routing: fast\n\ntask "A" as a');
    expect(errors).toEqual([]);
    expect(diagram.routing).toBe('fast');
  });

  it('accepts the hybrid routing profile', () => {
    const { errors, diagram } = parse('routing: hybrid\n\ntask "A" as a');
    expect(errors).toEqual([]);
    expect(diagram.routing).toBe('hybrid');
  });

  it('rejects an unknown routing profile', () => {
    const { errors } = parse('routing: turbo\n\ntask "A" as a');
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_routing' }),
    ]));
  });
});

describe('parse Camunda vendor attributes', () => {
  it('parses camundaClass on a service task', () => {
    const { errors, diagram } = parse('serviceTask "Charge" as s1 [camundaClass: com.example.ChargeDelegate]');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({
      activityType: 'serviceTask',
      camunda: { class: 'com.example.ChargeDelegate' },
    });
  });

  it('parses camundaExpression on a service task', () => {
    const { errors, diagram } = parse('serviceTask "Tax" as s1 [camundaExpression: "${amount * 1.1}"]');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({
      camunda: { expression: '${amount * 1.1}' },
    });
  });

  it('parses camundaFormKey on a user task', () => {
    const { errors, diagram } = parse(
      'userTask "Approve" as u1 [camundaFormKey: "embedded:app:forms/approve.html"]',
    );
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({
      activityType: 'userTask',
      camunda: { formKey: 'embedded:app:forms/approve.html' },
    });
  });

  it('allows mixing visual keys with camundaFormKey', () => {
    const { errors, diagram } = parse(
      'userTask "Approve" as u1 [label: inside, camundaFormKey: embedded:app:forms/approve.html]',
    );
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toMatchObject({
      visual: { label: 'inside' },
      camunda: { formKey: 'embedded:app:forms/approve.html' },
    });
  });

  it('rejects combining camundaClass and camundaExpression', () => {
    const { errors } = parse(
      'serviceTask "X" as s1 [camundaClass: com.example.A, camundaExpression: "${x}"]',
    );
    expect(errors.some((e) => /cannot be combined/.test(e.message))).toBe(true);
  });

  it('rejects camundaClass on a user task', () => {
    const { errors } = parse('userTask "Approve" as u1 [camundaClass: com.example.A]');
    expect(errors.some((e) => /only valid on serviceTask/.test(e.message))).toBe(true);
  });

  it('rejects camundaFormKey on a service task', () => {
    const { errors } = parse('serviceTask "Charge" as s1 [camundaFormKey: form/a]');
    expect(errors.some((e) => /only valid on userTask/.test(e.message))).toBe(true);
  });
});
