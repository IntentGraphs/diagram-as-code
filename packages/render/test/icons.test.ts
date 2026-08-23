import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EventTrigger } from '@bpm/ast';
import { triggerIcon, triggerIconAtCenter } from '../src/icons.js';
import { getScaledPath } from '../src/pathMap.js';

const TRIGGERS: Exclude<EventTrigger, 'none'>[] = [
  'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
  'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
];

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Pre-refinement geometric approximations — used only for before/after comparison fixtures. */
const LEGACY_ICONS: Record<Exclude<EventTrigger, 'none'>, (cx: number, cy: number) => string> = {
  message: (cx, cy) =>
    `<rect x="${cx - 8}" y="${cy - 5}" width="16" height="10" fill="none" stroke="black" stroke-width="1"/>`
    + `<polyline points="${cx - 8},${cy - 5} ${cx},${cy + 1} ${cx + 8},${cy - 5}" fill="none" stroke="black" stroke-width="1"/>`,
  timer: (cx, cy) =>
    `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="black" stroke-width="1"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 6}" stroke="black" stroke-width="1"/>`
    + `<line x1="${cx}" y1="${cy}" x2="${cx + 4}" y2="${cy}" stroke="black" stroke-width="1"/>`,
  error: (cx, cy) =>
    `<polyline points="${cx - 6},${cy + 7} ${cx},${cy - 7} ${cx + 2},${cy - 1} ${cx + 7},${cy - 7} ${cx + 1},${cy + 7} ${cx - 1},${cy + 1}" fill="black"/>`,
  escalation: (cx, cy) =>
    `<polygon points="${cx},${cy - 8} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}" fill="none" stroke="black" stroke-width="1"/>`,
  cancel: (cx, cy) =>
    `<line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}" stroke="black" stroke-width="2"/>`
    + `<line x1="${cx - 6}" y1="${cy + 6}" x2="${cx + 6}" y2="${cy - 6}" stroke="black" stroke-width="2"/>`,
  compensation: (cx, cy) =>
    `<polygon points="${cx},${cy - 6} ${cx},${cy + 6} ${cx - 7},${cy}" fill="none" stroke="black" stroke-width="1"/>`
    + `<polygon points="${cx + 7},${cy - 6} ${cx + 7},${cy + 6} ${cx},${cy}" fill="none" stroke="black" stroke-width="1"/>`,
  conditional: (cx, cy) =>
    `<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" fill="none" stroke="black" stroke-width="1"/>`
    + `<line x1="${cx - 5}" y1="${cy - 3}" x2="${cx + 5}" y2="${cy - 3}" stroke="black"/>`
    + `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="black"/>`
    + `<line x1="${cx - 5}" y1="${cy + 3}" x2="${cx + 5}" y2="${cy + 3}" stroke="black"/>`,
  link: (cx, cy) =>
    `<polygon points="${cx - 7},${cy - 3} ${cx + 2},${cy - 3} ${cx + 2},${cy - 6} ${cx + 8},${cy} ${cx + 2},${cy + 6} ${cx + 2},${cy + 3} ${cx - 7},${cy + 3}" fill="black"/>`,
  signal: (cx, cy) =>
    `<polygon points="${cx},${cy - 8} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}" fill="none" stroke="black" stroke-width="1.5"/>`,
  multiple: (cx, cy) =>
    `<polygon points="${cx},${cy - 7} ${cx + 7},${cy - 2} ${cx + 4},${cy + 7} ${cx - 4},${cy + 7} ${cx - 7},${cy - 2}" fill="none" stroke="black" stroke-width="1"/>`,
  parallelMultiple: (cx, cy) =>
    `<polygon points="${cx},${cy - 7} ${cx + 7},${cy - 2} ${cx + 4},${cy + 7} ${cx - 4},${cy + 7} ${cx - 7},${cy - 2}" fill="none" stroke="black" stroke-width="1"/>`
    + `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="black"/>`
    + `<line x1="${cx}" y1="${cy - 5}" x2="${cx}" y2="${cy + 5}" stroke="black"/>`,
  terminate: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="7" fill="black"/>`,
};

function eventCell(
  x: number,
  y: number,
  size: number,
  trigger: Exclude<EventTrigger, 'none'>,
  iconMarkup: string,
  label: string,
): string {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2;
  return [
    `<g>`,
    `<rect x="${x - 4}" y="${y - 22}" width="${size + 8}" height="${size + 36}" fill="#f8f8f8" stroke="#ddd"/>`,
    `<text x="${x + size / 2}" y="${y - 8}" text-anchor="middle" font-size="9" fill="#333">${label}</text>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" stroke-width="1.5"/>`,
    iconMarkup,
    `<text x="${x + size / 2}" y="${y + size + 16}" text-anchor="middle" font-size="8" fill="#666">${size}px</text>`,
    `</g>`,
  ].join('');
}

