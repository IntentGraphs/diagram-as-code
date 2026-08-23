/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { createExportMenu } from '../src/exportMenu.js';

describe('createExportMenu', () => {
  it('starts disabled with an empty menu', () => {
    const { button, container } = createExportMenu('export-menu');
    expect(button.id).toBe('export-menu-btn');
    expect(button.disabled).toBe(true);
    expect(container.querySelector('#export-menu-list')?.hidden).toBe(true);
  });

  it('setItems enables the button and renders clickable items', () => {
    const onClick = vi.fn();
    const { button, container, setItems } = createExportMenu('export-menu');
    setItems([{ id: 'export-item-svg', label: 'Export SVG', onClick }]);
    expect(button.disabled).toBe(false);

    button.click();
    const item = container.querySelector<HTMLButtonElement>('#export-item-svg')!;
    expect(item.textContent).toBe('Export SVG');
    item.click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const list = container.querySelector<HTMLDivElement>('#export-menu-list')!;
    expect(list.hidden).toBe(true); // clicking an item closes the menu
  });

  it('setItems([]) disables the button again', () => {
    const { button, setItems } = createExportMenu('export-menu');
    setItems([{ id: 'x', label: 'X', onClick: () => {} }]);
    expect(button.disabled).toBe(false);
    setItems([]);
    expect(button.disabled).toBe(true);
  });

  it('setDisabled(true) force-disables even with items present', () => {
    const { button, setItems, setDisabled } = createExportMenu('diagram-export-menu');
    setItems([{ id: 'a', label: 'A', onClick: () => {} }]);
    setDisabled(true);
    expect(button.disabled).toBe(true);
  });
});
