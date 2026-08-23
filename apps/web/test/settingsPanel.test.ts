/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { getApiKey, setApiKey } from '../src/settingsPanel.js';

describe('AI key storage policy', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores keys in session storage by default', () => {
    setApiKey('  session-secret  ');

    expect(sessionStorage.getItem('bpm.review.apiKey')).toBe('session-secret');
    expect(localStorage.getItem('bpm.ai.apiKey')).toBeNull();
    expect(getApiKey()).toBe('session-secret');
  });

  it('requires explicit opt-in for device persistence', () => {
    setApiKey('device-secret', true);

    expect(localStorage.getItem('bpm.ai.apiKey')).toBe('device-secret');
    expect(localStorage.getItem('bpm.ai.rememberApiKey')).toBe('true');
    expect(sessionStorage.getItem('bpm.review.apiKey')).toBeNull();
    expect(getApiKey()).toBe('device-secret');
  });

  it('migrates an older persistent key to session-only storage', () => {
    localStorage.setItem('bpm.ai.apiKey', 'older-secret');

    expect(getApiKey()).toBe('older-secret');
    expect(sessionStorage.getItem('bpm.review.apiKey')).toBe('older-secret');
    expect(localStorage.getItem('bpm.ai.apiKey')).toBeNull();
  });
});
