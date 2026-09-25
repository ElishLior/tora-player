import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { useProgressStore } from "@/stores/progress-store";
import { audioEngine } from "./audio-engine";
import {
  nextTrackOrSkip,
  pause,
  play,
  playTrack,
  startAudioController,
} from "./audio-controller";
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

  it("skips inside the lesson when car 'next' has no next lesson", () => {
    playTrack(makeTrack("a"));
    becomePlaying();
    element().currentTime = 100;

    nextTrackOrSkip();

    expect(useAudioStore.getState().currentTrack?.id).toBe("a");
    expect(element().currentTime).toBe(130);
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
        return new Promise<string>((resolve) => { resolveOld = resolve; });
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
