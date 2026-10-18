import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { isLocalUrl } from '../scripts/local-only.mjs';

const run = (script, env, args = []) =>
  spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 20_000 });

test('only loopback hosts count as local', () => {
  for (const url of ['http://127.0.0.1:8787', 'http://localhost:8787/x', 'http://[::1]:8787']) assert.equal(isLocalUrl(url), true, url);
  for (const url of ['https://slop.example.com', 'http://127.0.0.1.evil.com', 'http://10.0.0.5', 'not a url']) assert.equal(isLocalUrl(url), false, url);
});

for (const script of ['scripts/e2e.mjs', 'scripts/seed-demo.mjs']) {
  test(`${script} refuses a remote BASE_URL without the flag`, () => {
    const r = run(script, { BASE_URL: 'https://slop.example.com', E2E_ALLOW_REMOTE: '' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Refusing to run against https:\/\/slop\.example\.com/);
  });
}

test('--allow-remote or E2E_ALLOW_REMOTE=1 gets past the guard', () => {
  const r = run('scripts/e2e.mjs', { BASE_URL: 'http://192.0.2.1:9', E2E_ALLOW_REMOTE: '' }, ['--allow-remote', '--guard-only']);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /Refusing/);
  const env = run('scripts/e2e.mjs', { BASE_URL: 'http://192.0.2.1:9', E2E_ALLOW_REMOTE: '1' }, ['--guard-only']);
  assert.equal(env.status, 0);
});
