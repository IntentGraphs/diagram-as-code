import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithProviderPolicy, ProviderRequestError, readJsonWithLimit } from '../src/request.js';

describe('provider request policy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('converts an aborted fetch into a classified cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const pending = fetchWithProviderPolicy('http://provider.test', {}, { signal: controller.signal }, 30_000);
    controller.abort();
    await expect(pending).rejects.toMatchObject<ProviderRequestError>({ code: 'cancelled' });
  });

  it('enforces the timeout policy', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    await expect(fetchWithProviderPolicy('http://provider.test', {}, undefined, 5))
      .rejects.toMatchObject<ProviderRequestError>({ code: 'timeout' });
  }, 1_000);

  it('rejects oversized provider responses before parsing them', async () => {
    const response = new Response('{"large":true}');
    await expect(readJsonWithLimit(response, 4)).rejects.toThrow(/exceeds/);
  });

  it('rejects malformed provider JSON instead of treating it as an empty result', async () => {
    const response = new Response('not json');
    await expect(readJsonWithLimit(response)).rejects.toThrow(SyntaxError);
  });
});
