import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const workspaces = new Map();

for (const workspaceRoot of ['packages', 'apps']) {
  const entries = await readdir(join(root, workspaceRoot), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(root, workspaceRoot, entry.name, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
      workspaces.set(packageJson.name, {
        packageJson,
        dependencies: Object.keys(packageJson.dependencies ?? {}).filter((name) => workspaces.has(name)),
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

// Discovery must finish before dependency edges are resolved because directory order is not
// a build contract. This mirrors the root build's clean-checkout behavior, scoped to the CLI.
for (const workspace of workspaces.values()) {
  workspace.dependencies = Object.keys(workspace.packageJson.dependencies ?? {}).filter((name) => workspaces.has(name));
}

const required = new Set();
function collect(name) {
  if (required.has(name)) return;
  const workspace = workspaces.get(name);
  if (!workspace) throw new Error(`CLI build dependency is not a workspace: ${name}`);
  required.add(name);
  for (const dependency of workspace.dependencies) collect(dependency);
}
collect('@bpm/cli');

const visiting = new Set();
const visited = new Set();
const order = [];
function visit(name) {
  if (!required.has(name) || visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Circular CLI build dependency involving ${name}`);
  visiting.add(name);
  for (const dependency of workspaces.get(name).dependencies) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  if (typeof workspaces.get(name).packageJson.scripts?.build === 'string') order.push(name);
}
visit('@bpm/cli');

console.error(`Building CLI dependency closure (${order.length} workspace(s)):`);
console.error(order.join(' → '));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const name of order) {
  const result = spawnSync(npm, ['run', 'build', '--workspace', name], { cwd: root, stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
