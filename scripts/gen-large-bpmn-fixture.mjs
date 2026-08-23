// Regenerates apps/web/test/fixtures/large-4pool-manufacturing.bpm.
// Run: node scripts/gen-large-bpmn-fixture.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(root, '..', 'apps', 'web', 'test', 'fixtures', 'large-4pool-manufacturing.bpm');

const pools = [
  { name: 'Customer Portal', lanes: ['Intake', 'Order Desk'] },
  { name: 'Design Engineering', lanes: ['Spec Review', 'CAD', 'QA Sign-off'] },
  { name: 'Shop Floor', lanes: ['Fabrication', 'Assembly', 'Inspection'] },
  { name: 'Logistics', lanes: ['Packaging', 'Shipping'] },
];

const lines = ['render: manual', ''];
let nodeSeq = 0;
let edgeCount = 0;
let crossPoolCount = 0;
// poolLanes[poolIndex] is an array of lanes; each lane is an array of { id, isGateway }.
const poolLanes = pools.map(() => []);

for (const [poolIndex, pool] of pools.entries()) {
  lines.push(`pool "${pool.name}"`);
  for (const [laneIndex, lane] of pool.lanes.entries()) {
    lines.push(`  lane "${lane}"`);
    const nodesInLane = poolIndex === 0 && laneIndex === 0 ? 6 : 10;
    const laneNodeIds = [];
    for (let i = 0; i < nodesInLane; i += 1) {
      nodeSeq += 1;
      const id = `n${nodeSeq}`;
      const isFirstOverall = poolIndex === 0 && laneIndex === 0 && i === 0;
      const isGateway = i === Math.floor(nodesInLane / 2) && laneIndex > 0;
      if (isFirstOverall) {
        lines.push(`    event start none "Order received" as ${id}`);
      } else if (isGateway) {
        lines.push(`    gateway exclusive "${pool.name} check ${id}?" as ${id}`);
      } else {
        lines.push(`    task "${pool.name} step ${id}" as ${id}`);
      }
      laneNodeIds.push({ id, isGateway });
    }
    poolLanes[poolIndex].push(laneNodeIds);
  }
}

const flowEdges = [];
for (const lanes of poolLanes) {
  for (const laneNodes of lanes) {
    for (let i = 0; i < laneNodes.length - 1; i += 1) {
      flowEdges.push([laneNodes[i].id, laneNodes[i + 1].id]);
    }
  }
}
for (const lanes of poolLanes) {
  for (const laneNodes of lanes) {
    for (let i = 0; i < laneNodes.length; i += 1) {
      if (!laneNodes[i].isGateway) continue;
      if (i + 2 < laneNodes.length) flowEdges.push([laneNodes[i].id, laneNodes[i + 2].id]);
      if (i - 3 >= 0) flowEdges.push([laneNodes[i].id, laneNodes[i - 3].id]); // feedback edge
    }
  }
}

lines.push('');
for (const [from, to] of flowEdges) {
  lines.push(`${from} -> ${to}`);
  edgeCount += 1;
}

lines.push('');
for (let p = 0; p < poolLanes.length - 1; p += 1) {
  const fromLane = poolLanes[p][poolLanes[p].length - 1];
  const toLane = poolLanes[p + 1][0];
  const hops = Math.min(fromLane.length, toLane.length, 8);
  for (let i = 0; i < hops; i += 1) {
    lines.push(`${fromLane[i].id} ~> ${toLane[i].id}`);
    crossPoolCount += 1;
  }
}

writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
console.log(`nodes=${nodeSeq} sequenceEdges=${edgeCount} crossPoolEdges=${crossPoolCount}`);
