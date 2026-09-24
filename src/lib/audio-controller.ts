"use client";

import { audioEngine, type AudioEngineStatus } from "@/lib/audio-engine";
import { getPlaybackReaction, getRetryDelayMs } from "@/lib/audio-lifecycle";
import { planTrackPlayback, resolveTrackSource } from "@/lib/audio-resume";
import { isLastPart, isNearPartEnd } from "@/lib/lesson-progress";
import { startListenTracking } from "@/lib/listen-tracker";
import { OFFLINE_DOWNLOADS_CHANGED_EVENT } from "@/lib/offline-events";
import {
  getDownloadedLessons,
  getOfflineAudioUrl,
  revokeOfflineAudioUrl,
} from "@/lib/offline-storage";
import {
  SKIP_BACK_SECONDS,
  SKIP_FORWARD_SECONDS,
  getTrackLessonId,
  getTrackOfflineKey,
} from "@/lib/player-track-actions";
import {
  getTrackKey,
  getTransportState,
  useAudioStore,
  type AudioPlayerState,
  type AudioTrack,
} from "@/stores/audio-store";
import { useProgressStore } from "@/stores/progress-store";

/**
 * The single owner of the audio element. Started once by <AudioPlayer/> in the
 * root layout; every surface (lesson page, mini/full player, header, driving
 * mode, lock screen) only changes store state or calls the actions below.
 */

const CHECKPOINT_INTERVAL_MS = 5_000;
const SERVER_PROGRESS_INTERVAL_MS = 30_000;
// Playing this far past the last retry point proves the recovery worked.
const RECOVERY_PROVEN_SECONDS = 10;
// WebKit can leave the first IndexedDB open of a session hanging; stream instead.
const OFFLINE_LOOKUP_TIMEOUT_MS = 3_000;
// A minutes sleep timer fades the volume out over its last seconds.
const SLEEP_FADE_SECONDS = 10;

const getState = useAudioStore.getState;

let downloadedLessonIds: Set<string> | null = null;
// Offline blob URLs resolved ahead of time, so auto-advance and taps can load
// synchronously (no await between the gesture/`ended` event and play()).
const offlineSources = new Map<string, string>();
let loadedTrack: AudioTrack | null = null;
let pendingLoadKey: string | null = null;
let playedTrackKey: string | null = null;
let recovery = { trackKey: null as string | null, attempts: 0, position: 0 };
let retryTimer: number | null = null;
let resumeWhenOnline = false;
let lastCheckpointAt = 0;
let lastServerSaveAt = 0;
let serverProgressEnabled = true;

function isEngineOnCurrentTrack() {
  const key = getTrackKey(getState().currentTrack);
  return key !== null && key === audioEngine.getTrackKey() && pendingLoadKey === null;
}

async function lookupOfflineSource(track: AudioTrack) {
  const source = await Promise.race([
    getOfflineAudioUrl(getTrackLessonId(track), track.audioUrl, track.offlineKey),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), OFFLINE_LOOKUP_TIMEOUT_MS)),
  ]);
  const key = getTrackKey(track);
  if (source && key) offlineSources.set(key, source);
  return source;
}

async function refreshDownloadedLessons() {
  const lessons = await getDownloadedLessons();
  downloadedLessonIds = new Set(lessons.map((lesson) => lesson.lessonId));
}

function handleDownloadsChanged() {
  // Saved/deleted files change which URL a track should use next time.
  for (const [key, source] of offlineSources) {
    if (source !== audioEngine.getCurrentUrl()) offlineSources.delete(key);
  }
  void refreshDownloadedLessons();
}

function loadTrack(track: AudioTrack, source: string, startPosition: number) {
  const key = getTrackKey(track)!;
  const previous = loadedTrack;
  pendingLoadKey = null;
  loadedTrack = track;
  audioEngine.load(source, { trackKey: key, startPosition });
  if (getState().isPlaying) audioEngine.play();

  if (recovery.trackKey !== key) {
    recovery = { trackKey: key, attempts: 0, position: 0 };
  }
  const previousKey = getTrackKey(previous);
  if (previous && previousKey !== key && previousKey && offlineSources.has(previousKey)) {
    offlineSources.delete(previousKey);
    revokeOfflineAudioUrl(getTrackOfflineKey(previous));
  }
}

