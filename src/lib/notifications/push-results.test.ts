import { describe, expect, it } from 'vitest';
import { configRejectionsByService, pushServiceOf, summarizePushOutcomes } from './push-results';
import { pushSubscriptionSchema } from '@/lib/validators';

describe('summarizePushOutcomes', () => {
  it('prunes only subscriptions the push service reports as gone (404/410)', () => {
    const summary = summarizePushOutcomes([
      { id: 'delivered', ok: true },
      { id: 'gone', ok: false, statusCode: 410 },
      { id: 'not-found', ok: false, statusCode: 404 },
      { id: 'throttled', ok: false, statusCode: 429 },
      { id: 'server-error', ok: false, statusCode: 503 },
      { id: 'vapid-mismatch', ok: false, statusCode: 403 },
      { id: 'network', ok: false },
    ]);

    expect(summary.sentIds).toEqual(['delivered']);
    expect(summary.expiredIds).toEqual(['gone', 'not-found']);
    expect(summary.failedIds).toEqual(['throttled', 'server-error', 'vapid-mismatch', 'network']);
  });

  it('handles an empty send', () => {
    expect(summarizePushOutcomes([])).toEqual({ sentIds: [], expiredIds: [], failedIds: [] });
  });
});

describe('pushSubscriptionSchema endpoint allowlist', () => {
  const keys = { p256dh: 'BPub', auth: 'secret' };

  it('accepts the Chrome, Firefox, Safari/iOS and Edge push services', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
    }
  });

  it('rejects arbitrary or insecure endpoints (no server-side requests to attacker URLs)', () => {
    for (const endpoint of [
      'https://evil.example.com/push',
      'https://fcm.googleapis.com.evil.com/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://evilpush.apple.com.attacker.net/x',
      'not a url',
    ]) {
      expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    }
  });
});

describe('pushServiceOf', () => {
  it('names the push service by host only', () => {
    expect(pushServiceOf('https://web.push.apple.com/QGx-token')).toEqual({ service: 'apple', host: 'web.push.apple.com' });
    expect(pushServiceOf('https://fcm.googleapis.com/fcm/send/abc')).toEqual({ service: 'fcm', host: 'fcm.googleapis.com' });
    expect(pushServiceOf('https://wns2-par02p.notify.windows.com/w/?token=abc')).toEqual({
      service: 'wns',
      host: '*.notify.windows.com',
    });
    expect(pushServiceOf('https://updates.push.services.mozilla.com/wpush/v2/abc')).toEqual({
      service: 'mozilla',
      host: 'updates.push.services.mozilla.com',
    });
    expect(pushServiceOf('https://example.com/push')).toEqual({ service: 'other', host: 'example.com' });
    expect(pushServiceOf('not a url')).toEqual({ service: 'other', host: 'invalid' });
  });
});

describe('configRejectionsByService', () => {
  it('counts only 400/403 rejections per service, without tokens', () => {
    expect(
      configRejectionsByService([
        { endpoint: 'https://web.push.apple.com/a', statusCode: 403 },
        { endpoint: 'https://web.push.apple.com/b', statusCode: 403 },
        { endpoint: 'https://fcm.googleapis.com/fcm/send/c', statusCode: 400 },
        { endpoint: 'https://fcm.googleapis.com/fcm/send/d', statusCode: 410 },
        { endpoint: 'https://fcm.googleapis.com/fcm/send/e', statusCode: 503 },
        { endpoint: 'https://fcm.googleapis.com/fcm/send/f' },
      ]),
    ).toEqual({ '403 apple web.push.apple.com': 2, '400 fcm fcm.googleapis.com': 1 });
  });
});
