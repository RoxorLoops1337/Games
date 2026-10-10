/* =====================================================================
   Battle Call: the server. One Cloudflare Worker, one Durable Object per event.
   =====================================================================
   Why a Durable Object and not KV: a hall of 200+ phones all voting in the same ten seconds is a
   read-modify-write race on a counter, and KV would silently drop votes. A Durable Object runs one
   request at a time against its own memory, so every vote, bet and payout is counted exactly once,
   and it can push every change to every phone over a WebSocket (hibernation API: it costs nothing
   while the hall is quiet).

   All the rules live in ../engine.js (pure, tested). This file is plumbing: accounts and tokens,
   persistence, the WebSocket fan-out, photos, and a small HTTP API.

   Routes (all under /api, CORS open so the Pages-hosted app can call a workers.dev server):
     POST /api/create                    { name, size, password, key? } -> { code, hostToken }
     GET  /api/e/<code>/info             public: does it exist, what is it called
     POST /api/e/<code>/register         { name, password, device } -> { token }
     POST /api/e/<code>/login            { name, password }         -> { token }
     POST /api/e/<code>/hostlogin        { password }               -> { hostToken }
     GET  /api/e/<code>/ws               the live socket (hello, then actions)
     GET  /api/e/<code>/state            one-shot snapshot (polling fallback)
     POST /api/e/<code>/act              one action (HTTP fallback)
     GET  /api/e/<code>/photo/<bbId>     a beatboxer's picture (immutable, cached for a year)
     PUT  /api/e/<code>/photo/<bbId>     organiser uploads it
     GET  /api/e/<code>/export           organiser: the whole result as JSON
     POST /api/e/<code>/destroy          organiser: delete the event
   ===================================================================== */
import * as E from '../engine.js';
import { nameKey, cleanName } from '../js/shared.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;
const PBKDF2_ITER = 12000; // a party game, not a bank: keeps a rush of sign-ups cheap
const MAX_PHOTO = 160 * 1024;
const LIVE_MS = 700, BOARD_MS = 2500, HOST_MS = 2000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, x-host',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-max-age': '86400',
};
const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });
const err = (msg, status = 400) => json({ ok: false, err: msg }, status);

/* ------------------------------------------------------------ crypto */
const enc = new TextEncoder();
const b64u = (buf) => {
  let s = '';
  for (const c of new Uint8Array(buf)) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const randomToken = (n = 24) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (s) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(String(s))));
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return b64u(bits);
}
const safeEq = (a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const makeCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
};
const cleanCode = (raw) => {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === CODE_LEN && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
};

/* ------------------------------------------------------------ the Worker */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Battle Call server is running. Open the app and point it at this address.', { headers: { 'content-type': 'text/plain' } });
    }
    if (url.pathname === '/api/ping') return json({ ok: true, app: 'battle-call' });

    if (url.pathname === '/api/create' && request.method === 'POST') {
      let b; try { b = await request.json(); } catch (_) { return err('Bad request'); }
      if (env.CREATE_KEY && b.key !== env.CREATE_KEY) return err('Creating events needs the organiser key', 403);
      for (let tries = 0; tries < 5; tries++) {
        const code = makeCode();
        const stub = env.EVENT.get(env.EVENT.idFromName(code));
        const r = await stub.fetch('https://do/init', { method: 'POST', body: JSON.stringify({ code, name: b.name, size: b.size, password: b.password }) });
        if (r.status !== 409) return withCors(r);
      }
      return err('Could not make an event code, try again', 500);
    }

    const m = /^\/api\/e\/([A-Za-z0-9]{3,12})(\/.*)?$/.exec(url.pathname);
    if (!m) return err('Not found', 404);
    const code = cleanCode(m[1]);
    if (!code) return err('No event with that code', 404);
    const stub = env.EVENT.get(env.EVENT.idFromName(code));
    if (m[2] === '/init') return err('Not found', 404); // creating goes through /api/create only
    const inner = new Request('https://do' + (m[2] || '/') + url.search, request);
    const res = await stub.fetch(inner);
    return res.status === 101 ? res : withCors(res);
  },
};

function withCors(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}

