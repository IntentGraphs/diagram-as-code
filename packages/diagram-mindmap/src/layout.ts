import { wrapLabel, type Point } from '@bpm/render-core';
import type { DiagramDirection } from '@bpm/ast';
import type { MindmapDiagram, MindmapNode } from './ast.js';
import { MAX_DEPTH } from './limits.js';

const MIN_NODE_WIDTH = 90;
const MAX_LABEL_WIDTH = 200;
const MIN_NODE_HEIGHT = 40;
const PADDING_X = 16;
const PADDING_Y = 12;
const FONT_SIZE = 13;
const LINE_HEIGHT = FONT_SIZE * 1.25;
const COLUMN_GAP = 60;
const ROW_GAP = 16;
const CHAR_WIDTH = FONT_SIZE * 0.58;

export interface PositionedMindmapNode { id: string; label: string; labelLines: string[]; x: number; y: number; width: number; height: number; depth: number; children: PositionedMindmapNode[]; }
export interface PositionedMindmapEdge { from: string; to: string; points: Point[]; }
export interface PositionedMindmap { root: PositionedMindmapNode; edges: PositionedMindmapEdge[]; width: number; height: number; }

interface Sized { node: MindmapNode; labelLines: string[]; width: number; height: number; subtreeHeight: number; subtreeWidth: number; children: Sized[]; }

function size(node: MindmapNode): Sized {
  if (node.depth > MAX_DEPTH) throw new Error(`Mind map exceeds the maximum nesting depth of ${MAX_DEPTH} levels`);
  // Render using these exact lines. Keeping wrapping in the sizing pass prevents the box and
  // label passes from drifting apart at the maximum-width boundary.
  const lines = wrapLabel(node.label, MAX_LABEL_WIDTH - PADDING_X, FONT_SIZE);
  const width = Math.max(MIN_NODE_WIDTH, Math.min(MAX_LABEL_WIDTH, Math.max(...lines.map((line) => line.length * CHAR_WIDTH)) + PADDING_X));
  const height = Math.max(MIN_NODE_HEIGHT, lines.length * LINE_HEIGHT + PADDING_Y);
  const children = node.children.map(size);
  const childSubtreeHeight = children.reduce((sum, child) => sum + child.subtreeHeight, 0);
  const childSubtreeWidth = children.reduce((sum, child) => sum + child.subtreeWidth, 0) + Math.max(0, children.length - 1) * ROW_GAP;
  const subtreeHeight = children.length === 0 ? height + ROW_GAP : Math.max(height + ROW_GAP, childSubtreeHeight);
  const subtreeWidth = children.length === 0 ? width : Math.max(width, childSubtreeWidth);
  return { node, labelLines: lines, width, height, subtreeHeight, subtreeWidth, children };
}

export async function layoutMindmap(ast: MindmapDiagram, options?: { direction?: DiagramDirection }): Promise<PositionedMindmap> {
  const sized = size(ast.root);
  const direction = options?.direction ?? ast.direction ?? 'right';
  const maxDepth = ast.maxDepth;
  const levelWidths = new Map<number, number>();
  function collectWidths(entry: Sized): void { levelWidths.set(entry.node.depth, Math.max(levelWidths.get(entry.node.depth) ?? 0, entry.width)); entry.children.forEach(collectWidths); }
  collectWidths(sized);
  const columnWidths = Array.from({ length: maxDepth + 1 }, (_, depth) => levelWidths.get(depth) ?? MIN_NODE_WIDTH);
  const columnOffsets = columnWidths.reduce<number[]>((offsets, _, index) => { offsets.push(index === 0 ? 0 : offsets[index - 1] + columnWidths[index - 1] + COLUMN_GAP); return offsets; }, []);
  const totalColumnsWidth = columnOffsets[maxDepth] + columnWidths[maxDepth];
  const maxNodeHeight = Math.max(sized.height, ...sized.children.flatMap(function heights(child): number[] { return [child.height, ...child.children.flatMap(heights)]; }));
  const layerHeight = maxNodeHeight + COLUMN_GAP;
  const width = direction === 'right' || direction === 'left' ? totalColumnsWidth : sized.subtreeWidth;
  const height = direction === 'right' || direction === 'left' ? Math.round(sized.subtreeHeight) : (maxDepth + 1) * layerHeight;

  function placeHorizontal(current: Sized, top: number): PositionedMindmapNode {
    const childNodes: PositionedMindmapNode[] = [];
    let cursor = top;
    for (const child of current.children) {
      const placed = placeHorizontal(child, cursor);
      childNodes.push(placed);
      cursor += child.subtreeHeight;
    }
    const x = columnOffsets[current.node.depth];
    return { id: current.node.id, label: current.node.label, labelLines: current.labelLines, x, y: Math.round(top + current.subtreeHeight / 2 - current.height / 2), width: current.width, height: current.height, depth: current.node.depth, children: childNodes };
  }

  function placeVertical(current: Sized, left: number): PositionedMindmapNode {
    const childNodes: PositionedMindmapNode[] = [];
    const childWidth = current.children.reduce((sum, child) => sum + child.subtreeWidth, 0) + Math.max(0, current.children.length - 1) * ROW_GAP;
    let cursor = left + (current.subtreeWidth - childWidth) / 2;
    for (const child of current.children) {
      childNodes.push(placeVertical(child, cursor));
      cursor += child.subtreeWidth + ROW_GAP;
    }
    return { id: current.node.id, label: current.node.label, labelLines: current.labelLines, x: Math.round(left + (current.subtreeWidth - current.width) / 2), y: current.node.depth * layerHeight, width: current.width, height: current.height, depth: current.node.depth, children: childNodes };
  }

  const root = direction === 'right' || direction === 'left' ? placeHorizontal(sized, 0) : placeVertical(sized, 0);
  const mirrorX = direction === 'left';
  const mirrorY = direction === 'up';
  function orient(node: PositionedMindmapNode): void {
    if (mirrorX) node.x = width - columnOffsets[node.depth] - columnWidths[node.depth];
    if (mirrorY) node.y = height - node.y - node.height;
    node.children.forEach(orient);
  }
  orient(root);

  const edges: PositionedMindmapEdge[] = [];
  function connect(node: PositionedMindmapNode): void {
    for (const child of node.children) {
      const horizontal = direction === 'right' || direction === 'left';
      if (horizontal) {
        const fromX = direction === 'right' ? node.x + node.width : node.x;
        const toX = direction === 'right' ? child.x : child.x + child.width;
        const fromY = node.y + node.height / 2;
        const toY = child.y + child.height / 2;
        edges.push({ from: node.id, to: child.id, points: [{ x: fromX, y: fromY }, { x: Math.round((fromX + toX) / 2), y: toY }, { x: toX, y: toY }] });
      } else {
        const fromY = direction === 'down' ? node.y + node.height : node.y;
        const toY = direction === 'down' ? child.y : child.y + child.height;
        const fromX = node.x + node.width / 2;
        const toX = child.x + child.width / 2;
        edges.push({ from: node.id, to: child.id, points: [{ x: fromX, y: fromY }, { x: toX, y: Math.round((fromY + toY) / 2) }, { x: toX, y: toY }] });
      }
      connect(child);
    }
  }
  connect(root);
  return { root, edges, width, height };
}
