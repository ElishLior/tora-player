import { describe, expect, it, vi } from 'vitest';
import { resumeTrackPlayback } from './audio-resume';
import type { AudioTrack } from '@/stores/audio-store';

const track: AudioTrack = {
  id: 'lesson-1',
  title: 'Lesson',
  hebrewTitle: 'שיעור',
  audioUrl: '/api/audio/stream/lesson.mp3',
  duration: 100,
  date: '2026-01-01',
};

describe('resumeTrackPlayback', () => {
  it('resumes the current track loaded engine URL without waiting for offline storage', async () => {
    const getOfflineAudioUrl = vi.fn(async () => 'blob:lesson-1');
    const ensurePlaying = vi.fn();
    const markPlaying = vi.fn();

    const result = await resumeTrackPlayback(
      { track, currentTime: 42 },
      {
        getOfflineAudioUrl,
        ensurePlaying,
        markPlaying,
        isEngineLoaded: () => true,
        getCurrentEngineUrl: () => 'blob:already-loaded',
        isLoadedUrlCurrentTrack: () => true,
        shouldResume: () => true,
      },
    );

    expect(result).toBe(true);
    expect(getOfflineAudioUrl).not.toHaveBeenCalled();
    expect(ensurePlaying).toHaveBeenCalledWith('blob:already-loaded', { startPosition: 42 });
    expect(markPlaying).toHaveBeenCalled();
  });

  it('does not trust a loaded engine URL that does not belong to the current track', async () => {
    const getOfflineAudioUrl = vi.fn(async () => null);
    const ensurePlaying = vi.fn();

    const result = await resumeTrackPlayback(
      { track, currentTime: 42 },
      {
        getOfflineAudioUrl,
        ensurePlaying,
        markPlaying: vi.fn(),
        isEngineLoaded: () => true,
        getCurrentEngineUrl: () => 'blob:previous-track',
        isLoadedUrlCurrentTrack: () => false,
        shouldResume: () => true,
      },
    );

    expect(result).toBe(true);
    expect(getOfflineAudioUrl).toHaveBeenCalledWith(track.id);
    expect(ensurePlaying).toHaveBeenCalledWith(track.audioUrl, { startPosition: 42 });
  });

  it('prefers an offline blob URL when the engine must be loaded', async () => {
    const ensurePlaying = vi.fn();

    const result = await resumeTrackPlayback(
      { track, currentTime: 0 },
      {
        getOfflineAudioUrl: vi.fn(async () => 'blob:lesson-1'),
        ensurePlaying,
        markPlaying: vi.fn(),
        isEngineLoaded: () => false,
        getCurrentEngineUrl: () => null,
        shouldResume: () => true,
      },
    );

    expect(result).toBe(true);
    expect(ensurePlaying).toHaveBeenCalledWith('blob:lesson-1', { startPosition: undefined });
  });

  it('does not resume when playback is no longer requested after offline lookup', async () => {
    const ensurePlaying = vi.fn();
    const markPlaying = vi.fn();

    const result = await resumeTrackPlayback(
      { track, currentTime: 15 },
      {
        getOfflineAudioUrl: vi.fn(async () => 'blob:lesson-1'),
        ensurePlaying,
        markPlaying,
        isEngineLoaded: () => false,
        getCurrentEngineUrl: () => null,
        shouldResume: () => false,
      },
    );

    expect(result).toBe(false);
    expect(ensurePlaying).not.toHaveBeenCalled();
    expect(markPlaying).not.toHaveBeenCalled();
  });

  it('does not resume a stale track after asynchronous offline lookup', async () => {
    const ensurePlaying = vi.fn();
    const markPlaying = vi.fn();

    const result = await resumeTrackPlayback(
      { track, currentTime: 15 },
      {
        getOfflineAudioUrl: vi.fn(async () => 'blob:lesson-1'),
        ensurePlaying,
        markPlaying,
        isStillCurrent: () => false,
        isEngineLoaded: () => false,
        getCurrentEngineUrl: () => null,
        shouldResume: () => true,
      },
    );

    expect(result).toBe(false);
    expect(ensurePlaying).not.toHaveBeenCalled();
    expect(markPlaying).not.toHaveBeenCalled();
  });
});
