import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import type { AudioEngineStatus } from "@/lib/audio-engine";

export interface AudioTrack {
  id: string;
  lessonId?: string;
  audioFileId?: string;
  fileKey?: string;
  offlineKey?: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  audioUrlFallback?: string;
  duration: number;
  seriesName?: string;
  date: string;
  artworkUrl?: string;
  description?: string;
  originalName?: string;
  mimeType?: string;
}

/**
 * Why the element is not playing although the listener asked for playback:
 * - retrying: a network/decode failure is being retried automatically
 * - blocked: the browser refused play() without a fresh tap
 * - failed: retries are exhausted (or the device is offline)
 */
export type PlaybackIssue = "retrying" | "blocked" | "failed";

/** Stable identity of one audio file of one lesson. */
export function getTrackKey(track: AudioTrack | null | undefined): string | null {
  if (!track) return null;
  return [
    track.lessonId || track.id,
    track.audioFileId || "",
    track.offlineKey || "",
    track.audioUrl,
  ].join("|");
}

export interface AudioPlayerState {
  currentTrack: AudioTrack | null;
  queue: AudioTrack[];
  queueIndex: number;
  /** Playback the listener asked for. The controller keeps it in sync with the element. */
  isPlaying: boolean;
  /** What the audio element is actually doing. */
  playbackStatus: AudioEngineStatus;
  playbackIssue: PlaybackIssue | null;
  currentTime: number;
  duration: number;
  /** Last checkpointed position of currentTrack; restored after a reload. */
  resumePosition: number;
  volume: number;
  playbackSpeed: number;
  isMiniPlayerExpanded: boolean;

  /** Plays a single track. Keeps the queue only when the track is part of it. */
  setTrack: (track: AudioTrack) => void;
  setQueue: (tracks: AudioTrack[], startIndex?: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setResumePosition: (position: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setPlaybackStatus: (status: AudioEngineStatus) => void;
  setPlaybackIssue: (issue: PlaybackIssue | null) => void;
  toggleMiniPlayer: () => void;
}

type PersistedAudioState = Pick<
  AudioPlayerState,
  "currentTrack" | "queue" | "queueIndex" | "resumePosition" | "volume" | "playbackSpeed"
>;

/** What the play/pause control shows: pause, a spinner (still pauses), or play. */
export type TransportState = "playing" | "loading" | "paused";

/**
 * The element is the source of truth. A play request that is still loading or
 * retrying counts as "loading" so a tap cancels it instead of re-requesting.
 */
export function getTransportState(
  state: Pick<AudioPlayerState, "isPlaying" | "playbackStatus" | "playbackIssue">,
): TransportState {
  if (state.playbackStatus === "playing") return "playing";
  if (state.playbackStatus === "buffering") return "loading";
  if (!state.isPlaying || state.playbackStatus === "ended") return "paused";
  return state.playbackStatus === "error" && state.playbackIssue !== "retrying"
    ? "paused"
    : "loading";
}

function startTrack(track: AudioTrack) {
  return {
    currentTrack: track,
    currentTime: 0,
    duration: track.duration || 0,
    resumePosition: 0,
    isPlaying: true,
    // The element still reports the previous track until the new one loads.
    playbackStatus: "idle" as const,
    playbackIssue: null,
  };
}

/**
 * localStorage writes only when a persisted field actually changed, so the
 * ~4 Hz currentTime updates never touch storage.
 */
function createAudioStorage(): PersistStorage<PersistedAudioState> | undefined {
  const storage = createJSONStorage<PersistedAudioState>(() => window.localStorage);
  if (!storage) return undefined;
  let lastWritten: PersistedAudioState | null = null;
  return {
    ...storage,
    setItem: (name, value) => {
      if (lastWritten && shallow(lastWritten, value.state)) return;
      lastWritten = value.state;
      return storage.setItem(name, value);
    },
  };
}

export const useAudioStore = create<AudioPlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      playbackStatus: "idle",
      playbackIssue: null,
      currentTime: 0,
      duration: 0,
      resumePosition: 0,
      volume: 1,
      playbackSpeed: 1,
      isMiniPlayerExpanded: false,

      setTrack: (track) => {
        const key = getTrackKey(track);
        const { currentTrack, queue } = get();
        // Same file again (e.g. tapping it on the lesson page): keep its position.
        if (getTrackKey(currentTrack) === key) {
          set({ isPlaying: true, playbackIssue: null });
          return;
        }
        const index = queue.findIndex((item) => getTrackKey(item) === key);
        set({
          ...startTrack(track),
          ...(index >= 0 ? { queueIndex: index } : { queue: [track], queueIndex: 0 }),
        });
      },

      setQueue: (tracks, startIndex = 0) => {
        const track = tracks[startIndex];
        if (!track) return;
        set({ ...startTrack(track), queue: tracks, queueIndex: startIndex });
      },

      nextTrack: () => {
        const { queue, queueIndex } = get();
        const next = queue[queueIndex + 1];
        if (next) set({ ...startTrack(next), queueIndex: queueIndex + 1 });
      },

      previousTrack: () => {
        const { queue, queueIndex } = get();
        const previous = queueIndex > 0 ? queue[queueIndex - 1] : undefined;
        if (previous) set({ ...startTrack(previous), queueIndex: queueIndex - 1 });
      },

      play: () => set({ isPlaying: true, playbackIssue: null }),
      pause: () => set({ isPlaying: false, playbackIssue: null }),
      togglePlay: () => {
        if (getTransportState(get()) === "paused") set({ isPlaying: true, playbackIssue: null });
        else set({ isPlaying: false });
      },

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setResumePosition: (position) => set({ resumePosition: position }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setPlaybackStatus: (status) => set({ playbackStatus: status }),
      setPlaybackIssue: (issue) => set({ playbackIssue: issue }),
      toggleMiniPlayer: () =>
        set((state) => ({ isMiniPlayerExpanded: !state.isMiniPlayerExpanded })),
    }),
    {
      name: "tora-player-audio",
      version: 1,
      storage: createAudioStorage(),
      // isPlaying is intentionally not persisted: a reload must never auto-play.
      partialize: (state): PersistedAudioState => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        queueIndex: state.queueIndex,
        resumePosition: state.resumePosition,
        volume: state.volume,
        playbackSpeed: state.playbackSpeed,
      }),
      // v0 persisted the live currentTime instead of a checkpoint.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PersistedAudioState> & { currentTime?: number };
        if (version === 0) {
          const { currentTime, ...rest } = state;
          return { ...rest, resumePosition: currentTime ?? 0 } as PersistedAudioState;
        }
        return state as PersistedAudioState;
      },
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<PersistedAudioState>;
        return {
          ...current,
          ...state,
          currentTime: state.resumePosition ?? 0,
          duration: state.currentTrack?.duration ?? 0,
        };
      },
    },
  ),
);
