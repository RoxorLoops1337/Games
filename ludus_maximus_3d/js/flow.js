// The weekly flow: training report -> level picks -> due fights (prep, augment, 3D fight, results) -> week summary -> events.
// Ported from ludus_maximus/play.js on top of the same sim (core/sim.js), presented with the 3D arena and the Roman UI kit.
import * as Cer from './ceremonies.js'; // ONBOARDING
import * as Bracket from './bracket.js'; // BRACKET: marble bracket tablet
import { U, h, fmt, fmtSt, chip, itemCard, gladRow, section, para, kv, grid, styleBadge, ordinal, RAR_KEY } from './uihelpers.js';

const D = () => globalThis.LM_D, L = () => globalThis.LM, lm0 = L;
const ok = (label = 'Continue', variant = 'gold') => [{ label, value: 'ok', variant }];

export async function advanceWeek(ctx) {
  const S = ctx.S, lm = L(), wk = S.week;
  const rep = lm.weekTrain(S); ctx.save(); ctx.refresh();
  await trainingReport(ctx, rep, wk);
  await pickPends(ctx);
  for (const key of lm.dueKeys(S)) {
    const ev = lm.eventByKey(S, key), en = S.entries[key];
    const gl = en.ids.map((id) => ctx.gOf(id)).filter(Boolean);
    if (!ev || gl.length !== en.ids.length || !lm.entryReady(S, en)) { lm.withdraw(S, key); U.toast('An entry was cancelled: fighter unavailable. Fee refunded.', { kind: 'bad' }); continue; }
    lm.entryMarkHurt(S, en); // WAVE3: fighters sent hurt
    await runEvent(ctx, ev, gl, en); lm.hurtClear(S);
    ctx.save(); ctx.refresh();
  }
  ctx.game.scene === 'fight' && ctx.game.returnToHub();
  const fin = lm.weekFinish(S); ctx.save(); ctx.refresh();
  await weekSummary(ctx, fin, wk);
  if (fin.story && fin.story.length) await stories(ctx, fin.story);
  if (fin.recap && fin.recap.prizes) await prizePick(ctx, fin.recap.prizes);
  await trophies(ctx);
  await rivalryEvent(ctx);
  await pendingEvent(ctx);
  await (await import('./screens/infirmary.js')).woundCall(ctx); await (await import('./screens/sponsors.js')).patronFlow(ctx); // WAVE2: wounds decision, patron beats and offers
}

// ------------------------------------------------------------------ small dialogs
async function trainingReport(ctx, rep, wk) {
  const S = ctx.S, body = h('div');
  rep.lines.forEach((l) => { const g = ctx.gOf(l.id); const row = h('div', '', [styleBadge(g.style, 34), h('div', '', [h('b', '', l.name), h('div', '', l.txt)])]); row.style.cssText = 'display:flex;gap:10px;align-items:center;margin:6px 0;font:600 13px/17px system-ui,sans-serif;color:#33243a'; body.append(row); });
  if (rep.menuCost) body.append(para(`Kitchen: -${fmt(rep.menuCost)} gold`));
  const due = L().dueKeys(S).length;
  await ctx.ask({ title: `Week ${wk} training`, body, actions: ok(due ? 'To the arena!' : 'Continue', 'gold'), dismiss: 'ok' });
}

const PICKT = {
  tech: ['New technique', 'Learn', (t) => `${D().TECHS[t].cd}s. ${D().TECHS[t].d}`, (t) => D().TECHS[t].n],
  mast: ['New mastery', 'Take', (t) => D().MASTS[t].d, (t) => D().MASTS[t].n],
  ult: ['Second ultimate!', 'Learn', (t) => `${D().ULTS[t].cd}s. ${D().ULTS[t].d}`, (t) => D().ULTS[t].n],
};
export async function pickPends(ctx) {
  for (const g of ctx.S.glads) {
    let guard = 0;
    if (g.pend && g.pend.length) Cer.levelUp(ctx, g, g.lvl); // ONBOARDING: fanfare (deduped per level)
    while (g.pend && g.pend.length && guard++ < 8) {
      const p0 = g.pend[0], M = PICKT[p0.t];
      const body = h('div', '', [para(`Level ${g.lvl}. Choose one for good.`), ...p0.o.map((t) => { const c = h('div', '', [h('b', '', M[3](t)), h('div', '', M[2](t))]); c.style.cssText = 'padding:6px 8px;margin:4px 0;font:600 13px/17px system-ui,sans-serif;color:#33243a;background:rgba(255,255,255,.35);border-radius:8px'; return c; })]);
      const t = await ctx.ask({ title: `${g.name}: ${M[0]}`, body, actions: p0.o.map((t) => ({ label: `${M[1]} ${M[3](t)}`, value: t })), dismiss: p0.o[0] });
      L().choosePick(g, t);
    }
  }
}

