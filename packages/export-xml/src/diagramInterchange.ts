import type { PositionedNode, PositionedPool, PositionedLane, RoutedEdge } from '@bpm/layout-core';
import { escapeXml } from './xml.js';

export function shapeXml(node: PositionedNode, edgeId: (id: string) => string = (id) => id): string {
  const id = escapeXml(node.id);
  const own = `<bpmndi:BPMNShape id="shape_${id}" bpmnElement="${id}"><dc:Bounds x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/></bpmndi:BPMNShape>`;
  const children = (node.children ?? []).map((child) => shapeXml(child, edgeId)).join('');
  const childEdges = (node.childEdges ?? []).map((edge) => edgeXml(edge, edgeId(edge.id))).join('');
  return own + children + childEdges;
}

export function edgeXml(edge: RoutedEdge, bpmnElement = edge.id): string {
  if (edge.points.length < 2) return '';
  const el = escapeXml(bpmnElement);
  const waypoints = edge.points.map((p) => `<di:waypoint x="${p.x}" y="${p.y}"/>`).join('');
  return `<bpmndi:BPMNEdge id="shape_${el}" bpmnElement="${el}">${waypoints}</bpmndi:BPMNEdge>`;
}

export function poolShapeXml(pool: PositionedPool): string {
  const id = escapeXml(pool.id);
  const own = `<bpmndi:BPMNShape id="shape_${id}" bpmnElement="participant_${id}" isHorizontal="true"><dc:Bounds x="${pool.x}" y="${pool.y}" width="${pool.width}" height="${pool.height}"/></bpmndi:BPMNShape>`;
  const lanes = pool.lanes.map((lane) => laneShapeXml(lane)).join('');
  return own + lanes;
}

export function laneShapeXml(lane: PositionedLane): string {
  const id = escapeXml(lane.id);
  return `<bpmndi:BPMNShape id="shape_${id}" bpmnElement="${id}" isHorizontal="true"><dc:Bounds x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}"/></bpmndi:BPMNShape>`;
}
