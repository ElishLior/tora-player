"use client";

import { playTrack } from "@/lib/audio-controller";
import { getResumePoint } from "@/lib/lesson-progress";
import { getTrackLessonId } from "@/lib/player-track-actions";
import { getTrackKey, useAudioStore, type AudioTrack } from "@/stores/audio-store";
import { useProgressStore } from "@/stores/progress-store";

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
  let index = liveIndex;
  let position = 0;
  if (index < 0) {
    const progress = useProgressStore.getState().progressMap[getTrackLessonId(tracks[0])];
    const resume = getResumePoint(tracks, progress);
    index = resume.index;
    position = resume.position;
  }
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
