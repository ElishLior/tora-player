import { describe, expect, it } from "vitest";
import {
  MAX_RECOVERY_ATTEMPTS,
  getPlaybackReaction,
  getRetryDelayMs,
  type PlaybackStatusContext,
} from "./audio-lifecycle";

const context: PlaybackStatusContext = {
  status: "playing",
  intentPlaying: true,
  position: 120,
  duration: 3600,
  online: true,
  recoveryAttempts: 0,
};

describe("getPlaybackReaction", () => {
  it("reflects playback started outside the app (headset, lock screen, OS)", () => {
    expect(getPlaybackReaction({ ...context, intentPlaying: false })).toBe("sync-playing");
    expect(getPlaybackReaction(context)).toBe("none");
  });

  it("reflects an interruption as paused instead of fighting it", () => {
    expect(getPlaybackReaction({ ...context, status: "paused" })).toBe("sync-paused");
    expect(getPlaybackReaction({ ...context, status: "paused", intentPlaying: false })).toBe("none");
  });

  it("waits while buffering", () => {
    expect(getPlaybackReaction({ ...context, status: "buffering" })).toBe("none");
  });

  it("advances after a natural end", () => {
    expect(getPlaybackReaction({ ...context, status: "ended", position: 3599 })).toBe("advance");
  });

  it("does not advance when the end was reached by seeking while paused", () => {
    expect(
      getPlaybackReaction({ ...context, status: "ended", position: 3600, intentPlaying: false }),
    ).toBe("none");
  });

  it("retries a stream that ended long before its duration", () => {
    expect(getPlaybackReaction({ ...context, status: "ended", position: 1200 })).toBe("retry");
    expect(
      getPlaybackReaction({
        ...context,
        status: "ended",
        position: 1200,
        recoveryAttempts: MAX_RECOVERY_ATTEMPTS,
      }),
    ).toBe("fail");
  });

  it("retries media errors only while online and under the attempt limit", () => {
    expect(getPlaybackReaction({ ...context, status: "error" })).toBe("retry");
    expect(getPlaybackReaction({ ...context, status: "error", online: false })).toBe("fail");
    expect(
      getPlaybackReaction({ ...context, status: "error", recoveryAttempts: MAX_RECOVERY_ATTEMPTS }),
    ).toBe("fail");
  });

  it("ignores errors of a track nobody is trying to play", () => {
    expect(getPlaybackReaction({ ...context, status: "error", intentPlaying: false })).toBe("none");
  });
});

describe("getRetryDelayMs", () => {
  it("backs off exponentially", () => {
    expect([1, 2, 3].map(getRetryDelayMs)).toEqual([1000, 2000, 4000]);
  });
});
