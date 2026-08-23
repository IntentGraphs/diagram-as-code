import type { LayoutEngine } from '@bpm/layout-core';
import { runElkLayout } from '@bpm/layout-elk-base';

export const flatEngine: LayoutEngine = {
  name: 'flat',
  matches: () => true,
  layout: runElkLayout,
};
