export interface ChannelInterval {
  id: string;
  /** Channel indices (gaps between adjacent lanes) this interval's path passes through. */
  channels: number[];
  start: number;
  end: number;
}

/**
 * Generalized left-edge interval-scheduling: assigns each interval the lowest-numbered track
 * such that, in every channel it passes through, no other interval already on that track in
 * that channel has an overlapping [start, end) span. This is what guarantees two edges routed
 * through the same channel gap can never cross each other there — they're geometrically
 * separated onto different tracks whenever their horizontal spans would otherwise conflict.
 */
export function assignTracks(intervals: ChannelInterval[]): Map<string, number> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  // channelTrackEnds.get(channel)[track] = end x of the last interval assigned to that track in that channel
  const channelTrackEnds = new Map<number, number[]>();
  const trackById = new Map<string, number>();

  for (const interval of sorted) {
    let track = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const free = interval.channels.every((channel) => {
        const ends = channelTrackEnds.get(channel) ?? [];
        return (ends[track] ?? -Infinity) <= interval.start;
      });
      if (free) break;
      track += 1;
    }
    for (const channel of interval.channels) {
      const ends = channelTrackEnds.get(channel) ?? [];
      ends[track] = interval.end;
      channelTrackEnds.set(channel, ends);
    }
    trackById.set(interval.id, track);
  }

  return trackById;
}
