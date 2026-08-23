import { describe, it, expect } from 'vitest';
import { applyPatches, repairLoop, type WebFinding } from '../src/reviewProviders.js';

const VALID_ONE_LINER = 'event start none "Go" as s1\nevent end none "Done" as e1\ns1 -> e1';

describe('applyPatches', () => {
  it('applies every patch whose find still matches, skips ones that no longer match', () => {
    const { text, applied } = applyPatches('a b c', [
      { find: 'b', replace: 'B' },
      { find: 'zzz', replace: 'Z' },
    ]);
    expect(text).toBe('a B c');
    expect(applied).toBe(1);
  });
});

describe('repairLoop', () => {
  it('returns immediately without calling repairFn when the text is already valid', async () => {
    let calls = 0;
    const result = await repairLoop(VALID_ONE_LINER, async () => { calls += 1; return []; });
    expect(calls).toBe(0);
    expect(result.valid).toBe(true);
    expect(result.attempts).toBe(0);
  });

  it('converges over multiple rounds when a single patch is not enough', async () => {
    // Mirrors the real "process X" bug: round 1 removes the invalid line, which then reveals a
    // second, independent problem (a dangling edge reference) that only becomes visible once the
    // file parses far enough for the validator to check it.
    const broken = [
      'process Something',
      'event start none "Go" as s1',
      'task "Work" as t1',
      's1 -> t1',
      't1 -> missingNode',
    ].join('\n');

    let call = 0;
    const result = await repairLoop(broken, async () => {
      call += 1;
      if (call === 1) {
        return [{
          severity: 'error', category: 'other', message: 'invalid "process" line', source: 'model',
          patch: { find: 'process Something\n', replace: '' },
        }];
      }
      return [{
        severity: 'error', category: 'other', message: 'dangling edge target', source: 'model',
        patch: { find: 't1 -> missingNode', replace: 't1 -> s1' },
      }];
    }, 3);

    expect(call).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.valid).toBe(true);
    expect(result.text).not.toContain('process Something');
    expect(result.text).not.toContain('missingNode');
  });

  it('stops without looping forever when repairFn makes no further progress', async () => {
    let calls = 0;
    const result = await repairLoop('process Bogus\ntask "X" as t1', async () => {
      calls += 1;
      return [{ severity: 'error', category: 'other', message: 'no patch available', source: 'model' }];
    }, 3);

    expect(calls).toBe(1);
    expect(result.attempts).toBe(1);
    expect(result.valid).toBe(false);
  });

  it('gives up after maxAttempts even if repairFn keeps returning applicable-but-insufficient patches', async () => {
    let calls = 0;
    const result = await repairLoop('process Bogus\ntask "X1" as t1', async () => {
      calls += 1;
      // Always "applies" (identity patch — never actually changes anything, never touches the
      // real blocking line) so the loop keeps making "progress" without ever converging.
      return [{
        severity: 'error', category: 'other', message: 'cosmetic', source: 'model',
        patch: { find: 'task "X1" as t1', replace: 'task "X1" as t1' },
      }];
    }, 3);

    expect(calls).toBe(3);
    expect(result.attempts).toBe(3);
    expect(result.valid).toBe(false);
  });
});
