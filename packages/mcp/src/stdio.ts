import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { createMcpRequestHandler, type JsonRpcError, type McpRequestHandler } from './server.js';

function parseError(): JsonRpcError {
  return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
}

function requestId(value: unknown): string | number | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))) return id;
  }
  return null;
}

/** Run newline-delimited MCP JSON-RPC over stdio. Protocol responses are the only stdout writes. */
export async function runStdioServer(
  input: NodeJS.ReadableStream = stdin,
  output: NodeJS.WritableStream = stdout,
  handler: McpRequestHandler = createMcpRequestHandler(),
): Promise<void> {
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      output.write(`${JSON.stringify(parseError())}\n`);
      continue;
    }
    try {
      const response = await handler(request);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId(request), error: { code: -32603, message: 'Internal error' } })}\n`);
    }
  }
}
