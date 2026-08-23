import { test, expect } from '@playwright/test';

test('typing valid diagram text renders an svg with the full notation set', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible(); // start message event
  await expect(page.locator('[data-node-id="b1"]')).toBeVisible(); // boundary event
  await expect(page.locator('[data-node-id="g1"]')).toBeVisible(); // exclusive gateway
  await expect(page.locator('[data-node-id="d1"]')).toBeVisible(); // data object
  await expect(page.locator('[data-edge-id]').first()).toBeVisible();
});

test('typing a mindmap renders through the family-neutral preview and disables BPMN editing/export', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('diagram: mindmap\nmindmap "Roadmap" as root\n  mindmap as child');
  await page.waitForTimeout(400);
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('Roadmap');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#export-item-structured')).toBeVisible();
  await expect(page.locator('#family-badge-label')).toHaveText('Mindmap');
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toHaveAttribute('title', 'Generate is not available for Mindmap diagrams.');
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
});

test('typing a flowchart renders through the family-neutral preview and disables BPMN editing/Generate', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: flowchart\nbox "Start" as start\ndecision "Approved?" as approved\nbox "Done" as done\nstart -> approved\napproved => done: "yes"');
  await page.waitForTimeout(500);
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('#preview')).toContainText('Approved?');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#export-item-structured')).toBeVisible();
  await expect(page.locator('#family-badge-label')).toHaveText('Flowchart');
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toHaveAttribute('title', 'Generate is not available for Flowchart diagrams.');
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#engine-override')).toHaveAttribute('title', 'Flowchart layout does not support BPMN engine overrides.');
  await page.locator('#settings-btn').click();
});

test('mindmap draw.io export is reachable from the toolbar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: mindmap\nmindmap "Roadmap" as root\n  mindmap as child');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-structured')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-structured').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.drawio');
});

test('flowchart draw.io export is reachable from the toolbar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: flowchart\nbox "Start" as start\ndecision "Approved?" as approved\nstart -> approved');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-structured')).toHaveText('Export draw.io XML');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-structured').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.drawio');
});

test('PPTX readability warnings keep the SVG preview and report completed output', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('positioning: manual\npage: 13.333in x 7.5in\nfit: contain\n\ntask "Too small" as a at (9800, 0) size (80, 40)');
  await page.waitForTimeout(500);
  await expect(page.locator('#preview svg')).toBeVisible();
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-pptx').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.pptx');
  await expect(page.locator('#errors')).toContainText('PPTX export completed with');
  await expect(page.locator('#errors')).toContainText('editable text');
  await expect(page.locator('#preview svg')).toBeVisible();
});

test('typing an architecture diagram renders with the family badge and draw.io export', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('diagram: architecture\nperson "Customer" as customer\nsystem "Ordering" as ordering\n  container "API" as api\ndatabase "Orders" as orders\ncustomer -> api: "places orders"\napi -> orders: "stores order"');
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('[data-node-id="ordering"]')).toBeVisible();
  await expect(page.locator('[data-node-id="orders"]')).toBeVisible();
  await expect(page.locator('#family-badge-label')).toHaveText('Architecture');
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#generate-btn')).toBeDisabled();
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#export-item-structured')).toHaveText('Export draw.io XML');
});

test('invalid mindmap text shows its diagnostic and keeps the preview stale', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  await editor.fill('diagram: mindmap\nmindmap "Root" as root\n   mindmap "Bad" as bad');
  await page.waitForTimeout(400);
  await expect(page.locator('#errors')).toContainText('Indentation must be exactly 2 spaces');
  await expect(page.locator('#family-badge-label')).toHaveText('Mindmap');
  await expect(page.locator('#preview')).toHaveClass(/stale/);
});

test('invalid text shows an inline error and keeps the last valid diagram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400); // debounce window

  await expect(page.locator('#errors')).toContainText('Could not parse line');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();
});

test('toolbar shows the auto-selected engine name and the editor uses monospace styling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#engine-badge')).toHaveText('flat'); // starter text has no pools
  await expect(page.locator('#toolbar')).toBeVisible();
  const fontFamily = await page.locator('#editor').evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('mono');
});

