'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for Google Cast (Chromecast) integration.
 * Uses the CAF (Cast Application Framework) Web Sender SDK.
 *
 * The SDK is loaded lazily when the hook mounts — no need to add script tags manually.
 * Uses the Default Media Receiver (CC1AD845) so no Cast app registration is required.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function getWindowProp(key: string): AnyRecord | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as AnyRecord)[key] as AnyRecord | undefined;
}

/** Make a relative URL absolute so the Cast device can fetch it */
function toAbsoluteUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface CastState {
  /** Cast SDK is loaded and a Cast-capable device is on the network */
  isAvailable: boolean;
  /** Currently connected to a Cast device */
  isConnected: boolean;
  /** Friendly name of the connected device */
  deviceName: string | null;
  /** Whether audio is playing on the Cast device */
  isCastPlaying: boolean;
}

let sdkLoadPromise: Promise<boolean> | null = null;

/** Load the Google Cast SDK lazily */
function loadCastSdk(): Promise<boolean> {
  if (sdkLoadPromise) return sdkLoadPromise;
  if (typeof window === 'undefined') return Promise.resolve(false);

  // If SDK already loaded
  if (getWindowProp('cast')?.framework) return Promise.resolve(true);

  sdkLoadPromise = new Promise<boolean>((resolve) => {
    // The SDK calls this global callback when ready
    (window as unknown as AnyRecord)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
      resolve(isAvailable);
    };

    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.onerror = () => {
      sdkLoadPromise = null;
      resolve(false);
    };
    document.head.appendChild(script);

    // Timeout — if callback not called in 10s, give up
    setTimeout(() => resolve(false), 10000);
  });

  return sdkLoadPromise;
}

export function useCast() {
  const [state, setState] = useState<CastState>({
    isAvailable: false,
    isConnected: false,
    deviceName: null,
    isCastPlaying: false,
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    async function init() {
      const available = await loadCastSdk();
      if (cancelled) return;

      if (!available) return;

      try {
        const cast = getWindowProp('cast');
        if (!cast?.framework) return;

        const context = cast.framework.CastContext.getInstance();
        const appId = process.env.NEXT_PUBLIC_CAST_APP_ID || 'CC1AD845'; // Default Media Receiver

        context.setOptions({
          receiverApplicationId: appId,
          autoJoinPolicy: 'ORIGIN_SCOPED',
        });

        setState((prev) => ({ ...prev, isAvailable: true }));

        // Listen for session changes
        context.addEventListener(
          cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: AnyRecord) => {
            const sessionState = event.sessionState;
            const session = context.getCurrentSession?.();

            if (
              sessionState === 'SESSION_STARTED' ||
              sessionState === 'SESSION_RESUMED'
            ) {
              setState((prev) => ({
                ...prev,
                isConnected: true,
                deviceName:
                  session?.getCastDevice?.()?.friendlyName || 'Cast Device',
              }));
            } else if (sessionState === 'SESSION_ENDED') {
              setState((prev) => ({
                ...prev,
                isConnected: false,
                deviceName: null,
                isCastPlaying: false,
              }));
            }
          }
        );
      } catch {
        // Cast not available
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Request a Cast session and load audio */
  const startCasting = useCallback(
    async (audioUrl: string, title?: string, subtitle?: string): Promise<boolean> => {
      try {
        const cast = getWindowProp('cast');
        const chrome = getWindowProp('chrome');
        if (!cast?.framework || !chrome?.cast) return false;

        const context = cast.framework.CastContext.getInstance();

        // Request session if not already connected
        let session = context.getCurrentSession?.();
        if (!session) {
          await context.requestSession();
          session = context.getCurrentSession?.();
        }
        if (!session) return false;

        // Build media info — Cast device needs an absolute URL
        const absoluteUrl = toAbsoluteUrl(audioUrl);
        const mediaInfo = new chrome.cast.media.MediaInfo(absoluteUrl, 'audio/mpeg');

        // Add metadata
        const metadata = new chrome.cast.media.GenericMediaMetadata();
        if (title) metadata.title = title;
        if (subtitle) metadata.subtitle = subtitle;
        mediaInfo.metadata = metadata;

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        await session.loadMedia(request);

        setState((prev) => ({
          ...prev,
          isConnected: true,
          isCastPlaying: true,
          deviceName:
            session.getCastDevice?.()?.friendlyName || 'Cast Device',
        }));

        return true;
      } catch {
        return false;
      }
    },
    []
  );

  /** Stop casting and disconnect */
  const stopCasting = useCallback(() => {
    try {
      const cast = getWindowProp('cast');
      if (!cast?.framework) return;

      const context = cast.framework.CastContext.getInstance();
      context.endCurrentSession(true);

      setState((prev) => ({
        ...prev,
        isConnected: false,
        deviceName: null,
        isCastPlaying: false,
      }));
    } catch {
      // Ignore
    }
  }, []);

  /** Open the browser's native Cast / Bluetooth picker (non-Chromecast devices) */
  const openMediaPicker = useCallback(async () => {
    // The browser's built-in presentation/remote-playback API
    // works for Bluetooth speakers and AirPlay on supported browsers
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      // Media session is already set up by the audio player
      // For Bluetooth, the OS handles connection — we just inform the user
    }

    // For non-Cast devices, try the native Chrome dialog
    const cast = getWindowProp('cast');
    if (cast?.framework) {
      const context = cast.framework.CastContext.getInstance();
      try {
        await context.requestSession();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }, []);

  return {
    ...state,
    startCasting,
    stopCasting,
    openMediaPicker,
  };
}
