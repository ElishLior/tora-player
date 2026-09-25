"use client";

import { playTrack } from "@/lib/audio-controller";
import { getResumePoint } from "@/lib/lesson-progress";
import { getTrackLessonId } from "@/lib/player-track-actions";
import { useProgressStore } from "@/stores/progress-store";
import type { AudioTrack } from "@/stores/audio-store";

/**
 * Plays several lessons in a row (each given as its tracks from
 * getLessonTracks), starting with `startLesson` where the listener left it:
 * the saved part and position, or the beginning for a new or heard lesson.
 * Synchronous, so it can run inside the tap that starts playback (iOS).
 */
export function playLessons(lessons: AudioTrack[][], startLesson = 0) {
  const tracks = lessons[startLesson];
  if (!tracks?.length) return;

  const queue = lessons.flat();
  const offset = lessons.slice(0, startLesson).reduce((count, lesson) => count + lesson.length, 0);
  const progress = useProgressStore.getState().progressMap[getTrackLessonId(tracks[0])];
  const { index, position } = getResumePoint(tracks, progress);
  playTrack(queue[offset + index], {
    queue,
    queueIndex: offset + index,
    startAt: position > 0 ? position : undefined,
  });
}

/** Plays one lesson (all its parts) from where the listener left it. */
export function playLesson(tracks: AudioTrack[]) {
  playLessons([tracks]);
}
