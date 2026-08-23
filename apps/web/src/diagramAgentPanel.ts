import { createPanelHeader } from './panelHeader.js';
import { getApiKey, getBaseUrl, getModel } from './settingsPanel.js';
import { DiagramAgentSession } from './agent/diagramAgent.js';
import { actionDescription, type AgentPlan } from './agent/diagramActions.js';
import { manualDiagramAgentProvider, providerFromSettings } from './agent/provider.js';
import type { DiagramAgentAdapter } from './agent/diagramAgent.js';

type Mode = 'generate' | 'fix';
type AdapterGetter = () => DiagramAgentAdapter;

let panelEl: HTMLDivElement | null = null;
let modeSelect: HTMLSelectElement | null = null;
let providerSelect: HTMLSelectElement | null = null;
let instructionInput: HTMLTextAreaElement | null = null;
let planEl: HTMLDivElement | null = null;
let statusEl: HTMLDivElement | null = null;
let planButton: HTMLButtonElement | null = null;
let nextButton: HTMLButtonElement | null = null;
let allButton: HTMLButtonElement | null = null;
let undoButton: HTMLButtonElement | null = null;
let session: DiagramAgentSession | null = null;
let getAdapter: AdapterGetter | null = null;
let closeHandler: (() => void) | null = null;
let activeRequest: AbortController | null = null;

export function setAdapterGetter(getter: AdapterGetter): void {
  getAdapter = getter;
}

export function resetDiagramAgentSession(): void {
  session = null;
  renderPlan(null);
}

export function setCloseHandler(handler: () => void): void {
  closeHandler = handler;
}

function currentSession(): DiagramAgentSession {
  if (!getAdapter) throw new Error('Diagram agent is not connected to the editor');
  if (!session) session = new DiagramAgentSession(getAdapter());
  return session;
}

function setStatus(message: string, error = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = error ? 'error' : 'info';
}

function renderPlan(plan: AgentPlan | null): void {
  if (!planEl) return;
  planEl.replaceChildren();
  if (!plan) {
    planEl.hidden = true;
    return;
  }
  planEl.hidden = false;
  const title = document.createElement('div');
  title.className = 'agent-plan-title';
  title.textContent = plan.title;
  planEl.appendChild(title);
  const explanation = document.createElement('p');
  explanation.className = 'agent-plan-explanation';
  explanation.textContent = plan.explanation;
  planEl.appendChild(explanation);
  const list = document.createElement('ol');
  list.className = 'agent-plan-list';
  const cursor = session?.getCursor() ?? 0;
  plan.actions.forEach((action, index) => {
    const item = document.createElement('li');
    item.textContent = actionDescription(action);
    if (index < cursor) item.className = 'agent-plan-applied';
    if (index === cursor) item.className = 'agent-plan-current';
    list.appendChild(item);
  });
  planEl.appendChild(list);
  if (nextButton) nextButton.disabled = cursor >= plan.actions.length;
  if (allButton) allButton.disabled = cursor >= plan.actions.length;
  if (undoButton) undoButton.disabled = (session?.getApplied().length ?? 0) === 0;
}

function renderCurrentReport(): void {
  if (!session) return;
  const report = session.getReport();
  const issues = report.nodeOverlaps.length + report.edgeThroughNode.length + report.endpointErrors.length;
  setStatus(report.hardValid
    ? `Geometry gates clear. ${report.edgeCrossings.length} crossing(s), ${report.nonOrthogonalEdges.length} non-orthogonal edge(s).`
    : `Geometry blocked: ${issues} hard issue(s). The last action was rejected.`);
}

async function plan(): Promise<void> {
  const instruction = instructionInput?.value.trim() ?? '';
  if (!instruction) {
    setStatus('Describe the process or the surgical change first.', true);
    return;
  }
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  if (planButton) planButton.disabled = true;
  setStatus('Planning explicit manual editor actions…');
  try {
    const providerId = providerSelect?.value ?? 'manual';
    const provider = providerId === 'manual'
      ? manualDiagramAgentProvider
      : providerFromSettings(providerId, getApiKey(), getBaseUrl(), getModel());
    const mode = (modeSelect?.value ?? 'generate') as Mode;
    const nextSession = currentSession();
    const planResult = await provider.plan(mode, instruction, nextSession.getState(), { signal: controller.signal });
    nextSession.setPlan(planResult);
    renderPlan(planResult);
    setStatus(`${planResult.actions.length} explicit action(s) ready. Review them, then apply step-by-step or all at once.`);
  } catch (error) {
    if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    if (activeRequest === controller) activeRequest = null;
    if (planButton) planButton.disabled = false;
  }
}

