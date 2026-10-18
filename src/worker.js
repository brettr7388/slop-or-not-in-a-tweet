import { DECK } from './deck.js';
import { ROUNDS, parseGuess, parseLevel, parseSessionId, parseSubmission, pickDeck, pickLevelDeck } from './validate.js';
import { playPage, sharePage, PLAYER_CSP, DEFAULT_CSP } from './pages.js';

const MINUTE = 60_000;
const DAY = 86_400_000;
const SESSION_TTL_MS = 2 * 60 * MINUTE;
const SESSIONS_PER_MINUTE = 20;
const SUBMITS_PER_MINUTE = 3;
const SUBMITS_PER_DAY = 30;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const fail = (error, status) => json({ ok: false, error }, status);

const html = (body, csp) =>
  new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

async function ipHash(request, env) {
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? 'unknown';
  const data = new TextEncoder().encode(`${env.IP_SALT ?? 'slop-or-not'}:${ip}`);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)).slice(0, 16));
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function topTen(env, level = 1) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, score FROM scores WHERE level = ?1 ORDER BY score DESC, created_at ASC LIMIT 10',
  ).bind(level).all();
  return results;
}

function leaderboard(request, env) {
  const raw = new URL(request.url).searchParams.get('level');
  const level = parseLevel({ level: raw === null ? 1 : Number(raw) });
  if (!level) return fail('bad_level', 400);
  return topTen(env, level).then((top) => json({ ok: true, level, top }));
}

async function loadSession(env, id, now) {
  const row = await env.DB.prepare('SELECT id, deck, round, score, level, created_at FROM sessions WHERE id = ?1').bind(id).first();
  if (!row || row.created_at < now - SESSION_TTL_MS) return null;
  return { ...row, deck: JSON.parse(row.deck) };
}

function preview() {
  return json({ ok: true, images: pickDeck(DECK.length, 6, cryptoRandom).map((i) => `/${DECK[i].f}`) });
}

async function createSession(request, env) {
  const body = (await readJson(request)) ?? {};
  const level = parseLevel(body);
  if (!level) return fail('bad_level', 400);
  const now = Date.now();
  if (level === 2) {
    // Level 2 unlocks only after finishing a Level 1 game.
    const after = parseSessionId(body.after);
    const done = after && await env.DB.prepare(
      'SELECT 1 FROM sessions WHERE id = ?1 AND level = 1 AND round = ?2 AND created_at > ?3',
    ).bind(after, ROUNDS, now - SESSION_TTL_MS).first();
    if (!done) return fail('locked', 403);
  }
  const id = hex(crypto.getRandomValues(new Uint8Array(16)));
  const deck = pickLevelDeck(DECK, level, cryptoRandom);
  const ip = await ipHash(request, env);
  const [, insert] = await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE created_at < ?1').bind(now - DAY),
    env.DB.prepare(
      `INSERT INTO sessions (id, deck, ip_hash, created_at, level)
       SELECT ?1, ?2, ?3, ?4, ?7
       WHERE (SELECT COUNT(*) FROM sessions WHERE ip_hash = ?3 AND created_at > ?5) < ?6`,
    ).bind(id, JSON.stringify(deck), ip, now, now - MINUTE, SESSIONS_PER_MINUTE, level),
  ]);
  if (insert.meta.changes !== 1) return fail('rate_limited', 429);
  return json({ ok: true, session: id, level, rounds: ROUNDS, images: deck.map((i) => `/${DECK[i].f}`) });
}

async function guess(request, env) {
  const parsed = parseGuess(await readJson(request));
  if (!parsed.ok) return json(parsed, 400);
  const now = Date.now();
  const session = await loadSession(env, parsed.session, now);
  if (!session) return fail('session_not_found', 404);
  if (session.round !== parsed.round) return json({ ok: false, error: 'out_of_order', expected: session.round }, 409);

  const image = DECK[session.deck[parsed.round]];
  const correct = parsed.guess === image.a;
  const update = await env.DB.prepare(
    'UPDATE sessions SET round = round + 1, score = score + ?1 WHERE id = ?2 AND round = ?3',
  ).bind(correct ? 1 : 0, session.id, parsed.round).run();
  if (update.meta.changes !== 1) return json({ ok: false, error: 'out_of_order' }, 409);

  const round = parsed.round + 1;
  const done = round === ROUNDS;
  const score = session.score + (correct ? 1 : 0);
  if (session.level === 2) {
    // Neutral feedback only: revealing per round would give away that every image is AI.
    return json({ ok: true, locked: true, round, done, ...(done ? { score, calledReal: ROUNDS - score, allAi: true } : {}) });
  }
  return json({
    ok: true,
    correct,
    answer: image.a,
    credit: image.a === 'real' ? { by: image.by, lic: image.lic, src: image.src } : null,
    score,
    round,
    done,
  });
}

async function submitScore(request, env) {
  const parsed = parseSubmission(await readJson(request));
  if (!parsed.ok) return json(parsed, 400);
  const now = Date.now();
  const ip = await ipHash(request, env);
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO scores (name, score, ip_hash, created_at, session_id, level)
     SELECT ?1, s.score, ?2, ?3, s.id, s.level FROM sessions s
     WHERE s.id = ?4 AND s.round = ?5 AND s.created_at > ?6
       AND (SELECT COUNT(*) FROM scores WHERE ip_hash = ?2 AND created_at > ?7) < ?8
       AND (SELECT COUNT(*) FROM scores WHERE ip_hash = ?2 AND created_at > ?9) < ?10`,
  ).bind(parsed.name, ip, now, parsed.session, ROUNDS, now - SESSION_TTL_MS,
    now - MINUTE, SUBMITS_PER_MINUTE, now - DAY, SUBMITS_PER_DAY).run();

  if (result.meta.changes === 1) {
    const row = await env.DB.prepare('SELECT id, score, level FROM scores WHERE session_id = ?1').bind(parsed.session).first();
    return json({ ok: true, id: row.id, score: row.score, level: row.level, top: await topTen(env, row.level) });
  }
  const session = await loadSession(env, parsed.session, now);
  if (!session) return fail('session_not_found', 404);
  if (session.round < ROUNDS) return fail('not_finished', 409);
  const existing = await env.DB.prepare('SELECT 1 FROM scores WHERE session_id = ?1').bind(parsed.session).first();
  if (existing) return fail('already_submitted', 409);
  return fail('rate_limited', 429);
}

const ROUTES = {
  'GET /api/leaderboard': leaderboard,
  'GET /api/preview': preview,
  'POST /api/session': createSession,
  'POST /api/guess': guess,
  'POST /api/score': submitScore,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/') return Response.redirect(`${url.origin}/play`, 302);
    if (pathname === '/play') return html(playPage(url.origin, env.X_HANDLE), PLAYER_CSP);

    const share = pathname.match(/^\/s(2?)\/(\d{1,2})$/);
    if (share && Number(share[2]) <= 10) {
      return html(sharePage(url.origin, Number(share[2]), env.X_HANDLE, share[1] ? 2 : 1), DEFAULT_CSP);
    }

    if (pathname.startsWith('/api/')) {
      const route = ROUTES[`${request.method} ${pathname}`];
      if (route) return route(request, env);
      const known = Object.keys(ROUTES).some((k) => k.endsWith(` ${pathname}`));
      return known ? fail('method_not_allowed', 405) : fail('not_found', 404);
    }

    return env.ASSETS.fetch(request);
  },
};
