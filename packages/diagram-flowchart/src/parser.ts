import { FLOWCHART_ID_PATTERN, type FlowchartDiagram, type FlowchartNode } from './ast.js';
import { MAX_EDGES, MAX_NODES, MAX_SOURCE_CHARS } from './limits.js';
import type { DiagramDiagnostic, FamilyParseResult } from './types.js';

const diagnostic = (line: number, message: string, code: string, token?: string): DiagramDiagnostic => ({ line, column: 1, message, code, ...(token === undefined ? {} : { token }) });
const edgeKinds = { '->': 'sequence', '=>': 'conditionalSequence', '->>': 'defaultSequence' } as const;
const directionLine = /^direction:\s*(\S+)$/;
const directions = ['right', 'left', 'down', 'up'] as const;

export function parseFlowchart(source: string): FamilyParseResult<FlowchartDiagram> {
  const ast: FlowchartDiagram = { kind: 'flowchartDiagram', nodes: [], edges: [] };
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  if (source.length > MAX_SOURCE_CHARS) {
    semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${source.length})`, 'source_too_large'));
    return { ast, errors, semanticErrors };
  }
  const ids = new Map<string, number>();
  let nodeLimitReported = false;
  let edgeLimitReported = false;
  for (const [index, rawLine] of source.split('\n').entries()) {
    const line = index + 1;
    const text = rawLine.replace(/\r$/, '').trim();
    if (!text) continue;
    const direction = text.match(directionLine);
    if (direction) {
      if (!directions.includes(direction[1] as typeof directions[number])) errors.push(diagnostic(line, `Unknown direction "${direction[1]}" (expected right, left, down, or up)`, 'invalid_direction', direction[1]));
      else ast.direction = direction[1] as typeof directions[number];
      continue;
    }
    const declaration = text.match(/^(box|decision)(?:\s+"([^"\r\n]*)")?\s+as\s+(\S+)$/);
    if (declaration) {
      const [, kind, label, id] = declaration;
      if (label === undefined) errors.push(diagnostic(line, `${kind} declarations require a quoted label`, 'missing_label', id));
      if (!FLOWCHART_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id (must start with a letter or underscore)`, 'invalid_id', id));
      const previous = ids.get(id);
      if (previous !== undefined) semanticErrors.push(diagnostic(line, `id "${id}" is already used on line ${previous}`, 'duplicate_id', id));
      if (previous === undefined) ids.set(id, line);
      if (ast.nodes.length >= MAX_NODES) {
        if (!nodeLimitReported) semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_NODES} nodes (got ${MAX_NODES + 1})`, 'max_nodes_exceeded'));
        nodeLimitReported = true;
      } else if (label !== undefined) ast.nodes.push({ kind: kind as FlowchartNode['kind'], id, label, line });
      continue;
    }
    const edge = text.match(/^(\S+)\s+(->>|=>|->|~>|\.\.>)\s+(\S+)(?:\s*:\s*"([^"\r\n]*)")?$/);
    if (edge) {
      const [, from, token, to, label] = edge;
      if (!(token in edgeKinds)) {
        errors.push(diagnostic(line, `Edge kind "${token}" is not supported in flowcharts`, 'unsupported_edge_kind', token));
      } else if (ast.edges.length >= MAX_EDGES) {
        if (!edgeLimitReported) semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_EDGES} edges (got ${MAX_EDGES + 1})`, 'max_edges_exceeded'));
        edgeLimitReported = true;
      } else {
        ast.edges.push({ kind: edgeKinds[token as keyof typeof edgeKinds], from, to, ...(label === undefined ? {} : { label }), line });
      }
      continue;
    }
    if (/^(pool|lane)\b|\b(size|at)\s*\(|\[.*\]/.test(text)) {
      errors.push(diagnostic(line, `Unsupported flowchart declaration or positioning hint: "${text}"`, 'unsupported_declaration'));
      continue;
    }
    errors.push(diagnostic(line, `Could not parse line: "${text}"`, 'unparseable_line'));
  }
  for (const edge of ast.edges) {
    if (!ids.has(edge.from)) semanticErrors.push(diagnostic(edge.line, `Edge references unknown node "${edge.from}"`, 'unknown_edge_endpoint', edge.from));
    if (!ids.has(edge.to)) semanticErrors.push(diagnostic(edge.line, `Edge references unknown node "${edge.to}"`, 'unknown_edge_endpoint', edge.to));
  }
  return { ast, errors, semanticErrors };
}
