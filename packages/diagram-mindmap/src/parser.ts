import type { DiagramDiagnostic, FamilyParseResult } from './types.js';
import { MINDMAP_ID_PATTERN, type MindmapDiagram, type MindmapNode } from './ast.js';
import { MAX_DEPTH, MAX_NODES, MAX_SOURCE_CHARS } from './limits.js';

function diagnostic(line: number, message: string, code: string, token?: string): DiagramDiagnostic {
  return { line, column: 1, message, code, ...(token === undefined ? {} : { token }) };
}

function emptyDiagram(): MindmapDiagram {
  return { kind: 'mindmapDiagram', root: { kind: 'mindmapNode', id: '', label: '', hasExplicitLabel: false, depth: 0, children: [], line: 1 }, nodeCount: 0, maxDepth: 0 };
}
const directionLine = /^direction:\s*(\S+)$/;
const directions = ['right', 'left', 'down', 'up'] as const;

export function parseMindmap(source: string): FamilyParseResult<MindmapDiagram> {
  const ast = emptyDiagram();
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  if (source.length > MAX_SOURCE_CHARS) {
    semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${source.length})`, 'source_too_large'));
    return { ast, errors, semanticErrors };
  }

  const stack: MindmapNode[] = [];
  const ids = new Map<string, number>();
  const lines = source.split('\n');
  let root: MindmapNode | undefined;
  let maxDepth = 0;
  let nodeCount = 0;
  let nodeLimitReported = false;
  let depthLimitReported = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index].replace(/\r$/, '');
    if (raw.trim() === '') continue;
    const tab = raw.match(/^(\s*\t)/);
    if (tab) {
      errors.push(diagnostic(lineNumber, 'Line indentation must be exactly 2 spaces per level, using spaces only (found a tab)', 'bad_indent_step'));
      continue;
    }
    const indentMatch = raw.match(/^ */)!;
    const indent = indentMatch[0].length;
    if (indent % 2 !== 0) {
      errors.push(diagnostic(lineNumber, 'Indentation must be exactly 2 spaces per level, using spaces only', 'bad_indent_step'));
      continue;
    }
    const content = raw.slice(indent);
    const direction = content.match(directionLine);
    if (direction) {
      if (indent !== 0) errors.push(diagnostic(lineNumber, 'The direction directive must be at indent 0', 'invalid_directive'));
      else if (!directions.includes(direction[1] as typeof directions[number])) errors.push(diagnostic(lineNumber, `Unknown direction "${direction[1]}" (expected right, left, down, or up)`, 'invalid_direction', direction[1]));
      else ast.direction = direction[1] as typeof directions[number];
      continue;
    }
    const match = content.match(/^mindmap(?: "([^"\r\n]*)")? as (\S+)$/);
    if (!match) {
      errors.push(diagnostic(lineNumber, `Could not parse line: "${content}"`, 'unparseable_line'));
      continue;
    }
    const [, explicitLabel, id] = match;
    const depth = indent / 2;
    if (!root && depth !== 0) {
      errors.push(diagnostic(lineNumber, 'The first node must be at indent 0 (the root cannot be nested)', 'orphan_indent'));
      continue;
    }
    if (root && depth === 0) {
      semanticErrors.push(diagnostic(lineNumber, `A mind map may have exactly one root; "${id}" is a second root (first root: "${root.id}" on line ${root.line})`, 'multiple_roots', id));
      continue;
    }
    if (root && depth > 0 && !stack[depth - 1]) {
      errors.push(diagnostic(lineNumber, `Child of "${stack[stack.length - 1]?.id ?? root.id}" must be indented exactly 2 spaces deeper (found ${indent})`, 'indent_skips_level'));
      continue;
    }
    if (!MINDMAP_ID_PATTERN.test(id)) {
      errors.push(diagnostic(lineNumber, `"${id}" is not a valid id (must start with a letter or underscore)`, 'invalid_id', id));
    }
    const previous = ids.get(id);
    if (previous !== undefined) {
      semanticErrors.push(diagnostic(lineNumber, `id "${id}" is already used on line ${previous}`, 'duplicate_id', id));
    }
    // Register IDs before limit checks so diagnostics remain complete when an occurrence is
    // discarded for exceeding MAX_DEPTH or MAX_NODES.
    if (previous === undefined) ids.set(id, lineNumber);
    if (depth > MAX_DEPTH) {
      if (!depthLimitReported) semanticErrors.push(diagnostic(lineNumber, `Mind map exceeds the maximum nesting depth of ${MAX_DEPTH} levels`, 'max_depth_exceeded'));
      depthLimitReported = true;
      continue;
    }
    if (nodeCount >= MAX_NODES) {
      if (!nodeLimitReported) semanticErrors.push(diagnostic(lineNumber, `Diagram exceeds the maximum of ${MAX_NODES} nodes (got ${MAX_NODES + 1})`, 'max_nodes_exceeded'));
      nodeLimitReported = true;
      continue;
    }
    const node: MindmapNode = {
      kind: 'mindmapNode', id, label: explicitLabel === undefined ? id : explicitLabel,
      hasExplicitLabel: explicitLabel !== undefined, depth, children: [], line: lineNumber,
    };
    nodeCount += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (!root) root = node;
    else {
      stack[depth - 1].children.push(node);
    }
    stack.length = depth;
    stack.push(node);
  }
  if (!root) semanticErrors.push(diagnostic(1, 'A mind map diagram requires exactly one root node; none was found', 'missing_root'));
  ast.root = root ?? ast.root;
  ast.nodeCount = nodeCount;
  ast.maxDepth = maxDepth;
  return { ast, errors, semanticErrors };
}
