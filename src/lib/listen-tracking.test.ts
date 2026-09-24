import { describe, expect, it } from 'vitest';
import {
  LISTEN_HEARTBEAT_MS,
  LISTEN_SESSION_IDLE_MS,
  markListenReported,
  recordListenSample,
  shouldReportListen,
  toListenPayload,
  type ListenSample,
  type ListenSession,
} from './listen-tracking';
import { listenPayloadSchema } from './validators';

const LESSON = '11111111-1111-1111-1111-111111111111';
let ids = 0;
const nextId = () => `00000000-0000-0000-0000-${String(++ids).padStart(12, '0')}`;

function at(nowMs: number, position: number, overrides: Partial<ListenSample> = {}): ListenSample {
  return { trackKey: 'a', lessonId: LESSON, audioFileId: null, position, playing: true, nowMs, ...overrides };
}

/** Plays continuously at `rate`, sampling every 5s, from `fromMs` for `seconds`. */
function play(session: ListenSession | null, fromMs: number, fromPos: number, seconds: number, rate = 1) {
  let current = recordListenSample(session, at(fromMs, fromPos), nextId).session;
  for (let t = 5; t <= seconds; t += 5) {
    current = recordListenSample(current, at(fromMs + t * 1000, fromPos + t * rate), nextId).session;
  }
  return current;
}

describe('recordListenSample', () => {
  it('counts media time that advanced while playing', () => {
    expect(play(null, 0, 0, 60).listenedSeconds).toBe(60);
    expect(play(null, 0, 0, 60, 2).listenedSeconds).toBe(120);
  });

  it('does not count paused time or seeks made while paused', () => {
    let session = play(null, 0, 0, 20);
    session = recordListenSample(session, at(21_000, 21, { playing: false }), nextId).session;
    // Ten minutes later the listener dragged the slider forward, still paused.
    session = recordListenSample(session, at(621_000, 900, { playing: false }), nextId).session;
    expect(session.listenedSeconds).toBe(21);
  });

  it('counts a skip interval as wall time, not as the jump', () => {
    let session = play(null, 0, 0, 10);
    session = recordListenSample(session, at(15_000, 10 + 5 + 30), nextId).session; // +30s skip
    expect(session.listenedSeconds).toBe(15);
    session = recordListenSample(session, at(20_000, 45 + 5 - 15), nextId).session; // -15s skip
    expect(session.listenedSeconds).toBe(20);
  });

  it('starts a new session on another track and hands back the finished one', () => {
    const first = play(null, 0, 0, 40);
    const { session, finished } = recordListenSample(first, at(41_000, 0, { trackKey: 'b' }), nextId);
    expect(finished).toBe(first);
    expect(session.sessionId).not.toBe(first.sessionId);
    expect(session.listenedSeconds).toBe(0);
  });

  it('starts a new session when the same track resumes after a long idle gap', () => {
    const first = play(null, 0, 0, 40);
    const later = recordListenSample(first, at(40_000 + LISTEN_SESSION_IDLE_MS + 1, 40), nextId);
    expect(later.finished).toBe(first);
    expect(later.session.sessionId).not.toBe(first.sessionId);

    const soon = recordListenSample(first, at(40_000 + LISTEN_SESSION_IDLE_MS - 1, 40), nextId);
    expect(soon.finished).toBeNull();
    expect(soon.session.sessionId).toBe(first.sessionId);
  });
});

describe('shouldReportListen', () => {
  it('waits for 30 seconds of real playback, then reports at once', () => {
    expect(shouldReportListen(play(null, 0, 0, 25), 25_000, true)).toBe(false);
    expect(shouldReportListen(play(null, 0, 0, 30), 30_000, false)).toBe(true);
  });

  it('throttles heartbeats to one per interval unless flushing', () => {
    const reported = markListenReported(play(null, 0, 0, 30), 30_000);
    const more = play(reported, 30_000, 30, 30);
    expect(shouldReportListen(more, 30_000 + LISTEN_HEARTBEAT_MS - 1, false)).toBe(false);
    expect(shouldReportListen(more, 30_000 + LISTEN_HEARTBEAT_MS - 1, true)).toBe(true);
    expect(shouldReportListen(more, 30_000 + LISTEN_HEARTBEAT_MS, false)).toBe(true);
  });

  it('never re-sends without new listening', () => {
    const reported = markListenReported(play(null, 0, 0, 40), 40_000);
    expect(shouldReportListen(reported, 40_000 + 10 * LISTEN_HEARTBEAT_MS, true)).toBe(false);
  });
});

describe('listen payload', () => {
  const deviceId = '5f1c2e7a-8d4b-4c3e-9a1f-2b3c4d5e6f70';

  it('round-trips through the API schema', () => {
    const session = { ...play(null, 0, 0, 45), audioFileId: '22222222-2222-2222-2222-222222222222' };
    const payload = toListenPayload(session, deviceId, 'pwa');
    expect(listenPayloadSchema.parse(payload)).toEqual({
      sessionId: session.sessionId,
      lessonId: LESSON,
      audioFileId: '22222222-2222-2222-2222-222222222222',
      listenedSeconds: 45,
      deviceId,
      source: 'pwa',
    });
  });

  it.each([
    ['below the listen threshold', { listenedSeconds: 29 }],
    ['fractional seconds', { listenedSeconds: 40.5 }],
    ['absurd duration', { listenedSeconds: 13 * 60 * 60 }],
    ['unknown source', { source: 'car' }],
    ['non-uuid lesson', { lessonId: 'lesson-1' }],
    ['device id with markup', { deviceId: '<script>alert(1)</script>' }],
    ['too-short device id', { deviceId: 'abc' }],
  ])('rejects %s', (_label, override) => {
    const valid = toListenPayload(play(null, 0, 0, 40), deviceId, 'web');
    expect(listenPayloadSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});
