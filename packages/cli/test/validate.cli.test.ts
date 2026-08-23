import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgv } from '../src/args.js';
import { runValidateCommand } from '../src/commands/validate.js';

const fix = (name: string) =>
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);
const cli = (argv: string[]) => parseArgv([...argv, '--json']);

describe('runValidateCommand', () => {
  it('returns exit 0 and metrics for a clean diagram', async () => {
    const result = await runValidateCommand(cli(['validate', fix('clean.bpm')]));
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(true);
    expect(body.errors).toEqual([]);
    expect(body.semanticErrors).toEqual([]);
    expect(body.metrics).toMatchObject({ edgeCrossings: 0, nodeOverlaps: 0, edgeThroughNode: 0 });
  });

  it('accepts an explicit "diagram: bpmn" directive and validates the body behind it', async () => {
    const result = await runValidateCommand(cli(['validate', fix('clean-with-directive.bpm')]));
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(true);
  });

  it('validates a mindmap through the runtime family adapter', async () => {
    const result = await runValidateCommand(cli(['validate', fix('mindmap.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, errors: [], semanticErrors: [] });
  });

  it('validates a flowchart through the runtime family adapter', async () => {
    const result = await runValidateCommand(cli(['validate', fix('flowchart.bpm')]));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, errors: [], semanticErrors: [] });
  });

  it('exposes effective family, direction, lane direction, capabilities, and inspection metadata', async () => {
    const bpmn = JSON.parse((await runValidateCommand(cli(['validate', fix('clean.bpm')]))).stdout);
    expect(bpmn).toMatchObject({ effectiveFamily: 'bpmn', direction: 'right', laneDirection: 'horizontal', capabilities: { pptx: true }, fitMode: null });

    const verticalBpmn = JSON.parse((await runValidateCommand(cli(['validate', fix('bpmn-vertical.bpm')]))).stdout);
    expect(verticalBpmn).toMatchObject({ effectiveFamily: 'bpmn', direction: 'right', laneDirection: 'vertical' });

    const flowchart = JSON.parse((await runValidateCommand(cli(['validate', fix('flowchart.bpm')]))).stdout);
    expect(flowchart).toMatchObject({ effectiveFamily: 'flowchart', direction: 'down', capabilities: { pptx: true } });
    expect(flowchart.inspection).toMatchObject({ contentBounds: expect.any(Object), metrics: expect.any(Object) });

    const mindmap = JSON.parse((await runValidateCommand(cli(['validate', fix('mindmap.bpm')]))).stdout);
    expect(mindmap).toMatchObject({ effectiveFamily: 'mindmap', direction: 'right', capabilities: { pptx: true } });
  });

  it('blocks an unsupported direction with structured corrective diagnostics', async () => {
    const result = await runValidateCommand(cli(['validate', fix('unsupported-direction.bpm')]));
    const body = JSON.parse(result.stdout);
    expect(result.exitCode).toBe(1);
    expect(body).toMatchObject({ valid: false, status: 'blocked', effectiveFamily: 'flowchart', direction: 'down' });
    expect(body.errors[0]).toMatchObject({ code: 'invalid_direction', token: 'sideways' });
    expect(body.correctiveAction).toMatch(/Fix/);
  });

  it('returns structured diagnostics for an invalid mindmap', async () => {
    const result = await runValidateCommand(cli(['validate', fix('mindmap-bad-indent.bpm')]));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: false, errors: [expect.objectContaining({ code: 'bad_indent_step', line: 3 })] });
  });

  it('returns exit 1 and parse errors for bad syntax', async () => {
    const result = await runValidateCommand(cli(['validate', fix('bad-syntax.bpm')]));
    expect(result.exitCode).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('keeps diagnostic line numbers meaningful when a directive line precedes the error', async () => {
    const withoutDirective = await runValidateCommand(cli(['validate', fix('bad-syntax.bpm')]));
    const withDirective = await runValidateCommand(cli(['validate', fix('bad-syntax-with-directive.bpm')]));
    const before = JSON.parse(withoutDirective.stdout);
    const after = JSON.parse(withDirective.stdout);
    // Same offending line ("this is not {{{ valid") shifted down by exactly the one directive line.
    expect(after.errors[0].line).toBe(before.errors[0].line + 1);
  });

  it('returns exit 1 for manual-mode overlap with actionable message', async () => {
    const result = await runValidateCommand(cli(['validate', fix('overlap-manual.bpm')]));
    expect(result.exitCode).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(false);
    expect(body.errors[0].message).toMatch(/overlap at their given positions/);
  });

  it('returns exit 1 with semanticErrors for BPMN legality violations', async () => {
    const illegalFixture = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../parser/test/fixtures/legality/illegal-start-terminate.bpm',
    );
    const result = await runValidateCommand(cli(['validate', illegalFixture]));
    expect(result.exitCode).toBe(1);
    const body = JSON.parse(result.stdout);
    expect(body.valid).toBe(false);
    expect(body.errors).toEqual([]);
    expect(body.semanticErrors.length).toBe(1);
    expect(body.semanticErrors[0]).toMatchObject({ line: 1, column: 1, severity: 'error' });
    expect(body.semanticErrors[0].message).toMatch(/Start event "s1" cannot use trigger "terminate"/);
  });
});
