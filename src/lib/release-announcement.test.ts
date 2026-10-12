import { describe, expect, it } from 'vitest';
import {
  isMissingReleaseSchema,
  releaseClickPath,
  releasePushPayload,
  releaseSendBlock,
  releaseTemplate,
  validateReleaseText,
} from './release-announcement';

describe('releaseTemplate', () => {
  it('prefills the owner-approved Hebrew and English text for the release', () => {
    const template = releaseTemplate('1.2.0');
    expect(template).toEqual({
      version: '1.2.0',
      titleHe: 'נגן תורה 1.2 זמין',
      bodyHe: 'עדכון חדש מוכן. רעננו את האתר או השתמשו בכפתור הרענון באפליקציה כדי לטעון את הגרסה האחרונה.',
      titleEn: 'Torah Player 1.2 is available',
      bodyEn: "A new update is ready. Refresh the website or use the app's refresh action to load the latest version.",
    });
  });
});

describe('validateReleaseText', () => {
  const valid = {
    version: ' 1.2.0 ',
    titleHe: 'כותרת',
    bodyHe: 'גוף',
    titleEn: 'Title',
    bodyEn: 'Body',
  };

  it('accepts a complete release and trims it', () => {
    expect(validateReleaseText(valid)).toEqual({
      ok: true,
      value: { version: '1.2.0', titleHe: 'כותרת', bodyHe: 'גוף', titleEn: 'Title', bodyEn: 'Body' },
    });
  });

  it('names every field that is empty, too long or not a plain version', () => {
    const result = validateReleaseText({ ...valid, version: 'v1.2', titleEn: '', bodyHe: 'x'.repeat(301) });
    expect(result).toEqual({ ok: false, fields: ['version', 'titleEn', 'bodyHe'] });
  });
});

describe('releasePushPayload', () => {
  it('opens the home page with the update request, tagged per version, with refresh and later actions', () => {
    const payload = releasePushPayload({ version: '1.2.0', titleHe: 'כותרת', bodyHe: 'גוף' });
    expect(payload).toEqual({
      title: 'כותרת',
      body: 'גוף',
      url: releaseClickPath(),
      tag: 'release-1.2.0',
      actions: [
        { action: 'refresh', title: 'רענון' },
        { action: 'later', title: 'אחר כך' },
      ],
    });
    expect(releaseClickPath()).toBe('/he?update=1');
  });
});

describe('releaseSendBlock', () => {
  const ready = { status: 'draft' as const, pushConfigured: true, liveVersion: '1.2.0', version: '1.2.0' };

  it('allows a draft whose version is the one live on the site', () => {
    expect(releaseSendBlock(ready)).toBeNull();
  });

  it('blocks anything that is not a draft', () => {
    for (const status of ['sending', 'sent', 'failed'] as const) {
      expect(releaseSendBlock({ ...ready, status })).toBe('not-draft');
    }
  });

  it('blocks when push is not configured', () => {
    expect(releaseSendBlock({ ...ready, pushConfigured: false })).toBe('not-configured');
  });

  it('blocks when the live version is unknown or is not the announced one', () => {
    expect(releaseSendBlock({ ...ready, liveVersion: null })).toBe('live-unknown');
    expect(releaseSendBlock({ ...ready, liveVersion: '1.1.4' })).toBe('live-mismatch');
    expect(releaseSendBlock({ ...ready, liveVersion: '1.2.1' })).toBe('live-mismatch');
  });
});

describe('isMissingReleaseSchema', () => {
  it('recognises a missing table, column or function (migration 025 not applied)', () => {
    for (const code of ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']) {
      expect(isMissingReleaseSchema({ code })).toBe(true);
    }
  });

  it('does not treat other errors (a unique violation, no error) as a missing table', () => {
    expect(isMissingReleaseSchema({ code: '23505' })).toBe(false);
    expect(isMissingReleaseSchema({})).toBe(false);
    expect(isMissingReleaseSchema(null)).toBe(false);
  });
});
