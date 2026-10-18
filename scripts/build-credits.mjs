// Writes CREDITS.md from credits.json. Repo-only: neither file is served by the game.
import { readFileSync, writeFileSync } from 'node:fs';

const credits = JSON.parse(readFileSync('credits.json', 'utf8'));
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const real = credits.filter((c) => c.answer === 'real');
const ai = credits.filter((c) => c.answer === 'ai');
const hard = ai.filter((c) => c.hard);

const lines = [
  '# Credits',
  '',
  `Every image in the game: ${real.length} real photos from Wikimedia Commons and ${ai.length} AI images made for this project (${hard.length} of them in the hard pool).`,
  'This file and `credits.json` hold the answer key, so they live in the repo only. The game never serves them.',
  '',
  '## Real photos',
  '',
  'All are CC0 or public domain on Wikimedia Commons, with no identifiable people. Photos marked *too perfect* were picked because they look AI-made.',
  '',
  '| File | Subject | Author | License | Source |',
  '| --- | --- | --- | --- | --- |',
  ...real.map((c) => `| \`${c.file}\` | ${cell(c.subject)}${c.too_perfect ? ' *(too perfect)*' : ''} | ${cell(c.author)} | ${cell(c.license)} | [Commons](${c.source}) |`),
  '',
  '## AI images',
  '',
  'Generated for this project with Grok Imagine and dedicated to the public domain (CC0 1.0). Images in the hard pool are marked *hard*: Level 2 uses only these, and Level 1 shows 2-3 per game.',
  '',
  '| File | Subject | Prompt |',
  '| --- | --- | --- |',
  ...ai.map((c) => `| \`${c.file}\` | ${cell(c.subject)}${c.hard ? ' *(hard)*' : ''} | ${cell(c.prompt)} |`),
  '',  '## Audio',
  '',
  'No third-party audio. Everything is made by this project and dedicated to the public domain (CC0 1.0).',
  '',
  '- `public/audio/loop.mp3`: the lo-fi music bed from lab\'s trailer (electric piano chords, bass, drums, vinyl hiss), made by this project: synthesized from scratch with numpy by `scripts/build-audio.py`, then cut into a seamless 24-second loop (two 12-second cycles, 80 ms crossfade at the loop point) by `scripts/build-loop.py` from the trailer\'s 48 kHz bed, encoded to an 80 kbps mono MP3 with no metadata.',
  '- Sound effects (tap, correct, wrong, score reveal, Level 2 unlock, "All 10 were AI." reveal and the neutral Level 2 "locked in"): synthesized in the browser with WebAudio oscillators in `public/audio.js`. No files.',
  '',
];
writeFileSync('CREDITS.md', lines.join('\n'));
console.log(`CREDITS.md: ${real.length} real, ${ai.length} ai (${hard.length} hard)`);
