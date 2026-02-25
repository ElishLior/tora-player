'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAudioStore, type AudioTrack } from '@/stores/audio-store';
import { audioEngine } from '@/lib/audio-engine';

const PROGRESS_SAVE_INTERVAL = 10000; // Save progress every 10 seconds

export function useAudioPlayer() {
  const store = useAudioStore();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTimeRef = useRef(0);

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

  // Load track when it changes
  useEffect(() => {
    if (!store.currentTrack?.audioUrl) return;

    audioEngine.load(store.currentTrack.audioUrl, {
      startPosition: store.currentTime > 0 ? store.currentTime : undefined,
    });

    if (store.isPlaying) {
      audioEngine.play();
    }
  }, [store.currentTrack?.id, store.currentTrack?.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause — only if a track is loaded
  useEffect(() => {
    if (!store.currentTrack) return;
    if (store.isPlaying) {
      audioEngine.play();
    } else {
      audioEngine.pause();
    }
  }, [store.isPlaying, store.currentTrack?.id]);

  // Sync volume
  useEffect(() => {
    audioEngine.setVolume(store.volume);
  }, [store.volume]);

  // Sync playback speed
  useEffect(() => {
    audioEngine.setRate(store.playbackSpeed);
  }, [store.playbackSpeed]);

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
