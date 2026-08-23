import { test, expect } from '@playwright/test';

test.describe('project-based saving', () => {
  test('renames the project and downloads a reproducible project bundle', async ({ page }) => {
    await page.goto('/');
    await page.locator('#project-rename-btn').click();
    await page.locator('#diagram-name-input').fill('Release diagrams');
    await page.locator('#diagram-name-confirm').click();
    await expect(page.locator('#project-name')).toHaveText('Release diagrams');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#project-save-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Release-diagrams.bpm-project.json');
  });

  test('opens a .bpm source file and renders it in the text editor', async ({ page }) => {
    await page.goto('/');
    await page.locator('#source-open-input').setInputFiles({
      name: 'imported.bpm',
      mimeType: 'text/plain',
      buffer: Buffer.from('task "Imported source" as imported'),
    });
    await expect(page.locator('#editor')).toHaveValue(/Imported source/);
    await expect(page.locator('#preview svg')).toContainText('Imported source');
  });

  test('opens BPMN XML as a reviewable conversion without replacing the current source', async ({ page }) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://example.com/bpm">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1" name="Start" />
    <task id="Task_1" name="Imported task" />
    <endEvent id="EndEvent_1" name="Done" />
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
    <bpmndi:BPMNShape id="Shape_Start" bpmnElement="StartEvent_1"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Shape_Task" bpmnElement="Task_1"><dc:Bounds x="200" y="90" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Shape_End" bpmnElement="EndEvent_1"><dc:Bounds x="360" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Edge_1" bpmnElement="Flow_1"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="130" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Edge_2" bpmnElement="Flow_2"><di:waypoint x="300" y="130" /><di:waypoint x="360" y="118" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`;
    await page.goto('/');
    await page.locator('#source-open-input').setInputFiles({
      name: 'imported.bpmn',
      mimeType: 'application/xml',
      buffer: Buffer.from(xml),
    });
    await expect(page.locator('#import-panel .generate-result-badge')).toHaveText('Ready to review imported.bpmn');
    await expect(page.locator('#import-panel .generate-result-text')).toContainText('Imported task');
    await expect(page.locator('#import-panel .generate-result-text')).toContainText('positioning: manual');
    await expect(page.locator('#editor')).toHaveValue(/Order placed/);
    await expect(page.locator('#editor')).toHaveValue(/Review order/);
    await expect(page.locator('#editor')).not.toHaveValue(/positioning: manual/);
    await expect(page.locator('#preview svg')).toContainText('Order placed');
    await expect(page.locator('#preview svg')).toContainText('Review order');
  });

  test('opens a saved project bundle and renders its replay source', async ({ page }) => {
    const timestamp = new Date().toISOString();
    const projectId = 'bundle-project';
    const diagramId = 'bundle-diagram';
    const bundle = {
      format: 'bpm-project',
      version: 1,
      exportedAt: timestamp,
      activeDiagramId: diagramId,
      project: {
        id: projectId,
        name: 'Imported bundle',
        createdAt: timestamp,
        updatedAt: timestamp,
        activeDiagramId: diagramId,
      },
      diagrams: [{
        id: diagramId,
        name: 'frozen',
        kind: 'text',
        source: 'task "Original automatic source" as original',
        replaySource: 'positioning: manual\n\ntask "Frozen replay" as frozen at (40, 40)',
        createdAt: timestamp,
        updatedAt: timestamp,
      }],
    };
    await page.goto('/');
    await page.locator('#source-open-input').setInputFiles({
      name: 'imported.bpm-project.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    });
    await expect(page.locator('#project-name')).toHaveText('Imported bundle');
    await expect(page.locator('#editor')).toHaveValue(/Frozen replay/);
    await expect(page.locator('#preview svg')).toContainText('Frozen replay');
  });

  test('text diagram persists across reload', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#editor');
    await editor.fill([
      'pool P',
      '  lane L',
      '    start s',
      '    task t',
      '    end e',
      '    s -> t -> e',
    ].join('\n'));
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(editor).toHaveValue(/pool P/);
    await expect(editor).toHaveValue(/s -> t -> e/);
  });

  test('recovers a just-typed draft even if the page reloads before IndexedDB debounce', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#editor');
    await editor.fill('pool "Rapid draft"\n  lane "Work"\n    task "Still here" as draft');
    await page.reload();
    await expect(editor).toHaveValue(/Rapid draft/);
    await expect(editor).toHaveValue(/Still here/);
  });

  test('create, switch, rename, and delete diagrams', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#editor');

    await page.locator('#diagram-new-btn').click();
    await page.locator('#diagram-name-input').fill('details');
    await page.locator('#diagram-name-confirm').click();
    await expect(page.locator('.diagram-item.active .diagram-select')).toHaveText('details');
    await expect(editor).toHaveValue('');

    await editor.fill('task "Only in details" as d1');
    await expect(page.locator('#project-warning')).toContainText('Saved locally.', { timeout: 5000 });

    await page.locator('.diagram-select', { hasText: /^main/ }).click();
    await expect(editor).not.toHaveValue(/Only in details/);

    await page.locator('.diagram-select', { hasText: /^details/ }).click();
    await expect(editor).toHaveValue(/Only in details/);

    await page.locator('.diagram-item').filter({ hasText: 'details' }).locator('[aria-label="Rename diagram"]').click();
    await page.locator('#diagram-name-input').fill('renamed-flow');
    await page.locator('#diagram-name-confirm').click();
    await expect(page.locator('.diagram-item.active .diagram-select')).toContainText('renamed-flow');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('.diagram-item').filter({ hasText: 'renamed-flow' }).locator('[aria-label="Delete diagram"]').click();
    await expect(page.locator('.diagram-item')).toHaveCount(1);
    await expect(page.locator('.diagram-select')).toHaveText('main');
  });

  test('renamed diagram name persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('.diagram-item').filter({ hasText: 'main' }).locator('[aria-label="Rename diagram"]').click();
    await page.locator('#diagram-name-input').fill('saved-name');
    await page.locator('#diagram-name-confirm').click();
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('.diagram-select')).toHaveText('saved-name');
  });
});
