import { assertTargetAllowed } from './local-only.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
assertTargetAllowed(BASE);
if (process.argv.includes('--guard-only')) process.exit(0);

const { chromium } = await import('playwright');
const { copyFileSync, mkdirSync } = await import('node:fs');
const { default: assert } = await import('node:assert/strict');
const { client } = await import('./api-client.mjs');

const SHOTS = process.env.SHOTS_DIR ?? 'screenshots';
const NICK = process.env.E2E_NICK ?? `Tester${Math.floor(Math.random() * 900 + 100)}`;
mkdirSync(SHOTS, { recursive: true });
const api = client(BASE);
const log = (...a) => console.log('✔', ...a);
const randomIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

async function checkNoAnswerLeaks() {
  for (const path of ['/images.json', '/credits.json', '/deck.js', '/src/deck.js', '/raw/ai/candidates.json',
    '/raw/real/candidates.json', '/raw/hard/candidates.json', '/raw/perfect/candidates.json', '/CREDITS.md', '/package.json', '/wrangler.toml', '/migrations/0001_init.sql', '/README.md']) {
    const res = await fetch(`${BASE}${path}`);
    assert.equal(res.status, 404, `${path} is not served`);
  }
  const leak = /"(a|answer|label)"\s*:|\b(ai|real)-\d\d\b/;
  for (const path of ['/play', '/app.js', '/s/7', '/s2/7', '/api/preview', '/api/leaderboard', '/api/leaderboard?level=2']) {
    const body = await (await fetch(`${BASE}${path}`)).text();
    assert.doesNotMatch(body, leak, `${path} carries no answer field`);
  }
  const s = await api.post('/api/session', {}, randomIp());
  assert.deepEqual(Object.keys(s.body).sort(), ['images', 'level', 'ok', 'rounds', 'session']);
  assert.ok(s.body.images.every((src) => /^\/img\/[0-9a-f]{16}\.jpg$/.test(src)), 'image URLs are content hashes');
  log('no static path serves an answer map (13 paths 404); /play, /app.js, /s/7, /s2/7, /api/preview, /api/session carry no labels');
}

async function checkCardRoute() {
  const res = await fetch(`${BASE}/play`, { headers: { 'user-agent': 'Twitterbot/1.0' } });
  const csp = res.headers.get('content-security-policy');
  assert.equal(res.status, 200);
  assert.equal(csp, "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com");
  assert.equal(res.headers.get('x-frame-options'), null, 'no X-Frame-Options on /play');
  const body = await res.text();
  const cards = [...body.matchAll(/<meta name="twitter:card" content="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(cards, ['player'], 'exactly one twitter:card=player');
  assert.match(body, /<meta name="twitter:player" content="[^"]+\/play">/);
  assert.match(body, /<meta name="twitter:player:width" content="640">/);
  assert.match(body, /<meta name="twitter:player:height" content="480">/);
  assert.doesNotMatch(body, /twitter:player:stream/);
  log('/play as Twitterbot: CSP', JSON.stringify(csp), 'no X-Frame-Options, one player card at 640x480');

  const shareBody = await (await fetch(`${BASE}/s/7`, { headers: { 'user-agent': 'Twitterbot/1.0' } })).text();
  assert.match(shareBody, /<meta property="og:image" content="[^"]+\/share\/7\.png">/);
  assert.match(shareBody, /<meta name="twitter:image" content="[^"]+\/share\/7\.png">/);
  assert.match(shareBody, /<title>I got 7\/10\. Can you\?<\/title>/);
  assert.equal((await fetch(`${BASE}/share/7.png`)).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${BASE}/s/11`)).status, 404);
  const l2Body = await (await fetch(`${BASE}/s2/7`, { headers: { 'user-agent': 'Twitterbot/1.0' } })).text();
  assert.match(l2Body, /<meta property="og:image" content="[^"]+\/share\/l2-7\.png">/);
  assert.match(l2Body, /<title>Fooled 7\/10\. Can you\?<\/title>/);
  assert.doesNotMatch(l2Body, /all 10|were AI/i, 'L2 share page keeps the secret');
  assert.equal((await fetch(`${BASE}/share/l2-7.png`)).headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${BASE}/s2/11`)).status, 404);
  log('/s/7 -> /share/7.png "I got 7/10. Can you?"; /s2/7 -> /share/l2-7.png "Fooled 7/10. Can you?"; /s/11 and /s2/11 are 404');
}

