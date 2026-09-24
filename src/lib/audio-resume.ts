import { normalizeAudioUrl } from "@/lib/audio-url";
import { getTrackKey, type AudioTrack } from "@/stores/audio-store";

/**
 * What it takes to make the current track audible:
 * - play-loaded: the element already holds this track → just play, never seek
 *   (the element knows the real position, even after hours in the background)
 * - load: the source is known now → load at startPosition and play in the same
 *   call stack (keeps iOS' user-gesture requirement satisfied)
 * - resolve: the file may be saved offline → look up the blob URL first
 */
export type PlaybackPlan =
  | { type: "play-loaded" }
  | { type: "load"; source: string; startPosition: number }
  | { type: "resolve"; startPosition: number };

interface PlanInput {
  track: AudioTrack;
  loadedTrackKey: string | null;
  /** Store position of `track`; used only when a different track is loaded. */
  position: number;
  cachedSource?: string;
  /** Lessons with offline copies; null while still unknown. */
  downloadedLessonIds: ReadonlySet<string> | null;
}

export function getStreamSource(track: AudioTrack): string {
  return normalizeAudioUrl(track.audioUrl) || track.audioUrl;
}

export function planTrackPlayback({
  track,
  loadedTrackKey,
  position,
  cachedSource,
  downloadedLessonIds,
}: PlanInput): PlaybackPlan {
  if (getTrackKey(track) === loadedTrackKey) return { type: "play-loaded" };

  const startPosition = Math.max(0, position);
  if (cachedSource) return { type: "load", source: cachedSource, startPosition };
  if (downloadedLessonIds && !downloadedLessonIds.has(track.lessonId || track.id)) {
    return { type: "load", source: getStreamSource(track), startPosition };
  }
  return { type: "resolve", startPosition };
}

/** Offline blob URL when the file is saved on this device, else the stream URL. */
export async function resolveTrackSource(
  track: AudioTrack,
  getOfflineSource: (track: AudioTrack) => Promise<string | null>,
): Promise<string> {
  const offlineSource = await getOfflineSource(track).catch(() => null);
  return offlineSource || getStreamSource(track);
}
