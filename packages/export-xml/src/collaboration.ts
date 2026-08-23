import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import { escapeXml } from './xml.js';

export function collaborationXml(
  diagram: Diagram,
  renderProcess: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
  edgeId: (id: string) => string = (id) => id,
): { collaboration: string; processes: string } {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const laneNodeIds = new Set(diagram.pools.flatMap((p) => p.lanes.flatMap((l) => l.nodeIds)));
  const poolIdByNodeId = new Map(
    diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds.map((id) => [id, pool.id] as const))),
  );
  const isMessageFlow = (edge: DiagramEdge) => {
    const sourcePoolId = poolIdByNodeId.get(edge.sourceId);
    const targetPoolId = poolIdByNodeId.get(edge.targetId);
    return edge.flowType === 'message'
      || (sourcePoolId !== undefined && targetPoolId !== undefined && sourcePoolId !== targetPoolId);
  };

  const participants = diagram.pools.map((pool) => {
    const pid = escapeXml(pool.id);
    return `<bpmn2:participant id="participant_${pid}" name="${escapeXml(pool.name)}" processRef="process_${pid}"/>`;
  }).join('');
  const messageFlows = diagram.edges
    .filter(isMessageFlow)
    .map((e) => `<bpmn2:messageFlow id="${escapeXml(edgeId(e.id))}" sourceRef="${escapeXml(e.sourceId)}" targetRef="${escapeXml(e.targetId)}"/>`)
    .join('');

  const processes = diagram.pools.map((pool) => {
    const poolNodes = pool.lanes.flatMap((l) => l.nodeIds).map((id) => nodeById.get(id)!).filter(Boolean);
    const poolEdges = diagram.edges.filter(
      (e) => !isMessageFlow(e) && laneNodeIds.has(e.sourceId) && laneNodeIds.has(e.targetId)
        && poolNodes.some((n) => n.id === e.sourceId),
    );
    const pid = escapeXml(pool.id);
    const laneSet = `<bpmn2:laneSet id="laneSet_${pid}">${pool.lanes.map((lane) =>
      `<bpmn2:lane id="${escapeXml(lane.id)}" name="${escapeXml(lane.name)}">${lane.nodeIds.map((id) => `<bpmn2:flowNodeRef>${escapeXml(id)}</bpmn2:flowNodeRef>`).join('')}</bpmn2:lane>`
    ).join('')}</bpmn2:laneSet>`;
    return `<bpmn2:process id="process_${pid}" isExecutable="false">${laneSet}${renderProcess(poolNodes, poolEdges)}</bpmn2:process>`;
  }).join('');

  return {
    collaboration: `<bpmn2:collaboration id="collaboration1">${participants}${messageFlows}</bpmn2:collaboration>`,
    processes,
  };
}
