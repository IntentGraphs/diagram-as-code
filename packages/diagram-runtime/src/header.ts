import { DIAGRAM_FAMILIES, type DiagramDiagnostic, type DiagramFamilyId, type DiagramHeader, type RenderMode } from './types.js';
import type { DiagramDirection, LaneDirection } from '@bpm/ast';
import { GANTT_TIMESCALES, normalizeGanttTimescale, parseFitDirective, parsePageDirective, type GanttTimescale, type PageFit, type PageSpec } from '@bpm/diagram-core';
import type { PageBreakStrategy, PaginationMode } from '@bpm/ast';

const DIRECTIVE_LINE = /^diagram:\s*(\S+)\s*$/;
const DIRECTIVE_PREFIX = /^diagram:/;
const DIRECTION_LINE = /^direction:\s*(\S+)\s*$/i;
const LANE_DIRECTION_LINE = /^laneDirection:\s*(\S+)\s*$/i;
const PAGINATE_LINE = /^paginate:\s*(\S+)\s*$/i;
const PAGE_BREAK_LINE = /^pageBreak:\s*(\S+)\s*$/i;
const DIRECTIONS = ['right', 'left', 'down', 'up'] as const;
const LANE_DIRECTIONS = ['horizontal', 'vertical'] as const;

function isFamily(value: string): value is DiagramFamilyId {
  return (DIAGRAM_FAMILIES as readonly string[]).includes(value);
}

function parseRenderDirective(value: string): RenderMode | null {
  const match = value.match(/^render:\s*(auto|manual)\s*$/i);
  return match ? match[1].toLowerCase() as RenderMode : null;
}

function diagnostic(
  line: number,
  message: string,
  extras: Omit<DiagramDiagnostic, 'line' | 'column' | 'message'> = {},
): DiagramDiagnostic {
  return { line, column: 1, message, ...extras };
}

function lineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    offsets.push(offset);
    offset += lines[index].length;
    if (index < lines.length - 1) offset += 1;
  }
  if (lines.length === 0) offsets.push(0);
  return offsets;
}

/**
 * Reads the optional family selector without becoming a family parser. A missing selector
 * intentionally means BPMN for backwards compatibility with every existing .bpm source file.
 */
