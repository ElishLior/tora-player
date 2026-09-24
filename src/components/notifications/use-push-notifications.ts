'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Device push-subscription state for new-lesson notifications.
 * - `ios-install`: iPhone/iPad Safari tab; Web Push works only after "Add to
 *   Home Screen" (iOS 16.4+), then opening the installed app.
 * - `unavailable`: no VAPID key configured or the browser lacks Push API.
 */
export type PushStatus = 'checking' | 'unavailable' | 'ios-install' | 'denied' | 'off' | 'on';
export type PushError = 'failed' | 'sw-timeout';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const CHANGED_EVENT = 'tora:push-changed';
const RESYNC_KEY = 'tora-push-synced-at';
const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SW_READY_TIMEOUT_MS = 10_000;

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isIosSafariTab(): boolean {
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), SW_READY_TIMEOUT_MS)),
  ]);
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error(`save failed: ${response.status}`);
  localStorage.setItem(RESYNC_KEY, String(Date.now()));
}

async function detectStatus(): Promise<{ status: PushStatus; subscription: PushSubscription | null }> {
  if (!VAPID_PUBLIC_KEY) return { status: 'unavailable', subscription: null };
  if (isIosSafariTab()) return { status: 'ios-install', subscription: null };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unavailable', subscription: null };
  }
  if (Notification.permission === 'denied') return { status: 'denied', subscription: null };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = (await registration?.pushManager.getSubscription()) ?? null;
  return { status: subscription ? 'on' : 'off', subscription };
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const detected = await detectStatus();
      setStatus(detected.status);
      setEndpoint(detected.subscription?.endpoint ?? null);
      // Heal server state (pruned/lost rows) at most once a day.
      const lastSync = Number(localStorage.getItem(RESYNC_KEY) ?? 0);
      if (detected.subscription && Date.now() - lastSync > RESYNC_INTERVAL_MS) {
        await saveSubscription(detected.subscription).catch(() => undefined);
      }
    } catch {
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, [refresh]);

  /** Must run from a tap/click: iOS only shows the permission prompt for user gestures. */
  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await serviceWorkerReady();
      const options = { userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) };
      let subscription: PushSubscription;
      try {
        subscription = await registration.pushManager.subscribe(options);
      } catch (err) {
        // Subscribed earlier with a different VAPID key: replace it.
        const existing = await registration.pushManager.getSubscription();
        if (!existing) throw err;
        await existing.unsubscribe();
        subscription = await registration.pushManager.subscribe(options);
      }
      await saveSubscription(subscription);
      window.dispatchEvent(new Event(CHANGED_EVENT));
    } catch (err) {
      setError(err instanceof Error && err.message === 'sw-timeout' ? 'sw-timeout' : 'failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      localStorage.removeItem(RESYNC_KEY);
      window.dispatchEvent(new Event(CHANGED_EVENT));
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, endpoint, busy, error, enable, disable };
}