/** Brings the element in line with the store (track + play intent). */
function syncPlayback() {
  const state = getState();
  const track = state.currentTrack;
  if (!track) {
    pendingLoadKey = null;
    loadedTrack = null;
    audioEngine.unload();
    return;
  }

  const key = getTrackKey(track)!;
  // A lookup for this track is in flight; it applies the latest intent itself.
  if (pendingLoadKey === key) return;

  const plan = planTrackPlayback({
    track,
    loadedTrackKey: audioEngine.getTrackKey(),
    position: state.currentTime,
    cachedSource: offlineSources.get(key),
    downloadedLessonIds,
  });

  if (plan.type === "play-loaded") {
    pendingLoadKey = null; // a lookup for a track we switched away from is moot
    if (state.isPlaying) audioEngine.play();
    else audioEngine.pause();
    return;
  }
  if (plan.type === "load") {
    loadTrack(track, plan.source, plan.startPosition);
    return;
  }

  pendingLoadKey = key;
  audioEngine.pause(); // stop the previous track immediately
  void resolveTrackSource(track, lookupOfflineSource).then((source) => {
    if (pendingLoadKey !== key) return;
    const latest = getState();
    if (!latest.currentTrack || getTrackKey(latest.currentTrack) !== key) {
      pendingLoadKey = null;
      return;
    }
    loadTrack(latest.currentTrack, source, latest.currentTime);
  });
}

function saveServerProgress(track: AudioTrack, position: number, completed: boolean) {
  if (!serverProgressEnabled) return;
  lastServerSaveAt = Date.now();
  fetch("/api/progress", {
    method: "PUT",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lesson_id: getTrackLessonId(track),
      audio_file_id: track.audioFileId ?? null,
      position: Math.round(position),
      completed,
    }),
  })
    .then((response) => {
      // Anonymous listeners keep progress on the device only.
      if (response.status === 401) serverProgressEnabled = false;
    })
    .catch(() => {
      // Best effort: the device copy is authoritative for this listener.
    });
}

/**
 * Saves where the listener is in a lesson: the part and the position in it.
 * Reaching the end of the last part marks the lesson heard; any earlier
 * position (e.g. listening again) clears it.
 */
function recordProgress(
  track: AudioTrack,
  position: number,
  completed = isLastPart(track) && isNearPartEnd(position, audioEngine.getDuration()),
) {
  useProgressStore.getState().saveProgress({
    lessonId: getTrackLessonId(track),
    audioFileId: track.audioFileId,
    position,
    completed,
  });
  return completed;
}

/** Persists the position of the loaded track (resume after reload + progress). */
function checkpoint(options: { server?: boolean } = {}) {
  const state = getState();
  const track = state.currentTrack;
  const key = getTrackKey(track);
  if (!track || !isEngineOnCurrentTrack() || playedTrackKey !== key) return;

  const position = audioEngine.getCurrentTime();
  lastCheckpointAt = Date.now();
  state.setResumePosition(position);
  const completed = recordProgress(track, position);
  if (options.server || lastCheckpointAt - lastServerSaveAt >= SERVER_PROGRESS_INTERVAL_MS) {
    saveServerProgress(track, position, completed);
  }
}

function finishTrack(track: AudioTrack) {
  const state = getState();
  const position = audioEngine.getDuration();
  // A finished earlier part leaves progress at its end, so resuming opens the next part.
  const completed = recordProgress(track, position, isLastPart(track));
  saveServerProgress(track, position, completed);
  state.setResumePosition(0);

  const { sleepTimer } = state;
  const sleepNow =
    sleepTimer?.kind === "end-of-part" || (sleepTimer?.kind === "end-of-lesson" && isLastPart(track));
  if (sleepNow) state.setSleepTimer(null);
  if (!sleepNow && state.queue[state.queueIndex + 1]) state.nextTrack();
  else state.pause();
}

