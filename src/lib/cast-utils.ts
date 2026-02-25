/**
 * Cross-platform audio output utility.
 *
 * Priority:
 * 1. AirPlay via Remote Playback API (feature-detected, works on Safari/Apple)
 * 2. Google Cast SDK (Chrome desktop + Android)
 * 3. Fallback guidance (Bluetooth for Google speakers, etc.)
 *
 * NOTE: Google smart speakers (Home, Nest) do NOT support AirPlay.
 * From iOS the only option for Google speakers is Bluetooth.
 * Spotify uses their proprietary "Spotify Connect" which is NOT available
 * for third-party web apps.
 */

import { audioEngine } from '@/lib/audio-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>;

const w = () => (typeof window !== 'undefined' ? window as unknown as AnyWindow : null);

let sdkLoading = false;

function isHebrew(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.lang === 'he' ||
    document.documentElement.dir === 'rtl';
}

/**
 * Feature detection: does this browser support AirPlay / Remote Playback?
 * Uses capability checks — NOT User-Agent sniffing.
 */
function platformSupportsAirPlay(): boolean {
  if (typeof window === 'undefined') return false;

  // Safari exposes this constructor when AirPlay is available
  if ('WebKitPlaybackTargetAvailabilityEvent' in window) return true;

  // Check Remote Playback API on a temporary audio element
  try {
    const testAudio = document.createElement('audio');
    if ('remote' in testAudio) return true;
  } catch { /* ignore */ }

  return false;
}

/** True if we're in a Chrome-based browser that can run the Cast SDK */
export function isCastCompatible(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edge\/|Edg\//.test(ua) && !/CriOS/.test(ua);
}

/** Make a relative URL absolute so a Cast device can fetch it */
function toAbsoluteUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ─── AirPlay ────────────────────────────────────────────────────

type AirPlayResult = 'success' | 'no-audio' | 'no-devices' | 'cancelled' | 'unsupported';

/**
 * Attempt to show the native AirPlay picker.
 * Tries Remote Playback API first, then WebKit-specific API.
 */
async function tryAirPlay(): Promise<AirPlayResult> {
  const audio = audioEngine.getAudioElement();

  if (!audio) return 'no-audio';

  // 1. Standard Remote Playback API (Safari 13.1+)
  if ('remote' in audio) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (audio as any).remote.prompt();
      return 'success';
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotFoundError') return 'no-devices';
      if (err.name === 'InvalidStateError') return 'cancelled';
      console.warn('[AirPlay] remote.prompt() error:', err.name, err.message);
      // Fall through to try WebKit API
    }
  }

  // 2. WebKit-specific API (older Safari)
  if ('webkitShowPlaybackTargetPicker' in audio) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (audio as any).webkitShowPlaybackTargetPicker();
      return 'success';
    } catch (e) {
      console.warn('[AirPlay] webkitShowPlaybackTargetPicker error:', e);
    }
  }

  return 'unsupported';
}

// ─── Google Cast SDK ─────────────────────────────────────────────

function loadCastSdk(): Promise<boolean> {
  const win = w();
  if (!win) return Promise.resolve(false);

  if (win.cast?.framework) return Promise.resolve(true);

  if (sdkLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (win.cast?.framework) { clearInterval(check); resolve(true); }
      }, 200);
      setTimeout(() => { clearInterval(check); resolve(!!win.cast?.framework); }, 10000);
    });
  }

  sdkLoading = true;

  return new Promise<boolean>((resolve) => {
    win['__onGCastApiAvailable'] = (available: boolean) => {
      if (available && win.cast?.framework) {
        try {
          const ctx = win.cast.framework.CastContext.getInstance();
          ctx.setOptions({
            receiverApplicationId: process.env.NEXT_PUBLIC_CAST_APP_ID || 'CC1AD845',
            autoJoinPolicy: 'ORIGIN_SCOPED',
          });
        } catch { /* ignore */ }
      }
      sdkLoading = false;
      resolve(available);
    };

    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.onerror = () => { sdkLoading = false; resolve(false); };
    document.head.appendChild(script);

    setTimeout(() => { sdkLoading = false; resolve(false); }, 10000);
  });
}

