import { test, expect } from '@playwright/test';

test('project panel collapses, expands, and its width persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#project-panel')).toBeVisible();
  await expect(page.locator('#project-toggle-btn')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#project-toggle-btn').click();
  await expect(page.locator('#project-panel')).toBeHidden();
  await expect(page.locator('#project-splitter')).toBeHidden();
  await expect(page.locator('#project-toggle-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#project-toggle-btn').click();
  await expect(page.locator('#project-panel')).toBeVisible();

  // Resize by dragging the project splitter, matching the existing editor-splitter test's pattern.
  const splitterBox = (await page.locator('#project-splitter').boundingBox())!;
  const startWidth = (await page.locator('#project-panel').boundingBox())!.width;
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x + splitterBox.width / 2 + 80, splitterBox.y + 20);
  await page.mouse.up();
  const newWidth = (await page.locator('#project-panel').boundingBox())!.width;
  expect(newWidth).toBeGreaterThan(startWidth);

  await page.reload();
  const reloadedWidth = (await page.locator('#project-panel').boundingBox())!.width;
  expect(Math.abs(reloadedWidth - newWidth)).toBeLessThan(5);
});

test('Settings panel is collapsible, resizable, and shares its API key with Review and Generate', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#settings-panel')).toBeHidden();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect(page.locator('#settings-btn')).toHaveAttribute('aria-pressed', 'true');

  // Real CSS `resize: vertical` — assert the property is actually set, i.e. genuinely resizable.
  const resizeStyle = await page.locator('#settings-panel').evaluate((el) => getComputedStyle(el).resize);
  expect(resizeStyle).toBe('vertical');

  const apiKeyInput = page.locator('#settings-panel input[type="password"]');
  await apiKeyInput.fill('sk-test-shared-key');
  await apiKeyInput.blur();

  // Opening Settings hides Generate/Review and vice versa (same single-bottom-panel discipline).
  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel')).toBeVisible();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(page.locator('#settings-btn')).toHaveAttribute('aria-pressed', 'false');

  // Generate no longer has its own API key field — only a link back to Settings.
  await expect(page.locator('#generate-panel input[type="password"]')).toHaveCount(0);

  // Re-open Settings and confirm the key is still there without re-entering it.
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-panel input[type="password"]')).toHaveValue('sk-test-shared-key');

  // The shared setting survives a browser refresh and remains available to all AI panels.
  await page.reload();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-panel input[type="password"]')).toHaveValue('sk-test-shared-key');
  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel input[type="password"]')).toHaveCount(0);
});

test('engine override in Settings forces a specific layout engine and persists across reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('flat');

  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toBeVisible();
  await page.locator('#engine-override').selectOption('swimlane');
  await page.waitForTimeout(400);
  await expect(page.locator('#engine-badge')).toHaveText('swimlane');

  await page.reload();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toHaveValue('swimlane');
  await expect(page.locator('#engine-badge')).toHaveText('swimlane');
});

test('each panel close button closes the panel and syncs the toolbar toggle state', async ({ page }) => {
  await page.goto('/');

  await page.locator('#review-btn').click();
  await expect(page.locator('#review-panel')).toBeVisible();
  await page.locator('#review-panel .panel-close-btn').click();
  await expect(page.locator('#review-panel')).toBeHidden();
  await expect(page.locator('#review-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#generate-btn').click();
  await expect(page.locator('#generate-panel')).toBeVisible();
  await page.locator('#generate-panel .panel-close-btn').click();
  await expect(page.locator('#generate-panel')).toBeHidden();
  await expect(page.locator('#generate-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-panel')).toBeVisible();
  await page.locator('#settings-panel .panel-close-btn').click();
  await expect(page.locator('#settings-panel')).toBeHidden();
  await expect(page.locator('#settings-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();
  await page.locator('#diagram-import-text').click();
  await expect(page.locator('#import-panel')).toBeVisible();
  await page.locator('#import-panel .panel-close-btn').click();
  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(page.locator('#diagram-import-text')).toHaveAttribute('aria-pressed', 'false');
});
