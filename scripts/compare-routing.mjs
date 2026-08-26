import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');
const outputDir = resolve(process.argv[2] ?? '/tmp/diagram-routing-comparison');
const files = process.argv.slice(3).map((file) => resolve(file));

if (files.length === 0) {
  console.error('Usage: node scripts/compare-routing.mjs <output-dir> <file.bpm> [...files]');
  process.exit(2);
}

await mkdir(outputDir, { recursive: true });

function runCli(args, input) {
  const result = spawnSync(process.execPath, ['packages/cli/dist/bin.js', ...args], {
    cwd: repoRoot,
    input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `CLI failed with ${result.status}`);
  return JSON.parse(result.stdout);
}

function experimentalSource(source) {
  const lines = source.split(/\r?\n/);
  if (lines.some((line) => /^\s*diagram:\s*/i.test(line))) return source;
  const routingIndex = lines.findIndex((line) => /^\s*routing:\s*/i.test(line));
  if (routingIndex >= 0) lines[routingIndex] = 'routing: experimental';
  else lines.splice(0, 0, 'routing: experimental');
  return lines.join('\n');
}

function qualitySource(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !/^\s*routing:\s*experimental\s*$/i.test(line))
    .join('\n');
}

const report = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const stem = basename(file).replace(/\.[^.]+$/, '');
  const quality = runCli(['validate', '-', '--json'], qualitySource(source));
  const experimental = runCli(['validate', '-', '--json'], experimentalSource(source));
  const qualitySvg = resolve(outputDir, `${stem}.quality.svg`);
  const experimentalSvg = resolve(outputDir, `${stem}.experimental.svg`);
  runCli(['render', '-', '--format', 'svg', '-o', qualitySvg, '--json'], qualitySource(source));
  runCli(['render', '-', '--format', 'svg', '-o', experimentalSvg, '--json'], experimentalSource(source));
  report.push({
    file,
    quality: quality.metrics,
    experimental: experimental.metrics,
    qualitySvg,
    experimentalSvg,
  });
}

const reportPath = resolve(outputDir, 'report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputDir, report: reportPath, diagrams: report }, null, 2));
