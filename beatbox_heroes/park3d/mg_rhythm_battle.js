// Rhythm game: BATTLE helpers. A tiny camera director (shot lists with eased blends over venue camera presets), the judge score maths and the
// per-round opponent turn builder. Pure logic (no THREE objects kept), used by mg_rhythm.js. Same rules as the 2D game (beatbox_heroes/rhythm.js).
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const mix = (a, b, e) => a + (b - a) * e;

// Camera director. shots: [{ cam: { pos:[x,y,z], look:[x,y,z], fov }, blend: seconds to arrive, hold: seconds to stay, sway: 0..1 }]. update(dt) -> { p, l, fov, sway } | null.
// After the last shot the camera stays on it until clear() or a new play(); play(list, { clearAtEnd: true }) clears it after the last hold (the game camera takes over smoothly).
export function createDirector() {
  const D = { shots: [], i: -1, t: 0, from: null, cur: null, active: false, name: '' };
  const snap = (c, sway) => ({ p: c.pos.slice(), l: c.look.slice(), fov: c.fov || 0, sway: sway === undefined ? 0 : sway });
  function enter(i) { const s = D.shots[i]; D.i = i; D.t = 0; D.from = D.cur ? { p: D.cur.p.slice(), l: D.cur.l.slice(), fov: D.cur.fov, sway: D.cur.sway } : snap(s.cam, s.sway); D.to = snap(s.cam, s.sway); D.name = s.name || ''; }
  D.play = (list, o) => { D.shots = list.filter((s) => s && s.cam); D.endClear = !!(o && o.clearAtEnd); if (!D.shots.length) { D.active = false; return D; } D.active = true; enter(0); if (!D.shots[0].blend) { D.cur = snap(D.shots[0].cam, D.shots[0].sway); } return D; };
  D.clear = () => { D.active = false; D.cur = null; D.shots = []; D.i = -1; };
  D.update = (dt) => {
    if (!D.active) return null; const s = D.shots[D.i]; D.t += dt; const blend = s.blend || 0, e = blend > 0 ? ease(Math.min(1, D.t / blend)) : 1, f = D.from, to = D.to;
    D.cur = { p: [mix(f.p[0], to.p[0], e), mix(f.p[1], to.p[1], e), mix(f.p[2], to.p[2], e)], l: [mix(f.l[0], to.l[0], e), mix(f.l[1], to.l[1], e), mix(f.l[2], to.l[2], e)], fov: mix(f.fov || to.fov, to.fov, e) || to.fov, sway: mix(f.sway, to.sway, e) };
    if (D.t >= blend + (s.hold || 0)) { if (D.i < D.shots.length - 1) enter(D.i + 1); else if (D.endClear) { const c = D.cur; D.clear(); return c; } }
    return D.cur;
  };
  D.done = () => D.active && D.i === D.shots.length - 1 && D.t >= (D.shots[D.i].blend || 0);
  return D;
}

// Opponent turn: 2 bars of the rival's own chart; each note is hit with probability q (Core.opponentRound). Times in seconds from the turn start (same as the 2D game).
export function buildOppTurn(Core, opp, round) {
  const q = Core.opponentRound ? Core.opponentRound(opp, round, Math.random) : Math.max(0.15, Math.min(0.99, (opp.skill || 0.5) + (Math.random() - 0.5) * 0.16));
  const ch = Core.makeChart(4242 + round * 31 + (opp.tier || 0), { bars: 2, difficulty: 0.3 + (opp.skill || 0.5) * 0.5 }), spb = 60 / (opp.bpm || 100);
  const notes = ch.map((n, i) => ({ id: 9000 + i, lane: n.lane, time: 1.2 + n.beat * spb, state: 0, hit: Math.random() < q, done: false }));
  return { q, notes, end: 1.2 + 8 * spb + 1.0, spb };
}

// What the judge desks and the DOM show for one vote. Core.resolveBattle votes carry the two totals over 3 rounds (about 0..3.6 each); the desk shows the player's mark out of 10.
export function voteView(v, J) {
  const n = (x) => Math.max(0, Math.min(10, x / 3 * 10)), y = n(v.player), o = n(v.opp);
  return { forPlayer: !!v.forPlayer, name: v.name || (J && J.name) || '', quip: (J && J.quip) || '', score: Math.round(y * 10) / 10, youTxt: y.toFixed(1), oppTxt: o.toFixed(1) };
}

// style clash line (same wording as the 2D banner)
export function clashLine(Core, mine, theirs) {
  const m = Core.styleMul ? Core.styleMul(mine, theirs) : 1;
  return (mine || '').toUpperCase() + ' vs ' + (theirs || '').toUpperCase() + (m > 1 ? ': YOU WIN THE STYLE CLASH' : m < 1 ? ': THEY WIN THE STYLE CLASH' : ': EVEN');
}
