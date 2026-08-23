const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isPlainDate(value: string): boolean { const match = ISO.exec(value); if (!match) return false; const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]); if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return false; return year >= 1970 && year <= 9999; }
function dayIndex(value: string): number { const [year, month, day] = value.split('-').map(Number); const date = new Date(Date.UTC(2000, month - 1, day)); date.setUTCFullYear(year); return Math.floor(date.getTime() / DAY_MS); }
function fromIndex(index: number): string { const date = new Date(index * DAY_MS); return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
export function compareDates(a: string, b: string): number { return Math.sign(dayIndex(a) - dayIndex(b)); }
export function dateDistance(a: string, b: string): number { return Math.abs(dayIndex(b) - dayIndex(a)); }
export function addWeekdays(value: string, amount: number): string { let index = dayIndex(value); const direction = Math.sign(amount); let remaining = Math.abs(amount); while (remaining > 0) { index += direction; const weekday = new Date(index * DAY_MS).getUTCDay(); if (weekday !== 0 && weekday !== 6) remaining -= 1; } return fromIndex(index); }
export function weekdaysBetweenInclusive(start: string, end: string): number { let index = dayIndex(start); const finish = dayIndex(end); if (index > finish) return 0; let count = 0; while (index <= finish) { const weekday = new Date(index * DAY_MS).getUTCDay(); if (weekday !== 0 && weekday !== 6) count += 1; index += 1; } return count; }
export function weekday(value: string): number { return new Date(dayIndex(value) * DAY_MS).getUTCDay(); }
export function toDay(value: string): number { return dayIndex(value); }
export function fromDay(value: number): string { return fromIndex(value); }
