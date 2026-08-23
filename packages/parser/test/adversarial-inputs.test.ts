import { describe, expect, it } from 'vitest';
import { parse } from '../src/index.js';

describe('parse — adversarial input bounds', () => {
  it('returns structured errors for malformed lines without throwing', () => {
    const malformed = [
      '\u0000 not a BPMN statement',
      'task "unterminated as t1',
      'edge ->',
    ].join('\n');

    expect(() => parse(malformed)).not.toThrow();
    const result = parse(malformed);
    expect(result.errors.length).toBe(3);
    expect(result.errors.map(({ line, column }) => ({ line, column }))).toEqual([
      { line: 1, column: 1 },
      { line: 2, column: 1 },
      { line: 3, column: 1 },
    ]);
    expect(result.errors.every(({ message }) => message.startsWith('Could not parse line:'))).toBe(true);
  });

  it('handles a bounded oversized label without unbounded output or a crash', () => {
    const label = 'x'.repeat(256 * 1024);
    const result = parse(`task "${label}" as oversized`);

    expect(result.errors).toEqual([]);
    expect(result.diagram.nodes).toHaveLength(1);
    expect(result.diagram.nodes[0]).toMatchObject({ id: 'oversized', label });
    expect(JSON.stringify(result).length).toBeLessThan(270 * 1024);
  }, 1000);

  it('survives a deterministic corpus of malformed and boundary-shaped lines', () => {
    const corpus = Array.from({ length: 64 }, (_, index) => [
      `task "${'x'.repeat(index % 17)} as n${index}`,
      `${' '.repeat(index % 5)}edge ->`,
      `event start ${index % 2 ? 'timer' : 'unknown'} "E" as e${index}`,
      `task "${String.fromCharCode(0x80 + (index % 64))}" as n${index}`,
    ]).flat();
    for (const line of corpus) expect(() => parse(line)).not.toThrow();
  });

  it('survives seeded fuzz mutations without throwing or producing non-finite coordinates', () => {
    let state = 0x5eed1234;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state;
    };
    for (let index = 0; index < 128; index += 1) {
      const token = Array.from({ length: next() % 24 }, () => String.fromCharCode(32 + (next() % 95))).join('');
      const source = `task "${token.replaceAll('"', '')}" as n${index}\nedge n${index} -> n${(next() % 32)}`;
      const result = parse(source);
      expect(result.diagram.nodes.every((node) => Number.isFinite(node.position?.x ?? 0))).toBe(true);
      expect(result.diagram.nodes.every((node) => Number.isFinite(node.position?.y ?? 0))).toBe(true);
    }
  });
});
