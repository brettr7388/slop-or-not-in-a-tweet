import { assertTargetAllowed } from './local-only.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
assertTargetAllowed(BASE);
const { client } = await import('./api-client.mjs');
const api = client(BASE);

const PLAYERS = [['Mara', 9], ['pixelhound', 8], ['Jonah K', 7], ['tidepool', 6], ['Ruth B', 4]];
for (const [i, [name, score]] of PLAYERS.entries()) {
  const ip = `192.0.2.${10 + i}`;
  const session = await api.finishedSession(score, ip);
  const r = await api.post('/api/score', { session, name }, ip);
  if (r.status !== 200) throw new Error(`${name}: ${r.status} ${JSON.stringify(r.body)}`);
  console.log(`seeded ${name} ${r.body.score}/10`);
}

const L2 = [['Mara', 6], ['owlbear', 5], ['Jonah K', 3]];
for (const [i, [name, score]] of L2.entries()) {
  const ip = `192.0.2.${40 + i}`;
  const session = await api.finishedSession(score, ip, 2);
  const r = await api.post('/api/score', { session, name }, ip);
  if (r.status !== 200 || r.body.level !== 2) throw new Error(`${name}: ${r.status} ${JSON.stringify(r.body)}`);
  console.log(`seeded level 2 ${name} ${r.body.score}/10 AI spotted`);
}
