'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for Google Cast (Chromecast) integration.
 * Uses the CAF (Cast Application Framework) Web Sender SDK.
 *
 * The Google Cast SDK script must be loaded in the page head:
 * <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function getWindowProp(key: string): AnyRecord | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as AnyRecord)[key] as AnyRecord | undefined;
}

interface CastState {
  isAvailable: boolean;
  isConnected: boolean;
  deviceName: string | null;
}

export function useCast() {
  const [state, setState] = useState<CastState>({
    isAvailable: false,
    isConnected: false,
    deviceName: null,
  });

  useEffect(() => {
    const doInitializeCast = () => {
      try {
        const cast = getWindowProp('cast');
        if (!cast) return;

        const framework = cast.framework;
        if (!framework) return;

        const context = framework.CastContext.getInstance();

        const appId = process.env.NEXT_PUBLIC_CAST_APP_ID || 'CC1AD845';
        context.setOptions({
          receiverApplicationId: appId,
          autoJoinPolicy: 'ORIGIN_SCOPED',
        });

        setState(prev => ({ ...prev, isAvailable: true }));
      } catch {
        // Cast not available
      }
    };

    const checkCast = () => {
      if (typeof window !== 'undefined' && 'chrome' in window && 'cast' in window) {
        setState(prev => ({ ...prev, isAvailable: true }));
      }
    };

    if (typeof window !== 'undefined') {
      (window as unknown as AnyRecord)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
        if (isAvailable) {
          doInitializeCast();
        }
      };
    }

    checkCast();
  }, []);

  const startCasting = useCallback(async (audioUrl: string, title: string) => {
    try {
      const cast = getWindowProp('cast');
      const chrome = getWindowProp('chrome');
      if (!cast || !chrome) return false;

      const context = cast.framework.CastContext.getInstance();
      await context.requestSession();

      const session = context.getCurrentSession();
      if (!session) return false;

      const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, 'audio/mpeg');
      mediaInfo.metadata = { title };

      const request = new chrome.cast.media.LoadRequest(mediaInfo);
      await session.loadMedia(request);

      setState(prev => ({
        ...prev,
        isConnected: true,
        deviceName: session.getCastDevice()?.friendlyName || 'Cast Device',
      }));

      return true;
    } catch {
      return false;
    }
  }, []);

  const stopCasting = useCallback(() => {
    try {
      const cast = getWindowProp('cast');
      if (!cast) return;

      const context = cast.framework.CastContext.getInstance();
      context.endCurrentSession(true);

      setState(prev => ({ ...prev, isConnected: false, deviceName: null }));
    } catch {
      // Ignore
    }
  }, []);

  return {
    ...state,
    startCasting,
    stopCasting,
  };
}
