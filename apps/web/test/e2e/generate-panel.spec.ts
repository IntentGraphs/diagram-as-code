import { test, expect } from '@playwright/test';

test('generate panel drafts an offline skeleton and inserts it into the editor', async ({ page }) => {
  await page.goto('/');

  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel')).toBeVisible();

  await page.locator('#generate-description').fill('Customer submits an order and it gets shipped');
  await page.locator('#generate-panel .review-run-btn', { hasText: 'Generate' }).click();

  await expect(page.locator('.generate-result-badge')).toHaveText('Ready to insert — renders without errors');
  await expect(page.locator('.generate-result-text')).toContainText('event start none "Start" as e0');

  await page.locator('button', { hasText: 'Insert into editor' }).click();
  await expect(page.locator('#editor')).toHaveValue(/event start none "Start" as e0/);
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('review and generate panels are mutually exclusive', async ({ page }) => {
  await page.goto('/');

  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel')).toBeVisible();

  await page.locator('#review-btn').click();
  await expect(page.locator('#review-panel')).toBeVisible();
  await expect(page.locator('#generate-panel')).toBeHidden();
  await expect(page.locator('#generate-btn')).toHaveAttribute('aria-pressed', 'false');
});
