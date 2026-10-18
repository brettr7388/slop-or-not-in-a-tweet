import test from 'node:test';
import assert from 'node:assert/strict';
import { d1Assets, parseRange } from '../deploy/d1-assets.js';

const body = Uint8Array.from({ length: 1000 }, (_, i) => i % 256);
const db = { prepare: () => ({ bind: (p) => ({ first: async () => (p === '/audio/loop.mp3' ? { type: 'audio/mpeg', body: Buffer.from(body).toString('base64') } : null) }) }) };
const get = (headers = {}, method = 'GET') => d1Assets(db).fetch(new Request('https://x.test/audio/loop.mp3', { method, headers }));

test('parseRange', () => {
  assert.deepEqual(parseRange('bytes=0-1', 1000), { start: 0, end: 1 });
  assert.deepEqual(parseRange('bytes=990-', 1000), { start: 990, end: 999 });
  assert.deepEqual(parseRange('bytes=-10', 1000), { start: 990, end: 999 });
  assert.deepEqual(parseRange('bytes=500-5000', 1000), { start: 500, end: 999 });
  assert.equal(parseRange('bytes=1000-', 1000), 'unsatisfiable');
  assert.equal(parseRange('items=0-1', 1000), null);
});

test('D1 assets: full, ranged, HEAD and unsatisfiable responses', async () => {
  const full = await get();
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.equal(full.headers.get('content-length'), '1000');
  assert.equal((await full.arrayBuffer()).byteLength, 1000);
  const two = await get({ range: 'bytes=0-1' });
  assert.equal(two.status, 206);
  assert.equal(two.headers.get('content-range'), 'bytes 0-1/1000');
  assert.equal(two.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual([...new Uint8Array(await two.arrayBuffer())], [0, 1]);
  const tail = await get({ range: 'bytes=998-' });
  assert.deepEqual([...new Uint8Array(await tail.arrayBuffer())], [998 % 256, 999 % 256]);
  const head = await get({}, 'HEAD');
  assert.equal(head.headers.get('content-length'), '1000');
  assert.equal((await get({ range: 'bytes=2000-' })).status, 416);
});
