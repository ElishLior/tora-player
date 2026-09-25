/**
 * Cross-platform audio output ("Cast" button).
 *
 * Priority:
 * 1. AirPlay via Remote Playback API (feature-detected, works on Safari/Apple)
 * 2. Google Cast SDK (Chrome desktop + Android): the device continues the
 *    lesson from the current position and local playback pauses
 * 3. Fallback guidance (Bluetooth for Google speakers, etc.)
 *
 * Outcomes are reported through `useCastStatus` and shown inline by
 * `CastStatusMessage`; nothing here opens browser dialogs.
 *
 * NOTE: Google smart speakers (Home, Nest) do NOT support AirPlay.
 * From iOS the only option for Google speakers is Bluetooth.
 */

import { create } from 'zustand';
import { audioEngine } from '@/lib/audio-engine';
import { pause } from '@/lib/audio-controller';
import { getAudioContentType } from '@/lib/audio-download';
import { useAudioStore } from '@/stores/audio-store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & Record<string, any>;

const w = () => (typeof window !== 'undefined' ? window as unknown as AnyWindow : null);

let sdkLoading = false;

/** Message keys under `player.castStatus`. */
export type CastStatus = 'noAudio' | 'noAirPlayDevices' | 'noChromecast' | 'castFailed' | 'casting' | 'guidance';

export const useCastStatus = create<{ status: CastStatus | null }>(() => ({ status: null }));

function report(status: CastStatus) {
  useCastStatus.setState({ status });
}

/**
 * Offline copies play from blob: URLs that only exist in this tab, so no
 * receiver can fetch them; the Cast button is hidden for them.
 */
export function isCastableSource(source: string | null): boolean {
  return !source?.startsWith('blob:');
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
function isCastCompatible(): boolean {
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

/** The part of a CAF CastSession used here. */
interface CastSession {
  loadMedia(request: unknown): Promise<unknown>;
}

/**
 * Hands the loaded lesson over to the connected Chromecast: same file, same
 * position, real MIME type; local playback pauses once the device took it.
 */
async function loadOnChromecast(win: AnyWindow, session: CastSession): Promise<CastStatus> {
  const source = audioEngine.getCurrentUrl();
  const track = useAudioStore.getState().currentTrack;
  if (!source || !track) return 'noAudio';

  const media = win.chrome.cast.media;
  const contentType = track.mimeType || getAudioContentType(track.fileKey || track.originalName || source);
  const mediaInfo = new media.MediaInfo(toAbsoluteUrl(source), contentType);
  const metadata = new media.GenericMediaMetadata();
  metadata.title = track.hebrewTitle || track.title;
  if (track.seriesName) metadata.subtitle = track.seriesName;
  mediaInfo.metadata = metadata;

  const request = new media.LoadRequest(mediaInfo);
  request.currentTime = audioEngine.getCurrentTime();
  request.autoplay = true;
  try {
    await session.loadMedia(request);
  } catch {
    return 'castFailed';
  }
  pause();
  return 'casting';
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
  useCastStatus.setState({ status: null });

  // ── 1. AirPlay — feature-detected (Safari, iOS, macOS) ────────
  if (platformSupportsAirPlay()) {
    const result = await tryAirPlay();

    switch (result) {
      case 'success':
      case 'cancelled':
        return;
      case 'no-audio':
        report('noAudio');
        return;
      case 'no-devices':
        report('noAirPlayDevices');
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

    if (!available || !win?.cast?.framework) {
      report('noChromecast');
      return;
    }
    const ctx = win.cast.framework.CastContext.getInstance();
    try {
      await ctx.requestSession();
    } catch {
      return; // The listener closed the picker.
    }
    const session = ctx.getCurrentSession?.();
    if (session && win.chrome?.cast) report(await loadOnChromecast(win, session));
    return;
  }

  // ── 3. Fallback — Bluetooth guidance for Google speakers ───────
  report('guidance');
}
