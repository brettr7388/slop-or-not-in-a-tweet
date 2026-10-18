// Copies public/ into the LOCAL D1 table static_assets (for wrangler.d1-assets.toml). Never remote.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg' };
const files = readdirSync('public', { recursive: true }).filter((f) => statSync(join('public', f)).isFile());
const sql = ['CREATE TABLE IF NOT EXISTS static_assets (path TEXT PRIMARY KEY, type TEXT NOT NULL, body TEXT NOT NULL);', 'DELETE FROM static_assets;']
  .concat(files.flatMap((f) => {
    // Local SQLite caps one statement at ~100 KB, so long bodies are appended in chunks.
    const b64 = readFileSync(join('public', f)).toString('base64');
    const parts = b64.match(/.{1,60000}/gs) ?? [''];
    return [`INSERT INTO static_assets (path, type, body) VALUES ('/${f}', '${TYPES[extname(f)] ?? 'application/octet-stream'}', '${parts[0]}');`,
      ...parts.slice(1).map((c) => `UPDATE static_assets SET body = body || '${c}' WHERE path = '/${f}';`)];
  }));
const file = join(mkdtempSync(join(tmpdir(), 'assets-')), 'assets.sql');
writeFileSync(file, sql.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'slop-or-not', '--local', '-c', 'wrangler.d1-assets.toml', '--file', file], { stdio: 'inherit' });
console.log(`loaded ${files.length} files into the local static_assets table`);
