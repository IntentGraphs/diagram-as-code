import { test, expect } from '@playwright/test';

test('captures the verified Workspace Tour editor presentation', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/');
  await expect(page.locator('#project-name')).toHaveText('IntentGraphs Workspace Tour');
  await expect(page.locator('.diagram-item')).toHaveCount(6);
  await expect(page.locator('#preview svg')).toContainText('Open');
  await page.screenshot({ path: '../../docs/assets/diagram-editor-workspace-tour.png', fullPage: true });
});
