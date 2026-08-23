import { test, expect } from '@playwright/test';

test('main editor page has basic accessible structure', async ({ page }) => {
  await page.goto('/');

  const unnamed = await page.locator('button:visible, input:visible, select:visible, textarea:visible').evaluateAll((controls) =>
    controls
      .map((control) => ({
        id: control.id,
        name: control.getAttribute('aria-label')?.trim() || control.textContent?.trim() || '',
      }))
      .filter(({ name }) => name.length === 0),
  );
  expect(unnamed).toEqual([]);
  await expect(page.locator('main')).toHaveCount(1);

  const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
    const ids = elements.map((element) => element.id);
    return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  });
  expect(duplicateIds).toEqual([]);
  await expect(page.locator('#toolbar')).toHaveAttribute('role', 'toolbar');
  await expect(page.locator('#errors')).toHaveAttribute('aria-live', 'assertive');
  await expect(page.locator('#diagram-status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#splitter')).toHaveAttribute('role', 'separator');
});
