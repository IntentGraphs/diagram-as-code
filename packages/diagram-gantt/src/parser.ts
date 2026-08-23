import { GANTT_ID_PATTERN, type GanttDiagram, type GanttGroup, type GanttTask, type PlainDate } from './ast.js';
import { MAX_DEPENDENCIES, MAX_LABEL_CHARS, MAX_NESTING_DEPTH, MAX_SOURCE_CHARS, MAX_TASKS, MAX_TIMELINE_DAYS } from './limits.js';
import { addWeekdays, compareDates, dateDistance, isPlainDate, weekdaysBetweenInclusive } from './date.js';
import { normalizeGanttTimescale } from '@bpm/diagram-core';
import type { DiagramDiagnostic, FamilyParseResult } from './types.js';

const diagnostic = (line: number, message: string, code: string, token?: string): DiagramDiagnostic => ({ line, column: 1, message, code, ...(token === undefined ? {} : { token }) });
const durationPattern = /^(\d+)d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const dateFields = /\b(start|end)\s+(\S+)/g;

function parseDate(value: string, line: number, semanticErrors: DiagramDiagnostic[], field: string): PlainDate | undefined {
  if (!datePattern.test(value) || !isPlainDate(value)) { semanticErrors.push(diagnostic(line, `${field} must be a valid ISO date in YYYY-MM-DD form`, 'invalid_date', value)); return undefined; }
  return value;
}
function parseDuration(value: string, line: number, semanticErrors: DiagramDiagnostic[]): number | undefined {
  const match = durationPattern.exec(value);
  if (!match) { semanticErrors.push(diagnostic(line, 'duration must be a non-negative number of calendar days, such as 3d', 'invalid_duration', value)); return undefined; }
  const days = Number(match[1]);
  if (!Number.isSafeInteger(days) || days < 0) semanticErrors.push(diagnostic(line, 'duration must be a non-negative integer', 'invalid_duration', value));
  return days;
}
function parseProgress(value: string, line: number, semanticErrors: DiagramDiagnostic[]): number | undefined {
  if (!/^\d+(?:\.\d+)?%$/.test(value)) { semanticErrors.push(diagnostic(line, 'progress must be a percentage from 0% to 100%', 'invalid_progress', value)); return undefined; }
  const progress = Number(value.slice(0, -1));
  if (progress < 0 || progress > 100) semanticErrors.push(diagnostic(line, 'progress must be between 0% and 100%', 'invalid_progress', value));
  return progress;
}

