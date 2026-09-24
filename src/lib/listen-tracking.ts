/**
 * Pure bookkeeping for listen statistics (no browser APIs): which playback
 * counts as listening, when a play session starts, and when the player should
 * report it to POST /api/listen. Side effects live in listen-tracker.ts.
 */

/** A track counts as listened once this many seconds of it really played. */
export const LISTEN_MIN_SECONDS = 30;
/** Regular heartbeats are sent at most this often while playing. */
export const LISTEN_HEARTBEAT_MS = 60_000;
/** Playback is sampled at most this often (plus on every status change). */
export const LISTEN_SAMPLE_INTERVAL_MS = 5_000;
/** Coming back to the same track after this long starts a new listen. */
export const LISTEN_SESSION_IDLE_MS = 30 * 60_000;
/** Highest playback speed the player offers. */
const MAX_PLAYBACK_RATE = 2;
/** Tolerance for media-time jitter between samples. */
const SAMPLE_SLACK_SECONDS = 2;
/** When an interval contained a seek, count at most this much of it. */
const SEEK_INTERVAL_MAX_SECONDS = LISTEN_SAMPLE_INTERVAL_MS / 1000;

export const LISTEN_SOURCES = ['web', 'pwa', 'offline', 'driving'] as const;
export type ListenSource = (typeof LISTEN_SOURCES)[number];

/** Body of POST /api/listen. */
export interface ListenPayload {
  sessionId: string;
  lessonId: string;
  audioFileId?: string;
  listenedSeconds: number;
  deviceId: string;
  source: ListenSource;
}

export interface ListenSample {
  trackKey: string;
  lessonId: string;
  audioFileId: string | null;
  /** Media position in seconds. */
  position: number;
  /** Whether the element is actually playing at this moment. */
  playing: boolean;
  nowMs: number;
}

export interface ListenSession {
  sessionId: string;
  trackKey: string;
  lessonId: string;
  audioFileId: string | null;
  /** Seconds of the recording that really played (fractional). */
  listenedSeconds: number;
  lastPosition: number;
  lastPlaying: boolean;
  lastSampleAt: number;
  /** Whole seconds already reported to the server. */
  reportedSeconds: number;
  lastReportAt: number | null;
}

/**
 * Seconds of listening between two samples. Only intervals that started while
 * playing count. Normally that is the media time that advanced; when the
 * position jumped (seek/skip) the interval counts as wall time, capped.
 */
function listenedBetween(session: ListenSession, sample: ListenSample): number {
  if (!session.lastPlaying) return 0;
  const wallSeconds = Math.max(0, (sample.nowMs - session.lastSampleAt) / 1000);
  const mediaSeconds = sample.position - session.lastPosition;
  if (mediaSeconds >= 0 && mediaSeconds <= wallSeconds * MAX_PLAYBACK_RATE + SAMPLE_SLACK_SECONDS) {
    return mediaSeconds;
  }
  return Math.min(wallSeconds, SEEK_INTERVAL_MAX_SECONDS);
}

/**
 * Folds one playback sample into the current session. A different track, or
 * the same track after a long idle gap, starts a new session; the previous one
 * is returned as `finished` so its unreported tail can be flushed.
 */
export function recordListenSample(
  session: ListenSession | null,
  sample: ListenSample,
  createSessionId: () => string,
): { session: ListenSession; finished: ListenSession | null } {
  if (
    !session ||
    session.trackKey !== sample.trackKey ||
    sample.nowMs - session.lastSampleAt > LISTEN_SESSION_IDLE_MS
  ) {
    const started: ListenSession = {
      sessionId: createSessionId(),
      trackKey: sample.trackKey,
      lessonId: sample.lessonId,
      audioFileId: sample.audioFileId,
      listenedSeconds: 0,
      lastPosition: sample.position,
      lastPlaying: sample.playing,
      lastSampleAt: sample.nowMs,
      reportedSeconds: 0,
      lastReportAt: null,
    };
    return { session: started, finished: session };
  }
  return {
    session: {
      ...session,
      listenedSeconds: session.listenedSeconds + listenedBetween(session, sample),
      lastPosition: sample.position,
      lastPlaying: sample.playing,
      lastSampleAt: sample.nowMs,
    },
    finished: null,
  };
}

/**
 * Whether the session should be reported now: never before the 30-second
 * threshold or without new listening; the first report goes out as soon as
 * the threshold is reached; afterwards at most once per heartbeat interval,
 * unless `flush` (pause, page hide, track change) asks for the tail now.
 */
export function shouldReportListen(session: ListenSession, nowMs: number, flush: boolean): boolean {
  const listened = Math.floor(session.listenedSeconds);
  if (listened < LISTEN_MIN_SECONDS || listened <= session.reportedSeconds) return false;
  if (session.lastReportAt === null || flush) return true;
  return nowMs - session.lastReportAt >= LISTEN_HEARTBEAT_MS;
}

export function markListenReported(session: ListenSession, nowMs: number): ListenSession {
  return { ...session, reportedSeconds: Math.floor(session.listenedSeconds), lastReportAt: nowMs };
}

export function toListenPayload(session: ListenSession, deviceId: string, source: ListenSource): ListenPayload {
  return {
    sessionId: session.sessionId,
    lessonId: session.lessonId,
    ...(session.audioFileId ? { audioFileId: session.audioFileId } : {}),
    listenedSeconds: Math.floor(session.listenedSeconds),
    deviceId,
    source,
  };
}
