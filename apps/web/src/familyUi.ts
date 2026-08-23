import type { DiagramFamilyId, FamilyCapabilities, StructuredExportDescriptor } from '@bpm/diagram-runtime';

export function familyLabel(family: DiagramFamilyId | null): string {
  if (family === 'bpmn') return 'BPMN';
  if (family === 'mindmap') return 'Mindmap';
  if (family === 'flowchart') return 'Flowchart';
  if (family === 'architecture') return 'Architecture';
  if (family === 'gantt') return 'Gantt';
  return 'No family';
}

export function firstStructuredExport(capabilities: FamilyCapabilities | null): StructuredExportDescriptor | null {
  return capabilities?.structuredExports?.[0] ?? null;
}

export function structuredExports(capabilities: FamilyCapabilities | null): StructuredExportDescriptor[] {
  return capabilities?.structuredExports ?? [];
}

export function unsupportedActionMessage(action: string, family: DiagramFamilyId | null): string {
  return `${action} is not available for ${familyLabel(family)} diagrams.`;
}
