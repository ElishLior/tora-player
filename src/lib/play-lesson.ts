"use client";

import { playTrack } from "@/lib/audio-controller";
import { getResumePoint, type ResumePoint } from "@/lib/lesson-progress";
import { getTrackLessonId } from "@/lib/player-track-actions";
import { getTrackKey, useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { useProgressStore } from "@/stores/progress-store";

export interface PlayLessonOptions {
  /** Start with this part from its beginning, instead of the saved position (a tapped part chip). If that part is the one already loaded, it resumes where it is (resuming never seeks). */
  startPart?: number;
}

export interface LessonStartInput {
  partCount: number;
  /** Index of the part already loaded for this lesson, or -1. */
  liveIndex: number;
  /** Where the saved progress says to resume. */
  resume: ResumePoint;
  startPart?: number;
}

/**
 * Where playback of one lesson starts. An explicitly chosen part starts at its
 * beginning, even when saved progress points elsewhere. Otherwise the loaded
 * part keeps its live position (no seek: playTrack without a start position
 * resumes the loaded track), and a lesson not loaded resumes from saved progress.
 */
export function chooseLessonStart({ partCount, liveIndex, resume, startPart }: LessonStartInput): ResumePoint {
  if (startPart !== undefined && Number.isInteger(startPart) && startPart >= 0 && startPart < partCount) {
    return { index: startPart, position: 0 };
  }
  if (liveIndex >= 0) return { index: liveIndex, position: 0 };
  return resume;
}

/**
 * Plays several lessons in a row (each given as its tracks from
 * getLessonTracks), starting with `startLesson` where the listener left it:
 * the saved part and position, or the beginning for a new or heard lesson.
 * Synchronous, so it can run inside the tap that starts playback (iOS).
 */
export function playLessons(lessons: AudioTrack[][], startLesson = 0, options: PlayLessonOptions = {}) {
  const tracks = lessons[startLesson];
  if (!tracks?.length) return;

  const queue = lessons.flat();
  const offset = lessons.slice(0, startLesson).reduce((count, lesson) => count + lesson.length, 0);
  const player = useAudioStore.getState();
  const currentTrack = player.currentTrack;
  const liveIndex = currentTrack && player.playbackStatus !== "ended" &&
    getTrackLessonId(currentTrack) === getTrackLessonId(tracks[0])
    ? tracks.findIndex((track) =>
        getTrackKey(track) === getTrackKey(currentTrack) ||
        (track.audioFileId && track.audioFileId === currentTrack.audioFileId) ||
        (tracks.length === 1 && !track.audioFileId && !currentTrack.audioFileId),
      )
    : -1;
  // A saved-library copy may have an offlineKey absent from the playing track.
  // Keep the loaded track in the queue so the tap cannot reload or seek it.
  if (liveIndex >= 0 && currentTrack) queue[offset + liveIndex] = currentTrack;
  const progress = useProgressStore.getState().progressMap[getTrackLessonId(tracks[0])];
  const start = chooseLessonStart({
    partCount: tracks.length,
    liveIndex,
    resume: getResumePoint(tracks, progress),
    startPart: options.startPart,
  });
  playTrack(queue[offset + start.index], {
    queue,
    queueIndex: offset + start.index,
    startAt: start.position > 0 ? start.position : undefined,
  });
}

/** Plays one lesson (all its parts) from where the listener left it, or from a chosen part. */
export function playLesson(tracks: AudioTrack[], options: PlayLessonOptions = {}) {
  playLessons([tracks], 0, options);
}