function applyNext(): void {
  try {
    const active = currentSession().applyNext();
    if (!active) {
      setStatus('The plan is complete.');
      return;
    }
    renderPlan(currentSession().getPlan());
    renderCurrentReport();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    renderPlan(currentSession().getPlan());
  }
}

function applyAll(): void {
  try {
    const applied = currentSession().applyAll();
    renderPlan(currentSession().getPlan());
    renderCurrentReport();
    setStatus(`Applied ${applied.length} action(s). Review the rendered result before saving.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    renderPlan(currentSession().getPlan());
  }
}

function undoLast(): void {
  currentSession().undoLast();
  renderPlan(currentSession().getPlan());
  renderCurrentReport();
}

function ensurePanel(): HTMLDivElement {
  if (panelEl) return panelEl;
  panelEl = document.createElement('div');
  panelEl.id = 'diagram-agent-panel';
  panelEl.hidden = true;
  panelEl.className = 'diagram-agent-panel';
  panelEl.appendChild(createPanelHeader('Manual AI Agent', () => closeHandler?.()).el);

  const hint = document.createElement('div');
  hint.className = 'agent-hint';
  hint.textContent = 'AI proposes explicit BPMN.js editor actions. Nothing changes until you apply a reviewed step.';
  panelEl.appendChild(hint);

  const settings = document.createElement('div');
  settings.className = 'agent-settings';
  modeSelect = document.createElement('select');
  modeSelect.setAttribute('aria-label', 'Agent mode');
  modeSelect.innerHTML = '<option value="generate">Generate full diagram</option><option value="fix">Surgical fix</option>';
  providerSelect = document.createElement('select');
  providerSelect.setAttribute('aria-label', 'Agent provider');
  providerSelect.innerHTML = '<option value="manual">Offline deterministic agent</option><option value="ollama">Ollama / local</option><option value="openai">OpenAI-compatible BYOK</option>';
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'toolbar-btn';
  settingsButton.textContent = 'Provider settings (Text mode)…';
  settingsButton.title = 'Switch to Text mode and open Settings before using a remote provider.';
  settingsButton.addEventListener('click', () => setStatus('Configure API key, base URL, and model from Text mode → Settings, then return here.', true));
  settings.append(modeSelect, providerSelect, settingsButton);
  panelEl.appendChild(settings);

  instructionInput = document.createElement('textarea');
  instructionInput.rows = 3;
  instructionInput.placeholder = 'Generate: order approval with payment and shipping\nFix: route message-1 around the outside of Finance';
  instructionInput.setAttribute('aria-label', 'Diagram agent instruction');
  panelEl.appendChild(instructionInput);

  const actions = document.createElement('div');
  actions.className = 'agent-actions';
  planButton = document.createElement('button');
  planButton.type = 'button';
  planButton.className = 'review-run-btn';
  planButton.textContent = 'Plan actions';
  planButton.addEventListener('click', () => void plan());
  nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'toolbar-btn';
  nextButton.textContent = 'Apply next';
  nextButton.disabled = true;
  nextButton.addEventListener('click', applyNext);
  allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'toolbar-btn';
  allButton.textContent = 'Apply all';
  allButton.disabled = true;
  allButton.addEventListener('click', applyAll);
  undoButton = document.createElement('button');
  undoButton.type = 'button';
  undoButton.className = 'toolbar-btn';
  undoButton.textContent = 'Undo agent step';
  undoButton.disabled = true;
  undoButton.addEventListener('click', undoLast);
  actions.append(planButton, nextButton, allButton, undoButton);
  panelEl.appendChild(actions);

  statusEl = document.createElement('div');
  statusEl.className = 'agent-status';
  statusEl.setAttribute('role', 'status');
  statusEl.textContent = 'Ready. Start in New Diagram for a full generated draft.';
  panelEl.appendChild(statusEl);
  planEl = document.createElement('div');
  planEl.className = 'agent-plan';
  planEl.hidden = true;
  panelEl.appendChild(planEl);
  return panelEl;
}

export function mountDiagramAgentPanel(container: HTMLElement): void {
  container.appendChild(ensurePanel());
}

export function showDiagramAgentPanel(): void {
  ensurePanel().hidden = false;
}

export function hideDiagramAgentPanel(): void {
  if (panelEl) panelEl.hidden = true;
}
