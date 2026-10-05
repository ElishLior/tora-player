import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { useMediaSession } from "./use-media-session";

const { cleanups } = vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.assign(globalThis, {
    window: {
      location: { origin: "https://tora.test" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    },
  });
  return { cleanups: [] as Array<() => void> };
});

// Run the hook's effect and cleanup in the Node test environment. The store
// and its subscription are real; only the React mount and browser APIs are fake.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (setup: () => void | (() => void)) => {
    const cleanup = setup();
    if (cleanup) cleanups.push(cleanup);
  },
}));

// Next's navigation runtime is not available in Vitest's Node environment.
vi.mock("next-intl/navigation", () => ({ createNavigation: () => ({}) }));

const actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();

const session = {
  metadata: null as MediaMetadata | null,
  playbackState: "none",
  positionState: null as MediaPositionState | null,
  setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    actionHandlers.set(action, handler);
  }),
  setPositionState: vi.fn((state: MediaPositionState) => {
    session.positionState = state.duration === undefined ? null : state;
  }),
};

function makeTrack(id: string, duration: number): AudioTrack {
  return {
    id,
    title: id,
    hebrewTitle: id,
    audioUrl: `/api/audio/stream/${id}.mp3`,
    duration,
    date: "2026-10-04",
  };
}

function invokeAction(action: MediaSessionAction, details: Omit<MediaSessionActionDetails, "action"> = {}) {
  const handler = actionHandlers.get(action);
  expect(handler).toBeTypeOf("function");
  handler!({ action, ...details });
}

describe("Media Session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionHandlers.clear();
    useAudioStore.setState(useAudioStore.getInitialState());
    session.metadata = null;
    session.playbackState = "none";
    session.positionState = null;
    vi.stubGlobal("navigator", { mediaSession: session });
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(init: MediaMetadataInit) {
          Object.assign(this, init);
        }
      },
    );
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    { action: "seekbackward" as const, seekOffset: undefined, expected: 85 },
    { action: "seekbackward" as const, seekOffset: 10, expected: 85 },
    { action: "seekbackward" as const, seekOffset: 30, expected: 85 },
    { action: "seekforward" as const, seekOffset: undefined, expected: 115 },
    { action: "seekforward" as const, seekOffset: 10, expected: 115 },
    { action: "seekforward" as const, seekOffset: 30, expected: 115 },
  ])("$action skips exactly 15 seconds with OS seekOffset $seekOffset", ({ action, seekOffset, expected }) => {
    useAudioStore.getState().setTrack(makeTrack("lesson", 600));
    useAudioStore.getState().setCurrentTime(100);
    useMediaSession();

    invokeAction(action, { seekOffset });
    expect(useAudioStore.getState().currentTime).toBe(expected);
    expect(session.positionState?.position).toBe(expected);
    expect(useAudioStore.getState().currentTrack?.id).toBe("lesson");
  });

  it("clamps interval callbacks to the current track bounds", () => {
    useAudioStore.getState().setTrack(makeTrack("lesson", 600));
    useAudioStore.getState().setCurrentTime(10);
    useMediaSession();

    invokeAction("seekbackward", { seekOffset: 30 });
    expect(useAudioStore.getState().currentTime).toBe(0);

    useAudioStore.getState().setCurrentTime(595);
    invokeAction("seekforward", { seekOffset: 10 });
    expect(useAudioStore.getState().currentTime).toBe(600);
  });

  it("preserves absolute seekto times and boundary clamping", () => {
    useAudioStore.getState().setTrack(makeTrack("lesson", 600));
    useMediaSession();

    invokeAction("seekto", { seekTime: 234 });
    expect(useAudioStore.getState().currentTime).toBe(234);
    invokeAction("seekto");
    expect(useAudioStore.getState().currentTime).toBe(234);
    invokeAction("seekto", { seekTime: -10 });
    expect(useAudioStore.getState().currentTime).toBe(0);
    invokeAction("seekto", { seekTime: 900 });
    expect(useAudioStore.getState().currentTime).toBe(600);
  });

  it("navigates queue neighbours and falls back to 15-second intervals at either end", () => {
    const tracks = [makeTrack("first", 600), makeTrack("second", 600)];
    useAudioStore.getState().setQueue(tracks, 0);
    useAudioStore.getState().setCurrentTime(100);
    useMediaSession();

    invokeAction("previoustrack");
    expect(useAudioStore.getState().currentTrack?.id).toBe("first");
    expect(useAudioStore.getState().currentTime).toBe(85);

    invokeAction("nexttrack");
    expect(useAudioStore.getState().currentTrack?.id).toBe("second");
    expect(useAudioStore.getState().queueIndex).toBe(1);
    expect(useAudioStore.getState().currentTime).toBe(0);

    useAudioStore.getState().setCurrentTime(100);
    invokeAction("nexttrack");
    expect(useAudioStore.getState().currentTrack?.id).toBe("second");
    expect(useAudioStore.getState().currentTime).toBe(115);

    invokeAction("previoustrack");
    expect(useAudioStore.getState().currentTrack?.id).toBe("first");
    expect(useAudioStore.getState().queueIndex).toBe(0);
    expect(useAudioStore.getState().currentTime).toBe(0);
  });

  it("clears the previous track's position until the new track's duration is known", () => {
    useAudioStore.getState().setTrack(makeTrack("known", 600));
    useAudioStore.getState().setCurrentTime(120);
    useMediaSession();
    expect(session.positionState).toEqual({ duration: 600, playbackRate: 1, position: 120 });

    useAudioStore.getState().setTrack(makeTrack("unknown", 0));

    expect(session.metadata?.title).toBe("unknown");
    expect(session.setPositionState).toHaveBeenLastCalledWith({});
    expect(session.positionState).toBeNull();

    useAudioStore.getState().setCurrentTime(45);
    useAudioStore.getState().setDuration(900);

    expect(session.positionState).toEqual({ duration: 900, playbackRate: 1, position: 45 });
  });

  it.each(["missing", "throwing"])("keeps track updates safe when setPositionState is %s", (support) => {
    const limitedSession = {
      ...session,
      setPositionState:
        support === "missing"
          ? undefined
          : () => {
              throw new Error("Unsupported position state");
            },
    };
    vi.stubGlobal("navigator", { mediaSession: limitedSession });
    useAudioStore.getState().setTrack(makeTrack("known", 600));
    useMediaSession();

    expect(() => useAudioStore.getState().setTrack(makeTrack("unknown", 0))).not.toThrow();
    expect(limitedSession.metadata?.title).toBe("unknown");
    expect(() => useAudioStore.getState().setDuration(900)).not.toThrow();
    expect(useAudioStore.getState().duration).toBe(900);
  });

  it("does nothing when Media Session is unavailable", () => {
    vi.stubGlobal("navigator", {});
    expect(() => useMediaSession()).not.toThrow();
    useAudioStore.getState().setTrack(makeTrack("unknown", 0));
    expect(session.setPositionState).not.toHaveBeenCalled();
  });

  it("stops position updates after the hook unmounts", () => {
    useAudioStore.getState().setTrack(makeTrack("known", 600));
    useMediaSession();
    cleanups.splice(0).forEach((cleanup) => cleanup());
    session.setPositionState.mockClear();

    useAudioStore.getState().setTrack(makeTrack("unknown", 0));

    expect(session.setPositionState).not.toHaveBeenCalled();
  });
});
