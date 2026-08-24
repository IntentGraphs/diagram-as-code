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
import type { Diagram, SourceLocation } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout';
import type { PptxExportWarning } from '@bpm/export-pptx';
import { destroyModeler, hasUnsavedChanges } from './diagramMode.js';
import { downloadFile } from './downloads.js';
import { runPipeline, type PipelineResult } from './pipeline.js';
import { mountSvg } from './mountSvg.js';
import { createSvgViewport } from './svgViewport.js';
import { getViewportAnchor } from './viewportAnchor.js';
import { renderCanvasRulers } from './canvasRulers.js';
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
import { assessIncrementalRender, assessRenderCost, renderDebounceMs, type RenderAssessment } from './renderPolicy.js';
import { createRenderCache } from './renderCache.js';
import { isProjectBundle, PROJECT_LIMITS } from './project/store.js';
import { PROJECT_BUNDLE_FORMAT, PROJECT_BUNDLE_VERSION, type ProjectBundle, type ProjectBundleDiagram } from './project/types.js';
import { WORKSPACE_TOUR } from './project/starterProject.js';
import { createOperationStateCoordinator } from './operationState.js';

const editor = document.querySelector<HTMLTextAreaElement>('#editor')!;
const editorPane = document.querySelector<HTMLDivElement>('#editor-pane')!;
const splitter = document.querySelector<HTMLDivElement>('#splitter')!;
const editorLineHighlight = document.querySelector<HTMLDivElement>('#editor-line-highlight')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const previewContainer = document.querySelector<HTMLDivElement>('#preview-container')!;
const previewTooltip = document.querySelector<HTMLDivElement>('#preview-tooltip')!;
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
const freezeAsManualBtn = document.querySelector<HTMLButtonElement>('#freeze-as-manual')!;
const body = document.querySelector<HTMLDivElement>('#body')!;
const diagramBody = document.querySelector<HTMLDivElement>('#diagram-body')!;
const toolbarActions = document.querySelector<HTMLDivElement>('#toolbar-actions')!;
const diagramToolbarActions = document.querySelector<HTMLDivElement>('#diagram-toolbar-actions')!;
const diagramCanvas = document.querySelector<HTMLDivElement>('#diagram-canvas')!;
const canvasGridBtn = document.querySelector<HTMLButtonElement>('#canvas-grid-btn')!;
const canvasThemeBtn = document.querySelector<HTMLButtonElement>('#canvas-theme-btn')!;
const canvasZoomOutBtn = document.querySelector<HTMLButtonElement>('#canvas-zoom-out')!;
const canvasZoomInBtn = document.querySelector<HTMLButtonElement>('#canvas-zoom-in')!;
const canvasZoomFitBtn = document.querySelector<HTMLButtonElement>('#canvas-zoom-fit')!;
const canvasZoomSelect = document.querySelector<HTMLSelectElement>('#canvas-zoom-select')!;
const canvasRulerHorizontal = document.querySelector<HTMLDivElement>('#canvas-ruler-horizontal')!;
const canvasRulerVertical = document.querySelector<HTMLDivElement>('#canvas-ruler-vertical')!;
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
const renderCache = createRenderCache();

function updateCanvasZoomSelect(zoom: number): void {
  const generated = canvasZoomSelect.querySelector('option[data-generated="true"]');
  generated?.remove();
  const roundedZoom = Math.round(zoom * 100) / 100;
  const matchingOption = Array.from(canvasZoomSelect.options).find((option) => Math.abs(Number(option.value) - roundedZoom) < 0.0001);
  if (matchingOption) {
    canvasZoomSelect.value = matchingOption.value;
    return;
  }
  const option = new Option(`${Math.round(zoom * 100)}%`, String(roundedZoom));
  option.dataset.generated = 'true';
  canvasZoomSelect.append(option);
  canvasZoomSelect.value = option.value;
}

