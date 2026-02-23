'use client';

import { useAudioStore } from '@/stores/audio-store';
import { useMediaSession } from '@/hooks/use-media-session';
import { MiniPlayer } from './mini-player';
import { FullPlayer } from './full-player';

/**
 * Root audio player component.
 * Renders either mini-player or full-player based on expansion state.
 * Should be placed in the root layout.
 */
export function AudioPlayer() {
  const { currentTrack, isMiniPlayerExpanded, toggleMiniPlayer } = useAudioStore();

  // Initialize Media Session API
  useMediaSession();

  if (!currentTrack) return null;

  return (
    <>
      {isMiniPlayerExpanded ? (
        <FullPlayer onClose={toggleMiniPlayer} />
      ) : (
        <MiniPlayer />
      )}
    </>
  );
}
