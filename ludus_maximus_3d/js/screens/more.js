// More screen: sponsors, visitors, factions, trophies, records, legacy, settings, how to play, save tools, credits.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, famePill, tabs, meter, toggle, slider, empty, actions, styleBadge, pickFighters, confirmDialog, chipRow } from './sk.js';
import { glyph, trophyIcon } from '../glyphs.js'; // WAVE3: trophy glyphs
import { legendsSheet, perksSheet, ascendFlow } from './legacy.js';

const PREF_KEY = 'ludus_maximus_3d_prefs';
const DEF = { master: 0.9, music: 0.7, sfx: 0.9, muted: false, rm: false, big: false, hc: false, gore: 'full' };
let tab = 'ludus';

// ------------------------------------------------------------------ preferences (localStorage, safe)
export function readPrefs() { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } }
function writePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked */ } }
/** apply stored preferences to audio and the document. Safe to call at boot (pass game.ctx or {audio}). */
export function applyPrefs(ctx) {
  const p = readPrefs(), a = ctx && ctx.audio, so = (ctx && ctx.S && ctx.S.opts) || {};
  // QA: a save carries its own comfort choices (S.opts), so an imported save brings them along; either source switches the option on
  p.rm = !!(p.rm || so.rm); p.big = !!(p.big || so.big); p.hc = !!(p.hc || so.hc);
  globalThis.LM3D_GORE = ['off', 'low', 'full'].includes(p.gore) ? p.gore : 'full'; // read by js/gore.js at the start of every fight
  try { document.body.classList.toggle('lx-large-text', !!p.big); document.body.classList.toggle('lx-reduce-motion', !!p.rm); document.body.classList.toggle('lx-hc', !!(p.hc || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches))); } catch (e) { /* no body yet */ }
  if (a) { try { a.setMaster(p.muted ? 0 : p.master); a.setMusic(p.music); a.setSfx(p.sfx); } catch (e) { /* audio not ready */ } }
  return p;
}

export function open(ctx, arg) {
  const S = ctx.S, lm = L(); arg = arg || {};
  if (arg.tab) tab = arg.tab;
  const scr = openScreen(ctx, { title: 'More', wide: true });
  const draw = () => scr.render((root) => {
    root.append(tabs([{ id: 'ludus', label: 'Ludus', icon: 'ludus' }, { id: 'honors', label: 'Honors', icon: 'fame' }, { id: 'settings', label: 'Settings', icon: 'gear' }, { id: 'help', label: 'Help', icon: 'scroll' }], tab, (id) => { tab = id; ctx.sfx('uiTap'); scr.scroller.scrollTop = 0; draw(); }));
    if (tab === 'ludus') ludusTab(ctx, root, draw); else if (tab === 'honors') honorsTab(ctx, root, draw); else if (tab === 'settings') settingsTab(ctx, root, draw); else helpTab(ctx, root, draw);
  });
  draw(); return scr;
}

