import { ARCHITECTURE_ID_PATTERN, ARCHITECTURE_NODE_KINDS, type ArchitectureDiagram, type ArchitectureNode, type ArchitectureNodeKind, type ArchitectureThemeName, type ArchitectureView } from './ast.js';
import { MAX_DEPTH, MAX_EDGES, MAX_NODES, MAX_SOURCE_CHARS } from './limits.js';
import type { DiagramDiagnostic, FamilyParseResult } from './types.js';

const diagnostic = (line: number, message: string, code: string, token?: string): DiagramDiagnostic => ({ line, column: 1, message, code, ...(token === undefined ? {} : { token }) });
const leafKinds = new Set<ArchitectureNodeKind>(['person', 'database', 'queue', 'component']);
function sourceLocation(line: number, text: string) { return { line, startColumn: 1, endColumn: text.length + 1 }; }

function unescapeQuoted(value: string): string {
  return value.replace(/\\([\\"])/g, '$1').replace(/\\n/g, '\n');
}

function splitAttributes(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (character === '\\' && quoted) { escaped = true; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { parts.push(source.slice(start, index).trim()); start = index + 1; }
  }
  if (source.slice(start).trim()) parts.push(source.slice(start).trim());
  return parts;
}

function parseAttributes(source: string, line: number, errors: DiagramDiagnostic[]): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {};
  for (const part of splitAttributes(source)) {
    const match = part.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(?:"((?:\\.|[^"])*)"|(true|false)|([^,]+))$/i);
    if (!match) { errors.push(diagnostic(line, `Invalid architecture attribute "${part}"`, 'invalid_attribute')); continue; }
    const [, key, quoted, booleanValue, rawValue] = match;
    attributes[key.toLowerCase()] = quoted !== undefined ? unescapeQuoted(quoted) : booleanValue !== undefined ? booleanValue.toLowerCase() === 'true' : rawValue.trim();
  }
  return attributes;
}

