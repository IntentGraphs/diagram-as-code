import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgv } from '../src/args.js';
import { runFixCommand } from '../src/commands/review.js';
import { registerProvider } from '@bpm/review';
import type { ReviewProvider } from '@bpm/review';

const fixture = (name: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

const scripted: ReviewProvider = {
  id: 'scripted-fix-cli',
  async review() { return []; },
  async repair(bundle) {
    return bundle.text.includes('bogus')
      ? [{ severity: 'error', category: 'other', message: 'replace invalid keyword', source: 'model' as const, patch: { find: 'bogus "Review" as b', replace: 'task "Review" as b' } }]
      : [];
  },
};

registerProvider(scripted);

describe('bpm fix', () => {
  it('writes a repaired copy and leaves the source unchanged', async () => {
    const input = fixture('repairable.bpm');
    const output = '/tmp/bpm-fix-cli-output.bpm';
    if (existsSync(output)) rmSync(output);
    const before = readFileSync(input, 'utf8');
    const result = await runFixCommand(parseArgv(['fix', input, '--provider', scripted.id, '--output', output, '--json']));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ fix: { status: 'valid' }, output: { generated: true, path: output } });
    expect(readFileSync(output, 'utf8')).toContain('task "Review" as b');
    expect(readFileSync(input, 'utf8')).toBe(before);
    rmSync(output);
  });

  it('requires an explicit output path', async () => {
    const result = await runFixCommand(parseArgv(['fix', fixture('clean.bpm')]));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/requires -o/);
  });
});

