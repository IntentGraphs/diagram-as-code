import { runPipeline, type PipelineResult } from './pipeline.js';
import type { DiagramDiagnostic, DiagramExecutionPhase } from '@bpm/diagram-runtime';

export interface WorkerRequest {
  type: 'render';
  requestId: number;
  source: string;
  engineOverride?: string;
}

export type WorkerPhaseEvent = 'queued' | DiagramExecutionPhase;

export type WorkerResponse =
  | { type: 'phase'; requestId: number; phase: WorkerPhaseEvent }
  | { type: 'result'; requestId: number; ok: true; result: PipelineResult }
  | { type: 'result'; requestId: number; ok: false; diagnostics: DiagramDiagnostic[] };

export async function handleRenderRequest(
  request: WorkerRequest,
  post: (message: WorkerResponse) => void,
): Promise<void> {
  post({ type: 'phase', requestId: request.requestId, phase: 'queued' });
  try {
    const result = await runPipeline(request.source, request.engineOverride, (phase) => {
      post({ type: 'phase', requestId: request.requestId, phase });
    });
    post({ type: 'result', requestId: request.requestId, ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: 'result',
      requestId: request.requestId,
      ok: false,
      diagnostics: [{ line: 1, column: 1, severity: 'error', message }],
    });
  }
}

// Real worker wiring — inert under Vitest/Node, where `self.postMessage` does not exist.
interface WorkerSelf {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
}
declare const self: WorkerSelf | undefined;
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    void handleRenderRequest(event.data, (message) => self!.postMessage(message));
  };
}
