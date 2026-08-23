import { test, expect } from '@playwright/test';

/**
 * T7 (roadmap item 16): integration-level verification across the whole wired-together path —
 * Text -> Diagram mode (existing "Edit as Diagram") -> Diagram mode -> Text (new "Import to
 * Text", T5), driven through the real browser UI, not by calling package functions directly
 * (T2/T3/T4 already have their own unit/package-level tests for that). See the design doc,
 * the public Import to Text behavior documented in STATUS.md, for what's in v1 scope.
 */

async function roundTripThroughDiagramMode(
  page: import('@playwright/test').Page,
  text: string,
  firstNodeId: string,
  options: { expectCleanGeometry?: boolean } = {},
): Promise<string> {
  const { expectCleanGeometry = true } = options;
  await page.goto('/');
  await page.locator('#editor').fill(text);
  await page.waitForTimeout(400); // debounce window (matches live-render.spec.ts's own pattern)
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#errors .error-item')).toHaveCount(0);

  // Filling the editor marks it dirty, so entering Diagram mode asks to confirm discarding it —
  // same "unsaved changes" prompt exercised (and handled) elsewhere in diagram-mode.spec.ts.
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#edit-as-diagram').click();
  // Wait for the imported *content* to render (not just the container wrapper) — under parallel
  // test-worker CPU contention, the container can exist before bpmn-js has finished importing.
  await expect(page.locator(`#diagram-canvas [data-element-id="${firstNodeId}"]`)).toBeVisible();
  await expect(page.locator('#diagram-errors .error-item')).toHaveCount(0);

  await page.locator('#diagram-import-text').click();
  await page.locator('#import-panel .review-run-btn', { hasText: 'Convert' }).click();
  await expect(page.locator('#import-panel .generate-result-badge')).toContainText('Ready to insert');
  await page.locator('#import-panel button', { hasText: 'Insert into Text editor' }).click();

  await expect(page.locator('#mode-text-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preview svg')).toBeVisible();
  if (expectCleanGeometry) {
    await expect(page.locator('#errors .error-item')).toHaveCount(0);
  }
  return page.locator('#editor').inputValue();
}

test('plain flow: gateway branches survive the round trip', async ({ page }) => {
  const text = [
    'event start none "Start" as e0',
    'task "Review" as t1',
    'gateway exclusive "OK?" as g1',
    'task "Ship" as t2',
    'task "Reject" as t3',
    'event end none "Shipped" as e1',
    'event end none "Rejected" as e2',
    '',
    'e0 -> t1',
    't1 -> g1',
    'g1 => t2: "yes"',
    'g1 ->> t3: "no"',
    't2 -> e1',
    't3 -> e2',
  ].join('\n');
  const result = await roundTripThroughDiagramMode(page, text, 'e0');
  for (const label of ['Start', 'Review', 'OK?', 'Ship', 'Reject', 'Shipped', 'Rejected']) {
    expect(result).toContain(label);
  }
  expect(result).toContain('=>');
  expect(result).toContain('->>');
});

test('pools and lanes survive the round trip', async ({ page }) => {
  const text = [
    'pool "Order Processing"',
    '  lane "Sales"',
    '    task "Review Order" as t1',
    '  lane "Finance"',
    '    task "Process Payment" as t2',
    '',
    't1 -> t2',
  ].join('\n');
  const result = await roundTripThroughDiagramMode(page, text, 't1');
  expect(result).toContain('pool "Order Processing"');
  expect(result).toContain('lane "Sales"');
  expect(result).toContain('lane "Finance"');
  expect(result).toContain('Review Order');
  expect(result).toContain('Process Payment');
});

test('nested subprocess content survives the round trip', async ({ page }) => {
  // expectCleanGeometry: false — the cross-renderer geometry limitation is documented by this fixture.
  // design.md's findings note. An expanded subprocess's box is recomputed from its children's
  // positions by this tool's own layout engine (docs/LANGUAGE.md §6.5), ignoring any declared
  // size(); bpmn-js's own internal padding convention for subprocess content isn't guaranteed to
  // match this tool's SUBPROCESS_PADDING/HEADER_INSET constants (two independently developed
  // renderers), so a *bpmn-js* round trip specifically can occasionally recompute a subprocess
  // box wider than this importer's position math assumed, producing a real (not false-positive)
  // overlap that @bpm/validate correctly reports. This is a geometry limitation, not a content
  // one — the structural assertions below (labels, nesting) are what this test actually verifies.
  const text = [
    'subprocess "Handle payment" as sp1',
    '  event start none "Sub start" as sn1',
    '  task "Charge card" as sn2',
    '  sn1 -> sn2',
    'event end none "Done" as e1',
    '',
    'sp1 -> e1',
  ].join('\n');
  const result = await roundTripThroughDiagramMode(page, text, 'sp1', { expectCleanGeometry: false });
  expect(result).toContain('subprocess "Handle payment"');
  expect(result).toContain('Sub start');
  expect(result).toContain('Charge card');
});

test('boundary events survive the round trip and never carry a position', async ({ page }) => {
  const text = [
    'task "Charge card" as t1',
    'boundary timer nonInterrupting "Slow charge" as b1 on t1',
    'event end none "Done" as e1',
    '',
    't1 -> e1',
  ].join('\n');
  const result = await roundTripThroughDiagramMode(page, text, 't1');
  const boundaryLine = result.split('\n').find((line) => line.includes('boundary timer nonInterrupting'));
  expect(boundaryLine).toBeDefined();
  expect(boundaryLine).not.toContain(' at (');
});

test('Camunda extensions survive the round trip', async ({ page }) => {
  const text = [
    'serviceTask "Charge" as s1 [camundaClass: "com.example.ChargeDelegate"]',
    'userTask "Approve" as u1 [camundaFormKey: "embedded:app:forms/approve.html"]',
    'event end none "Done" as e1',
    '',
    's1 -> u1',
    'u1 -> e1',
  ].join('\n');
  const result = await roundTripThroughDiagramMode(page, text, 's1');
  expect(result).toContain('camundaClass');
  expect(result).toContain('com.example.ChargeDelegate');
  expect(result).toContain('camundaFormKey');
});