async function weekSummary(ctx, fin, wk) {
  if (fin.recap) await Cer.seasonFinale(ctx, fin); // ONBOARDING: season finale ceremony
  const S = ctx.S, body = h('div', '', [kv('Upkeep paid', '-' + fmt(fin.upkeep)), kv('Market income', '+' + fmt(fin.income)), kv('Gold now', fmt(S.gold))]);
  if (fin.news && fin.news.length) { const c = h('div', '', [h('b', '', 'TOWN CRIER'), ...fin.news.map((n) => h('div', '', n))]); c.style.cssText = 'margin:10px 0;padding:8px 10px;border-radius:8px;background:#f2e2b6;color:#33243a;font:600 13px/18px system-ui,sans-serif'; body.append(c); }
  (fin.notes || []).forEach((n) => body.append(para(n)));
  if (fin.season) body.append(para(`Season ${fin.season} begins! Rivals have grown stronger. New prizes, new faces.`));
  if (fin.recap) { const r = fin.recap; body.append(section(`Season ${fin.season - 1} recap`), para(`Record: ${r.wins}W ${r.losses}L. Fame gained: ${r.fame}. Tournaments won: ${r.tour}.${r.mvp ? ` MVP: ${r.mvp.name} with ${r.mvp.w} win${r.mvp.w > 1 ? 's' : ''}.` : ''}${r.rival ? ` Rivals of the Year: ${r.rival.a} and ${r.rival.b} (+${r.rival.fame} fame).` : ''}`)); }
  await ctx.ask({ title: `Week ${wk} done`, body, actions: ok(), dismiss: 'ok' });
}

async function stories(ctx, list) {
  for (const x of list) {
    ctx.sfx('levelUp');
    const body = h('div', '', [styleBadge(x.g.style, 56), para(`${x.st.n}: ${x.st.text}`), para(`Goal reached! ${x.g.name} is now ${x.st.rew.title}.`), h('div', '', [chip(`+${x.st.rew.v} ${D().SA[x.st.rew.stat]}`), chip(`+${x.st.rew.fame} fame`, '#7b4fb8')])]);
    await ctx.ask({ title: `${x.g.name}'s story`, body, actions: ok('Wonderful'), dismiss: 'ok' });
  }
}

async function prizePick(ctx, prizes) {
  ctx.sfx('levelUp');
  const body = h('div', '', [para('The crowd honors your season. Choose one reward:')]);
  const wrap = h('div'); body.append(wrap);
  const v = await new Promise((res) => { const m = ctx.sheet({ title: 'Season prize', body, onClose: () => res(0) }); prizes.forEach((it, i) => wrap.append(itemCard(it, { onClick: () => { res(i); m.close(); } }))); });
  const it = prizes[+v] || prizes[0]; L().takePrize(ctx.S, it); ctx.save(); U.toast('Added: ' + it.name, { kind: 'good', ico: 'check' });
}

async function trophies(ctx) {
  const t = L().checkTrophies(ctx.S); if (!t.length) return; ctx.save();
  if (await Cer.trophy(ctx, t) != null) { ctx.refresh(); return; } // ONBOARDING: ceremony; falls back to the plain dialog below if it failed
  ctx.sfx('levelUp');
  const body = h('div', '', t.map((x) => h('div', '', [h('b', '', x.n), h('div', '', x.d), h('div', '', [x.r.gold ? chip('+' + x.r.gold + ' gold', '#b8803a') : '', x.r.fame ? chip('+' + x.r.fame + ' fame', '#7b4fb8') : '', x.r.laurels ? chip('+' + x.r.laurels + ' laurels', '#5b7a3a') : ''])])));
  body.style.cssText = 'font:600 14px/20px system-ui,sans-serif;color:#33243a';
  await ctx.ask({ title: t.length > 1 ? 'Trophies earned!' : 'Trophy earned!', body, actions: ok('Shiny!'), dismiss: 'ok' }); ctx.refresh();
}

