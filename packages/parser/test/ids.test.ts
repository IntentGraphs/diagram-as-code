import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser.js';
import { isValidId } from '../src/tokens.js';

describe('isValidId', () => {
  it('accepts BPMN-safe identifiers', () => {
    for (const id of ['t1', '_x', 'order_1', 'a.b-c', 'A', 'n9']) {
      expect(isValidId(id), id).toBe(true);
    }
  });

  it('rejects unsafe or empty identifiers', () => {
    for (const id of ['1x', 'a"b', 'a<b', 'a b', '', 'a/b', 'yes!']) {
      expect(isValidId(id), id).toBe(false);
    }
  });
});

describe('parse id alphabet', () => {
  it('rejects a node id with a quote', () => {
    const { errors, diagram } = parse('task "X" as a"b');
    expect(errors.some((e) => /id|identifier/i.test(e.message))).toBe(true);
    expect(diagram.nodes).toHaveLength(0);
  });

  it('rejects a node id starting with a digit', () => {
    const { errors } = parse('task "X" as 1x');
    expect(errors.some((e) => /id|identifier/i.test(e.message))).toBe(true);
  });

  it('rejects a boundary host id that is not a valid identifier alphabet', () => {
    // Host must be known first — declare a valid host, then use an invalid id on the boundary itself
    const { errors } = parse('task "Host" as host1\nboundary timer interrupting "T" as bad"id on host1');
    expect(errors.some((e) => /id|identifier/i.test(e.message))).toBe(true);
  });

  it('accepts dotted and hyphenated ids', () => {
    const { errors, diagram } = parse('task "A" as a.b-c\nevent end none "E" as e1\na.b-c -> e1');
    expect(errors).toEqual([]);
    expect(diagram.nodes.map((n) => n.id)).toEqual(['a.b-c', 'e1']);
  });
});
