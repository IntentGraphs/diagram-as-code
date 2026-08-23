import type { GanttDiagram } from './ast.js';
import { layoutGantt, type PositionedGantt } from './layout.js';
import { parseGantt } from './parser.js';
import { renderGantt } from './render.js';
import type { DiagramFamilyAdapter } from './types.js';

export const GANTT_JSON_EXPORT_FORMAT = 'gantt-json';
export const GANTT_CSV_EXPORT_FORMAT = 'gantt-csv';
function csv(value: string | number | boolean | undefined): string { const text = value === undefined ? '' : String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function ganttJson(ast: GanttDiagram): string { return JSON.stringify({ kind: ast.kind, calendar: ast.calendar, ...(ast.timescale ? { timescale: ast.timescale } : {}), groups: ast.groups, tasks: ast.tasks, dependencies: ast.dependencies }, null, 2); }
function ganttCsv(ast: GanttDiagram): string { const groups = new Map(ast.groups.map((group) => [group.id, group.label])); const dependencies = new Map<string, string[]>(); for (const dependency of ast.dependencies) dependencies.set(dependency.to, [...(dependencies.get(dependency.to) ?? []), `${dependency.from}${dependency.lagDays ? `+${dependency.lagDays}d` : ''}`]); const rows = ['id,label,start,end,durationDays,milestone,progress,group,predecessors']; for (const task of ast.tasks) rows.push([task.id, task.label, task.start, task.end, task.durationDays, task.milestone, task.progress, task.parentId ? groups.get(task.parentId) : undefined, dependencies.get(task.id)?.join(';')].map(csv).join(',')); return rows.join('\n'); }
export const ganttAdapter: DiagramFamilyAdapter<GanttDiagram, PositionedGantt> = {
  id: 'gantt', parse: parseGantt, async layout(ast) { return layoutGantt(ast); }, render: renderGantt,
  exportStructured(ast, _positioned, format) { if (format === GANTT_JSON_EXPORT_FORMAT) return ganttJson(ast); if (format === GANTT_CSV_EXPORT_FORMAT) return ganttCsv(ast); throw new Error(`Unsupported structured export "${format}" for gantt`); },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [GANTT_JSON_EXPORT_FORMAT, GANTT_CSV_EXPORT_FORMAT], editorMode: 'none', engineOverride: false, structuredExports: [
    { format: GANTT_JSON_EXPORT_FORMAT, label: 'Gantt JSON', mimeType: 'application/json', fileExtension: '.json', editable: true, roundTrip: 'full', fidelity: 'lossless' },
    { format: GANTT_CSV_EXPORT_FORMAT, label: 'Gantt CSV', mimeType: 'text/csv', fileExtension: '.csv', editable: true, roundTrip: 'none', fidelity: 'lossy' },
  ] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: true },
};
