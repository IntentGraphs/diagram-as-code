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
