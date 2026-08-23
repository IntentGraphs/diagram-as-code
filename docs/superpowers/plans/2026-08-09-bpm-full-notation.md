# BPM Full BPMN 2.0 Notation (Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Milestone 1 pipeline (`@bpm/ast` → `@bpm/parser` → `@bpm/layout` → `@bpm/render` → `apps/web`) to cover the full standard BPMN 2.0 notation palette in one pass: all event trigger types across start/intermediate/end/boundary, all gateway types, sub-processes/transactions/call activities (with nesting), data objects/stores, artifacts (text annotation, group), and all standard flow types (sequence, conditional, default, message, association).

**Architecture:** Same package boundaries as Milestone 1. This milestone (a) migrates `@bpm/ast`'s flat `NodeType` string to a discriminated union so events/gateways/activities/data/artifacts can each carry the fields BPMN actually requires, (b) generalizes the parser's fixed 2-level pool/lane indentation into an arbitrary-depth indentation-stack parser so sub-processes/transactions can nest, (c) adds a post-layout pass in `@bpm/layout` to position boundary events on their host activity's border (ELK has no "attached to border" concept, so this is handled outside ELK), and (d) adds a data-driven icon library to `@bpm/render` so every event trigger/gateway type/activity type gets a distinct, recognizable marker.

**Tech Stack:** Same as Milestone 1 — TypeScript, npm workspaces, Vitest, Playwright, elkjs, Vite. No new dependencies.

## Global Constraints

- This migration **replaces** Milestone 1's concrete syntax (`start "x" as n1`, `gateway "x" as g1`, etc.) with the new grammar defined below. Milestone 1's example diagrams are not preserved as valid input — acceptable because the syntax was explicitly documented as provisional and isolated to `@bpm/parser`; only `@bpm/parser`'s own tests need rewriting.
- BPMN's legality rules for which trigger is valid on which event category (e.g., `terminate` is end-only in the real spec) are **not enforced** in this milestone — the parser accepts any category × trigger combination structurally. Enforcing full BPMN legality is a deferred validation improvement, not part of this plan.
- Icons for event triggers/gateway types are simplified geometric approximations (clear and distinct, not pixel-perfect BPMN icon-pack reproductions). Visual polish is a later pass.
- Message flow and association edges are laid out by the same ELK graph as sequence flows (ELK supports edges that cross container boundaries natively) — no custom cross-pool router is introduced.
- Boundary events are **excluded** from the ELK graph entirely and positioned in a deterministic post-layout pass, because ELK has no concept of a node fixed to another node's border.
- All existing Milestone 1 behavior (debounced live re-render, parser never throws, last-valid-diagram-stays-rendered, structured `{line, column, message}` errors) is preserved unchanged.

---

## Concrete Syntax (v2)

Replaces Milestone 1's syntax entirely.

**Events** — `event <category> <trigger> "<label>" as <id>`
Categories: `start | intermediate | end`.
Triggers: `none | message | timer | error | escalation | cancel | compensation | conditional | link | signal | multiple | parallelMultiple | terminate`.
```
event start none "Order received" as n1
event start message "Order placed" as n2
event intermediate timer "Wait 1h" as n3
event end terminate "Cancelled" as n4
```

**Boundary events** — `boundary <trigger> <interrupting|nonInterrupting> "<label>" as <id> on <activityId>`
```
boundary timer interrupting "Timeout" as b1 on t1
boundary error nonInterrupting "On error" as b2 on t1
```

**Gateways** — `gateway <type> "<label>" as <id>`
Types: `exclusive | parallel | inclusive | complex | eventBased`.
```
gateway exclusive "Approved?" as g1
```

**Activities** — `task "<label>" as <id>` / `subprocess "<label>" as <id> [collapsed]` / `transaction "<label>" as <id> [collapsed]` / `callActivity "<label>" as <id>`
`subprocess`/`transaction` (when not `collapsed`) own an indented block of nested node/edge lines, exactly like `pool`/`lane` in Milestone 1, generalized to arbitrary depth (each nesting level adds 2 spaces):
```
subprocess "Handle payment" as sp1
  event start none "Sub start" as sn1
  task "Charge card" as sn2
  sn1 -> sn2
```

**Data & artifacts:**
```
dataObject "Invoice" as d1
dataStore "Customer DB" as ds1
annotation "Must complete within SLA" as note1
group "Critical path" as grp1
```

**Edges** — arrow token selects flow type:
```
n1 -> n2              # sequence flow
g1 => n2 : "yes"       # conditional sequence flow (diamond marker at source)
g1 ->> n3              # default sequence flow (slash marker at source)
n1 ~> n5               # message flow (dashed)
d1 ..> t1              # association (dotted)
```

**Pools/lanes**: unchanged from Milestone 1 (`pool "<name>"` / `lane "<name>"`, 2-space indentation).

---

## File Structure (new/changed files)

```
packages/ast/src/types.ts                  # MODIFY: discriminated union NodeKind types
packages/ast/test/types.test.ts             # MODIFY: cover every new node/edge kind

packages/parser/src/tokens.ts               # CREATE: trigger/category/gatewayType/activityType token tables
packages/parser/src/parser.ts               # MODIFY: indentation-stack recursion, new grammar
packages/parser/test/parser.test.ts         # MODIFY: full rewrite for v2 syntax

packages/layout/src/toElkGraph.ts           # MODIFY: recursive containment, boundary-event exclusion
packages/layout/src/fromElkLayout.ts        # MODIFY: recursive containment
packages/layout/src/boundaryEvents.ts       # CREATE: post-layout border positioning + edge routing
packages/layout/src/index.ts                # MODIFY: wire boundaryEvents pass into layout()
packages/layout/test/layout.test.ts         # MODIFY: add sub-process nesting + boundary event cases

packages/render/src/icons.ts                # CREATE: data-driven trigger/gateway icon library
packages/render/src/shapes.ts               # MODIFY: dispatch on node.kind, use icons.ts, recursive sub-process render
packages/render/src/edges.ts                # MODIFY: dispatch on edge.flowType
packages/render/test/render.test.ts         # MODIFY: cover every new shape/marker

apps/web/src/main.ts                        # MODIFY: starter text showcases the new notation
apps/web/test/e2e/live-render.spec.ts       # MODIFY: assert a representative sample of new elements render
```

---

### Task 1: Migrate `@bpm/ast` to a discriminated-union node model

**Files:**
- Modify: `packages/ast/src/types.ts`
- Modify: `packages/ast/src/index.ts`
- Modify: `packages/ast/test/types.test.ts`

**Interfaces:**
- Produces:
  - `type EventCategory = 'start' | 'intermediate' | 'end'`
  - `type EventTrigger = 'none' | 'message' | 'timer' | 'error' | 'escalation' | 'cancel' | 'compensation' | 'conditional' | 'link' | 'signal' | 'multiple' | 'parallelMultiple' | 'terminate'`
  - `type GatewayType = 'exclusive' | 'parallel' | 'inclusive' | 'complex' | 'eventBased'`
  - `type ActivityType = 'task' | 'subProcess' | 'transaction' | 'callActivity'`
  - `type FlowType = 'sequence' | 'conditionalSequence' | 'defaultSequence' | 'message' | 'association'`
  - `interface EventNode { kind: 'event'; id: string; label: string; category: EventCategory; trigger: EventTrigger; interrupting: boolean; attachedToId?: string }`
  - `interface GatewayNode { kind: 'gateway'; id: string; label: string; gatewayType: GatewayType }`
  - `interface ActivityNode { kind: 'activity'; id: string; label: string; activityType: ActivityType; collapsed: boolean; children: DiagramNode[]; childEdges: DiagramEdge[] }`
  - `interface DataObjectNode { kind: 'dataObject'; id: string; label: string }`
  - `interface DataStoreNode { kind: 'dataStore'; id: string; label: string }`
  - `interface TextAnnotationNode { kind: 'textAnnotation'; id: string; label: string }`
  - `interface GroupNode { kind: 'group'; id: string; label: string }`
  - `type DiagramNode = EventNode | GatewayNode | ActivityNode | DataObjectNode | DataStoreNode | TextAnnotationNode | GroupNode`
  - `interface DiagramEdge { id: string; sourceId: string; targetId: string; label?: string; flowType: FlowType }`
  - `Lane`, `Pool`, `Diagram` unchanged in shape (still `{ pools, nodes, edges }`), but `nodes`/`edges` now use the new types.

- [ ] **Step 1: Write the failing test**

`packages/ast/test/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Diagram, EventNode, GatewayNode, ActivityNode, DataObjectNode, DiagramEdge } from '../src/index.js';

describe('Diagram AST v2 shape', () => {
  it('supports every node kind and every flow type', () => {
    const start: EventNode = { kind: 'event', id: 'n1', label: 'Start', category: 'start', trigger: 'none', interrupting: true };
    const boundary: EventNode = { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' };
    const gateway: GatewayNode = { kind: 'gateway', id: 'g1', label: 'Approved?', gatewayType: 'inclusive' };
    const subProcess: ActivityNode = {
      kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
      children: [{ kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true }],
      childEdges: [],
    };
    const dataObject: DataObjectNode = { kind: 'dataObject', id: 'd1', label: 'Invoice' };
    const edge: DiagramEdge = { id: 'e1', sourceId: 'n1', targetId: 'g1', flowType: 'conditionalSequence' };

    const diagram: Diagram = {
      pools: [],
      nodes: [start, boundary, gateway, subProcess, dataObject],
      edges: [edge],
    };

    expect(diagram.nodes).toHaveLength(5);
    expect((diagram.nodes[3] as ActivityNode).children).toHaveLength(1);
    expect(diagram.edges[0].flowType).toBe('conditionalSequence');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: FAIL — current `types.ts` has no `kind` discriminant, no `EventNode`/`GatewayNode`/etc.

- [ ] **Step 3: Rewrite `types.ts`**

`packages/ast/src/types.ts`:
```ts
export type EventCategory = 'start' | 'intermediate' | 'end';

