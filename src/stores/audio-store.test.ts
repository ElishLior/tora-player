import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTransportState, useAudioStore, type AudioTrack } from "./audio-store";

// The store creates its localStorage adapter at import time, so the fake
// storage must exist before the (hoisted) import above runs.
const { setItem } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem,
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
  return { setItem };
});

function makeTrack(id: string): AudioTrack {
  return {
    id,
    lessonId: id,
    title: id,
    hebrewTitle: id,
    audioUrl: `/api/audio/stream/${id}.mp3`,
    duration: 600,
    date: "2026-01-01",
  };
}

const [first, second, third] = ["a", "b", "c"].map(makeTrack);

describe("audio store", () => {
  beforeEach(() => {
    useAudioStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      playbackStatus: "idle",
      playbackIssue: null,
      currentTime: 0,
      resumePosition: 0,
    });
    setItem.mockClear();
  });

  it("replaces an old playlist when a lesson outside it starts", () => {
    const { setQueue, setTrack } = useAudioStore.getState();
    setQueue([first, second], 0);

    setTrack(third);

    const state = useAudioStore.getState();
    expect(state.queue).toEqual([third]);
    expect(state.queueIndex).toBe(0);
    state.nextTrack();
    expect(useAudioStore.getState().currentTrack).toBe(third);
  });

  it("keeps the playlist when the started lesson is part of it", () => {
    const { setQueue, setTrack } = useAudioStore.getState();
    setQueue([first, second, third], 0);

    setTrack(second);

    const state = useAudioStore.getState();
    expect(state.queue).toHaveLength(3);
    expect(state.queueIndex).toBe(1);
  });

  it("keeps the position when the playing file is started again", () => {
    const { setTrack, setCurrentTime } = useAudioStore.getState();
    setTrack(first);
    setCurrentTime(250);
    useAudioStore.getState().pause();

    setTrack({ ...first });

    const state = useAudioStore.getState();
    expect(state.currentTime).toBe(250);
    expect(state.isPlaying).toBe(true);
  });

  it("does not write storage on playback time updates", () => {
    useAudioStore.getState().setTrack(first);
    setItem.mockClear();

    for (let second = 1; second <= 20; second += 1) {
      useAudioStore.getState().setCurrentTime(second);
    }

    expect(setItem).not.toHaveBeenCalled();
    useAudioStore.getState().setResumePosition(20);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe("queue editing", () => {
  const [d, e] = ["d", "e"].map(makeTrack);
  const ids = () => useAudioStore.getState().queue.map((track) => track.id);

  beforeEach(() => {
    useAudioStore.setState({ currentTrack: null, queue: [], queueIndex: -1 });
    // Current track is "b" (index 1).
    useAudioStore.getState().setQueue([first, second, third, d], 1);
  });

  it("never removes the current track", () => {
    useAudioStore.getState().removeFromQueue(1);

    const state = useAudioStore.getState();
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    expect(state.currentTrack).toBe(second);
    expect(state.queueIndex).toBe(1);
  });

  it("removes the last item and items before the current one", () => {
    const { removeFromQueue } = useAudioStore.getState();
    removeFromQueue(3);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(useAudioStore.getState().queueIndex).toBe(1);

    removeFromQueue(0);
    const state = useAudioStore.getState();
    expect(ids()).toEqual(["b", "c"]);
    expect(state.queueIndex).toBe(0);
    expect(state.queue[state.queueIndex]).toBe(second);

    removeFromQueue(5);
    expect(ids()).toEqual(["b", "c"]);
  });

  it("keeps the current track when items move across it", () => {
    const { moveInQueue } = useAudioStore.getState();

    moveInQueue(3, 0);
    expect(ids()).toEqual(["d", "a", "b", "c"]);
    expect(useAudioStore.getState().queueIndex).toBe(2);

    moveInQueue(0, 3);
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    expect(useAudioStore.getState().queueIndex).toBe(1);

    moveInQueue(1, 2);
    const state = useAudioStore.getState();
    expect(ids()).toEqual(["a", "c", "b", "d"]);
    expect(state.queueIndex).toBe(2);
    expect(state.currentTrack).toBe(second);
    expect(state.isPlaying).toBe(true);
  });

  it("moves within the upcoming items without touching the index", () => {
    useAudioStore.getState().moveInQueue(3, 2);
    expect(ids()).toEqual(["a", "b", "d", "c"]);
    expect(useAudioStore.getState().queueIndex).toBe(1);

    useAudioStore.getState().moveInQueue(2, 9);
    expect(ids()).toEqual(["a", "b", "d", "c"]);
  });

  it("queues tracks right after the current one without duplicates", () => {
    const { playNext } = useAudioStore.getState();

    playNext([e]);
    expect(ids()).toEqual(["a", "b", "e", "c", "d"]);

    // Already queued: moved up, not duplicated; the current track is skipped.
    playNext([d, second]);
    const state = useAudioStore.getState();
    expect(ids()).toEqual(["a", "b", "d", "e", "c"]);
    expect(state.queueIndex).toBe(1);
    expect(state.currentTrack).toBe(second);

    // An earlier (already played) copy moves too, shifting the current index.
    playNext([first]);
    expect(ids()).toEqual(["b", "a", "d", "e", "c"]);
    expect(useAudioStore.getState().queueIndex).toBe(0);
  });

  it("does nothing without a loaded track", () => {
    useAudioStore.setState({ currentTrack: null, queue: [], queueIndex: -1 });
    useAudioStore.getState().playNext([e]);
    expect(ids()).toEqual([]);
  });
});

describe("getTransportState", () => {
  const base = { isPlaying: false, playbackStatus: "paused", playbackIssue: null } as const;

  it("shows pause only while the element is really producing sound", () => {
    expect(getTransportState({ ...base, playbackStatus: "playing" })).toBe("playing");
    expect(getTransportState({ ...base, isPlaying: true, playbackStatus: "buffering" })).toBe(
      "loading",
    );
  });

  it("shows loading (tap = cancel) while a requested play is starting or retrying", () => {
    expect(getTransportState({ ...base, isPlaying: true })).toBe("loading");
    expect(
      getTransportState({
        isPlaying: true,
        playbackStatus: "error",
        playbackIssue: "retrying",
      }),
    ).toBe("loading");
  });

  it("shows play when nothing will start without the listener", () => {
    expect(getTransportState(base)).toBe("paused");
    expect(getTransportState({ ...base, playbackStatus: "error" })).toBe("paused");
    expect(getTransportState({ ...base, isPlaying: true, playbackStatus: "ended" })).toBe(
      "paused",
    );
  });

  it("togglePlay cancels a pending play instead of requesting it again", () => {
    useAudioStore.setState({ currentTrack: first, isPlaying: true, playbackStatus: "paused" });

    useAudioStore.getState().togglePlay();

    expect(useAudioStore.getState().isPlaying).toBe(false);
  });
});
