import { describe, expect, it } from 'vitest';
import { escapeXml, measureLabel, pointAlongPolyline, polylinePathD, wrapLabel, wrappedTextBelow, wrappedTextCentered } from '../src/index.js';

describe('@bpm/render-core', () => {
  it('escapes XML entities for element text and attributes', () => {
    expect(escapeXml('a&b<c>"d')).toBe('a&amp;b&lt;c&gt;&quot;d');
  });

  it('wraps and truncates labels without BPMN-specific types', () => {
    expect(wrapLabel('alpha beta gamma delta', 30, 10, 2)).toEqual(['alpha', 'bet...']);
  });

  it('shares deterministic line metrics with renderers', () => {
    const metrics = measureLabel('处理订单 🚚 完成', 60, 12, 4);
    expect(metrics.lines.length).toBeGreaterThan(1);
    expect(metrics.height).toBe(metrics.lines.length * metrics.lineHeight);
    expect(metrics.width).toBeGreaterThan(0);
  });

  it('renders centered and below text with escaped tspans', () => {
    expect(wrappedTextCentered(10, 20, 100, 'A < B')).toContain('&lt;');
    expect(wrappedTextBelow(10, 20, 100, 'A < B')).toContain('<rect');
  });

  it('renders sharp and rounded polyline paths', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }];
    expect(polylinePathD(points)).toBe('M 0 0 L 20 0 L 20 20');
    expect(polylinePathD(points, 'round')).toContain('Q 20 0');
  });

  it('finds a point along a polyline', () => {
    const point = pointAlongPolyline([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 0.75);
    expect(point).toEqual({ x: 20, y: 10, tx: 0, ty: 20 });
  });

  it('rejects an empty polyline and ignores repeated points when rounding', () => {
    expect(() => pointAlongPolyline([], 0.5)).toThrow('at least one point');
    expect(polylinePathD([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 20, y: 0 }], 'round'))
      .not.toContain('NaN');
  });
});
