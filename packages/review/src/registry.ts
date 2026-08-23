import type { ReviewProvider } from './types.js';
import { manualProvider } from './providers/manual.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createOpenAIProvider } from './providers/openai.js';

const providers = new Map<string, ReviewProvider>([[manualProvider.id, manualProvider]]);

export function registerProvider(provider: ReviewProvider): void {
  providers.set(provider.id, provider);
}

export function getProvider(id: string): ReviewProvider {
  if (!providers.has(id)) {
    if (id === 'ollama') registerProvider(createOllamaProvider());
    else if (id === 'openai') registerProvider(createOpenAIProvider());
  }
  const provider = providers.get(id);
  if (!provider) throw new Error(`Unknown review provider "${id}". Available: ${[...providers.keys()].join(', ')}`);
  return provider;
}
