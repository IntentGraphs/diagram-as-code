import {
  exportPositionedDiagram,
  readDiagramHeader,
  validateDiagramSource,
  type DiagramDiagnostic,
  type FamilyValidationResult,
} from '@bpm/diagram-runtime';
import type { ValidationIssue, ValidationResult } from '@bpm/validate';
import { importXml as importBpmnXml, IMPORT_LIMITS } from '@bpm/import-xml';
import { freezeDiagram, printDiagram } from '@bpm/print-dsl';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout';
import type { PptxExportWarning } from '@bpm/export-pptx';
import { destroyModeler, hasUnsavedChanges } from './diagramMode.js';
import { downloadFile } from './downloads.js';
import { runPipeline, type PipelineResult } from './pipeline.js';
import { mountSvg } from './mountSvg.js';
import { createSvgViewport } from './svgViewport.js';
import { analyzeForReview, mountReviewPanel, updateReviewPanel, hideReviewPanel, setApplyPatchHandler, setSourceTextGetter, setCloseHandler as setReviewCloseHandler } from './reviewPanel.js';
import { mountGeneratePanel, showGeneratePanel, hideGeneratePanel, setInsertTextHandler, setCloseHandler as setGenerateCloseHandler } from './generatePanel.js';
import { setGenerationDisabled } from './generatePanel.js';
import { mountImportPanel, showImportPanel, hideImportPanel, showExternalImportPreview, setImportInsertHandler, setCloseHandler as setImportCloseHandler } from './importPanel.js';
import { mountSettingsPanel, showSettingsPanel, hideSettingsPanel, getEngineOverrideSelect, setCloseHandler as setSettingsCloseHandler } from './settingsPanel.js';
import { createExportMenu, type ExportMenuItem } from './exportMenu.js';
import { familyLabel, structuredExports, unsupportedActionMessage } from './familyUi.js';
import { createRenderController, type RenderControllerSnapshot } from './renderController.js';
import { createProjectController, type ProjectController } from './projectController.js';
import { createDiagramModeController } from './diagramModeController.js';
import { mountDiagramAgentPanel, showDiagramAgentPanel, hideDiagramAgentPanel, resetDiagramAgentSession, setAdapterGetter as setDiagramAgentAdapterGetter, setCloseHandler as setDiagramAgentCloseHandler } from './diagramAgentPanel.js';
import { assessRenderCost, renderDebounceMs, type RenderAssessment } from './renderPolicy.js';
import { isProjectBundle, PROJECT_LIMITS } from './project/store.js';
import { PROJECT_BUNDLE_FORMAT, PROJECT_BUNDLE_VERSION, type ProjectBundle, type ProjectBundleDiagram } from './project/types.js';
import { WORKSPACE_TOUR } from './project/starterProject.js';
import { createOperationStateCoordinator } from './operationState.js';

const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
const splitter = document.querySelector<HTMLDivElement>('#splitter')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const errorsEl = document.querySelector<HTMLDivElement>('#errors')!;
const engineBadge = document.querySelector<HTMLSpanElement>('#engine-badge')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const renderBtn = document.querySelector<HTMLButtonElement>('#render-btn')!;
const sourceOpenBtn = document.querySelector<HTMLButtonElement>('#source-open-btn')!;
const sourceOpenInput = document.querySelector<HTMLInputElement>('#source-open-input')!;
const projectSaveBtn = document.querySelector<HTMLButtonElement>('#project-save-btn')!;
const fullscreenBtn = document.querySelector<HTMLButtonElement>('#fullscreen-btn')!;
const modeTextBtn = document.querySelector<HTMLButtonElement>('#mode-text-btn')!;
const modeDiagramBtn = document.querySelector<HTMLButtonElement>('#mode-diagram-btn')!;
const body = document.querySelector<HTMLDivElement>('#body')!;
const diagramBody = document.querySelector<HTMLDivElement>('#diagram-body')!;
const toolbarActions = document.querySelector<HTMLDivElement>('#toolbar-actions')!;
const diagramToolbarActions = document.querySelector<HTMLDivElement>('#diagram-toolbar-actions')!;
const diagramCanvas = document.querySelector<HTMLDivElement>('#diagram-canvas')!;
const diagramModeNewBtn = document.querySelector<HTMLButtonElement>('#diagram-new')!;
const diagramOpenBtn = document.querySelector<HTMLButtonElement>('#diagram-open')!;
const diagramOpenInput = document.querySelector<HTMLInputElement>('#diagram-open-input')!;
const diagramSaveBtn = document.querySelector<HTMLButtonElement>('#diagram-save')!;
const diagramExportMenuContainer = document.querySelector<HTMLDivElement>('#diagram-export-menu-container')!;
const diagramImportTextBtn = document.querySelector<HTMLButtonElement>('#diagram-import-text')!;
const diagramZoomOutBtn = document.querySelector<HTMLButtonElement>('#diagram-zoom-out')!;
const diagramZoomInBtn = document.querySelector<HTMLButtonElement>('#diagram-zoom-in')!;
const diagramZoomFitBtn = document.querySelector<HTMLButtonElement>('#diagram-zoom-fit')!;
const diagramZoomLabel = document.querySelector<HTMLSpanElement>('#diagram-zoom-label')!;
const diagramAgentBtn = document.querySelector<HTMLButtonElement>('#diagram-agent-btn')!;
const diagramStatusEl = document.querySelector<HTMLDivElement>('#diagram-status')!;
const editAsDiagramBtn = document.querySelector<HTMLButtonElement>('#edit-as-diagram')!;
const diagramErrorsEl = document.querySelector<HTMLDivElement>('#diagram-errors')!;
const familyBadgeLabel = document.querySelector<HTMLSpanElement>('#family-badge-label')!;
const renderStatusEl = document.querySelector<HTMLSpanElement>('#render-status')!;
const renderSpinnerEl = document.querySelector<HTMLSpanElement>('#render-spinner')!;
const renderElapsedEl = document.querySelector<HTMLSpanElement>('#render-elapsed')!;
const renderCancelBtn = document.querySelector<HTMLButtonElement>('#render-cancel-btn')!;
const heavyRenderDialog = document.querySelector<HTMLDialogElement>('#heavy-render-dialog')!;
const heavyRenderMessage = document.querySelector<HTMLParagraphElement>('#heavy-render-message')!;
const heavyRenderCloseBtn = document.querySelector<HTMLButtonElement>('#heavy-render-close')!;
const heavyRenderOnceBtn = document.querySelector<HTMLButtonElement>('#heavy-render-once')!;
const exportMenuContainer = document.querySelector<HTMLDivElement>('#export-menu-container')!;
const reviewBtn = document.querySelector<HTMLButtonElement>('#review-btn')!;
const generateBtn = document.querySelector<HTMLButtonElement>('#generate-btn')!;
const settingsBtn = document.querySelector<HTMLButtonElement>('#settings-btn')!;
const projectNameEl = document.querySelector<HTMLDivElement>('#project-name')!;
const projectRenameBtn = document.querySelector<HTMLButtonElement>('#project-rename-btn')!;
const diagramListEl = document.querySelector<HTMLUListElement>('#diagram-list')!;
const projectDiagramNewBtn = document.querySelector<HTMLButtonElement>('#diagram-new-btn')!;
const projectWarningEl = document.querySelector<HTMLDivElement>('#project-warning')!;
const projectRetryBtn = document.querySelector<HTMLButtonElement>('#project-retry-btn')!;
const projectPanel = document.querySelector<HTMLDivElement>('#project-panel')!;
const projectSplitter = document.querySelector<HTMLDivElement>('#project-splitter')!;
const projectToggleBtn = document.querySelector<HTMLButtonElement>('#project-toggle-btn')!;
const operationStatusEl = document.querySelector<HTMLDivElement>('#operation-status')!;
const familyBadge = document.querySelector<HTMLSpanElement>('#family-badge')!;
const svgViewport = createSvgViewport(preview);
const operationState = createOperationStateCoordinator();

