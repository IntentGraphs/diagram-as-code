import { describe, expect, it } from 'vitest';
import { GANTT_CSV_EXPORT_FORMAT, GANTT_JSON_EXPORT_FORMAT, ganttAdapter, layoutGantt, parseGantt, renderGantt } from '../src/index.js';

const source = `diagram: gantt
calendar: weekdays
group "Discovery" as discovery
  task "Interview <users>" as interviews start 2026-09-01 duration 3d progress 50%
  task "Approve scope" as scope start 2026-09-04 duration 2d
  interviews -> scope lag 1d
task "Build release" as build start 2026-09-08 end 2026-09-18 progress 40%
scope -> build
milestone "Public v1" as release start 2026-09-21
build -> release`;

describe('gantt parser', () => {
  it('parses bounded tasks, groups, milestones, and dependencies', () => {
    const result = parseGantt(source);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.tasks).toHaveLength(4);
    expect(result.ast.groups[0]?.id).toBe('discovery');
    expect(result.ast.tasks[0]).toMatchObject({ start: '2026-09-01', end: '2026-09-03', durationDays: 3, progress: 50 });
    expect(result.ast.tasks[3]).toMatchObject({ milestone: true, start: '2026-09-21' });
    expect(result.ast.tasks[3]?.end).toBeUndefined();
    expect(result.ast.dependencies[0]).toMatchObject({ from: 'interviews', to: 'scope', lagDays: 1 });
  });

  it.each([
    ['task "Bad" as x start 2026-02-30 duration 1d', 'invalid_date'],
    ['task "Bad" as x start 2026-09-01 end 2026-09-02 duration 1d', 'conflicting_schedule'],
    ['task "Bad" as x start 2026-09-01 duration -1d', 'invalid_duration'],
    ['task "Bad" as x start 2026-09-01 duration 1d progress 101%', 'invalid_progress'],
    ['task "A" as a start 2026-09-01 duration 1d\na -> missing', 'unknown_dependency_reference'],
    ['task "A" as a start 2026-09-01 duration 1d\ntask "B" as b start 2026-09-02 duration 1d\na -> b\nb -> a', 'dependency_cycle'],
  ])('rejects %s', (input, code) => expect(parseGantt(input).semanticErrors.map((error) => error.code)).toContain(code));

  it('uses weekday durations without local timezone dependence', () => {
    const result = parseGantt('task "Weekend crossing" as t start 2026-09-04 duration 2d');
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.tasks[0]).toMatchObject({ start: '2026-09-04', end: '2026-09-07' });
  });

  it.each(['fortnightly', 'monthly', 'quarterly', 'half-year', 'half a year'] as const)('accepts %s as a visual calendar alias', (calendar) => {
    const result = parseGantt(`calendar: ${calendar}\ntask "A" as a start 2026-01-01 duration 1d`);
    expect(result.errors).toEqual([]);
    expect(result.semanticErrors).toEqual([]);
    expect(result.ast.timescale).toBe(calendar.startsWith('fortnight') ? 'fortnightly' : calendar.startsWith('month') ? 'monthly' : calendar.startsWith('quarter') ? 'quarterly' : 'halfyear');
  });
});

