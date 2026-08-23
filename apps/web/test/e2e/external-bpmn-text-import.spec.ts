import { test, expect } from '@playwright/test';

const externalBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_external" targetNamespace="http://example.com/bpm">
  <process id="Process_external" isExecutable="false">
    <startEvent id="Start_external" name="Start" />
    <task id="Task_external" name="External review" />
    <endEvent id="End_external" name="Done" />
    <sequenceFlow id="Flow_external_1" sourceRef="Start_external" targetRef="Task_external" />
    <sequenceFlow id="Flow_external_2" sourceRef="Task_external" targetRef="End_external" />
  </process>
  <bpmndi:BPMNDiagram id="Diagram_external"><bpmndi:BPMNPlane id="Plane_external" bpmnElement="Process_external">
    <bpmndi:BPMNShape id="Shape_external_start" bpmnElement="Start_external"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Shape_external_task" bpmnElement="Task_external"><dc:Bounds x="200" y="80" width="120" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Shape_external_end" bpmnElement="End_external"><dc:Bounds x="380" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Edge_external_1" bpmnElement="Flow_external_1"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="120" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Edge_external_2" bpmnElement="Flow_external_2"><di:waypoint x="320" y="120" /><di:waypoint x="380" y="118" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</definitions>`;

const lossyExternalBpmn = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_lossy" targetNamespace="http://example.com/bpm">
  <process id="Process_lossy">
    <intermediateThrowEvent id="Throw_lossy" name="Notify"><timerEventDefinition><timeDuration>PT5M</timeDuration></timerEventDefinition></intermediateThrowEvent>
    <task id="Task_lossy" name="Repeat"><multiInstanceLoopCharacteristics isSequential="false" /></task>
    <callActivity id="Call_lossy" name="Shared flow" calledElement="sharedProcess" />
  </process>
</definitions>`;

async function waitForProjectBootstrap(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#project-name')).toHaveText('IntentGraphs Workspace Tour');
  await expect(page.locator('#editor')).toHaveValue(/Open/);
}

async function openExternalBpmn(page: import('@playwright/test').Page): Promise<void> {
  // Wait for project bootstrap before opening a file. Without this, a fast
  // runner can capture the initially empty textarea and then let bootstrap
  // race the import preview assertions.
  await waitForProjectBootstrap(page);
  await page.locator('#source-open-input').setInputFiles({
    name: 'external-review.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from(externalBpmn),
  });
  await expect(page.locator('#import-panel')).toBeVisible();
  await expect(page.locator('#import-panel .generate-result-badge')).toHaveText('Ready to review external-review.bpmn');
  await expect(page.locator('#import-panel .generate-result-text')).toContainText('External review');
}

test('external BPMN import shows a reviewable DSL preview and replaces Text only after explicit confirmation', async ({ page }) => {
  await page.goto('/');
  await waitForProjectBootstrap(page);
  const originalText = await page.locator('#editor').inputValue();

  await openExternalBpmn(page);

  await expect(page.locator('#editor')).toHaveValue(originalText);
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();

  await page.locator('#import-panel button', { hasText: 'Replace Text editor' }).click();
  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(page.locator('#editor')).toHaveValue(/External review/);
  await expect(page.locator('#preview svg')).toContainText('External review');
  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mode-diagram-btn')).toBeEnabled();
});

test('cancelling external BPMN review closes the panel and preserves the existing Text source', async ({ page }) => {
  await page.goto('/');
  await waitForProjectBootstrap(page);
  const editor = page.locator('#editor');
  const originalText = await editor.inputValue();

  await openExternalBpmn(page);
  await page.locator('#import-panel button', { hasText: 'Cancel' }).click();

  await expect(page.locator('#import-panel')).toBeHidden();
  await expect(editor).toHaveValue(originalText);
  await expect(page.locator('#body')).toBeVisible();
  await expect(page.locator('#diagram-body')).toBeHidden();
});

test('external BPMN review exposes structured semantic conversion loss', async ({ page }) => {
  await page.goto('/');
  await waitForProjectBootstrap(page);
  await page.locator('#source-open-input').setInputFiles({
    name: 'lossy.bpmn',
    mimeType: 'application/xml',
    buffer: Buffer.from(lossyExternalBpmn),
  });

  await expect(page.locator('#import-panel')).toBeVisible();
  await expect(page.locator('.import-loss-summary')).toContainText('transformed');
  await expect(page.locator('#import-panel details')).toContainText('Intermediate throw event');
});

test('external BPMN replacement is revision-safe when Text changes while the preview is open', async ({ page }) => {
  await page.goto('/');
  await waitForProjectBootstrap(page);
  const editor = page.locator('#editor');

  await openExternalBpmn(page);
  await editor.fill('task "Changed while reviewing" as changed');
  await page.locator('#import-panel button', { hasText: 'Replace Text editor' }).click();

  await expect(editor).toHaveValue(/Changed while reviewing/);
  await expect(editor).not.toHaveValue(/External review/);
  await expect(page.locator('#project-warning')).toContainText('Import discarded because the Text editor changed while the preview was open.');
  await expect(page.locator('#import-panel')).toBeHidden();
});
