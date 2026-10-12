import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";
import { shallow } from "zustand/shallow";
import type { AudioEngineStatus } from "@/lib/audio-engine";
import {
  appendUniqueTracks,
  type QueueNotice,
  type QueueSource,
  type SegmentPage,
} from "@/lib/queue-source";

export interface AudioTrack {
  id: string;
  lessonId?: string;
  lessonSlug?: string;
  audioFileId?: string;
  /** Position of this file among the lesson's parts (0-based) and how many there are. */
  partIndex?: number;
  partCount?: number;
  fileKey?: string;
  offlineKey?: string;
  title: string;
  hebrewTitle: string;
  audioUrl: string;
  audioUrlFallback?: string;
  duration: number;
  seriesName?: string;
  /** Set when the lesson belongs to a series; the player links the name to it. */
  seriesId?: string;
  date: string;
  artworkUrl?: string;
  description?: string;
  originalName?: string;
  mimeType?: string;
}

/**
 * Why the element is not playing although the listener asked for playback:
 * - retrying: a network/decode failure is being retried automatically
 * - blocked: the browser refused play() without a fresh tap
 * - failed: retries are exhausted (or the device is offline)
 */
export type PlaybackIssue = "retrying" | "blocked" | "failed";

/**
 * Stops playback after a number of minutes (wall clock, fading out at the
 * end), at the end of the current part, or at the end of the lesson.
 * Never persisted: a reload starts without a timer.
 */
export type SleepTimer =
  | { kind: "minutes"; endsAt: number }
  | { kind: "end-of-part" }
  | { kind: "end-of-lesson" };

/** Stable identity of one audio file of one lesson. */
export function getTrackKey(track: AudioTrack | null | undefined): string | null {
  if (!track) return null;
  return [
    track.lessonId || track.id,
    track.audioFileId || "",
    track.offlineKey || "",
    track.audioUrl,
  ].join("|");
}

export interface AudioPlayerState {
  currentTrack: AudioTrack | null;
  queue: AudioTrack[];
  queueIndex: number;
  /** Playback the listener asked for. The controller keeps it in sync with the element. */
  isPlaying: boolean;
  /** What the audio element is actually doing. */
  playbackStatus: AudioEngineStatus;
  playbackIssue: PlaybackIssue | null;
  currentTime: number;
  duration: number;
  /** Last checkpointed position of currentTrack; restored after a reload. */
  resumePosition: number;
  volume: number;
  playbackSpeed: number;
  isMiniPlayerExpanded: boolean;
  sleepTimer: SleepTimer | null;
  /** Where the queue came from (a category session keeps loading lessons). Null for other queues. */
  queueSource: QueueSource | null;
  /** What a category queue is doing, shown inline. Not persisted. */
  queueNotice: QueueNotice | null;

