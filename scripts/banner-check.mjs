// The reveal banner must hold its text fully (no clipping) and place it the same way for Yep and Nope.
export async function bannerGeometry(page, { long = false } = {}) {
  return page.evaluate((long) => {
    const reveal = document.querySelector('.reveal');
    const verdict = reveal.querySelector('.verdict');
    const original = verdict.textContent;
    if (long) verdict.textContent = 'Nope, real. This one fools almost everybody, really';
    const r = reveal.getBoundingClientRect(), v = verdict.getBoundingClientRect(), f = reveal.closest('.frame').getBoundingClientRect();
    const cs = getComputedStyle(reveal);
    const out = {
      tone: reveal.classList.contains('good') ? 'good' : reveal.classList.contains('bad') ? 'bad' : 'lock',
      inset: Math.round(v.top - r.top), padTop: cs.paddingTop, lines: Math.round(v.height / parseFloat(getComputedStyle(verdict).lineHeight)),
      fits: v.top >= r.top && v.bottom <= r.bottom + 0.5 && r.top >= f.top - 0.5 && reveal.scrollHeight <= reveal.clientHeight + 1,
      transform: cs.transform,
    };
    verdict.textContent = original;
    return out;
  }, long);
}

export function assertBanners(assert, samples, where) {
  for (const s of samples) assert.ok(s.fits, `${where}: ${s.tone} banner text not clipped ${JSON.stringify(s)}`);
  const good = samples.find((s) => s.tone === 'good' && s.lines === 1), bad = samples.find((s) => s.tone === 'bad' && s.lines === 1);
  if (good && bad) assert.equal(bad.inset, good.inset, `${where}: Nope text sits exactly like Yep`);
  return { good, bad };
}
