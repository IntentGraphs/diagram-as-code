# Local MCP server

This document describes the local Model Context Protocol (MCP) surface shipped in
this repository. The server is an intentionally thin adapter over the existing
runtime and is designed for local AI clients and agent workflows.

The server should be a thin MCP-to-runtime adapter. It should reuse the existing
`@bpm/cli` command behavior and `@bpm/diagram-runtime` capability and execution
functions rather than maintaining a second parser, layout engine, validator, or
export registry.

## Current building blocks

The existing local entry points are:

```bash
npm install
npm run build:cli
npm run bpm -- capabilities --json
npm run bpm -- validate examples/getting-started/hello.bpm --json
npm run bpm -- mcp
```

The CLI package is `@bpm/cli`, and its executable name is `bpm`. The supported
commands are `validate`, `render`, `export`, `review`, `fix`, `generate`,
`import-diagram`, `freeze`, `capabilities`, and `mcp`. `check` is an alias for
`validate`; `import` is an alias for `import-diagram`.

`@bpm/diagram-runtime` is the shared runtime used by the CLI and web application.
The runtime registry is authoritative for diagram families, structured exports,
and capability metadata. The shipped families are BPMN, mindmap, flowchart,
architecture, gantt, and dfd.

## Installation and invocation

Build the repository and launch the server through the CLI:

```bash
npm install
npm run build
npm run bpm -- mcp
```

The preferred transport is stdio: the MCP client starts one local server process,
writes JSON-RPC messages to stdin, and reads responses from stdout. Logs and
diagnostic tracing must go to stderr so stdout remains a clean MCP transport.

The implementation preserves these properties:

- it runs from the repository without a hosted service or account;
- it accepts bounded source text and does not accept arbitrary filesystem paths in
  this first slice;
- it does not invoke a shell or arbitrary executable on behalf of a tool call;
- it reports its implementation version and runtime capabilities through
  `capabilities`.

## Current and follow-up tools

The first implementation exposes the tools marked **Implemented**. Follow-up tools
remain documented so the surface can grow without changing the existing runtime
contracts.

| MCP tool | Intent | Existing behavior to reuse | Status |
|---|---|---|---|
| `capabilities` | Read | Runtime family and export registry | **Implemented** |
| `validate` | Read | Existing runtime validation and inspection contract | **Implemented** |
| `check_changed` | Read | `bpm check --changed [--base <ref>] --format json` | Follow-up |
| `inspect` | Read | Existing runtime inspection data | **Implemented** |
| `render` | Read | Existing runtime SVG rendering, returned inline | **Implemented** |
| `export` | Read | Existing structured export, returned inline | **Implemented** |
| `review` | Read | `bpm review`; manual, Ollama, and OpenAI providers | Follow-up |
| `generate` | Write-intent | Deterministic validated candidate generation | **Implemented; never persists** |
| `fix` | Write-intent | `bpm fix <file> -o <file>` | Follow-up |
| `import_diagram` | Write-intent | BPMN XML → `.bpm` conversion | Follow-up |
| `freeze` | Write-intent | Resolved BPMN geometry → manual DSL | **Implemented; never persists** |
| `apply` | Write-intent | Reviewed candidate → explicit destination | Follow-up |

`inspect` should expose semantic IDs, source ranges, node and edge summaries,
content/render bounds, route statistics, and geometry issues without requiring an
SVG to be parsed. The runtime already exposes related inspection data in
`validate --json`; source-map support exists for runtime/web integrations, while a
general CLI inspection output is future work.

`apply` is intentionally narrow. It should accept a candidate produced by a
previous tool call, revalidate it, and atomically write it to an explicit path. It
must not be a general-purpose filesystem or shell tool.

## Input shape

MCP protocol metadata, tool names, and transport framing are implementation details
of the server. The current implementation accepts bounded source text plus optional
runtime settings:

```json
{
  "source": "event start none \"Start\" as start\ntask \"Review\" as review",
  "engine": "optional-engine-id",
  "routing": "quality"
}
```

