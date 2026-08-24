import { describe, expect, it, vi } from 'vitest';
import {
  createWorkerRenderExecutor,
  createFallbackRenderExecutor,
  isWorkerSupported,
  WORKER_REQUIRED_DIAGNOSTIC,
} from '../src/renderExecutors.js';
import type { WorkerRequest, WorkerResponse } from '../src/renderWorker.js';
import type { RenderAssessment } from '../src/renderPolicy.js';
import type { PipelineResult } from '../src/pipeline.js';

function assessment(overrides: Partial<RenderAssessment> = {}): RenderAssessment {
  return { heavy: false, hardBlocked: false, score: 0, layoutComplexity: 0, admission: 'allow', nodeCount: 0, edgeCount: 0, poolCount: 0, laneCount: 0, crossPoolEdgeCount: 0, reasons: [], ...overrides };
}

class FakeWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: WorkerRequest[] = [];
  postMessage(message: WorkerRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  emit(message: WorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }
}

describe('createWorkerRenderExecutor', () => {
  it('resolves with the result posted for the matching request id', async () => {
    let worker!: FakeWorker;
    const executor = createWorkerRenderExecutor(() => { worker = new FakeWorker(); return worker as unknown as Worker; });
    const controller = new AbortController();
    const phases: string[] = [];
    const pending = executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment(), onPhase: (p) => phases.push(p) });
    const requestId = worker.posted[0].requestId;
    worker.emit({ type: 'phase', requestId, phase: 'queued' });
    worker.emit({ type: 'phase', requestId: requestId + 999, phase: 'layout' });
    worker.emit({ type: 'result', requestId, ok: true, result: { family: 'bpmn' } as unknown as PipelineResult });
    const result = await pending;
    expect(phases).toEqual(['queued']);
    expect(result).toMatchObject({ family: 'bpmn' });
    expect(worker.terminated).toBe(false);
  });

  it('terminates the worker and rejects when the signal aborts', async () => {
    let worker!: FakeWorker;
    const executor = createWorkerRenderExecutor(() => { worker = new FakeWorker(); return worker as unknown as Worker; });
    const controller = new AbortController();
    const pending = executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment() });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect(worker.terminated).toBe(true);
  });

  it('rejects immediately without creating a worker if already aborted', async () => {
    const create = vi.fn(() => new FakeWorker() as unknown as Worker);
    const executor = createWorkerRenderExecutor(create);
    const controller = new AbortController();
    controller.abort(new Error('pre-aborted'));
    await expect(executor('x', undefined, { signal: controller.signal, assessment: assessment() })).rejects.toThrow('pre-aborted');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('createFallbackRenderExecutor', () => {
  it('runs synchronously for a light diagram', async () => {
    const run = vi.fn(async () => ({ svg: '<svg/>' }) as unknown as PipelineResult);
    const executor = createFallbackRenderExecutor(run as never);
    const controller = new AbortController();
    const result = await executor('task "A" as a', undefined, { signal: controller.signal, assessment: assessment({ admission: 'allow' }) });
    expect(run).toHaveBeenCalled();
    expect(result).toMatchObject({ svg: '<svg/>' });
  });

  it('returns worker_required_for_large_render without running the pipeline for a manual/block-tier diagram', async () => {
    const run = vi.fn();
    const executor = createFallbackRenderExecutor(run as never);
    const controller = new AbortController();
    const result = await executor('big', undefined, { signal: controller.signal, assessment: assessment({ admission: 'manual' }) });
    expect(run).not.toHaveBeenCalled();
    expect(result.errors[0]).toMatchObject(WORKER_REQUIRED_DIAGNOSTIC);
  });
});

describe('isWorkerSupported', () => {
  it('reflects the global Worker constructor', () => {
    expect(isWorkerSupported()).toBe(typeof Worker !== 'undefined');
  });
});