async function assertFits(page, where) {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth,
    ih: window.innerHeight, iw: window.innerWidth,
  }));
  assert.ok(m.sh <= m.ih && m.sw <= m.iw, `${where} fits without scroll: ${JSON.stringify(m)}`);
  return m;
}

async function playGame(browser, nickname, { shots = false, level2 = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.goto(`${BASE}/play`);
  await page.waitForSelector('.mosaic img');
  await page.waitForFunction(() => [...document.querySelectorAll('.mosaic img')].every((i) => i.complete));
  await assertFits(page, 'start');
  if (shots) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/start.png` });
  await page.click('[data-action="start"]');

  let expected = 0, hardSeen = 0;
  const seen = new Set();
  for (let round = 1; round <= 10; round++) {
    await page.waitForSelector('[data-action="guess"]');
    await page.waitForFunction(() => document.querySelector('.frame img').complete);
    assert.match(await page.textContent('.bar'), new RegExp(`${round}/10`));
    const src = await page.getAttribute('.frame img', 'src');
    seen.add(src);
    if (api.isHard(src)) hardSeen++;
    await assertFits(page, `round ${round}`);
    if (shots && round === 1) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/round.png` });
    const choice = round % 2 ? 'ai' : 'real';
    await page.click(`[data-action="guess"][data-arg="${choice}"]`);
    await page.waitForSelector('.reveal');
    const verdict = await page.textContent('.reveal .verdict');
    const truth = api.answerFor(src);
    assert.equal(verdict.trim(), `${choice === truth ? 'Yep' : 'Nope'}, ${truth === 'ai' ? 'AI' : 'real'}`, 'server verdict is right');
    if (choice === truth) expected++;
    assert.match(await page.textContent('.bar'), new RegExp(`${expected} pts?`));
    if (shots && round === 1) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/reveal.png` });
    await assertFits(page, `reveal ${round}`);
    await page.click('[data-action="next"]');
  }
  assert.equal(seen.size, 10, '10 distinct images');
  assert.ok(hardSeen >= 2 && hardSeen <= 3, `level 1 had ${hardSeen} hard AI images`);
  await page.waitForSelector('.big-score');
  assert.equal(await page.textContent('.big-score'), `${expected}/10`);

  await page.fill('input[name="name"]', nickname);
  await page.waitForFunction(() => !document.querySelector('.board li.muted')?.textContent.startsWith('Loading'));
  assert.equal(await page.inputValue('input[name="name"]'), nickname, 'typed name survives the leaderboard loading');
  await page.click('.name-form button');
  await page.waitForSelector('.saved, .end .error');
  const err = await page.$('.end .error');
  if (err) throw new Error(`submit failed in browser: ${await err.textContent()}`);
  const mine = await page.$$eval('.board li.me', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(mine.length, 1, 'exactly one row highlighted');
  assert.ok(mine[0].includes(nickname) && mine[0].endsWith(String(expected)), `highlighted row is ${nickname} with ${expected}`);
  await assertFits(page, 'end screen');
  if (shots) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/end-leaderboard.png` });
  const rows = await page.$$eval('.board li', (els) => els.map((e) => e.textContent.trim()));
  const href = await page.getAttribute('.btn-share', 'href');
  assert.ok(decodeURIComponent(href).includes(`/s/${expected}`));
  assert.ok(decodeURIComponent(href).includes(`I got ${expected}/10. Can you?`));
  const buttons = await page.$$eval('.end .row .btn', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(buttons, ['Share', 'Again', 'Level 2']);
  const l2 = level2 ? await playLevel2(page, level2, shots) : null;
  await page.close();
  return { expected, rows, hardSeen, l2 };
}

