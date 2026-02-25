'use client';

import { useEffect } from 'react';
import { useAudioStore } from '@/stores/audio-store';
import { audioEngine } from '@/lib/audio-engine';

/**
 * Integrates with the Media Session API for:
 * - Lock screen controls on mobile
 * - Bluetooth headphone buttons
 * - Browser notification area
 * - OS media overlays
 */
export function useMediaSession() {
  const { currentTrack, isPlaying, currentTime, duration, playbackSpeed, play, pause, skipForward, skipBackward, nextTrack, previousTrack } = useAudioStore();

  // Set metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.hebrewTitle || currentTrack.title,
      artist: currentTrack.seriesName || 'נגן תורה',
      album: 'שיעורי תורה',
      artwork: [
        ...(currentTrack.artworkUrl
          ? [{ src: currentTrack.artworkUrl, sizes: '512x512', type: 'image/png' }]
          : []),
        // Fallback icon for lock screen when no artwork
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  }, [currentTrack]);

  // Set playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Set position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      const safeDuration = duration || 0;
      const safePosition = Math.max(0, Math.min(currentTime, safeDuration));
      if (safeDuration > 0) {
        navigator.mediaSession.setPositionState({
          duration: safeDuration,
          playbackRate: playbackSpeed || 1,
          position: safePosition,
        });
      }
    } catch {
      // Some browsers don't support this
    }
  }, [currentTime, duration, currentTrack, playbackSpeed]);

  // Set action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => play()],
      ['pause', () => pause()],
      ['seekforward', () => skipForward(15)],
      ['seekbackward', () => skipBackward(15)],
      ['nexttrack', () => nextTrack()],
      ['previoustrack', () => previousTrack()],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) {
          audioEngine.seek(details.seekTime);
        }
      }],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Cleanup failed
        }
      }
    };
  }, [play, pause, skipForward, skipBackward, nextTrack, previousTrack]);
}