// ------------------------------------------------------------------ ludus: sponsors, visitor, goals, factions
function ludusTab(ctx, root, draw) {
  const S = ctx.S, lm = L();
  const v = lm.visitor(S);
  if (v) root.append(visitorCard(ctx, v, draw));
  root.append(sec('Buildings'));
  root.append(card([note('Build and upgrade the kitchen, barracks, forge and the rest of your ludus. You can also tap a plot in the ludus view.'), U.button({ label: 'Open buildings', icon: 'ludus', variant: 'bronze', block: true, onClick: () => ctx.open('building', {}) })])); // QA: the plot screen used to open only by tapping the 3D scene, which keyboard and screen reader players cannot do
  root.append(sec('The world'));
  root.append(card([note('Plan the whole season, deal with the rival schools, look after the barracks, and honor the fallen.'), actions([U.button({ label: 'Calendar', icon: 'scroll', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'calendar' }) }), U.button({ label: 'Rival ludi', icon: 'skull', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'rivals' }) }), U.button({ label: 'Barracks', icon: 'roster', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'barracks' }) }), U.button({ label: `Memorial (${(S.fallen || []).length})`, icon: 'fame', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'memorial' }) }), U.button({ label: 'Infirmary', icon: 'heart', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'infirmary' }) }), U.button({ label: 'Patrons', icon: 'coin', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'patrons' }) }), U.button({ label: 'Chronicle', icon: 'scroll', variant: 'bronze', onClick: () => ctx.open('world', { tab: 'chronicle' }) })])]));
  root.append(sec('Sponsors'));
  root.append(note('Sponsors pay when you finish their contract. Progress counts wins and trophies as you play.'));
  const grid = h('div', 'ax-grid');
  (S.contracts || []).forEach((c, i) => {
    const pr = Math.min(c.n, lm.contractProgress(S, c)), done = pr >= c.n;
    grid.append(card([h('div', 'ax-b', lm.contractText(c)), meter(pr, c.n, done ? 'var(--lx-stam)' : 'var(--lx-xp)'),
      h('div', 'ax-row ax-wrap ax-gap4', [pill(`${pr}/${c.n}`, { tone: done ? 'good' : '' }), goldPill(c.rew.gold, 'Gold reward'), famePill(c.rew.fame), c.rew.item ? pill(`${D.RAR[c.rew.item.rar].n} item`, { tone: 'warn', tip: c.rew.item.name }) : null]),
      done ? U.button({ label: 'Claim reward', variant: 'gold', icon: 'coin', onClick: () => {
        const r = lm.claimContract(S, i); if (!r) return; ctx.save(); ctx.refresh(); ctx.sfx('coin'); U.toast(`Sponsor paid ${r.rew.gold} gold and ${r.rew.fame} fame!`, { kind: 'good', ico: 'coin' }); draw();
      } }) : null], done ? 'gold' : ''));
  });
  root.append(grid);
  root.append(sec('Weekly goals'));
  root.append(card([...lm.weeklyGoals(S).map((g) => row([pill(g.done ? 'Done' : g.p, { tone: g.done ? 'good' : '', ico: g.done ? 'check' : undefined }), h('span', 'ax-grow', g.t)])), note(`Each goal pays ${lm.goalPay(S)} gold at week end.${S.goalStreak ? ` Streak: ${S.goalStreak} week${S.goalStreak > 1 ? 's' : ''}.` : ''}`)]));
  root.append(sec('Factions'));
  const fg = h('div', 'ax-grid');
  Object.keys(D.FACTIONS).forEach((id) => {
    const F = D.FACTIONS[id], r = lm.facRep(S, id), t = lm.facTier(S, id);
    const perks = F.perks.map((pk, i) => row([pill(`${[25, 50, 75, 100][i]}`, { tone: i < t ? 'good' : '', ico: i < t ? 'check' : undefined }), h('span', 'ax-grow ax-sub', pk)]));
    fg.append(card([row([medal('fame', 'dark'), col([h('div', 'ax-name', F.n), note(F.want)], 'ax-grow'), pill(`${r}/100`, { tone: 'gold' })]), meter(r, 100, F.c), ...perks]));
  });
  root.append(fg);
}

function visitorCard(ctx, v, draw) {
  const S = ctx.S, lm = L();
  const go = async () => {
    let g = null;
    if (v.kind === 'trainer') { const ids = await pickFighters(ctx, { title: v.name, intro: note(v.d), n: 1, info: (x) => ({ badges: [pill(`Lv ${x.lvl}`, { tone: 'blue' })] }), confirm: () => ({ label: 'Train them' }) }); if (!ids) return; g = ctx.gOf(ids[0]); }
    const r = lm.visit(S, lm.visitor(S), g); if (typeof r === 'string') { ctx.sfx('uiError'); return U.toast(r, { kind: 'bad' }); }
    ctx.save(); ctx.refresh(); ctx.sfx('levelUp'); U.toast(r.msg, { kind: 'good', ico: 'check' }); draw();
  };
  return card([row([medal('star', 'dark big'), col([h('div', 'ax-name', v.name), note(v.d)], 'ax-grow')]), v.cost ? h('div', 'ax-row ax-wrap', [goldPill(v.cost, 'Price'), S.gold < v.cost ? pill('Not enough gold', { tone: 'bad' }) : null]) : null,
    U.button({ label: v.cost ? `Accept (${v.cost} gold)` : 'Accept', variant: 'gold', block: true, disabled: S.gold < v.cost, onClick: go })], 'gold');
}

