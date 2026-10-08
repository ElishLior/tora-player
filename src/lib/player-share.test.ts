import { afterEach, describe, expect, it, vi } from 'vitest';
import { lessonUrl, SITE_URL } from '@/config/site';
import { getPlayingLessonShareData, sharePlayingLesson } from './player-share';
import { useAudioStore } from '@/stores/audio-store';
import type { AudioTrack } from '@/stores/audio-store';

vi.mock('@/i18n/routing', () => ({ routing: { locales: ['he', 'en'], defaultLocale: 'he' } }));

const track: AudioTrack = {
  id: 'audio-file-id',
  lessonId: 'lesson-id',
  title: 'English title',
  hebrewTitle: 'שיעור בעברית',
  audioUrl: 'blob:offline-private-token',
  duration: 600,
  date: '',
};

afterEach(() => vi.unstubAllGlobals());

describe('loaded lesson share data', () => {
  it('uses a known lesson slug while old persisted tracks keep the UUID', () => {
    expect(getPlayingLessonShareData({ ...track, lessonSlug: 'sukkot-25-09-2026' }).url).toBe(lessonUrl({ id: track.lessonId!, slug: 'sukkot-25-09-2026' }));
  });
  it('uses the canonical Hebrew lesson URL rather than the current page or offline source', () => {
    vi.stubGlobal('window', { location: { origin: 'https://preview.example.test', pathname: '/en/admin' } });
    expect(getPlayingLessonShareData(track)).toEqual({
      title: track.hebrewTitle,
      url: `${SITE_URL}/he/lessons/lesson-id`,
    });
  });

  it('uses track.id and track.title when the lesson ID and Hebrew title are absent', () => {
    expect(getPlayingLessonShareData({ ...track, lessonId: undefined, hebrewTitle: '' })).toEqual({
      title: track.title,
      url: lessonUrl(track.id),
    });
  });

  it('encodes the lesson ID and adds no timestamp or private data', () => {
    const data = getPlayingLessonShareData({ ...track, lessonId: 'lesson /?#' });
    expect(data.url).toBe(`${SITE_URL}/he/lessons/lesson%20%2F%3F%23`);
    expect(Object.keys(data)).toEqual(['title', 'url']);
    expect(data.url).not.toContain('offline-private-token');
  });

  it.each(['success', 'cancel'])('keeps the entire audio store unchanged after native share %s', async (outcome) => {
    vi.stubGlobal('navigator', {
      share: vi.fn(() => (outcome === 'cancel' ? Promise.reject({ name: 'AbortError' }) : Promise.resolve())),
    });
    const original = useAudioStore.getState();
    useAudioStore.setState({ currentTrack: track, isPlaying: true, currentTime: 123 });
    const before = useAudioStore.getState();
    try {
      expect(await sharePlayingLesson(track)).toBe(outcome === 'cancel' ? 'cancelled' : 'shared');
      expect(useAudioStore.getState()).toBe(before);
    } finally {
      useAudioStore.setState(original, true);
    }
  });
});
