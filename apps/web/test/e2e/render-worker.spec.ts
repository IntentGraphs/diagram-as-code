import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const largeFixture = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'large-4pool-manufacturing.bpm'),
  'utf8',
);

test('a large diagram shows a visible loading state with a cancel button, and the page stays responsive', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill(largeFixture);
  await page.locator('#render-btn').click();
  await expect(page.locator('#render-spinner')).toBeVisible();
  await expect(page.locator('#render-cancel-btn')).toBeVisible();
  // Responsiveness proxy: the settings button must still respond to a click while layout is running.
  const start = Date.now();
  await page.locator('#settings-btn').click({ timeout: 2000 });
  expect(Date.now() - start).toBeLessThan(2000);
  await page.locator('#settings-btn').click(); // close it back
  await page.locator('#render-cancel-btn').click(); // stop the render before the test ends
});

test('cancel leaves the previous preview visible and the editor usable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('task "Kept" as kept');
  await page.locator('#render-btn').click();
  await expect(page.locator('#preview')).toContainText('Kept');
  await page.locator('#editor').fill(largeFixture);
  await page.locator('#render-btn').click();
  await expect(page.locator('#render-cancel-btn')).toBeVisible();
  await page.locator('#render-cancel-btn').click();
  await expect(page.locator('#render-status')).toContainText('cancelled');
  await expect(page.locator('#preview')).toContainText('Kept'); // previous preview preserved, not blanked
  await expect(page.locator('#render-btn')).toBeEnabled(); // retry available
});

test('small diagrams still render immediately without a visible loading strip', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('task "Small" as s');
  await page.waitForTimeout(400);
  await expect(page.locator('#preview')).toContainText('Small');
  await expect(page.locator('#render-spinner')).toBeHidden();
  await expect(page.locator('#render-cancel-btn')).toBeHidden();
});

test('render: manual still waits for the Render action even for the worker path', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill(['render: manual', 'task "Manual" as manual'].join('\n'));
  await expect(page.locator('#render-status')).toContainText('Manual render mode');
  await expect(page.locator('#preview')).not.toContainText('Manual');
  await page.locator('#render-btn').click();
  await expect(page.locator('#preview')).toContainText('Manual');
});

test('a heavy diagram does not repeatedly auto-render while the editor is idle', async ({ page }) => {
  await page.goto('/');
  const nodes = Array.from({ length: 101 }, (_, i) => `task "T${i}" as t${i}`);
  const edges = Array.from({ length: 99 }, (_, i) => `t${i} -> t${i + 1}`);
  await page.locator('#editor').fill(['render: auto', ...nodes, ...edges].join('\n'));
  await expect(page.locator('#heavy-render-dialog')).toBeVisible();
  await page.locator('#heavy-render-close').click();
  await page.waitForTimeout(1000);
  await expect(page.locator('#render-cancel-btn')).toBeHidden(); // never auto-started a render
});
