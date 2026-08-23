import { test, expect } from '@playwright/test';

const WIDE_DIAGRAM = `pool "Order Processing"
  lane "Customer"
    event start none "Start" as e0
    task "Wait" as t0
    event end none "End" as e1
  lane "Sales"
    task "Review Order" as t1
    task "Notify Customer" as t2
  lane "Warehouse"
    task "Check Stock" as t3
    task "Pack and Ship" as t4
  lane "Finance"
    task "Process Payment" as t5

e0 -> t1
t1 -> t2
t1 -> t3
t3 -> t4
t3 -> t5
t2 -> t0
t4 -> t0
t5 -> t0
t0 -> e1`;

test('a diagram wider/taller than the preview pane scales down to fit without overflow', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill(WIDE_DIAGRAM);
  await expect(page.locator('#preview svg')).toBeVisible();
  await page.waitForTimeout(400); // debounce + render

  const previewBox = await page.locator('#preview').boundingBox();
  const svgBox = await page.locator('#preview svg').boundingBox();
  expect(previewBox).not.toBeNull();
  expect(svgBox).not.toBeNull();

  // The rendered svg's box must sit within the preview pane's box (allow 1px rounding slack).
  expect(svgBox!.width).toBeLessThanOrEqual(previewBox!.width + 1);
  expect(svgBox!.height).toBeLessThanOrEqual(previewBox!.height + 1);

  // No scrollbars needed: scrollable area should not exceed the visible client area.
  const overflow = await page.locator('#preview').evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 1);
});

test('a small diagram is not blown up beyond its natural size', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('task "A" as a\nevent end none "B" as b\na -> b');
  await expect(page.locator('#preview svg')).toBeVisible();

  const svgWidthAttr = await page.locator('#preview svg').getAttribute('width');
  const svgBox = await page.locator('#preview svg').boundingBox();
  expect(svgBox!.width).toBeLessThanOrEqual(Number(svgWidthAttr) + 1);
});