async function playLevel2(page, nickname, shots) {
  await page.click('[data-action="start"][data-arg="2"]');
  let fooled = 0;
  const seen = new Set();
  for (let round = 1; round <= 10; round++) {
    await page.waitForSelector('[data-action="guess"]:not([disabled])');
    await page.waitForFunction(() => document.querySelector('.frame img').complete);
    const bar = await page.textContent('.bar');
    assert.match(bar, /Level 2/); assert.match(bar, new RegExp(`${round}/10`)); assert.doesNotMatch(bar, /pts/);
    const src = await page.getAttribute('.frame img', 'src');
    assert.ok(api.isHard(src) && api.answerFor(src) === 'ai', 'level 2 image is from the hard AI pool');
    seen.add(src);
    await assertFits(page, `L2 round ${round}`);
    if (shots && round === 1) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/l2-round.png` });
    const choice = round % 3 === 1 ? 'real' : 'ai';
    if (choice === 'real') fooled++;
    await page.click(`[data-action="guess"][data-arg="${choice}"]`);
    await page.waitForSelector('.reveal.lock');
    assert.equal((await page.textContent('.reveal')).trim(), 'Locked in', 'neutral feedback, no answer');
    if (shots && round === 1) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/l2-locked.png` });
    await page.waitForFunction((r) => document.querySelector('#app').dataset.phase === 'end'
      || !document.querySelector('.reveal') && document.querySelector('.bar').textContent.includes(`${r + 1}/10`), round);
  }
  assert.equal(seen.size, 10);
  await page.waitForSelector('.end.l2');
  assert.equal((await page.textContent('.kicker')).trim(), 'All 10 were AI.');
  assert.equal((await page.textContent('.big-score')).trim(), `${fooled}/10`);
  assert.equal((await page.textContent('.tagline')).trim(), `You called ${fooled} real.`);
  assert.match(await page.textContent('.board h2'), /Level 2/);
  await page.waitForFunction(() => !document.querySelector('.board li.muted')?.textContent.startsWith('Loading'));
  await assertFits(page, 'L2 end');
  if (shots) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/l2-end.png` });
  await page.fill('input[name="name"]', nickname);
  await page.click('.name-form button');
  await page.waitForSelector('.saved, .end .error');
  const err = await page.$('.end .error');
  if (err) throw new Error(`L2 submit failed: ${await err.textContent()}`);
  const mine = await page.$$eval('.board li.me', (els) => els.map((e) => e.textContent.trim()));
  assert.equal(mine.length, 1);
  assert.ok(mine[0].includes(nickname) && mine[0].endsWith(String(10 - fooled)), `L2 board stores AI spotted = ${10 - fooled}`);
  if (shots) await page.screenshot({ animations: 'disabled', path: `${SHOTS}/l2-leaderboard.png` });
  const href = decodeURIComponent(await page.getAttribute('.btn-share', 'href'));
  assert.ok(href.includes(`/s2/${fooled}`) && href.includes(`Fooled ${fooled}/10. Can you?`));
  const buttons = await page.$$eval('.end .row .btn', (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(buttons, ['Share', 'Again']);
  return { fooled };
}

async function checkFramed(browser) {
  const page = await browser.newPage({ viewport: { width: 700, height: 560 } });
  await page.goto(`${BASE}/s/0`);
  await page.evaluate(() => {
    document.body.innerHTML = '<iframe id="f" scrolling="no" src="/play" width="560" height="420" style="border:0"></iframe>';
  });
  const frame = await (await page.waitForSelector('#f')).contentFrame();
  await frame.waitForSelector('[data-action="start"]');
  assert.equal(await frame.evaluate(() => document.documentElement.classList.contains('framed')), true);
  await frame.click('[data-action="start"]');
  await frame.waitForSelector('[data-action="guess"]');
  await assertFits(frame, 'framed 560x420 round');
  log('framed 560x420 with scrolling=no: embed mode on, no overflow');
  await page.close();
}

async function checkShare(browser, score, fooled) {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.goto(`${BASE}/s/${score}`);
  await page.waitForFunction(() => document.querySelector('.share-page img').complete);
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/share-page.png` });
  copyFileSync(`public/share/${score}.png`, `${SHOTS}/share-card.png`);
  await page.goto(`${BASE}/s2/${fooled}`);
  await page.waitForFunction(() => document.querySelector('.share-page img').complete);
  await page.screenshot({ animations: 'disabled', path: `${SHOTS}/l2-share-page.png` });
  copyFileSync(`public/share/l2-${fooled}.png`, `${SHOTS}/l2-share-card.png`);
  await page.close();
}

