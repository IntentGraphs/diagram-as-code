import { escapeXml } from '@bpm/render-core';
import { fromDay, toDay, weekday } from './date.js';
import { periodWidth, timeCoordinate, type PositionedGantt, type PositionedGanttRow } from './layout.js';
const MARGIN = 20;
function bounded(value: number, max: number, fallback = 0): number { return Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback; }
function polyline(points: Array<{ x: number; y: number }>, maxWidth: number, maxHeight: number): string { return points.map((point) => `${bounded(point.x, maxWidth)},${bounded(point.y, maxHeight)}`).join(' '); }
function finite(value: number, fallback = 0): number { return Number.isFinite(value) ? value : fallback; }
function renderTask(row: PositionedGanttRow): string {
  const x = bounded(row.x, 100000); const y = bounded(row.y, 100000); const width = bounded(row.width, 100000); const height = bounded(row.height, 100000); const progress = bounded(row.progress ?? 0, 100) / 100;
  if (row.milestone) { const centerX = x + width / 2; const centerY = y + height / 2; return `<polygon data-task-id="${escapeXml(row.id)}" points="${centerX},${Math.max(0, centerY - 9)} ${centerX + 9},${centerY} ${centerX},${centerY + 9} ${Math.max(0, centerX - 9)},${centerY}" fill="#f59e0b" stroke="#92400e"/>`; }
  const progressWidth = width * progress;
  return `<rect data-task-id="${escapeXml(row.id)}" x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="#bfdbfe" stroke="#1d4ed8"/><rect data-task-progress="${escapeXml(row.id)}" x="${x}" y="${y}" width="${progressWidth}" height="${height}" rx="4" fill="#2563eb" opacity="0.75"/>`;
}
export function renderGantt(positioned: PositionedGantt): string {
  const width = Math.max(1, finite(positioned.width, 1)); const height = Math.max(1, finite(positioned.height, 1));
  const weekendMarkup = (() => { if (positioned.timescale !== 'daily') return ''; const first = toDay(positioned.startDate); const last = toDay(positioned.endDate); const blocks: string[] = []; const bottom = Math.max(MARGIN + 28, finite(positioned.height - MARGIN, MARGIN + 28)); for (let day = first; day <= last; day += 1) { const date = fromDay(day); if (weekday(date) === 0 || weekday(date) === 6) { const x = positioned.timelineX + timeCoordinate(date, positioned.startDate, positioned.timescale) * positioned.unitScale + MARGIN; const width = periodWidth(date, positioned.timescale) * positioned.unitScale; if (Number.isFinite(x) && Number.isFinite(width) && width > 0) blocks.push(`<rect x="${x}" y="${MARGIN + 28}" width="${width}" height="${bottom - (MARGIN + 28)}" fill="#f3f4f6"/>`); } } return blocks.join(''); })();
  const groups = positioned.rows.filter((row) => row.kind === 'group').map((row) => `<rect data-group-id="${escapeXml(row.id)}" x="${MARGIN}" y="${row.y}" width="${row.width}" height="${row.height}" fill="#e5e7eb"/><text x="${MARGIN + 8}" y="${row.y + 19}" font-size="13" font-weight="bold">${escapeXml(row.label)}</text>`).join('');
  const labels = positioned.rows.filter((row) => row.kind === 'task').map((row) => `<text data-task-label="${escapeXml(row.id)}" x="${MARGIN + 8}" y="${row.y + 18}" font-size="13">${escapeXml(row.label)}</text>${renderTask({ ...row, x: row.x + MARGIN, y: row.y })}`).join('');
  const edges = positioned.dependencies.map((edge) => `<polyline data-dependency-id="${escapeXml(edge.id)}" points="${polyline(edge.points.map((point) => ({ x: point.x + MARGIN, y: point.y })), width, height)}" fill="none" stroke="#6b7280" stroke-width="1.5" marker-end="url(#gantt-arrow)"/>`).join('');
  const ticks = positioned.ticks.map((tick) => `<line x1="${tick.x + MARGIN}" y1="${MARGIN + 26}" x2="${tick.x + MARGIN}" y2="${positioned.height - MARGIN}" stroke="${tick.major ? '#9ca3af' : '#e5e7eb'}"/><text x="${tick.x + MARGIN + 2}" y="${MARGIN + 18}" font-size="12">${escapeXml(tick.label)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gantt chart from ${escapeXml(positioned.startDate)} to ${escapeXml(positioned.endDate)}" font-family="Aptos, Arial, sans-serif"><defs><marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5 z" fill="#6b7280"/></marker></defs><rect width="100%" height="100%" fill="white"/>${weekendMarkup}${ticks}${groups}${edges}${labels}</svg>`;
}
