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
