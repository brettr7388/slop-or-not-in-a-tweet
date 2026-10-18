// The card on a phone: X's panel covers the bottom ~30% of the player, so every control must sit in
// the top 70%. Plays Level 1 and Level 2 at 640x480 (page) and 360x270 (framed, like X scales it on a
// phone) with a mobile UA and touch. Never submits a name. Screenshots shade the covered zone.
import { assertTargetAllowed } from './local-only.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
assertTargetAllowed(BASE);
const { chromium, devices } = await import('playwright');
const { mkdirSync } = await import('node:fs');
const { default: assert } = await import('node:assert/strict');

const SHOTS = process.env.SHOTS_DIR ?? 'screenshots/card-touch';
mkdirSync(SHOTS, { recursive: true });
const SAFE = 0.7;
const UA = devices['iPhone 14'].userAgent;

async function check(f, where) {
  const r = await f.evaluate((safe) => {
    const h = innerHeight, d = document.documentElement;
    const keys = [...document.querySelectorAll('[data-action], .mute, input, .name-form button, a.btn, .saved')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => { const b = el.getBoundingClientRect(); return { el: el.dataset.action ?? el.className, top: b.top, bottom: Math.round(b.bottom), w: b.width, h: b.height }; });
    return { h, w: innerWidth, cls: d.className, sh: d.scrollHeight, sw: d.scrollWidth, limit: h * safe, keys };
  }, SAFE);
  assert.match(r.cls, /card-touch/, `${where}: touch card mode on`);
  assert.ok(r.sh <= r.h && r.sw <= r.w, `${where}: no scroll ${JSON.stringify({ sh: r.sh, sw: r.sw, h: r.h, w: r.w })}`);
  assert.ok(r.keys.length > 0, `${where}: found controls`);
  const low = r.keys.filter((k) => k.bottom > r.limit + 0.5);
  assert.deepEqual(low, [], `${where}: all controls above y=${r.limit}`);
  const small = r.keys.filter((k) => k.el !== 'saved' && (k.w < 44 || k.h < 44));
  assert.deepEqual(small, [], `${where}: tap targets >= 44px`);
  return r;
}

async function shot(f, target, name) {
  await f.evaluate((safe) => {
    const o = document.createElement('div');
    o.id = 'x-panel';
    o.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${(1 - safe) * 100}%;background:rgba(255,40,40,.32);` +
      'border-top:2px dashed #ff4d4d;pointer-events:none;z-index:99;color:#fff;font:700 12px system-ui;display:flex;align-items:center;justify-content:center';
    o.textContent = 'covered by X on phones (bottom 30%)';
    document.body.append(o);
  }, SAFE);
  await target.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
  await f.evaluate(() => document.getElementById('x-panel').remove());
}

async function playThrough(f, target, tag, shots) {
  await f.waitForSelector('[data-action="start"]');
  await f.waitForFunction(() => [...document.querySelectorAll('.mosaic img')].every((i) => i.complete));
  await check(f, `${tag} start`);
  if (shots) await shot(f, target, `${tag}-start`);
  await f.tap('[data-action="start"]');
  for (let round = 1; round <= 10; round++) {
    await f.waitForSelector('[data-action="guess"]:not([disabled])');
    await f.waitForFunction(() => document.querySelector('.frame img').complete);
    await check(f, `${tag} round ${round}`);
    if (shots && round === 1) await shot(f, target, `${tag}-round`);
    await f.tap(`[data-action="guess"][data-arg="${round % 2 ? 'ai' : 'real'}"]`);
    await f.waitForSelector('.reveal');
    await check(f, `${tag} reveal ${round}`);
    if (shots && round === 1) await shot(f, target, `${tag}-reveal`);
    await f.tap('[data-action="next"]');
  }
  await f.waitForSelector('.end');
  await f.waitForFunction(() => !document.querySelector('.board li.muted')?.textContent.startsWith('Loading'));
  await check(f, `${tag} end`);
  if (shots) await shot(f, target, `${tag}-end`);

  await f.tap('[data-action="start"][data-arg="2"]');
  for (let round = 1; round <= 10; round++) {
    await f.waitForSelector('[data-action="guess"]:not([disabled])');
    await f.waitForFunction((r) => document.querySelector('.bar').textContent.includes(`${r}/10`), round);
    await check(f, `${tag} L2 round ${round}`);
    if (shots && round === 1) await shot(f, target, `${tag}-l2-round`);
    await f.tap('[data-action="guess"][data-arg="real"]');
    await f.waitForSelector('.reveal.lock');
    await check(f, `${tag} L2 locked ${round}`);
  }
  await f.waitForSelector('.end.l2');
  await f.waitForFunction(() => !document.querySelector('.board li.muted')?.textContent.startsWith('Loading'));
  await check(f, `${tag} L2 end`);
  if (shots) await shot(f, target, `${tag}-l2-end`);
}

const browser = await chromium.launch();
try {
  // 1) The player page itself at card size.
  const ctx = await browser.newContext({ viewport: { width: 640, height: 480 }, userAgent: UA, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`);
  await playThrough(page, page, 'card-640x480', true);
  console.log('✔ 640x480 touch card: start, 10 rounds + reveals, end, Level 2 rounds + end: every control above y=336, no scroll, targets >= 44px');
  await ctx.close();

  // 2) Framed and scaled down to 360x270, like X on a phone.
  const ctx2 = await browser.newContext({ viewport: { width: 420, height: 320 }, userAgent: UA, hasTouch: true });
  const host = await ctx2.newPage();
  await host.goto(`${BASE}/s/0`);
  await host.evaluate(() => {
    document.body.innerHTML = '<iframe id="f" scrolling="no" src="/play" width="360" height="270" style="border:0;display:block"></iframe>';
    document.body.style.margin = '0';
  });
  const el = await host.waitForSelector('#f');
  const frame = await el.contentFrame();
  await playThrough(frame, el, 'card-360x270', true);
  console.log('✔ framed 360x270 touch card: same flow, every control above y=189, no scroll, targets >= 44px');
  await ctx2.close();
} finally {
  await browser.close();
}
console.log('\ncard touch checks passed');
