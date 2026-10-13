import { describe, expect, it } from 'vitest';
import { getServiceWorkerUrl } from './register-sw';

describe('getServiceWorkerUrl', () => {
  it('versions the worker by build id', () => {
    expect(getServiceWorkerUrl('abc 1', false)).toBe('/sw.js?v=abc%201');
    expect(getServiceWorkerUrl(undefined, false)).toBe('/sw.js?v=dev');
  });

  it('marks the dev server worker so it caches nothing', () => {
    expect(getServiceWorkerUrl('local-1', true)).toBe('/sw.js?v=local-1&dev=1');
  });
});
