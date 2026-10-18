// Background loop (public/audio/loop.mp3, made by scripts/build-audio.py) plus WebAudio-synthesized SFX.
// One AudioContext for the page. The loop is fetched and decoded once; nothing plays before the Play tap.
const LOOP_START = 0.25; // the file is periodic, so any 12 s window loops without a seam
const LOOP_LEN = 12;
const MUSIC_LEVEL = 0.32;
const KEY = 'slop-muted';

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, master = null, musicGain = null, loop = null, music = null, wantMusic = false;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

function status(state) {
  document.documentElement.dataset.audio = state;
}

function ensure() {
  if (ctx || !AC) return ctx;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  fetch('/audio/loop.mp3')
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
    .then((buf) => { loop = buf; if (wantMusic) startMusic(); })
    .catch(() => status('no-music'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else if (wantMusic) ctx.resume();
  });
  return ctx;
}

// Call from inside a tap handler: browsers only let audio start on a user gesture.
export function unlock() {
  if (!ensure()) return;
  if (ctx.state !== 'running') ctx.resume();
}

export function startMusic() {
  wantMusic = true;
  if (!ensure() || music || !loop) return;
  music = ctx.createBufferSource();
  music.buffer = loop;
  music.loop = true;
  music.loopStart = LOOP_START;
  music.loopEnd = LOOP_START + LOOP_LEN;
  music.connect(musicGain);
  music.start(0, LOOP_START);
  musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.6);
  status(muted ? 'muted' : 'playing');
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch {}
  if (ctx) master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.03);
  if (music) status(value ? 'muted' : 'playing');
}

function tone(type, from, to, start, dur, level, filter) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    osc.connect(lp);
    node = lp;
  }
  node.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const note = (m) => 440 * 2 ** ((m - 69) / 12);

const SFX = {
  tap: () => tone('sine', 700, 520, 0, 0.06, 0.12),
  // Level 2: the same sound for every answer, so it never hints at right or wrong.
  locked: () => { tone('triangle', 330, 240, 0, 0.14, 0.16, 1800); tone('sine', 165, 150, 0, 0.12, 0.1); },
  correct: () => { tone('triangle', note(76), note(76), 0, 0.12, 0.16); tone('triangle', note(83), note(83), 0.08, 0.2, 0.16); },
  wrong: () => tone('sawtooth', 240, 140, 0, 0.26, 0.12, 900),
  reveal: () => [72, 76, 79, 84].forEach((m, i) => tone('triangle', note(m), note(m), i * 0.07, 0.3, 0.12)),
  unlock: () => { [69, 73, 76, 81, 85].forEach((m, i) => tone('sine', note(m), note(m), i * 0.05, 0.35, 0.1)); tone('triangle', note(57), note(57), 0, 0.6, 0.08); },
  allAi: () => {
    tone('sine', 90, 38, 0, 0.9, 0.35);
    [57, 60, 64, 69].forEach((m, i) => tone('sawtooth', note(m), note(m), 0.05 + i * 0.03, 1.4, 0.05, 1200));
  },
};

export function sfx(name) {
  (window.__sfx ??= []).push(name); // read by the e2e tests
  if (!ctx || ctx.state === 'closed' || muted) return;
  SFX[name]?.();
}

// Create the context and start decoding the loop early (it stays suspended until a tap).
ensure();
status('ready');
