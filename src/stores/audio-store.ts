import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export interface PlaybackDiagnostic {
  at: string;
  event: string;
  action: string;
  trackId?: string;
  audioFileId?: string;
  offlineKey?: string;
  currentTime: number;
  result?:
    | "attempted"
    | "blocked"
    | "cooldown"
    | "succeeded"
    | "failed"
    | "ignored";
}

interface AudioPlayerState {
  // Current track
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackSpeed: number;
  isMiniPlayerExpanded: boolean;
  lastNativePlaybackState:
    | "unknown"
    | "playing"
    | "paused"
    | "waiting"
    | "stalled"
    | "errored"
    | "ended";
  playbackRecoveryState:
    | "idle"
    | "recovering"
    | "stalled"
    | "resumed"
    | "needs-user-gesture"
    | "failed";
  playbackDiagnostics: PlaybackDiagnostic[];
  recoveryAttemptsByTrack: Record<
    string,
    { count: number; lastAttemptAt: number; playBlocked: boolean }
  >;

  // Queue
  queue: AudioTrack[];
  queueIndex: number;

  // Actions
  setTrack: (track: AudioTrack) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  skipForward: (seconds?: number) => void;
  skipBackward: (seconds?: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setQueue: (tracks: AudioTrack[], startIndex?: number) => void;
  addToQueue: (track: AudioTrack) => void;
  removeFromQueue: (index: number) => void;
  toggleMiniPlayer: () => void;
  setNativePlaybackState: (
    state: AudioPlayerState["lastNativePlaybackState"],
  ) => void;
  setPlaybackRecoveryState: (
    state: AudioPlayerState["playbackRecoveryState"],
  ) => void;
  addPlaybackDiagnostic: (diagnostic: PlaybackDiagnostic) => void;
  clearPlaybackDiagnostics: () => void;
  markPlaybackRecoveryAttempt: (trackKey: string) => void;
  markPlaybackRecoverySucceeded: (trackKey: string) => void;
  markPlaybackNeedsUserGesture: (trackKey: string) => void;
}

export const useAudioStore = create<AudioPlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      playbackSpeed: 1,
      isMiniPlayerExpanded: false,
      lastNativePlaybackState: "unknown",
      playbackRecoveryState: "idle",
      playbackDiagnostics: [],
      recoveryAttemptsByTrack: {},
      queue: [],
      queueIndex: -1,

      setTrack: (track) =>
        set({ currentTrack: track, currentTime: 0, isPlaying: true }),

      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),

      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

      skipForward: (seconds = 15) =>
        set((state) => ({
          currentTime: Math.min(state.currentTime + seconds, state.duration),
        })),

      skipBackward: (seconds = 15) =>
        set((state) => ({
          currentTime: Math.max(state.currentTime - seconds, 0),
        })),

      nextTrack: () => {
        const { queue, queueIndex } = get();
        if (queueIndex < queue.length - 1) {
          const nextIndex = queueIndex + 1;
          set({
            currentTrack: queue[nextIndex],
            queueIndex: nextIndex,
            currentTime: 0,
            isPlaying: true,
          });
        }
      },

      previousTrack: () => {
        const { queue, queueIndex, currentTime } = get();
        // If more than 3 seconds in, restart current track
        if (currentTime > 3) {
          set({ currentTime: 0 });
          return;
        }
        if (queueIndex > 0) {
          const prevIndex = queueIndex - 1;
          set({
            currentTrack: queue[prevIndex],
            queueIndex: prevIndex,
            currentTime: 0,
            isPlaying: true,
          });
        }
      },

      setQueue: (tracks, startIndex = 0) =>
        set({
          queue: tracks,
          queueIndex: startIndex,
          currentTrack: tracks[startIndex] || null,
          currentTime: 0,
          isPlaying: true,
        }),

      addToQueue: (track) =>
        set((state) => ({ queue: [...state.queue, track] })),

      removeFromQueue: (index) =>
        set((state) => ({
          queue: state.queue.filter((_, i) => i !== index),
        })),

      toggleMiniPlayer: () =>
        set((state) => ({ isMiniPlayerExpanded: !state.isMiniPlayerExpanded })),

      setNativePlaybackState: (state) =>
        set({ lastNativePlaybackState: state }),
      setPlaybackRecoveryState: (state) =>
        set({ playbackRecoveryState: state }),
      addPlaybackDiagnostic: (diagnostic) =>
        set((state) => ({
          playbackDiagnostics: [
            ...state.playbackDiagnostics.slice(-19),
            diagnostic,
          ],
        })),
      clearPlaybackDiagnostics: () => set({ playbackDiagnostics: [] }),
      markPlaybackRecoveryAttempt: (trackKey) =>
        set((state) => {
          const previous = state.recoveryAttemptsByTrack[trackKey];
          return {
            playbackRecoveryState: "recovering",
            recoveryAttemptsByTrack: {
              ...state.recoveryAttemptsByTrack,
              [trackKey]: {
                count: (previous?.count ?? 0) + 1,
                lastAttemptAt: Date.now(),
                playBlocked: previous?.playBlocked ?? false,
              },
            },
          };
        }),
      markPlaybackRecoverySucceeded: (trackKey) =>
        set((state) => {
          const recoveryAttemptsByTrack = {
            ...state.recoveryAttemptsByTrack,
          };
          delete recoveryAttemptsByTrack[trackKey];

          return {
            playbackRecoveryState: "resumed",
            recoveryAttemptsByTrack,
          };
        }),
      markPlaybackNeedsUserGesture: (trackKey) =>
        set((state) => ({
          playbackRecoveryState: "needs-user-gesture",
          recoveryAttemptsByTrack: {
            ...state.recoveryAttemptsByTrack,
            [trackKey]: {
              count: state.recoveryAttemptsByTrack[trackKey]?.count ?? 0,
              lastAttemptAt:
                state.recoveryAttemptsByTrack[trackKey]?.lastAttemptAt ?? 0,
              playBlocked: true,
            },
          },
        })),
    }),
    {
      name: "tora-player-audio",
      partialize: (state) => ({
        volume: state.volume,
        playbackSpeed: state.playbackSpeed,
        currentTrack: state.currentTrack,
        currentTime: state.currentTime,
        queue: state.queue,
        queueIndex: state.queueIndex,
        // NOTE: isPlaying intentionally excluded — persisting it caused
        // phantom auto-resume on page refresh / rehydration
      }),
    },
  ),
);