// ─── Main entry point ────────────────────────────────────────────

/**
 * Handle a cast/broadcast button click.
 *
 * Priority:
 * 1. AirPlay (feature-detected, no UA sniffing)
 * 2. Google Cast SDK (Chrome)
 * 3. Fallback guidance with Bluetooth suggestion for Google speakers
 */
export async function handleCastClick(): Promise<void> {
  const he = isHebrew();

  // ── 1. AirPlay — feature-detected (Safari, iOS, macOS) ────────
  if (platformSupportsAirPlay()) {
    const result = await tryAirPlay();

    switch (result) {
      case 'success':
      case 'cancelled':
        return;

      case 'no-audio':
        alert(he
          ? 'התחל להשמיע שיעור תחילה, ואז לחץ על כפתור השידור.'
          : 'Start playing a lesson first, then tap the cast button.'
        );
        return;

      case 'no-devices':
        alert(he
          ? 'לא נמצאו מכשירי AirPlay ברשת.\n\n'
            + 'AirPlay עובד עם: HomePod, Apple TV, רמקולים תומכי AirPlay.\n\n'
            + 'לרמקול Google (Home/Nest): חבר דרך Bluetooth בהגדרות הטלפון.'
          : 'No AirPlay devices found on your network.\n\n'
            + 'AirPlay works with: HomePod, Apple TV, AirPlay speakers.\n\n'
            + 'For Google speakers (Home/Nest): connect via Bluetooth in Settings.'
        );
        return;

      case 'unsupported':
        // AirPlay APIs didn't work — fall through to Cast / fallback
        break;
    }
  }

  // ── 2. Chrome → Google Cast (Chromecast) ───────────────────────
  if (isCastCompatible()) {
    const available = await loadCastSdk();
    const win = w();

    if (available && win?.cast?.framework) {
      try {
        const ctx = win.cast.framework.CastContext.getInstance();
        await ctx.requestSession();

        // After session established → load current audio on the Cast device
        const session = ctx.getCurrentSession?.();
        if (session && win.chrome?.cast) {
          const currentUrl = audioEngine.getCurrentUrl();
          if (currentUrl) {
            try {
              const absoluteUrl = toAbsoluteUrl(currentUrl);
              const mediaInfo = new win.chrome.cast.media.MediaInfo(absoluteUrl, 'audio/mpeg');
              const request = new win.chrome.cast.media.LoadRequest(mediaInfo);
              await session.loadMedia(request);
            } catch {
              console.warn('[Cast] Connected but failed to load media on device');
            }
          }
        }
      } catch {
        // User cancelled the picker
      }
    } else {
      alert(he
        ? 'לא נמצאו מכשירי Chromecast ברשת.\nוודא שמכשיר ה-Chromecast מחובר לאותה רשת WiFi.'
        : 'No Chromecast devices found.\nMake sure your Chromecast is on the same WiFi network.'
      );
    }
    return;
  }

  // ── 3. Fallback — Bluetooth guidance for Google speakers ───────
  alert(he
    ? 'שידור לרמקול:\n\n'
      + '• רמקול Google (Home/Nest): חבר דרך הגדרות ← Bluetooth\n\n'
      + '• רמקול AirPlay (HomePod וכו\'): התחל להשמיע ואז בחר ב-AirPlay דרך מרכז הבקרה\n\n'
      + '• Chromecast: פתח בדפדפן Chrome במחשב'
    : 'Stream to speaker:\n\n'
      + '• Google speakers (Home/Nest): connect via Settings → Bluetooth\n\n'
      + '• AirPlay speakers (HomePod etc.): start playback then select AirPlay from Control Center\n\n'
      + '• Chromecast: open in Chrome on desktop'
  );
}
