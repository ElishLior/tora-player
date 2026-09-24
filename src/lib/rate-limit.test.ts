import { describe, expect, it } from 'vitest';
import { createRateLimiter, getClientIp } from './rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` attempts per window per key, then blocks until the window resets', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.consume('ip', 0)).toBe(true);
    expect(limiter.consume('ip', 10)).toBe(true);
    expect(limiter.consume('ip', 20)).toBe(false);
    expect(limiter.consume('other', 20)).toBe(true);
    expect(limiter.consume('ip', 999)).toBe(false);
    expect(limiter.consume('ip', 1000)).toBe(true);
  });

  it('bounds memory: expired windows go first, then the oldest key; other live windows survive', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    expect(limiter.consume('a', 0)).toBe(true);
    expect(limiter.consume('b', 500)).toBe(true);
    // Full of live windows: adding 'c' evicts the oldest key ('a') only.
    expect(limiter.consume('c', 600)).toBe(true);
    expect(limiter.consume('b', 700)).toBe(false);
    expect(limiter.consume('c', 700)).toBe(false);
  });
});

describe('getClientIp', () => {
  it('prefers the first forwarded address', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(getClientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(getClientIp(new Headers())).toBe('unknown');
  });
});
