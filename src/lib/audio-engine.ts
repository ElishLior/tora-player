"use client";

import { normalizeAudioUrl } from "@/lib/audio-url";

/**
 * What the audio element is doing, read from its live state:
 * - idle: no source
 * - paused / ended / error: not producing sound
 * - buffering: asked to play, waiting for data
 * - playing: producing sound
 */
export type AudioEngineStatus =
  | "idle"
  | "paused"
  | "buffering"
  | "playing"
  | "ended"
  | "error";

export interface AudioEngineHandlers {
  onStatusChange?: (status: AudioEngineStatus) => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  /** play() was rejected until the user taps again (iOS/Chrome autoplay policy). */
  onPlayBlocked?: () => void;
}

interface LoadOptions {
  trackKey: string;
  /** Position to start from once the new source has metadata. */
  startPosition?: number;
}

const HAVE_METADATA = 1;
const HAVE_FUTURE_DATA = 3;

// Every event after which the element's play state may have changed. The
// status is always re-read from the element, so events that were queued for a
// previous source (or by our own seeks) cannot put the player in a wrong state.
const STATUS_EVENTS = [
  "loadstart",
  "emptied",
  "play",
  "playing",
  "pause",
  "waiting",
  "canplay",
  "seeked",
  "ended",
  "error",
] as const;

/**
 * Owns the one HTMLAudioElement used for all playback. Reusing a single
 * element keeps the iOS "user activated" state across tracks, so lock-screen
 * resume and auto-advance keep working after the first tap.
 */
export class AudioEngine {
  private element: HTMLAudioElement | null = null;
  private source: string | null = null;
  private trackKey: string | null = null;
  private pendingPosition: number | null = null;
  private status: AudioEngineStatus = "idle";
  private rate = 1;
  private volume = 1;
  private handlers: AudioEngineHandlers = {};

  constructor(
    private readonly createElement: () => HTMLAudioElement = () => new Audio(),
  ) {}

  setHandlers(handlers: AudioEngineHandlers) {
    this.handlers = handlers;
  }

  /** Loading the track that is already loaded is a no-op: it never seeks. */
  load(url: string, { trackKey, startPosition }: LoadOptions) {
    const source = normalizeAudioUrl(url) || url;
    if (this.trackKey === trackKey && this.source === source) return;

    const element = this.getOrCreateElement();
    this.trackKey = trackKey;
    this.source = source;
    this.pendingPosition =
      startPosition && startPosition > 0 ? startPosition : null;
    element.src = source;
    element.defaultPlaybackRate = this.rate;
    element.playbackRate = this.rate;
  }

  play() {
    const element = this.element;
    if (!element || !this.source) return;
    if (element.error) this.reload();

    const trackKey = this.trackKey;
    element.play()?.catch((error: unknown) => {
      // AbortError means a newer load/pause superseded this call.
      if (
        trackKey === this.trackKey &&
        (error as { name?: string } | null)?.name === "NotAllowedError"
      ) {
        this.handlers.onPlayBlocked?.();
      }
    });
  }

  pause() {
    this.element?.pause();
  }

  seek(time: number) {
    const element = this.element;
    if (!element || !this.source) return;
    const target = Math.max(0, Number.isFinite(time) ? time : 0);

    if (this.pendingPosition !== null || element.readyState < HAVE_METADATA) {
      this.pendingPosition = target;
      return;
    }
    const duration = this.getDuration();
    element.currentTime = duration > 0 ? Math.min(target, duration) : target;
  }

  /** Re-fetches the current source and continues from the same position. */
  reload() {
    const element = this.element;
    if (!element || !this.source) return;
    const position = this.getCurrentTime();
    this.pendingPosition = position > 0 ? position : null;
    element.load();
  }

  unload() {
    const element = this.element;
    this.source = null;
    this.trackKey = null;
    this.pendingPosition = null;
    if (!element) return;
    element.removeAttribute("src");
    element.load();
  }

  setRate(rate: number) {
    this.rate = rate;
    if (!this.element) return;
    this.element.defaultPlaybackRate = rate;
    this.element.playbackRate = rate;
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.element) this.element.volume = volume;
  }

  /** Re-reads the element (e.g. after the page was frozen in the background). */
  refresh() {
    this.updateStatus();
    if (this.element && this.pendingPosition === null && this.source) {
      this.handlers.onTimeUpdate?.(this.element.currentTime);
    }
  }

  getCurrentTime(): number {
    return this.pendingPosition ?? this.element?.currentTime ?? 0;
  }

  getDuration(): number {
    const duration = this.element?.duration;
    return duration !== undefined && Number.isFinite(duration) ? duration : 0;
  }

  getStatus(): AudioEngineStatus {
    return this.status;
  }

  getTrackKey(): string | null {
    return this.trackKey;
  }

  getCurrentUrl(): string | null {
    return this.source;
  }

  /** The element that plays audio (used for AirPlay / Remote Playback). */
  getAudioElement(): HTMLAudioElement | null {
    return this.element;
  }

  private getOrCreateElement(): HTMLAudioElement {
    if (this.element) return this.element;
    const element = this.createElement();
    // Metadata only until play(): opening the app must not download a lesson.
    element.preload = "metadata";
    element.volume = this.volume;
    for (const type of STATUS_EVENTS) {
      element.addEventListener(type, this.updateStatus);
    }
    element.addEventListener("loadedmetadata", this.handleMetadata);
    element.addEventListener("durationchange", this.handleDurationChange);
    element.addEventListener("canplay", this.applyPendingPosition);
    element.addEventListener("playing", this.applyPendingPosition);
    element.addEventListener("timeupdate", this.handleTimeUpdate);
    this.element = element;
    return element;
  }

  private readStatus(): AudioEngineStatus {
    const element = this.element;
    if (!element || !this.source) return "idle";
    if (element.error) return "error";
    if (element.ended) return "ended";
    if (element.paused) return "paused";
    if (element.readyState >= HAVE_FUTURE_DATA) return "playing";
    // A skip briefly drops readyState even inside the buffer; only a real
    // wait for data (after the seek completes) counts as buffering.
    return element.seeking && this.status === "playing" ? "playing" : "buffering";
  }

  private updateStatus = () => {
    const status = this.readStatus();
    if (status === this.status) return;
    this.status = status;
    this.handlers.onStatusChange?.(status);
  };

  private handleMetadata = () => {
    this.applyPendingPosition();
    this.handleDurationChange();
  };

  private handleDurationChange = () => {
    const duration = this.getDuration();
    if (duration > 0) this.handlers.onDurationChange?.(duration);
  };

  // iOS may ignore a seek issued at loadedmetadata for streamed audio, so the
  // start position is re-checked until data at that position is available.
  private applyPendingPosition = () => {
    const element = this.element;
    const target = this.pendingPosition;
    if (!element || target === null || element.readyState < HAVE_METADATA) {
      return;
    }
    const duration = this.getDuration();
    const position = duration > 0 ? Math.min(target, duration) : target;
    if (Math.abs(element.currentTime - position) > 0.5) {
      element.currentTime = position;
    }
    if (element.readyState >= HAVE_FUTURE_DATA) {
      this.pendingPosition = null;
      this.handlers.onTimeUpdate?.(element.currentTime);
    }
  };

  private handleTimeUpdate = () => {
    if (!this.element || this.pendingPosition !== null) return;
    this.handlers.onTimeUpdate?.(this.element.currentTime);
  };
}

export const audioEngine = new AudioEngine();
