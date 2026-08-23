import { test, expect } from '@playwright/test';

const validGantt = `diagram: gantt
calendar: weekdays
group "Discovery" as discovery
  task "Interview users" as interviews start 2026-09-01 duration 3d
  task "Approve scope" as scope start 2026-09-04 duration 2d
  interviews -> scope
task "Build release" as build start 2026-09-08 end 2026-09-18
scope -> build
milestone "Public v1" as release start 2026-09-21
build -> release`;

test('renders Gantt as a text-first family with SVG, JSON, and CSV exports', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill(validGantt);
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#family-badge-label')).toHaveText('Gantt');
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toBeDisabled();

  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-gantt-json')).toHaveText('Export Gantt JSON');
  await expect(page.locator('#export-item-gantt-csv')).toHaveText('Export Gantt CSV');

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-gantt-json').click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toBe('diagram.json');

  await page.locator('#export-menu-btn').click();
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-gantt-csv').click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe('diagram.csv');

  await page.locator('#export-menu-btn').click();
  const [pptxDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-pptx').click(),
  ]);
  expect(pptxDownload.suggestedFilename()).toBe('diagram.pptx');
});

test('shows Gantt unsupported actions and preserves the last valid preview on invalid input', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill(validGantt);
  await expect(page.locator('#preview svg')).toBeVisible();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toBeDisabled();
  await expect(page.locator('#engine-override')).toHaveAttribute('title', 'Gantt layout does not support BPMN engine overrides.');
  await page.locator('#settings-btn').click();

  await editor.fill('diagram: gantt\ntask "Broken" as broken start 2026-09-01 end nope');
  await expect(page.locator('#errors .error-item')).not.toHaveCount(0);
  await expect(page.locator('#preview')).toHaveClass(/stale/);
  await expect(page.locator('#family-badge-label')).toHaveText('Gantt');
});
