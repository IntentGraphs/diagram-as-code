/**
 * Visual horizontal scales for Gantt timelines.
 *
 * This is intentionally separate from the scheduling calendar: dates and
 * weekday durations remain authoritative while the scale only changes how
 * much horizontal space the timeline consumes.
 */
export const GANTT_TIMESCALES = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'halfyear', 'auto'] as const;
export type GanttTimescale = typeof GANTT_TIMESCALES[number];

/** Accepts natural DSL spellings while keeping one canonical layout value. */
export function normalizeGanttTimescale(value: string): GanttTimescale | null {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, GanttTimescale> = {
    day: 'daily', daily: 'daily',
    week: 'weekly', weekly: 'weekly',
    fortnight: 'fortnightly', fortnightly: 'fortnightly', biweekly: 'fortnightly',
    month: 'monthly', monthly: 'monthly',
    quarter: 'quarterly', quarterly: 'quarterly',
    halfyear: 'halfyear', halfayear: 'halfyear', semiannual: 'halfyear', semiannually: 'halfyear',
    auto: 'auto',
  };
  return aliases[key] ?? null;
}
