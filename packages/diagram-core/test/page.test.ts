import { describe, expect, it } from 'vitest';
import { fitGeometryToPage, fitSvgToPage, pageFitScale, pageSizeInPixels, type PageSpec } from '../src/index.js';

const page: PageSpec = { width: 6, height: 9, unit: 'in', fit: 'contain' };

describe('page fitting', () => {
  it('converts a 6 x 9 inch page to a portrait 2:3 logical canvas', () => {
    expect(pageSizeInPixels(page)).toEqual({ width: 576, height: 864 });
    expect(pageFitScale(1000, 500, page)).toBeCloseTo(0.528, 5);
  });

  it('includes negative coordinates and routed edge points before fitting', () => {
    const result = fitGeometryToPage(
      [{ id: 'a', x: -100, y: -50, width: 100, height: 40 }],
      [{ points: [{ x: -100, y: -30 }, { x: 300, y: 500 }] }],
      page,
    );
    expect(result.scale).toBeGreaterThan(0);
    expect(result.nodes[0].x).toBeGreaterThanOrEqual(24);
    expect(result.nodes[0].y).toBeGreaterThanOrEqual(24);
    for (const point of result.edges[0].points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(24);
      expect(point.y).toBeGreaterThanOrEqual(24);
      expect(point.x).toBeLessThanOrEqual(552);
      expect(point.y).toBeLessThanOrEqual(840);
    }
  });

  it('preserves the source aspect ratio instead of stretching it', () => {
    const result = fitGeometryToPage(
      [{ id: 'a', x: 0, y: 0, width: 1000, height: 500 }],
      [],
      page,
    );
    expect(result.nodes[0].width / result.nodes[0].height).toBeCloseTo(2, 6);
  });

  it('wraps SVG output in a fixed page viewBox and keeps the content centered', () => {
    const result = fitSvgToPage('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500" viewBox="0 0 1000 500"><rect width="1000" height="500"/></svg>', page);
    expect(result.svg).toContain('width="6in" height="9in" viewBox="0 0 576 864"');
    expect(result.svg).toContain('<g transform="translate(');
    expect(result.scale).toBeLessThan(1);
  });

  it('normalizes non-zero and negative viewBox origins inside the fitted group', () => {
    const result = fitSvgToPage('<svg viewBox="-10 20 100 50"><rect x="-10" y="20" width="100" height="50"/></svg>', page);
    expect(result.svg).toContain('translate(10 -20)');
    expect(result.svg).toContain('viewBox="0 0 576 864"');
  });
});