describe('gantt layout and exports', () => {
  it('routes backward, same-row, and fan-out dependencies with finite points', () => {
    const ast = parseGantt(`task "A" as a start 2026-01-10 duration 2d\ntask "B" as b start 2026-01-01 duration 2d\ntask "C" as c start 2026-01-10 duration 2d\na -> b\na -> c\nb -> c`).ast;
    const positioned = layoutGantt(ast);
    expect(positioned.dependencies).toHaveLength(3);
    for (const dependency of positioned.dependencies) {
      expect(dependency.points.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(dependency)).not.toMatch(/NaN|Infinity/);
      for (const point of dependency.points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(positioned.height);
      }
    }
  });
  it('produces finite deterministic geometry and escaped SVG', async () => {
    const ast = parseGantt(source).ast;
    const first = layoutGantt(ast);
    const second = layoutGantt(ast);
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/NaN|Infinity/);
    const svg = renderGantt(first);
    expect(svg).toContain('&lt;users&gt;');
    expect(svg).toContain('data-task-id="release"');
    expect(svg).toContain('data-dependency-id="d1"');
  });

  it('uses the clamped layout scale for weekend shading', () => {
    const ast = { ...parseGantt('task "Long plan" as plan start 2020-01-01 end 2029-12-29').ast, timescale: 'daily' as const };
    const positioned = layoutGantt(ast);
    const svg = renderGantt(positioned);
    const saturdayOffset = 3;
    const expectedX = positioned.timelineX + saturdayOffset * positioned.dayScale + 20;
    expect(positioned.timelineWidth).toBeLessThan(3_649 * 24);
    expect(svg).toContain(`<rect x="${expectedX}"`);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it.each(['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'halfyear', 'auto'] as const)('supports the %s visual timescale', (timescale) => {
    const ast = { ...parseGantt('task "A" as a start 2026-01-01 duration 120d\ntask "B" as b start 2026-06-30 duration 1d').ast, timescale };
    const positioned = layoutGantt(ast);
    expect(positioned.timescale).toBe(timescale === 'auto' ? 'monthly' : timescale);
    expect(positioned.width).toBeGreaterThan(0);
    expect(positioned.ticks.length).toBeGreaterThan(0);
    expect(JSON.stringify(positioned)).not.toMatch(/NaN|Infinity/);
  });

  it('compresses a six-month plan to a compact monthly timeline without changing task dates', () => {
    const ast = { ...parseGantt('task "A" as a start 2026-09-01 duration 10d\nmilestone "Live" as live start 2027-03-01').ast, timescale: 'monthly' as const };
    const positioned = layoutGantt(ast);
    expect(positioned.timescale).toBe('monthly');
    expect(positioned.timelineWidth).toBeLessThan(500);
    expect(positioned.rows.find((row) => row.id === 'a')).toMatchObject({ start: '2026-09-01', end: '2026-09-14' });
    expect(positioned.ticks.map((tick) => tick.label)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
  });

  it('uses the declared page width to distribute the full date range', () => {
    const ast = { ...parseGantt('task "A" as a start 2026-09-01 duration 10d\nmilestone "Live" as live start 2027-03-01').ast, timescale: 'monthly' as const, page: { width: 13.333, height: 7.5, unit: 'in' as const, fit: 'strict' as const } };
    const positioned = layoutGantt(ast);
    expect(positioned.width).toBeGreaterThan(1200);
    expect(positioned.timelineWidth).toBeGreaterThan(900);
    expect(positioned.ticks[0]?.x).toBe(0);
    expect(positioned.ticks.at(-1)?.x).toBeGreaterThan(800);
  });

  it('routes backward, same-row, and fan-in dependencies with finite points', () => {
    const ast = parseGantt('task "Later" as later start 2026-09-10 duration 2d\ntask "Earlier" as earlier start 2026-09-01 duration 2d\ntask "Same" as same start 2026-09-10 duration 1d\nlater -> earlier\nlater -> same\nearlier -> same').ast;
    const positioned = layoutGantt(ast);
    expect(positioned.dependencies).toHaveLength(3);
    for (const dependency of positioned.dependencies) {
      expect(dependency.points.length).toBeGreaterThanOrEqual(3);
      expect(dependency.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
    }
    expect(positioned.dependencies.find((edge) => edge.from === 'later' && edge.to === 'earlier')?.points[0]?.x)
      .toBeGreaterThan(positioned.dependencies.find((edge) => edge.from === 'later' && edge.to === 'earlier')?.points.at(-1)?.x ?? 0);
  });

  it('exports lossless JSON and intentionally lossy CSV', async () => {
    const ast = parseGantt(source).ast;
    const positioned = await ganttAdapter.layout(ast);
    const json = JSON.parse(ganttAdapter.exportStructured!(ast, positioned, GANTT_JSON_EXPORT_FORMAT));
    const csv = ganttAdapter.exportStructured!(ast, positioned, GANTT_CSV_EXPORT_FORMAT);
    expect(json.tasks).toEqual(ast.tasks);
    expect(csv.split('\n')[0]).toBe('id,label,start,end,durationDays,milestone,progress,group,predecessors');
    expect(csv).toContain('Interview <users>');
    expect(ganttAdapter.capabilities.structuredExports?.map((entry) => entry.fidelity)).toEqual(['lossless', 'lossy']);
  });
});
