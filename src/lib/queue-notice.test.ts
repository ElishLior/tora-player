import { describe, expect, it } from 'vitest';
import { playerQueueNotice } from './queue-notice';

describe('playerQueueNotice', () => {
  it('shows the outcomes a listener must see from any player surface', () => {
    expect(playerQueueNotice({ kind: 'stopped' })).toEqual({ key: 'stopped' });
    expect(playerQueueNotice({ kind: 'finished' })).toEqual({ key: 'finished' });
    expect(playerQueueNotice({ kind: 'skipped', title: 'שיעור א' })).toEqual({ key: 'skipped', title: 'שיעור א' });
  });

  it('shows nothing for the wait (the transport spinner shows it) or for no notice', () => {
    expect(playerQueueNotice({ kind: 'loading' })).toBeNull();
    expect(playerQueueNotice(null)).toBeNull();
  });
});