svgViewport.subscribe((snapshot) => {
  updateCanvasZoomSelect(snapshot?.zoom ?? 1);
  renderCanvasRulers(canvasRulerHorizontal, canvasRulerVertical, snapshot);
});

canvasGridBtn.addEventListener('click', () => {
  const gridVisible = canvasGridBtn.getAttribute('aria-pressed') === 'true';
  canvasGridBtn.setAttribute('aria-pressed', String(!gridVisible));
  canvasGridBtn.setAttribute('aria-label', gridVisible ? 'Show gridlines' : 'Hide gridlines');
  canvasGridBtn.title = gridVisible ? 'Show gridlines' : 'Hide gridlines';
  preview.classList.toggle('canvas-grid-hidden', gridVisible);
});

canvasThemeBtn.addEventListener('click', () => {
  const dark = canvasThemeBtn.dataset.canvasTheme !== 'dark';
  canvasThemeBtn.dataset.canvasTheme = dark ? 'dark' : 'light';
  canvasThemeBtn.setAttribute('aria-pressed', String(dark));
  const label = dark ? 'Switch canvas to light theme' : 'Switch canvas to dark theme';
  canvasThemeBtn.setAttribute('aria-label', label);
  canvasThemeBtn.title = label;
  preview.classList.toggle('canvas-theme-dark', dark);
  canvasThemeBtn.querySelector<HTMLElement>('[data-theme-icon="light"]')?.toggleAttribute('hidden', dark);
  canvasThemeBtn.querySelector<HTMLElement>('[data-theme-icon="dark"]')?.toggleAttribute('hidden', !dark);
});

canvasZoomOutBtn.addEventListener('click', () => svgViewport.zoomBy(1 / 1.2));
canvasZoomInBtn.addEventListener('click', () => svgViewport.zoomBy(1.2));
canvasZoomFitBtn.addEventListener('click', () => svgViewport.fit());
canvasZoomSelect.addEventListener('change', () => svgViewport.setZoom(Number(canvasZoomSelect.value)));

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
let lastRenderElapsedMs = 0;
let textExportMenu!: ReturnType<typeof createExportMenu>;

type PreviewSelection = { kind: 'node' | 'edge' | 'pool' | 'lane'; id: string };
let previewSelection: PreviewSelection | null = null;
let sourceHighlightLocation: SourceLocation | null = null;
const PREVIEW_TARGETS = [
  { kind: 'node', attributes: ['data-node-id', 'data-node-label-id'] },
  { kind: 'edge', attributes: ['data-edge-id', 'data-edge-label-id'] },
  { kind: 'pool', attributes: ['data-pool-id'] },
  { kind: 'lane', attributes: ['data-lane-id', 'data-lane-label-id'] },
] as const;

function selectionFromTarget(target: EventTarget | null): PreviewSelection | null {
  if (!(target instanceof Element)) return null;
  let element: Element | null = target;
  while (element && element !== preview) {
    for (const target of PREVIEW_TARGETS) {
      for (const attribute of target.attributes) {
        const id = element.getAttribute(attribute);
        if (id) return { kind: target.kind, id };
      }
    }
    element = element.parentElement;
  }
  return null;
}

function applyPreviewSelection(selection: PreviewSelection | null): void {
  const active = preview.querySelectorAll('.diagram-selection-active');
  active.forEach((element) => element.classList.remove('diagram-selection-active'));
  if (!selection) return;
  const target = PREVIEW_TARGETS.find((candidate) => candidate.kind === selection.kind);
  if (!target) return;
  for (const attribute of target.attributes) {
    preview.querySelectorAll(`[${attribute}]`).forEach((element) => {
      if (element.getAttribute(attribute) === selection.id) element.classList.add('diagram-selection-active');
    });
  }
}

