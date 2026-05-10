# Mobile Background Playback Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tora Player behave as close as a web/PWA can to Spotify or Apple Music for long-form lesson playback across app switching, screen lock/unlock, Bluetooth/car controls, and offline driving use.

**User Promise:** Tora Player will not silently lie about playback. If mobile playback pauses, stalls, or cannot resume, the app will either recover the same lesson at the same approximate position or clearly tell the listener what happened and what to do next. Offline lessons are the recommended path for driving and low-signal listening.

**Architecture:** Keep the current Howler singleton, but add a small testable lifecycle layer that reconciles native `<audio>` events with playback intent. The UI store remains the source of user intent, while the audio engine reports actual native media state and the hook performs bounded recovery only when the current track still matches.

**Tech Stack:** Next.js 15 App Router, TypeScript, Howler.js, Zustand, Media Session API, Wake Lock API, IndexedDB offline audio, Vitest, Playwright, manual iOS/Android device QA.

---

## Current State

The production app already has:

- `src/lib/audio-engine.ts`: Howler singleton with `html5: true`, single `soundId`, duplicate-play guard, and native element access through `getAudioElement()`.
- `src/hooks/use-audio-player.ts`: track loading, offline blob resolution, foreground resume on `visibilitychange`, progress saving, and play/pause sync.
- `src/hooks/use-media-session.ts`: Media Session metadata/actions plus Wake Lock.
- `src/app/[locale]/driving/page.tsx`: driving mode with screen Wake Lock behavior.
- `src/lib/audio-resume.ts`: reusable resume helper that protects against stale-track async races.
- `src/lib/offline-storage.ts`: file-level offline audio cache and exact offline key lookup.

## Non-Negotiable Platform Reality

A PWA cannot configure the same OS-level audio session as a native iOS/Android app. This plan should harden web behavior, improve recovery, make failures visible, and establish a real-device QA gate. If iPhone Home Screen PWA still cannot meet lock-screen/car resume expectations after this pass, the next product decision is a native shell or React Native/Capacitor track.

## Review Verdict

Four reviewer passes were run before execution: mobile audio architecture, QA/release gate, infra/security spillover, and product/UX. The plan is feasible, but execution is blocked until the guardrails below are treated as part of scope.

- Recovery must be bounded. No event handler may repeatedly call `play()` or reload in a loop. Recovery gets a cooldown, a maximum attempt count per track, and a `needs-user-gesture` outcome when browser autoplay policy blocks resume.
- Track identity must be explicit. Recovery cannot rely on URL equality alone because offline playback can use `blob:` URLs and lessons can contain multiple audio files. The engine needs a loaded identity containing `lessonId`, `audioFileId`, `offlineKey`, source URL, and resolved URL.
- Playwright is synthetic only. It cannot validate OS lock screen, iOS PWA suspension, Bluetooth devices, car controls, or true mobile background behavior.
- Real-device QA is a release gate. Do not merge or release this work until required device rows are completed with device model, OS version, browser/PWA install mode, network type, pass/fail, notes, and evidence.
- Service worker behavior is in scope. If playback/offline behavior changes, bump `public/sw.js` `CACHE_VERSION`, verify activation from the previous version, and document the unregister/clear-cache fallback.

## Recommended PR Sequence

Execute this as visible, lower-risk increments:

1. **PR 1:** Native audio lifecycle diagnostics. The UI no longer shows playing forever when native audio is paused/stalled/errored.
2. **PR 2:** Bounded recovery and Media Session parity. Lock-screen/Bluetooth controls use the same safe recovery path and cannot create duplicate streams.
3. **PR 3:** Driving/offline UX polish. Save-offline states, recovery notices, tap-to-resume, Hebrew/RTL copy, and accessibility.
4. **PR 4:** QA hardening and release gate. Synthetic browser diagnostics, real offline-save E2E, service worker upgrade check, and completed device checklist.

Each PR still runs the relevant subset of this plan. Production release waits for PR 4 and the completed real-device gate.

## Adjacent UX Upgrade Plan

Playback hardening makes the app truthful and resilient. The companion product-polish plan makes it feel like a dedicated audio app: mini-player polish, queue/history, resume continuity, offline confidence, and sleep timer.

See: `docs/superpowers/plans/2026-05-10-player-experience-upgrade.md`

## Offline Download UX Contract

The implementation must preserve the local-download work already shipped and make the offline save flow explicit:

- Entry points: lesson detail player, per-file audio list, offline page, and driving mode notice.
- States: `not-saved`, `saving`, `saved`, `failed`, `storage-full`, `needs-update`, and `removing`.
- Required actions: save for offline playback, retry failed save, remove saved lesson/file, and download the raw audio file to the device.
- When a lesson/file is saved, future playback and recovery should prefer the offline blob automatically when the track identity matches.
- If storage persistence is denied or quota is low, show a Hebrew/RTL message with a retry/remove path rather than failing silently.
- Offline page remains a launch surface: saved lessons must be playable while the browser context is offline.

## Playback Recovery UX States

The store/UI must be able to represent:

- `playing`: user intended playback and native audio confirms playback.
- `recovering`: the app is attempting one bounded recovery for the same track.
- `stalled`: native audio is waiting/stalled and recovery has not yet succeeded.
- `resumed`: recovery succeeded for the same track and approximate position.
- `needs-user-gesture`: browser policy blocked autoplay or resume; show a clear tap-to-resume control.
- `offline-recommended`: current streaming context is fragile for driving or low-signal use.
- `failed`: recovery attempts were exhausted or native audio errored.

