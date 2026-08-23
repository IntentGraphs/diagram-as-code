import { createAutosave, type AutosaveHandle, type AutosaveStatus } from './project/autosave.js';
import { initSession, isStorageAvailable } from './project/session.js';
import { createDiagram, deleteDiagram, importProjectBundle, loadSession, renameDiagram, renameProject, setActiveDiagram, updateDiagramXml } from './project/store.js';
import type { ProjectBundle, SessionState, StoredDiagram } from './project/types.js';

export interface ProjectControllerOptions {
  editor: HTMLTextAreaElement;
  projectNameEl: HTMLDivElement;
  projectRenameButton: HTMLButtonElement;
  diagramListEl: HTMLUListElement;
  newDiagramButton: HTMLButtonElement;
  warningEl: HTMLDivElement;
  retryButton: HTMLButtonElement;
  starterText: string;
  confirmDiscard: () => boolean;
  invalidateRender: () => void;
  requestRender: (delayMs: number) => void;
  focusEditor: () => void;
  onError: (error: unknown) => void;
}

interface DiagramNameDialog {
  dialog: HTMLDialogElement;
  input: HTMLInputElement;
  error: HTMLElement;
  confirm: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

const DRAFT_STORAGE_PREFIX = 'bpm.editorDraft.';

function draftStorageKey(diagramId: string): string {
  return `${DRAFT_STORAGE_PREFIX}${diagramId}`;
}

function readDraft(diagramId: string): string | undefined {
  try {
    return localStorage.getItem(draftStorageKey(diagramId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeDraft(diagramId: string, body: string): void {
  try {
    localStorage.setItem(draftStorageKey(diagramId), body);
  } catch {
    // IndexedDB remains the durable store; a full or unavailable localStorage must not break
    // typing or rendering.
  }
}

function clearDraft(diagramId: string): void {
  try {
    localStorage.removeItem(draftStorageKey(diagramId));
  } catch {
    // Best-effort cleanup only.
  }
}

export interface ProjectController {
  bootstrap(): Promise<void>;
  isDirty(): boolean;
  flush(): Promise<void>;
  scheduleAutosave(): void;
  importBundle(bundle: ProjectBundle): Promise<void>;
  saveActiveDiagramXml(xml: string): Promise<void>;
  getSession(): SessionState | undefined;
  reportError(error: unknown): void;
}

export function createProjectController(options: ProjectControllerOptions): ProjectController {
  let sessionState: SessionState | undefined;
  let autosave: AutosaveHandle | undefined;

  const nameDialog: DiagramNameDialog = {
    dialog: document.querySelector<HTMLDialogElement>('#diagram-name-dialog')!,
    input: document.querySelector<HTMLInputElement>('#diagram-name-input')!,
    error: document.querySelector<HTMLElement>('#diagram-name-error')!,
    confirm: document.querySelector<HTMLButtonElement>('#diagram-name-confirm')!,
    cancel: document.querySelector<HTMLButtonElement>('#diagram-name-cancel')!,
  };

  function requestDiagramName(label: string, initial: string): Promise<string | undefined> {
    nameDialog.dialog.setAttribute('aria-label', label);
    nameDialog.input.value = initial;
    nameDialog.input.setAttribute('aria-label', label);
    nameDialog.error.textContent = '';
    nameDialog.error.hidden = true;
    nameDialog.dialog.showModal();
    nameDialog.input.select();

    return new Promise((resolve) => {
      const finish = (value: string | undefined) => {
        nameDialog.dialog.close();
        nameDialog.confirm.removeEventListener('click', onConfirm);
        nameDialog.cancel.removeEventListener('click', onCancel);
        nameDialog.dialog.removeEventListener('cancel', onCancel);
        nameDialog.input.removeEventListener('keydown', onKeyDown);
        resolve(value);
      };
      const onConfirm = () => {
        const trimmed = nameDialog.input.value.trim();
        if (!trimmed) {
          nameDialog.error.textContent = label.toLowerCase().includes('project')
            ? 'Enter a project name.'
            : 'Enter a diagram name.';
          nameDialog.error.hidden = false;
          nameDialog.input.focus();
          return;
        }
        finish(trimmed);
      };
      const onCancel = () => finish(undefined);
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onConfirm();
        }
      };
      nameDialog.confirm.addEventListener('click', onConfirm);
      nameDialog.cancel.addEventListener('click', onCancel);
      nameDialog.dialog.addEventListener('cancel', onCancel);
      nameDialog.input.addEventListener('keydown', onKeyDown);
    });
  }

  function setStatus(status: AutosaveStatus, error?: Error): void {
    if (!isStorageAvailable()) {
      options.warningEl.hidden = false;
      options.warningEl.classList.add('project-warning-error');
      options.warningEl.querySelector('#project-warning-text')!.textContent =
        'Diagram storage unavailable — changes will not survive reload.';
      options.retryButton.hidden = true;
      return;
    }

    options.warningEl.classList.toggle('project-warning-error', status === 'error');
    options.warningEl.classList.toggle('project-warning-success', status === 'saved');
    options.retryButton.hidden = status !== 'error';
    options.warningEl.hidden = status === 'clean';
    const text = options.warningEl.querySelector('#project-warning-text')!;
    if (status === 'dirty') text.textContent = 'Unsaved changes — saving locally soon.';
    else if (status === 'saving') text.textContent = 'Saving diagram locally…';
    else if (status === 'error') text.textContent = `Could not save diagram locally: ${error?.message ?? 'unknown storage error'}`;
    else if (status === 'saved') text.textContent = 'Saved locally.';
  }

  function diagramLabel(name: string, id: string): string {
    const dirty = autosave?.isDirty() && sessionState?.activeDiagram.id === id;
    return dirty ? `${name} *` : name;
  }

  function renderDiagramList(): void {
    if (!sessionState) return;
    options.projectNameEl.textContent = sessionState.project.name;
    options.diagramListEl.replaceChildren();
    for (const diagram of sessionState.diagrams) {
      const item = document.createElement('li');
      item.className = 'diagram-item';
      item.dataset.diagramId = diagram.id;
      if (diagram.id === sessionState.activeDiagram.id) item.classList.add('active');

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'diagram-select';
      selectButton.textContent = diagramLabel(diagram.name, diagram.id);
      selectButton.addEventListener('click', () => {
        void switchToDiagram(diagram.id).catch(options.onError);
      });

      const renameButton = document.createElement('button');
      renameButton.type = 'button';
      renameButton.className = 'diagram-action';
      renameButton.setAttribute('aria-label', 'Rename diagram');
      renameButton.textContent = '✎';
      renameButton.addEventListener('click', (event) => {
        event.stopPropagation();
        void renameActiveDiagram(diagram).catch(options.onError);
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'diagram-action';
      deleteButton.setAttribute('aria-label', 'Delete diagram');
      deleteButton.textContent = '×';
      deleteButton.hidden = sessionState.diagrams.length <= 1;
      deleteButton.addEventListener('click', (event) => {
        event.stopPropagation();
        void removeDiagram(diagram).catch(options.onError);
      });

      item.append(selectButton, renameButton, deleteButton);
      options.diagramListEl.append(item);
    }
  }

  async function refreshSession(): Promise<void> {
    const loaded = await loadSession();
    if (!loaded) return;
    sessionState = loaded;
    renderDiagramList();
  }

  async function switchToDiagram(diagramId: string): Promise<void> {
    if (!sessionState || diagramId === sessionState.activeDiagram.id) return;
    options.invalidateRender();
    if (!options.confirmDiscard()) return;
    await autosave?.flush();
    await setActiveDiagram(sessionState.project.id, diagramId);
    await refreshSession();
    if (!sessionState) return;
    options.editor.value = sessionState.activeDiagram.body;
    autosave?.setDiagramId(sessionState.activeDiagram.id);
    autosave?.markClean();
    options.requestRender(0);
  }

  async function renameActiveDiagram(diagram: StoredDiagram): Promise<void> {
    const next = await requestDiagramName('Rename diagram', diagram.name);
    if (!next || next === diagram.name) return;
    await renameDiagram(diagram.id, next);
    await refreshSession();
  }

  async function renameActiveProject(): Promise<void> {
    if (!sessionState) return;
    const next = await requestDiagramName('Rename project', sessionState.project.name);
    if (!next || next === sessionState.project.name) return;
    await renameProject(sessionState.project.id, next);
    await refreshSession();
  }

  async function removeDiagram(diagram: StoredDiagram): Promise<void> {
    if (!sessionState || !confirm(`Delete diagram "${diagram.name}"?`)) return;
    const wasActive = diagram.id === sessionState.activeDiagram.id;
    if (wasActive && !options.confirmDiscard()) return;
    options.invalidateRender();
    if (wasActive) await autosave?.flush();
    await deleteDiagram(diagram.id);
    await refreshSession();
    if (wasActive && sessionState) {
      options.editor.value = sessionState.activeDiagram.body;
      autosave?.setDiagramId(sessionState.activeDiagram.id);
      autosave?.markClean();
      options.requestRender(0);
    }
  }

  async function createNewDiagram(): Promise<void> {
    if (!sessionState || !options.confirmDiscard()) return;
    options.invalidateRender();
    await autosave?.flush();
    const base = `diagram-${sessionState.diagrams.length + 1}`;
    const name = await requestDiagramName('New diagram name', base);
    if (!name) return;
    await createDiagram(sessionState.project.id, name, '');
    await refreshSession();
    if (!sessionState) return;
    options.editor.value = sessionState.activeDiagram.body;
    autosave?.setDiagramId(sessionState.activeDiagram.id);
    autosave?.markClean();
    options.focusEditor();
    options.requestRender(0);
  }

  options.newDiagramButton.addEventListener('click', () => {
    void createNewDiagram().catch(options.onError);
  });
  options.projectRenameButton.addEventListener('click', () => {
    void renameActiveProject().catch(options.onError);
  });
  options.retryButton.addEventListener('click', () => {
    options.retryButton.disabled = true;
    void autosave?.retry()
      .catch(options.onError)
      .finally(() => { options.retryButton.disabled = false; });
  });

  return {
    async bootstrap() {
      setStatus(isStorageAvailable() ? 'clean' : 'error');
      sessionState = await initSession(options.starterText);
      const savedBody = sessionState.activeDiagram.body;
      const draftBody = readDraft(sessionState.activeDiagram.id);
      const recoveredDraft = draftBody !== undefined && draftBody !== savedBody;
      options.editor.value = recoveredDraft ? draftBody : savedBody;
      renderDiagramList();
      autosave = createAutosave(
        () => options.editor.value,
        () => sessionState!.activeDiagram.id,
        () => renderDiagramList(),
        1000,
        (status, error) => setStatus(status, error),
        () => clearDraft(sessionState!.activeDiagram.id),
      );
      if (recoveredDraft) autosave.schedule();
    },
    isDirty() {
      return autosave?.isDirty() ?? false;
    },
    async flush() {
      await autosave?.flush();
    },
    scheduleAutosave() {
      if (sessionState) writeDraft(sessionState.activeDiagram.id, options.editor.value);
      autosave?.schedule();
    },
    async importBundle(bundle) {
      options.invalidateRender();
      await autosave?.flush();
      sessionState = await importProjectBundle(bundle);
      options.editor.value = sessionState.activeDiagram.body;
      autosave?.setDiagramId(sessionState.activeDiagram.id);
      autosave?.markClean();
      renderDiagramList();
      options.focusEditor();
      options.requestRender(0);
    },
    async saveActiveDiagramXml(xml: string) {
      if (!sessionState) throw new Error('Project session is not ready');
      await updateDiagramXml(sessionState.activeDiagram.id, xml);
      await refreshSession();
    },
    getSession() {
      return sessionState;
    },
    reportError(error: unknown) {
      setStatus('error', error instanceof Error ? error : new Error(String(error)));
    },
  };
}