function sourceLocationForSelection(selection: PreviewSelection): SourceLocation | undefined {
  // Invalid/stale previews remain visible by design, but their old source map must never move
  // the cursor in newer text that has not rendered yet.
  if (!lastResult || lastResultSource !== editor.value) return undefined;
  const mapKey = selection.kind === 'node' ? 'nodes' : selection.kind === 'edge' ? 'edges' : selection.kind === 'pool' ? 'pools' : 'lanes';
  return lastResult?.sourceLocations?.[mapKey]?.[selection.id];
}

function updateEditorSourceHighlight(): void {
  if (!sourceHighlightLocation) {
    editorLineHighlight.style.display = 'none';
    return;
  }
  const lineIndex = Math.max(0, sourceHighlightLocation.line - 1);
  const style = getComputedStyle(editor);
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const top = editor.offsetTop + borderTop + paddingTop + lineIndex * lineHeight - editor.scrollTop;
  const bottom = editor.offsetTop + editor.clientHeight;
  if (top + lineHeight < editor.offsetTop || top > bottom) {
    editorLineHighlight.style.display = 'none';
    return;
  }
  editorLineHighlight.style.display = 'block';
  editorLineHighlight.style.left = `${editor.offsetLeft}px`;
  editorLineHighlight.style.top = `${top}px`;
  editorLineHighlight.style.width = `${editor.offsetWidth}px`;
  editorLineHighlight.style.height = `${lineHeight}px`;
}

function selectEditorLocation(location: SourceLocation): void {
  const lines = editor.value.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, location.line - 1));
  const lineStart = lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0);
  const start = lineStart + Math.max(0, location.startColumn - 1);
  const end = Math.max(start, Math.min(lineStart + lines[lineIndex].length, lineStart + Math.max(0, location.endColumn - 1)));
  sourceHighlightLocation = location;
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, end, 'select');
  const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 20;
  const paddingTop = Number.parseFloat(getComputedStyle(editor).paddingTop) || 0;
  const targetScrollTop = Math.max(0, paddingTop + lineIndex * lineHeight - editor.clientHeight / 2 + lineHeight / 2);
  editor.scrollTop = targetScrollTop;
  updateEditorSourceHighlight();
  requestAnimationFrame(() => {
    editor.scrollTop = targetScrollTop;
    updateEditorSourceHighlight();
  });
}

function describePreviewSelection(selection: PreviewSelection): string {
  const kind = selection.kind[0].toUpperCase() + selection.kind.slice(1);
  const location = sourceLocationForSelection(selection);
  const line = location ? editor.value.split('\n')[location.line - 1]?.trim() : '';
  return `${kind} · ${selection.id}${location ? `\nDSL line ${location.line}${line ? `: ${line}` : ''}` : ''}`;
}

function showPreviewTooltip(event: PointerEvent, selection: PreviewSelection): void {
  previewTooltip.textContent = describePreviewSelection(selection);
  previewTooltip.hidden = false;
  const containerRect = previewContainer.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, containerRect.width - previewTooltip.offsetWidth - margin);
  const maxTop = Math.max(margin, containerRect.height - previewTooltip.offsetHeight - margin);
  previewTooltip.style.left = `${Math.min(maxLeft, Math.max(margin, event.clientX - containerRect.left + 12))}px`;
  previewTooltip.style.top = `${Math.min(maxTop, Math.max(margin, event.clientY - containerRect.top + 12))}px`;
}

function hidePreviewTooltip(): void {
  previewTooltip.hidden = true;
}

/**
 * Source edits invalidate the semantic identity of the currently selected preview element.
 * Edges currently receive generated ids (e1, e2, ...), so retaining a selection across an edit
 * could silently select a different edge after the next parse. Clearing is safer than guessing.
 */
function clearPreviewSelection(): void {
  previewSelection = null;
  sourceHighlightLocation = null;
  applyPreviewSelection(null);
  updateEditorSourceHighlight();
  hidePreviewTooltip();
}

/** Keep all programmatic source replacements on the same invalidation path as typing. */
function replaceEditorSource(value: string): void {
  if (editor.value !== value) clearPreviewSelection();
  editor.value = value;
}

