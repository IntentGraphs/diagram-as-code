import { escapeXml } from './xml.js';

/** Rough average glyph width for the font-sizes used across this renderer (sans-serif). */
const CHAR_WIDTH_FACTOR = 0.58;
const DEFAULT_MAX_LINES = 3;

export interface LabelMetrics {
  lines: string[];
  width: number;
  height: number;
  lineHeight: number;
}

function estimateCharsPerLine(maxWidthPx: number, fontSize: number): number {
  return Math.max(1, Math.floor(maxWidthPx / (fontSize * CHAR_WIDTH_FACTOR)));
}

/** Greedy word-wrap. A single word longer than one line is hard-broken rather than overflowing. */
export function wrapLabel(label: string, maxWidthPx: number, fontSize: number, maxLines = DEFAULT_MAX_LINES): string[] {
  const maxChars = estimateCharsPerLine(maxWidthPx, fontSize);
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= maxChars) {
      current = word;
    } else {
      let remaining = word;
      while (remaining.length > maxChars) {
        lines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
      current = remaining;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return [''];

  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    const last = truncated[maxLines - 1];
    truncated[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}...` : '...';
    return truncated;
  }
  return lines;
}

/** The deterministic text contract shared by layout and SVG rendering. */
export function measureLabel(label: string, maxWidthPx: number, fontSize = 12, maxLines = DEFAULT_MAX_LINES): LabelMetrics {
  const lines = wrapLabel(label, maxWidthPx, fontSize, maxLines);
  const lineHeight = fontSize * 1.25;
  const width = Math.max(0, ...lines.map((line) => line.length * fontSize * CHAR_WIDTH_FACTOR));
  return { lines, width, height: lines.length * lineHeight, lineHeight };
}

/** Multi-line label vertically centered on `centerY`, each line centered on `centerX`. */
export function wrappedTextCentered(
  centerX: number,
  centerY: number,
  maxWidthPx: number,
  label: string,
  fontSize = 12,
  maxLines = DEFAULT_MAX_LINES,
): string {
  const { lines, lineHeight } = measureLabel(label, maxWidthPx, fontSize, maxLines);
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, index) => `<tspan x="${centerX}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}">${tspans}</text>`;
}

/** Multi-line label growing downward from `topY`, each line centered on `centerX`. */
export function wrappedTextBelow(
  centerX: number,
  topY: number,
  maxWidthPx: number,
  label: string,
  fontSize = 12,
  maxLines = DEFAULT_MAX_LINES,
): string {
  const { lines, lineHeight } = measureLabel(label, maxWidthPx, fontSize, maxLines);
  const halos = lines
    .map((line, index) => {
      const y = topY + index * lineHeight;
      const haloWidth = Math.max(16, line.length * fontSize * CHAR_WIDTH_FACTOR + 4);
      return `<rect x="${centerX - haloWidth / 2}" y="${y - fontSize}" width="${haloWidth}" height="${fontSize * 1.15}" fill="white" opacity="0.85"/>`;
    })
    .join('');
  const tspans = lines
    .map((line, index) => `<tspan x="${centerX}" y="${topY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `${halos}<text text-anchor="middle" font-size="${fontSize}">${tspans}</text>`;
}
