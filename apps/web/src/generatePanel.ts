import { validate } from '@bpm/validate';
import {
  callOllamaGenerate,
  callOllamaRepair,
  callOpenAIGenerate,
  callOpenAIRepair,
  generateOfflineSkeleton,
  repairLoop,
  ProviderRequestError,
  type ProviderRequestOptions,
  type RepairLoopResult,
} from './reviewProviders.js';
import { getApiKey, getBaseUrl, getModel, showSettingsPanel } from './settingsPanel.js';
import { createPanelHeader } from './panelHeader.js';

const PROVIDER_STORAGE_KEY = 'bpm.generate.provider';
const REPAIR_ATTEMPTS = 3;

type InsertTextFn = (text: string) => void;
let onInsertText: InsertTextFn | null = null;

export function setInsertTextHandler(fn: InsertTextFn): void {
  onInsertText = fn;
}

let onClose: (() => void) | null = null;

export function setCloseHandler(fn: () => void): void {
  onClose = fn;
}

let panelEl: HTMLDivElement | null = null;
let descriptionInput: HTMLTextAreaElement | null = null;
let providerSelect: HTMLSelectElement | null = null;
let settingsLinkBtn: HTMLButtonElement | null = null;
let generateBtn: HTMLButtonElement | null = null;
let statusEl: HTMLDivElement | null = null;
let resultEl: HTMLDivElement | null = null;
let generationDisabledReason: string | null = null;
let activeRequestController: AbortController | null = null;
let cancelBtn: HTMLButtonElement | null = null;

export function setGenerationDisabled(reason: string | null): void {
  generationDisabledReason = reason;
  if (generateBtn) {
    generateBtn.disabled = reason !== null;
    generateBtn.title = reason ?? '';
    generateBtn.setAttribute('aria-disabled', String(reason !== null));
  }
}

function updateSettingsVisibility(): void {
  const provider = providerSelect?.value ?? 'offline';
  if (settingsLinkBtn) settingsLinkBtn.hidden = provider === 'offline';
}

function setStatus(msg: string | null): void {
  if (!statusEl) return;
  statusEl.textContent = msg ?? '';
  statusEl.hidden = !msg;
}

function renderResult(text: string, valid: boolean, note?: string): void {
  if (!resultEl) return;
  resultEl.innerHTML = '';
  resultEl.hidden = false;

  const badge = document.createElement('div');
  badge.className = `generate-result-badge ${valid ? 'generate-valid' : 'generate-invalid'}`;
  badge.textContent = valid ? 'Ready to insert — renders without errors' : `Does not render${note ? ` — ${note}` : ''}`;
  resultEl.appendChild(badge);

  const pre = document.createElement('pre');
  pre.className = 'generate-result-text';
  pre.textContent = text;
  resultEl.appendChild(pre);

  const insertBtn = document.createElement('button');
  // Deliberately not styled/labeled the same as a normal success action — inserting a diagram
  // that doesn't render is a fallback the user has to consciously choose, never the default path.
  insertBtn.className = valid ? 'review-run-btn' : 'generate-insert-anyway-btn';
  insertBtn.textContent = valid ? 'Insert into editor' : 'Insert anyway (will still show errors)';
  insertBtn.addEventListener('click', () => onInsertText?.(text));
  resultEl.appendChild(insertBtn);
}

