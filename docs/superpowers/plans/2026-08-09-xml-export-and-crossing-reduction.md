# BPMN XML Export + Layout Crossing Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two independent workstreams in one build: (Part A) a `@bpm/export-xml` package producing standard BPMN 2.0 XML verified by round-tripping through `bpmn-js`'s real importer, and (Part B) a real channel-routing algorithm in `@bpm/layout-engine-swimlane` that eliminates cross-lane edge-edge crossings, replacing today's linear-interpolation edge repair, with a promoted permanent geometric regression-test harness.

**Architecture:** Part A is purely additive — a new package reading the existing `Diagram`/`PositionedDiagram` types, touching nothing already built. Part B modifies one function (`bandLanes`'s edge-repair step) inside `@bpm/layout-engine-swimlane`, adding a new pure algorithm module (`channelRouting.ts`) and a promoted test-utility package (`@bpm/layout-core`'s `test-utils`).

**Tech Stack:** TypeScript, Vitest, `bpmn-js` (dev dependency, for XML round-trip verification), `jsdom` (dev dependency, `bpmn-js` needs a DOM to import into).

## Global Constraints

- Part A exports only (text/diagram → XML). Import (XML → text) is out of scope.
- `multiple`/`parallelMultiple` event triggers export a structurally-valid placeholder event-definition (this tool's AST doesn't model which sub-triggers compose them) — a documented, accepted limitation, not a bug to chase in this plan.
- Part B's target is zero edge-edge crossings across the project's 7 verification diagrams. If, after implementing channel routing correctly (verified by its own unit tests), a genuine residual crossing remains on some diagram — e.g. between two same-lane edges using ELK's own native routing, which channel routing doesn't touch — document it explicitly in the final task's completion notes and in `docs/STATUS.md` rather than iterating indefinitely to force a number that may not be reachable without a full obstacle-aware router (out of scope, tracked separately in `docs/ROADMAP.md`).
- Part B changes only apply to `@bpm/layout-engine-swimlane`; `@bpm/layout-engine-flat` is untouched (it never bands lanes, so there's no channel to route through).

---

## Part A — BPMN 2.0 XML Export

### File Structure

```
packages/export-xml/
  package.json, tsconfig.json, vitest.config.ts
  src/
    xml.ts                    # escapeXml
    eventDefinitions.ts         # EventTrigger -> event-definition XML
    elements.ts                  # AST node -> BPMN element XML (recursive for sub-processes)
    diagramInterchange.ts         # Positioned* -> BPMNShape/BPMNEdge XML
    index.ts                       # exportToXml(diagram, positioned) — orchestrates everything
  test/
    roundTrip.ts                    # shared bpmn-js import-and-assert-no-throw test helper
    export.test.ts                   # the actual test suite, task-by-task below
```

### Task A1: Scaffold `@bpm/export-xml` + round-trip harness + minimal export

**Files:**
- Create: `packages/export-xml/package.json`, `packages/export-xml/tsconfig.json`, `packages/export-xml/vitest.config.ts`
- Create: `packages/export-xml/src/xml.ts`, `packages/export-xml/src/elements.ts`, `packages/export-xml/src/index.ts`
- Create: `packages/export-xml/test/roundTrip.ts`, `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Consumes: `Diagram`, `DiagramNode`, `DiagramEdge` from `@bpm/ast`; `PositionedDiagram`, `PositionedNode`, `RoutedEdge` from `@bpm/layout-core`.
- Produces: `function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string`; `function importWithBpmnJs(xml: string): Promise<void>` (test helper, throws if bpmn-js rejects the XML).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@bpm/export-xml",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": {
    "@bpm/ast": "*",
    "@bpm/layout-core": "*"
  },
  "devDependencies": {
    "bpmn-js": "^17.11.1",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

`bpmn-js` builds an SVG canvas during import, which needs a real DOM — scope `jsdom` to this package only, other packages don't need it.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom' },
});
```

- [ ] **Step 4: Write `xml.ts`**

```ts
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 5: Write the round-trip test helper**

`packages/export-xml/test/roundTrip.ts`:
```ts
import BpmnModeler from 'bpmn-js/lib/Modeler.js';

/**
 * Imports the given XML through bpmn-js's real importer. Resolves silently if the XML is
 * valid enough for a real BPMN 2.0 tool to open; rejects otherwise. Requires a DOM
 * (see vitest.config.ts's jsdom environment) since bpmn-js builds an SVG canvas to import into.
 */
export async function importWithBpmnJs(xml: string): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const modeler = new BpmnModeler({ container });
  try {
    const { warnings } = await modeler.importXML(xml);
    if (warnings.length > 0) {
      throw new Error(`bpmn-js reported warnings importing XML:\n${warnings.join('\n')}`);
    }
  } finally {
    modeler.destroy();
    container.remove();
  }
}
```

- [ ] **Step 6: Write the failing test**

`packages/export-xml/test/export.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { exportToXml } from '../src/index.js';
import { importWithBpmnJs } from './roundTrip.js';
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';

