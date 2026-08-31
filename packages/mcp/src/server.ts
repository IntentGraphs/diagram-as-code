import {
  DIAGRAM_FAMILIES,
  DiagramRuntimeError,
  exportStructuredDiagram,
  executeDiagramSource,
  getFamily,
  listFamilies,
  parseDiagramSource,
  readDiagramHeader,
  resolveDiagramFamily,
  validateDiagramSource,
  type DiagramDiagnostic,
  type DiagramFamilyId,
  type FamilyLayoutOptions,
} from '@bpm/diagram-runtime';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { freezeDiagram, printDiagram } from '@bpm/print-dsl';
import { generateDiagram } from '@bpm/review';

export const MCP_PROTOCOL_VERSION = '2025-11-25';
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION, '2025-06-18', '2025-03-26'] as const;
export const MCP_SERVER_NAME = 'bpm-diagram-runtime';
export const MCP_SERVER_VERSION = '0.0.1';

const MAX_SOURCE_CHARS = 100_000;
const MAX_DESCRIPTION_CHARS = 10_000;
const MAX_ENGINE_CHARS = 100;
const MAX_FORMAT_CHARS = 100;
const MAX_ATTEMPTS = 10;
const ROUTING_MODES = ['quality', 'hybrid', 'fast', 'experimental'] as const;
const POSITIONING_MODES = ['auto', 'manual'] as const;

type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: Record<string, unknown>;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;
export type McpRequestHandler = (request: unknown) => Promise<JsonRpcResponse | null>;

