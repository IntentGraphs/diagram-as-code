import { createPanelHeader } from './panelHeader.js';

// Shared AI provider settings (API key / base URL / model) used by Review, Generate, and the
// Diagram agent. Centralized here — one place to configure, instead of duplicating inputs in
// every panel that needs them.
const BASE_URL_STORAGE_KEY = 'bpm.review.baseUrl';
const MODEL_STORAGE_KEY = 'bpm.review.model';
const API_KEY_STORAGE_KEY = 'bpm.ai.apiKey';
const LEGACY_API_KEY_SESSION_KEY = 'bpm.review.apiKey';
const API_KEY_REMEMBER_KEY = 'bpm.ai.rememberApiKey';

let engineOverrideSelectEl: HTMLSelectElement | null = null;

let onClose: (() => void) | null = null;

export function setCloseHandler(fn: () => void): void {
  onClose = fn;
}

export function getEngineOverrideSelect(): HTMLSelectElement {
  return ensurePanel().querySelector<HTMLSelectElement>('#engine-override')!;
}

export function getApiKey(): string {
  const sessionKey = sessionStorage.getItem(LEGACY_API_KEY_SESSION_KEY);
  if (sessionKey !== null) return sessionKey;

  if (localStorage.getItem(API_KEY_REMEMBER_KEY) === 'true') {
    return localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
  }

  // Migrate keys written by the short-lived persistent-storage implementation into the
  // safer session-only default. Users can opt back into persistence with the checkbox below.
  const legacyPersistentKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (legacyPersistentKey) {
    sessionStorage.setItem(LEGACY_API_KEY_SESSION_KEY, legacyPersistentKey);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(API_KEY_REMEMBER_KEY);
    return legacyPersistentKey;
  }
  return '';
}

export function setApiKey(value: string, remember = false): void {
  const key = value.trim();
  if (key && remember) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    localStorage.setItem(API_KEY_REMEMBER_KEY, 'true');
    sessionStorage.removeItem(LEGACY_API_KEY_SESSION_KEY);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    localStorage.removeItem(API_KEY_REMEMBER_KEY);
    if (key) sessionStorage.setItem(LEGACY_API_KEY_SESSION_KEY, key);
    else sessionStorage.removeItem(LEGACY_API_KEY_SESSION_KEY);
  }
}

export function getBaseUrl(): string {
  return localStorage.getItem(BASE_URL_STORAGE_KEY) ?? '';
}

export function getModel(): string {
  return localStorage.getItem(MODEL_STORAGE_KEY) ?? '';
}

let panelEl: HTMLDivElement | null = null;

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'settings-panel';
  panelEl.hidden = true;

  const header = createPanelHeader('Settings', () => onClose?.());
  panelEl.appendChild(header.el);

  const hint = document.createElement('div');
  hint.className = 'settings-hint';
  hint.textContent = 'Shared by Review, Generate, and the Diagram agent. Remote providers receive the source text and visual review may send a rendered image. Requests time out after 30s and can be cancelled. API keys stay in this browser only and are session-only by default; opt into device persistence only on a private device.';
  panelEl.appendChild(hint);

  const aiSectionLabel = document.createElement('div');
  aiSectionLabel.className = 'settings-section-label';
  aiSectionLabel.textContent = 'AI Provider';
  panelEl.appendChild(aiSectionLabel);

  const settingsEl = document.createElement('div');
  settingsEl.className = 'review-settings';

  const apiKeyLabel = document.createElement('label');
  apiKeyLabel.textContent = 'API key';
  const apiKeyInput = document.createElement('input');
  apiKeyInput.id = 'settings-api-key';
  apiKeyInput.type = 'password';
  apiKeyInput.placeholder = 'API key (OpenAI / compatible)';
  apiKeyInput.value = getApiKey();
  apiKeyInput.autocomplete = 'off';
  const rememberLabel = document.createElement('label');
  rememberLabel.className = 'settings-checkbox';
  const rememberInput = document.createElement('input');
  rememberInput.id = 'settings-remember-api-key';
  rememberInput.type = 'checkbox';
  rememberInput.checked = localStorage.getItem(API_KEY_REMEMBER_KEY) === 'true';
  const rememberText = document.createElement('span');
  rememberText.textContent = 'Remember API key on this device';
  rememberLabel.append(rememberInput, rememberText);
  apiKeyInput.addEventListener('change', () => setApiKey(apiKeyInput.value, rememberInput.checked));
  rememberInput.addEventListener('change', () => setApiKey(apiKeyInput.value, rememberInput.checked));

  const baseUrlLabel = document.createElement('label');
  baseUrlLabel.textContent = 'Base URL';
  const baseUrlInput = document.createElement('input');
  baseUrlInput.type = 'text';
  baseUrlInput.placeholder = 'Base URL (default: api.openai.com/v1, or http://localhost:11434 for Ollama)';
  baseUrlInput.style.minWidth = '320px';
  baseUrlInput.value = getBaseUrl();
  baseUrlInput.addEventListener('change', () => {
    localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrlInput.value);
  });

  const modelLabel = document.createElement('label');
  modelLabel.textContent = 'Model';
  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.placeholder = 'Model (default: gpt-4o, or llava for Ollama)';
  modelInput.value = getModel();
  modelInput.addEventListener('change', () => {
    localStorage.setItem(MODEL_STORAGE_KEY, modelInput.value);
  });

  settingsEl.append(apiKeyLabel, apiKeyInput, rememberLabel, baseUrlLabel, baseUrlInput, modelLabel, modelInput);
  panelEl.appendChild(settingsEl);

  const layoutSectionLabel = document.createElement('div');
  layoutSectionLabel.className = 'settings-section-label';
  layoutSectionLabel.textContent = 'Layout';
  panelEl.appendChild(layoutSectionLabel);

  const layoutEl = document.createElement('div');
  layoutEl.className = 'review-settings';

  const engineLabel = document.createElement('label');
  engineLabel.textContent = 'Layout engine';
  engineOverrideSelectEl = document.createElement('select');
  engineOverrideSelectEl.id = 'engine-override';
  engineOverrideSelectEl.className = 'toolbar-btn';
  engineOverrideSelectEl.setAttribute('aria-label', 'Layout engine override');
  engineOverrideSelectEl.innerHTML = `
    <option value="">Auto</option>
    <option value="flat">Flat</option>
    <option value="swimlane">Swimlane</option>
  `;

  layoutEl.append(engineLabel, engineOverrideSelectEl);
  panelEl.appendChild(layoutEl);

  const layoutHint = document.createElement('div');
  layoutHint.className = 'settings-hint';
  layoutHint.textContent = 'Chooses which BPMN layout engine renders the diagram. Only applies to families that support an override — the hint on the field itself explains when it doesn\'t.';
  panelEl.appendChild(layoutHint);

  return panelEl;
}

export function mountSettingsPanel(container: HTMLElement): void {
  container.appendChild(ensurePanel());
}

export function showSettingsPanel(): void {
  ensurePanel().hidden = false;
}

export function hideSettingsPanel(): void {
  if (panelEl) panelEl.hidden = true;
}
