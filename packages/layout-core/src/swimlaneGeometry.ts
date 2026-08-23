/** Width reserved for the BPMN pool/lane label strip in horizontal swimlanes. */
export const HORIZONTAL_POOL_HEADER_WIDTH = 30;

/** Legacy default retained for callers that do not have a spacing profile. */
export const POOL_STACK_GAP = 28;

export function poolStackGap(profile: { poolStackGap: number }): number {
  return profile.poolStackGap;
}

/**
 * Computes one channel's reserved height. Track demand is deliberately bounded
 * to the number of assigned tracks; this keeps a dense diagram from growing
 * without limit while preserving the profile's readable minimum.
 */
export function laneChannelGap(
  profile: { laneChannelBaseGap: number; trackSpacing: number },
  tracks: number,
): number {
  const boundedTracks = Math.max(0, Math.min(8, Math.floor(tracks)));
  return profile.laneChannelBaseGap + boundedTracks * profile.trackSpacing;
}
