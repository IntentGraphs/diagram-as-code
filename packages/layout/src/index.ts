import type { Diagram, RoutingMode } from '@bpm/ast';
import type { DiagramDirection, LaneDirection } from '@bpm/ast';
import {
  registerEngine,
  selectEngine,
  getEngineByName,
  positionBoundaryEvents,
  overridePinnedNodes,
  type PositionedDiagram,
} from '@bpm/layout-core';
import { swimlaneEngine } from '@bpm/layout-engine-swimlane';
import { flatEngine } from '@bpm/layout-engine-flat';
import { layoutManual } from '@bpm/layout-engine-manual';

/** Re-registers defaults so layout still works after tests call clearEngines(). */
function ensureDefaultEngines(): void {
  registerEngine(swimlaneEngine);
  registerEngine(flatEngine);
}

ensureDefaultEngines();

export interface LayoutOptions {
  /**
   * Forces a specific registered engine by name, overriding both the diagram's own
   * `layout:` directive and auto-detect. Throws the same "Unknown layout engine"
   * error as an unrecognized `layout:` directive if no engine with that name exists.
   * Ignored (and meaningless) when `diagram.positioning === 'manual'`.
   */
  engineOverride?: string;
  /** Shared direction contract forwarded by the runtime; family engines consume supported options. */
  direction?: DiagramDirection;
  laneDirection?: LaneDirection;
  /** Overrides the diagram's routing profile for this layout invocation. */
  routing?: RoutingMode;
}

export async function layout(diagram: Diagram, options?: LayoutOptions): Promise<PositionedDiagram> {
  if (diagram.positioning === 'manual') {
    const positioned = await layoutManual(diagram);
    return positionBoundaryEvents(diagram, positioned);
  }
  ensureDefaultEngines();
  const routedDiagram: Diagram = {
    ...diagram,
    ...(options?.direction ? { direction: options.direction } : {}),
    ...(options?.routing ? { routing: options.routing } : {}),
  };
  const engine = options?.engineOverride ? getEngineByName(options.engineOverride) : selectEngine(routedDiagram);

  const pinnedIds = new Set(routedDiagram.nodes.filter((n) => n.position).map((n) => n.id));
  if (pinnedIds.size === 0) {
    const positioned = await engine.layout(options?.laneDirection && routedDiagram.laneDirection !== options.laneDirection
      ? { ...routedDiagram, laneDirection: options.laneDirection }
      : routedDiagram);
    return positionBoundaryEvents(routedDiagram, positioned);
  }

  const strippedDiagram: Diagram = {
    ...routedDiagram,
    nodes: routedDiagram.nodes.map((n) => {
      if (!pinnedIds.has(n.id)) return n;
      const { position: _removed, ...rest } = n as typeof n & { position?: { x: number; y: number } };
      return rest as typeof n;
    }),
  };
  const autoPositioned = await engine.layout(options?.laneDirection && strippedDiagram.laneDirection !== options.laneDirection
    ? { ...strippedDiagram, laneDirection: options.laneDirection }
    : strippedDiagram);
  const overridden = overridePinnedNodes(routedDiagram, autoPositioned);
  return positionBoundaryEvents(routedDiagram, overridden);
}

export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from '@bpm/layout-core';

export { selectEngine, getEngineByName } from '@bpm/layout-core';
