import type { DiagramFamilyAdapter } from './types.js';
import type { DfdDiagram } from './ast.js';
import { layoutDfd, type PositionedDfd } from './layout.js';
import { parseDfd } from './parser.js';
import { renderDfd } from './render.js';
import { dfdScene } from './scene.js';

export const DFD_JSON_EXPORT_FORMAT = 'dfd-json';
export const dfdAdapter: DiagramFamilyAdapter<DfdDiagram, PositionedDfd> = {
  id: 'dfd', parse: parseDfd, layout: layoutDfd, render: renderDfd, scene: dfdScene,
  async validate(source) { const result = parseDfd(source); return { valid: result.errors.length === 0 && result.semanticErrors.length === 0, errors: result.errors, semanticErrors: result.semanticErrors, warnings: result.warnings ?? [] }; },
  exportStructured(ast, _positioned, format) { if (format !== DFD_JSON_EXPORT_FORMAT) throw new Error(`Unsupported structured export "${format}" for DFD`); return JSON.stringify(ast, null, 2); },
  capabilities: { svg: true, png: true, structuredExport: [DFD_JSON_EXPORT_FORMAT], editorMode: 'none', engineOverride: false, structuredExports: [{ format: DFD_JSON_EXPORT_FORMAT, label: 'DFD JSON', mimeType: 'application/json', fileExtension: '.json', editable: true, roundTrip: 'full', fidelity: 'lossless' }] },
  aiCapabilities: { generation: false, repair: false, visualReview: false, geometryInspection: true, semanticValidation: true },
};
