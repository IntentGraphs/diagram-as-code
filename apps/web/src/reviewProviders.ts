import { validate, type ValidationIssue } from '@bpm/validate';
import type { DiagramFamilyId } from '@bpm/diagram-runtime';

export interface ProviderRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export async function readJsonWithLimit(response: Response, maxBytes = 1_000_000): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`AI provider response exceeds the ${maxBytes}-byte limit`);
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(`AI provider response exceeds the ${maxBytes}-byte limit`);
  }
  return JSON.parse(text);
}

export class ProviderRequestError extends Error {
  readonly code: 'timeout' | 'cancelled';

  constructor(code: 'timeout' | 'cancelled', message: string) {
    super(message);
    this.name = 'ProviderRequestError';
    this.code = code;
  }
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

export async function fetchWithProviderPolicy(
  input: RequestInfo | URL,
  init: RequestInit,
  options?: ProviderRequestOptions,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = () => controller.abort();
  if (options?.signal?.aborted) throw new ProviderRequestError('cancelled', 'AI provider request cancelled');
  options?.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ProviderRequestError('timeout', `AI provider request timed out after ${timeoutMs} ms`);
    if (options?.signal?.aborted || controller.signal.aborted) {
      throw new ProviderRequestError('cancelled', 'AI provider request cancelled');
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    options?.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export interface TextPatch {
  find: string;
  replace: string;
}

export interface WebFinding {
  severity: 'warning' | 'note' | 'error';
  category: string;
  message: string;
  suggestedFix?: string;
  patch?: TextPatch;
  source: 'geometry' | 'model';
}

export const VISUAL_SYSTEM_PROMPT = `You are a BPMN diagram reviewer. You receive a rendered BPMN diagram image and the source text that produced it.

Analyze it for visual quality issues: label clipping, overlapping elements, crowded areas, ambiguous routing, unreadable text, edge crossings.

Respond with a JSON object:
{"findings":[{
  "severity": "warning" | "error" | "note",
  "category": "<one of: label_clipping, label_overlap, edge_through_node, edge_crossing, crowding, unbalanced_layout, ambiguous_routing, text_unreadable, other>",
  "message": "<human-readable description>",
  "suggestedFix": "<short explanation of what to change>",
  "patch": { "find": "<exact substring from the source text to replace>", "replace": "<replacement text>" }
}]}

IMPORTANT for the "patch" field:
- "find" must be an EXACT substring from the source text provided (case-sensitive, whitespace-sensitive).
- "replace" is the corrected version that fixes the issue.
- Only include "patch" when you can provide an exact, safe text replacement. Omit it for issues that need human judgment.
- Examples of patchable fixes: adding "size (200, 80)" to a node, shortening a label, adding "layoutSpacing: relaxed", changing "wrap: 2" to "wrap: 4".
- Do NOT patch structural changes like adding/removing nodes or reordering edges.

Return ONLY that JSON object, no markdown fences.`;

export interface FamilyPrompts {
  visualReviewSystemPrompt?: string;
  generationSystemPrompt?: string;
}
export const FAMILY_PROMPTS: Partial<Record<DiagramFamilyId, FamilyPrompts>> = {
  bpmn: { visualReviewSystemPrompt: VISUAL_SYSTEM_PROMPT },
};
function visualPrompt(family: DiagramFamilyId): string | undefined { return FAMILY_PROMPTS[family]?.visualReviewSystemPrompt; }
function requireVisualPrompt(family: DiagramFamilyId): string {
  const prompt = visualPrompt(family);
  if (!prompt) throw new Error(`No visual-review prompt registered for family "${family}" — the capability check upstream should have prevented this call.`);
  return prompt;
}

// Condensed from docs/LANGUAGE.md §1-5 — mirrors packages/review/src/generatePrompt.ts's
// BPM_GRAMMAR (kept separate because the browser calls providers directly and does not depend
// on @bpm/review). Shared by both the generate and repair prompts below, so a repair suggestion
// is grounded in the same grammar a fresh draft would be — without it, a model asked to "fix" a
// line using a keyword outside the grammar tends to make a shallow edit (e.g. quoting a string)
// instead of recognizing the whole line is illegal and must be replaced or removed.
export const BPM_GRAMMAR = `GRAMMAR (this is the supported BPMN generation/repair subset — do not invent keywords outside it; the complete language reference is docs/LANGUAGE.md):

Node declarations, one per line:
  event <category> <trigger> "<label>" as <id>
    category: start | intermediate | end
    trigger: none | message | timer | error | escalation | cancel | compensation | conditional | link | signal | multiple | parallelMultiple | terminate
    (start cannot use error/escalation/cancel/compensation/terminate; end cannot use timer/conditional/link)
    optional event payload attributes: timerDate, timerDuration, timerCycle, messageRef, errorRef, escalationRef, signalRef, condition
  gateway <type> "<label>" as <id>
    type: exclusive | parallel | inclusive | complex | eventBased
  task | userTask | serviceTask | sendTask | receiveTask | manualTask | businessRuleTask | scriptTask "<label>" as <id>
  subprocess "<label>" as <id>          (opens a nested block; indent children by exactly 2 spaces)
    <nested node/edge declarations>
  boundary <trigger> (interrupting|nonInterrupting) "<label>" as <id> on <hostId>

Edge declarations, one per line:
  <sourceId> -> <targetId>[: "<label>"]        (sequence flow)
  <sourceId> => <targetId>: "<label>"          (conditional branch out of a gateway)
  <sourceId> ->> <targetId>: "<label>"         (default/else branch out of a gateway)
  <sourceId> ~> <targetId>                     (message flow — ONLY between nodes in two different pools; see RULES)

There is no top-level "process" or diagram-title statement — a file starts directly with either a
node/edge declaration or a "pool" block. "process <name>" does not exist in this grammar and will
fail to parse; if you see a line like that, the whole line must be removed, not just edited.

Pools & lanes (only when the description names distinct participants/roles/departments):
  pool "<name>"
    lane "<name>"
      <node declarations for that role, indented one level deeper than "lane">
    lane "<name>"
      <node declarations for that role>

Identifiers (the "as <id>" part) must match [A-Za-z_][A-Za-z0-9_.-]*, no spaces or quotes.
Nesting indentation (pool/lane, subprocess bodies) must be exactly 2 spaces per level, spaces only, never tabs.`;

const GENERATE_SYSTEM_PROMPT = `You are a BPMN 2.0 text-DSL author. You receive a plain-language description of a business process (prose, a bullet list of steps, or a rough draft) and write a complete, valid ".bpm" source file for it.

${BPM_GRAMMAR}

RULES:
- Every diagram needs at least one "event start ... as ..." and one "event end ... as ...".
- Every node must be reachable: connect it with at least one edge.
- Do not add "layout:" or "positioning: manual" directives — leave layout automatic (pool/lane alone already auto-selects swimlane layout).
- Use gateway exclusive for yes/no decision points; label branches with "=>" (and "->>":  for the default branch).
- Prefer plain "task" unless the description clearly implies a subtype.
- If the description names two or more distinct roles/departments/participants (e.g. "customer", "sales", "warehouse"), use one "pool" with one "lane" per role and place each step in the lane of the role that performs it. If it describes a single actor or system with no distinct roles, do not use pool/lane at all.
- This means almost every diagram you write has at most ONE pool. Never use "~>" in a single-pool diagram, even for a step that feels asynchronous or "happening at the same time" (e.g. one lane triggering another lane's work) — that is a normal cross-lane sequence flow ("->"), not a message flow. Only reach for "~>" when the description genuinely describes two separate organizations/systems, each getting its own "pool" block, communicating with each other.
- Keep labels short, derived from the description.
- Before answering, mentally check every line against the GRAMMAR above. If a line does not match any declaration form listed there, it is invalid — do not emit it, even if it seems like a reasonable extension of the language.

OUTPUT: respond with ONLY the raw .bpm source text — no markdown code fences, no explanation, no JSON wrapper.`;

const FAMILY_PROMPTS_WITH_GENERATION: Partial<Record<DiagramFamilyId, FamilyPrompts>> = {
  bpmn: { visualReviewSystemPrompt: VISUAL_SYSTEM_PROMPT, generationSystemPrompt: GENERATE_SYSTEM_PROMPT },
};
function generationPrompt(family: DiagramFamilyId): string | undefined {
  return FAMILY_PROMPTS_WITH_GENERATION[family]?.generationSystemPrompt;
}
function requireGenerationPrompt(family: DiagramFamilyId): string {
  const prompt = generationPrompt(family);
  if (!prompt) throw new Error(`No generation prompt registered for family "${family}" — the capability check upstream should have prevented this call.`);
  return prompt;
}

const REPAIR_SYSTEM_PROMPT = `You are a BPMN text-DSL repair assistant. You receive invalid .bpm source text and a list of structured errors with line, column, and message. There is no rendered diagram — fix the source text itself.

${BPM_GRAMMAR}

Respond with a JSON object:
{"findings":[{
  "severity": "error",
  "category": "other",
  "message": "<what is wrong>",
  "suggestedFix": "<short explanation>",
  "patch": { "find": "<exact substring from the source to replace>", "replace": "<replacement that fixes the error>" }
}]}

IMPORTANT:
- "find" must be an EXACT substring of the source (case-sensitive, whitespace-sensitive).
- Fix the root cause against the GRAMMAR above, not just the symptom named in the error message. If an entire line uses a construct that isn't in the grammar (e.g. a keyword that doesn't exist), "find"/"replace" must cover the WHOLE line (or remove it, with "replace":""), not just the token the error happened to point at.
- Every patch you return, applied together with the others, must be sufficient to make the file pass validation — do not stop at a partial fix.
- Prefer minimal patches when a minimal patch is actually sufficient, but never favor minimalism over completeness.
- Return ONLY that JSON object, no markdown fences.`;

function asFindingArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { findings?: unknown };
    if (Array.isArray(obj.findings)) return obj.findings;
    if (obj.findings && typeof obj.findings === 'object') return [obj.findings];
    if ('message' in obj || 'patch' in obj || 'severity' in obj) return [obj];
  }
  return [];
}

export function parseModelFindings(raw: string): WebFinding[] {
  try {
    const parsed = JSON.parse(raw);
    return asFindingArray(parsed).map((item) => {
      const f = item as { severity?: string; category?: string; message?: string; suggestedFix?: string; patch?: { find?: string; replace?: string } };
      return {
        severity: (f.severity as WebFinding['severity']) ?? 'note',
        category: f.category ?? 'other',
        message: f.message ?? 'Unknown issue',
        suggestedFix: f.suggestedFix,
        patch: f.patch?.find != null && f.patch.replace != null ? { find: f.patch.find, replace: f.patch.replace } : undefined,
        source: 'model' as const,
      };
    });
  } catch {
    return [{ severity: 'note', category: 'other', message: `Could not parse model response: ${raw.slice(0, 200)}`, source: 'model' }];
  }
}

async function svgToPngBase64(svgString: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 800;
      canvas.height = img.naturalHeight || 600;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to rasterize SVG')); };
    img.src = url;
  });
}

