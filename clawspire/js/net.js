// Clawspire -- NET (round 15). The online link for Duo co-op (DESIGN.md
// "Online co-op (round 15)").
//
// A small WebSocket client for the shared relay the owner already runs for
// Ironbridge (ironbridge-relay/worker.js, a Cloudflare Durable Object per
// room). The relay knows nothing about Clawspire: POST /new mints a four
// letter room code, GET /room/<CODE> is a WebSocket, it hands each side
// {k:'hello', side, seed}, then {k:'peers', n} and {k:'start', seed, side}
// once both are in, {k:'peerGone'} when one drops, {k:'rejoin', role} when a
// dropped side comes back (?side= claims the seat back), answers "ping" with
// {k:'pong'}, and copies every other message to the other side verbatim.
//
// Rooms are shared with Ironbridge, so the first thing each side says is a
// hello naming the game and the message format: a partner whose first word
// is anything else is another game ('foreign'); one on another format gets
// 'version'. Everything is JSON with a type (t) and the format (v).
//
//   NET.host()        -> Promise<code>: mint a code and wait in the room
//   NET.join(code)    -> true when the code is well formed; then the events
//   NET.send(obj)     -> false when there is no partner to send to
//   NET.on(ev, fn)    game messages by their t ('turn', 'cl', ...), or the link's
//                     own events: '@state' (s), '@peer' (the partner's hello),
//                     '@lost' (why), '@back' (role), '@gone' (the retry window
//                     ran out, still retrying), '@error' (code), '@code' (code)
//   NET.close()       leave the room; NET.reset() also drops every listener
//   NET.state         idle | connecting | waiting | connected | lost | closed
//   NET.pulse()       the clock: heartbeats, silence, retries (an interval runs
//                     it; the game's frame calls it too; tests call it by hand)
//
// Nothing here knows about co-op: versus (or anything else) can ride the same
// link later with its own message types. Never throws into the game.
const NET = (() => {
  'use strict';
  const PROTO = 1;
  const GAME = 'clawspire';
  const HOST = 'ironbridge-relay.danhieux-senjka.workers.dev';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const CODE_LEN = 4;
  // ms: a heartbeat (the relay counts a seat silent for 10 s as free to claim),
  // a partner or relay silent this long is lost, a retry, the retry window
  // before the game offers to go on alone, a partner's hello, nobody hosting,
  // the size one message may be (the relay drops anything over 16384).
  const C = { ping: 3000, silent: 10000, retry: 2500, retrySlow: 6000, window: 30000, hello: 8000, nobody: 7000, open: 9000, max: 15000 };
  const RELAY_K = { hello: 1, peers: 1, start: 1, rejoin: 1, peerGone: 1, pong: 1 };
  // Test and dev hooks: the socket class, fetch, the clock. Defaults read the page's own.
  const io = {
    WS: null, fetch: null, now: null,
    ws() { return this.WS || (typeof window !== 'undefined' && window.WebSocket) || null; },
    get(u, o) { const f = this.fetch || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : null); return f ? f(u, o) : Promise.reject(new Error('no fetch')); },
    t() { return this.now ? this.now() : Date.now(); },
  };
  const subs = {};
  const LOG = [];
  let S = fresh();
  let timer = null;
  let helloOf = () => ({});
  function fresh() {
    return { state: 'idle', code: '', side: -1, seed: 0, sock: null, gen: 0, host: false, peer: null, peerIn: 0, relayIn: 0, sent: 0,
      pingAt: 0, lostAt: 0, lostWhy: '', gone: false, retryAt: 0, tries: 0, have: 0, err: '', helloAt: 0, joinAt: 0, opened: false, n: 0, bye: false };
  }
  function log(k, s) { LOG.push({ t: io.t(), k, s: s == null ? '' : String(s).slice(0, 120) }); if (LOG.length > 200) LOG.splice(0, 50); }
  function emit(ev, a) {
    for (const fn of (subs[ev] || []).slice()) { try { fn(a); } catch (e) { log('listener', (e && e.message) || e); } }
  }
  function on(ev, fn) { if (typeof fn === 'function') (subs[ev] || (subs[ev] = [])).push(fn); return () => off(ev, fn); }
  function off(ev, fn) { const l = subs[ev]; if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function set(s) { if (S.state === s) return; S.state = s; log('state', s); emit('@state', s); }

  // ---- where the relay is: ?relay=host (&relayws=ws for a local test), else localStorage
  // clawspire_relay (a dev override), else the owner's worker. "ws://host:port" works in either.
  function cfg() {
    let host = HOST, sec = true;
    const take = (v) => {
      v = String(v || '').trim();
      if (!v) return;
      const m = /^(wss?):\/\/(.+)$/i.exec(v);
      if (m) { sec = m[1].toLowerCase() === 'wss'; v = m[2]; }
      v = v.replace(/\/+$/, '');
      if (/^[A-Za-z0-9.:-]{1,200}$/.test(v)) host = v;
    };
    try { take(typeof localStorage !== 'undefined' ? localStorage.getItem('clawspire_relay') : ''); } catch (e) { /* storage blocked */ }
    try {
      const q = typeof window !== 'undefined' && window.location ? String(window.location.search || '') : '';
      const r = /[?&]relay=([^&#]*)/.exec(q), w = /[?&]relayws=([^&#]*)/.exec(q);
      if (r) take(decodeURIComponent(r[1]));
      if (w) sec = !/^ws$/i.test(decodeURIComponent(w[1]));
    } catch (e) { /* a broken address */ }
    return { host, ws: (sec ? 'wss://' : 'ws://') + host, http: (sec ? 'https://' : 'http://') + host };
  }
  function cleanCode(raw) {
    const s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
    if (s.length !== CODE_LEN) return null;
    for (const c of s) if (ALPHA.indexOf(c) < 0) return null;
    return s;
  }
  function parseJoin(search) {
    const m = /[?&]join=([^&#]*)/i.exec(String(search || ''));
    if (!m) return null;
    let v = m[1];
    try { v = decodeURIComponent(v); } catch (e) { /* raw */ }
    return cleanCode(v);
  }

  // ---- the socket
  function shut(sock) {
    if (!sock) return;
    try { sock.onopen = sock.onmessage = sock.onerror = sock.onclose = null; } catch (e) { /* ignore */ }
    try { sock.close(); } catch (e) { /* already gone */ }
  }
  function open(code) {
    const W = io.ws();
    if (!W) { fail('unreachable'); return false; }
    shut(S.sock);
    const gen = ++S.gen;
    const q = '?have=' + (S.have > 0 ? '1&tick=' + S.have : '0') + (S.side === 0 || S.side === 1 ? '&side=' + S.side : '');
    let sock;
    try { sock = new W(cfg().ws + '/room/' + code + q); } catch (e) { log('open', (e && e.message) || e); onDrop(gen, false); return false; }
    S.sock = sock; S.opened = false; S.joinAt = io.t();
    sock.onopen = () => { if (gen !== S.gen) return; S.opened = true; S.relayIn = io.t(); log('open', code); };
    sock.onmessage = (ev) => { if (gen === S.gen) recv(ev && ev.data); };
    sock.onerror = () => { if (gen === S.gen) log('error', ''); };
    sock.onclose = () => { if (gen === S.gen) onDrop(gen, S.opened); };
    startTimer();
    return true;
  }
  function raw(s) {
    const sock = S.sock;
    if (!sock || sock.readyState !== 1) return false;
    try { sock.send(s); return true; } catch (e) { return false; }
  }
  function sayHello() {
    let extra = {};
    try { extra = helloOf() || {}; } catch (e) { extra = {}; }
    raw(JSON.stringify(Object.assign({}, extra, { t: 'hi', game: GAME, v: PROTO })));
    S.helloAt = io.t();
    if (S.have > 0) raw('"have:' + S.have + '"');
  }
  function recv(data) {
    if (typeof data !== 'string' || data.length > 20000) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    const now = io.t();
    if (m === 'ping') { S.peerIn = now; wake(); return; }   // the partner's heartbeat (the relay copies it over)
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    if (typeof m.k === 'string' && RELAY_K[m.k]) { S.relayIn = now; relay(m); return; }
    S.peerIn = now;
    wake();
    if (!S.peer) {
      // the first word from the other side must be our hello
      if (m.game !== GAME || m.t !== 'hi') { log('foreign', (m.game || m.t || '?')); fail('foreign'); return; }
      if (m.v !== PROTO) { log('version', m.v); fail('version'); return; }
      S.peer = m; S.peerWait = 0;
      const was = S.state;
      set('connected');
      emit('@peer', m);
      if (was === 'lost') { S.lostAt = 0; S.gone = false; S.tries = 0; emit('@back', S.role || ''); }
      return;
    }
    if (m.t === 'hi') { S.peer = m; emit('@peer', m); return; }   // a hello again (after a rejoin)
    if (m.v !== PROTO || typeof m.t !== 'string' || m.t.length > 16) return;
    S.n++;
    emit(m.t, m);
  }
  // A partner who only went quiet (a phone in a pocket throttles its timers) speaks again on the same
  // line: that is them back. (After a real drop the relay's rejoin clears peer, and a hello must come.)
  function wake() {
    if (S.state !== 'lost' || !S.peer || !S.sock || S.sock.readyState !== 1 || S.lostWhy !== 'silent') return;
    S.lostAt = 0; S.gone = false; S.tries = 0;
    set('connected');
    emit('@back', 'quiet');
  }
  function relay(m) {
    if (m.k === 'hello') {
      S.side = m.side === 0 || m.side === 1 ? m.side : S.side;
      if (S.state === 'connecting') set('waiting');
      return;
    }
    if (m.k === 'peers') {
      if ((m.n | 0) < 2 && S.state === 'connected') lose('peer');
      return;
    }
    if (m.k === 'start' || m.k === 'rejoin') {
      S.seed = (m.seed >>> 0) || S.seed || 1;
      S.side = m.side === 0 || m.side === 1 ? m.side : S.side;
      S.role = m.k === 'rejoin' ? String(m.role || '') : 'start';
      log(m.k, S.role);
      seatSave();
      S.peerWait = io.t(); S.everPeer = true;   // somebody is in: their hello must follow (pulse: 'foreign' if it never does)
      emit('@start', { seed: S.seed, side: S.side, role: S.role });
      S.peer = null;   // a hello must come again: it could be anybody in that seat now
      sayHello();
      return;
    }
    if (m.k === 'peerGone') { if (S.state === 'connected') lose('peer'); return; }
    // pong: relayIn is enough
  }
  function lose(why) {
    if (S.state === 'lost' || S.state === 'closed' || S.state === 'idle') return;
    if (!S.peer && S.state !== 'connected') return;
    S.lostAt = S.lostAt || io.t(); S.lostWhy = why; S.gone = false; S.tries = 0;
    set('lost');
    emit('@lost', why);
  }
  // Our own socket closed (or never opened).
  function onDrop(gen, wasOpen) {
    if (gen !== S.gen) return;
    S.sock = null;
    if (S.bye || S.state === 'closed' || S.state === 'idle') return;
    if (S.state === 'connecting' || (S.state === 'waiting' && !S.peer && !S.everPeer)) {
      if (S.host && S.state === 'waiting' && wasOpen) { S.retryAt = io.t() + C.retry; return; }   // the host keeps its room: back in a moment
      // never got in: the relay cannot be reached, or the room is full; a fetch of /new tells which
      probe().then((up) => { if (gen === S.gen && !S.sock && S.state !== 'closed' && S.state !== 'idle') fail(up ? 'full' : 'unreachable'); });
      return;
    }
    if (S.state !== 'lost') { S.lostAt = io.t(); S.lostWhy = 'link'; S.gone = false; S.tries = 0; set('lost'); emit('@lost', 'link'); }
    S.retryAt = io.t() + C.retry;
  }
  function probe() {
    try {
      return io.get(cfg().http + '/new', { method: 'POST' }).then((r) => (r && typeof r.json === 'function' ? r.json() : null)).then((j) => !!(j && j.code), () => false);
    } catch (e) { return Promise.resolve(false); }
  }
  function fail(code) {
    S.err = code;
    const sock = S.sock;
    S.sock = null; S.gen++;
    shut(sock);
    set('closed');
    stopTimer();
    emit('@error', code);
  }

  // ---- the clock: heartbeats, silence, retries
  function pulse() {
    const st = S.state;
    if (st === 'idle' || st === 'closed') return st;
    const now = io.t();
    if (S.sock && S.sock.readyState === 1 && now - S.pingAt >= C.ping) { S.pingAt = now; raw('"ping"'); }
    if (st === 'connecting' && S.sock && !S.opened && now - S.joinAt > C.open) { const g = S.gen; shut(S.sock); S.sock = null; onDrop(g, false); return S.state; }
    if (st === 'waiting' && !S.host && !S.peer && S.joinAt && now - S.joinAt > C.nobody && !S.everPeer) { fail('nobody'); return S.state; }
    if (st === 'connected') {
      if (S.peerIn && now - S.peerIn > C.silent) lose('silent');
      else if (S.sock && S.relayIn && now - S.relayIn > C.silent + C.ping) { const g = S.gen; shut(S.sock); S.sock = null; onDrop(g, true); }
    }
    if (S.state === 'waiting' && S.peerWait && !S.peer && now - S.peerWait > C.hello) { fail('foreign'); return S.state; }
    if (S.state === 'lost') {
      if (!S.gone && now - S.lostAt > C.window) { S.gone = true; emit('@gone', S.lostWhy); }
      if (!S.sock && now >= S.retryAt) { S.tries++; S.retryAt = now + (S.gone ? C.retrySlow : C.retry); open(S.code); }
      else if (S.sock && S.sock.readyState === 1 && S.relayIn && now - S.relayIn > C.silent + C.ping) { const g = S.gen; shut(S.sock); S.sock = null; onDrop(g, true); }
    }
    if (S.state === 'waiting' && S.host && !S.sock && S.retryAt && now >= S.retryAt) { S.retryAt = now + C.retry; open(S.code); }
    if (S.state !== 'idle' && S.state !== 'closed') emit('@pulse', now);   // the game's own checks ride the same clock (a hidden page)
    return S.state;
  }
  function startTimer() {
    if (timer || typeof setInterval !== 'function') return;
    try { timer = setInterval(pulse, 500); } catch (e) { timer = null; }
  }
  function stopTimer() { if (timer) { try { clearInterval(timer); } catch (e) { /* ignore */ } timer = null; } }

  // ---- the API
  function begin(code, host) {
    S = Object.assign(fresh(), { code, host: !!host, gen: S.gen + 1 });
    set('connecting');
  }
  function hostRoom() {
    close(true);
    begin('', true);
    const gen = S.gen;
    return probeNew().then((code) => {
      if (gen !== S.gen || S.state !== 'connecting') return null;
      if (!code) { fail('unreachable'); return null; }
      S.code = code;
      emit('@code', code);
      open(code);
      return code;
    });
  }
  function probeNew() {
    try {
      return io.get(cfg().http + '/new', { method: 'POST' })
        .then((r) => (r && typeof r.json === 'function' ? r.json() : null))
        .then((j) => cleanCode(j && j.code), () => null);
    } catch (e) { return Promise.resolve(null); }
  }
  function join(code) {
    const c = cleanCode(code);
    if (!c) { S.err = 'badcode'; emit('@error', 'badcode'); return false; }
    close(true);
    begin(c, false);
    const k = seatLoad();   // this tab was in that room before (a reload): claim the same seat back
    if (k && k.code === c && (k.side === 0 || k.side === 1)) S.side = k.side;
    open(c);
    return true;
  }
  // The seat this tab holds in a room, for a reload (sessionStorage: this tab only, gone with it).
  function seatSave() {
    try { if (typeof sessionStorage !== 'undefined' && S.code && (S.side === 0 || S.side === 1)) sessionStorage.setItem('clawspire_net', JSON.stringify({ code: S.code, side: S.side })); } catch (e) { /* storage blocked */ }
  }
  function seatLoad() {
    try { const o = typeof sessionStorage !== 'undefined' ? JSON.parse(sessionStorage.getItem('clawspire_net') || 'null') : null; return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  function send(o) {
    if (S.state !== 'connected' || !o || typeof o !== 'object') return false;
    let s;
    try { s = JSON.stringify(Object.assign({}, o, { v: PROTO })); } catch (e) { return false; }
    if (s.length > C.max) { log('too big', o.t + ' ' + s.length); return false; }
    const ok = raw(s);
    if (ok) S.sent++;
    return ok;
  }
  // "I am holding a match n steps along": the relay keeps the seat's claim, so a rejoin knows who has it.
  function have(n) {
    n = Math.max(0, Math.floor(+n) || 0);
    S.have = n;
    if (n > 0) raw('"have:' + n + '"');
  }
  function close(quiet) {
    const sock = S.sock;
    S.bye = true;
    S.sock = null; S.gen++;
    shut(sock);
    stopTimer();
    if (!quiet || S.state !== 'idle') set('closed');
  }
  return {
    PROTO, GAME, HOST, ALPHA, CODE_LEN, C, io, LOG,
    cfg, cleanCode, parseJoin,
    host: hostRoom, join, send, have, on, off, close, pulse,
    reset() { close(true); for (const k in subs) delete subs[k]; S = fresh(); },
    hello(fn) { helloOf = typeof fn === 'function' ? fn : () => ({}); },
    get state() { return S.state; }, get code() { return S.code; }, get side() { return S.side; }, get seed() { return S.seed; },
    get peer() { return S.peer; }, get err() { return S.err; }, get lostFor() { return S.lostAt ? io.t() - S.lostAt : 0; }, get gone() { return !!S.gone; },
    get role() { return S.role || ''; }, get tries() { return S.tries; }, get isHost() { return !!S.host; }, get sent() { return S.sent; },
  };
})();
if (typeof window !== 'undefined') window.NET = NET;