async function rivalryEvent(ctx) {
  const S = ctx.S; if (!S.pendingRiv) return; const [ia, ib] = S.pendingRiv, a = ctx.gOf(ia), b = ctx.gOf(ib);
  if (!a || !b) { S.pendingRiv = null; return; }
  const body = h('div', '', [para(`${a.name} and ${b.name} keep going at each other. Something has to give.`), para('A friendly bout: nobody gets hurt. The winner gains 40 XP, the loser 20.')]);
  const c = await ctx.ask({ title: 'Rivalry boils over!', body, actions: [{ label: 'Settle it in the arena', value: 'duel', variant: 'danger' }, { label: 'Make them training partners (+20 bond)', value: 'partner', variant: 'bronze' }, { label: 'Ignore it', value: 'ignore', variant: 'ghost' }], dismiss: 'ignore' });
  let winner = null;
  if (c === 'duel') { const clone = Object.assign({}, b, { color: '#2f78c4', id: 'bout' + b.id }); const res = await fightScreen(ctx, [a], [clone], 'bal', { ev: { kind: 'spar', title: 'Rivalry Bout', league: 0, opps: [clone] } }); winner = res.win ? a.id : b.id; ctx.game.returnToHub(); }
  const out = L().rivalryResolve(S, a, b, c, winner); ctx.save(); ctx.refresh();
  await ctx.ask({ title: 'Rivalry', body: h('div', '', out.lines.map((x) => para(x))), actions: ok('Okay'), dismiss: 'ok' }); await pickPends(ctx); await trophies(ctx);
}

async function pendingEvent(ctx) { // WAVE2: named events, risk hints, costs, consequence chips (core/ext.js LM.evView)
  const S = ctx.S; if (!S.pendingEv) return; const lm = L(), E = lm.EVENTS[S.pendingEv]; if (!E) { S.pendingEv = null; return; }
  const V = lm.evView ? lm.evView(S) : null;
  const body = h('div', '', [V && V.follow ? para('Word of an earlier matter comes back to you.') : null, para(V ? V.text : E.t)]);
  const acts = V ? V.choices.map((c) => ({ label: c.l + (c.cost ? ` (${c.cost}g)` : ''), sub: c.h || (c.short ? 'You cannot afford this' : undefined), value: c.i, variant: c.i ? 'bronze' : 'gold' })) : E.c.map((c, k) => ({ label: c.l, value: k, variant: k ? 'ghost' : 'gold' }));
  const i = await ctx.ask({ title: V ? V.n : 'Event', body, actions: acts, dismiss: E.c.length - 1 });
  const msg = lm.runEvent(S, +i); ctx.save(); ctx.refresh();
  const res = h('div', '', [para(msg)]); const fx = (S.evLast && S.evLast.fx) || []; if (fx.length) res.append(h('div', '', fx.map((f) => chip(f, /-\d|hurt|Strained|ickness|gone|\dw$|Barracks full/.test(f) ? '#b5532f' : '#2b9348'))));
  if (res.lastChild && fx.length) res.lastChild.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px';
  await ctx.ask({ title: 'Result', body: res, actions: ok('Okay'), dismiss: 'ok' });
}

// ------------------------------------------------------------------ prep + augments
const STANCES = [['bal', 'gold'], ['agg', 'danger'], ['grd', 'bronze'], ['cun', 'bronze']];