function activeOperationIdentity() {
  const session = projectController?.getSession();
  return { projectId: session?.project.id, diagramId: session?.activeDiagram.id };
}

operationState.subscribe((snapshot) => {
  operationStatusEl.hidden = !snapshot;
  operationStatusEl.textContent = snapshot?.message ?? '';
  operationStatusEl.dataset.state = snapshot?.status ?? 'idle';
});

type Mode = 'text' | 'diagram';
let currentMode: Mode = 'text';
let lastResult: PipelineResult | undefined;
let lastResultSource: string | undefined;
let renderBusy = false;
let textExportMenu!: ReturnType<typeof createExportMenu>;

/** Disable actions that consume the last committed text-mode render while it is stale or busy. */
function updateRenderDependentActions(): void {
  const committedSourceIsCurrent = Boolean(lastResult && lastResultSource === editor.value);
  const actionsReady = !renderBusy && committedSourceIsCurrent;
  renderBtn.disabled = renderBusy;
  modeDiagramBtn.disabled = !actionsReady || lastResult?.capabilities?.editorMode !== 'bpmn-js';
  editAsDiagramBtn.disabled = !actionsReady
    || !lastResult?.diagram
    || lastResult.diagram.nodes.length === 0
    || !lastResult.positioned
    || lastResult.family !== 'bpmn'
    || lastResult.capabilities?.editorMode !== 'bpmn-js';
  textExportMenu?.setDisabled(!actionsReady);
}

function setDiagramButtonsEnabled(enabled: boolean): void {
  diagramSaveBtn.disabled = !enabled;
  diagramExportMenu.setDisabled(!enabled);
  diagramImportTextBtn.disabled = !enabled;
  diagramAgentBtn.disabled = !enabled;
  if (!enabled) {
    importVisible = false;
    hideImportPanel();
  }
}
function setDiagramStatus(message: string): void {
  diagramStatusEl.textContent = message;
}
function confirmDiscardUnsaved(): boolean {
  return !hasUnsavedChanges() || confirm('Diagram has unsaved changes — leave anyway?');
}

function confirmDiscardTextUnsaved(): boolean {
  return !projectController.isDirty() || confirm('Diagram has unsaved changes — leave anyway?');
}

const diagramModeController = createDiagramModeController({
  canvas: diagramCanvas,
  errorsEl: diagramErrorsEl,
  setButtonsEnabled: (enabled) => {
    setDiagramButtonsEnabled(enabled);
  },
  onZoomChange: (zoom) => {
    diagramZoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  },
  onDirtyChange: (dirty) => {
    setDiagramStatus(dirty ? 'Unsaved diagram changes.' : 'Diagram changes saved.');
    diagramSaveBtn.setAttribute('aria-label', dirty ? 'Save diagram; unsaved changes' : 'Save diagram; no unsaved changes');
  },
});

function setMode(mode: Mode): void {
  if (mode === currentMode) return;
  if (mode === 'diagram' && modeDiagramBtn.disabled) return;
  if (currentMode === 'diagram' && !confirmDiscardUnsaved()) return;
  if (currentMode === 'text' && mode === 'diagram' && !confirmDiscardTextUnsaved()) return;
  renderController.invalidate();
  const leavingDiagram = currentMode === 'diagram';
  currentMode = mode;
  const isDiagram = mode === 'diagram';
  modeTextBtn.setAttribute('aria-pressed', String(!isDiagram));
  modeDiagramBtn.setAttribute('aria-pressed', String(isDiagram));
  body.hidden = isDiagram;
  diagramBody.hidden = !isDiagram;
  toolbarActions.hidden = isDiagram;
  diagramToolbarActions.hidden = !isDiagram;

  if (isDiagram) {
    resetDiagramAgentSession();
    diagramModeController.renderErrors([]);
    setDiagramStatus('Diagram ready. No unsaved changes.');
    diagramModeController.createModeler();
    diagramCanvas.focus();
  } else if (leavingDiagram) {
    hideDiagramAgentPanel();
    diagramAgentBtn.setAttribute('aria-pressed', 'false');
    destroyModeler();
    diagramModeController.setButtonsEnabled(false);
    editor.focus();
  }
}

modeTextBtn.addEventListener('click', () => setMode('text'));
modeDiagramBtn.addEventListener('click', () => setMode('diagram'));
diagramModeNewBtn.addEventListener('click', async () => {
  if (!confirmDiscardUnsaved()) return;
  try {
    await diagramModeController.newDiagram();
  } catch (err) {
    diagramModeController.renderErrors([err instanceof Error ? err.message : String(err)]);
  }
});

diagramOpenBtn.addEventListener('click', () => diagramOpenInput.click());

