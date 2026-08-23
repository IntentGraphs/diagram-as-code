import { describe, it, expect } from 'vitest';
import { parseFindings } from '../src/parseFindings.js';

describe('parseFindings', () => {
  it('accepts a JSON array', () => {
    const findings = parseFindings('[{"severity":"error","message":"bad","patch":{"find":"x","replace":"y"}}]');
    expect(findings).toHaveLength(1);
    expect(findings[0].patch).toEqual({ find: 'x', replace: 'y' });
  });

  it('accepts {"findings":[...]} objects from json_object mode', () => {
    const findings = parseFindings('{"findings":[{"severity":"error","message":"bad","patch":{"find":"a","replace":"b"}}]}');
    expect(findings).toHaveLength(1);
    expect(findings[0].patch).toEqual({ find: 'a', replace: 'b' });
  });

  it('treats a lone finding object as a one-element array', () => {
    const findings = parseFindings('{"severity":"error","message":"unknown keyword","patch":{"find":"bogus","replace":"task"}}');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toBe('unknown keyword');
    expect(findings[0].patch).toEqual({ find: 'bogus', replace: 'task' });
  });

  it('keeps an empty replace string', () => {
    const findings = parseFindings('[{"message":"drop","patch":{"find":"x","replace":""}}]');
    expect(findings[0].patch).toEqual({ find: 'x', replace: '' });
  });
});
