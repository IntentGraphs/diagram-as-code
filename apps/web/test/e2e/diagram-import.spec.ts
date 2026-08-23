import { test, expect } from '@playwright/test';

test('Import to Text: happy path — edit in Diagram mode, convert, preview, confirm, land back in Text mode', async ({ page }) => {
  await page.goto('/');
  await page.locator('#edit-as-diagram').click();
  await expect(page.locator('#diagram-canvas [data-element-id="g1"]')).toBeVisible();

  await page.locator('#diagram-import-text').click();
  await expect(page.locator('#import-panel')).toBeVisible();

  await page.locator('#import-panel .review-run-btn', { hasText: 'Convert' }).click();
  await expect(page.locator('#import-panel .generate-result-badge')).toContainText('Ready to insert');
  await expect(page.locator('#import-panel .generate-result-text')).toContainText('positioning: manual');

  await page.locator('#import-panel button', { hasText: 'Insert into Text editor' }).click();

  // Back in Text mode, with the converted content, and the live preview renders it.
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();
  await expect(page.locator('#editor')).toHaveValue(/positioning: manual/);
  await expect(page.locator('#preview svg')).toBeVisible();

  // Re-entering Diagram mode must re-derive a fresh session (mode-switch latch), not reuse a
  // stale live model — confirmed by the palette/canvas coming up again from "Edit as Diagram".
  await expect(page.locator('#edit-as-diagram')).toBeEnabled();
  // The import just changed the Text editor's content, so it's legitimately "unsaved" —
  // re-entering Diagram mode correctly asks to confirm discarding it, same as any other edit.
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#edit-as-diagram').click();
  await expect(page.locator('#diagram-canvas .djs-palette')).toBeVisible();
});

test('Import to Text: converting alone never touches the Text editor before an explicit confirm', async ({ page }) => {
  // A genuine integrity-check failure isn't forceable from black-box e2e without exposing test
  // hooks (same judgment call as T2's own tests) -- this instead proves the "never auto-insert"
  // discipline itself: Convert alone (no Insert click) must leave the editor untouched, on the
  // simplest possible diagram (a lone start event, no edges), which also regression-tests that
  // the integrity gate doesn't block this ordinary case.
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-import-text')).toBeEnabled();

  const originalEditorValue = await page.locator('#editor').inputValue();

  await page.locator('#diagram-import-text').click();
  await page.locator('#import-panel .review-run-btn', { hasText: 'Convert' }).click();
  await expect(page.locator('#import-panel .generate-result-badge')).toContainText('Ready to insert');
  await expect(page.locator('#editor')).toHaveValue(originalEditorValue);
});
