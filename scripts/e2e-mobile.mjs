// Portrait phone check: iPhone 14 (WebKit) and Pixel 7 (Chromium) play one game each without scrolling,
// with every tap target at least 44x44 px. Read-only for the leaderboard: it never submits a name.
import { assertTargetAllowed } from './local-only.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
assertTargetAllowed(BASE);

const { chromium, webkit, devices } = await import('playwright');
const { mkdirSync } = await import('node:fs');
const { default: assert } = await import('node:assert/strict');

const SHOTS = process.env.SHOTS_DIR ?? 'screenshots/mobile';
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('✔', ...a);
const DEVICES = [['iphone14', 'iPhone 14', webkit], ['pixel7', 'Pixel 7', chromium]];

async function check(page, where) {
  const m = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('button, a.btn, input')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => { const r = el.getBoundingClientRect(); return { what: el.dataset.action ?? el.className ?? el.tagName, w: r.width, h: r.height }; });
    const d = document.documentElement;
    return { sh: d.scrollHeight, sw: d.scrollWidth, ih: innerHeight, iw: innerWidth, targets };
  });
  assert.ok(m.sh <= m.ih && m.sw <= m.iw, `${where}: no scroll ${JSON.stringify({ sh: m.sh, ih: m.ih, sw: m.sw, iw: m.iw })}`);
  const small = m.targets.filter((t) => t.w < 44 || t.h < 44);
  assert.deepEqual(small, [], `${where}: tap targets >= 44px`);
  return m;
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });

for (const [slug, name, engine] of DEVICES) {
  // WebKit needs system libraries that are not always installed; fall back to Chromium with the same device profile.
  let browser, used = engine.name();
  try { browser = await engine.launch(); } catch { browser = await chromium.launch(); used = 'chromium (webkit unavailable)'; }
  const context = await browser.newContext({ ...devices[name] });
  const page = await context.newPage();
  await page.goto(`${BASE}/play`);
  await page.waitForSelector('.mosaic img');
  await page.waitForFunction(() => [...document.querySelectorAll('.mosaic img')].every((i) => i.complete));
  const vp = await check(page, `${name} start`);
  assert.ok(vp.ih > vp.iw, 'portrait');
  await shot(page, `${slug}-start`);

  await page.tap('[data-action="start"]');
  let targets = 0;
  for (let round = 1; round <= 10; round++) {
    await page.waitForSelector('[data-action="guess"]:not([disabled])');
    await page.waitForFunction(() => document.querySelector('.frame img').complete);
    const fit = await page.$eval('.frame img', (img) => getComputedStyle(img).objectFit);
    assert.equal(fit, 'contain', 'portrait shows the whole image');
    targets = (await check(page, `${name} round ${round}`)).targets.length;
    if (round === 1) await shot(page, `${slug}-round`);
    await page.tap(`[data-action="guess"][data-arg="${round % 2 ? 'ai' : 'real'}"]`);
    await page.waitForSelector('.reveal');
    await check(page, `${name} reveal ${round}`);
    if (round === 1) await shot(page, `${slug}-reveal`);
    await page.tap('[data-action="next"]');
  }
  await page.waitForSelector('.big-score');
  await page.waitForFunction(() => !document.querySelector('.board li.muted')?.textContent.startsWith('Loading'));
  const end = await check(page, `${name} end`);
  await shot(page, `${slug}-end`);
  const audio = await page.evaluate(() => document.documentElement.dataset.audio);

  await page.tap('.mute');
  assert.equal(await page.getAttribute('.mute', 'aria-pressed'), 'true');
  await page.reload();
  await page.waitForSelector('.mute');
  assert.equal(await page.getAttribute('.mute', 'aria-pressed'), 'true', 'mute persists across reloads');
  await page.tap('.mute');
  assert.equal(await page.evaluate(() => localStorage.getItem('slop-muted')), '0');
  log(`${name} [${used}] ${vp.iw}x${vp.ih}: start, 10 rounds + reveals, end fit with no scroll; all ${targets}-${end.targets.length} tap targets >= 44px; audio=${audio}; mute persisted`);
  await browser.close();
}
console.log('\nmobile checks passed');