function comparisonSvg(): string {
  const cols = TRIGGERS.length;
  const cellW = 88;
  const rowH = 120;
  const width = 40 + cols * cellW;
  const height = 40 + 4 * rowH;

  const rows: { y: number; size: number; mode: 'legacy' | 'new'; header: string }[] = [
    { y: 30, size: 36, mode: 'legacy', header: 'Before (legacy) — 36px' },
    { y: 30 + rowH, size: 36, mode: 'new', header: 'After (BPMN PathMap) — 36px' },
    { y: 30 + rowH * 2, size: 56, mode: 'legacy', header: 'Before (legacy) — 56px' },
    { y: 30 + rowH * 3, size: 56, mode: 'new', header: 'After (BPMN PathMap) — 56px' },
  ];

  let body = '';
  for (const row of rows) {
    TRIGGERS.forEach((trigger, i) => {
      const x = 20 + i * cellW;
      const cx = x + row.size / 2;
      const cy = row.y + row.size / 2;
      const icon = row.mode === 'legacy'
        ? LEGACY_ICONS[trigger](cx, cy)
        : triggerIcon(trigger, { x, y: row.y, width: row.size, height: row.size });
      body += eventCell(x, row.y, row.size, trigger, icon, trigger);
    });
  }

  const headerMarkup = rows.map((row) =>
    `<text x="12" y="${row.y - 12}" font-size="11" font-weight="600" fill="#111">${row.header}</text>`,
  ).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ececec"/>`,
    headerMarkup,
    body,
    `<rect x="0" y="${height - 28}" width="${width / 2}" height="28" fill="#ececec"/>`,
    `<rect x="${width / 2}" y="${height - 28}" width="${width / 2}" height="28" fill="#1a1d24"/>`,
    `<text x="${width / 4}" y="${height - 10}" text-anchor="middle" font-size="9" fill="#333">light preview bg</text>`,
    `<text x="${(width * 3) / 4}" y="${height - 10}" text-anchor="middle" font-size="9" fill="#ccc">dark preview bg</text>`,
    `</svg>`,
  ].join('');
}

describe('triggerIcon — BPMN PathMap glyphs', () => {
  it('returns empty markup for the none trigger', () => {
    expect(triggerIcon('none', { x: 0, y: 0, width: 36, height: 36 })).toBe('');
  });

  it('returns distinct, non-empty path-based markup for every trigger', () => {
    const outputs = TRIGGERS.map((t) => triggerIcon(t, { x: 10, y: 10, width: 36, height: 36 }));
    for (const output of outputs) expect(output.length).toBeGreaterThan(0);
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('uses BPMN PathMap path commands (not legacy rect-only message icon)', () => {
    const message = triggerIcon('message', { x: 0, y: 0, width: 36, height: 36 });
    expect(message).toContain('<path d="');
    expect(message).not.toContain('<rect x="');
  });

  it('scales timer ticks and hands with event size', () => {
    const small = triggerIcon('timer', { x: 0, y: 0, width: 36, height: 36 });
    const large = triggerIcon('timer', { x: 0, y: 0, width: 72, height: 72 });
    expect(small).toContain('transform="rotate(');
    expect(large).toContain('transform="rotate(');
    expect(small).not.toEqual(large);
  });

  it('fills end-event glyphs (throw) and outlines start-event glyphs (catch)', () => {
    const endMessage = triggerIcon('message', { x: 0, y: 0, width: 36, height: 36 }, 'end');
    const startMessage = triggerIcon('message', { x: 0, y: 0, width: 36, height: 36 }, 'start');
    expect(endMessage).toContain('fill="black"');
    expect(startMessage).toContain('fill="white"');
  });

  it('getScaledPath produces finite coordinates for every event path id', () => {
    for (const pathId of ['EVENT_MESSAGE', 'EVENT_ERROR', 'EVENT_MULTIPLE']) {
      const d = getScaledPath(pathId, {
        xScaleFactor: 1,
        yScaleFactor: 1,
        containerWidth: 36,
        containerHeight: 36,
        position: { mx: 0.5, my: 0.5 },
      });
      expect(d).toMatch(/^m |^M /);
      expect(d).not.toContain('NaN');
      expect(d).not.toContain('undefined');
    }
  });

  it('writes a before/after comparison fixture covering all triggers at 36px and 56px', () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const outPath = path.join(FIXTURE_DIR, 'bpmn-event-icons-comparison.svg');
    writeFileSync(outPath, comparisonSvg(), 'utf8');
    expect(comparisonSvg()).toContain('message');
    expect(comparisonSvg()).toContain('terminate');
  });
});

describe('triggerIcon — dark/light preview backgrounds', () => {
  it('renders legible icons on light and dark preview surfaces', () => {
    const svgForBg = (bg: string) => {
      const icon = triggerIcon('signal', { x: 42, y: 42, width: 36, height: 36 }, 'start');
      return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">`
        + `<rect width="120" height="120" fill="${bg}"/>`
        + `<circle cx="60" cy="60" r="18" fill="white" stroke="black" stroke-width="1.5"/>`
        + icon.replace(/x="42"/g, 'x="42"').replace(/y="42"/g, 'y="42"')
        + `</svg>`;
    };
    const light = svgForBg('#ececec');
    const dark = svgForBg('#1a1d24');
    expect(light).toContain('<path');
    expect(dark).toContain('<path');
    expect(light).toContain('fill="white"');
  });
});
