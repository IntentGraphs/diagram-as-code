import type { DiagramFamilyAdapter } from './types.js';
import type { MindmapDiagram } from './ast.js';
import { layoutMindmap, type PositionedMindmap, type PositionedMindmapNode } from './layout.js';
import { parseMindmap } from './parser.js';
import { renderMindmap } from './render.js';
import { exportToDrawioXml, type DrawioNode } from '@bpm/export-drawio';

export const MINDMAP_DRAWIO_EXPORT_FORMAT = 'mindmap-drawio-xml';

export const mindmapAdapter: DiagramFamilyAdapter<MindmapDiagram, PositionedMindmap> = {
  id: 'mindmap', parse: parseMindmap, layout: layoutMindmap, render: renderMindmap,
  exportStructured(_ast, positioned, format) {
    if (format !== MINDMAP_DRAWIO_EXPORT_FORMAT) throw new Error(`Unsupported structured export "${format}" for mindmap`);
    const nodes: DrawioNode[] = [];
    function visit(node: PositionedMindmapNode): void { nodes.push({ id: node.id, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height }); node.children.forEach(visit); }
    visit(positioned.root);
    return exportToDrawioXml({ nodes, edges: positioned.edges.map((edge) => ({ id: `${edge.from}->${edge.to}`, source: edge.from, target: edge.to, points: edge.points })), page: _ast.page });
  },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [MINDMAP_DRAWIO_EXPORT_FORMAT], editorMode: 'external-export', engineOverride: false, structuredExports: [{ format: MINDMAP_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net', roundTrip: 'none', fidelity: 'lossy' }] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: true },
};
