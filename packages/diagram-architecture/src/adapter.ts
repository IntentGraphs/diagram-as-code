import { exportToDrawioXml, type DrawioNode } from '@bpm/export-drawio';
import type { DiagramFamilyAdapter } from './types.js';
import type { ArchitectureDiagram, ArchitectureNode } from './ast.js';
import { layoutArchitecture, type PositionedArchitecture, type PositionedArchitectureNode } from './layout.js';
import { parseArchitecture } from './parser.js';
import { renderArchitecture } from './render.js';
import { architectureScene } from './scene.js';

export const ARCHITECTURE_DRAWIO_EXPORT_FORMAT = 'architecture-drawio-xml';
export const ARCHITECTURE_C4_EXPORT_FORMAT = 'architecture-c4-json';
export const ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT = 'architecture-structurizr-dsl';
function flatten(nodes: PositionedArchitectureNode[], into: PositionedArchitectureNode[] = []): PositionedArchitectureNode[] { for (const node of nodes) { into.push(node); flatten(node.children, into); } return into; }
interface C4Element {
  id: string;
  type: 'Person' | 'SoftwareSystem' | 'Container' | 'Component' | 'Database' | 'Queue';
  name: string;
  description?: string;
  technology?: string;
  tags?: string[];
  external?: boolean;
  group?: string;
  children?: C4Element[];
}

function c4Type(kind: ArchitectureNode['kind']): C4Element['type'] {
  if (kind === 'person') return 'Person';
  if (kind === 'system') return 'SoftwareSystem';
  if (kind === 'container') return 'Container';
  if (kind === 'component') return 'Component';
  if (kind === 'database') return 'Database';
  return 'Queue';
}

function architectureC4Json(ast: ArchitectureDiagram): string {
  const element = (node: ArchitectureNode): C4Element => {
    return { id: node.id, type: c4Type(node.kind), name: node.label, ...(node.description ? { description: node.description } : {}), ...(node.technology ? { technology: node.technology } : {}), ...(node.tags ? { tags: node.tags } : {}), ...(node.external !== undefined ? { external: node.external } : {}), ...(node.group ? { group: node.group } : {}), ...(node.children.length ? { children: node.children.map(element) } : {}) };
  };
  const elements = ast.nodes.map(element);
  const relationships = ast.edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceId, destinationId: edge.targetId, description: edge.label ?? '', ...(edge.technology ? { technology: edge.technology } : {}), ...(edge.protocol ? { protocol: edge.protocol } : {}), ...(edge.tags ? { tags: edge.tags } : {}) }));
  return JSON.stringify({ elements, relationships, metadata: { c4Profile: 'architecture-v1' } }, null, 2);
}

function escapeStructurizrString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}

function structurizrDirection(direction: ArchitectureDiagram['direction']): 'tb' | 'bt' | 'lr' | 'rl' {
  if (direction === 'left') return 'rl';
  if (direction === 'down') return 'tb';
  if (direction === 'up') return 'bt';
  return 'lr';
}

function structurizrIdentifiers(ast: ArchitectureDiagram): Map<string, string> {
  const identifiers = new Map<string, string>();
  const used = new Set<string>();
  const assign = (node: ArchitectureNode) => {
    const base = `n_${node.id.replace(/[^A-Za-z0-9_]/g, '_')}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}_${suffix++}`;
    used.add(candidate);
    identifiers.set(node.id, candidate);
    node.children.forEach(assign);
  };
  ast.nodes.forEach(assign);
  return identifiers;
}

function flattenArchitectureNodes(nodes: ArchitectureNode[], into: ArchitectureNode[] = []): ArchitectureNode[] {
  for (const node of nodes) {
    into.push(node);
    flattenArchitectureNodes(node.children, into);
  }
  return into;
}

