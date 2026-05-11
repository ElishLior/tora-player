"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { audioEngine, type NativeAudioEventSnapshot } from "@/lib/audio-engine";
import {
  getAudioRecoveryAction,
  getNativeAudioSyncAction,
  type NativeAudioLifecycleEvent,
} from "@/lib/audio-lifecycle";
import {
  getOfflineAudioUrl,
  getOfflineKey,
  revokeOfflineAudioUrl,
} from "@/lib/offline-storage";
import { resumeTrackPlayback } from "@/lib/audio-resume";

const PROGRESS_SAVE_INTERVAL = 10000; // Save progress every 10 seconds

function applyAudioElementAttributes() {
  const audioEl = audioEngine.getAudioElement();
  if (audioEl) {
    audioEl.setAttribute("playsinline", "");
    audioEl.setAttribute("webkit-playsinline", "");
  }
}

function isSameAudioTrack(
  a: AudioTrack | null | undefined,
  b: AudioTrack | null | undefined,
) {
  if (!a || !b) return false;
  return (
    (a.lessonId || a.id) === (b.lessonId || b.id) &&
    a.audioUrl === b.audioUrl &&
    (a.offlineKey || "") === (b.offlineKey || "")
  );
}

function mapNativeEventToState(
  event: NativeAudioEventSnapshot,
): "playing" | "paused" | "waiting" | "stalled" | "errored" | "ended" {
  if (event.errored || event.type === "error") return "errored";
  if (event.ended || event.type === "ended") return "ended";
  if (event.type === "waiting") return "waiting";
  if (event.type === "stalled" || event.type === "suspend") return "stalled";
  if (event.type === "playing") return "playing";
  if (!event.paused) return "playing";
  return "paused";
}

function getTrackKey(track: AudioTrack | null | undefined) {
  if (!track) return "none";
  return [
    track.lessonId || track.id,
    track.audioFileId || "",
    track.offlineKey || "",
    track.audioUrl,
  ].join("|");
}

function getTrackIdentity(track: AudioTrack) {
  return {
    lessonId: track.lessonId || track.id,
    audioFileId: track.audioFileId,
    offlineKey: track.offlineKey,
    sourceUrl: track.audioUrl,
  };
}

function isNativeEventForCurrentTrack(
  event: NativeAudioEventSnapshot,
  track: AudioTrack | null,
) {
  if (!track || !event.loadedTrackIdentity) return false;
  const identity = event.loadedTrackIdentity;
  return (
    (identity.lessonId || track.lessonId || track.id) ===
      (track.lessonId || track.id) &&
    (identity.audioFileId || "") === (track.audioFileId || "") &&
    (identity.offlineKey || "") === (track.offlineKey || "") &&
    (identity.sourceUrl === track.audioUrl ||
      identity.resolvedUrl === audioEngine.getCurrentUrl())
  );
}

