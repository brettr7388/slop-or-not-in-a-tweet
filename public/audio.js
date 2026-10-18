// Music: a looping <audio> element (public/audio/loop.mp3, built by scripts/build-loop.py from the trailer's bed).
// SFX: synthesized with WebAudio.
//
// Why the music is an <audio> element and not WebAudio: on iPhone, Web Audio alone is treated as
// "ambient" sound, so the ring/silent switch mutes it, and in-app browsers (X) behave the same way.
// A playing media element puts the page in the "playback" audio session, which plays with the switch
// on silent and lets the WebAudio effects through too. Everything starts synchronously inside a tap
// (touchend / pointerup / click), never after an await, and nothing is created before the first tap.
const KEY = 'slop-muted';
const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, master = null, music = null, wantMusic = false, primed = false;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

function status(state) {
  document.documentElement.dataset.audio = state;
}

function element() {
  if (music) return music;
  music = new Audio();
  music.loop = true;
  music.preload = 'auto';
  music.setAttribute('playsinline', '');
  music.muted = muted;
  music.addEventListener('playing', () => status(muted ? 'muted' : 'playing'));
  music.addEventListener('error', () => status('no-music'));
  music.src = '/audio/loop.mp3';
  return music;
}

function context() {
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

function playMusic() {
  const m = element();
  if (!m.paused) return;
  const p = m.play();
  if (p) p.catch(() => status('blocked'));
}

// Call from inside a tap handler. Safe to call many times.
export function unlock() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (context()) {
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!primed) { // a one-sample silent buffer started in the gesture unlocks WebAudio on older iOS
      primed = true;
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  }
  if (wantMusic && !muted) playMusic();
}

export function startMusic() {
  wantMusic = true;
  unlock();
}

export function isMuted() {
  return muted;
}

export function isPlaying() {
  return !!music && !music.paused;
}

export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch {}
  if (master) master.gain.value = value ? 0 : 1;
  if (music) music.muted = value;
  if (value) status(music ? 'muted' : 'ready');
  else { wantMusic = true; unlock(); if (music && !music.paused) status('playing'); }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { music?.pause(); ctx?.suspend().catch(() => {}); }
  else if (wantMusic && !muted) { ctx?.resume().catch(() => {}); music?.play().catch(() => {}); }
});

// Read by the tests.
window.__audio = () => ({
  ctx: ctx?.state ?? null,
  master: master ? master.gain.value : null,
  music: music && { paused: music.paused, time: music.currentTime, muted: music.muted, volume: music.volume, ready: music.readyState },
  muted,
});

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

status('ready');
