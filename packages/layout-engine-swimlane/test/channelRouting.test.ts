import { describe, it, expect } from 'vitest';
import { assignTracks, type ChannelInterval } from '../src/channelRouting.js';

function tracksOverlap(a: ChannelInterval, b: ChannelInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

function assertNoTrackCollisions(intervals: ChannelInterval[], tracks: Map<string, number>) {
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i], b = intervals[j];
      const sharedChannel = a.channels.some((c) => b.channels.includes(c));
      if (!sharedChannel) continue;
      if (tracks.get(a.id) === tracks.get(b.id)) {
        expect(tracksOverlap(a, b)).toBe(false);
      }
    }
  }
}

describe('assignTracks', () => {
  it('assigns non-overlapping intervals in the same channel to the same track (minimizes track count)', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 10 },
      { id: 'b', channels: [0], start: 20, end: 30 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).toBe(tracks.get('b'));
  });

  it('assigns overlapping intervals in the same channel to different tracks', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 20 },
      { id: 'b', channels: [0], start: 10, end: 30 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).not.toBe(tracks.get('b'));
    assertNoTrackCollisions(intervals, tracks);
  });

  it('handles three mutually-overlapping intervals with three distinct tracks', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 30 },
      { id: 'b', channels: [0], start: 5, end: 35 },
      { id: 'c', channels: [0], start: 10, end: 40 },
    ];
    const tracks = assignTracks(intervals);
    expect(new Set(tracks.values()).size).toBe(3);
    assertNoTrackCollisions(intervals, tracks);
  });

  it('keeps intervals in different, non-shared channels independent (can share a track)', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0], start: 0, end: 100 },
      { id: 'b', channels: [1], start: 0, end: 100 },
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).toBe(0);
    expect(tracks.get('b')).toBe(0);
  });

  it('gives a multi-channel interval a track free across every channel it spans', () => {
    const intervals: ChannelInterval[] = [
      { id: 'a', channels: [0, 1], start: 0, end: 50 },   // spans channels 0 and 1
      { id: 'b', channels: [0], start: 10, end: 20 },      // overlaps a in channel 0
      { id: 'c', channels: [1], start: 30, end: 40 },       // overlaps a in channel 1
    ];
    const tracks = assignTracks(intervals);
    expect(tracks.get('a')).not.toBe(tracks.get('b'));
    expect(tracks.get('a')).not.toBe(tracks.get('c'));
    assertNoTrackCollisions(intervals, tracks);
  });
});