// ------------------------------------------------------------------ honors: trophies, records, legacy
function honorsTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), got = S.trophies || {}, n = Object.keys(got).length;
  // WAVE3: trophies by category, SVG glyphs, progress bars, a summary bar
  const CATS = ['All', 'Glory', 'Venatio', 'Survival', 'Ludus'], cat = honorsTab._cat || 'All';
  const catOf = (t) => t.cat || 'Glory', list = D.TROPHIES.filter((t) => cat === 'All' || catOf(t) === cat);
  root.append(sec(`Trophies ${n}/${D.TROPHIES.length}`));
  root.append(h('div', 'lx-bl-sum', [meter(n, D.TROPHIES.length, 'var(--lx-gold)', 'Trophies earned'), h('div', 'ax-sub', n >= D.TROPHIES.length ? 'Every trophy earned. The Grand Collector.' : `${D.TROPHIES.length - n} to go. Open one to see its reward and your progress.`)]));
  root.append(chipRow(CATS.map((c) => ({ id: c, label: c, sub: c === 'All' ? '' : `${D.TROPHIES.filter((t) => catOf(t) === c && got[t.id]).length}/${D.TROPHIES.filter((t) => catOf(t) === c).length}` })), cat, (id) => { honorsTab._cat = id; draw(); }));
  const g = h('div', 'lx-bl-grid');
  list.slice().sort((a, b2) => (got[b2.id] ? 1 : 0) - (got[a.id] ? 1 : 0) || 0).forEach((t) => {
    const has = got[t.id], pg = lm.trophyProgress ? lm.trophyProgress(S, t.id) : null, b = h('button', 'lx-bl-card' + (has ? ' got' : '')); b.type = 'button';
    const ico = h('span', 'lx-bl-ico'); ico.innerHTML = has ? glyph(trophyIcon(t), { size: 30 }) : (pg && pg[0] > 0 ? glyph(trophyIcon(t), { size: 30 }) : glyph('lock', { size: 26 })); ico.style.opacity = has ? 1 : pg && pg[0] > 0 ? 0.75 : 0.6;
    b.append(ico, h('span', 'lx-bl-n', t.n), has ? h('span', 'lx-bl-st', 'Earned') : pg ? h('span', 'lx-bl-pg', [h('i', '', '')]) : h('span', 'lx-bl-st dim', 'Locked'));
    if (!has && pg) { const bar = b.querySelector('.lx-bl-pg i'); bar.style.width = Math.round((pg[0] / Math.max(1, pg[1])) * 100) + '%'; b.append(h('span', 'lx-bl-pn', `${Math.round(pg[0])}/${pg[1]}`)); }
    b.setAttribute('aria-label', `${t.n}. ${has ? 'Earned' : pg ? `Progress ${Math.round(pg[0])} of ${pg[1]}` : 'Not earned yet'}`);
    b.onclick = () => {
      const rw = [t.r.gold ? t.r.gold + ' gold' : '', t.r.fame ? t.r.fame + ' fame' : '', t.r.laurels ? t.r.laurels + ' laurel(s)' : ''].filter(Boolean).join(', ');
      const big = h('div', 'lx-bl-big'); big.innerHTML = glyph(trophyIcon(t), { size: 64, sw: 1.8 }); big.style.opacity = has ? 1 : 0.55;
      const body = h('div', 'ax-col', [big, h('p', '', t.d), h('p', '', has ? `Earned in week ${has}.` : 'Not earned yet.'), pg && !has ? meter(pg[0], pg[1], '#7a3fa8', 'Trophy progress') : null, pg && !has ? h('p', '', `Progress: ${Math.round(pg[0])} of ${pg[1]}.`) : null, h('p', '', `Reward: ${rw}.`)]); body.style.cssText = 'color:#33243a;font:500 14px/20px system-ui,sans-serif';
      ctx.ask({ title: t.n, body, actions: [{ label: 'Close', value: 'ok', variant: 'bronze' }], dismiss: 'ok' });
    };
    g.append(b);
  });
  if (!list.length) root.append(empty('lock', 'Nothing here yet', 'Play on and this shelf fills up.'));
  root.append(g);
  const st = S.stats || {};
  root.append(sec('Records'));
  root.append(card([kv('Fights', fmt(st.fights || 0)), kv('Wins / Losses', `${st.wins || 0} / ${st.losses || 0}`), kv('Tournaments won', fmt(st.tourneys || 0)), kv('Mercies shown', fmt(st.spares || 0)), kv('Foes killed / ransomed', `${fmt(st.kills || 0)} / ${fmt(st.ransoms || 0)}`), kv('Weeks run', fmt(st.weeks || 0)),
    kv('Fallen fighters', fmt(st.fallen || 0)), kv('Best Pit floor', fmt(S.pitBest || 0)), kv('Best Daily floor', fmt(S.dailyBest || 0)), kv('Best Horde wave', fmt(S.hordeBest || 0)), kv('Bounties claimed', fmt(st.bounties || 0)), kv('Champions beaten', fmt(st.champs || 0)), kv('Contracts done', fmt(st.contracts || 0))]));
  if ((S.awards || []).length) {
    root.append(sec('Season awards'));
    root.append(card(S.awards.slice().reverse().map((a) => h('div', '', [h('b', '', `Season ${a.season}`), `: ${a.wins} wins${a.mvp ? ', MVP ' + a.mvp : ''}${a.rival ? ', rivals ' + a.rival : ''}`]))));
  }
  const slots = Math.round(lm.bfx(S, 'hall').v);
  root.append(sec('Legacy'));
  root.append(card([row([medal('fame', 'dark big'), col([h('div', 'ax-name', `${S.laurels} laurels`), note(`Reach the Imperial Games (1800 fame) or win them, then found a new ludus. You keep laurels, perks and legends, and start over faster.${S.ascensions ? ` New ludi founded: ${S.ascensions}.` : ''}`)], 'ax-grow')]),
    actions([U.button({ label: 'Perks', icon: 'fame', variant: 'bronze', onClick: () => perksSheet(ctx, draw) }), U.button({ label: `Legends (${(S.legends || []).length})`, icon: 'star', variant: 'bronze', onClick: () => legendsSheet(ctx) })]),
    U.button({ label: `New ludus (+${lm.laurelsFor(S)})`, icon: 'ludus', sub: 'Found a new ludus and earn laurels', variant: lm.canAscend(S) ? 'danger' : 'ghost', block: true, disabled: !lm.canAscend(S), onClick: () => ascendFlow(ctx) }),
    !lm.canAscend(S) ? note(`Needs 1800 fame (you have ${fmt(S.fame)}) or an Imperial Games win. ${slots} statue slot${slots === 1 ? '' : 's'} in your Hall.`) : null], 'gold'));
}

