"use client";

import { audioEngine } from "@/lib/audio-engine";
import {
  LISTEN_SAMPLE_INTERVAL_MS,
  markListenReported,
  recordListenSample,
  shouldReportListen,
  toListenPayload,
  type ListenPayload,
  type ListenSession,
  type ListenSource,
} from "@/lib/listen-tracking";
import { getTrackLessonId } from "@/lib/player-track-actions";
import { getTrackKey, useAudioStore, type AudioPlayerState } from "@/stores/audio-store";

/**
 * Reports listening to POST /api/listen for the admin statistics. Started by
 * the audio controller; observes the store the controller keeps in sync with
 * the element and never touches playback. Delivery is best effort: offline
 * listening is not queued beyond the in-memory session, errors are ignored.
 */

const LISTEN_ENDPOINT = "/api/listen";
const DEVICE_ID_KEY = "tora-listen-device-id";
const DRIVING_PATH = /^\/(he|en)\/driving(\/|$)/;

let session: ListenSession | null = null;
let memoryDeviceId: string | null = null;

/** Random per-browser id (not a fingerprint) so anonymous listeners are counted once. */
function getDeviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    // Storage blocked (private mode): count this page lifetime only.
    memoryDeviceId ??= crypto.randomUUID();
    return memoryDeviceId;
  }
}

function getListenSource(): ListenSource {
  if (DRIVING_PATH.test(window.location.pathname)) return "driving";
  if (audioEngine.getCurrentUrl()?.startsWith("blob:")) return "offline";
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "pwa" : "web";
}

function send(payload: ListenPayload) {
  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon?.(LISTEN_ENDPOINT, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  fetch(LISTEN_ENDPOINT, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {
    // Statistics only; playback never depends on this.
  });
}

/** Sends the session when due and returns it marked as reported. */
function report(current: ListenSession, nowMs: number, flush: boolean): ListenSession {
  // Offline: keep the seconds; the next report after reconnecting carries them.
  if (!shouldReportListen(current, nowMs, flush) || navigator.onLine === false) return current;
  send(toListenPayload(current, getDeviceId(), getListenSource()));
  return markListenReported(current, nowMs);
}

function sample(flush: boolean) {
  const { currentTrack, currentTime, playbackStatus } = useAudioStore.getState();
  const nowMs = Date.now();
  if (!currentTrack) {
    if (session) report(session, nowMs, true);
    session = null;
    return;
  }
  const result = recordListenSample(
    session,
    {
      trackKey: getTrackKey(currentTrack)!,
      lessonId: getTrackLessonId(currentTrack),
      audioFileId: currentTrack.audioFileId ?? null,
      position: currentTime,
      playing: playbackStatus === "playing",
      nowMs,
    },
    () => crypto.randomUUID(),
  );
  if (result.finished) report(result.finished, nowMs, true);
  session = report(result.session, nowMs, flush);
}

function handleStoreChange(state: AudioPlayerState, previous: AudioPlayerState) {
  if (state.playbackStatus !== previous.playbackStatus || state.currentTrack !== previous.currentTrack) {
    const stopped = state.playbackStatus !== "playing" && state.playbackStatus !== "buffering";
    sample(stopped);
    return;
  }
  if (
    state.currentTime !== previous.currentTime &&
    (!session || Date.now() - session.lastSampleAt >= LISTEN_SAMPLE_INTERVAL_MS)
  ) {
    sample(false);
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") sample(true);
}

function handlePageHide() {
  sample(true);
}

export function startListenTracking(): () => void {
  const unsubscribe = useAudioStore.subscribe(handleStoreChange);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
  };
}
