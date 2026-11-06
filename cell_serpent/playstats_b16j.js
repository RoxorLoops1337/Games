// Cell Serpent, batch 16 (agent j): PLAY STATS. Local-only, anonymous counters kept in the save (save.pstats): where
// gigs end, which cards get picked, how many runs a sitting lasts. NOTHING here touches the network: there is no fetch,
// no beacon, no id. The numbers only exist on this device and are shown in the Stats tab ("Play Stats" card).
// Pure module (no imports): sim.js uses sanitizePstats, main.js records, hub2.js shows.

export const PSTAT_STAGES = 50;
const MAXCARDS = 90;
const numv = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.min(1e9, Math.floor(v)) : d);

// st[stage] = [runs, wins, losses, quits]
export const pstatsDefault = () => ({ v: 1, runs: 0, wins: 0, losses: 0, quits: 0, time: 0, sessions: 0, maxSess: 0, picks: 0, skips: 0, st: {}, cards: {} });

export function sanitizePstats(raw) {
  const p = pstatsDefault();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return p;
  for (const k of ['runs', 'wins', 'losses', 'quits', 'time', 'sessions', 'maxSess', 'picks', 'skips']) p[k] = numv(raw[k]);
  if (raw.st && typeof raw.st === 'object') for (const k of Object.keys(raw.st)) {
    const n = +k; if (!Number.isInteger(n) || n < 1 || n > PSTAT_STAGES || !Array.isArray(raw.st[k])) continue;
    const a = [0, 1, 2, 3].map(i => numv(raw.st[k][i])); if (a.some(Boolean)) p.st[n] = a;
  }
  if (raw.cards && typeof raw.cards === 'object') for (const k of Object.keys(raw.cards).slice(0, MAXCARDS)) if (/^[a-z0-9_]{1,24}$/i.test(k)) { const v = numv(raw.cards[k]); if (v) p.cards[k] = v; }
  return p;
}
// lazily adds the block (a brand new account has none until its first run)
export function ensure(save) {
  if (!save) return null;
  if (!save.pstats || typeof save.pstats !== 'object') save.pstats = pstatsDefault();
  return save.pstats;
}

let sessionRuns = 0, sessionOpen = false, quitNext = false;
export const resetSession = () => { sessionRuns = 0; sessionOpen = false; quitNext = false; };
export const sessionRunCount = () => sessionRuns;
export const noteQuit = () => { quitNext = true; };   // main.js calls this right before a GIVE UP builds its result

// one finished run (win, loss or give up). r = the sim's result object
export function recordRun(save, r) {
  const p = ensure(save); if (!p || !r) return null;
  const quit = quitNext && !r.won; quitNext = false;
  if (!sessionOpen) { sessionOpen = true; p.sessions++; }
  sessionRuns++; p.maxSess = Math.max(p.maxSess, sessionRuns);
  p.runs++; p.time = Math.min(1e9, p.time + Math.max(0, Math.min(3600, Math.floor(r.time || 0))));
  if (r.won) p.wins++; else if (quit) p.quits++; else p.losses++;
  const n = r.stage | 0;
  if (!r.mode && n >= 1 && n <= PSTAT_STAGES) {
    const a = p.st[n] || (p.st[n] = [0, 0, 0, 0]);
    a[0]++; if (r.won) a[1]++; else if (quit) a[3]++; else a[2]++;
  }
  return p;
}
export function recordPick(save, choice) {
  const p = ensure(save); if (!p || !choice || typeof choice.id !== 'string' || !/^[a-z0-9_]{1,24}$/i.test(choice.id)) return;
  p.picks++;
  if (p.cards[choice.id] || Object.keys(p.cards).length < MAXCARDS) p.cards[choice.id] = (p.cards[choice.id] || 0) + 1;
}
export function recordSkip(save) { const p = ensure(save); if (p) p.skips++; }
export function resetPstats(save) { if (save) save.pstats = pstatsDefault(); }

// ---- derived numbers for the panel
const mmss = s => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; };
export function summarize(p) {
  p = p || pstatsDefault();
  let tough = 0, toughN = 0, quit = 0, quitN = 0, maxLoss = 0;
  for (let n = 1; n <= PSTAT_STAGES; n++) {
    const a = p.st[n]; if (!a) continue;
    if (a[2] > toughN) { toughN = a[2]; tough = n; }
    if (a[3] > quitN) { quitN = a[3]; quit = n; }
    maxLoss = Math.max(maxLoss, a[2] + a[3]);
  }
  const top = Object.entries(p.cards).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3);
  return {
    runs: p.runs, winPct: p.runs ? Math.round(100 * p.wins / p.runs) : 0, perSession: p.sessions ? Math.round(10 * p.runs / p.sessions) / 10 : 0,
    maxSess: p.maxSess, quits: p.quits, avgTime: p.runs ? mmss(p.time / p.runs) : '0:00', skips: p.skips, picks: p.picks,
    tough, toughN, quit, quitN, top, maxLoss,
  };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// nameOf(id) -> display name
export function playStatsHTML(s, nameOf) {
  const p = s.pstats || pstatsDefault(), m = summarize(p);
  const head = '<div class="sec"><span style="background:#2f8f8a">Play Stats</span></div>';
  if (!p.runs && !p.picks) return head + '<div class="psnote" data-empty="1">Play a gig and your stats show up here.</div>';
  const tile = (v, label, col) => `<div class="rec${v === 0 || v === '0:00' ? ' zero' : ''}" style="--rc:${col}"><b>${v}</b><small>${label}</small></div>`;
  let bars = '';
  for (let n = 1; n <= PSTAT_STAGES; n++) {
    const a = p.st[n], bad = a ? a[2] + a[3] : 0, h = m.maxLoss ? Math.max(bad ? 14 : 4, Math.round(100 * bad / m.maxLoss)) : 4;
    bars += `<i class="${bad ? 'bad' : a ? 'ok' : ''}" style="height:${h}%" title="Stage ${n}: ${bad} lost"></i>`;
  }
  const hot = (n, c, what) => n ? `<div class="psrow"><span>${what}</span><b>Stage ${n}</b><em>${c}x</em></div>` : '';
  const cards = m.top.map(([id, c], i) => `<div class="psrow"><span>${['1st', '2nd', '3rd'][i]} pick</span><b>${esc(nameOf(id))}</b><em>${c}x</em></div>`).join('');
  return head + `<div class="recgrid">${tile(m.runs, 'Gigs', '#7be0e0')}${tile(m.winPct + '%', 'Win rate', '#9dff6d')}${tile(m.perSession, 'Gigs a visit', '#ffd84d')}${tile(m.avgTime, 'Avg gig', '#ff9ec7')}</div>
<div class="psrows">${hot(m.tough, m.toughN, 'Toughest')}${hot(m.quit, m.quitN, 'Most given up')}${cards}${m.skips ? `<div class="psrow"><span>Skipped picks</span><b>${m.skips}</b><em></em></div>` : ''}</div>
<div class="pschart" role="img" aria-label="Lost gigs per stage${m.tough ? ', most on stage ' + m.tough : ''}">${bars}</div>
<div class="pstick"><span>1</span><span>10</span><span>20</span><span>30</span><span>40</span><span>50</span></div>
<div class="psfoot"><span class="psnote">Kept on this device only. Nothing is sent anywhere.</span><button type="button" class="psreset" data-ps="reset">Clear</button></div>`;
}
