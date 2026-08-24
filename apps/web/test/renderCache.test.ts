import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject, resetStoreForTests } from '../src/project/store.js';
import { createRenderCache } from '../src/renderCache.js';
import type { PipelineResult } from '../src/pipeline.js';

function result(svg = '<svg><text>cached</text></svg>'): PipelineResult {
  return {
    family: 'bpmn', header: null, capabilities: null, svg, diagram: null,
    positioned: null, executionPositioned: null, engineName: 'flat', ast: null,
    diagnostics: [], errors: [], warnings: [], paginated: null,
  };
}

describe('render cache', () => {
  beforeEach(async () => {
    await resetStoreForTests();
  });

  it('restores a successful snapshot from IndexedDB in a new cache instance', async () => {
    const { project, diagram } = await createDefaultProject('task "Cached" as cached');
    const identity = { projectId: project.id, diagramId: diagram.id };
    const first = createRenderCache();
    await first.put(identity, diagram.body, undefined, result());

    const second = createRenderCache();
    await expect(second.get(identity, diagram.body)).resolves.toMatchObject({
      svg: '<svg><text>cached</text></svg>',
    });
  });

  it('separates source and engine variants', async () => {
    const { project, diagram } = await createDefaultProject('task "Cached" as cached');
    const identity = { projectId: project.id, diagramId: diagram.id };
    const cache = createRenderCache();
    await cache.put(identity, diagram.body, undefined, result('<svg>default</svg>'));
    await cache.put(identity, diagram.body, 'swimlane', result('<svg>override</svg>'));

    await expect(cache.get(identity, diagram.body)).resolves.toMatchObject({ svg: '<svg>default</svg>' });
    await expect(cache.get(identity, diagram.body, 'swimlane')).resolves.toMatchObject({ svg: '<svg>override</svg>' });
    await expect(cache.get(identity, `${diagram.body}\n`)).resolves.toBeUndefined();
  });
});
