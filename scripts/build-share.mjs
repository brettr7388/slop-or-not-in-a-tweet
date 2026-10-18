import sharp from 'sharp';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';

const W = 1200, H = 900;
const credits = JSON.parse(readFileSync('credits.json', 'utf8'));
const pick = (subject, answer) => credits.find((c) => c.subject === subject && c.answer === answer).file;
const strip = [pick('lighthouse', 'real'), pick('old barn', 'ai'), pick('beach sunset', 'ai'), pick('beach sunset', 'real')].map((f) => `public/${f}`);
// Level 2 cards show hard-pool shots without saying what they are.
const hardStrip = credits.filter((c) => c.hard).slice(0, 4).map((c) => `public/${c.file}`);

function svg(kicker, headline, sub, accent) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#101014"/>
  <text x="600" y="110" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="46" fill="#ffd23f" letter-spacing="4">${kicker}</text>
  <text x="600" y="300" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="${headline.length > 12 ? 112 : 140}" fill="${accent}">${headline}</text>
  <text x="600" y="400" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="60" fill="#ffffff">${sub}</text>
  <text x="600" y="850" text-anchor="middle" font-family="DejaVu Sans" font-size="38" fill="#8a8aa0">Tap to play</text>
</svg>`);
}

async function render(out, tilesFrom, ...text) {
  const tiles = await Promise.all(tilesFrom.map((p) => sharp(p).resize(270, 202).jpeg().toBuffer()));
  await sharp(svg(...text))
    .composite(tiles.map((input, i) => ({ input, top: 500, left: 30 + i * 290 })))
    .png({ compressionLevel: 9, palette: true })
    .toFile(out);
}

rmSync('public/share', { recursive: true, force: true });
mkdirSync('public/share', { recursive: true });
await render('public/card.png', strip, 'SLOP OR NOT', 'AI or Real?', '10 taps.', '#ffffff');
for (let n = 0; n <= 10; n++) {
  await render(`public/share/${n}.png`, strip, 'SLOP OR NOT', `I got ${n}/10`, 'Can you?', '#ffffff');
  await render(`public/share/l2-${n}.png`, hardStrip, 'SLOP OR NOT · LEVEL 2', `Fooled ${n}/10`, 'Can you?', '#ff6b6b');
}
console.log('share images done');
