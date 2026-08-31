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
    return { id: node.id, type: c4Type(node.kind), name: node.label, ...(node.children.length ? { children: node.children.map(element) } : {}) };
  };
  const elements = ast.nodes.map(element);
  const relationships = ast.edges.map((edge) => ({ id: edge.id, sourceId: edge.sourceId, destinationId: edge.targetId, description: edge.label ?? '' }));
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

function architectureStructurizrDsl(ast: ArchitectureDiagram): string {
  const ids = structurizrIdentifiers(ast);
  const direction = structurizrDirection(ast.direction);
  const customElements = flattenArchitectureNodes(ast.nodes).filter((node) => node.kind === 'database' || node.kind === 'queue');
  const lines = [
    'workspace "Architecture diagram" "Generated from Diagram as Code" {',
    '  !impliedRelationships false',
    '  model {',
  ];

  const writeNode = (node: ArchitectureNode, indent: string) => {
    const id = ids.get(node.id)!;
    const label = escapeStructurizrString(node.label);
    if (node.kind === 'person') {
      lines.push(`${indent}${id} = person "${label}"`);
    } else if (node.kind === 'system') {
      lines.push(`${indent}${id} = softwareSystem "${label}"${node.children.length ? ' {' : ''}`);
      node.children.forEach((child) => writeNode(child, `${indent}  `));
      if (node.children.length) lines.push(`${indent}}`);
    } else if (node.kind === 'container') {
      lines.push(`${indent}${id} = container "${label}"${node.children.length ? ' {' : ''}`);
      node.children.forEach((child) => writeNode(child, `${indent}  `));
      if (node.children.length) lines.push(`${indent}}`);
    } else if (node.kind === 'component') {
      lines.push(`${indent}${id} = component "${label}"`);
    } else {
      const tag = node.kind === 'database' ? 'Database' : 'Queue';
      lines.push(`${indent}${id} = element "${label}" { tags "${tag}" }`);
    }
  };
  ast.nodes.forEach((node) => writeNode(node, '    '));
  for (const edge of ast.edges) {
    const source = ids.get(edge.sourceId);
    const target = ids.get(edge.targetId);
    if (!source || !target) continue;
    const label = edge.label === undefined ? '' : ` "${escapeStructurizrString(edge.label)}"`;
    lines.push(`    ${source} -> ${target}${label}`);
  }

  lines.push('  }', '  views {', '    systemLandscape "SystemLandscape" {', '      include *', `      autoLayout ${direction}`, '    }');
  for (const system of ast.nodes.filter((node) => node.kind === 'system')) {
    const systemId = ids.get(system.id)!;
    const systemKey = `${systemId}_context`;
    lines.push(`    systemContext ${systemId} "${systemKey}" "${escapeStructurizrString(system.label)} context" {`, '      include *', `      autoLayout ${direction}`, '    }');
    if (system.children.length) {
      lines.push(`    container ${systemId} "${systemId}_containers" "${escapeStructurizrString(system.label)} containers" {`, '      include *', `      autoLayout ${direction}`, '    }');
      for (const container of system.children.filter((node) => node.kind === 'container' && node.children.length)) {
        const containerId = ids.get(container.id)!;
        lines.push(`    component ${containerId} "${containerId}_components" "${escapeStructurizrString(container.label)} components" {`, '      include *', `      autoLayout ${direction}`, '    }');
      }
    }
  }
  if (customElements.length) {
    lines.push('    custom "CustomElements" "Data stores and queues" {', '      include *', `      autoLayout ${direction}`, '    }');
  }
  lines.push(
    '    styles {',
    '      element "Person" { shape Person background #08427b color #ffffff }',
    '      element "Software System" { shape RoundedBox background #1168bd color #ffffff }',
    '      element "Container" { shape RoundedBox background #438dd5 color #ffffff }',
    '      element "Component" { shape Component background #85bbf0 color #000000 }',
    '      element "Database" { shape Cylinder background #f5da81 color #000000 }',
    '      element "Queue" { shape Pipe background #f5da81 color #000000 }',
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
  async validate(source) { const result = parseArchitecture(source); return { valid: result.errors.length === 0 && result.semanticErrors.length === 0, errors: result.errors, semanticErrors: result.semanticErrors, warnings: result.warnings ?? [] }; },
  exportStructured(_ast, positioned, format) {
    if (format === ARCHITECTURE_C4_EXPORT_FORMAT) return architectureC4Json(_ast);
    if (format === ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT) return architectureStructurizrDsl(_ast);
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
    return exportToDrawioXml({ nodes, edges: positioned.edges.map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, label: edge.label, points: edge.points })), page: _ast.page });
  },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [ARCHITECTURE_DRAWIO_EXPORT_FORMAT, ARCHITECTURE_C4_EXPORT_FORMAT, ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT], editorMode: 'none', engineOverride: false, structuredExports: [
    { format: ARCHITECTURE_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net', roundTrip: 'none', fidelity: 'lossy' },
    { format: ARCHITECTURE_C4_EXPORT_FORMAT, label: 'C4 model JSON', mimeType: 'application/json', fileExtension: '.json', editable: true, roundTrip: 'none', fidelity: 'lossy' },
    { format: ARCHITECTURE_STRUCTURIZR_DSL_EXPORT_FORMAT, label: 'Structurizr DSL', mimeType: 'text/plain', fileExtension: '.dsl', editable: true, externalEditor: 'Structurizr Playground / Local', roundTrip: 'none', fidelity: 'lossy' },
  ] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: true, semanticValidation: true },
};
