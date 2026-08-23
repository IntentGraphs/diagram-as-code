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

export type ProviderRequestErrorCode = 'timeout' | 'cancelled';

export class ProviderRequestError extends Error {
  readonly code: ProviderRequestErrorCode;

  constructor(code: ProviderRequestErrorCode, message: string) {
    super(message);
    this.name = 'ProviderRequestError';
    this.code = code;
  }
}

export async function fetchWithProviderPolicy(
  input: RequestInfo | URL,
  init: RequestInit,
  options: ProviderRequestOptions | undefined,
  defaultTimeoutMs: number,
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = () => controller.abort();

  if (options?.signal?.aborted) {
    throw new ProviderRequestError('cancelled', 'AI provider request cancelled');
  }
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
