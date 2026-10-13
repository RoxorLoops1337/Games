// Extra arena modes ported from the 2D game (play.js): Pit of Trials (+daily descent), Horde Trial, Champion duel, Bounty.
// Fights run in the 3D arena through ctx.game.playFight (via flow.fightScreen); the hub is restored afterwards.
import { prep, pickAug, pickPends, fightScreen, fallenFlow, mortalCheck } from '../flow.js';
import { U, h, D, L, fmt, pill, goldPill, famePill, note, hint, pickFighters, reportBody, fightStats, awardTrophies, oppStrip, styleBadge, styleTag, itemCard } from './sk.js';

const MIN_EN = 30;

// ------------------------------------------------------------------ readiness (used by the arena cards)
export function pitState(ctx) { const S = ctx.S; return { used: S.pitWeek === S.week, dailyDone: L().dailyDone(S) }; }
export function hordeState(ctx) { return { used: ctx.S.hordeWeek === ctx.S.week }; }
export function champState(ctx) {
  const S = ctx.S, lm = L();
  if (lm.champReady(S)) return { ok: true, why: '' };
  if (!S.rowner) return { ok: false, why: 'A rival owner appears after your next fight.' };
  if (S.champWeek === S.week) return { ok: false, why: 'You already faced their champion this week.' };
  return { ok: false, why: `${S.rowner.name} leads by ${S.rowner.w} to ${S.rowner.l}. They send a champion once they have 3 wins.` };
}
export function bountyState(ctx) {
  const S = ctx.S;
  if (L().bountyReady(S)) return { ok: true, why: '' };
  return { ok: false, why: S.week < 2 ? 'The board opens in week 2.' : 'This week\'s outlaw is already dealt with.' };
}

// ------------------------------------------------------------------ shared pieces
const fitInfo = (extra) => (g) => {
  if (g.inj > 0) return { reason: `Injured ${g.inj}w` };
  if (g.en < MIN_EN) return { reason: `Needs ${MIN_EN} energy` };
  return Object.assign({ badges: [pill(`Lv ${g.lvl}`, { tone: 'blue', tip: 'Fighter level' }), g.en < 60 ? pill('Tired', { tone: 'warn', tip: 'Energy under 60 lowers stats in the fight.' }) : null] }, extra ? extra(g) : {});
};

/** FALLEN: how likely a defeat in this mode kills this fighter (shown before you commit) */
function riskPill(ctx, g, kind, depth = 1) {
  const c = L().mortality(ctx.S, g, { kind, depth }); if (!c) return null;
  return pill(`Death risk ${Math.round(c * 100)}%`, { ico: 'skull', tone: c >= 0.15 ? 'bad' : 'warn', tip: 'If this fighter is beaten here they may die. The risk shrinks with a better Infirmary and Shrine, and it grows with depth.', tipTitle: 'Mortal risk' });
}
async function pickOne(ctx, title, intro, confirmLabel, risk) {
  const base = fitInfo();
  const info = risk ? (g) => { const r = base(g); if (!r.reason) { const rp = riskPill(ctx, g, risk.kind, risk.depth); if (rp) r.badges = [...(r.badges || []), rp]; } return r; } : base;
  const ids = await pickFighters(ctx, { title, intro, n: 1, info, hurtKind: (risk && risk.kind) || 'mode', confirm: () => ({ label: confirmLabel || 'Fight' }) }); // WAVE3: hurtKind
  if (ids && ids.hurt && ids.hurt.length) L().hurtMark(ctx.S, ctx.gOf(ids[0]), true);
  return ids ? ctx.gOf(ids[0]) : null;
}

/** shared wrapper: marks the game busy, closes the screens, runs fn, then restores the hub and reopens the arena */
async function session(ctx, fn, tab = 'modes') {
  const game = ctx.game; if (game.busy) return; game.busy = true;
  try { ctx.closeAll(); await fn(); }
  catch (e) { console.error(e); U.toast('Oops: ' + e.message, { kind: 'bad' }); }
  finally {
    try { L().hurtClear(ctx.S); } catch (e) { /* wave 3 */ }
    game.busy = false; try { game.scene === 'fight' && game.returnToHub(); } catch (e) { console.error(e); }
    ctx.save(); ctx.refresh(); ctx.open('arena', { tab });
  }
}

