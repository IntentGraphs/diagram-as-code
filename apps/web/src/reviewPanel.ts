import type { PositionedDiagram } from '@bpm/layout-core';
import { validate, type ValidationResult } from '@bpm/validate';
import {
  callOllama,
  callOllamaRepair,
  callOpenAICompatible,
  callOpenAIRepair,
  repairLoop,
  type TextPatch,
  type WebFinding,
  ProviderRequestError,
  type ProviderRequestOptions,
} from './reviewProviders.js';

const REPAIR_ATTEMPTS = 3;
import { getApiKey, getBaseUrl, getModel, showSettingsPanel } from './settingsPanel.js';
import { createPanelHeader } from './panelHeader.js';

export type { TextPatch, WebFinding };

const PROVIDER_STORAGE_KEY = 'bpm.review.provider';

type ApplyPatchFn = (patch: TextPatch) => boolean;
let onApplyPatch: ApplyPatchFn | null = null;
let getSourceText: (() => string) | null = null;

export function setApplyPatchHandler(fn: ApplyPatchFn): void {
  onApplyPatch = fn;
}

export function setSourceTextGetter(fn: () => string): void {
  getSourceText = fn;
}

let onClose: (() => void) | null = null;

export function setCloseHandler(fn: () => void): void {
  onClose = fn;
}

export function analyzeForReview(
  validation: ValidationResult,
  positioned: PositionedDiagram | null,
): WebFinding[] {
  const findings: WebFinding[] = [];
  for (const issue of [...validation.errors, ...validation.semanticErrors]) {
    findings.push({
      severity: 'error',
      category: 'other',
      message: issue.line != null
        ? `Line ${issue.line}, column ${issue.column ?? '?'}: ${issue.message}`
        : issue.message,
      source: 'geometry',
    });
  }
  for (const w of validation.warnings) {
    let category = 'other';
    if (/through/i.test(w.message)) category = 'edge_through_node';
    else if (/crossing/i.test(w.message)) category = 'edge_crossing';
    else if (/overlap/i.test(w.message)) category = 'label_overlap';
    else if (/orthogonal|via/i.test(w.message)) category = 'ambiguous_routing';
    else if (/clip/i.test(w.message)) category = 'label_clipping';
    findings.push({ severity: 'warning', category, message: w.message, source: 'geometry' });
  }
  if (positioned && findings.length === 0) {
    findings.push({ severity: 'note', category: 'ok', message: 'No visual issues detected', source: 'geometry' });
  }
  return findings;
}

// ── DOM ──

let panelEl: HTMLDivElement | null = null;
let settingsEl: HTMLDivElement | null = null;
let statusEl: HTMLDivElement | null = null;
let findingsContainer: HTMLDivElement | null = null;
let providerSelect: HTMLSelectElement | null = null;
let settingsLinkBtn: HTMLButtonElement | null = null;
let runBtn: HTMLButtonElement | null = null;

let currentSvg: string | null = null;
let currentSourceText: string | null = null;
let pendingPatches: Array<{ patch: TextPatch; itemEl: HTMLElement }> = [];
let reviewHeader: ReturnType<typeof createPanelHeader> | null = null;
let activeRequestController: AbortController | null = null;
let cancelBtn: HTMLButtonElement | null = null;

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'review-panel';
  panelEl.hidden = true;

  reviewHeader = createPanelHeader('Review', () => onClose?.());
  panelEl.appendChild(reviewHeader.el);

  settingsEl = document.createElement('div');
  settingsEl.className = 'review-settings';

  const provLabel = document.createElement('label');
  provLabel.textContent = 'Provider';
  providerSelect = document.createElement('select');
  providerSelect.innerHTML = `
    <option value="geometry">Geometry only</option>
    <option value="openai">OpenAI / compatible</option>
    <option value="ollama">Ollama (local)</option>
  `;
  providerSelect.value = localStorage.getItem(PROVIDER_STORAGE_KEY) ?? 'geometry';
  providerSelect.addEventListener('change', () => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, providerSelect!.value);
    updateSettingsVisibility();
  });

  settingsLinkBtn = document.createElement('button');
  settingsLinkBtn.className = 'review-action-btn';
  settingsLinkBtn.textContent = 'API key / model settings…';
  settingsLinkBtn.type = 'button';
  settingsLinkBtn.addEventListener('click', () => showSettingsPanel());

  runBtn = document.createElement('button');
  runBtn.className = 'review-run-btn';
  runBtn.textContent = 'Run AI Review';
  runBtn.addEventListener('click', () => void runAiReview());

  cancelBtn = document.createElement('button');
  cancelBtn.className = 'review-action-btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.hidden = true;
  cancelBtn.addEventListener('click', () => activeRequestController?.abort());

  settingsEl.append(provLabel, providerSelect, settingsLinkBtn, runBtn, cancelBtn);
  panelEl.appendChild(settingsEl);

  statusEl = document.createElement('div');
  statusEl.className = 'review-status';
  statusEl.hidden = true;
  panelEl.appendChild(statusEl);

  findingsContainer = document.createElement('div');
  panelEl.appendChild(findingsContainer);

  updateSettingsVisibility();
  return panelEl;
}