function listAttribute(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function directionAttribute(value: string | boolean | undefined): ArchitectureDiagram['direction'] | undefined {
  return typeof value === 'string' && (value === 'right' || value === 'left' || value === 'up' || value === 'down') ? value : undefined;
}

function themeAttribute(value: string | boolean | undefined): ArchitectureThemeName | undefined {
  return value === 'high-contrast' || value === 'default' ? value : undefined;
}

function stableRelationshipId(sourceId: string, targetId: string, label: string | undefined): string {
  const suffix = label ? `_${label}` : '';
  return `rel_${sourceId}_${targetId}${suffix}`.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function parseArchitecture(source: string): FamilyParseResult<ArchitectureDiagram> {
  const ast: ArchitectureDiagram = { kind: 'architectureDiagram', nodes: [], edges: [] };
  const errors: DiagramDiagnostic[] = [];
  const semanticErrors: DiagramDiagnostic[] = [];
  const sourceLocations = { nodes: {}, edges: {}, pools: {}, lanes: {} } as import('@bpm/ast').DiagramSourceMap;
  if (source.length > MAX_SOURCE_CHARS) {
    semanticErrors.push(diagnostic(1, `Diagram source exceeds the maximum of ${MAX_SOURCE_CHARS} characters (got ${source.length})`, 'source_too_large'));
    return { ast, errors, semanticErrors, sourceLocations };
  }
  const ids = new Map<string, ArchitectureNode>();
  const relationshipIds = new Map<string, number>();
  const relationshipSignatures = new Map<string, number>();
  const viewKeys = new Map<string, number>();
  const stack: Array<{ indent: number; node: ArchitectureNode; depth: number }> = [];
  const warnings: DiagramDiagnostic[] = [];
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
    if (content.startsWith('#') || content.startsWith('//') || /^(model|views)\s*\{$/.test(content) || content === '}') continue;
    const workspace = content.match(/^workspace\s+"([^"\r\n]*)"(?:\s+"([^"\r\n]*)")?\s*\{?$/);
    if (workspace) { ast.title = unescapeQuoted(workspace[1]); if (workspace[2] !== undefined) ast.description = unescapeQuoted(workspace[2]); continue; }
    const title = content.match(/^title:\s*"([^"\r\n]*)"$/i);
    if (title) { ast.title = unescapeQuoted(title[1]); continue; }
    const description = content.match(/^description:\s*"([^"\r\n]*)"$/i);
    if (description) { ast.description = unescapeQuoted(description[1]); continue; }
    const theme = content.match(/^theme:\s*(?:"([^"\r\n]*)"|([^\s]+))$/i);
    if (theme) { const value = themeAttribute(theme[1] ?? theme[2]); if (!value) errors.push(diagnostic(line, 'Unknown architecture theme; expected "default" or "high-contrast"', 'invalid_theme')); else ast.theme = value; continue; }
    const legend = content.match(/^legend:\s*(true|false)$/i);
    if (legend) { ast.legend = legend[1].toLowerCase() === 'true'; continue; }
    const activeView = content.match(/^(?:view|activeView):\s*([A-Za-z_][A-Za-z0-9_.-]*)$/i);
    if (activeView) { ast.activeView = activeView[1]; continue; }
    const viewMatch = content.match(/^view\s+(systemContext|systemLandscape|container|component|deployment|dynamic|custom)(?:\s+([A-Za-z_][A-Za-z0-9_.-]*))?\s+as\s+([A-Za-z_][A-Za-z0-9_.-]*)(?:\s+"([^"\r\n]*)")?(?:\s+\[([^\]]*)\])?$/i);
    if (viewMatch) {
      const [, rawType, focusId, key, rawTitle, rawAttributes] = viewMatch;
      const type = rawType as ArchitectureView['type'];
      const attributes = rawAttributes ? parseAttributes(rawAttributes, line, errors) : {};
      if (viewKeys.has(key)) semanticErrors.push(diagnostic(line, `View key "${key}" is already declared on line ${viewKeys.get(key)}`, 'duplicate_view_key', key));
      else viewKeys.set(key, line);
      if ((type !== 'systemLandscape' && type !== 'custom') && !focusId) semanticErrors.push(diagnostic(line, `${type} views require a focus id`, 'missing_view_focus', key));
      if ((type === 'systemLandscape' || type === 'custom') && focusId) semanticErrors.push(diagnostic(line, `${type} views cannot have a focus id`, 'invalid_view_focus', key));
      const view: ArchitectureView = {
        key,
        type,
        ...(focusId ? { focusId } : {}),
        ...(rawTitle ?? attributes.title ? { title: unescapeQuoted(rawTitle ?? String(attributes.title)) } : {}),
        ...(typeof attributes.description === 'string' ? { description: attributes.description } : {}),
        ...(listAttribute(attributes.include) ? { include: listAttribute(attributes.include) } : {}),
        ...(listAttribute(attributes.exclude) ? { exclude: listAttribute(attributes.exclude) } : {}),
        ...(directionAttribute(attributes.direction) ? { direction: directionAttribute(attributes.direction) } : {}),
        ...(attributes.fit === 'contain' || attributes.fit === 'strict' ? { fit: attributes.fit } : {}),
        ...(themeAttribute(attributes.theme) ? { theme: themeAttribute(attributes.theme) } : {}),
        line,
      };
      ast.views = [...(ast.views ?? []), view];
      if (!ast.activeView) ast.activeView = key;
      continue;
    }
    const direction = content.match(/^direction:\s*(right|left|up|down)$/);
    if (direction) { ast.direction = direction[1] as ArchitectureDiagram['direction']; continue; }
    const legacyDeclaration = content.match(/^(person|system|container|component|database|queue)\s+"([^"\r\n]*)"\s+as\s+(\S+)(?:\s+\[([^\]]*)\])?$/);
    const structuredDeclaration = content.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(person|softwareSystem|container|component|element)(?:\s+([A-Za-z_][A-Za-z0-9_.-]*))?\s+"([^"\r\n]*)"(?:\s+"([^"\r\n]*)")?(?:\s+"([^"\r\n]*)")?(?:\s+\[([^\]]*)\])?$/);
    if (legacyDeclaration || structuredDeclaration) {
      const id = legacyDeclaration ? legacyDeclaration[3] : structuredDeclaration![1];
      const rawKind = legacyDeclaration ? legacyDeclaration[1] : structuredDeclaration![2];
      const rawLabel = legacyDeclaration ? legacyDeclaration[2] : structuredDeclaration![4];
      const rawAttributes = legacyDeclaration ? legacyDeclaration[4] : structuredDeclaration![7];
      const explicitParentId = structuredDeclaration?.[3];
      let kind: ArchitectureNodeKind = rawKind as ArchitectureNodeKind;
      if (structuredDeclaration) {
        kind = rawKind === 'softwareSystem' ? 'system' : rawKind === 'element' ? (structuredDeclaration[5] === 'Queue' ? 'queue' : 'database') : rawKind as ArchitectureNodeKind;
        if (rawKind === 'element' && structuredDeclaration[5] !== 'Database' && structuredDeclaration[5] !== 'Queue') semanticErrors.push(diagnostic(line, 'Structurizr custom elements must identify Database or Queue as their metadata', 'unsupported_custom_element', id));
      }
      const label = unescapeQuoted(rawLabel);
      const attributes = rawAttributes ? parseAttributes(rawAttributes, line, errors) : {};
      if (structuredDeclaration && rawKind !== 'element') {
        if (structuredDeclaration[5] !== undefined) attributes.description = unescapeQuoted(structuredDeclaration[5]);
        if (structuredDeclaration[6] !== undefined) attributes.technology = unescapeQuoted(structuredDeclaration[6]);
      }
      if (!ARCHITECTURE_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid id`, 'invalid_id', id));
      if (id === '0' || id === '1') semanticErrors.push(diagnostic(line, `"${id}" is reserved by the draw.io export format`, 'reserved_drawio_id', id));
      if (ids.has(id)) semanticErrors.push(diagnostic(line, `id "${id}" is already declared on line ${ids.get(id)!.line}`, 'duplicate_id', id));
      let parentEntry: { indent: number; node: ArchitectureNode; depth: number } | undefined;
      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        if (stack[stackIndex].indent < leading) { parentEntry = stack[stackIndex]; break; }
      }
      const explicitParent = explicitParentId ? ids.get(explicitParentId) : undefined;
      if (explicitParentId && !explicitParent) semanticErrors.push(diagnostic(line, `Node "${id}" references unknown parent "${explicitParentId}"`, 'unknown_parent', explicitParentId));
      const parent = explicitParent ?? parentEntry?.node;
      if (!parent && (kind === 'container' || kind === 'component')) semanticErrors.push(diagnostic(line, `A root ${kind} is not allowed; nest it inside its C4 parent`, 'invalid_containment', id));
      if (parent && kind === 'system') semanticErrors.push(diagnostic(line, 'A system cannot be nested; systems are root-level nodes', 'invalid_containment', id));
      if (parent && (leafKinds.has(parent.kind) || parent.kind === 'component')) semanticErrors.push(diagnostic(line, `Node "${parent.id}" cannot contain children`, 'invalid_containment', parent.id));
      if (parent && ((kind === 'container' && parent.kind !== 'system') || (kind === 'component' && parent.kind !== 'container'))) semanticErrors.push(diagnostic(line, `A ${kind} must be contained directly by a ${kind === 'container' ? 'system' : 'container'}`, 'invalid_containment', id));
      const depth = explicitParent ? (parentEntry ? parentEntry.depth + 1 : 1) : parentEntry ? parentEntry.depth + 1 : 0;
      if (depth > MAX_DEPTH) semanticErrors.push(diagnostic(line, `Architecture nesting exceeds the maximum depth of ${MAX_DEPTH}`, 'max_depth_exceeded'));
      if (nodeCount >= MAX_NODES) { semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_NODES} nodes`, 'max_nodes_exceeded')); continue; }
      const node: ArchitectureNode = {
        kind,
        id,
        label,
        line,
        ...(typeof attributes.description === 'string' ? { description: attributes.description } : {}),
        ...(typeof attributes.technology === 'string' ? { technology: attributes.technology } : {}),
        ...(listAttribute(attributes.tags) ? { tags: listAttribute(attributes.tags) } : {}),
        ...(typeof attributes.external === 'boolean' ? { external: attributes.external } : {}),
        ...(typeof attributes.group === 'string' ? { group: attributes.group } : {}),
        children: [],
      };
      if (parent) parent.children.push(node); else ast.nodes.push(node);
      if (!ids.has(id)) ids.set(id, node);
      sourceLocations.nodes[id] = sourceLocation(line, text);
      nodeCount += 1;
      while (stack.length && stack[stack.length - 1].indent >= leading) stack.pop();
      stack.push({ indent: leading, node, depth });
      continue;
    }
    const legacyEdge = content.match(/^(\S+)\s+->\s+(\S+)(?:\s*:\s*"([^"\r\n]*)")?(?:\s+as\s+(\S+))?(?:\s+\[([^\]]*)\])?$/);
    const structuredEdge = content.match(/^(\S+)\s+->\s+(\S+)(?:\s+"([^"\r\n]*)")?(?:\s+"([^"\r\n]*)")?(?:\s+as\s+(\S+))?(?:\s+\[([^\]]*)\])?$/);
    const edge = legacyEdge ?? structuredEdge;
    if (edge) {
      if (edgeCount >= MAX_EDGES) { semanticErrors.push(diagnostic(line, `Diagram exceeds the maximum of ${MAX_EDGES} edges`, 'max_edges_exceeded')); continue; }
      const sourceId = edge[1];
      const targetId = edge[2];
      const rawLabel = legacyEdge ? edge[3] : edge[3];
      const rawAttributes = legacyEdge ? edge[5] : edge[6];
      const label = rawLabel === undefined ? undefined : unescapeQuoted(rawLabel);
      const attributes = rawAttributes ? parseAttributes(rawAttributes, line, errors) : {};
      if (structuredEdge && !legacyEdge && structuredEdge[4] !== undefined) attributes.technology = unescapeQuoted(structuredEdge[4]);
      const explicitId = legacyEdge ? edge[4] : structuredEdge?.[5] ?? (typeof attributes.id === 'string' ? attributes.id : undefined);
      const id = explicitId ?? (legacyEdge ? `r${edgeCount + 1}` : stableRelationshipId(sourceId, targetId, label));
      if (!ARCHITECTURE_ID_PATTERN.test(id)) errors.push(diagnostic(line, `"${id}" is not a valid relationship id`, 'invalid_relationship_id', id));
      if (ids.has(id)) semanticErrors.push(diagnostic(line, `Relationship id "${id}" conflicts with a node id`, 'duplicate_relationship_id', id));
      if (relationshipIds.has(id)) semanticErrors.push(diagnostic(line, `Relationship id "${id}" is already declared on line ${relationshipIds.get(id)}`, 'duplicate_relationship_id', id));
      else relationshipIds.set(id, line);
      const signature = `${sourceId}\u0000${targetId}\u0000${label ?? ''}`;
      if (relationshipSignatures.has(signature)) semanticErrors.push(diagnostic(line, `Relationship ${sourceId} -> ${targetId} repeats the description used on line ${relationshipSignatures.get(signature)}`, 'duplicate_relationship', `${sourceId}->${targetId}`));
      else relationshipSignatures.set(signature, line);
      ast.edges.push({
        id,
        sourceId,
        targetId,
        ...(label === undefined ? {} : { label }),
        ...(typeof attributes.technology === 'string' ? { technology: attributes.technology } : {}),
        ...(typeof attributes.protocol === 'string' ? { protocol: attributes.protocol } : {}),
        ...(listAttribute(attributes.tags) ? { tags: listAttribute(attributes.tags) } : {}),
        line,
      });
      sourceLocations.edges[id] = sourceLocation(line, text);
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
  for (const view of ast.views ?? []) {
    if (view.focusId && !ids.has(view.focusId)) semanticErrors.push(diagnostic(view.line ?? 1, `View "${view.key}" references unknown focus id "${view.focusId}"`, 'unknown_view_focus', view.focusId));
    for (const id of [...(view.include ?? []), ...(view.exclude ?? [])].filter((entry) => entry !== '*')) if (!ids.has(id)) semanticErrors.push(diagnostic(view.line ?? 1, `View "${view.key}" references unknown element "${id}"`, 'unknown_view_element', id));
    if (view.type === 'container' && view.focusId && ids.get(view.focusId)?.kind !== 'system') semanticErrors.push(diagnostic(view.line ?? 1, `Container view "${view.key}" must focus a system`, 'invalid_view_focus', view.focusId));
    if (view.type === 'component' && view.focusId && ids.get(view.focusId)?.kind !== 'container') semanticErrors.push(diagnostic(view.line ?? 1, `Component view "${view.key}" must focus a container`, 'invalid_view_focus', view.focusId));
    if (view.type === 'deployment' || view.type === 'dynamic') warnings.push(diagnostic(view.line ?? 1, `${view.type} view "${view.key}" is reserved for a future deployment/sequence model`, 'unsupported_view_type', view.type));
  }
  if (ast.activeView && !viewKeys.has(ast.activeView)) semanticErrors.push(diagnostic(1, `Active architecture view "${ast.activeView}" is not declared`, 'unknown_active_view', ast.activeView));
  for (const node of ids.values()) if ((node.kind === 'container' || node.kind === 'component') && !node.technology) warnings.push(diagnostic(node.line, `${node.kind} "${node.id}" has no technology`, 'missing_technology', node.id));
  for (const edge of ast.edges) if (!edge.label) warnings.push(diagnostic(edge.line, `Relationship "${edge.id}" has no intent label`, 'missing_relationship_label', edge.id));
  return { ast, errors, semanticErrors, warnings, sourceLocations };
}
