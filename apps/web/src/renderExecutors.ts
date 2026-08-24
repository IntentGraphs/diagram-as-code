import { runPipeline, type PipelineResult } from './pipeline.js';
import type { WorkerRequest, WorkerResponse, WorkerPhaseEvent } from './renderWorker.js';
import type { RenderAssessment } from './renderPolicy.js';
import type { DiagramDiagnostic } from '@bpm/diagram-runtime';

export interface RenderExecutorContext {
  signal: AbortSignal;
  assessment: RenderAssessment;
  onPhase?: (phase: WorkerPhaseEvent) => void;
}

export type RenderExecutor = (
  source: string,
  engineOverride: string | undefined,
  context: RenderExecutorContext,
) => Promise<PipelineResult>;

export const WORKER_REQUIRED_DIAGNOSTIC: DiagramDiagnostic = {
  line: 1,
  column: 1,
  severity: 'error',
  code: 'worker_required_for_large_render',
  message: 'This diagram is too large to render without Web Worker support, which this browser does not provide. Reduce the diagram size, or open the editor in a browser that supports Web Workers.',
};

export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

let requestCounter = 0;

function createRenderWorker(): Worker {
  return new Worker(new URL('./renderWorkerEntry.ts', import.meta.url), { type: 'module' });
}

export function createWorkerRenderExecutor(
  createWorker: () => Worker = createRenderWorker,
): RenderExecutor {
  let worker: Worker | undefined;

  return (source, engineOverride, { signal, onPhase }) => new Promise<PipelineResult>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('Render aborted'));
      return;
    }
    const requestId = ++requestCounter;
    worker ??= createWorker();
    let settled = false;

    const finish = (fn: () => void, terminate = false) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (terminate) {
        worker?.terminate();
        worker = undefined;
      }
      fn();
    };

    const onAbort = () => finish(() => reject(signal.reason ?? new Error('Render aborted')), true);
    signal.addEventListener('abort', onAbort);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== requestId) return;
      if (message.type === 'phase') {
        onPhase?.(message.phase);
        return;
      }
      finish(() => {
        if (message.ok) resolve(message.result);
        else reject(Object.assign(new Error('Render failed in worker'), { diagnostics: message.diagnostics }));
      }, !message.ok);
    };
    worker.onerror = (event: ErrorEvent) => {
      finish(() => reject(event.error instanceof Error ? event.error : new Error(event.message)), true);
    };

    const request: WorkerRequest = { type: 'render', requestId, source, ...(engineOverride ? { engineOverride } : {}) };
    worker.postMessage(request);
  });
}

export function createFallbackRenderExecutor(
  execute: typeof runPipeline = runPipeline,
): RenderExecutor {
  return async (source, engineOverride, { assessment, onPhase }) => {
    if (assessment.admission === 'manual' || assessment.admission === 'block') {
      return {
        family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
        executionPositioned: null, engineName: null, ast: null,
        diagnostics: [WORKER_REQUIRED_DIAGNOSTIC], errors: [WORKER_REQUIRED_DIAGNOSTIC], warnings: [], paginated: null,
      };
    }
    return execute(source, engineOverride, (phase) => onPhase?.(phase));
  };
}

export function createDefaultRenderExecutor(): RenderExecutor {
  return isWorkerSupported() ? createWorkerRenderExecutor() : createFallbackRenderExecutor();
}