## Accessibility and RTL Requirements

- User-facing strings go through `messages/he.json` and `messages/en.json`; inline strings in snippets are examples only.
- Recovery and offline notices use `role="status"` or `aria-live="polite"` as appropriate.
- Error/recovery states are not color-only; include text and iconography.
- Driving controls and recovery actions keep touch targets at least 44px.
- Layout must work in Hebrew RTL and English LTR.
- Media Session metadata must prefer Hebrew lesson titles when locale/current track data provides them.

## File Structure

- Create `src/lib/audio-lifecycle.ts`
  - Pure decision functions for native audio events and recovery actions.
- Create `src/lib/audio-lifecycle.test.ts`
  - Unit tests for pause/stall/error/visibility recovery decisions.
- Modify `src/lib/audio-engine.ts`
  - Expose native audio event snapshots and a subscription API without leaking Howler internals.
- Modify `src/lib/audio-engine.test.ts`
  - Verify native listener attachment, cleanup, and no duplicate event listeners.
- Modify `src/hooks/use-audio-player.ts`
  - Consume lifecycle decisions, reconcile actual native pause/stall/error states, and record diagnostics.
- Modify `src/hooks/use-media-session.ts`
  - Keep Media Session state aligned with actual playback state and make action handlers use the same recovery path.
- Modify `src/stores/audio-store.ts`
  - Add bounded playback diagnostics and a `lastNativePlaybackState`.
- Modify `src/app/[locale]/driving/page.tsx`
  - Surface a compact recovery/offline hint when driving mode detects fragile network playback.
- Modify `messages/he.json`
  - Add Hebrew strings for recovery/offline status states.
- Modify `messages/en.json`
  - Add English fallback strings for recovery/offline status states.
- Modify `public/sw.js`
  - Bump `CACHE_VERSION` when offline or app-shell behavior changes.
- Create `tests/e2e/background-playback.spec.ts`
  - Browser-level synthetic event coverage for visibility changes, native pause/stall events, diagnostics, and Media Session action wiring.
- Modify `tests/e2e/offline-download.spec.ts`
  - Verify the real save-offline flow, IndexedDB writes, offline playback, and multi-file lesson behavior.
- Create `docs/qa/mobile-background-playback-checklist.md`
  - Real-device release checklist for iPhone Safari, iPhone Home Screen PWA, Android Chrome/PWA, Bluetooth/car controls.

## Acceptance Criteria

- A native `pause`, `stalled`, `waiting`, or `error` event does not leave the UI showing "playing" forever when audio is no longer playing.
- Returning from background attempts recovery when user intent is still "playing" and the track identity still matches.
- Explicit user pauses never auto-resume.
- Offline saved audio is preferred for recovery and driving-mode playback.
- Media Session play/pause/seek/next/previous actions use the same safe resume path as the UI.
- Driving mode distinguishes screen Wake Lock from background playback and recommends offline save when streaming.
- Browser tests cover synthetic lifecycle recovery, diagnostics, same-track identity, and no duplicate stream creation.
- Offline download E2E clicks the actual save-offline control, verifies IndexedDB audio bytes, blocks streaming requests, and plays from a `blob:` URL while offline.
- Manual QA matrix records pass/fail for real OS behavior before merge and production.
- Service worker versioning and old-client activation are verified when app-shell/offline behavior changes.

---

### Task 1: Add Pure Audio Lifecycle Decisions

**Files:**
- Create: `src/lib/audio-lifecycle.ts`
- Create: `src/lib/audio-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `src/lib/audio-lifecycle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getAudioRecoveryAction, type AudioLifecycleSnapshot } from './audio-lifecycle';

const baseSnapshot: AudioLifecycleSnapshot = {
  intentPlaying: true,
  engineLoaded: true,
  enginePlaying: false,
  nativePaused: true,
  nativeEnded: false,
  nativeErrored: false,
  documentVisible: true,
  online: true,
  currentTime: 120,
  duration: 3600,
  userPausedAt: null,
  sameTrack: true,
  recoveryAttemptsForTrack: 0,
  msSinceLastRecovery: 5000,
  playBlockedByBrowser: false,
};