/** Counts down a minutes sleep timer while audio plays, fading out over its last seconds. */
function applySleepTimer() {
  const { sleepTimer, volume, setSleepTimer } = getState();
  if (sleepTimer?.kind !== "minutes") return;
  const remaining = (sleepTimer.endsAt - Date.now()) / 1000;
  if (remaining > 0) {
    audioEngine.setVolume(remaining < SLEEP_FADE_SECONDS ? (volume * remaining) / SLEEP_FADE_SECONDS : volume);
    return;
  }
  setSleepTimer(null);
  pause();
  audioEngine.setVolume(volume);
}

function clearRetry() {
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(key: string) {
  recovery.attempts += 1;
  recovery.position = audioEngine.getCurrentTime();
  getState().setPlaybackIssue("retrying");
  clearRetry();
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    const state = getState();
    if (!state.isPlaying || getTrackKey(state.currentTrack) !== key || !isEngineOnCurrentTrack()) {
      return;
    }
    audioEngine.reload();
    audioEngine.play();
  }, getRetryDelayMs(recovery.attempts));
}

function prefetchNextOfflineSource() {
  const { queue, queueIndex } = getState();
  const next = queue[queueIndex + 1];
  const key = getTrackKey(next);
  if (!next || !key || offlineSources.has(key)) return;
  if (downloadedLessonIds && !downloadedLessonIds.has(getTrackLessonId(next))) return;
  void lookupOfflineSource(next);
}

function handleStatusChange(status: AudioEngineStatus) {
  const state = getState();
  state.setPlaybackStatus(status);
  const track = state.currentTrack;
  // Events of a track we are switching away from must not steer the new one.
  if (!track || !isEngineOnCurrentTrack()) return;
  const key = getTrackKey(track)!;

  if (status === "playing") {
    playedTrackKey = key;
    if (state.playbackIssue) state.setPlaybackIssue(null);
    // Playing again after a minutes timer ran out (while paused) starts fresh.
    if (state.sleepTimer?.kind === "minutes" && state.sleepTimer.endsAt <= Date.now()) state.setSleepTimer(null);
    prefetchNextOfflineSource();
  } else if (status === "paused" || status === "error") {
    checkpoint({ server: true });
  }

  const reaction = getPlaybackReaction({
    status,
    intentPlaying: state.isPlaying,
    position: audioEngine.getCurrentTime(),
    duration: audioEngine.getDuration(),
    online: navigator.onLine,
    recoveryAttempts: recovery.attempts,
  });

  switch (reaction) {
    case "sync-playing":
      state.play();
      break;
    case "sync-paused":
      state.pause();
      break;
    case "advance":
      finishTrack(track);
      break;
    case "retry":
      scheduleRetry(key);
      break;
    case "fail":
      resumeWhenOnline = !navigator.onLine;
      state.pause();
      state.setPlaybackIssue("failed");
      break;
  }
}

function handleTimeUpdate(time: number) {
  if (!isEngineOnCurrentTrack()) return;
  getState().setCurrentTime(time);
  if (recovery.attempts > 0 && time > recovery.position + RECOVERY_PROVEN_SECONDS) {
    recovery.attempts = 0;
  }
  if (Date.now() - lastCheckpointAt >= CHECKPOINT_INTERVAL_MS) checkpoint();
  applySleepTimer();
}

