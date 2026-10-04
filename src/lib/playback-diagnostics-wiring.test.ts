import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeAudioElement {
  paused = true;
  ended = false;
  seeking = false;
  error: { code: number } | null = null;
  readyState = 4;
  networkState = 1;
  currentTime = 12.34;
  duration = 3712.2;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  volume = 1;
  preload = '';
  src = '';
  private listeners = new Map<string, Set<() => void>>();
  play = vi.fn(() => {
    this.paused = false;
    return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn();
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener));
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

async function freshEngine(storage: ReturnType<typeof memoryStorage>) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage);
  const diagnostics = await import('./playback-diagnostics');
  const { AudioEngine } = await import('./audio-engine');
  const element = new FakeAudioElement();
  const engine = new AudioEngine(() => element as unknown as HTMLAudioElement);
  return { element, engine, log: diagnostics.diagnostics() };
}

afterEach(() => vi.unstubAllGlobals());

describe('audio engine feeds the playback log', () => {
  it('records play calls, rejected plays and element events with a snapshot, but no URL', async () => {
    const { element, engine, log } = await freshEngine(memoryStorage({ 'tora-diag': '1' }));
    engine.load('/api/audio/stream/secret-key.opus', { trackKey: 'lesson|part' });
    engine.play();
    await Promise.resolve();
    element.paused = true; // what the browser does before it fires "pause"
    element.emit('pause');

    const entries = log.entries();
    expect(entries.map((entry) => entry.type)).toEqual(['audio:play()', 'audio:play-rejected', 'audio:pause']);
    expect(entries[2].data).toMatchObject({ paused: true, ready: 4, time: 12.3, dur: 3712.2, err: null });
    expect(JSON.stringify(entries)).not.toContain('secret-key');
  });

  it('records nothing while the log is off', async () => {
    const storage = memoryStorage();
    const { element, engine, log } = await freshEngine(storage);
    engine.load('/api/audio/stream/a.opus', { trackKey: 'k' });
    engine.play();
    await Promise.resolve();
    element.emit('pause');

    expect(log.entries()).toEqual([]);
    expect(storage.getItem('tora-diag-log')).toBeNull();
  });
});
