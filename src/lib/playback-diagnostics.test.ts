import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTICS_ENABLED_KEY,
  DIAGNOSTICS_LOG_KEY,
  MAX_DIAGNOSTIC_ENTRIES,
  createDiagnosticsLog,
} from './playback-diagnostics';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function makeLog(storage = memoryStorage(), bootId = 'b1') {
  let clock = 1_700_000_000_000;
  const scheduled: Array<() => void> = [];
  const log = createDiagnosticsLog(storage, {
    now: () => (clock += 250),
    bootId,
    schedule: (flush) => void scheduled.push(flush),
  });
  return { log, storage, scheduled };
}

describe('playback diagnostics log', () => {
  it('records nothing and writes nothing while it is off', () => {
    const { log, storage, scheduled } = makeLog();
    log.record('audio:pause', { paused: true });

    expect(log.entries()).toEqual([]);
    expect(scheduled).toHaveLength(0);
    expect(storage.map.has(DIAGNOSTICS_LOG_KEY)).toBe(false);
  });

  it('records entries once enabled and keeps them across a page reload', () => {
    const first = makeLog();
    first.log.setEnabled(true);
    first.log.record('audio:play', { paused: false });
    first.log.record('ms:action', { action: 'pause' });
    first.log.flush(); // page hidden

    const reloaded = makeLog(first.storage, 'b2');
    reloaded.log.record('boot');

    expect(reloaded.log.entries().map((entry) => [entry.boot, entry.type])).toEqual([
      ['b1', 'audio:play'],
      ['b1', 'ms:action'],
      ['b2', 'boot'],
    ]);
  });

  it('batches writes: many events schedule one persist', () => {
    const { log, scheduled } = makeLog();
    log.setEnabled(true);
    for (let i = 0; i < 20; i++) log.record('audio:waiting');

    expect(scheduled).toHaveLength(1);
  });

  it('keeps only the newest entries', () => {
    const { log } = makeLog();
    log.setEnabled(true);
    for (let i = 0; i < MAX_DIAGNOSTIC_ENTRIES + 25; i++) log.record('e', { i });

    const entries = log.entries();
    expect(entries).toHaveLength(MAX_DIAGNOSTIC_ENTRIES);
    expect(entries[0].data?.i).toBe(25);
  });

  it('turning it off stops recording but keeps what was captured until cleared', () => {
    const { log, storage } = makeLog();
    log.setEnabled(true);
    log.record('a');
    log.flush();
    log.setEnabled(false);
    log.record('b');

    expect(storage.map.has(DIAGNOSTICS_ENABLED_KEY)).toBe(false);
    expect(log.entries().map((entry) => entry.type)).toEqual(['a']);
    log.clear();
    expect(log.entries()).toEqual([]);
  });

  it('formats a readable log with gaps and survives corrupt or unavailable storage', () => {
    const { log } = makeLog();
    log.setEnabled(true);
    log.record('audio:pause', { paused: true });
    log.record('page:visibility', { state: 'hidden' });

    const text = log.format({ standalone: true });
    expect(text).toContain('# {"standalone":true}');
    expect(text).toMatch(/start \[b1\] audio:pause \{"paused":true\}/);
    expect(text).toMatch(/\+0\.3s \[b1\] page:visibility \{"state":"hidden"\}/);

    const corrupt = memoryStorage();
    corrupt.map.set(DIAGNOSTICS_LOG_KEY, '{not json');
    expect(makeLog(corrupt).log.entries()).toEqual([]);

    const noStorage = createDiagnosticsLog(null);
    noStorage.record('x');
    expect(noStorage.isEnabled()).toBe(false);
    expect(noStorage.entries()).toEqual([]);
  });
});
