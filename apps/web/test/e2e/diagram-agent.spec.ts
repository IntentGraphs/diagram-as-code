import { test, expect } from '@playwright/test';

test('manual AI agent previews and applies an offline plan step by step in Diagram mode', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();

  await expect(page.locator('#diagram-agent-btn')).toBeEnabled();
  await page.locator('#diagram-agent-btn').click();
  await expect(page.locator('#diagram-agent-panel')).toBeVisible();

  await page.locator('#diagram-agent-panel textarea').fill('Review order -> Ship order');
  await page.locator('#diagram-agent-panel').getByRole('button', { name: 'Plan actions' }).click();
  await expect(page.locator('#diagram-agent-panel .agent-plan')).toBeVisible();
  await expect(page.locator('#diagram-agent-panel .agent-plan-list li')).toHaveCount(7);

  await page.locator('#diagram-agent-panel').getByRole('button', { name: 'Apply next' }).click();
  await expect(page.locator('#diagram-agent-panel .agent-plan-current')).toHaveCount(1);
  await page.locator('#diagram-agent-panel').getByRole('button', { name: 'Undo agent step' }).click();
  await expect(page.locator('#diagram-canvas [data-element-id="agent-start"]')).toHaveCount(0);
  await expect(page.locator('#diagram-agent-panel .agent-plan-current')).toHaveCount(1);
  await page.locator('#diagram-agent-panel').getByRole('button', { name: 'Apply all' }).click();
  await expect(page.locator('#diagram-canvas [data-element-id="agent-task-1"]')).toBeVisible();
  await expect(page.locator('#diagram-agent-panel .agent-plan-applied')).toHaveCount(7);
  await expect(page.locator('#diagram-status')).toHaveText('Unsaved diagram changes.');
});
