import { exportToDrawioXml, type DrawioNode } from '@bpm/export-drawio';
import type { DiagramFamilyAdapter } from './types.js';
import type { ArchitectureDiagram, ArchitectureNode } from './ast.js';
import { layoutArchitecture, type PositionedArchitecture, type PositionedArchitectureNode } from './layout.js';
import { parseArchitecture } from './parser.js';
import { renderArchitecture } from './render.js';

export const ARCHITECTURE_DRAWIO_EXPORT_FORMAT = 'architecture-drawio-xml';
export const ARCHITECTURE_C4_EXPORT_FORMAT = 'architecture-c4-json';
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
export const architectureAdapter: DiagramFamilyAdapter<ArchitectureDiagram, PositionedArchitecture> = {
  id: 'architecture', parse: parseArchitecture, layout: layoutArchitecture, render: renderArchitecture,
  exportStructured(_ast, positioned, format) {
    if (format === ARCHITECTURE_C4_EXPORT_FORMAT) return architectureC4Json(_ast);
    if (format !== ARCHITECTURE_DRAWIO_EXPORT_FORMAT) throw new Error(`Unsupported structured export "${format}" for architecture`);
    const nodes: DrawioNode[] = flatten(positioned.nodes).map((node) => ({ id: node.id, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height, shape: node.kind === 'database' ? 'cylinder' : node.kind === 'person' ? 'ellipse' : node.kind === 'queue' ? 'rounded' : node.kind === 'system' || node.kind === 'container' ? 'rounded' : 'rectangle' }));
    return exportToDrawioXml({ nodes, edges: positioned.edges.map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, label: edge.label, points: edge.points })), page: _ast.page });
  },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [ARCHITECTURE_DRAWIO_EXPORT_FORMAT, ARCHITECTURE_C4_EXPORT_FORMAT], editorMode: 'external-export', engineOverride: false, structuredExports: [
    { format: ARCHITECTURE_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net', roundTrip: 'none', fidelity: 'lossy' },
    { format: ARCHITECTURE_C4_EXPORT_FORMAT, label: 'C4 model JSON', mimeType: 'application/json', fileExtension: '.json', editable: true, roundTrip: 'none', fidelity: 'lossy' },
  ] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: true },
};
