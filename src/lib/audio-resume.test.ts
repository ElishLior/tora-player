import { describe, expect, it, vi } from "vitest";
import { planTrackPlayback, resolveTrackSource } from "./audio-resume";
import { getTrackKey, type AudioTrack } from "@/stores/audio-store";

const track: AudioTrack = {
  id: "lesson-1",
  lessonId: "lesson-1",
  audioFileId: "audio-1",
  offlineKey: "lesson-1:audio-1",
  title: "Lesson",
  hebrewTitle: "שיעור",
  audioUrl: "https://account.r2.cloudflarestorage.com/bucket/audio/lesson-1.mp3",
  duration: 3600,
  date: "2026-01-01",
};
const streamUrl = "/api/audio/stream/audio%2Flesson-1.mp3";

describe("planTrackPlayback", () => {
  it("plays the loaded track without seeking, whatever position the UI holds", () => {
    expect(
      planTrackPlayback({
        track,
        loadedTrackKey: getTrackKey(track),
        position: 42,
        downloadedLessonIds: new Set(),
      }),
    ).toEqual({ type: "play-loaded" });
  });

  it("loads a track that is not saved offline right away from the stream", () => {
    expect(
      planTrackPlayback({
        track,
        loadedTrackKey: "another-track",
        position: 42,
        downloadedLessonIds: new Set(["lesson-2"]),
      }),
    ).toEqual({ type: "load", source: streamUrl, startPosition: 42 });
  });

  it("loads an already resolved offline copy right away", () => {
    expect(
      planTrackPlayback({
        track,
        loadedTrackKey: null,
        position: 0,
        cachedSource: "blob:lesson-1",
        downloadedLessonIds: new Set(["lesson-1"]),
      }),
    ).toEqual({ type: "load", source: "blob:lesson-1", startPosition: 0 });
  });

  it("looks up the offline copy when the lesson may be saved or downloads are not known yet", () => {
    for (const downloadedLessonIds of [new Set(["lesson-1"]), null]) {
      expect(
        planTrackPlayback({ track, loadedTrackKey: null, position: 7, downloadedLessonIds }),
      ).toEqual({ type: "resolve", startPosition: 7 });
    }
  });
});

describe("resolveTrackSource", () => {
  it("prefers the offline blob URL", async () => {
    await expect(resolveTrackSource(track, async () => "blob:lesson-1")).resolves.toBe(
      "blob:lesson-1",
    );
  });

  it("falls back to the stream URL when there is no offline copy or the lookup fails", async () => {
    await expect(resolveTrackSource(track, async () => null)).resolves.toBe(streamUrl);
    await expect(
      resolveTrackSource(track, vi.fn(async () => Promise.reject(new Error("IndexedDB blocked")))),
    ).resolves.toBe(streamUrl);
  });
});
