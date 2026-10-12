import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const isAdmin = vi.fn();
const getSignedInClient = vi.fn();
const insertDraft = vi.fn();
const updateDraft = vi.fn();
const previewRelease = vi.fn();
const sendRelease = vi.fn();

vi.mock('@/lib/auth/admin', () => ({ isAdmin: () => isAdmin() }));
vi.mock('@/lib/account/server', () => ({ getSignedInClient: () => getSignedInClient() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminSupabaseClient: () => ({}) }));
vi.mock('@/lib/notifications/release-announcement', () => ({
  createSupabaseReleaseStore: () => ({ insertDraft, updateDraft }),
  createReleasePushPort: () => ({}),
  fetchLiveVersion: async () => '1.2.0',
  previewRelease: (...args: unknown[]) => previewRelease(...args),
  sendRelease: (...args: unknown[]) => sendRelease(...args),
}));

import { previewReleaseAnnouncement, saveReleaseDraft, sendReleaseAnnouncement } from './release-announcements';

const VALID = {
  version: '1.2.0',
  titleHe: 'נגן תורה 1.2 זמין',
  bodyHe: 'עדכון חדש מוכן.',
  titleEn: 'Torah Player 1.2 is available',
  bodyEn: 'A new update is ready.',
};

describe('release announcement actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin.mockResolvedValue(true);
    getSignedInClient.mockResolvedValue({ userId: 'admin-1', supabase: {} });
    insertDraft.mockResolvedValue('new-id');
    updateDraft.mockResolvedValue(true);
    previewRelease.mockResolvedValue({ found: true, row: {}, audience: 3, liveVersion: '1.2.0', block: null });
    sendRelease.mockResolvedValue({ ok: true, sent: 3, failed: 0, expired: 0 });
  });

  describe('saving a draft', () => {
    it('refuses non-admins without touching the table', async () => {
      isAdmin.mockResolvedValue(false);
      expect(await saveReleaseDraft(null, VALID)).toEqual({ ok: false, error: 'unauthorized' });
      expect(insertDraft).not.toHaveBeenCalled();
    });

    it('rejects an invalid form, naming the fields', async () => {
      expect(await saveReleaseDraft(null, { ...VALID, version: 'x' })).toEqual({
        ok: false,
        error: 'invalid',
        fields: ['version'],
      });
      expect(insertDraft).not.toHaveBeenCalled();
    });

    it('creates a draft attributed to the signed-in admin, and never sends', async () => {
      expect(await saveReleaseDraft(null, VALID)).toEqual({ ok: true, id: 'new-id' });
      expect(insertDraft).toHaveBeenCalledWith(expect.objectContaining({ version: '1.2.0' }), 'admin-1');
      expect(sendRelease).not.toHaveBeenCalled();
    });

    it('reports a draft that is no longer editable', async () => {
      updateDraft.mockResolvedValue(false);
      expect(await saveReleaseDraft('r1', VALID)).toEqual({ ok: false, error: 'not-draft' });
    });

    it('maps a missing table (migration 025 not applied) to schema_missing', async () => {
      insertDraft.mockRejectedValue({ code: '42P01', message: 'relation does not exist' });
      expect(await saveReleaseDraft(null, VALID)).toEqual({ ok: false, error: 'schema_missing' });
    });
  });

  describe('previewing', () => {
    it('shows the preview and never sends', async () => {
      const result = await previewReleaseAnnouncement('r1');
      expect(result).toMatchObject({ ok: true, preview: { audience: 3, block: null } });
      expect(sendRelease).not.toHaveBeenCalled();
    });

    it('reports a missing release', async () => {
      previewRelease.mockResolvedValue({ found: false });
      expect(await previewReleaseAnnouncement('nope')).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('sending', () => {
    it('refuses non-admins before any send', async () => {
      isAdmin.mockResolvedValue(false);
      expect(await sendReleaseAnnouncement('r1', '1.2.0')).toEqual({ ok: false, error: 'unauthorized' });
      expect(sendRelease).not.toHaveBeenCalled();
    });

    it('sends only through the orchestration, once, with the version the admin confirmed', async () => {
      const result = await sendReleaseAnnouncement('r1', '1.2.0');
      expect(result).toEqual({ ok: true, result: { ok: true, sent: 3, failed: 0, expired: 0 } });
      expect(sendRelease).toHaveBeenCalledTimes(1);
      expect(sendRelease.mock.calls[0][0]).toBe('r1');
      expect(sendRelease.mock.calls[0][1]).toBe('1.2.0');
    });

    it('maps a missing table to schema_missing', async () => {
      sendRelease.mockRejectedValue({ code: 'PGRST205' });
      expect(await sendReleaseAnnouncement('r1', '1.2.0')).toEqual({ ok: false, error: 'schema_missing' });
    });
  });
});