export type EventTrigger =
  | 'none' | 'message' | 'timer' | 'error' | 'escalation' | 'cancel'
  | 'compensation' | 'conditional' | 'link' | 'signal' | 'multiple'
  | 'parallelMultiple' | 'terminate';

export type GatewayType = 'exclusive' | 'parallel' | 'inclusive' | 'complex' | 'eventBased';

export type ActivityType = 'task' | 'subProcess' | 'transaction' | 'callActivity';

export type FlowType = 'sequence' | 'conditionalSequence' | 'defaultSequence' | 'message' | 'association';

export interface EventNode {
  kind: 'event';
  id: string;
  label: string;
  category: EventCategory;
  trigger: EventTrigger;
  interrupting: boolean;
  /** Set only for boundary events: the id of the activity this event is attached to. */
  attachedToId?: string;
}

export interface GatewayNode {
  kind: 'gateway';
  id: string;
  label: string;
  gatewayType: GatewayType;
}

export interface ActivityNode {
  kind: 'activity';
  id: string;
  label: string;
  activityType: ActivityType;
  collapsed: boolean;
  children: DiagramNode[];
  childEdges: DiagramEdge[];
}

export interface DataObjectNode {
  kind: 'dataObject';
  id: string;
  label: string;
}

export interface DataStoreNode {
  kind: 'dataStore';
  id: string;
  label: string;
}

export interface TextAnnotationNode {
  kind: 'textAnnotation';
  id: string;
  label: string;
}

export interface GroupNode {
  kind: 'group';
  id: string;
  label: string;
}

export type DiagramNode =
  | EventNode
  | GatewayNode
  | ActivityNode
  | DataObjectNode
  | DataStoreNode
  | TextAnnotationNode
  | GroupNode;

export interface DiagramEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  flowType: FlowType;
}

export interface Lane {
  id: string;
  name: string;
  nodeIds: string[];
}

export interface Pool {
  id: string;
  name: string;
  lanes: Lane[];
}

export interface Diagram {
  pools: Pool[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export function isEvent(node: DiagramNode): node is EventNode {
  return node.kind === 'event';
}
export function isBoundaryEvent(node: DiagramNode): node is EventNode {
  return node.kind === 'event' && node.attachedToId !== undefined;
}
export function isGateway(node: DiagramNode): node is GatewayNode {
  return node.kind === 'gateway';
}
export function isActivity(node: DiagramNode): node is ActivityNode {
  return node.kind === 'activity';
}
```

- [ ] **Step 4: Update `index.ts`**

`packages/ast/src/index.ts`:
```ts
export type {
  EventCategory, EventTrigger, GatewayType, ActivityType, FlowType,
  EventNode, GatewayNode, ActivityNode, DataObjectNode, DataStoreNode,
  TextAnnotationNode, GroupNode, DiagramNode, DiagramEdge, Lane, Pool, Diagram,
} from './types.js';
export { isEvent, isBoundaryEvent, isGateway, isActivity } from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/ast/test/types.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ast
git commit -m "feat(ast)!: migrate to discriminated-union node model for full BPMN 2.0 coverage"
```

---

### Task 2: `@bpm/parser` — token tables and flat event/gateway/activity/data/artifact lines

**Files:**
- Create: `packages/parser/src/tokens.ts`
- Modify: `packages/parser/src/parser.ts`
- Modify: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: new `@bpm/ast` types from Task 1.
- Produces: `parse()` unchanged signature (`ParseResult`), now understands `event`, `boundary`, `gateway`, `task`, `subprocess`, `transaction`, `callActivity`, `dataObject`, `dataStore`, `annotation`, `group` lines, and `->`, `=>`, `->>`, `~>`, `..>` edge tokens. Sub-process/transaction nesting is deferred to Task 3; this task handles all node/edge kinds at the flat (non-nested) level, and drops Milestone 1's old one-word syntax entirely.

- [ ] **Step 1: Write `tokens.ts`**

`packages/parser/src/tokens.ts`:
```ts
import type { EventCategory, EventTrigger, GatewayType, FlowType } from '@bpm/ast';

export const EVENT_CATEGORIES: EventCategory[] = ['start', 'intermediate', 'end'];

export const EVENT_TRIGGERS: EventTrigger[] = [
  'none', 'message', 'timer', 'error', 'escalation', 'cancel',
  'compensation', 'conditional', 'link', 'signal', 'multiple',
  'parallelMultiple', 'terminate',
];

export const GATEWAY_TYPES: GatewayType[] = ['exclusive', 'parallel', 'inclusive', 'complex', 'eventBased'];

export const EDGE_ARROW_TO_FLOW_TYPE: Record<string, FlowType> = {
  '->': 'sequence',
  '=>': 'conditionalSequence',
  '->>': 'defaultSequence',
  '~>': 'message',
  '..>': 'association',
};

export function isEventCategory(token: string): token is EventCategory {
  return (EVENT_CATEGORIES as string[]).includes(token);
}
export function isEventTrigger(token: string): token is EventTrigger {
  return (EVENT_TRIGGERS as string[]).includes(token);
}
export function isGatewayType(token: string): token is GatewayType {
  return (GATEWAY_TYPES as string[]).includes(token);
}
```

- [ ] **Step 2: Write the failing test (replacing Milestone 1's parser tests)**

Replace the entire contents of `packages/parser/test/parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';
import type { EventNode, GatewayNode, ActivityNode, DataObjectNode } from '@bpm/ast';

describe('parse — flat node kinds', () => {
  it('parses an event line', () => {
    const { diagram, errors } = parse('event start message "Order placed" as n1');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toEqual({
      kind: 'event', id: 'n1', label: 'Order placed', category: 'start', trigger: 'message', interrupting: true,
    } satisfies EventNode);
  });

  it('parses a boundary event line, attaching it to its activity id', () => {
    const text = [
      'task "Charge card" as t1',
      'boundary timer interrupting "Timeout" as b1 on t1',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const boundary = diagram.nodes.find((n) => n.id === 'b1') as EventNode;
    expect(boundary).toEqual({
      kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer',
      interrupting: true, attachedToId: 't1',
    });
  });

  it('reports a structured error when a boundary event references an unknown activity id', () => {
    const { errors } = parse('boundary timer interrupting "Timeout" as b1 on nope');
    expect(errors).toEqual([
      { line: 1, column: 1, message: 'Boundary event references unknown activity id "nope"' },
    ]);
  });

  it('parses a gateway line with an explicit type', () => {
    const { diagram, errors } = parse('gateway inclusive "Which paths?" as g1');
    expect(errors).toEqual([]);
    expect(diagram.nodes[0]).toEqual({
      kind: 'gateway', id: 'g1', label: 'Which paths?', gatewayType: 'inclusive',
    } satisfies GatewayNode);
  });

  it('parses task, callActivity, dataObject, dataStore, annotation, group lines', () => {
    const text = [
      'task "Review" as t1',
      'callActivity "Shared flow" as ca1',
      'dataObject "Invoice" as d1',
      'dataStore "Customer DB" as ds1',
      'annotation "SLA note" as note1',
      'group "Critical path" as grp1',
    ].join('\n');
    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.nodes).toEqual([
      { kind: 'activity', id: 't1', label: 'Review', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'activity', id: 'ca1', label: 'Shared flow', activityType: 'callActivity', collapsed: false, children: [], childEdges: [] },
      { kind: 'dataObject', id: 'd1', label: 'Invoice' },
      { kind: 'dataStore', id: 'ds1', label: 'Customer DB' },
      { kind: 'textAnnotation', id: 'note1', label: 'SLA note' },
      { kind: 'group', id: 'grp1', label: 'Critical path' },
    ] as ActivityNode[] & DataObjectNode[]);
  });

  it('reports a structured error for an unknown event trigger', () => {
    const { errors } = parse('event start bogus "x" as n1');
    expect(errors).toEqual([
      { line: 1, column: 1, message: 'Unknown event trigger "bogus"' },
    ]);
  });
});

describe('parse — edges with flow types', () => {
  it('parses every edge arrow token to its flow type', () => {
    const text = [
      'event start none "Start" as n1',
      'gateway exclusive "OK?" as g1',
      'task "Handle" as t1',
      'task "Fallback" as t2',
      'dataObject "Doc" as d1',
      'event end none "End" as n2',
      '',
      'n1 -> g1',
      'g1 => t1 : "yes"',
      'g1 ->> t2',
      't1 ~> n2',
      'd1 ..> t1',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.edges.map((e) => e.flowType)).toEqual([
      'sequence', 'conditionalSequence', 'defaultSequence', 'message', 'association',
    ]);
    expect(diagram.edges[1].label).toBe('yes');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: FAIL — old `parser.ts` doesn't recognize any of these lines.

- [ ] **Step 4: Rewrite `parser.ts` (flat parsing only — nesting comes in Task 3)**

`packages/parser/src/parser.ts`:
```ts
import type { Diagram, DiagramNode, DiagramEdge, ActivityType } from '@bpm/ast';
import type { ParseError } from './errors.js';
import { isEventCategory, isEventTrigger, isGatewayType, EDGE_ARROW_TO_FLOW_TYPE } from './tokens.js';

const EVENT_LINE = /^event\s+(\S+)\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const BOUNDARY_LINE = /^boundary\s+(\S+)\s+(interrupting|nonInterrupting)\s+"([^"]*)"\s+as\s+(\S+)\s+on\s+(\S+)$/;
const GATEWAY_LINE = /^gateway\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const ACTIVITY_LINE = /^(task|subprocess|transaction|callActivity)\s+"([^"]*)"\s+as\s+(\S+)(\s+collapsed)?$/;
const DATA_LINE = /^(dataObject|dataStore|annotation|group)\s+"([^"]*)"\s+as\s+(\S+)$/;
const EDGE_LINE = /^(\S+)\s*(->>|->|=>|~>|\.\.>)\s*(\S+)(?:\s*:\s*"?([^"]*?)"?)?$/;

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  task: 'task', subprocess: 'subProcess', transaction: 'transaction', callActivity: 'callActivity',
};
const DATA_KIND_MAP: Record<string, DiagramNode['kind']> = {
  dataObject: 'dataObject', dataStore: 'dataStore', annotation: 'textAnnotation', group: 'group',
};

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

export function parse(text: string): ParseResult {
  const lines = text.split('\n');
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const errors: ParseError[] = [];
  const knownIds = new Set<string>();
  let edgeCounter = 0;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') return;

    const eventMatch = line.match(EVENT_LINE);
    if (eventMatch) {
      const [, category, trigger, label, id] = eventMatch;
      if (!isEventCategory(category)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event category "${category}"` });
        return;
      }
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      nodes.push({ kind: 'event', id, label, category, trigger, interrupting: true });
      knownIds.add(id);
      return;
    }

    const boundaryMatch = line.match(BOUNDARY_LINE);
    if (boundaryMatch) {
      const [, trigger, interrupting, label, id, attachedToId] = boundaryMatch;
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!knownIds.has(attachedToId)) {
        errors.push({ line: lineNumber, column: 1, message: `Boundary event references unknown activity id "${attachedToId}"` });
        return;
      }
      nodes.push({
        kind: 'event', id, label, category: 'intermediate', trigger,
        interrupting: interrupting === 'interrupting', attachedToId,
      });
      knownIds.add(id);
      return;
    }