function architectureStructurizrDsl(ast: ArchitectureDiagram, positioned?: PositionedArchitecture): string {
  const ids = structurizrIdentifiers(ast);
  const direction = structurizrDirection(positioned?.direction ?? ast.direction);
  const customElements = flattenArchitectureNodes(ast.nodes).filter((node) => node.kind === 'database' || node.kind === 'queue');
  const lines = [
    `workspace "${escapeStructurizrString(ast.title ?? 'Architecture diagram')}" "${escapeStructurizrString(ast.description ?? 'Generated from Diagram as Code')}" {`,
    '  !impliedRelationships false',
    '  model {',
  ];

  const writeNode = (node: ArchitectureNode, indent: string) => {
    const id = ids.get(node.id)!;
    const label = escapeStructurizrString(node.label);
    const tags = [...(node.tags ?? []), ...(node.external ? ['External'] : []), ...(node.group ? [`Group:${node.group}`] : [])];
    const metadata = [
      ...(node.description ? [`description "${escapeStructurizrString(node.description)}"`] : []),
      ...(node.technology && (node.kind === 'container' || node.kind === 'component') ? [`technology "${escapeStructurizrString(node.technology)}"`] : []),
      ...(tags.length ? [`tags "${tags.map(escapeStructurizrString).join(',')}"`] : []),
    ];
    const hasBody = node.children.length > 0 || metadata.length > 0;
    const open = (keyword: string) => lines.push(`${indent}${id} = ${keyword} "${label}"${hasBody ? ' {' : ''}`);
    if (node.kind === 'person') {
      open('person');
      metadata.forEach((entry) => lines.push(`${indent}  ${entry}`));
    } else if (node.kind === 'system') {
      open('softwareSystem');
      metadata.forEach((entry) => lines.push(`${indent}  ${entry}`));
      node.children.forEach((child) => writeNode(child, `${indent}  `));
      if (hasBody) lines.push(`${indent}}`);
    } else if (node.kind === 'container') {
      open('container');
      metadata.forEach((entry) => lines.push(`${indent}  ${entry}`));
      node.children.forEach((child) => writeNode(child, `${indent}  `));
      if (hasBody) lines.push(`${indent}}`);
    } else if (node.kind === 'component') {
      open('component');
      metadata.forEach((entry) => lines.push(`${indent}  ${entry}`));
    } else {
      const tag = node.kind === 'database' ? 'Database' : 'Queue';
      lines.push(`${indent}${id} = element "${label}" { tags "${[tag, ...tags].map(escapeStructurizrString).join(',')}" }`);
    }
    if (hasBody && (node.kind === 'person' || node.kind === 'component')) lines.push(`${indent}}`);
  };
  ast.nodes.forEach((node) => writeNode(node, '    '));
  for (const edge of ast.edges) {
    const source = ids.get(edge.sourceId);
    const target = ids.get(edge.targetId);
    if (!source || !target) continue;
    const label = edge.label === undefined ? '' : ` "${escapeStructurizrString(edge.label)}"`;
    const technology = edge.protocol ?? edge.technology;
    const technologyPart = technology ? ` "${escapeStructurizrString(technology)}"` : '';
    const tags = edge.tags?.length ? ` { tags "${edge.tags.map(escapeStructurizrString).join(',')}" }` : '';
    lines.push(`    ${source} -> ${target}${label}${technologyPart}${tags}`);
  }

  lines.push('  }', '  views {');
  const writeView = (view: NonNullable<ArchitectureDiagram['views']>[number]) => {
    if (view.type === 'deployment' || view.type === 'dynamic') return;
    const viewDirection = structurizrDirection(view.direction ?? ast.direction);
    const focus = view.focusId ? ` ${ids.get(view.focusId) ?? view.focusId}` : '';
    const title = view.title ? ` "${escapeStructurizrString(view.title)}"` : '';
    const keyword = view.type === 'systemLandscape' ? 'systemLandscape' : view.type;
    lines.push(`    ${keyword}${focus} "${escapeStructurizrString(view.key)}"${title} {`);
    const includes = view.include?.length ? view.include.map((id) => id === '*' ? '*' : ids.get(id) ?? id) : ['*'];
    lines.push(`      include ${includes.join(' ')}`);
    for (const id of view.exclude ?? []) lines.push(`      exclude ${ids.get(id) ?? id}`);
    lines.push(`      autoLayout ${viewDirection}`, '    }');
  };
  if (ast.views?.length) ast.views.forEach(writeView);
  else {
    writeView({ key: 'SystemLandscape', type: 'systemLandscape' });
    for (const system of ast.nodes.filter((node) => node.kind === 'system')) {
      const systemId = ids.get(system.id)!;
      writeView({ key: `${systemId}_context`, type: 'systemContext', focusId: system.id, title: `${system.label} context` });
      if (system.children.length) {
        writeView({ key: `${systemId}_containers`, type: 'container', focusId: system.id, title: `${system.label} containers` });
        for (const container of system.children.filter((node) => node.kind === 'container' && node.children.length)) writeView({ key: `${ids.get(container.id)!}_components`, type: 'component', focusId: container.id, title: `${container.label} components` });
      }
    }
  }
  const palette = ast.theme === 'high-contrast'
    ? { person: '#003b5c', system: '#005a8d', container: '#007c91', component: '#b9e6ff', data: '#ffe08a' }
    : { person: '#08427b', system: '#1168bd', container: '#438dd5', component: '#85bbf0', data: '#f5da81' };
  if (customElements.length && !ast.views?.some((view) => view.type === 'custom')) {
    lines.push('    custom "CustomElements" "Data stores and queues" {', '      include *', `      autoLayout ${direction}`, '    }');
  }
  lines.push(
    '    styles {',
    `      element "Person" { shape Person background ${palette.person} color #ffffff }`,
    `      element "Software System" { shape RoundedBox background ${palette.system} color #ffffff }`,
    `      element "Container" { shape RoundedBox background ${palette.container} color #ffffff }`,
    `      element "Component" { shape Component background ${palette.component} color #000000 }`,
    `      element "Database" { shape Cylinder background ${palette.data} color #000000 }`,
    `      element "Queue" { shape Pipe background ${palette.data} color #000000 }`,
    '      relationship "Relationship" { routing Orthogonal color #555555 }',
    '    }',
    '  }',
    '}',
    '',
  );
  return lines.join('\n');
}

