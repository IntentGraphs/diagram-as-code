import type { ReviewBundle, ReviewProvider, VisualFinding } from '../types.js';
import { parseFindings } from '../parseFindings.js';
import { BPM_GRAMMAR, getGenerationSystemPrompt } from '../generatePrompt.js';
import { fetchWithProviderPolicy, readJsonWithLimit, type ProviderRequestOptions } from '../request.js';

const DEFAULT_MODEL = 'llava';
const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are a BPMN diagram reviewer. You receive a rendered BPMN diagram image.
Analyze it for visual quality issues: label clipping, overlapping elements, crowded areas,
ambiguous routing, unreadable text, edge crossings. Respond with a JSON object:
{"findings":[{"severity":"warning"|"error"|"note","category":"<one of: label_clipping, label_overlap, edge_through_node, edge_crossing, crowding, unbalanced_layout, ambiguous_routing, text_unreadable, other>","message":"<description>","suggestedFix":"<optional fix>","confidence":<0-1>,"patch":{"find":"<exact source substring>","replace":"<replacement>"}}]}
Return ONLY that JSON object, no markdown fences. Only include patch when find is an exact substring of the source.`;

const REPAIR_SYSTEM_PROMPT = `You are a BPMN text-DSL repair assistant. You receive invalid .bpm source text and structured errors (line, column, message). There is no rendered diagram — fix the source text itself.

${BPM_GRAMMAR}

Respond with a JSON object: {"findings":[{"severity":"error","category":"other","message":"<what is wrong>","suggestedFix":"<short explanation>","patch":{"find":"<exact source substring>","replace":"<replacement that fixes the error>"}}]}
find must be an exact substring of the source. Fix the root cause against the grammar above, not just the symptom — if a whole line uses a construct that isn't in the grammar, the patch must replace (or remove) the whole line, not just part of it. Every patch you return, applied together, must be sufficient to make the file valid. Return ONLY that JSON object, no markdown fences.`;

function formatBlocking(bundle: ReviewBundle): string {
  const issues = [...bundle.validation.errors, ...bundle.validation.semanticErrors];
  return issues.map((e) => `Line ${e.line ?? '?'}, column ${e.column ?? '?'}: ${e.message}`).join('\n');
}

export function createOllamaProvider(options?: { model?: string; baseUrl?: string; timeoutMs?: number }): ReviewProvider {
  const model = options?.model ?? process.env.BPM_OLLAMA_MODEL ?? DEFAULT_MODEL;
  const baseUrl = options?.baseUrl ?? process.env.BPM_OLLAMA_URL ?? DEFAULT_URL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function chat(system: string, user: { content: string; images?: string[] }, requestOptions?: ProviderRequestOptions): Promise<VisualFinding[]> {
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
    }, requestOptions, timeoutMs);
    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
    }
    const data = await readJsonWithLimit(res, requestOptions?.maxResponseBytes) as { message?: { content?: string } };
    return parseFindings(data.message?.content ?? '[]');
  }

  return {
    id: 'ollama',
    async review(bundle: ReviewBundle, requestOptions?: ProviderRequestOptions): Promise<VisualFinding[]> {
      if (!bundle.png) return [];
      return chat(SYSTEM_PROMPT, {
        content: `Here is the .bpm source text:\n\`\`\`\n${bundle.text}\n\`\`\`\n\nReview this BPMN diagram for visual issues.`,
        images: [Buffer.from(bundle.png).toString('base64')],
      }, requestOptions);
    },
    async repair(bundle: ReviewBundle, requestOptions?: ProviderRequestOptions): Promise<VisualFinding[]> {
      return chat(REPAIR_SYSTEM_PROMPT, {
        content: `Here is the invalid .bpm source:\n\`\`\`\n${bundle.text}\n\`\`\`\n\nStructured errors:\n${formatBlocking(bundle)}\n\nReturn find/replace patches that make this file valid.`,
      }, requestOptions);
    },
    async generate(description: string, family = 'bpmn', requestOptions?: ProviderRequestOptions): Promise<string> {
      const systemPrompt = getGenerationSystemPrompt(family as import('@bpm/diagram-runtime').DiagramFamilyId);
      if (!systemPrompt) {
        throw new Error(`No generation prompt registered for family "${family}" — the capability check upstream should have prevented this call.`);
      }
      const res = await fetchWithProviderPolicy(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: description },
          ],
          stream: false,
        }),
      }, requestOptions, timeoutMs);
      if (!res.ok) {
        throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
      }
      const data = await readJsonWithLimit(res, requestOptions?.maxResponseBytes) as { message?: { content?: string } };
      return stripFences(data.message?.content ?? '');
    },
  };
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}