    const gatewayMatch = line.match(GATEWAY_LINE);
    if (gatewayMatch) {
      const [, gatewayType, label, id] = gatewayMatch;
      if (!isGatewayType(gatewayType)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown gateway type "${gatewayType}"` });
        return;
      }
      nodes.push({ kind: 'gateway', id, label, gatewayType });
      knownIds.add(id);
      return;
    }

    const activityMatch = line.match(ACTIVITY_LINE);
    if (activityMatch) {
      const [, typeToken, label, id, collapsedToken] = activityMatch;
      nodes.push({
        kind: 'activity', id, label, activityType: ACTIVITY_TYPE_MAP[typeToken],
        collapsed: Boolean(collapsedToken), children: [], childEdges: [],
      });
      knownIds.add(id);
      return;
    }

    const dataMatch = line.match(DATA_LINE);
    if (dataMatch) {
      const [, typeToken, label, id] = dataMatch;
      const kind = DATA_KIND_MAP[typeToken];
      nodes.push({ kind, id, label } as DiagramNode);
      knownIds.add(id);
      return;
    }

    const edgeMatch = line.match(EDGE_LINE);
    if (edgeMatch) {
      const [, sourceId, arrow, targetId, label] = edgeMatch;
      if (!knownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!knownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      edgeCounter += 1;
      edges.push({
        id: `e${edgeCounter}`, sourceId, targetId,
        label: label?.trim() || undefined,
        flowType: EDGE_ARROW_TO_FLOW_TYPE[arrow],
      });
      return;
    }

    errors.push({ line: lineNumber, column: 1, message: `Could not parse line: "${line}"` });
  });

  return { diagram: { pools: [], nodes, edges }, errors };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS (all tests in both describe blocks)

- [ ] **Step 6: Commit**

```bash
git add packages/parser/src/tokens.ts packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser)!: parse full BPMN 2.0 node kinds and flow-typed edges (flat)"
```

---

### Task 3: `@bpm/parser` — arbitrary-depth nesting for pools/lanes/sub-processes/transactions

**Files:**
- Modify: `packages/parser/src/parser.ts`
- Modify: `packages/parser/test/parser.test.ts`

**Interfaces:**
- Consumes: same as Task 2.
- Produces: `parse()` now supports `pool`/`lane` (as in Milestone 1) **and** `subprocess`/`transaction` bodies, at arbitrary nesting depth via a 2-space-per-level indentation stack. Nodes/edges declared inside a `subprocess`/`transaction` populate that activity's `children`/`childEdges` instead of the top-level `diagram.nodes`/`diagram.edges`.

- [ ] **Step 1: Write the failing test**

Add to `packages/parser/test/parser.test.ts`:
```ts
describe('parse — nested containers', () => {
  it('parses a subprocess body into the activity node\'s children/childEdges', () => {
    const text = [
      'subprocess "Handle payment" as sp1',
      '  event start none "Sub start" as sn1',
      '  task "Charge card" as sn2',
      '  sn1 -> sn2',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const sp = diagram.nodes[0] as import('@bpm/ast').ActivityNode;
    expect(sp.activityType).toBe('subProcess');
    expect(sp.children.map((n) => n.id)).toEqual(['sn1', 'sn2']);
    expect(sp.childEdges).toEqual([{ id: 'e1', sourceId: 'sn1', targetId: 'sn2', label: undefined, flowType: 'sequence' }]);
    expect(diagram.nodes).toHaveLength(1); // sn1/sn2 are NOT also top-level nodes
  });

  it('parses nested subprocess-within-subprocess at arbitrary depth', () => {
    const text = [
      'subprocess "Outer" as sp1',
      '  subprocess "Inner" as sp2',
      '    task "Deep task" as dt1',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    const outer = diagram.nodes[0] as import('@bpm/ast').ActivityNode;
    const inner = outer.children[0] as import('@bpm/ast').ActivityNode;
    expect(inner.id).toBe('sp2');
    expect(inner.children[0].id).toBe('dt1');
  });

  it('still parses pool/lane blocks unchanged from Milestone 1', () => {
    const text = [
      'pool "Order Process"',
      '  lane "Sales"',
      '    event start none "Start" as n1',
      '    task "Review" as n2',
    ].join('\n');

    const { diagram, errors } = parse(text);
    expect(errors).toEqual([]);
    expect(diagram.pools[0].lanes[0].nodeIds).toEqual(['n1', 'n2']);
    expect(diagram.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: FAIL — Task 2's parser has no concept of indentation/nesting at all yet.

- [ ] **Step 3: Rewrite `parser.ts` around an indentation-stack**

Replace the body of `parse()` in `packages/parser/src/parser.ts` with a stack-based version. Full file:

```ts
import type { Diagram, DiagramNode, DiagramEdge, ActivityType, ActivityNode, Pool, Lane } from '@bpm/ast';
import type { ParseError } from './errors.js';
import { isEventCategory, isEventTrigger, isGatewayType, EDGE_ARROW_TO_FLOW_TYPE } from './tokens.js';

const EVENT_LINE = /^event\s+(\S+)\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const BOUNDARY_LINE = /^boundary\s+(\S+)\s+(interrupting|nonInterrupting)\s+"([^"]*)"\s+as\s+(\S+)\s+on\s+(\S+)$/;
const GATEWAY_LINE = /^gateway\s+(\S+)\s+"([^"]*)"\s+as\s+(\S+)$/;
const ACTIVITY_LINE = /^(task|subprocess|transaction|callActivity)\s+"([^"]*)"\s+as\s+(\S+)(\s+collapsed)?$/;
const DATA_LINE = /^(dataObject|dataStore|annotation|group)\s+"([^"]*)"\s+as\s+(\S+)$/;
const POOL_LINE = /^pool\s+"([^"]*)"$/;
const LANE_LINE = /^lane\s+"([^"]*)"$/;
const EDGE_LINE = /^(\S+)\s*(->>|->|=>|~>|\.\.>)\s*(\S+)(?:\s*:\s*"?([^"]*?)"?)?$/;

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  task: 'task', subprocess: 'subProcess', transaction: 'transaction', callActivity: 'callActivity',
};
const DATA_KIND_MAP: Record<string, DiagramNode['kind']> = {
  dataObject: 'dataObject', dataStore: 'dataStore', annotation: 'textAnnotation', group: 'group',
};
const NESTABLE_ACTIVITY_TYPES: ActivityType[] = ['subProcess', 'transaction'];

export interface ParseResult {
  diagram: Diagram;
  errors: ParseError[];
}

interface Frame {
  indent: number; // indentation level this frame's children are expected at
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  knownIds: Set<string>;
  // present only for a pool/lane frame:
  pool?: Pool;
  lane?: Lane;
  // present only for a subprocess/transaction frame:
  activity?: ActivityNode;
}

function indentOf(rawLine: string): number {
  const match = rawLine.match(/^ */);
  return match ? match[0].length : 0;
}

export function parse(text: string): ParseResult {
  const lines = text.split('\n');
  const errors: ParseError[] = [];
  let edgeCounter = 0;
  let poolCounter = 0;
  let laneCounter = 0;

  const root: Frame = { indent: 0, nodes: [], edges: [], knownIds: new Set() };
  const stack: Frame[] = [root];
  const allKnownIds = new Set<string>(); // global id-uniqueness across the whole diagram, for edges/boundary targets
  const allNodesById = new Map<string, DiagramNode>();

  function currentFrame(): Frame {
    return stack[stack.length - 1];
  }

  function popFramesDeeperThan(indent: number) {
    while (stack.length > 1 && indent < currentFrame().indent) {
      const finished = stack.pop()!;
      if (finished.activity) {
        finished.activity.children = finished.nodes;
        finished.activity.childEdges = finished.edges;
      }
      if (finished.pool) {
        currentFrame().pool ? undefined : root; // no-op guard for type narrowing
      }
    }
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (line === '') return;
    const indent = indentOf(rawLine);

    // Close any frames we've dedented out of.
    while (stack.length > 1 && indent < currentFrame().indent) {
      const finished = stack.pop()!;
      if (finished.activity) {
        finished.activity.children = finished.nodes;
        finished.activity.childEdges = finished.edges;
      }
    }

    const frame = currentFrame();
    const expectedChildIndent = frame.indent + 2;

    const poolMatch = line.match(POOL_LINE);
    if (poolMatch && indent === 0) {
      poolCounter += 1;
      const pool: Pool = { id: `pool${poolCounter}`, name: poolMatch[1], lanes: [] };
      root.nodes; // pools live outside the node tree; tracked separately below
      (root as any)._pools = (root as any)._pools ?? [];
      (root as any)._pools.push(pool);
      stack.push({ indent: expectedChildIndent, nodes: [], edges: [], knownIds: new Set(), pool });
      return;
    }

    const laneMatch = line.match(LANE_LINE);
    if (laneMatch && frame.pool && indent === frame.indent) {
      laneCounter += 1;
      const lane: Lane = { id: `lane${laneCounter}`, name: laneMatch[1], nodeIds: [] };
      frame.pool.lanes.push(lane);
      stack.push({ indent: expectedChildIndent, nodes: [], edges: [], knownIds: new Set(), lane });
      return;
    }

    if (indent > frame.indent && !frame.pool && !frame.lane && !frame.activity && frame !== root) {
      // unreachable in practice; guards against malformed indentation under a non-container frame
    }

    const eventMatch = line.match(EVENT_LINE);
    const boundaryMatch = line.match(BOUNDARY_LINE);
    const gatewayMatch = line.match(GATEWAY_LINE);
    const activityMatch = line.match(ACTIVITY_LINE);
    const dataMatch = line.match(DATA_LINE);
    const edgeMatch = !eventMatch && !boundaryMatch && !gatewayMatch && !activityMatch && !dataMatch
      ? line.match(EDGE_LINE) : null;

    function addNode(node: DiagramNode) {
      if (frame.lane) frame.lane.nodeIds.push(node.id);
      frame.nodes.push(node);
      frame.knownIds.add(node.id);
      allKnownIds.add(node.id);
      allNodesById.set(node.id, node);
    }

    if (eventMatch) {
      const [, category, trigger, label, id] = eventMatch;
      if (!isEventCategory(category)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event category "${category}"` });
        return;
      }
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      addNode({ kind: 'event', id, label, category, trigger, interrupting: true });
      return;
    }

    if (boundaryMatch) {
      const [, trigger, interrupting, label, id, attachedToId] = boundaryMatch;
      if (!isEventTrigger(trigger)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown event trigger "${trigger}"` });
        return;
      }
      if (!allKnownIds.has(attachedToId)) {
        errors.push({ line: lineNumber, column: 1, message: `Boundary event references unknown activity id "${attachedToId}"` });
        return;
      }
      addNode({ kind: 'event', id, label, category: 'intermediate', trigger, interrupting: interrupting === 'interrupting', attachedToId });
      return;
    }

    if (gatewayMatch) {
      const [, gatewayType, label, id] = gatewayMatch;
      if (!isGatewayType(gatewayType)) {
        errors.push({ line: lineNumber, column: 1, message: `Unknown gateway type "${gatewayType}"` });
        return;
      }
      addNode({ kind: 'gateway', id, label, gatewayType });
      return;
    }

    if (activityMatch) {
      const [, typeToken, label, id, collapsedToken] = activityMatch;
      const activityType = ACTIVITY_TYPE_MAP[typeToken];
      const collapsed = Boolean(collapsedToken);
      const node: ActivityNode = { kind: 'activity', id, label, activityType, collapsed, children: [], childEdges: [] };
      addNode(node);
      if (NESTABLE_ACTIVITY_TYPES.includes(activityType) && !collapsed) {
        stack.push({ indent: expectedChildIndent, nodes: [], edges: [], knownIds: new Set(), activity: node });
      }
      return;
    }

    if (dataMatch) {
      const [, typeToken, label, id] = dataMatch;
      addNode({ kind: DATA_KIND_MAP[typeToken], id, label } as DiagramNode);
      return;
    }

    if (edgeMatch) {
      const [, sourceId, arrow, targetId, label] = edgeMatch;
      if (!frame.knownIds.has(sourceId) && !allKnownIds.has(sourceId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${sourceId}"` });
        return;
      }
      if (!frame.knownIds.has(targetId) && !allKnownIds.has(targetId)) {
        errors.push({ line: lineNumber, column: 1, message: `Edge references unknown node id "${targetId}"` });
        return;
      }
      edgeCounter += 1;
      frame.edges.push({
        id: `e${edgeCounter}`, sourceId, targetId,
        label: label?.trim() || undefined,
        flowType: EDGE_ARROW_TO_FLOW_TYPE[arrow],
      });
      return;
    }

    errors.push({ line: lineNumber, column: 1, message: `Could not parse line: "${line}"` });
  });