function formatBlockingErrors(errors: Array<{ line?: number; column?: number; message: string }>): string {
  return errors.map((e) => `Line ${e.line ?? '?'}, column ${e.column ?? '?'}: ${e.message}`).join('\n');
}

export async function callOpenAICompatible(
  svgString: string,
  sourceText: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  family: DiagramFamilyId = 'bpmn',
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  const b64 = await svgToPngBase64(svgString);
  return openaiChat(apiKey, baseUrl, model, requireVisualPrompt(family), [
    { type: 'text', text: `Here is the .bpm source text:\n\`\`\`\n${sourceText}\n\`\`\`\n\nReview the rendered diagram for visual issues.` },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
  ], options);
}

export async function callOpenAIRepair(
  sourceText: string,
  errors: Array<{ line?: number; column?: number; message: string }>,
  apiKey: string,
  baseUrl: string,
  model: string,
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  const user = `Here is the invalid .bpm source:\n\`\`\`\n${sourceText}\n\`\`\`\n\nStructured errors:\n${formatBlockingErrors(errors)}\n\nReturn find/replace patches that make this file valid.`;
  return openaiChat(apiKey, baseUrl, model, REPAIR_SYSTEM_PROMPT, [{ type: 'text', text: user }], options);
}

async function openaiChat(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  userContent: unknown,
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  };

  const res = await fetchWithProviderPolicy(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }, options);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API request failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }

  const data = await readJsonWithLimit(res, options?.maxResponseBytes) as { choices?: Array<{ message?: { content?: string } }> };
  return parseModelFindings(data.choices?.[0]?.message?.content ?? '[]');
}

