// Gladiator profile: hero, stats, gear, skills, life (story, bonds, diary) and management (rename, retrain, retire, release).
import { h, U, D, L, fmt, portrait, injectCss, addCss, chip, sec, pips, wide, setTitle, empty, note, confirm, promptText } from './ui_common.js';
import { itemCard, SLOT_ICON, fmtSt } from '../uihelpers.js';

const CSS = `
.pf-hero{display:grid;gap:10px 14px;grid-template-columns:auto minmax(0,1fr);align-items:center}
.pf-id{display:grid;gap:4px;min-width:0}
.pf-meters{grid-column:1/3;display:grid;gap:6px}
.pf-m{display:grid;grid-template-columns:50px 1fr 46px;gap:8px;align-items:center;font:700 11px var(--lx-sans);letter-spacing:.04em;text-transform:uppercase;color:#5a4560}
.pf-m b{text-align:right;color:#2a1a30}
@media(min-width:700px){.pf-hero{grid-template-columns:auto minmax(0,1.2fr) minmax(0,1fr)}.pf-meters{grid-column:auto}}
.pf-ph{position:relative;flex:none;border-radius:50%;padding:4px;background:radial-gradient(circle at 35% 30%,#ffe08a,#b8803a);box-shadow:0 4px 10px rgba(60,40,10,.4)}
.pf-xp{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;font:700 12px var(--lx-sans);color:#5a4560}
.pf-style{font:600 13px/18px var(--lx-sans);color:#4a3550;overflow-wrap:anywhere}
.pf-stat{display:grid;grid-template-columns:minmax(78px,104px) 1fr 52px 44px;gap:8px;align-items:center;margin:8px 0;min-height:30px}
.pf-stat-n{display:flex;align-items:center;gap:6px;font:800 12px var(--lx-serif);letter-spacing:.06em;text-transform:uppercase;color:#2a1a30;min-width:0}
.pf-stat-n i{flex:none;width:10px;height:10px;border-radius:50%;background:var(--sc);box-shadow:0 0 0 2px rgba(0,0,0,.2)}
.pf-stat-n span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-stat .lx-bar{--c:var(--sc)}
.pf-stat-v{text-align:right;font:800 15px var(--lx-sans);color:#2a1a30}
.pf-der{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
@media(min-width:560px){.pf-der{grid-template-columns:repeat(6,minmax(0,1fr))}}
.pf-dc{text-align:center;padding:8px 4px;border-radius:10px;background:rgba(255,255,255,.5);border:1px solid rgba(122,82,34,.3);min-width:0}
.pf-dc span{display:block;font:800 10.5px var(--lx-serif);letter-spacing:.1em;color:#7a5222}
.pf-dc b{display:block;font:900 18px/22px var(--lx-sans);color:#2a1a30}
.pf-dc small{display:block;font:800 11px var(--lx-sans);color:#1f6a40;min-height:14px}
.pf-slot{display:flex;gap:10px;align-items:center;width:100%;text-align:left;min-height:64px;cursor:pointer;font-family:inherit;color:inherit}
.pf-slot:hover{background:rgba(242,193,78,.22)}
.pf-slot:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.pf-slot .fv-item{margin:0!important;background:none!important;border:0!important;padding:0!important;flex:1}
.pf-slot-e{flex:none;width:46px;height:46px;border-radius:8px;border:2px dashed rgba(122,82,34,.55);display:grid;place-items:center;color:#9a7a42}
.pf-slot-l{font:800 11px var(--lx-serif);letter-spacing:.14em;text-transform:uppercase;color:#7a2f30}
.pf-ult{display:flex;gap:12px;align-items:flex-start;border-left:6px solid var(--uc)}
.pf-ult-i{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 35% 30%,var(--uc),#1d1830);box-shadow:0 0 0 2px #b8803a,0 3px 6px rgba(0,0,0,.35)}
.pf-list{display:grid;gap:8px}
.pf-kv{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:32px;font:600 14px var(--lx-sans);color:#33243a;border-bottom:1px dotted rgba(122,82,34,.35)}
.pf-kv b{text-align:right;min-width:0;overflow-wrap:anywhere}
.pf-diary{display:grid;gap:4px;font:500 13px/18px var(--lx-sans);color:#33243a}
.pf-diary b{color:#7a2f30}
.pf-style-opt{display:flex;gap:12px;align-items:center;width:100%;text-align:left;min-height:60px;cursor:pointer;font-family:inherit;color:inherit;margin-bottom:8px}
.pf-style-opt:hover{background:rgba(242,193,78,.22)}
.pf-style-opt:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.pf-cere{text-align:center;display:grid;gap:10px;justify-items:center}
.pf-cere .pf-ph{transform:scale(1.2);margin:8px}
`;
const STAT_TIP = { str: 'Strength: raises attack damage.', agi: 'Agility: raises speed and evasion.', end: 'Endurance: raises HP and armor.', skl: 'Skill: raises crit chance and adds a little damage.', wil: 'Heart: resists stuns and can survive a killing blow with grit.' };
const DER = [['hp', 'HP', 'Hit points. Reach zero and the fight is lost.', 1], ['atk', 'ATK', 'Damage dealt per hit.', 1], ['def', 'DEF', 'Armor: reduces damage taken.', 1], ['spd', 'SPD', 'Movement and attack speed.', 1], ['crit', 'CRIT', 'Chance to land a critical hit.', 100], ['eva', 'EVA', 'Chance to dodge a blow.', 100]];
const TABS = [['stats', 'Stats', 'star'], ['gear', 'Gear', 'shield'], ['skills', 'Skills', 'bladedance'], ['life', 'Life', 'scroll']];