// ------------------------------------------------------------------ settings
function settingsTab(ctx, root, draw) {
  const S = ctx.S, p = readPrefs(); S.opts = S.opts || {};
  const a = ctx.audio, save = () => { writePrefs(p); };
  root.append(sec('Sound'));
  root.append(card([
    toggle('Sound on', 'Mute everything without losing your volume levels.', !p.muted, (v) => { p.muted = !v; save(); a.setMaster(p.muted ? 0 : p.master); ctx.sfx('uiTap'); }),
    slider('Master volume', p.master, (v) => { p.master = v; a.setMaster(p.muted ? 0 : v); }, () => { save(); ctx.sfx('uiTap'); }),
    slider('Music', p.music, (v) => { p.music = v; a.setMusic(v); }, () => save()),
    slider('Effects and crowd', p.sfx, (v) => { p.sfx = v; a.setSfx(v); }, () => { save(); ctx.sfx('swordHit'); }),
  ]));
  root.append(sec('Comfort'));
  const setOpt = (k, pk, v) => { S.opts[k] = v; p[pk] = v; save(); ctx.save(); applyPrefs(ctx); };
  root.append(card([
    toggle('Reduced motion', 'Calms menu animations and transitions, shakes less and turns gore off.', !!(S.opts.rm || p.rm), (v) => setOpt('rm', 'rm', v)),
    toggle('Large text', 'Bigger text in menus and dialogs.', !!(S.opts.big || p.big), (v) => setOpt('big', 'big', v)),
    toggle('High contrast', 'Flat dark panels, white text and thick edges. Follows your device setting when it asks for more contrast.', !!(S.opts.hc || p.hc), (v) => setOpt('hc', 'hc', v)),
  ]));
  root.append(sec('Violence'));
  const gl = h('div', 'ax-grid s'), gnote = { off: 'No blood, no wounds, no dismemberment.', low: 'Blood splashes and wounds. No dismemberment.', full: 'Arterial sprays, pools, wounds and dismemberment.' };
  for (const lv of ['off', 'low', 'full']) {
    const b = h('button', 'ax-pick' + (p.gore === lv ? ' sel' : '')); b.type = 'button'; b.style.cssText = 'flex-direction:column;align-items:flex-start;text-align:left'; b.setAttribute('aria-pressed', p.gore === lv ? 'true' : 'false');
    b.append(h('div', 'ax-b', { off: 'Gore: Off', low: 'Gore: Low', full: 'Gore: Full' }[lv]), h('div', 'ax-sub', gnote[lv])); b.onclick = () => { p.gore = lv; save(); applyPrefs(ctx); ctx.sfx('uiConfirm'); draw(); }; gl.append(b);
  }
  root.append(card([gl, note('Fights are graphic in the arena. Reduced motion always turns gore off.')]));
  root.append(sec('Play'));
  const cur = S.opts.diff != null ? S.opts.diff : 1;
  const effects = ['Rivals 12% weaker, +10% gold', 'Rivals as designed', 'Rivals 12% stronger, +15% gold'];
  const dg = h('div', 'ax-grid s');
  D.DIFF_N.forEach((nme, i) => {
    const b = h('button', 'ax-pick' + (i === cur ? ' sel' : '')); b.type = 'button'; b.style.cssText = 'flex-direction:column;align-items:flex-start;text-align:left'; b.setAttribute('aria-pressed', i === cur ? 'true' : 'false');
    b.append(h('div', 'ax-b', nme), h('div', 'ax-sub', effects[i])); b.onclick = () => { S.opts.diff = i; ctx.save(); ctx.sfx('uiConfirm'); draw(); }; dg.append(b);
  });
  root.append(card([h('div', 'ax-b', 'Difficulty'), dg, toggle('Auto ultimates', 'Fighters cast their ultimates on their own. Turn off to time them yourself.', !!S.flags.auto, (v) => { S.flags.auto = v; ctx.save(); ctx.sfx('uiTap'); }),
    toggle('Hardcore (permadeath)', 'Off by default. When on, ANY defeat can kill the fighter who went down. The Pit, Horde Trial, champion duels and bounties can already kill with Hardcore off.', !!S.opts.hardcore, (v) => { S.opts.hardcore = v; ctx.save(); ctx.sfx(v ? 'deathThud' : 'uiTap'); })]));
  saveSection(ctx, root);
}