/* ------------------------------------------------------------ the Durable Object */
export class Event {
  constructor(state, env) {
    this.ctx = state;
    this.env = env;
    this.S = null;
    this.tokIdx = new Map();   // token hash -> user key
    this.hostTk = new Set();   // organiser token hashes
    this.host = null;          // { s, h }
    this.pending = new Set();  // nicknames being created (password hashing is async)
    this.fails = new Map();    // ip -> [timestamps] of wrong passwords
    this.rate = new Map();     // key -> [timestamps] of actions
    this.timers = {};
    this.sent = { meta: 0 };
    try {
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    } catch (_) { /* tests */ }
    state.blockConcurrencyWhile(() => this.load());
  }

  /* ---------- persistence ---------- */
  async load() {
    const st = this.ctx.storage;
    const ev = await st.get('ev');
    if (!ev) return;
    ev.markets = {};
    const S = E.newState(ev);
    for (const [, m] of await st.list({ prefix: 'mk:' })) ev.markets[m.id] = m;
    for (const [, u] of await st.list({ prefix: 'u:' })) S.users.set(u.key, u);
    for (const [, l] of await st.list({ prefix: 'lg:' })) S.ledger.set(l.ref, l);
    this.host = await st.get('host');
    this.S = S;
    this.hostTk = new Set((this.host && this.host.tk) || []);
    for (const u of S.users.values()) for (const h of u.tk || []) this.tokIdx.set(h, u.key);
  }

