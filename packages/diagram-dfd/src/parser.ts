import { DFD_ID_PATTERN, type DfdDiagram, type DfdEdge, type DfdNode } from './ast.js';
import { MAX_EDGES, MAX_LABEL_CHARS, MAX_NODES, MAX_SOURCE_CHARS } from './limits.js';
import type { DiagramDiagnostic, FamilyParseResult } from './types.js';

const diagnostic = (line: number, message: string, code: string, token?: string): DiagramDiagnostic => ({ line, column: 1, message, code, ...(token === undefined ? {} : { token }) });
const sourceLocation = (line: number, text: string) => ({ line, startColumn: 1, endColumn: text.length + 1 });
const directions = ['right', 'left', 'down', 'up'] as const;

export function parseDfd(source: string): FamilyParseResult<DfdDiagram> {
  const ast: DfdDiagram = { kind: 'dfdDiagram', nodes: [], edges: [] };
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  const sourceLocations = { nodes: {}, edges: {}, pools: {}, lanes: {} } as import('@bpm/ast').DiagramSourceMap;
  if (source.length > MAX_SOURCE_CHARS) {
    semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${source.length})`, 'source_too_large'));
    return { ast, errors, semanticErrors, sourceLocations };
  }
  const ids = new Map<string, number>();
  let nodeLimitReported = false;
  let edgeLimitReported = false;
  for (const [index, rawLine] of source.split('\n').entries()) {
    const line = index + 1;
    const raw = rawLine.replace(/\r$/, '');
    const text = raw.trim();
    if (!text) continue;
    if (line === 1 && /^diagram:\s*dfd$/i.test(text)) continue;
    if (line === 1 && /^diagram:\s*\S+$/i.test(text)) { errors.push(diagnostic(line, 'Expected diagram: dfd', 'wrong_diagram')); continue; }
    const direction = text.match(/^direction:\s*(\S+)$/i);
    if (direction) {
      if (!directions.includes(direction[1] as typeof directions[number])) errors.push(diagnostic(line, `Unknown direction "${direction[1]}" (expected right, left, down, or up)`, 'invalid_direction', direction[1]));
      else ast.direction = direction[1] as typeof directions[number];
      continue;
    }
    const nodeMatch = text.match(/^(external|process|dataStore)\s+"([^"\r\n]*)"\s+as\s+(\S+)$/);
    if (nodeMatch) {
      const [, kind, label, id] = nodeMatch;
      if (!DFD_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id (must start with a letter or underscore)`, 'invalid_id', id));
      if (!label.trim()) semanticErrors.push(diagnostic(line, 'A DFD node requires a non-empty label', 'missing_label', id));
      if (label.length > MAX_LABEL_CHARS) semanticErrors.push(diagnostic(line, `Label exceeds the maximum of ${MAX_LABEL_CHARS} characters`, 'label_too_large', id));
      const previous = ids.get(id);
      if (previous !== undefined) semanticErrors.push(diagnostic(line, `id "${id}" is already used on line ${previous}`, 'duplicate_id', id));
      if (previous === undefined) ids.set(id, line);
      if (ast.nodes.length >= MAX_NODES) {
        if (!nodeLimitReported) semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_NODES} nodes (got ${MAX_NODES + 1})`, 'max_nodes_exceeded'));
        nodeLimitReported = true;
      } else if (previous === undefined) {
        ast.nodes.push({ kind: kind as DfdNode['kind'], id, label, line });
        sourceLocations.nodes[id] = sourceLocation(line, raw);
      }
      continue;
    }
    const edgeMatch = text.match(/^dataFlow\s+(\S+)\s+->\s+(\S+)\s*:\s*"([^"\r\n]*)"$/);
    if (edgeMatch) {
      const [, sourceId, targetId, label] = edgeMatch;
      if (!label.trim()) semanticErrors.push(diagnostic(line, 'A data flow requires a non-empty label', 'missing_label'));
      if (label.length > MAX_LABEL_CHARS) semanticErrors.push(diagnostic(line, `Label exceeds the maximum of ${MAX_LABEL_CHARS} characters`, 'label_too_large'));
      if (sourceId === targetId) semanticErrors.push(diagnostic(line, 'A data flow cannot reference the same element', 'self_flow', sourceId));
      if (ast.edges.length >= MAX_EDGES) {
        if (!edgeLimitReported) semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_EDGES} data flows (got ${MAX_EDGES + 1})`, 'max_edges_exceeded'));
        edgeLimitReported = true;
      } else {
        const id = `f${ast.edges.length}`;
        const edge: DfdEdge = { id, sourceId, targetId, label, line };
        ast.edges.push(edge);
        sourceLocations.edges[id] = sourceLocation(line, raw);
      }
      continue;
    }
    if (/^(pool|lane|task|gateway|at|layout)\b/.test(text)) errors.push(diagnostic(line, `Unsupported DFD declaration: "${text}"`, 'unsupported_declaration'));
    else errors.push(diagnostic(line, `Could not parse line: "${text}"`, 'unparseable_line'));
  }
  const nodes = new Map(ast.nodes.map((node) => [node.id, node]));
  for (const edge of ast.edges) {
    const source = nodes.get(edge.sourceId);
    const target = nodes.get(edge.targetId);
    if (!source) semanticErrors.push(diagnostic(edge.line, `Data flow references unknown source "${edge.sourceId}"`, 'unknown_flow_endpoint', edge.sourceId));
    if (!target) semanticErrors.push(diagnostic(edge.line, `Data flow references unknown target "${edge.targetId}"`, 'unknown_flow_endpoint', edge.targetId));
  }
  return { ast, errors, semanticErrors, sourceLocations };
}