diagramOpenInput.addEventListener('change', async () => {
  const file = diagramOpenInput.files?.[0];
  diagramOpenInput.value = '';
  if (!file) return;
  if (!confirmDiscardUnsaved()) return;
  if (file.size > IMPORT_LIMITS.xmlBytes) {
    diagramModeController.renderErrors([`BPMN file is too large to open (maximum ${IMPORT_LIMITS.xmlBytes / (1024 * 1024)} MiB).`]);
    return;
  }
  const operation = operationState.begin('diagram-xml-load', `Opening ${file.name}`, activeOperationIdentity());
  if (!operation) return;
  diagramOpenBtn.disabled = true;
  diagramSaveBtn.disabled = true;
  try {
    operation.update('running', `Opening ${file.name}…`);
    const xml = await file.text();
    await diagramModeController.loadXml(xml);
    operation.finish('success', `${file.name} opened.`);
  } catch (error) {
    operation.finish('error', `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    diagramOpenBtn.disabled = false;
    setDiagramButtonsEnabled(true);
  }
});

diagramSaveBtn.addEventListener('click', () => {
  const operation = operationState.begin('diagram-xml-export', 'Preparing BPMN XML export', activeOperationIdentity());
  if (!operation) return;
  diagramSaveBtn.disabled = true;
  void diagramModeController.exportXmlFile()
    .then(async () => {
      await projectController.saveActiveDiagramXml(await diagramModeController.getXml());
    })
    .then(() => operation.finish('success', 'BPMN XML export completed.'))
    .catch((error) => operation.finish('error', `BPMN XML export failed: ${error instanceof Error ? error.message : String(error)}`))
    .finally(() => setDiagramButtonsEnabled(true));
});
diagramZoomOutBtn.addEventListener('click', () => diagramModeController.zoomOut());
diagramZoomInBtn.addEventListener('click', () => diagramModeController.zoomIn());
diagramZoomFitBtn.addEventListener('click', () => diagramModeController.fitDiagram());

editAsDiagramBtn.addEventListener('click', async () => {
  if (renderBusy || lastResultSource !== editor.value) return;
  if (!lastResult?.diagram || !lastResult.positioned || !lastResult.family || lastResult.capabilities?.editorMode !== 'bpmn-js') return;
  let operation: ReturnType<typeof operationState.begin>;
  try {
    // Export the already-validated ast/positioned pair from the last successful render, not
    // live editor.value — re-parsing the source here could race an in-flight edit and export
    // content that was never actually previewed.
    const xml = exportPositionedDiagram(lastResult.family, lastResult.diagram, lastResult.positioned, 'bpmn-xml');
    setMode('diagram');
    operation = operationState.begin('diagram-xml-load', 'Loading diagram preview', activeOperationIdentity());
    if (!operation) return;
    await diagramModeController.loadXml(xml);
    operation.finish('success', 'Diagram preview loaded.');
  } catch (err) {
    operation?.finish('error', `Could not load diagram preview: ${err instanceof Error ? err.message : String(err)}`);
    renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
  }
});

const EDITOR_WIDTH_STORAGE_KEY = 'bpm.editorWidthPx';
const MIN_PANE_WIDTH = 240;

function applyEditorWidth(px: number): void {
  const max = window.innerWidth - MIN_PANE_WIDTH - splitter.offsetWidth;
  const clamped = Math.min(Math.max(px, MIN_PANE_WIDTH), Math.max(max, MIN_PANE_WIDTH));
  editor.style.flex = `0 0 ${clamped}px`;
}

const storedWidth = Number(localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY));
if (storedWidth > 0) applyEditorWidth(storedWidth);

splitter.addEventListener('pointerdown', (downEvent) => {
  downEvent.preventDefault();
  splitter.classList.add('dragging');
  splitter.setPointerCapture(downEvent.pointerId);

  const onMove = (moveEvent: PointerEvent) => {
    const bodyLeft = editor.getBoundingClientRect().left;
    applyEditorWidth(moveEvent.clientX - bodyLeft);
  };
  const onUp = () => {
    splitter.classList.remove('dragging');
    splitter.releasePointerCapture(downEvent.pointerId);
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
    localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(editor.getBoundingClientRect().width));
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
});

const PROJECT_WIDTH_STORAGE_KEY = 'bpm.projectWidthPx';
const PROJECT_COLLAPSED_STORAGE_KEY = 'bpm.projectCollapsed';
const MIN_PROJECT_WIDTH = 120;
const MAX_PROJECT_WIDTH = 480;

function applyProjectWidth(px: number): void {
  const clamped = Math.min(Math.max(px, MIN_PROJECT_WIDTH), MAX_PROJECT_WIDTH);
  projectPanel.style.flex = `0 0 ${clamped}px`;
}

function setProjectCollapsed(collapsed: boolean): void {
  projectPanel.hidden = collapsed;
  projectSplitter.hidden = collapsed;
  projectToggleBtn.setAttribute('aria-pressed', String(!collapsed));
  localStorage.setItem(PROJECT_COLLAPSED_STORAGE_KEY, String(collapsed));
}

const storedProjectWidth = Number(localStorage.getItem(PROJECT_WIDTH_STORAGE_KEY));
if (storedProjectWidth > 0) applyProjectWidth(storedProjectWidth);
setProjectCollapsed(localStorage.getItem(PROJECT_COLLAPSED_STORAGE_KEY) === 'true');

projectToggleBtn.addEventListener('click', () => setProjectCollapsed(!projectPanel.hidden));

projectSplitter.addEventListener('pointerdown', (downEvent) => {
  downEvent.preventDefault();
  projectSplitter.classList.add('dragging');
  projectSplitter.setPointerCapture(downEvent.pointerId);
  const bodyLeft = body.getBoundingClientRect().left;

  const onMove = (moveEvent: PointerEvent) => {
    applyProjectWidth(moveEvent.clientX - bodyLeft);
  };
  const onUp = () => {
    projectSplitter.classList.remove('dragging');
    projectSplitter.releasePointerCapture(downEvent.pointerId);
    projectSplitter.removeEventListener('pointermove', onMove);
    projectSplitter.removeEventListener('pointerup', onUp);
    localStorage.setItem(PROJECT_WIDTH_STORAGE_KEY, String(projectPanel.getBoundingClientRect().width));
  };
  projectSplitter.addEventListener('pointermove', onMove);
  projectSplitter.addEventListener('pointerup', onUp);
});

fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    preview.requestFullscreen();
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});

let renderDebounceHandle: ReturnType<typeof setTimeout> | undefined;
let currentRenderAssessment: RenderAssessment = assessRenderCost('');
let autoHeavyWarningShown = false;

function currentRenderMode(): 'auto' | 'manual' {
  return readDiagramHeader(editor.value).renderMode ?? 'auto';
}

function setRenderStatus(message: string): void {
  renderStatusEl.textContent = message;
  renderStatusEl.title = message;
  renderStatusEl.hidden = !message;
}

function heavyRenderReason(assessment: RenderAssessment): string {
  return assessment.reasons.length > 0
    ? assessment.reasons.join(', ')
    : `complexity score ${assessment.score}`;
}

function showHeavyRenderWarning(assessment: RenderAssessment): void {
  if (autoHeavyWarningShown || heavyRenderDialog.open) return;
  autoHeavyWarningShown = true;
  heavyRenderMessage.textContent = `This diagram is classified as heavy (${heavyRenderReason(assessment)}). "render: auto" is not allowed to start repeated live layouts. Press Render to update the preview once; editing and autosave remain available.`;
  heavyRenderDialog.showModal();
}

function scheduleAutomaticRender(delayMs = renderDebounceMs(editor.value)): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  currentRenderAssessment = assessRenderCost(editor.value);
  const mode = currentRenderMode();

  if (currentRenderAssessment.heavy) {
    setRenderStatus(mode === 'auto' ? 'Large diagram — press Render' : 'Manual render mode — press Render');
    if (mode === 'auto') showHeavyRenderWarning(currentRenderAssessment);
    return;
  }

  autoHeavyWarningShown = false;
  if (mode === 'manual') {
    setRenderStatus('Manual render mode — press Render');
    return;
  }
  setRenderStatus('');
  renderDebounceHandle = setTimeout(() => { void rerender(); }, delayMs);
}

function renderNow(): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  renderController.invalidate();
  void rerender();
}

function renderErrors(errors: { line: number; column?: number; message: string }[]): void {
  errorsEl.replaceChildren();
  for (const error of errors) {
    const item = document.createElement('div');
    item.className = 'error-item';
    const lineSpan = document.createElement('span');
    lineSpan.className = 'error-line';
    lineSpan.textContent = `Line ${error.line}:`;
    item.append(lineSpan, document.createTextNode(` ${error.message}`));
    errorsEl.append(item);
  }
}

function renderPaginationDiagnostics(result: PipelineResult): void {
  errorsEl.replaceChildren();
  if (result.paginated || result.header?.paginate !== 'none') {
    const summary = document.createElement('div');
    summary.className = 'warning-item pagination-summary';
    const page = result.paginated?.pages[0];
    const dimensions = page ? ` (${Math.round(page.width)} × ${Math.round(page.height)} px)` : '';
    summary.textContent = `Pagination: ${result.paginated?.mode ?? result.header?.paginate ?? 'none'} — ${result.paginated?.pages.length ?? 1} page${(result.paginated?.pages.length ?? 1) === 1 ? '' : 's'}${dimensions}`;
    errorsEl.append(summary);
  }
  for (const warning of result.warnings) {
    const item = document.createElement('div');
    item.className = 'warning-item';
    item.textContent = `Warning: ${warning.message}`;
    errorsEl.append(item);
  }
}

function renderExportWarnings(warnings: PptxExportWarning[]): void {
  errorsEl.replaceChildren();
  const notice = document.createElement('div');
  notice.className = 'warning-item';
  notice.textContent = warnings.length === 0
    ? 'PPTX export completed successfully.'
    : `PPTX export completed with ${warnings.length} readability warning${warnings.length === 1 ? '' : 's'} — the SVG preview remains available.`;
  errorsEl.append(notice);
  const preview = warnings.slice(0, 5);
  const remaining = warnings.length - preview.length;
  for (const warning of preview) {
    const item = document.createElement('div');
    item.className = 'warning-item';
    item.textContent = `Warning: ${warning.message}`;
    errorsEl.append(item);
  }
  if (remaining > 0) {
    const item = document.createElement('div');
    item.className = 'warning-item';
    item.textContent = `Warning: ${remaining} additional editable-text warning${remaining === 1 ? '' : 's'} omitted; review the exported slide for readability.`;
    errorsEl.append(item);
  }
}

function toValidationIssue(diagnostic: DiagramDiagnostic, severity: ValidationIssue['severity']): ValidationIssue {
  return {
    message: diagnostic.message,
    line: diagnostic.line,
    column: diagnostic.column,
    severity,
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
  };
}

function toValidationResult(result: FamilyValidationResult): ValidationResult {
  return {
    valid: result.valid,
    errors: result.errors.map((diagnostic) => toValidationIssue(diagnostic, 'error')),
    semanticErrors: result.semanticErrors.map((diagnostic) => toValidationIssue(diagnostic, 'error')),
    warnings: result.warnings.map((diagnostic) => toValidationIssue(diagnostic, 'warning')),
  };
}

function validationResultFromDiagnostics(diagnostics: DiagramDiagnostic[]): ValidationResult {
  return {
    valid: false,
    errors: diagnostics.map((diagnostic) => toValidationIssue(diagnostic, 'error')),
    semanticErrors: [],
    warnings: [],
  };
}

async function validateForReview(source: string, capabilities: PipelineResult['capabilities']): Promise<ValidationResult> {
  const header = readDiagramHeader(source);
  if (header.diagnostics.length > 0) {
    return validationResultFromDiagnostics(header.diagnostics);
  }
  const aiCapabilities = capabilities?.aiCapabilities;
  if (!aiCapabilities?.visualReview) {
    return validationResultFromDiagnostics([{
      line: header.directiveLine ?? 1,
      column: 1,
      message: `Family "${header.family}" does not support AI visual review yet.`,
      code: 'unsupported_review_family',
      severity: 'error',
    }]);
  }

  try {
    return toValidationResult(await validateDiagramSource(source));
  } catch (err) {
    const diagnostics = err instanceof Error && 'diagnostics' in err
      ? (err as { diagnostics: unknown }).diagnostics
      : undefined;
    if (Array.isArray(diagnostics) && diagnostics.every((diagnostic): diagnostic is DiagramDiagnostic => (
      typeof diagnostic === 'object'
      && diagnostic !== null
      && typeof (diagnostic as DiagramDiagnostic).line === 'number'
      && typeof (diagnostic as DiagramDiagnostic).column === 'number'
      && typeof (diagnostic as DiagramDiagnostic).message === 'string'
    ))) {
      return validationResultFromDiagnostics(diagnostics);
    }
    return validationResultFromDiagnostics([{
      line: 1,
      column: 1,
      message: err instanceof Error ? err.message : String(err),
      code: 'review_validation_failed',
      severity: 'error',
    }]);
  }
}

async function commitRender(snapshot: RenderControllerSnapshot): Promise<void> {
  const { source, value: result } = snapshot;
  if (source !== editor.value || !renderController.isCurrent(snapshot)) return;
  const aiCapabilities = result.capabilities?.aiCapabilities;
  const generateUnsupported = aiCapabilities?.generation !== true;
  const reviewUnsupported = aiCapabilities?.visualReview !== true;
  modeDiagramBtn.disabled = renderBusy || result.capabilities?.editorMode !== 'bpmn-js';
  modeDiagramBtn.title = modeDiagramBtn.disabled ? 'Diagram mode supports BPMN diagrams only.' : 'Open the BPMN-only visual editor.';
  engineOverrideSelect.disabled = result.capabilities?.engineOverride !== true;
  engineOverrideSelect.title = engineOverrideSelect.disabled
    ? `${familyLabel(result.family)} layout does not support BPMN engine overrides.`
    : 'Choose the BPMN layout engine.';
  if (currentMode === 'diagram' && modeDiagramBtn.disabled) setMode('text');
  if (result.errors.length > 0) {
    renderErrors(result.errors);
    preview.classList.add('stale');
    familyBadgeLabel.textContent = familyLabel(result.family);
    // setItems([]) alone leaves the menu's open/closed state untouched (see exportMenu.ts —
    // only setDisabled() calls closeMenu()), so an in-flight error while the menu happens to be
    // open would otherwise leave a stale, empty-but-open menu. setDisabled(true) here forces it
    // shut and is undone by setDisabled(false) in the success branch below.
    textExportMenu.setDisabled(true);
    textExportMenu.setItems([]);
    editAsDiagramBtn.disabled = true;
    updateRenderDependentActions();
    generateBtn.disabled = generateUnsupported;
    generateBtn.title = generateUnsupported ? unsupportedActionMessage('Generate', result.family) : '';
    reviewBtn.disabled = reviewUnsupported;
    reviewBtn.title = reviewUnsupported ? unsupportedActionMessage('Review', result.family) : '';
    setGenerationDisabled(generateUnsupported ? unsupportedActionMessage('Generate', result.family) : null);
    // Last valid diagram stays rendered: do not touch `preview.innerHTML`.
    if (reviewVisible) {
      const validation = await validateForReview(source, result.capabilities);
      if (!renderController.isCurrent(snapshot)) return;
      const findings = analyzeForReview(validation, lastResult?.positioned ?? null);
      updateReviewPanel(findings, lastResult?.svg ?? null, source);
    }
    return;
  }
  renderErrors([]);
  preview.classList.remove('stale');
  if (!mountSvg(preview, result.svg!)) {
    renderErrors([{ line: 0, column: 0, message: 'Failed to parse rendered SVG' }]);
    return;
  }
  svgViewport.sync();
  engineBadge.textContent = result.engineName!;
  familyBadgeLabel.textContent = familyLabel(result.family);
  familyBadge.title = result.family === 'bpmn'
    ? 'BPMN: BPMN editor and BPMN XML export available.'
    : result.family === 'mindmap'
      ? 'Mindmap: SVG and draw.io export available; BPMN editor/XML unavailable.'
      : result.family === null
        ? 'No supported diagram family detected.'
        : result.family === 'gantt'
          ? 'Gantt: SVG, JSON, and CSV export available; text-first preview only. Diagram mode, engine overrides, AI, and scheduling edits are unavailable.'
        : `${familyLabel(result.family)}: SVG export available; BPMN editor/XML unavailable.`;
  const isBpmnDiagram = Boolean(result.diagram && result.diagram.nodes.length > 0);
  const isRenderable = Boolean(result.svg);
  const structuredExportDescriptors = structuredExports(result.capabilities);
  const canExportXml = isBpmnDiagram && result.family === 'bpmn' && Boolean(result.capabilities?.structuredExport.includes('bpmn-xml'));
  const exportItems: ExportMenuItem[] = [];
  if (isRenderable) {
    exportItems.push({
      id: 'export-item-svg',
      label: 'Export SVG',
      onClick: () => {
        if (!lastResult?.svg) return;
        downloadFile('diagram.svg', lastResult.svg, 'image/svg+xml');
      },
    });
    if (result.family) {
      exportItems.push({
        id: 'export-item-pptx',
        label: 'Export editable PowerPoint',
        onClick: () => {
          const operation = operationState.begin('pptx-export', 'Preparing editable PowerPoint export', activeOperationIdentity());
          if (!operation) return;
          void (async () => {
            try {
              operation.update('preparing', 'Preparing editable PowerPoint export…');
              if (!lastResult?.family || !lastResult.executionPositioned) {
                operation.finish('error', 'PowerPoint export is unavailable until the diagram is rendered.');
                return;
              }
              const { exportPptx, snapshotFromRuntime } = await import('@bpm/export-pptx');
              const warnings: PptxExportWarning[] = [];
              const bytes = await exportPptx(snapshotFromRuntime({ family: lastResult.family, positioned: lastResult.executionPositioned, page: lastResult.header?.page, paginated: lastResult.paginated ?? undefined }), { warnings });
              downloadFile('diagram.pptx', bytes as unknown as BlobPart, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
              renderExportWarnings(warnings);
              operation.finish(warnings.length > 0 ? 'warning' : 'success', warnings.length > 0
                ? `PowerPoint export completed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`
                : 'PowerPoint export completed.');
            } catch (err) {
              renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
              operation.finish('error', `PowerPoint export failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          })();
        },
      });
    }
  }
  if (canExportXml) {
    exportItems.push({
      id: 'export-item-xml',
      label: 'Export BPMN XML',
      onClick: () => {
        if (!lastResult?.diagram || !lastResult.positioned || !lastResult.family) return;
        try {
          const xml = exportPositionedDiagram(lastResult.family, lastResult.diagram, lastResult.positioned, 'bpmn-xml');
          downloadFile('diagram.bpmn', xml, 'application/xml');
        } catch (err) {
          renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
        }
      },
    });
  }
  for (const [descriptorIndex, descriptor] of structuredExportDescriptors.entries()) {
    exportItems.push({
      // Preserve the established single-export selector for existing families while
      // giving multi-export families (currently Gantt) stable format-specific ids.
      id: result.family !== 'gantt' && descriptorIndex === 0 ? 'export-item-structured' : `export-item-${descriptor.format}`,
      label: `Export ${descriptor.label}`,
      onClick: () => {
        try {
          if (!lastResult?.family || !lastResult.ast || !lastResult.executionPositioned) return;
          const content = exportPositionedDiagram(
            lastResult.family,
            lastResult.ast,
            lastResult.executionPositioned,
            descriptor.format,
          );
          downloadFile(`diagram${descriptor.fileExtension}`, content, descriptor.mimeType);
        } catch (err) {
          renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
        }
      },
    });
  }
  textExportMenu.setDisabled(false);
  textExportMenu.setItems(exportItems);
  renderPaginationDiagnostics(result);
  editAsDiagramBtn.disabled = renderBusy || !isBpmnDiagram || result.capabilities?.editorMode !== 'bpmn-js';
  generateBtn.disabled = generateUnsupported;
  generateBtn.title = generateUnsupported ? unsupportedActionMessage('Generate', result.family) : '';
  reviewBtn.disabled = reviewUnsupported;
  reviewBtn.title = reviewUnsupported ? unsupportedActionMessage('Review', result.family) : '';
  setGenerationDisabled(generateUnsupported ? unsupportedActionMessage('Generate', result.family) : null);
  lastResult = isRenderable ? result : undefined;
  lastResultSource = isRenderable ? source : undefined;
  updateRenderDependentActions();

  if (reviewVisible) {
    const validation = await validateForReview(source, result.capabilities);
    if (!renderController.isCurrent(snapshot)) return;
    const findings = analyzeForReview(validation, result.positioned ?? null);
    updateReviewPanel(findings, result.svg, source);
  }
}

