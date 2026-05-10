import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockHowlOptions {
  src: string[];
  onplayerror?: (id: number, error: unknown) => void;
}

const howlInstances: MockHowl[] = [];

class MockHowl {
  options: MockHowlOptions;
  playCalls: Array<number | undefined> = [];
  seekCalls: number[] = [];
  playingById = new Map<number, boolean>();
  onceHandlers = new Map<string, () => void>();
  nextId = 1;
  seekValue = 0;
  unloaded = false;
  _sounds = [{ _node: { paused: true, ended: false, error: null, readyState: 4 } }];

  constructor(options: MockHowlOptions) {
    this.options = options;
    howlInstances.push(this);
  }

  play(id?: number) {
    this.playCalls.push(id);
    const soundId = id ?? this.nextId++;
    this.playingById.set(soundId, true);
    this._sounds[0]._node.paused = false;
    return soundId;
  }

  pause(id?: number) {
    if (id !== undefined) {
      this.playingById.set(id, false);
    } else {
      for (const soundId of this.playingById.keys()) {
        this.playingById.set(soundId, false);
      }
    }
    this._sounds[0]._node.paused = true;
  }

  playing(id?: number) {
    if (id !== undefined) return Boolean(this.playingById.get(id));
    return [...this.playingById.values()].some(Boolean);
  }

  seek(time?: number) {
    if (typeof time === 'number') {
      this.seekValue = time;
      this.seekCalls.push(time);
    }
    return this.seekValue;
  }

  duration() {
    return 3600;
  }

  once(event: string, handler: () => void) {
    this.onceHandlers.set(event, handler);
  }

  trigger(event: string) {
    this.onceHandlers.get(event)?.();
  }

  unload() {
    this.unloaded = true;
  }

  stop() {
    this.pause();
  }

  volume() {}
  rate() {}
}

vi.mock('howler', () => ({
  Howler: { html5PoolSize: 0 },
  Howl: MockHowl,
}));

describe('audioEngine', () => {
  beforeEach(async () => {
    const { audioEngine } = await import('./audio-engine');
    audioEngine.unload();
    howlInstances.length = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('reports playback state for the active sound id only', async () => {
    const { audioEngine } = await import('./audio-engine');

    audioEngine.load('/api/audio/stream/lesson.mp3');
    audioEngine.play();
    audioEngine.pause();

    const howl = howlInstances[0];
    howl.playingById.set(999, true);

    expect(audioEngine.isPlaying()).toBe(false);
  });

  it('reuses the active sound id during unlock recovery', async () => {
    const { audioEngine } = await import('./audio-engine');

    audioEngine.load('/api/audio/stream/lesson.mp3');
    audioEngine.play();

    const howl = howlInstances[0];
    howl.playingById.set(1, false);
    howl.options.onplayerror?.(1, 'locked');
    howl.trigger('unlock');

    expect(howl.playCalls).toEqual([undefined, 1]);
  });

  it('ensures a loaded paused track resumes without creating a second Howl', async () => {
    const { audioEngine } = await import('./audio-engine');

    audioEngine.load('/api/audio/stream/lesson.mp3');
    audioEngine.play();
    audioEngine.pause();

    audioEngine.ensurePlaying('/api/audio/stream/lesson.mp3', { startPosition: 120 });

    expect(howlInstances).toHaveLength(1);
    expect(howlInstances[0].seekCalls).toContain(120);
    expect(howlInstances[0].playCalls).toEqual([undefined, 1]);
    expect(audioEngine.isPlaying()).toBe(true);
  });
});
