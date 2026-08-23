import type { GanttTimescale, PageSpec } from '@bpm/diagram-core';

export type { GanttTimescale } from '@bpm/diagram-core';
export const GANTT_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
export type PlainDate = string;
export interface GanttGroup { id: string; label: string; parentId?: string; line: number; }
export interface GanttTask {
  id: string; label: string; start?: PlainDate; end?: PlainDate; durationDays?: number;
  milestone: boolean; progress?: number; parentId?: string; line: number;
}
export interface GanttDependency { id: string; from: string; to: string; lagDays: number; line: number; }
export interface GanttDiagram { kind: 'ganttDiagram'; calendar: 'weekdays'; timescale?: GanttTimescale; page?: PageSpec; tasks: GanttTask[]; dependencies: GanttDependency[]; groups: GanttGroup[]; }