const dismissOk = (label = 'Continue', variant = 'gold') => [{ label, value: 'ok', variant }];

function infoBody(parts) { const b = h('div', 'ax-col'); b.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif;overflow-wrap:break-word'; parts.forEach((p) => p && b.append(p)); return b; }
const p = (t) => h('p', '', t);

function xpInjury(ctx, g, xp, lost, chance, maxWeeks) {
  const up = L().addXp(g, xp); g.en = Math.max(0, g.en - 5); let inj = '';
  if (lost && Math.random() < chance) { g.inj = Math.max(g.inj || 0, 1 + Math.floor(Math.random() * maxWeeks)); inj = `${g.name} is injured for ${g.inj} week${g.inj > 1 ? 's' : ''}.`; }
  return { up, inj };
}

async function drops(ctx, relic, rune) {
  const d = D;
  if (relic) await ctx.ask({ title: 'Relic found!', body: p(`${relic.n}: ${relic.d}. Relics boost every fighter. Equip them in the Armory.`), actions: dismissOk('Nice'), dismiss: 'ok' });
  if (rune) { const r = rune.kind === 'k' ? d.KEYSTONES[rune.id] : d.MINORS[rune.id]; await ctx.ask({ title: 'Rune unlocked!', body: p(`${r.n} (${rune.kind === 'k' ? 'Keystone' : 'Minor'}): ${r.d}. Set it on a fighter in their profile.`), actions: dismissOk('Nice'), dismiss: 'ok' }); }
}

// ------------------------------------------------------------------ Pit of Trials
export async function startPit(ctx, daily) {
  const S = ctx.S;
  if (!daily && S.pitWeek === S.week) return U.toast('You already descended this week', { kind: 'bad' });
  if (daily && L().dailyDone(S)) return U.toast('Come back tomorrow for the next Daily Descent', { kind: 'bad' });
  const intro = infoLine(daily ? 'Daily Descent: the same opponents and augment offers for everyone today. +30% gold, and a laurel for reaching floor 5.' : 'Floors get harder and every 5th floor is a boss. After each win pick a boon, then cash out or go deeper. Defeat keeps half the rewards, and the Pit can kill: the deeper you go, the likelier a beaten fighter dies.', `Costs ${MIN_EN} energy.`);
  const g = await pickOne(ctx, daily ? 'Daily Descent' : 'Pit of Trials', intro, 'Descend', { kind: 'pit', depth: 1 });
  if (!g) return;
  await session(ctx, () => runPit(ctx, g, daily));
}
function infoLine(a, b) { const w = h('div', 'ax-col'); w.append(note(a), note(b)); return w; }

async function runPit(ctx, g, daily) {
  const S = ctx.S, lm = L();
  if (daily) S.daily = { day: lm.dayKey(), best: 0 }; else S.pitWeek = S.week;
  const mut = lm.mutator(daily ? 'd' + lm.dayKey() : 'w' + S.week); g.en = Math.max(0, g.en - MIN_EN);
  const augs = []; let floor = 0, hpf = 1, lost = false, fellAt = null, minHpf = 1; // WAVE3: minHpf feeds the Flawless Descent trophy
  for (;;) {
    const opp = daily ? lm.withRandom(lm.dailySeed(floor + 1, 'o'), () => lm.pitOpp(S, floor + 1, g)) : lm.pitOpp(S, floor + 1, g); floor++;
    const ev = { kind: 'pit', title: (floor % 5 === 0 ? 'BOSS: ' : '') + 'Pit floor ' + floor, opps: [opp], league: 0, key: (daily ? 'pitd' + lm.dayKey() : 'pitw' + S.week) + ':' + floor, mut };
    const { stance } = await prep(ctx, ev, [g], [opp], { pit: true, hpf });
    augs.push(await pickAug(ctx, floor < 3 ? 0 : floor < 6 ? 1 : floor < 10 ? 2 : 3, augs, floor % 5 === 0, `Floor ${floor}: new augment`, daily ? lm.dailySeed(floor, 'a') : null, g.style));
    const res = await fightScreen(ctx, [g], [opp], stance, { ev, hpf: { [g.id]: hpf }, augs: augs.slice(), mutator: mut });
    if (!res.win) { fellAt = { depth: floor, boss: floor % 5 === 0, res }; floor--; lost = true; break; }
    minHpf = Math.min(minHpf, res.hpf[g.id]); hpf = Math.min(1, res.hpf[g.id] + 0.25);
    const cur = lm.pitReward(S, floor, [], false), nx = floor + 1;
    const body = infoBody([
      p(`${g.name} recovers to ${Math.round(hpf * 100)}% HP.`),
      h('div', 'ax-row ax-wrap', [goldPill(cur.gold, 'Banked gold'), famePill(cur.fame), cur.items.length ? pill(cur.items.length + ' item' + (cur.items.length > 1 ? 's' : ''), { tone: 'good' }) : null, floor >= 5 ? pill('Relic from the boss', { tone: 'warn' }) : null]),
      p(`Augments so far: ${augs.map((b) => b.n).join(', ')}.`),
      p(`Floor ${nx}${nx % 5 === 0 ? ' is a BOSS floor' : ''} awaits. Each floor adds an augment.`),
    ]);
    const go = await ctx.ask({ title: `Floor ${floor} cleared`, body, actions: [{ label: 'Descend!', value: 'go', variant: 'danger', icon: 'skull' }, { label: 'Cash out', value: 'cash', variant: 'ghost' }], dismiss: 'cash' });
    if (go === 'cash') break;
  }
  if (!lost && floor >= 5 && minHpf >= 0.4) S.stats.pitPerfect = (S.stats.pitPerfect || 0) + 1; // WAVE3: Flawless Descent
  const rw = lm.pitReward(S, floor, [], lost);
  if (daily) { rw.gold = Math.round(rw.gold * 1.3); S.daily.best = floor; S.dailyBest = Math.max(S.dailyBest || 0, floor); if (floor >= 5) { S.laurels += 1; rw.laurel = 1; } }
  S.gold += rw.gold; S.fame += rw.fame; S.pitBest = Math.max(S.pitBest || 0, floor);
  const roll = lost && fellAt ? lm.deathRoll(S, g, { kind: 'pit', depth: fellAt.depth, boss: fellAt.boss }) : { dies: false };   // FALLEN: the Pit can kill
  const xp = floor * 12 + 8, { up, inj } = roll.dies ? { up: [], inj: '' } : xpInjury(ctx, g, xp, lost, 0.35, 2);
  rw.items.forEach((it) => lm.addItem(S, it));
  const relic = rw.boss ? lm.dropRelic(S) : null, rune = floor >= 3 && Math.random() < 0.5 ? lm.unlockRune(S) : null;
  const fallRep = roll.dies ? lm.fall(S, g, { kind: 'pit', depth: fellAt.depth, by: (fellAt.res.F.units.find((u) => u.side === 'B') || {}).name || '' }) : null;
  ctx.game.returnToHub(); ctx.sfx(lost ? 'crowdBoo' : 'crowdCheer'); ctx.save(); ctx.refresh();
  const body = reportBody({
    title: lost ? 'Fallen' : 'Cashed out', tone: lost ? 'lose' : 'win',
    pills: [pill(`Floors ${floor}`, { tone: 'blue' }), daily ? pill('Daily', { tone: 'vio' }) : null, rw.laurel ? pill('+1 laurel', { ico: 'fame', tone: 'good' }) : null, goldPill(rw.gold), famePill(rw.fame), roll.dies ? pill(`${g.name} has died`, { ico: 'skull', tone: 'bad' }) : pill(`+${xp} XP${up.length ? ' · LEVEL ' + up[up.length - 1] : ''}`, { tone: 'good' })],
    lines: inj ? [inj] : [], items: rw.items,
  });
  await ctx.ask({ title: 'The Pit', body, actions: dismissOk(), dismiss: 'ok' });
  if (fallRep) await fallenFlow(ctx, fallRep);
  await drops(ctx, relic, rune); await pickPends(ctx); await awardTrophies(ctx);
}

// ------------------------------------------------------------------ Horde Trial
export async function startHorde(ctx) {
  const S = ctx.S; if (S.hordeWeek === S.week) return U.toast('You already faced the horde this week', { kind: 'bad' });
  const g = await pickOne(ctx, 'Horde Trial', infoLine('One fighter against wave after wave of weaker foes, packs growing up to five. Every second wave you pick an augment. Retreat after any wave to keep the rewards; defeat keeps 60% and can be fatal.', `Costs ${MIN_EN} energy.`), 'Face the horde', { kind: 'horde', depth: 1 });
  if (!g) return;
  await session(ctx, () => runHorde(ctx, g));
}

async function runHorde(ctx, g) {
  const S = ctx.S, lm = L();
  S.hordeWeek = S.week; g.en = Math.max(0, g.en - MIN_EN); const augs = []; let wave = 0, hpf = 1, lost = false, fellWave = 0, fellRes = null;
  for (;;) {
    wave++; const opps = lm.hordeWave(S, wave, g); const ev = { kind: 'horde', title: 'Horde wave ' + wave, opps, league: 0, key: 'horde' + S.week + ':' + wave };
    await ctx.ask({ title: `Wave ${wave}`, body: infoBody([oppStrip(opps), p(`${opps.length} fighter${opps.length > 1 ? 's' : ''}, level ${opps[0].lvl}. ${g.name} starts at ${Math.round(hpf * 100)}% HP.`)]), actions: dismissOk('Fight!', 'danger'), dismiss: 'ok' });
    if (wave % 2 === 0) augs.push(await pickAug(ctx, wave < 4 ? 0 : wave < 8 ? 1 : 2, augs, false, `Wave ${wave}: new augment`, null, g.style));
    const res = await fightScreen(ctx, [g], opps, 'bal', { ev, hpf: { [g.id]: hpf }, augs: augs.slice() });
    if (!res.win) { fellWave = wave; fellRes = res; wave--; lost = true; break; }
    hpf = Math.min(1, res.hpf[g.id] + 0.2); const cur = lm.hordeReward(S, wave, false);
    const body = infoBody([p(`${g.name} recovers to ${Math.round(hpf * 100)}% HP.`), h('div', 'ax-row ax-wrap', [goldPill(cur.gold, 'Banked gold'), famePill(cur.fame), cur.items.length ? pill(cur.items.length + ' item(s)', { tone: 'good' }) : null])]);
    const go = await ctx.ask({ title: `Wave ${wave} cleared`, body, actions: [{ label: 'Next wave', value: 'go', variant: 'danger', icon: 'skull' }, { label: 'Retreat with rewards', value: 'cash', variant: 'ghost' }], dismiss: 'cash' });
    if (go === 'cash') break;
  }
  const rw = lm.hordeReward(S, wave, lost); S.gold += rw.gold; S.fame += rw.fame; S.hordeBest = Math.max(S.hordeBest || 0, wave);
  const roll = lost && fellRes ? lm.deathRoll(S, g, { kind: 'horde', depth: fellWave }) : { dies: false };   // FALLEN
  const xp = wave * 14 + 8, { up, inj } = roll.dies ? { up: [], inj: '' } : xpInjury(ctx, g, xp, lost, 0.3, 1);
  rw.items.forEach((it) => lm.addItem(S, it));
  const fallRep = roll.dies ? lm.fall(S, g, { kind: 'horde', depth: fellWave, by: (fellRes.F.units.find((u) => u.side === 'B') || {}).name || '' }) : null;
  ctx.game.returnToHub(); ctx.sfx(lost ? 'crowdBoo' : 'crowdCheer'); ctx.save(); ctx.refresh();
  const body = reportBody({
    title: lost ? 'Overrun' : 'Retreated', tone: lost ? 'lose' : 'win',
    pills: [pill(`Waves ${wave}`, { tone: 'blue' }), goldPill(rw.gold), famePill(rw.fame), roll.dies ? pill(`${g.name} has died`, { ico: 'skull', tone: 'bad' }) : pill(`+${xp} XP${up.length ? ' · LEVEL ' + up[up.length - 1] : ''}`, { tone: 'good' })],
    lines: [inj, `Best: wave ${S.hordeBest}`].filter(Boolean), items: rw.items,
  });
  await ctx.ask({ title: 'Horde Trial', body, actions: dismissOk(), dismiss: 'ok' });
  if (fallRep) await fallenFlow(ctx, fallRep);
  await pickPends(ctx); await awardTrophies(ctx);
}

// ------------------------------------------------------------------ Champion duel and Bounty (single duels)
export async function startChamp(ctx) {
  const S = ctx.S, st = champState(ctx); if (!st.ok) return U.toast(st.why, { kind: 'bad' });
  const g = await pickOne(ctx, `${S.rowner.name}'s champion`, infoLine('A single duel against a stronger foe. Win and the rival owner is humbled. Lose and your fighter may not walk home.', `Costs ${MIN_EN} energy.`), 'Challenge', { kind: 'champ' });
  if (!g) return;
  await session(ctx, async () => {
    g.en = Math.max(0, g.en - MIN_EN); const opp = L().champOpp(S, g), ev = { kind: 'champ', title: 'Champion duel', opps: [opp], league: 0, key: 'champ' + S.week };
    const taunt = D.CHAMP_TAUNT && D.CHAMP_TAUNT[opp.style] || 'Come and fight.';
    await ctx.ask({ title: 'The champion', body: infoBody([oppStrip([opp]), p(`${opp.name} of ${opp.ludus}, level ${opp.lvl}.`), h('p', '', `"${taunt}"`)]), actions: dismissOk('Fight!', 'danger'), dismiss: 'ok' });
    const res = await fightScreen(ctx, [g], [opp], 'bal', { ev, augs: [] }); const r = L().champResult(S, !!res.win);
    ctx.game.returnToHub(); ctx.sfx(res.win ? 'crowdCheer' : 'crowdBoo'); ctx.save(); ctx.refresh();
    const stats = fightStats(ctx, res);
    await ctx.ask({ title: 'Champion duel', body: reportBody({ title: res.win ? 'Champion down' : 'Defeated', tone: res.win ? 'win' : 'lose', pills: res.win ? [goldPill(r.gold), famePill(r.fame)] : [pill('The owner gloats', { tone: 'bad' })], kids: stats ? [stats] : [] }), actions: dismissOk(), dismiss: 'ok' });
    await mortalCheck(ctx, [g], res, { kind: 'champ' }); // FALLEN
    await awardTrophies(ctx);
  });
}

export async function startBounty(ctx) {
  const S = ctx.S, st = bountyState(ctx); if (!st.ok) return U.toast(st.why, { kind: 'bad' });
  const g = await pickOne(ctx, 'Bounty board', infoLine('A wanted outlaw fights one duel for the purse. Once a week. Outlaws fight dirty: a beaten hunter may die.', `Costs ${MIN_EN} energy.`), 'Hunt', { kind: 'bounty' });
  if (!g) return;
  await session(ctx, async () => {
    g.en = Math.max(0, g.en - MIN_EN); const opp = L().bountyOpp(S, g), ev = { kind: 'bounty', title: 'Bounty', opps: [opp], league: 0, key: 'bounty' + S.week };
    await ctx.ask({ title: 'WANTED', body: infoBody([oppStrip([opp]), p(`${opp.name}, level ${opp.lvl}.`)]), actions: dismissOk('Fight!', 'danger'), dismiss: 'ok' });
    const res = await fightScreen(ctx, [g], [opp], 'bal', { ev, augs: [] }); const r = L().bountyResult(S, !!res.win); if (res.win) L().favGain(g, true, 0);
    ctx.game.returnToHub(); ctx.sfx(res.win ? 'crowdCheer' : 'crowdBoo'); ctx.save(); ctx.refresh();
    const stats = fightStats(ctx, res);
    await ctx.ask({ title: 'Bounty', body: reportBody({ title: res.win ? 'Bounty claimed' : 'The outlaw escapes', tone: res.win ? 'win' : 'lose', pills: res.win ? [goldPill(r.gold), famePill(r.fame)] : [], kids: stats ? [stats] : [] }), actions: dismissOk(), dismiss: 'ok' });
    await mortalCheck(ctx, [g], res, { kind: 'bounty' }); // FALLEN
    await awardTrophies(ctx);
  });
}
