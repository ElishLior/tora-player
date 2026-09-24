import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, type AudioEngineStatus } from "./audio-engine";

/** Minimal HTMLAudioElement: setting src runs a (synchronous) load reset like the real one. */
class FakeAudioElement {
  paused = true;
  ended = false;
  seeking = false;
  error: { code: number } | null = null;
  readyState = 0;
  currentTime = 0;
  duration = Number.NaN;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  volume = 1;
  preload = "";
  srcAssignments = 0;
  playResult: Promise<void> = Promise.resolve();
  private currentSrc = "";
  private listeners = new Map<string, Set<() => void>>();

  get src() {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    this.srcAssignments += 1;
    this.resetForLoad();
  }

  load = vi.fn(() => this.resetForLoad());

  play = vi.fn(() => {
    this.paused = false;
    return this.playResult;
  });

  pause = vi.fn(() => {
    this.paused = true;
  });

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  removeAttribute(name: string) {
    if (name === "src") this.currentSrc = "";
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  receiveMetadata(duration: number) {
    this.duration = duration;
    this.readyState = 1;
    this.emit("loadedmetadata");
  }

  receiveData() {
    this.readyState = 4;
    this.emit("canplay");
    if (!this.paused) this.emit("playing");
  }

  private resetForLoad() {
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.readyState = 0;
    this.currentTime = 0;
    this.duration = Number.NaN;
  }
}

function setup() {
  const element = new FakeAudioElement();
  const engine = new AudioEngine(() => element as unknown as HTMLAudioElement);
  const statuses: AudioEngineStatus[] = [];
  const times: number[] = [];
  const onPlayBlocked = vi.fn();
  engine.setHandlers({
    onStatusChange: (status) => statuses.push(status),
    onTimeUpdate: (time) => times.push(time),
    onPlayBlocked,
  });
  return { element, engine, statuses, times, onPlayBlocked };
}

function startPlaying(element: FakeAudioElement, engine: AudioEngine, duration = 3600) {
  engine.play();
  element.receiveMetadata(duration);
  element.receiveData();
}

const LESSON_URL = "/api/audio/stream/lesson.mp3";

describe("AudioEngine", () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it("never rewinds when the loaded track is loaded again with a stale position", () => {
    const { element, engine } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    startPlaying(element, engine);
    // Played on with the screen locked; the UI still holds an old position.
    element.currentTime = 1800;

    engine.load(LESSON_URL, { trackKey: "lesson-1", startPosition: 120 });
    engine.play();

    expect(element.srcAssignments).toBe(1);
    expect(element.currentTime).toBe(1800);
  });

  it("starts a new track at its start position and reports it while loading", () => {
    const { element, engine, times } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1", startPosition: 300 });
    engine.play();

    // Timeupdates of the fresh source at 0 must not overwrite the resume point.
    element.emit("timeupdate");
    expect(times).toEqual([]);
    expect(engine.getCurrentTime()).toBe(300);

    element.receiveMetadata(3600);
    element.receiveData();

    expect(element.currentTime).toBe(300);
    expect(times.at(-1)).toBe(300);
  });

  it("re-applies a start position the browser ignored at loadedmetadata", () => {
    const { element, engine } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1", startPosition: 300 });
    engine.play();
    element.receiveMetadata(3600);
    element.currentTime = 0; // iOS dropped the early seek

    element.receiveData();

    expect(element.currentTime).toBe(300);
  });

  it("treats a seek before metadata as the start position", () => {
    const { element, engine } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    engine.seek(95);

    element.receiveMetadata(3600);
    element.receiveData();

    expect(element.currentTime).toBe(95);
  });

  it("derives status from the element, so a stale pause event does not stop the UI", () => {
    const { element, engine, statuses } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    startPlaying(element, engine);
    expect(engine.getStatus()).toBe("playing");

    // A pause queued before the source switched arrives after play() resumed it.
    element.emit("pause");

    expect(engine.getStatus()).toBe("playing");
    expect(statuses).not.toContain("paused");
  });

  it("reports waiting for data as buffering and an external pause as paused", () => {
    const { element, engine } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    startPlaying(element, engine);

    element.readyState = 2;
    element.emit("waiting");
    expect(engine.getStatus()).toBe("buffering");

    element.readyState = 4;
    element.emit("playing");
    element.paused = true; // phone call / Siri / Bluetooth disconnect
    element.emit("pause");
    expect(engine.getStatus()).toBe("paused");
  });

  it("keeps showing playing through a skip, and buffering only for a real wait", () => {
    const { element, engine, statuses } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    startPlaying(element, engine);

    element.seeking = true;
    element.readyState = 1;
    element.emit("waiting");
    element.seeking = false;
    element.readyState = 4;
    element.emit("seeked");
    expect(statuses).toEqual(["playing"]);

    element.readyState = 2;
    element.emit("waiting");
    expect(engine.getStatus()).toBe("buffering");
  });

  it("reports play() refused by the autoplay policy, but not superseded plays", async () => {
    const { element, engine, onPlayBlocked } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });

    element.playResult = Promise.reject({ name: "AbortError" });
    engine.play();
    await Promise.resolve();
    expect(onPlayBlocked).not.toHaveBeenCalled();

    element.playResult = Promise.reject({ name: "NotAllowedError" });
    engine.play();
    await Promise.resolve();
    expect(onPlayBlocked).toHaveBeenCalledTimes(1);
  });

  it("reloads an errored source at the same position when asked to play", () => {
    const { element, engine } = env;
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    startPlaying(element, engine);
    element.currentTime = 500;
    element.error = { code: 2 }; // MEDIA_ERR_NETWORK
    element.emit("error");
    expect(engine.getStatus()).toBe("error");

    engine.play();
    element.receiveMetadata(3600);
    element.receiveData();

    expect(element.load).toHaveBeenCalledTimes(1);
    expect(element.currentTime).toBe(500);
    expect(engine.getStatus()).toBe("playing");
  });

  it("keeps the chosen playback speed when the next track loads", () => {
    const { element, engine } = env;
    engine.setRate(1.5);
    engine.load(LESSON_URL, { trackKey: "lesson-1" });
    engine.load("/api/audio/stream/lesson-2.mp3", { trackKey: "lesson-2" });

    expect(element.playbackRate).toBe(1.5);
    expect(element.defaultPlaybackRate).toBe(1.5);
  });
});
