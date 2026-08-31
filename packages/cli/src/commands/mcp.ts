import type { ParsedArgs } from '../args.js';

export type McpStdioRunner = () => void | Promise<void>;

async function defaultMcpStdioRunner(): Promise<void> {
  const { runMcpStdioServer } = await import('@bpm/mcp');
  await runMcpStdioServer();
}

/** Launch the long-running MCP server without wrapping or writing its stdio traffic. */
export async function runMcpCommand(_args: ParsedArgs, runner: McpStdioRunner = defaultMcpStdioRunner): Promise<void> {
  await runner();
}
