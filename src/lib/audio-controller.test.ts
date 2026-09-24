import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { audioEngine } from "./audio-engine";
import {
  nextTrackOrSkip,
  pause,
  play,
  playTrack,
  startAudioController,
} from "./audio-controller";

// Browser globals the controller and its stores touch at import time.
const { elements, getOfflineAudioUrl } = vi.hoisted(() => {
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
  return { elements, getOfflineAudioUrl: vi.fn(async () => null as string | null) };
});

vi.mock("@/lib/offline-storage", () => ({
  getDownloadedLessons: async () => [],
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
    useAudioStore.setState({ currentTrack: null, queue: [], queueIndex: -1 });
    audioEngine.unload();
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
});
