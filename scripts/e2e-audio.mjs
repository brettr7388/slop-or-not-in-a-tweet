// Audio check, LOCAL ONLY (it starts games, which would add rows on a live database).
// iPhone 14 (WebKit) on /play, and /play inside a 640x480 cross-origin iframe (like the X player card,
// with no allow="autoplay") in WebKit and Chromium. After the Play tap: AudioContext running, master
// gain > 0, music element playing with currentTime advancing; the speaker toggles icon, aria-pressed,
// gain and element mute; and on a fresh page a speaker tap alone starts the audio.
import { isLocalUrl } from './local-only.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8788';
if (!isLocalUrl(BASE)) throw new Error(`e2e-audio is local only (it starts games): ${BASE}`);
const { chromium, webkit, devices } = await import('playwright');
const { default: assert } = await import('node:assert/strict');
const log = (...a) => console.log('✔', ...a);
const audio = (f) => f.evaluate(() => window.__audio());
const icon = (f) => f.$eval('.mute', (b) => ({ pressed: b.getAttribute('aria-pressed'), muted: b.innerHTML.includes('M16 9l5 6'), label: b.getAttribute('aria-label') }));

async function advancing(f, where) {
  const a = await audio(f);
  await new Promise((r) => setTimeout(r, 1200));
  const b = await audio(f);
  assert.equal(b.ctx, 'running', `${where}: AudioContext running`);
  assert.ok(b.master > 0, `${where}: master gain > 0`);
  assert.ok(b.music && !b.music.paused && !b.music.muted, `${where}: music element playing, not muted`);
  assert.ok(b.music.time > a.music.time + 0.5, `${where}: currentTime advancing ${a.music.time.toFixed(2)} -> ${b.music.time.toFixed(2)}`);
  return b;
}

async function waitPlaying(f) {
  await f.waitForFunction(() => { const a = window.__audio(); return a.ctx === 'running' && a.music && !a.music.paused && a.music.time > 0.2; }, null, { timeout: 15000 });
}

async function run(engine, label, contextOptions, framed) {
  const browser = await engine.launch();
  const context = await browser.newContext({ ...contextOptions });
  const page = await context.newPage();
  const errors = [], media = [];
  page.on('response', (r) => { if (r.url().endsWith('/audio/loop.mp3')) media.push(`${r.status()}${r.request().headers().range ? ` (${r.request().headers().range})` : ''}`); });
  page.on('pageerror', (e) => errors.push(e.message));
  let f = page;
  const open = async () => {
    if (framed) {
      // Host page on a faked https://x.com origin, so the iframe is cross-origin and allowed by our CSP.
      // The game is proxied to the local server as https://card.test, so the https host can frame it.
      await page.route('https://x.com/card-host', (route) => route.fulfill({ contentType: 'text/html',
        body: '<body style="margin:0;background:#333"><iframe src="https://card.test/play" width="640" height="480" style="border:0" scrolling="no"></iframe></body>' }));
      await context.route('https://card.test/**', async (route) => {
        const url = route.request().url().replace('https://card.test', BASE);
        route.fulfill({ response: await route.fetch({ url }) });
      });
      await page.goto('https://x.com/card-host');
      const handle = await page.waitForSelector('iframe');
      f = await handle.contentFrame();
    } else {
      await page.goto(`${BASE}/play`);
    }
    await f.waitForSelector('[data-action="start"]');
    await f.evaluate(() => localStorage.removeItem('slop-muted'));
  };

  // 1) Play tap starts everything.
  await open();
  assert.equal((await audio(f)).ctx, null, `${label}: nothing created before the first tap`);
  await f.locator('[data-action="start"]').first().tap();
  await waitPlaying(f);
  const s = await advancing(f, `${label} after Play`);
  // 2) Speaker: off and back on.
  await f.locator('.mute').tap();
  let a = await audio(f), i = await icon(f);
  assert.deepEqual([i.pressed, i.muted, i.label, a.master, a.music.muted], ['true', true, 'Unmute', 0, true], `${label}: muted`);
  assert.equal(await f.evaluate(() => document.documentElement.dataset.audio), 'muted');
  await f.locator('.mute').tap();
  a = await audio(f); i = await icon(f);
  assert.deepEqual([i.pressed, i.muted, i.label, a.master, a.music.muted], ['false', false, 'Mute', 1, false], `${label}: unmuted`);
  await advancing(f, `${label} after unmute`);
  // 3) Fresh page: the speaker alone starts audio (and stays "on").
  await open();
  await f.locator('.mute').tap();
  await waitPlaying(f);
  await advancing(f, `${label} speaker-first`);
  i = await icon(f);
  assert.equal(i.pressed, 'false', `${label}: speaker-first tap starts audio, stays unmuted`);
  assert.deepEqual(errors, [], `${label}: no page errors`);
  log(`${label} [${engine.name()}]: loop.mp3 responses ${[...new Set(media)].join(', ')}`);
  log(`${label} [${engine.name()}]: Play -> ctx running, master ${s.master}, music playing (t ${s.music.time.toFixed(2)}s, advancing); mute -> red X icon, aria-pressed=true, gain 0, element muted; unmute -> back; speaker tap on a fresh page starts audio`);
  await browser.close();
}

await run(webkit, 'iPhone 14', devices['iPhone 14'], false);
const card = { viewport: { width: 900, height: 600 }, hasTouch: true, isMobile: false };
await run(webkit, '640x480 iframe', { ...card, userAgent: devices['iPhone 14'].userAgent }, true);
await run(chromium, '640x480 iframe', { ...card, userAgent: devices['Pixel 7'].userAgent }, true);
console.log('audio checks passed');
