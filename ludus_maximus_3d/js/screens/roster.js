// Roster screen: every fighter at a glance, quick weekly activity assignment, planner presets, kitchen menu, recruit entry.
import { h, U, D, L, fmt, portrait, injectCss, addCss, chip, sec, wide, ACT_SHORT, actDesc, empty, note } from './ui_common.js';

const CSS = `
.lm-r-top{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:stretch}
.lm-cap{display:grid;gap:8px}
.lm-cap-n{font:800 22px/26px var(--lx-serif);color:#2a1a30}
.lm-cap-n small{font:700 12px var(--lx-sans);letter-spacing:.12em;text-transform:uppercase;color:#7a5222;margin-left:6px}
.lm-presets{display:flex;flex-wrap:wrap;gap:8px}
.lm-presets .lx-btn{flex:1 1 120px;min-height:44px;padding:6px 10px;font-size:12px}
.lm-rc{display:grid;gap:9px}
.lm-rc-head{display:flex;gap:12px;align-items:center;padding:2px;margin:-2px;border-radius:10px;cursor:pointer;min-width:0;-webkit-tap-highlight-color:transparent}
.lm-rc-head:hover{background:rgba(242,193,78,.18)}
.lm-rc-head:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.lm-rc-go{flex:none;color:#7a5222;opacity:.8}
.lm-stylechip{color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.45)}
.lm-meters{display:grid;gap:5px}
.lm-act-g{display:grid;gap:6px}
.lm-act-g.g5{grid-template-columns:repeat(5,minmax(0,1fr))}
.lm-act-g.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.lm-act{position:relative;min-height:44px;padding:6px 2px 8px;border-radius:8px;cursor:pointer;touch-action:manipulation;font:800 12px/1.1 var(--lx-serif);letter-spacing:.05em;text-transform:uppercase;color:#4a3550;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(235,220,185,.7));border:1.5px solid rgba(122,82,34,.5);box-shadow:0 2px 0 rgba(122,82,34,.55);transition:transform .08s,box-shadow .08s;overflow:hidden;text-overflow:ellipsis}
.lm-act::after{content:'';position:absolute;left:8px;right:8px;bottom:3px;height:3px;border-radius:2px;background:var(--sc,transparent)}
.lm-act:active:not(:disabled){transform:translateY(2px);box-shadow:0 0 0 rgba(0,0,0,0)}
.lm-act[aria-pressed=true]{background:linear-gradient(180deg,#ffe08a,#e0a82e);color:#3b2711;border-color:#8a5a14;box-shadow:0 2px 0 #7a5222,0 0 10px rgba(242,193,78,.6)}
.lm-act:disabled{opacity:.5;cursor:not-allowed}
.lm-act:focus-visible{outline:3px solid #5a1f5e;outline-offset:1px}
.lm-actd{font:600 12px/17px var(--lx-sans);color:#5a4560;overflow-wrap:anywhere;min-height:17px}
.lm-menu-opt{display:flex;gap:10px;align-items:center;width:100%;text-align:left;min-height:56px;cursor:pointer;font-family:inherit;color:inherit}
.lm-menu-opt[aria-pressed=true]{border-color:#c98e24;box-shadow:0 0 0 2px #f2c14e,0 2px 6px rgba(60,40,10,.2)}
.lm-menu-opt:disabled{opacity:.55;cursor:not-allowed}
.lm-menu-opt:focus-visible{outline:3px solid #5a1f5e;outline-offset:2px}
.lm-kitchen{display:flex;gap:10px;align-items:center}
.lm-board-n{font:900 18px var(--lx-serif);width:26px;text-align:center;color:#7a2f30}
`;