Generated content uses a description rather than a source:

```json
{
  "description": "Review an order",
  "family": "bpmn",
  "positioning": "auto"
}
```

Current tool-specific fields are:

- `capabilities`: no fields.
- `validate`, `inspect`, and `render`: `source`, optional `engine` and `routing`.
- `export`: `source`, required `format`, optional `engine` and `routing`.
- `generate`: `description`, optional `family`, `positioning`, and bounded
  `maxAttempts`.
- `freeze`: BPMN `source`, optional `engine` and `routing`.

Path-based inputs, explicit artifact destinations, `review`, `fix`,
`import_diagram`, `check_changed`, and `apply` are follow-up tools, not part of
the first server slice.

The implementation should reject unknown fields that could change security or
write behavior silently. Exact JSON Schema files, required fields, and error codes
are **new implementation details** and should be versioned with the MCP package.

## Output shape

The MCP response contains the standard JSON-RPC result. The server returns tool
payloads in both `content[].text` and `structuredContent`:

```json
{
  "result": {
    "content": [{"type": "text", "text": "{...}"}],
    "structuredContent": {"valid": true, "errors": [], "warnings": []}
  }
}
```

The MCP envelope is implemented by the current server. Tool payloads are returned
both as JSON text content and `structuredContent`; existing CLI/runtime JSON shapes
remain recognizable and are not replaced by a second validation schema:

- `validate` returns the existing `ValidationResult` shape:
  `{ valid, errors, semanticErrors, warnings, metrics?, inspection? }`.
- `render` and structured `export` return execution metadata, warnings/errors, and
  an output descriptor. Inline output should be represented as a typed payload;
  file output should identify the explicit path and format.
- `review` preserves `validation`, `visualFindings`, `providerId`, and any bounded
  `repair` result.
- `generate`, `import_diagram`, and `freeze` preserve their current conversion
  concepts: candidate text, conversion status, warnings, and validation result.
- `capabilities` preserves the runtime registry concepts `families` and
  `exportFormats`.

An illustrative validation response is:

```json
{
  "result": {
    "content": [{"type": "text", "text": "{...}"}],
    "structuredContent": {
      "valid": true,
      "metadata": {"family": "bpmn"},
      "errors": [],
      "semanticErrors": [],
      "warnings": [],
      "inspection": {}
    }
  }
}
```

Binary inline output, such as PNG or PPTX, should use an explicit base64 encoding
and media type, or require an output path. The exact artifact envelope is **new
implementation detail**; it must never put binary bytes directly into an
unbounded diagnostic string.

## Read versus write intent

The server must make the side-effect boundary visible to both the client and the
model using it.

Read-only calls:

- `capabilities`, `validate`, `check_changed`, `inspect`, and `review` never write
  files.
- `render`, `export`, `generate`, `import_diagram`, and `freeze` are read/compute
  operations when they return an inline candidate or artifact and have no output
  path.
- A read-only call must not update the input source, Git state, browser storage,
  or any hosted service.

Write-intent calls:

- `fix` and `apply` require an explicit destination path and a positive write
  intent. They must never overwrite the source path implicitly.
- `generate`, `import_diagram`, and `freeze` may write only when the request
  includes an explicit destination and confirmation/write intent.
- `render` and `export` may write an artifact only when an explicit destination,
  format, and write intent are present. Otherwise they return the artifact inline
  where practical.
- The server should report `writeIntent: "none" | "preview" | "apply"` in its
  response metadata. The current server reports `writeIntent: true` and
  `persisted: false` for generated/frozen candidates.

The existing CLI convention is the model for this boundary: `-o`/`--output` is
explicit, writes are atomic, `fix` requires an output path, and source files are
not overwritten by `fix`.

## Validation before apply

All write-intent operations must follow this sequence:

1. Read the source or candidate from an allowed local path, or accept bounded text
   supplied in the request.
