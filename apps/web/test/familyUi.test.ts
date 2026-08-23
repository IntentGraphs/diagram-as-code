import { describe, expect, it } from 'vitest';
import { familyLabel, firstStructuredExport, unsupportedActionMessage } from '../src/familyUi.js';

describe('family-aware UI helpers', () => {
  it('labels supported families and the unknown state', () => {
    expect(familyLabel('bpmn')).toBe('BPMN');
    expect(familyLabel('mindmap')).toBe('Mindmap');
    expect(familyLabel('flowchart')).toBe('Flowchart');
    expect(familyLabel('architecture')).toBe('Architecture');
    expect(familyLabel(null)).toBe('No family');
  });

  it('explains unsupported actions in family terms', () => {
    expect(unsupportedActionMessage('Generate', 'mindmap')).toBe('Generate is not available for Mindmap diagrams.');
  });

  it('selects structured export metadata without knowing the family or format', () => {
    const descriptor = { format: 'custom', label: 'Custom XML', mimeType: 'text/xml', fileExtension: '.xml' };
    expect(firstStructuredExport({ structuredExports: [descriptor] } as never)).toEqual(descriptor);
    expect(firstStructuredExport(null)).toBeNull();
  });
});
