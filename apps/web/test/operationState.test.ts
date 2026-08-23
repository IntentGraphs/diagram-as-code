import { describe, expect, it } from 'vitest';
import { createOperationStateCoordinator } from '../src/operationState.js';

describe('operation state', () => {
  it('suppresses stale completion and duplicate operations in one scope', () => {
    const coordinator = createOperationStateCoordinator();
    const first = coordinator.begin('import', 'Opening source', { source: 'a' })!;
    expect(coordinator.begin('import', 'Opening source', { source: 'a' })).toBeUndefined();
    const second = coordinator.begin('import', 'Opening source', { source: 'b' })!;
    expect(first.finish('success', 'old')).toBe(false);
    expect(second.finish('warning', 'completed with warnings')).toBe(true);
    expect(coordinator.snapshot()?.message).toBe('completed with warnings');
  });

  it('preserves identity and accepts non-blocking warning completion', () => {
    const coordinator = createOperationStateCoordinator();
    const operation = coordinator.begin('export', 'Preparing PPTX', { projectId: 'p', diagramId: 'd' })!;
    operation.update('preparing', 'Preparing PPTX…');
    operation.finish('warning', 'Export completed with warnings.');
    expect(coordinator.snapshot()).toMatchObject({ status: 'warning', projectId: 'p', diagramId: 'd' });
  });

  it('treats a synchronous load failure as terminal', () => {
    const coordinator = createOperationStateCoordinator();
    const operation = coordinator.begin('diagram-xml-load', 'Loading diagram preview', { source: 'diagram' })!;

    operation.finish('error', 'Could not load diagram preview: malformed XML');

    expect(coordinator.snapshot()).toMatchObject({ status: 'error', message: 'Could not load diagram preview: malformed XML' });
    expect(coordinator.begin('diagram-xml-load', 'Loading diagram preview', { source: 'diagram' })).toBeDefined();
  });
});
