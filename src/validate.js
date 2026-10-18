export const NAME_MAX = 16;

const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigg', 'faggot', 'retard', 'pussy', 'penis',
  'vagina', 'porn', 'nazi', 'hitler', 'wank', 'twat', 'bastard', 'asshole', 'kike', 'chink', 'tranny',
  'jizz', 'boob', 'dildo', 'blowjob', 'motherf',
];
const SHORT_WORDS = new Set([
  'ass', 'fck', 'fuk', 'fk', 'wtf', 'kys', 'cum', 'sex', 'tit', 'tits', 'fag', 'kkk', 'nig', 'anal',
  'nude', 'dick', 'cock', 'rape', 'spic', 'dyke', 'hoe', 'milf', 'stfu',
]);
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i' };

const fold = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c);

export function isProfane(name) {
  const folded = fold(name);
  const squashed = folded.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const joined = folded.replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => joined.includes(w) || squashed.includes(w.replace(/(.)\1+/g, '$1')))) return true;
  if (SHORT_WORDS.has(joined) || SHORT_WORDS.has(squashed)) return true;
  return folded.split(/[^a-z]+/).some((t) => SHORT_WORDS.has(t) || SHORT_WORDS.has(t.replace(/(.)\1+/g, '$1')));
}

export const ROUNDS = 10;
const SESSION_RE = /^[0-9a-f]{32}$/;

export function parseName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'bad_name' };
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || [...name].length > NAME_MAX) return { ok: false, error: 'bad_name' };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return { ok: false, error: 'bad_name' };
  if (isProfane(name)) return { ok: false, error: 'name_not_allowed' };
  return { ok: true, name };
}

export function parseSessionId(raw) {
  return typeof raw === 'string' && SESSION_RE.test(raw) ? raw : null;
}

export function parseGuess(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const session = parseSessionId(body.session);
  if (!session) return { ok: false, error: 'bad_session' };
  if (!Number.isInteger(body.round) || body.round < 0 || body.round >= ROUNDS) return { ok: false, error: 'bad_round' };
  if (body.guess !== 'ai' && body.guess !== 'real') return { ok: false, error: 'bad_guess' };
  return { ok: true, session, round: body.round, guess: body.guess };
}

export function parseSubmission(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const session = parseSessionId(body.session);
  if (!session) return { ok: false, error: 'bad_session' };
  const name = parseName(body.name);
  return name.ok ? { ok: true, session, name: name.name } : name;
}

function shuffle(idx, random) {
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function pickDeck(size, count, random = Math.random) {
  return shuffle(Array.from({ length: size }, (_, i) => i), random).slice(0, count);
}

export const LEVELS = [1, 2];

export function parseLevel(body) {
  const level = body?.level ?? 1;
  return LEVELS.includes(level) ? level : null;
}

// Level 1: a normal mixed deck that always includes 2-3 images from the hard AI pool.
// Level 2: ten images, every one from the hard AI pool (the player is never told).
export function pickLevelDeck(deck, level, random = Math.random) {
  const hard = [], rest = [];
  deck.forEach((card, i) => (card.h ? hard : rest).push(i));
  if (level === 2) return shuffle(hard, random).slice(0, ROUNDS);
  const nHard = 2 + (random() < 0.5 ? 1 : 0);
  const picked = [...shuffle(hard, random).slice(0, nHard), ...shuffle(rest, random).slice(0, ROUNDS - nHard)];
  return shuffle(picked, random);
}
