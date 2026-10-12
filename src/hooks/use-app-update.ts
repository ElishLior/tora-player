'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILD_ID } from '@/lib/app-version';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RELOAD_KEY,
  UPDATE_SNOOZE_KEY,
  buildIdFromScriptUrl,
  isDeployedBuildId,
  isUpdateRequested,
  parseRefreshRecord,
  parseVersionResponse,
  refreshDecision,
  refreshRecord,
  shouldCheckForUpdate,
  updateTarget,
  verifyRefresh,
  withoutUpdateRequest,
  type UpdateTrigger,
} from '@/lib/app-update';
import { getTransportState, useAudioStore } from '@/stores/audio-store';

const CHANNEL_NAME = 'tora-app-update';

interface ChannelMessage {
  type: 'target' | 'snoozed';
  buildId: string;
}

export interface AppUpdate {
  /** A newer deployed build to load, or null (nothing new, or snoozed). */
  target: string | null;
  /** A refresh landed on an older build. Shown once; nothing reloads again by itself. */
  recovery: boolean;
  /** Audio is playing or loading: a refresh waits for a pause and the user's tap. */
  playing: boolean;
  refresh: () => void;
  snooze: () => void;
  dismissRecovery: () => void;
}

const isPlayingNow = () => getTransportState(useAudioStore.getState()) !== 'paused';

function readStorage(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage blocked (private mode): the snooze simply does not persist.
  }
}

async function waitingBuildId(): Promise<string | null> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    return buildIdFromScriptUrl(registration?.waiting?.scriptURL);
  } catch {
    return null;
  }
}

/**
 * Detects a newer deployed build and runs the safe refresh. Mounted once in
 * the locale layout. Silent on failure; never runs in local development.
 *
 * Checks: on load, when the tab is shown again, when the device is back
 * online, and every 30 minutes (src/lib/app-update.ts decides when a check may
 * run). A refresh never reloads while audio plays; it waits for the user to
 * pause and tap again.
 */
export function useAppUpdate(): AppUpdate {
  const [serverBuildId, setServerBuildId] = useState<string | null>(null);
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const [snoozedBuildId, setSnoozedBuildId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  // Bumped when the service worker asks for a refresh, so the request runs even
  // when no other value changed.
  const [requestSeq, setRequestSeq] = useState(0);
  const playing = useAudioStore((state) => getTransportState(state) !== 'paused');

  const target = updateTarget({
    runningBuildId: BUILD_ID,
    serverBuildId,
    waitingBuildId: waitingId,
    snoozedBuildId,
  });

  const lastAttemptRef = useRef<number | null>(null);
  const failuresRef = useRef(0);
  // Set by a push notification's ?update=1 (or the service worker's message):
  // refresh as soon as a newer build is known, if nothing is playing.
  const requestedRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const broadcast = useCallback((message: ChannelMessage) => {
    try {
      channelRef.current?.postMessage(message);
    } catch {
      // Channel closed: this tab decides on its own anyway.
    }
  }, []);

  const check = useCallback(
    async (trigger: UpdateTrigger) => {
      const now = Date.now();
      if (
        !shouldCheckForUpdate({
          trigger,
          now,
          lastAttemptAt: lastAttemptRef.current,
          failures: failuresRef.current,
        })
      ) {
        return;
      }
      lastAttemptRef.current = now;
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) throw new Error(`version ${response.status}`);
        const parsed = parseVersionResponse(await response.json());
        if (!parsed) throw new Error('unexpected version response');
        failuresRef.current = 0;
        setServerBuildId(parsed.buildId);
        setWaitingId(await waitingBuildId());
        broadcast({ type: 'target', buildId: parsed.buildId });
      } catch {
        // Silent: the next trigger (or the interval) tries again, backed off.
        failuresRef.current += 1;
      }
    },
    [broadcast],
  );

  const refresh = useCallback(() => {
    if (!target || refreshDecision({ target, playing: isPlayingNow() }) !== 'refresh') return;
    writeStorage(window.sessionStorage, UPDATE_RELOAD_KEY, refreshRecord(target, Date.now()));
    window.location.reload();
  }, [target]);

  const snooze = useCallback(() => {
    if (!target) return;
    writeStorage(window.localStorage, UPDATE_SNOOZE_KEY, target);
    setSnoozedBuildId(target);
    broadcast({ type: 'snoozed', buildId: target });
  }, [target, broadcast]);

  const dismissRecovery = useCallback(() => setRecovery(false), []);

  // Mount: snooze memory, the outcome of the last refresh, the update request, and every trigger.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;

    setSnoozedBuildId(readStorage(window.localStorage, UPDATE_SNOOZE_KEY));

    const sessionRecord = readStorage(window.sessionStorage, UPDATE_RELOAD_KEY);
    const outcome = verifyRefresh({ raw: sessionRecord, runningBuildId: BUILD_ID, now: Date.now() });
    if (outcome !== 'none') writeStorage(window.sessionStorage, UPDATE_RELOAD_KEY, null);
    if (outcome === 'mismatch') {
      // The reload did not bring the target build: stop offering it, say so once.
      const record = parseRefreshRecord(sessionRecord);
      if (record) writeStorage(window.localStorage, UPDATE_SNOOZE_KEY, record.target);
      setSnoozedBuildId(record?.target ?? null);
      setRecovery(true);
    }

    if (isUpdateRequested(window.location.search)) {
      requestedRef.current = true;
      // Drop the marker first, so a reload never sees it again.
      window.history.replaceState(window.history.state, '', withoutUpdateRequest(window.location.href));
    }

    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
        const message = event.data;
        if (!message || !isDeployedBuildId(message.buildId)) return;
        // Other tabs only learn what was found or snoozed. They never reload each other.
        if (message.type === 'target') setServerBuildId(message.buildId);
        if (message.type === 'snoozed') {
          writeStorage(window.localStorage, UPDATE_SNOOZE_KEY, message.buildId);
          setSnoozedBuildId(message.buildId);
        }
      };
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check('visible');
    };
    const onOnline = () => void check('online');
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'tora:update-requested') return;
      requestedRef.current = true;
      // A notification tap is an explicit ask: check now (not from a throttled
      // answer), then let the pending request look at the fresh result.
      lastAttemptRef.current = null;
      void check('visible').finally(() => setRequestSeq((seq) => seq + 1));
    };
    const interval = window.setInterval(() => void check('interval'), UPDATE_CHECK_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    void check('load');

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      window.clearInterval(interval);
      channel?.close();
      channelRef.current = null;
    };
  }, [check]);

  // A pending request refreshes once a newer build is known. Playing: the
  // request is dropped, so the refresh waits for an explicit tap after a pause.
  useEffect(() => {
    if (!requestedRef.current) return;
    if (target) {
      requestedRef.current = false;
      if (refreshDecision({ target, playing: isPlayingNow() }) === 'refresh') refresh();
    } else if (serverBuildId !== null) {
      // A check ran and there is nothing newer: the request is done. It must
      // not wait around to refresh a later deploy without a fresh tap.
      requestedRef.current = false;
    }
  }, [target, playing, refresh, requestSeq, serverBuildId]);

  return { target, recovery, playing, refresh, snooze, dismissRecovery };
}