// ------------------------------------------------------------------ help: how to play, save tools, credits
function helpTab(ctx, root, draw) {
  root.append(sec('How to play'));
  const steps = [
    ['Plan the week', 'Give every gladiator an activity in the Roster: train a stat, rest, spar or take odd jobs. It repeats each week.'],
    ['Build your fighters', 'Gear with on-hit effects and sets, a Keystone rune plus two minors, masteries at levels 5, 10, 15 and 20, techniques that fire on their own, and ultimates you trigger.'],
    ['Scout the Arena', 'Matches are announced weeks ahead. A Scout Tower reveals more about rivals and shows more weeks. Style matchups give a small edge only.'],
    ['Fight live', 'Gladiators move, strike and cast on their own. Tap your ultimates at the right moment and tap an enemy to focus it. Before each fight pick an augment.'],
    ['Grow', 'Win gold, fame, loot, runes and relics. Upgrade buildings from More, Ludus, or by tapping a plot (neighbors add synergy), merge gear, bet on mispriced fights, try the Pit of Trials, then found a new ludus for laurels.'],
    ['Rearrange the ludus', 'Tap the hammer button at the bottom right of the ludus, or Move this building on a plot. Lift a building, tap an empty plot to move it or another building to swap, check the price and confirm. The crew rebuilds it in 1 to 3 weeks: its perks pause meanwhile, its level stays. Undo in the same week for most of the gold back. The Hall of Legends cannot be moved. Arrow keys and Enter work too, Escape steps back.'],
    ['Wounds, patrons, events', 'Injuries hit a body part (arm, knee, head, eye, ribs) and some heal into permanent scars that cost something. In the Infirmary decide per wound: rest it for free or pay to treat it, each with its own risk. Patrons sign contracts with demands, pay weekly and bite when you fail. Weekly events can chain into later consequences; the Chronicle keeps the log. All three are tabs of The World.'],
    ['Mind the world', 'In More, the Calendar shows the whole season. Rival ludi have natures: gift the greedy, train with the honorable. Mentors and feasts lift the barracks. The Pit, Horde, duels with champions and bounties can kill a fighter; honor them on the memorial wall.'],
  ];
  root.append(card(steps.map(([t, d], i) => row([h('span', 'ax-medal', String(i + 1)), col([h('div', 'ax-b', t), note(d)], 'ax-grow')]))));
  root.append(U.button({ label: 'Replay tutorial', icon: 'star', variant: 'gold', block: true, onClick: () => { ctx.closeAll(); ctx.sfx('uiConfirm'); ctx.game.tutorial && ctx.game.tutorial.restart(); } }));
  root.append(note('The tutorial shows you the loop again with a spotlight. Your ludus is not changed.'));
  root.append(sec('Save'));
  root.append(card([note('Backup, restore and device transfer live in Settings, under Save and backup.'), U.button({ label: 'Open Settings', icon: 'gear', variant: 'bronze', block: true, onClick: () => { tab = 'settings'; draw(); } })]));
  root.append(sec('Credits'));
  root.append(card([h('div', 'ax-name', 'Ludus Maximus 3D'), note('A gladiator school management game. Every model, texture, sound and tune is generated in code and rendered with three.js. Inspired by the schools of ancient Rome and by the long tradition of games about running one.'), note('Thank you for playing.')]));
}

