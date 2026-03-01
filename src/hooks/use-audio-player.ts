'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAudioStore, type AudioTrack } from '@/stores/audio-store';
import { audioEngine } from '@/lib/audio-engine';
import { getOfflineAudioUrl, revokeOfflineAudioUrl } from '@/lib/offline-storage';

const PROGRESS_SAVE_INTERVAL = 10000; // Save progress every 10 seconds

export function useAudioPlayer() {
  const store = useAudioStore();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTimeRef = useRef(0);
  const prevTrackIdRef = useRef<string | null>(null);

  // Sync engine with store state
  useEffect(() => {
    if (!store.currentTrack) return;

    audioEngine.setOnTimeUpdate((time) => {
      store.setCurrentTime(time);
    });

    audioEngine.setOnLoad((duration) => {
      store.setDuration(duration);
    });

    audioEngine.setOnEnd(() => {
      store.pause();
      // Auto-play next track in queue
      store.nextTrack();
    });

    audioEngine.setOnError((error) => {
      console.error('Audio error:', error);
    });
  }, [store.currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load track when it changes — check offline storage first
  useEffect(() => {
    if (!store.currentTrack?.audioUrl) return;

    // Revoke old blob URL when switching tracks to free memory
    if (prevTrackIdRef.current && prevTrackIdRef.current !== store.currentTrack.id) {
      revokeOfflineAudioUrl(prevTrackIdRef.current);
    }
    prevTrackIdRef.current = store.currentTrack.id;

    let cancelled = false;

    async function loadTrack() {
      const track = useAudioStore.getState().currentTrack;
      if (!track?.audioUrl || cancelled) return;

      // Try offline blob URL first, fall back to streaming URL
      let url = track.audioUrl;
      try {
        const offlineUrl = await getOfflineAudioUrl(track.id);
        if (offlineUrl && !cancelled) {
          url = offlineUrl;
        }
      } catch {
        // Offline storage unavailable — use network URL
      }

      if (cancelled) return;

      audioEngine.load(url, {
        startPosition: useAudioStore.getState().currentTime > 0
          ? useAudioStore.getState().currentTime
          : undefined,
      });

      // Set proper attributes on the native <audio> element for iOS background playback
      const audioEl = audioEngine.getAudioElement();
      if (audioEl) {
        audioEl.setAttribute('playsinline', '');
        audioEl.setAttribute('webkit-playsinline', '');
      }

      // NOTE: Do NOT call audioEngine.play() here. The play/pause sync effect
      // is the SOLE authority for calling play(). Calling it here too caused
      // a dual-effect race condition (two useEffects both calling play()).
    }

    loadTrack();

    return () => {
      cancelled = true;
    };
  }, [store.currentTrack?.id, store.currentTrack?.audioUrl]);

  // Re-initialize audio when app comes back to foreground (browser may have killed audio context)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const state = useAudioStore.getState();
      if (!state.currentTrack?.audioUrl) return;

      // If engine lost its state, re-load and resume
      if (!audioEngine.isLoaded()) {
        // Try offline first, then fall back to streaming
        getOfflineAudioUrl(state.currentTrack.id).then((offlineUrl) => {
          const url = offlineUrl || state.currentTrack!.audioUrl;
          // Use onLoad callback to play when ready, instead of setTimeout
          if (useAudioStore.getState().isPlaying) {
            const prevOnLoad = audioEngine['onLoad'];
            audioEngine.setOnLoad((duration) => {
              audioEngine.setOnLoad(prevOnLoad || (() => {}));
              prevOnLoad?.(duration);
              if (useAudioStore.getState().isPlaying) {
                audioEngine.play();
              }
            });
          }
          audioEngine.load(url, {
            startPosition: state.currentTime > 0 ? state.currentTime : undefined,
          });
          const audioEl = audioEngine.getAudioElement();
          if (audioEl) {
            audioEl.setAttribute('playsinline', '');
            audioEl.setAttribute('webkit-playsinline', '');
          }
        });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // Empty deps — uses getState() for fresh state

  // Sync play/pause — re-load engine if needed, then play/pause
  // This is the SOLE authority for calling audioEngine.play()/pause()
  useEffect(() => {
    if (!store.currentTrack) return;
    if (store.isPlaying) {
      // Guard: if engine is already playing, don't call play() again
      if (audioEngine.isPlaying()) return;

      // If engine is not loaded (e.g., after page refresh, browser killed audio),
      // re-load the track first, then play via onLoad callback
      if (!audioEngine.isLoaded() && store.currentTrack.audioUrl) {
        const trackId = store.currentTrack.id;
        const trackUrl = store.currentTrack.audioUrl;
        const startPos = store.currentTime > 0 ? store.currentTime : undefined;
        // Try offline first
        getOfflineAudioUrl(trackId).then((offlineUrl) => {
          // Check state is still isPlaying before proceeding (user may have paused during async)
          if (!useAudioStore.getState().isPlaying) return;
          const url = offlineUrl || trackUrl;
          // Set onLoad to trigger play when the track is actually ready
          const prevOnLoad = audioEngine['onLoad'];
          audioEngine.setOnLoad((duration) => {
            // Restore the original onLoad handler
            audioEngine.setOnLoad(prevOnLoad || (() => {}));
            prevOnLoad?.(duration);
            // Only play if store still says isPlaying (user may have paused during load)
            if (useAudioStore.getState().isPlaying) {
              audioEngine.play();
            }
          });
          audioEngine.load(url, { startPosition: startPos });
          const audioEl = audioEngine.getAudioElement();
          if (audioEl) {
            audioEl.setAttribute('playsinline', '');
            audioEl.setAttribute('webkit-playsinline', '');
          }
        });
      } else {
        audioEngine.play();
      }
    } else {
      audioEngine.pause();
    }
  }, [store.isPlaying, store.currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync volume
  useEffect(() => {
    audioEngine.setVolume(store.volume);
  }, [store.volume]);

  // Sync playback speed
  useEffect(() => {
    audioEngine.setRate(store.playbackSpeed);
  }, [store.playbackSpeed]);

  // Preload next track in queue when current track starts playing
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    // Clean up any previous preloaded element — fully release the audio resource
    if (preloadRef.current) {
      preloadRef.current.pause();
      preloadRef.current.removeAttribute('src');
      preloadRef.current.load(); // Forces browser to release the audio resource
      preloadRef.current = null;
    }

    if (!store.isPlaying || !store.currentTrack) return;

    const { queue, queueIndex } = store;
    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) return;

    const nextTrack = queue[nextIndex];
    if (!nextTrack?.audioUrl) return;

    // Create a hidden audio element to preload the next track
    const preloadAudio = new Audio();
    preloadAudio.preload = 'auto';
    preloadAudio.src = nextTrack.audioUrl;
    preloadRef.current = preloadAudio;

    return () => {
      if (preloadRef.current) {
        preloadRef.current.pause();
        preloadRef.current.removeAttribute('src');
        preloadRef.current.load();
        preloadRef.current = null;
      }
    };
  }, [store.isPlaying, store.currentTrack?.id, store.queueIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress periodically
  useEffect(() => {
    if (!store.currentTrack || !store.isPlaying) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }

    progressTimerRef.current = setInterval(() => {
      const currentTime = audioEngine.getCurrentTime();
      if (Math.abs(currentTime - lastSavedTimeRef.current) > 5) {
        lastSavedTimeRef.current = currentTime;
        // Save to server (fire-and-forget)
        saveProgress(store.currentTrack!.id, Math.round(currentTime));
      }
    }, PROGRESS_SAVE_INTERVAL);

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, [store.currentTrack?.id, store.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seek handler (triggered from UI)
  const seekTo = useCallback((time: number) => {
    audioEngine.seek(time);
    store.setCurrentTime(time);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Skip forward/backward — update both store AND audio engine
  const skipForward = useCallback((seconds = 15) => {
    const newTime = Math.min(audioEngine.getCurrentTime() + seconds, audioEngine.getDuration());
    audioEngine.seek(newTime);
    store.setCurrentTime(newTime);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const skipBackward = useCallback((seconds = 15) => {
    const newTime = Math.max(audioEngine.getCurrentTime() - seconds, 0);
    audioEngine.seek(newTime);
    store.setCurrentTime(newTime);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play a specific track
  const playTrack = useCallback((track: AudioTrack, queue?: AudioTrack[], queueIndex?: number) => {
    if (queue) {
      store.setQueue(queue, queueIndex);
    } else {
      store.setTrack(track);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...store,
    seekTo,
    skipForward,
    skipBackward,
    playTrack,
  };
}

async function saveProgress(lessonId: string, position: number) {
  try {
    await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lesson_id: lessonId,
        position,
        completed: false,
      }),
    });
  } catch {
    // Silent fail - progress saving is best-effort
  }
}
