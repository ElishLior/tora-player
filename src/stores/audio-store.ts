import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AudioTrack {
  id: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  audioUrlFallback?: string;
  duration: number;
  seriesName?: string;
  date: string;
  artworkUrl?: string;
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
    }),
    {
      name: 'tora-player-audio',
      partialize: (state) => ({
        volume: state.volume,
        playbackSpeed: state.playbackSpeed,
        currentTrack: state.currentTrack,
        currentTime: state.currentTime,
        queue: state.queue,
        queueIndex: state.queueIndex,
        isPlaying: state.isPlaying,
      }),
    }
  )
);