  /** Plays a single track. Keeps the queue only when the track is part of it. */
  setTrack: (track: AudioTrack) => void;
  /** Replaces the queue and sets its source in the same update (null for a plain queue). */
  setQueue: (tracks: AudioTrack[], startIndex?: number, source?: QueueSource | null) => void;
  /**
   * Adds a loaded segment to the end of the queue, if `sessionId` is still the
   * current session. Never moves queueIndex. False when the segment was dropped.
   */
  appendQueueSegment: (sessionId: string, page: SegmentPage) => boolean;
  setQueueNotice: (notice: QueueNotice | null) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  /**
   * Queues tracks right after the current one (moving them if already queued).
   * Needs a loaded track; the current track itself is never duplicated.
   */
  playNext: (tracks: AudioTrack[]) => void;
  /** Drops a queue item. The current track cannot be removed. */
  removeFromQueue: (index: number) => void;
  /** Moves a queue item; the current track keeps playing and queueIndex follows it. */
  moveInQueue: (from: number, to: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setResumePosition: (position: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setPlaybackStatus: (status: AudioEngineStatus) => void;
  setPlaybackIssue: (issue: PlaybackIssue | null) => void;
  toggleMiniPlayer: () => void;
  setSleepTimer: (timer: SleepTimer | null) => void;
}

type PersistedAudioState = Pick<
  AudioPlayerState,
  "currentTrack" | "queue" | "queueIndex" | "queueSource" | "resumePosition" | "volume" | "playbackSpeed"
>;

/** What the play/pause control shows: pause, a spinner (still pauses), or play. */
export type TransportState = "playing" | "loading" | "paused";

/**
 * A category queue's ended lesson is waiting for the next segment while the
 * listener still wants to hear the queue. Only pause() cancels this wait.
 */
export function isAwaitingNextLesson(
  state: Pick<AudioPlayerState, "isPlaying" | "playbackStatus" | "queueNotice">,
): boolean {
  return state.isPlaying && state.playbackStatus === "ended" && state.queueNotice?.kind === "loading";
}

/**
 * The element is the source of truth. A play request that is still loading or
 * retrying counts as "loading" so a tap cancels it instead of re-requesting.
 * The wait for the next category lesson counts as "loading" too (it keeps going).
 */
export function getTransportState(
  state: Pick<AudioPlayerState, "isPlaying" | "playbackStatus" | "playbackIssue" | "queueNotice">,
): TransportState {
  if (state.playbackStatus === "playing") return "playing";
  if (state.playbackStatus === "buffering") return "loading";
  if (isAwaitingNextLesson(state)) return "loading";
  if (!state.isPlaying || state.playbackStatus === "ended") return "paused";
  return state.playbackStatus === "error" && state.playbackIssue !== "retrying"
    ? "paused"
    : "loading";
}

/** Queue items kept behind the current one in storage; everything ahead is kept. */
export const PERSISTED_QUEUE_BEHIND = 50;

/**
 * The queue as storage keeps it: the current item, up to PERSISTED_QUEUE_BEHIND
 * items before it and everything after it, with queueIndex moved to match.
 * Items lose `description` (display-only; the full player reads only the current
 * track's, which is kept). The live queue is never trimmed.
 */
export function persistableQueue(
  queue: AudioTrack[],
  queueIndex: number,
): { queue: AudioTrack[]; queueIndex: number } {
  const start = Math.max(0, queueIndex - PERSISTED_QUEUE_BEHIND);
  return {
    queue: queue.slice(start).map((track) => {
      if (track.description === undefined) return track;
      const stored = { ...track };
      delete stored.description;
      return stored;
    }),
    queueIndex: queueIndex - start,
  };
}

/**
 * Returns the same persistableQueue result while the live queue and index are
 * unchanged, so the storage write check (shallow compare) skips the ~4 Hz
 * currentTime updates instead of rewriting the whole queue each time.
 */
function createQueuePersister() {
  let last: { queue: AudioTrack[]; queueIndex: number; result: ReturnType<typeof persistableQueue> } | null = null;
  return (queue: AudioTrack[], queueIndex: number) => {
    if (last?.queue !== queue || last.queueIndex !== queueIndex) {
      last = { queue, queueIndex, result: persistableQueue(queue, queueIndex) };
    }
    return last.result;
  };
}
const persistQueue = createQueuePersister();

function startTrack(track: AudioTrack) {
  return {
    currentTrack: track,
    currentTime: 0,
    duration: track.duration || 0,
    resumePosition: 0,
    isPlaying: true,
    // The element still reports the previous track until the new one loads.
    playbackStatus: "idle" as const,
    playbackIssue: null,
  };
}

/**
 * localStorage writes only when a persisted field actually changed, so the
 * ~4 Hz currentTime updates never touch storage.
 */
function createAudioStorage(): PersistStorage<PersistedAudioState> | undefined {
  const storage = createJSONStorage<PersistedAudioState>(() => window.localStorage);
  if (!storage) return undefined;
  let lastWritten: PersistedAudioState | null = null;
  return {
    ...storage,
    setItem: (name, value) => {
      if (lastWritten && shallow(lastWritten, value.state)) return;
      lastWritten = value.state;
      return storage.setItem(name, value);
    },
  };
}

export const useAudioStore = create<AudioPlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      isPlaying: false,
      playbackStatus: "idle",
      playbackIssue: null,
      currentTime: 0,
      duration: 0,
      resumePosition: 0,
      volume: 1,
      playbackSpeed: 1,
      isMiniPlayerExpanded: false,
      sleepTimer: null,
      queueSource: null,
      queueNotice: null,

      setTrack: (track) => {
        const key = getTrackKey(track);
        const { currentTrack, queue } = get();
        // Same file again (e.g. tapping it on the lesson page): keep its position.
        if (getTrackKey(currentTrack) === key) {
          set({ isPlaying: true, playbackIssue: null });
          return;
        }
        const index = queue.findIndex((item) => getTrackKey(item) === key);
        // A track inside the current queue keeps that queue and its source; any other track starts a plain one.
        set({
          ...startTrack(track),
          ...(index >= 0
            ? { queueIndex: index }
            : { queue: [track], queueIndex: 0, queueSource: null, queueNotice: null }),
        });
      },

      setQueue: (tracks, startIndex = 0, source = null) => {
        const track = tracks[startIndex];
        if (!track) return;
        set({
          ...startTrack(track),
          queue: tracks,
          queueIndex: startIndex,
          queueSource: source,
          queueNotice: null,
        });
      },

      appendQueueSegment: (sessionId, page) => {
        const { queueSource, queue } = get();
        if (!queueSource || queueSource.sessionId !== sessionId) return false;
        set({
          queue: appendUniqueTracks(queue, page.tracks),
          queueSource: {
            ...queueSource,
            cursor: page.cursor ?? queueSource.cursor,
            exhausted: page.exhausted,
          },
        });
        return true;
      },

      setQueueNotice: (notice) => set({ queueNotice: notice }),

      nextTrack: () => {
        const { queue, queueIndex } = get();
        const next = queue[queueIndex + 1];
        if (next) set({ ...startTrack(next), queueIndex: queueIndex + 1 });
      },

      previousTrack: () => {
        const { queue, queueIndex } = get();
        const previous = queueIndex > 0 ? queue[queueIndex - 1] : undefined;
        if (previous) set({ ...startTrack(previous), queueIndex: queueIndex - 1 });
      },

      playNext: (tracks) => {
        const { currentTrack, queue, queueIndex } = get();
        if (!currentTrack) return;
        const currentKey = getTrackKey(currentTrack);
        const incoming = tracks.filter((track) => getTrackKey(track) !== currentKey);
        if (incoming.length === 0) return;
        const incomingKeys = new Set(incoming.map(getTrackKey));
        // A restored queue that lost track of the current item starts over from it.
        const base = getTrackKey(queue[queueIndex]) === currentKey ? queue : [currentTrack];
        const baseIndex = base === queue ? queueIndex : 0;
        const kept: AudioTrack[] = [];
        let index = 0;
        base.forEach((item, i) => {
          if (i === baseIndex) index = kept.length;
          else if (incomingKeys.has(getTrackKey(item))) return;
          kept.push(item);
        });
        kept.splice(index + 1, 0, ...incoming);
        set({ queue: kept, queueIndex: index });
      },

      removeFromQueue: (index) => {
        const { queue, queueIndex } = get();
        if (index === queueIndex || index < 0 || index >= queue.length) return;
        set({
          queue: queue.filter((_, i) => i !== index),
          queueIndex: index < queueIndex ? queueIndex - 1 : queueIndex,
        });
      },

      moveInQueue: (from, to) => {
        const { queue, queueIndex } = get();
        if (from === to || !queue[from] || !queue[to]) return;
        const next = [...queue];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        let index = queueIndex;
        if (from === queueIndex) index = to;
        else if (from < queueIndex && to >= queueIndex) index -= 1;
        else if (from > queueIndex && to <= queueIndex) index += 1;
        set({ queue: next, queueIndex: index });
      },

      play: () => set({ isPlaying: true, playbackIssue: null }),
      pause: () => set({ isPlaying: false, playbackIssue: null }),
      togglePlay: () => {
        // A category waiting for its next lesson keeps waiting; only pause() cancels it.
        if (isAwaitingNextLesson(get())) return;
        if (getTransportState(get()) === "paused") set({ isPlaying: true, playbackIssue: null });
        else set({ isPlaying: false });
      },

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setResumePosition: (position) => set({ resumePosition: position }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setPlaybackStatus: (status) => set({ playbackStatus: status }),
      setPlaybackIssue: (issue) => set({ playbackIssue: issue }),
      setSleepTimer: (timer) => set({ sleepTimer: timer }),
      toggleMiniPlayer: () =>
        set((state) => ({ isMiniPlayerExpanded: !state.isMiniPlayerExpanded })),
    }),
    {
      name: "tora-player-audio",
      version: 1,
      storage: createAudioStorage(),
      // isPlaying is intentionally not persisted: a reload must never auto-play.
      partialize: (state): PersistedAudioState => {
        const queue = persistQueue(state.queue, state.queueIndex);
        return {
          currentTrack: state.currentTrack,
          queue: queue.queue,
          queueIndex: queue.queueIndex,
          queueSource: state.queueSource,
          resumePosition: state.resumePosition,
          volume: state.volume,
          playbackSpeed: state.playbackSpeed,
        };
      },
      // v0 persisted the live currentTime instead of a checkpoint.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PersistedAudioState> & { currentTime?: number };
        if (version === 0) {
          const { currentTime, ...rest } = state;
          return { ...rest, resumePosition: currentTime ?? 0 } as PersistedAudioState;
        }
        return state as PersistedAudioState;
      },
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<PersistedAudioState>;
        return {
          ...current,
          ...state,
          currentTime: state.resumePosition ?? 0,
          duration: state.currentTrack?.duration ?? 0,
        };
      },
    },
  ),
);
