#!/usr/bin/env node

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const root = join(scriptDir, '..');
const lockPath = join(root, 'package-lock.json');
const outputPath = process.argv[2]
  ? (isAbsolute(process.argv[2]) ? process.argv[2] : join(root, process.argv[2]))
  : join(root, 'THIRD-PARTY-NOTICES.md');
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
const entries = Object.entries(lock.packages).filter(([path, metadata]) => (
  path && !metadata.link && !path.startsWith('vendor/')
));

async function findLicenseFile(packageDir) {
  if (!existsSync(packageDir)) return null;
  const names = await readdir(packageDir);
  const candidate = names.find((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
  return candidate ? join(packageDir, candidate) : null;
}

function packageName(path, metadata) {
  if (metadata.name) return metadata.name;
  const marker = path.lastIndexOf('node_modules/');
  return marker >= 0 ? path.slice(marker + 'node_modules/'.length) : path;
}

function sourceUrl(repository) {
  if (typeof repository === 'string') return repository;
  if (repository && typeof repository.url === 'string') return repository.url;
  return null;
}

const sections = [];
for (const [path, metadata] of entries.sort(([a], [b]) => a.localeCompare(b))) {
  const name = packageName(path, metadata);
  let packageDir = join(root, path || '.');
  let packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    packageDir = join(root, 'node_modules', name);
    packageJsonPath = join(packageDir, 'package.json');
  }
  let installed = metadata;
  if (existsSync(packageJsonPath)) {
    try { installed = { ...metadata, ...JSON.parse(await readFile(packageJsonPath, 'utf8')) }; } catch {}
  }
  const version = metadata.version ?? installed.version ?? '(version unavailable; lockfile link)';
  const workspacePackage = /^(apps|packages)\//.test(path);
  const license = installed.license ?? metadata.license ?? (workspacePackage ? 'MIT (repository LICENSE)' : 'License metadata unavailable; review the package before redistribution.');
  // Optional native packages differ by runner OS. Use lockfile metadata and the
  // explicit review marker for these entries instead of making notices depend on
  // whichever platform-specific binary happens to be installed locally.
  const platformOptional = metadata.optional && Array.isArray(metadata.os) && metadata.os.length > 0;
  const source = platformOptional
    ? metadata.resolved ?? `https://www.npmjs.com/package/${encodeURIComponent(name)}`
    : sourceUrl(installed.repository) ?? installed.homepage ?? metadata.resolved ?? 'Source URL unavailable in package metadata.';
  const licenseFile = platformOptional ? null : await findLicenseFile(packageDir) ?? (workspacePackage ? join(root, 'LICENSE') : null);
  const text = licenseFile
    ? await readFile(licenseFile, 'utf8')
    : 'No license file was present in the installed package directory. The SPDX/package metadata above is reproduced from package metadata; review the upstream package before redistribution.';
  const normalizedText = text
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/u, ''))
    .join('\n');
  sections.push(`## ${name} ${version}\n\n- License: ${license}\n- Source/repository: ${String(source).replace(/^git\+/, '').replace(/\.git$/, '')}\n- Lockfile path: ~~~${path}~~~\n\n### Applicable license text\n\n<details>\n<summary>License text</summary>\n\n~~~~text\n${normalizedText}\n~~~~\n\n</details>`);
}

const header = `# Third-Party Notices\n\nGenerated from package-lock.json and the installed workspace tree. This file intentionally includes transitive dependencies. Regenerate it after dependency or lockfile changes with node scripts/generate-third-party-notices.mjs.\n\nThe inventory records the exact lockfile version, package-declared license metadata, source/repository metadata where available, and the license file found in the installed package. Platform-specific optional binaries intentionally use lockfile metadata plus an explicit review marker so the inventory is stable across runner operating systems. A package with missing metadata or a missing license file is explicitly marked for manual legal review; that marker is not a license determination.\n\nGenerated package entries: ${sections.length}.\n\n`;
await writeFile(outputPath, header + sections.join('\n\n'), 'utf8');
console.log(`Wrote ${relative(root, outputPath)} with ${sections.length} package entries.`);
