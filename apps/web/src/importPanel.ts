import { importXml, type ImportLossReport } from '@bpm/import-xml';
import { exportXml, verifyExportedXml } from './diagramMode.js';
import { createPanelHeader } from './panelHeader.js';

type InsertAndSwitchFn = (text: string) => void;
let onInsertAndSwitch: InsertAndSwitchFn | null = null;

export function setImportInsertHandler(fn: InsertAndSwitchFn): void {
  onInsertAndSwitch = fn;
}

let onClose: (() => void) | null = null;

export function setCloseHandler(fn: () => void): void {
  onClose = fn;
}

let panelEl: HTMLDivElement | null = null;
let diagramContainerEl: HTMLElement | null = null;
let textContainerEl: HTMLElement | null = null;
let importBtn: HTMLButtonElement | null = null;
let statusEl: HTMLDivElement | null = null;
let resultEl: HTMLDivElement | null = null;
let pendingText: string | null = null;
let pendingExternalResolve: ((accepted: boolean) => void) | null = null;

function setStatus(msg: string | null): void {
  if (!statusEl) return;
  statusEl.textContent = msg ?? '';
  statusEl.hidden = !msg;
}

function renderIssues(title: string, issues: string[]): void {
  if (!resultEl) return;
  resultEl.innerHTML = '';
  resultEl.hidden = false;

  const badge = document.createElement('div');
  badge.className = 'generate-result-badge generate-invalid';
  badge.textContent = title;
  resultEl.appendChild(badge);

  const list = document.createElement('ul');
  list.className = 'import-issue-list';
  for (const issue of issues) {
    const li = document.createElement('li');
    li.textContent = issue;
    list.appendChild(li);
  }
  resultEl.appendChild(list);
}

function renderLossReport(report: ImportLossReport): void {
  if (!resultEl || (report.transformed === 0 && report.dropped === 0)) return;

  const summary = document.createElement('div');
  summary.className = 'import-loss-summary';
  summary.textContent = `Conversion accounting: ${report.preserved} preserved, ${report.transformed} transformed, ${report.dropped} dropped.`;
  resultEl.appendChild(summary);

  if (report.entries.length === 0) return;
  const details = document.createElement('details');
  const summaryLabel = document.createElement('summary');
  summaryLabel.textContent = `Show conversion details (${report.entries.length}${report.entries.length === 256 ? '+' : ''})`;
  details.appendChild(summaryLabel);
  const list = document.createElement('ul');
  list.className = 'import-issue-list';
  for (const entry of report.entries) {
    const li = document.createElement('li');
    const prefix = entry.kind === 'dropped' ? 'Dropped' : 'Transformed';
    li.textContent = `${prefix} ${entry.sourceType}${entry.id ? ` "${entry.id}"` : ''}: ${entry.message}`;
    list.appendChild(li);
  }
  details.appendChild(list);
  resultEl.appendChild(details);
}

