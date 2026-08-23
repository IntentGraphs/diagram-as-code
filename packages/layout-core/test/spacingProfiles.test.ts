import { describe, expect, it } from 'vitest';
import { getSpacingProfile } from '../src/spacingProfiles.js';
import { laneChannelGap, poolStackGap } from '../src/swimlaneGeometry.js';

describe('swimlane spacing profiles', () => {
  it('preserves relaxed inner lane padding while scaling channel and pool gaps', () => {
    const relaxed = getSpacingProfile('relaxed');
    expect(relaxed.laneVerticalPadding).toBe(30);
    expect(poolStackGap(relaxed)).toBeGreaterThan(poolStackGap(getSpacingProfile('normal')));
  });

  it('adds bounded track demand without unbounded lane growth', () => {
    const profile = getSpacingProfile('relaxed');
    expect(laneChannelGap(profile, 0)).toBe(profile.laneChannelBaseGap);
    expect(laneChannelGap(profile, 2)).toBe(profile.laneChannelBaseGap + profile.trackSpacing * 2);
    expect(laneChannelGap(profile, 100)).toBe(profile.laneChannelBaseGap + profile.trackSpacing * 8);
  });
});
