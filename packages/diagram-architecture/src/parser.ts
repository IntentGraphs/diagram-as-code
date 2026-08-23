import { ARCHITECTURE_ID_PATTERN, ARCHITECTURE_NODE_KINDS, type ArchitectureDiagram, type ArchitectureNode, type ArchitectureNodeKind } from './ast.js';
import { MAX_DEPTH, MAX_EDGES, MAX_NODES, MAX_SOURCE_CHARS } from './limits.js';
import type { DiagramDiagnostic, FamilyParseResult } from './types.js';

const diagnostic = (line: number, message: string, code: string, token?: string): DiagramDiagnostic => ({ line, column: 1, message, code, ...(token === undefined ? {} : { token }) });
const leafKinds = new Set<ArchitectureNodeKind>(['person', 'database', 'queue', 'component']);

export function parseArchitecture(source: string): FamilyParseResult<ArchitectureDiagram> {
  const ast: ArchitectureDiagram = { kind: 'architectureDiagram', nodes: [], edges: [] };
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  if (source.length > MAX_SOURCE_CHARS) {
    semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${source.length})`, 'source_too_large'));
    return { ast, errors, semanticErrors };
  }
  const ids = new Map<string, ArchitectureNode>();
  const relationshipIds = new Map<string, number>();
  const relationshipSignatures = new Map<string, number>();
  const stack: Array<{ indent: number; node: ArchitectureNode; depth: number }> = [];
  let nodeCount = 0;
  let edgeCount = 0;
  for (const [index, raw] of source.split('\n').entries()) {
    const line = index + 1;
    const text = raw.replace(/\r$/, '');
    if (!text.trim()) continue;
    const leading = text.match(/^ */)![0].length;
    if (leading % 2 !== 0 || text.includes('\t')) {
      errors.push(diagnostic(line, 'Architecture indentation must use spaces in multiples of two', 'invalid_indentation'));
      continue;
    }
    const content = text.trim();
    const direction = content.match(/^direction:\s*(right|left|up|down)$/);
    if (direction) { ast.direction = direction[1] as ArchitectureDiagram['direction']; continue; }
    const declaration = content.match(/^(person|system|container|component|database|queue)\s+"([^"\r\n]*)"\s+as\s+(\S+)$/);
    if (declaration) {
      const [, kind, label, id] = declaration;
      if (!ARCHITECTURE_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id`, 'invalid_id', id));
      if (id === '0' || id === '1') semanticErrors.push(diagnostic(line, `"${id}" is reserved by the draw.io export format`, 'reserved_drawio_id', id));
      if (ids.has(id)) semanticErrors.push(diagnostic(line, `id "${id}" is already declared on line ${ids.get(id)!.line}`, 'duplicate_id', id));
      let parentEntry: { indent: number; node: ArchitectureNode; depth: number } | undefined;
      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        if (stack[stackIndex].indent < leading) { parentEntry = stack[stackIndex]; break; }
      }
      const parent = parentEntry?.node;
      if (!parent && (kind === 'container' || kind === 'component')) semanticErrors.push(diagnostic(line, `A root ${kind} is not allowed; nest it inside its C4 parent`, 'invalid_containment', id));
      if (parent && kind === 'system') semanticErrors.push(diagnostic(line, 'A system cannot be nested; systems are root-level nodes', 'invalid_containment', id));
      if (parent && (leafKinds.has(parent.kind) || parent.kind === 'component')) semanticErrors.push(diagnostic(line, `Node "${parent.id}" cannot contain children`, 'invalid_containment', parent.id));
      if (parent && ((kind === 'container' && parent.kind !== 'system') || (kind === 'component' && parent.kind !== 'container'))) semanticErrors.push(diagnostic(line, `A ${kind} must be contained directly by a ${kind === 'container' ? 'system' : 'container'}`, 'invalid_containment', id));
      const depth = parentEntry ? parentEntry.depth + 1 : 0;
      if (depth > MAX_DEPTH) semanticErrors.push(diagnostic(line, `Architecture nesting exceeds the maximum depth of ${MAX_DEPTH}`, 'max_depth_exceeded'));
      if (nodeCount >= MAX_NODES) { semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_NODES} nodes`, 'max_nodes_exceeded')); continue; }
      const node: ArchitectureNode = { kind: kind as ArchitectureNodeKind, id, label, line, children: [] };
      if (parent) parent.children.push(node); else ast.nodes.push(node);
      if (!ids.has(id)) ids.set(id, node);
      nodeCount += 1;
      while (stack.length && stack[stack.length - 1].indent >= leading) stack.pop();
      stack.push({ indent: leading, node, depth });
      continue;
    }
    const edge = content.match(/^(\S+)\s+->\s+(\S+)(?:\s*:\s*"([^"\r\n]*)")?(?:\s+as\s+(\S+))?$/);
    if (edge) {
      if (edgeCount >= MAX_EDGES) { semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_EDGES} edges`, 'max_edges_exceeded')); continue; }
      const [, sourceId, targetId, label, explicitId] = edge;
      const id = explicitId ?? `r${edgeCount + 1}`;
      if (relationshipIds.has(id)) semanticErrors.push(diagnostic(line, `Relationship id "${id}" is already declared on line ${relationshipIds.get(id)}`, 'duplicate_relationship_id', id));
      else relationshipIds.set(id, line);
      const signature = `${sourceId}\u0000${targetId}\u0000${label ?? ''}`;
      if (relationshipSignatures.has(signature)) semanticErrors.push(diagnostic(line, `Relationship ${sourceId} -> ${targetId} repeats the description used on line ${relationshipSignatures.get(signature)}`, 'duplicate_relationship', `${sourceId}->${targetId}`));
      else relationshipSignatures.set(signature, line);
      ast.edges.push({ id, sourceId, targetId, ...(label === undefined ? {} : { label }), line });
      edgeCount += 1;
      continue;
    }
    if (/^(at|layout|positioning|pool|lane)\b/.test(content)) errors.push(diagnostic(line, `Unsupported architecture declaration: "${content}"`, 'unsupported_declaration'));
    else errors.push(diagnostic(line, `Could not parse line: "${content}"`, 'unparseable_line'));
  }
  for (const edge of ast.edges) {
    if (!ids.has(edge.sourceId)) semanticErrors.push(diagnostic(edge.line, `Edge references unknown node "${edge.sourceId}"`, 'unknown_edge_endpoint', edge.sourceId));
    if (!ids.has(edge.targetId)) semanticErrors.push(diagnostic(edge.line, `Edge references unknown node "${edge.targetId}"`, 'unknown_edge_endpoint', edge.targetId));
    if (edge.sourceId === edge.targetId) semanticErrors.push(diagnostic(edge.line, `Self-relationships are not supported for node "${edge.sourceId}"`, 'self_relationship', edge.sourceId));
  }
  const validKinds = new Set(ARCHITECTURE_NODE_KINDS);
  for (const node of ids.values()) if (!validKinds.has(node.kind)) semanticErrors.push(diagnostic(node.line, `Unsupported architecture node kind "${node.kind}"`, 'unsupported_node_kind', node.kind));
  return { ast, errors, semanticErrors };
}