export async function callOllama(
  svgString: string,
  sourceText: string,
  baseUrl: string,
  model: string,
  family: DiagramFamilyId = 'bpmn',
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  const b64 = await svgToPngBase64(svgString);
  return ollamaChat(baseUrl, model, requireVisualPrompt(family), {
    content: `Here is the .bpm source text:\n\`\`\`\n${sourceText}\n\`\`\`\n\nReview the rendered diagram for visual issues.`,
    images: [b64],
  }, options);
}

export async function callOllamaRepair(
  sourceText: string,
  errors: Array<{ line?: number; column?: number; message: string }>,
  baseUrl: string,
  model: string,
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  return ollamaChat(baseUrl, model, REPAIR_SYSTEM_PROMPT, {
    content: `Here is the invalid .bpm source:\n\`\`\`\n${sourceText}\n\`\`\`\n\nStructured errors:\n${formatBlockingErrors(errors)}\n\nReturn find/replace patches that make this file valid.`,
  }, options);
}

async function ollamaChat(
  baseUrl: string,
  model: string,
  system: string,
  user: { content: string; images?: string[] },
  options?: ProviderRequestOptions,
): Promise<WebFinding[]> {
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', ...user },
    ],
    stream: false,
    format: 'json',
  };

  const res = await fetchWithProviderPolicy(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, options);

  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);

  const data = await readJsonWithLimit(res, options?.maxResponseBytes) as { message?: { content?: string } };
  return parseModelFindings(data.message?.content ?? '[]');
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

