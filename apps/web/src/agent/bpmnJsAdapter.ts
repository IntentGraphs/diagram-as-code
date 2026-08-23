import type { AgentDiagramState, AgentEdgeSnapshot, AgentNodeSnapshot, AgentPoint, DiagramAction } from './diagramActions.js';
import type { DiagramAgentAdapter } from './diagramAgent.js';
import { chooseRoute } from './routes.js';

interface BpmnElement {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parent?: BpmnElement;
  source?: BpmnElement;
  target?: BpmnElement;
  waypoints?: AgentPoint[];
  businessObject?: { name?: string; $type?: string };
  children?: BpmnElement[];
}

interface BpmnModelerLike {
  get<T = unknown>(name: string): T;
}

interface BpmnCommandStack {
  undo(): void;
  _stackIdx?: number;
}

interface BpmnModeling {
  createShape(shape: Record<string, unknown>, position: AgentPoint, target: BpmnElement): BpmnElement;
  createConnection(source: BpmnElement, target: BpmnElement, connection: Record<string, unknown>, parent: BpmnElement): BpmnElement;
  moveShape(shape: BpmnElement, delta: AgentPoint): void;
  resizeShape(shape: BpmnElement, bounds: { x: number; y: number; width: number; height: number }): void;
  updateLabel(element: BpmnElement, label: string): void;
  updateWaypoints(connection: BpmnElement, waypoints: AgentPoint[]): void;
  removeElements(elements: BpmnElement[]): void;
}

interface BpmnRegistry {
  get(id: string): BpmnElement | undefined;
  getAll(): BpmnElement[];
}

interface BpmnCanvas {
  getRootElement(): BpmnElement;
}

function isLabel(element: BpmnElement): boolean {
  return element.type === 'label' || element.businessObject?.$type === 'bpmn:Label';
}

function isConnection(element: BpmnElement): boolean {
  return Boolean(element.source && element.target && element.waypoints);
}

function isContainer(element: BpmnElement): boolean {
  return element.type === 'bpmn:Participant' || element.type === 'bpmn:Lane' || element.type === 'bpmn:SubProcess';
}

function shapeSnapshot(element: BpmnElement): AgentNodeSnapshot {
  return {
    id: element.id,
    type: element.type ?? element.businessObject?.$type ?? 'unknown',
    label: element.businessObject?.name ?? '',
    x: element.x ?? 0,
    y: element.y ?? 0,
    width: element.width ?? 0,
    height: element.height ?? 0,
    ...(element.parent?.id ? { parentId: element.parent.id } : {}),
    container: isContainer(element),
  };
}

function edgeSnapshot(element: BpmnElement): AgentEdgeSnapshot {
  return {
    id: element.id,
    type: element.type ?? element.businessObject?.$type ?? 'unknown',
    sourceId: element.source!.id,
    targetId: element.target!.id,
    points: (element.waypoints ?? []).map((point) => ({ x: point.x, y: point.y })),
  };
}

function shapeTypeForAction(type: string): string {
  if (type === 'bpmn:UserTask' || type === 'bpmn:ServiceTask') return type;
  return type;
}

export function createBpmnJsAdapter(modeler: BpmnModelerLike): DiagramAgentAdapter {
  const modeling = modeler.get<BpmnModeling>('modeling');
  const registry = modeler.get<BpmnRegistry>('elementRegistry');
  const canvas = modeler.get<BpmnCanvas>('canvas');
  const commandStack = modeler.get<BpmnCommandStack>('commandStack');
  const actionCommandCounts: number[] = [];

  function requireElement(id: string): BpmnElement {
    const element = registry.get(id);
    if (!element) throw new Error(`Diagram element “${id}” was not found`);
    return element;
  }

  function getState(): AgentDiagramState {
      const elements = registry.getAll().filter((element) => !isLabel(element));
      return {
        nodes: elements.filter((element) => !isConnection(element)).map(shapeSnapshot),
        edges: elements.filter(isConnection).map(edgeSnapshot),
      };
  }

  function applyActionInternal(action: DiagramAction): void {
      if (action.type === 'createShape') {
        if (registry.get(action.id)) throw new Error(`Diagram element “${action.id}” already exists`);
        const parent = action.parentId ? requireElement(action.parentId) : canvas.getRootElement();
        const shape = modeling.createShape({ id: action.id, type: shapeTypeForAction(action.shapeType) }, { x: action.x, y: action.y }, parent);
        if (action.width && action.height) modeling.resizeShape(shape, { x: action.x, y: action.y, width: action.width, height: action.height });
        if (action.label !== undefined) modeling.updateLabel(shape, action.label);
        return;
      }

      if (action.type === 'moveShape') {
        const shape = requireElement(action.id);
        modeling.moveShape(shape, { x: action.x - (shape.x ?? 0), y: action.y - (shape.y ?? 0) });
        return;
      }

      if (action.type === 'updateLabel') {
        modeling.updateLabel(requireElement(action.id), action.label);
        return;
      }

      if (action.type === 'connect') {
        const source = requireElement(action.sourceId);
        const target = requireElement(action.targetId);
        const parent = source.parent && source.parent === target.parent ? source.parent : canvas.getRootElement();
        const connection = modeling.createConnection(source, target, { id: action.id, type: action.flowType }, parent);
        if (action.waypoints) modeling.updateWaypoints(connection, action.waypoints);
        return;
      }

      if (action.type === 'routeEdge') {
        const edge = requireElement(action.id);
        if (!isConnection(edge) || !edge.source || !edge.target) throw new Error(`Element “${action.id}” is not a connection`);
        const state = getState();
        const source = state.nodes.find((node) => node.id === edge.source!.id);
        const target = state.nodes.find((node) => node.id === edge.target!.id);
        if (!source || !target) throw new Error(`Connection “${action.id}” has an unknown endpoint`);
        const obstacles = state.nodes
          .filter((node) => node.id !== source.id && node.id !== target.id && !node.container)
          .map((node) => ({ x: node.x, y: node.y, width: node.width, height: node.height }));
        const start = edge.waypoints?.[0] ?? { x: source.x + source.width, y: source.y + source.height / 2 };
        const end = edge.waypoints?.at(-1) ?? { x: target.x, y: target.y + target.height / 2 };
        modeling.updateWaypoints(edge, chooseRoute(start, end, obstacles, action.preference));
        return;
      }

      if (action.type === 'setWaypoints') {
        modeling.updateWaypoints(requireElement(action.id), action.waypoints);
        return;
      }

      modeling.removeElements(action.ids.map(requireElement));
  }

  function commandStackIndex(): number | null {
    return typeof commandStack._stackIdx === 'number' ? commandStack._stackIdx : null;
  }

  return {
    getState,

    applyAction(action: DiagramAction): void {
      const before = commandStackIndex();
      applyActionInternal(action);
      const after = commandStackIndex();
      actionCommandCounts.push(before !== null && after !== null ? Math.max(1, after - before) : 1);
    },

    undo(): void {
      const count = actionCommandCounts.pop() ?? 1;
      for (let index = 0; index < count; index++) commandStack.undo();
    },
  };
}
