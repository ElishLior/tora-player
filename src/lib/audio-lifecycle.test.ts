import { describe, expect, it } from "vitest";
import {
  getAudioRecoveryAction,
  type AudioLifecycleSnapshot,
} from "./audio-lifecycle";

const baseSnapshot: AudioLifecycleSnapshot = {
  intentPlaying: true,
  engineLoaded: true,
  enginePlaying: false,
  nativePaused: true,
  nativeEnded: false,
  nativeErrored: false,
  documentVisible: true,
  online: true,
  currentTime: 120,
  duration: 3600,
  userPausedAt: null,
  sameTrack: true,
  recoveryAttemptsForTrack: 0,
  msSinceLastRecovery: 5000,
  playBlockedByBrowser: false,
};

describe("getAudioRecoveryAction", () => {
  it("resumes when native audio pauses unexpectedly while play intent remains active", () => {
    expect(getAudioRecoveryAction("pause", baseSnapshot)).toBe(
      "resume-current-track",
    );
  });

  it("does nothing for an explicit user pause", () => {
    expect(
      getAudioRecoveryAction("pause", {
        ...baseSnapshot,
        intentPlaying: false,
        userPausedAt: Date.now(),
      }),
    ).toBe("none");
  });

  it("reloads the current track after a native error while still intending to play", () => {
    expect(
      getAudioRecoveryAction("error", {
        ...baseSnapshot,
        nativeErrored: true,
      }),
    ).toBe("reload-current-track");
  });

  it("marks playback ended when native media ended near duration", () => {
    expect(
      getAudioRecoveryAction("ended", {
        ...baseSnapshot,
        nativePaused: true,
        nativeEnded: true,
        currentTime: 3599,
        duration: 3600,
      }),
    ).toBe("mark-ended");
  });

  it("defers recovery while the document is hidden and the engine still reports playing", () => {
    expect(
      getAudioRecoveryAction("visibility-hidden", {
        ...baseSnapshot,
        documentVisible: false,
        enginePlaying: true,
        nativePaused: false,
      }),
    ).toBe("none");
  });

  it("does not immediately reverse a hidden native pause", () => {
    expect(
      getAudioRecoveryAction("pause", {
        ...baseSnapshot,
        documentVisible: false,
        enginePlaying: false,
        nativePaused: true,
      }),
    ).toBe("none");
  });

  it("does not recover stale native events from another track", () => {
    expect(
      getAudioRecoveryAction("pause", {
        ...baseSnapshot,
        sameTrack: false,
      }),
    ).toBe("none");
  });

  it("uses cooldown instead of repeated immediate resume attempts", () => {
    expect(
      getAudioRecoveryAction("stalled", {
        ...baseSnapshot,
        msSinceLastRecovery: 250,
      }),
    ).toBe("wait-for-cooldown");
  });

  it("asks for user gesture after browser autoplay blocks resume", () => {
    expect(
      getAudioRecoveryAction("pause", {
        ...baseSnapshot,
        playBlockedByBrowser: true,
      }),
    ).toBe("needs-user-gesture");
  });

  it("asks for user gesture after max recovery attempts are exhausted", () => {
    expect(
      getAudioRecoveryAction("waiting", {
        ...baseSnapshot,
        recoveryAttemptsForTrack: 3,
      }),
    ).toBe("needs-user-gesture");
  });
});
