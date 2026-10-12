import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  fetchLiveVersion,
  previewRelease,
  sendRelease,
  type ReleaseDeps,
  type ReleasePush,
  type ReleaseStore,
} from './release-announcement';
import type { ReleaseAnnouncementRow, ReleaseText } from '@/lib/release-announcement';

const TEXT: ReleaseText = {
  version: '1.2.0',
  titleHe: 'נגן תורה 1.2 זמין',
  bodyHe: 'עדכון חדש מוכן.',
  titleEn: 'Torah Player 1.2 is available',
  bodyEn: 'A new update is ready.',
};

function row(overrides: Partial<ReleaseAnnouncementRow> = {}): ReleaseAnnouncementRow {
  return {
    id: 'r1',
    status: 'draft',
    createdAt: '2026-10-13T00:00:00Z',
    sentAt: null,
    sentCount: 0,
    failedCount: 0,
    ...TEXT,
    ...overrides,
  };
}

/** In-memory store with the same claim semantics as the SQL (UPDATE ... WHERE status = 'draft', one live row per version). */
function fakeStore(rows: ReleaseAnnouncementRow[]) {
  const data = new Map(rows.map((item) => [item.id, { ...item }]));
  const finishCalls: Array<{ id: string; status: string; sentCount: number; failedCount: number }> = [];
  const store: ReleaseStore = {
    async list() {
      return [...data.values()];
    },
    async find(id) {
      const found = data.get(id);
      return found ? { ...found } : null;
    },
    async insertDraft(text) {
      const id = `r${data.size + 1}`;
      data.set(id, row({ id, ...text }));
      return id;
    },
    async updateDraft(id, text) {
      const found = data.get(id);
      if (!found || found.status !== 'draft') return false;
      Object.assign(found, text);
      return true;
    },
    async claimDraft(id) {
      const found = data.get(id);
      if (!found || found.status !== 'draft') return false;
      const sameVersionLive = [...data.values()].some(
        (other) => other.version === found.version && (other.status === 'sending' || other.status === 'sent'),
      );
      if (sameVersionLive) return false;
      found.status = 'sending';
      return true;
    },
    async finish(id, outcome) {
      const found = data.get(id);
      if (!found) throw new Error('missing row');
      found.status = outcome.status;
      found.sentCount = outcome.sentCount;
      found.failedCount = outcome.failedCount;
      finishCalls.push({ id, status: outcome.status, sentCount: outcome.sentCount, failedCount: outcome.failedCount });
    },
  };
  return { store, data, finishCalls };
}

function fakePush(overrides: Partial<ReleasePush> = {}) {
  const push: ReleasePush = {
    pushConfigured: () => true,
    countSubscriptions: async () => 5,
    send: vi.fn(async () => ({ sent: 4, failed: 1, expired: 0 })),
    ...overrides,
  };
  return push;
}

function deps(
  rows: ReleaseAnnouncementRow[],
  {
    push = fakePush(),
    liveVersion = async () => '1.2.0',
  }: { push?: ReleasePush; liveVersion?: () => Promise<string | null> } = {},
) {
  const fake = fakeStore(rows);
  const releaseDeps: ReleaseDeps = { store: fake.store, push, liveVersion };
  return { ...fake, push, deps: releaseDeps };
}

