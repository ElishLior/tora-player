'use client';

import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { play } from '@/lib/audio-controller';
import { cn } from '@/lib/utils';
import { useAudioStore } from '@/stores/audio-store';

/**
 * "Continue" control shown only when the browser refused autoplay (playbackIssue 'blocked').
 * One tap calls the controller's play(), which is the user gesture the browser needs.
 * Render it as a sibling of the surface's `data-player-expand` button, never inside it.
 */
export function ResumeBlockedButton({ className }: { className?: string }) {
  const t = useTranslations('player');
  const blocked = useAudioStore((s) => s.playbackIssue === 'blocked');
  if (!blocked) return null;

  return (
    <button
      type="button"
      onClick={() => play()}
      className={cn(
        'inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transform-none',
        className,
      )}
    >
      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
      <span>{t('continueBlocked')}</span>
    </button>
  );
}