interface ToolDescriptor {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

interface SourceOptions {
  source: string;
  engineOverride?: string;
  routing?: FamilyLayoutOptions['routing'];
}

class ToolInputError extends Error {
  readonly code = 'invalid_input';

  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ToolInputError(`Unknown input field "${key}"`);
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ToolInputError(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string, maxLength: number, nonEmpty = true): string {
  if (typeof value !== 'string') throw new ToolInputError(`${label} must be a string`);
  if (nonEmpty && value.trim().length === 0) throw new ToolInputError(`${label} must not be empty`);
  if (value.length > maxLength) throw new ToolInputError(`${label} exceeds the ${maxLength}-character limit`);
  return value;
}

function optionalString(args: Record<string, unknown>, key: string, maxLength: number): string | undefined {
  if (!hasOwn(args, key)) return undefined;
  return requireString(args[key], key, maxLength);
}

function optionalRouting(args: Record<string, unknown>): FamilyLayoutOptions['routing'] | undefined {
  if (!hasOwn(args, 'routing')) return undefined;
  const value = requireString(args.routing, 'routing', 32);
  if (!(ROUTING_MODES as readonly string[]).includes(value)) {
    throw new ToolInputError(`routing must be one of ${ROUTING_MODES.join(', ')}`);
  }
  return value as FamilyLayoutOptions['routing'];
}

function parseSourceOptions(value: unknown): SourceOptions {
  const args = requireObject(value, 'arguments');
  assertAllowedKeys(args, ['source', 'engine', 'routing']);
  const engineOverride = optionalString(args, 'engine', MAX_ENGINE_CHARS);
  const routing = optionalRouting(args);
  return {
    source: requireString(args.source, 'source', MAX_SOURCE_CHARS),
    ...(engineOverride === undefined ? {} : { engineOverride }),
    ...(routing === undefined ? {} : { routing }),
  };
}

function parseGenerateOptions(value: unknown): { description: string; family: DiagramFamilyId; positioning: 'auto' | 'manual'; maxAttempts?: number } {
  const args = requireObject(value, 'arguments');
  assertAllowedKeys(args, ['description', 'family', 'positioning', 'maxAttempts']);
  const description = requireString(args.description, 'description', MAX_DESCRIPTION_CHARS);
  const familyValue = hasOwn(args, 'family') ? requireString(args.family, 'family', 32) : 'bpmn';
  if (!(DIAGRAM_FAMILIES as readonly string[]).includes(familyValue) || !listFamilies().includes(familyValue as DiagramFamilyId)) {
    throw new ToolInputError(`family must be one of ${listFamilies().join(', ')}`);
  }
  const positioningValue = hasOwn(args, 'positioning') ? requireString(args.positioning, 'positioning', 16) : 'auto';
  if (!(POSITIONING_MODES as readonly string[]).includes(positioningValue)) {
    throw new ToolInputError(`positioning must be one of ${POSITIONING_MODES.join(', ')}`);
  }
  let maxAttempts: number | undefined;
  if (hasOwn(args, 'maxAttempts')) {
    if (!Number.isInteger(args.maxAttempts) || (args.maxAttempts as number) < 1 || (args.maxAttempts as number) > MAX_ATTEMPTS) {
      throw new ToolInputError(`maxAttempts must be an integer from 1 to ${MAX_ATTEMPTS}`);
    }
    maxAttempts = args.maxAttempts as number;
  }
  return { description, family: familyValue as DiagramFamilyId, positioning: positioningValue as 'auto' | 'manual', ...(maxAttempts === undefined ? {} : { maxAttempts }) };
}

function parseExportOptions(value: unknown): SourceOptions & { format: string } {
  const args = requireObject(value, 'arguments');
  assertAllowedKeys(args, ['source', 'format', 'engine', 'routing']);
  const engineOverride = optionalString(args, 'engine', MAX_ENGINE_CHARS);
  const routing = optionalRouting(args);
  const sourceOptions: SourceOptions = {
    source: requireString(args.source, 'source', MAX_SOURCE_CHARS),
    ...(engineOverride === undefined ? {} : { engineOverride }),
    ...(routing === undefined ? {} : { routing }),
  };
  return { ...sourceOptions, format: requireString(args.format, 'format', MAX_FORMAT_CHARS) };
}

function errorResponse(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcError {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function requestId(value: Record<string, unknown>): JsonRpcId | undefined {
  if (!hasOwn(value, 'id')) return undefined;
  const id = value.id;
  if (id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))) return id;
  return undefined;
}

function diagnosticsFromError(error: unknown): DiagramDiagnostic[] {
  if (error instanceof DiagramRuntimeError) return error.diagnostics;
  return [{ line: 1, column: 1, message: error instanceof Error ? error.message : String(error), severity: 'error' }];
}

function publicMetadata(source: string): Record<string, unknown> {
  const header = readDiagramHeader(source);
  const metadata: Record<string, unknown> = {
    family: header.family,
    ...(header.directiveFamily ? { directiveFamily: header.directiveFamily } : {}),
    paginate: header.paginate,
    ...(header.page ? { page: header.page } : {}),
    ...(header.pageBreak ? { pageBreak: header.pageBreak } : {}),
    ...(header.renderMode ? { renderMode: header.renderMode } : {}),
    ...(header.direction ? { direction: header.direction } : {}),
    ...(header.laneDirection ? { laneDirection: header.laneDirection } : {}),
  };
  try {
    const resolved = resolveDiagramFamily(source);
    metadata.capabilities = resolved.adapter.capabilities;
    metadata.ai = resolved.adapter.aiCapabilities ?? {
      generation: false,
      repair: false,
      visualReview: false,
      geometryInspection: false,
      semanticValidation: false,
    };
  } catch {
    // The header metadata remains useful for malformed sources.
  }
  return metadata;
}

function validationPayload(source: string, validation: { valid: boolean; errors: unknown[]; semanticErrors: unknown[]; warnings: unknown[]; metrics?: unknown; inspection?: unknown }): Record<string, unknown> {
  return {
    valid: validation.valid,
    metadata: publicMetadata(source),
    errors: validation.errors,
    semanticErrors: validation.semanticErrors,
    warnings: validation.warnings,
    ...(validation.metrics === undefined ? {} : { metrics: validation.metrics }),
    inspection: validation.inspection ?? null,
  };
}

function toolResult(payload: Record<string, unknown>, isError = false): JsonRpcSuccess['result'] {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function toolFailure(error: unknown): JsonRpcSuccess['result'] {
  const message = error instanceof Error ? error.message : String(error);
  return toolResult({ error: { code: error instanceof ToolInputError ? error.code : 'tool_error', message } }, true);
}

function readAnnotations() {
  return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

function writeIntentAnnotations() {
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
}

function sourceSchema(includeRouting = true): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      source: { type: 'string', minLength: 1, maxLength: MAX_SOURCE_CHARS, description: 'Complete .bpm diagram source text.' },
      engine: { type: 'string', minLength: 1, maxLength: MAX_ENGINE_CHARS },
      ...(includeRouting ? { routing: { type: 'string', enum: [...ROUTING_MODES] } } : {}),
    },
    required: ['source'],
  };
}

function toolDescriptors(): ToolDescriptor[] {
  const exportFormats = [...new Set(listFamilies().flatMap((family) => getFamily(family).capabilities.structuredExport))].sort();
  const sourceInputSchema = sourceSchema();
  const sourceProperties = sourceInputSchema.properties as Record<string, unknown>;
  return [
    { name: 'capabilities', title: 'Diagram capabilities', description: 'Read the registered diagram families, AI flags, and structured export formats.', inputSchema: { type: 'object', additionalProperties: false, properties: {} }, annotations: readAnnotations() },
    { name: 'validate', title: 'Validate diagram source', description: 'Read-only validation of .bpm source. Returns structured diagnostics, metrics, and geometry inspection; never writes files.', inputSchema: sourceSchema(), annotations: readAnnotations() },
    { name: 'render', title: 'Render diagram source', description: 'Read-only SVG rendering of .bpm source. Returns SVG text and diagnostics; never writes files.', inputSchema: sourceSchema(), annotations: readAnnotations() },
    { name: 'inspect', title: 'Inspect diagram source', description: 'Read-only validation plus geometry inspection of .bpm source; never writes files.', inputSchema: sourceSchema(), annotations: readAnnotations() },
    { name: 'generate', title: 'Generate diagram draft', description: 'Write-intent operation that returns a deterministic draft and validation. It never silently persists the draft and performs no network calls.', inputSchema: { type: 'object', additionalProperties: false, properties: { description: { type: 'string', minLength: 1, maxLength: MAX_DESCRIPTION_CHARS }, family: { type: 'string', enum: listFamilies() }, positioning: { type: 'string', enum: [...POSITIONING_MODES] }, maxAttempts: { type: 'integer', minimum: 1, maximum: MAX_ATTEMPTS } }, required: ['description'] }, annotations: writeIntentAnnotations() },
    { name: 'freeze', title: 'Freeze diagram layout', description: 'Write-intent operation that returns a manually positioned BPMN source. It never silently persists the result.', inputSchema: { ...sourceInputSchema, properties: { ...sourceProperties, routing: { type: 'string', enum: [...ROUTING_MODES] } } }, annotations: writeIntentAnnotations() },
    { name: 'export', title: 'Export structured artifact', description: 'Read-only structured export returned as artifact text. It never writes files.', inputSchema: { ...sourceInputSchema, properties: { ...sourceProperties, format: { type: 'string', enum: exportFormats, minLength: 1, maxLength: MAX_FORMAT_CHARS } }, required: ['source', 'format'] }, annotations: readAnnotations() },
  ];
}

function capabilitiesPayload(): Record<string, unknown> {
  const families = listFamilies().map((id) => {
    const adapter = getFamily(id);
    return {
      id,
      svg: adapter.capabilities.svg,
      png: adapter.capabilities.png,
      pptx: adapter.capabilities.pptx === true,
      editorMode: adapter.capabilities.editorMode,
      engineOverride: adapter.capabilities.engineOverride,
      ai: adapter.aiCapabilities ?? { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: false },
      structuredExports: adapter.capabilities.structuredExports ?? adapter.capabilities.structuredExport.map((format) => ({ format })),
    };
  });
  return {
    families,
    exportFormats: [...new Set(families.flatMap((family) => family.structuredExports.map((entry) => String((entry as Record<string, unknown>).format))))].sort(),
  };
}

async function callTool(name: string, rawArguments: unknown): Promise<JsonRpcSuccess['result']> {
  try {
    switch (name) {
      case 'capabilities': {
        const args = rawArguments === undefined ? {} : requireObject(rawArguments, 'arguments');
        assertAllowedKeys(args, []);
        return toolResult(capabilitiesPayload());
      }
      case 'validate': {
        const args = parseSourceOptions(rawArguments);
        try {
          const validation = await validateDiagramSource(args.source, { ...(args.engineOverride ? { engineOverride: args.engineOverride } : {}), ...(args.routing ? { routing: args.routing } : {}) });
          return toolResult(validationPayload(args.source, validation));
        } catch (error) {
          return toolResult({ valid: false, metadata: publicMetadata(args.source), errors: diagnosticsFromError(error), semanticErrors: [], warnings: [], inspection: null });
        }
      }
      case 'render': {
        const args = parseSourceOptions(rawArguments);
        try {
          const result = await executeDiagramSource(args.source, { ...(args.engineOverride ? { engineOverride: args.engineOverride } : {}), ...(args.routing ? { routing: args.routing } : {}) });
          const diagnostics = result.diagnostics;
          return toolResult({ valid: diagnostics.length === 0 && result.svg !== null, metadata: publicMetadata(args.source), svg: result.svg, diagnostics, warnings: result.warnings }, diagnostics.length > 0 || result.svg === null);
        } catch (error) {
          return toolResult({ valid: false, metadata: publicMetadata(args.source), svg: null, diagnostics: diagnosticsFromError(error), warnings: [] }, true);
        }
      }
      case 'inspect': {
        const args = parseSourceOptions(rawArguments);
        try {
          const validation = await validateDiagramSource(args.source, { ...(args.engineOverride ? { engineOverride: args.engineOverride } : {}), ...(args.routing ? { routing: args.routing } : {}) });
          return toolResult(validationPayload(args.source, validation));
        } catch (error) {
          return toolResult({ valid: false, metadata: publicMetadata(args.source), errors: diagnosticsFromError(error), semanticErrors: [], warnings: [], inspection: null });
        }
      }
      case 'generate': {
        const args = parseGenerateOptions(rawArguments);
        const result = await generateDiagram(args.description, { family: args.family, provider: 'manual', positioning: args.positioning, ...(args.maxAttempts === undefined ? {} : { maxAttempts: args.maxAttempts }) });
        if (result.status === 'unsupported') return toolResult({ writeIntent: true, persisted: false, ...result }, true);
        return toolResult({ writeIntent: true, persisted: false, persistence: 'none', family: result.family, status: result.status, attempts: result.attempts, providerId: result.providerId, draft: result.text, validation: result.validation });
      }
      case 'freeze': {
        const args = parseSourceOptions(rawArguments);
        const parsed = parseDiagramSource<Diagram, PositionedDiagram>(args.source);
        if (parsed.header.family !== 'bpmn') throw new ToolInputError('freeze currently supports only BPMN sources');
        const blocking = [...parsed.result.errors, ...parsed.result.semanticErrors];
        if (blocking.length > 0) return toolResult({ writeIntent: true, persisted: false, valid: false, frozen: null, errors: blocking, warnings: parsed.result.warnings ?? [] }, true);
        const positioned = await parsed.adapter.layout(parsed.result.ast, { ...(args.engineOverride ? { engineOverride: args.engineOverride } : {}), ...(args.routing ? { routing: args.routing } : {}) });
        const frozen = printDiagram(freezeDiagram(parsed.result.ast, positioned));
        const validation = await validateDiagramSource(frozen, { ...(args.engineOverride ? { engineOverride: args.engineOverride } : {}), ...(args.routing ? { routing: args.routing } : {}) });
        return toolResult({ writeIntent: true, persisted: false, persistence: 'none', valid: validation.valid, frozen: frozen, validation: validationPayload(frozen, validation) }, !validation.valid);
      }
      case 'export': {
        const args = parseExportOptions(rawArguments);
        const artifact = await exportStructuredDiagram(args.source, args.format, args.engineOverride ? { engineOverride: args.engineOverride } : undefined);
        const resolved = resolveDiagramFamily(args.source);
        const descriptor = resolved.adapter.capabilities.structuredExports?.find((entry) => entry.format === args.format);
        return toolResult({ valid: true, family: resolved.adapter.id, format: args.format, mimeType: descriptor?.mimeType ?? (args.format.endsWith('xml') ? 'application/xml' : 'application/json'), artifact, diagnostics: [], warnings: [] });
      }
      default:
        throw new Error(`Unknown tool "${name}"`);
    }
  } catch (error) {
    return toolFailure(error);
  }
}

function validRequest(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.jsonrpc === '2.0' && typeof value.method === 'string' && value.method.length > 0;
}

export function createMcpRequestHandler(options: { name?: string; version?: string } = {}): McpRequestHandler {
  let initialized = false;
  const tools = toolDescriptors();
  const serverName = options.name ?? MCP_SERVER_NAME;
  const serverVersion = options.version ?? MCP_SERVER_VERSION;

  return async (request: unknown): Promise<JsonRpcResponse | null> => {
    if (!validRequest(request)) return errorResponse(null, -32600, 'Invalid Request');
    const id = requestId(request);
    const notification = !hasOwn(request, 'id');
    if (hasOwn(request, 'id') && id === undefined) return errorResponse(null, -32600, 'Invalid Request');
    try {
      switch (request.method) {
        case 'initialize': {
          const params = requireObject(request.params, 'params');
          if (typeof params.protocolVersion !== 'string') throw new Error('params.protocolVersion must be a string');
          initialized = true;
          if (notification) return null;
          const protocolVersion = (SUPPORTED_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(params.protocolVersion) ? params.protocolVersion : MCP_PROTOCOL_VERSION;
          return { jsonrpc: '2.0', id: id as JsonRpcId, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, version: serverVersion } } };
        }
        case 'notifications/initialized':
          initialized = true;
          return null;
        case 'ping':
          if (notification) return null;
          return { jsonrpc: '2.0', id: id as JsonRpcId, result: {} };
        case 'tools/list': {
          if (!initialized) return errorResponse(id as JsonRpcId, -32002, 'Server is not initialized');
          if (request.params !== undefined) {
            const params = requireObject(request.params, 'params');
            assertAllowedKeys(params, ['cursor']);
            if (params.cursor !== undefined) requireString(params.cursor, 'cursor', 256, false);
          }
          if (notification) return null;
          return { jsonrpc: '2.0', id: id as JsonRpcId, result: { tools } };
        }
        case 'tools/call': {
          if (!initialized) return errorResponse(id as JsonRpcId, -32002, 'Server is not initialized');
          const params = requireObject(request.params, 'params');
          assertAllowedKeys(params, ['name', 'arguments', '_meta', 'task']);
          const name = requireString(params.name, 'params.name', 64);
          if (!tools.some((tool) => tool.name === name)) return errorResponse(id as JsonRpcId, -32602, `Unknown tool "${name}"`);
          const result = await callTool(name, params.arguments);
          if (notification) return null;
          return { jsonrpc: '2.0', id: id as JsonRpcId, result };
        }
        default:
          if (notification) return null;
          return errorResponse(id as JsonRpcId, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      if (notification) return null;
      if (error instanceof ToolInputError) return errorResponse(id as JsonRpcId, -32602, error.message);
      return errorResponse(id as JsonRpcId, -32602, error instanceof Error ? error.message : String(error));
    }
  };
}

export const createRequestHandler = createMcpRequestHandler;