// ------------------------------------------------------------------ save and backup (QA): file export/import, code, delete
function saveSection(ctx, root) {
  const S = ctx.S, lm = L();
  root.append(sec('Save and backup'));
  const stored = !lm.saveError, kids = [pill(stored ? 'Saved in this browser' : 'Saving is blocked here', { tone: stored ? 'good' : 'bad', ico: stored ? 'check' : 'lock', tip: stored ? 'Your ludus saves automatically in this browser.' : 'Storage is full or blocked. Download a save file now so you do not lose progress.' }),
    note(`Save format ${S.sv || 1}. ${S.lastBackup ? `Last backup in week ${S.lastBackup}.` : 'You have not made a backup yet.'} A save file is a small JSON file you can keep anywhere and load on any device.`),
    actions([U.button({ label: 'Download save file', icon: 'scroll', variant: 'gold', onClick: () => downloadSave(ctx) }), U.button({ label: 'Load save file', icon: 'scroll', variant: 'bronze', onClick: () => pickSaveFile(ctx) })]),
    actions([U.button({ label: 'Show save code', icon: 'scroll', variant: 'ghost', onClick: () => exportSheet(ctx) }), U.button({ label: 'Paste save code', icon: 'scroll', variant: 'ghost', onClick: () => importSheet(ctx) })])];
  if (lm.hasBackup && lm.hasBackup()) kids.push(note('An automatic copy from before the last upgrade is also kept in this browser.'));
  kids.push(U.button({ label: 'Delete this ludus', icon: 'skull', variant: 'danger', block: true, onClick: () => wipe(ctx) }));
  root.append(card(kids));
}

