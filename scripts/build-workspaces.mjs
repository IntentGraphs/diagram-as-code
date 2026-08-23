import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const workspaceRoots = ['packages', 'apps'];
const workspaces = new Map();

for (const workspaceRoot of workspaceRoots) {
  const entries = await readdir(join(root, workspaceRoot), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageFile = join(root, workspaceRoot, entry.name, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(packageFile, 'utf8'));
      workspaces.set(packageJson.name, {
        packageJson,
        hasBuild: typeof packageJson.scripts?.build === 'string',
        dependencies: [],
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

// Resolve after discovery so package directory order cannot accidentally decide
// whether a clean checkout builds successfully.
for (const workspace of workspaces.values()) {
  workspace.dependencies = Object.keys(workspace.packageJson.dependencies ?? {})
    .filter((name) => workspaces.has(name));
}

const visiting = new Set();
const visited = new Set();
const order = [];

function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Circular production build dependency involving ${name}`);
  visiting.add(name);
  for (const dependency of workspaces.get(name).dependencies) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  if (workspaces.get(name).hasBuild) order.push(name);
}

for (const name of [...workspaces.keys()].sort()) visit(name);

console.log(`Building ${order.length} workspace(s) in dependency order:`);
console.log(order.join(' → '));

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const name of order) {
  const result = spawnSync(npm, ['run', 'build', '--workspace', name], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