export function open(ctx, arg) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  const g = arg && typeof arg === 'object' ? arg : ctx.gOf(arg);
  if (!g) { ctx.toast('That fighter is gone.', { kind: 'bad' }); return; }
  const owned = S.glads.includes(g);
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: g.name, body, actions: [] }), 800);
  let tab = 'stats', dead = false; const origClose = m.close; m.close = () => { dead = true; origClose.call(m); };
  const commit = () => { ctx.save(); ctx.refresh(); };
  const redraw = () => { if (!dead) { setTitle(m, g.name); render(); } };

  // ------------------------------------------------------------ hero
  function hero() {
    const st = d.STYLES[g.style], T = d.TRAITS[g.trait];
    const c = h('div', 'lm-card pf-hero');
    const sc = chip(st.n, 'bronze'); sc.style.background = st.c; U.tooltip(sc, `${st.role}. ${st.d} Beats ${st.beats.map((b) => d.STYLES[b].n).join(' and ')} by a small margin.`, { title: st.n });
    const ph = h('div', 'pf-ph', portrait(ctx, g, 76));
    const rec = chip(`${g.rec.w}W ${g.rec.l}L`, 'grey', 'Career record in the arena');
    const stars = h('div', '', U.stars(lm.stars(g), 5)); U.tooltip(stars, 'Stars show natural talent across the five stats.', { title: 'Stars' });
    const tr = h('div', 'lm-chips', [chip(T.n, 'purple'), h('span', 'lm-sub', T.d)]);
    const nameBox = h('div', 'pf-id', [h('div', 'lm-h1', g.name), (g.nick || g.title) ? h('div', 'lm-sub', [g.nick || '', g.nick && g.title ? ' · ' : '', g.title ? h('b', '', g.title) : ''].filter((x) => x !== '')) : null, h('div', 'lm-chips', [sc, chip('Lv ' + g.lvl, 'gold'), rec]), stars, tr]);
    const need = lm.need(g.lvl);
    const mt = (label, bar, val) => h('div', 'pf-m', [h('span', 'lm-num', label), bar, h('b', 'lm-num', val)]);
    const meters = h('div', 'pf-meters', [
      mt('XP', U.bar({ value: g.xp, max: need, kind: 'xp', height: 9 }), `${Math.floor(g.xp)}/${need}`),
      mt('Energy', U.bar({ value: g.en, max: 100, kind: 'stam', height: 9 }), Math.round(g.en)),
      mt('Morale', U.bar({ value: g.mo, max: 100, kind: 'foe', height: 9 }), Math.round(g.mo))]);
    c.append(ph, nameBox, meters);
    return c;
  }

  function alerts() {
    const out = [];
    if (owned && g.pend && g.pend.length) {
      const c = h('div', 'lm-card lm-gold lm-row', [h('div', 'lm-grow', [h('div', 'lm-name', 'Level-up pick waiting'), h('div', 'lm-sub', `${g.pend.length} choice${g.pend.length > 1 ? 's' : ''} to make. Picks are permanent.`)]), U.button({ label: 'Choose', variant: 'gold', onClick: async () => { const f = await import('../flow.js'); await f.pickPends(ctx); commit(); redraw(); } })]);
      out.push(c);
    }
    if (g.inj > 0) {
      const c = h('div', 'lm-card lm-warn');
      c.append(h('div', 'lm-name', `Injured: ${g.inj} week${g.inj > 1 ? 's' : ''} to heal`), h('div', 'lm-sub', 'An injured fighter rests and cannot enter games. Poultice: 60% chance to save 1 week. Physician: always saves 2 weeks.'));
      if (owned) {
        const row = h('div', 'lm-btnrow'); row.style.marginTop = '8px';
        row.append(
          U.button({ label: `Poultice ${lm.treatCost(S, 'pou')}g`, variant: 'bronze', onClick: () => treat('pou') }),
          U.button({ label: `Physician ${lm.treatCost(S, 'doc')}g`, variant: 'gold', onClick: () => treat('doc') }));
        c.append(row);
      }
      out.push(c);
    }
    return out;
  }
  function treat(kind) {
    const before = g.inj, e = lm.treat(S, g, kind);
    if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; }
    ctx.sfx(g.inj < before ? 'coin' : 'uiTap'); commit();
    ctx.toast(g.inj <= 0 ? `${g.name} is fit again!` : g.inj < before ? `${g.name} needs ${g.inj} more week${g.inj > 1 ? 's' : ''}.` : 'The poultice did not help this time.', { kind: g.inj < before ? 'good' : 'info' });
    redraw();
  }

  // ------------------------------------------------------------ tabs
  function tabs() {
    const bar = h('div', 'lm-tabs'); bar.setAttribute('role', 'tablist');
    TABS.forEach(([id, label, ic]) => {
      const b = h('button', 'lm-tab' + (tab === id ? ' on' : ''), [U.icon(ic, 18), h('span', '', label)]); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', tab === id);
      if (id === 'skills' && owned && g.pend && g.pend.length) b.append(h('i', ''));
      b.addEventListener('click', () => { tab = id; ctx.sfx('uiTap', { gain: 0.5 }); render(); });
      bar.append(b);
    });
    return bar;
  }

  // ------------------------------------------------------------ stats tab
  function statsTab() {
    const box = h('div');
    if (owned) {
      if (lm.canDrill(S, g)) box.append(h('div', 'lm-card lm-gold', [h('div', 'lm-name', 'Training drill'), h('div', 'lm-sub', `A quick minigame for a bonus on this week's ${d.SN[lm.activity(g).s]} gain.`), (() => { const b = U.button({ label: 'Start drill', icon: 'bladedance', variant: 'gold', block: true, onClick: async () => { const mod = await import('./drill.js'); mod.open(ctx, g, () => { commit(); redraw(); }); } }); b.style.marginTop = '8px'; return b; })()]));
      else if (g.drill && g.drill.week === S.week) box.append(chip(g.drill.m > 0 ? `Drilled +${Math.round(g.drill.m * 100)}% this week` : 'Drilled this week, no bonus', g.drill.m > 0 ? 'green' : 'grey'));
      box.append(sec('Weekly activity'), activityPicker());
    }
    const cap = lm.cap(g);
    box.append(sec('Stats', h('span', 'lm-sub lm-num', `training cap ${cap}`)));
    d.STATS.forEach((s) => {
      const r = h('div', 'pf-stat'); r.style.setProperty('--sc', d.SC[s]);
      const n = h('div', 'pf-stat-n', [h('i'), h('span', '', d.SN[s])]); U.tooltip(n, STAT_TIP[s], { title: d.SN[s] });
      r.append(n, U.bar({ value: g.st[s], max: Math.max(cap, g.st[s]), kind: 'xp', height: 10 }), h('b', 'pf-stat-v lm-num', g.st[s].toFixed(1)), pips(g.tal[s]));
      r.setAttribute('aria-label', `${d.SN[s]} ${g.st[s].toFixed(1)}, talent ${g.tal[s]} of 3`);
      box.append(r);
    });
    box.append(note('At the training cap a stat grows slowly. Levels raise the cap.'));
    const dv = lm.derive(g, { noperf: true }), base = lm.derive(Object.assign({}, g, { gear: {} }), { noperf: true });
    box.append(sec('Combat'));
    const grid = h('div', 'pf-der');
    DER.forEach(([k, lab, tip, mul]) => {
      const v = Math.round(dv[k] * mul), bonus = Math.round((dv[k] - base[k]) * mul);
      const cell = h('div', 'pf-dc', [h('span', '', lab), h('b', 'lm-num', mul === 100 ? v + '%' : v), h('small', 'lm-num', bonus > 0 ? `+${bonus}${mul === 100 ? '%' : ''} gear` : '')]);
      U.tooltip(cell, tip, { title: lab }); grid.append(cell);
    });
    box.append(grid);
    if (dv.sets.length) box.append(note('Set bonuses: ' + dv.sets.map((x) => `${d.SETS[x.id].n} ${x.n}pc`).join(', ')));
    return box;
  }

  function activityPicker() {
    const wrap = h('div', 'lm-btnrow');
    d.ACTS.forEach((a) => {
      const b = h('button', 'lm-act', a.n); b.type = 'button'; b.setAttribute('aria-pressed', g.act === a.id); b.disabled = g.inj > 0;
      b.style.cssText = 'flex:1 1 96px;font-size:11px;padding:6px 4px 9px';
      if (a.t === 'train') b.style.setProperty('--sc', d.SC[a.s]);
      b.addEventListener('click', () => { g.act = a.id; ctx.sfx('uiTap'); ctx.save(); redraw(); });
      wrap.append(b);
    });
    return wrap;
  }

  // ------------------------------------------------------------ gear tab
  function gearTab() {
    const box = h('div');
    const row = h('div', 'lm-btnrow');
    if (owned) row.append(U.button({ label: 'Auto-equip best', icon: 'gear', variant: 'gold', onClick: () => { lm.autoEquip(S, g); ctx.sfx('uiConfirm'); commit(); redraw(); } }));
    box.append(row);
    const grid = h('div', 'lm-grid'); grid.style.marginTop = '10px';
    d.SLOTS.forEach((slot) => {
      const it = g.gear[slot], spare = S.items.filter((i) => i.slot === slot).length;
      const b = h('button', 'lm-card pf-slot'); b.type = 'button'; b.disabled = !owned && !it;
      const info = h('div', 'lm-grow');
      info.append(h('div', 'pf-slot-l', d.SLOT_NAME[slot]));
      if (it) { const ic = itemCard(it, {}); ic.querySelector('.fv-item-info').append(h('div', 'lm-sub', `${spare} spare in the armory`)); info.append(ic); }
      else { info.append(h('div', 'lm-name', 'Empty'), h('div', 'lm-sub', spare ? `${spare} available. Tap to equip.` : 'Nothing in the armory for this slot.')); }
      b.append(...(it ? [] : [h('div', 'pf-slot-e', U.icon(SLOT_ICON[slot] || 'star', 24))]), info);
      if (it) { /* itemCard carries its own frame */ }
      b.setAttribute('aria-label', `${d.SLOT_NAME[slot]}: ${it ? it.name : 'empty'}. Tap to change.`);
      if (owned) b.addEventListener('click', async () => { const mod = await import('./equip.js'); ctx.sfx('uiTap'); mod.open(ctx, g, slot, () => { commit(); redraw(); }); });
      grid.append(b);
    });
    box.append(grid);
    const sc = lm.setCounts(g), sl = Object.keys(sc).filter((k) => sc[k] >= 2);
    if (sl.length) { box.append(sec('Set bonuses')); sl.forEach((k) => box.append(h('div', 'lm-card', [h('div', 'lm-chips', [chip(`${d.SETS[k].n} ${sc[k]}pc`, 'purple')]), h('div', 'lm-sub', d.SETS[k].d2 + (sc[k] >= 4 ? ', ' + d.SETS[k].d4 : ''))]))); }
    else box.append(note('Wearing two or more pieces of the same set unlocks set bonuses.'));
    return box;
  }

  // ------------------------------------------------------------ skills tab
  function skillsTab() {
    const box = h('div');
    { const st = d.STYLES[g.style]; box.append(sec('Fighting style'), h('div', 'lm-card', [h('div', 'lm-row lm-wrap', [h('b', 'lm-name', st.n), chip(st.role, 'bronze')]), h('div', 'lm-sub', st.d), h('div', 'lm-sub', `Small edge against ${st.beats.map((b) => d.STYLES[b].n).join(' and ')}.`)])); }
    box.append(sec('Ultimates', h('span', 'lm-sub', 'you trigger these')));
    const ul = h('div', 'pf-list');
    lm.ultsOf(g).forEach((id) => { const u = d.ULTS[id]; const c = h('div', 'lm-card pf-ult', [h('span', 'pf-ult-i', U.icon(id, 24)), h('div', 'lm-grow', [h('div', 'lm-row lm-wrap', [h('b', 'lm-name', u.n), chip(u.cd + 's', 'bronze', 'Cooldown')]), h('div', 'lm-sub', u.d)])]); c.style.setProperty('--uc', u.c); ul.append(c); });
    box.append(ul);
    if (!g.ult2) box.append(note('A second ultimate unlocks at level 8.'));
    box.append(sec('Techniques', h('span', 'lm-sub', 'cast automatically')));
    const tl = h('div', 'pf-list');
    g.techs.forEach((t) => { const T = d.TECHS[t]; tl.append(h('div', 'lm-card', [h('div', 'lm-row lm-wrap', [h('b', 'lm-name', T.n), chip(T.cd + 's', 'bronze', 'Cooldown')]), h('div', 'lm-sub', T.d)])); });
    box.append(tl);
    box.append(sec('Masteries'));
    if (g.mast.length) { const ml = h('div', 'pf-list'); g.mast.forEach((id) => ml.append(h('div', 'lm-card', [h('b', 'lm-name', d.MASTS[id].n), h('div', 'lm-sub', d.MASTS[id].d)]))); box.append(ml); }
    else box.append(empty('No masteries yet.'));
    if (g.lvl < 20) box.append(note(`Next mastery at level ${Math.floor(g.lvl / 5) * 5 + 5}.`));
    const kr = d.KEYSTONES[g.rune.k];
    box.append(sec('Runes'));
    const rl = h('div', 'pf-list');
    const kc = h('div', 'lm-card pf-ult', [h('span', 'pf-ult-i', U.icon('star', 22)), h('div', 'lm-grow', [h('div', 'lm-row lm-wrap', [h('b', 'lm-name', kr.n), chip('Keystone', 'gold')]), h('div', 'lm-sub', kr.d)])]); kc.style.setProperty('--uc', kr.c); rl.append(kc);
    g.rune.m.forEach((id) => rl.append(h('div', 'lm-card', [h('div', 'lm-row lm-wrap', [h('b', 'lm-name', d.MINORS[id].n), chip('Minor', 'grey')]), h('div', 'lm-sub', d.MINORS[id].d)])));
    box.append(rl);
    if (owned) { const b = U.button({ label: 'Change runes', icon: 'gear', variant: 'bronze', block: true, onClick: async () => { const mod = await import('./runes.js'); mod.open(ctx, g, () => { commit(); redraw(); }); } }); b.style.marginTop = '10px'; box.append(b); }
    return box;
  }

  // ------------------------------------------------------------ life tab
  function lifeTab() {
    const box = h('div');
    const sd = lm.storyDef(g);
    if (sd) {
      box.append(sec('Backstory'));
      const c = h('div', 'lm-card'); c.append(h('div', 'lm-row lm-wrap', [h('b', 'lm-name', sd.n), g.story.done ? chip('Complete: ' + sd.rew.title, 'green') : null]), h('div', 'lm-sub', sd.text));
      if (!g.story.done) {
        const pr = Math.min(sd.goal.n, lm.storyProg(g));
        c.append(U.bar({ value: pr, max: sd.goal.n, kind: 'xp', height: 10, label: `${Math.floor(pr)}/${sd.goal.n}` }));
        c.lastChild.style.margin = '8px 0 4px';
        c.append(h('div', 'lm-sub', `Goal: ${sd.goal.k === 'wins' ? 'win ' + sd.goal.n + ' fights' : sd.goal.k === 'lvl' ? 'reach level ' + sd.goal.n : 'earn ' + sd.goal.n + ' personal fame'}. Reward: +${sd.rew.v} ${d.SA[sd.rew.stat]}, ${sd.rew.fame} fame and the title "${sd.rew.title}".`));
      }
      box.append(c);
    }
    const dd = (g.dd || []).map((id) => d.DEEDS.find((x) => x.id === id)).filter(Boolean);
    box.append(sec('Earned names', h('span', 'lm-sub lm-num', `${dd.length}/${d.DEEDS.length}`)));
    box.append(note('Great deeds earn a nickname from the crowd, and each one adds +2 to a stat.'));
    const dc = h('div', 'lm-chips'); dd.forEach((x) => dc.append(chip(`${x.n} +2 ${d.SA[x.st]}`, 'gold')));
    d.DEEDS.filter((x) => !(g.dd || []).includes(x.id)).forEach((x) => dc.append(chip(x.n + '?', 'grey', 'Not earned yet')));
    box.append(dc);

    const fav = g.fav || 0;
    box.append(sec('Crowd favorite'), U.bar({ value: fav, max: 100, kind: 'hp', height: 12, label: `${Math.round(fav)}/100` }), note('Fan love raises purses by up to 20%. It fades 2 per week.'));

    const rels = S.glads.filter((o) => o.id !== g.id).map((o) => ({ o, b: lm.bond(S, g.id, o.id), r: lm.rivalryOf(S, g.id, o.id) })).filter((x) => x.b >= 10 || x.r >= 15);
    box.append(sec('Bonds and rivalries'));
    if (rels.length) {
      rels.forEach((x) => box.append(h('div', 'pf-kv', [h('span', '', x.o.name), h('b', '', [x.b >= 10 ? chip('Bond ' + Math.round(x.b), 'green') : '', x.r >= 15 ? chip('Rivalry ' + Math.round(x.r), 'red') : ''])])));
      box.append(note('Fighters who spar together bond. Same-style fighters who train the same stat become rivals; at 45 rivalry the ludus asks you to settle it.'));
    } else box.append(empty('No bonds or rivalries yet. Sparring together builds bonds.'));

    if (g.ls && g.ls.fights) box.append(sec('Career'), h('div', 'lm-card', [h('div', 'pf-kv', [h('span', '', 'Fights logged'), h('b', 'lm-num', g.ls.fights)]), h('div', 'pf-kv', [h('span', '', 'Damage dealt / taken'), h('b', 'lm-num', `${g.ls.dmg} / ${g.ls.taken}`)]), h('div', 'pf-kv', [h('span', '', 'Critical hits'), h('b', 'lm-num', g.ls.crits)]), h('div', 'pf-kv', [h('span', '', 'Best fight (damage)'), h('b', 'lm-num', g.ls.best)])]));
    if (g.rtBest) box.append(note(`Best reflex time: ${g.rtBest} ms`));
    if (g.mentor) box.append(sec('Apprenticeship'), note(`Trained by the legend ${g.mentor}. +1 to their best stat.`));
    if ((g.dy || []).length) { box.append(sec('Diary')); box.append(h('div', 'lm-card pf-diary', g.dy.slice(-6).reverse().map((x) => h('div', '', [h('b', '', `Wk ${x.w} `), x.t])))); }

    if (owned) {
      box.append(sec('Manage'));
      const row = h('div', 'lm-btnrow');
      row.append(U.button({ label: 'Rename', variant: 'bronze', onClick: rename }), U.button({ label: 'Retrain style', variant: 'bronze', onClick: retrainSheet }));
      const rt = U.button({ label: g.lvl < 8 ? 'Retire (Lv 8+)' : 'Retire', variant: 'gold', disabled: g.lvl < 8, onClick: retire }); U.tooltip(rt, 'Retire to the Hall of Legends for gold and fame. Legends boost training for everyone.', { title: 'Retire' });
      row.append(rt, U.button({ label: 'Release', variant: 'danger', onClick: release }));
      box.append(row);
    }
    return box;
  }

  async function rename() {
    const n = await promptText(ctx, { title: 'Rename fighter', value: g.name, max: 16 });
    if (n) { g.name = n.slice(0, 16); ctx.sfx('uiConfirm'); commit(); redraw(); }
  }
  function retrainSheet() {
    const cost = lm.retrainCost(g), b = h('div', 'lm-sheetbody', [note(`Costs ${cost} gold. Keeps stats and learned picks, swaps the signature technique, and costs 10 morale. Pick the style that suits your build.`)]);
    const rm = ctx.sheet({ title: 'Retrain style', body: b });
    d.STYLE_IDS.filter((s) => s !== g.style).forEach((s) => {
      const st = d.STYLES[s], opt = h('button', 'lm-card pf-style-opt'); opt.type = 'button';
      opt.append(h('div', 'lm-grow', [h('div', 'lm-name', st.n), h('div', 'lm-sub', `${st.role}. ${st.d}`), h('div', 'lm-sub', `Beats ${st.beats.map((x) => d.STYLES[x].n).join(' and ')}.`)]), chip(cost + 'g', S.gold >= cost ? 'gold' : 'red'));
      const dot = h('span', 'pf-ult-i', U.icon('sword', 20)); dot.style.setProperty('--uc', st.c); opt.prepend(dot);
      opt.addEventListener('click', async () => {
        if (!(await confirm(ctx, { title: `Become a ${st.n}?`, text: `${g.name} retrains for ${cost} gold.`, label: 'Retrain', variant: 'gold' }))) return;
        const e = lm.retrain(S, g, s); if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; }
        ctx.sfx('levelUp'); commit(); rm.close(); redraw();
      });
      b.append(opt);
    });
  }
  async function retire() {
    if (!(await confirm(ctx, { title: `Retire ${g.name}?`, text: 'They leave the roster for the Hall of Legends. Legends boost training for everyone (needs Hall slots).', label: 'Retire', variant: 'gold' }))) return;
    const nm = g.name, snap = Object.assign({}, g), e = lm.retire(S, g);
    if (e) { ctx.toast(e, { kind: 'bad' }); ctx.sfx('uiError'); return; }
    commit(); ctx.sfx('levelUp'); m.close();
    const pen = S.lastRetire || { gold: 0, fame: 0 };
    const b = h('div', 'pf-cere', [h('div', 'pf-ph', portrait(ctx, snap, 88)), h('div', 'lm-h1', nm + ' retires'), h('div', 'lm-chips', [chip('+' + fmt(pen.gold) + ' gold', 'gold'), chip('+' + fmt(pen.fame) + ' fame', 'purple')]), h('div', 'lm-note', 'A statue is raised in their honor.')]);
    await ctx.ask({ title: 'Hall of Legends', body: b, actions: [{ label: 'Farewell', value: 'ok', variant: 'gold' }], dismiss: 'ok' });
    ctx.open('roster');
  }
  async function release() {
    if (!(await confirm(ctx, { title: `Release ${g.name}?`, text: 'They leave the ludus for good. Their gear returns to the armory.', label: 'Release' }))) return;
    lm.release(S, g); ctx.sfx('uiTap'); commit(); m.close(); ctx.toast(`${g.name} has left the ludus.`, { kind: 'info' }); ctx.open('roster');
  }

  function render() {
    if (dead) return;
    const sc = body.parentElement ? body.parentElement.scrollTop : 0;
    body.replaceChildren(hero(), ...alerts().map((a) => { a.style.marginTop = '10px'; return a; }), tabs(), h('div', 'pf-pane', [({ stats: statsTab, gear: gearTab, skills: skillsTab, life: lifeTab })[tab]()]));
    if (body.parentElement) body.parentElement.scrollTop = sc;
  }
  render();
  return m;
}
