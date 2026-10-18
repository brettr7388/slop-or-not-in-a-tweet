const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalUrl(raw) {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function assertTargetAllowed(baseUrl, { argv = process.argv, env = process.env } = {}) {
  if (isLocalUrl(baseUrl)) return;
  if (argv.includes('--allow-remote') || env.E2E_ALLOW_REMOTE === '1') return;
  console.error(
    `Refusing to run against ${baseUrl}: this script writes leaderboard rows.\n` +
      'Point BASE_URL at a local wrangler dev, or pass --allow-remote (or E2E_ALLOW_REMOTE=1) if you really mean it.',
  );
  process.exit(2);
}
