import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { toElkGraph } from './toElkGraph.js';
import { fromElkLayout } from './fromElkLayout.js';

const elk = new ELK();

/** Runs ELK layout only — no banding, no boundary-event pass. */
export async function runElkLayout(diagram: Diagram, direction = diagram.direction): Promise<PositionedDiagram> {
  const elkGraph = toElkGraph(direction && direction !== diagram.direction ? { ...diagram, direction } : diagram);
  const laidOut = await elk.layout(elkGraph);
  return fromElkLayout(diagram, laidOut as Parameters<typeof fromElkLayout>[1]);
}
