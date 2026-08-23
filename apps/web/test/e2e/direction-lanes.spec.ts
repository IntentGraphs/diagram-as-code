import { test, expect } from '@playwright/test';

const flowchart = (direction: string) => `diagram: flowchart\ndirection: ${direction}\nbox "Start" as start\ndecision "Approved?" as approved\nbox "Done" as done\nstart -> approved\napproved => done: "yes"`;
const mindmap = (direction: string) => `diagram: mindmap\ndirection: ${direction}\nmindmap "Roadmap" as root\n  mindmap "Launch" as launch\n  mindmap "Learn" as learn`;
const bpmnVertical = `diagram: bpmn\nlaneDirection: vertical\npool "Order Process"\n  lane "Sales"\n    task "Capture order" as capture\n  lane "Fulfillment"\n    task "Ship order" as ship\ncapture -> ship`;

async function expectHealthyPreview(page: import('@playwright/test').Page, labels: string[]) {
  await expect(page.locator('#preview svg')).toBeVisible();
  for (const label of labels) await expect(page.locator('#preview')).toContainText(label);
  await expect(page.locator('#errors .error-item')).toHaveCount(0);
}

test.describe('direction and lane browser behavior', () => {
  for (const direction of ['right', 'left', 'down', 'up']) {
    test(`renders flowchart direction ${direction}`, async ({ page }) => {
      await page.goto('/');
      await page.locator('#editor').fill(flowchart(direction));
      await expectHealthyPreview(page, ['Start', 'Approved?', 'Done']);
      await page.locator('#export-menu-btn').click();
      await expect(page.locator('#export-item-svg')).toBeVisible();
      await expect(page.locator('#export-item-structured')).toBeVisible();
    });

    test(`renders mindmap direction ${direction}`, async ({ page }) => {
      await page.goto('/');
      await page.locator('#editor').fill(mindmap(direction));
      await expectHealthyPreview(page, ['Roadmap', 'Launch', 'Learn']);
      await page.locator('#export-menu-btn').click();
      await expect(page.locator('#export-item-svg')).toBeVisible();
      await expect(page.locator('#export-item-structured')).toBeVisible();
    });
  }

  test('preserves default flowchart, mindmap, and BPMN behavior', async ({ page }) => {
    await page.goto('/');
    await page.locator('#editor').fill('diagram: flowchart\nbox "Default flow" as flow');
    await expectHealthyPreview(page, ['Default flow']);
    await page.locator('#editor').fill('diagram: mindmap\nmindmap "Default map" as map');
    await expectHealthyPreview(page, ['Default map']);
    await page.locator('#editor').fill('task "Default BPMN" as task');
    await expectHealthyPreview(page, ['Default BPMN']);
  });

  test('renders BPMN vertical lanes and keeps supported exports available', async ({ page }) => {
    await page.goto('/');
    await page.locator('#editor').fill(bpmnVertical);
    await expectHealthyPreview(page, ['Capture order', 'Ship order', 'Sales', 'Fulfillment']);
    await page.locator('#export-menu-btn').click();
    await expect(page.locator('#export-item-svg')).toBeVisible();
    await expect(page.locator('#export-item-pptx')).toBeVisible();
    await expect(page.locator('#export-item-xml')).toBeVisible();
  });

  for (const family of ['architecture', 'gantt']) {
    test(`${family} direction is rejected with a blocking diagnostic`, async ({ page }) => {
      await page.goto('/');
      const source = family === 'architecture'
        ? 'diagram: architecture\ndirection: right\nsystem "Ordering" as ordering'
        : 'diagram: gantt\ndirection: right\ntask "Release" as release start 2026-09-01 duration 2d';
      await page.locator('#editor').fill(source);
      await expect(page.locator('#errors .error-item')).toContainText(`Direction "right" is not supported for diagram family "${family}"`);
      await expect(page.locator('#export-menu-btn')).toBeDisabled();
    });
  }
});