describe('getAudioRecoveryAction', () => {
  it('resumes when native audio pauses unexpectedly while play intent remains active', () => {
    expect(getAudioRecoveryAction('pause', baseSnapshot)).toBe('resume-current-track');
  });

  it('does nothing for an explicit user pause', () => {
    expect(getAudioRecoveryAction('pause', {
      ...baseSnapshot,
      intentPlaying: false,
      userPausedAt: Date.now(),
    })).toBe('none');
  });

  it('reloads the current track after a native error while still intending to play', () => {
    expect(getAudioRecoveryAction('error', {
      ...baseSnapshot,
      nativeErrored: true,
    })).toBe('reload-current-track');
  });

  it('marks playback ended when native media ended near duration', () => {
    expect(getAudioRecoveryAction('ended', {
      ...baseSnapshot,
      nativePaused: true,
      nativeEnded: true,
      currentTime: 3599,
      duration: 3600,
    })).toBe('mark-ended');
  });

  it('defers recovery while the document is hidden and the engine still reports playing', () => {
    expect(getAudioRecoveryAction('visibility-hidden', {
      ...baseSnapshot,
      documentVisible: false,
      enginePlaying: true,
      nativePaused: false,
    })).toBe('none');
  });

  it('does not recover stale native events from another track', () => {
    expect(getAudioRecoveryAction('pause', {
      ...baseSnapshot,
      sameTrack: false,
    })).toBe('none');
  });

  it('uses cooldown instead of repeated immediate resume attempts', () => {
    expect(getAudioRecoveryAction('stalled', {
      ...baseSnapshot,
      msSinceLastRecovery: 250,
    })).toBe('wait-for-cooldown');
  });

  it('asks for user gesture after browser autoplay blocks resume', () => {
    expect(getAudioRecoveryAction('pause', {
      ...baseSnapshot,
      playBlockedByBrowser: true,
    })).toBe('needs-user-gesture');
  });

  it('asks for user gesture after max recovery attempts are exhausted', () => {
    expect(getAudioRecoveryAction('waiting', {
      ...baseSnapshot,
      recoveryAttemptsForTrack: 3,
    })).toBe('needs-user-gesture');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run src/lib/audio-lifecycle.test.ts
```

Expected: fail because `src/lib/audio-lifecycle.ts` does not exist.

- [ ] **Step 3: Implement lifecycle decisions**

Create `src/lib/audio-lifecycle.ts`:

```ts
export type NativeAudioLifecycleEvent =
  | 'pause'
  | 'playing'
  | 'waiting'
  | 'stalled'
  | 'suspend'
  | 'error'
  | 'ended'
  | 'emptied'
  | 'visibility-visible'
  | 'visibility-hidden'
  | 'page-show';

export type AudioRecoveryAction =
  | 'none'
  | 'wait-for-cooldown'
  | 'resume-current-track'
  | 'reload-current-track'
  | 'needs-user-gesture'
  | 'mark-ended'
  | 'mark-paused';

export interface AudioLifecycleSnapshot {
  intentPlaying: boolean;
  engineLoaded: boolean;
  enginePlaying: boolean;
  nativePaused: boolean;
  nativeEnded: boolean;
  nativeErrored: boolean;
  documentVisible: boolean;
  online: boolean;
  currentTime: number;
  duration: number;
  userPausedAt: number | null;
  sameTrack: boolean;
  recoveryAttemptsForTrack: number;
  msSinceLastRecovery: number;
  playBlockedByBrowser: boolean;
}

const RECOVERY_COOLDOWN_MS = 2000;
const MAX_RECOVERY_ATTEMPTS_PER_TRACK = 3;

function isNearEnd(currentTime: number, duration: number) {
  return duration > 0 && duration - currentTime <= 2;
}

export function getAudioRecoveryAction(
  eventName: NativeAudioLifecycleEvent,
  snapshot: AudioLifecycleSnapshot,
): AudioRecoveryAction {
  if (!snapshot.intentPlaying) return 'none';
  if (!snapshot.sameTrack) return 'none';
  if (snapshot.playBlockedByBrowser) return 'needs-user-gesture';
  if (snapshot.recoveryAttemptsForTrack >= MAX_RECOVERY_ATTEMPTS_PER_TRACK) {
    return 'needs-user-gesture';
  }
  if (snapshot.msSinceLastRecovery >= 0 && snapshot.msSinceLastRecovery < RECOVERY_COOLDOWN_MS) {
    return 'wait-for-cooldown';
  }

  if (eventName === 'ended' || snapshot.nativeEnded) {
    return isNearEnd(snapshot.currentTime, snapshot.duration) ? 'mark-ended' : 'resume-current-track';
  }

  if (snapshot.nativeErrored || eventName === 'error' || eventName === 'emptied') {
    return 'reload-current-track';
  }

  if (!snapshot.documentVisible && snapshot.enginePlaying && !snapshot.nativePaused) {
    return 'none';
  }

  if (!snapshot.engineLoaded) return 'reload-current-track';

  if (
    eventName === 'pause' ||
    eventName === 'waiting' ||
    eventName === 'stalled' ||
    eventName === 'suspend' ||
    eventName === 'visibility-visible' ||
    eventName === 'page-show'
  ) {
    if (!snapshot.enginePlaying || snapshot.nativePaused) {
      return 'resume-current-track';
    }
  }

  return 'none';
}
```

- [ ] **Step 4: Run lifecycle tests**

Run:

```bash
npx vitest run src/lib/audio-lifecycle.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio-lifecycle.ts src/lib/audio-lifecycle.test.ts
git commit -m "test: add audio lifecycle recovery decisions"
```

---

### Task 2: Expose Native Audio Event Snapshots From AudioEngine

**Files:**
- Modify: `src/lib/audio-engine.ts`
- Modify: `src/lib/audio-engine.test.ts`

- [ ] **Step 1: Add failing engine tests**

Append to `src/lib/audio-engine.test.ts`:

```ts
it('notifies native audio event subscribers with current element state', async () => {
  const { audioEngine } = await import('./audio-engine');
  const events: Array<{ type: string; paused: boolean }> = [];

  audioEngine.setOnNativeAudioEvent((event) => {
    events.push({ type: event.type, paused: event.paused });
  });

  audioEngine.load('/api/audio/stream/lesson.mp3');
  audioEngine.play();

  const howl = Howl.instances.at(-1)!;
  howl._sounds[0]._node.paused = true;
  howl._sounds[0]._node.dispatchEvent(new Event('pause'));

  expect(events).toContainEqual({ type: 'pause', paused: true });

  audioEngine.unload();
});

it('removes native audio listeners when unloading a track', async () => {
  const { audioEngine } = await import('./audio-engine');
  const handler = vi.fn();

  audioEngine.setOnNativeAudioEvent(handler);
  audioEngine.load('/api/audio/stream/lesson.mp3');
  const firstNode = Howl.instances.at(-1)!._sounds[0]._node;
  audioEngine.unload();

  firstNode.dispatchEvent(new Event('pause'));

  expect(handler).not.toHaveBeenCalled();
});
```

If the existing Howl mock does not implement `dispatchEvent`, extend the mock node in the test setup:

```ts
function createMockAudioNode() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    paused: true,
    ended: false,
    error: null,
    readyState: 4,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run src/lib/audio-engine.test.ts
```

Expected: fail because `setOnNativeAudioEvent` does not exist.

- [ ] **Step 3: Add native event API to `AudioEngine`**

In `src/lib/audio-engine.ts`, add these types near the top:

```ts
export interface LoadedAudioTrackIdentity {
  lessonId?: string;
  audioFileId?: string;
  offlineKey?: string;
  sourceUrl: string;
  resolvedUrl: string;
}

export interface NativeAudioEventSnapshot {
  type: string;
  paused: boolean;
  ended: boolean;
  errored: boolean;
  readyState: number;
  currentUrl: string | null;
  loadedTrackIdentity: LoadedAudioTrackIdentity | null;
}
```

Add private fields to `AudioEngine`:

```ts
  private onNativeAudioEvent: ((event: NativeAudioEventSnapshot) => void) | null = null;
  private nativeAudioCleanup: (() => void) | null = null;
  private loadedTrackIdentity: LoadedAudioTrackIdentity | null = null;
```

Add a private listener helper:

```ts
  private attachNativeAudioEventListeners() {
    this.nativeAudioCleanup?.();
    const audioEl = this.getAudioElement();
    if (!audioEl) {
      this.nativeAudioCleanup = null;
      return;
    }

    const eventTypes = ['pause', 'playing', 'waiting', 'stalled', 'suspend', 'error', 'ended', 'emptied'];
    const listener = (event: Event) => {
      this.onNativeAudioEvent?.({
        type: event.type,
        paused: audioEl.paused,
        ended: audioEl.ended,
        errored: Boolean(audioEl.error),
        readyState: audioEl.readyState,
        currentUrl: this.currentUrl,
        loadedTrackIdentity: this.loadedTrackIdentity,
      });
    };

    for (const eventType of eventTypes) {
      audioEl.addEventListener(eventType, listener);
    }

    this.nativeAudioCleanup = () => {
      for (const eventType of eventTypes) {
        audioEl.removeEventListener(eventType, listener);
      }
    };
  }
```

Add an identity-aware overload to `load()` and `ensurePlaying()` so callers can pass the current track identity:

```ts
  load(url: string, options?: { startPosition?: number; trackIdentity?: Omit<LoadedAudioTrackIdentity, 'resolvedUrl'> }) {
    const normalizedUrl = normalizeAudioUrl(url) || url;
    this.loadedTrackIdentity = options?.trackIdentity
      ? { ...options.trackIdentity, resolvedUrl: normalizedUrl }
      : { sourceUrl: url, resolvedUrl: normalizedUrl };
    // existing load logic continues here
  }
```

Attach native listeners as soon as the Howler HTML node exists, not only after successful load. The implementation should call `attachNativeAudioEventListeners()` immediately after `new Howl(...)` if `getAudioElement()` returns a node, again in `onload`, and report Howler `onloaderror` / `onplayerror` through the same native lifecycle callback. Keep the `onload` placement too:

```ts
      onload: () => {
        this.attachNativeAudioEventListeners();
        const duration = this.howl?.duration() || 0;
        this.onLoad?.(duration);
        if (options?.startPosition && options.startPosition > 0) {
          this.howl?.seek(options.startPosition);
        }
      },
      onloaderror: (_id: number, error: unknown) => {
        this.onNativeAudioEvent?.({
          type: 'error',
          paused: true,
          ended: false,
          errored: true,
          readyState: this.getAudioElement()?.readyState ?? 0,
          currentUrl: this.currentUrl,
          loadedTrackIdentity: this.loadedTrackIdentity,
        });
        this.onError?.(`Failed to load audio: ${error}`);
      },
```

Add a public snapshot method for visibility/page-show/media-session handlers when no native event fired:

```ts
  getNativeAudioSnapshot(type = 'snapshot'): NativeAudioEventSnapshot | null {
    const audioEl = this.getAudioElement();
    if (!audioEl) return null;
    return {
      type,
      paused: audioEl.paused,
      ended: audioEl.ended,
      errored: Boolean(audioEl.error),
      readyState: audioEl.readyState,
      currentUrl: this.currentUrl,
      loadedTrackIdentity: this.loadedTrackIdentity,
    };
  }
```

Clean up in `unload()` before unloading Howler:

```ts
  unload() {
    this.stopTimeTracking();
    this.nativeAudioCleanup?.();
    this.nativeAudioCleanup = null;
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
    this.currentUrl = null;
    this.soundId = null;
    this.loadedTrackIdentity = null;
  }
```

Add the public setter:

```ts
  setOnNativeAudioEvent(cb: (event: NativeAudioEventSnapshot) => void) {
    this.onNativeAudioEvent = cb;
  }
```

- [ ] **Step 4: Run engine tests**

Run:

```bash
npx vitest run src/lib/audio-engine.test.ts
```

Expected: all engine tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio-engine.ts src/lib/audio-engine.test.ts
git commit -m "feat: report native audio lifecycle events"
```

---

### Task 3: Reconcile Native Audio State in `useAudioPlayer`

**Files:**
- Modify: `src/stores/audio-store.ts`
- Modify: `src/hooks/use-audio-player.ts`
- Test: `src/lib/audio-lifecycle.test.ts`

- [ ] **Step 1: Add store fields for diagnostics**

Modify `src/stores/audio-store.ts`:

```ts
export interface PlaybackDiagnostic {
  at: string;
  event: string;
  action: string;
  trackId?: string;
  audioFileId?: string;
  offlineKey?: string;
  currentTime: number;
  result?: 'attempted' | 'blocked' | 'cooldown' | 'succeeded' | 'failed' | 'ignored';
}
```

Add fields to `AudioPlayerState`:

```ts
  lastNativePlaybackState: 'unknown' | 'playing' | 'paused' | 'waiting' | 'stalled' | 'errored' | 'ended';
  playbackRecoveryState: 'idle' | 'recovering' | 'stalled' | 'needs-user-gesture' | 'failed';
  playbackDiagnostics: PlaybackDiagnostic[];
  recoveryAttemptsByTrack: Record<string, { count: number; lastAttemptAt: number; playBlocked: boolean }>;
  setNativePlaybackState: (state: AudioPlayerState['lastNativePlaybackState']) => void;
  setPlaybackRecoveryState: (state: AudioPlayerState['playbackRecoveryState']) => void;
  addPlaybackDiagnostic: (diagnostic: PlaybackDiagnostic) => void;
  clearPlaybackDiagnostics: () => void;
  markPlaybackRecoveryAttempt: (trackKey: string) => void;
  markPlaybackNeedsUserGesture: (trackKey: string) => void;
```

Add initial values and actions:

```ts
      lastNativePlaybackState: 'unknown',
      playbackRecoveryState: 'idle',
      playbackDiagnostics: [],
      recoveryAttemptsByTrack: {},
      setNativePlaybackState: (state) => set({ lastNativePlaybackState: state }),
      setPlaybackRecoveryState: (state) => set({ playbackRecoveryState: state }),
      addPlaybackDiagnostic: (diagnostic) =>
        set((state) => ({
          playbackDiagnostics: [...state.playbackDiagnostics.slice(-19), diagnostic],
        })),
      clearPlaybackDiagnostics: () => set({ playbackDiagnostics: [] }),
      markPlaybackRecoveryAttempt: (trackKey) =>
        set((state) => {
          const previous = state.recoveryAttemptsByTrack[trackKey];
          return {
            playbackRecoveryState: 'recovering',
            recoveryAttemptsByTrack: {
              ...state.recoveryAttemptsByTrack,
              [trackKey]: {
                count: (previous?.count ?? 0) + 1,
                lastAttemptAt: Date.now(),
                playBlocked: previous?.playBlocked ?? false,
              },
            },
          };
        }),
      markPlaybackNeedsUserGesture: (trackKey) =>
        set((state) => ({
          playbackRecoveryState: 'needs-user-gesture',
          recoveryAttemptsByTrack: {
            ...state.recoveryAttemptsByTrack,
            [trackKey]: {
              count: state.recoveryAttemptsByTrack[trackKey]?.count ?? 0,
              lastAttemptAt: state.recoveryAttemptsByTrack[trackKey]?.lastAttemptAt ?? 0,
              playBlocked: true,
            },
          },
        })),
```

Keep diagnostics out of persistence by leaving `partialize` unchanged.

- [ ] **Step 2: Wire native events in `useAudioPlayer`**

In `src/hooks/use-audio-player.ts`, import lifecycle helpers and the native event type:

```ts
import { getAudioRecoveryAction, type NativeAudioLifecycleEvent } from '@/lib/audio-lifecycle';
import type { NativeAudioEventSnapshot } from '@/lib/audio-engine';
```

Add this helper near `isSameAudioTrack`:

```ts
function mapNativeEventToState(event: NativeAudioEventSnapshot): 'playing' | 'paused' | 'waiting' | 'stalled' | 'errored' | 'ended' {
  if (event.errored || event.type === 'error') return 'errored';
  if (event.ended || event.type === 'ended') return 'ended';
  if (event.type === 'waiting') return 'waiting';
  if (event.type === 'stalled' || event.type === 'suspend') return 'stalled';
  if (event.type === 'playing') return 'playing';
  return 'paused';
}

function getTrackKey(track: AudioTrack | null | undefined) {
  if (!track) return 'none';
  return [
    track.lessonId || track.id,
    track.audioFileId || '',
    track.offlineKey || '',
    track.audioUrl,
  ].join('|');
}

function isNativeEventForCurrentTrack(event: NativeAudioEventSnapshot, track: AudioTrack | null) {
  if (!track || !event.loadedTrackIdentity) return false;
  const identity = event.loadedTrackIdentity;
  return (
    (identity.lessonId || track.lessonId || track.id) === (track.lessonId || track.id) &&
    (identity.audioFileId || '') === (track.audioFileId || '') &&
    (identity.offlineKey || '') === (track.offlineKey || '') &&
    (identity.sourceUrl === track.audioUrl || identity.resolvedUrl === audioEngine.getCurrentUrl())
  );
}
```

Update every `audioEngine.load()` and `audioEngine.ensurePlaying()` call that loads the current track to pass identity:

```ts
const trackIdentity = {
  lessonId: track.lessonId || track.id,
  audioFileId: track.audioFileId,
  offlineKey: track.offlineKey,
  sourceUrl: track.audioUrl,
};

audioEngine.load(url, { startPosition, trackIdentity });
audioEngine.ensurePlaying(url, { startPosition, trackIdentity });
```

`resumeTrackPlayback()` should accept and forward this identity so offline `blob:` URLs can still be matched to the original lesson/audio file.

Inside the "Sync engine with store state" effect, replace the current `audioEngine.setOnError` block with:

```ts
    audioEngine.setOnError((error) => {
      console.error('Audio error:', error);
      store.addPlaybackDiagnostic({
        at: new Date().toISOString(),
        event: 'howler-error',
        action: 'logged',
        trackId: store.currentTrack?.id,
        audioFileId: store.currentTrack?.audioFileId,
        offlineKey: store.currentTrack?.offlineKey,
        currentTime: audioEngine.getCurrentTime(),
      });
    });

    audioEngine.setOnNativeAudioEvent((event) => {
      const state = useAudioStore.getState();
      const trackKey = getTrackKey(state.currentTrack);
      const recoveryAttempt = state.recoveryAttemptsByTrack[trackKey];
      const now = Date.now();
      state.setNativePlaybackState(mapNativeEventToState(event));
      const lifecycleEvent = event.type as NativeAudioLifecycleEvent;
      const action = getAudioRecoveryAction(lifecycleEvent, {
        intentPlaying: state.isPlaying,
        engineLoaded: audioEngine.isLoaded(),
        enginePlaying: audioEngine.isPlaying(),
        nativePaused: event.paused,
        nativeEnded: event.ended,
        nativeErrored: event.errored,
        documentVisible: document.visibilityState === 'visible',
        online: navigator.onLine,
        currentTime: audioEngine.getCurrentTime(),
        duration: audioEngine.getDuration(),
        userPausedAt: state.isPlaying ? null : Date.now(),
        sameTrack: isNativeEventForCurrentTrack(event, state.currentTrack),
        recoveryAttemptsForTrack: recoveryAttempt?.count ?? 0,
        msSinceLastRecovery: recoveryAttempt ? now - recoveryAttempt.lastAttemptAt : Number.POSITIVE_INFINITY,
        playBlockedByBrowser: recoveryAttempt?.playBlocked ?? false,
      });

      state.addPlaybackDiagnostic({
        at: new Date().toISOString(),
        event: event.type,
        action,
        trackId: state.currentTrack?.id,
        audioFileId: state.currentTrack?.audioFileId,
        offlineKey: state.currentTrack?.offlineKey,
        currentTime: audioEngine.getCurrentTime(),
        result: action === 'wait-for-cooldown'
          ? 'cooldown'
          : action === 'needs-user-gesture'
            ? 'blocked'
            : action === 'none'
              ? 'ignored'
              : 'attempted',
      });

      if (action === 'wait-for-cooldown') return;
      if (action === 'needs-user-gesture') {
        state.markPlaybackNeedsUserGesture(trackKey);
        return;
      }

      if (action === 'resume-current-track' || action === 'reload-current-track') {
        if (state.currentTrack) {
          state.markPlaybackRecoveryAttempt(trackKey);
          void resumeCurrentTrackPlayback(state.currentTrack, state.currentTime);
        }
      }

      if (action === 'mark-ended') {
        state.pause();
        state.nextTrack();
      }
    });
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npx vitest run src/lib/audio-lifecycle.test.ts src/lib/audio-engine.test.ts src/lib/audio-resume.test.ts
```

Expected: all targeted tests pass.

- [ ] **Step 4: Run TypeScript**

Run:

```bash
npm run type-check
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/stores/audio-store.ts src/hooks/use-audio-player.ts
git commit -m "feat: reconcile native audio lifecycle state"
```

---

### Task 4: Tighten Media Session and Driving Mode

**Files:**
- Modify: `src/hooks/use-media-session.ts`
- Modify: `src/app/[locale]/driving/page.tsx`
- Modify: `messages/he.json`
- Modify: `messages/en.json`

- [ ] **Step 1: Update Media Session playback state from native state**

In `src/hooks/use-media-session.ts`, read `lastNativePlaybackState`:

```ts
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    lastNativePlaybackState,
  } = useAudioStore();
```

Update playback state:

```ts
    const actuallyPlaying = isPlaying && lastNativePlaybackState === 'playing';
    navigator.mediaSession.playbackState = actuallyPlaying ? 'playing' : 'paused';
```

`waiting`, `stalled`, `unknown`, and `errored` should all map to Media Session `paused` while the app records diagnostics and shows the right recovery state. This avoids lock-screen controls claiming active playback when the native element is stuck.

- [ ] **Step 2: Add driving-mode offline guidance**

In `src/app/[locale]/driving/page.tsx`, read current track:

```ts
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const lastNativePlaybackState = useAudioStore((s) => s.lastNativePlaybackState);
```

Add compact notices near the top of the driving layout. The text below is semantic copy; implement it through `messages/he.json` and `messages/en.json`, not hardcoded strings.

```tsx
      {currentTrack && !currentTrack.offlineKey && (
        <div role="status" aria-live="polite" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {isRTL
            ? 'להאזנה יציבה בנהיגה או באזורים בלי קליטה, שמור את השיעור לאופליין לפני הנסיעה.'
            : 'For stable driving playback or low-signal areas, save this lesson offline before the drive.'}
        </div>
      )}
      {lastNativePlaybackState === 'stalled' && (
        <div role="status" aria-live="polite" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {isRTL
            ? 'הנגן זיהה עצירה זמנית ומנסה להמשיך את ההשמעה.'
            : 'Playback stalled and Tora Player is trying to resume.'}
        </div>
      )}
      {playbackRecoveryState === 'needs-user-gesture' && (
        <button
          type="button"
          className="min-h-11 rounded-lg border border-primary/40 bg-primary/20 px-4 py-3 text-sm text-primary-foreground"
          onClick={() => currentTrack && playTrack(currentTrack)}
        >
          {isRTL ? 'הקש כדי להמשיך להשמיע' : 'Tap to resume playback'}
        </button>
      )}
```

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npm run type-check
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-media-session.ts src/app/[locale]/driving/page.tsx messages/he.json messages/en.json
git commit -m "feat: improve driving playback resilience cues"
```

---

### Task 5: Browser E2E for Synthetic Background Events

**Files:**
- Create: `tests/e2e/background-playback.spec.ts`

- [ ] **Step 1: Create browser test**

Create `tests/e2e/background-playback.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

declare global {
  interface Window {
    __toraAudioDiagnostics?: {
      nativeState: string;
      recoveryState: string;
      lastAction?: string;
      currentTrackKey?: string;
      activeSoundCount?: number;
    };
  }
}

test.describe('background playback lifecycle', () => {
  test('synthetic native pause records diagnostics and does not duplicate streams', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    const lessonHref = await page.locator('a[href*="/lessons/"]').first().getAttribute('href');
    expect(lessonHref).toBeTruthy();
    await page.goto(`${BASE_URL}${lessonHref}`);

    await page.getByRole('button', { name: /נגן|Play/ }).first().click();

    const before = await page.evaluate(() => window.__toraAudioDiagnostics?.activeSoundCount ?? 0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tora:test-native-audio-event', {
      detail: { type: 'pause', paused: true, ended: false, errored: false },
    })));

    await expect
      .poll(() =>
        page.evaluate(() => window.__toraAudioDiagnostics?.lastAction),
      )
      .toMatch(/resume-current-track|wait-for-cooldown|needs-user-gesture/);

    await expect
      .poll(() => page.evaluate(() => window.__toraAudioDiagnostics?.activeSoundCount ?? 0))
      .toBeLessThanOrEqual(Math.max(1, before + 1));
  });

  test('synthetic stall moves UI into recovery or tap-to-resume state', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    const lessonHref = await page.locator('a[href*="/lessons/"]').first().getAttribute('href');
    await page.goto(`${BASE_URL}${lessonHref}`);
    await page.getByRole('button', { name: /נגן|Play/ }).first().click();

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tora:test-native-audio-event', {
      detail: { type: 'stalled', paused: true, ended: false, errored: false },
    })));

    await expect
      .poll(() => page.evaluate(() => window.__toraAudioDiagnostics?.recoveryState))
      .toMatch(/recovering|stalled|needs-user-gesture/);
  });
});
```

This test relies on a test-only diagnostics bridge, not `document.querySelector('audio')`, because Howler's HTML5 node may not be mounted in the DOM. Add the bridge only when `process.env.NODE_ENV !== 'production'` or when a Playwright flag is present.

Expand `tests/e2e/offline-download.spec.ts` in the same PR:

- Route `/api/audio/stream/**` with deterministic audio bytes.
- Click the real `שמור להאזנה לא מקוונת` control.
- Wait for saved state or `100%`.
- Inspect IndexedDB `audio-cache` and `lesson-meta`.
- Set `context.setOffline(true)` and abort any network stream request.
- Start playback from `/he/offline`.
- Assert the resolved playback URL starts with `blob:`.
- Repeat for a multi-file lesson or seed a fixture with at least two `audioFiles`.

- [ ] **Step 2: Run browser tests locally**

Run a production server first:

```bash
npm run build
PORT=3001 npm run start
```

In another shell:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/background-playback.spec.ts --project=chromium --reporter=list
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/offline-download.spec.ts --project=chromium --reporter=list
```

Expected: synthetic lifecycle tests assert diagnostics and duplicate-stream safety. Offline tests prove the real save-offline flow and `blob:` playback while network streams are unavailable.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/background-playback.spec.ts tests/e2e/offline-download.spec.ts
git commit -m "test: cover synthetic background playback lifecycle"
```

---

### Task 6: Real Device QA Checklist

**Files:**
- Create: `docs/qa/mobile-background-playback-checklist.md`

- [ ] **Step 1: Create checklist**

Create `docs/qa/mobile-background-playback-checklist.md`:

```md
# Mobile Background Playback QA Checklist

Release candidate URL:

Build commit:

## Release Gate

Do not merge or release until every required row below has:

- Device model
- OS version
- Browser or PWA install mode
- Network type
- Pass/fail result
- Notes
- Evidence such as screenshot, screen recording, or tester initials/time

Testing with a car head unit must happen while parked or in a simulator. Do not test while actively driving.

## Required Devices

- iPhone Safari
- iPhone installed Home Screen PWA
- Android Chrome
- Android installed PWA
- Bluetooth headphones or car media controls
- Parked-car head unit or safe simulator

## Test Lessons

- One long network-streamed lesson
- One saved offline lesson
- One multi-file lesson with at least two parts

## Scenarios

| Scenario | iPhone Safari | iPhone PWA | Android Chrome | Android PWA | Notes |
| --- | --- | --- | --- | --- | --- |
| Start network lesson, switch app for 2 minutes, return |  |  |  |  |  |
| Start network lesson, switch app for 10 minutes, return |  |  |  |  |  |
| Start offline lesson, switch app for 2 minutes, return |  |  |  |  |  |
| Start offline lesson, switch app for 10 minutes, return |  |  |  |  |  |
| Lock screen for 2 minutes while playing |  |  |  |  |  |
| Lock screen for 10 minutes while playing |  |  |  |  |  |
| Lock screen for 30 minutes while playing |  |  |  |  |  |
| Screen off with saved offline lesson |  |  |  |  |  |
| Screen off with network-streamed lesson |  |  |  |  |  |
| Unlock after OS-suspended playback |  |  |  |  |  |
| Unlock after lock-screen playback |  |  |  |  |  |
| Pause from lock screen, resume from lock screen |  |  |  |  |  |
| Incoming call or audio interruption, then resume |  |  |  |  |  |
| Bluetooth pause/play |  |  |  |  |  |
| Bluetooth seek/next/previous after phone locked |  |  |  |  |  |
| Car controls pause/play/next/previous |  |  |  |  |  |
| Parked-car head unit controls while phone locked |  |  |  |  |  |
| Maps/Waze foreground while Tora plays |  |  |  |  |  |
| Cellular to airplane mode with offline lesson |  |  |  |  |  |
| Low-signal simulation with offline lesson |  |  |  |  |  |
| Low-signal simulation with network lesson |  |  |  |  |  |
| Switch between two files in same lesson while playing |  |  |  |  |  |

## Pass Criteria

- User-initiated pause stays paused.
- User-initiated play resumes the same track and approximate position.
- Unexpected pause/stall is either recovered or surfaced in the UI.
- If browser policy blocks recovery, a tap-to-resume action is visible and works.
- Offline lessons play without network.
- Lock-screen metadata shows title, artist, and artwork.
- Bluetooth/car controls do not create duplicate streams.
- iPhone Safari, iPhone PWA, Android Chrome, and Android PWA each have an explicit pass/fail verdict. A platform-specific failure can be accepted only if the UI makes the limitation clear and the release notes call it out.
```

- [ ] **Step 2: Commit**

```bash
git add docs/qa/mobile-background-playback-checklist.md
git commit -m "docs: add mobile background playback QA checklist"
```

---

### Task 7: Final Verification and PR

**Files:**
- No new source files.

- [ ] **Step 1: Run full checks**

```bash
npm run type-check
npm run test
npm run lint
npm run build
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts tests/e2e/background-playback.spec.ts --project=chromium --reporter=list
```

Expected:
- TypeScript exits `0`.
- Vitest exits `0`.
- ESLint exits `0`, warnings acceptable only if pre-existing.
- Next build exits `0`.
- Playwright exits `0`.
- `public/sw.js` `CACHE_VERSION` is bumped if app-shell/offline assets changed, and an old-service-worker upgrade path is manually checked.
- `docs/qa/mobile-background-playback-checklist.md` is fully completed before merge/release. This is a hard gate.

- [ ] **Step 2: Open PR**

```bash
git push origin codex/mobile-background-playback-hardening
gh pr create \
  --base dev \
  --head codex/mobile-background-playback-hardening \
  --title "Harden mobile background playback" \
  --body "## Summary
- Adds native audio lifecycle reconciliation for pause/stall/error recovery
- Aligns Media Session state with actual native audio state
- Adds driving-mode resilience cues and mobile QA checklist

## Test Plan
- npm run type-check
- npm run test
- npm run lint
- npm run build
- PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts tests/e2e/background-playback.spec.ts --project=chromium --reporter=list
- Manual device QA checklist completed in docs/qa/mobile-background-playback-checklist.md"
```

---

## Self-Review

- Spec coverage: Covers unexpected native pauses/stalls/errors, Media Session controls, driving mode, offline-first reliability, browser tests, and real-device QA.
- Placeholder scan: No implementation steps rely on undefined function names; commands use concrete file paths and branch names.
- Type consistency: `NativeAudioLifecycleEvent`, `AudioRecoveryAction`, `NativeAudioEventSnapshot`, `PlaybackDiagnostic`, and store fields are defined before use.
- Known residual risk: iOS/Android background behavior cannot be fully proven in Playwright. The manual QA checklist is a release gate, not optional paperwork. If a platform still fails after this pass, the app must say so honestly and the next product decision is native shell / React Native / Capacitor.