async function checkLevel2Api() {
  const ip = randomIp();
  const locked = await api.post('/api/session', { level: 2 }, ip);
  assert.equal(locked.status, 403); assert.equal(locked.body.error, 'locked');
  const unfinished = (await api.post('/api/session', {}, ip)).body.session;
  const early = await api.post('/api/session', { level: 2, after: unfinished }, ip);
  assert.equal(early.status, 403);
  assert.equal((await api.post('/api/session', { level: 3 }, ip)).status, 400);
  log('level 2 without a finished level 1 game: 403 locked (none, unfinished); level 3: 400');

  const after = await api.finishedSession(5, ip);
  let hardImages = 0;
  for (let k = 0; k < 6; k++) {
    const s = await api.post('/api/session', { level: 2, after }, ip);
    assert.equal(s.status, 200); assert.equal(s.body.level, 2);
    assert.equal(new Set(s.body.images).size, 10);
    assert.ok(s.body.images.every((src) => api.isHard(src) && api.answerFor(src) === 'ai'), 'L2 deck is 10/10 hard AI');
    hardImages += s.body.images.length;
  }
  log(`6 level 2 sessions: ${hardImages}/${hardImages} images from the hard AI pool`);

  const s = (await api.post('/api/session', { level: 2, after }, ip)).body;
  const calls = ['real', 'ai', 'ai', 'real', 'ai', 'ai', 'ai', 'real', 'ai', 'ai'];
  for (const [round, guess] of calls.entries()) {
    const g = await api.post('/api/guess', { session: s.session, round, guess }, ip);
    assert.equal(g.status, 200);
    if (round < 9) assert.deepEqual(Object.keys(g.body).sort(), ['done', 'locked', 'ok', 'round'], 'no answer per round in L2');
    else assert.deepEqual(g.body, { ok: true, locked: true, round: 10, done: true, score: 7, calledReal: 3, allAi: true });
  }
  const forged = await api.post('/api/score', { session: s.session, name: 'L2 Tester', score: 10, level: 1 }, ip);
  assert.equal(forged.status, 200); assert.equal(forged.body.level, 2); assert.equal(forged.body.score, 7);
  const l1 = (await api.call('GET', '/api/leaderboard')).body.top;
  const l2 = (await api.call('GET', '/api/leaderboard?level=2')).body.top;
  assert.ok(l2.some((r) => r.id === forged.body.id && r.score === 7), 'on the level 2 board');
  assert.ok(!l1.some((r) => r.id === forged.body.id), 'not on the level 1 board');
  assert.ok(!l2.some((r) => l1.some((x) => x.id === r.id)), 'boards share no rows');
  assert.equal((await api.call('GET', '/api/leaderboard?level=9')).status, 400);
  log('L2 server scoring: 3 "real" calls -> calledReal 3, stored 7 AI spotted on the level 2 board only (forged score/level ignored)');
}