export function open(ctx) {
  injectCss(); addCss(CSS);
  const S = ctx.S, lm = L(), d = D();
  const body = h('div', 'lm-sheetbody');
  const m = wide(ctx.sheet({ title: 'Roster', body }), 1000);
  let dead = false; const origClose = m.close; m.close = () => { dead = true; origClose.call(m); };

  const sw = (kind) => ctx.sfx(kind);
  const commit = () => { ctx.save(); ctx.refresh(); };

  function menuOf() { return d.MENUS.find((x) => x.id === S.menu) || d.MENUS[0]; }

  function topBar() {
    const cap = lm.rosterCap(S), n = S.glads.length, full = n >= cap;
    const capCard = h('div', 'lm-card lm-cap');
    capCard.append(h('div', 'lm-cap-n lm-num', [`${n}/${cap}`, h('small', '', 'fighters')]));
    capCard.append(U.bar({ value: n, max: Math.max(1, cap), kind: full ? 'hp' : 'stam', height: 10, segments: 1 }));
    capCard.append(h('div', 'lm-sub', full ? 'Barracks full. Upgrade the Barracks to house more.' : `${cap - n} free bed${cap - n === 1 ? '' : 's'} in the barracks.`));
    const rec = U.button({ label: 'Recruit fighters', icon: 'roster', variant: 'gold', block: true, sub: full ? 'Barracks full, you can still look' : `${S.recruits ? S.recruits.length : 0} volunteers at the gate`, onClick: () => ctx.open('recruit') });
    capCard.append(rec);

    const menu = menuOf();
    const kit = h('div', 'lm-card');
    kit.append(h('div', 'lm-sec-t', 'Kitchen'));
    kit.firstChild.style.cssText = 'font:800 12px/16px var(--lx-serif);letter-spacing:.16em;text-transform:uppercase;color:#7a2f30;margin-bottom:6px';
    const row = h('div', 'lm-kitchen', [h('div', 'lm-grow', [h('div', 'lm-name', menu.n), h('div', 'lm-sub', menu.d), h('div', 'lm-sub', menu.c ? `${menu.c} gold per fighter each week (${fmt(menu.c * n)} now)` : 'Free'), ]), U.button({ label: 'Change', variant: 'bronze', onClick: menuPicker })]);
    kit.append(row);
    return h('div', 'lm-r-top', [capCard, kit]);
  }

  function menuPicker() {
    const kv = d.BUILD.kitchen.v[lm.bfx(S, 'kitchen').l];
    const b = h('div', 'lm-sheetbody', [note('Plant-based fuel for the whole ludus. Cost is per fighter per week. Better menus need a higher Kitchen level.')]);
    const pm = ctx.sheet({ title: 'Weekly menu', body: b });
    const list = h('div', 'lm-grid'); list.style.gridTemplateColumns = '1fr';
    const paint = () => {
      list.replaceChildren(...d.MENUS.map((mm) => {
        const ok = lm.menuOk(S, mm);
        const btn = h('button', 'lm-card lm-menu-opt'); btn.type = 'button'; btn.disabled = !ok; btn.setAttribute('aria-pressed', S.menu === mm.id);
        btn.append(h('div', 'lm-grow', [h('div', 'lm-name', mm.n), h('div', 'lm-sub', mm.d)]), ok ? chip(mm.c ? mm.c + 'g' : 'Free', S.menu === mm.id ? 'gold' : 'bronze') : chip('Kitchen L' + mm.k, 'grey'));
        if (!ok) btn.prepend(U.icon('lock', 20));
        btn.addEventListener('click', () => { if (!ok) return; S.menu = mm.id; sw('uiConfirm'); commit(); pm.close(); render(); });
        return btn;
      }));
    };
    paint(); b.append(list);
  }

  function planner() {
    const wrap = h('div', 'lm-presets');
    const P = [['Boot camp', 'boot', 'Everyone with energy trains their weakest stat; tired fighters rest.'], ['Rest week', 'rest', 'Everyone rests.'], ['Odd jobs', 'work', 'Fighters with energy take odd jobs for gold.'], ['Sparring', 'spar', 'Fighters with energy spar for XP.']];
    P.forEach(([label, kind, tip]) => { const b = U.button({ label, variant: 'bronze', onClick: () => { const n = lm.preset(S, kind); sw('uiTap'); commit(); render(); ctx.toast(n ? `Plans set for ${n} fighter${n > 1 ? 's' : ''}.` : 'Nothing to change.', { kind: n ? 'good' : 'info', ico: 'check' }); } }); U.tooltip(b, tip, { title: label }); wrap.append(b); });
    const auto = U.button({ label: 'Auto-plan', variant: 'gold', onClick: autoplan }); U.tooltip(auto, 'Picks each fighter\'s weakest trainable stat; rests the tired and injured; works when gold is low.', { title: 'Auto-plan' });
    wrap.append(auto);
    return wrap;
  }

  function autoplan() {
    S.glads.forEach((g) => {
      if (g.inj > 0 || g.en < 45 || lm.busy(S, g, S.week)) { g.act = 'rest'; return; }
      if (S.gold < 70 && g.en > 60) { g.act = 'work'; return; }
      const B = d.STYLES[g.style].base; let best = 'str', bv = 1e9;
      d.STATS.forEach((s) => { const v = (g.st[s] / B[s]) / (0.8 + 0.1 * g.tal[s]); if (v < bv && g.st[s] < lm.cap(g)) { bv = v; best = s; } });
      g.act = best;
    });
    sw('uiConfirm'); commit(); render(); ctx.toast('Weekly plan set', { kind: 'good', ico: 'check' });
  }

  function drillBoard() {
    const l = S.glads.filter((g) => g.rtBest).sort((a, b) => a.rtBest - b.rtBest);
    const b = h('div', 'lm-sheetbody', [note('Best reflex times in your ludus. Reflex drills unlock with a level 3 Sparring Ring.')]);
    if (!l.length) b.append(empty('No reflex times yet.'));
    l.forEach((g, i) => b.append(h('div', 'lm-card lm-row', [h('div', 'lm-board-n lm-num', i + 1), portrait(ctx, g, 40), h('div', 'lm-name lm-grow', g.name), chip(g.rtBest + ' ms', 'gold')])));
    b.querySelectorAll('.lm-card').forEach((c) => { c.style.marginBottom = '8px'; });
    ctx.sheet({ title: 'Drill board', body: b });
  }

  function actBtn(g, a, onPick) {
    const b = h('button', 'lm-act', ACT_SHORT[a.id]); b.type = 'button';
    b.setAttribute('aria-pressed', g.act === a.id); b.setAttribute('aria-label', a.n + (g.act === a.id ? ' (selected)' : ''));
    if (a.t === 'train') b.style.setProperty('--sc', d.SC[a.s]);
    b.disabled = g.inj > 0;
    U.tooltip(b, actDesc(a), { title: a.n });
    b.addEventListener('click', () => onPick(a));
    return b;
  }

  function card(g) {
    const c = h('div', 'lm-card lm-rc' + (g.inj > 0 ? ' lm-dim' : ''));
    const st = d.STYLES[g.style], T = d.TRAITS[g.trait];
    const stylechip = chip(st.n, 'bronze'); stylechip.classList.add('lm-stylechip'); stylechip.style.background = st.c;
    const nm = h('div', 'lm-name', [g.name, g.nick ? h('small', '', ' ' + g.nick) : null]);
    const head = h('div', 'lm-rc-head', [portrait(ctx, g, 60), h('div', 'lm-grow', [nm, h('div', 'lm-chips', [stylechip, chip('Lv ' + g.lvl, 'gold'), chip(T.n, 'purple', T.d)]), h('div', '', U.stars(lm.stars(g), 5))]), U.icon('arena', 22, 'lm-rc-go')]);
    head.querySelector('.lm-rc-go').remove(); head.append(U.icon('scroll', 22, 'lm-rc-go'));
    head.setAttribute('role', 'button'); head.tabIndex = 0; head.setAttribute('aria-label', `Open profile of ${g.name}`);
    const go = () => { sw('uiTap'); ctx.open('profile', g.id); };
    head.addEventListener('click', go); head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    c.append(head);

    const meter = (label, bar, val, tip) => { const r = h('div', 'lm-meter', [h('span', '', label), bar, h('b', 'lm-num', val)]); U.tooltip(r, tip, { title: label }); return r; };
    c.append(h('div', 'lm-meters', [
      meter('Energy', U.bar({ value: g.en, max: 100, kind: 'stam', height: 8 }), Math.round(g.en), 'Energy: training and fights drain it. Below 60 a fighter performs worse in the arena.'),
      meter('Morale', U.bar({ value: g.mo, max: 100, kind: 'foe', height: 8 }), Math.round(g.mo), 'Morale: a happy fighter hits harder and learns faster.'),
      meter('XP', U.bar({ value: g.xp, max: lm.need(g.lvl), kind: 'xp', height: 8 }), `${Math.floor(g.xp)}`, `Experience: ${Math.floor(g.xp)} of ${lm.need(g.lvl)} to level ${g.lvl + 1}.`),
    ]));

    const chips = h('div', 'lm-chips');
    if (g.inj > 0) chips.append(chip(`Injured ${g.inj}w`, 'red', 'Injured fighters rest until healed. Treat them from their profile.'));
    const entered = lm.busy(S, g, S.week) ? 'this week' : lm.busy(S, g, S.week + 1) ? 'next week' : '';
    if (entered) chips.append(chip(`Fights ${entered}`, 'blue', 'Entered in a match. Let them rest to arrive fresh.'));
    if ((g.fav || 0) >= 50) chips.append(chip('Fan favorite', 'gold', 'The crowd loves them: purses are bigger.'));
    if (g.pend && g.pend.length) { const p = h('button', 'lm-chip lm-chip-green lm-chip-pulse', 'Level-up pick!'); p.type = 'button'; p.style.cssText = 'min-height:44px;padding:4px 14px;cursor:pointer;font-size:12px'; p.addEventListener('click', async () => { const f = await import('../flow.js'); sw('levelUp'); await f.pickPends(ctx); commit(); if (!dead) render(); }); chips.append(p); }
    if (chips.childNodes.length) c.append(chips);

    const desc = h('div', 'lm-actd', g.inj > 0 ? 'Recovering: injured fighters rest automatically.' : actDesc(lm.activity(g)));
    const swap = () => { const n = card(g); c.replaceWith(n); };
    const pick = (a) => { g.act = a.id; sw('uiTap'); ctx.save(); swap(); };
    const g1 = h('div', 'lm-act-g g5', d.ACTS.filter((a) => a.t === 'train').map((a) => actBtn(g, a, pick)));
    const g2 = h('div', 'lm-act-g g4', d.ACTS.filter((a) => a.t !== 'train').map((a) => actBtn(g, a, pick)));
    c.append(g1, g2, desc);

    if (lm.canDrill(S, g)) {
      c.append(U.button({ label: 'Training drill', icon: 'bladedance', variant: 'gold', block: true, sub: 'Optional minigame: bonus on this week\'s gain', onClick: async () => { const mod = await import('./drill.js'); mod.open(ctx, g, () => { commit(); if (!dead) swap(); }); } }));
    } else if (g.drill && g.drill.week === S.week) {
      c.append(chip(g.drill.m > 0 ? `Drilled +${Math.round(g.drill.m * 100)}% this week` : 'Drilled, no bonus', g.drill.m > 0 ? 'green' : 'grey'));
    }
    return c;
  }

  function render() {
    if (dead) return;
    body.replaceChildren();
    body.append(topBar());
    body.append(sec('Weekly plan'), note('Pick an activity per fighter. It repeats every week until you change it. Fighters entered in games should rest to arrive fresh.'), planner());
    const dbBtn = U.button({ label: 'Drill board', variant: 'ghost', onClick: drillBoard }); dbBtn.style.marginTop = '8px'; dbBtn.classList.add('lm-btn-sm');
    body.append(dbBtn);
    body.append(sec(`Fighters ${S.glads.length}`));
    if (!S.glads.length) { body.append(empty('Your barracks are empty. Recruit your first fighter!')); }
    else { const grid = h('div', 'lm-grid', S.glads.map(card)); body.append(grid); }
    body.append(h('div', '', [note(`Upkeep ${fmt(lm.upkeep(S))} gold per week. Tap a fighter for their full profile.`)]));
  }
  render();
  return m;
}
