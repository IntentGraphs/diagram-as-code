import { type PipelineResult } from './pipeline.js';
import { createRevisionTracker, type ExecutionSnapshot } from './renderRevision.js';
import { assessRenderCost, type RenderAssessment } from './renderPolicy.js';
import { createDefaultRenderExecutor, type RenderExecutor } from './renderExecutors.js';
import type { WorkerPhaseEvent } from './renderWorker.js';
import type { DiagramDiagnostic } from '@bpm/diagram-runtime';

export interface RenderControllerSnapshot extends ExecutionSnapshot<PipelineResult> {}

export type RenderPhase = 'idle' | 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'timed_out' | 'failed';

export interface RenderControllerState {
  /** At least one pipeline request is still executing. */
  rendering: boolean;
  phase: RenderPhase;
  startedAt?: number;
  elapsedMs?: number;
  canCancel: boolean;
  assessment?: RenderAssessment;
  /** Human-readable current step, e.g. "Running layout and routing…". Undefined when idle/terminal. */
  detail?: string;
}

export interface RenderController {
  render(): Promise<void>;
  commitCached(value: PipelineResult): Promise<void>;
  invalidate(): void;
  cancel(): void;
  isCurrent(snapshot: RenderControllerSnapshot): boolean;
  isRendering(): boolean;
  getState(): RenderControllerState;
}

export const RENDER_TIMEOUT_MS = 30_000;

class RenderTimeoutReason extends Error {
  constructor() {
    super('Render timed out');
    this.name = 'RenderTimeoutReason';
  }
}

function phaseDetail(phase: WorkerPhaseEvent): string {
  switch (phase) {
    case 'queued':
    case 'parsing':
      return 'Preparing diagram…';
    case 'layout':
      return 'Running layout and routing…';
    case 'rendering':
      return 'Rendering SVG…';
    default:
      return 'Rendering…';
  }
}

function timeoutResult(): PipelineResult {
  const diagnostic: DiagramDiagnostic = {
    line: 1,
    column: 1,
    severity: 'error',
    code: 'layout_timeout',
    message: `Layout did not finish within ${RENDER_TIMEOUT_MS / 1000}s and was cancelled. The previous preview is kept — reduce the diagram size or retry.`,
  };
  return {
    family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
    executionPositioned: null, engineName: null, ast: null,
    diagnostics: [diagnostic], errors: [diagnostic], warnings: [], paginated: null,
  };
}

function errorResult(err: unknown): PipelineResult {
  const diagnostic: DiagramDiagnostic = {
    line: 1,
    column: 1,
    severity: 'error',
    message: err instanceof Error ? err.message : String(err),
  };
  return {
    family: null, header: null, capabilities: null, svg: null, diagram: null, positioned: null,
    executionPositioned: null, engineName: null, ast: null,
    diagnostics: [diagnostic], errors: [diagnostic], warnings: [], paginated: null,
  };
}

export function createRenderController(
  getSource: () => string,
  getEngineOverride: () => string | undefined,
  onCommit: (snapshot: RenderControllerSnapshot) => Promise<void> | void,
  execute: RenderExecutor = createDefaultRenderExecutor(),
  onStateChange?: (state: RenderControllerState) => void,
): RenderController {
  const revisions = createRevisionTracker<PipelineResult>();
  let generation = 0;
  let activeAbort: AbortController | undefined;
  let elapsedTimer: ReturnType<typeof setInterval> | undefined;
  let state: RenderControllerState = { rendering: false, phase: 'idle', canCancel: false };

  const emit = () => onStateChange?.({ ...state });
  const setState = (patch: Partial<RenderControllerState>) => {
    state = { ...state, ...patch };
    emit();
  };
  const stopTicker = () => {
    if (elapsedTimer !== undefined) {
      clearInterval(elapsedTimer);
      elapsedTimer = undefined;
    }
  };

  return {
    async render() {
      const myGeneration = ++generation;
      activeAbort?.abort();
      const controller = new AbortController();
      activeAbort = controller;

      const source = getSource();
      const engineOverride = getEngineOverride();
      const assessment = assessRenderCost(source);
      const token = revisions.begin(source);
      const startedAt = Date.now();

      setState({ rendering: true, phase: 'queued', startedAt, elapsedMs: 0, canCancel: true, assessment, detail: 'Preparing diagram…' });
      elapsedTimer = setInterval(() => {
        if (myGeneration !== generation) return;
        setState({ elapsedMs: Date.now() - startedAt });
      }, 250);
      const timeoutHandle = setTimeout(() => controller.abort(new RenderTimeoutReason()), RENDER_TIMEOUT_MS);

      try {
        const execResult = await execute(source, engineOverride, {
          signal: controller.signal,
          assessment,
          onPhase: (phase) => {
            if (myGeneration !== generation) return;
            setState({ phase: 'running', detail: phaseDetail(phase) });
          },
        });
        clearTimeout(timeoutHandle);
        if (myGeneration !== generation) return;
        stopTicker();
        const snapshot = revisions.commit(token, execResult);
        setState({ rendering: false, phase: 'completed', canCancel: false, detail: undefined });
        if (snapshot) await onCommit(snapshot);
      } catch (err) {
        clearTimeout(timeoutHandle);
        if (myGeneration !== generation) return;
        stopTicker();
        if (controller.signal.aborted) {
          if (controller.signal.reason instanceof RenderTimeoutReason) {
            setState({ rendering: false, phase: 'timed_out', canCancel: false, detail: `Render timed out after ${RENDER_TIMEOUT_MS / 1000}s — previous preview kept` });
            const snapshot = revisions.commit(token, timeoutResult());
            if (snapshot) await onCommit(snapshot);
          } else {
            setState({ rendering: false, phase: 'cancelled', canCancel: false, detail: 'Render cancelled — previous preview kept' });
          }
        } else {
          setState({ rendering: false, phase: 'failed', canCancel: false, detail: undefined });
          const snapshot = revisions.commit(token, errorResult(err));
          if (snapshot) await onCommit(snapshot);
        }
      } finally {
        if (myGeneration === generation) activeAbort = undefined;
      }
    },
    async commitCached(value) {
      const myGeneration = ++generation;
      activeAbort?.abort();
      activeAbort = undefined;
      stopTicker();
      const source = getSource();
      const token = revisions.begin(source);
      const snapshot = revisions.commit(token, value);
      if (myGeneration !== generation || !snapshot) return;
      setState({ rendering: false, phase: 'completed', canCancel: false, detail: 'Preview restored from cache.' });
      await onCommit(snapshot);
    },
    invalidate() {
      revisions.invalidate();
    },
    cancel() {
      if (!activeAbort) return;
      setState({ phase: 'cancelling' });
      activeAbort.abort();
    },
    isCurrent(snapshot) {
      return revisions.isCurrent(snapshot);
    },
    isRendering() {
      return state.rendering;
    },
    getState() {
      return { ...state };
    },
  };
}