const renderController = createRenderController(
  () => editor.value,
  () => engineOverrideSelect.value || undefined,
  commitRender,
  undefined,
  (state) => {
    renderBusy = state.rendering;
    renderSpinnerEl.hidden = !state.rendering;
    renderCancelBtn.hidden = !state.canCancel;
    renderCancelBtn.disabled = !state.canCancel;
    if (state.rendering && state.elapsedMs !== undefined && state.elapsedMs >= 2000) {
      renderElapsedEl.hidden = false;
      renderElapsedEl.textContent = `${(state.elapsedMs / 1000).toFixed(1)}s`;
    } else {
      renderElapsedEl.hidden = true;
    }
    if (state.detail) {
      setRenderStatus(state.detail);
    } else if (state.phase === 'completed') {
      setRenderStatus(currentRenderAssessment.heavy ? (lastResultSource === editor.value ? 'Large diagram — rendered' : 'Large diagram — press Render') : (currentRenderMode() === 'manual' ? 'Manual render mode — press Render' : ''));
    } else if (state.phase === 'failed') {
      setRenderStatus('Render failed — press Render to retry');
    } else if (state.phase === 'idle') {
      setRenderStatus(currentRenderMode() === 'manual' ? 'Manual render mode — press Render' : '');
    }
    updateRenderDependentActions();
  },
);

