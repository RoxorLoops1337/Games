// Cell Serpent, batch 16 (agent i): goals and streaks.
//  - a weekly mutator: one rule change per week, the same for everyone (derived from the UTC day number)
//  - three small session goals shown at the start of a run (done once, stay done, a fresh set when all three are ticked)
//  - a forgiving play streak: one free rest day per week
// Pure logic first (no DOM, testable headless), then three tiny DOM helpers. Save field: save.goals16 (append-only).
const num = (v, d = 0) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const weekOf = day => Math.floor((num(day) + 3) / 7);   // weeks start on Monday (UTC day 0 was a Thursday)

// Every mutator is a sidegrade at best: what it gives with one hand it takes with the other (dps stays at or under 1).
export const MUTATORS = [
  { id: 'bass', name: 'Bass Week', icon: '🥁', text: 'Hits +30%, fire rate -25%', fx: p => { p.atk *= 1.3; p.rate *= 0.75; } },
  { id: 'treble', name: 'Treble Week', icon: '🎶', text: 'Fire rate +30%, hits -25%', fx: p => { p.rate *= 1.3; p.atk *= 0.75; } },
  { id: 'crowd', name: 'Crowd Week', icon: '👏', text: 'Crits +12%, hits -8%', fx: p => { p.crit += 0.12; p.atk *= 0.92; } },
  { id: 'penny', name: 'Penny Week', icon: '🪙', text: 'Beats +35%, hits -10%', fx: p => { p.coinMul *= 1.35; p.atk *= 0.9; } },
  { id: 'heavy', name: 'Heavy Week', icon: '🐘', text: 'Hits +15%, slower feet -20%', fx: p => { p.atk *= 1.15; p.speed *= 0.8; } },
  { id: 'quick', name: 'Quick Week', icon: '🐇', text: 'Faster feet +25%, hits -10%', fx: p => { p.speed *= 1.25; p.atk *= 0.9; } },
];
export const weeklyMutator = day => MUTATORS[weekOf(day) % MUTATORS.length];
export function applyMutator(g, day) {
  if (!g || !g.p || g.mode) return null;   // Piggy Bank and Invasion runs stay as they are
  const m = weeklyMutator(day); m.fx(g.p); g.mut16 = m.id; return m;
}

// ---- session goals. r = a run result from sim makeResult. Each takes a target scaled to the stage you are on.
const POOL = {
  kills: { text: t => `Pop ${t} cells`, mk: b => Math.min(140, 14 + 3 * b), ok: (r, t) => r.kills >= t },
  reach: { text: t => `Reach ${t}% of the stage`, mk: b => (b < 4 ? 50 : 70), ok: (r, t) => Math.floor((r.progress || 0) * 100) >= t },
  quartet: { text: t => `Land ${t} Quartet${t > 1 ? 's' : ''}`, mk: b => (b < 8 ? 1 : 2), ok: (r, t) => (r.quartets || 0) >= t },
  groove: { text: t => `Reach groove ${t}`, mk: b => (b < 8 ? 6 : 10), ok: (r, t) => (r.groove || 0) >= t },
  chest: { text: t => `Open ${t} chest${t > 1 ? 'es' : ''}`, mk: () => 1, ok: (r, t) => (r.chests || 0) >= t },
  picks: { text: t => `Pick ${t} upgrades`, mk: b => (b < 6 ? 3 : 5), ok: (r, t) => (r.picks || 0) >= t },
  bombs: { text: t => `Pop ${t} bomb${t > 1 ? 's' : ''}`, mk: () => 2, ok: (r, t) => (r.bombs || 0) >= t },
  clear: { text: () => 'Clear the stage', mk: () => 1, ok: r => !!r.won },
};
export const goalText = go => POOL[go.k].text(go.t);

// ---- the save field
export const g16Default = () => ({ day: 0, set: 0, goals: [], streak: { n: 0, last: 0, rest: -1 }, best: 0, done: 0 });
export function sanitizeG16(raw) {
  const s = g16Default(); if (!raw || typeof raw !== 'object') return s;
  s.day = num(raw.day); s.set = num(raw.set); s.best = num(raw.best); s.done = num(raw.done);
  if (Array.isArray(raw.goals)) s.goals = raw.goals.slice(0, 3).filter(x => x && POOL[x.k]).map(x => ({ k: String(x.k), t: Math.max(1, num(x.t, 1)), d: x.d ? 1 : 0 }));
  const st = raw.streak && typeof raw.streak === 'object' ? raw.streak : {};
  s.streak = { n: num(st.n), last: num(st.last), rest: Number.isFinite(st.rest) ? Math.floor(st.rest) : -1 };
  return s;
}
export const ensureG16 = save => { if (!save.goals16 || !Array.isArray(save.goals16.goals)) save.goals16 = sanitizeG16(save.goals16); return save.goals16; };

