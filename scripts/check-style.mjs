#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((file) => /^(apps|packages|scripts|vendor|\.github)\//.test(file) || /^(package|tsconfig|vitest|\.nvmrc)/.test(file));
const textExtensions = /\.(?:ts|mts|mjs|cjs|json|yml|yaml|css|html)$/;
const failures = [];

for (const file of tracked.filter((candidate) => textExtensions.test(candidate))) {
  const contents = await readFile(file, 'utf8');
  if (contents.includes('\r')) failures.push(`${file}: contains CRLF or carriage-return characters`);
  for (const [index, line] of contents.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) failures.push(`${file}:${index + 1}: trailing whitespace`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Style check passed for ${tracked.filter((file) => textExtensions.test(file)).length} authored source/config file(s).`);
}
