// Battle Call: talking to the server. One WebSocket per event (instant push), with a polling fallback for
// networks that eat WebSockets, automatic reconnect, and plain HTTP for sign-up and login.
import { S, emit, setMeta, setMe, serverBase } from './state.js';
import { createDemo } from './demo.js';

let demo = null;
export const isDemo = () => S.code === 'DEMO';
export const demoCtl = () => (demo = demo || createDemo());

let ws = null, wsTries = 0, hb = 0, poll = 0, retry = 0, lastMsg = 0, wantCode = null, seq = 1, onPush = () => {};
const waiting = new Map();

const url = (path) => serverBase() + '/api/e/' + S.code + path;

export async function http(path, body, extra = {}) {
  const opt = { method: body === undefined ? 'GET' : 'POST', headers: { ...(extra.headers || {}) } };
  if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(path.startsWith('http') ? path : serverBase() + path, { ...opt, signal: ctl.signal });
    const j = await r.json().catch(() => ({ ok: false, err: 'The server sent something odd' }));
    return { status: r.status, ...j };
  } catch (e) {
    return { ok: false, err: e && e.name === 'AbortError' ? 'The server took too long' : 'Cannot reach the server', offline: true };
  } finally { clearTimeout(to); }
}

const authHeaders = () => (S.role === 'host' ? { 'x-host': S.ht } : S.tk ? { authorization: 'Bearer ' + S.tk } : {});

/** Apply one pushed message to the state. Used by the socket and by the polling fallback. */
export function apply(m) {
  switch (m.t) {
    case 'meta': { const { t, ...rest } = m; setMeta(rest); S.ready = true; break; }
    case 'live': S.live = m; break;
    case 'board': S.board = m.rows; break;
    case 'me': { const prev = S.me; const { t, ...rest } = m; setMe(rest); onPush('me', prev, rest); break; }
    case 'host': S.host = m; break;
    case 'feed': S.feed = [...(S.feed || []), ...m.items.map((i) => ({ ...i, at: Date.now() }))].slice(-8); break;
    case 'authfail': S.authFail = true; break;
    case 'gone': S.gone = true; break;
    case 'r': { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); clearTimeout(w.to); const { t, id, ...rest } = m; w.res(rest); } return; }
    default: return;
  }
  emit();
}

export function connect(code, push) {
  disconnect();
  if (code === 'DEMO') { onPush = push || (() => {}); S.conn = 'live'; demoCtl().attach(apply, S.role); emit(); return; }
  wantCode = code; onPush = push || (() => {}); wsTries = 0;
  open();
  document.addEventListener('visibilitychange', wake);
  addEventListener('online', wake);
}

export function disconnect() {
  wantCode = null;
  if (demo) demo.detach();
  clearInterval(hb); clearTimeout(retry); clearInterval(poll); hb = retry = poll = 0;
  document.removeEventListener('visibilitychange', wake);
  removeEventListener('online', wake);
  if (ws) { ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null; try { ws.close(); } catch (_) { /* */ } ws = null; }
  for (const w of waiting.values()) { clearTimeout(w.to); w.res({ ok: false, err: 'Disconnected' }); }
  waiting.clear();
  S.conn = 'idle';
}

function wake() {
  if (document.hidden || !wantCode) return;
  if (!ws || ws.readyState > 1 || Date.now() - lastMsg > 45000) { wsTries = 0; open(); }
}

function open() {
  if (!wantCode) return;
  clearTimeout(retry);
  if (ws) { ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null; try { ws.close(); } catch (_) { /* */ } }
  let sock;
  try { sock = new WebSocket(serverBase().replace(/^http/, 'ws') + '/api/e/' + wantCode + '/ws'); } catch (_) { fallback(); return; }
  ws = sock;
  sock.onopen = () => {
    wsTries = 0; lastMsg = Date.now();
    sock.send(JSON.stringify({ t: 'hello', tk: S.role === 'user' ? S.tk : undefined, ht: S.role === 'host' ? S.ht : undefined }));
    clearInterval(hb);
    hb = setInterval(() => {
      if (sock.readyState !== 1) return;
      if (Date.now() - lastMsg > 70000) { sock.close(); return; }
      sock.send('ping');
    }, 20000);
    clearInterval(poll); poll = 0;
    S.conn = 'live'; emit();
  };
  sock.onmessage = (e) => {
    lastMsg = Date.now();
    if (e.data === 'pong') return;
    try { apply(JSON.parse(e.data)); } catch (err) { console.error(err); }
  };
  sock.onclose = sock.onerror = () => {
    if (ws !== sock || !wantCode) return;
    clearInterval(hb);
    wsTries++;
    if (wsTries >= 3) fallback();
    S.conn = poll ? 'poll' : 'down'; emit();
    retry = setTimeout(open, Math.min(8000, 500 * 2 ** wsTries) + Math.random() * 400);
  };
}