async function checkGuards() {
  const ip = randomIp();
  const zero = await api.finishedSession(0, ip);
  const forged = await api.post('/api/score', { session: zero, name: 'Forger', score: 10 }, ip);
  assert.equal(forged.status, 200);
  assert.equal(forged.body.score, 0, 'server ignores client score');
  const row = forged.body.top.find((r) => r.id === forged.body.id);
  assert.ok(!row || row.score === 0);
  log('forged {score: 10} on a 0/10 session stored as', forged.body.score);

  const replay = await api.post('/api/score', { session: zero, name: 'Forger2' }, ip);
  assert.equal(replay.status, 409); assert.equal(replay.body.error, 'already_submitted');
  log('second submit for the same session:', replay.status, replay.body.error);

  const s = (await api.post('/api/session', {}, ip)).body;
  const ahead = await api.post('/api/guess', { session: s.session, round: 3, guess: 'ai' }, ip);
  assert.equal(ahead.status, 409); assert.equal(ahead.body.error, 'out_of_order'); assert.equal(ahead.body.expected, 0);
  const first = await api.post('/api/guess', { session: s.session, round: 0, guess: 'ai' }, ip);
  assert.equal(first.status, 200);
  const again = await api.post('/api/guess', { session: s.session, round: 0, guess: 'real' }, ip);
  assert.equal(again.status, 409); assert.equal(again.body.error, 'out_of_order');
  const early = await api.post('/api/score', { session: s.session, name: 'Quitter' }, ip);
  assert.equal(early.status, 409); assert.equal(early.body.error, 'not_finished');
  log('answer round 3 first:', ahead.status, ahead.body.error, '| replay round 0:', again.status, again.body.error,
    '| submit after 1 round:', early.status, early.body.error);

  const parallel = (await api.post('/api/session', {}, ip)).body;
  const racers = await Promise.all(['ai', 'real', 'ai', 'real'].map((guess) =>
    api.post('/api/guess', { session: parallel.session, round: 0, guess }, ip)));
  assert.equal(racers.filter((r) => r.status === 200).length, 1, 'one of 4 parallel answers to round 0 counts');
  log('4 parallel answers to the same round:', racers.map((r) => r.status).join(','));

  const ghost = await api.post('/api/guess', { session: 'f'.repeat(32), round: 0, guess: 'ai' }, ip);
  assert.equal(ghost.status, 404);
  for (const body of [{ session: 'nope', round: 0, guess: 'ai' }, { session: s.session, round: 1, guess: 'maybe' }, { session: s.session, round: 10, guess: 'ai' }]) {
    assert.equal((await api.post('/api/guess', body, ip)).status, 400);
  }
  const prof = await api.post('/api/score', { session: await api.finishedSession(5, ip), name: 'sh1t lord' }, ip);
  assert.equal(prof.status, 400); assert.equal(prof.body.error, 'name_not_allowed');
  log('unknown session 404, malformed session/guess/round 400, profane name', prof.body.error);

  const burstIp = randomIp();
  const sessions = [];
  for (let i = 0; i < 8; i++) sessions.push(await api.finishedSession(1, burstIp));
  const burst = await Promise.all(sessions.map((session, i) => api.post('/api/score', { session, name: `burst${i}` }, burstIp)));
  const statuses = burst.map((b) => b.status);
  assert.equal(statuses.filter((x) => x === 200).length, 3, 'exactly 3 submits per minute per IP');
  log('parallel burst of 8 finished sessions from one IP:', statuses.join(','));

  const floodIp = randomIp();
  const flood = await Promise.all(Array.from({ length: 25 }, () => api.post('/api/session', {}, floodIp)));
  assert.equal(flood.filter((r) => r.status === 200).length, 20, '20 sessions per minute per IP');
  log('25 parallel session starts from one IP: 20 ok,', flood.filter((r) => r.status === 429).length, 'got 429');

  const top = (await api.call('GET', '/api/leaderboard')).body.top;
  assert.ok(top.every((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= 10 && !/sh1t|Quitter|Forger2/.test(r.name)));
}

async function checkDuplicateNameHighlight(browser) {
  const ip = randomIp();
  const twin = await api.post('/api/score', { session: await api.finishedSession(10, ip), name: 'Twin' }, ip);
  assert.equal(twin.status, 200);
  const { expected } = await playGame(browser, 'Twin');
  log(`two "Twin" rows on the board (10 and ${expected}); only this session's row is highlighted`);
}

const browser = await chromium.launch();
try {
  await checkNoAnswerLeaks();
  await checkCardRoute();
  const { expected, rows, hardSeen, l2 } = await playGame(browser, NICK, { shots: true, level2: process.env.E2E_NICK2 ?? `${NICK}x` });
  log(`browser played 10 rounds by tapping (${hardSeen} hard AI), server verdicts and score ${expected}/10 checked; "${NICK}" highlighted once in`, JSON.stringify(rows));
  log(`browser played level 2: 10/10 hard AI, "Locked in" each round, end "All 10 were AI." fooled ${l2.fooled}/10, saved to level 2 board`);
  await checkFramed(browser);
  await checkShare(browser, 7, 7);
  log('share page and share card saved');
  if (!process.argv.includes('--no-guards')) {
    await checkGuards();
    await checkLevel2Api();
    await checkDuplicateNameHighlight(browser);
  }
  console.log('\nall e2e checks passed');
} finally {
  await browser.close();
}