  /** Write what the last action changed, then tell everybody who needs to know. */
  async commit() {
    const S = this.S, d = S.dirty, st = this.ctx.storage;
    S.dirty = E.blankDirty();
    if (d.meta) S.ev.rev++;
    const puts = {}, dels = [];
    if (d.ev) { const { markets, ...core } = S.ev; puts.ev = core; }
    for (const id of d.mk) if (S.ev.markets[id]) puts['mk:' + id] = S.ev.markets[id];
    for (const id of d.delMk) dels.push('mk:' + id);
    for (const k of d.users) if (S.users.has(k)) puts['u:' + k] = S.users.get(k);
    for (const k of d.delUsers) dels.push('u:' + k);
    for (const r of d.lg) { if (S.ledger.has(r)) puts['lg:' + r] = S.ledger.get(r); else dels.push('lg:' + r); }
    for (const id of d.delPhotos) dels.push('ph:' + id);
    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 120) {
      const chunk = {};
      for (const k of keys.slice(i, i + 120)) chunk[k] = puts[k];
      await st.put(chunk);
    }
    for (let i = 0; i < dels.length; i += 120) await st.delete(dels.slice(i, i + 120));
    this.fan(d);
  }

  /* ---------- sockets ---------- */
  sockets() { return this.ctx.getWebSockets(); }
  att(ws) { try { return ws.deserializeAttachment() || { r: 's' }; } catch (_) { return { r: 's' }; } }
  send(ws, o) { try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (_) { /* gone */ } }

  fan(d) {
    const S = this.S, all = this.sockets();
    if (d.meta) { const s = JSON.stringify({ t: 'meta', ...E.metaOf(S) }); for (const ws of all) this.send(ws, s); }
    if (d.users.size) {
      const keys = d.users;
      for (const ws of all) {
        const a = this.att(ws);
        if (a.r === 'u' && keys.has(a.k) && S.users.has(a.k)) this.send(ws, { t: 'me', ...E.meOf(S, S.users.get(a.k)) });
      }
    }
    if (d.live) this.later('live', LIVE_MS, () => this.pushLive());
    if (d.board) this.later('board', BOARD_MS, () => this.pushBoard());
    if (d.host) this.later('host', HOST_MS, () => this.pushHost());
  }

  later(name, ms, fn) {
    if (this.timers[name]) return;
    this.timers[name] = setTimeout(() => { this.timers[name] = null; try { fn(); } catch (e) { console.log(name, e && e.stack); } }, ms);
  }

  pushLive() {
    if (!this.S) return;
    const all = this.sockets(), on = all.length;
    const pub = JSON.stringify({ t: 'live', ...E.liveOf(this.S, on, false) });
    const hst = JSON.stringify({ t: 'live', ...E.liveOf(this.S, on, true) });
    for (const ws of all) this.send(ws, this.att(ws).r === 'h' ? hst : pub);
  }
  pushBoard() {
    if (!this.S) return;
    const s = JSON.stringify({ t: 'board', rows: E.boardOf(this.S) });
    for (const ws of this.sockets()) this.send(ws, s);
    // ranks changed too
    for (const ws of this.sockets()) { const a = this.att(ws); if (a.r === 'u' && this.S.users.has(a.k)) this.send(ws, { t: 'me', ...E.meOf(this.S, this.S.users.get(a.k)) }); }
  }
  pushHost() {
    if (!this.S) return;
    const s = JSON.stringify({ t: 'host', ...E.hostOf(this.S) });
    for (const ws of this.sockets()) if (this.att(ws).r === 'h') this.send(ws, s);
  }

  snapshot(ws, a) {
    const S = this.S;
    this.send(ws, { t: 'meta', ...E.metaOf(S) });
    this.send(ws, { t: 'live', ...E.liveOf(S, this.sockets().length, a.r === 'h') });
    this.send(ws, { t: 'board', rows: E.boardOf(S) });
    if (a.r === 'u' && S.users.has(a.k)) this.send(ws, { t: 'me', ...E.meOf(S, S.users.get(a.k)) });
    if (a.r === 'h') this.send(ws, { t: 'host', ...E.hostOf(S) });
  }

  async webSocketMessage(ws, raw) {
    if (!this.S) { this.send(ws, { t: 'gone' }); return; }
    if (typeof raw !== 'string' || raw.length > 65536) return;
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    if (m.t === 'hello') {
      const a = await this.authFor(m.tk, m.ht);
      ws.serializeAttachment(a);
      if (a.bad) this.send(ws, { t: 'authfail' });
      this.snapshot(ws, a);
      this.later('live', 300, () => this.pushLive());
      return;
    }
    if (m.t !== 'a') return;
    const a = this.att(ws);
    const r = await this.act(a, m, (a.r === 'u' ? a.k : a.r) + ':ws');
    this.send(ws, { ...r, t: 'r', id: m.id });
  }
  webSocketClose(ws) { try { ws.close(); } catch (_) { /* already */ } this.S && this.later('live', 500, () => this.pushLive()); }
  webSocketError(ws) { this.webSocketClose(ws); }

  /* ---------- auth ---------- */
  async authFor(tk, ht) {
    if (ht) { const h = await sha(ht); if (this.hostTk.has(h)) return { r: 'h' }; return { r: 's', bad: 1 }; }
    if (tk) {
      const key = this.tokIdx.get(await sha(tk));
      if (key && this.S.users.has(key)) return { r: 'u', k: key };
      return { r: 's', bad: 1 };
    }
    return { r: 's' };
  }

  throttled(id) {
    const now = Date.now(), arr = (this.rate.get(id) || []).filter((t) => now - t < 10000);
    arr.push(now); this.rate.set(id, arr);
    if (this.rate.size > 3000) this.rate.clear();
    return arr.length > 40;
  }

  /* ---------- one action, from a socket or from HTTP ---------- */
  async act(a, m, rateId) {
    const S = this.S;
    if (this.throttled(rateId)) return { ok: false, err: 'Slow down a little' };
    S.now = Date.now();
    let r;
    if (a.r === 'h') {
      r = E.hostAction(S, m);
    } else if (a.r === 'u') {
      const u = S.users.get(a.k);
      if (!u) return { ok: false, err: 'Log in again' };
      if (u.banned) return { ok: false, err: 'Your account is blocked' };
      if (m.a === 'top') r = E.setTop(S, u, m.order);
      else if (m.a === 'pick') r = E.setPick(S, u, m.mid, m.bb || null);
      else if (m.a === 'bet') r = E.setBet(S, u, m.mk, m.o, m.amt);
      else if (m.a === 'vote') r = E.castVote(S, u, m.mid, m.side);
      else r = { ok: false, err: 'Unknown action' };
    } else {
      return { ok: false, err: 'Log in first' };
    }
    if (r.ok) {
      await this.commit();
      this.feedFor(a, m);
    }
    return r;
  }

  /** The hall's talking points: big bets as they land, big wins when a battle is settled. */
  feedFor(a, m) {
    const S = this.S, items = [];
    if (a.r === 'u' && m.a === 'bet' && m.amt >= 100) {
      const k = S.ev.markets[m.mk];
      if (k) items.push({ k: 'bet', t: `${S.users.get(a.k).name} put ${Math.floor(m.amt)} on ${E.marketTitle(S, k)}: ${this.optLabel(k, m.o)}` });
    }
    if (a.r === 'h' && m.a === 'result') for (const w of E.bigWins(S, 'm:' + m.mid)) items.push({ k: 'win', t: `${w.n} collected ${w.d} Loops` });
    if (!items.length) return;
    const s = JSON.stringify({ t: 'feed', items });
    for (const ws of this.sockets()) this.send(ws, s);
  }
  optLabel(k, o) {
    const S = this.S, nm = (id) => (S.ev.bbs.find((b) => b.id === id) || { name: '?' }).name;
    return k.kind === 'match' || k.kind === 'champion' ? nm(k.bbs[o]) : o === 0 ? 'yes' : 'no';
  }

  /* ---------- HTTP ---------- */
  async fetch(request) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (path === '/init' && method === 'POST') return this.init(request);
    if (!this.S) return err('No event with that code', 404);

    if (path === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return err('Expected a WebSocket', 426);
      const pair = new WebSocketPair(), [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ r: 's' });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (path === '/info') {
      const ev = this.S.ev;
      return json({ ok: true, code: ev.code, name: ev.name, phase: ev.phase, players: this.S.users.size, regOpen: ev.settings.regOpen });
    }
    if (path === '/register' && method === 'POST') return this.register(request);
    if (path === '/login' && method === 'POST') return this.login(request);
    if (path === '/hostlogin' && method === 'POST') return this.hostLogin(request);

    if (path.startsWith('/photo/')) {
      const id = path.slice(7);
      if (method === 'GET') {
        const bytes = await this.ctx.storage.get('ph:' + id);
        if (!bytes) return new Response('', { status: 404 });
        return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
      }
      if (method === 'PUT') {
        const a = await this.authFor(null, request.headers.get('x-host'));
        if (a.r !== 'h') return err('Organiser only', 403);
        if (!this.S.ev.bbs.some((b) => b.id === id)) return err('No such beatboxer', 404);
        if (+request.headers.get('content-length') > MAX_PHOTO * 1.5) return err('Picture too big (max 160 KB)', 413);
        const buf = await request.arrayBuffer();
        if (!buf.byteLength || buf.byteLength > MAX_PHOTO) return err('Picture too big (max 160 KB)', 413);
        await this.ctx.storage.put('ph:' + id, new Uint8Array(buf));
        const bb = this.S.ev.bbs.find((b) => b.id === id);
        bb.ph = (bb.ph || 0) + 1;
        this.S.dirty.meta = true; this.S.dirty.ev = true;
        await this.commit();
        return json({ ok: true, ph: bb.ph });
      }
    }

    if (path === '/state' && method === 'GET') {
      const a = await this.authFor(bearer(request), request.headers.get('x-host'));
      const S = this.S, out = { ok: true, meta: E.metaOf(S), live: E.liveOf(S, this.sockets().length, a.r === 'h'), board: E.boardOf(S), auth: a.bad ? 0 : 1 };
      if (a.r === 'u' && S.users.has(a.k)) out.me = E.meOf(S, S.users.get(a.k));
      if (a.r === 'h') out.host = E.hostOf(S);
      return json(out);
    }

    if (path === '/act' && method === 'POST') {
      let m; try { m = await request.json(); } catch (_) { return err('Bad request'); }
      const a = await this.authFor(bearer(request), request.headers.get('x-host'));
      const ip = request.headers.get('cf-connecting-ip') || '?';
      const r = await this.act(a, m, (a.r === 'u' ? a.k : a.r) + ':http:' + ip);
      return json(r, r.ok ? 200 : 400);
    }

    if (path === '/export' && method === 'GET') {
      const a = await this.authFor(null, request.headers.get('x-host') || url.searchParams.get('ht'));
      if (a.r !== 'h') return err('Organiser only', 403);
      const S = this.S;
      return json({ ok: true, event: { ...E.metaOf(S) }, board: E.boardOf(S), markets: E.marketsList(S),
        players: [...S.users.values()].map((u) => ({ name: u.name, bal: u.bal, st: u.st, top: u.top, picks: u.picks, bets: u.bets, votes: u.votes })) },
      200, { 'content-disposition': `attachment; filename="battle-call-${S.ev.code}.json"` });
    }

    if (path === '/destroy' && method === 'POST') {
      const a = await this.authFor(null, request.headers.get('x-host'));
      if (a.r !== 'h') return err('Organiser only', 403);
      for (const ws of this.sockets()) { this.send(ws, { t: 'gone' }); try { ws.close(1000, 'event deleted'); } catch (_) { /* */ } }
      await this.ctx.storage.deleteAll();
      this.S = null; this.tokIdx.clear(); this.hostTk.clear();
      return json({ ok: true });
    }
    return err('Not found', 404);
  }

  async init(request) {
    if (this.S) return err('exists', 409);
    let b; try { b = await request.json(); } catch (_) { return err('Bad request'); }
    const pw = String(b.password || '');
    if (pw.length < 4) return err('Choose an organiser password of at least 4 characters');
    if (!cleanCode(b.code)) return err('Bad code');
    const ev = E.newEvent({ code: b.code, name: b.name, size: +b.size || 16, now: Date.now() });
    const salt = randomToken(12), ht = randomToken();
    const host = { s: salt, h: await hashPassword(pw, salt), tk: [await sha(ht)] };
    if (this.S) return err('exists', 409); // another init finished while we were hashing
    this.host = host;
    this.S = E.newState(ev);
    this.hostTk = new Set(this.host.tk);
    this.S.dirty.ev = true;
    await this.ctx.storage.put('host', this.host);
    await this.commit();
    return json({ ok: true, code: ev.code, hostToken: ht });
  }

  tooManyFails(ip) {
    const now = Date.now(), a = (this.fails.get(ip) || []).filter((t) => now - t < 300000);
    this.fails.set(ip, a);
    return a.length >= 10;
  }
  noteFail(ip) { const a = this.fails.get(ip) || []; a.push(Date.now()); this.fails.set(ip, a); if (this.fails.size > 2000) this.fails.clear(); }

  async register(request) {
    let b; try { b = await request.json(); } catch (_) { return err('Bad request'); }
    const S = this.S, ip = request.headers.get('cf-connecting-ip') || '?';
    const pw = String(b.password || '');
    if (pw.length < 4) return err('Password needs at least 4 characters');
    if (pw.length > 80) return err('Password too long');
    const ipH = (await sha(this.S.ev.code + ip)).slice(0, 10);
    const dev = String(b.device || '').slice(0, 40);
    S.now = Date.now();
    const chk = E.canRegister(S, { name: b.name, device: dev, ipH });
    if (!chk.ok) return err(chk.err);
    const key = nameKey(chk.name);
    if (this.pending.has(key)) return err('That nickname is taken');
    this.pending.add(key);
    try {
      const salt = randomToken(12), tk = randomToken();
      const [h, th] = await Promise.all([hashPassword(pw, salt), sha(tk)]);
      const again = E.canRegister(S, { name: chk.name, device: dev, ipH }); // the world moved while we hashed
      if (!again.ok) return err(again.err);
      const u = E.newUser(S, { name: chk.name, device: dev, ipH });
      u.pw = { s: salt, h }; u.tk = [th];
      E.addUser(S, u);
      this.tokIdx.set(th, u.key);
      await this.commit();
      return json({ ok: true, token: tk, name: u.name });
    } finally { this.pending.delete(key); }
  }

  async login(request) {
    let b; try { b = await request.json(); } catch (_) { return err('Bad request'); }
    const ip = request.headers.get('cf-connecting-ip') || '?';
    if (this.tooManyFails(ip)) return err('Too many wrong passwords, wait a few minutes', 429);
    const u = this.S.users.get(nameKey(b.name));
    const bad = () => { this.noteFail(ip); return err('Wrong nickname or password', 401); };
    if (!u || !u.pw) return bad();
    const h = await hashPassword(String(b.password || ''), u.pw.s);
    if (!safeEq(h, u.pw.h)) return bad();
    if (u.banned) return err('Your account is blocked', 403);
    const tk = randomToken(), th = await sha(tk);
    u.tk = [...(u.tk || []), th];
    while (u.tk.length > 4) this.tokIdx.delete(u.tk.shift());
    this.tokIdx.set(th, u.key);
    this.S.dirty.users.add(u.key);
    await this.commit();
    return json({ ok: true, token: tk, name: u.name });
  }

  async hostLogin(request) {
    let b; try { b = await request.json(); } catch (_) { return err('Bad request'); }
    const ip = request.headers.get('cf-connecting-ip') || '?';
    if (this.tooManyFails('h' + ip)) return err('Too many wrong passwords, wait a few minutes', 429);
    const h = await hashPassword(String(b.password || ''), this.host.s);
    if (!safeEq(h, this.host.h)) { this.noteFail('h' + ip); return err('Wrong organiser password', 401); }
    const ht = randomToken(), hh = await sha(ht);
    this.host.tk = [...this.host.tk, hh].slice(-6);
    this.hostTk = new Set(this.host.tk);
    await this.ctx.storage.put('host', this.host);
    return json({ ok: true, hostToken: ht });
  }
}

const bearer = (req) => {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
};
