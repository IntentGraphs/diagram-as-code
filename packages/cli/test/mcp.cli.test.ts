import { describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../src/args.js';
import { renderCliHelp } from '../src/commandRegistry.js';
import { runMcpCommand } from '../src/commands/mcp.js';

describe('bpm mcp', () => {
  it('parses as a command without requiring a file positional', () => {
    expect(parseArgv(['mcp'])).toMatchObject({ command: 'mcp', file: '', help: false });
  });

  it('rejects positionals and unrelated options', () => {
    expect(() => parseArgv(['mcp', 'server.bpm'])).toThrow(/unexpected argument/);
    expect(() => parseArgv(['mcp', '--json'])).toThrow(/not supported/);
    expect(() => parseArgv(['mcp', '--output', 'server.log'])).toThrow(/not supported/);
  });

  it('describes the long-running stdio command in help', () => {
    expect(renderCliHelp('mcp')).toBe(
      'usage: bpm mcp\nlaunch the MCP stdio server.\n',
    );
    expect(renderCliHelp()).toMatch(/mcp\s+launch the MCP stdio server/);
  });

  it('dispatches to the injectable stdio runner without producing a CLI result', async () => {
    const runner = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await expect(runMcpCommand(parseArgv(['mcp']), runner)).resolves.toBeUndefined();
    expect(runner).toHaveBeenCalledOnce();
  });
});