/** pre-fight dialog: returns {stance, bet:{wager, mult, tricks}} (gold for bet and tricks is paid by the caller via commit) */
export async function prep(ctx, ev, gl, opps, o = {}) {
  lm0().uniqueNames && lm0().uniqueNames(gl, opps); // never "Valeria vs Valeria"
  const S = ctx.S, lm = L(), d = D(), lv = lm.scoutLevel(S), ctxA = lm.teamCtx(S, gl, 'bal');
  const st = { wager: 0, tricks: {} }, lvl = Math.round(opps.reduce((x, y) => x + y.lvl, 0) / opps.length), mult = lm.wagerMult(gl, opps, S);
  const cost = () => Object.keys(st.tricks).filter((k) => st.tricks[k]).reduce((a, k) => a + d.TRICKS.find((t) => t.id === k).cost(lvl), 0) + st.wager;
  const body = h('div');
  body.append(h('div', '', [h('b', '', gl.map((g) => g.name).join(' & ')), document.createTextNode('  vs  '), h('b', '', opps.map((x) => x.name).join(' & '))]));
  body.firstChild.style.cssText = 'text-align:center;font:800 15px/20px system-ui,sans-serif;color:#2a1a30;margin-bottom:6px';
  const a = lm.adv(gl[0].style, opps[0].style);
  const tags = h('div', '', [styleBadge(gl[0].style, 28), a > 0 ? chip('Style edge', '#2b9348') : a < 0 ? chip('Style disadvantage', '#b5532f') : chip('Even styles', '#777'), styleBadge(opps[0].style, 28)]);
  tags.style.cssText = 'display:flex;gap:8px;justify-content:center;align-items:center;margin:6px 0'; body.append(tags);
  if (o.hpf != null && o.hpf < 1) body.append(para(`Wounded: starting at ${Math.round(o.hpf * 100)}% HP`));
  if (ctxA.list && ctxA.list.length && gl.length > 1) body.append(para('Synergy: ' + ctxA.list.map((s) => `${s.n} (${s.d})`).join(', ')));
  const low = gl.filter((g) => g.en < 60); if (low.length) body.append(para(`${low.map((g) => g.name).join(', ')} ${low.length > 1 ? 'are' : 'is'} tired (energy under 60). Stats reduced.`));
  const wx = ev.key ? lm.weather(S, ev.key) : 'clear'; if (wx !== 'clear') body.append(para(`Weather: ${d.WEATHER[wx].n}. ${d.WEATHER[wx].d}`));
  if (ev.mut) body.append(para(`Mutator: ${ev.mut.n}. ${ev.mut.d}`));
  if (o.T) body.append(section('Bracket'), bracketEl(o.T));
  if (gl.length === 1) { const g = gl[0]; body.append(para(`${d.KEYSTONES[g.rune.k].n} rune. Ultimates: ${lm.ultsOf(g).map((x) => d.ULTS[x].n).join(', ')}${(S.relicOn || []).length ? ` · ${S.relicOn.length} relic(s)` : ''}`)); }
  const spend = para(''); spend.style.fontWeight = '800';
  const paint = () => { spend.textContent = cost() ? `Pre-fight spend: ${fmt(cost())} gold` : ''; };
  if (!o.pit) {
    body.append(section('The bookmaker'), para(`The crowd only knows level and style, not stats. Spot a mispriced fight and back yourself. Pays x${mult.toFixed(1)} on a win.`));
    const wr = h('div', '', [0, ...lm.wagerOptions(S)].map((v) => { const b = U.button({ label: v ? String(v) : 'No bet', variant: v === st.wager ? 'gold' : 'ghost', onClick: () => { if (v && cost() - st.wager + v > S.gold) return U.toast('Not enough gold', { kind: 'bad' }); st.wager = v; wr.childNodes.forEach((n, i) => n.classList.toggle('lx-btn-gold', [0, ...lm.wagerOptions(S)][i] === v)); paint(); } }); b.dataset.v = v; return b; }));
    wr.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'; body.append(wr);
    body.append(section('Dirty tricks'));
    d.TRICKS.forEach((t) => {
      const b = U.button({ label: `${t.n}  (${fmt(t.cost(lvl))}g)`, variant: 'ghost', block: true, onClick: () => { if (!st.tricks[t.id] && cost() + t.cost(lvl) > S.gold) return U.toast('Not enough gold', { kind: 'bad' }); st.tricks[t.id] = !st.tricks[t.id]; b.classList.toggle('lx-btn-gold', !!st.tricks[t.id]); paint(); } });
      body.append(b, para(`${t.d}${t.risk ? ` ${Math.round(t.risk * 100)}% risk of being caught.` : ''}`));
    });
  }
  body.append(spend, section('Choose a battle plan'), para('A plan reshapes your stats for this fight. It is a build choice, not a counter.'));
  const actions = STANCES.map(([id, v]) => { let odds = ''; if (lv >= 2 && gl.length * opps.length <= 6) odds = ` (${Math.round(lm.odds(S, gl, opps, id, 24) * 100)}%)`; return { label: lm.STANCES[id] + odds, sub: lm.STANCE_D[id], value: id, variant: v }; });
  const stance = await ctx.ask({ title: `${o.name ? o.name + ': ' : ''}${ev.title}`, body, actions, dismiss: 'bal' });
  const tricks = Object.keys(st.tricks).filter((k) => st.tricks[k]), spent = cost(); S.gold = Math.max(0, S.gold - spent);
  return { stance, bet: { wager: st.wager, mult, tricks } };
}

function bracketEl(T) {
  const rounds = Math.log2(T.size), names = ['Quarterfinal', 'Semifinal', 'Final'], wrap = h('div');
  wrap.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding:4px 0';
  for (let r = 0; r < rounds; r++) {
    const title = rounds === 2 ? ['Semifinal', 'Final'][r] : names[r];
    const players = r === 0 ? Array.from({ length: T.size }, (_, i) => i) : (T.hist[r - 1] || Array(T.size >> r).fill(-1)), done = r < T.hist.length;
    const col = h('div', '', [h('b', '', title)]); col.style.cssText = 'display:grid;gap:6px;min-width:110px;font:700 12px/16px system-ui,sans-serif;color:#33243a';
    for (let i = 0; i < players.length; i += 2) {
      const m = h('div'); m.style.cssText = 'border:1px solid rgba(90,31,94,.35);border-radius:6px;overflow:hidden';
      [players[i], players[i + 1]].forEach((sl) => { const p = h('div', '', sl < 0 || sl === undefined ? '?' : (sl === 0 ? 'YOU' : T.slots[sl].name)); const won = sl >= 0 && done && T.hist[r].includes(sl); p.style.cssText = `padding:3px 6px;${sl === 0 ? 'background:#f2c14e;' : ''}${done ? (won ? 'font-weight:900;' : 'opacity:.5;') : ''}`; m.append(p); });
      col.append(m);
    }
    wrap.append(col);
  }
  return wrap;
}