function renderPreview(text: string, warnings: string[], lossReport: ImportLossReport): void {
  if (!resultEl) return;
  resultEl.innerHTML = '';
  resultEl.hidden = false;
  pendingText = text;

  const badge = document.createElement('div');
  badge.className = 'generate-result-badge generate-valid';
  badge.textContent = warnings.length > 0 ? `Ready to insert (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : 'Ready to insert';
  resultEl.appendChild(badge);

  if (warnings.length > 0) {
    const list = document.createElement('ul');
    list.className = 'import-issue-list';
    for (const w of warnings) {
      const li = document.createElement('li');
      li.textContent = w;
      list.appendChild(li);
    }
    resultEl.appendChild(list);
  }

  renderLossReport(lossReport);

  const pre = document.createElement('pre');
  pre.className = 'generate-result-text';
  pre.textContent = text;
  resultEl.appendChild(pre);

  const insertBtn = document.createElement('button');
  insertBtn.className = 'review-run-btn';
  insertBtn.textContent = 'Insert into Text editor';
  insertBtn.addEventListener('click', () => {
    if (pendingText !== null) onInsertAndSwitch?.(pendingText);
  });
  resultEl.appendChild(insertBtn);
}

async function runImport(): Promise<void> {
  if (importBtn) importBtn.disabled = true;
  if (resultEl) resultEl.hidden = true;
  setStatus('Exporting current diagram…');

  try {
    const xml = await exportXml();

    setStatus('Checking export integrity…');
    const integrity = await verifyExportedXml(xml);
    if (!integrity.ok) {
      setStatus(null);
      renderIssues('Export failed an integrity check — not converted', integrity.issues);
      return;
    }

    setStatus('Converting to .bpm text…');
    const { text, warnings, lossReport } = await importXml(xml);
    setStatus(null);
    renderPreview(text, warnings, lossReport);
  } catch (err) {
    setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (importBtn) importBtn.disabled = false;
  }
}

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'import-panel';
  panelEl.hidden = true;

  const header = createPanelHeader('Import to Text', () => onClose?.());
  panelEl.appendChild(header.el);

  const description = document.createElement('div');
  description.className = 'review-status';
  description.hidden = false;
  description.textContent = 'Converts the current Diagram-mode edits into .bpm text. Shows a preview first — nothing is inserted until you confirm.';
  panelEl.appendChild(description);

  const settingsEl = document.createElement('div');
  settingsEl.className = 'review-settings';
  importBtn = document.createElement('button');
  importBtn.className = 'review-run-btn';
  importBtn.textContent = 'Convert';
  importBtn.addEventListener('click', () => void runImport());
  settingsEl.appendChild(importBtn);
  panelEl.appendChild(settingsEl);

  statusEl = document.createElement('div');
  statusEl.className = 'review-status';
  statusEl.hidden = true;
  panelEl.appendChild(statusEl);

  resultEl = document.createElement('div');
  resultEl.hidden = true;
  panelEl.appendChild(resultEl);

  return panelEl;
}

export function mountImportPanel(diagramContainer: HTMLElement, textContainer: HTMLElement = diagramContainer): void {
  diagramContainerEl = diagramContainer;
  textContainerEl = textContainer;
  diagramContainer.appendChild(ensurePanel());
}

export function showImportPanel(): void {
  const panel = ensurePanel();
  diagramContainerEl?.appendChild(panel);
  panel.hidden = false;
}

export function hideImportPanel(): void {
  if (pendingExternalResolve) {
    pendingExternalResolve(false);
    pendingExternalResolve = null;
  }
  if (panelEl) panelEl.hidden = true;
}

/** Show an external BPMN conversion for review before it can replace Text mode. */
export function showExternalImportPreview(
  filename: string,
  text: string,
  warnings: string[],
  lossReport: ImportLossReport,
): Promise<boolean> {
  const panel = ensurePanel();
  textContainerEl?.appendChild(panel);
  panel.hidden = false;
  if (statusEl) statusEl.hidden = true;
  if (!resultEl) return Promise.resolve(false);
  resultEl.innerHTML = '';
  resultEl.hidden = false;

  const badge = document.createElement('div');
  badge.className = 'generate-result-badge generate-valid';
  badge.textContent = warnings.length > 0
    ? `Ready to review ${filename} (${warnings.length} warning${warnings.length === 1 ? '' : 's'})`
    : `Ready to review ${filename}`;
  resultEl.appendChild(badge);

  if (warnings.length > 0) {
    const list = document.createElement('ul');
    list.className = 'import-issue-list';
    for (const warning of warnings) {
      const li = document.createElement('li');
      li.textContent = warning;
      list.appendChild(li);
    }
    resultEl.appendChild(list);
  }

  renderLossReport(lossReport);

  const pre = document.createElement('pre');
  pre.className = 'generate-result-text';
  pre.textContent = text;
  resultEl.appendChild(pre);

  const actions = document.createElement('div');
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'review-run-btn';
  confirmBtn.textContent = 'Replace Text editor';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'panel-close-btn';
  cancelBtn.textContent = 'Cancel';
  const finish = (accepted: boolean) => {
    pendingExternalResolve?.(accepted);
    pendingExternalResolve = null;
    hideImportPanel();
  };
  confirmBtn.addEventListener('click', () => finish(true));
  cancelBtn.addEventListener('click', () => finish(false));
  actions.append(confirmBtn, cancelBtn);
  resultEl.appendChild(actions);

  return new Promise<boolean>((resolve) => {
    pendingExternalResolve = resolve;
  });
}