function handleNativeAudioEvent(event: NativeAudioEventSnapshot) {
  const state = useAudioStore.getState();
  const trackKey = getTrackKey(state.currentTrack);
  const recoveryAttempt = state.recoveryAttemptsByTrack[trackKey];
  const now = Date.now();
  const nativePlaybackState = mapNativeEventToState(event);
  const sameTrack = isNativeEventForCurrentTrack(event, state.currentTrack);
  const wasRecovering =
    state.playbackRecoveryState === "recovering" ||
    state.playbackRecoveryState === "stalled" ||
    state.playbackRecoveryState === "needs-user-gesture";
  const recovered =
    nativePlaybackState === "playing" && sameTrack && wasRecovering;

  state.setNativePlaybackState(nativePlaybackState);
  if (recovered) {
    state.markPlaybackRecoverySucceeded(trackKey);
    state.addPlaybackDiagnostic({
      at: new Date().toISOString(),
      event: event.type,
      action: "none",
      trackId: state.currentTrack?.id,
      audioFileId: state.currentTrack?.audioFileId,
      offlineKey: state.currentTrack?.offlineKey,
      currentTime: audioEngine.getCurrentTime(),
      result: "succeeded",
    });
    return;
  } else if (nativePlaybackState === "playing") {
    state.setPlaybackRecoveryState("idle");
  } else if (!state.isPlaying && nativePlaybackState === "paused") {
    state.setPlaybackRecoveryState("idle");
  } else if (state.isPlaying && nativePlaybackState === "paused") {
    state.setPlaybackRecoveryState("stalled");
  } else if (
    nativePlaybackState === "waiting" ||
    nativePlaybackState === "stalled"
  ) {
    state.setPlaybackRecoveryState("stalled");
  } else if (nativePlaybackState === "errored") {
    state.setPlaybackRecoveryState("failed");
  }

  const lifecycleEvent = event.type as NativeAudioLifecycleEvent;
  const lifecycleSnapshot = {
    intentPlaying: state.isPlaying,
    engineLoaded: audioEngine.isLoaded(),
    enginePlaying: audioEngine.isPlaying(),
    nativePaused: event.paused,
    nativeEnded: event.ended,
    nativeErrored: event.errored,
    documentVisible: document.visibilityState === "visible",
    online: navigator.onLine,
    currentTime: audioEngine.getCurrentTime(),
    duration: audioEngine.getDuration(),
    userPausedAt: state.isPlaying ? null : Date.now(),
    sameTrack,
    recoveryAttemptsForTrack: recoveryAttempt?.count ?? 0,
    msSinceLastRecovery: recoveryAttempt
      ? now - recoveryAttempt.lastAttemptAt
      : Number.POSITIVE_INFINITY,
    playBlockedByBrowser: recoveryAttempt?.playBlocked ?? false,
  };

  const syncAction = getNativeAudioSyncAction(lifecycleEvent, lifecycleSnapshot);
  if (syncAction === "mark-playing") {
    state.play();
    state.setPlaybackRecoveryState("idle");
    state.addPlaybackDiagnostic({
      at: new Date().toISOString(),
      event: event.type,
      action: syncAction,
      trackId: state.currentTrack?.id,
      audioFileId: state.currentTrack?.audioFileId,
      offlineKey: state.currentTrack?.offlineKey,
      currentTime: audioEngine.getCurrentTime(),
      result: "succeeded",
    });
    return;
  }

  const action = getAudioRecoveryAction(lifecycleEvent, lifecycleSnapshot);

  state.addPlaybackDiagnostic({
    at: new Date().toISOString(),
    event: event.type,
    action,
    trackId: state.currentTrack?.id,
    audioFileId: state.currentTrack?.audioFileId,
    offlineKey: state.currentTrack?.offlineKey,
    currentTime: audioEngine.getCurrentTime(),
    result:
      action === "wait-for-cooldown"
        ? "cooldown"
        : action === "needs-user-gesture"
          ? "blocked"
          : action === "none"
            ? "ignored"
            : "attempted",
  });

  if (action === "wait-for-cooldown") return;
  if (action === "needs-user-gesture") {
    state.markPlaybackNeedsUserGesture(trackKey);
    return;
  }

  if (action === "resume-current-track" || action === "reload-current-track") {
    if (state.currentTrack) {
      state.markPlaybackRecoveryAttempt(trackKey);
      void resumeCurrentTrackPlayback(state.currentTrack, state.currentTime, {
        forceReload: action === "reload-current-track",
      });
    }
    return;
  }

  if (action === "mark-ended") {
    // Howler's onend callback remains the queue authority. The native ended
    // event can fire for the same transition, so avoid double-advancing.
    state.pause();
  }
}

async function resumeCurrentTrackPlayback(
  track: AudioTrack,
  currentTime: number,
  options?: { forceReload?: boolean },
) {
  const resumed = await resumeTrackPlayback(
    { track, currentTime, forceReload: options?.forceReload },
    {
      getOfflineAudioUrl: (currentTrack) =>
        getOfflineAudioUrl(
          currentTrack.lessonId || currentTrack.id,
          currentTrack.audioUrl,
          currentTrack.offlineKey,
        ),
      ensurePlaying: audioEngine.ensurePlaying.bind(audioEngine),
      markPlaying: () => useAudioStore.getState().play(),
      isEngineLoaded: () => audioEngine.isLoaded(),
      getCurrentEngineUrl: () => audioEngine.getCurrentUrl(),
      isLoadedUrlCurrentTrack: (url, currentTrack) => {
        if (url === currentTrack.audioUrl) return true;
        const snapshot = audioEngine.getNativeAudioSnapshot();
        return snapshot
          ? isNativeEventForCurrentTrack(snapshot, currentTrack)
          : false;
      },
      isStillCurrent: (currentTrack) =>
        isSameAudioTrack(useAudioStore.getState().currentTrack, currentTrack),
      shouldResume: () => useAudioStore.getState().isPlaying,
    },
  );

  if (resumed) applyAudioElementAttributes();
  return resumed;
}

