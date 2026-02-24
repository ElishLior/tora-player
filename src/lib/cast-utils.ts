/**
 * Cross-platform audio output utility.
 *
 * 1. Safari (iOS / macOS): Remote Playback API → native AirPlay picker
 * 2. Chrome (desktop / Android): Google Cast SDK → Chromecast picker
 * 3. Other browsers: helpful guidance alert
 */

import { audioEngine } from '@/lib/audio-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>;

const w = () => (typeof window !== 'undefined' ? window as unknown as AnyWindow : null);

let sdkLoading = false;

function isHebrew(): boolean {
  return document.documentElement.lang === 'he' ||
    document.documentElement.dir === 'rtl';
}

/** True if we're in a Chrome-based browser that can run the Cast SDK */
export function isCastCompatible(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome\//.test(ua) && !/Edge\/|Edg\//.test(ua) && !/CriOS/.test(ua);
}

/** True if the browser supports Remote Playback (AirPlay on Safari) */
function supportsRemotePlayback(): boolean {
  const audio = audioEngine.getAudioElement();
  if (!audio) return false;
  return 'remote' in audio;
}

// ─── Remote Playback (AirPlay) ───────────────────────────────────

async function promptAirPlay(): Promise<boolean> {
  const audio = audioEngine.getAudioElement();
  if (!audio || !('remote' in audio)) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remote = (audio as any).remote;
    await remote.prompt();
    return true;
  } catch (e) {
    // User cancelled or no devices found
    const error = e as Error;
    if (error.name === 'NotFoundError') {
      alert(isHebrew()
        ? 'לא נמצאו מכשירי AirPlay ברשת.\nוודא שהמכשיר מחובר לאותה רשת WiFi.'
        : 'No AirPlay devices found.\nMake sure the device is on the same WiFi network.'
      );
    }
    // InvalidStateError = user cancelled, which is fine
    return false;
  }
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
 * 1. Remote Playback API (AirPlay on Safari) — works on iPhone, iPad, Mac
 * 2. Google Cast SDK (Chromecast on Chrome) — works on Chrome desktop + Android
 * 3. Fallback: helpful guidance about Bluetooth / system audio routing
 */
export async function handleCastClick(): Promise<void> {
  // 1. Try AirPlay via Remote Playback API (Safari on Apple devices)
  if (supportsRemotePlayback()) {
    await promptAirPlay();
    return;
  }

  // 2. Try Google Cast (Chrome)
  if (isCastCompatible()) {
    const available = await loadCastSdk();
    const win = w();

    if (available && win?.cast?.framework) {
      try {
        const ctx = win.cast.framework.CastContext.getInstance();
        await ctx.requestSession();
      } catch {
        // User cancelled the picker
      }
    } else {
      alert(isHebrew()
        ? 'לא נמצאו מכשירי Cast ברשת.\nוודא שמכשיר ה-Chromecast מחובר לאותה רשת WiFi.'
        : 'No Cast devices found on your network.\nMake sure your Chromecast is on the same WiFi network.'
      );
    }
    return;
  }

  // 3. Fallback: guidance
  alert(isHebrew()
    ? 'לרמקול Bluetooth: חבר דרך הגדרות הטלפון ← Bluetooth.\n\nל-Chromecast: פתח את האפליקציה בדפדפן Chrome.\n\nל-AirPlay: התחל להשמיע ואז השתמש במרכז הבקרה של המכשיר.'
    : 'For Bluetooth speakers: connect via phone Settings → Bluetooth.\n\nFor Chromecast: open the app in Chrome browser.\n\nFor AirPlay: start playback, then use Control Center.'
  );
}