test('invalid text dims the stale preview and shows a structured error item', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-node-id="n2"]')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);

  await expect(page.locator('#preview')).toHaveClass(/stale/);
  await expect(page.locator('.error-item .error-line')).toContainText('Line 1:');

  await editor.fill('task "Review" as n1');
  await page.waitForTimeout(400);
  await expect(page.locator('#preview')).not.toHaveClass(/stale/);
});

test('dense BPMN input pauses automatic layout and disables render-dependent actions', async ({ page }) => {
  await page.goto('/');
  // Rendering now runs in a Web Worker (even for the small initial default diagram), so the
  // first render is asynchronous where it used to complete synchronously on the same tick. Wait
  // for it to land — matching the pattern already used elsewhere in this file — before typing a
  // new diagram, so this assertion isn't racing worker startup.
  await expect(page.locator('#preview svg')).toBeVisible();
  const nodes = Array.from({ length: 101 }, (_, i) => `task "T${i}" as n${i}`);
  const edges = Array.from({ length: 100 }, (_, i) => `n${i} -> n${i + 1}`);
  await page.locator('#editor').fill([...nodes, ...edges].join('\n'));

  await expect(page.locator('#heavy-render-dialog')).toBeVisible();
  await expect(page.locator('#heavy-render-message')).toContainText('101 nodes, 100 relationships');
  await expect(page.locator('#heavy-render-message')).toContainText('Press Render to update the preview once');
  await expect(page.locator('#render-status')).toContainText('Large diagram — press Render');
  await expect(page.locator('#render-btn')).toBeEnabled();
  await expect(page.locator('#export-menu-btn')).toBeDisabled();
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#mode-diagram-btn')).toBeDisabled();
  await expect(page.locator('#errors .error-item')).toHaveCount(0);
  await expect(page.locator('#preview svg')).toContainText('Order placed');
  await page.locator('#heavy-render-close').click();
  await expect(page.locator('#heavy-render-dialog')).toBeHidden();
});

test('heavy diagrams stay manual and render:auto shows an explicit warning', async ({ page }) => {
  await page.goto('/');
  const nodes = Array.from({ length: 40 }, (_, i) => `task "T${i}" as n${i}`);
  await page.locator('#editor').fill(['render: auto', ...nodes].join('\n'));

  await expect(page.locator('#heavy-render-dialog')).toBeVisible();
  await expect(page.locator('#heavy-render-message')).toContainText('render: auto');
  await expect(page.locator('#render-status')).toContainText('press Render');
  await expect(page.locator('#render-btn')).toBeEnabled();
  await page.locator('#heavy-render-close').click();
  await expect(page.locator('#heavy-render-dialog')).toBeHidden();
});

test('render: manual keeps a small diagram from auto-rendering until requested', async ({ page }) => {
  await page.goto('/');
  await page.locator('#editor').fill('render: manual\ntask "Manual" as manual');
  await expect(page.locator('#render-status')).toContainText('Manual render mode');
  await page.locator('#render-btn').click();
  await expect(page.locator('#preview svg')).toContainText('Manual');
});

test('render-dependent actions are disabled as soon as text diverges from the committed preview', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#edit-as-diagram')).toBeEnabled();
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-menu-btn')).toBeEnabled();

  await page.locator('#editor').press('End');
  await page.locator('#editor').pressSequentially('\n task "Pending" as pending');

  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#export-menu-btn')).toBeDisabled();
  await page.waitForTimeout(400);
  await expect(page.locator('#edit-as-diagram')).toBeEnabled();
  await expect(page.locator('#export-menu-btn')).toBeEnabled();
});

test('export menu is empty on error and populated for a valid diagram, and triggers real downloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toBeVisible();

  const editor = page.locator('#editor');
  await editor.fill('bogus "x" as n9');
  await page.waitForTimeout(400);
  await expect(page.locator('#export-menu-btn')).toBeDisabled();

  await editor.fill('task "Review" as n1');
  await page.waitForTimeout(400);
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-xml')).toBeVisible();

  const [xmlDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-xml').click(),
  ]);
  expect(xmlDownload.suggestedFilename()).toBe('diagram.bpmn');
  const xmlStream = await xmlDownload.createReadStream();
  const xmlChunks: Buffer[] = [];
  for await (const chunk of xmlStream!) xmlChunks.push(chunk as Buffer);
  const xmlContent = Buffer.concat(xmlChunks).toString('utf-8');
  expect(xmlContent).toContain('<bpmn2:definitions');
  expect(xmlContent).toContain('bpmn2:task');

  await page.locator('#export-menu-btn').click();
  const [svgDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-svg').click(),
  ]);
  expect(svgDownload.suggestedFilename()).toBe('diagram.svg');
});