describe('exportToXml — minimal diagram', () => {
  it('exports a valid BPMN 2.0 document bpmn-js can import', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'n2', label: 'End', category: 'end', trigger: 'none', interrupting: true },
      ],
      edges: [
        { id: 'e1', sourceId: 'n1', targetId: 't1', flowType: 'sequence' },
        { id: 'e2', sourceId: 't1', targetId: 'n2', flowType: 'sequence' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        { ...diagram.nodes[0], x: 0, y: 0, width: 40, height: 40 },
        { ...diagram.nodes[1], x: 100, y: 0, width: 100, height: 60 },
        { ...diagram.nodes[2], x: 260, y: 0, width: 40, height: 40 },
      ] as PositionedDiagram['nodes'],
      edges: [
        { ...diagram.edges[0], points: [{ x: 40, y: 20 }, { x: 100, y: 30 }] },
        { ...diagram.edges[1], points: [{ x: 200, y: 30 }, { x: 260, y: 20 }] },
      ],
    };

    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('bpmn2:definitions');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 8: Write `elements.ts` (minimal: events with `none` trigger, task, sequence flow)**

`packages/export-xml/src/elements.ts`:
```ts
import type { DiagramNode, DiagramEdge } from '@bpm/ast';
import { escapeXml } from './xml.js';

export function eventElementXml(node: DiagramNode & { kind: 'event' }): string {
  const tag = node.category === 'start' ? 'startEvent' : node.category === 'end' ? 'endEvent' : 'intermediateCatchEvent';
  return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function activityElementXml(node: DiagramNode & { kind: 'activity' }): string {
  const tag = node.activityType === 'task' ? 'task'
    : node.activityType === 'subProcess' ? 'subProcess'
    : node.activityType === 'transaction' ? 'transaction'
    : 'callActivity';
  return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function sequenceFlowXml(edge: DiagramEdge): string {
  return `<bpmn2:sequenceFlow id="${edge.id}" sourceRef="${edge.sourceId}" targetRef="${edge.targetId}"/>`;
}

export function flowElementXml(node: DiagramNode): string {
  switch (node.kind) {
    case 'event': return eventElementXml(node);
    case 'activity': return activityElementXml(node);
    default: return '';
  }
}
```

- [ ] **Step 9: Write `index.ts`**

`packages/export-xml/src/index.ts`:
```ts
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { flowElementXml, sequenceFlowXml } from './elements.js';

const NAMESPACES = [
  'xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  'targetNamespace="http://bpm.local/schema"',
].join(' ');

export function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string {
  const flowElements = diagram.nodes.map(flowElementXml).join('');
  const sequenceFlows = diagram.edges.filter((e) => e.flowType === 'sequence').map(sequenceFlowXml).join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<bpmn2:definitions id="definitions" ${NAMESPACES}>` +
    `<bpmn2:process id="process1" isExecutable="false">${flowElements}${sequenceFlows}</bpmn2:process>` +
    `</bpmn2:definitions>`
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS. If `bpmn-js` reports warnings (e.g. about missing diagram interchange info), that's expected at this stage — later tasks add BPMNDI. If it's needed to pass now, add a minimal empty `<bpmndi:BPMNDiagram><bpmndi:BPMNPlane bpmnElement="process1"/></bpmndi:BPMNDiagram>` after the process element so the import succeeds without warnings.

- [ ] **Step 11: Commit**

```bash
git add packages/export-xml
git commit -m "feat(export-xml): scaffold package with bpmn-js round-trip verification"
```

---

### Task A2: All event triggers + all gateway types

**Files:**
- Create: `packages/export-xml/src/eventDefinitions.ts`
- Modify: `packages/export-xml/src/elements.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Produces: `function eventDefinitionXml(trigger: EventTrigger): string` (empty string for `'none'`).
- Modifies: `eventElementXml` to include the trigger's event-definition child and handle `terminate` (still an `endEvent` tag, with a `<terminateEventDefinition/>` child); adds `gatewayElementXml`.

- [ ] **Step 1: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
import type { EventTrigger, GatewayType } from '@bpm/ast';

describe('exportToXml — event triggers and gateways', () => {
  const ALL_TRIGGERS: EventTrigger[] = [
    'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
    'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
  ];
  const ALL_GATEWAYS: GatewayType[] = ['exclusive', 'parallel', 'inclusive', 'complex', 'eventBased'];

  it.each(ALL_TRIGGERS)('exports a valid document for a start event with trigger "%s"', async (trigger) => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{ kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger, interrupting: true }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{ ...diagram.nodes[0], x: 0, y: 0, width: 40, height: 40 }] as PositionedDiagram['nodes'],
    };
    await expect(importWithBpmnJs(exportToXml(diagram, positioned))).resolves.not.toThrow();
  });

  it.each(ALL_GATEWAYS)('exports a valid document for a "%s" gateway', async (gatewayType) => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{ kind: 'gateway', id: 'g1', label: 'Gate', gatewayType }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{ ...diagram.nodes[0], x: 0, y: 0, width: 50, height: 50 }] as PositionedDiagram['nodes'],
    };
    await expect(importWithBpmnJs(exportToXml(diagram, positioned))).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — gateways aren't exported at all yet (`flowElementXml` returns `''` for `kind: 'gateway'`), and event triggers other than `none` produce an element bpmn-js may reject or that's structurally incomplete.

- [ ] **Step 3: Write `eventDefinitions.ts`**

```ts
import type { EventTrigger } from '@bpm/ast';

const DEFINITION_TAG: Record<Exclude<EventTrigger, 'none'>, string> = {
  message: 'messageEventDefinition',
  timer: 'timerEventDefinition',
  error: 'errorEventDefinition',
  escalation: 'escalationEventDefinition',
  cancel: 'cancelEventDefinition',
  compensation: 'compensateEventDefinition',
  conditional: 'conditionalEventDefinition',
  link: 'linkEventDefinition',
  signal: 'signalEventDefinition',
  // This tool doesn't model which sub-triggers compose a multiple/parallelMultiple event;
  // a single messageEventDefinition is emitted as a structurally-valid placeholder.
  multiple: 'messageEventDefinition',
  parallelMultiple: 'messageEventDefinition',
  terminate: 'terminateEventDefinition',
};

export function eventDefinitionXml(trigger: EventTrigger): string {
  if (trigger === 'none') return '';
  return `<bpmn2:${DEFINITION_TAG[trigger]}/>`;
}

export function isParallelMultiple(trigger: EventTrigger): boolean {
  return trigger === 'parallelMultiple';
}
```

- [ ] **Step 4: Update `elements.ts`**

```ts
import type { DiagramNode, DiagramEdge, GatewayType } from '@bpm/ast';
import { escapeXml } from './xml.js';
import { eventDefinitionXml, isParallelMultiple } from './eventDefinitions.js';

export function eventElementXml(node: DiagramNode & { kind: 'event' }): string {
  const tag = node.category === 'start' ? 'startEvent' : node.category === 'end' ? 'endEvent' : 'intermediateCatchEvent';
  const parallelAttr = isParallelMultiple(node.trigger) ? ' parallelMultiple="true"' : '';
  const definition = eventDefinitionXml(node.trigger);
  if (!definition) return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"${parallelAttr}/>`;
  return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"${parallelAttr}>${definition}</bpmn2:${tag}>`;
}

const GATEWAY_TAG: Record<GatewayType, string> = {
  exclusive: 'exclusiveGateway',
  parallel: 'parallelGateway',
  inclusive: 'inclusiveGateway',
  complex: 'complexGateway',
  eventBased: 'eventBasedGateway',
};

export function gatewayElementXml(node: DiagramNode & { kind: 'gateway' }): string {
  return `<bpmn2:${GATEWAY_TAG[node.gatewayType]} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function activityElementXml(node: DiagramNode & { kind: 'activity' }): string {
  const tag = node.activityType === 'task' ? 'task'
    : node.activityType === 'subProcess' ? 'subProcess'
    : node.activityType === 'transaction' ? 'transaction'
    : 'callActivity';
  return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function sequenceFlowXml(edge: DiagramEdge): string {
  return `<bpmn2:sequenceFlow id="${edge.id}" sourceRef="${edge.sourceId}" targetRef="${edge.targetId}"/>`;
}

export function flowElementXml(node: DiagramNode): string {
  switch (node.kind) {
    case 'event': return eventElementXml(node);
    case 'gateway': return gatewayElementXml(node);
    case 'activity': return activityElementXml(node);
    default: return '';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (all trigger and gateway cases)

- [ ] **Step 6: Commit**

```bash
git add packages/export-xml/src/eventDefinitions.ts packages/export-xml/src/elements.ts packages/export-xml/test/export.test.ts
git commit -m "feat(export-xml): export all event triggers and gateway types"
```

---

### Task A3: Boundary events + sub-process/transaction/callActivity nesting

**Files:**
- Modify: `packages/export-xml/src/elements.ts`
- Modify: `packages/export-xml/src/index.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Modifies: `eventElementXml` to emit `<bpmn2:boundaryEvent attachedToRef cancelActivity>` when `node.attachedToId` is set; `activityElementXml` now accepts a `renderFlowElements` callback so `exportToXml`'s recursion logic (which also needs to collect `defaultFlowIdBySourceId`, added in Task A4) can be threaded through without `elements.ts` depending on `index.ts`.

- [ ] **Step 1: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
describe('exportToXml — boundary events and nested activities', () => {
  it('exports a boundary event with attachedToRef and cancelActivity', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: false, attachedToId: 't1' },
      ],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [
        { ...diagram.nodes[0], x: 0, y: 0, width: 100, height: 60 },
        { ...diagram.nodes[1], x: 80, y: 50, width: 36, height: 36 },
      ] as PositionedDiagram['nodes'],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('attachedToRef="t1"');
    expect(xml).toContain('cancelActivity="false"');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports an expanded subprocess with nested flow elements', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [{
        kind: 'activity', id: 'sp1', label: 'Payment', activityType: 'subProcess', collapsed: false,
        children: [
          { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true },
          { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        ],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
      }],
      edges: [],
    };
    const positioned: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [{
        ...diagram.nodes[0], x: 0, y: 0, width: 300, height: 200,
        children: [
          { ...(diagram.nodes[0] as any).children[0], x: 20, y: 20, width: 40, height: 40 },
          { ...(diagram.nodes[0] as any).children[1], x: 100, y: 20, width: 100, height: 60 },
        ],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence', points: [{ x: 60, y: 40 }, { x: 100, y: 50 }] }],
      }] as PositionedDiagram['nodes'],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('id="sn1"');
    expect(xml).toContain('id="sn2"');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — boundary events export as a plain `intermediateCatchEvent` with no `attachedToRef`; sub-process children aren't recursed into.

- [ ] **Step 3: Update `elements.ts`**

```ts
import type { DiagramNode, DiagramEdge, GatewayType } from '@bpm/ast';
import { escapeXml } from './xml.js';
import { eventDefinitionXml, isParallelMultiple } from './eventDefinitions.js';

export function eventElementXml(node: DiagramNode & { kind: 'event' }): string {
  const definition = eventDefinitionXml(node.trigger);
  const parallelAttr = isParallelMultiple(node.trigger) ? ' parallelMultiple="true"' : '';

  if (node.attachedToId) {
    const attrs = `id="${node.id}" name="${escapeXml(node.label)}" attachedToRef="${node.attachedToId}" cancelActivity="${node.interrupting}"${parallelAttr}`;
    return definition
      ? `<bpmn2:boundaryEvent ${attrs}>${definition}</bpmn2:boundaryEvent>`
      : `<bpmn2:boundaryEvent ${attrs}/>`;
  }

  const tag = node.category === 'start' ? 'startEvent' : node.category === 'end' ? 'endEvent' : 'intermediateCatchEvent';
  const attrs = `id="${node.id}" name="${escapeXml(node.label)}"${parallelAttr}`;
  return definition ? `<bpmn2:${tag} ${attrs}>${definition}</bpmn2:${tag}>` : `<bpmn2:${tag} ${attrs}/>`;
}

const GATEWAY_TAG: Record<GatewayType, string> = {
  exclusive: 'exclusiveGateway',
  parallel: 'parallelGateway',
  inclusive: 'inclusiveGateway',
  complex: 'complexGateway',
  eventBased: 'eventBasedGateway',
};

export function gatewayElementXml(node: DiagramNode & { kind: 'gateway' }): string {
  return `<bpmn2:${GATEWAY_TAG[node.gatewayType]} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

const NESTABLE = new Set(['subProcess', 'transaction']);

export function activityElementXml(
  node: DiagramNode & { kind: 'activity' },
  renderFlowElements: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
): string {
  const tag = node.activityType === 'task' ? 'task'
    : node.activityType === 'subProcess' ? 'subProcess'
    : node.activityType === 'transaction' ? 'transaction'
    : 'callActivity';

  if (NESTABLE.has(node.activityType) && !node.collapsed) {
    const inner = renderFlowElements(node.children, node.childEdges);
    return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}">${inner}</bpmn2:${tag}>`;
  }
  return `<bpmn2:${tag} id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function sequenceFlowXml(edge: DiagramEdge): string {
  return `<bpmn2:sequenceFlow id="${edge.id}" sourceRef="${edge.sourceId}" targetRef="${edge.targetId}"/>`;
}

export function flowElementXml(
  node: DiagramNode,
  renderFlowElements: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
): string {
  switch (node.kind) {
    case 'event': return eventElementXml(node);
    case 'gateway': return gatewayElementXml(node);
    case 'activity': return activityElementXml(node, renderFlowElements);
    default: return '';
  }
}
```

- [ ] **Step 4: Update `index.ts` to recurse and pass the flow-element renderer through**

```ts
import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { flowElementXml, sequenceFlowXml } from './elements.js';

const NAMESPACES = [
  'xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  'targetNamespace="http://bpm.local/schema"',
].join(' ');

function renderFlowElements(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const elements = nodes.map((node) => flowElementXml(node, renderFlowElements)).join('');
  const flows = edges.filter((e) => e.flowType === 'sequence' || e.flowType === 'conditionalSequence' || e.flowType === 'defaultSequence')
    .map(sequenceFlowXml).join('');
  return elements + flows;
}

export function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string {
  const processContent = renderFlowElements(diagram.nodes, diagram.edges);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<bpmn2:definitions id="definitions" ${NAMESPACES}>` +
    `<bpmn2:process id="process1" isExecutable="false">${processContent}</bpmn2:process>` +
    `<bpmndi:BPMNDiagram id="diagram1"><bpmndi:BPMNPlane id="plane1" bpmnElement="process1"/></bpmndi:BPMNDiagram>` +
    `</bpmn2:definitions>`
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (all tests across all describe blocks)

- [ ] **Step 6: Commit**

```bash
git add packages/export-xml/src packages/export-xml/test
git commit -m "feat(export-xml): export boundary events and nested sub-process/transaction content"
```

---

### Task A4: Data objects/stores/artifacts + conditional/default sequence flows

**Files:**
- Modify: `packages/export-xml/src/elements.ts`
- Modify: `packages/export-xml/src/index.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Adds: `dataObjectElementXml`, `dataStoreElementXml`, `textAnnotationElementXml`, `groupElementXml`, `associationXml` to `elements.ts`.
- `sequenceFlowXml` now accepts a `defaultFlowIds: Set<string>` (edge ids that are some node's default flow — informational only for the flow itself; the `default="..."` attribute goes on the *source* element, handled in `renderFlowElements`) and emits `<conditionExpression>` for `conditionalSequence` edges with a label.

- [ ] **Step 1: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
describe('exportToXml — data, artifacts, conditional/default flows', () => {
  it('exports dataObject, dataStore, textAnnotation, group, and an association', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'dataObject', id: 'd1', label: 'Invoice' },
        { kind: 'dataStore', id: 'ds1', label: 'DB' },
        { kind: 'textAnnotation', id: 'note1', label: 'SLA' },
        { kind: 'group', id: 'grp1', label: 'Critical' },
      ],
      edges: [{ id: 'a1', sourceId: 'd1', targetId: 't1', flowType: 'association' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 60, y: 0, width: 50, height: 50 })) as PositionedDiagram['nodes'],
      edges: [{ ...diagram.edges[0], points: [{ x: 50, y: 25 }, { x: 60, y: 25 }] }],
    };
    const xml = exportToXml(diagram, positioned);
    for (const id of ['t1', 'd1', 'ds1', 'note1', 'grp1', 'a1']) expect(xml).toContain(`id="${id}"`);
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });

  it('exports a default flow attribute on the source gateway and a condition expression on the conditional flow', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'gateway', id: 'g1', label: 'OK?', gatewayType: 'exclusive' },
        { kind: 'activity', id: 't1', label: 'Yes path', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 't2', label: 'Default path', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e1', sourceId: 'g1', targetId: 't1', flowType: 'conditionalSequence', label: 'yes' },
        { id: 'e2', sourceId: 'g1', targetId: 't2', flowType: 'defaultSequence' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 120, y: 0, width: 60, height: 60 })) as PositionedDiagram['nodes'],
      edges: diagram.edges.map((e) => ({ ...e, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })),
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('default="e2"');
    expect(xml).toContain('<bpmn2:conditionExpression');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — data/artifact kinds aren't exported at all; no `default=` attribute or `conditionExpression` yet.

- [ ] **Step 3: Extend `elements.ts`**

Add to `packages/export-xml/src/elements.ts`:
```ts
export function dataObjectElementXml(node: DiagramNode & { kind: 'dataObject' }): string {
  return `<bpmn2:dataObject id="${node.id}_do"/><bpmn2:dataObjectReference id="${node.id}" name="${escapeXml(node.label)}" dataObjectRef="${node.id}_do"/>`;
}

export function dataStoreElementXml(node: DiagramNode & { kind: 'dataStore' }): string {
  return `<bpmn2:dataStoreReference id="${node.id}" name="${escapeXml(node.label)}"/>`;
}

export function textAnnotationElementXml(node: DiagramNode & { kind: 'textAnnotation' }): string {
  return `<bpmn2:textAnnotation id="${node.id}"><bpmn2:text>${escapeXml(node.label)}</bpmn2:text></bpmn2:textAnnotation>`;
}

export function groupElementXml(node: DiagramNode & { kind: 'group' }): string {
  return `<bpmn2:group id="${node.id}"/>`;
}

export function associationXml(edge: DiagramEdge): string {
  return `<bpmn2:association id="${edge.id}" sourceRef="${edge.sourceId}" targetRef="${edge.targetId}"/>`;
}
```

Update `sequenceFlowXml` and `flowElementXml`:
```ts
export function sequenceFlowXml(edge: DiagramEdge): string {
  const condition = edge.flowType === 'conditionalSequence' && edge.label
    ? `<bpmn2:conditionExpression xsi:type="bpmn2:tFormalExpression">${escapeXml(edge.label)}</bpmn2:conditionExpression>`
    : '';
  const attrs = `id="${edge.id}" sourceRef="${edge.sourceId}" targetRef="${edge.targetId}"`;
  return condition ? `<bpmn2:sequenceFlow ${attrs}>${condition}</bpmn2:sequenceFlow>` : `<bpmn2:sequenceFlow ${attrs}/>`;
}

export function flowElementXml(
  node: DiagramNode,
  renderFlowElements: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
  defaultFlowIdBySourceId: Map<string, string>,
): string {
  const defaultAttr = (id: string) => {
    const flowId = defaultFlowIdBySourceId.get(id);
    return flowId ? ` default="${flowId}"` : '';
  };

  switch (node.kind) {
    case 'event': return eventElementXml(node);
    case 'gateway': return gatewayElementXml(node).replace('/>', `${defaultAttr(node.id)}/>`);
    case 'activity': return activityElementXml(node, renderFlowElements).replace(
      new RegExp(`id="${node.id}"`),
      `id="${node.id}"${defaultAttr(node.id)}`,
    );
    case 'dataObject': return dataObjectElementXml(node);
    case 'dataStore': return dataStoreElementXml(node);
    case 'textAnnotation': return textAnnotationElementXml(node);
    case 'group': return groupElementXml(node);
  }
}
```

- [ ] **Step 4: Update `index.ts`'s `renderFlowElements` to compute default-flow ids and pass associations through**

```ts
function renderFlowElements(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const defaultFlowIdBySourceId = new Map(
    edges.filter((e) => e.flowType === 'defaultSequence').map((e) => [e.sourceId, e.id]),
  );
  const elements = nodes.map((node) => flowElementXml(node, renderFlowElements, defaultFlowIdBySourceId)).join('');
  const sequenceFlows = edges
    .filter((e) => e.flowType === 'sequence' || e.flowType === 'conditionalSequence' || e.flowType === 'defaultSequence')
    .map(sequenceFlowXml).join('');
  const associations = edges.filter((e) => e.flowType === 'association').map(associationXml).join('');
  return elements + sequenceFlows + associations;
}
```

Update the `elements.js` import line in `index.ts` to include `associationXml`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (all describe blocks)

- [ ] **Step 6: Commit**

```bash
git add packages/export-xml/src packages/export-xml/test
git commit -m "feat(export-xml): export data objects/stores/artifacts, associations, conditional and default flows"
```

---

### Task A5: Pools/lanes + message flows

**Files:**
- Create: `packages/export-xml/src/collaboration.ts`
- Modify: `packages/export-xml/src/index.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Produces: `function collaborationXml(diagram: Diagram, renderProcess: (nodes, edges) => string): { collaboration: string; processes: string }` — builds `<collaboration>` + `<participant>` per pool, one `<process>` per pool with a `<laneSet>`, and collects message flows.

- [ ] **Step 1: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
describe('exportToXml — pools, lanes, message flows', () => {
  it('exports a collaboration with participants, lanes, and a message flow', async () => {
    const diagram: Diagram = {
      pools: [
        { id: 'pool1', name: 'Order Process', lanes: [{ id: 'lane1', name: 'Sales', nodeIds: ['n1', 'n2'] }] },
        { id: 'pool2', name: 'Carrier', lanes: [{ id: 'lane2', name: 'Logistics', nodeIds: ['n3'] }] },
      ],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 'n2', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        { kind: 'activity', id: 'n3', label: 'Ship', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', flowType: 'sequence' },
        { id: 'e2', sourceId: 'n2', targetId: 'n3', flowType: 'message' },
      ],
    };
    const positioned: PositionedDiagram = {
      pools: [
        { id: 'pool1', name: 'Order Process', x: 0, y: 0, width: 400, height: 150, lanes: [{ id: 'lane1', name: 'Sales', x: 0, y: 0, width: 400, height: 150 }] },
        { id: 'pool2', name: 'Carrier', x: 0, y: 160, width: 200, height: 100, lanes: [{ id: 'lane2', name: 'Logistics', x: 0, y: 160, width: 200, height: 100 }] },
      ],
      nodes: diagram.nodes.map((n, i) => ({ ...n, x: i * 120, y: i > 1 ? 170 : 20, width: 60, height: 60 })) as PositionedDiagram['nodes'],
      edges: diagram.edges.map((e) => ({ ...e, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })),
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('<bpmn2:collaboration');
    expect(xml).toContain('<bpmn2:participant');
    expect(xml).toContain('<bpmn2:laneSet');
    expect(xml).toContain('<bpmn2:flowNodeRef>n1</bpmn2:flowNodeRef>');
    expect(xml).toContain('<bpmn2:messageFlow');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — `exportToXml` currently always emits a single flat `<process>`, ignoring `diagram.pools` entirely.

- [ ] **Step 3: Write `collaboration.ts`**

```ts
import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';

export function collaborationXml(
  diagram: Diagram,
  renderProcess: (nodes: DiagramNode[], edges: DiagramEdge[]) => string,
): { collaboration: string; processes: string } {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const laneNodeIds = new Set(diagram.pools.flatMap((p) => p.lanes.flatMap((l) => l.nodeIds)));

  const participants = diagram.pools.map((pool) => `<bpmn2:participant id="participant_${pool.id}" name="${pool.name}" processRef="process_${pool.id}"/>`).join('');
  const messageFlows = diagram.edges
    .filter((e) => e.flowType === 'message')
    .map((e) => `<bpmn2:messageFlow id="${e.id}" sourceRef="${e.sourceId}" targetRef="${e.targetId}"/>`)
    .join('');

  const processes = diagram.pools.map((pool) => {
    const poolNodes = pool.lanes.flatMap((l) => l.nodeIds).map((id) => nodeById.get(id)!).filter(Boolean);
    const poolEdges = diagram.edges.filter(
      (e) => e.flowType !== 'message' && laneNodeIds.has(e.sourceId) && laneNodeIds.has(e.targetId)
        && poolNodes.some((n) => n.id === e.sourceId),
    );
    const laneSet = `<bpmn2:laneSet id="laneSet_${pool.id}">${pool.lanes.map((lane) =>
      `<bpmn2:lane id="${lane.id}" name="${lane.name}">${lane.nodeIds.map((id) => `<bpmn2:flowNodeRef>${id}</bpmn2:flowNodeRef>`).join('')}</bpmn2:lane>`
    ).join('')}</bpmn2:laneSet>`;
    return `<bpmn2:process id="process_${pool.id}" isExecutable="false">${laneSet}${renderProcess(poolNodes, poolEdges)}</bpmn2:process>`;
  }).join('');

  return {
    collaboration: `<bpmn2:collaboration id="collaboration1">${participants}${messageFlows}</bpmn2:collaboration>`,
    processes,
  };
}
```

- [ ] **Step 4: Update `index.ts` to branch on whether the diagram has pools**

```ts
import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import type { PositionedDiagram } from '@bpm/layout-core';
import { flowElementXml, sequenceFlowXml, associationXml } from './elements.js';
import { collaborationXml } from './collaboration.js';

const NAMESPACES = [
  'xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"',
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"',
  'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"',
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI"',
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  'targetNamespace="http://bpm.local/schema"',
].join(' ');

function renderFlowElements(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const defaultFlowIdBySourceId = new Map(
    edges.filter((e) => e.flowType === 'defaultSequence').map((e) => [e.sourceId, e.id]),
  );
  const elements = nodes.map((node) => flowElementXml(node, renderFlowElements, defaultFlowIdBySourceId)).join('');
  const sequenceFlows = edges
    .filter((e) => e.flowType === 'sequence' || e.flowType === 'conditionalSequence' || e.flowType === 'defaultSequence')
    .map(sequenceFlowXml).join('');
  const associations = edges.filter((e) => e.flowType === 'association').map(associationXml).join('');
  return elements + sequenceFlows + associations;
}

export function exportToXml(diagram: Diagram, positioned: PositionedDiagram): string {
  const body = diagram.pools.length > 0
    ? (() => {
        const { collaboration, processes } = collaborationXml(diagram, renderFlowElements);
        return collaboration + processes;
      })()
    : `<bpmn2:process id="process1" isExecutable="false">${renderFlowElements(diagram.nodes, diagram.edges)}</bpmn2:process>`;

  const planeElement = diagram.pools.length > 0 ? 'collaboration1' : 'process1';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<bpmn2:definitions id="definitions" ${NAMESPACES}>` +
    body +
    `<bpmndi:BPMNDiagram id="diagram1"><bpmndi:BPMNPlane id="plane1" bpmnElement="${planeElement}"/></bpmndi:BPMNDiagram>` +
    `</bpmn2:definitions>`
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (all describe blocks including the new pools/lanes one)

- [ ] **Step 6: Commit**

```bash
git add packages/export-xml/src/collaboration.ts packages/export-xml/src/index.ts packages/export-xml/test/export.test.ts
git commit -m "feat(export-xml): export pools/lanes as a collaboration, and message flows"
```

---

### Task A6: BPMNDI diagram interchange (shapes, edges, waypoints)

**Files:**
- Create: `packages/export-xml/src/diagramInterchange.ts`
- Modify: `packages/export-xml/src/index.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Produces: `function shapeXml(node: PositionedNode): string`, `function poolShapeXml(pool: PositionedPool): string`, `function laneShapeXml(lane: PositionedLane, poolId: string): string`, `function edgeXml(edge: RoutedEdge): string` — all recursing into `node.children`/`node.childEdges` where present.

- [ ] **Step 1: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
describe('exportToXml — diagram interchange geometry', () => {
  it('includes a BPMNShape with the right bounds for every node and a BPMNEdge with waypoints for every edge', async () => {
    const diagram: Diagram = {
      pools: [],
      nodes: [
        { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true },
        { kind: 'activity', id: 't1', label: 'Do work', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 't1', flowType: 'sequence' }],
    };
    const positioned: PositionedDiagram = {
      pools: [],
      nodes: [
        { ...diagram.nodes[0], x: 10, y: 20, width: 40, height: 40 },
        { ...diagram.nodes[1], x: 100, y: 15, width: 100, height: 60 },
      ] as PositionedDiagram['nodes'],
      edges: [{ ...diagram.edges[0], points: [{ x: 50, y: 40 }, { x: 100, y: 45 }] }],
    };
    const xml = exportToXml(diagram, positioned);
    expect(xml).toContain('bpmnElement="n1"');
    expect(xml).toContain('x="10" y="20" width="40" height="40"');
    expect(xml).toContain('bpmnElement="e1"');
    expect(xml).toContain('<di:waypoint x="50" y="40"/>');
    expect(xml).toContain('<di:waypoint x="100" y="45"/>');
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: FAIL — the `<bpmndi:BPMNPlane>` is currently empty (no shapes or edges).

- [ ] **Step 3: Write `diagramInterchange.ts`**

```ts
import type { PositionedNode, PositionedPool, PositionedLane, RoutedEdge } from '@bpm/layout-core';

export function shapeXml(node: PositionedNode): string {
  const own = `<bpmndi:BPMNShape id="shape_${node.id}" bpmnElement="${node.id}"><dc:Bounds x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/></bpmndi:BPMNShape>`;
  const children = (node.children ?? []).map(shapeXml).join('');
  const childEdges = (node.childEdges ?? []).map(edgeXml).join('');
  return own + children + childEdges;
}

export function edgeXml(edge: RoutedEdge): string {
  if (edge.points.length < 2) return '';
  const waypoints = edge.points.map((p) => `<di:waypoint x="${p.x}" y="${p.y}"/>`).join('');
  return `<bpmndi:BPMNEdge id="shape_${edge.id}" bpmnElement="${edge.id}">${waypoints}</bpmndi:BPMNEdge>`;
}

export function poolShapeXml(pool: PositionedPool): string {
  const own = `<bpmndi:BPMNShape id="shape_${pool.id}" bpmnElement="participant_${pool.id}" isHorizontal="true"><dc:Bounds x="${pool.x}" y="${pool.y}" width="${pool.width}" height="${pool.height}"/></bpmndi:BPMNShape>`;
  const lanes = pool.lanes.map((lane) => laneShapeXml(lane)).join('');
  return own + lanes;
}

export function laneShapeXml(lane: PositionedLane): string {
  return `<bpmndi:BPMNShape id="shape_${lane.id}" bpmnElement="${lane.id}" isHorizontal="true"><dc:Bounds x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}"/></bpmndi:BPMNShape>`;
}
```

- [ ] **Step 4: Update `index.ts` to populate the BPMNPlane**

Replace the empty `<bpmndi:BPMNPlane ...>` in `exportToXml` with real content:
```ts
import { shapeXml, edgeXml, poolShapeXml } from './diagramInterchange.js';

// ...inside exportToXml, before building the final string:
const shapes = positioned.nodes.map(shapeXml).join('');
const edges = positioned.edges.map(edgeXml).join('');
const poolShapes = positioned.pools.map(poolShapeXml).join('');
const planeContent = shapes + edges + poolShapes;

// ...and use planeContent inside the BPMNPlane element:
`<bpmndi:BPMNDiagram id="diagram1"><bpmndi:BPMNPlane id="plane1" bpmnElement="${planeElement}">${planeContent}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (full file, all describe blocks)

- [ ] **Step 6: Commit**

```bash
git add packages/export-xml/src/diagramInterchange.ts packages/export-xml/src/index.ts packages/export-xml/test/export.test.ts
git commit -m "feat(export-xml): emit BPMNDI shapes and edges with real geometry"
```

---

### Task A7: Full round-trip across the project's 7 verification diagrams

**Files:**
- Create: `packages/export-xml/test/verificationDiagrams.ts`
- Modify: `packages/export-xml/test/export.test.ts`

**Interfaces:**
- Consumes: `parse` from `@bpm/parser`, `layout` from `@bpm/layout`, `exportToXml` from `../src/index.js`.
- Produces: an integration test proving the whole pipeline — text → parse → layout → export → bpmn-js import — works end to end for every diagram already used to verify layout quality in prior sessions.

- [ ] **Step 1: Add `@bpm/parser` and `@bpm/layout` as dependencies**

`packages/export-xml/package.json`, add to `dependencies`:
```json
"@bpm/parser": "*",
"@bpm/layout": "*"
```

- [ ] **Step 2: Write `verificationDiagrams.ts`**

```ts
export const VERIFICATION_DIAGRAMS: Record<string, string> = {
  screenshot: `
event start message "Order placed" as n1
task "Review order" as n2
boundary timer nonInterrupting "SLA breach" as b1 on n2
gateway exclusive "Approved?" as g1
task "Ship order" as n3
event end none "Done" as n4
event end terminate "Rejected" as n5
dataObject "Invoice" as d1

n1 -> n2
n2 -> g1
g1 => n3 : "yes"
g1 ->> n5
n3 -> n4
d1 ..> n2
b1 -> n5
`.trim(),

  poolLaneTwoBoundary: `
pool "Order Process"
  lane "Sales"
    event start none "Start" as n1
    task "Review order" as n2
    boundary timer interrupting "Timeout" as b1 on n2
    boundary error nonInterrupting "Error" as b2 on n2
    task "Escalate" as n3
    task "Notify" as n4
  lane "Warehouse"
    task "Pack order" as n5
    event end none "Shipped" as n6

n1 -> n2
n2 -> n5
n5 -> n6
b1 -> n3
b2 -> n4
`.trim(),

  fanOut: `
event start none "Start" as n1
gateway parallel "Split" as g1
task "Path A" as a1
task "Path B" as a2
task "Path C" as a3
gateway parallel "Join" as g2
event end none "End" as n2
dataObject "Shared doc" as d1
dataStore "Archive" as ds1

n1 -> g1
g1 -> a1
g1 -> a2
g1 -> a3
a1 -> g2
a2 -> g2
a3 -> g2
g2 -> n2
a2 ..> d1
n2 ~> ds1
`.trim(),

  nestedSubprocess: `
event start none "Start" as n1
subprocess "Handle payment" as sp1
  event start none "Sub start" as sn1
  task "Charge card" as sn2
  boundary timer nonInterrupting "Slow charge" as sb1 on sn2
  task "Retry" as sn3
  event end none "Sub end" as sn4
  sn1 -> sn2
  sn2 -> sn4
  sb1 -> sn3
task "Send receipt" as n2
event end none "Done" as n3

n1 -> sp1
sp1 -> n2
n2 -> n3
`.trim(),

  crowdedBoundary: `
task "Do work" as t1
boundary timer interrupting "T1" as b1 on t1
boundary error nonInterrupting "T2" as b2 on t1
boundary escalation nonInterrupting "T3" as b3 on t1
event end none "Timeout path" as e1
event end none "Error path" as e2
event end none "Escalation path" as e3
gateway exclusive "Gate" as g1
task "Next" as t2

t1 -> g1
g1 -> t2
b1 -> e1
b2 -> e2
b3 -> e3
`.trim(),

  orderToCashStacked: `
pool "Order-to-Cash"
  lane "Customer"
    event start message "Order submitted" as c1
    task "Confirm receipt" as c2
    event intermediate message "Status update" as c3
    event end none "Order closed" as c4
  lane "Sales"
    task "Validate order" as s1
    gateway exclusive "Credit OK?" as s2
    task "Request deposit" as s3
    task "Create sales order" as s4
    event end terminate "Rejected" as s5
  lane "Finance"
    task "Check credit" as f1
    task "Capture payment" as f2
    boundary timer interrupting "Payment timeout" as fb1 on f2
    task "Issue refund" as f3
    dataObject "Invoice" as fd1
  lane "Warehouse"
    gateway parallel "Split fulfillment" as w1
    task "Pick items" as w2
    task "Pack shipment" as w3
    gateway parallel "Join fulfillment" as w4
    task "Ship order" as w5
    callActivity "Carrier booking" as w6
    event end none "Shipped" as w7
  c1 -> c2
  c2 -> s1
  s1 -> f1
  f1 -> s2
  s2 => s4 : "yes"
  s2 ->> s3
  s3 -> f2
  f2 -> s4
  fb1 -> f3
  f3 -> s5
  s4 -> w1
  w1 -> w2
  w1 -> w3
  w2 -> w4
  w3 -> w4
  w4 -> w5
  w5 -> w6
  w6 -> w7
  w7 -> c3
  c3 -> c4
  fd1 ..> f2

pool "External Carrier"
  lane "Logistics Partner"
    event start message "Booking request" as e1
    task "Allocate truck" as e2
    event end message "Tracking sent" as e3
  e1 -> e2
  e2 -> e3

w6 -> e1
e3 -> c3
`.trim(),
};
```

Note: `orderToCashFlat` (the `layout: flat` variant) is intentionally omitted — it's the same diagram text with a `layout: flat` directive prepended, and export doesn't need to verify it separately since XML export doesn't depend on which layout engine produced the positions.

- [ ] **Step 3: Write the failing test**

Add to `packages/export-xml/test/export.test.ts`:
```ts
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { VERIFICATION_DIAGRAMS } from './verificationDiagrams.js';

describe('exportToXml — full pipeline round trip', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('exports a valid document for the "%s" diagram', async (_name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const xml = exportToXml(diagram, positioned);
    await expect(importWithBpmnJs(xml)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then fix, then pass**

Run: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: some diagrams may reveal edge cases the earlier smaller tests didn't cover (e.g. `callActivity`, multiple pools, terminate + message events together). Fix `elements.ts`/`collaboration.ts`/`diagramInterchange.ts` as needed until all pass — this is expected, real integration testing surfacing real gaps, not a sign of a wrong task.

Run again: `npx vitest run packages/export-xml/test/export.test.ts`
Expected: PASS (all 6 diagrams)

- [ ] **Step 5: Commit**

```bash
git add packages/export-xml/package.json packages/export-xml/test/verificationDiagrams.ts packages/export-xml/test/export.test.ts
git commit -m "test(export-xml): verify full parse->layout->export->bpmn-js round trip across all verification diagrams"
```

---

## Part B — Crossing Reduction via Channel Routing

### File Structure

```
packages/layout-core/
  test-utils/
    geometry.ts               # promoted analyzeLayout()
  test/
    geometry.test.ts            # unit tests for the analyzer itself

packages/layout-engine-swimlane/
  src/
    channelRouting.ts           # assignTracks() — the left-edge/multi-channel algorithm
    laneBanding.ts               # modified: cross-lane edges routed via channelRouting.ts
  test/
    channelRouting.test.ts        # unit tests for assignTracks() in isolation
    crossing-regression.test.ts    # the 7 diagrams, asserting analyzeLayout() results
```

### Task B1: Promote the geometric analyzer into a permanent, tested utility

**Files:**
- Create: `packages/layout-core/test-utils/geometry.ts`
- Create: `packages/layout-core/test/geometry.test.ts`
- Modify: `packages/layout-core/package.json` (export the test-utils subpath)

**Interfaces:**
- Produces: `function analyzeLayout(positioned: PositionedDiagram): { nodeOverlaps: string[]; edgeThroughNode: string[]; edgeCrossings: number }`.

- [ ] **Step 1: Add the test-utils export to `package.json`**

`packages/layout-core/package.json`, add an `exports` field (create the file if it doesn't already have one; otherwise merge):
```json
{
  "name": "@bpm/layout-core",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./test-utils/geometry": { "types": "./test-utils/geometry.ts", "default": "./test-utils/geometry.ts" }
  },
  "scripts": { "build": "tsc -p tsconfig.json" },
  "dependencies": { "@bpm/ast": "*" }
}
```
(`test-utils` is intentionally source-only, not built — it's a dev/test dependency for other packages in this workspace, never shipped.)

- [ ] **Step 2: Write the failing test**

`packages/layout-core/test/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { analyzeLayout } from '../test-utils/geometry.js';
import type { PositionedDiagram, PositionedNode } from '../src/types.js';

function node(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id'>): PositionedNode {
  return { kind: 'activity', label: '', activityType: 'task', collapsed: false, x: 0, y: 0, width: 40, height: 40, ...partial } as PositionedNode;
}

describe('analyzeLayout', () => {
  it('reports no issues for two non-overlapping nodes with a clean edge', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 100, y: 0 })],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 100, y: 20 }] }],
    };
    const result = analyzeLayout(diagram);
    expect(result).toEqual({ nodeOverlaps: [], edgeThroughNode: [], edgeCrossings: 0 });
  });

  it('reports a node overlap', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 10, y: 10 })],
    };
    expect(analyzeLayout(diagram).nodeOverlaps).toHaveLength(1);
  });

  it('reports an edge passing through an unrelated node', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 200, y: 0 }), node({ id: 'c', x: 100, y: 0 })],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 40, y: 20 }, { x: 200, y: 20 }] }],
    };
    expect(analyzeLayout(diagram).edgeThroughNode).toHaveLength(1);
  });

  it('reports edge-edge crossings', () => {
    const diagram: PositionedDiagram = {
      pools: [],
      nodes: [
        node({ id: 'a', x: 0, y: 0 }), node({ id: 'b', x: 100, y: 100 }),
        node({ id: 'c', x: 0, y: 100 }), node({ id: 'd', x: 100, y: 0 }),
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', points: [{ x: 20, y: 20 }, { x: 120, y: 120 }] },
        { id: 'e2', sourceId: 'c', targetId: 'd', flowType: 'sequence', points: [{ x: 20, y: 120 }, { x: 120, y: 20 }] },
      ],
    };
    expect(analyzeLayout(diagram).edgeCrossings).toBe(1);
  });

  it('does not flag a boundary event straddling its host, or an edge legitimately inside its own container', () => {
    const host = node({ id: 'h', x: 0, y: 0, width: 100, height: 60 });
    const boundary = node({ id: 'b', x: 80, y: 40, width: 20, height: 20, attachedToId: 'h' } as any);
    const child = node({ id: 'c', x: 10, y: 10, width: 20, height: 20 });
    const parent = node({
      id: 'p', x: 0, y: 100, width: 200, height: 150,
      children: [child],
      childEdges: [{ id: 'ie1', sourceId: 'c', targetId: 'c', flowType: 'sequence', points: [{ x: 20, y: 120 }, { x: 30, y: 130 }] }],
    } as any);
    const diagram: PositionedDiagram = { pools: [], nodes: [host, boundary, parent], edges: [] };
    const result = analyzeLayout(diagram);
    expect(result.nodeOverlaps).toEqual([]);
    expect(result.edgeThroughNode).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/layout-core/test/geometry.test.ts`
Expected: FAIL — `../test-utils/geometry.js` does not exist.

- [ ] **Step 4: Write `geometry.ts`**

Port the scratch analyzer used in prior sessions into a real module — same logic, cleaned up:

```ts
import type { PositionedDiagram, PositionedNode, RoutedEdge } from '../src/types.js';

interface Point { x: number; y: number }

function segmentIntersectsRect(p1: Point, p2: Point, rect: { x: number; y: number; width: number; height: number }, marginX = 3, marginY = 3): boolean {
  const rx = rect.x + marginX;
  const ry = rect.y + marginY;
  const rw = rect.width - 2 * marginX;
  const rh = rect.height - 2 * marginY;
  if (rw <= 0 || rh <= 0) return false;

  let t0 = 0, t1 = 1;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const checks: Array<[number, number]> = [
    [-dx, p1.x - rx], [dx, rx + rw - p1.x],
    [-dy, p1.y - ry], [dy, ry + rh - p1.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: typeof a, margin = 2): boolean {
  return !(
    a.x + a.width - margin <= b.x || b.x + b.width - margin <= a.x ||
    a.y + a.height - margin <= b.y || b.y + b.height - margin <= a.y
  );
}

function flattenNodes(nodes: PositionedNode[], acc: PositionedNode[] = []): PositionedNode[] {
  for (const n of nodes) { acc.push(n); if (n.children) flattenNodes(n.children, acc); }
  return acc;
}
function flattenEdges(nodes: PositionedNode[], topEdges: RoutedEdge[], acc: RoutedEdge[] = []): RoutedEdge[] {
  acc.push(...topEdges);
  for (const n of nodes) { if (n.childEdges) acc.push(...n.childEdges); if (n.children) flattenEdges(n.children, [], acc); }
  return acc;
}
function isAncestor(maybeAncestor: PositionedNode, node: PositionedNode): boolean {
  if (!maybeAncestor.children) return false;
  for (const c of maybeAncestor.children) { if (c.id === node.id) return true; if (isAncestor(c, node)) return true; }
  return false;
}
function cross(a: Point, b: Point, c: Point): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function segIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export interface LayoutAnalysis {
  nodeOverlaps: string[];
  edgeThroughNode: string[];
  edgeCrossings: number;
}

export function analyzeLayout(positioned: PositionedDiagram): LayoutAnalysis {
  const nodes = flattenNodes(positioned.nodes);
  const edges = flattenEdges(positioned.nodes, positioned.edges);
  const nodeOverlaps: string[] = [];
  const edgeThroughNode: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (isAncestor(a, b) || isAncestor(b, a)) continue;
      if ((a as any).attachedToId === b.id || (b as any).attachedToId === a.id) continue;
      if (rectsOverlap(a, b)) nodeOverlaps.push(`"${a.label}" (${a.id}) overlaps "${b.label}" (${b.id})`);
    }
  }

  const containerOf = new Map<string, PositionedNode | null>();
  (function indexTree(list: PositionedNode[], parent: PositionedNode | null) {
    for (const n of list) { containerOf.set(n.id, parent); if (n.children) indexTree(n.children, n); }
  })(positioned.nodes, null);
  function isContainerOfEdge(container: PositionedNode, edge: RoutedEdge): boolean {
    const contains = (id: string) => {
      let cur = containerOf.get(id) ?? null;
      while (cur) { if (cur.id === container.id) return true; cur = containerOf.get(cur.id) ?? null; }
      return false;
    };
    return contains(edge.sourceId) && contains(edge.targetId);
  }

  for (const edge of edges) {
    for (const node of nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      if (node.children && isContainerOfEdge(node, edge)) continue;
      for (let k = 0; k < edge.points.length - 1; k++) {
        if (segmentIntersectsRect(edge.points[k], edge.points[k + 1], node)) {
          edgeThroughNode.push(`edge ${edge.id} (${edge.sourceId}->${edge.targetId}) passes through "${node.label}" (${node.id})`);
          break;
        }
      }
    }
  }

  let edgeCrossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i], e2 = edges[j];
      if (e1.sourceId === e2.sourceId || e1.sourceId === e2.targetId || e1.targetId === e2.sourceId || e1.targetId === e2.targetId) continue;
      for (let a = 0; a < e1.points.length - 1; a++) {
        for (let b = 0; b < e2.points.length - 1; b++) {
          if (segIntersect(e1.points[a], e1.points[a + 1], e2.points[b], e2.points[b + 1])) edgeCrossings++;
        }
      }
    }
  }

  return { nodeOverlaps, edgeThroughNode, edgeCrossings };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/layout-core/test/geometry.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/layout-core/package.json packages/layout-core/test-utils packages/layout-core/test/geometry.test.ts
git commit -m "feat(layout-core): promote the geometric layout analyzer into a permanent test utility"
```

---

### Task B2: Permanent crossing-regression fixtures with today's baseline numbers

**Files:**
- Create: `packages/layout-engine-swimlane/test/verificationDiagrams.ts`
- Create: `packages/layout-engine-swimlane/test/crossing-regression.test.ts`
- Modify: `packages/layout-engine-swimlane/package.json` (add `@bpm/parser` dev dependency, needed to parse these fixtures)

**Interfaces:**
- Consumes: `analyzeLayout` from `@bpm/layout-core/test-utils/geometry`, `parse` from `@bpm/parser`, `layout` from the swimlane engine's own exported `layout` function (or via `@bpm/layout` facade — use the facade so this test also exercises engine selection, matching how the app actually calls it).

- [ ] **Step 1: Copy `VERIFICATION_DIAGRAMS`**

Copy the same object from Task A7's `packages/export-xml/test/verificationDiagrams.ts` into `packages/layout-engine-swimlane/test/verificationDiagrams.ts` — identical content, duplicated intentionally so each package's tests have no cross-package test-only dependency.

- [ ] **Step 2: Add `@bpm/parser` and `@bpm/layout` as devDependencies**

`packages/layout-engine-swimlane/package.json`, add to `devDependencies`:
```json
"@bpm/parser": "*",
"@bpm/layout": "*"
```

- [ ] **Step 3: Write the baseline regression test**

`packages/layout-engine-swimlane/test/crossing-regression.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '@bpm/parser';
import { layout } from '@bpm/layout';
import { analyzeLayout } from '@bpm/layout-core/test-utils/geometry';
import { VERIFICATION_DIAGRAMS } from './verificationDiagrams.js';

// Baseline captured before channel routing (Task B4). node overlaps and edge-through-node
// are already fully clean from prior sessions; only edgeCrossings is expected to improve.
const BASELINE_CROSSINGS: Record<string, number> = {
  screenshot: 0,
  poolLaneTwoBoundary: 2,
  fanOut: 0,
  nestedSubprocess: 0,
  crowdedBoundary: 1,
  orderToCashStacked: 18,
};

describe('crossing regression — verification diagrams', () => {
  it.each(Object.entries(VERIFICATION_DIAGRAMS))('diagram "%s" has zero node overlaps and zero edge-through-node', async (_name, text) => {
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const positioned = await layout(diagram);
    const result = analyzeLayout(positioned);
    expect(result.nodeOverlaps).toEqual([]);
    expect(result.edgeThroughNode).toEqual([]);
  });

  it.each(Object.entries(BASELINE_CROSSINGS))('diagram "%s" has at most its documented baseline crossing count', async (name, baseline) => {
    const { diagram } = parse(VERIFICATION_DIAGRAMS[name]);
    const positioned = await layout(diagram);
    const result = analyzeLayout(positioned);
    expect(result.edgeCrossings).toBeLessThanOrEqual(baseline);
  });
});
```

- [ ] **Step 4: Run test to verify it passes as-is (this captures today's state, not an improvement yet)**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Expected: PASS — this task only documents the current baseline as a permanent, enforced regression gate (`toBeLessThanOrEqual`, so it can never silently get worse); Task B5 tightens `BASELINE_CROSSINGS` toward 0 once channel routing is wired in.

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/package.json packages/layout-engine-swimlane/test/verificationDiagrams.ts packages/layout-engine-swimlane/test/crossing-regression.test.ts
git commit -m "test(layout-engine-swimlane): capture today's crossing counts as an enforced regression baseline"
```

---

### Task B3: `assignTracks` — the left-edge / multi-channel interval algorithm

**Files:**
- Create: `packages/layout-engine-swimlane/src/channelRouting.ts`
- Create: `packages/layout-engine-swimlane/test/channelRouting.test.ts`

**Interfaces:**
- Produces:
  - `interface ChannelInterval { id: string; channels: number[]; start: number; end: number }`
  - `function assignTracks(intervals: ChannelInterval[]): Map<string, number>` — pure function, no dependency on any layout types. Guarantees: for every channel number, any two intervals both listing that channel and assigned the same track number have non-overlapping `[start, end]` ranges.

- [ ] **Step 1: Write the failing test**

`packages/layout-engine-swimlane/test/channelRouting.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { assignTracks, type ChannelInterval } from '../src/channelRouting.js';

function tracksOverlap(a: ChannelInterval, b: ChannelInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function assertNoTrackCollisions(intervals: ChannelInterval[], tracks: Map<string, number>) {
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i], b = intervals[j];
      const sharedChannel = a.channels.some((c) => b.channels.includes(c));
      if (!sharedChannel) continue;
      if (tracks.get(a.id) === tracks.get(b.id)) {
        expect(tracksOverlap(a, b)).toBe(false);
      }
    }
  }
}

describe('assignTracks', () => {
  it('assigns non-overlapping intervals in the same channel to the same track (minimizes track count)', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 10 },
      { id: 'b', channels: [0], start: 20, end: 30 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).toBe(tracks.get('b'));
  });

  it('assigns overlapping intervals in the same channel to different tracks', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 20 },
      { id: 'b', channels: [0], start: 10, end: 30 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).not.toBe(tracks.get('b'));
    assertNoTrackCollisions(intervals, tracks);
  });

  it('handles three mutually-overlapping intervals with three distinct tracks', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 30 },
      { id: 'b', channels: [0], start: 5, end: 35 },
      { id: 'c', channels: [0], start: 10, end: 40 },
    ];
    const tracks = assignTracks(intervals);
    expect(new Set(tracks.values()).size).toBe(3);
    assertNoTrackCollisions(intervals, tracks);
  });

  it('keeps intervals in different, non-shared channels independent (can share a track)', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 100 },
      { id: 'b', channels: [1], start: 0, end: 100 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).toBe(0);
    expect(tracks.get('b')).toBe(0);
  });

  it('gives a multi-channel interval a track free across every channel it spans', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0, 1], start: 0, end: 50 },   // spans channels 0 and 1
      { id: 'b', channels: [0], start: 10, end: 20 },      // overlaps a in channel 0
      { id: 'c', channels: [1], start: 30, end: 40 },       // overlaps a in channel 1
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).not.toBe(tracks.get('b'));
    expect(tracks.get('a')).not.toBe(tracks.get('c'));
    assertNoTrackCollisions(intervals, tracks);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-engine-swimlane/test/channelRouting.test.ts`
Expected: FAIL — `../src/channelRouting.js` does not exist.

- [ ] **Step 3: Write `channelRouting.ts`**

```ts
export interface ChannelInterval {
  id: string;
  /** Channel indices (gaps between adjacent lanes) this interval's path passes through. */
  channels: number[];
  start: number;
  end: number;
}

/**
 * Generalized left-edge interval-scheduling: assigns each interval the lowest-numbered track
 * such that, in every channel it passes through, no other interval already on that track in
 * that channel has an overlapping [start, end) span. This is what guarantees two edges routed
 * through the same channel gap can never cross each other there — they're geometrically
 * separated onto different tracks whenever their horizontal spans would otherwise conflict.
 */
export function assignTracks(intervals: ChannelInterval[]): Map<string, number> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  // channelTrackEnds.get(channel)[track] = end x of the last interval assigned to that track in that channel
  const channelTrackEnds = new Map<number, number[]>();
  const trackById = new Map<string, number>();

  for (const interval of sorted) {
    let track = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const free = interval.channels.every((channel) => {
        const ends = channelTrackEnds.get(channel) ?? [];
        return (ends[track] ?? -Infinity) <= interval.start;
      });
      if (free) break;
      track += 1;
    }
    for (const channel of interval.channels) {
      const ends = channelTrackEnds.get(channel) ?? [];
      ends[track] = interval.end;
      channelTrackEnds.set(channel, ends);
    }
    trackById.set(interval.id, track);
  }

  return trackById;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-engine-swimlane/test/channelRouting.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/src/channelRouting.ts packages/layout-engine-swimlane/test/channelRouting.test.ts
git commit -m "feat(layout-engine-swimlane): add left-edge multi-channel track-assignment algorithm"
```

---

### Task B4: Wire channel routing into `laneBanding.ts`

**Files:**
- Modify: `packages/layout-engine-swimlane/src/laneBanding.ts`
- Modify: `packages/layout-engine-swimlane/test/swimlane.test.ts`

**Interfaces:**
- Consumes: `assignTracks`, `ChannelInterval` from `./channelRouting.js`.
- Modifies: `bandLanes` — lane Y-layout now reserves a channel gap between adjacent bands (sized by how many tracks that channel needs), and cross-lane edges are routed through their assigned track's y-level instead of linear interpolation. Same-lane edges are unchanged (still an exact shift — they don't cross any channel).

- [ ] **Step 1: Write the failing test**

Add to `packages/layout-engine-swimlane/test/swimlane.test.ts`:
```ts
it('routes two edges crossing the same lane boundary with overlapping x-spans onto different y-levels', async () => {
  const diagram: Diagram = {
    pools: [
      {
        id: 'pool1', name: 'P',
        lanes: [
          { id: 'lane1', name: 'A', nodeIds: ['a1', 'a2'] },
          { id: 'lane2', name: 'B', nodeIds: ['b1', 'b2'] },
        ],
      },
    ],
    nodes: [
      { kind: 'activity', id: 'a1', label: 'A1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'activity', id: 'a2', label: 'A2', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'activity', id: 'b1', label: 'B1', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'activity', id: 'b2', label: 'B2', activityType: 'task', collapsed: false, children: [], childEdges: [] },
    ],
    edges: [
      { id: 'e1', sourceId: 'a1', targetId: 'b2', flowType: 'sequence' }, // crosses lane1->lane2, spans right
      { id: 'e2', sourceId: 'a2', targetId: 'b1', flowType: 'sequence' }, // crosses lane1->lane2, spans left — overlaps e1's x-range
    ],
  };

  const positioned = await layout(diagram);
  const e1 = positioned.edges.find((e) => e.id === 'e1')!;
  const e2 = positioned.edges.find((e) => e.id === 'e2')!;

  // Both edges cross the same channel; their transition segments must sit at different y so
  // they don't cross each other.
  const e1ChannelY = e1.points.find((p) => p.y > 0)?.y;
  const e2ChannelY = e2.points.find((p) => p.y > 0)?.y;
  expect(e1ChannelY).not.toBe(e2ChannelY);
});
```

(This test lives alongside whatever the existing `layout` import/setup in `swimlane.test.ts` already uses — match the existing file's import style for `layout`, `Diagram`, etc.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout-engine-swimlane/test/swimlane.test.ts`
Expected: FAIL — today's linear interpolation routes both edges through the same proportionally-interpolated points, likely landing at the same or crossing y-levels.

- [ ] **Step 3: Rewrite `laneBanding.ts`**

```ts
import type { Diagram } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, PositionedLane } from '@bpm/layout-core';
import { assignTracks, type ChannelInterval } from './channelRouting.js';

const LANE_VERTICAL_PADDING = 20;
const POOL_TOP_PADDING = 12;
const MIN_CHANNEL_GAP = 8;
const TRACK_SPACING = 16;
const TRACK_MARGIN = 8;

function flattenPositioned(nodes: PositionedNode[], into: PositionedNode[] = []): PositionedNode[] {
  for (const node of nodes) {
    into.push(node);
    if (node.children) flattenPositioned(node.children, into);
  }
  return into;
}

function shiftNodeRecursively(node: PositionedNode, deltaY: number): PositionedNode {
  const shifted: PositionedNode = { ...node, y: node.y + deltaY };
  if (node.children) shifted.children = node.children.map((c) => shiftNodeRecursively(c, deltaY));
  if (node.childEdges) {
    shifted.childEdges = node.childEdges.map((e) => ({
      ...e,
      points: e.points.map((p) => ({ x: p.x, y: p.y + deltaY })),
    }));
  }
  return shifted;
}

export function bandLanes(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const positionedNodeById = new Map(flattenPositioned(positioned.nodes).map((n) => [n.id, n]));
  const deltaYById = new Map<string, number>();
  const allChannelRepairedEdgeIds = new Set<string>();
  const repairedEdgePoints = new Map<string, Array<{ x: number; y: number }>>();

  const newPools = positioned.pools.map((positionedPool) => {
    const pool = diagram.pools.find((p) => p.id === positionedPool.id);
    if (!pool || pool.lanes.length === 0) return positionedPool;

    const laneIndexByNodeId = new Map<string, number>();
    pool.lanes.forEach((lane, index) => {
      for (const id of lane.nodeIds) laneIndexByNodeId.set(id, index);
    });

    const lanesNodes = pool.lanes.map((lane) =>
      lane.nodeIds.map((id) => positionedNodeById.get(id)).filter((n): n is PositionedNode => Boolean(n)),
    );
    const allPoolNodes = lanesNodes.flat();
    if (allPoolNodes.length === 0) return positionedPool;

    const naturalSpreads = lanesNodes.map((nodes) => {
      if (nodes.length === 0) return { min: 0, spread: 0 };
      const min = Math.min(...nodes.map((n) => n.y));
      const max = Math.max(...nodes.map((n) => n.y + n.height));
      return { min, spread: max - min };
    });
    const laneHeight = Math.max(...naturalSpreads.map((s) => s.spread)) + LANE_VERTICAL_PADDING * 2;

    // Determine which cross-lane edges pass through which channel(s), using ELK's ORIGINAL
    // (pre-banding) x-positions — banding never changes x, so these spans are already final.
    const channelIntervals: ChannelInterval[] = [];
    const edgeById = new Map(positioned.edges.map((e) => [e.id, e]));
    for (const edge of positioned.edges) {
      const sourceLane = laneIndexByNodeId.get(edge.sourceId);
      const targetLane = laneIndexByNodeId.get(edge.targetId);
      if (sourceLane === undefined || targetLane === undefined || sourceLane === targetLane) continue;
      const lo = Math.min(sourceLane, targetLane);
      const hi = Math.max(sourceLane, targetLane);
      const channels = Array.from({ length: hi - lo }, (_, i) => lo + i);
      const sourceNode = positionedNodeById.get(edge.sourceId)!;
      const targetNode = positionedNodeById.get(edge.targetId)!;
      channelIntervals.push({
        id: edge.id,
        channels,
        start: Math.min(sourceNode.x, targetNode.x),
        end: Math.max(sourceNode.x + sourceNode.width, targetNode.x + targetNode.width),
      });
    }
    const trackByEdgeId = assignTracks(channelIntervals);
    const tracksByChannel = new Map<number, number>();
    for (const interval of channelIntervals) {
      const track = trackByEdgeId.get(interval.id)!;
      for (const channel of interval.channels) {
        tracksByChannel.set(channel, Math.max(tracksByChannel.get(channel) ?? 0, track + 1));
      }
    }
    const channelGap = (channel: number) => Math.max(MIN_CHANNEL_GAP, (tracksByChannel.get(channel) ?? 0) * TRACK_SPACING + TRACK_MARGIN);

    let currentY = positionedPool.y + POOL_TOP_PADDING;
    const positionedLanes: PositionedLane[] = [];
    const laneBandBottom: number[] = [];
    pool.lanes.forEach((lane, index) => {
      const laneY = currentY;
      positionedLanes.push({ id: lane.id, name: lane.name, x: positionedPool.x, y: laneY, width: positionedPool.width, height: laneHeight });
      const { min: naturalMin, spread: naturalSpread } = naturalSpreads[index];
      const centeringOffset = (laneHeight - naturalSpread) / 2;
      for (const node of lanesNodes[index]) {
        const newY = laneY + centeringOffset + (node.y - naturalMin);
        deltaYById.set(node.id, newY - node.y);
      }
      laneBandBottom[index] = laneY + laneHeight;
      currentY += laneHeight;
      if (index < pool.lanes.length - 1) currentY += channelGap(index);
    });

    // Build each cross-lane edge's real path through its assigned track's y-level in every
    // channel it crosses, instead of linearly interpolating the old (now-invalid) ELK path.
    for (const interval of channelIntervals) {
      const edge = edgeById.get(interval.id)!;
      const track = trackByEdgeId.get(interval.id)!;
      const source = positionedNodeById.get(edge.sourceId)!;
      const target = positionedNodeById.get(edge.targetId)!;
      const sourceDelta = deltaYById.get(edge.sourceId) ?? 0;
      const targetDelta = deltaYById.get(edge.targetId) ?? 0;
      const start = { x: source.x + source.width / 2, y: source.y + source.height + sourceDelta };
      const end = { x: target.x + target.width / 2, y: target.y + targetDelta };
      const midpoints = interval.channels.map((channel) => ({
        x: (start.x + end.x) / 2,
        y: laneBandBottom[channel] + TRACK_MARGIN / 2 + track * TRACK_SPACING,
      }));
      repairedEdgePoints.set(interval.id, [start, ...midpoints, end]);
      allChannelRepairedEdgeIds.add(interval.id);
    }

    return { ...positionedPool, height: currentY - positionedPool.y, lanes: positionedLanes };
  });

  const newNodes = positioned.nodes.map((node) => {
    const delta = deltaYById.get(node.id);
    return delta ? shiftNodeRecursively(node, delta) : node;
  });

  const newEdges = positioned.edges.map((edge) => {
    if (allChannelRepairedEdgeIds.has(edge.id)) {
      return { ...edge, points: repairedEdgePoints.get(edge.id)! };
    }
    // Same-lane edges (or edges with no lane-crossing at all): exact shift, preserving ELK's
    // original obstacle-avoiding path — see the original comment this replaces.
    const deltaSource = deltaYById.get(edge.sourceId);
    const deltaTarget = deltaYById.get(edge.targetId);
    if (deltaSource === undefined && deltaTarget === undefined) return edge;
    const dSource = deltaSource ?? 0;
    const dTarget = deltaTarget ?? 0;
    const n = edge.points.length;
    return {
      ...edge,
      points: edge.points.map((p, i) => {
        const t = n > 1 ? i / (n - 1) : 0;
        return { x: p.x, y: p.y + dSource + (dTarget - dSource) * t };
      }),
    };
  });

  return { pools: newPools, nodes: newNodes, edges: newEdges };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/layout-engine-swimlane/test/swimlane.test.ts`
Expected: PASS (including the new channel-routing test and all pre-existing tests in this file, which must still pass unchanged — they exercise the same-lane exact-shift path this task didn't touch)

- [ ] **Step 5: Commit**

```bash
git add packages/layout-engine-swimlane/src/laneBanding.ts packages/layout-engine-swimlane/test/swimlane.test.ts
git commit -m "feat(layout-engine-swimlane): route cross-lane edges through channel-assigned tracks"
```

---

### Task B5: Tighten the crossing-regression baseline and document the honest result

**Files:**
- Modify: `packages/layout-engine-swimlane/test/crossing-regression.test.ts`
- Modify: `docs/STATUS.md`

**Interfaces:**
- Consumes: the same `analyzeLayout` / verification-diagram fixtures from Task B2.

- [ ] **Step 1: Run the full regression suite to see the new numbers**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Read the actual `edgeCrossings` value for each diagram (temporarily loosen the `toBeLessThanOrEqual` assertions or add a `console.log(result.edgeCrossings)` if needed to observe them, then remove the debug output).

- [ ] **Step 2: Update `BASELINE_CROSSINGS` to the new, measured numbers**

Edit `packages/layout-engine-swimlane/test/crossing-regression.test.ts`'s `BASELINE_CROSSINGS` object: replace each value with the actual post-channel-routing count observed in Step 1. Change the assertion from `toBeLessThanOrEqual(baseline)` to `toBe(baseline)` now that the baseline reflects the real, current (improved) state — this makes any future regression fail loudly rather than silently being tolerated under a stale ceiling.

- [ ] **Step 3: Run test to verify it passes with the tightened assertion**

Run: `npx vitest run packages/layout-engine-swimlane/test/crossing-regression.test.ts`
Expected: PASS

- [ ] **Step 4: Run the full project test suite to confirm no regressions elsewhere**

Run: `npm test` (from repo root)
Expected: PASS, including every previously-passing test across all packages.

- [ ] **Step 5: Update `docs/STATUS.md` honestly**

In the "Known limitations" section, replace the old "~18 edge-edge crossings" bullet with the actual new numbers per diagram (from Step 1/2). If any diagram still has a non-zero crossing count after this genuine channel-routing implementation, keep it listed as a known limitation with a one-sentence explanation of why (e.g. "two same-lane edges using ELK's own native routing, which channel routing doesn't touch — closing this needs a full obstacle-aware router, tracked in `docs/ROADMAP.md`"). If all 7 diagrams reach zero, replace the bullet with a note that this is now resolved.

- [ ] **Step 6: Commit**

```bash
git add packages/layout-engine-swimlane/test/crossing-regression.test.ts docs/STATUS.md
git commit -m "test(layout-engine-swimlane): tighten crossing regression baseline to post-channel-routing counts"
```

---

## Self-Review Notes

- **Spec coverage:** Part A covers every element/flow-type mapping table in the design spec (events × triggers, gateways, activities incl. nesting, data/artifacts, conditional/default flows, pools/lanes/collaboration/message flows, full BPMNDI geometry), verified via the specified bpmn-js round-trip method, across all 6 non-directive-variant verification diagrams. Part B implements the specified left-edge/multi-channel algorithm exactly as designed, promotes the geometry analyzer as specified, and follows the spec's honesty clause for any residual crossings.
- **Placeholder scan:** No TBD/TODO. The one accepted placeholder (multiple/parallelMultiple event-definition content) is called out explicitly in Global Constraints and in `eventDefinitions.ts`'s own comment, not hidden.
- **Type consistency:** `ChannelInterval`/`assignTracks` from Task B3 are the exact types/signature Task B4's `laneBanding.ts` imports and uses. `analyzeLayout`'s return shape from Task B1 is exactly what Task B2 and B5's regression tests destructure. `exportToXml(diagram, positioned)`'s signature is established in Task A1 and never changes across A2–A7, matching the design spec.
