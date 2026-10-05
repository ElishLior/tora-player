import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { useProgressStore } from "@/stores/progress-store";
import { audioEngine } from "./audio-engine";
import {
  nextTrackOrSkip,
  pause,
  play,
  playTrack,
  skipBackward,
  skipForward,
  startAudioController,
} from "./audio-controller";
import { getResumePoint } from "./lesson-progress";
import { playLesson } from "./play-lesson";

// Browser globals the controller and its stores touch at import time.
const { elements, getOfflineAudioUrl, getDownloadedLessons } = vi.hoisted(() => {
  class FakeAudioElement {
    paused = true;
    ended = false;
    error: { code: number } | null = null;
    readyState = 0;
    currentTime = 0;
    duration = Number.NaN;
    playbackRate = 1;
    defaultPlaybackRate = 1;
    volume = 1;
    preload = "";
    playResult: Promise<void> = Promise.resolve();
    private currentSrc = "";
    private listeners = new Map<string, Set<() => void>>();
    get src() {
      return this.currentSrc;
    }
    set src(value: string) {
      this.currentSrc = value;
      this.reset();
    }
    load = vi.fn(() => this.reset());
    play = vi.fn(() => {
      this.paused = false;
      return this.playResult;
    });
    pause = vi.fn(() => {
      this.paused = true;
    });
    addEventListener(type: string, listener: () => void) {
      const set = this.listeners.get(type) ?? new Set();
      set.add(listener);
      this.listeners.set(type, set);
    }
    removeEventListener(type: string, listener: () => void) {
      this.listeners.get(type)?.delete(listener);
    }
    removeAttribute() {
      this.currentSrc = "";
    }
    emit(type: string) {
      this.listeners.get(type)?.forEach((listener) => listener());
    }
    private reset() {
      this.paused = true;
      this.ended = false;
      this.error = null;
      this.readyState = 0;
      this.currentTime = 0;
      this.duration = Number.NaN;
    }
  }
  const elements: FakeAudioElement[] = [];
  const noop = () => {};
  const storage = new Map<string, string>();
  Object.assign(globalThis, {
    Audio: function Audio() {
      const element = new FakeAudioElement();
      elements.push(element);
      return element;
    },
    window: {
      addEventListener: noop,
      removeEventListener: noop,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      location: { origin: "https://tora.test" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
    document: { addEventListener: noop, removeEventListener: noop, visibilityState: "hidden" },
    fetch: () => Promise.resolve({ status: 401 }),
  });
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  return {
    elements,
    getOfflineAudioUrl: vi.fn<(lessonId: string) => Promise<string | null>>(async () => null),
    getDownloadedLessons: vi.fn(async () => [] as { lessonId: string }[]),
  };
});

vi.mock("@/lib/offline-storage", () => ({
  getDownloadedLessons,
  getOfflineAudioUrl,
  revokeOfflineAudioUrl: vi.fn(),
  getOfflineKey: (lessonId: string, file: { offlineKey?: string }) => file.offlineKey ?? lessonId,
}));

function makeTrack(id: string): AudioTrack {
  return {
    id,
    lessonId: id,
    title: id,
    hebrewTitle: id,
    audioUrl: `/api/audio/stream/${id}.mp3`,
    duration: 3600,
    date: "2026-01-01",
  };
}

function makeParts(lessonId: string, count: number): AudioTrack[] {
  return Array.from({ length: count }, (_, index) => ({
    ...makeTrack(lessonId),
    audioFileId: `${lessonId}-part-${index + 1}`,
    audioUrl: `/api/audio/stream/${lessonId}-${index + 1}.mp3`,
    partIndex: index,
    partCount: count,
  }));
}

function endCurrentFile() {
  element().currentTime = element().duration;
  element().ended = true;
  element().paused = true;
  element().emit("ended");
}

const element = () => elements[0];

function becomePlaying(duration = 3600) {
  element().duration = duration;
  element().readyState = 4;
  element().emit("loadedmetadata");
  element().emit("canplay");
  element().emit("playing");
}

function useRetryClock() {
  vi.useFakeTimers();
  vi.spyOn(window, "setTimeout").mockImplementation(((callback: () => void, delay: number) =>
    globalThis.setTimeout(callback, delay)) as unknown as typeof window.setTimeout);
  vi.spyOn(window, "clearTimeout").mockImplementation((id) => globalThis.clearTimeout(id));
}

let stop: () => void;

describe("audio controller", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    stop = startAudioController();
    await Promise.resolve(); // downloaded-lessons index
    await Promise.resolve();
  });

  afterEach(() => {
    stop();
    pause();
    useAudioStore.setState({ currentTrack: null, queue: [], queueIndex: -1, sleepTimer: null });
    useProgressStore.setState({ progressMap: {} });
    vi.restoreAllMocks();
    getDownloadedLessons.mockResolvedValue([]);
    getOfflineAudioUrl.mockResolvedValue(null);
    audioEngine.unload();
    element()?.emit("emptied");
    vi.useRealTimers();
  });

  it("starts a tapped lesson inside the tap (no await before play)", () => {
    playTrack(makeTrack("a"));

    expect(element().src).toBe("/api/audio/stream/a.mp3");
    expect(element().play).toHaveBeenCalledTimes(1);
  });

  it("resumes after an interruption from the real position, not a stale one", () => {
    playTrack(makeTrack("a"));
    becomePlaying();
    // Listened with the screen locked; then a phone call paused the element.
    element().currentTime = 1800;
    element().paused = true;
    element().emit("pause");
    expect(useAudioStore.getState().isPlaying).toBe(false);
    useAudioStore.setState({ currentTime: 120 }); // stale UI position

    play(); // lock-screen / car play button

    expect(element().play).toHaveBeenCalledTimes(2);
    expect(element().currentTime).toBe(1800);
  });

  it("keeps successful explicit resume uninterrupted when an old error retry is due", () => {
    useRetryClock();
    playTrack(makeTrack("a"));
    becomePlaying();
    element().currentTime = 100;
    element().error = { code: 2 };
    element().emit("error");

    pause();
    play();
    becomePlaying();
    expect(element().currentTime).toBe(100);
    element().currentTime = 105;
    const loads = element().load.mock.calls.length;
    const plays = element().play.mock.calls.length;

    vi.advanceTimersByTime(1000);

    expect(element().load).toHaveBeenCalledTimes(loads);
    expect(element().play).toHaveBeenCalledTimes(plays);
    expect(element().currentTime).toBe(105);
    expect(element().paused).toBe(false);
    expect(useAudioStore.getState().currentTrack?.id).toBe("a");
    expect(elements).toHaveLength(1);
  });

  it("still retries errors at the same position with bounded backoff", () => {
    useRetryClock();
    playTrack(makeTrack("retry-backoff"));
    becomePlaying();
    element().currentTime = 100;

    for (const delay of [1000, 2000, 4000]) {
      element().error = { code: 2 };
      element().emit("error");
      expect(useAudioStore.getState().playbackIssue).toBe("retrying");
      const loads = element().load.mock.calls.length;
      const plays = element().play.mock.calls.length;

      vi.advanceTimersByTime(delay - 1);
      expect(element().load).toHaveBeenCalledTimes(loads);
      vi.advanceTimersByTime(1);
      expect(element().load).toHaveBeenCalledTimes(loads + 1);
      expect(element().play).toHaveBeenCalledTimes(plays + 1);
      becomePlaying();
      expect(element().currentTime).toBe(100);
    }

    element().error = { code: 2 };
    element().emit("error");
    expect(useAudioStore.getState().playbackIssue).toBe("failed");
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });

  it("does not resume paused intent when an error retry is due", () => {
    useRetryClock();
    playTrack(makeTrack("a"));
    becomePlaying();
    element().currentTime = 100;
    element().error = { code: 2 };
    element().emit("error");
    pause();
    const loads = element().load.mock.calls.length;
    const plays = element().play.mock.calls.length;

    vi.advanceTimersByTime(1000);

    expect(element().load).toHaveBeenCalledTimes(loads);
    expect(element().play).toHaveBeenCalledTimes(plays);
    expect(element().paused).toBe(true);
    expect(useAudioStore.getState().isPlaying).toBe(false);
  });

  it("does not retry the previous track after a track switch", () => {
    useRetryClock();
    playTrack(makeTrack("a"));
    becomePlaying();
    element().error = { code: 2 };
    element().emit("error");
    playTrack(makeTrack("b"));
    becomePlaying();
    element().currentTime = 200;
    const loads = element().load.mock.calls.length;
    const plays = element().play.mock.calls.length;

    vi.advanceTimersByTime(1000);

    expect(element().load).toHaveBeenCalledTimes(loads);
    expect(element().play).toHaveBeenCalledTimes(plays);
    expect(element().currentTime).toBe(200);
    expect(useAudioStore.getState().currentTrack?.id).toBe("b");
  });

  it("starts the next queued lesson from the ended event itself", () => {
    const tracks = [makeTrack("a"), makeTrack("b")];
    playTrack(tracks[0], { queue: tracks, queueIndex: 0 });
    becomePlaying(600);

    element().currentTime = 600;
    element().ended = true;
    element().paused = true;
    element().emit("ended");

    expect(useAudioStore.getState().currentTrack?.id).toBe("b");
    expect(element().src).toBe("/api/audio/stream/b.mp3");
    expect(element().paused).toBe(false);
  });

  it.each([
    { direction: "backward", action: skipBackward, start: 100, expected: 85 },
    { direction: "forward", action: skipForward, start: 100, expected: 115 },
    { direction: "backward at the start", action: skipBackward, start: 10, expected: 0 },
    { direction: "forward at the end", action: skipForward, start: 590, expected: 600 },
  ])("skips 15 seconds $direction from the live position within track bounds", ({ action, start, expected }) => {
    playTrack(makeTrack("a"));
    becomePlaying(600);
    // The live element can be ahead of the last store update in the background.
    useAudioStore.getState().setCurrentTime(50);
    element().currentTime = start;

    action();

    expect(element().currentTime).toBe(expected);
    expect(useAudioStore.getState().currentTime).toBe(expected);
    expect(useAudioStore.getState().resumePosition).toBe(expected);
    expect(useAudioStore.getState().currentTrack?.id).toBe("a");
  });

  it("skips 15 seconds inside the lesson when car 'next' has no next lesson", () => {
    playTrack(makeTrack("a"));
    becomePlaying();
    element().currentTime = 100;

    nextTrackOrSkip();

    expect(useAudioStore.getState().currentTrack?.id).toBe("a");
    expect(element().currentTime).toBe(115);
  });

  it("shows play (not a stuck pause) when the browser blocks playback", async () => {
    playTrack(makeTrack("a"));
    element().playResult = Promise.reject({ name: "NotAllowedError" });
    play();
    await Promise.resolve();
    await Promise.resolve();

    const state = useAudioStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.playbackIssue).toBe("blocked");
    element().playResult = Promise.resolve();
  });

  it("marks a multi-part lesson heard only when its last part ends", () => {
    const parts = makeParts("lesson", 2);
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(600);

    endCurrentFile();

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({
      audioFileId: "lesson-part-1",
      completed: false,
    });
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");

    becomePlaying(600);
    endCurrentFile();

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({
      audioFileId: "lesson-part-2",
      completed: true,
    });
  });

  it("continues a lesson in the part and at the position where it was left", () => {
    useProgressStore.getState().saveProgress({
      lessonId: "lesson",
      audioFileId: "lesson-part-2",
      position: 300,
      completed: false,
    });

    playLesson(makeParts("lesson", 3));

    const state = useAudioStore.getState();
    expect(state.currentTrack?.audioFileId).toBe("lesson-part-2");
    expect(state.queue).toHaveLength(3);
    expect(state.currentTime).toBe(300);
    expect(element().src).toBe("/api/audio/stream/lesson-2.mp3");
  });

  it("keeps the live element position when playing the loaded lesson again from an offline listing", () => {
    const parts = makeParts("lesson", 3);
    playTrack(parts[1], { queue: parts, queueIndex: 1 });
    becomePlaying(900);
    element().currentTime = 637;
    useAudioStore.getState().setCurrentTime(300);
    useProgressStore.getState().saveProgress({
      lessonId: "lesson",
      audioFileId: "lesson-part-1",
      position: 300,
      completed: false,
    });
    const calls = element().play.mock.calls.length;

    playLesson(parts.map((part) => ({ ...part, offlineKey: part.audioFileId, duration: 0 })));

    expect(useAudioStore.getState().queueIndex).toBe(1);
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");
    expect(useAudioStore.getState().currentTime).toBe(637);
    expect(element().currentTime).toBe(637);
    expect(element().src).toBe("/api/audio/stream/lesson-2.mp3");
    expect(element().play).toHaveBeenCalledTimes(calls + 1);
  });

  it("starts a completed lesson from its first part when selected again", () => {
    const parts = makeParts("heard-lesson", 2);
    playTrack(parts[1], { queue: parts, queueIndex: 1 });
    becomePlaying(600);
    endCurrentFile();
    expect(useProgressStore.getState().progressMap["heard-lesson"].completed).toBe(true);

    playLesson(parts);

    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("heard-lesson-part-1");
    expect(useAudioStore.getState().queueIndex).toBe(0);
    expect(element().src).toBe("/api/audio/stream/heard-lesson-1.mp3");
  });

  it("stops at the end of the part when the sleep timer says so", () => {
    const parts = makeParts("lesson", 2);
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(600);
    useAudioStore.getState().setSleepTimer({ kind: "end-of-part" });

    endCurrentFile();

    const state = useAudioStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentTrack?.audioFileId).toBe("lesson-part-1");
    expect(state.sleepTimer).toBeNull();
  });

  it("advances to the next queued part on Play after an end-of-part timer stops it", () => {
    const parts = makeParts("lesson", 2);
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(600);
    useAudioStore.getState().setSleepTimer({ kind: "end-of-part" });
    endCurrentFile();

    play();

    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");
    expect(element().src).toBe("/api/audio/stream/lesson-2.mp3");
    expect(element().paused).toBe(false);
    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({
      audioFileId: "lesson-part-1",
      completed: false,
    });
  });

  it("plays through parts but stops at the end of the lesson", () => {
    const parts = makeParts("lesson", 2);
    const next = makeTrack("next-lesson");
    playTrack(parts[0], { queue: [...parts, next], queueIndex: 0 });
    becomePlaying(600);
    useAudioStore.getState().setSleepTimer({ kind: "end-of-lesson" });

    endCurrentFile();
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");

    becomePlaying(600);
    endCurrentFile();
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().currentTrack?.id).toBe("lesson");
  });

  it("stops an end-of-lesson timer after the available files of an older offline lesson", () => {
    const parts = makeParts("older", 2).map((track) => ({ ...track, partIndex: undefined, partCount: undefined }));
    const next = makeTrack("another-lesson");
    playTrack(parts[0], { queue: [...parts, next], queueIndex: 0 });
    becomePlaying(600);
    useAudioStore.getState().setSleepTimer({ kind: "end-of-lesson" });
    endCurrentFile();
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("older-part-2");

    becomePlaying(600);
    endCurrentFile();
    const state = useAudioStore.getState();
    expect(state.currentTrack?.audioFileId).toBe("older-part-2");
    expect(state.isPlaying).toBe(false);
    expect(state.sleepTimer).toBeNull();
    expect(useProgressStore.getState().progressMap.older.completed).toBe(false);
  });

  it("does not auto-advance on Play after an end-of-lesson timer stops at the last part", () => {
    const parts = makeParts("lesson", 2);
    const next = makeTrack("next-lesson");
    playTrack(parts[1], { queue: [...parts, next], queueIndex: 1 });
    becomePlaying(600);
    useAudioStore.getState().setSleepTimer({ kind: "end-of-lesson" });
    endCurrentFile();

    play();

    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");
    expect(useAudioStore.getState().queueIndex).toBe(1);
  });

  it("pauses when a minutes sleep timer runs out during playback", () => {
    playTrack(makeTrack("a"));
    becomePlaying();
    const now = Date.now();
    useAudioStore.getState().setSleepTimer({ kind: "minutes", endsAt: now + 15 * 60_000 });
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 15 * 60_000 + 1);

    element().currentTime = 950;
    element().emit("timeupdate");
    clock.mockRestore();

    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(element().paused).toBe(true);
    expect(useAudioStore.getState().sleepTimer).toBeNull();
  });

  it("stops at a part boundary when the minutes deadline has passed", () => {
    const parts = makeParts("lesson", 2);
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(600);
    const now = Date.now();
    useAudioStore.getState().setSleepTimer({ kind: "minutes", endsAt: now + 60_000 });
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 60_000);

    endCurrentFile();

    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-1");
    expect(useAudioStore.getState().sleepTimer).toBeNull();
    play();
    expect(useAudioStore.getState().currentTrack?.audioFileId).toBe("lesson-part-2");
    clock.mockRestore();
  });

  it("expires a minutes timer at its wall-clock deadline even while buffering without timeupdate", () => {
    const scheduled: Array<() => void> = [];
    vi.spyOn(window, "setTimeout").mockImplementation(((callback: () => void) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof window.setTimeout);
    playTrack(makeTrack("a"));
    becomePlaying();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    useAudioStore.getState().setSleepTimer({ kind: "minutes", endsAt: now + 60_000 });
    element().readyState = 0;
    element().emit("waiting");

    clock.mockReturnValue(now + 60_000);
    scheduled.at(-1)!();

    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().sleepTimer).toBeNull();
    expect(element().paused).toBe(true);
    play();
    expect(useAudioStore.getState().isPlaying).toBe(true);
    expect(element().paused).toBe(false);
  });

  it("does not discard an overdue timer when buffering transitions to playing", () => {
    playTrack(makeTrack("a"));
    becomePlaying();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    useAudioStore.getState().setSleepTimer({ kind: "minutes", endsAt: now + 60_000 });
    element().readyState = 0;
    element().emit("waiting");

    clock.mockReturnValue(now + 60_000);
    element().readyState = 4;
    element().emit("playing");

    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().sleepTimer).toBeNull();
    expect(element().paused).toBe(true);
  });

  it("keeps the same minutes deadline across a manual pause and resume", () => {
    const scheduled: Array<() => void> = [];
    vi.spyOn(window, "setTimeout").mockImplementation(((callback: () => void) => {
      scheduled.push(callback);
      return scheduled.length;
    }) as typeof window.setTimeout);
    playTrack(makeTrack("a"));
    becomePlaying();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const timer = { kind: "minutes" as const, endsAt: now + 60_000 };
    useAudioStore.getState().setSleepTimer(timer);

    clock.mockReturnValue(now + 30_000);
    pause();
    play();
    element().emit("playing");
    expect(useAudioStore.getState().sleepTimer).toBe(timer);

    clock.mockReturnValue(timer.endsAt);
    scheduled.at(-1)!();
    expect(useAudioStore.getState().isPlaying).toBe(false);
    expect(useAudioStore.getState().sleepTimer).toBeNull();
  });

  it("prefetches a newly queued offline file and ignores a stale prefetch after a queue edit", async () => {
    getDownloadedLessons.mockResolvedValue([{ lessonId: "b" }, { lessonId: "c" }]);
    stop();
    stop = startAudioController();
    await Promise.resolve();
    const a = makeTrack("a");
    const b = makeTrack("b");
    const c = makeTrack("c");
    let resolveOld!: (url: string) => void;
    getOfflineAudioUrl.mockImplementation(async (lessonId) => {
      if (lessonId === "b" && !resolveOld) {
        return new Promise<string>((resolve) => {
          resolveOld = resolve;
        });
      }
      return lessonId === "c" ? "blob:c" : "blob:new-b";
    });
    playTrack(a, { queue: [a, b], queueIndex: 0 });
    becomePlaying(600);
    expect(resolveOld).toBeTypeOf("function");

    useAudioStore.getState().removeFromQueue(1);
    useAudioStore.getState().playNext([c]);
    await Promise.resolve();
    await Promise.resolve();
    resolveOld("blob:old-b");
    await Promise.resolve();

    endCurrentFile();
    expect(element().src).toBe("blob:c");
    expect(element().paused).toBe(false);

    useAudioStore.getState().playNext([b]);
    await Promise.resolve();
    await Promise.resolve();
    becomePlaying(600);
    endCurrentFile();
    expect(element().src).toBe("blob:new-b");
  });

  it("saves observed part duration with progress even when its listed duration is unknown", () => {
    const [part] = makeParts("lesson", 1).map((track) => ({ ...track, duration: 0 }));
    playTrack(part);
    becomePlaying(540);
    element().currentTime = 300;
    element().emit("timeupdate");
    element().paused = true;
    element().emit("pause");

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({
      audioFileId: "lesson-part-1",
      position: 300,
      duration: 540,
      completed: false,
    });
  });
});