function selectPreviewElement(selection: PreviewSelection): void {
  previewSelection = selection;
  applyPreviewSelection(selection);
  const location = sourceLocationForSelection(selection);
  if (location) selectEditorLocation(location);
  else {
    sourceHighlightLocation = null;
    updateEditorSourceHighlight();
  }
}

preview.addEventListener('pointerover', (event) => {
  const selection = selectionFromTarget(event.target);
  if (selection) showPreviewTooltip(event, selection);
});

preview.addEventListener('pointermove', (event) => {
  const selection = selectionFromTarget(event.target);
  if (selection) showPreviewTooltip(event, selection);
  else hidePreviewTooltip();
});

preview.addEventListener('pointerleave', hidePreviewTooltip);

preview.addEventListener('click', (event) => {
  const selection = selectionFromTarget(event.target);
  if (!selection) {
    previewSelection = null;
    sourceHighlightLocation = null;
    applyPreviewSelection(null);
    updateEditorSourceHighlight();
    hidePreviewTooltip();
    return;
  }
  event.preventDefault();
  selectPreviewElement(selection);
  showPreviewTooltip(event, selection);
});

preview.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    previewSelection = null;
    sourceHighlightLocation = null;
    applyPreviewSelection(null);
    updateEditorSourceHighlight();
    hidePreviewTooltip();
  }
});

editor.addEventListener('scroll', updateEditorSourceHighlight);
window.addEventListener('resize', updateEditorSourceHighlight);

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
  const canFreezeAsManual = actionsReady
    && Boolean(lastResult?.diagram)
    && Boolean(lastResult?.executionPositioned)
    && lastResult?.family === 'bpmn'
    && lastResult.diagram?.positioning !== 'manual';
  freezeAsManualBtn.disabled = !canFreezeAsManual;
  freezeAsManualBtn.title = canFreezeAsManual
    ? 'Convert the current automatic layout into manual DSL coordinates'
    : lastResult?.diagram?.positioning === 'manual'
      ? 'This diagram already uses manual positioning'
      : 'Render a valid automatic BPMN diagram before freezing its layout';
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
  toolbarActions.hidden = false;
  toolbarActions.classList.toggle('diagram-mode', isDiagram);
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
    const previewAnchor = getViewportAnchor(svgViewport.getSnapshot(), lastResult.positioned);
    setMode('diagram');
    operation = operationState.begin('diagram-xml-load', 'Loading diagram preview', activeOperationIdentity());
    if (!operation) return;
    await diagramModeController.loadXml(xml);
    if (previewAnchor) diagramModeController.restoreViewport(previewAnchor);
    operation.finish('success', 'Diagram preview loaded.');
  } catch (err) {
    operation?.finish('error', `Could not load diagram preview: ${err instanceof Error ? err.message : String(err)}`);
    renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
  }
});

freezeAsManualBtn.addEventListener('click', async () => {
  if (renderBusy || lastResultSource !== editor.value) return;
  const source = editor.value;
  const result = lastResult;
  if (
    !result
    || result.family !== 'bpmn'
    || !result.diagram
    || result.diagram.positioning === 'manual'
    || !result.executionPositioned
    || result.errors.length > 0
  ) return;

  freezeAsManualBtn.disabled = true;
  try {
    const frozenText = printDiagram(freezeDiagram(
      result.diagram,
      result.executionPositioned as PositionedDiagram,
    ));
    const validation = await validateDiagramSource(frozenText);
    if (!validation.valid) {
      renderErrors([...validation.errors, ...validation.semanticErrors]);
      return;
    }
    // Validation is asynchronous. Do not overwrite a newer user edit or a render from another
    // diagram that landed while the conversion was running.
    if (editor.value !== source || lastResultSource !== source) return;

    replaceEditorSource(frozenText);
    renderController.invalidate();
    updateRenderDependentActions();
    projectController.scheduleAutosave();
    editor.focus();
    await rerender();
  } catch (err) {
    renderErrors([{ line: 1, column: 1, message: err instanceof Error ? err.message : String(err) }]);
  } finally {
    updateRenderDependentActions();
  }
});

