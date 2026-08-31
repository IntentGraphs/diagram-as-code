import { fitGeometryToPage, MIN_PAGE_SCALE, type PageSpec } from '@bpm/diagram-core';

export type DrawioShape = 'rectangle' | 'rounded' | 'ellipse' | 'rhombus' | 'cylinder';
export interface DrawioPoint { x: number; y: number; }
export interface DrawioNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: DrawioShape;
  /** Optional semantic parent. Coordinates remain absolute until page fitting is complete. */
  parentId?: string;
  /** Optional application metadata preserved as XML attributes on the cell. */
  metadata?: Record<string, string>;
  /** Renders this node as a draw.io container that can own child cells. */
  container?: boolean;
}
export interface DrawioEdge { id: string; source: string; target: string; label?: string; points?: DrawioPoint[]; }
export interface DrawioExportInput { nodes: DrawioNode[]; edges: DrawioEdge[]; page?: PageSpec; }
const escapeXml = (value: string): string => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '\uFFFD')
  .replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const number = (value: number): string => Number.isFinite(value) ? String(value) : '0';
function styleFor(shape: DrawioShape = 'rectangle'): string {
  let prefix: string;
  switch (shape) {
    case 'rectangle': prefix = 'rounded=0;'; break;
    case 'rounded': prefix = 'rounded=1;'; break;
    case 'ellipse': prefix = 'shape=ellipse;'; break;
    case 'rhombus': prefix = 'shape=rhombus;'; break;
    case 'cylinder': prefix = 'shape=cylinder3;'; break;
    default: throw new Error(`Unsupported draw.io shape "${String(shape)}"`);
  }
  return `${prefix}whiteSpace=wrap;html=1;`;
}
function attributesFor(metadata: Record<string, string> | undefined): string {
  return Object.entries(metadata ?? {})
    .filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(key) && typeof value === 'string')
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
}
export function exportToDrawioXml(input: DrawioExportInput): string {
  const nodeIds = new Set<string>();
  for (const node of input.nodes) {
    if (node.id === '0' || node.id === '1' || nodeIds.has(node.id)) throw new Error(`Duplicate or reserved draw.io node id "${node.id}"`);
    if (node.parentId && node.parentId === node.id) throw new Error(`Draw.io node "${node.id}" cannot be its own parent`);
    nodeIds.add(node.id);
  }
  for (const node of input.nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) throw new Error(`Draw.io node "${node.id}" references a missing parent`);
  }
  const edgeIds = new Set<string>();
  for (const edge of input.edges) { if (edge.id === '0' || edge.id === '1' || nodeIds.has(edge.id) || edgeIds.has(edge.id)) throw new Error(`Duplicate or reserved draw.io edge id "${edge.id}"`); if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Draw.io edge "${edge.id}" references a missing node`); edgeIds.add(edge.id); }
  const fitted = input.page ? fitGeometryToPage(input.nodes, input.edges, input.page) : {
    nodes: input.nodes,
    edges: input.edges,
    pageWidth: undefined,
    pageHeight: undefined,
    scale: 1,
  };
  if (input.page?.fit === 'strict' && fitted.scale < MIN_PAGE_SCALE) {
    throw new Error(`Diagram is too dense for the declared draw.io page at a readable scale (scale ${fitted.scale.toFixed(3)} is below ${MIN_PAGE_SCALE})`);
  }
  const fittedById = new Map(fitted.nodes.map((node) => [node.id, node]));
  const localPosition = (node: typeof fitted.nodes[number]): { x: number; y: number } => {
    const parent = node.parentId ? fittedById.get(node.parentId) : undefined;
    return parent ? { x: node.x - parent.x, y: node.y - parent.y } : { x: node.x, y: node.y };
  };
  const cells = fitted.nodes.map((node) => {
    const position = localPosition(node);
    const parent = node.parentId ?? '1';
    const style = node.container
      ? 'swimlane;startSize=30;horizontal=1;container=1;collapsible=1;whiteSpace=wrap;html=1;'
      : styleFor(node.shape);
    const metadata = attributesFor(node.metadata);
    return `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}"${metadata} style="${style}" vertex="1" parent="${escapeXml(parent)}"><mxGeometry x="${number(position.x)}" y="${number(position.y)}" width="${number(node.width)}" height="${number(node.height)}" as="geometry" /></mxCell>`;
  });
  const edges = fitted.edges.map((edge) => { const points = edge.points?.length ? `<Array as="points">${edge.points.map((point) => `<mxPoint x="${number(point.x)}" y="${number(point.y)}" />`).join('')}</Array>` : ''; return `<mxCell id="${escapeXml(edge.id)}" value="${escapeXml(edge.label ?? '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`; });
  const pageAttributes = input.page ? ` page="1" pageScale="1" pageWidth="${number(fitted.pageWidth!)}" pageHeight="${number(fitted.pageHeight!)}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="drawio" version="1.0"><diagram name="Page-1"><mxGraphModel${pageAttributes}><root><mxCell id="0" /><mxCell id="1" parent="0" />${[...cells, ...edges].join('')}</root></mxGraphModel></diagram></mxfile>`;
}
