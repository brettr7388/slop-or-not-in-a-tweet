// Private stats: % fooled per image and score distributions per level. Joins the D1 `guesses` table
// with credits.json (repo-only), so the output contains the answer key. Do not publish it.
//   npm run stats                 local D1 (wrangler dev)
//   npm run stats -- --remote     the deployed D1 (needs `wrangler login`)
//   npm run stats -- --json       JSON instead of markdown
//   npm run stats -- --input f    format rows already fetched (JSON: { images: [...], scores: [...] })
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
export const IMAGE_SQL = 'SELECT image, level, COUNT(*) AS n, SUM(correct) AS correct FROM guesses GROUP BY image, level';
export const SCORE_SQL = 'SELECT level, score, COUNT(*) AS n FROM scores GROUP BY level, score';

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'slop-or-not', argv.includes('--remote') ? '--remote' : '--local', '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(out)[0].results;
}

const input = argv.includes('--input') ? JSON.parse(readFileSync(argv[argv.indexOf('--input') + 1], 'utf8')) : null;
const imageRows = input ? input.images : d1(IMAGE_SQL);
const scoreRows = input ? input.scores : d1(SCORE_SQL);
const credits = new Map(JSON.parse(readFileSync('credits.json', 'utf8')).map((c) => [c.file, c]));

const images = imageRows.map((r) => {
  const c = credits.get(r.image) ?? {};
  return { image: r.image, level: r.level, answer: c.answer, subject: c.subject, hard: Boolean(c.hard), too_perfect: Boolean(c.too_perfect),
    guesses: r.n, fooled_pct: Math.round((1000 * (r.n - r.correct)) / r.n) / 10 };
}).sort((a, b) => b.fooled_pct - a.fooled_pct || b.guesses - a.guesses);

const levels = {};
for (const level of [1, 2]) {
  const dist = Array(11).fill(0);
  for (const r of scoreRows) if (r.level === level) dist[r.score] = r.n;
  levels[level] = { games: dist.reduce((a, b) => a + b, 0), distribution: dist };
}
const total = images.reduce((a, r) => a + r.guesses, 0);

if (argv.includes('--json')) {
  console.log(JSON.stringify({ guesses: total, images, levels }, null, 2));
} else {
  console.log(`# Slop or Not stats (private: contains answers)\n\n${total} graded guesses.\n`);
  for (const level of [1, 2]) {
    console.log(`## Level ${level} scores (${levels[level].games} submitted)\n\n| score | ${[...Array(11).keys()].join(' | ')} |\n|${'---|'.repeat(12)}\n| games | ${levels[level].distribution.join(' | ')} |\n`);
  }
  console.log('## Most fooling images\n\n| image | level | answer | subject | tags | guesses | fooled |\n|---|---|---|---|---|---|---|');
  for (const r of images) console.log(`| ${r.image} | ${r.level} | ${r.answer} | ${r.subject} | ${[r.hard && 'hard', r.too_perfect && 'too perfect'].filter(Boolean).join(', ')} | ${r.guesses} | ${r.fooled_pct}% |`);
}