export async function pickAug(ctx, level, have, force, title, seed, style) {
  const S = ctx.S, lm = L(), d = D();
  let offer = seed ? lm.withRandom(seed, () => lm.augOffer(S, level, have, force)) : lm.augOffer(S, level, have, force), rerolls = 1 + lm.facPerks(S).rerolls;
  for (;;) {
    const body = h('div', '', [para(`Lasts for this fight${have && have.length ? ` (on top of ${have.length} from earlier rounds)` : ''}. Silver, Gold or Prismatic: pick one.`)]);
    const actions = offer.map((a) => ({ label: `${a.n}${style && lm.augFit(style, a) ? ' (fits your style)' : ''}`, sub: `${d.TIERS[a.t].n}. ${a.d}`, value: a.id, variant: a.t >= 2 ? 'gold' : 'bronze' }));
    if (rerolls > 0) actions.push({ label: `Reroll (${rerolls} free)`, value: 'reroll', variant: 'ghost' });
    const v = await ctx.ask({ title: title || 'Choose an augment', body, actions, dismiss: offer[0].id });
    if (v === 'reroll') { rerolls--; offer = lm.augOffer(S, level, have, force); continue; }
    return d.AUGMENTS.find((a) => a.id === v);
  }
}

function settleBets(ctx, bet, res, notes) {
  const S = ctx.S, lm = L(), d = D();
  if (bet.wager) { if (res.win) { const w = Math.round(bet.wager * bet.mult); S.gold += w; notes.push(`Bet won: +${fmt(w - bet.wager)} gold`); lm.facGain(S, 'mer', 4); ctx.sfx('coin'); } else notes.push(`Bet lost: -${fmt(bet.wager)} gold`); }
  bet.tricks.forEach((id) => { const T = d.TRICKS.find((t) => t.id === id); if (T.risk && Math.random() < T.risk) { S.fame = Math.max(0, S.fame - 15); lm.facGain(S, 'sen', -8); notes.push(`Caught ${T.n.toLowerCase()}! -15 fame, the Senate frowns`); } });
}

// ------------------------------------------------------------------ fights
export async function fightScreen(ctx, gl, opps, stance, o) {
  L().uniqueNames && L().uniqueNames(gl, opps); // idempotent: also covers fights that skip the prep dialog (rivalry bouts, replays of pit floors)
  const res = await ctx.game.playFight(gl, opps, stance, o);
  try { // WAVE3: fighters sent hurt roll whether the wound worsens (cached on res, settle reuses it)
    const lm = L(), hr = lm.hurtResolve(ctx.S, gl.map((g) => ctx.gOf(g.id) || g), res, o && o.ev && o.ev.kind);
    hr.forEach((r) => U.toast(lm.hurtLine(r), { kind: r.worse ? 'bad' : 'good' })); if (hr.length) ctx.save();
  } catch (e) { console.warn('hurt roll', e && e.message); }
  return res;
}

async function runEvent(ctx, ev, gl, en) {
  const S = ctx.S, lm = L();
  if (ev.kind === 'tourney' || ev.kind === 'grand') return runTourney(ctx, ev, gl[0]);
  const { stance, bet } = await prep(ctx, ev, gl, ev.opps, {});
  const aug = await pickAug(ctx, ev.league, [], ev.kind === 'grand', null, null, gl[0] && gl[0].style);
  const res = await fightScreen(ctx, gl, ev.opps, stance, { ev, tricks: bet.tricks, augs: [aug] });
  const rep = lm.settle(S, ev, gl, res); settleBets(ctx, bet, res, rep.notes);
  await results(ctx, ev, gl, res, rep);
  await mortalCheck(ctx, gl, res, { kind: 'event' }); // FALLEN: only deadly in Hardcore
}

