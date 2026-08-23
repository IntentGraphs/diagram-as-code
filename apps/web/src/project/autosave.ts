import { updateDiagramBody } from './store.js';

export type AutosaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface AutosaveHandle {
  schedule(): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  isDirty(): boolean;
  markClean(): void;
  setDiagramId(id: string): void;
  dispose(): void;
}

export function createAutosave(
  getBody: () => string,
  getDiagramId: () => string,
  onDirtyChange?: (dirty: boolean) => void,
  debounceMs = 1000,
  onStatusChange?: (status: AutosaveStatus, error?: Error) => void,
  onSaved?: (body: string) => void,
): AutosaveHandle {
  let dirty = false;
  let lastSavedBody = getBody();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const setStatus = (status: AutosaveStatus, error?: unknown) => {
    onStatusChange?.(
      status,
      error instanceof Error ? error : error == null ? undefined : new Error(String(error)),
    );
  };

  const setDirty = (value: boolean) => {
    if (dirty === value) return;
    dirty = value;
    onDirtyChange?.(value);
  };

  const persist = async () => {
    if (disposed) return;
    const body = getBody();
    const id = getDiagramId();
    setStatus('saving');
    try {
      await updateDiagramBody(id, body);
      lastSavedBody = body;
      setDirty(false);
      setStatus('saved');
      onSaved?.(body);
    } catch (error) {
      // Keep dirty=true so a retry or flush can safely attempt the same body.
      setDirty(true);
      setStatus('error', error);
      throw error;
    }
  };

  return {
    schedule() {
      if (disposed) return;
      const body = getBody();
      setDirty(body !== lastSavedBody);
      if (body !== lastSavedBody) setStatus('dirty');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void persist().catch(() => undefined);
      }, debounceMs);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (disposed) return;
      if (!dirty && getBody() === lastSavedBody) return;
      await persist();
    },
    async retry() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (disposed) return;
      if (!dirty && getBody() === lastSavedBody) {
        setStatus('clean');
        return;
      }
      await persist();
    },
    isDirty() {
      return dirty || getBody() !== lastSavedBody;
    },
    markClean() {
      lastSavedBody = getBody();
      setDirty(false);
      setStatus('clean');
    },
    setDiagramId(id: string) {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      lastSavedBody = getBody();
      setDirty(false);
      setStatus('clean');
      void id;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