export function useAudioPlayer() {
  const store = useAudioStore();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTimeRef = useRef(0);
  const prevOfflineKeyRef = useRef<string | null>(null);

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
      console.error("Audio error:", error);
      const state = useAudioStore.getState();
      state.addPlaybackDiagnostic({
        at: new Date().toISOString(),
        event: "howler-error",
        action: "logged",
        trackId: state.currentTrack?.id,
        audioFileId: state.currentTrack?.audioFileId,
        offlineKey: state.currentTrack?.offlineKey,
        currentTime: audioEngine.getCurrentTime(),
      });
    });

    audioEngine.setOnNativeAudioEvent(handleNativeAudioEvent);
  }, [store.currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load track when it changes — check offline storage first
  useEffect(() => {
    if (!store.currentTrack?.audioUrl) return;

    const trackOfflineKey =
      store.currentTrack.offlineKey ||
      getOfflineKey(
        store.currentTrack.lessonId || store.currentTrack.id,
        store.currentTrack,
      );

    // Revoke old blob URL when switching tracks/files to free memory
    if (
      prevOfflineKeyRef.current &&
      prevOfflineKeyRef.current !== trackOfflineKey
    ) {
      revokeOfflineAudioUrl(prevOfflineKeyRef.current);
    }
    prevOfflineKeyRef.current = trackOfflineKey;

    let cancelled = false;

    async function loadTrack() {
      const track = useAudioStore.getState().currentTrack;
      if (!track?.audioUrl || cancelled) return;

      // Try offline blob URL first, fall back to streaming URL
      let url = track.audioUrl;
      try {
        const offlineUrl = await getOfflineAudioUrl(
          track.lessonId || track.id,
          track.audioUrl,
          track.offlineKey,
        );
        if (offlineUrl && !cancelled) {
          url = offlineUrl;
        }
      } catch {
        // Offline storage unavailable — use network URL
      }

      if (cancelled) return;

      audioEngine.load(url, {
        startPosition:
          useAudioStore.getState().currentTime > 0
            ? useAudioStore.getState().currentTime
            : undefined,
        trackIdentity: getTrackIdentity(track),
      });

      // Set proper attributes on the native <audio> element for iOS background playback
      applyAudioElementAttributes();

      // If the user switched tracks while playback was already active, the
      // play/pause sync effect may have seen the previous track still playing.
      // Resume this newly loaded URL only when play intent and track identity
      // are still current.
      const latestState = useAudioStore.getState();
      if (
        latestState.isPlaying &&
        isSameAudioTrack(latestState.currentTrack, track)
      ) {
        audioEngine.ensurePlaying(url, {
          startPosition:
            latestState.currentTime > 0 ? latestState.currentTime : undefined,
          trackIdentity: getTrackIdentity(track),
        });
      }
    }

    loadTrack();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.currentTrack?.id,
    store.currentTrack?.audioUrl,
    store.currentTrack?.offlineKey,
  ]);

  // Re-initialize audio when app comes back to foreground (browser may have killed audio context)
  useEffect(() => {
    function handleVisibilityChange() {
      const state = useAudioStore.getState();
      if (!state.currentTrack?.audioUrl) return;
      const snapshot = audioEngine.getNativeAudioSnapshot(
        document.visibilityState === "visible"
          ? "visibility-visible"
          : "visibility-hidden",
      );
      if (snapshot) handleNativeAudioEvent(snapshot);
      if (document.visibilityState !== "visible") return;

      // If the browser dropped the audio node entirely, there is no native
      // snapshot to reconcile, so recover through the same identity-aware helper.
      if (!snapshot && state.isPlaying) {
        const trackKey = getTrackKey(state.currentTrack);
        const recoveryAttempt = state.recoveryAttemptsByTrack[trackKey];
        const action = getAudioRecoveryAction("visibility-visible", {
          intentPlaying: state.isPlaying,
          engineLoaded: audioEngine.isLoaded(),
          enginePlaying: false,
          nativePaused: true,
          nativeEnded: false,
          nativeErrored: false,
          documentVisible: true,
          online: navigator.onLine,
          currentTime: state.currentTime,
          duration: state.duration,
          userPausedAt: null,
          sameTrack: true,
          recoveryAttemptsForTrack: recoveryAttempt?.count ?? 0,
          msSinceLastRecovery: recoveryAttempt
            ? Date.now() - recoveryAttempt.lastAttemptAt
            : Number.POSITIVE_INFINITY,
          playBlockedByBrowser: recoveryAttempt?.playBlocked ?? false,
        });

        state.addPlaybackDiagnostic({
          at: new Date().toISOString(),
          event: "native-node-missing",
          action,
          trackId: state.currentTrack.id,
          audioFileId: state.currentTrack.audioFileId,
          offlineKey: state.currentTrack.offlineKey,
          currentTime: state.currentTime,
          result:
            action === "wait-for-cooldown"
              ? "cooldown"
              : action === "needs-user-gesture"
                ? "blocked"
                : action === "none"
                  ? "ignored"
                  : "attempted",
        });

        if (action === "wait-for-cooldown") return;
        if (action === "needs-user-gesture") {
          state.markPlaybackNeedsUserGesture(trackKey);
          return;
        }
        if (
          action === "resume-current-track" ||
          action === "reload-current-track"
        ) {
          state.markPlaybackRecoveryAttempt(trackKey);
          void resumeCurrentTrackPlayback(
            state.currentTrack,
            state.currentTime,
            {
              forceReload: true,
            },
          );
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []); // Empty deps — uses getState() for fresh state

  // Sync play/pause — re-load engine if needed, then play/pause
  // This is the SOLE authority for calling audioEngine.play()/pause()
  useEffect(() => {
    if (!store.currentTrack) return;
    if (store.isPlaying) {
      // Guard: if the active sound is really playing, don't call play() again.
      if (audioEngine.isPlaying() && !audioEngine.isNativePaused()) return;

      if (store.currentTrack.audioUrl) {
        void resumeCurrentTrackPlayback(store.currentTrack, store.currentTime);
      }
    } else {
      audioEngine.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    store.isPlaying,
    store.currentTrack?.id,
    store.currentTrack?.audioUrl,
    store.currentTrack?.offlineKey,
  ]);

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
      preloadRef.current.removeAttribute("src");
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
    preloadAudio.preload = "auto";
    preloadAudio.src = nextTrack.audioUrl;
    preloadRef.current = preloadAudio;

    return () => {
      if (preloadRef.current) {
        preloadRef.current.pause();
        preloadRef.current.removeAttribute("src");
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
        saveProgress(
          store.currentTrack!.lessonId || store.currentTrack!.id,
          Math.round(currentTime),
        );
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
    const newTime = Math.min(
      audioEngine.getCurrentTime() + seconds,
      audioEngine.getDuration(),
    );
    audioEngine.seek(newTime);
    store.setCurrentTime(newTime);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const skipBackward = useCallback((seconds = 15) => {
    const newTime = Math.max(audioEngine.getCurrentTime() - seconds, 0);
    audioEngine.seek(newTime);
    store.setCurrentTime(newTime);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resumePlayback = useCallback(() => {
    const state = useAudioStore.getState();
    if (!state.currentTrack?.audioUrl) return Promise.resolve(false);
    state.play();
    return resumeCurrentTrackPlayback(state.currentTrack, state.currentTime);
  }, []);

  // Play a specific track
  const playTrack = useCallback(
    (track: AudioTrack, queue?: AudioTrack[], queueIndex?: number) => {
      if (queue) {
        store.setQueue(queue, queueIndex);
      } else {
        store.setTrack(track);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    ...store,
    seekTo,
    skipForward,
    skipBackward,
    resumePlayback,
    playTrack,
  };
}

async function saveProgress(lessonId: string, position: number) {
  try {
    await fetch("/api/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
