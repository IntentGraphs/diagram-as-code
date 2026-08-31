import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMcpRequestHandler, MCP_PROTOCOL_VERSION, runStdioServer } from '../src/index.js';

const source = [
  'event start none "Start" as start',
  'task "Review" as review',
  'event end none "End" as end',
  '',
  'start -> review',
  'review -> end',
].join('\n');

async function initializedHandler() {
  const handler = createMcpRequestHandler();
  const response = await handler({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'test-client', version: '1.0.0' } },
  });
  expect(response).toMatchObject({ result: { protocolVersion: MCP_PROTOCOL_VERSION } });
  await handler({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return handler;
}

function toolPayload(response: unknown): Record<string, unknown> {
  return (response as { result: { structuredContent: Record<string, unknown> } }).result.structuredContent;
}

describe('@bpm/mcp request handler', () => {
  it('initializes with MCP capabilities and negotiates a supported older version', async () => {
    const handler = createMcpRequestHandler({ name: 'test-server', version: '1.2.3' });
    const response = await handler({
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'client', version: '1' } },
    });
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'init',
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'test-server', version: '1.2.3' },
      },
    });
  });

  it('lists every tool with bounded schemas and explicit read/write annotations', async () => {
    const handler = await initializedHandler();
    const response = await handler({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (response as { result: { tools: Array<Record<string, unknown>> } }).result.tools;
    expect(tools.map((tool) => tool.name)).toEqual(['capabilities', 'validate', 'render', 'inspect', 'generate', 'freeze', 'export']);
    expect(tools.find((tool) => tool.name === 'validate')).toMatchObject({ annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } });
    expect(tools.find((tool) => tool.name === 'generate')).toMatchObject({ annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } });
    expect((tools.find((tool) => tool.name === 'validate')?.inputSchema as Record<string, unknown>).additionalProperties).toBe(false);
    expect((tools.find((tool) => tool.name === 'export')?.inputSchema as Record<string, unknown>).required).toEqual(['source', 'format']);
  });

  it('successfully calls capabilities, validate, render, inspect, generate, freeze, and export', async () => {
    const handler = await initializedHandler();

    const capabilities = await handler({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'capabilities', arguments: {} } });
    expect(toolPayload(capabilities)).toMatchObject({ exportFormats: expect.arrayContaining(['bpmn-xml']), families: expect.arrayContaining([expect.objectContaining({ id: 'bpmn' })]) });

    const validation = await handler({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'validate', arguments: { source } } });
    expect(toolPayload(validation)).toMatchObject({ valid: true, metadata: { family: 'bpmn' }, inspection: expect.objectContaining({ nodes: expect.any(Array) }) });

    const rendered = await handler({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'render', arguments: { source } } });
    expect(toolPayload(rendered)).toMatchObject({ valid: true, svg: expect.stringContaining('<svg'), diagnostics: [], warnings: expect.any(Array) });

    const inspected = await handler({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'inspect', arguments: { source } } });
    expect(toolPayload(inspected)).toMatchObject({ valid: true, inspection: expect.objectContaining({ edges: expect.any(Array), metrics: expect.any(Object) }) });

    const generated = await handler({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'generate', arguments: { description: 'Review an order' } } });
    expect(toolPayload(generated)).toMatchObject({ writeIntent: true, persisted: false, draft: expect.stringContaining('task'), validation: { valid: true } });

    const frozen = await handler({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'freeze', arguments: { source } } });
    expect(toolPayload(frozen)).toMatchObject({ writeIntent: true, persisted: false, valid: true, frozen: expect.stringContaining('positioning: manual'), validation: { valid: true } });

    const exported = await handler({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'export', arguments: { source, format: 'bpmn-xml' } } });
    expect(toolPayload(exported)).toMatchObject({ valid: true, format: 'bpmn-xml', artifact: expect.stringContaining('<?xml'), diagnostics: [] });
  });

  it('returns structured tool errors for invalid input while preserving the MCP envelope', async () => {
    const handler = await initializedHandler();
    const response = await handler({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'validate', arguments: { source: 42 } } });
    expect(response).toMatchObject({ jsonrpc: '2.0', id: 10, result: { isError: true, structuredContent: { error: { code: 'invalid_input' } } } });

    const unknownMethod = await handler({ jsonrpc: '2.0', id: 12, method: 'does/not-exist' });
    expect(unknownMethod).toMatchObject({ error: { code: -32601 } });
    const unknownTool = await handler({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'does-not-exist', arguments: {} } });
    expect(unknownTool).toMatchObject({ error: { code: -32602 } });
  });

  it('does not invoke filesystem writes for any write-intent or read tool', async () => {
    const handler = await initializedHandler();
    const generated = await handler({ jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'generate', arguments: { description: 'Review an order' } } });
    const frozen = await handler({ jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'freeze', arguments: { source } } });
    const exported = await handler({ jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'export', arguments: { source, format: 'bpmn-xml' } } });
    const rendered = await handler({ jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'render', arguments: { source } } });
    expect(toolPayload(generated)).toMatchObject({ persisted: false });
    expect(toolPayload(frozen)).toMatchObject({ persisted: false });
    expect(toolPayload(exported)).not.toHaveProperty('path');
    expect(toolPayload(rendered)).not.toHaveProperty('path');
    const implementation = [
      readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/stdio.ts', import.meta.url), 'utf8'),
    ].join('\n');
    expect(implementation).not.toMatch(/node:fs|writeFile|appendFile|mkdir|rename|unlink/);
  });
});

describe('@bpm/mcp stdio runner', () => {
  it('keeps stdout protocol-only and handles newline-delimited JSON-RPC', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk));
    const run = runStdioServer(input, output);
    input.end([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'stdio-test', version: '1' } } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'validate', arguments: { source } } }),
    ].join('\n'));
    await run;
    const responses = Buffer.concat(chunks).toString('utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(responses).toHaveLength(3);
    expect(responses[0]).toMatchObject({ id: 1, result: { protocolVersion: MCP_PROTOCOL_VERSION } });
    expect(responses[1]).toMatchObject({ id: 2, result: { tools: expect.any(Array) } });
    expect(responses[2]).toMatchObject({ id: 3, result: { structuredContent: { valid: true } } });
    expect(responses.every((response) => Object.keys(response).every((key) => ['jsonrpc', 'id', 'result', 'error'].includes(key)))).toBe(true);
  });
});
