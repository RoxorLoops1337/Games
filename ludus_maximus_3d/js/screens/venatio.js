// VENATIO UI: the Beast hunt card (Arena > Challenges), the hunt flow (pick a hunt, pick hunters, fight, report, trophies) and the Bestiary tab (World).
// Sim side lives in core/ext.js (section 5, LM.venatio*, D.BEASTS, D.HUNTS) and core/arena.js (beast AI). Fights run in the 3D arena through ctx.game.playFight.
import { prep, fightScreen, pickPends, mortalCheck } from '../flow.js';
import { U, h, D, L, fmt, pill, goldPill, famePill, note, hint, kv, medal, card, row, col, actions, meter, sec, empty, pickFighters, reportBody, fightStats, awardTrophies } from './sk.js';

const MIN_EN = 30;
const KIND_ICO = { wolf: 'skull', lion: 'fame', bear: 'shield', boar: 'sword', nemean: 'star', elephant: 'arena' };
const dot = (kind, size = 30) => { const B = D.BEASTS[kind], e = h('div', 'fv-badge'); e.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 35% 30%,${B.c},#1d1830);border:2px solid ${B.boss ? '#f2c14e' : '#b8803a'};color:#fff`; e.append(U.icon(KIND_ICO[kind] || 'skull', Math.round(size * 0.55))); e.title = B.n; return e; };
/** 3D portrait of a beast (the real rig, rendered by portrait.js), a dot until its turn in the render queue comes */
function beastPortrait(ctx, rec, size, style = 'bust') {
  let el; try { el = ctx.portrait(rec, size, { style }); if (!el.querySelector('canvas')) { const B = D.BEASTS[rec.beast]; el.style.background = `radial-gradient(circle at 35% 30%,${B.c},#1d1830)`; el.textContent = ''; el.append(U.icon(KIND_ICO[rec.beast] || 'skull', Math.round(size * 0.5))); } /* placeholder until the 3D render lands */ } catch (e) { el = dot(rec.beast, size); }
  return el;
}
const infoBody = (parts) => { const b = h('div', 'ax-col'); b.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif;overflow-wrap:anywhere'; parts.forEach((p) => p && b.append(p)); return b; };
const para = (t) => h('p', '', t);
const dismissOk = (label = 'Continue', variant = 'gold') => [{ label, value: 'ok', variant }];

// ------------------------------------------------------------------ the card in Arena > Challenges
export function venatioCard(ctx, draw) {
  const S = ctx.S, lm = L(), st = lm.venatioState(S), V = lm.venatio(S), hunts = st.ok || st.used ? lm.venatioHunts(S) : [];
  const owned = V.trophies.length, kinds = Object.keys(V.kills).filter((k) => V.kills[k] > 0).length, total = Object.values(V.kills).reduce((a, b) => a + b, 0);
  const head = row([medal('star', 'dark big'), col([h('div', 'ax-name', 'Venatio: the beast hunts'), note(st.ok || st.used ? 'Send hunters against wild beasts. Wolves circle, lions leap, boars charge, and the great beasts shake the sand. Pelts, trophies and rare loot for the victors; the crowd loves it.' : st.why)], 'ax-grow')]);
  const chips = h('div', 'ax-row ax-wrap ax-gap4', [pill(`${total} beasts slain`, { tone: 'gold' }), pill(`Bestiary ${kinds}/${D.BEAST_IDS.length}`, { tone: 'blue', tip: 'Beasts you have slain are recorded with notes and stats.' }), pill(`Trophies ${owned}/${Object.keys(D.BEAST_TROPHIES).length}`, { tone: 'vio', tip: 'Each trophy on the wall brings fame every week.' }),
    lm.beastFest(S) ? pill('Festival: +25% rewards', { tone: 'good', tip: 'The festival crowd wants blood and beasts. Gold and fame +25%, and harder hunts open one league early.' }) : null,
    st.via ? pill(st.via === 'stands' ? 'Via the Stands' : st.via === 'league' ? 'Via your league' : 'Via the festival', { tip: 'How the hunting grounds opened for you.' }) : null]);
  const c = card([head, chips], 'gold' + (st.ok || st.used ? '' : ' dim'));
  if (st.used) c.append(note('Your hunters already went out this week.'));
  hunts.forEach((hu) => {
    const kinds2 = [...new Set(hu.kinds.map((k) => k[0]))];
    const go = U.button({ label: st.ok ? 'Hunt' : 'Closed', variant: hu.boss ? 'danger' : 'gold', icon: 'sword', disabled: !st.ok, onClick: () => startHunt(ctx, hu.id) });
    const cnt = hu.kinds.map(([k, n]) => `${n > 1 ? n + ' ' : ''}${D.BEASTS[k].n}${n > 1 ? 's' : ''}`).join(', ');
    c.append(row([h('div', 'ax-row ax-gap4', kinds2.map((k) => dot(k, 34))), col([h('div', 'ax-b', `${hu.n}${hu.boss ? ' (boss)' : ''}`), h('div', 'ax-sub', `${cnt} · Lv ${hu.lvl} · send ${hu.party} fighter${hu.party > 1 ? 's' : ''}`), h('div', 'ax-row ax-wrap ax-gap4', [goldPill(hu.gold, 'Prize gold for the victors'), famePill(hu.fame), pill(`Risk ${'!'.repeat(hu.risk)}`, { tone: hu.risk >= 3 ? 'bad' : hu.risk === 2 ? 'warn' : '', tip: 'How dangerous this hunt is for a fighter who falls (death risk grows with it).' })])], 'ax-grow'), go], 'ax-wrap'));
  });
  c.append(actions([U.button({ label: 'Open the bestiary', variant: 'bronze', icon: 'scroll', onClick: () => ctx.open('world', { tab: 'bestiary' }) })]));
  void draw;
  return c;
}

// ------------------------------------------------------------------ the hunt flow
async function session(ctx, fn) {
  const game = ctx.game; if (game.busy) return; game.busy = true;
  try { ctx.closeAll(); await fn(); }
  catch (e) { console.error(e); U.toast('Oops: ' + e.message, { kind: 'bad' }); }
  finally { game.busy = false; try { game.scene === 'fight' && game.returnToHub(); } catch (e) { console.error(e); } ctx.save(); ctx.refresh(); ctx.open('arena', { tab: 'modes' }); }
}
export async function startHunt(ctx, huntId) {
  const S = ctx.S, lm = L(), st = lm.venatioState(S); if (!st.ok) return U.toast(st.why, { kind: 'bad' });
  const hunts = lm.venatioHunts(S), hunt = hunts.find((x) => x.id === huntId) || hunts[0]; if (!hunt) return;
  const beasts = lm.huntBeasts(S, hunt), lv = lm.scoutLevel(S);
  const intro = col([h('div', 'ax-row ax-wrap', beasts.map((b) => h('div', 'ax-row ax-gap4', [dot(b.beast, 30), h('b', 'ax-num', `Lv ${b.lvl}`)]))), note(hunt.d), note(`Send ${hunt.party} fighter${hunt.party > 1 ? 's' : ''}. Costs ${MIN_EN} energy each. A fighter who falls may die: the deeper the risk, the likelier.`)]);
  const ids = await pickFighters(ctx, {
    title: hunt.n, intro, n: hunt.party,
    info(g) {
      if (g.inj > 0) return { reason: `Injured ${g.inj}w` };
      if (g.en < MIN_EN) return { reason: `Needs ${MIN_EN} energy` };
      const badges = [pill(`Lv ${g.lvl}`, { tone: 'blue', tip: 'Fighter level' })]; if (g.en < 60) badges.push(pill('Tired', { tone: 'warn', tip: 'Energy under 60 lowers stats in the fight.' }));
      const c = lm.mortality(S, g, { kind: 'hunt', depth: hunt.risk, boss: !!hunt.boss }); if (c) badges.push(pill(`Death risk ${Math.round(c * 100)}%`, { ico: 'skull', tone: c >= 0.15 ? 'bad' : 'warn', tip: 'If this fighter is beaten here they may die. The Infirmary and Shrine lower it.', tipTitle: 'Mortal risk' }));
      let right = null;
      if (hunt.party === 1) { const p = lm.odds(S, [g], beasts, 'bal'), txt = lv >= 2 ? Math.round(p * 100) + '%' : lv === 1 ? (p > 0.6 ? 'Fav' : p < 0.4 ? 'Dog' : 'Even') : '?'; right = h('div', 'ax-odds', [txt, h('small', '', 'win')]); U.tooltip(right, lv >= 2 ? 'Estimated win chance with the balanced plan.' : 'Scouting level 2 shows the percentage.', { title: 'Win odds' }); }
      return { badges, right };
    },
    footer(sel) {
      if (hunt.party < 2 || sel.length < hunt.party) return null;
      const tc = lm.teamCtx(S, sel, 'bal'), p = lm.odds(S, sel, beasts, 'bal', 20);
      return card([h('div', 'ax-name', 'Hunting party'), tc.list.length ? col(tc.list.map((x) => h('div', '', [h('b', '', x.n + ': '), x.d]))) : note('Mixed styles earn team synergy.'), lv >= 2 ? pill(`Win chance ${Math.round(p * 100)}%`, { tone: 'gold' }) : null], 'gold');
    },
    confirm() { return { label: `Hunt: ${hunt.n}` }; },
  });
  if (!ids) return;
  await session(ctx, () => runHunt(ctx, hunt, beasts, ids.map((id) => ctx.gOf(id))));
}

async function runHunt(ctx, hunt, beasts, party) {
  const S = ctx.S, lm = L(), V = lm.venatio(S); V.week = S.week; party.forEach((g) => { g.en = Math.max(0, g.en - MIN_EN); });
  const ev = { kind: 'hunt', title: hunt.n, opps: beasts, league: 0, key: hunt.key };
  const { stance } = await prep(ctx, ev, party, beasts, { pit: true, name: 'Venatio' });
  const res = await fightScreen(ctx, party, beasts, stance, { ev, augs: [] });
  const bossH = !!hunt.boss, win = !!res.win;
  const rep = lm.venatioSettle(S, hunt, party, res);
  ctx.game.returnToHub(); ctx.sfx(win ? 'crowdCheer' : 'crowdBoo'); ctx.save(); ctx.refresh();
  const slain = Object.entries(rep.kills).map(([k, n]) => `${n} ${D.BEASTS[k].n}${n > 1 ? 's' : ''}`).join(', ');
  const stats = fightStats(ctx, res);
  const body = reportBody({
    title: win ? (bossH ? 'The great beast falls!' : 'The beasts are slain') : 'Driven from the sand', tone: win ? 'win' : 'lose',
    pills: [goldPill(rep.gold), famePill(rep.fame), ...Object.entries(rep.pelts).map(([k, n]) => pill(`${n} ${D.BEASTS[k].pelt}`, { tone: 'warn', tip: 'Pelts sell in the Bestiary.' })), pill(`+${rep.xp} XP${rep.up.length ? ' · LEVEL ' + rep.up[rep.up.length - 1].lvl : ''}`, { tone: 'good' })],
    lines: [slain ? `Slain: ${slain}.` : 'Nothing was slain.', ...rep.inj.map((x) => `${x.name} is injured for ${x.w} week${x.w > 1 ? 's' : ''}.`), ...rep.notes], items: rep.item ? [rep.item] : [], kids: stats ? [stats] : [],
  });
  await ctx.ask({ title: 'Venatio', body, actions: dismissOk(), dismiss: 'ok' });
  for (const id of rep.trophies) { const T = D.BEAST_TROPHIES[id]; ctx.sfx('levelUp'); await ctx.ask({ title: 'Trophy!', body: infoBody([h('div', 'ax-name', T.n), para(T.d), para(`It now hangs in the trophy hall: +${T.fame} fame every week.`)]), actions: dismissOk('Hang it high'), dismiss: 'ok' }); }
  await mortalCheck(ctx, party, res, { kind: 'hunt', depth: hunt.risk, boss: bossH });
  await pickPends(ctx); await awardTrophies(ctx);
}

// ------------------------------------------------------------------ the Bestiary tab (World screen)
export function bestiaryTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), V = lm.venatio(S), list = lm.bestiary(S), nTroph = Object.keys(D.BEAST_TROPHIES).length;
  const pelts = list.reduce((a, b) => a + b.pelts * b.peltValue, 0);
  root.append(card([row([medal('scroll', 'dark big'), col([h('div', 'ax-name', 'Bestiary'), note('Every beast you slay in the Venatio is recorded here with a portrait, notes and stats. Notes unlock with kills: the first reveals its numbers, the third its habits, the sixth its tricks. Pelts sell for gold; trophies hang in the hall for weekly fame.')], 'ax-grow')]),
    h('div', 'ax-row ax-wrap ax-gap4', [pill(`${V.hunts} hunts`, { tone: 'blue' }), pill(`${V.wins} won`, { tone: 'good' }), pill(`${V.felled} beasts slain`, { tone: 'gold' }), pill(`Trophies ${V.trophies.length}/${nTroph}`, { tone: 'vio' }), pill(`+${lm.trophyFame(S)} fame/week`, { tone: 'vio', tip: 'Paid every week while the trophies hang.' })])], 'gold'));
  if (pelts > 0) root.append(U.button({ label: `Sell every pelt (${fmt(pelts)} gold)`, variant: 'bronze', icon: 'coin', block: true, onClick: () => { let g = 0; D.BEAST_IDS.forEach((k) => { g += lm.sellPelts(S, k); }); ctx.save(); ctx.refresh(); ctx.sfx('coin'); U.toast(`Pelts sold: +${fmt(g)} gold`, { kind: 'good', ico: 'coin' }); draw(); } }));
  const grid = h('div', 'ax-grid');
  list.forEach((b) => {
    const portrait = beastPortrait(ctx, b.sample, 96, 'bust'); if (!b.known) { portrait.style.filter = 'brightness(0.12) saturate(0)'; portrait.title = 'Not yet met'; }
    const head = row([portrait, col([h('div', 'ax-name', b.known ? b.n : '???'), h('div', 'ax-row ax-wrap ax-gap4', [pill(b.role, { tone: b.boss ? 'bad' : '' }), pill(`${b.kills} slain`, { tone: b.kills ? 'gold' : '' }), b.first != null ? pill(`First: week ${b.first}`, {}) : null]), note(b.d)], 'ax-grow')], 'ax-wrap');
    const c = card([head], b.boss ? 'gold' : '');
    if (b.stats) c.append(h('div', 'ax-row ax-wrap ax-gap4', [pill(`HP ${b.stats.hp}`, { tone: 'good', tip: 'At level 5.' }), pill(`ATK ${b.stats.atk}`, { tone: 'bad' }), pill(`DEF ${b.stats.def}`, {}), pill(`SPD ${b.stats.spd}`, { tone: 'blue' })]));
    b.lore.forEach((l, i) => c.append(h('div', 'ax-row', [U.icon(i === 0 ? 'scroll' : 'check', 14), h('span', 'ax-sub', l)])));
    if (b.known && b.tier < 3) c.append(note(`Slay ${[1, 3, 6][b.tier] - b.kills} more to learn more about it.`));
    if (b.known) {
      const tr = h('div', 'ax-row ax-wrap ax-gap4', b.trophies.map((t) => pill(t.n, { ico: t.own ? 'check' : 'lock', tone: t.own ? 'vio' : '', tip: t.own ? t.d : 'Not yet taken. A chance after a won hunt against this beast.' })));
      c.append(tr);
      if (b.pelts) c.append(actions([U.button({ label: `Sell ${b.pelts} ${b.peltName}${b.pelts > 1 ? 's' : ''} (${fmt(b.pelts * b.peltValue)}g)`, variant: 'bronze', icon: 'coin', onClick: () => { const g = lm.sellPelts(S, b.kind); ctx.save(); ctx.refresh(); ctx.sfx('coin'); U.toast(`+${fmt(g)} gold`, { kind: 'good', ico: 'coin' }); draw(); } })]));
    }
    grid.append(c);
  });
  root.append(grid);
  if (!V.hunts) root.append(hint('Open the Arena and choose Challenges to begin your first hunt.'));
  void kv; void meter; void sec; void empty;
}
