// Cloud-save Pages Function: roundtrip, validation, throttle, 503 fallback.
//
//   node tests/no_room_for_heroes_cloud.test.mjs   (or: npm run test:boss)
import { onRequestGet, onRequestPost } from '../functions/api/save.js';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('cloud-save fn');

function mockKV() {
  const store = new Map();
  return { async get(k) { return store.has(k) ? store.get(k) : null; },
           // real Cloudflare KV rejects expirationTtl < 60 (the whole request
           // then 500s) — enforce it here so a regression can't pass the suite
           async put(k, v, opt) {
             if (opt && opt.expirationTtl != null && opt.expirationTtl < 60)
               throw new Error('expirationTtl must be at least 60');
             store.set(k, String(v));
           }, _store: store };
}
const post = (env, body, ip) => onRequestPost({ env,
  request: new Request('http://x/api/save', { method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || '1.1.1.1' },
    body: JSON.stringify(body) }) });
const get = (env, code) => onRequestGet({ env,
  request: new Request('http://x/api/save?code=' + encodeURIComponent(code)) });

t.ok((await onRequestGet({ env: {}, request: new Request('http://x/api/save?code=AAAA-AAAA') })).status === 503,
  'no KV binding → 503');

const env = { board: mockKV() };   // lowercase binding accepted, like the leaderboard
const save = { v: 1, runes: { points: 7, kills: 99, asc: 1 }, town: { res: { wood: 3 }, built: { inn: 1 } } };

// backup without a code → a fresh code is minted
let r = await post(env, { data: save });
const { code } = await r.json();
t.ok(r.status === 200 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code), 'new sync code minted: ' + code);

// roundtrip
r = await get(env, code);
const back = (await r.json()).data;
t.ok(r.status === 200 && back.runes.kills === 99 && back.town.built.inn === 1, 'restore returns the exact save');

// updating under the same code from another IP overwrites
r = await post(env, { code, data: { ...save, runes: { ...save.runes, kills: 150 } } }, '2.2.2.2');
t.ok((await r.json()).code === code, 'update keeps the code');
r = await get(env, code);
t.ok((await r.json()).data.runes.kills === 150, 'update overwrites the backup');

// validation & throttle
t.ok((await post(env, { data: save })).status === 429, 'rapid same-IP write throttled');
t.ok((await post(env, { data: { nope: 1 } }, '3.3.3.3')).status === 400, 'malformed save rejected');
t.ok((await post(env, { code: 'lol', data: save }, '4.4.4.4')).status === 400, 'malformed code rejected');
t.ok((await get(env, 'ZZZZ-ZZZZ')).status === 404, 'unknown code → 404');
t.ok((await get(env, '<script>')).status === 400, 'garbage code → 400');

t.done();
