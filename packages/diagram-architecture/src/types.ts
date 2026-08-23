export interface DiagramDiagnostic { line: number; column: number; message: string; code?: string; token?: string; severity?: 'error' | 'warning'; }
export interface FamilyParseResult<Ast> { ast: Ast; errors: DiagramDiagnostic[]; semanticErrors: DiagramDiagnostic[]; }
export interface StructuredExportDescriptor { format: string; label: string; mimeType: string; fileExtension: string; editable: boolean; externalEditor?: string; roundTrip: 'none' | 'full'; fidelity: 'lossless' | 'lossy'; }
export interface DiagramFamilyAdapter<Ast, Positioned> {
  id: 'architecture';
  parse(source: string): FamilyParseResult<Ast>;
  layout(ast: Ast, options?: { engineOverride?: string; direction?: import('@bpm/ast').DiagramDirection }): Promise<Positioned>;
  render(positioned: Positioned): string;
  exportStructured?(ast: Ast, positioned: Positioned, format: string): string;
  capabilities: { svg: true; png: true; pptx?: boolean; structuredExport: string[]; editorMode: 'none' | 'external-export'; engineOverride: boolean; structuredExports?: StructuredExportDescriptor[] };
  aiCapabilities?: { generation: boolean; repair: boolean; visualReview: boolean; geometryInspection: boolean; semanticValidation: boolean };
}