async function rerender(): Promise<void> {
  await renderController.render();
}

function projectFilename(name: string): string {
  const stem = name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 96);
  return `${stem || 'bpm-project'}.bpm-project.json`;
}

function showProjectNotice(message: string, error = false): void {
  projectWarningEl.hidden = false;
  projectWarningEl.classList.toggle('project-warning-error', error);
  projectWarningEl.classList.toggle('project-warning-success', !error);
  projectWarningEl.querySelector('#project-warning-text')!.textContent = message;
  projectRetryBtn.hidden = true;
}

function serializablePositioned(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function createProjectBundle(): Promise<ProjectBundle> {
  await projectController.flush();
  const session = projectController.getSession();
  if (!session) throw new Error('Project session is not ready');

  const activeSource = editor.value;
  const entries: ProjectBundleDiagram[] = [];
  for (const diagram of session.diagrams) {
    const source = diagram.id === session.activeDiagram.id ? activeSource : diagram.body;
    const result = await runPipeline(source, engineOverrideSelect.value || undefined);
    let replaySource: string | undefined;
    let diagramXml = diagram.diagramXml;
    let diagramXmlOrigin: ProjectBundleDiagram['diagramXmlOrigin'] | undefined;
    if (diagram.id === session.activeDiagram.id && currentMode === 'diagram') {
      diagramXml = await diagramModeController.getXml();
      diagramXmlOrigin = 'diagram-editor';
    } else if (result.family === 'bpmn' && result.positioned && result.diagram && result.errors.length === 0) {
      diagramXml = exportPositionedDiagram(result.family, result.diagram, result.positioned, 'bpmn-xml');
      diagramXmlOrigin = 'source-render';
    }
    if (
      result.family === 'bpmn'
      && result.diagram
      && result.executionPositioned
      && result.diagram.positioning !== 'manual'
      && result.errors.length === 0
    ) {
      // Freeze the resolved automatic geometry into valid manual DSL. The original source is
      // retained separately, while imports use this replay source to avoid future layout-engine
      // changes moving a saved diagram.
      replaySource = printDiagram(freezeDiagram(
        result.diagram as Diagram,
        result.executionPositioned as PositionedDiagram,
      ));
    }
    const entry: ProjectBundleDiagram = {
      id: diagram.id,
      name: diagram.name,
      kind: diagram.kind,
      source,
      ...(replaySource ? { replaySource } : {}),
      ...(diagramXml ? { diagramXml } : {}),
      ...(diagramXmlOrigin ? { diagramXmlOrigin } : {}),
      ...(diagram.family ? { family: diagram.family } : {}),
      createdAt: diagram.createdAt,
      updatedAt: diagram.updatedAt,
    };
    if (result.svg && result.executionPositioned && result.errors.length === 0) {
      entry.render = {
        engine: result.engineName,
        positioning: result.diagram?.positioning === 'manual' ? 'manual' : 'auto',
        svg: result.svg,
        positioned: serializablePositioned(result.executionPositioned),
      };
    } else if (result.errors.length > 0) {
      entry.renderDiagnostics = result.errors.map((diagnostic) => diagnostic.message);
    }
    entries.push(entry);
  }

  return {
    format: PROJECT_BUNDLE_FORMAT,
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    activeDiagramId: session.activeDiagram.id,
    project: { ...session.project, updatedAt: new Date().toISOString() },
    diagrams: entries,
  };
}

async function saveProjectBundle(): Promise<void> {
  const operation = operationState.begin('project-bundle-export', 'Preparing project bundle', activeOperationIdentity());
  if (!operation) return;
  projectSaveBtn.disabled = true;
  const originalLabel = projectSaveBtn.textContent;
  projectSaveBtn.textContent = 'Preparing…';
  try {
    const bundle = await createProjectBundle();
    const json = JSON.stringify(bundle, null, 2);
    downloadFile(projectFilename(bundle.project.name), json, 'application/json');
    showProjectNotice(`Saved ${bundle.diagrams.length} diagram${bundle.diagrams.length === 1 ? '' : 's'} with render snapshots locally.`);
    operation.finish('success', 'Project bundle export completed.');
  } catch (error) {
    showProjectNotice(`Could not save project bundle: ${error instanceof Error ? error.message : String(error)}`, true);
    operation.finish('error', `Project bundle export failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    projectSaveBtn.disabled = false;
    projectSaveBtn.textContent = originalLabel;
  }
}

async function importSourceFile(file: File): Promise<void> {
  if (file.size > PROJECT_LIMITS.bundleBytes) {
    showProjectNotice(`File is too large to open (maximum ${PROJECT_LIMITS.bundleBytes / (1024 * 1024)} MiB).`, true);
    return;
  }
  if (!confirmDiscardTextUnsaved()) return;
  const sourceRevision = editor.value;
  const operation = operationState.begin('source-import', `Opening ${file.name}`, activeOperationIdentity());
  if (!operation) return;
  const sourceIdentity = activeOperationIdentity();
  sourceOpenBtn.disabled = true;

  try {
    operation.update('running', `Opening ${file.name}…`);
    const content = await file.text();
    const filename = file.name.toLowerCase();
    if (filename.endsWith('.bpm-project.json') || filename.endsWith('.json')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error('The selected JSON file is malformed.');
      }
      if (!isProjectBundle(parsed)) {
        throw new Error('JSON import supports .bpm-project.json bundles only.');
      }
      await projectController.importBundle(parsed);
      showProjectNotice(`Imported project "${parsed.project.name}" with ${parsed.diagrams.length} diagram${parsed.diagrams.length === 1 ? '' : 's'}.`);
      operation.finish('success', `${file.name} imported.`);
      return;
    }

    let source = content;
    let warning = '';
    const looksLikeXml = filename.endsWith('.bpmn') || filename.endsWith('.xml') || /^\s*</.test(content);
    if (looksLikeXml) {
      if (file.size > IMPORT_LIMITS.xmlBytes) {
        throw new Error(`BPMN XML exceeds the ${IMPORT_LIMITS.xmlBytes / (1024 * 1024)} MiB import limit.`);
      }
      const imported = await importBpmnXml(content);
      source = imported.text;
      if (new TextEncoder().encode(source).byteLength > PROJECT_LIMITS.bodyBytes) {
        throw new Error(`Diagram source exceeds the ${PROJECT_LIMITS.bodyBytes / (1024 * 1024)} MiB limit.`);
      }
      if (editor.value !== sourceRevision) {
        throw new Error('Import discarded because the Text editor changed while the BPMN file was being converted.');
      }
      const accepted = await showExternalImportPreview(file.name, source, imported.warnings, imported.lossReport);
      if (!accepted) {
        operation.finish('cancelled', `${file.name} import cancelled.`);
        return;
      }
      const currentIdentity = activeOperationIdentity();
      if (currentIdentity.projectId !== sourceIdentity.projectId || currentIdentity.diagramId !== sourceIdentity.diagramId) {
        throw new Error('Import discarded because the active project or diagram changed while the preview was open.');
      }
      if (editor.value !== sourceRevision) {
        throw new Error('Import discarded because the Text editor changed while the preview was open.');
      }
      warning = imported.warnings.length > 0 ? ` (${imported.warnings.length} import warning${imported.warnings.length === 1 ? '' : 's'})` : '';
    }
    if (new TextEncoder().encode(source).byteLength > PROJECT_LIMITS.bodyBytes) {
      throw new Error(`Diagram source exceeds the ${PROJECT_LIMITS.bodyBytes / (1024 * 1024)} MiB limit.`);
    }
    editor.value = source;
    renderController.invalidate();
    updateRenderDependentActions();
    projectController.scheduleAutosave();
    if (looksLikeXml) {
      if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
      currentRenderAssessment = assessRenderCost(editor.value);
      await rerender();
    } else {
      scheduleAutomaticRender(0);
    }
    editor.focus();
    showProjectNotice(`Loaded ${file.name}${warning}. The source is now rendered in the editor.`);
    operation.finish(warning ? 'warning' : 'success', `Loaded ${file.name}${warning}.`);
  } catch (error) {
    showProjectNotice(`Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`, true);
    operation.finish('error', `Could not open ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    sourceOpenBtn.disabled = false;
  }
}

renderBtn.addEventListener('click', renderNow);
renderCancelBtn.addEventListener('click', () => renderController.cancel());
projectSaveBtn.addEventListener('click', () => { void saveProjectBundle(); });
sourceOpenBtn.addEventListener('click', () => sourceOpenInput.click());
sourceOpenInput.addEventListener('change', () => {
  const file = sourceOpenInput.files?.[0];
  sourceOpenInput.value = '';
  if (file) void importSourceFile(file);
});
heavyRenderCloseBtn.addEventListener('click', () => heavyRenderDialog.close());
heavyRenderOnceBtn.addEventListener('click', () => {
  heavyRenderDialog.close();
  renderNow();
});

clearBtn.addEventListener('click', () => {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  renderController.invalidate();
  editor.value = '';
  updateRenderDependentActions();
  editor.focus();
  projectController.scheduleAutosave();
  scheduleAutomaticRender(0);
});

editor.addEventListener('input', () => {
  renderController.invalidate();
  updateRenderDependentActions();
  projectController.scheduleAutosave();
  scheduleAutomaticRender();
});

let reviewVisible = false;
let generateVisible = false;
let importVisible = false;
let settingsVisible = false;
let projectController!: ProjectController;

const EDITOR_VIEW_STORAGE_PREFIX = 'bpm.editorView.';

function editorViewStorageKey(): string | undefined {
  const diagramId = projectController?.getSession()?.activeDiagram.id;
  return diagramId ? `${EDITOR_VIEW_STORAGE_PREFIX}${diagramId}` : undefined;
}

function persistEditorView(): void {
  const key = editorViewStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      scrollTop: editor.scrollTop,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    }));
  } catch {
    // View persistence is best effort and must never interfere with editing.
  }
}

