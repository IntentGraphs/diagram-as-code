import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';

describe('BPMN legality — event trigger × category', () => {
  it('rejects self-loops in BPMN control flow', () => {
    const { semanticErrors } = parse([
      'task "Loop" as t1',
      't1 -> t1',
    ].join('\n'));
    expect(semanticErrors).toEqual([expect.objectContaining({ code: 'self_loop', line: 2 })]);
  });

  it('rejects terminate on a start event', () => {
    const { semanticErrors } = parse('event start terminate "Stop" as s1');
    expect(semanticErrors.some((e) => e.message.includes('terminate') && e.message.includes('Start event'))).toBe(true);
  });

  it('rejects cancel on a start event', () => {
    const { semanticErrors } = parse('event start cancel "Cancel" as s1');
    expect(semanticErrors.some((e) => e.message.includes('cancel') && e.message.includes('Start event'))).toBe(true);
  });

  it('rejects compensation on a start event', () => {
    const { semanticErrors } = parse('event start compensation "Comp" as s1');
    expect(semanticErrors.some((e) => e.message.includes('compensation'))).toBe(true);
  });

  it('accepts link on a start event', () => {
    const { semanticErrors } = parse('event start link "Link" as s1');
    expect(semanticErrors).toEqual([]);
  });

  it('accepts error on a start event (BPMN error start)', () => {
    const { semanticErrors } = parse('event start error "Err" as s1');
    expect(semanticErrors.filter((e) => e.message.includes('not valid'))).toHaveLength(0);
  });

  it('rejects timer on an end event', () => {
    const { semanticErrors } = parse([
      'event start none "Go" as s1',
      'task "Work" as t1',
      'event end timer "Done" as e1',
      's1 -> t1',
      't1 -> e1',
    ].join('\n'));
    expect(semanticErrors.some((e) => e.message.includes('timer') && e.message.includes('End event'))).toBe(true);
  });

  it('accepts terminate on an end event', () => {
    const { semanticErrors } = parse([
      'event start none "Go" as s1',
      'event end terminate "Stop" as e1',
      's1 -> e1',
    ].join('\n'));
    expect(semanticErrors.filter((e) => e.message.includes('not valid'))).toHaveLength(0);
  });

  it('rejects none on a boundary event', () => {
    const { semanticErrors } = parse([
      'task "Host" as h1',
      'boundary none interrupting "B" as b1 on h1',
    ].join('\n'));
    expect(semanticErrors.some((e) => e.message.includes('Boundary event') && e.message.includes('none'))).toBe(true);
  });

  it('accepts cancel on a boundary event', () => {
    const { semanticErrors } = parse([
      'task "Host" as h1',
      'boundary cancel interrupting "Cancel" as b1 on h1',
    ].join('\n'));
    expect(semanticErrors.filter((e) => e.message.includes('Boundary event')).length).toBe(0);
  });

  it('rejects terminate on a boundary event', () => {
    const { semanticErrors } = parse([
      'task "Host" as h1',
      'boundary terminate interrupting "Term" as b1 on h1',
    ].join('\n'));
    expect(semanticErrors.some((e) => e.message.includes('terminate'))).toBe(true);
  });
});