async function runGenerate(): Promise<void> {
  const description = descriptionInput?.value.trim() ?? '';
  if (!description) {
    setStatus('Describe the process first.');
    return;
  }

  const provider = providerSelect?.value ?? 'offline';
  activeRequestController?.abort();
  const controller = new AbortController();
  activeRequestController = controller;
  const request: ProviderRequestOptions = { signal: controller.signal };
  if (generateBtn) generateBtn.disabled = true;
  if (cancelBtn) cancelBtn.hidden = provider === 'offline';
  if (resultEl) resultEl.hidden = true;
  setStatus('Drafting diagram…');

  try {
    let draft: string;
    if (provider === 'offline') {
      draft = generateOfflineSkeleton(description);
    } else if (provider === 'openai') {
      const apiKey = getApiKey();
      if (!apiKey) {
        setStatus('Enter an API key in Settings to use OpenAI generation.');
        showSettingsPanel();
        return;
      }
      const baseUrl = getBaseUrl() || 'https://api.openai.com/v1';
      const model = getModel() || 'gpt-4o';
      draft = await callOpenAIGenerate(description, apiKey, baseUrl, model, 'bpmn', request);
    } else {
      const baseUrl = getBaseUrl() || 'http://localhost:11434';
      const model = getModel() || 'llava';
      draft = await callOllamaGenerate(description, baseUrl, model, 'bpmn', request);
    }

    const validation = await validate(draft);
    if (validation.valid) {
      setStatus(null);
      renderResult(draft, true);
      return;
    }

    if (provider === 'offline') {
      setStatus(null);
      renderResult(draft, false, 'the offline skeleton should always be valid — please report this');
      return;
    }

    setStatus('Draft had issues — running automatic repair…');
    const apiKey = getApiKey();
    const baseUrl = provider === 'openai' ? (getBaseUrl() || 'https://api.openai.com/v1') : (getBaseUrl() || 'http://localhost:11434');
    const model = provider === 'openai' ? (getModel() || 'gpt-4o') : (getModel() || 'llava');
    const repairFn = provider === 'openai'
      ? (t: string, errs: Parameters<typeof callOpenAIRepair>[1]) => callOpenAIRepair(t, errs, apiKey, baseUrl, model, request)
      : (t: string, errs: Parameters<typeof callOllamaRepair>[1]) => callOllamaRepair(t, errs, baseUrl, model, request);

    let result: RepairLoopResult = await repairLoop(draft, repairFn, REPAIR_ATTEMPTS, controller.signal);

    if (!result.valid) {
      setStatus('Repair did not converge — asking the model to rewrite the whole diagram…');
      const errorSummary = result.errors.map((e) => `Line ${e.line ?? '?'}: ${e.message}`).join('\n');
      const rewritePrompt = `${description}\n\n(A previous attempt produced an invalid .bpm file with these errors:\n${errorSummary}\nWrite a complete, corrected .bpm file from scratch that avoids all of them.)`;
      const rewritten = provider === 'openai'
        ? await callOpenAIGenerate(rewritePrompt, apiKey, baseUrl, model, 'bpmn', request)
        : await callOllamaGenerate(rewritePrompt, baseUrl, model, 'bpmn', request);
      const rewriteValidation = await validate(rewritten);
      if (rewriteValidation.valid) {
        result = { text: rewritten, valid: true, errors: [], attempts: result.attempts + 1, findings: [] };
      } else {
        result = await repairLoop(rewritten, repairFn, REPAIR_ATTEMPTS, controller.signal);
      }
    }

    setStatus(null);
    renderResult(
      result.text,
      result.valid,
      result.valid ? undefined : `${result.errors.length} issue(s) remain after ${result.attempts} automatic repair attempt(s) — edit manually or re-run Generate`,
    );
  } catch (err) {
    setStatus(err instanceof ProviderRequestError && err.code === 'cancelled'
      ? 'Generation cancelled.'
      : `Generation failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (generateBtn) generateBtn.disabled = false;
    if (cancelBtn) cancelBtn.hidden = true;
    if (activeRequestController === controller) activeRequestController = null;
  }
}

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'generate-panel';
  panelEl.hidden = true;

  const header = createPanelHeader('Generate from description', () => onClose?.());
  panelEl.appendChild(header.el);

  descriptionInput = document.createElement('textarea');
  descriptionInput.id = 'generate-description';
  descriptionInput.placeholder = 'Describe the process in plain language, e.g. "Customer submits an order, we check stock, if available we ship it, otherwise we notify the customer."';
  descriptionInput.rows = 4;
  panelEl.appendChild(descriptionInput);

  const settingsEl = document.createElement('div');
  settingsEl.className = 'review-settings';

  const provLabel = document.createElement('label');
  provLabel.textContent = 'Provider';
  providerSelect = document.createElement('select');
  providerSelect.innerHTML = `
    <option value="offline">Offline skeleton (no AI, no key needed)</option>
    <option value="openai">OpenAI / compatible</option>
    <option value="ollama">Ollama (local)</option>
  `;
  providerSelect.value = localStorage.getItem(PROVIDER_STORAGE_KEY) ?? 'offline';
  providerSelect.addEventListener('change', () => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, providerSelect!.value);
    updateSettingsVisibility();
  });

  settingsLinkBtn = document.createElement('button');
  settingsLinkBtn.className = 'review-action-btn';
  settingsLinkBtn.textContent = 'API key / model settings…';
  settingsLinkBtn.type = 'button';
  settingsLinkBtn.addEventListener('click', () => showSettingsPanel());

  generateBtn = document.createElement('button');
  generateBtn.className = 'review-run-btn';
  generateBtn.textContent = 'Generate';
  generateBtn.addEventListener('click', () => void runGenerate());
  setGenerationDisabled(generationDisabledReason);

  cancelBtn = document.createElement('button');
  cancelBtn.className = 'review-action-btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.hidden = true;
  cancelBtn.addEventListener('click', () => activeRequestController?.abort());

  settingsEl.append(provLabel, providerSelect, settingsLinkBtn, generateBtn, cancelBtn);
  panelEl.appendChild(settingsEl);

  statusEl = document.createElement('div');
  statusEl.className = 'review-status';
  statusEl.hidden = true;
  panelEl.appendChild(statusEl);

  resultEl = document.createElement('div');
  resultEl.hidden = true;
  panelEl.appendChild(resultEl);

  updateSettingsVisibility();
  return panelEl;
}

export function mountGeneratePanel(container: HTMLElement): void {
  container.appendChild(ensurePanel());
}

export function showGeneratePanel(): void {
  ensurePanel().hidden = false;
}

export function hideGeneratePanel(): void {
  if (panelEl) panelEl.hidden = true;
}
