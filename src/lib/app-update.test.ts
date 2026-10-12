import { describe, expect, it } from 'vitest';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_MAX_BACKOFF_MS,
  UPDATE_MIN_GAP_MS,
  UPDATE_RELOAD_TTL_MS,
  buildIdFromScriptUrl,
  isUpdateRequested,
  parseVersionResponse,
  refreshDecision,
  refreshRecord,
  shouldCheckForUpdate,
  updateTarget,
  verifyRefresh,
  withoutUpdateRequest,
} from './app-update';

const NOW = 1_000_000_000_000;

describe('shouldCheckForUpdate', () => {
  it('always checks on load (first attempt)', () => {
    expect(shouldCheckForUpdate({ trigger: 'load', now: NOW, lastAttemptAt: null, failures: 0 })).toBe(true);
  });

  it('does not check again within the 30 minute window, whatever the trigger', () => {
    const last = NOW - (UPDATE_CHECK_INTERVAL_MS - 1);
    for (const trigger of ['visible', 'interval', 'load'] as const) {
      expect(shouldCheckForUpdate({ trigger, now: NOW, lastAttemptAt: last, failures: 0 })).toBe(false);
    }
  });

  it('checks again once 30 minutes have passed', () => {
    const last = NOW - UPDATE_CHECK_INTERVAL_MS;
    expect(shouldCheckForUpdate({ trigger: 'visible', now: NOW, lastAttemptAt: last, failures: 0 })).toBe(true);
    expect(shouldCheckForUpdate({ trigger: 'interval', now: NOW, lastAttemptAt: last, failures: 0 })).toBe(true);
  });

  it('checks on coming back online after a minute, not on every flap', () => {
    expect(
      shouldCheckForUpdate({ trigger: 'online', now: NOW, lastAttemptAt: NOW - UPDATE_MIN_GAP_MS + 1, failures: 0 }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({ trigger: 'online', now: NOW, lastAttemptAt: NOW - UPDATE_MIN_GAP_MS, failures: 0 }),
    ).toBe(true);
  });

  it('backs off after failures and never waits longer than the cap', () => {
    // One failure: the gap doubles past the normal 30 minutes.
    const oneFailure = UPDATE_CHECK_INTERVAL_MS * 2;
    expect(
      shouldCheckForUpdate({ trigger: 'visible', now: NOW, lastAttemptAt: NOW - oneFailure + 1, failures: 1 }),
    ).toBe(false);
    expect(shouldCheckForUpdate({ trigger: 'visible', now: NOW, lastAttemptAt: NOW - oneFailure, failures: 1 })).toBe(
      true,
    );
    // Many failures: capped.
    expect(
      shouldCheckForUpdate({ trigger: 'visible', now: NOW, lastAttemptAt: NOW - UPDATE_MAX_BACKOFF_MS, failures: 40 }),
    ).toBe(true);
  });
});

describe('updateTarget', () => {
  const base = { runningBuildId: 'dpl_old', serverBuildId: null, waitingBuildId: null, snoozedBuildId: null };

  it('offers nothing when the server reports the running build', () => {
    expect(updateTarget({ ...base, serverBuildId: 'dpl_old' })).toBeNull();
  });

  it('offers the server build when it differs from the running one', () => {
    expect(updateTarget({ ...base, serverBuildId: 'dpl_new' })).toBe('dpl_new');
  });

  it('offers a waiting worker build when the server has not answered', () => {
    expect(updateTarget({ ...base, waitingBuildId: 'dpl_new' })).toBe('dpl_new');
  });

  it('prefers the server answer over a waiting worker', () => {
    expect(updateTarget({ ...base, serverBuildId: 'dpl_server', waitingBuildId: 'dpl_worker' })).toBe('dpl_server');
  });

  it('is silent for a snoozed build id, and shows the next one again', () => {
    expect(updateTarget({ ...base, serverBuildId: 'dpl_new', snoozedBuildId: 'dpl_new' })).toBeNull();
    expect(updateTarget({ ...base, serverBuildId: 'dpl_newer', snoozedBuildId: 'dpl_new' })).toBe('dpl_newer');
  });

  it('never offers anything in local development (no deployed build id)', () => {
    expect(updateTarget({ ...base, runningBuildId: 'dev', serverBuildId: 'dpl_new' })).toBeNull();
    expect(updateTarget({ ...base, runningBuildId: 'local-123', serverBuildId: 'dev' })).toBeNull();
  });
});

describe('refresh decision (playback guard)', () => {
  it('does nothing without a target', () => {
    expect(refreshDecision({ target: null, playing: false })).toBe('none');
    expect(refreshDecision({ target: null, playing: true })).toBe('none');
  });

  it('refreshes an idle tab straight away', () => {
    expect(refreshDecision({ target: 'dpl_new', playing: false })).toBe('refresh');
  });

  it('defers a refresh while audio plays or loads: no reload mid-track, the user taps after a pause', () => {
    expect(refreshDecision({ target: 'dpl_new', playing: true })).toBe('wait-for-pause');
  });
});

describe('update scenarios', () => {
  const running = 'dpl_old';

  it('same build: nothing is offered', () => {
    expect(
      updateTarget({ runningBuildId: running, serverBuildId: running, waitingBuildId: null, snoozedBuildId: null }),
    ).toBeNull();
  });

  it('new build: offered, and a playing tab defers it until the pause', () => {
    const target = updateTarget({
      runningBuildId: running,
      serverBuildId: 'dpl_new',
      waitingBuildId: null,
      snoozedBuildId: null,
    });
    expect(target).toBe('dpl_new');
    expect(refreshDecision({ target, playing: true })).toBe('wait-for-pause');
    expect(refreshDecision({ target, playing: false })).toBe('refresh');
  });

  it('a waiting worker from a newer build is offered even if the server answer is missing', () => {
    expect(
      updateTarget({
        runningBuildId: running,
        serverBuildId: null,
        waitingBuildId: 'dpl_worker',
        snoozedBuildId: null,
      }),
    ).toBe('dpl_worker');
  });

  it('Later snoozes that build only; the next deploy is offered again', () => {
    const snoozed = updateTarget({
      runningBuildId: running,
      serverBuildId: 'dpl_new',
      waitingBuildId: null,
      snoozedBuildId: 'dpl_new',
    });
    expect(snoozed).toBeNull();
    expect(
      updateTarget({
        runningBuildId: running,
        serverBuildId: 'dpl_newer',
        waitingBuildId: null,
        snoozedBuildId: 'dpl_new',
      }),
    ).toBe('dpl_newer');
  });

  it('reload guard: a refresh that came back on the build it left is snoozed, so it is never offered (or reloaded) again', () => {
    const raw = refreshRecord('dpl_new', running, NOW);
    expect(verifyRefresh({ raw, runningBuildId: running, now: NOW + 1_000 })).toBe('mismatch');
    // The hook snoozes the record's target on a mismatch:
    expect(
      updateTarget({
        runningBuildId: running,
        serverBuildId: 'dpl_new',
        waitingBuildId: null,
        snoozedBuildId: 'dpl_new',
      }),
    ).toBeNull();
  });
});

describe('refresh record and reload verification', () => {
  it('verifies when the page now runs the target build', () => {
    const raw = refreshRecord('dpl_new', 'dpl_old', NOW);
    expect(verifyRefresh({ raw, runningBuildId: 'dpl_new', now: NOW + 5_000 })).toBe('verified');
  });

  it('verifies when the reload landed on a third, newer build (a hotfix shipped in between)', () => {
    const raw = refreshRecord('dpl_new', 'dpl_old', NOW);
    expect(verifyRefresh({ raw, runningBuildId: 'dpl_newer', now: NOW + 5_000 })).toBe('verified');
  });

  it('reports a mismatch only when the reload came back on the build it left (no retry is planned)', () => {
    const raw = refreshRecord('dpl_new', 'dpl_old', NOW);
    expect(verifyRefresh({ raw, runningBuildId: 'dpl_old', now: NOW + 5_000 })).toBe('mismatch');
  });

  it('ignores a record that expired, or that is in the future, or is missing or broken', () => {
    const raw = refreshRecord('dpl_new', 'dpl_old', NOW);
    expect(verifyRefresh({ raw, runningBuildId: 'dpl_old', now: NOW + UPDATE_RELOAD_TTL_MS + 1 })).toBe('none');
    expect(verifyRefresh({ raw, runningBuildId: 'dpl_old', now: NOW - 1 })).toBe('none');
    expect(verifyRefresh({ raw: null, runningBuildId: 'dpl_old', now: NOW })).toBe('none');
    expect(verifyRefresh({ raw: '{not json', runningBuildId: 'dpl_old', now: NOW })).toBe('none');
    expect(verifyRefresh({ raw: '{"target":"dev","at":1}', runningBuildId: 'dpl_old', now: NOW })).toBe('none');
    expect(verifyRefresh({ raw: '{"target":"dpl_new","at":1}', runningBuildId: 'dpl_old', now: NOW })).toBe('none');
  });
});

describe('update request from a push notification', () => {
  it('reads ?update=1 only', () => {
    expect(isUpdateRequested('?update=1')).toBe(true);
    expect(isUpdateRequested('?foo=bar&update=1')).toBe(true);
    expect(isUpdateRequested('?update=0')).toBe(false);
    expect(isUpdateRequested('')).toBe(false);
  });

  it('removes only the update parameter from the URL', () => {
    expect(withoutUpdateRequest('https://example.test/he/lessons?q=1&update=1#top')).toBe(
      'https://example.test/he/lessons?q=1#top',
    );
    expect(withoutUpdateRequest('https://example.test/he?update=1')).toBe('https://example.test/he');
  });
});

describe('build id parsing', () => {
  it('reads the build id from the service worker script URL', () => {
    expect(buildIdFromScriptUrl('https://example.test/sw.js?v=dpl_abc')).toBe('dpl_abc');
    expect(buildIdFromScriptUrl('/sw.js?v=dev')).toBeNull();
    expect(buildIdFromScriptUrl('/sw.js')).toBeNull();
    expect(buildIdFromScriptUrl(undefined)).toBeNull();
  });

  it('accepts only a well-formed /api/version body', () => {
    expect(parseVersionResponse({ version: '1.2.0', buildId: 'dpl_abc' })).toEqual({
      version: '1.2.0',
      buildId: 'dpl_abc',
    });
    expect(parseVersionResponse({ version: '1.2.0' })).toBeNull();
    expect(parseVersionResponse({ version: '1.2.0', buildId: 'dev' })).toBeNull();
    expect(parseVersionResponse('<html>')).toBeNull();
    expect(parseVersionResponse(null)).toBeNull();
  });
});
