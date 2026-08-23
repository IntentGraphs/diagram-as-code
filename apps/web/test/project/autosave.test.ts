import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAutosave } from '../../src/project/autosave.js';
import { createDefaultProject, resetStoreForTests } from '../../src/project/store.js';

describe('createAutosave', () => {
  beforeEach(async () => {
    await resetStoreForTests();
  });

  it('reports saving and error states while retaining dirty content', async () => {
    let body = 'task "Draft" as n1';
    const states: string[] = [];
    const autosave = createAutosave(
      () => body,
      () => 'missing-diagram',
      undefined,
      0,
      (status) => states.push(status),
    );
    body = 'task "Changed" as n2';

    await expect(autosave.flush()).rejects.toThrow(/Diagram not found/);
    expect(states).toEqual(['saving', 'error']);
    expect(autosave.isDirty()).toBe(true);
  });

  it('retries a failed save successfully and clears dirty state', async () => {
    const { diagram } = await createDefaultProject('task "Draft" as n1');
    let body = 'task "Draft" as n1';
    let fail = true;
    const statuses: string[] = [];
    const autosave = createAutosave(
      () => body,
      () => fail ? 'missing-diagram' : diagram.id,
      undefined,
      0,
      (status) => statuses.push(status),
    );
    body = 'task "Changed" as n2';

    await expect(autosave.flush()).rejects.toThrow();
    fail = false;
    await autosave.retry();
    expect(autosave.isDirty()).toBe(false);
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved']);
  });
});
