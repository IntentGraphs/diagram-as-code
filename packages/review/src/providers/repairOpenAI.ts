import type { RepairBundle, RepairProvider, RepairSuggestion } from '../repairTypes.js';
import { REPAIR_SYSTEM_PROMPT as SYSTEM_PROMPT } from '../generatePrompt.js';
import { fetchWithProviderPolicy, readJsonWithLimit, type ProviderRequestOptions } from '../request.js';

export function createOpenAIRepairProvider(options?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}): RepairProvider {
  const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const model = options?.model ?? process.env.BPM_OPENAI_MODEL ?? 'gpt-4o';
  const timeoutMs = options?.timeoutMs ?? 30_000;

  return {
    id: 'openai',
    async suggestRepairs(bundle: RepairBundle, requestOptions?: ProviderRequestOptions): Promise<RepairSuggestion[]> {
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY not set — pass it via env or createOpenAIRepairProvider({ apiKey })');
      }

      const errorSummary = bundle.validation.errors
        .map((e) => (e.line ? `L${e.line}: ${e.message}` : e.message))
        .join('\n');

      const body = {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Source:\n\`\`\`\n${bundle.text}\n\`\`\`\n\nErrors:\n${errorSummary}\n\nAttempt ${bundle.attempt}.`,
          },
        ],
        response_format: { type: 'json_object' },
      };

      const res = await fetchWithProviderPolicy(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      }, requestOptions, timeoutMs);

      if (!res.ok) {
        throw new Error(`OpenAI repair request failed: ${res.status} ${res.statusText}`);
      }

      const data = await readJsonWithLimit(res, requestOptions?.maxResponseBytes) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content ?? '[]';
      return parseSuggestions(content);
    },
  };
}

function parseSuggestions(raw: string): RepairSuggestion[] {
  try {
    const parsed = JSON.parse(raw);
    const obj = isRecord(parsed) ? parsed : undefined;
    const arr: unknown[] = Array.isArray(parsed)
      ? parsed
      : obj
        ? (Array.isArray(obj.suggestions) ? obj.suggestions : Array.isArray(obj.repairs) ? obj.repairs : [])
        : [];
    return arr
      .filter(isRepairSuggestion)
      .map((s) => ({
        message: typeof s.message === 'string' ? s.message : 'Suggested repair',
        patch: { find: s.patch.find, replace: s.patch.replace },
        confidence: typeof s.confidence === 'number' ? s.confidence : undefined,
      }));
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRepairSuggestion(value: unknown): value is {
  message?: unknown;
  confidence?: unknown;
  patch: { find: string; replace: string };
} {
  if (!isRecord(value) || !isRecord(value.patch)) return false;
  return typeof value.patch.find === 'string' && typeof value.patch.replace === 'string';
}
