export const OFFLINE_DOWNLOADS_CHANGED_EVENT = 'tora:offline-downloads-changed';

interface OfflineDownloadsChangedDetail {
  lessonId: string;
}

export function isOfflineDownloadsChangedEvent(
  event: Event,
  lessonId: string,
): event is CustomEvent<OfflineDownloadsChangedDetail> {
  if (event.type !== OFFLINE_DOWNLOADS_CHANGED_EVENT) return false;
  if (!(event instanceof CustomEvent)) return false;
  return event.detail?.lessonId === lessonId;
}

export function notifyOfflineDownloadsChanged(lessonId: string): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<OfflineDownloadsChangedDetail>(OFFLINE_DOWNLOADS_CHANGED_EVENT, {
      detail: { lessonId },
    }),
  );
}
