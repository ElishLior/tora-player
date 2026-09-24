import type { AudioEngineStatus } from "@/lib/audio-engine";

/**
 * How the controller reacts when the audio element changes state.
 * - sync-playing: the element started on its own (headset, OS) → reflect it
 * - sync-paused: the element stopped on its own (call, Siri, unplugged
 *   headphones, OS interruption) → reflect it; never auto-resume
 * - advance: the track finished → next queue item or stop
 * - retry: a transient failure (network error, truncated stream) → reload at
 *   the same position
 * - fail: retries exhausted or offline → stop and tell the listener
 */
export type PlaybackReaction =
  | "none"
  | "sync-playing"
  | "sync-paused"
  | "advance"
  | "retry"
  | "fail";

export interface PlaybackStatusContext {
  status: AudioEngineStatus;
  /** The listener asked for playback. */
  intentPlaying: boolean;
  position: number;
  duration: number;
  online: boolean;
  recoveryAttempts: number;
}

export const MAX_RECOVERY_ATTEMPTS = 3;
// An "ended" further than this from the known duration is a cut-off stream.
const NEAR_END_SECONDS = 2;

export function getPlaybackReaction(context: PlaybackStatusContext): PlaybackReaction {
  const canRetry =
    context.online && context.recoveryAttempts < MAX_RECOVERY_ATTEMPTS;

  switch (context.status) {
    case "playing":
      return context.intentPlaying ? "none" : "sync-playing";
    case "paused":
      return context.intentPlaying ? "sync-paused" : "none";
    case "ended": {
      if (!context.intentPlaying) return "none";
      const cutOff =
        context.duration > 0 &&
        context.duration - context.position > NEAR_END_SECONDS;
      if (!cutOff) return "advance";
      return canRetry ? "retry" : "fail";
    }
    case "error":
      if (!context.intentPlaying) return "none";
      return canRetry ? "retry" : "fail";
    default:
      return "none";
  }
}

export function getRetryDelayMs(attempt: number): number {
  return 1000 * 2 ** Math.max(0, attempt - 1);
}