async function runTourney(ctx, ev, g) {
  const S = ctx.S, lm = L(), T = lm.tourneyInit(S, ev, g); let champion = false, hype = 0, hpf = 1, odds = null; const notes = [], augs = [];
  const names = ev.size === 8 ? ['Quarterfinal', 'Semifinal', 'Final'] : ['Semifinal', 'Final'];
  for (;;) {
    const opp = lm.tourneyOpp(T), name = names[T.round];
    await Bracket.showBracket(ctx, T, { mode: 'before', name, ev }); // BRACKET: the tablet before every round (odds, favourites, your bout lit)
    const { stance, bet } = await prep(ctx, ev, [g], [opp], { name, hpf: T.hpf });
    augs.push(await pickAug(ctx, Math.min(3, ev.league + (T.round >= 1 ? 1 : 0)), augs, ev.kind === 'grand' && T.round === names.length - 1, `${name}: new augment`, null, g.style));
    const res = await fightScreen(ctx, [g], [opp], stance, { ev: Object.assign({}, ev, { title: `${ev.title}: ${name}` }), hpf: { [g.id]: T.hpf }, tricks: bet.tricks, augs: augs.slice() }); // BRACKET: the round name rides in the title (VS intro)
    settleBets(ctx, bet, res, notes);
    hype = Math.max(hype, res.hype); hpf = res.hpf[g.id]; if (odds == null) odds = res.odds;
    const r = lm.tourneyAdvance(S, T, res.win);
    const nextHpf = Math.min(1, hpf + 0.4 + (g.trait === 'hordearius' ? 0.1 : 0));
    await Bracket.showBracket(ctx, T, { mode: 'after', name, ev, won: res.win, champion: r.champion, note: res.win && !r.champion ? `${g.name} advances. Wounds carry over: next round starts at ${Math.round(nextHpf * 100)}% HP.` : '' }); // BRACKET: winners advance on the tablet
    if (res.win) {
      if (r.champion) { champion = true; break; }
      T.hpf = nextHpf;
    } else break;
  }
  const place = lm.placeOf(T, champion), res = { win: champion, place, hype, hpf: { [g.id]: hpf }, odds };
  const rep = lm.settle(S, ev, [g], res); rep.notes.push(...notes);
  await results(ctx, ev, [g], res, rep);
  if (!champion) await mortalCheck(ctx, [g], res, { kind: 'event' }); // FALLEN: only deadly in Hardcore
}

// ------------------------------------------------------------------ results
function statsEl(ctx, res) {
  if (!res || !res.F || !res.F.units) return null;
  const us = res.F.units, mx = Math.max(1, ...us.map((u) => u.dmg || 0)), box = h('div');
  us.filter((u) => u.side === 'A' && u.g && u.g.id != null && ctx.gOf(u.g.id)).forEach((u) => L().recordLife(ctx.gOf(u.g.id), u));
  us.forEach((u) => { const r = h('div', '', [h('b', '', u.name), document.createTextNode(` ${Math.round(u.dmg || 0)} dmg · ${Math.round(u.taken || 0)} taken · ${u.crits || 0} crit${u.crits === 1 ? '' : 's'}`)]); r.style.cssText = `font:600 12px/18px system-ui,sans-serif;color:${u.side === 'A' ? '#2a6a3a' : '#7a2f30'}`; const bar = U.bar({ value: u.dmg || 0, max: mx, kind: u.side === 'A' ? 'stam' : 'hp', height: 5 }); box.append(r, bar); });
  return box;
}