function restoreEditorView(): void {
  const key = editorViewStorageKey();
  if (!key) return;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as {
      scrollTop?: unknown;
      selectionStart?: unknown;
      selectionEnd?: unknown;
    } | null;
    if (!value || typeof value !== 'object') return;
    const selectionStart = typeof value.selectionStart === 'number' ? value.selectionStart : 0;
    const selectionEnd = typeof value.selectionEnd === 'number' ? value.selectionEnd : selectionStart;
    editor.setSelectionRange(
      Math.min(Math.max(0, selectionStart), editor.value.length),
      Math.min(Math.max(0, selectionEnd), editor.value.length),
    );
    if (typeof value.scrollTop === 'number' && Number.isFinite(value.scrollTop)) {
      editor.scrollTop = Math.max(0, value.scrollTop);
    }
  } catch {
    // Ignore malformed or unavailable view state.
  }
}

editor.addEventListener('scroll', persistEditorView);
editor.addEventListener('select', persistEditorView);

function requestProjectRender(delayMs: number): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  restoreEditorView();
  scheduleAutomaticRender(delayMs);
}

projectController = createProjectController({
  editor,
  projectNameEl,
  projectRenameButton: projectRenameBtn,
  diagramListEl,
  newDiagramButton: projectDiagramNewBtn,
  warningEl: projectWarningEl,
  retryButton: projectRetryBtn,
  starterText: WORKSPACE_TOUR,
  confirmDiscard: confirmDiscardTextUnsaved,
  invalidateRender: () => {
    renderController.invalidate();
    updateRenderDependentActions();
  },
  requestRender: requestProjectRender,
  focusEditor: () => editor.focus(),
  onError: (error) => projectController.reportError(error),
});

