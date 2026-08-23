import type { FlowchartDiagram } from './ast.js';
import { layoutFlowchart, type PositionedFlowchart } from './layout.js';
import { parseFlowchart } from './parser.js';
import { renderFlowchart } from './render.js';
import type { DiagramFamilyAdapter } from './types.js';
import { exportToDrawioXml, type DrawioNode } from '@bpm/export-drawio';

export const FLOWCHART_DRAWIO_EXPORT_FORMAT = 'flowchart-drawio-xml';

export const flowchartAdapter: DiagramFamilyAdapter<FlowchartDiagram, PositionedFlowchart> = {
  id: 'flowchart', parse: parseFlowchart, layout: layoutFlowchart, render: renderFlowchart,
  exportStructured(_ast, positioned, format) {
    if (format !== FLOWCHART_DRAWIO_EXPORT_FORMAT) throw new Error(`Unsupported structured export "${format}" for flowchart`);
    const nodes: DrawioNode[] = positioned.nodes.map((node) => ({ id: node.id, label: node.label, x: node.x, y: node.y, width: node.width, height: node.height, shape: node.kind === 'decision' ? 'rhombus' : 'rounded' }));
    return exportToDrawioXml({ nodes, edges: positioned.edges.map((edge) => ({ id: edge.id, source: edge.from, target: edge.to, label: edge.label, points: edge.points })), page: _ast.page });
  },
  capabilities: { svg: true, png: true, pptx: true, structuredExport: [FLOWCHART_DRAWIO_EXPORT_FORMAT], editorMode: 'external-export', engineOverride: false, structuredExports: [{ format: FLOWCHART_DRAWIO_EXPORT_FORMAT, label: 'draw.io XML', mimeType: 'application/xml', fileExtension: '.drawio', editable: true, externalEditor: 'draw.io / diagrams.net', roundTrip: 'none', fidelity: 'lossy' }] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: false, semanticValidation: true },
};