export function parseGantt(source: string): FamilyParseResult<GanttDiagram> {
  const ast: GanttDiagram = { kind: 'ganttDiagram', calendar: 'weekdays', tasks: [], dependencies: [], groups: [] };
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  if (source.length > MAX_SOURCE_CHARS) { semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters`, 'source_too_large')); return { ast, errors, semanticErrors }; }
  const ids = new Map<string, { kind: 'task' | 'group'; line: number }>();
  const groupsByIndent: Array<{ indent: number; group: GanttGroup; depth: number }> = [];
  let dependencyNumber = 0;
  for (const [index, rawLine] of source.split('\n').entries()) {
    const line = index + 1;
    const raw = rawLine.replace(/\r$/, '');
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (line === 1 && /^diagram:\s*gantt$/i.test(trimmed)) continue;
    if (line === 1 && /^diagram:\s*\S+$/i.test(trimmed)) { errors.push(diagnostic(line, 'Expected diagram: gantt', 'wrong_diagram')); continue; }
    const indent = raw.match(/^ */)![0].length;
    if (raw.includes('\t') || indent % 2 !== 0) { errors.push(diagnostic(line, 'Gantt indentation must use spaces in multiples of two', 'invalid_indentation')); continue; }
    while (groupsByIndent.length && groupsByIndent[groupsByIndent.length - 1].indent >= indent) groupsByIndent.pop();
    const groupMatch = trimmed.match(/^group\s+"([^"\r\n]*)"\s+as\s+(\S+)$/);
    if (groupMatch) {
      const [, label, id] = groupMatch;
      const parent = groupsByIndent[groupsByIndent.length - 1];
      if (label.length > MAX_LABEL_CHARS) semanticErrors.push(diagnostic(line, `Label exceeds the maximum of ${MAX_LABEL_CHARS} characters`, 'label_too_large', id));
      if (!GANTT_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id`, 'invalid_id', id));
      if (ids.has(id)) semanticErrors.push(diagnostic(line, `id "${id}" is already used on line ${ids.get(id)!.line}`, 'duplicate_id', id));
      const depth = parent ? parent.depth + 1 : 0;
      if (depth > MAX_NESTING_DEPTH) semanticErrors.push(diagnostic(line, `Gantt nesting exceeds the maximum depth of ${MAX_NESTING_DEPTH}`, 'max_depth_exceeded'));
      const group: GanttGroup = { id, label, ...(parent ? { parentId: parent.group.id } : {}), line };
      if (ast.groups.length < MAX_TASKS && !ids.has(id)) { ast.groups.push(group); ids.set(id, { kind: 'group', line }); groupsByIndent.push({ indent, group, depth }); }
      continue;
    }
    const taskMatch = trimmed.match(/^(task|milestone)\s+"([^"\r\n]*)"\s+as\s+(\S+)(.*)$/);
    if (taskMatch) {
      const [, kind, label, id, rest] = taskMatch;
      const task: GanttTask = { id, label, milestone: kind === 'milestone', ...(groupsByIndent[groupsByIndent.length - 1] ? { parentId: groupsByIndent[groupsByIndent.length - 1].group.id } : {}), line };
      if (label.length > MAX_LABEL_CHARS) semanticErrors.push(diagnostic(line, `Label exceeds the maximum of ${MAX_LABEL_CHARS} characters`, 'label_too_large', id));
      if (!GANTT_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id`, 'invalid_id', id));
      if (ids.has(id)) semanticErrors.push(diagnostic(line, `id "${id}" is already used on line ${ids.get(id)!.line}`, 'duplicate_id', id));
      const fields = [...rest.matchAll(dateFields)];
      const seenFields = new Set<string>();
      for (const match of fields) { if (seenFields.has(match[1])) semanticErrors.push(diagnostic(line, `${match[1]} may only be specified once`, 'duplicate_date_field', match[1])); seenFields.add(match[1]); const parsed = parseDate(match[2], line, semanticErrors, match[1]); if (match[1] === 'start') task.start = parsed; else task.end = parsed; }
      const durationMatch = rest.match(/\bduration\s+(\S+)/);
      if (durationMatch) task.durationDays = parseDuration(durationMatch[1], line, semanticErrors);
      const progressMatch = rest.match(/\bprogress\s+(\S+)/);
      if (progressMatch) task.progress = parseProgress(progressMatch[1], line, semanticErrors);
      const unknown = rest.replace(dateFields, '').replace(/\bduration\s+\S+/, '').replace(/\bprogress\s+\S+/, '').trim();
      if (unknown) errors.push(diagnostic(line, `Could not parse task options: "${unknown}"`, 'unparseable_options'));
      if (task.milestone && (task.start === undefined || task.end !== undefined || task.durationDays !== undefined)) semanticErrors.push(diagnostic(line, 'Milestones require exactly one start date and no duration or end date', 'invalid_milestone', id));
      const dateCount = Number(task.start !== undefined) + Number(task.end !== undefined) + Number(task.durationDays !== undefined);
      if (!task.milestone && dateCount < 2) semanticErrors.push(diagnostic(line, 'Tasks require start+duration, start+end, or end+duration', 'missing_schedule', id));
      if (!task.milestone && dateCount > 2) semanticErrors.push(diagnostic(line, 'Tasks may specify only two of start, end, and duration', 'conflicting_schedule', id));
      if (task.start && task.end && compareDates(task.start, task.end) > 0) semanticErrors.push(diagnostic(line, 'Task start cannot be after its end', 'invalid_schedule', id));
      if (task.start && task.durationDays !== undefined) task.end = addWeekdays(task.start, Math.max(0, task.durationDays - 1));
      else if (task.end && task.durationDays !== undefined) task.start = addWeekdays(task.end, -Math.max(0, task.durationDays - 1));
      if (task.start && task.end && dateDistance(task.start, task.end) > MAX_TIMELINE_DAYS) semanticErrors.push(diagnostic(line, `Task timeline exceeds the maximum of ${MAX_TIMELINE_DAYS} days`, 'timeline_too_large', id));
      if (ast.tasks.length >= MAX_TASKS) semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_TASKS} tasks`, 'max_tasks_exceeded'));
      else if (!ids.has(id)) { ast.tasks.push(task); ids.set(id, { kind: 'task', line }); }
      continue;
    }
    const dependency = trimmed.match(/^(\S+)\s+->\s+(\S+)(?:\s+lag\s+(\S+))?$/);
    if (dependency) {
      if (ast.dependencies.length >= MAX_DEPENDENCIES) { semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_DEPENDENCIES} dependencies`, 'max_dependencies_exceeded')); continue; }
      const [, from, to, lagValue] = dependency;
      const lagDays = lagValue === undefined ? 0 : parseDuration(lagValue, line, semanticErrors) ?? 0;
      if (from === to) semanticErrors.push(diagnostic(line, 'A dependency cannot reference the same task', 'self_dependency', from));
      ast.dependencies.push({ id: `d${++dependencyNumber}`, from, to, lagDays, line });
      continue;
    }
    const calendarMatch = trimmed.match(/^calendar(?::|\s+)(.+)$/i);
    if (calendarMatch) {
      const value = calendarMatch[1].trim();
      const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
      if (normalized === 'weekday' || normalized === 'weekdays') continue;
      const visualTimescale = normalizeGanttTimescale(value);
      if (visualTimescale && ['fortnightly', 'monthly', 'quarterly', 'halfyear'].includes(visualTimescale)) ast.timescale = visualTimescale;
      else errors.push(diagnostic(line, 'Calendar must be weekdays, fortnightly, monthly, quarterly, or halfyear (half-year and half a year are also accepted)', 'unsupported_calendar', value));
      continue;
    }
    errors.push(diagnostic(line, `Could not parse line: "${trimmed}"`, 'unparseable_line'));
  }
  for (const dep of ast.dependencies) { if (!ids.has(dep.from) || ids.get(dep.from)?.kind !== 'task') semanticErrors.push(diagnostic(dep.line, `Dependency references unknown task "${dep.from}"`, 'unknown_dependency_reference', dep.from)); if (!ids.has(dep.to) || ids.get(dep.to)?.kind !== 'task') semanticErrors.push(diagnostic(dep.line, `Dependency references unknown task "${dep.to}"`, 'unknown_dependency_reference', dep.to)); }
  const taskMap = new Map(ast.tasks.map((task) => [task.id, task]));
  for (const task of ast.tasks) if (task.start && task.end && weekdaysBetweenInclusive(task.start, task.end) !== (task.durationDays ?? weekdaysBetweenInclusive(task.start, task.end))) semanticErrors.push(diagnostic(task.line, 'Task dates and duration do not agree on the Monday-Friday calendar', 'schedule_mismatch', task.id));
  const visit = new Set<string>(); const active = new Set<string>();
  const visitTask = (id: string): void => { if (active.has(id)) { semanticErrors.push(diagnostic(taskMap.get(id)?.line ?? 1, `Dependency cycle includes task "${id}"`, 'dependency_cycle', id)); return; } if (visit.has(id)) return; active.add(id); for (const dep of ast.dependencies.filter((entry) => entry.from === id && taskMap.has(entry.to))) visitTask(dep.to); active.delete(id); visit.add(id); };
  for (const task of ast.tasks) visitTask(task.id);
  const dates = ast.tasks.flatMap((task) => [task.start, task.end]).filter((value): value is string => value !== undefined);
  if (dates.length) { const earliest = dates.reduce((a, b) => (compareDates(a, b) <= 0 ? a : b)); const latest = dates.reduce((a, b) => (compareDates(a, b) >= 0 ? a : b)); if (dateDistance(earliest, latest) > MAX_TIMELINE_DAYS) semanticErrors.push(diagnostic(1, `Timeline exceeds the maximum of ${MAX_TIMELINE_DAYS} days`, 'timeline_too_large')); }
  return { ast, errors, semanticErrors };
}