const EDITOR_WIDTH_STORAGE_KEY = 'bpm.editorWidthPx';
const MIN_PANE_WIDTH = 240;

function applyEditorWidth(px: number): void {
  const max = window.innerWidth - MIN_PANE_WIDTH - splitter.offsetWidth;
  const clamped = Math.min(Math.max(px, MIN_PANE_WIDTH), Math.max(max, MIN_PANE_WIDTH));
  editorPane.style.flex = `0 0 ${clamped}px`;
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
  const label = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen preview';
  fullscreenBtn.setAttribute('aria-label', label);
  fullscreenBtn.title = label;
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

function showHeavyRenderWarning(assessment: RenderAssessment, incrementalReason?: string): void {
  if (autoHeavyWarningShown || heavyRenderDialog.open) return;
  autoHeavyWarningShown = true;
  const modeMessage = currentRenderMode() === 'auto'
    ? '"render: auto" is paused for repeated live layouts.'
    : 'Automatic rendering is paused for this diagram.';
  const incrementalMessage = incrementalReason ? ` ${incrementalReason}` : '';
  heavyRenderMessage.textContent = assessment.hardBlocked
    ? `Automatic rendering stopped immediately: ${heavyRenderReason(assessment)}.${incrementalMessage} The previous preview is preserved. Reduce the diagram or press Render to try explicitly.`
    : `This diagram is classified as heavy (${heavyRenderReason(assessment)}). ${modeMessage}${incrementalMessage} The previous preview is preserved. Press Render to update the preview once; editing and autosave remain available.`;
  heavyRenderDialog.showModal();
}

function scheduleAutomaticRender(delayMs = renderDebounceMs(editor.value)): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  currentRenderAssessment = assessRenderCost(editor.value);
  const mode = currentRenderMode();
  const incremental = assessIncrementalRender(lastResultSource, editor.value, lastRenderElapsedMs);

  if (currentRenderAssessment.hardBlocked) {
    setRenderStatus('Render blocked — reduce diagram or press Render');
    if (mode === 'auto') showHeavyRenderWarning(currentRenderAssessment, incremental.reason);
    return;
  }

  if (currentRenderAssessment.heavy && !incremental.allowed) {
    setRenderStatus(mode === 'auto' ? 'Large diagram — press Render' : 'Manual render mode — press Render');
    if (mode === 'auto') showHeavyRenderWarning(currentRenderAssessment, incremental.reason);
    return;
  }

  autoHeavyWarningShown = false;
  if (mode === 'manual') {
    setRenderStatus('Manual render mode — press Render');
    return;
  }
  setRenderStatus('');
  const incrementalDelay = incremental.allowed && currentRenderAssessment.heavy ? Math.max(delayMs, 500) : delayMs;
  renderDebounceHandle = setTimeout(() => { void rerender(); }, incrementalDelay);
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
  if (source !== lastResultSource) clearPreviewSelection();
  const previewView = svgViewport.getSnapshot();
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
  svgViewport.sync(previewView);
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
  applyPreviewSelection(previewSelection);
  const selectedSourceLocation = previewSelection ? sourceLocationForSelection(previewSelection) : undefined;
  sourceHighlightLocation = selectedSourceLocation ?? null;
  updateEditorSourceHighlight();
  updateRenderDependentActions();
  if (isRenderable && result.errors.length === 0) {
    void renderCache.put(activeOperationIdentity(), source, engineOverrideSelect.value || undefined, result);
  }

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
    if (state.phase === 'completed' && state.elapsedMs !== undefined) lastRenderElapsedMs = state.elapsedMs;
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
  const source = editor.value;
  const identity = activeOperationIdentity();
  const engineOverride = engineOverrideSelect.value || undefined;
  const cached = await renderCache.get(identity, source, engineOverride);
  const currentIdentity = activeOperationIdentity();
  if (source !== editor.value || identity.projectId !== currentIdentity.projectId || identity.diagramId !== currentIdentity.diagramId) return;
  if (cached) {
    currentRenderAssessment = assessRenderCost(source);
    await renderController.commitCached(cached);
    return;
  }
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
    replaceEditorSource(source);
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
  replaceEditorSource('');
  updateRenderDependentActions();
  editor.focus();
  projectController.scheduleAutosave();
  scheduleAutomaticRender(0);
});