export function saveFileName(S) { return `ludus_maximus_${String(S.name || 'ludus').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'ludus'}_s${S.season}_w${((S.week - 1) % 12) + 1}.json`; }
function downloadSave(ctx) {
  const S = ctx.S; S.lastBackup = S.week; ctx.save();
  if (U.download(saveFileName(S), L().exportFile(S))) { ctx.sfx('uiConfirm'); U.toast('Save file downloaded', { kind: 'good', ico: 'check' }); }
  else { ctx.sfx('uiError'); U.toast('Downloads are blocked here. Use Show save code instead.', { kind: 'bad' }); }
}
function pickSaveFile(ctx) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.setAttribute('aria-label', 'Choose a save file'); inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    let text = ''; try { text = await f.text(); } catch (e) { ctx.sfx('uiError'); return U.toast('That file could not be read', { kind: 'bad' }); }
    const r = L().parseImport(text); if (!r.S) { ctx.sfx('uiError'); return U.toast(r.err || 'That file did not work', { kind: 'bad' }); }
    await replaceWith(ctx, r.S, r);
  });
  document.body.append(inp); inp.click();
}
async function replaceWith(ctx, N, r = {}) {
  const ok = await confirmDialog(ctx, { title: 'Replace your ludus?', text: `This loads "${N.name}" (season ${N.season}, week ${N.week}, ${fmt(N.gold)} gold) and overwrites the current save.${r.repaired ? ' The file was damaged and has been repaired; some recent progress may be missing.' : ''}${r.newer ? ' It comes from a newer version of the game and may not behave correctly.' : ''}`, yes: 'Replace', no: 'Cancel', danger: true });
  if (!ok) return false;
  ctx.game.S = N; ctx.save(); ctx.closeAll(); ctx.refresh(); ctx.sfx('levelUp'); applyPrefs(ctx); U.toast('Save loaded', { kind: 'good', ico: 'check' }); return true;
}

function exportSheet(ctx) {
  const S = ctx.S, code = L().exportCode(S); S.lastBackup = S.week; ctx.save();
  const scr = openScreen(ctx, { title: 'Save code', mid: true });
  const ta = h('textarea', 'ax-ta'); ta.readOnly = true; ta.value = code; ta.setAttribute('aria-label', 'Save code'); ta.onfocus = () => ta.select();
  scr.render((root) => {
    root.append(note('Copy this code somewhere safe. Paste it into Import save on any device to restore your ludus.'), ta,
      U.button({ label: 'Copy code', icon: 'check', variant: 'gold', block: true, onClick: async () => {
        try { await navigator.clipboard.writeText(code); ctx.sfx('uiConfirm'); U.toast('Copied to the clipboard', { kind: 'good', ico: 'check' }); }
        catch (e) { ta.focus(); ta.select(); U.toast('Press copy on your keyboard or device', { kind: 'info' }); }
      } }));
  });
}

function importSheet(ctx) {
  const scr = openScreen(ctx, { title: 'Import save', mid: true });
  const ta = h('textarea', 'ax-ta'); ta.setAttribute('aria-label', 'Paste a save code'); ta.placeholder = 'Paste a save code here';
  scr.render((root) => {
    root.append(note('Paste a save code. This replaces your current ludus, so export first if you want to keep it.'), ta,
      U.button({ label: 'Load this ludus', icon: 'check', variant: 'danger', block: true, onClick: async () => {
        const t = ta.value.trim(); if (!t) { ctx.sfx('uiError'); return U.toast('Paste a code first', { kind: 'bad' }); }
        const r = L().parseImport(t); if (!r.S) { ctx.sfx('uiError'); return U.toast(r.err || 'That code did not work', { kind: 'bad' }); }
        await replaceWith(ctx, r.S, r);
      } }));
  });
}

async function wipe(ctx) {
  if (!(await confirmDialog(ctx, { title: 'Delete your ludus?', text: 'All fighters, buildings and progress are removed. Laurels and perks are lost too.', yes: 'Delete', no: 'Keep it', danger: true }))) return;
  if (!(await confirmDialog(ctx, { title: 'Really delete?', text: 'This cannot be undone. Export a save code first if you might want it back.', yes: 'Yes, delete everything', no: 'Cancel', danger: true }))) return;
  L().wipe(); ctx.sfx('uiConfirm'); U.toast('Ludus deleted. Starting over...', { kind: 'info' });
  setTimeout(() => { try { location.reload(); } catch (e) { /* ignore */ } }, 600);
}