const hash = n => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0; x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0; return (x ^ (x >>> 16)) >>> 0; };
export function makeSet(day, set, basis) {
  const keys = Object.keys(POOL), out = [], b = Math.max(1, num(basis, 1));
  let h = hash(num(day) * 131 + num(set) * 7 + 1);
  while (out.length < 3) { const k = keys[h % keys.length]; h = hash(h + 17); if (out.some(x => x.k === k)) continue; if (k === 'clear' && out.length < 2 && h % 2) continue; out.push({ k, t: POOL[k].mk(b), d: 0 }); }
  return out;
}
// Called when a run starts: keep the open set, or deal a fresh one (new day, or the last set was finished).
export function dealGoals(save, day, basis) {
  const s = ensureG16(save);
  if (s.day !== day || s.goals.length !== 3 || s.goals.every(x => x.d)) { if (s.day === day && s.goals.length === 3) s.set++; s.day = day; s.goals = makeSet(day, s.set, basis); }
  return s.goals;
}
export const goalReward = (basis, setDone) => (setDone ? 100 + 10 * Math.min(40, basis) : 25 + 5 * Math.min(40, basis));
// Called on the result: tick what this run did. Returns { ticked: [goal...], set: bool, beats }.
export function checkGoals(save, r, basis) {
  const s = ensureG16(save), out = { ticked: [], set: false, beats: 0 };
  if (!r || r.mode === 'pig' || r.mode === 'inv' || s.goals.length !== 3) return out;
  for (const go of s.goals) if (!go.d && POOL[go.k].ok(r, go.t)) { go.d = 1; out.ticked.push(go); out.beats += goalReward(basis, false); s.done++; }
  if (out.ticked.length && s.goals.every(x => x.d)) { out.set = true; out.beats += goalReward(basis, true); }
  save.beats += out.beats;
  return out;
}

// ---- the forgiving streak: a day counts when you finish a run. One missed day per week is forgiven (a rest day).
export function streakInfo(save, day) {
  const st = ensureG16(save).streak, gap = day - st.last;
  const alive = st.n > 0 && (gap <= 1 || (gap === 2 && st.rest !== weekOf(day - 1)));
  return { n: alive ? st.n : 0, today: st.last === day, restReady: st.rest !== weekOf(day), saved: alive && gap === 2 };
}
export function bumpStreak(save, day) {
  const s = ensureG16(save), st = s.streak; if (st.last === day) return { n: st.n, new: false, rested: false };
  const gap = day - st.last; let rested = false;
  if (st.n > 0 && gap === 1) st.n++;
  else if (st.n > 0 && gap === 2 && st.rest !== weekOf(day - 1)) { st.n++; st.rest = weekOf(day - 1); rested = true; }
  else st.n = 1;
  st.last = day; s.best = Math.max(s.best, st.n);
  return { n: st.n, new: true, rested };
}

// ---- DOM: the start-of-run card, the hub strip and the result chip
let cardEl = null, cardT = 0;
export function showRunGoals(save, day, reduce, mut = true) {
  try {
    clearTimeout(cardT); const goals = ensureG16(save).goals; if (goals.length !== 3) return;
    if (!cardEl) { cardEl = document.createElement('div'); cardEl.id = 'goals16i'; cardEl.setAttribute('role', 'status'); document.body.appendChild(cardEl); }
    const m = weeklyMutator(day), sk = streakInfo(save, day);
    cardEl.className = reduce ? 'calm' : '';
    cardEl.innerHTML = (mut ? `<b>${m.icon} ${esc(m.name)}: ${esc(m.text)}</b>` : '') + goals.map(x => `<span class="${x.d ? 'on' : ''}"><i>${x.d ? '✓' : '○'}</i>${esc(goalText(x))}</span>`).join('') + (sk.n ? `<em>Streak ${sk.n} day${sk.n > 1 ? 's' : ''}${sk.restReady ? ', rest day ready' : ''}</em>` : '');
    cardEl.classList.remove('on'); void cardEl.offsetWidth;
    cardT = setTimeout(() => { if (!cardEl) return; cardEl.classList.add('on'); cardT = setTimeout(() => { if (cardEl) cardEl.classList.remove('on'); }, 4200); }, 2300);   // after the stage banner has passed
  } catch (e) { /* ignore */ }
}
export function hideRunGoals() { clearTimeout(cardT); if (cardEl) cardEl.classList.remove('on'); }

export function hubStripHTML(save, day, mut = true) {
  const m = weeklyMutator(day), sk = streakInfo(save, day), s = ensureG16(save);
  return (mut ? `<div class="w16-mut"><i>${m.icon}</i><span><b>${esc(m.name)}</b><em>${esc(m.text)}</em></span></div>` : '') +
    `<div class="w16-st"><b>🔥 ${sk.n}</b><em>${sk.n ? (sk.today ? 'day streak, played today' : 'day streak: play today') : 'play a stage to start a streak'}${sk.n ? (sk.restReady ? ' · rest day ready' : ' · rest day used') : ''}${s.best > 1 ? ' · best ' + s.best : ''}</em></div>`;
}
export function renderHubStrip(save, day, anchor, mut = true) {
  try {
    let el = document.getElementById('wk16i');
    if (!el) { if (!anchor || !anchor.parentNode) return; el = document.createElement('div'); el.id = 'wk16i'; anchor.parentNode.insertBefore(el, anchor); }
    el.innerHTML = hubStripHTML(save, day, mut);
  } catch (e) { /* ignore */ }
}
export function resultChipHTML(res, st) {
  if (!res || (!res.ticked.length && !(st && st.new && st.n > 1))) return '';
  const parts = [];
  if (res.ticked.length) parts.push(`Goals: ${res.ticked.map(x => esc(goalText(x))).join(', ')} (+${res.beats} Beats${res.set ? ', set done' : ''})`);
  if (st && st.new && st.n > 1) parts.push(st.rested ? `Streak ${st.n} saved by your rest day` : `Streak ${st.n} days`);
  return `<div class="g16-chip">${parts.join(' · ')}</div>`;
}
