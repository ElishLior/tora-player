import { lessonUrl } from '@/config/site';
import { getTrackLessonId } from '@/lib/player-track-actions';
import { shareLessonWithResult, type ShareOptions } from '@/lib/share';
import type { AudioTrack } from '@/stores/audio-store';

/** Public lesson identity only, even for an offline audio file or an English UI. */
export function getPlayingLessonShareData(track: AudioTrack): ShareOptions {
  return {
    title: track.hebrewTitle || track.title,
    url: lessonUrl(getTrackLessonId(track)),
  };
}

export function sharePlayingLesson(track: AudioTrack) {
  return shareLessonWithResult(getPlayingLessonShareData(track));
}
