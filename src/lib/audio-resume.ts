import type { AudioTrack } from '@/stores/audio-store';

interface ResumeTrackState {
  track: AudioTrack | null;
  currentTime: number;
}

interface ResumeTrackDeps {
  getOfflineAudioUrl: (trackId: string) => Promise<string | null>;
  ensurePlaying: (url: string, options?: { startPosition?: number }) => void;
  markPlaying: () => void;
  isEngineLoaded: () => boolean;
  getCurrentEngineUrl: () => string | null;
  isLoadedUrlCurrentTrack?: (url: string, track: AudioTrack) => boolean;
  isStillCurrent?: (trackId: string) => boolean;
  shouldResume?: () => boolean;
}

export async function resumeTrackPlayback(
  { track, currentTime }: ResumeTrackState,
  deps: ResumeTrackDeps,
) {
  if (!track?.audioUrl) return false;

  if (deps.shouldResume && !deps.shouldResume()) {
    return false;
  }

  const startPosition = currentTime > 0 ? currentTime : undefined;
  const loadedUrl = deps.getCurrentEngineUrl();

  if (
    deps.isEngineLoaded() &&
    loadedUrl &&
    (deps.isLoadedUrlCurrentTrack?.(loadedUrl, track) ?? loadedUrl === track.audioUrl)
  ) {
    deps.ensurePlaying(loadedUrl, { startPosition });
    deps.markPlaying();
    return true;
  }

  const offlineUrl = await deps.getOfflineAudioUrl(track.id).catch(() => null);

  if (deps.isStillCurrent && !deps.isStillCurrent(track.id)) {
    return false;
  }

  if (deps.shouldResume && !deps.shouldResume()) {
    return false;
  }

  deps.ensurePlaying(offlineUrl || track.audioUrl, { startPosition });
  deps.markPlaying();
  return true;
}
