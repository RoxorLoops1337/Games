// COMBAT presentation helpers for js/fightview.js: the announcer (subtitled barks), the one-time fight tutorial, the stamina strip and status icons on nameplates,
// the blindfold veil and the hazard names. No sim access beyond reading units; nothing here touches the random stream (barks use a counter, not rnd()).
const PREF_KEY = 'ludus_maximus_3d_prefs';
const L = () => globalThis.LM, D = () => globalThis.LM_D;
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
export const barksOn = () => { try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}').barks !== false; } catch (e) { return true; } };

// ---------------------------------------------------------------- announcer
// Short, period flavoured lines from the editor (the man who stages the games) and the crowd. Text only. Throttled: one line per 4.5 s, a key moment may cut in after 1.8 s.
const BARKS = {
  open:      ['The editor raises his arm: let the games begin!', 'Citizens of Rome, behold the sand!', 'The horns sound. Fight, and fight well!'],
  blood:     ['First blood to {a}!', 'The sand drinks first. {a} has struck.', 'A red mark on the sand. {a} draws first blood!'],
  parry:     ['A parry! {a} turns the blade aside.', 'Well met! {a} reads the blow.', 'The crowd gasps: a perfect parry by {a}!'],
  hazard:    ['The arena itself claims {a}!', 'The floor takes {a}. Fortune is a fickle goddess.', 'Not the blade but the sand has killed {a}.'],
  last:      ['{a} stands alone!', 'One man left on his feet: {a}!', 'The crowd is on its feet for {a}!'],
  enter:     ['Another challenger: {a} walks onto the sand!', '{a} enters. No rest for the weary!', 'The gate opens for {a}!'],
  tag:       ['A tag! {a} takes the sand.', '{a} is in, fresh and eager!', 'The partners trade places. {a} steps in.'],
  winded:    ['{a} is blowing hard.', 'Look at {a} heave! The legs are going.', '{a} is spent. Press him!'],
  gasp:      ['{a} falls!', 'Down goes {a}!', 'The sand receives {a}.'],
  haz:       ['Beware the {h}!', 'The {h} stirs. Mind your feet!', 'Clear the {h}, you fools!'],
  blind:     ['They fight hooded. Listen, gladiators, listen!', 'No eyes tonight, only ears.'],
  nets:      ['Nets in the air!', 'Trident and net: the old way.'],
  chain:     ['Iron binds them. Neither may flee.', 'Chained wrist to wrist, to the end!'],
  roll:      ['A nimble roll from {a}!', '{a} slips the blow like smoke.'],
};
export function createAnnouncer(fv) {
  const box = el('div', 'fv-cap'); box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); const who = el('b', 'fv-cap-who'), txt = el('span', 'fv-cap-t'); box.append(who, txt); box.style.display = 'none'; fv.hud.append(box);
  const A = { n: 0, last: -9, hide: 0, said: new Set(), seq: 0, blood: false, lastHaz: -9, hazPriorT: -9, hazDst: '', winCool: {} };
  A.reset = () => { A.last = -9; A.said.clear(); A.blood = false; A.hazPriorT = -9; A.hazDst = ''; box.style.display = 'none'; A.winCool = {}; A.seq = 0; };
  function say(kind, name, who_, pri, hn) {
    if (!barksOn() || fv.replaying || fv.silent) return; const now = fv.t, gap = pri > 1 ? 1.8 : 4.5; if (now - A.last < gap) return;
    const list = BARKS[kind]; if (!list) return; const line = list[(A.seq++) % list.length].replace('{a}', name || 'the fighter').replace('{h}', hn || 'trap');
    A.last = now; who.textContent = who_ === 'crowd' ? 'The crowd' : 'The editor'; txt.textContent = line; box.style.display = ''; box.classList.remove('in'); void box.offsetWidth; box.classList.add('in'); A.hide = now + 2.9;
  }
  A.say = say;
  A.tick = () => { if (A.hide && fv.t > A.hide) { A.hide = 0; box.style.display = 'none'; } };
  // called from FightView.onEvent for every sim event
  A.event = (e, F) => {
    const un = (id) => (id ? F.units.find((u) => u.id === id) : null);
    switch (e.k) {
      case 'hit': { const d = un(e.dst), s = un(e.src);
        if (e.hz && d) { A.hazPriorT = fv.t; A.hazDst = d.id; break; }
        if (!A.blood && e.dmg > 0 && s && !e.hz) { A.blood = true; say('blood', s.name, 'editor', 2); } break; }
      case 'parry': { const d = un(e.dst); if (d) say('parry', d.name, 'crowd', 2); break; }
      case 'roll': { const s = un(e.src); if (s && s.side === 'A') { if (!A.winCool.roll || fv.t - A.winCool.roll > 25) { A.winCool.roll = fv.t; say('roll', s.name, 'crowd', 1); } } break; }
      case 'down': { const d = un(e.dst); if (!d) break; if (!e.src && fv.t - A.hazPriorT < 0.6 && A.hazDst === d.id) { say('hazard', d.name, 'editor', 3); break; }
        const left = F.units.filter((u) => u.side === d.side && !u.down && !u.out);
        if (left.length === 1 && !F.units.some((u) => u.side === d.side && u.out && u.hp > 0)) { const o = left[0]; say('last', o.name, 'crowd', 2); } else say('gasp', d.name, 'crowd', 1); break; }
      case 'laststand': { const d = un(e.dst); if (d) say('last', d.name, 'crowd', 3); break; }
      case 'enter': { const d = un(e.dst); if (d) say(e.how === 'tag' ? 'tag' : 'enter', d.name, 'editor', 3); break; }
      case 'winded': { const d = un(e.dst); if (d && !A.said.has('w' + d.id)) { A.said.add('w' + d.id); say('winded', d.name, 'editor', 1); } break; }
      case 'tele': if (e.haz && e.hzk) { const H = (L().HAZ || {})[e.hzk]; if (!A.said.has('h' + e.hzk)) { A.said.add('h' + e.hzk); say('haz', '', 'editor', 2, H ? H.n.toLowerCase() : 'trap'); } } break;
      default: break;
    }
  };
  A.opening = (F) => { const b = F.meta && F.meta.bout; if (b && BARKS[b]) say(b, '', 'editor', 3); else say('open', '', 'editor', 3); };
  A.dispose = () => box.remove();
  return A;
}