  // Close any still-open frames at end of input.
  while (stack.length > 1) {
    const finished = stack.pop()!;
    if (finished.activity) {
      finished.activity.children = finished.nodes;
      finished.activity.childEdges = finished.edges;
    }
  }

  return {
    diagram: { pools: (root as any)._pools ?? [], nodes: root.nodes, edges: root.edges },
    errors,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/parser/test/parser.test.ts`
Expected: PASS (all tests across all three describe blocks)

- [ ] **Step 5: Commit**

```bash
git add packages/parser/src/parser.ts packages/parser/test/parser.test.ts
git commit -m "feat(parser): support arbitrary-depth subprocess/transaction nesting"
```

---

### Task 4: `@bpm/layout` — recursive containment for sub-processes

**Files:**
- Modify: `packages/layout/src/toElkGraph.ts`
- Modify: `packages/layout/src/fromElkLayout.ts`
- Modify: `packages/layout/test/layout.test.ts`

**Interfaces:**
- Consumes: `ActivityNode.children`/`childEdges` from `@bpm/ast` (Task 1), `Diagram` from `@bpm/parser` (Task 3).
- Produces: `PositionedNode` for an expanded `subProcess`/`transaction` now carries a `children: PositionedNode[]` and `childEdges: RoutedEdge[]` (mirroring the AST's nesting), so `@bpm/render` can recurse. Collapsed sub-processes/transactions are treated as an ordinary sized box (no recursion).

- [ ] **Step 1: Extend `PositionedNode` type**

Modify `packages/layout/src/types.ts` — add optional recursive fields:
```ts
import type { DiagramNode, DiagramEdge } from '@bpm/ast';

export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  width: number;
  height: number;
  children?: PositionedNode[];
  childEdges?: RoutedEdge[];
}

export interface RoutedEdge extends DiagramEdge {
  points: Array<{ x: number; y: number }>;
}

export interface PositionedLane {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedPool {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lanes: PositionedLane[];
}

export interface PositionedDiagram {
  pools: PositionedPool[];
  nodes: PositionedNode[];
  edges: RoutedEdge[];
}
```

- [ ] **Step 2: Write the failing test**

Add to `packages/layout/test/layout.test.ts`:
```ts
it('recursively lays out an expanded subprocess\'s children within its own bounds', async () => {
  const diagram: Diagram = {
    pools: [],
    nodes: [
      {
        kind: 'activity', id: 'sp1', label: 'Handle payment', activityType: 'subProcess', collapsed: false,
        children: [
          { kind: 'event', id: 'sn1', label: 'Sub start', category: 'start', trigger: 'none', interrupting: true },
          { kind: 'activity', id: 'sn2', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
        ],
        childEdges: [{ id: 'ie1', sourceId: 'sn1', targetId: 'sn2', flowType: 'sequence' }],
      },
    ],
    edges: [],
  };

  const positioned = await layout(diagram);
  const sp1 = positioned.nodes.find((n) => n.id === 'sp1')!;

  expect(sp1.children).toHaveLength(2);
  const sn1 = sp1.children!.find((n) => n.id === 'sn1')!;
  const sn2 = sp1.children!.find((n) => n.id === 'sn2')!;
  // children must fall within the subprocess's own bounds
  for (const child of [sn1, sn2]) {
    expect(child.x).toBeGreaterThanOrEqual(sp1.x);
    expect(child.y).toBeGreaterThanOrEqual(sp1.y);
    expect(child.x + child.width).toBeLessThanOrEqual(sp1.x + sp1.width);
    expect(child.y + child.height).toBeLessThanOrEqual(sp1.y + sp1.height);
  }
  expect(sp1.childEdges).toHaveLength(1);
});
```

Also update the existing pool/lane and flat-node tests in this file to construct `Diagram`/node literals using the new discriminated-union shape from Task 1 (e.g., `{ kind: 'event', category: 'start', trigger: 'none', interrupting: true, ... }` instead of `{ type: 'start', ... }`, and `{ kind: 'activity', activityType: 'task', ... }` instead of `{ type: 'task', ... }`).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: FAIL — `toElkGraph`/`fromElkLayout` only understand the old flat `NodeType` and don't recurse into `children`.

- [ ] **Step 4: Rewrite `toElkGraph.ts` to recurse into expanded sub-processes**

`packages/layout/src/toElkGraph.ts`:
```ts
import type { Diagram, DiagramNode } from '@bpm/ast';

const DEFAULT_SIZE = { width: 100, height: 60 };
const EVENT_SIZE = { width: 40, height: 40 };
const GATEWAY_SIZE = { width: 50, height: 50 };
const DATA_SIZE = { width: 50, height: 60 };

function sizeOf(node: DiagramNode): { width: number; height: number } {
  if (node.kind === 'event') return EVENT_SIZE;
  if (node.kind === 'gateway') return GATEWAY_SIZE;
  if (node.kind === 'dataObject' || node.kind === 'dataStore' || node.kind === 'textAnnotation') return DATA_SIZE;
  if (node.kind === 'group') return { width: 200, height: 150 };
  return DEFAULT_SIZE; // activity
}

function toElkNode(node: DiagramNode): any {
  // Boundary events are excluded from the ELK graph entirely (see boundaryEvents.ts);
  // callers of toElkGraph/toElkChildren must filter them out before calling this.
  if (node.kind === 'activity' && !node.collapsed && (node.activityType === 'subProcess' || node.activityType === 'transaction')) {
    return {
      id: node.id,
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL' },
      children: toElkChildren(node.children),
      edges: node.childEdges.map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
    };
  }
  return { id: node.id, ...sizeOf(node) };
}

function toElkChildren(nodes: DiagramNode[]): any[] {
  const nonBoundary = nodes.filter((n) => !(n.kind === 'event' && n.attachedToId !== undefined));
  return nonBoundary.map(toElkNode);
}

export function toElkGraph(diagram: Diagram) {
  const laneNodeIds = new Set(
    diagram.pools.flatMap((pool) => pool.lanes.flatMap((lane) => lane.nodeIds))
  );
  const unassignedNodes = diagram.nodes.filter((n) => !laneNodeIds.has(n.id));

  const poolChildren = diagram.pools.map((pool) => ({
    id: pool.id,
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    children: pool.lanes.map((lane) => ({
      id: lane.id,
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
      children: toElkChildren(lane.nodeIds.map((id) => diagram.nodes.find((n) => n.id === id)!)),
    })),
  }));

  const looseNodeChildren = toElkChildren(unassignedNodes);

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: [...poolChildren, ...looseNodeChildren],
    edges: diagram.edges
      .filter((edge) => !isBoundaryEventId(diagram, edge.sourceId))
      .map((edge) => ({ id: edge.id, sources: [edge.sourceId], targets: [edge.targetId] })),
  };
}

function isBoundaryEventId(diagram: Diagram, id: string): boolean {
  const node = diagram.nodes.find((n) => n.id === id);
  return node?.kind === 'event' && node.attachedToId !== undefined;
}
```

- [ ] **Step 5: Rewrite `fromElkLayout.ts` to recurse into expanded sub-processes**

`packages/layout/src/fromElkLayout.ts`:
```ts
import type { Diagram, DiagramNode } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, PositionedPool, PositionedLane, RoutedEdge } from './types.js';

interface ElkNode {
  id: string; x?: number; y?: number; width?: number; height?: number; children?: ElkNode[]; edges?: ElkEdge[];
}
interface ElkEdgeSection {
  startPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[]; endPoint: { x: number; y: number };
}
interface ElkEdge { id: string; sections?: ElkEdgeSection[] }
interface ElkGraph { children?: ElkNode[]; edges?: ElkEdge[] }

function abs(elkNode: ElkNode, offsetX: number, offsetY: number) {
  return { x: offsetX + (elkNode.x ?? 0), y: offsetY + (elkNode.y ?? 0) };
}

function routeEdges(elkEdges: ElkEdge[] | undefined, astEdges: { id: string }[], astByEdgeId: Map<string, any>): RoutedEdge[] {
  return (elkEdges ?? []).map((elkEdge) => {
    const astEdge = astByEdgeId.get(elkEdge.id);
    const section = elkEdge.sections?.[0];
    const points = section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] : [];
    return { ...astEdge, points };
  });
}

