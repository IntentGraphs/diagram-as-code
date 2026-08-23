import { describe, expect, it } from 'vitest';
import { BPM_GRAMMAR as browserGrammar } from '../src/reviewProviders.js';
import { BPM_GRAMMAR as packageGrammar } from '@bpm/review';

const BOUNDARY_DECLARATION = '  boundary <trigger> (interrupting|nonInterrupting) "<label>" as <id> on <hostId>';

describe('browser BPMN review grammar', () => {
  it('supports boundary events with the same declaration as the package grammar', () => {
    expect(browserGrammar).toContain(BOUNDARY_DECLARATION);
    expect(packageGrammar).toContain(BOUNDARY_DECLARATION);
    expect(browserGrammar.split(BOUNDARY_DECLARATION).length - 1).toBe(
      packageGrammar.split(BOUNDARY_DECLARATION).length - 1,
    );
  });
});
