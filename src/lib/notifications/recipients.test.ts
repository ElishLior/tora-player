import { describe, expect, it } from 'vitest';
import { deliveredPushUserIds, emailRecipientsAfterPush } from './recipients';

describe('deliveredPushUserIds', () => {
  it('keeps signed-in owners of delivered subscriptions, once each', () => {
    const subscriptions = [
      { id: 'mac', user_id: 'owner' },
      { id: 'phone', user_id: 'owner' },
      { id: 'anon', user_id: null },
      { id: 'failed', user_id: 'friend' },
      { id: 'old-row' },
    ];
    expect(deliveredPushUserIds(subscriptions, ['mac', 'phone', 'anon', 'old-row'])).toEqual(['owner']);
  });

  it('is empty when nothing was delivered', () => {
    expect(deliveredPushUserIds([{ id: 'mac', user_id: 'owner' }], [])).toEqual([]);
  });
});

describe('emailRecipientsAfterPush', () => {
  const recipients = [
    { email: 'Owner@Gmail.com', display_name: 'Owner' },
    { email: 'friend@example.com', display_name: null },
    { email: 'third@example.com', display_name: null },
  ];

  it('leaves out recipients whose push arrived, comparing emails case-insensitively', () => {
    const { send, skipped } = emailRecipientsAfterPush(recipients, [' owner@gmail.COM ']);
    expect(send.map((r) => r.email)).toEqual(['friend@example.com', 'third@example.com']);
    expect(skipped).toBe(1);
  });

  it('emails everyone when no push arrived (no subscription, or the push failed)', () => {
    expect(emailRecipientsAfterPush(recipients, [])).toEqual({ send: recipients, skipped: 0 });
  });

  it('ignores pushed users who are not email recipients', () => {
    expect(emailRecipientsAfterPush(recipients, ['someone@else.com']).skipped).toBe(0);
  });
});
