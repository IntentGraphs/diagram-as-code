import { describe, it, expect } from 'vitest';
import { renderEdge } from '../src/edges.js';
import type { RoutedEdge } from '@bpm/layout';

describe('renderEdge — style/corner overrides', () => {
  it('overrides the flowType default dash pattern when style is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', style: 'dashed',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('stroke-dasharray="6 4"');
  });

  it('draws a dotted override distinctly from dashed', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', style: 'dotted',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('stroke-dasharray="2 3"');
  });

  it('adds a transparent, wider hit area without changing the visible route', () => {
    const edge: RoutedEdge = {
      id: 'e-hit', sourceId: 'a', targetId: 'b', flowType: 'sequence',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('class="diagram-edge-hit-area"');
    expect(body).toContain('stroke="transparent" stroke-width="12"');
    expect(body).toContain('class="diagram-edge-visible"');
    expect(body).toContain('stroke="black" stroke-width="1.5"');
  });

  it('draws solid (no dasharray) even for a normally-dashed flowType when style: solid is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'message', style: 'solid',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    };
    const { body } = renderEdge(edge);
    expect(body).not.toContain('stroke-dasharray');
  });

  it('uses a sharp right-angle path by default at an orthogonal bend', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toContain('L 50 0 L 50 50');
  });

  it('rounds the bend with a quadratic curve when corner: round is set', () => {
    const edge: RoutedEdge = {
      id: 'e1', sourceId: 'a', targetId: 'b', flowType: 'sequence', corner: 'round',
      points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }],
    };
    const { body } = renderEdge(edge);
    expect(body).toMatch(/Q 50 0/);
    expect(body).not.toContain('L 50 0 L 50 50');
  });
});
