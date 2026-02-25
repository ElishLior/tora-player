'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAudioStore } from '@/stores/audio-store';
import { audioEngine } from '@/lib/audio-engine';

/**
 * Integrates with the Media Session API for:
 * - Lock screen controls on mobile (iOS & Android)
 * - Bluetooth headphone buttons
 * - Browser notification area
 * - OS media overlays
 *
 * Also manages Wake Lock to prevent device sleep during playback.
 */
export function useMediaSession() {
  const { currentTrack, isPlaying, currentTime, duration, playbackSpeed, play, pause, skipForward, skipBackward, nextTrack, previousTrack } = useAudioStore();
  const lastPositionUpdate = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Helper: get absolute URL from a path
  const getAbsoluteUrl = useCallback((path: string) => {
    if (typeof window === 'undefined') return path;
    if (path.startsWith('http')) return path;
    return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
  }, []);

  // Set metadata when track changes
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const artworkList: MediaImage[] = [];

    // Track-specific artwork (if available)
    if (currentTrack.artworkUrl) {
      artworkList.push({
        src: getAbsoluteUrl(currentTrack.artworkUrl),
        sizes: '512x512',
        type: 'image/png',
      });
    }

    // App icon fallbacks — MUST be absolute URLs for lock screen
    artworkList.push(
      { src: getAbsoluteUrl('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: getAbsoluteUrl('/icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
    );

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.hebrewTitle || currentTrack.title,
      artist: currentTrack.seriesName || 'נגן תורה',
      album: 'שיעורי תורה',
      artwork: artworkList,
    });
  }, [currentTrack, getAbsoluteUrl]);

  // Set playback state and manage Wake Lock
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    // Acquire Wake Lock when playing to prevent device sleep
    if (isPlaying) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }

    async function acquireWakeLock() {
      if (wakeLockRef.current) return; // Already held
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Wake Lock not supported or denied
      }
    }

    function releaseWakeLock() {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }

    return () => {
      releaseWakeLock();
    };
  }, [isPlaying]);

  // Re-acquire wake lock when page regains visibility (iOS/Android resume)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && isPlaying) {
        // Re-acquire wake lock
        if ('wakeLock' in navigator && !wakeLockRef.current) {
          navigator.wakeLock.request('screen')
            .then((sentinel) => {
              wakeLockRef.current = sentinel;
              sentinel.addEventListener('release', () => {
                wakeLockRef.current = null;
              });
            })
            .catch(() => {});
        }

        // Re-set media session metadata (iOS sometimes loses it)
        if ('mediaSession' in navigator && currentTrack) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, currentTrack]);

  // Set position state — throttled to every 5 seconds to prevent flicker
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    const now = Date.now();
    // Throttle: only update every 5 seconds (instead of every animation frame)
    if (now - lastPositionUpdate.current < 5000) return;
    lastPositionUpdate.current = now;

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
      // Some browsers don't support setPositionState
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
        // Action not supported on this browser
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
