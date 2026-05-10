import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockHowlOptions {
  src: string[];
  onload?: () => void;
  onend?: () => void;
  onloaderror?: (id: number, error: unknown) => void;
  onplayerror?: (id: number, error: unknown) => void;
}

const howlInstances: MockHowl[] = [];

function createMockAudioNode() {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    paused: true,
    ended: false,
    error: null as MediaError | null,
    readyState: 4,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const eventListeners = listeners.get(type) ?? new Set<EventListener>();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
}

class MockHowl {
  options: MockHowlOptions;
  playCalls: Array<number | undefined> = [];
  seekCalls: number[] = [];
  playingById = new Map<number, boolean>();
  onceHandlers = new Map<string, () => void>();
  nextId = 1;
  seekValue = 0;
  unloaded = false;
  _sounds = [{ _node: createMockAudioNode() }];

  constructor(options: MockHowlOptions) {
    this.options = options;
    howlInstances.push(this);
  }

  play(id?: number) {
    this.playCalls.push(id);
    const soundId = id ?? this.nextId++;
    this.playingById.set(soundId, true);
    this._sounds[0]._node.paused = false;
    return soundId;
  }

  pause(id?: number) {
    if (id !== undefined) {
      this.playingById.set(id, false);
    } else {
      for (const soundId of this.playingById.keys()) {
        this.playingById.set(soundId, false);
      }
    }
    this._sounds[0]._node.paused = true;
  }

  playing(id?: number) {
    if (id !== undefined) return Boolean(this.playingById.get(id));
    return [...this.playingById.values()].some(Boolean);
  }

  seek(time?: number) {
    if (typeof time === "number") {
      this.seekValue = time;
      this.seekCalls.push(time);
    }
    return this.seekValue;
  }

  duration() {
    return 3600;
  }

  once(event: string, handler: () => void) {
    this.onceHandlers.set(event, handler);
  }

  trigger(event: string) {
    this.onceHandlers.get(event)?.();
  }

  unload() {
    this.unloaded = true;
  }

  stop() {
    this.pause();
  }

  volume() {}
  rate() {}
}

vi.mock("howler", () => ({
  Howler: { html5PoolSize: 0 },
  Howl: MockHowl,
}));

describe("audioEngine", () => {
  beforeEach(async () => {
    const { audioEngine } = await import("./audio-engine");
    audioEngine.unload();
    howlInstances.length = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("reports playback state for the active sound id only", async () => {
    const { audioEngine } = await import("./audio-engine");

    audioEngine.load("/api/audio/stream/lesson.mp3");
    audioEngine.play();
    audioEngine.pause();

    const howl = howlInstances[0];
    howl.playingById.set(999, true);

    expect(audioEngine.isPlaying()).toBe(false);
  });

  it("reuses the active sound id during unlock recovery", async () => {
    const { audioEngine } = await import("./audio-engine");

    audioEngine.load("/api/audio/stream/lesson.mp3");
    audioEngine.play();

    const howl = howlInstances[0];
    howl.playingById.set(1, false);
    howl.options.onplayerror?.(1, "locked");
    howl.trigger("unlock");

    expect(howl.playCalls).toEqual([undefined, 1]);
  });

  it("ensures a loaded paused track resumes without creating a second Howl", async () => {
    const { audioEngine } = await import("./audio-engine");

    audioEngine.load("/api/audio/stream/lesson.mp3");
    audioEngine.play();
    audioEngine.pause();

    audioEngine.ensurePlaying("/api/audio/stream/lesson.mp3", {
      startPosition: 120,
    });

    expect(howlInstances).toHaveLength(1);
    expect(howlInstances[0].seekCalls).toContain(120);
    expect(howlInstances[0].playCalls).toEqual([undefined, 1]);
    expect(audioEngine.isPlaying()).toBe(true);
  });

  it("force reloads a matching URL when recovery needs a fresh native node", async () => {
    const { audioEngine } = await import("./audio-engine");

    audioEngine.load("/api/audio/stream/lesson.mp3");
    const firstHowl = howlInstances[0];

    audioEngine.ensurePlaying("/api/audio/stream/lesson.mp3", {
      forceReload: true,
    });

    expect(firstHowl.unloaded).toBe(true);
    expect(howlInstances).toHaveLength(2);
    expect(howlInstances[1].playCalls).toEqual([undefined]);
  });

  it("notifies native audio event subscribers with current element state", async () => {
    const { audioEngine } = await import("./audio-engine");
    const events: Array<{ type: string; paused: boolean }> = [];

    audioEngine.setOnNativeAudioEvent((event) => {
      events.push({ type: event.type, paused: event.paused });
    });

    audioEngine.load("/api/audio/stream/lesson.mp3");
    audioEngine.play();

    const howl = howlInstances.at(-1)!;
    howl._sounds[0]._node.paused = true;
    howl._sounds[0]._node.dispatchEvent(new Event("pause"));

    expect(events).toContainEqual({ type: "pause", paused: true });

    audioEngine.unload();
  });

  it("removes native audio listeners when unloading a track", async () => {
    const { audioEngine } = await import("./audio-engine");
    const handler = vi.fn();

    audioEngine.setOnNativeAudioEvent(handler);
    audioEngine.load("/api/audio/stream/lesson.mp3");
    const firstNode = howlInstances.at(-1)!._sounds[0]._node;
    audioEngine.unload();

    firstNode.dispatchEvent(new Event("pause"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps one native listener per event when load attaches again after Howler load", async () => {
    const { audioEngine } = await import("./audio-engine");

    audioEngine.load("/api/audio/stream/lesson.mp3");
    const node = howlInstances.at(-1)!._sounds[0]._node;

    node.addEventListener.mockClear();
    node.removeEventListener.mockClear();
    howlInstances.at(-1)!.options.onload?.();

    expect(node.removeEventListener).toHaveBeenCalled();
    expect(node.addEventListener).toHaveBeenCalledTimes(8);
  });
});
