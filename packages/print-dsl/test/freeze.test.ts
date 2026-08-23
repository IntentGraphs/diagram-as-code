import { describe, expect, it } from 'vitest';
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { validate } from '@bpm/validate';
import { freezeDiagram, printDiagram } from '../src/index.js';

async function freeze(text: string) {
  const parsed = parse(text);
  expect(parsed.errors).toEqual([]);
  const positioned = await layout(parsed.diagram);
  const frozen = freezeDiagram(parsed.diagram, positioned);
  const printed = printDiagram(frozen);
  const reparsed = parse(printed);
  expect(reparsed.errors, printed).toEqual([]);
  return { positioned, frozen, printed, reparsed };
}

describe('freezeDiagram', () => {
  it('freezes a flat auto-layout diagram into valid manual text', async () => {
    const result = await freeze([
      'event start none "Start" as s',
      'task "Review order" as review',
      'gateway exclusive "Approved?" as decision',
      'task "Ship" as ship',
      'event end none "Done" as done',
      '',
      's -> review',
      'review -> decision',
      'decision -> ship: "yes"',
      'ship -> done',
    ].join('\n'));

    expect(result.frozen.positioning).toBe('manual');
    expect(result.frozen.nodes.every((node) => node.kind === 'event' && node.attachedToId ? !node.position : Boolean(node.position))).toBe(true);
    const validation = await validate(result.printed);
    expect(validation.valid).toBe(true);
    expect(validation.metrics?.nodeOverlaps).toBe(0);
    expect(validation.metrics?.edgeThroughNode).toBe(0);
  });

  it('rebases pooled nodes to lane-local coordinates', async () => {
    const result = await freeze([
      'pool "Order"',
      '  lane "Sales"',
      '    task "Review" as review',
      '  lane "Warehouse"',
      '    task "Ship" as ship',
      '',
      'review -> ship',
    ].join('\n'));

    const sales = result.frozen.nodes.find((node) => node.id === 'review');
    const warehouse = result.frozen.nodes.find((node) => node.id === 'ship');
    expect(sales?.position?.y).toBeGreaterThanOrEqual(0);
    expect(warehouse?.position?.y).toBeGreaterThanOrEqual(0);
    expect(result.reparsed.diagram.positioning).toBe('manual');
    expect((await validate(result.printed)).valid).toBe(true);
  });

  it('freezes nested subprocess children and child routes', async () => {
    const result = await freeze([
      'subprocess "Payment" as payment',
      '  event start none "Begin" as begin',
      '  task "Charge" as charge',
      '  event end none "Paid" as paid',
      '  begin -> charge',
      '  charge -> paid',
      'event end none "Complete" as complete',
      '',
      'payment -> complete',
    ].join('\n'));

    const subprocess = result.reparsed.diagram.nodes.find((node) => node.id === 'payment');
    expect(subprocess?.kind).toBe('activity');
    expect((subprocess as any).children.every((node: any) => node.position || node.attachedToId)).toBe(true);
    expect((await validate(result.printed)).valid).toBe(true);
  });
});
