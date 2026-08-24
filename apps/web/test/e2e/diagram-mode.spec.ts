import { test, expect } from '@playwright/test';

test('mode toggle switches between text and diagram panels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();

  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-body')).toBeVisible();
  await expect(page.locator('#body')).toBeHidden();
  await expect(page.locator('#mode-diagram-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'true');
});

test('entering diagram mode creates a bpmn-js canvas; New Diagram loads a start event with the palette visible', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-canvas .djs-container')).toBeVisible();
  const watermark = page.locator('#diagram-canvas .bjs-powered-by');
  await expect(watermark).toBeVisible();
  await expect(watermark).toHaveAttribute('title', 'Powered by bpmn.io');
  await expect(watermark).toHaveAttribute('href', /bpmn\.io/);
  const watermarkBox = await watermark.boundingBox();
  const canvasBox = await page.locator('#diagram-canvas').boundingBox();
  expect(watermarkBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(watermarkBox!.x).toBeGreaterThanOrEqual(canvasBox!.x);
  expect(watermarkBox!.y).toBeGreaterThanOrEqual(canvasBox!.y);
  expect(watermarkBox!.x + watermarkBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width);
  expect(watermarkBox!.y + watermarkBox!.height).toBeLessThanOrEqual(canvasBox!.y + canvasBox!.height);

  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-canvas .djs-palette')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id]').first()).toBeVisible();
});

test('Edit as Diagram seeds the bpmn-js canvas from the current text diagram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#edit-as-diagram')).toBeEnabled();

  await page.locator('#canvas-zoom-select').selectOption('2');
  await page.locator('#edit-as-diagram').click();
  await expect(page.locator('#diagram-body')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="start"]')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="choose"]')).toBeVisible();
  await expect(page.locator('#diagram-canvas [data-element-id="edit"]')).toBeVisible();
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
  await expect(page.locator('#diagram-zoom-label')).toHaveText('200%');
});

test('Edit as Diagram is disabled while there is a parse error', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
});

test('Freeze as Manual converts the current rendered BPMN layout into manual DSL', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  const freezeButton = page.locator('#freeze-as-manual');

  await expect(freezeButton).toBeEnabled();
  await expect(editor).not.toHaveValue(/positioning: manual/);
  await freezeButton.click();

  await expect(editor).toHaveValue(/positioning: manual/);
  await expect(editor).toHaveValue(/ at \(-?\d+, -?\d+\)/);
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#errors .error-item')).toHaveCount(0);
  await expect(freezeButton).toBeDisabled();
});

test('Open loads a valid .bpmn file exported from Text mode', async ({ page }) => {
  await page.goto('/');
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-xml').click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const xml = Buffer.concat(chunks).toString('utf-8');

  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'reopened.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from(xml),
  });
  await expect(page.locator('#diagram-canvas [data-element-id="start"]')).toBeVisible();
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
});

test('Open surfaces an error for malformed XML instead of failing silently', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'bad.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from('this is not xml'),
  });
  await expect(page.locator('#diagram-errors .error-item')).not.toHaveCount(0);
});

test('Open rejects an oversized BPMN file before reading it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'oversized.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1, 0x20),
  });
  await expect(page.locator('#diagram-errors .error-item')).toContainText('too large to open');
});

test('New Diagram clears a malformed Open error and enables diagram actions', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'bad.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from('this is not xml'),
  });
  await expect(page.locator('#diagram-errors .error-item')).not.toHaveCount(0);

  await page.locator('#diagram-new').click();

  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeEnabled();
});

test('Save and the Export menu are disabled until a diagram is loaded, then trigger downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-save')).toBeDisabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeDisabled();

  await page.locator('#diagram-new').click();
  await expect(page.locator('#diagram-save')).toBeEnabled();
  await expect(page.locator('#diagram-export-menu-btn')).toBeEnabled();
  await expect(page.locator('#diagram-status')).toHaveText('Diagram ready. No unsaved changes.');

  const [saveDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-save').click(),
  ]);
  expect(saveDownload.suggestedFilename()).toBe('diagram.bpmn');
  await expect(page.locator('#diagram-status')).toHaveText('Diagram changes saved.');

  await page.locator('#diagram-export-menu-btn').click();
  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-item-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  expect(Buffer.concat(xmlChunks).toString('utf-8')).toContain('bpmn:definitions');

  await page.locator('#diagram-export-menu-btn').click();
  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-export-item-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});

test('Save is gated on the export-integrity check but does not false-positive on a normal diagram', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-toolbar-actions')).toBeVisible();
  await page.locator('#diagram-new').click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.bpmn');
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
});

test('a browser download failure is surfaced and never reported as saved', async ({ page }) => {
  await page.addInitScript(() => {
    URL.createObjectURL = () => { throw new Error('download blocked by test'); };
  });
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();
  await page.locator('#diagram-save').click();
  await expect(page.locator('#diagram-errors')).toContainText('download blocked by test');
  await expect(page.locator('#diagram-status')).toHaveText('Diagram ready. No unsaved changes.');
});

test('Save survives the round-trip check on a diagram with real edges (di:waypoint actually used)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#edit-as-diagram').click();
  await expect(page.locator('#diagram-canvas [data-element-id="choose"]')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#diagram-save').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.bpmn');
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);
});

test('unsaved changes in diagram mode prompt before leaving; dismissing stays, accepting leaves', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();

  const element = page.locator('#diagram-canvas .djs-shape[data-element-id]').first();
  const box = (await element.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#diagram-status')).toHaveText('Unsaved diagram changes.');

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#diagram-body')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
});

test('New Diagram prompts before discarding edits; dismissing preserves them and accepting starts fresh', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await expect(page.locator('#diagram-toolbar-actions')).toBeVisible();
  await page.locator('#diagram-new').click();

  const element = page.locator('#diagram-canvas .djs-shape[data-element-id]').first();
  const initialBox = (await element.boundingBox())!;
  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width / 2 + 60, initialBox.y + initialBox.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  const movedBox = (await element.boundingBox())!;

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#diagram-new').click();
  await expect(element).toBeVisible();
  expect(await element.boundingBox()).toEqual(movedBox);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#diagram-new').click();
  await expect(element).toBeVisible();
  expect(await element.boundingBox()).toEqual(initialBox);
});

test('a freshly loaded diagram with no edits switches modes without a prompt', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-new').click();

  page.on('dialog', (dialog) => {
    throw new Error(`unexpected dialog: ${dialog.message()}`);
  });
  await page.locator('#mode-text-btn').click();
  await expect(page.locator('#body')).toBeVisible();
});