function positionNode(astNode: DiagramNode, elkNode: ElkNode, offsetX: number, offsetY: number): PositionedNode {
  const { x, y } = abs(elkNode, offsetX, offsetY);
  const base: PositionedNode = { ...astNode, x, y, width: elkNode.width ?? 0, height: elkNode.height ?? 0 };

  if (astNode.kind === 'activity' && (astNode.activityType === 'subProcess' || astNode.activityType === 'transaction') && !astNode.collapsed) {
    const childById = new Map(astNode.children.map((c) => [c.id, c]));
    const childEdgeById = new Map(astNode.childEdges.map((e) => [e.id, e]));
    base.children = (elkNode.children ?? [])
      .filter((c) => childById.has(c.id))
      .map((c) => positionNode(childById.get(c.id)!, c, x, y));
    base.childEdges = routeEdges(elkNode.edges, astNode.childEdges, childEdgeById);
  }

  return base;
}

export function fromElkLayout(diagram: Diagram, elkGraph: ElkGraph): PositionedDiagram {
  const positionedNodes: PositionedNode[] = [];
  const positionedPools: PositionedPool[] = [];
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  for (const elkChild of elkGraph.children ?? []) {
    const pool = diagram.pools.find((p) => p.id === elkChild.id);
    if (pool) {
      const poolPos = abs(elkChild, 0, 0);
      const positionedLanes: PositionedLane[] = [];
      for (const elkLane of elkChild.children ?? []) {
        const lane = pool.lanes.find((l) => l.id === elkLane.id);
        if (!lane) continue;
        const lanePos = abs(elkLane, poolPos.x, poolPos.y);
        positionedLanes.push({ id: lane.id, name: lane.name, x: lanePos.x, y: lanePos.y, width: elkLane.width ?? 0, height: elkLane.height ?? 0 });
        for (const elkNode of elkLane.children ?? []) {
          const astNode = nodeById.get(elkNode.id);
          if (!astNode) continue;
          positionedNodes.push(positionNode(astNode, elkNode, lanePos.x, lanePos.y));
        }
      }
      positionedPools.push({ id: pool.id, name: pool.name, x: poolPos.x, y: poolPos.y, width: elkChild.width ?? 0, height: elkChild.height ?? 0, lanes: positionedLanes });
    } else {
      const astNode = nodeById.get(elkChild.id);
      if (astNode) positionedNodes.push(positionNode(astNode, elkChild, 0, 0));
    }
  }

  const astEdgeById = new Map(diagram.edges.map((e) => [e.id, e]));
  const edges = routeEdges(elkGraph.edges, diagram.edges, astEdgeById);

  return { pools: positionedPools, nodes: positionedNodes, edges };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: PASS (including the updated Milestone 1 tests, now using `kind`-based node literals)

- [ ] **Step 7: Commit**

```bash
git add packages/layout/src/types.ts packages/layout/src/toElkGraph.ts packages/layout/src/fromElkLayout.ts packages/layout/test/layout.test.ts
git commit -m "feat(layout): recursive layout for expanded sub-processes/transactions"
```

---

### Task 5: `@bpm/layout` — boundary event positioning

**Files:**
- Create: `packages/layout/src/boundaryEvents.ts`
- Modify: `packages/layout/src/index.ts`
- Modify: `packages/layout/test/layout.test.ts`

**Interfaces:**
- Consumes: `PositionedDiagram` (post-ELK, from Task 4), `Diagram` (for boundary event AST nodes, which were excluded from the ELK graph by `toElkGraph`).
- Produces: `function positionBoundaryEvents(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram` — adds a `PositionedNode` for every boundary event (fixed size, positioned on its host activity's bottom border, stacked left-to-right if a host has more than one), and routes each boundary event's outgoing edges as a simple straight/elbow line from the boundary event's position to its target's border.

- [ ] **Step 1: Write the failing test**

Add to `packages/layout/test/layout.test.ts`:
```ts
it('positions boundary events on their host activity\'s border and routes their outgoing edges', async () => {
  const diagram: Diagram = {
    pools: [],
    nodes: [
      { kind: 'activity', id: 't1', label: 'Charge card', activityType: 'task', collapsed: false, children: [], childEdges: [] },
      { kind: 'event', id: 'b1', label: 'Timeout', category: 'intermediate', trigger: 'timer', interrupting: true, attachedToId: 't1' },
      { kind: 'activity', id: 't2', label: 'Retry', activityType: 'task', collapsed: false, children: [], childEdges: [] },
    ],
    edges: [{ id: 'e1', sourceId: 'b1', targetId: 't2', flowType: 'sequence' }],
  };

  const positioned = await layout(diagram);
  const t1 = positioned.nodes.find((n) => n.id === 't1')!;
  const b1 = positioned.nodes.find((n) => n.id === 'b1')!;

  // boundary event sits on (or just inside) the host's bottom border
  expect(b1.x).toBeGreaterThanOrEqual(t1.x);
  expect(b1.x).toBeLessThanOrEqual(t1.x + t1.width);
  expect(Math.abs(b1.y + b1.height / 2 - (t1.y + t1.height))).toBeLessThan(1);

  const routedEdge = positioned.edges.find((e) => e.id === 'e1')!;
  expect(routedEdge.points.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: FAIL — boundary events are currently dropped entirely (excluded from ELK, never added back).

- [ ] **Step 3: Write `boundaryEvents.ts`**

`packages/layout/src/boundaryEvents.ts`:
```ts
import type { Diagram, DiagramNode, DiagramEdge } from '@bpm/ast';
import type { PositionedDiagram, PositionedNode, RoutedEdge } from './types.js';

const BOUNDARY_EVENT_SIZE = { width: 36, height: 36 };

function isBoundaryEvent(node: DiagramNode): node is DiagramNode & { attachedToId: string } {
  return node.kind === 'event' && node.attachedToId !== undefined;
}

function findPositioned(positioned: PositionedDiagram, id: string): PositionedNode | undefined {
  for (const node of positioned.nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findPositionedIn(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function findPositionedIn(nodes: PositionedNode[], id: string): PositionedNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findPositionedIn(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function borderPoint(target: PositionedNode): { x: number; y: number } {
  return { x: target.x, y: target.y + target.height / 2 };
}

export function positionBoundaryEvents(diagram: Diagram, positioned: PositionedDiagram): PositionedDiagram {
  const boundaryEvents = diagram.nodes.filter(isBoundaryEvent);
  if (boundaryEvents.length === 0) return positioned;

  const boundaryByHost = new Map<string, typeof boundaryEvents>();
  for (const event of boundaryEvents) {
    const list = boundaryByHost.get(event.attachedToId) ?? [];
    list.push(event);
    boundaryByHost.set(event.attachedToId, list);
  }

  const newNodes: PositionedNode[] = [];
  const boundaryPositionById = new Map<string, PositionedNode>();

  for (const [hostId, events] of boundaryByHost) {
    const host = findPositioned(positioned, hostId);
    if (!host) continue;
    events.forEach((event, index) => {
      const spacing = host.width / (events.length + 1);
      const centerX = host.x + spacing * (index + 1);
      const positionedEvent: PositionedNode = {
        ...event,
        x: centerX - BOUNDARY_EVENT_SIZE.width / 2,
        y: host.y + host.height - BOUNDARY_EVENT_SIZE.height / 2,
        width: BOUNDARY_EVENT_SIZE.width,
        height: BOUNDARY_EVENT_SIZE.height,
      };
      newNodes.push(positionedEvent);
      boundaryPositionById.set(event.id, positionedEvent);
    });
  }

  const boundaryOutgoingEdges = diagram.edges.filter((e) => boundaryPositionById.has(e.sourceId));
  const routedBoundaryEdges: RoutedEdge[] = boundaryOutgoingEdges.map((edge: DiagramEdge) => {
    const source = boundaryPositionById.get(edge.sourceId)!;
    const target = findPositioned(positioned, edge.targetId) ?? findPositionedIn(newNodes, edge.targetId);
    const start = { x: source.x + source.width / 2, y: source.y + source.height };
    const end = target ? borderPoint(target) : start;
    return { ...edge, points: [start, end] };
  });

  return {
    pools: positioned.pools,
    nodes: [...positioned.nodes, ...newNodes],
    edges: [...positioned.edges, ...routedBoundaryEdges],
  };
}
```

- [ ] **Step 4: Wire it into `index.ts`**

`packages/layout/src/index.ts`:
```ts
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Diagram } from '@bpm/ast';
import { toElkGraph } from './toElkGraph.js';
import { fromElkLayout } from './fromElkLayout.js';
import { positionBoundaryEvents } from './boundaryEvents.js';
import type { PositionedDiagram } from './types.js';

const elk = new ELK();

export async function layout(diagram: Diagram): Promise<PositionedDiagram> {
  const elkGraph = toElkGraph(diagram);
  const laidOut = await elk.layout(elkGraph);
  const positioned = fromElkLayout(diagram, laidOut as any);
  return positionBoundaryEvents(diagram, positioned);
}

export type {
  PositionedDiagram, PositionedNode, RoutedEdge, PositionedPool, PositionedLane,
} from './types.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/layout/test/layout.test.ts`
Expected: PASS (all layout tests)

- [ ] **Step 6: Commit**

```bash
git add packages/layout/src/boundaryEvents.ts packages/layout/src/index.ts packages/layout/test/layout.test.ts
git commit -m "feat(layout): position boundary events on their host activity's border"
```

---

### Task 6: `@bpm/render` — event trigger icon library

**Files:**
- Create: `packages/render/src/icons.ts`
- Modify: `packages/render/test/render.test.ts`

**Interfaces:**
- Produces: `function triggerIcon(trigger: EventTrigger, cx: number, cy: number): string` — returns an SVG snippet (no wrapping `<g>`) for the given trigger, centered at `(cx, cy)`. Returns `''` for `'none'`.

- [ ] **Step 1: Write the failing test**

`packages/render/test/render.test.ts` — add:
```ts
import { triggerIcon } from '../src/icons.js';

describe('triggerIcon', () => {
  it('returns empty markup for the none trigger', () => {
    expect(triggerIcon('none', 10, 10)).toBe('');
  });

  it('returns distinct, non-empty markup for every other trigger', () => {
    const triggers: import('@bpm/ast').EventTrigger[] = [
      'message', 'timer', 'error', 'escalation', 'cancel', 'compensation',
      'conditional', 'link', 'signal', 'multiple', 'parallelMultiple', 'terminate',
    ];
    const outputs = triggers.map((t) => triggerIcon(t, 20, 20));
    for (const output of outputs) expect(output.length).toBeGreaterThan(0);
    expect(new Set(outputs).size).toBe(outputs.length); // all distinct
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: FAIL — `../src/icons.js` does not exist.

- [ ] **Step 3: Write `icons.ts`**

`packages/render/src/icons.ts`:
```ts
import type { EventTrigger } from '@bpm/ast';

type IconFn = (cx: number, cy: number) => string;

const ICONS: Record<Exclude<EventTrigger, 'none'>, IconFn> = {
  message: (cx, cy) =>
    `<rect x="${cx - 8}" y="${cy - 5}" width="16" height="10" fill="none" stroke="black" stroke-width="1"/>` +
    `<polyline points="${cx - 8},${cy - 5} ${cx},${cy + 1} ${cx + 8},${cy - 5}" fill="none" stroke="black" stroke-width="1"/>`,
  timer: (cx, cy) =>
    `<circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="black" stroke-width="1"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 6}" stroke="black" stroke-width="1"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${cx + 4}" y2="${cy}" stroke="black" stroke-width="1"/>`,
  error: (cx, cy) =>
    `<polyline points="${cx - 6},${cy + 7} ${cx},${cy - 7} ${cx + 2},${cy - 1} ${cx + 7},${cy - 7} ${cx + 1},${cy + 7} ${cx - 1},${cy + 1}" fill="black"/>`,
  escalation: (cx, cy) =>
    `<polygon points="${cx},${cy - 8} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}" fill="none" stroke="black" stroke-width="1"/>`,
  cancel: (cx, cy) =>
    `<line x1="${cx - 6}" y1="${cy - 6}" x2="${cx + 6}" y2="${cy + 6}" stroke="black" stroke-width="2"/>` +
    `<line x1="${cx - 6}" y1="${cy + 6}" x2="${cx + 6}" y2="${cy - 6}" stroke="black" stroke-width="2"/>`,
  compensation: (cx, cy) =>
    `<polygon points="${cx},${cy - 6} ${cx},${cy + 6} ${cx - 7},${cy}" fill="none" stroke="black" stroke-width="1"/>` +
    `<polygon points="${cx + 7},${cy - 6} ${cx + 7},${cy + 6} ${cx},${cy}" fill="none" stroke="black" stroke-width="1"/>`,
  conditional: (cx, cy) =>
    `<rect x="${cx - 7}" y="${cy - 7}" width="14" height="14" fill="none" stroke="black" stroke-width="1"/>` +
    `<line x1="${cx - 5}" y1="${cy - 3}" x2="${cx + 5}" y2="${cy - 3}" stroke="black"/>` +
    `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="black"/>` +
    `<line x1="${cx - 5}" y1="${cy + 3}" x2="${cx + 5}" y2="${cy + 3}" stroke="black"/>`,
  link: (cx, cy) =>
    `<polygon points="${cx - 7},${cy - 3} ${cx + 2},${cy - 3} ${cx + 2},${cy - 6} ${cx + 8},${cy} ${cx + 2},${cy + 6} ${cx + 2},${cy + 3} ${cx - 7},${cy + 3}" fill="black"/>`,
  signal: (cx, cy) =>
    `<polygon points="${cx},${cy - 8} ${cx + 7},${cy + 6} ${cx - 7},${cy + 6}" fill="none" stroke="black" stroke-width="1.5"/>`,
  multiple: (cx, cy) =>
    `<polygon points="${cx},${cy - 7} ${cx + 7},${cy - 2} ${cx + 4},${cy + 7} ${cx - 4},${cy + 7} ${cx - 7},${cy - 2}" fill="none" stroke="black" stroke-width="1"/>`,
  parallelMultiple: (cx, cy) =>
    `<polygon points="${cx},${cy - 7} ${cx + 7},${cy - 2} ${cx + 4},${cy + 7} ${cx - 4},${cy + 7} ${cx - 7},${cy - 2}" fill="none" stroke="black" stroke-width="1"/>` +
    `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="black"/>` +
    `<line x1="${cx}" y1="${cy - 5}" x2="${cx}" y2="${cy + 5}" stroke="black"/>`,
  terminate: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="7" fill="black"/>`,
};

export function triggerIcon(trigger: EventTrigger, cx: number, cy: number): string {
  if (trigger === 'none') return '';
  return ICONS[trigger](cx, cy);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/render/src/icons.ts packages/render/test/render.test.ts
git commit -m "feat(render): add event trigger icon library"
```

---

### Task 7: `@bpm/render` — dispatch shapes on `node.kind`, all event/gateway/activity/data/artifact shapes

**Files:**
- Modify: `packages/render/src/shapes.ts`
- Modify: `packages/render/test/render.test.ts`

**Interfaces:**
- Consumes: `PositionedNode` (Task 4/5 shape) from `@bpm/layout`, `triggerIcon` from Task 6.
- Produces: `function renderNode(node: PositionedNode): string` — same signature as Milestone 1, now dispatches on `node.kind` instead of the old flat `node.type`, and recurses into `node.children` for expanded sub-processes/transactions.

- [ ] **Step 1: Write the failing test**

Replace `packages/render/test/render.test.ts`'s `render` describe block (keep the `triggerIcon` block from Task 6) with:
```ts
import { describe, it, expect } from 'vitest';
import { render } from '../src/index.js';
import type { PositionedDiagram, PositionedNode } from '@bpm/layout';

function node(partial: Partial<PositionedNode> & Pick<PositionedNode, 'id' | 'kind'>): PositionedNode {
  return { label: '', x: 0, y: 0, width: 40, height: 40, ...partial } as PositionedNode;
}

describe('render — node kinds', () => {
  it('renders a message start event with its trigger icon and a thin border', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'n1', kind: 'event', label: 'Placed', category: 'start', trigger: 'message', interrupting: true } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="n1"');
    expect(svg).toContain('Placed');
  });

  it('renders an inclusive gateway with a circle marker', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'g1', kind: 'gateway', label: 'Which?', gatewayType: 'inclusive' } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="g1"');
    expect(svg).toContain('<circle');
  });

  it('renders a collapsed subprocess with a plus marker and no recursion', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({ id: 'sp1', kind: 'activity', label: 'Payment', activityType: 'subProcess', collapsed: true, children: [], childEdges: [] } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="sp1"');
    expect(svg).toContain('plus-marker');
  });

  it('renders an expanded subprocess by recursing into its children', () => {
    const child = node({ id: 'sn1', kind: 'activity', label: 'Inner task', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any);
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [node({
        id: 'sp1', kind: 'activity', label: 'Payment', activityType: 'subProcess', collapsed: false,
        width: 300, height: 200, children: [child], childEdges: [],
      } as any)],
    };
    const svg = render(diagram);
    expect(svg).toContain('data-node-id="sp1"');
    expect(svg).toContain('data-node-id="sn1"');
    expect(svg).toContain('Inner task');
  });

  it('renders dataObject, dataStore, textAnnotation, and group with distinct shapes', () => {
    const diagram: PositionedDiagram = {
      pools: [], edges: [],
      nodes: [
        node({ id: 'd1', kind: 'dataObject', label: 'Invoice' } as any),
        node({ id: 'ds1', kind: 'dataStore', label: 'DB' } as any),
        node({ id: 'note1', kind: 'textAnnotation', label: 'SLA' } as any),
        node({ id: 'grp1', kind: 'group', label: 'Critical' } as any),
      ],
    };
    const svg = render(diagram);
    for (const id of ['d1', 'ds1', 'note1', 'grp1']) {
      expect(svg).toContain(`data-node-id="${id}"`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: FAIL — current `shapes.ts` dispatches on `node.type`, which no longer exists.

- [ ] **Step 3: Rewrite `shapes.ts`**

`packages/render/src/shapes.ts`:
```ts
import type { PositionedNode } from '@bpm/layout';
import { triggerIcon } from './icons.js';

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function labelBelow(x: number, y: number, width: number, height: number, label: string): string {
  return `<text x="${x + width / 2}" y="${y + height + 14}" text-anchor="middle" font-size="12">${escapeXml(label)}</text>`;
}

function labelCentered(x: number, y: number, width: number, height: number, label: string): string {
  return `<text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12">${escapeXml(label)}</text>`;
}

function renderEvent(node: PositionedNode & { category: string; trigger: any; interrupting: boolean; attachedToId?: string }): string {
  const { x, y, width, height, label, id } = node;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const r = Math.min(width, height) / 2;
  const isBoundary = node.attachedToId !== undefined;
  const isEnd = node.category === 'end';
  const dash = isBoundary && !node.interrupting ? ' stroke-dasharray="4 3"' : '';
  const outerStroke = isEnd ? 'stroke-width="3"' : 'stroke-width="1.5"';
  let circles = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="black" ${outerStroke}${dash}/>`;
  if (node.category === 'intermediate') {
    circles += `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="none" stroke="black" stroke-width="1"${dash}/>`;
  }
  return `<g data-node-id="${id}">${circles}${triggerIcon(node.trigger, cx, cy)}${labelBelow(x, y, width, height, label)}</g>`;
}

const GATEWAY_MARKERS: Record<string, (cx: number, cy: number, half: number) => string> = {
  exclusive: (cx, cy) =>
    `<line x1="${cx - 8}" y1="${cy - 8}" x2="${cx + 8}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy + 8}" x2="${cx + 8}" y2="${cy - 8}" stroke="black"/>`,
  parallel: (cx, cy) =>
    `<line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy + 8}" stroke="black"/><line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="black"/>`,
  inclusive: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="black" stroke-width="2"/>`,
  complex: (cx, cy) =>
    [0, 60, 120].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return `<line x1="${cx - 8 * Math.cos(rad)}" y1="${cy - 8 * Math.sin(rad)}" x2="${cx + 8 * Math.cos(rad)}" y2="${cy + 8 * Math.sin(rad)}" stroke="black"/>`;
    }).join(''),
  eventBased: (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="black"/><circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="black"/>`,
};

function renderGateway(node: PositionedNode & { gatewayType: string }): string {
  const { x, y, width, height, label, id } = node;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const half = width / 2;
  const points = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
  const marker = GATEWAY_MARKERS[node.gatewayType]?.(cx, cy, half) ?? '';
  return `<g data-node-id="${id}"><polygon points="${points}" fill="white" stroke="black"/>${marker}${labelBelow(x, y, width, height, label)}</g>`;
}

function renderActivity(node: PositionedNode & { activityType: string; collapsed: boolean; children?: PositionedNode[] }): string {
  const { x, y, width, height, label, id, activityType, collapsed } = node;
  const doubleBorder = activityType === 'transaction' ? `<rect x="${x + 4}" y="${y + 4}" width="${width - 8}" height="${height - 8}" rx="4" fill="none" stroke="black" stroke-width="1"/>` : '';
  const boldBorder = activityType === 'callActivity' ? 'stroke-width="3"' : 'stroke-width="1.5"';
  const outer = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" fill="white" stroke="black" ${boldBorder}/>`;

  const isNestable = activityType === 'subProcess' || activityType === 'transaction';
  const marker = isNestable && collapsed
    ? `<g data-plus-marker="true" class="plus-marker"><rect x="${x + width / 2 - 6}" y="${y + height - 16}" width="12" height="12" fill="none" stroke="black"/><line x1="${x + width / 2 - 3}" y1="${y + height - 10}" x2="${x + width / 2 + 3}" y2="${y + height - 10}" stroke="black"/><line x1="${x + width / 2}" y1="${y + height - 13}" x2="${x + width / 2}" y2="${y + height - 7}" stroke="black"/></g>`
    : '';

  if (isNestable && !collapsed && node.children) {
    const childrenSvg = node.children.map(renderNode).join('');
    return `<g data-node-id="${id}">${outer}${doubleBorder}<text x="${x + 6}" y="${y + 14}" font-size="11">${escapeXml(label)}</text>${childrenSvg}</g>`;
  }

  return `<g data-node-id="${id}">${outer}${doubleBorder}${marker}${labelCentered(x, y, width, height, label)}</g>`;
}

function renderDataObject(node: PositionedNode): string {
  const { x, y, width, height, label, id } = node;
  const fold = 10;
  const path = `M${x},${y} H${x + width - fold} L${x + width},${y + fold} V${y + height} H${x} Z`;
  return `<g data-node-id="${id}"><path d="${path}" fill="white" stroke="black"/>${labelBelow(x, y, width, height, label)}</g>`;
}

function renderDataStore(node: PositionedNode): string {
  const { x, y, width, height, label, id } = node;
  const rx = width / 2;
  const ry = 8;
  return `<g data-node-id="${id}">` +
    `<path d="M${x},${y + ry} V${y + height - ry} A${rx},${ry} 0 0 0 ${x + width},${y + height - ry} V${y + ry}" fill="white" stroke="black"/>` +
    `<ellipse cx="${x + rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="white" stroke="black"/>` +
    `${labelBelow(x, y, width, height, label)}</g>`;
}

function renderTextAnnotation(node: PositionedNode): string {
  const { x, y, width, height, label, id } = node;
  return `<g data-node-id="${id}">` +
    `<path d="M${x + 10},${y} H${x} V${y + height} H${x + 10}" fill="none" stroke="black"/>` +
    `<text x="${x + 14}" y="${y + height / 2}" font-size="11" dominant-baseline="middle">${escapeXml(label)}</text></g>`;
}

function renderGroup(node: PositionedNode): string {
  const { x, y, width, height, label, id } = node;
  return `<g data-node-id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="none" stroke="#666" stroke-dasharray="6 4"/>` +
    `<text x="${x + 6}" y="${y + 14}" font-size="11" fill="#666">${escapeXml(label)}</text></g>`;
}

export function renderNode(node: PositionedNode): string {
  switch (node.kind) {
    case 'event': return renderEvent(node as any);
    case 'gateway': return renderGateway(node as any);
    case 'activity': return renderActivity(node as any);
    case 'dataObject': return renderDataObject(node);
    case 'dataStore': return renderDataStore(node);
    case 'textAnnotation': return renderTextAnnotation(node);
    case 'group': return renderGroup(node);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: PASS (all `render — node kinds` tests plus the Task 6 `triggerIcon` tests)

- [ ] **Step 5: Commit**

```bash
git add packages/render/src/shapes.ts packages/render/test/render.test.ts
git commit -m "feat(render): render every BPMN 2.0 node kind, recursing into expanded sub-processes"
```

---

### Task 8: `@bpm/render` — edge flow-type styling

**Files:**
- Modify: `packages/render/src/edges.ts`
- Modify: `packages/render/test/render.test.ts`

**Interfaces:**
- Consumes: `RoutedEdge` (now carrying `flowType`) from `@bpm/layout`.
- Produces: `function renderEdge(edge: RoutedEdge): string` — same signature as Milestone 1, styling now varies by `edge.flowType`.

- [ ] **Step 1: Write the failing test**

Add to `packages/render/test/render.test.ts`:
```ts
describe('render — edge flow types', () => {
  function edgeDiagram(flowType: import('@bpm/ast').FlowType): PositionedDiagram {
    return {
      pools: [],
      nodes: [
        node({ id: 'n1', kind: 'activity', label: 'A', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any),
        node({ id: 'n2', kind: 'activity', label: 'B', activityType: 'task', collapsed: false, children: [], childEdges: [] } as any),
      ],
      edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', flowType, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }],
    };
  }

  it('renders a dashed line for message flow', () => {
    const svg = render(edgeDiagram('message'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('stroke-dasharray');
  });

  it('renders a dotted line with no arrowhead for association', () => {
    const svg = render(edgeDiagram('association'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).not.toContain('<polygon'); // no arrowhead marker
  });

  it('renders a diamond marker at the source for conditional sequence flow', () => {
    const svg = render(edgeDiagram('conditionalSequence'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('conditional-marker');
  });

  it('renders a slash marker at the source for default sequence flow', () => {
    const svg = render(edgeDiagram('defaultSequence'));
    expect(svg).toContain('data-edge-id="e1"');
    expect(svg).toContain('default-marker');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: FAIL — current `edges.ts` doesn't read `flowType` at all.

- [ ] **Step 3: Rewrite `edges.ts`**

`packages/render/src/edges.ts`:
```ts
import type { RoutedEdge } from '@bpm/layout';
import { escapeXml } from './shapes.js';

function arrowhead(last: { x: number; y: number }, secondLast: { x: number; y: number }): string {
  const angle = Math.atan2(last.y - secondLast.y, last.x - secondLast.x);
  const size = 8;
  const p1 = { x: last.x - size * Math.cos(angle - Math.PI / 6), y: last.y - size * Math.sin(angle - Math.PI / 6) };
  const p2 = { x: last.x - size * Math.cos(angle + Math.PI / 6), y: last.y - size * Math.sin(angle + Math.PI / 6) };
  return `<polygon points="${last.x},${last.y} ${p1.x},${p1.y} ${p2.x},${p2.y}" fill="black"/>`;
}

function sourceMarker(flowType: RoutedEdge['flowType'], start: { x: number; y: number }, next: { x: number; y: number }): string {
  const angle = Math.atan2(next.y - start.y, next.x - start.x);
  if (flowType === 'conditionalSequence') {
    const size = 7;
    const tip = { x: start.x + size * Math.cos(angle), y: start.y + size * Math.sin(angle) };
    const perp = angle + Math.PI / 2;
    const left = { x: start.x + (size / 2) * Math.cos(perp), y: start.y + (size / 2) * Math.sin(perp) };
    const right = { x: start.x - (size / 2) * Math.cos(perp), y: start.y - (size / 2) * Math.sin(perp) };
    return `<polygon class="conditional-marker" points="${start.x},${start.y} ${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}" fill="white" stroke="black"/>`;
  }
  if (flowType === 'defaultSequence') {
    const perp = angle + Math.PI / 2;
    const half = 5;
    return `<line class="default-marker" x1="${start.x + half * Math.cos(perp)}" y1="${start.y + half * Math.sin(perp)}" x2="${start.x - half * Math.cos(perp)}" y2="${start.y - half * Math.sin(perp)}" stroke="black"/>`;
  }
  return '';
}

export function renderEdge(edge: RoutedEdge): string {
  const { id, points, label, flowType } = edge;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2] ?? last;

  const strokeStyle =
    flowType === 'message' ? 'stroke-dasharray="6 4"' :
    flowType === 'association' ? 'stroke-dasharray="1 3"' : '';

  const arrow = flowType === 'association' ? '' : arrowhead(last, secondLast);
  const startMarker = flowType === 'message'
    ? `<circle cx="${points[0].x}" cy="${points[0].y}" r="4" fill="white" stroke="black"/>`
    : sourceMarker(flowType, points[0], points[1] ?? points[0]);

  const labelEl = label
    ? `<text x="${(points[0].x + last.x) / 2}" y="${(points[0].y + last.y) / 2 - 4}" text-anchor="middle" font-size="11">${escapeXml(label)}</text>`
    : '';

  return `<g data-edge-id="${id}"><path d="${pathD}" fill="none" stroke="black" stroke-width="1.5" ${strokeStyle}/>${arrow}${startMarker}${labelEl}</g>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/render/test/render.test.ts`
Expected: PASS (full file: `triggerIcon`, `render — node kinds`, `render — edge flow types`)

- [ ] **Step 5: Commit**

```bash
git add packages/render/src/edges.ts packages/render/test/render.test.ts
git commit -m "feat(render): style edges by BPMN flow type (sequence/conditional/default/message/association)"
```

---

### Task 9: `apps/web` — showcase the full notation, update the smoke test

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/test/e2e/live-render.spec.ts`

**Interfaces:**
- Consumes: `runPipeline` from `apps/web/src/pipeline.ts` (unchanged signature — parser/layout/render changes are internal to those packages).

- [ ] **Step 1: Update the starter text in `main.ts`**

In `apps/web/src/main.ts`, replace `STARTER_TEXT`:
```ts
const STARTER_TEXT = [
  'event start message "Order placed" as n1',
  'task "Review order" as n2',
  'boundary timer nonInterrupting "SLA breach" as b1 on n2',
  'gateway exclusive "Approved?" as g1',
  'task "Ship order" as n3',
  'event end none "Done" as n4',
  'event end terminate "Rejected" as n5',
  'dataObject "Invoice" as d1',
  '',
  'n1 -> n2',
  'n2 -> g1',
  'g1 => n3 : "yes"',
  'g1 ->> n5',
  'n3 -> n4',
  'd1 ..> n2',
  'b1 ~> n5',
].join('\n');
```

- [ ] **Step 2: Write the failing e2e assertions**

Update `apps/web/test/e2e/live-render.spec.ts`'s first test:
```ts
test('typing valid diagram text renders an svg with the full notation set', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible(); // start message event
  await expect(page.locator('[data-node-id="b1"]')).toBeVisible(); // boundary event
  await expect(page.locator('[data-node-id="g1"]')).toBeVisible(); // exclusive gateway
  await expect(page.locator('[data-node-id="d1"]')).toBeVisible(); // data object
  await expect(page.locator('[data-edge-id]').first()).toBeVisible();
});
```

Update the second test's fallback assertion target from `n2` (still valid, since `n2` is still declared as `task "Review order" as n2` in the new starter text) — no change needed there.

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npm run test:e2e --workspace=@bpm/web`
Expected: FAIL until `main.ts`'s starter text change lands, then PASS once both files are updated together.

- [ ] **Step 4: Manual verification**

Run: `npm run dev --workspace=@bpm/web`
Open the local URL. Expected: right pane shows a message-start event (envelope icon), a task with a dashed boundary-event circle on its bottom edge, an exclusive gateway (X diamond), a solid arrow with a diamond source-marker (conditional), a solid arrow with a slash source-marker (default), an end event with a thick border, a terminate end event with a filled black dot inside, a data object with a folded corner connected by a dotted association line, and a dashed message-flow line from the boundary event to the terminate event.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.ts apps/web/test/e2e/live-render.spec.ts
git commit -m "feat(web): showcase full BPMN 2.0 notation in the live editor starter text"
```

---

## Self-Review Notes

- **Spec coverage:** Every element family from the design spec's "full BPMN 2.0 element coverage" target is now implemented: all 13 event triggers × 3 categories (Task 2), boundary events (Tasks 2, 3, 5), all 5 gateway types (Task 2, 7), sub-processes/transactions/call activities with arbitrary nesting (Tasks 3, 4, 7), data objects/data stores/text annotations/groups (Tasks 2, 7), and all 5 flow types (Tasks 2, 8). Pools/lanes from Milestone 1 continue to work unchanged (Task 3 test explicitly covers this).
- **Placeholder scan:** No TBD/TODO; every step has real, complete code. The one deliberate simplification — icons are simplified geometric approximations rather than exact BPMN icon-pack art — is called out explicitly in Global Constraints, not hidden.
- **Type consistency:** `DiagramNode`'s discriminated union from Task 1 (`kind: 'event' | 'gateway' | 'activity' | 'dataObject' | 'dataStore' | 'textAnnotation' | 'group'`) is the exact type consumed unchanged through parser (Tasks 2–3), layout (Tasks 4–5), and render (Tasks 6–8). `PositionedNode`'s added `children`/`childEdges` fields from Task 4 are exactly what Task 7's `renderActivity` reads to recurse. `RoutedEdge.flowType` from Task 1/AST is exactly what Task 8's `renderEdge` switches on.

## Deferred (still out of scope after this milestone)

- BPMN 2.0 XML import/export and round-trip compatibility with Camunda/bpmn.io Modeler.
- CLI packaging.
- Enforcing BPMN's legality rules for category/trigger combinations.
- Pixel-accurate BPMN icon-pack visuals (current icons are simplified but distinct approximations).
- Manual layout overrides and diagram-to-text editing.
