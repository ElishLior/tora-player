import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const sourceScript = resolve(dirname(fileURLToPath(import.meta.url)), '../../.factory/checks.sh');
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(failAtLint = false) {
  const root = mkdtempSync(join(tmpdir(), 'tora-checks-'));
  fixtures.push(root);
  mkdirSync(join(root, '.factory'));
  mkdirSync(join(root, 'bin'));
  mkdirSync(join(root, 'original-home'));
  copyFileSync(sourceScript, join(root, '.factory', 'checks.sh'));
  const log = join(root, 'calls.log');
  for (const name of ['npm', 'npx']) {
    const binary = join(root, 'bin', name);
    const failure = name === 'npm' && failAtLint ? 'if [ "$*" = "run lint" ]; then exit 7; fi' : '';
    writeFileSync(binary, `#!/bin/sh
printf '%s|%s|%s|%s\\n' '${name}' "$*" "\${GITHUB_TOKEN-unset}" "$HOME" >> '${log}'
${failure}
exit 0
`);
    chmodSync(binary, 0o755);
  }
  const run = (env: Record<string, string> = {}) => spawnSync('sh', [join(root, '.factory', 'checks.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: { HOME: join(root, 'original-home'), PATH: `${join(root, 'bin')}:${process.env.PATH}`, NODE_ENV: 'test', GITHUB_TOKEN: 'inherited-secret', ...env },
  });
  return { root, log, run };
}

test('refuses a local env file before running install or build', () => {
  const { root, log, run } = fixture();
  writeFileSync(join(root, '.env.local'), 'SUPABASE_SERVICE_ROLE_KEY=private\n');
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('FAILED: Refusing to read environment file .env.local');
  expect(existsSync(log)).toBe(false);
});

test('check steps cannot inherit tokens or read the developer home npm configuration', () => {
  const { root, log, run } = fixture();
  writeFileSync(join(root, '.env.example'), 'NEXT_PUBLIC_PLACEHOLDER=ok\n');
  writeFileSync(join(root, 'original-home', '.npmrc'), '//registry.example.invalid/:_authToken=private\n');
  const result = run();
  expect(result.status).toBe(0);
  const calls = readFileSync(log, 'utf8').trim().split('\n').map((line) => line.split('|'));
  expect(calls.map(([command, args]) => `${command} ${args}`)).toEqual([
    'npm ci', 'npx next typegen', 'npm run type-check', 'npm run lint', 'npm test', 'npm run build',
  ]);
  for (const [, , token, home] of calls) {
    expect(token).toBe('unset');
    expect(home).toContain(join(root, '.factory', '.checks-home.'));
    expect(existsSync(home)).toBe(false);
  }
  expect(readdirSync(join(root, '.factory'))).toEqual(['checks.sh']);
});

test('reports the first failing step and does not run subsequent steps', () => {
  const { log, run } = fixture(true);
  const result = run();
  expect(result.status).toBe(7);
  expect(result.stderr).toContain('FAILED: Lint (exit 7)');
  const calls = readFileSync(log, 'utf8');
  expect(calls).toContain('npm|run lint|');
  expect(calls).not.toContain('npm|test|');
  expect(calls).not.toContain('npm|run build|');
});