function updateSettingsVisibility(): void {
  const provider = providerSelect?.value ?? 'geometry';
  if (settingsLinkBtn) settingsLinkBtn.hidden = provider === 'geometry';
  if (runBtn) runBtn.hidden = provider === 'geometry';
}

function setStatus(msg: string | null): void {
  if (!statusEl) return;
  statusEl.textContent = msg ?? '';
  statusEl.hidden = !msg;
}

async function runAiReview(): Promise<void> {
  const sourceText = getSourceText?.() ?? currentSourceText;
  if (!sourceText) {
    setStatus('No diagram text — write some text first.');
    return;
  }
  currentSourceText = sourceText;

  const provider = providerSelect?.value ?? 'geometry';
  if (provider === 'geometry') return;

  const validation = await validate(sourceText);
  const blocking = [...validation.errors, ...validation.semanticErrors];
  const repairMode = !validation.valid && blocking.length > 0;

  if (!repairMode && !currentSvg) {
    setStatus('No diagram rendered — write some text first.');
    return;
  }

  if (runBtn) runBtn.disabled = true;
  activeRequestController?.abort();
  const controller = new AbortController();
  activeRequestController = controller;
  const request: ProviderRequestOptions = { signal: controller.signal };
  if (cancelBtn) cancelBtn.hidden = false;

  try {
    if (provider === 'openai' && !getApiKey()) {
      setStatus('Enter an API key in Settings to use OpenAI review.');
      showSettingsPanel();
      return;
    }

    const apiKey = getApiKey();
    const baseUrl = provider === 'openai' ? (getBaseUrl() || 'https://api.openai.com/v1') : (getBaseUrl() || 'http://localhost:11434');
    const model = provider === 'openai' ? (getModel() || 'gpt-4o') : (getModel() || 'llava');

    if (repairMode) {
      setStatus('File is invalid — running automatic repair…');
      const repairFn = provider === 'openai'
        ? (t: string, errs: Parameters<typeof callOpenAIRepair>[1]) => callOpenAIRepair(t, errs, apiKey, baseUrl, model, request)
        : (t: string, errs: Parameters<typeof callOllamaRepair>[1]) => callOllamaRepair(t, errs, baseUrl, model, request);
      const result = await repairLoop(sourceText, repairFn, REPAIR_ATTEMPTS, controller.signal);

      setStatus(null);
      if (result.text === sourceText) {
        appendFindings([{
          severity: 'error',
          category: 'other',
          message: 'Automatic repair made no changes — the model could not produce an applicable patch for this error.',
          source: 'model',
        }]);
        return;
      }
      appendFindings([{
        severity: result.valid ? 'note' : 'error',
        category: 'other',
        message: result.valid
          ? `Repaired automatically in ${result.attempts} attempt(s) — the file is now valid.`
          : `Ran ${result.attempts} automatic repair round(s); ${result.errors.length} issue(s) still remain: ${result.errors.slice(0, 3).map((e) => e.message).join('; ')}`,
        patch: { find: sourceText, replace: result.text },
        source: 'model',
      }]);
      return;
    }

    setStatus('Sending diagram to AI for review…');
    const modelFindings = provider === 'openai'
      ? await callOpenAICompatible(currentSvg!, sourceText, apiKey, baseUrl, model, 'bpmn', request)
      : await callOllama(currentSvg!, sourceText, baseUrl, model, 'bpmn', request);

    setStatus(null);
    appendFindings(modelFindings);
  } catch (err) {
    setStatus(err instanceof ProviderRequestError && err.code === 'cancelled'
      ? 'AI review cancelled.'
      : `AI review failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (runBtn) runBtn.disabled = false;
    if (cancelBtn) cancelBtn.hidden = true;
    if (activeRequestController === controller) activeRequestController = null;
  }
}

function createApplyBtn(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'review-action-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function markApplied(itemEl: HTMLElement): void {
  itemEl.classList.add('review-applied');
  const actions = itemEl.querySelector('.review-actions');
  if (actions) {
    actions.innerHTML = '';
    const tag = document.createElement('span');
    tag.className = 'review-applied-tag';
    tag.textContent = '✓ Applied';
    actions.appendChild(tag);
  }
}

function markSkipped(itemEl: HTMLElement): void {
  itemEl.classList.add('review-skipped');
  const actions = itemEl.querySelector('.review-actions');
  if (actions) {
    actions.innerHTML = '';
    const tag = document.createElement('span');
    tag.className = 'review-skipped-tag';
    tag.textContent = '— Skipped';
    actions.appendChild(tag);
  }
}

function appendFindings(findings: WebFinding[]): void {
  if (!findingsContainer) return;
  pendingPatches = [];

  const patchable = findings.filter((f) => f.patch);
  if (patchable.length > 0) {
    const bar = document.createElement('div');
    bar.className = 'review-bulk-actions';

    const applyAllBtn = createApplyBtn(`Apply All Fixes (${patchable.length})`, () => {
      for (const { patch, itemEl } of [...pendingPatches]) {
        if (onApplyPatch?.(patch)) {
          markApplied(itemEl);
        }
      }
      pendingPatches = [];
      applyAllBtn.disabled = true;
      skipAllBtn.disabled = true;
    });
    applyAllBtn.className = 'review-run-btn';

    const skipAllBtn = createApplyBtn('Skip All', () => {
      for (const { itemEl } of pendingPatches) markSkipped(itemEl);
      pendingPatches = [];
      applyAllBtn.disabled = true;
      skipAllBtn.disabled = true;
    });
    skipAllBtn.className = 'review-action-btn';

    bar.append(applyAllBtn, skipAllBtn);
    findingsContainer.appendChild(bar);
  }

  for (const f of findings) {
    const item = document.createElement('div');
    item.className = `review-item review-${f.source === 'model' ? 'model' : f.severity}`;

    const badge = document.createElement('span');
    badge.className = 'review-badge';
    badge.textContent = f.source === 'model' ? `AI: ${f.category.replace(/_/g, ' ')}` : f.category.replace(/_/g, ' ');

    const msg = document.createElement('span');
    msg.className = 'review-msg';
    msg.textContent = f.message;

    item.appendChild(badge);
    item.appendChild(msg);

    if (f.suggestedFix) {
      const fix = document.createElement('div');
      fix.className = 'review-suggestion';
      fix.textContent = `→ ${f.suggestedFix}`;
      item.appendChild(fix);
    }

    if (f.patch) {
      const preview = document.createElement('div');
      preview.className = 'review-patch-preview';

      const oldLine = document.createElement('div');
      oldLine.className = 'review-patch-old';
      oldLine.textContent = `− ${f.patch.find}`;

      const newLine = document.createElement('div');
      newLine.className = 'review-patch-new';
      newLine.textContent = `+ ${f.patch.replace}`;

      preview.append(oldLine, newLine);
      item.appendChild(preview);

      const actions = document.createElement('div');
      actions.className = 'review-actions';

      const thisPatch = f.patch;
      const applyBtn = createApplyBtn('Apply', () => {
        if (onApplyPatch?.(thisPatch)) {
          markApplied(item);
          pendingPatches = pendingPatches.filter((p) => p.itemEl !== item);
        }
      });
      applyBtn.className = 'review-run-btn';

      const skipBtn = createApplyBtn('Skip', () => {
        markSkipped(item);
        pendingPatches = pendingPatches.filter((p) => p.itemEl !== item);
      });

      actions.append(applyBtn, skipBtn);
      item.appendChild(actions);

      pendingPatches.push({ patch: thisPatch, itemEl: item });
    }

    findingsContainer.appendChild(item);
  }

  const total = findingsContainer.querySelectorAll('.review-item').length;
  reviewHeader?.setTitle(`Review (${total} finding${total !== 1 ? 's' : ''})`);
}

export function mountReviewPanel(container: HTMLElement): void {
  container.appendChild(ensurePanel());
}

export function updateReviewPanel(findings: WebFinding[], svg?: string | null, sourceText?: string | null): void {
  const panel = ensurePanel();
  panel.hidden = false;
  if (svg !== undefined) currentSvg = svg;
  if (sourceText !== undefined) currentSourceText = sourceText;
  pendingPatches = [];

  if (!findingsContainer) return;
  findingsContainer.innerHTML = '';
  reviewHeader?.setTitle(`Review (${findings.length} finding${findings.length !== 1 ? 's' : ''})`);

  for (const f of findings) {
    const item = document.createElement('div');
    item.className = `review-item review-${f.severity}`;

    const badge = document.createElement('span');
    badge.className = 'review-badge';
    badge.textContent = f.category.replace(/_/g, ' ');

    const msg = document.createElement('span');
    msg.textContent = f.message;

    item.appendChild(badge);
    item.appendChild(msg);
    findingsContainer.appendChild(item);
  }
}

export function hideReviewPanel(): void {
  if (panelEl) panelEl.hidden = true;
}