export async function callOpenAIGenerate(
  description: string,
  apiKey: string,
  baseUrl: string,
  model: string,
  family: DiagramFamilyId = 'bpmn',
  options?: ProviderRequestOptions,
): Promise<string> {
  const res = await fetchWithProviderPolicy(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: requireGenerationPrompt(family) },
        { role: 'user', content: description },
      ],
    }),
  }, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API request failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  const data = await readJsonWithLimit(res, options?.maxResponseBytes) as { choices?: Array<{ message?: { content?: string } }> };
  return stripFences(data.choices?.[0]?.message?.content ?? '');
}

export async function callOllamaGenerate(
  description: string,
  baseUrl: string,
  model: string,
  family: DiagramFamilyId = 'bpmn',
  options?: ProviderRequestOptions,
): Promise<string> {
  const res = await fetchWithProviderPolicy(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: requireGenerationPrompt(family) },
        { role: 'user', content: description },
      ],
      stream: false,
    }),
  }, options);
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
  const data = await readJsonWithLimit(res, options?.maxResponseBytes) as { message?: { content?: string } };
  return stripFences(data.message?.content ?? '');
}

/** Applies every patch that still finds an exact match in `text`, in order. */
export function applyPatches(text: string, patches: TextPatch[]): { text: string; applied: number } {
  let next = text;
  let applied = 0;
  for (const patch of patches) {
    const idx = next.indexOf(patch.find);
    if (idx === -1) continue;
    next = next.slice(0, idx) + patch.replace + next.slice(idx + patch.find.length);
    applied += 1;
  }
  return { text: next, applied };
}

export interface RepairLoopResult {
  text: string;
  valid: boolean;
  errors: ValidationIssue[];
  attempts: number;
  findings: WebFinding[];
}

/**
 * Repeatedly calls `repairFn` and re-validates until the text is valid, no more progress can be
 * made, or `maxAttempts` is reached — a single repair pass from the model is rarely enough to
 * reach a valid file (e.g. a patch that fixes one error can reveal or leave another), so a caller
 * that stops after one round routinely ships a still-broken diagram.
 */
export async function repairLoop(
  text: string,
  repairFn: (text: string, errors: ValidationIssue[]) => Promise<WebFinding[]>,
  maxAttempts = 3,
  signal?: AbortSignal,
): Promise<RepairLoopResult> {
  let current = text;
  let validation = await validate(current);
  let attempts = 0;
  let findings: WebFinding[] = [];

  while (!validation.valid && attempts < maxAttempts) {
    if (signal?.aborted) throw new ProviderRequestError('cancelled', 'AI provider request cancelled');
    attempts += 1;
    const blocking = [...validation.errors, ...validation.semanticErrors];
    findings = await repairFn(current, blocking);
    const patches = findings.filter((f): f is WebFinding & { patch: TextPatch } => f.patch != null).map((f) => f.patch);
    const { text: next, applied } = applyPatches(current, patches);
    if (applied === 0) break;
    current = next;
    validation = await validate(current);
  }

  return {
    text: current,
    valid: validation.valid,
    errors: [...validation.errors, ...validation.semanticErrors],
    attempts,
    findings,
  };
}

/** No-network fallback: same deterministic skeleton as @bpm/review's manual provider. */
export function generateOfflineSkeleton(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 6).join(' ') || 'Step';
  const label = (words.length > 60 ? `${words.slice(0, 57)}...` : words).replace(/"/g, "'");
  return [
    'event start none "Start" as e0',
    `task "${label}" as t1`,
    'event end none "End" as e1',
    '',
    'e0 -> t1',
    't1 -> e1',
  ].join('\n');
}