describe("audio controller duration evidence", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    stop = startAudioController();
    await Promise.resolve();
    await Promise.resolve();
  });

  afterEach(() => {
    stop();
    pause();
    useAudioStore.setState({ currentTrack: null, queue: [], queueIndex: -1, sleepTimer: null });
    useProgressStore.setState({ progressMap: {} });
    vi.restoreAllMocks();
    getDownloadedLessons.mockResolvedValue([]);
    getOfflineAudioUrl.mockResolvedValue(null);
    audioEngine.unload();
    element()?.emit("emptied");
    vi.useRealTimers();
  });

  /** Final part of a two-part lesson: catalog 3819 s, like the 25 Sep 2026 lesson. */
  function playFinalPart(catalogDuration: number) {
    const parts = makeParts("lesson", 2).map((part) => ({ ...part, duration: catalogDuration }));
    playTrack(parts[1], { queue: parts, queueIndex: 1 });
  }

  function listenTo(position: number) {
    element().currentTime = position;
    element().emit("timeupdate");
    element().paused = true;
    element().emit("pause");
  }

  it("does not mark the lesson heard when the browser under-reports the length and the listener pauses before the real last minute", () => {
    playFinalPart(3819);
    becomePlaying(3712.2); // desktop WebKit measured 3712.2 for the real 3819.05 s file
    listenTo(3655); // inside the last minute of the estimate, 164 s before the real end

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({ position: 3655, completed: false });
  });

  it("never jumps backwards on a forward skip after playback ran past the browser's short length", () => {
    playFinalPart(3819);
    becomePlaying(3712.2);
    element().currentTime = 3750; // still playing, 38 s past the browser's estimate

    skipForward();
    expect(element().currentTime).toBe(3750);

    nextTrackOrSkip(); // car/headset "next" on the last part skips forward too
    expect(element().currentTime).toBe(3750);
  });

  it("shows the longer catalog length while the browser under-reports it", () => {
    playFinalPart(3819);
    becomePlaying(3712.2);

    expect(useAudioStore.getState().duration).toBe(3819);
  });

  it("shows the browser length when the catalog length is unknown", () => {
    playFinalPart(0);
    becomePlaying(540);

    expect(useAudioStore.getState().duration).toBe(540);
  });

  it("never reports a length shorter than the position the audio has reached", () => {
    playFinalPart(0);
    becomePlaying(100); // an estimate that playback has already passed
    element().currentTime = 106;
    element().emit("timeupdate");

    expect(useAudioStore.getState().duration).toBeGreaterThanOrEqual(106);
  });

  it("keeps an unknown length unknown while the audio plays", () => {
    playFinalPart(0);
    becomePlaying(Number.POSITIVE_INFINITY); // streamed file with no usable browser length
    element().currentTime = 42;
    element().emit("timeupdate");

    expect(useAudioStore.getState().duration).toBe(0);
    expect(useAudioStore.getState().currentTime).toBe(42);
  });

  it("opens the next part when an earlier part ends while the browser length is short", () => {
    const parts = makeParts("lesson", 2).map((part) => ({ ...part, duration: 3819 }));
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(3712.2);
    endCurrentFile();

    const progress = useProgressStore.getState().progressMap.lesson;
    expect(getResumePoint(parts, progress)).toEqual({ index: 1, position: 0 });
  });

  it("does not mark the lesson heard by position once playback has passed a length that was too short", () => {
    playFinalPart(0); // catalog unknown: only the browser's estimate exists
    becomePlaying(100);
    listenTo(106);

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({ position: 106, completed: false });
  });

  it("saves the end of a file that ended while paused when the listener then switches lessons", () => {
    const [lastPart] = makeParts("lesson", 1).map((part) => ({ ...part, duration: 600 }));
    playTrack(lastPart);
    becomePlaying(600);
    pause(); // paused just before the end; the checkpoint saved position 0
    element().currentTime = 600;
    element().ended = true;
    element().emit("ended"); // reaction none: no finishTrack, nothing saved
    playTrack(makeTrack("other"));

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({ position: 600, completed: true });
  });

  it("does not skip the switch save for a finished part that was played again", () => {
    const parts = makeParts("lesson", 2).map((part) => ({ ...part, duration: 600 }));
    playTrack(parts[0], { queue: parts, queueIndex: 0 });
    becomePlaying(600);
    endCurrentFile(); // finishTrack runs and advances to part 2
    playTrack(parts[0], { queue: parts, queueIndex: 0 }); // back to part 1
    becomePlaying(600);
    element().currentTime = 200;
    element().emit("timeupdate");
    playTrack(parts[1], { queue: parts, queueIndex: 1 }); // switch away mid-way

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({
      audioFileId: "lesson-part-1",
      position: 200,
    });
  });

  it("keeps the shown length at or above the position when the browser revises its estimate downward", () => {
    playFinalPart(0);
    becomePlaying(100);
    element().currentTime = 106;
    element().emit("timeupdate"); // passed the estimate: length follows the position
    element().duration = 104;
    element().emit("durationchange");

    expect(useAudioStore.getState().duration).toBeGreaterThanOrEqual(106);
  });

  it("still marks the lesson heard inside the last minute when both lengths agree", () => {
    playFinalPart(3819);
    becomePlaying(3819.05);
    listenTo(3780);

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({ completed: true });
  });

  it("marks the lesson heard when the audio really ends, even if the catalog length is longer", () => {
    const parts = makeParts("lesson", 1).map((part) => ({ ...part, duration: 1200 }));
    playTrack(parts[0]);
    becomePlaying(1000);
    endCurrentFile();

    expect(useProgressStore.getState().progressMap.lesson).toMatchObject({ completed: true });
  });
});
