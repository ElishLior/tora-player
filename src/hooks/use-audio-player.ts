"use client";

import { useShallow } from "zustand/react/shallow";
import {
  pause,
  play,
  playTrack,
  seekTo,
  skipBackward,
  skipForward,
  togglePlay,
} from "@/lib/audio-controller";
import { getTransportState, useAudioStore } from "@/stores/audio-store";

const playerActions = {
  play,
  pause,
  togglePlay,
  seekTo,
  skipBackward,
  skipForward,
  playTrack,
};

/**
 * Playback state plus player actions for UI surfaces. It never drives the
 * audio element itself (the controller started by <AudioPlayer/> does), so any
 * number of components can use it. Re-renders on time updates (~4 Hz); use a
 * narrower useAudioStore selector where the position is not shown.
 */
export function useAudioPlayer() {
  const state = useAudioStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      isPlaying: s.isPlaying,
      playbackStatus: s.playbackStatus,
      playbackIssue: s.playbackIssue,
      currentTime: s.currentTime,
      duration: s.duration,
      playbackSpeed: s.playbackSpeed,
      hasNextTrack: s.queueIndex < s.queue.length - 1,
      hasPreviousTrack: s.queueIndex > 0,
      nextTrack: s.nextTrack,
      previousTrack: s.previousTrack,
      setPlaybackSpeed: s.setPlaybackSpeed,
      toggleMiniPlayer: s.toggleMiniPlayer,
    })),
  );

  return { ...state, transport: getTransportState(state), ...playerActions };
}
