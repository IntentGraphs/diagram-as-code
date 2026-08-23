import { describe, expect, it } from 'vitest';
import { createRevisionTracker } from '../src/renderRevision.js';

describe('createRevisionTracker', () => {
  it('commits only the newest asynchronous result', () => {
    const tracker = createRevisionTracker<string>();
    const oldRequest = tracker.begin('old');
    const newRequest = tracker.begin('new');

    expect(tracker.commit(oldRequest, 'old result')).toBeNull();
    expect(tracker.commit(newRequest, 'new result')).toEqual({
      revision: newRequest.revision,
      source: 'new',
      value: 'new result',
    });
  });

  it('invalidates a request immediately when the editor changes', () => {
    const tracker = createRevisionTracker<string>();
    const request = tracker.begin('before edit');
    tracker.invalidate();

    expect(tracker.isCurrent(request)).toBe(false);
    expect(tracker.commit(request, 'stale')).toBeNull();
  });

  it('retains the last committed snapshot until a newer one succeeds', () => {
    const tracker = createRevisionTracker<string>();
    const first = tracker.begin('first');
    tracker.commit(first, 'first result');
    const second = tracker.begin('second');

    expect(tracker.committed()).toMatchObject({ source: 'first', value: 'first result' });
    expect(tracker.commit(second, 'second result')).toMatchObject({ source: 'second', value: 'second result' });
  });
});
