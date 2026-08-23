import { describe, expect, it } from 'vitest';
import type { RoutedEdge, PositionedNode } from '@bpm/layout-core';
import { assignPorts } from '../src/portAllocation.js';

function task(id: string, x: number, y: number): PositionedNode {
  return {
    kind: 'activity', id, label: id, activityType: 'task', collapsed: false,
    children: [], childEdges: [], x, y, width: 100, height: 60,
  };
}

function gateway(id: string, x: number, y: number): PositionedNode {
  return { kind: 'gateway', id, label: id, gatewayType: 'exclusive', x, y, width: 50, height: 50 };
}

function edge(id: string, sourceId: string, targetId: string, flowType: RoutedEdge['flowType'] = 'sequence'): RoutedEdge {
  return { id, sourceId, targetId, flowType, points: [] };
}

describe('assignPorts', () => {
  it('prefers right source and left destination even across lanes', () => {
    const nodes = new Map([
      ['gateway', task('gateway', 100, 100)],
      ['package', task('package', 400, 260)],
    ]);
    const ports = assignPorts([edge('e5', 'gateway', 'package')], nodes).get('e5')!;
    expect(ports.source.side).toBe('right');
    expect(ports.target.side).toBe('left');
  });

  it('keeps incoming and outgoing roles from sharing the same physical side slot', () => {
    const nodes = new Map([
      ['center', task('center', 200, 100)],
      ['rightSource', task('rightSource', 400, 100)],
      ['rightTarget', task('rightTarget', 600, 100)],
    ]);
    const ports = assignPorts([
      edge('out', 'center', 'rightTarget'),
      edge('in', 'rightSource', 'center'),
    ], nodes);
    const outgoing = ports.get('out')!.source;
    const incoming = ports.get('in')!.target;
    expect(outgoing.side).toBe('right');
    expect(incoming.side).toBe('right');
    expect(incoming.role).toBe('incoming');
    expect(outgoing.role).toBe('outgoing');
    expect(incoming.offset).not.toBe(outgoing.offset);
  });

  it('allocates stable same-role fan-in slots and preserves explicit sides', () => {
    const nodes = new Map([
      ['a', task('a', 0, 0)],
      ['b', task('b', 0, 100)],
      ['join', task('join', 300, 50)],
    ]);
    const edges = [edge('first', 'a', 'join'), edge('second', 'b', 'join')];
    edges[1].to = 'left';
    const first = assignPorts(edges, nodes);
    const second = assignPorts(edges, nodes);
    expect(first.get('first')).toEqual(second.get('first'));
    expect(first.get('second')!.target.side).toBe('left');
    expect(first.get('first')!.target.role).toBe('incoming');
    expect(first.get('second')!.target.role).toBe('incoming');
    expect(first.get('first')!.target.offset).not.toBe(first.get('second')!.target.offset);
  });

  it('reserves distinct stable slots for multiple incoming message flows', () => {
    const nodes = new Map([
      ['senderA', task('senderA', 0, 0)],
      ['senderB', task('senderB', 0, 100)],
      ['response', task('response', 300, 50)],
    ]);
    const edges = [
      edge('message-a', 'senderA', 'response', 'message'),
      edge('message-b', 'senderB', 'response', 'message'),
    ];
    const first = assignPorts(edges, nodes);
    const second = assignPorts([...edges].reverse(), nodes);
    expect(first.get('message-a')!.target).toMatchObject({ role: 'incoming', flowRole: 'message' });
    expect(first.get('message-b')!.target).toMatchObject({ role: 'incoming', flowRole: 'message' });
    expect(first.get('message-a')!.target.side).toBe('left');
    expect(first.get('message-b')!.target.side).toBe('left');
    expect(first.get('message-a')!.target.offset).not.toBe(first.get('message-b')!.target.offset);
    expect(first.get('message-a')!.target).toEqual(second.get('message-a')!.target);
    expect(first.get('message-b')!.target).toEqual(second.get('message-b')!.target);
  });

  it('uses cardinal gateway vertices for horizontal and vertical branches', () => {
    const nodes = new Map([
      ['gate', gateway('gate', 100, 100)],
      ['right', task('right', 300, 100)],
      ['below', task('below', 220, 300)],
    ]);
    const ports = assignPorts([
      edge('yes', 'gate', 'below'),
      edge('no', 'gate', 'right'),
    ], nodes);
    expect(ports.get('no')!.source).toMatchObject({ side: 'right', offset: 0 });
    expect(ports.get('yes')!.source).toMatchObject({ side: 'bottom', offset: 0 });
  });

  it('keeps same-direction gateway fan-out on one cardinal side with distinct slots', () => {
    const nodes = new Map([
      ['gate', gateway('gate', 200, 200)],
      ['upper-a', task('upper-a', 150, 50)],
      ['upper-b', task('upper-b', 250, 50)],
      ['upper-c', task('upper-c', 350, 50)],
    ]);
    const ports = assignPorts([
      edge('branch-c', 'gate', 'upper-c'),
      edge('branch-a', 'gate', 'upper-a'),
      edge('branch-b', 'gate', 'upper-b'),
    ], nodes);
    const branches = ['branch-a', 'branch-b', 'branch-c'].map((id) => ports.get(id)!.source);
    expect(branches.every((port) => port.side === 'top')).toBe(true);
    expect(new Set(branches.map((port) => port.offset)).size).toBe(3);
    expect(branches.every((port) => port.role === 'outgoing')).toBe(true);
  });

  it('faces gateway destinations from the corresponding cardinal vertex', () => {
    const nodes = new Map([
      ['left', task('left', 0, 100)],
      ['above', task('above', 125, 0)],
      ['gate', gateway('gate', 100, 100)],
    ]);
    const ports = assignPorts([
      edge('fromLeft', 'left', 'gate'),
      edge('fromAbove', 'above', 'gate'),
    ], nodes);
    expect(ports.get('fromLeft')!.target).toMatchObject({ side: 'left', offset: 0 });
    expect(ports.get('fromAbove')!.target).toMatchObject({ side: 'top', offset: 0 });
  });
});
