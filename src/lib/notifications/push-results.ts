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
