const ROUNDS = 10;
const LOCK_MS = 550;
const app = document.getElementById('app');
const framed = window.self !== window.top;
if (framed) document.documentElement.classList.add('framed');

document.addEventListener('click', (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor.getAttribute('href').startsWith('#')) return;
  event.preventDefault();
  window.open(anchor.href, '_blank', 'noopener');
}, true);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const label = (a) => (a === 'ai' ? 'AI' : 'real');

let preview = [];
let state = { phase: 'start' };

async function api(path, body) {
  const res = await fetch(path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

function preload(src) {
  if (src) new Image().src = src;
}

const MESSAGES = {
  name_not_allowed: 'Try another name.',
  bad_name: '1-16 letters or numbers.',
  rate_limited: 'Slow down.',
  already_submitted: 'Already saved.',
  session_not_found: 'Game expired.',
  locked: 'Finish a game first.',
};

async function start(level = 1) {
  level = Number(level) || 1;
  const after = level === 2 ? state.session : undefined;
  state = { phase: 'loading', level };
  render();
  const data = await api('/api/session', { level, after }).catch(() => null);
  if (!data?.ok) {
    state = { phase: 'start', error: MESSAGES[data?.error] ?? 'Try again.' };
    return render();
  }
  data.images.slice(0, 2).forEach(preload);
  state = { phase: 'guess', level, session: data.session, images: data.images, i: 0, score: 0, marks: [], result: null, top: null };
  render();
}

async function guess(choice) {
  if (state.phase !== 'guess' || state.pending) return;
  state = { ...state, pending: true };
  const data = await api('/api/guess', { session: state.session, round: state.i, guess: choice }).catch(() => null);
  if (!data?.ok) {
    state = { ...state, pending: false, error: MESSAGES[data?.error] ?? 'Tap again.' };
    return render();
  }
  preload(state.images[state.i + 2]);
  const mark = data.locked ? choice : data.correct ? 'good' : 'bad';
  state = {
    ...state, pending: false, error: null, phase: 'reveal', result: data,
    score: data.score ?? state.score, marks: [...state.marks, mark],
  };
  render();
  // Level 2: neutral "Locked in", then move on by itself. Nothing is revealed until the end.
  if (data.locked) setTimeout(next, LOCK_MS);
}

function next() {
  if (state.phase !== 'reveal') return;
  if (state.result?.done) {
    state = { ...state, phase: 'end' };
    loadLeaderboard();
  } else {
    state = { ...state, phase: 'guess', i: state.i + 1, result: null };
  }
  render();
}

const actions = { start, guess, next };

async function loadLeaderboard() {
  const data = await api(`/api/leaderboard?level=${state.level}`).catch(() => null);
  state = { ...state, top: data?.top ?? [] };
  const list = app.querySelector('.board ol');
  if (state.phase === 'end' && list) list.innerHTML = boardRows();
}

async function submitName(name) {
  state = { ...state, submitting: true, error: null };
  render();
  const data = await api('/api/score', { session: state.session, name }).catch(() => null);
  state = data?.ok
    ? { ...state, submitting: false, submitted: true, top: data.top, myId: data.id }
    : { ...state, submitting: false, error: MESSAGES[data?.error] ?? 'Not saved. Try again.' };
  render();
}

function header() {
  const inGame = state.phase === 'guess' || state.phase === 'reveal';
  const tag = state.level === 2 && state.phase !== 'start' ? '<span class="tag">Level 2</span>' : '';
  const round = inGame ? `<span>${state.i + 1}/${ROUNDS}</span>` : '';
  const score = inGame && state.level === 1 ? `<span class="pts">${state.score} pt${state.score === 1 ? '' : 's'}</span>` : '';
  return `<header class="bar"><strong class="logo">SLOP OR NOT</strong>${tag}${round}${score}</header>`;
}

function startView() {
  return `${header()}
  <section class="start">
    <div class="mosaic">${preview.map((src) => `<img src="${src}" alt="" loading="eager">`).join('')}</div>
    <div class="start-copy">
      <h1>AI or Real?</h1>
      <p>10 images. Tap a guess.</p>
      <button class="btn btn-primary btn-big" data-action="start" ${state.phase === 'loading' ? 'disabled' : ''}>Play</button>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
    </div>
  </section>`;
}

function overlay(r) {
  if (r.locked) return '<div class="reveal lock"><div class="verdict">Locked in</div></div>';
  const credit = r.credit
    ? `Photo: ${esc(r.credit.by)}, ${esc(r.credit.lic)}, <a href="${esc(r.credit.src)}">Wikimedia Commons</a>`
    : 'Made by AI for this game';
  return `<div class="reveal ${r.correct ? 'good' : 'bad'}">
      <div class="verdict">${r.correct ? 'Yep' : 'Nope'}, ${label(r.answer)}</div>
      <div class="credit">${credit}</div>
    </div>`;
}

function roundView() {
  const r = state.result;
  const revealed = state.phase === 'reveal';
  const tone = revealed ? (r.locked ? 'lock' : r.correct ? 'good' : 'bad') : '';
  const controls = revealed && !r.locked
    ? `<button class="btn btn-primary" data-action="next">${r.done ? 'Score' : 'Next'}</button>`
    : `<button class="btn btn-ai" data-action="guess" data-arg="ai" ${revealed ? 'disabled' : ''}>AI</button>
       <button class="btn btn-real" data-action="guess" data-arg="real" ${revealed ? 'disabled' : ''}>Real</button>`;
  return `${header()}
  <section class="round">
    <figure class="frame ${tone}"><img src="${state.images[state.i]}" alt="AI or real?">${revealed ? overlay(r) : ''}</figure>
    <div class="controls">${controls}</div>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}
  </section>`;
}

function boardRows() {
  if (state.top === null) return '<li class="muted">Loading...</li>';
  if (state.top.length === 0) return '<li class="muted">Be first.</li>';
  return state.top.map((r, i) => `<li class="${r.id === state.myId ? 'me' : ''}"><span>${i + 1}. ${esc(r.name)}</span><b>${r.score}</b></li>`).join('');
}

function dots() {
  // Level 2 marks are the player's calls (all answers were AI): "ai" = spotted, "real" = fooled.
  const cls = (m) => (m === 'good' || m === 'ai' ? 'good' : 'bad');
  return `<div class="dots" aria-hidden="true">${state.marks.map((m) => `<i class="${cls(m)}"></i>`).join('')}</div>`;
}

function endView() {
  const l2 = state.level === 2;
  const fooled = ROUNDS - state.score;
  const n = l2 ? fooled : state.score;
  const shareUrl = `${location.origin}/s${l2 ? '2' : ''}/${n}`;
  const text = l2 ? `Fooled ${n}/10. Can you?` : `I got ${n}/10. Can you?`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
  const form = state.submitted
    ? '<p class="saved">Saved</p>'
    : `<form class="name-form" data-form="name">
        <input name="name" maxlength="16" placeholder="Nickname" autocomplete="off" required aria-label="Nickname">
        <button class="btn btn-primary" ${state.submitting ? 'disabled' : ''}>Save</button>
      </form>
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ''}`;
  const headline = l2
    ? `<p class="kicker">All 10 were AI.</p>
       <div class="big-score">${fooled}/10</div>
       <p class="tagline">You called ${fooled} real.</p>`
    : `<div class="big-score">${state.score}/10</div>`;
  return `${header()}
  <section class="end ${l2 ? 'l2' : ''}">
    <div class="result">
      ${headline}
      ${dots()}
      ${form}
      <div class="row">
        <a class="btn btn-share" href="${esc(intent)}">Share</a>
        <button class="btn" data-action="start" data-arg="1">Again</button>
        ${l2 ? '' : '<button class="btn btn-l2" data-action="start" data-arg="2">Level 2</button>'}
      </div>
    </div>
    <div class="board">
      <h2>${l2 ? 'Level 2 · AI spotted' : 'Top 10'}</h2>
      <ol>${boardRows()}</ol>
    </div>
  </section>`;
}

function render() {
  const view = { start: startView, loading: startView, guess: roundView, reveal: roundView, end: endView }[state.phase];
  app.dataset.phase = state.phase;
  app.dataset.level = state.level ?? 1;
  app.innerHTML = view();
}

app.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && !button.disabled) actions[button.dataset.action](button.dataset.arg);
});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = new FormData(event.target).get('name')?.toString().trim();
  if (name) submitName(name);
});

api('/api/preview')
  .then((data) => { preview = data.images ?? []; })
  .catch(() => {})
  .finally(render);
