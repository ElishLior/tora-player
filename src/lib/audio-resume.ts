import type { AudioTrack } from "@/stores/audio-store";
import type { LoadedAudioTrackIdentity } from "@/lib/audio-engine";

interface ResumeTrackState {
  track: AudioTrack | null;
  currentTime: number;
  forceReload?: boolean;
}

interface ResumeTrackDeps {
  getOfflineAudioUrl: (track: AudioTrack) => Promise<string | null>;
  ensurePlaying: (
    url: string,
    options?: {
      startPosition?: number;
      trackIdentity?: Omit<LoadedAudioTrackIdentity, "resolvedUrl">;
      forceReload?: boolean;
    },
  ) => void;
  markPlaying: () => void;
  isEngineLoaded: () => boolean;
  getCurrentEngineUrl: () => string | null;
  isLoadedUrlCurrentTrack?: (url: string, track: AudioTrack) => boolean;
  isStillCurrent?: (track: AudioTrack) => boolean;
  shouldResume?: () => boolean;
}

function getTrackIdentity(
  track: AudioTrack,
): Omit<LoadedAudioTrackIdentity, "resolvedUrl"> {
  return {
    lessonId: track.lessonId || track.id,
    audioFileId: track.audioFileId,
    offlineKey: track.offlineKey,
    sourceUrl: track.audioUrl,
  };
}

export async function resumeTrackPlayback(
  { track, currentTime, forceReload = false }: ResumeTrackState,
  deps: ResumeTrackDeps,
) {
  if (!track?.audioUrl) return false;

  if (deps.shouldResume && !deps.shouldResume()) {
    return false;
  }

  const startPosition = currentTime > 0 ? currentTime : undefined;
  const trackIdentity = getTrackIdentity(track);
  const loadedUrl = deps.getCurrentEngineUrl();
  const playbackOptions = {
    startPosition,
    trackIdentity,
    ...(forceReload ? { forceReload: true } : {}),
  };

  if (
    !forceReload &&
    deps.isEngineLoaded() &&
    loadedUrl &&
    (deps.isLoadedUrlCurrentTrack?.(loadedUrl, track) ??
      loadedUrl === track.audioUrl)
  ) {
    deps.ensurePlaying(loadedUrl, playbackOptions);
    deps.markPlaying();
    return true;
  }

  const offlineUrl = await deps.getOfflineAudioUrl(track).catch(() => null);

  if (deps.isStillCurrent && !deps.isStillCurrent(track)) {
    return false;
  }

  if (deps.shouldResume && !deps.shouldResume()) {
    return false;
  }

  deps.ensurePlaying(offlineUrl || track.audioUrl, playbackOptions);
  deps.markPlaying();
  return true;
}