editor.addEventListener('input', () => {
  renderController.invalidate();
  if (lastResultSource !== editor.value) {
    clearPreviewSelection();
  }
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

async function restoreCachedOrSchedule(delayMs: number): Promise<void> {
  const source = editor.value;
  const identity = activeOperationIdentity();
  const engineOverride = engineOverrideSelect.value || undefined;
  const cached = await renderCache.get(identity, source, engineOverride);
  const currentIdentity = activeOperationIdentity();
  if (source !== editor.value || identity.projectId !== currentIdentity.projectId || identity.diagramId !== currentIdentity.diagramId) return;
  if (cached) {
    currentRenderAssessment = assessRenderCost(source);
    await renderController.commitCached(cached);
  } else {
    scheduleAutomaticRender(delayMs);
  }
}

function requestProjectRender(delayMs: number): void {
  if (renderDebounceHandle) clearTimeout(renderDebounceHandle);
  restoreEditorView();
  void restoreCachedOrSchedule(delayMs);
}

function installBottomPanelResizer(panelId: string): void {
  const panel = document.querySelector<HTMLElement>(`#${panelId}`);
  if (!panel || panel.querySelector('.panel-resize-handle')) return;

  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-label', `Resize ${panelId.replace('-panel', '')} panel`);
  handle.tabIndex = 0;
  panel.prepend(handle);

  const panelBounds = (): { min: number; max: number } => {
    const styles = getComputedStyle(panel);
    const min = Number.parseFloat(styles.minHeight) || 100;
    const max = Number.parseFloat(styles.maxHeight) || window.innerHeight * 0.8;
    return { min, max: Math.max(min, max) };
  };

  const setPanelHeight = (height: number): void => {
    const { min, max } = panelBounds();
    panel.style.height = `${Math.round(Math.min(max, Math.max(min, height)))}px`;
  };

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent): void => {
      setPanelHeight(startHeight + startY - moveEvent.clientY);
    };
    const finish = (): void => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', finish);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', finish, { once: true });
    handle.addEventListener('pointercancel', finish, { once: true });
  });

  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setPanelHeight(panel.getBoundingClientRect().height + (event.key === 'ArrowUp' ? 24 : -24));
  });
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
installBottomPanelResizer('review-panel');
installBottomPanelResizer('generate-panel');
installBottomPanelResizer('settings-panel');
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
  replaceEditorSource(text);
  renderController.invalidate();
  updateRenderDependentActions();
  currentMode = 'text';
  modeTextBtn.setAttribute('aria-pressed', 'true');
  modeDiagramBtn.setAttribute('aria-pressed', 'false');
  body.hidden = false;
  diagramBody.hidden = true;
  toolbarActions.hidden = false;
  toolbarActions.classList.remove('diagram-mode');
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
  replaceEditorSource(text);
  renderController.invalidate();
  updateRenderDependentActions();
  projectController.scheduleAutosave();
  scheduleAutomaticRender(0);
});

setApplyPatchHandler((patch) => {
  const current = editor.value;
  const idx = current.indexOf(patch.find);
  if (idx === -1) return false;
  replaceEditorSource(current.slice(0, idx) + patch.replace + current.slice(idx + patch.find.length));
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