mountReviewPanel(document.querySelector('#preview-container')!);
mountGeneratePanel(document.querySelector('#preview-container')!);
mountImportPanel(
  document.querySelector('#import-panel-container')!,
  document.querySelector('#preview-container')!,
);
mountDiagramAgentPanel(document.querySelector('#diagram-agent-panel-container')!);
mountSettingsPanel(document.querySelector('#settings-panel-container')!);
setReviewCloseHandler(() => reviewBtn.click());
setGenerateCloseHandler(() => generateBtn.click());
setSettingsCloseHandler(() => settingsBtn.click());
setImportCloseHandler(() => diagramImportTextBtn.click());
setDiagramAgentAdapterGetter(() => diagramModeController.getAgentAdapter());
setDiagramAgentCloseHandler(() => diagramAgentBtn.click());
textExportMenu = createExportMenu('export-menu');
exportMenuContainer.appendChild(textExportMenu.container);

const diagramExportMenu = createExportMenu('diagram-export-menu');
diagramExportMenuContainer.appendChild(diagramExportMenu.container);
diagramExportMenu.setItems([
  {
    id: 'diagram-export-item-xml',
    label: 'Export BPMN XML',
    onClick: () => {
      const operation = operationState.begin('diagram-xml-export', 'Preparing BPMN XML export', activeOperationIdentity());
      if (!operation) return;
      void diagramModeController.exportXmlFile()
        .then(() => operation.finish('success', 'BPMN XML export completed.'))
        .catch((error) => operation.finish('error', `BPMN XML export failed: ${error instanceof Error ? error.message : String(error)}`));
    },
  },
  {
    id: 'diagram-export-item-svg',
    label: 'Export SVG',
    onClick: () => {
      void (async () => {
        try {
          await diagramModeController.exportSvgFile();
        } catch (err) {
          diagramModeController.renderErrors([err instanceof Error ? err.message : String(err)]);
        }
      })();
    },
  },
]);
// `#diagram-save` starts disabled in the HTML (no diagram loaded yet); this dynamically created
// menu has no markup to carry that initial state, so it must be disabled explicitly to match —
// createExportMenu()'s own `button.disabled = true` default is undone by the setItems() call above.
diagramExportMenu.setDisabled(true);