// ---------------------------------------------------------------- nameplate extras: stamina strip and status icons
const ICON = {
  stun:   { c: '#f2c14e', t: 'Stunned', d: 'M12 2l2.6 6.4L21 9l-5 4.4L17.5 20 12 16.6 6.5 20 8 13.4 3 9l6.4-.6z' },
  slow:   { c: '#6aa8d8', t: 'Slowed', d: 'M4 6l8 6-8 6zM13 6l8 6-8 6z' },
  bleed:  { c: '#d2412b', t: 'Bleeding', d: 'M12 2c4 5 7 8.5 7 12a7 7 0 01-14 0c0-3.5 3-7 7-12z' },
  blind:  { c: '#b9b2a2', t: 'Blinded', d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 100 6 3 3 0 000-6zM3 3l18 18' },
  guard:  { c: '#9a6ad8', t: 'Guarding', d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.500-2-8-6-8-11V5z' },
  netted: { c: '#22a58f', t: 'Netted', d: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18' },
  rage:   { c: '#e8742a', t: 'Raging', d: 'M13 2c1 4 5 6 5 11a6 6 0 01-12 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 3-10z' },
  expo:   { c: '#d2412b', t: 'Exposed', d: 'M12 3l10 18H2zM12 10v5M12 17.5v1' },
  tired:  { c: '#e0b04a', t: 'Tired', d: 'M4 14c3-6 5-6 8-2s5 4 8-2M4 19h16' },
  winded: { c: '#d2412b', t: 'Winded', d: 'M3 12h12M3 7h9M3 17h9M18 8a3 3 0 110 6' },
  taunt:  { c: '#e0b04a', t: 'Taunting', d: 'M12 3v10M12 17v3' },
  air:    { c: '#f5ead2', t: 'Launched', d: 'M12 3l6 7h-4v11h-4V10H6z' },
};
const NS = 'http://www.w3.org/2000/svg';
export function addPlateExtras(plate, u) {
  if (u.beast && !u.stM) return null;
  const sta = el('div', 'fv-sta'); sta.append(el('i')); const chips = el('div', 'fv-chips'); plate.append(sta, chips); plate._x = { sta, fill: sta.firstChild, chips, key: '', pc: -1, shown: {} };
  if (!(u.stM > 0)) sta.style.display = 'none'; return plate._x;
}
const chipEl = (id) => { const I = ICON[id], s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', '13'); s.setAttribute('height', '13'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', I.d); p.setAttribute('fill', id === 'blind' || id === 'netted' || id === 'tired' || id === 'winded' || id === 'taunt' ? 'none' : 'currentColor'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round'); s.append(p); const w = el('span', 'fv-chip fv-chip-' + id); w.style.color = I.c; w.title = I.t; w.setAttribute('role', 'img'); w.setAttribute('aria-label', I.t); w.append(s); return w; };
/** refresh the stamina strip (whole percent) and the status icons (only when the set changes). cheap enough to call every few frames */
export function updatePlateExtras(plate, u) {
  const x = plate._x; if (!x) return; const s = u.s;
  if (u.stM > 0) { const pc = Math.round(100 * u.sta / u.stM), st = u.wndT > 0 ? 2 : u.sta < 25 ? 1 : 0; if (x.pc !== pc || x.st !== st) { x.pc = pc; x.fill.style.width = pc + '%'; if (x.st !== st) { x.st = st; x.sta.classList.toggle('low', st === 1); x.sta.classList.toggle('winded', st === 2); } } }
  const mask = (s.stun ? 1 : 0) | (s.slow ? 2 : 0) | (s.bleed ? 4 : 0) | (s.blind ? 8 : 0) | (s.guard ? 16 : 0) | (s.netted ? 32 : 0) | (s.rage || s.frenzy ? 64 : 0) | (s.expo ? 128 : 0) | (u.wndT > 0 ? 256 : u.stM > 0 && u.sta < 25 ? 512 : 0) | (s.air ? 1024 : 0) | (s.taunt ? 2048 : 0);
  if (mask === x.key) return; x.key = mask; x.chips.textContent = '';
  const add = (id) => x.chips.append(chipEl(id));
  if (mask & 1) add('stun'); if (mask & 1024) add('air'); if (mask & 256) add('winded'); else if (mask & 512) add('tired'); if (mask & 2) add('slow'); if (mask & 4) add('bleed'); if (mask & 8) add('blind'); if (mask & 16) add('guard'); if (mask & 32) add('netted'); if (mask & 64) add('rage'); if (mask & 128) add('expo'); if (mask & 2048) add('taunt');
}

// ---------------------------------------------------------------- blindfold veil: dark everywhere but a circle around your fighters
export function createVeil(fv) {
  const v = el('div', 'fv-veil'); v.style.display = 'none'; fv.hud.prepend(v); const V = { on: false, n: 0 };
  V.set = (on) => { V.on = !!on; v.style.display = on ? '' : 'none'; };
  V.frame = (F, camera, w, h) => {
    if (!V.on || (V.n++ & 1)) return; let ux = 0, uy = 0, k = 0; const P = V._p || (V._p = { x: 0, y: 0, z: 0 });
    for (const f of fv.fm.values()) { const u = f.u; if (u.side !== 'A' || u.down) continue; ux += f.X; uy += f.Z; k++; }
    if (!k) return; ux /= k; uy /= k;
    const a = fv.projectPx(ux, 1.2, uy); if (!a) return; const ax = a.x, ay = a.y;
    const b = fv.projectPx(ux + 4.2, 1.2, uy), rb = b ? Math.hypot(b.x - ax, b.y - ay) : 0, c = fv.projectPx(ux, 1.2, uy + 4.2), rc = c ? Math.hypot(c.x - ax, c.y - ay) : 0;
    const r = Math.max(70, rb, rc); v.style.setProperty('--bx', ax.toFixed(0) + 'px'); v.style.setProperty('--by', ay.toFixed(0) + 'px'); v.style.setProperty('--br', r.toFixed(0) + 'px');
  };
  V.dispose = () => v.remove(); return V;
}

// ---------------------------------------------------------------- first fight tutorial (health, stamina, ultimates, orders, direct control). Once, skippable.
const STEPS = [
  { h: 'Health', p: 'The red bar under a name is health. At zero that fighter is down. Lose all of yours and the bout is lost.' },
  { h: 'Stamina', p: 'The thin gold bar under health is stamina. Swings, rolls and blocks spend it. Run dry and a fighter is winded: slow, open, and easy to hit. Heavy armour tires faster.' },
  { h: 'Ultimates', p: 'The round buttons at the bottom are ultimates, one set per fighter. They fill with time and the roar of the crowd. Tap one when it glows. Auto ult casts them for you.' },
  { h: 'Orders', p: 'Tap one of your fighters, then give an order: Press, Hold, Fall back or Guard. Orders cost something, and the foe uses them too. Keys 1 to 6.' },
  { h: 'Direct control', p: 'You can take hold of one fighter yourself: stick to move, Strike, Heavy, Roll to dodge, Block to guard. Block just before a blow lands and you parry it. It is optional and off by default.', dc: true },
];
export function maybeTutorial(fv, F) {
  const game = globalThis.__LM3D && globalThis.__LM3D.game, S = game && game.S; if (!S || !S.flags) return false;
  const QS = new URLSearchParams(location.search); if ((QS.get('notut') && QS.get('notut') !== '0') || QS.get('demo') || QS.get('manual')) return false;
  if (S.flags.combatTut || fv.replaying || F.quiet || fv.opts.noTut) return false;
  return true;
}
export function showTutorial(fv, onDone) {
  const game = globalThis.__LM3D && globalThis.__LM3D.game, S = game && game.S; let i = 0;
  const wrap = el('div', 'fv-ctut'); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'How the arena works');
  const card = el('div', 'fv-ctut-card'), kick = el('small', 'fv-ctut-k'), h = el('h3'), p = el('p'), dots = el('div', 'fv-ctut-dots'), row = el('div', 'fv-ctut-row'), extra = el('div', 'fv-ctut-x');
  const skip = el('button', 'fv-ctut-btn ghost', 'Skip'), back = el('button', 'fv-ctut-btn ghost', 'Back'), next = el('button', 'fv-ctut-btn gold', 'Next'); for (const b of [skip, back, next]) b.type = 'button';
  row.append(skip, back, next); card.append(kick, h, p, extra, dots, row); wrap.append(card); fv.hud.append(wrap); fv.hold = true;
  const close = () => { if (!wrap.isConnected) return; wrap.remove(); fv.hold = false; document.removeEventListener('keydown', key, true); if (S && S.flags) { S.flags.combatTut = 1; try { game.save && game.save(); } catch (e) { /* save is optional */ } } onDone && onDone(); };
  const paint = () => {
    const s = STEPS[i]; kick.textContent = `${i + 1} of ${STEPS.length}`; h.textContent = s.h; p.textContent = s.p; back.style.visibility = i ? '' : 'hidden'; next.textContent = i === STEPS.length - 1 ? 'To the sand' : 'Next';
    dots.textContent = ''; STEPS.forEach((_, k) => dots.append(el('i', k === i ? 'on' : ''))); extra.textContent = '';
    if (s.dc) { const on = !!(globalThis.LM3D_DC && globalThis.LM3D_DC.on); const b = el('button', 'fv-ctut-btn', on ? 'Direct control is on for your next fight' : 'Turn on for my next fight'); b.type = 'button'; b.disabled = on; b.onclick = () => { import('./directcontrol.js').then((m) => { m.writeDc(true, undefined); paint(); }); }; extra.append(b); }
  };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); e.stopPropagation(); go(); } };
  const go = () => { if (i >= STEPS.length - 1) close(); else { i++; paint(); } };
  skip.onclick = close; back.onclick = () => { if (i) { i--; paint(); } }; next.onclick = go; document.addEventListener('keydown', key, true); paint(); setTimeout(() => next.focus && next.focus(), 30);
  return { close, el: wrap };
}
export function hazName(kind) { const H = (L().HAZ || {})[kind]; return H ? H.n : kind; }
