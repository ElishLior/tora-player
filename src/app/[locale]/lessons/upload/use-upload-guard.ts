import { useEffect } from 'react';

/**
 * While `active`: warn before the page is closed or reloaded, and keep the
 * screen awake (Screen Wake Lock, where supported) so a phone doesn't sleep
 * and stall a long upload. The lock is re-taken when the page becomes
 * visible again, since browsers drop it on hide.
 */
export function useUploadGuard(active: boolean, leaveWarning: string) {
  useEffect(() => {
    if (!active) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveWarning;
    };
    window.addEventListener('beforeunload', warn);

    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (stopped) await sentinel.release();
        else lock = sentinel;
      } catch {
        // Denied (battery saver, no user activation) — uploads continue without it.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!lock || lock.released)) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [active, leaveWarning]);
}
