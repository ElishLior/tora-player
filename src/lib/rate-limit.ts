/**
 * Fixed-window, in-memory rate limiter. State lives per server instance, so on
 * serverless it throttles bursts against one warm instance rather than
 * enforcing an exact global quota — enough to blunt password guessing and
 * form spam. Supabase Auth applies its own limits to sign-in emails and codes.
 */
export interface RateLimiter {
  /** Records one attempt for `key`; returns false once the window's limit is exceeded. */
  consume(key: string, nowMs?: number): boolean;
}

export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(key, nowMs = Date.now()) {
      let entry = windows.get(key);
      if (!entry || nowMs >= entry.resetAt) {
        if (windows.size >= maxKeys) {
          for (const [storedKey, stored] of windows) {
            if (nowMs >= stored.resetAt) windows.delete(storedKey);
          }
          // Still full of live windows: drop the oldest to bound memory.
          if (windows.size >= maxKeys) {
            const oldestKey = windows.keys().next().value;
            if (oldestKey !== undefined) windows.delete(oldestKey);
          }
        }
        entry = { count: 0, resetAt: nowMs + windowMs };
        windows.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= limit;
    },
  };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || headers.get('x-real-ip') || 'unknown';
}