export function readDiagramHeader(source: string): DiagramHeader {
  const lines = source.split('\n');
  const offsets = lineOffsets(lines);
  const firstContentIndex = lines.findIndex((line) => line.trim() !== '');
  const diagnostics: DiagramDiagnostic[] = [];
  let family: DiagramFamilyId = 'bpmn';
  let directiveIndex: number | undefined;
  let directiveFamily: string | undefined;
  let page: PageSpec | undefined;
  let pageLine: number | undefined;
  let fit: PageFit | undefined;
  let fitLine: number | undefined;
  let renderMode: RenderMode | undefined;
  let renderLine: number | undefined;
  let direction: DiagramDirection | undefined;
  let laneDirection: LaneDirection | undefined;
  let directionSpecified = false;
  let laneDirectionSpecified = false;
  let paginate: PaginationMode = 'none';
  let paginateLine: number | undefined;
  let pageBreak: PageBreakStrategy | undefined;
  let pageBreakLine: number | undefined;
  let directionDirectiveLine = 1;
  let timescale: GanttTimescale | undefined;
  let timescaleLine: number | undefined;
  const removedDirectiveIndexes = new Set<number>();

  if (firstContentIndex !== -1) {
    const firstLine = lines[firstContentIndex].trim();
    const match = firstLine.match(DIRECTIVE_LINE);
    if (match) {
      directiveIndex = firstContentIndex;
      removedDirectiveIndexes.add(firstContentIndex);
      const value = match[1].trim();
      directiveFamily = value;
      if (isFamily(value)) {
        family = value;
      } else {
        diagnostics.push(diagnostic(
          firstContentIndex + 1,
          `Unknown diagram family "${value}" (expected ${DIAGRAM_FAMILIES.join(', ')})`,
          { code: 'unknown_family', token: value, supportedFamilies: [...DIAGRAM_FAMILIES] },
        ));
      }
    } else if (DIRECTIVE_PREFIX.test(firstLine)) {
      directiveIndex = firstContentIndex;
      diagnostics.push(diagnostic(
        firstContentIndex + 1,
        'Malformed diagram directive; expected "diagram: <family>"',
        { code: 'malformed_directive', supportedFamilies: [...DIAGRAM_FAMILIES] },
      ));
    }
  }

  // Page directives are family-neutral and are removed before family-specific parsers run.
  // They may appear alongside the family selector or in the leading preamble, but never
  // become ordinary diagram declarations.
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith('page:')) {
      removedDirectiveIndexes.add(index);
      const parsed = parsePageDirective(trimmed);
      if (!parsed) {
        diagnostics.push(diagnostic(index + 1, 'Malformed page directive; expected "page: <width><unit> x <height><unit>"', { code: 'malformed_page' }));
      } else if (pageLine !== undefined) {
        diagnostics.push(diagnostic(index + 1, 'Only one page directive is allowed', { code: 'duplicate_page' }));
      } else {
        page = parsed;
        pageLine = index + 1;
      }
      continue;
    }
    if (trimmed.startsWith('fit:')) {
      removedDirectiveIndexes.add(index);
      const parsed = parseFitDirective(trimmed);
      if (!parsed) {
        diagnostics.push(diagnostic(index + 1, 'Malformed fit directive; expected "fit: contain" or "fit: strict"', { code: 'malformed_fit' }));
      } else if (fitLine !== undefined) {
        diagnostics.push(diagnostic(index + 1, 'Only one fit directive is allowed', { code: 'duplicate_fit' }));
      } else {
        fit = parsed;
        fitLine = index + 1;
      }
      continue;
    }
    if (trimmed.startsWith('render:')) {
      removedDirectiveIndexes.add(index);
      const parsed = parseRenderDirective(trimmed);
      if (!parsed) {
        diagnostics.push(diagnostic(index + 1, 'Malformed render directive; expected "render: auto" or "render: manual"', { code: 'malformed_render' }));
      } else if (renderLine !== undefined) {
        diagnostics.push(diagnostic(index + 1, 'Only one render directive is allowed', { code: 'duplicate_render' }));
      } else {
        renderMode = parsed;
        renderLine = index + 1;
      }
      continue;
    }
    const paginateMatch = trimmed.match(PAGINATE_LINE);
    if (paginateMatch) {
      removedDirectiveIndexes.add(index);
      const value = paginateMatch[1].toLowerCase();
      if (!(['none', 'semantic', 'tile', 'hybrid'] as const).includes(value as PaginationMode)) diagnostics.push(diagnostic(index + 1, 'Malformed paginate directive; expected "paginate: none", "paginate: semantic", "paginate: tile", or "paginate: hybrid"', { code: 'malformed_paginate', token: paginateMatch[1] }));
      else if (paginateLine !== undefined) diagnostics.push(diagnostic(index + 1, 'Only one paginate directive is allowed', { code: 'duplicate_paginate', token: value }));
      else { paginate = value as PaginationMode; paginateLine = index + 1; }
      continue;
    }
    const pageBreakMatch = trimmed.match(PAGE_BREAK_LINE);
    if (pageBreakMatch) {
      removedDirectiveIndexes.add(index);
      const value = pageBreakMatch[1].toLowerCase();
      if (!(['pool', 'lane', 'group', 'branch'] as const).includes(value as PageBreakStrategy)) diagnostics.push(diagnostic(index + 1, 'Malformed pageBreak directive; expected "pageBreak: pool", "pageBreak: lane", "pageBreak: group", or "pageBreak: branch"', { code: 'malformed_page_break', token: pageBreakMatch[1] }));
      else if (pageBreakLine !== undefined) diagnostics.push(diagnostic(index + 1, 'Only one pageBreak directive is allowed', { code: 'duplicate_page_break', token: value }));
      else { pageBreak = value as PageBreakStrategy; pageBreakLine = index + 1; }
      continue;
    }
    if (trimmed.startsWith('timescale:')) {
      removedDirectiveIndexes.add(index);
      const rawValue = trimmed.slice('timescale:'.length).trim();
      const value = normalizeGanttTimescale(rawValue);
      if (!value) {
        diagnostics.push(diagnostic(index + 1, `Malformed timescale directive; expected one of ${GANTT_TIMESCALES.join(', ')}`, { code: 'malformed_timescale', token: rawValue }));
      } else if (family !== 'gantt') {
        diagnostics.push(diagnostic(index + 1, 'The timescale directive is only supported for diagram: gantt', { code: 'timescale_wrong_family', token: value }));
      } else if (timescaleLine !== undefined) {
        diagnostics.push(diagnostic(index + 1, 'Only one timescale directive is allowed', { code: 'duplicate_timescale', token: value }));
      } else {
        timescale = value;
        timescaleLine = index + 1;
      }
    }
    const directionMatch = trimmed.match(DIRECTION_LINE);
    if (directionMatch) {
      removedDirectiveIndexes.add(index);
      const value = directionMatch[1].toLowerCase();
      if (!(DIRECTIONS as readonly string[]).includes(value)) diagnostics.push(diagnostic(index + 1, `Unknown direction "${directionMatch[1]}" (expected right, left, down, or up)`, { code: 'invalid_direction', token: directionMatch[1] }));
      else if (direction !== undefined) diagnostics.push(diagnostic(index + 1, 'Only one direction directive is allowed', { code: 'duplicate_direction', token: value }));
      else { direction = value as DiagramDirection; directionSpecified = true; directionDirectiveLine = index + 1; }
      continue;
    }
    const laneDirectionMatch = trimmed.match(LANE_DIRECTION_LINE);
    if (laneDirectionMatch) {
      removedDirectiveIndexes.add(index);
      const value = laneDirectionMatch[1].toLowerCase();
      if (!(LANE_DIRECTIONS as readonly string[]).includes(value)) diagnostics.push(diagnostic(index + 1, `Unknown laneDirection "${laneDirectionMatch[1]}" (expected horizontal or vertical)`, { code: 'invalid_lane_direction', token: laneDirectionMatch[1] }));
      else if (family !== 'bpmn') diagnostics.push(diagnostic(index + 1, 'The laneDirection directive is only supported for BPMN diagrams', { code: 'lane_direction_wrong_family', token: value, supportedFamilies: ['bpmn'] }));
      else if (laneDirection !== undefined) diagnostics.push(diagnostic(index + 1, 'Only one laneDirection directive is allowed', { code: 'duplicate_lane_direction', token: value }));
      else { laneDirection = value as LaneDirection; laneDirectionSpecified = true; }
      continue;
    }
  }
  if (fit && !page) {
    diagnostics.push(diagnostic(fitLine ?? 1, 'A fit directive requires a page directive', { code: 'fit_without_page' }));
  }
  if (pageBreak && (paginate === 'none' || paginate === 'tile')) {
    diagnostics.push(diagnostic(pageBreakLine ?? 1, `pageBreak: ${pageBreak} is not supported with paginate: ${paginate}; use paginate: semantic`, { code: 'unsupported_pagination_combination', token: pageBreak, severity: 'error' }));
  }
  if (paginate === 'tile' || paginate === 'hybrid') {
    diagnostics.push(diagnostic(paginateLine ?? 1, `Pagination mode "${paginate}" is not supported; use paginate: semantic`, { code: 'pagination_unsupported_combination', token: paginate, severity: 'error' }));
  }
  if (pageBreak === 'group' || pageBreak === 'branch') {
    diagnostics.push(diagnostic(pageBreakLine ?? 1, `pageBreak: ${pageBreak} is not supported; use pageBreak: pool or pageBreak: lane`, { code: 'pagination_unsupported_combination', token: pageBreak, severity: 'error' }));
  }
  if (page && fit) page = { ...page, fit };

  if (direction === undefined) {
    direction = family === 'flowchart' ? 'down' : 'right';
  }
  if (family === 'bpmn' && laneDirection === undefined) laneDirection = 'horizontal';

  if (directionSpecified && directiveFamily && isFamily(directiveFamily)) {
    const supported = family === 'flowchart' || family === 'mindmap' || (family === 'bpmn' && direction === 'right');
    if (!supported) {
      diagnostics.push(diagnostic(
        directionDirectiveLine,
        `Direction "${direction}" is not supported for diagram family "${family}"; use a supported direction or choose flowchart/mindmap`,
        { code: 'unsupported_direction', token: direction, supportedFamilies: ['bpmn', 'flowchart', 'mindmap'] },
      ));
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!DIRECTIVE_PREFIX.test(trimmed)) continue;
    if (directiveIndex === undefined || index < directiveIndex || index !== directiveIndex) {
      const match = trimmed.match(DIRECTIVE_LINE);
      diagnostics.push(diagnostic(
        index + 1,
        directiveIndex === undefined
          ? 'The diagram directive must be the first non-blank line'
          : 'Only one diagram directive is allowed, and it must be the first non-blank line',
        {
          code: directiveIndex === undefined ? 'late_directive' : 'duplicate_directive',
          token: match?.[1]?.trim(),
          supportedFamilies: [...DIAGRAM_FAMILIES],
        },
      ));
    }
  }

  const sourceWithoutDirective = removedDirectiveIndexes.size === 0
    ? source
    : lines.map((line, index) => removedDirectiveIndexes.has(index) ? '' : line).join('\n');
  const bodyLines = sourceWithoutDirective.split('\n');
  const firstBodyIndex = bodyLines.findIndex((line) => line.trim() !== '');
  const bodyLine = firstBodyIndex === -1
    ? (directiveIndex === undefined ? 1 : directiveIndex + 2)
    : firstBodyIndex + 1;
  const bodyOffset = firstBodyIndex === -1
    ? source.length
    : offsets[Math.min(firstBodyIndex, offsets.length - 1)] ?? 0;

  return {
    family,
    sourceWithoutDirective,
    ...(directiveIndex === undefined ? {} : { directiveLine: directiveIndex + 1 }),
    ...(directiveFamily === undefined ? {} : { directiveFamily }),
    bodyLine,
    bodyOffset,
    ...(page ? { page } : {}),
    paginate,
    ...(pageBreak ? { pageBreak } : {}),
    ...(timescale ? { timescale } : {}),
    ...(renderMode ? { renderMode } : {}),
    ...(direction ? { direction } : {}),
    ...(laneDirection ? { laneDirection } : {}),
    ...(directionSpecified ? { directionSpecified } : {}),
    ...(laneDirectionSpecified ? { laneDirectionSpecified } : {}),
    diagnostics,
  };
}
