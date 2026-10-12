'use client';

import { useTranslations } from 'next-intl';
import { playerQueueNotice } from '@/lib/queue-notice';
import { useAudioStore } from '@/stores/audio-store';

/** The current category queue outcome as text for a player bar, or null when there is none to show. */
export function useQueueNoticeText(): string | null {
  const t = useTranslations('categoryPlayback');
  const notice = useAudioStore((s) => s.queueNotice);
  const message = playerQueueNotice(notice);
  if (!message) return null;
  return message.key === 'skipped' ? t('skipped', { title: message.title }) : t(message.key);
}
