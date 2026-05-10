export type NativeAudioLifecycleEvent =
  | "pause"
  | "playing"
  | "waiting"
  | "stalled"
  | "suspend"
  | "error"
  | "ended"
  | "emptied"
  | "visibility-visible"
  | "visibility-hidden"
  | "page-show";

export type AudioRecoveryAction =
  | "none"
  | "wait-for-cooldown"
  | "resume-current-track"
  | "reload-current-track"
  | "needs-user-gesture"
  | "mark-ended"
  | "mark-paused";

export interface AudioLifecycleSnapshot {
  intentPlaying: boolean;
  engineLoaded: boolean;
  enginePlaying: boolean;
  nativePaused: boolean;
  nativeEnded: boolean;
  nativeErrored: boolean;
  documentVisible: boolean;
  online: boolean;
  currentTime: number;
  duration: number;
  userPausedAt: number | null;
  sameTrack: boolean;
  recoveryAttemptsForTrack: number;
  msSinceLastRecovery: number;
  playBlockedByBrowser: boolean;
}

const RECOVERY_COOLDOWN_MS = 2000;
const MAX_RECOVERY_ATTEMPTS_PER_TRACK = 3;
const NEAR_END_SECONDS = 2;

function isNearEnd(currentTime: number, duration: number) {
  return duration > 0 && duration - currentTime <= NEAR_END_SECONDS;
}

export function getAudioRecoveryAction(
  eventName: NativeAudioLifecycleEvent,
  snapshot: AudioLifecycleSnapshot,
): AudioRecoveryAction {
  if (!snapshot.intentPlaying) return "none";
  if (!snapshot.sameTrack) return "none";
  if (snapshot.playBlockedByBrowser) return "needs-user-gesture";
  if (snapshot.recoveryAttemptsForTrack >= MAX_RECOVERY_ATTEMPTS_PER_TRACK) {
    return "needs-user-gesture";
  }
  if (
    snapshot.msSinceLastRecovery >= 0 &&
    snapshot.msSinceLastRecovery < RECOVERY_COOLDOWN_MS
  ) {
    return "wait-for-cooldown";
  }

  if (eventName === "ended" || snapshot.nativeEnded) {
    return isNearEnd(snapshot.currentTime, snapshot.duration)
      ? "mark-ended"
      : "resume-current-track";
  }

  if (
    snapshot.nativeErrored ||
    eventName === "error" ||
    eventName === "emptied"
  ) {
    return "reload-current-track";
  }

  if (
    eventName === "pause" &&
    !snapshot.documentVisible &&
    snapshot.nativePaused
  ) {
    return "none";
  }

  if (
    !snapshot.documentVisible &&
    snapshot.enginePlaying &&
    !snapshot.nativePaused
  ) {
    return "none";
  }

  if (!snapshot.engineLoaded) return "reload-current-track";

  if (
    eventName === "pause" ||
    eventName === "waiting" ||
    eventName === "stalled" ||
    eventName === "suspend" ||
    eventName === "visibility-visible" ||
    eventName === "page-show"
  ) {
    if (!snapshot.enginePlaying || snapshot.nativePaused) {
      return "resume-current-track";
    }
  }

  return "none";
}
