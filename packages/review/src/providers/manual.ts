import type { ReviewBundle, ReviewProvider, VisualFinding } from '../types.js';

function slugify(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 6).join(' ') || 'Step';
  return words.length > 60 ? `${words.slice(0, 57)}...` : words;
}

/** No-op / CI provider — returns no model findings, and drafts a deterministic skeleton. */
export const manualProvider: ReviewProvider = {
  id: 'manual',
  async review(_bundle: ReviewBundle): Promise<VisualFinding[]> {
    return [];
  },
  async generate(description: string): Promise<string> {
    const label = slugify(description).replace(/"/g, "'");
    return [
      'event start none "Start" as e0',
      `task "${label}" as t1`,
      'event end none "End" as e1',
      '',
      'e0 -> t1',
      't1 -> e1',
    ].join('\n');
  },
};