function handleStoreChange(state: AudioPlayerState, previous: AudioPlayerState) {
  if (state.playbackSpeed !== previous.playbackSpeed) audioEngine.setRate(state.playbackSpeed);
  // A changed or cancelled sleep timer ends any fade in progress.
  if (state.volume !== previous.volume || state.sleepTimer !== previous.sleepTimer) {
    audioEngine.setVolume(state.volume);
  }

  if (getTrackKey(state.currentTrack) !== getTrackKey(previous.currentTrack)) {
    // Remember where the previous track was left before the element switches.
    if (previous.currentTrack && playedTrackKey === getTrackKey(previous.currentTrack)) {
      recordProgress(previous.currentTrack, audioEngine.getCurrentTime());
    }
    clearRetry();
    syncPlayback();
    return;
  }

  if (state.isPlaying !== previous.isPlaying) {
    if (state.isPlaying) syncPlayback();
    else audioEngine.pause();
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") checkpoint({ server: true });
  // Events may have been dropped while the page was frozen.
  else audioEngine.refresh();
}

function handlePageHide() {
  checkpoint({ server: true });
}

function handleOnline() {
  if (!resumeWhenOnline) return;
  resumeWhenOnline = false;
  if (getState().playbackIssue !== "failed") return;
  recovery.attempts = 0;
  play();
}

let stopController: (() => void) | null = null;

export function startAudioController(): () => void {
  if (stopController) return stopController;

  const state = getState();
  audioEngine.setRate(state.playbackSpeed);
  audioEngine.setVolume(state.volume);
  audioEngine.setHandlers({
    onStatusChange: handleStatusChange,
    onTimeUpdate: handleTimeUpdate,
    onDurationChange: (duration) => {
      if (isEngineOnCurrentTrack()) getState().setDuration(duration);
    },
    onPlayBlocked: () => {
      const latest = getState();
      latest.pause();
      latest.setPlaybackIssue("blocked");
    },
  });

  const unsubscribe = useAudioStore.subscribe(handleStoreChange);
  const stopListenTracking = startListenTracking();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("online", handleOnline);
  window.addEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleDownloadsChanged);
  void refreshDownloadedLessons();
  // Prepare the restored track so the first tap can play synchronously.
  syncPlayback();

  stopController = () => {
    unsubscribe();
    stopListenTracking();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("online", handleOnline);
    window.removeEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleDownloadsChanged);
    clearRetry();
    stopController = null;
  };
  return stopController;
}

// ── Actions: the only way UI and OS controls change playback ──

export function play() {
  const state = getState();
  if (!state.currentTrack) return;
  const alreadyRequested = state.isPlaying;
  state.play();
  // An unchanged intent does not reach the store subscriber (e.g. retrying
  // after an error), so drive the element directly.
  if (alreadyRequested) syncPlayback();
}

export function pause() {
  getState().pause();
  audioEngine.pause();
}

export function togglePlay() {
  if (getTransportState(getState()) === "paused") play();
  else pause();
}

export function seekTo(time: number) {
  const state = getState();
  if (!state.currentTrack) return;
  // Until the element holds this track it still reports the previous one's duration.
  const onTrack = isEngineOnCurrentTrack();
  const duration = (onTrack && audioEngine.getDuration()) || state.duration;
  const target = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
  // Before the element holds this track, the store position becomes its start position.
  if (onTrack) audioEngine.seek(target);
  state.setCurrentTime(target);
  state.setResumePosition(target);
}

export function skipBy(seconds: number) {
  const current = isEngineOnCurrentTrack() ? audioEngine.getCurrentTime() : getState().currentTime;
  seekTo(current + seconds);
}

export function skipBackward() {
  skipBy(-SKIP_BACK_SECONDS);
}

export function skipForward() {
  skipBy(SKIP_FORWARD_SECONDS);
}

/** Starts a track (and optionally a queue around it), then seeks when asked. */
export function playTrack(
  track: AudioTrack,
  options: { queue?: AudioTrack[]; queueIndex?: number; startAt?: number } = {},
) {
  const state = getState();
  if (options.queue) state.setQueue(options.queue, options.queueIndex);
  else state.setTrack(track);
  if (options.startAt !== undefined) seekTo(options.startAt);
}

/** Car/headset "next": next lesson in the queue, otherwise skip ahead. */
export function nextTrackOrSkip() {
  const { queue, queueIndex, nextTrack } = getState();
  if (queue[queueIndex + 1]) nextTrack();
  else skipForward();
}

/** Car/headset "previous": previous lesson in the queue, otherwise skip back. */
export function previousTrackOrSkip() {
  const { queueIndex, previousTrack } = getState();
  if (queueIndex > 0) previousTrack();
  else skipBackward();
}
