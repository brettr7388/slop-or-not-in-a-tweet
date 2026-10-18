export const PLAYER_CSP =
  "frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com";
export const DEFAULT_CSP = "frame-ancestors 'self'";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function cardTags({ origin, title, description, image, pageUrl, site }) {
  const tags = {
    'twitter:card': 'player',
    ...(site ? { 'twitter:site': site } : {}),
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': image,
    'twitter:player': `${origin}/play`,
    'twitter:player:width': '640',
    'twitter:player:height': '480',
  };
  const og = {
    'og:type': 'website',
    'og:title': title,
    'og:description': description,
    'og:image': image,
    'og:image:width': '1200',
    'og:image:height': '900',
    'og:url': pageUrl,
  };
  return [
    ...Object.entries(tags).map(([k, v]) => `<meta name="${k}" content="${esc(v)}">`),
    ...Object.entries(og).map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`),
  ].join('\n    ');
}

export function playPage(origin, site) {
  const title = 'Slop or Not: AI or Real?';
  const description = '10 images. AI or Real? Tap to play.';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${cardTags({ origin, title, description, image: `${origin}/card.png`, pageUrl: `${origin}/play`, site })}
    <link rel="stylesheet" href="/style.css">
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script src="/app.js" type="module"></script>
  </body>
</html>`;
}

// Level 1 shares the score; Level 2 shares how many hard AI images the player called real.
export function sharePage(origin, n, site, level = 1) {
  const title = level === 2 ? `Fooled ${n}/10. Can you?` : `I got ${n}/10. Can you?`;
  const description = 'AI or Real? 10 taps.';
  const image = level === 2 ? `${origin}/share/l2-${n}.png` : `${origin}/share/${n}.png`;
  const pageUrl = `${origin}/s${level === 2 ? '2' : ''}/${n}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${cardTags({ origin, title, description, image, pageUrl, site })}
    <link rel="stylesheet" href="/style.css">
  </head>
  <body class="share">
    <main class="share-page">
      <img src="${esc(image.slice(origin.length))}" alt="${esc(title)}" width="600" height="450">
      <a class="btn btn-primary" href="/play">Play</a>
    </main>
  </body>
</html>`;
}
