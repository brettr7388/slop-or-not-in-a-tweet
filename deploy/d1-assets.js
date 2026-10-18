// Fallback for deploys made over the Cloudflare REST API, where the Workers static-asset
// upload is not available. `deploy/upload-assets.mjs` copies public/ into the D1 table
// `static_assets`, and this shim serves it in place of the ASSETS binding.
// A normal `wrangler deploy` keeps using the real ASSETS binding and never touches this.
const LONG = 'public, max-age=86400';
const SHORT = 'public, max-age=300';

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
      return new Response(request.method === 'HEAD' ? null : bytes, {
        headers: {
          'content-type': row.type,
          'cache-control': /^\/(img|share|audio)\//.test(pathname) || pathname === '/card.png' ? LONG : SHORT,
          'x-content-type-options': 'nosniff',
        },
      });
    },
  };
}
