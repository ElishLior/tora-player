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
  private soundId: number | null = null; // Track Howler sound ID to prevent duplicate streams
  private onTimeUpdate: ((time: number) => void) | null = null;
  private onEnd: (() => void) | null = null;
  private onLoad: ((duration: number) => void) | null = null;
  private onError: ((error: string) => void) | null = null;
  private animationFrameId: number | null = null;
  private _userPaused = false; // Track if user explicitly paused to prevent auto-resume

  /**
   * Detect audio format from URL for Howler.js format hint.
   * Helps the browser choose the correct decoder.
   */
  private detectFormat(url: string): string[] {
    // Try to get extension from the encoded file key in the URL
    const decoded = decodeURIComponent(url);
    const ext = decoded.split('.').pop()?.split('?')[0]?.toLowerCase();
    switch (ext) {
      case 'mp3':                return ['mp3'];
      case 'm4a': case 'aac':   return ['m4a'];
      case 'mp4':                return ['mp4'];
      case 'ogg': case 'opus':  return ['ogg'];
      case 'wav':                return ['wav'];
      case 'flac':               return ['flac'];
      case 'webm':               return ['webm'];
      default:                   return ['mp3', 'm4a', 'ogg', 'wav', 'webm'];
    }
  }

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
      format: this.detectFormat(normalizedUrl),
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
        // Try to recover — but only if user hasn't explicitly paused
        // and the same Howl instance is still active (not stale)
        if (this.howl) {
          const howlAtError = this.howl;
          const urlAtError = this.currentUrl;
          this.howl.once('unlock', () => {
            // Guard: don't auto-resume if user explicitly paused,
            // or if the Howl/URL has changed since the error (stale unlock)
            if (this.howl === howlAtError && this.currentUrl === urlAtError && !this._userPaused) {
              this.howl.play();
            }
          });
        }
      },
    });
  }

  play() {
    if (!this.howl) return;
    // If already playing, don't create a duplicate stream
    if (this.howl.playing(this.soundId ?? undefined)) return;
    // Reuse existing sound ID to resume instead of creating a new stream
    if (this.soundId !== null) {
      this.howl.play(this.soundId);
    } else {
      this.soundId = this.howl.play();
    }
    // Only clear _userPaused AFTER we actually start playing,
    // not at the top — prevents race where a pending play() clears a recent pause()
    this._userPaused = false;
    this.startTimeTracking();
  }

  pause() {
    if (!this.howl) return;
    this._userPaused = true;
    // Pause the specific sound ID to avoid orphan streams
    if (this.soundId !== null) {
      this.howl.pause(this.soundId);
    }
    // Safety net: also pause without soundId to ensure ALL sounds on this Howl stop
    this.howl.pause();
    this.stopTimeTracking();
  }

  seek(time: number) {
    if (!this.howl) return;
    if (this.soundId !== null) {
      this.howl.seek(time, this.soundId);
    } else {
      this.howl.seek(time);
    }
  }

  setVolume(volume: number) {
    if (!this.howl) return;
    this.howl.volume(volume);
  }

  setRate(rate: number) {
    if (!this.howl) return;
    if (this.soundId !== null) {
      this.howl.rate(rate, this.soundId);
    } else {
      this.howl.rate(rate);
    }
  }

  getCurrentTime(): number {
    if (!this.howl) return 0;
    const seek = this.soundId !== null ? this.howl.seek(this.soundId) : this.howl.seek();
    return typeof seek === 'number' ? seek : 0;
  }

  getDuration(): number {
    if (!this.howl) return 0;
    return this.howl.duration() || 0;
  }

  isPlaying(): boolean {
    return this.howl?.playing() || false;
  }

  /** Check if the audio engine has a loaded Howl instance */
  isLoaded(): boolean {
    return this.howl !== null;
  }

  /** Get the current audio URL being played */
  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  /**
   * Get the underlying HTML audio element (for Remote Playback / AirPlay).
   * Howler.js stores it internally when html5 mode is used.
   */
  getAudioElement(): HTMLAudioElement | null {
    if (!this.howl) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sounds = (this.howl as any)._sounds;
    if (sounds && sounds.length > 0 && sounds[0]._node) {
      return sounds[0]._node as HTMLAudioElement;
    }
    return null;
  }

  /** Stop all sounds on the current Howl instance without unloading */
  stopAll() {
    if (!this.howl) return;
    this._userPaused = true;
    this.howl.stop();
    this.stopTimeTracking();
  }

  unload() {
    this.stopTimeTracking();
    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }
    this.currentUrl = null;
    this.soundId = null;
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