export const architectureAdapter: DiagramFamilyAdapter<ArchitectureDiagram, PositionedArchitecture> = {
  id: 'architecture', parse: parseArchitecture, layout: layoutArchitecture, render: renderArchitecture, scene: architectureScene,
  async validate(source, options) {
    const result = parseArchitecture(source);
    if (result.errors.length > 0 || result.semanticErrors.length > 0) return { valid: false, errors: result.errors, semanticErrors: result.semanticErrors, warnings: result.warnings ?? [] };
    const positioned = await layoutArchitecture(result.ast, options);
    const layoutWarnings = positioned.edges.filter((edge) => edge.labelPlacement === 'fallback').map((edge) => ({ line: 1, column: 1, message: `Relationship "${edge.id}" label used a fallback position after all preferred positions collided`, code: 'label_placement_fallback', severity: 'warning' as const }));
    return { valid: true, errors: [], semanticErrors: [], warnings: [...(result.warnings ?? []), ...layoutWarnings] };
  },
  exportStructured(_ast, positioned, format) {
    if (format === ARCHITECTURE_C4_EXPORT_FORMAT) return architectureC4Json(_ast);
    if (format === ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT) return architectureStructurizrDsl(_ast, positioned);
    if (format !== ARCHITECTURE_DRAWIO_EXPORT_FORMAT) throw new Error(`Unsupported structured export "${format}" for architecture`);
    const nodes: DrawioNode[] = flatten(positioned.nodes).map((node) => ({
      id: node.id,
      label: node.label,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      parentId: node.parentId,
      container: node.children.length > 0,
      metadata: { architectureKind: node.kind },
      shape: node.kind === 'database' ? 'cylinder' : node.kind === 'person' ? 'ellipse' : node.kind === 'queue' ? 'rounded' : 'rectangle',
    }));
    return exportToDrawioXml({ nodes, edges: positioned.edges.map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, label: edge.displayLabel ?? edge.label, points: edge.points })), page: _ast.page });
  },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [ARCHITECTURE_DRAWIO_EXPORT_FORMAT, ARCHITECTURE_C4_EXPORT_FORMAT, ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT], editorMode: 'none', engineOverride: false, structuredExports: [
    { format: ARCHITECTURE_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net', roundTrip: 'none', fidelity: 'lossy' },
    { format: ARCHITECTURE_C4_EXPORT_FORMAT, label: 'C4 model JSON', mimeType: 'application/json', fileExtension: '.json', editable: true, roundTrip: 'none', fidelity: 'lossy' },
    { format: ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT, label: 'Structurizr DSL', mimeType: 'text/plain', fileExtension: '.dsl', editable: true, externalEditor: 'Structurizr Playground / Local', roundTrip: 'none', fidelity: 'lossy' },
  ] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: true, semanticValidation: true },
};
