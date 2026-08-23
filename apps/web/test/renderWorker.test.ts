import { describe, expect, it } from 'vitest';
import { handleRenderRequest, type WorkerResponse } from '../src/renderWorker.js';

describe('handleRenderRequest', () => {
  it('posts phase events then a successful result, tagged with the request id', async () => {
    const messages: WorkerResponse[] = [];
    await handleRenderRequest(
      { type: 'render', requestId: 7, source: 'task "A" as a' },
      (message) => messages.push(message),
    );
    const phases = messages.filter((m) => m.type === 'phase').map((m) => (m as { phase: string }).phase);
    expect(phases).toEqual(['queued', 'parsing', 'layout', 'rendering']);
    expect(messages.every((m) => m.requestId === 7)).toBe(true);
    const result = messages[messages.length - 1];
    expect(result).toMatchObject({ type: 'result', ok: true });
  });

  it('posts a successful result with in-band diagnostics for invalid source (runPipeline never throws)', async () => {
    const messages: WorkerResponse[] = [];
    await handleRenderRequest(
      { type: 'render', requestId: 1, source: 'diagram: uml\ntask "A" as a' },
      (message) => messages.push(message),
    );
    const result = messages[messages.length - 1];
    expect(result).toMatchObject({ type: 'result', ok: true });
    expect((result as { result: { errors: unknown[] } }).result.errors.length).toBeGreaterThan(0);
  });
});
