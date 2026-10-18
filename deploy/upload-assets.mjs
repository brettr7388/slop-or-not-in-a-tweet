// Copies public/ into the D1 table `static_assets` over the Cloudflare REST API.
// Only needed for REST-API deploys that use deploy/entry.js (see README). Usage:
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... D1_DATABASE_ID=... node deploy/upload-assets.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, D1_DATABASE_ID: db } = process.env;
if (!token || !account || !db) throw new Error('Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID');
export const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
export const SCHEMA = 'CREATE TABLE IF NOT EXISTS static_assets (path TEXT PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL)';
const UPSERT = 'INSERT INTO static_assets (path, type, body) VALUES (?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET type = ?2, body = ?3';

async function query(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${sql.slice(0, 40)}: ${JSON.stringify(json.errors)}`);
}

await query(SCHEMA);
const root = 'public';
const files = readdirSync(root, { recursive: true }).filter((f) => statSync(join(root, f)).isFile());
for (const f of files) {
  await query(UPSERT, [`/${f}`, TYPES[extname(f)] ?? 'application/octet-stream', readFileSync(join(root, f)).toString('base64')]);
}
await query(`DELETE FROM static_assets WHERE path NOT IN (${files.map(() => '?').join(',')})`, files.map((f) => `/${f}`));
console.log(`uploaded ${files.length} files to static_assets`);
