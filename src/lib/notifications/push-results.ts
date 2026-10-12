export type PushOutcome =
  | { id: string; ok: true }
  | { id: string; ok: false; statusCode?: number };

export interface PushSummary {
  /** Delivered; stamp last_success_at. */
  sentIds: string[];
  /** Gone for good (404/410 from the push service); delete the subscription. */
  expiredIds: string[];
  /** Transient or unknown failures (429, 5xx, network, 401/403 VAPID problems); keep for the next send. */
  failedIds: string[];
}

/**
 * Only 404 Not Found and 410 Gone mean the browser dropped the subscription.
 * 401/403 usually signal a VAPID key/config problem on our side, so pruning
 * on them would wipe every subscriber after a misconfiguration.
 */
export function summarizePushOutcomes(outcomes: PushOutcome[]): PushSummary {
  const summary: PushSummary = { sentIds: [], expiredIds: [], failedIds: [] };
  for (const outcome of outcomes) {
    if (outcome.ok) summary.sentIds.push(outcome.id);
    else if (outcome.statusCode === 404 || outcome.statusCode === 410) summary.expiredIds.push(outcome.id);
    else summary.failedIds.push(outcome.id);
  }
  return summary;
}

export type PushService = 'apple' | 'fcm' | 'wns' | 'mozilla' | 'other';

/**
 * Which push service an endpoint belongs to, by host only (never the token
 * path): Safari/iPhone PWAs (web.push.apple.com), Chrome/Android/Edge-on-
 * Android (fcm.googleapis.com), Windows/Edge (*.notify.windows.com) or Firefox
 * (*.push.services.mozilla.com). WNS hosts vary per region, so they are
 * reported as `*.notify.windows.com`.
 */
export function pushServiceOf(endpoint: string): { service: PushService; host: string } {
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return { service: 'other', host: 'invalid' };
  }
  if (host === 'web.push.apple.com' || host.endsWith('.push.apple.com')) return { service: 'apple', host };
  if (host === 'fcm.googleapis.com' || host === 'android.googleapis.com') return { service: 'fcm', host };
  if (host.endsWith('.notify.windows.com')) return { service: 'wns', host: '*.notify.windows.com' };
  if (host.endsWith('.push.services.mozilla.com') || host === 'push.services.mozilla.com') {
    return { service: 'mozilla', host };
  }
  return { service: 'other', host };
}

/**
 * 400/403 rejections usually mean a VAPID key, subject or payload problem that
 * hits one platform. They are kept (not pruned) and counted per push service,
 * e.g. { "403 apple web.push.apple.com": 1 }, so the log shows which platform.
 */
export function configRejectionsByService(
  failures: ReadonlyArray<{ endpoint: string; statusCode?: number }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const failure of failures) {
    if (failure.statusCode !== 400 && failure.statusCode !== 403) continue;
    const { service, host } = pushServiceOf(failure.endpoint);
    const key = `${failure.statusCode} ${service} ${host}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
