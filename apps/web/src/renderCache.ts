import type { PipelineResult } from './pipeline.js';
import {
  getRenderSnapshot,
  putRenderSnapshot,
} from './project/store.js';

/** Bump when the serialized PipelineResult contract or renderer output changes. */
export const RENDERER_VERSION = 'web-render-v4';

export interface RenderCacheIdentity {
  projectId?: string;
  diagramId?: string;
}

function hashSource(source: string): string {
  // This is a cache fingerprint, not a security hash. FNV-1a is synchronous and cheap enough
  // to run before every scheduled render without adding another async boundary to typing.
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cacheKey(identity: RenderCacheIdentity, source: string, engineOverride?: string): string | undefined {
  if (!identity.projectId || !identity.diagramId) return undefined;
  return [
    identity.projectId,
    identity.diagramId,
    hashSource(source),
    engineOverride ?? '',
    RENDERER_VERSION,
  ].join('|');
}

function cloneResult(result: PipelineResult): PipelineResult {
  return JSON.parse(JSON.stringify(result)) as PipelineResult;
}

function hasSourceMap(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const map = value as Record<string, unknown>;
  return ['nodes', 'edges', 'pools', 'lanes'].every((key) => {
    const entries = map[key];
    return Boolean(entries && typeof entries === 'object' && !Array.isArray(entries));
  });
}

function isUsableResult(value: unknown): value is PipelineResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<PipelineResult>;
  // BPMN results participate in diagram-to-source navigation. A cached SVG without its source
  // map is visually usable but unsafe for this feature, so force one fresh render after the
  // cache contract changes. Other families may not expose source locations yet and retain the
  // existing render-cache UX.
  return typeof result.svg === 'string'
    && Array.isArray(result.errors)
    && result.errors.length === 0
    && (result.family !== 'bpmn' || hasSourceMap(result.sourceLocations));
}

export interface RenderCache {
  get(identity: RenderCacheIdentity, source: string, engineOverride?: string): Promise<PipelineResult | undefined>;
  put(identity: RenderCacheIdentity, source: string, engineOverride: string | undefined, result: PipelineResult): Promise<void>;
}

export function createRenderCache(): RenderCache {
  const memory = new Map<string, PipelineResult>();
  const maxMemoryEntries = 48;

  function remember(key: string, result: PipelineResult): void {
    memory.delete(key);
    memory.set(key, result);
    while (memory.size > maxMemoryEntries) {
      const oldest = memory.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      memory.delete(oldest);
    }
  }

  return {
    async get(identity, source, engineOverride) {
      const key = cacheKey(identity, source, engineOverride);
      if (!key) return undefined;
      const inMemory = memory.get(key);
      if (inMemory) {
        remember(key, inMemory);
        return inMemory;
      }
      try {
        const persisted = await getRenderSnapshot(key);
        if (!persisted || !isUsableResult(persisted.result)) return undefined;
        const result = cloneResult(persisted.result);
        remember(key, result);
        return result;
      } catch {
        // Cache failures must never block typing or force the editor into an error state.
        return undefined;
      }
    },

    async put(identity, source, engineOverride, result) {
      if (!identity.projectId || !identity.diagramId || !isUsableResult(result)) return;
      const key = cacheKey(identity, source, engineOverride);
      if (!key) return;
      const snapshot = cloneResult(result);
      remember(key, snapshot);
      try {
        await putRenderSnapshot({
          key,
          projectId: identity.projectId,
          diagramId: identity.diagramId,
          sourceHash: hashSource(source),
          engineOverride: engineOverride ?? null,
          rendererVersion: RENDERER_VERSION,
          result: snapshot,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // IndexedDB quota/schema failures degrade to the in-memory cache.
      }
    },
  };
}