test('download links are attached during click and object URLs are revoked from a timer', async ({ page }) => {
  await page.addInitScript(() => {
    const state = {
      anchorWasConnected: false,
      revokeRanInTimer: false,
      timerDepth: 0,
    };
    Object.assign(window, { __downloadLifecycle: state });

    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(() => {
        state.timerDepth += 1;
        try {
          if (typeof handler === 'function') handler(...args);
          else Function(handler)();
        } finally {
          state.timerDepth -= 1;
        }
      }, timeout)) as typeof window.setTimeout;

    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() {
      state.anchorWasConnected = this.isConnected;
      nativeClick.call(this);
    };

    const nativeRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      state.revokeRanInTimer = state.timerDepth > 0;
      nativeRevoke(url);
    };
  });

  await page.goto('/');
  await page.locator('#export-menu-btn').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-item-svg').click(),
  ]);
  expect(download.suggestedFilename()).toBe('diagram.svg');

  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __downloadLifecycle: { anchorWasConnected: boolean; revokeRanInTimer: boolean };
    }).__downloadLifecycle;
  })).toEqual({ anchorWasConnected: true, revokeRanInTimer: true, timerDepth: 0 });
});

test('dragging the splitter resizes the editor and persists across reload', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');
  const splitter = page.locator('#splitter');

  const before = (await editor.boundingBox())!;
  const splitterBox = (await splitter.boundingBox())!;

  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x + 150, splitterBox.y + splitterBox.height / 2);
  await page.mouse.up();

  const after = (await editor.boundingBox())!;
  expect(after.width).toBeGreaterThan(before.width + 100);

  await page.reload();
  const afterReload = (await editor.boundingBox())!;
  expect(afterReload.width).toBeCloseTo(after.width, 0);
});

test('clear button empties the editor, keeps SVG export enabled for the empty diagram, and disables BPMN-only actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-node-id="n1"]')).toBeVisible();

  await page.locator('#clear-btn').click();

  await expect(page.locator('#editor')).toHaveValue('');
  await page.locator('#export-menu-btn').click();
  await expect(page.locator('#export-item-svg')).toBeVisible();
  await expect(page.locator('#export-item-xml')).toHaveCount(0);
  await expect(page.locator('#edit-as-diagram')).toBeDisabled();
  await expect(page.locator('#preview svg')).toBeVisible();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
});

test('empty but valid BPMN and flowchart diagrams remain renderable for SVG export', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#editor');

  await editor.fill('diagram: bpmn');
  await page.waitForTimeout(400);
  await expect(page.locator('#errors')).toBeEmpty();
  await expect(page.locator('#export-menu-btn')).toBeEnabled();

  await editor.fill('diagram: flowchart');
  await page.waitForTimeout(400);
  await expect(page.locator('#errors')).toBeEmpty();
  await expect(page.locator('#export-menu-btn')).toBeEnabled();
});

test('fullscreen button toggles the preview into fullscreen', async ({ page }) => {
  await page.goto('/');
  const fullscreenBtn = page.locator('#fullscreen-btn');
  await expect(fullscreenBtn).toHaveText('Fullscreen');

  await fullscreenBtn.click();
  await expect(fullscreenBtn).toHaveText('Exit Fullscreen');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('preview');

  // The fullscreened element visually covers the whole viewport, including the toolbar
  // button underneath it — real browsers exit via the Escape key (or their own overlay
  // hint), not by clicking something now hidden behind the fullscreened element. Headless
  // Chromium doesn't wire Escape to the Fullscreen API the way a real browser does, so
  // this exercises the same document.exitFullscreen() path via script instead.
  await page.evaluate(() => document.exitFullscreen());
  await expect(fullscreenBtn).toHaveText('Fullscreen');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});
