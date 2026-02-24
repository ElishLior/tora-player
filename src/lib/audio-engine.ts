'use client';

import { Howl } from 'howler';
import { normalizeAudioUrl } from '@/lib/audio-url';

/**
 * Singleton audio engine wrapping Howler.js.
 * Manages a single audio instance and provides control methods.
 */
class AudioEngine {
  private howl: Howl | null = null;
  private currentUrl: string | null = null;
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onLoad: ((duration: number) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private animationFrameId: number | null = null;

  load(url: string, options?: { startPosition?: number }) {
    // Normalize the URL to use stream proxy instead of direct R2
    const normalizedUrl = normalizeAudioUrl(url) || url;

    // Don't reload same track
    if (this.currentUrl === normalizedUrl && this.howl) {
      if (options?.startPosition) {
        this.howl.seek(options.startPosition);
      }
      return;
    }

    // Cleanup previous
    this.unload();
    this.currentUrl = normalizedUrl;

    this.howl = new Howl({
      src: [normalizedUrl],
      html5: true, // Required for streaming long audio files
      preload: true,
      onload: () => {
        const duration = this.howl?.duration() || 0;
        this.onLoad?.(duration);
        if (options?.startPosition && options.startPosition > 0) {
          this.howl?.seek(options.startPosition);
        }
      },
      onend: () => {
        this.stopTimeTracking();
        this.onEnd?.();
      },
      onloaderror: (_id: number, error: unknown) => {
        this.onError?.(`Failed to load audio: ${error}`);
      },
      onplayerror: (_id: number, error: unknown) => {
        this.onError?.(`Playback error: ${error}`);
        // Try to recover
        if (this.howl) {
          this.howl.once('unlock', () => {
            this.howl?.play();
          });
        }
      },
    });
  }

  play() {
    if (!this.howl) return;
    this.howl.play();
    this.startTimeTracking();
  }

  pause() {
    if (!this.howl) return;
    this.howl.pause();
    this.stopTimeTracking();
  }

  seek(time: number) {
    if (!this.howl) return;
    this.howl.seek(time);
  }

  setVolume(volume: number) {
    if (!this.howl) return;
    this.howl.volume(volume);
  }

  setRate(rate: number) {
    if (!this.howl) return;
    this.howl.rate(rate);
  }

  getCurrentTime(): number {
    if (!this.howl) return 0;
    const seek = this.howl.seek();
    return typeof seek === 'number' ? seek : 0;
  }

  getDuration(): number {
    if (!this.howl) return 0;
    return this.howl.duration() || 0;
  }

  isPlaying(): boolean {
    return this.howl?.playing() || false;
  }

  unload() {
    this.stopTimeTracking();
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
    this.currentUrl = null;
  }

  // Event listeners
  setOnTimeUpdate(cb: (time: number) => void) {
    this.onTimeUpdate = cb;
  }

  setOnEnd(cb: () => void) {
    this.onEnd = cb;
  }

  setOnLoad(cb: (duration: number) => void) {
    this.onLoad = cb;
  }

  setOnError(cb: (error: string) => void) {
    this.onError = cb;
  }

  private startTimeTracking() {
    this.stopTimeTracking();
    const track = () => {
      if (this.howl && this.howl.playing()) {
        const time = this.getCurrentTime();
        this.onTimeUpdate?.(time);
      }
      this.animationFrameId = requestAnimationFrame(track);
    };
    this.animationFrameId = requestAnimationFrame(track);
  }

  private stopTimeTracking() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();
