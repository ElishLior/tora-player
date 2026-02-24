/**
 * Google Cast utility — plain functions, no React hooks.
 * Cast SDK only works in Chrome (desktop + Android).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>;

const w = () => (typeof window !== 'undefined' ? window as unknown as AnyWindow : null);

let sdkLoading = false;

/** True if we're in a Chrome-based browser that can run the Cast SDK */
export function isCastCompatible(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Chrome on desktop/Android (not Edge, not CriOS on iOS which doesn't support Cast)
  return /Chrome\//.test(ua) && !/Edge\/|Edg\//.test(ua) && !/CriOS/.test(ua);
}

/** Load the Google Cast SDK and return true if available */
function loadSdk(): Promise<boolean> {
  const win = w();
  if (!win) return Promise.resolve(false);

  // Already loaded
  if (win.cast?.framework) return Promise.resolve(true);

  // Already loading
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

/**
 * Main entry point: handle a cast button click.
 * - On Chrome: loads SDK → opens Cast device picker
 * - On other browsers: shows a helpful alert about connecting via Bluetooth/system settings
 */
export async function handleCastClick(): Promise<void> {
  // Non-Chrome: give helpful guidance
  if (!isCastCompatible()) {
    const isHebrew = document.documentElement.lang === 'he' ||
      document.documentElement.dir === 'rtl';

    alert(isHebrew
      ? 'שידור Google Cast זמין רק בדפדפן Chrome במחשב או באנדרואיד.\n\nלרמקול Bluetooth: חבר דרך הגדרות הטלפון ← Bluetooth.\n\nל-AirPlay (אייפון): השתמש במרכז הבקרה ← שיקוף/שמע.'
      : 'Google Cast is available in Chrome browser only (desktop or Android).\n\nFor Bluetooth speakers: connect via your phone Settings → Bluetooth.\n\nFor AirPlay (iPhone): use Control Center → Screen Mirroring/Audio.'
    );
    return;
  }

  // Chrome: load SDK and open picker
  const available = await loadSdk();
  const win = w();

  if (available && win?.cast?.framework) {
    try {
      const ctx = win.cast.framework.CastContext.getInstance();
      await ctx.requestSession();
    } catch {
      // User cancelled the picker — that's OK
    }
  } else {
    const isHebrew = document.documentElement.lang === 'he' ||
      document.documentElement.dir === 'rtl';
    alert(isHebrew
      ? 'לא נמצאו מכשירי Cast ברשת.\nוודא שמכשיר ה-Chromecast מחובר לאותה רשת WiFi.'
      : 'No Cast devices found on your network.\nMake sure your Chromecast is on the same WiFi network.'
    );
  }
}
