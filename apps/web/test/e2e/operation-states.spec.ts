import { test, expect } from '@playwright/test';

const validSource = 'task "Imported" as imported';

async function delayFileReads(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const originalText = File.prototype.text;
    File.prototype.text = async function textWithTestDelay(): Promise<string> {
      if (this.name === 'slow.bpm') await new Promise((resolve) => setTimeout(resolve, 250));
      return originalText.call(this);
    };
  });
}

test('source import exposes a busy state, guards controls, then restores them on success', async ({ page }) => {
  await delayFileReads(page);
  await page.goto('/');

  const sourceInput = page.locator('#source-open-input');
  await sourceInput.setInputFiles({
    name: 'slow.bpm',
    mimeType: 'text/plain',
    buffer: Buffer.from(validSource),
  });

  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', /loading|running/);
  await expect(page.locator('#operation-status')).toContainText(/Opening slow\.bpm/);
  await expect(page.locator('#source-open-btn')).toBeDisabled();

  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#operation-status')).toContainText('Loaded slow.bpm.');
  await expect(page.locator('#source-open-btn')).toBeEnabled();
  await expect(page.locator('#editor')).toHaveValue(/Imported/);
  await expect(page.locator('#preview svg')).toContainText('Imported');
});

test('source import failure is shown in the project error area and controls recover', async ({ page }) => {
  await page.goto('/');
  await page.locator('#source-open-input').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not a project bundle }'),
  });

  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#operation-status')).toContainText('Could not open invalid.json');
  await expect(page.locator('#project-warning')).toContainText('Could not open invalid.json');
  await expect(page.locator('#source-open-btn')).toBeEnabled();
  await expect(page.locator('#project-save-btn')).toBeEnabled();
});

test('diagram XML load and export report completion and restore diagram controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('#mode-diagram-btn').click();
  await page.locator('#diagram-open-input').setInputFiles({
    name: 'loaded.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_loaded" targetNamespace="http://example.com/bpm">
  <process id="Process_loaded" isExecutable="false"><startEvent id="Start_loaded" name="Start" /></process>
  <bpmndi:BPMNDiagram id="Diagram_loaded"><bpmndi:BPMNPlane id="Plane_loaded" bpmnElement="Process_loaded">
    <bpmndi:BPMNShape id="Shape_loaded" bpmnElement="Start_loaded"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`),
  });

  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#operation-status')).toContainText('loaded.bpmn opened.');
  await expect(page.locator('#diagram-open')).toBeEnabled();
  await expect(page.locator('#diagram-save')).toBeEnabled();

  const download = page.waitForEvent('download');
  await page.locator('#diagram-save').click();
  expect((await download).suggestedFilename()).toBe('diagram.bpmn');
  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', 'success');
  await expect(page.locator('#operation-status')).toContainText('BPMN XML export completed.');
  await expect(page.locator('#diagram-save')).toBeEnabled();
});

test('PPTX warning completion is non-blocking and keeps the preview available', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('positioning: manual\npage: 13.333in x 7.5in\nfit: contain\n\ntask "Too small" as a at (9800, 0) size (80, 40)');
  await expect(page.locator('#preview svg')).toBeVisible();
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-pptx').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.pptx');

  await expect(page.locator('#operation-status')).toHaveAttribute('data-state', 'warning');
  await expect(page.locator('#operation-status')).toContainText('PowerPoint export completed with');
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#export-menu-btn')).toBeEnabled();
});
