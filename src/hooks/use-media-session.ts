"use client";

import { useEffect } from "react";
import {
  nextTrackOrSkip,
  pause,
  play,
  previousTrackOrSkip,
  seekTo,
  skipBy,
} from "@/lib/audio-controller";
import {
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
} from "@/lib/player-track-actions";
import {
  getTransportState,
  useAudioStore,
  type AudioPlayerState,
  type AudioTrack,
} from "@/stores/audio-store";

// Normal playback moves the position by < 1s per timeupdate even at 2x speed;
// a bigger jump is a seek the OS must be told about.
const SEEK_JUMP_SECONDS = 2;

function toAbsoluteUrl(path: string) {
  if (path.startsWith("http")) return path;
  return `${window.location.origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function buildMetadata(track: AudioTrack) {
  const artwork: MediaImage[] = [
    ...(track.artworkUrl
      ? [{ src: toAbsoluteUrl(track.artworkUrl), sizes: "512x512", type: "image/png" }]
      : []),
    // Lock screens need absolute URLs.
    { src: toAbsoluteUrl("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
    { src: toAbsoluteUrl("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
  ];
  return new MediaMetadata({
    title: track.hebrewTitle || track.title,
    artist: track.seriesName || "נגן תורה",
    album: "שיעורי תורה",
    artwork,
  });
}

function updatePositionState(session: MediaSession, state: AudioPlayerState) {
  if (state.duration <= 0) return;
  try {
    session.setPositionState({
      duration: state.duration,
      playbackRate: state.playbackSpeed || 1,
      position: Math.max(0, Math.min(state.currentTime, state.duration)),
    });
  } catch {
    // Older browsers without setPositionState.
  }
}

/**
 * Lock screen, notification, headset and car controls. Mounted once by
 * <AudioPlayer/>; it reads the store directly (no React re-render per tick).
 */
export function useMediaSession() {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => play()],
      ["pause", () => pause()],
      ["stop", () => pause()],
      ["seekbackward", (details) => skipBy(-(details.seekOffset || SKIP_BACK_SECONDS))],
      ["seekforward", (details) => skipBy(details.seekOffset || SKIP_FORWARD_SECONDS)],
      [
        "seekto",
        (details) => {
          if (details.seekTime !== undefined) seekTo(details.seekTime);
        },
      ],
      // Steering-wheel and headset buttons send these; with a single lesson
      // they skip inside it instead of doing nothing.
      ["previoustrack", () => previousTrackOrSkip()],
      ["nexttrack", () => nextTrackOrSkip()],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }

    const sync = (state: AudioPlayerState, previous?: AudioPlayerState) => {
      const track = state.currentTrack;
      if (!track) {
        session.metadata = null;
        session.playbackState = "none";
        return;
      }

      const trackChanged = track !== previous?.currentTrack;
      // iOS can drop the now-playing info after an interruption; re-assert it
      // whenever sound starts again.
      const startedPlaying =
        state.playbackStatus === "playing" && previous?.playbackStatus !== "playing";
      if (trackChanged || startedPlaying) session.metadata = buildMetadata(track);

      session.playbackState = getTransportState(state) === "paused" ? "paused" : "playing";

      if (
        !previous ||
        trackChanged ||
        state.playbackStatus !== previous.playbackStatus ||
        state.playbackSpeed !== previous.playbackSpeed ||
        state.duration !== previous.duration ||
        Math.abs(state.currentTime - previous.currentTime) > SEEK_JUMP_SECONDS
      ) {
        updatePositionState(session, state);
      }
    };

    sync(useAudioStore.getState());
    const unsubscribe = useAudioStore.subscribe(sync);

    return () => {
      unsubscribe();
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Action not supported by this browser.
        }
      }
    };
  }, []);
}
