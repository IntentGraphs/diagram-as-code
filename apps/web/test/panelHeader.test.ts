/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { createPanelHeader } from '../src/panelHeader.js';

describe('createPanelHeader', () => {
  it('renders a title and a close button that calls onClose', () => {
    const onClose = vi.fn();
    const { el } = createPanelHeader('Settings', onClose);
    expect(el.querySelector('.panel-header-title')?.textContent).toBe('Settings');
    const closeBtn = el.querySelector<HTMLButtonElement>('.panel-close-btn')!;
    expect(closeBtn.getAttribute('aria-label')).toBe('Close panel');
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('setTitle updates the title text without replacing the close button', () => {
    const { el, setTitle } = createPanelHeader('Review', () => {});
    const closeBtn = el.querySelector('.panel-close-btn');
    setTitle('Review (3 findings)');
    expect(el.querySelector('.panel-header-title')?.textContent).toBe('Review (3 findings)');
    expect(el.querySelector('.panel-close-btn')).toBe(closeBtn);
  });
});
