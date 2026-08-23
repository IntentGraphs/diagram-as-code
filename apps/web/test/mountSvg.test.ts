/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { mountSvg } from '../src/mountSvg.js';

describe('mountSvg', () => {
  it('mounts a well-formed SVG element', () => {
    const host = document.createElement('div');
    const ok = mountSvg(host, '<svg xmlns="http://www.w3.org/2000/svg"><text>&lt;x&gt;</text></svg>');
    expect(ok).toBe(true);
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toContain('<x>');
  });

  it('rejects markup that is not SVG', () => {
    const host = document.createElement('div');
    const ok = mountSvg(host, '<div onclick="alert(1)">nope</div>');
    // DOMParser with image/svg+xml typically yields a parsererror document
    expect(ok).toBe(false);
    expect(host.childNodes.length).toBe(0);
  });
});
