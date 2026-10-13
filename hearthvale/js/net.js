// Links: the same interface for solo play (sim in the page) and for a Hearthvale server.
import * as S from '../shared/sim.js';
import { addBots, botStep } from '../shared/bots.js';

const SAVE_KEY = 'hearthvale.solo.v1';
export function soloLink(name, token) {
  let W = null;
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) W = S.deserialize(raw); } catch {}
  if (!W) W = S.createWorld((Math.random() * 1e9) | 0);
  const id = 'me'; const P = S.addPlayer(W, id, name); if (name) P.name = name;
  addBots(W, 5);
  const link = { id, kind: 'solo', world: W, onSnap: null, onNack: null, lag: 0 };
  let last = performance.now(), n = 0, acc = 0;
  const loop = setInterval(() => {
    const now = performance.now(); const dt = (now - last) / 1000; last = now;
    // catch up after a hidden tab: a minute of offline progress, never more
    let left = Math.min(dt, 60); while (left > 0) { const step = Math.min(left, 0.25); S.tick(W, step); botStep(W, step); left -= step; }
    n++;
    if (n % 2 === 0 && link.onSnap) { link.onSnap(S.snapshot(W, id)); S.flushEvents(W); }
    if (n % 100 === 0) save();
  }, 100);
  const save = () => { try { localStorage.setItem(SAVE_KEY, S.serialize(W)); } catch {} };
  addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  link.cmd = (c) => { const r = S.command(W, id, c); if (r.ok === false && link.onNack) link.onNack(r.err || 'no', c.op); return r; };
  link.reset = () => { try { localStorage.removeItem(SAVE_KEY); } catch {} location.reload(); };
  link.close = () => { clearInterval(loop); save(); };
  setTimeout(() => link.onSnap && link.onSnap(S.snapshot(W, id)), 50);
  return link;
}

export function wsLink(url, name, token, hooks = {}) {
  const link = { id: null, kind: 'server', onSnap: null, onNack: null, lag: 0, state: 'connecting' };
  let ws, retry = 0, closed = false, pingN = 0, pings = {};
  const connect = () => {
    ws = new WebSocket(url); link.state = 'connecting';
    ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ t: 'join', token, name })); };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') { link.id = m.id; link.state = 'online'; hooks.onWelcome && hooks.onWelcome(m); }
      else if (m.t === 'snap') link.onSnap && link.onSnap(m.s);
      else if (m.t === 'nack') link.onNack && link.onNack(m.err, m.op);
      else if (m.t === 'full') { link.state = 'full'; closed = true; hooks.onFull && hooks.onFull(); }
      else if (m.t === 'pong') { link.lag = Math.round(performance.now() - pings[m.n]); delete pings[m.n]; }
    };
    ws.onclose = () => { if (closed) return; link.state = 'reconnecting'; hooks.onState && hooks.onState('reconnecting'); setTimeout(connect, Math.min(8000, 800 * 2 ** retry++)); };
    ws.onerror = () => {};
  };
  connect();
  const pinger = setInterval(() => { if (ws && ws.readyState === 1) { pings[++pingN] = performance.now(); ws.send(JSON.stringify({ t: 'ping', n: pingN })); } }, 3000);
  link.cmd = (c) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'cmd', c })); return { ok: true }; };
  link.close = () => { closed = true; clearInterval(pinger); try { ws.close(); } catch {} };
  return link;
}
