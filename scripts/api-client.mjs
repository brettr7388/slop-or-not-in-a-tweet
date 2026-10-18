import { DECK } from '../src/deck.js';

const ANSWER = new Map(DECK.map((d) => [`/${d.f}`, d.a]));
const HARD = new Set(DECK.filter((d) => d.h).map((d) => `/${d.f}`));
const flip = (a) => (a === 'ai' ? 'real' : 'ai');

export function client(base) {
  async function call(method, path, body, ip = '198.51.100.10') {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  const post = (path, body, ip) => call('POST', path, body, ip);

  async function finishedSession(correct, ip, level = 1) {
    const after = level === 2 ? await finishedSession(5, ip) : undefined;
    const s = await post('/api/session', { level, after }, ip);
    if (s.status !== 200) throw new Error(`session ${s.status} ${JSON.stringify(s.body)}`);
    for (let round = 0; round < 10; round++) {
      const truth = ANSWER.get(s.body.images[round]);
      const g = await post('/api/guess', { session: s.body.session, round, guess: round < correct ? truth : flip(truth) }, ip);
      if (g.status !== 200) throw new Error(`guess ${g.status} ${JSON.stringify(g.body)}`);
    }
    return s.body.session;
  }

  return { call, post, finishedSession, answerFor: (src) => ANSWER.get(src), isHard: (src) => HARD.has(src) };
}