/** WebSockets blocked? Ask for a snapshot every few seconds instead; the socket keeps trying in the background. */
function fallback() {
  if (poll || !wantCode) return;
  const tick = async () => {
    if (!wantCode || document.hidden) return;
    const r = await http(`/api/e/${wantCode}/state`, undefined, { headers: authHeaders() });
    if (!r.ok) { S.conn = 'down'; emit(); return; }
    S.conn = 'poll';
    apply({ t: 'meta', ...r.meta }); apply({ t: 'live', ...r.live }); apply({ t: 'board', rows: r.board });
    if (r.me) apply({ t: 'me', ...r.me });
    if (r.host) apply({ t: 'host', ...r.host });
    if ((S.role === 'user' || S.role === 'host') && r.auth === 0) apply({ t: 'authfail' });
    emit();
  };
  tick();
  poll = setInterval(tick, 3500);
}

/** Do something. Over the socket when it is up, over HTTP when not. Always resolves { ok, err }. */
export function act(a) {
  if (a.cat === undefined && S.catId) a = { ...a, cat: S.catId }; // every action says which category it is about
  if (isDemo()) return Promise.resolve(demoCtl().act(a));
  if (S.role === 'guest') return Promise.resolve({ ok: false, err: 'Join the battle first', guest: true });
  if (ws && ws.readyState === 1) {
    const id = seq++;
    return new Promise((res) => {
      const to = setTimeout(() => { waiting.delete(id); res({ ok: false, err: 'No answer from the server' }); }, 9000);
      waiting.set(id, { res, to });
      ws.send(JSON.stringify({ t: 'a', id, ...a }));
    });
  }
  return http(`/api/e/${S.code}/act`, a, { headers: authHeaders() }).then((r) => {
    if (r.ok && poll) setTimeout(() => wantCode && fallbackNow(), 200);
    return r;
  });
}
async function fallbackNow() {
  const r = await http(`/api/e/${S.code}/state`, undefined, { headers: authHeaders() });
  if (!r.ok) return;
  apply({ t: 'meta', ...r.meta }); apply({ t: 'live', ...r.live }); apply({ t: 'board', rows: r.board });
  if (r.me) apply({ t: 'me', ...r.me });
}

/* sign-up / login / organiser */
export const register = (code, name, password, device) => http(`/api/e/${code}/register`, { name, password, device });
export const login = (code, name, password) => http(`/api/e/${code}/login`, { name, password });
export const hostLogin = (code, password) => http(`/api/e/${code}/hostlogin`, { password });
export const info = (code) => (code === 'DEMO' ? Promise.resolve({ ok: true, name: demoCtl().name() }) : http(`/api/e/${code}/info`));
export const createEvent = (body) => http('/api/create', body);

export async function uploadPhoto(bbId, blob) {
  if (isDemo()) return { ok: false, err: 'Photos are switched off in the demo' };
  try {
    const r = await fetch(url('/photo/' + bbId), { method: 'PUT', headers: { 'x-host': S.ht }, body: blob });
    return await r.json();
  } catch (_) { return { ok: false, err: 'Upload failed' }; }
}
export const photoUrl = (b) => (b && b.ph ? `${serverBase()}/api/e/${S.code}/photo/${b.id}?v=${b.ph}` : '');
export const exportUrl = () => `${serverBase()}/api/e/${S.code}/export?ht=${encodeURIComponent(S.ht)}`;