export async function results(ctx, ev, gl, res, rep) {
  const S = ctx.S, lm = L(), d = D(), win = res.win, isT = ev.kind === 'tourney' || ev.kind === 'grand', place = res.place;
  const ord = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 || n === 4 ? 'Semifinalist' : 'Out early');
  const body = h('div');
  const big = h('div', '', isT ? (win ? 'CHAMPION' : ord(place)) : (win ? 'VICTORY' : 'DEFEAT'));
  big.style.cssText = `text-align:center;font:900 30px/36px 'Trajan Pro','Cinzel',Georgia,serif;letter-spacing:.12em;color:${win ? '#9a6a10' : '#7a2f30'}`;
  const gold = h('div', '', [chip('+' + fmt(rep.gold) + ' gold', '#b8803a'), chip('+' + fmt(rep.fame) + ' fame', '#7b4fb8'), res.odds != null && res.odds < 0.4 && win ? chip('Underdog win!', '#2b9348') : '']);
  gold.style.cssText = 'text-align:center;margin:8px 0';
  body.append(big, gold);
  (rep.notes || []).forEach((n) => body.append(para(n)));
  (rep.fac || []).forEach((x) => body.append(para(`${x.text}${x.up ? ' New perk: ' + x.up : ''}`)));
  body.append(section('Experience'));
  rep.xp.forEach((x) => { const g = ctx.gOf(x.id); body.append(kv(g.name, `+${x.xp} XP${x.up.length ? ' · LEVEL ' + x.up[x.up.length - 1] + '!' : ''}`)); });
  const stats = statsEl(ctx, res); if (stats) body.append(section('Fight stats'), stats);
  rep.lvl.forEach((l) => body.append(para(`${ctx.gOf(l.id).name} reached LEVEL ${l.to}!`)));
  rep.lvl.forEach((l) => Cer.levelUp(ctx, ctx.gOf(l.id), l.to)); // ONBOARDING
  rep.inj.forEach((i) => body.append(para(`${ctx.gOf(i.id).name} is injured for ${i.w} week${i.w > 1 ? 's' : ''}.`)));
  rep.loot.forEach((it) => body.append(itemCard(it, { tag: 'Loot!' })));
  let actions = ok('Continue', win ? 'gold' : 'bronze');
  if (win && ev.kind === 'duel') {
    body.append(section('The crowd waits. Your call.'));
    actions = [{ label: 'Show mercy', sub: 'more fame, 30% they join you', value: 'mercy', variant: 'gold' }, { label: 'Showboat', sub: 'extra gold', value: 'show', variant: 'ghost' }];
    const hasMom = res.F && res.F.replay && res.F.replay.snap && res.F.replay.moments && res.F.replay.moments.length; // REEL: highlights before the verdict
    let c; for (;;) { c = await ctx.ask({ title: ev.title || 'Duel', tut: 'results', dock: 'low', body, actions: hasMom ? [...actions, { label: 'Watch highlights', sub: 'the best moments, shareable', value: 'reel', variant: 'bronze', icon: 'arena' }] : actions, dismiss: 'show' }); if (c !== 'reel') break; await ctx.game.watchReplay(res, { reel: true }); }
    const m = lm.mercy(S, ev, rep, c);
    if (m.joined) await ctx.ask({ title: 'A new recruit!', body: para(`${m.joined.name} (${d.STYLES[m.joined.style].n}, Lv ${m.joined.lvl}) was moved by your mercy and joins your ludus!`), actions: ok('Welcome!'), dismiss: 'ok' });
    else if (c === 'mercy') U.toast(`The crowd loves it. +${m.f} fame.`, { kind: 'good' }); else U.toast(`+${m.gd} gold from the crowd.`, { kind: 'good' });
  } else {
    const hasReplay = res.F && res.F.replay && res.F.replay.snap;
    for (;;) {
      const hasMom = hasReplay && res.F.replay.moments && res.F.replay.moments.length; // REEL
      const acts = hasReplay ? [...actions, ...(hasMom ? [{ label: 'Highlight reel', sub: 'the 3 best moments, shareable', value: 'reel', variant: 'bronze', icon: 'arena' }] : []), { label: 'Watch replay', value: 'replay', variant: 'ghost', icon: 'arena' }] : actions;
      const v = await ctx.ask({ title: ev.title || (win ? 'Victory' : 'Defeat'), tut: 'results', dock: 'low', body, actions: acts, dismiss: 'ok' }); // the dialog title names the fight, the banner inside names the result: no more "DUEL WON / VICTORY"
      if (v !== 'replay' && v !== 'reel') break; await ctx.game.watchReplay(res, { reel: v === 'reel' });
    }
  }
  if (rep.choice) {
    const wrap = h('div'), body2 = h('div', '', [para("Choose one prize from the Emperor's gift table."), wrap]);
    const id = await new Promise((resolve) => { const m = ctx.sheet({ title: "Champion's loot", body: body2, onClose: () => resolve(rep.choice[0].id) }); rep.choice.forEach((it) => wrap.append(itemCard(it, { onClick: () => { resolve(it.id); m.close(); } }))); });
    lm.addItem(S, rep.choice.find((x) => x.id === id) || rep.choice[0]);
  }
  if (rep.relic) await ctx.ask({ title: 'Relic found!', body: para(`${rep.relic.n}: ${rep.relic.d}. Relics boost every fighter. Equip them in the Armory.`), actions: ok('Nice'), dismiss: 'ok' });
  if (rep.rune) { const r = rep.rune.kind === 'k' ? d.KEYSTONES[rep.rune.id] : d.MINORS[rep.rune.id]; await ctx.ask({ title: 'Rune unlocked!', body: para(`${r.n} (${rep.rune.kind === 'k' ? 'Keystone' : 'Minor'}): ${r.d}. Set it on a fighter in their profile.`), actions: ok('Nice'), dismiss: 'ok' }); }
  await pickPends(ctx); await trophies(ctx);
}