2. Resolve the diagram family through `@bpm/diagram-runtime`.
3. Parse, lay out, and validate using the existing runtime path. For generated,
   imported, frozen, or repaired text, validate the candidate—not only the input.
4. If blocking syntax, semantic, layout, geometry, exporter, or resource-limit
   diagnostics exist, return `status: "blocked"` and do not write anything.
5. In preview mode, return the candidate, diagnostics, output metadata, and (where
   supported) a source-relative diff or content hash.
6. Only after explicit client confirmation should `apply` write the candidate to
   its declared destination using the repository's atomic-write behavior.
7. Revalidate immediately before the final write if the source or destination can
   have changed since preview. Fail closed if the file has changed unexpectedly.

Warnings do not automatically block output in the existing CLI. Blocking errors
remain blocking in MCP. Warning-only exports should return the warnings in the
response and identify the generated artifact clearly.

## Local-first and privacy boundary

The intended server is local-first:

- The MCP process runs on the user's machine and has no account system, hosted
  collaboration backend, or default telemetry.
- Source files, rendered SVG, inspection data, and generated artifacts remain
  local unless the user explicitly selects an external provider or an MCP client
  forwards the content elsewhere.
- `provider: "manual"` is deterministic and does not require network access.
- `provider: "ollama"` may contact the user's configured local Ollama service.
- `provider: "openai"` or another OpenAI-compatible endpoint sends the source and
  prompts to the configured endpoint; visual review may also send a rendered PNG.
  Provider retention and use are governed by that provider, not by this repository.
- The server should default to a configured worktree/root allowlist, reject paths
  outside it, resolve symlinks before access, and avoid following untrusted paths
  into unrelated directories.
- MCP clients may retain tool arguments and results in their own logs or history;
  the local server cannot provide a blanket privacy guarantee for that client.

The server should expose no arbitrary shell, network-fetch, package-install, or
process-execution tool. External network access belongs only to an explicitly
selected AI provider and should be visible in the tool result.

## Example MCP client configuration

The snippets below are illustrative and use the built server entry point. They
use an absolute repository path because MCP clients commonly launch stdio servers
with an unrelated working directory. Replace the path with the local checkout.

### Claude Desktop-style configuration

```json
{
  "mcpServers": {
    "intentgraphs": {
      "command": "node",
      "args": [
        "/absolute/path/to/diagram-as-code/packages/cli/dist/bin.js",
        "mcp"
      ]
    }
  }
}
```

### Cursor-style configuration

```json
{
  "mcpServers": {
    "intentgraphs": {
      "command": "node",
      "args": [
        "/absolute/path/to/diagram-as-code/packages/mcp/dist/bin.js"
      ]
    }
  }
}
```

### VS Code-style stdio configuration

```json
{
  "servers": {
    "intentgraphs": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/diagram-as-code/packages/mcp/dist/bin.js"
      ]
    }
  }
}
```

Client configuration keys vary by client version. The server path and stdio
transport are the relevant concepts. The current implementation accepts bounded
source text and performs no filesystem writes; path allowlists and apply operations
remain a follow-up hardening slice.

## Implementation and test acceptance criteria

The first implementation is tested against the existing CLI contract with package
tests plus the compiled-process command `npm run test:mcp:e2e`:

- initialize over stdio and keep stdout protocol-clean;
- discover `capabilities` from the runtime registry;
- validate valid and invalid fixtures with the existing `ValidationResult` fields;
- exercise the capabilities registry, including all six registered families;
- render and export inline without creating files;
- verify write-intent candidates are never persisted or implicitly overwritten;
- verify malformed JSON, unknown tools, oversized inputs, and invalid arguments fail
  with bounded structured errors;
- run the repository's existing package tests, CLI tests, and web E2E suite after
  adding MCP-specific tests.

Future slices should add explicit apply/path-allowlist operations, review-provider
coverage, binary artifact handling, and external MCP-client conformance tests.
