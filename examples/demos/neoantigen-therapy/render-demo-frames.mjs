#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '../../..');
const defaultSource = join(dirname(new URL(import.meta.url).pathname), 'neoantigen-therapy-demo.bpm');

const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const sourcePath = resolve(valueAfter('--source', defaultSource));
const outDir = resolve(valueAfter('--out', join(dirname(sourcePath), 'frames')));
const seconds = Number(valueAfter('--seconds-per-step', '4'));
const makeGif = args.includes('--gif');
const makeMp4 = args.includes('--mp4');

if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--seconds-per-step must be positive');

const source = await readFile(sourcePath, 'utf8');
const lines = source.replace(/\r\n?/g, '\n').split('\n');
const poolIndex = lines.findIndex((line) => /^pool\s+"/.test(line));
if (poolIndex < 0) throw new Error('The source must contain a top-level pool');

const directiveLines = lines.slice(0, poolIndex).filter((line) => line.trim() !== '');
const poolLine = lines[poolIndex];
const laneStarts = [];
for (let i = poolIndex + 1; i < lines.length; i += 1) {
  if (/^  lane\s+"/.test(lines[i])) laneStarts.push(i);
}
if (laneStarts.length === 0) throw new Error('The source must contain at least one lane');

const slug = (label) => label
  .replace(/^\s*lane\s+"|".*$/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

await mkdir(outDir, { recursive: true });
await mkdir(join(outDir, 'sources'), { recursive: true });

spawnSync('npm', ['run', '--silent', 'build:cli'], { cwd: repoRoot, stdio: 'inherit' });

const framePaths = [];
for (let laneNumber = 0; laneNumber < laneStarts.length; laneNumber += 1) {
  const start = laneStarts[laneNumber];
  const laneLabel = slug(lines[start]);
  const frameName = `${String(laneNumber + 1).padStart(2, '0')}-${laneLabel}`;
  const frameSource = [
    ...directiveLines,
    poolLine,
    ...laneStarts.slice(0, laneNumber + 1).flatMap((laneStart, index) => {
      const laneEnd = laneStarts[index + 1] ?? lines.length;
      return lines.slice(laneStart, laneEnd);
    }),
  ].join('\n') + '\n';
  const frameSourcePath = join(outDir, 'sources', `${frameName}.bpm`);
  const framePngPath = join(outDir, `${frameName}.png`);
  await writeFile(frameSourcePath, frameSource, 'utf8');

  const render = spawnSync(process.execPath, [
    join(repoRoot, 'packages/cli/dist/bin.js'),
    'render', frameSourcePath, '--format', 'png', '-o', framePngPath,
  ], { cwd: repoRoot, encoding: 'utf8' });
  if (render.status !== 0) {
    process.stderr.write(render.stdout ?? '');
    process.stderr.write(render.stderr ?? '');
    throw new Error(`Failed to render ${frameName}`);
  }
  framePaths.push(framePngPath);
  console.log(`rendered ${frameName}`);
}

// Use a concat list so each cumulative snapshot can have a deliberate hold time and a different
// intrinsic canvas size before the video filter normalizes it to 1280x720.
const concatPath = join(outDir, 'frames.txt');
const gifFps = 12;
const repeatsPerFrame = Math.max(1, Math.round(seconds * gifFps));
const concatEntries = framePaths.flatMap((path) => Array.from(
  { length: repeatsPerFrame },
  () => `file '${path.replaceAll("'", "'\\''")}'\nduration ${1 / gifFps}`,
));
await writeFile(
  concatPath,
  concatEntries.join('\n') + '\n',
  'utf8',
);

const vf = 'scale=1200:680:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black';
if (makeMp4) {
  const output = join(outDir, `${basename(sourcePath, '.bpm')}.mp4`);
  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatPath,
    '-vf', vf, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output,
  ], { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ffmpeg MP4 export failed');
  console.log(`wrote ${output}`);
}
if (makeGif) {
  const output = join(outDir, `${basename(sourcePath, '.bpm')}.gif`);
  const gifArgs = [
    ...framePaths,
    '-resize', '1200x680>',
    '-gravity', 'center',
    '-background', 'black',
    '-extent', '1280x720',
    '-set', 'delay', String(Math.round(seconds * 100)),
    '-loop', '0',
    output,
  ];
  let result = spawnSync('magick', gifArgs, { cwd: repoRoot, stdio: 'inherit' });
  if (result.error) result = spawnSync('convert', gifArgs, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('ImageMagick GIF export failed');
  console.log(`wrote ${output}`);
}

console.log(`wrote ${framePaths.length} cumulative frame(s) to ${outDir}`);
