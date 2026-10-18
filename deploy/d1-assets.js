// Fallback for deploys made over the Cloudflare REST API, where the Workers static-asset
// upload is not available. `deploy/upload-assets.mjs` copies public/ into the D1 table
// `static_assets`, and this shim serves it in place of the ASSETS binding.
// A normal `wrangler deploy` keeps using the real ASSETS binding and never touches this.
// Supports HEAD and single byte-range requests (206), which iOS Safari needs for <audio>.
const LONG = 'public, max-age=86400';
const SHORT = 'public, max-age=300';

export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // suffix: last N bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

export function d1Assets(db) {
  return {
    async fetch(request) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      const { pathname } = new URL(request.url);
      const row = await db.prepare('SELECT type, body FROM static_assets WHERE path = ?1').bind(pathname).first();
      if (!row) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      const bin = atob(row.body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const headers = {
        'content-type': row.type,
        'cache-control': /^\/(img|share|audio)\//.test(pathname) || pathname === '/card.png' ? LONG : SHORT,
        'x-content-type-options': 'nosniff',
        'accept-ranges': 'bytes',
      };
      const range = request.headers.get('range') ? parseRange(request.headers.get('range'), bytes.length) : null;
      if (range === 'unsatisfiable') {
        return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${bytes.length}` } });
      }
      if (range) {
        const part = bytes.subarray(range.start, range.end + 1);
        return new Response(request.method === 'HEAD' ? null : part, {
          status: 206,
          headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${bytes.length}`, 'content-length': String(part.length) },
        });
      }
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...headers, 'content-length': String(bytes.length) } });
    },
  };
}
