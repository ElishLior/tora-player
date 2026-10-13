import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildsDiffer, shortBuildId } from './app-version';

describe('app version identity', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads the baked version and build id', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '1.2.0');
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', 'dpl_7kYaUUVwfVsyPwU3dvfiYia1jaRy');
    vi.resetModules();
    const mod = await import('./app-version');
    expect(mod.APP_VERSION).toBe('1.2.0');
    expect(mod.BUILD_ID).toBe('dpl_7kYaUUVwfVsyPwU3dvfiYia1jaRy');
  });

  it('falls back to "dev" when nothing was baked in (local tests and tooling)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_BUILD_ID', '');
    vi.resetModules();
    const mod = await import('./app-version');
    expect(mod.APP_VERSION).toBe('dev');
    expect(mod.BUILD_ID).toBe('dev');
  });

  it('shows a short build id without the deploy prefix', () => {
    expect(shortBuildId('dpl_7kYaUUVwfVsyPwU3dvfiYia1jaRy')).toBe('7kYaUUV');
    expect(shortBuildId('local-1234567890')).toBe('local-1');
  });

  it('the release version is the package.json version (single source)', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('running vs live build', () => {
  const RUNNING = { version: '1.2.0', buildId: 'dpl_abc1234' };

  it('is the same build only when version and deploy id both match', () => {
    expect(buildsDiffer(RUNNING, { ...RUNNING })).toBe(false);
  });

  it('differs when the live site has a new deploy of the same version', () => {
    expect(buildsDiffer(RUNNING, { version: '1.2.0', buildId: 'dpl_def5678' })).toBe(true);
  });

  it('differs when the live site has another version', () => {
    expect(buildsDiffer(RUNNING, { version: '1.2.1', buildId: 'dpl_abc1234' })).toBe(true);
  });
});
