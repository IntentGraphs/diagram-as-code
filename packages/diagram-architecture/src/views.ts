import type { ArchitectureDiagram, ArchitectureNode, ArchitectureView } from './ast.js';

function flatten(nodes: ArchitectureNode[], into: ArchitectureNode[] = []): ArchitectureNode[] {
  for (const node of nodes) {
    into.push(node);
    flatten(node.children, into);
  }
  return into;
}

function cloneNode(node: ArchitectureNode, children: ArchitectureNode[] = node.children): ArchitectureNode {
  return { ...node, ...(node.tags ? { tags: [...node.tags] } : {}), children };
}

function visibleRootsForView(ast: ArchitectureDiagram, view: ArchitectureView, byId: Map<string, ArchitectureNode>, rootById: Map<string, ArchitectureNode>): Set<string> {
  const roots = new Set<string>();
  const addRoot = (id: string | undefined) => {
    if (!id || !rootById.has(id)) return;
    const root = rootById.get(id)!;
    if (view.type === 'systemContext' && root.kind !== 'person' && root.kind !== 'system') return;
    roots.add(root.id);
  };
  if (view.include?.length) view.include.filter((id) => id !== '*').forEach(addRoot);
  if (!view.include?.length || view.include.includes('*')) {
    if (view.type === 'systemLandscape') ast.nodes.filter((node) => node.kind === 'person' || node.kind === 'system').forEach((node) => roots.add(node.id));
    else if (view.type === 'custom') ast.nodes.filter((node) => node.kind === 'database' || node.kind === 'queue').forEach((node) => roots.add(node.id));
    else if (view.focusId) {
      const focus = byId.get(view.focusId);
      if (focus) addRoot(focus.id);
      const descendants = new Set(flatten(focus ? [focus] : []).map((node) => node.id));
      for (const edge of ast.edges) {
        if (descendants.has(edge.sourceId) || descendants.has(edge.targetId)) {
          addRoot(edge.sourceId);
          addRoot(edge.targetId);
        }
      }
    } else ast.nodes.forEach((node) => roots.add(node.id));
  }
  for (const id of view.exclude ?? []) roots.delete(rootById.get(id)?.id ?? id);
  return roots;
}

function projectNode(node: ArchitectureNode, view: ArchitectureView, focusId: string | undefined, focusRootId: string | undefined): ArchitectureNode | null {
  if (view.type === 'systemLandscape' || view.type === 'systemContext' || view.type === 'custom') return cloneNode(node, []);
  if (view.type === 'container') {
    if (node.kind === 'system' && node.id === focusRootId) return cloneNode(node, node.children.filter((child) => child.kind === 'container').map((child) => cloneNode(child, [])));
    if (node.kind === 'system') return cloneNode(node, []);
    return cloneNode(node, []);
  }
  if (view.type === 'component') {
    if (node.kind === 'system' && node.id === focusRootId) {
      const selected = node.children.find((child) => child.id === focusId);
      return cloneNode(node, selected ? [cloneNode(selected)] : []);
    }
    return cloneNode(node, []);
  }
  return null;
}

function endpointForView(id: string, visible: Set<string>, byId: Map<string, ArchitectureNode>): string | undefined {
  let current = byId.get(id);
  while (current) {
    if (visible.has(current.id)) return current.id;
    current = [...byId.values()].find((node) => node.children.some((child) => child.id === current!.id));
  }
  return undefined;
}

/** Projects one canonical architecture model into a bounded C4-style view. */
export function selectArchitectureView(ast: ArchitectureDiagram): { ast: ArchitectureDiagram; view?: ArchitectureView } {
  const view = ast.activeView ? ast.views?.find((candidate) => candidate.key === ast.activeView) : ast.views?.[0];
  if (!view) return { ast };
  if (view.type === 'deployment' || view.type === 'dynamic') return { ast, view };
  const all = flatten(ast.nodes);
  const byId = new Map(all.map((node) => [node.id, node]));
  const rootById = new Map<string, ArchitectureNode>();
  for (const root of ast.nodes) for (const node of flatten([root])) rootById.set(node.id, root);
  const roots = visibleRootsForView(ast, view, byId, rootById);
  const focusRootId = view.focusId ? rootById.get(view.focusId)?.id : undefined;
  const projectedRoots = ast.nodes
    .filter((node) => roots.has(node.id))
    .map((node) => projectNode(node, view, view.focusId, focusRootId))
    .filter((node): node is ArchitectureNode => Boolean(node));
  const visible = new Set(flatten(projectedRoots).map((node) => node.id));
  const edges = ast.edges.flatMap((edge) => {
    const sourceId = endpointForView(edge.sourceId, visible, byId);
    const targetId = endpointForView(edge.targetId, visible, byId);
    if (!sourceId || !targetId || sourceId === targetId) return [];
    return [{ ...edge, sourceId, targetId }];
  });
  const uniqueEdges = edges.filter((edge, index) => edges.findIndex((candidate) => candidate.sourceId === edge.sourceId && candidate.targetId === edge.targetId && candidate.label === edge.label) === index);
  return { ast: { ...ast, nodes: projectedRoots, edges: uniqueEdges, activeView: undefined }, view };
}
