/*
 * Opt-in, device-only playback event log for real-device checks (lock screen,
 * Spotify takeover, headset buttons, background kills) that desktop tests
 * cannot reproduce. Off unless the listener turns it on at /diagnostics. It
 * never touches the network and records no URLs: only ids, positions and
 * element state. The log survives a page reload, so a page the OS killed in
 * the background can still be read afterwards.
 */

export const DIAGNOSTICS_ENABLED_KEY = 'tora-diag';
export const DIAGNOSTICS_LOG_KEY = 'tora-diag-log';
export const MAX_DIAGNOSTIC_ENTRIES = 600;
const PERSIST_DELAY_MS = 1_000;

type DiagValue = string | number | boolean | null;
export type DiagData = Record<string, DiagValue>;

export interface DiagEntry {
  /** Milliseconds since epoch. */
  t: number;
  /** Which page load wrote it; a change between entries means the page was reloaded. */
  boot: string;
  type: string;
  data?: DiagData;
}

type DiagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface DiagnosticsLog {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  record(type: string, data?: DiagData): void;
  entries(): DiagEntry[];
  clear(): void;
  /** Writes pending entries now (page hidden / about to be frozen). */
  flush(): void;
  format(header: DiagData): string;
}

function readEntries(storage: DiagStorage): DiagEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DIAGNOSTICS_LOG_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

export function createDiagnosticsLog(
  storage: DiagStorage | null,
  options: {
    now?: () => number;
    bootId?: string;
    schedule?: (flush: () => void, delayMs: number) => unknown;
  } = {},
): DiagnosticsLog {
  const now = options.now ?? Date.now;
  const boot = options.bootId ?? now().toString(36);
  const schedule = options.schedule ?? ((flush, delayMs) => setTimeout(flush, delayMs));
  let loaded: DiagEntry[] | null = null;
  let dirty = false;
  let pending = false;

  const isEnabled = () => {
    try {
      return storage?.getItem(DIAGNOSTICS_ENABLED_KEY) === '1';
    } catch {
      return false;
    }
  };

  const list = () => (loaded ??= storage ? readEntries(storage) : []);

  const flush = () => {
    pending = false;
    if (!dirty || !storage) return;
    dirty = false;
    try {
      storage.setItem(DIAGNOSTICS_LOG_KEY, JSON.stringify(list()));
    } catch {
      // Storage full or blocked: diagnostics must never affect playback.
    }
  };

  return {
    isEnabled,
    setEnabled(enabled) {
      try {
        if (enabled) storage?.setItem(DIAGNOSTICS_ENABLED_KEY, '1');
        else storage?.removeItem(DIAGNOSTICS_ENABLED_KEY);
      } catch {
        // Ignore: see flush.
      }
    },
    record(type, data) {
      if (!isEnabled()) return;
      const entries = list();
      entries.push(data ? { t: now(), boot, type, data } : { t: now(), boot, type });
      if (entries.length > MAX_DIAGNOSTIC_ENTRIES) entries.splice(0, entries.length - MAX_DIAGNOSTIC_ENTRIES);
      dirty = true;
      if (!pending) {
        pending = true;
        schedule(flush, PERSIST_DELAY_MS);
      }
    },
    entries() {
      flush();
      return [...(loaded = storage ? readEntries(storage) : [])];
    },
    clear() {
      loaded = [];
      dirty = false;
      try {
        storage?.removeItem(DIAGNOSTICS_LOG_KEY);
      } catch {
        // Ignore: see flush.
      }
    },
    flush,
    format(header) {
      const lines = [`# Tora Player playback log`, `# ${JSON.stringify(header)}`];
      let previous = 0;
      for (const entry of this.entries()) {
        const gap = previous ? `+${((entry.t - previous) / 1000).toFixed(1)}s` : 'start';
        previous = entry.t;
        const time = new Date(entry.t).toISOString().slice(11, 23);
        lines.push(`${time} ${gap} [${entry.boot}] ${entry.type}${entry.data ? ' ' + JSON.stringify(entry.data) : ''}`);
      }
      return lines.join('\n');
    },
  };
}

function browserStorage(): DiagStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

let shared: DiagnosticsLog | null = null;

/** The one log of this page load. Safe to call anywhere; a no-op unless enabled. */
export function diagnostics(): DiagnosticsLog {
  return (shared ??= createDiagnosticsLog(browserStorage(), { bootId: Math.random().toString(36).slice(2, 7) }));
}

export function diag(type: string, data?: DiagData): void {
  diagnostics().record(type, data);
}

/** What the audio element reports right now, with no URL. */
export function elementSnapshot(element: HTMLAudioElement): DiagData {
  const round = (value: number) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : String(value));
  return {
    paused: element.paused,
    ended: element.ended,
    ready: element.readyState,
    net: element.networkState,
    time: round(element.currentTime),
    dur: round(element.duration),
    seeking: element.seeking,
    err: element.error ? element.error.code : null,
  };
}

const ELEMENT_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'durationchange',
  'canplay',
  'play',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'seeking',
  'seeked',
  'ended',
  'error',
  'emptied',
  'abort',
] as const;

/** Logs every state-bearing element event with a snapshot. Does nothing while the log is off. */
export function attachElementDiagnostics(element: HTMLAudioElement): void {
  for (const type of ELEMENT_EVENTS) {
    element.addEventListener(type, () => {
      if (diagnostics().isEnabled()) diag(`audio:${type}`, elementSnapshot(element));
    });
  }
}

/** Device and display mode, for the log header and the boot entry. */
export function environmentInfo(): DiagData {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  return {
    standalone:
      (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    visible: typeof document === 'undefined' ? null : document.visibilityState,
    mediaSession: 'mediaSession' in navigator,
    ua: navigator.userAgent ?? null,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown',
  };
}

/** Page lifecycle, once per page load: the OS hiding, freezing, restoring or killing the page. */
export function startLifecycleDiagnostics(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  diag('boot', environmentInfo());

  const log = diagnostics();
  const handlers: Array<[EventTarget, string, EventListener]> = [
    [
      document,
      'visibilitychange',
      () => {
        diag('page:visibility', { state: document.visibilityState });
        if (document.visibilityState === 'hidden') log.flush();
      },
    ],
    [
      window,
      'pagehide',
      (event) => {
        diag('page:pagehide', { persisted: (event as PageTransitionEvent).persisted });
        log.flush();
      },
    ],
    [window, 'pageshow', (event) => diag('page:pageshow', { persisted: (event as PageTransitionEvent).persisted })],
    [
      document,
      'freeze',
      () => {
        diag('page:freeze');
        log.flush();
      },
    ],
    [document, 'resume', () => diag('page:resume')],
    [window, 'online', () => diag('net:online')],
    [window, 'offline', () => diag('net:offline')],
  ];
  for (const [target, type, listener] of handlers) target.addEventListener(type, listener);
  return () => {
    for (const [target, type, listener] of handlers) target.removeEventListener(type, listener);
  };
}
