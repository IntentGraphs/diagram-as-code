import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'packages/cli/dist/bin.js');
const source = [
  'event start none "Start" as start',
  'task "Review" as review',
  'event end none "End" as end',
  '',
  'start -> review',
  'review -> end',
].join('\n');
const familySources = {
  bpmn: source,
  architecture: readFileSync(resolve(root, 'packages/cli/test/fixtures/architecture.bpm'), 'utf8'),
  flowchart: readFileSync(resolve(root, 'packages/cli/test/fixtures/flowchart.bpm'), 'utf8'),
  mindmap: readFileSync(resolve(root, 'packages/cli/test/fixtures/mindmap.bpm'), 'utf8'),
  gantt: readFileSync(resolve(root, 'examples/gantt/release-plan.bpm'), 'utf8'),
  dfd: readFileSync(resolve(root, 'packages/cli/test/fixtures/dfd.bpm'), 'utf8'),
};

const requests = [
  { jsonrpc: '2.0', id: 0, method: 'tools/list' },
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'mcp-e2e', version: '1' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'capabilities', arguments: {} } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'validate', arguments: { source } } },
  ...Object.values(familySources).slice(1).map((familySource, index) => ({ jsonrpc: '2.0', id: 5 + index, method: 'tools/call', params: { name: 'validate', arguments: { source: familySource } } })),
  { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'render', arguments: { source } } },
  { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'generate', arguments: { description: 'Review an order' } } },
  { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'freeze', arguments: { source } } },
  { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'validate', arguments: { source: 42 } } },
  { jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'does-not-exist', arguments: {} } },
  { jsonrpc: '2.0', id: 15, method: 'unknown/method' },
];

const child = spawn(process.execPath, [cli, 'mcp'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
const stdout = [];
const stderr = [];
child.stdout.on('data', (chunk) => stdout.push(chunk));
child.stderr.on('data', (chunk) => stderr.push(chunk));
child.stdin.end(requests.map((request) => JSON.stringify(request)).join('\n') + '\n{"jsonrpc":\n');

const exitCode = await new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', resolveExit);
});

const output = Buffer.concat(stdout).toString('utf8').trim();
const errorOutput = Buffer.concat(stderr).toString('utf8');
if (exitCode !== 0) throw new Error(`bpm mcp exited with ${exitCode}: ${errorOutput}`);
if (errorOutput.split('\n').some((line) => line.trim().startsWith('{'))) {
  throw new Error(`bpm mcp leaked protocol-looking JSON to stderr: ${errorOutput}`);
}

const responses = output.split('\n').map((line) => JSON.parse(line));
if (responses.length !== 17) throw new Error(`expected 17 responses, received ${responses.length}`);
if (responses.some((response) => response.jsonrpc !== '2.0')) throw new Error('response missing JSON-RPC 2.0 envelope');
if (responses[0].id !== 0 || responses[0].error?.code !== -32002) throw new Error('pre-initialize request was not rejected');
if (responses[1].id !== 1 || responses[1].result.protocolVersion !== '2025-11-25') throw new Error('initialize negotiation failed');

const tools = responses[2].result.tools.map((tool) => tool.name);
const expectedTools = ['capabilities', 'validate', 'render', 'inspect', 'generate', 'freeze', 'export'];
if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) throw new Error(`unexpected tools: ${tools.join(', ')}`);

const payload = (response) => response.result.structuredContent;
if (payload(responses[3]).families.length !== 6 || !payload(responses[3]).families.some((family) => family.id === 'dfd')) throw new Error('capabilities registry is incomplete');
if (payload(responses[4]).valid !== true || payload(responses[4]).metrics?.nodeOverlaps !== 0) throw new Error('BPMN validate tool failed');
for (let index = 5; index <= 9; index += 1) {
  if (payload(responses[index]).valid !== true) throw new Error(`family validate tool failed at response ${index}`);
}
if (payload(responses[10]).valid !== true || !payload(responses[10]).svg?.startsWith('<svg')) throw new Error('render tool failed');
if (payload(responses[11]).persisted !== false || payload(responses[11]).validation?.valid !== true) throw new Error('generate wrote or returned an invalid draft');
if (payload(responses[12]).persisted !== false || payload(responses[12]).validation?.valid !== true) throw new Error('freeze wrote or returned an invalid draft');
if (responses[13].result.isError !== true || payload(responses[13]).error?.code !== 'invalid_input') throw new Error('invalid input was not contained as a tool error');
if (responses[14].error?.code !== -32602 || responses[15].error?.code !== -32601) throw new Error('unknown tool/method errors were not returned');
if (responses[16].id !== null || responses[16].error?.code !== -32700) throw new Error('malformed JSON was not reported as a parse error');

// Keep this script self-describing in failure output without importing source modules.
const packageJson = JSON.parse(readFileSync(resolve(root, 'packages/mcp/package.json'), 'utf8'));
console.log(`MCP E2E passed for @bpm/mcp ${packageJson.version}: ${responses.length} protocol responses, ${tools.length} tools, ${Object.keys(familySources).length} families`);