// ------------------------------------------------------------------ THE FALLEN
const WHERE = { pit: 'the Pit', horde: 'the Horde Trial', champ: 'a champion duel', bounty: 'a bounty hunt', hunt: 'the Venatio', event: 'the arena' };
const slayer = (res) => { const u = res && res.F && res.F.units && res.F.units.find((x) => x.side === 'B' && !x.down) || (res && res.F && res.F.units && res.F.units.find((x) => x.side === 'B')); return u ? u.name : ''; };

/** after a LOST fight: each fighter who went down rolls against LM.mortality (risk modes always, ordinary events only in Hardcore). Returns the fall reports. */
export async function mortalCheck(ctx, gl, res, o) {
  const S = ctx.S, lm = L(); if (!res || res.win || res.place === 1 || o.skip) return [];
  const out = [], by = slayer(res);
  for (const g of gl) {
    if (!ctx.gOf(g.id)) continue;
    const u = res.F && res.F.units && res.F.units.find((x) => x.g && x.g.id === g.id); if (u && !u.down && !o.force) continue;
    if (lm.deathRoll(S, g, o).dies) out.push(lm.fall(S, g, Object.assign({ by }, o)));
  }
  if (!out.length) return out;
  ctx.save(); ctx.refresh();
  for (const rep of out) await fallenFlow(ctx, rep, o);
  return out;
}

/** the farewell: eulogy ceremony, who grieves, what was inherited, then the heir offer */
export async function fallenFlow(ctx, rep, o = {}) {
  const S = ctx.S, e = rep.entry, lm = L(), d = D();
  const lines = [para(`${e.name} died in ${WHERE[e.kind] || 'the arena'}${e.depth && e.kind !== 'hunt' ? ` (${e.kind === 'horde' ? 'wave' : 'floor'} ${e.depth})` : ''}${e.by ? `, struck down by ${e.by}` : ''}. Their gear returns to the armory.`)];
  if (rep.inherited) lines.push(para(`${rep.inherited.name} inherits their drills: +${rep.inherited.v} ${d.SN[rep.inherited.stat]}. They have sworn to carry on.`));
  const grieving = rep.grief.filter((x) => x.drop >= 9).map((x) => x.name);
  if (rep.grief.length) lines.push(para(grieving.length ? `${grieving.join(', ')} ${grieving.length > 1 ? 'are' : 'is'} shattered. The whole ludus is shaken (morale down).` : 'The ludus is shaken. Morale drops.'));
  lines.push(h('div', '', [chip(`+${rep.fame} fame, the crowd honors them`, '#7b4fb8'), chip('Memorial wall', '#5a4a6a')]));
  const body = h('div', '', lines); body.style.cssText = 'font:600 13px/18px system-ui,sans-serif;color:#d8ccb2;text-align:left'; // light text: the eulogy scrim is dark
  const r = await Cer.eulogy(ctx, { kind: 'fallen', legend: e, body, actions: [{ label: 'Rest in peace', value: 'ok', variant: 'gold' }], dismiss: 'ok' });
  if (r == null) await ctx.ask({ title: 'In memoriam', body, actions: ok('Rest in peace'), dismiss: 'ok' });
  ctx.refresh();
  if (S.heirPending) await heirOffer(ctx);
}

export async function heirOffer(ctx) {
  const S = ctx.S, lm = L(), d = D(), p = S.heirPending; if (!p) return;
  const full = S.glads.length >= lm.rosterCap(S);
  const body = h('div', '', [para(`${p.of} left a pupil behind: a young ${d.STYLES[p.style].n} (level ${p.lvl}) with a rare gift for ${d.SN[p.best]}. They ask to take up the arms of the fallen.`), full ? para('Your barracks are full. Make room first, or raise a monument instead.') : para('Or raise a monument in their name: fame for the ludus.')]);
  body.style.cssText = 'font:600 13px/18px system-ui,sans-serif;color:#33243a';
  const acts = []; if (!full) acts.push({ label: 'Welcome the heir', sub: 'free recruit, perfect talent', value: 'heir', variant: 'gold' });
  acts.push({ label: 'Raise a monument', sub: `+${15 + p.lvl * 4} fame`, value: 'mon', variant: full ? 'gold' : 'bronze' });
  const v = await ctx.ask({ title: 'An heir steps forward', body, actions: acts, dismiss: 'mon' });
  if (v === 'heir') { const r = lm.takeHeir(S); if (r && r.glad) { ctx.sfx('levelUp'); U.toast(`${r.glad.name} joins the ludus`, { kind: 'good', ico: 'check' }); } else U.toast(String(r), { kind: 'bad' }); }
  else { const r = lm.monument(S); if (r && r.fame) U.toast(`A monument is raised: +${r.fame} fame`, { kind: 'good', ico: 'fame' }); }
  ctx.save(); ctx.refresh();
}