const ENGINE_OVERRIDE_STORAGE_KEY = 'bpm.engineOverride';
const engineOverrideSelect = getEngineOverrideSelect();
engineOverrideSelect.value = localStorage.getItem(ENGINE_OVERRIDE_STORAGE_KEY) ?? '';
engineOverrideSelect.addEventListener('change', () => {
  localStorage.setItem(ENGINE_OVERRIDE_STORAGE_KEY, engineOverrideSelect.value);
  renderController.invalidate();
  scheduleAutomaticRender(0);
});

/**
 * After an explicit "Insert into Text editor" confirm, switch to Text mode without the usual
 * discard-unsaved-changes prompt — the Insert click already *is* that confirmation (design doc
 * option set 4: no live sync, mode-switch latch instead). Mirrors setMode('text')'s
 * leaving-diagram branch exactly, minus the confirm gate.
 */
function switchToTextAfterImport(text: string): void {
  editor.value = text;
  renderController.invalidate();
  updateRenderDependentActions();
  currentMode = 'text';
  modeTextBtn.setAttribute('aria-pressed', 'true');
  modeDiagramBtn.setAttribute('aria-pressed', 'false');
  body.hidden = false;
  diagramBody.hidden = true;
  toolbarActions.hidden = false;
  diagramToolbarActions.hidden = true;
  destroyModeler();
  diagramModeController.setButtonsEnabled(false);
  projectController.scheduleAutosave();
  scheduleAutomaticRender(0);
}

setImportInsertHandler(switchToTextAfterImport);

diagramImportTextBtn.addEventListener('click', () => {
  importVisible = !importVisible;
  diagramImportTextBtn.setAttribute('aria-pressed', String(importVisible));
  if (importVisible) showImportPanel();
  else hideImportPanel();
});

diagramAgentBtn.addEventListener('click', () => {
  const visible = diagramAgentBtn.getAttribute('aria-pressed') === 'true';
  diagramAgentBtn.setAttribute('aria-pressed', String(!visible));
  if (visible) hideDiagramAgentPanel();
  else showDiagramAgentPanel();
});

setInsertTextHandler((text) => {
  editor.value = text;
  renderController.invalidate();
  updateRenderDependentActions();
  projectController.scheduleAutosave();
  scheduleAutomaticRender(0);
});

setApplyPatchHandler((patch) => {
  const current = editor.value;
  const idx = current.indexOf(patch.find);
  if (idx === -1) return false;
  editor.value = current.slice(0, idx) + patch.replace + current.slice(idx + patch.find.length);
  renderController.invalidate();
  updateRenderDependentActions();
  projectController.scheduleAutosave();
  scheduleAutomaticRender(150);
  return true;
});

setSourceTextGetter(() => editor.value);

reviewBtn.addEventListener('click', async () => {
  reviewVisible = !reviewVisible;
  reviewBtn.setAttribute('aria-pressed', String(reviewVisible));
  if (reviewVisible) {
    generateVisible = false;
    generateBtn.setAttribute('aria-pressed', 'false');
    hideGeneratePanel();
    settingsVisible = false;
    settingsBtn.setAttribute('aria-pressed', 'false');
    hideSettingsPanel();
    const validation = await validateForReview(editor.value, lastResult?.capabilities ?? null);
    const lastPositioned = lastResult?.positioned ?? null;
    const findings = analyzeForReview(validation, lastPositioned);
    updateReviewPanel(findings, lastResult?.svg ?? null, editor.value);
  } else {
    hideReviewPanel();
  }
});

generateBtn.addEventListener('click', () => {
  generateVisible = !generateVisible;
  generateBtn.setAttribute('aria-pressed', String(generateVisible));
  if (generateVisible) {
    reviewVisible = false;
    reviewBtn.setAttribute('aria-pressed', 'false');
    hideReviewPanel();
    settingsVisible = false;
    settingsBtn.setAttribute('aria-pressed', 'false');
    hideSettingsPanel();
    showGeneratePanel();
  } else {
    hideGeneratePanel();
  }
});

settingsBtn.addEventListener('click', () => {
  settingsVisible = !settingsVisible;
  settingsBtn.setAttribute('aria-pressed', String(settingsVisible));
  if (settingsVisible) {
    reviewVisible = false;
    reviewBtn.setAttribute('aria-pressed', 'false');
    hideReviewPanel();
    generateVisible = false;
    generateBtn.setAttribute('aria-pressed', 'false');
    hideGeneratePanel();
    showSettingsPanel();
  } else {
    hideSettingsPanel();
  }
});

window.addEventListener('beforeunload', (event) => {
  if (currentMode === 'diagram' && hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
  if (currentMode === 'text' && projectController.isDirty()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

void projectController.bootstrap()
  .then(() => { restoreEditorView(); scheduleAutomaticRender(0); })
  .catch((error) => projectController.reportError(error));
