import { test, expect } from '@playwright/test';

test('external BPMN preview is rejected when the active diagram changes', async ({ page }) => {
  const activeDiagram = page.locator('.diagram-item.active .diagram-select');
  await page.goto('/');
  await page.locator('#diagram-new-btn').click();
  await page.locator('#diagram-name-input').fill('second');
  await page.locator('#diagram-name-confirm').click();
  await page.locator('.diagram-select', { hasText: /^main/ }).click();
  await expect(activeDiagram).toHaveText(/^main/);
  await page.locator('.diagram-select', { hasText: /^second/ }).click();
  await expect(activeDiagram).toHaveText(/^second/);
  const activeText = await page.locator('#editor').inputValue();
  await page.locator('.diagram-select', { hasText: /^main/ }).click();
  await expect(activeDiagram).toHaveText(/^main/);

  await page.locator('#source-open-input').setInputFiles({
    name: 'changed.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from('<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p"><startEvent id="s"/><endEvent id="e"/></process></definitions>'),
  });
  await expect(page.locator('#import-panel .generate-result-badge')).toContainText('Ready to review');

  await page.locator('.diagram-select', { hasText: /^second/ }).click();
  await expect(activeDiagram).toHaveText(/^second/);
  await page.locator('#import-panel button', { hasText: 'Replace Text editor' }).click();

  await expect(page.locator('#project-warning')).toContainText('active project or diagram changed');
  await expect(page.locator('#editor')).toHaveValue(activeText);
});
