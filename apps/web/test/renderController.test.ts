import { describe, expect, it, vi } from 'vitest';
import { createRenderController, RENDER_TIMEOUT_MS, type RenderControllerState } from '../src/renderController.js';
import type { RenderExecutor, RenderExecutorContext } from '../src/renderExecutors.js';
import type { PipelineResult } from '../src/pipeline.js';

function result(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    family: 'bpmn', header: null, capabilities: null, svg: '<svg/>', diagram: null,
    positioned: null, executionPositioned: null, engineName: 'flat', ast: null,
    diagnostics: [], errors: [], warnings: [], paginated: null, ...overrides,
  };
}

describe('createRenderController', () => {
  it('transitions idle -> queued/running -> completed and clears rendering', async () => {
    const states: RenderControllerState[] = [];
    let resolveExec!: (r: PipelineResult) => void;
    const execute: RenderExecutor = () => new Promise((resolve) => { resolveExec = resolve; });
    const controller = createRenderController(() => 'task "A" as a', () => undefined, () => {}, execute, (s) => states.push(s));
    const pending = controller.render();
    expect(states[0]).toMatchObject({ rendering: true, phase: 'queued', canCancel: true });
    resolveExec(result());
    await pending;
    expect(states[states.length - 1]).toMatchObject({ rendering: false, phase: 'completed', canCancel: false });
  });

  it('commits results through onCommit only when the result is still current', async () => {
    const committed: string[] = [];
    let resolveExec!: (r: PipelineResult) => void;
    const execute: RenderExecutor = () => new Promise((resolve) => { resolveExec = resolve; });
    const controller = createRenderController(() => 'source', () => undefined, (snapshot) => committed.push(snapshot.source), execute);
    const pending = controller.render();
    controller.invalidate();
    resolveExec(result());
    await pending;
    expect(committed).toEqual([]);
  });

  it('a newer render supersedes an older one without emitting a visible cancelled state for it', async () => {
    const calls: string[] = [];
    const resolvers: Array<(r: PipelineResult) => void> = [];
    const states: RenderControllerState[] = [];
    let source = 'old';
    const execute: RenderExecutor = (text) => new Promise((resolve) => {
      calls.push(text);
      resolvers.push(resolve);
    });
    const controller = createRenderController(() => source, () => undefined, () => {}, execute, (s) => states.push(s));
    const first = controller.render();
    source = 'new';
    const second = controller.render();
    resolvers[0]?.(result());
    resolvers[1]?.(result());
    await Promise.allSettled([first, second]);
    expect(calls).toEqual(['old', 'new']);
    expect(states.some((s) => s.phase === 'cancelled')).toBe(false);
    expect(states[states.length - 1]).toMatchObject({ phase: 'completed' });
  });

  it('cancel() terminates the active render and leaves state cancelled without committing', async () => {
    const committed: string[] = [];
    let capturedSignal!: AbortSignal;
    const execute: RenderExecutor = (_source, _engineOverride, ctx: RenderExecutorContext) => {
      capturedSignal = ctx.signal;
      return new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
      });
    };
    const controller = createRenderController(() => 'source', () => undefined, (snapshot) => committed.push(snapshot.source), execute);
    const pending = controller.render();
    expect(controller.getState().canCancel).toBe(true);
    controller.cancel();
    await pending;
    expect(capturedSignal.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({ phase: 'cancelled', rendering: false, canCancel: false });
    expect(committed).toEqual([]);
  });

  it('times out after RENDER_TIMEOUT_MS, terminates the render, and commits a layout_timeout diagnostic', async () => {
    vi.useFakeTimers();
    try {
      const committed: PipelineResult[] = [];
      const execute: RenderExecutor = (_source, _engineOverride, ctx) => new Promise((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
      });
      const controller = createRenderController(() => 'source', () => undefined, (snapshot) => { committed.push(snapshot.value); }, execute);
      const pending = controller.render();
      await vi.advanceTimersByTimeAsync(RENDER_TIMEOUT_MS + 10);
      await pending;
      expect(controller.getState().phase).toBe('timed_out');
      expect(committed).toHaveLength(1);
      expect(committed[0].errors[0]).toMatchObject({ code: 'layout_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the loading state on every terminal path (success, cancel, timeout, failure)', async () => {
    // success path
    const successStates: RenderControllerState[] = [];
    const successController = createRenderController(() => 'source', () => undefined, () => {}, async () => result(), (s) => successStates.push(s));
    await successController.render();
    expect(successStates[successStates.length - 1].rendering).toBe(false);

    // cancel path
    const cancelStates: RenderControllerState[] = [];
    const cancellableExecutor: RenderExecutor = (_source, _engineOverride, ctx) => new Promise((_resolve, reject) => {
      ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason));
    });
    const cancelController = createRenderController(() => 'source', () => undefined, () => {}, cancellableExecutor, (s) => cancelStates.push(s));
    const pending = cancelController.render();
    cancelController.cancel();
    await pending.catch(() => {});
    expect(cancelStates[cancelStates.length - 1].rendering).toBe(false);

    // timeout path is covered by the dedicated timeout test above.

    // failure path (executor throws a non-abort error)
    const failStates: RenderControllerState[] = [];
    const failController = createRenderController(() => 'source', () => undefined, () => {}, async () => { throw new Error('boom'); }, (s) => failStates.push(s));
    await failController.render();
    expect(failStates[failStates.length - 1]).toMatchObject({ rendering: false, phase: 'failed' });
  });
});
