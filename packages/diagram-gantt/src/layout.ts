import { fromDay, isPlainDate, toDay, weekday } from './date.js';
import { pageSizeInPixels } from '@bpm/diagram-core';
import { MAX_RENDER_HEIGHT, MAX_RENDER_WIDTH } from './limits.js';
import type { GanttDiagram, GanttTask, GanttTimescale } from './ast.js';

const LABEL_WIDTH = 260;
const TOP = 54;
const ROW_HEIGHT = 34;
const GROUP_HEIGHT = 28;
const DAY_WIDTH = 24;
const MARGIN = 20;

export type ResolvedGanttTimescale = Exclude<GanttTimescale, 'auto'>;
export interface GanttTick { date: string; x: number; label: string; major: boolean; }
export interface PositionedGanttRow { id: string; kind: 'group' | 'task'; label: string; x: number; y: number; width: number; height: number; start?: string; end?: string; progress?: number; milestone?: boolean; parentId?: string; }
export interface PositionedGanttDependency { id: string; from: string; to: string; points: Array<{ x: number; y: number }>; }
export interface PositionedGantt { width: number; height: number; startDate: string; endDate: string; timelineX: number; timelineWidth: number; unitScale: number; /** @deprecated Use unitScale; retained for daily-layout consumers. */ dayScale: number; timescale: ResolvedGanttTimescale; rows: PositionedGanttRow[]; dependencies: PositionedGanttDependency[]; ticks: GanttTick[]; }

