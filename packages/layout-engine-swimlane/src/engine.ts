import type { Diagram } from '@bpm/ast';
import type { LayoutEngine, PositionedDiagram } from '@bpm/layout-core';
import { runElkLayout } from '@bpm/layout-elk-base';
import { bandLanes } from './laneBanding.js';

export const swimlaneEngine: LayoutEngine = {
  name: 'swimlane',
  matches(diagram: Diagram): boolean {
    return diagram.pools.some((p) => p.lanes.length > 0);
  },
  async layout(diagram: Diagram): Promise<PositionedDiagram> {
    const positioned = await runElkLayout(diagram);
    return bandLanes(diagram, positioned);
  },
};
