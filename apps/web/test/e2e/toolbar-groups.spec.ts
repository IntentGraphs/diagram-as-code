// apps/web/test/e2e/toolbar-groups.spec.ts
import { test, expect } from '@playwright/test';

test('toolbar wraps onto additional lines instead of clipping controls at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('/');
  const toolbar = page.locator('#toolbar');
  const box = (await toolbar.boundingBox())!;
  expect(box.height).toBeGreaterThan(44);
  await expect(page.locator('#clear-btn')).toBeVisible();
  await expect(page.locator('#fullscreen-btn')).toBeVisible();
  await expect(page.locator('#edit-as-diagram')).toBeVisible();
});

test('mode toggle buttons render an icon before their label', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#mode-text-btn svg')).toBeVisible();
  await expect(page.locator('#mode-diagram-btn svg')).toBeVisible();
});

test('Review/Generate/Settings render as a connected segmented group', async ({ page }) => {
  await page.goto('/');
  const group = page.locator('.segmented-group');
  await expect(group).toBeVisible();
  await expect(group.locator('#review-btn')).toBeVisible();
  await expect(group.locator('#generate-btn')).toBeVisible();
  await expect(group.locator('#settings-btn')).toBeVisible();
});

test('canvas view controls default to a light, gridded canvas and expose rulers and zoom', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#canvas-tools')).toBeVisible();
  await expect(page.locator('#canvas-grid-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#canvas-theme-btn')).toHaveAttribute('data-canvas-theme', 'light');
  await expect(page.locator('#canvas-zoom-fit')).toBeVisible();
  await expect(page.locator('#canvas-zoom-select')).toHaveValue('1');
  await expect(page.locator('#canvas-ruler-horizontal')).toBeVisible();
  await expect(page.locator('#canvas-ruler-vertical')).toBeVisible();
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#canvas-ruler-horizontal svg')).toBeVisible();
  await expect(page.locator('#canvas-ruler-vertical svg')).toBeVisible();

  await page.locator('#canvas-grid-btn').click();
  await expect(page.locator('#preview')).toHaveClass(/canvas-grid-hidden/);
  await page.locator('#canvas-theme-btn').click();
  await expect(page.locator('#preview')).toHaveClass(/canvas-theme-dark/);
  const darkCanvasColors = await page.locator('#preview').evaluate((element) => {
    const text = element.querySelector('svg text');
    const stroke = element.querySelector('svg [stroke="black"]');
    const shape = element.querySelector('svg [fill="white"]');
    return {
      text: text ? getComputedStyle(text).fill : '',
      stroke: stroke ? getComputedStyle(stroke).stroke : '',
      shape: shape ? getComputedStyle(shape).fill : '',
    };
  });
  expect(darkCanvasColors.text).toBe('rgb(232, 234, 236)');
  expect(darkCanvasColors.stroke).toBe('rgb(232, 234, 236)');
  expect(darkCanvasColors.shape).toBe('rgb(37, 43, 49)');
  await page.locator('#canvas-zoom-in').click();
  await expect(page.locator('#canvas-zoom-select')).not.toHaveValue('1');
  await page.locator('#canvas-zoom-select').selectOption('0.5');
  await expect(page.locator('#canvas-zoom-select')).toHaveValue('0.5');
  await page.locator('#canvas-zoom-select').selectOption('12');
  await expect(page.locator('#canvas-zoom-select')).toHaveValue('12');
  await page.locator('#canvas-zoom-fit').click();
  await expect(page.locator('#canvas-zoom-select')).toHaveValue('1');
});
