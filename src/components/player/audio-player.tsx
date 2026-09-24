'use client';

import { useEffect } from 'react';
import { useAudioStore } from '@/stores/audio-store';
import { useMediaSession } from '@/hooks/use-media-session';
import { startAudioController } from '@/lib/audio-controller';
import { MiniPlayer } from './mini-player';
import { FullPlayer } from './full-player';

/**
 * Root audio player, mounted once in the locale layout. It owns playback: the
 * audio controller and the lock-screen/car integration live here, and survive
 * client-side navigation.
 */
export function AudioPlayer() {
  const hasTrack = useAudioStore((s) => s.currentTrack !== null);
  const isExpanded = useAudioStore((s) => s.isMiniPlayerExpanded);
  const toggleMiniPlayer = useAudioStore((s) => s.toggleMiniPlayer);

  useEffect(() => startAudioController(), []);
  useMediaSession();

  if (!hasTrack) return null;

  return isExpanded ? <FullPlayer onClose={toggleMiniPlayer} /> : <MiniPlayer />;
}