function labelDate(date: string, span: number): string { if (span > 365) return date.slice(0, 7); return date.slice(5); }
function taskEnd(task: GanttTask, fallback: string): string { return task.end ?? task.start ?? fallback; }
function taskStart(task: GanttTask, fallback: string): string { return task.start ?? task.end ?? fallback; }
function monthOrdinal(date: string): number { const [year, month] = date.split('-').map(Number); return year * 12 + month - 1; }
function monthDays(date: string): number { const [year, month] = date.split('-').map(Number); return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function quarterOrdinal(date: string): number { const [year, month] = date.split('-').map(Number); return year * 4 + Math.floor((month - 1) / 3); }
function halfYearOrdinal(date: string): number { const [year, month] = date.split('-').map(Number); return year * 2 + Math.floor((month - 1) / 6); }
function quarterDays(date: string): number {
  const [year, month] = date.split('-').map(Number);
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3;
  const start = `${String(year).padStart(4, '0')}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`;
  const nextQuarterMonth = quarterStartMonth + 3;
  const nextYear = year + Math.floor(nextQuarterMonth / 12);
  const nextMonth = (nextQuarterMonth % 12) + 1;
  const next = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return toDay(next) - toDay(start);
}
function halfYearDays(date: string): number {
  const [year, month] = date.split('-').map(Number);
  const halfStartMonth = Math.floor((month - 1) / 6) * 6;
  const start = `${String(year).padStart(4, '0')}-${String(halfStartMonth + 1).padStart(2, '0')}-01`;
  const nextHalfMonth = halfStartMonth + 6;
  const nextYear = year + Math.floor(nextHalfMonth / 12);
  const nextMonth = (nextHalfMonth % 12) + 1;
  const next = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
  return toDay(next) - toDay(start);
}
function periodProgress(date: string, timescale: ResolvedGanttTimescale): number {
  const day = Number(date.slice(8, 10));
  if (timescale === 'monthly') return (day - 1) / monthDays(date);
  if (timescale === 'quarterly') {
    const month = Number(date.slice(5, 7));
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const quarterStart = `${date.slice(0, 4)}-${String(quarterStartMonth).padStart(2, '0')}-01`;
    return (toDay(date) - toDay(quarterStart)) / quarterDays(date);
  }
  if (timescale === 'halfyear') {
    const month = Number(date.slice(5, 7));
    const halfStartMonth = Math.floor((month - 1) / 6) * 6 + 1;
    const halfStart = `${date.slice(0, 4)}-${String(halfStartMonth).padStart(2, '0')}-01`;
    return (toDay(date) - toDay(halfStart)) / halfYearDays(date);
  }
  return 0;
}

/** Returns a continuous position in the requested visual time units. */
export function timeCoordinate(date: string, origin: string, timescale: ResolvedGanttTimescale): number {
  const days = toDay(date) - toDay(origin);
  if (timescale === 'daily') return days;
  if (timescale === 'weekly') return days / 7;
  if (timescale === 'fortnightly') return days / 14;
  if (timescale === 'halfyear') return halfYearOrdinal(date) - halfYearOrdinal(origin) + periodProgress(date, timescale) - periodProgress(origin, timescale);
  const ordinal = timescale === 'monthly' ? monthOrdinal(date) - monthOrdinal(origin) : quarterOrdinal(date) - quarterOrdinal(origin);
  return ordinal + periodProgress(date, timescale) - periodProgress(origin, timescale);
}

export function periodWidth(date: string, timescale: ResolvedGanttTimescale): number {
  if (timescale === 'daily') return 1;
  if (timescale === 'weekly') return 1 / 7;
  if (timescale === 'fortnightly') return 1 / 14;
  if (timescale === 'monthly') return 1 / monthDays(date);
  if (timescale === 'quarterly') return 1 / quarterDays(date);
  return 1 / halfYearDays(date);
}

function resolveTimescale(timescale: GanttTimescale | undefined, spanDays: number): ResolvedGanttTimescale {
  if (!timescale || timescale === 'daily') return 'daily';
  if (timescale !== 'auto') return timescale;
  if (spanDays > 730) return 'halfyear';
  if (spanDays > 365) return 'quarterly';
  if (spanDays > 90) return 'monthly';
  if (spanDays > 42) return 'fortnightly';
  if (spanDays > 21) return 'weekly';
  return 'daily';
}

function dateFromMonthOrdinal(value: number): string {
  const year = Math.floor(value / 12);
  const month = value % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function dateFromQuarterOrdinal(value: number): string {
  const year = Math.floor(value / 4);
  const month = (value % 4) * 3 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function dateFromHalfYearOrdinal(value: number): string {
  const year = Math.floor(value / 2);
  const month = (value % 2) * 6 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

function quarterLabel(date: string): string { return `${date.slice(0, 4)} Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`; }
function halfYearLabel(date: string): string { return `${date.slice(0, 4)} H${Number(date.slice(5, 7)) <= 6 ? 1 : 2}`; }

function ticksFor(startDate: string, endDate: string, spanDays: number, timescale: ResolvedGanttTimescale, scale: number): GanttTick[] {
  const ticks: GanttTick[] = [];
  const endPosition = timeCoordinate(endDate, startDate, timescale);
  const add = (date: string, label: string, major = true): void => {
    const x = timeCoordinate(date, startDate, timescale) * scale;
    if (x >= -scale && x <= endPosition * scale + scale) ticks.push({ date, x: Math.max(0, x), label, major });
  };
  if (timescale === 'daily') {
    const step = spanDays > 730 ? 30 : spanDays > 120 ? 7 : 1;
    for (let offset = 0; offset < spanDays; offset += step) { const date = fromDay(toDay(startDate) + offset); add(date, labelDate(date, spanDays), step !== 1 || weekday(date) === 1); }
    return ticks;
  }
  if (timescale === 'weekly' || timescale === 'fortnightly') {
    const step = timescale === 'weekly' ? 7 : 14;
    for (let offset = 0; offset < spanDays; offset += step) { const date = fromDay(toDay(startDate) + offset); add(date, date.slice(5), true); }
    return ticks;
  }
  const firstOrdinal = timescale === 'monthly' ? monthOrdinal(startDate) : timescale === 'quarterly' ? quarterOrdinal(startDate) : halfYearOrdinal(startDate);
  const lastOrdinal = timescale === 'monthly' ? monthOrdinal(endDate) : timescale === 'quarterly' ? quarterOrdinal(endDate) : halfYearOrdinal(endDate);
  for (let ordinal = firstOrdinal; ordinal <= lastOrdinal; ordinal += 1) {
    const date = timescale === 'monthly' ? dateFromMonthOrdinal(ordinal) : timescale === 'quarterly' ? dateFromQuarterOrdinal(ordinal) : dateFromHalfYearOrdinal(ordinal);
    add(date, timescale === 'monthly' ? date.slice(0, 7) : timescale === 'quarterly' ? quarterLabel(date) : halfYearLabel(date));
  }
  return ticks;
}

function labelWidthFor(page: GanttDiagram['page']): number {
  if (!page) return LABEL_WIDTH;
  const pageWidth = pageSizeInPixels(page).width;
  return Math.min(LABEL_WIDTH, Math.max(220, Math.floor(pageWidth * 0.22)));
}

/** Uses the declared page width as the axis budget so the start/end range is distributed across it. */
function timelineWidthFor(spanUnits: number, page: GanttDiagram['page'], labelWidth: number): number {
  const compactWidth = Math.min(MAX_RENDER_WIDTH - labelWidth - MARGIN * 2, Math.max(240, spanUnits * DAY_WIDTH));
  if (!page) return compactWidth;
  const pageWidth = pageSizeInPixels(page).width;
  const available = pageWidth - labelWidth - MARGIN * 2;
  return Math.min(MAX_RENDER_WIDTH - labelWidth - MARGIN * 2, Math.max(240, available));
}

function rowMetricsFor(page: GanttDiagram['page'], rowCount: number): { rowHeight: number; groupHeight: number; taskHeight: number } {
  if (!page || rowCount < 1) return { rowHeight: ROW_HEIGHT, groupHeight: GROUP_HEIGHT, taskHeight: ROW_HEIGHT - 8 };
  const pageHeight = pageSizeInPixels(page).height;
  const availableHeight = Math.max(ROW_HEIGHT, pageHeight - TOP - MARGIN * 2);
  const rowHeight = Math.max(ROW_HEIGHT, Math.min(96, availableHeight / rowCount));
  const groupHeight = Math.max(GROUP_HEIGHT, Math.min(64, rowHeight * 0.75));
  return { rowHeight, groupHeight, taskHeight: Math.max(ROW_HEIGHT - 8, rowHeight - 8) };
}

export function layoutGantt(ast: GanttDiagram): PositionedGantt {
  const dates = ast.tasks.flatMap((task) => [task.start, task.end]).filter((value): value is string => value !== undefined && isPlainDate(value));
  const startDate = dates.length ? dates.reduce((a, b) => (toDay(a) < toDay(b) ? a : b)) : '1970-01-01';
  const endDate = dates.length ? dates.reduce((a, b) => (toDay(a) > toDay(b) ? a : b)) : startDate;
  const spanDays = Math.max(1, toDay(endDate) - toDay(startDate) + 1);
  const timescale = resolveTimescale(ast.timescale, spanDays);
  const spanUnits = Math.max(periodWidth(endDate, timescale), timeCoordinate(endDate, startDate, timescale) + periodWidth(endDate, timescale));
  const labelWidth = labelWidthFor(ast.page);
  const timelineWidth = timelineWidthFor(spanUnits, ast.page, labelWidth);
  const scale = timelineWidth / spanUnits;
  const rowMetrics = rowMetricsFor(ast.page, ast.tasks.length + ast.groups.length);
  const rows: PositionedGanttRow[] = [];
  let y = TOP;
  const groups = new Map(ast.groups.map((group) => [group.id, group]));
  const children = new Map<string | undefined, GanttTask[]>();
  for (const task of ast.tasks) { const list = children.get(task.parentId) ?? []; list.push(task); children.set(task.parentId, list); }
  const appendGroup = (groupId: string): void => {
    const group = groups.get(groupId); if (!group) return;
    rows.push({ id: group.id, kind: 'group', label: group.label, x: 0, y, width: labelWidth + timelineWidth, height: rowMetrics.groupHeight, parentId: group.parentId }); y += rowMetrics.groupHeight;
    for (const task of children.get(group.id) ?? []) appendTask(task);
    for (const child of ast.groups.filter((entry) => entry.parentId === group.id)) appendGroup(child.id);
  };
  const appendTask = (task: GanttTask): void => {
    const start = taskStart(task, startDate); const end = taskEnd(task, start);
    const startOffset = Math.max(0, Math.min(spanUnits, timeCoordinate(start, startDate, timescale)));
    const endOffset = Math.max(startOffset, Math.min(spanUnits, timeCoordinate(end, startDate, timescale) + periodWidth(end, timescale)));
    const x = Math.max(labelWidth, Math.min(labelWidth + timelineWidth, labelWidth + startOffset * scale));
    const width = task.milestone ? 18 : Math.max(4, Math.min(timelineWidth, (endOffset - startOffset) * scale));
    rows.push({ id: task.id, kind: 'task', label: task.label, x, y: Math.min(MAX_RENDER_HEIGHT - rowMetrics.rowHeight, y), width: Number.isFinite(width) ? width : 4, height: rowMetrics.taskHeight, start, end, ...(task.progress === undefined ? {} : { progress: Math.max(0, Math.min(100, task.progress)) }), milestone: task.milestone, parentId: task.parentId }); y += rowMetrics.rowHeight;
  };
  for (const task of children.get(undefined) ?? []) appendTask(task);
  for (const group of ast.groups.filter((entry) => entry.parentId === undefined)) appendGroup(group.id);
  const taskRows = new Map(rows.filter((row) => row.kind === 'task').map((row) => [row.id, row]));
  const dependencies = ast.dependencies.flatMap((dependency, index) => {
    const from = taskRows.get(dependency.from); const to = taskRows.get(dependency.to); if (!from || !to) return [];
    const forward = to.x >= from.x;
    const startX = forward ? from.x + from.width : from.x;
    const endX = forward ? to.x : to.x + to.width;
    const startY = from.y + from.height / 2; const endY = to.y + to.height / 2;
    const gap = 12 + (index % 3) * 6;
    const bendX = forward ? Math.max(startX + gap, (startX + endX) / 2) : Math.min(startX - gap, (startX + endX) / 2);
    const sameRow = Math.abs(startY - endY) < 1;
    const points = sameRow
      ? [{ x: startX, y: startY }, { x: bendX, y: startY - gap }, { x: endX, y: endY }]
      : [{ x: startX, y: startY }, { x: bendX, y: startY }, { x: bendX, y: endY }, { x: endX, y: endY }];
    return [{ id: dependency.id, from: dependency.from, to: dependency.to, points }];
  });
  const ticks = ticksFor(startDate, endDate, spanDays, timescale, scale);
  const width = Math.min(MAX_RENDER_WIDTH, labelWidth + timelineWidth + MARGIN * 2);
  const height = Math.min(MAX_RENDER_HEIGHT, y + MARGIN);
  return { width, height, startDate, endDate, timelineX: labelWidth, timelineWidth, unitScale: scale, dayScale: scale, timescale, rows, dependencies, ticks };
}