describe('sendRelease', () => {
  it('sends once, with the Hebrew payload and the update URL, and records the counts', async () => {
    const env = deps([row()]);
    const result = await sendRelease('r1', '1.2.0', env.deps);

    expect(result).toEqual({ ok: true, sent: 4, failed: 1, expired: 0 });
    expect(env.push.send).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(env.push.send).mock.calls[0][0];
    expect(payload.title).toBe('נגן תורה 1.2 זמין');
    expect(payload.url).toBe('/he?update=1');
    expect(payload.tag).toBe('release-1.2.0');
    expect(env.data.get('r1')).toMatchObject({ status: 'sent', sentCount: 4, failedCount: 1 });
  });

  it('a second send of the same release is a no-op: nothing is pushed twice', async () => {
    const env = deps([row()]);
    await sendRelease('r1', '1.2.0', env.deps);
    const second = await sendRelease('r1', '1.2.0', env.deps);

    expect(second).toEqual({ ok: false, reason: 'not-draft' });
    expect(env.push.send).toHaveBeenCalledTimes(1);
  });

  it('two simultaneous clicks send exactly once', async () => {
    const env = deps([row()]);
    const [a, b] = await Promise.all([sendRelease('r1', '1.2.0', env.deps), sendRelease('r1', '1.2.0', env.deps)]);

    expect(env.push.send).toHaveBeenCalledTimes(1);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((result) => !result.ok)).toEqual({ ok: false, reason: 'already-claimed' });
  });

  it('a second row for a version that is already sent cannot be claimed', async () => {
    const env = deps([row({ id: 'old', status: 'sent' }), row({ id: 'copy' })]);
    const result = await sendRelease('copy', '1.2.0', env.deps);

    expect(result).toEqual({ ok: false, reason: 'already-claimed' });
    expect(env.push.send).not.toHaveBeenCalled();
  });

  it('is blocked, with no claim and no push, when the live site serves another version', async () => {
    const env = deps([row()], { liveVersion: async () => '1.1.4' });
    const result = await sendRelease('r1', '1.2.0', env.deps);

    expect(result).toEqual({ ok: false, reason: 'live-mismatch' });
    expect(env.push.send).not.toHaveBeenCalled();
    expect(env.data.get('r1')?.status).toBe('draft');
  });

  it('is blocked when the live version cannot be read', async () => {
    const env = deps([row()], { liveVersion: async () => null });
    expect(await sendRelease('r1', '1.2.0', env.deps)).toEqual({ ok: false, reason: 'live-unknown' });
    expect(env.push.send).not.toHaveBeenCalled();
  });

  it('is blocked, with no claim, when push is not configured', async () => {
    const env = deps([row()], { push: fakePush({ pushConfigured: () => false }) });
    expect(await sendRelease('r1', '1.2.0', env.deps)).toEqual({ ok: false, reason: 'not-configured' });
    expect(env.data.get('r1')?.status).toBe('draft');
  });

  it('does nothing unless the admin confirms the version on screen', async () => {
    const env = deps([row()]);
    expect(await sendRelease('r1', '1.2.1', env.deps)).toEqual({ ok: false, reason: 'not-confirmed' });
    expect(await sendRelease('r1', '', env.deps)).toEqual({ ok: false, reason: 'not-confirmed' });
    expect(env.push.send).not.toHaveBeenCalled();
  });

  it('reports a missing release without sending', async () => {
    const env = deps([row()]);
    expect(await sendRelease('nope', '1.2.0', env.deps)).toEqual({ ok: false, reason: 'not-found' });
    expect(env.push.send).not.toHaveBeenCalled();
  });

  it('closes the release as failed when the push throws, and never sends it again', async () => {
    const env = deps([row()], {
      push: fakePush({
        send: vi.fn(async () => {
          throw new Error('boom');
        }),
      }),
    });
    const result = await sendRelease('r1', '1.2.0', env.deps);

    expect(result).toEqual({ ok: false, reason: 'send-failed' });
    expect(env.data.get('r1')?.status).toBe('failed');
    expect(await sendRelease('r1', '1.2.0', env.deps)).toEqual({ ok: false, reason: 'not-draft' });
    expect(env.push.send).toHaveBeenCalledTimes(1);
  });

  it('still reports the send when the final record fails (the push already went out, pushed once)', async () => {
    const env = deps([row()]);
    env.store.finish = async () => {
      throw new Error('db down');
    };
    const result = await sendRelease('r1', '1.2.0', env.deps);

    expect(result).toEqual({ ok: true, sent: 4, failed: 1, expired: 0 });
    expect(env.push.send).toHaveBeenCalledTimes(1);
  });
});

describe('previewRelease', () => {
  it('reports version, audience and the send block, and sends and claims nothing', async () => {
    const env = deps([row()]);
    const preview = await previewRelease('r1', env.deps);

    expect(preview).toMatchObject({ found: true, audience: 5, liveVersion: '1.2.0', block: null });
    expect(env.push.send).not.toHaveBeenCalled();
    expect(env.data.get('r1')?.status).toBe('draft');
  });

  it('shows the block (live version behind) without changing anything', async () => {
    const env = deps([row()], { liveVersion: async () => '1.1.4' });
    const preview = await previewRelease('r1', env.deps);
    expect(preview).toMatchObject({ found: true, block: 'live-mismatch' });
  });

  it('reports a missing release', async () => {
    const env = deps([]);
    expect(await previewRelease('r1', env.deps)).toEqual({ found: false });
  });
});

describe('fetchLiveVersion', () => {
  it('reads the version of the live /api/version, uncached', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ version: '1.2.0', buildId: 'dpl_x' })));
    expect(await fetchLiveVersion(fetcher as unknown as typeof fetch)).toBe('1.2.0');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/version$/);
    expect(init.cache).toBe('no-store');
  });

  it('returns null for an error status, a bad body, or a network failure', async () => {
    expect(
      await fetchLiveVersion((async () => new Response('x', { status: 500 })) as unknown as typeof fetch),
    ).toBeNull();
    expect(await fetchLiveVersion((async () => new Response('<html>')) as unknown as typeof fetch)).toBeNull();
    expect(
      await fetchLiveVersion((async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
