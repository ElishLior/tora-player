import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_KEY, claimChunkReload, isChunkLoadError } from './chunk-error';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('isChunkLoadError', () => {
  it('recognizes webpack and browser dynamic-import failures after a deploy', () => {
    const chunkLoad = Object.assign(new Error('Loading chunk 8412 failed.\n(error: https://x/_next/static/chunks/8412-ab.js)'), {
      name: 'ChunkLoadError',
    });
    expect(isChunkLoadError(chunkLoad)).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk 311 failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true);
  });

  it('leaves ordinary errors to the normal error screen', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(new Error('Loading lessons failed'))).toBe(false);
    expect(isChunkLoadError(new Error('An error occurred in the Server Components render.'))).toBe(false);
  });
});

describe('claimChunkReload', () => {
  it('allows one automatic reload and refuses a second one right after it (reload loop)', () => {
    const storage = memoryStorage();
    expect(claimChunkReload(storage, 1_000_000)).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1000000');
    expect(claimChunkReload(storage, 1_030_000)).toBe(false);
  });

  it('allows a reload again for a later deploy in the same tab', () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1000000' });
    expect(claimChunkReload(storage, 1_000_000 + 60_000)).toBe(true);
  });

  it('treats an unreadable stored value as no previous reload', () => {
    expect(claimChunkReload(memoryStorage({ [CHUNK_RELOAD_KEY]: 'garbage' }), 5)).toBe(true);
  });
});
