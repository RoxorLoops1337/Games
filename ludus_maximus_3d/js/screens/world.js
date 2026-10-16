// World screen: the things around the fights. Season calendar, rival ludi (personalities, standings, diplomacy), the barracks
// (mentors, feasts, grief) and the memorial wall of the fallen. Sim lives in core/ext.js; this file is presentation only.
import { U, h, D, L, fmt, openScreen, sec, card, row, col, note, hint, kv, medal, pill, goldPill, famePill, tabs, chipRow, meter, empty, actions, styleBadge, pickFighters } from './sk.js';
import { heirOffer } from '../flow.js';
import { bestiaryTab } from './venatio.js'; // BEAST: the Bestiary tab (3D beast portraits, kills, notes, pelts, trophies)
import * as Cmp from './campaign.js'; // CAMPAIGN: the Story tab
import * as Inf from './infirmary.js'; import * as Pat from './sponsors.js'; import * as Chr from './events.js'; // WAVE2: wounds, patrons and the event chronicle live in The World too

const st = { tab: 'calendar', wk: null };
const PERS_ICO = { brutal: 'skull', cunning: 'scroll', honorable: 'shield', greedy: 'coin' };
const PERS_COL = { brutal: '#b5332a', cunning: '#4a8fd0', honorable: '#5b9a4a', greedy: '#c98e24' };
const KIND_ICO = { duel: 'sword', tourney: 'fame', grand: 'star', team: 'shield' };

const CSS = `
.wd-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,118px),1fr));gap:8px}
.wd-wk{position:relative;display:flex;flex-direction:column;gap:3px;min-height:92px;padding:8px 8px 7px;border-radius:10px;border:0;text-align:left;cursor:pointer;color:var(--lx-travertine);background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));box-shadow:inset 0 0 0 1px rgba(242,193,78,.28);font:600 var(--lx-fs-s)/1.2 var(--lx-sans)}
.wd-wk:hover{box-shadow:inset 0 0 0 1.5px rgba(242,193,78,.8)}
.wd-wk:focus-visible{outline:3px solid #fff;outline-offset:2px}
.wd-wk .n{font:800 22px/1 var(--lx-serif);color:var(--lx-gold);letter-spacing:.04em}
.wd-wk .ic{display:flex;gap:4px;flex-wrap:wrap;color:var(--lx-gold)}
.wd-wk .fest{position:absolute;left:0;right:0;top:0;height:5px;border-radius:10px 10px 0 0;background:var(--k,transparent)}
.wd-wk.past{opacity:.55}
.wd-wk.now{background:linear-gradient(180deg,rgba(242,193,78,.34),rgba(242,193,78,.08));box-shadow:inset 0 0 0 2px var(--lx-gold),0 0 16px rgba(242,193,78,.25)}
.wd-wk.sel{box-shadow:inset 0 0 0 2px #fff}
.wd-wk .dots{display:flex;gap:3px;margin-top:auto}
.wd-wk .dots i{width:8px;height:8px;border-radius:50%;background:var(--lx-gold);box-shadow:0 0 0 1px #4a2f12}
.wd-wk small{opacity:.8;font-weight:600}
.wd-leg{display:flex;flex-wrap:wrap;gap:10px;font-size:var(--lx-fs-s);opacity:.85}
.wd-leg span{display:inline-flex;align-items:center;gap:5px}
.wd-st{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:5px 8px;border-radius:8px;background:rgba(10,6,24,.35)}
.wd-st.you{background:linear-gradient(90deg,rgba(242,193,78,.28),rgba(242,193,78,.06));box-shadow:inset 0 0 0 1.5px var(--lx-gold)}
.wd-st .r{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:800 12px/1 var(--lx-serif);background:radial-gradient(circle at 35% 30%,#d8a35c,#7a5222);color:#fff2d6}
.wd-st b{font-variant-numeric:tabular-nums}
.wd-rv{border-left:4px solid var(--k,#7a5222)}
.wd-reg{position:relative;height:12px;border-radius:6px;background:#140f22;box-shadow:inset 0 1px 3px #000,0 0 0 1px rgba(242,193,78,.4);overflow:hidden}
.wd-reg i{position:absolute;top:0;bottom:0;background:linear-gradient(180deg,rgba(255,255,255,.35),transparent 55%,rgba(0,0,0,.25)),var(--c)}
.wd-reg::after{content:'';position:absolute;left:50%;top:-1px;bottom:-1px;width:2px;background:rgba(255,255,255,.55)}
.wd-why{font-size:11px;opacity:.7;margin-top:2px}
.wd-wall{position:relative;border-radius:12px;padding:16px 12px 14px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(0,0,0,.18)),repeating-linear-gradient(0deg,#4a4358 0 38px,#3a3447 38px 40px);box-shadow:inset 0 0 0 2px #6a6078,inset 0 10px 24px rgba(0,0,0,.45),0 4px 14px rgba(5,3,14,.45)}
.wd-wall h4{margin:0 0 10px;text-align:center;font:800 var(--lx-fs-s)/1.2 var(--lx-serif);letter-spacing:.3em;text-transform:uppercase;color:#cdbd9a}
.wd-plq{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;padding:9px 10px;margin:0 0 8px;border-radius:6px;background:linear-gradient(180deg,#5a5368,#463f56);box-shadow:inset 0 0 0 1px rgba(255,240,205,.18),inset 0 2px 5px rgba(0,0,0,.5),0 1px 0 rgba(255,240,205,.12)}
.wd-plq .nm{font:800 var(--lx-fs-l)/1.15 var(--lx-serif);letter-spacing:.06em;color:#e9d9b4;text-shadow:0 -1px 0 rgba(0,0,0,.8),0 1px 0 rgba(255,240,205,.18)}
.wd-plq .ds{font-size:var(--lx-fs-s);color:#cbbf9f;line-height:1.35}
.wd-plq .bd{filter:grayscale(.85) brightness(.85)}
.wd-can{display:flex;justify-content:center;gap:14px;margin-bottom:8px}
.wd-can i{position:relative;width:8px;height:26px;border-radius:2px;background:linear-gradient(90deg,#d9cfae,#f4ecd2,#cdbf98)}
.wd-can i::before{content:'';position:absolute;left:50%;top:-12px;width:9px;height:14px;margin-left:-4.5px;border-radius:50% 50% 50% 50%/65% 65% 35% 35%;background:radial-gradient(circle at 50% 70%,#fff3c8,#ffb040 55%,#ff6a20);box-shadow:0 0 12px 3px rgba(255,160,60,.55);animation:wdfl 1.4s ease-in-out infinite alternate;animation-delay:calc(var(--i,0)*-.35s)}
@keyframes wdfl{from{transform:scale(1,.9) translateX(-.6px)}to{transform:scale(.9,1.12) translateX(.6px)}}
.wd-pair{display:grid;grid-template-columns:auto auto 1fr;gap:8px;align-items:center}
`;
function css() { if (document.getElementById('wd-css')) return; const s = document.createElement('style'); s.id = 'wd-css'; s.textContent = CSS; document.head.append(s); }

export function open(ctx, arg) {
  css(); arg = arg || {}; if (arg.tab) st.tab = arg.tab;
  const scr = openScreen(ctx, { title: 'The World', wide: true });
  const draw = () => scr.render((root) => {
    root.append(chipRow([{ id: 'story', label: 'Story', icon: 'star' }, { id: 'calendar', label: 'Calendar', icon: 'scroll' }, { id: 'rivals', label: 'Rivals', icon: 'skull' }, { id: 'barracks', label: 'Barracks', icon: 'roster' }, { id: 'memorial', label: 'Memorial', icon: 'fame' }, { id: 'infirmary', label: 'Infirmary', icon: 'heart' }, { id: 'patrons', label: 'Patrons', icon: 'coin' }, { id: 'chronicle', label: 'Chronicle', icon: 'scroll' }, { id: 'bestiary', label: 'Bestiary', icon: 'skull' }], st.tab, (id) => { st.tab = id; ctx.sfx('uiTap'); scr.scroller.scrollTop = 0; draw(); }));
    root.lastChild.setAttribute('data-tut', 'world-tabs');
    if (st.tab === 'story') Cmp.render(ctx, root, draw); else if (st.tab === 'calendar') calendarTab(ctx, root, draw); else if (st.tab === 'rivals') rivalsTab(ctx, root, draw); else if (st.tab === 'barracks') barracksTab(ctx, root, draw); else if (st.tab === 'infirmary') Inf.render(ctx, root, draw); else if (st.tab === 'patrons') Pat.render(ctx, root, draw); else if (st.tab === 'chronicle') Chr.render(ctx, root, draw); else if (st.tab === 'bestiary') bestiaryTab(ctx, root, draw); else memorialTab(ctx, root, draw);
  });
  scr.m.el.dataset.tutSheet = 'world';
  draw(); return scr;
}

// ------------------------------------------------------------------ calendar
function calendarTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), C = lm.calendar(S);
  if (st.wk == null || st.wk < C.start || st.wk > C.end) st.wk = S.week;
  root.append(card([row([medal('scroll', 'dark big'), col([h('div', 'ax-name', `Season ${C.season}`), note(`Weeks ${C.start} to ${C.end}. A tournament closes every fourth week and the Grand Games close the season. Tap a week for details.`)], 'ax-grow')])], 'gold'));
  const grid = h('div', 'wd-cal'); grid.setAttribute('role', 'list');
  C.weeks.forEach((w) => {
    const b = h('button', 'wd-wk' + (w.past ? ' past' : '') + (w.now ? ' now' : '') + (w.week === st.wk ? ' sel' : '')); b.type = 'button'; b.setAttribute('role', 'listitem');
    if (w.festival) { b.style.setProperty('--k', w.festival.c); b.append(h('i', 'fest')); }
    const icons = h('div', 'ic', [U.icon('sword', 16), w.big ? U.icon(KIND_ICO[w.big], 16) : null, w.team ? U.icon('shield', 16) : null]);
    b.append(h('div', 'n', String(w.n)), icons, h('small', '', w.now ? 'This week' : w.past ? 'Done' : `Week ${w.week}`)); if (w.festival) b.append(h('small', '', w.festival.n));
    if (w.entries.length) b.append(h('div', 'dots', w.entries.map(() => h('i'))));
    b.setAttribute('aria-label', `Season week ${w.n}${w.now ? ', this week' : ''}${w.festival ? ', ' + w.festival.n : ''}${w.big ? ', ' + (w.big === 'grand' ? 'Grand Games' : 'tournament') : ''}${w.entries.length ? ', ' + w.entries.length + ' entries' : ''}`);
    b.onclick = () => { st.wk = w.week; ctx.sfx('uiTap'); draw(); }; grid.append(b);
  });
  root.append(grid);
  root.append(h('div', 'wd-leg', [h('span', '', [U.icon('sword', 14), 'Duels']), h('span', '', [U.icon('fame', 14), 'Tournament']), h('span', '', [U.icon('star', 14), 'Grand Games']), h('span', '', [U.icon('shield', 14), 'Team clash']), h('span', '', [Object.assign(h('i'), { style: 'width:8px;height:8px;border-radius:50%;background:var(--lx-gold);display:inline-block' }), 'Your entries'])]));
  const w = C.weeks.find((x) => x.week === st.wk) || C.weeks[0], lines = [];
  const kinds = ['Three duels (easy, fair, hard)'];
  if (w.big === 'grand') kinds.push('The Grand Games: an eight-fighter bracket'); else if (w.big === 'tourney') kinds.push('A four-fighter tournament bracket');
  if (w.team) kinds.push('A team clash');
  const wx = D.WEATHER[w.wx] || D.WEATHER.clear;
  const c = card([row([medal(w.festival ? 'star' : 'scroll', 'dark'), col([h('div', 'ax-name', `Week ${w.week}${w.now ? ' (now)' : w.past ? ' (past)' : ''}`), note(w.festival ? `${w.festival.n}: ${w.festival.d}` : 'No festival this week.')], 'ax-grow')]),
    ...kinds.map((k) => h('div', 'ax-row', [U.icon('check', 14), h('span', 'ax-sub', k)])),
    note(`Forecast for the first fight: ${wx.n}. ${wx.d}`)]);
  if (w.entries.length) { c.append(sec('Your entries')); w.entries.forEach((e) => c.append(h('div', 'ax-kv', [h('span', '', e.title), h('b', '', e.ids.map((id) => (ctx.gOf(id) || { name: '?' }).name).join(', '))]))); }
  else if (!w.past) c.append(note('You have not entered anything this week.'));
  const offset = w.week - S.week;
  if (!w.past) c.append(U.button({ label: offset === 0 ? 'Open the Arena' : `See week ${w.week} in the Arena`, icon: 'arena', variant: 'gold', block: true, onClick: () => { ctx.closeAll(); ctx.open('arena', { tab: 'sched', wk: offset }); } }));
  root.append(c);
  const lad = lm.LADDER || []; if (lad.length) { const wins = lm.ladderWins(S); root.append(card([h('div', 'ax-b', 'Season ladder'), meter(wins, lad[lad.length - 1].n, 'var(--lx-gold)'), note(`${wins} win${wins === 1 ? '' : 's'} this season. Bonuses pay out once at ${lad.map((r) => r.n).join(', ')} wins.`)])); }
}

// ------------------------------------------------------------------ rival ludi
function regardBar(rel, ally) {
  const b = h('div', 'wd-reg'); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-valuenow', Math.round(rel)); b.setAttribute('aria-label', 'Regard');
  const i = h('i'); const pos = rel >= 0; i.style.left = pos ? '50%' : (50 + rel / 2) + '%'; i.style.width = Math.abs(rel) / 2 + '%'; i.style.setProperty('--c', pos ? (ally ? '#f2c14e' : '#5b9a4a') : '#b5332a'); b.append(i); return b;
}
function rivalsTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), T = lm.ludiInit(S), tab = lm.ludiTable(S), top = Math.max(1, ...tab.map((r) => r.score));
  root.append(card([row([medal('skull', 'dark big'), col([h('div', 'ax-name', 'Rival ludi'), note('Four schools compete with you for the season standings. Each owner has a nature. Befriend them, train in their yards, or whisper against them. An ally gives a weekly gift.')], 'ax-grow')])], 'gold'));
  root.append(sec('Season standings'));
  const stand = h('div', 'ax-col'); tab.forEach((r, i) => stand.append(h('div', 'wd-st' + (r.you ? ' you' : ''), [h('span', 'r', String(i + 1)), col([h('div', 'ax-b', r.name + (r.you ? ' (you)' : '')), meter(r.score, top, r.you ? 'var(--lx-gold)' : 'var(--lx-xp)')]), h('b', '', String(r.score))]))); root.append(card([stand, note('You score 3 per win and 6 per tournament title this season. Rivals score a little every week.')]));
  root.append(sec('The owners'));
  const grid = h('div', 'ax-grid');
  T.list.forEach((l) => {
    const P = lm.PERS[l.pers], mood = lm.ludiMood(l), c = card([], 'wd-rv'); c.style.setProperty('--k', PERS_COL[l.pers]);
    const kinds = [['gift', 'Gift', 'coin'], ['spar', 'Train together', 'sword'], ['rumor', 'Spread a rumor', 'scroll']];
    c.append(row([medal(PERS_ICO[l.pers], 'dark'), col([h('div', 'ax-name', l.name), h('div', 'ax-sub', l.owner)], 'ax-grow'), pill(P.n, { tone: l.pers === 'honorable' ? 'good' : l.pers === 'greedy' ? 'warn' : l.pers === 'cunning' ? 'blue' : 'bad', tip: P.d, tipTitle: P.n })]),
      note(P.d), h('div', 'ax-row ax-wrap', [pill(mood, { tone: l.ally ? 'gold' : l.rel >= 25 ? 'good' : l.rel <= -25 ? 'bad' : '', tip: 'Their regard for you, from hostile to devoted.', tipTitle: 'Regard' }), pill(`Standing ${Math.round(l.score)}`, { tone: 'blue' }), l.ally ? pill('Ally', { ico: 'check', tone: 'gold', tip: P.ally, tipTitle: 'Alliance' }) : null]), regardBar(l.rel, l.ally));
    const btns = [], whys = [];
    const run = async (kind) => {
      let g = null;
      if (kind === 'spar') { const ids = await pickFighters(ctx, { title: `Train at ${l.name}`, intro: note('One of your fighters trains in their yard: XP for them, regard for you. Costs energy.'), n: 1, info: (x) => { const w = lm.ludiWhy(S, l.id, 'spar', x); return w && w !== 'Done this week' ? { reason: w } : { badges: [pill(`Lv ${x.lvl}`, { tone: 'blue' })] }; }, confirm: () => ({ label: 'Train there' }) }); if (!ids) return; g = ctx.gOf(ids[0]); }
      if (kind === 'rumor') { const ok = await ctx.ask({ title: 'Spread a rumor?', body: Object.assign(h('p', '', `Whispers cost ${lm.ludiCost(S, 'rumor')} gold and lower the standing of ${l.name}. If it is traced to you, you lose fame and they never forget.`), {}), actions: [{ label: 'Whisper', value: 'y', variant: 'danger' }, { label: 'Never mind', value: 'n', variant: 'ghost' }], dismiss: 'n' }); if (ok !== 'y') return; }
      const r = lm.ludiAct(S, l.id, kind, g); if (typeof r === 'string') { ctx.sfx('uiError'); return U.toast(r, { kind: 'bad' }); }
      ctx.save(); ctx.refresh(); ctx.sfx(kind === 'rumor' ? 'uiError' : kind === 'ally' ? 'levelUp' : 'coin'); U.toast(r.msg, { kind: r.rel < 0 ? 'bad' : 'good', ico: 'check' }); draw();
    };
    kinds.forEach(([k, label, ico]) => { const why = lm.ludiWhy(S, l.id, k, k === 'spar' ? S.glads.find((x) => x.inj <= 0 && x.en >= 30) : null), cost = lm.ludiCost(S, k);
      const b = U.button({ label: cost ? `${label} (${cost}g)` : label, icon: ico, variant: k === 'rumor' ? 'ghost' : 'bronze', disabled: !!why, onClick: () => run(k) }); if (why) b.title = why; btns.push(b); if (why && why !== 'Done this week') whys.push(why); });
    const allyWhy = l.ally ? '' : lm.ludiWhy(S, l.id, 'ally');
    btns.push(l.ally ? U.button({ label: 'Break the alliance', icon: 'close', variant: 'ghost', onClick: () => run('break') }) : U.button({ label: `Ally (${lm.ludiCost(S, 'ally')}g)`, icon: 'star', variant: 'gold', disabled: !!allyWhy, onClick: () => run('ally') }));
    if (allyWhy) { btns[btns.length - 1].title = allyWhy; }
    c.append(actions(btns)); if (allyWhy && !l.ally) c.append(h('div', 'wd-why', `Alliance: ${allyWhy}`));
    grid.append(c);
  });
  root.append(grid);
  if (T.hist.length) { root.append(sec('Past champions')); root.append(card(T.hist.slice().reverse().map((x) => kv(`Season ${x.season}`, x.you ? 'Your ludus!' : x.champ)))); }
}

// ------------------------------------------------------------------ barracks
function barracksTab(ctx, root, draw) {
  const S = ctx.S, lm = L();
  root.append(card([row([medal('roster', 'dark big'), col([h('div', 'ax-name', 'Barracks life'), note('Fighters who eat, train and grieve together become a family. Mentor the young, feed the ludus, mind their spirits.')], 'ax-grow')])], 'gold'));
  root.append(sec('Feasts'));
  const fc = card([note('A feast lifts every fighter\'s spirits and builds bonds. Once a week.')]);
  const fb = [['simple', 'Shared supper', '+6 morale, a little bond'], ['banquet', 'Banquet', '+12 morale, +8 energy, more bond, eases grief']].map(([tier, label, sub]) => { const why = lm.feastWhy(S, tier); const b = U.button({ label: `${label} (${lm.feastCost(S, tier)}g)`, sub, icon: 'heart', variant: tier === 'banquet' ? 'gold' : 'bronze', disabled: !!why, onClick: () => { const r = lm.feast(S, tier); if (typeof r === 'string') return U.toast(r, { kind: 'bad' }); ctx.save(); ctx.refresh(); ctx.sfx('levelUp'); U.toast(r.msg, { kind: 'good', ico: 'heart' }); draw(); } }); if (why) b.title = why; return b; });
  fc.append(actions(fb)); if (lm.feastWhy(S, 'simple') === 'You already feasted this week') fc.append(note('The ludus has already feasted this week.')); root.append(fc);

  root.append(sec(`Mentors (${(S.mentors || []).length}/${lm.mentorSlots(S)})`));
  const mc = card([note(`A fighter 3 or more levels above a pupil teaches them each week: XP for the pupil, bond and spirits for both. The pair graduates when the pupil nearly catches up. More slots come with a Sparring Ring and a level 3 Barracks.`)]);
  (S.mentors || []).forEach((pr) => {
    const m = ctx.gOf(pr.m), p = ctx.gOf(pr.p); if (!m || !p) return;
    mc.append(h('div', 'wd-pair', [styleBadge(m.style, 40), styleBadge(p.style, 40), col([h('div', 'ax-b', `${m.name} teaches ${p.name}`), h('div', 'ax-sub', `Level ${m.lvl} and ${p.lvl}. Week ${pr.wk}. Bond ${Math.round(lm.bond(S, m.id, p.id))}. Graduates at level ${m.lvl - 1}.`), meter(p.lvl, Math.max(1, m.lvl - 1), 'var(--lx-stam)')], 'ax-grow')]));
    mc.append(actions([U.button({ label: 'End the pairing', variant: 'ghost', icon: 'close', onClick: () => { lm.mentorEnd(S, pr, 'ended'); ctx.save(); draw(); } })]));
  });
  const free = (S.mentors || []).length < lm.mentorSlots(S);
  mc.append(U.button({ label: 'New pairing', icon: 'star', variant: 'gold', block: true, disabled: !free || S.glads.length < 2, onClick: () => newPair(ctx, draw) }));
  if (!free) mc.append(note('All mentor slots are in use.'));
  root.append(mc);

  const grieving = S.glads.filter((g) => g.grief > 0), low = S.glads.filter((g) => g.mo < 35 && !(g.grief > 0));
  if (grieving.length || low.length) {
    root.append(sec('Spirits'));
    root.append(card([...grieving.map((g) => h('div', 'ax-kv', [h('span', '', `${g.name}${g.vow ? ' (vowed to carry on for ' + g.vow + ')' : ''}`), pill(`Grieving ${g.grief}w`, { tone: 'bad', tip: 'Morale drops a little each week until the grief fades. A banquet eases it.' })])), ...low.map((g) => h('div', 'ax-kv', [h('span', '', g.name), pill(`Morale ${Math.round(g.mo)}`, { tone: 'warn' })]))]));
  }
  const pairs = []; for (let i = 0; i < S.glads.length; i++) for (let j = i + 1; j < S.glads.length; j++) { const b = lm.bond(S, S.glads[i].id, S.glads[j].id), r = lm.rivalryOf(S, S.glads[i].id, S.glads[j].id); if (b >= 20 || r >= 25) pairs.push({ a: S.glads[i], b: S.glads[j], bond: b, riv: r }); }
  if (pairs.length) { root.append(sec('Bonds and rivalries')); root.append(card(pairs.sort((x, y) => (y.bond + y.riv) - (x.bond + x.riv)).slice(0, 8).map((p) => h('div', 'ax-kv', [h('span', '', `${p.a.name} and ${p.b.name}`), h('div', 'ax-row ax-gap4', [p.bond >= 20 ? pill(`Bond ${Math.round(p.bond)}`, { tone: p.bond >= 60 ? 'good' : '', tip: 'Fighters with a bond of 60 unlock a duo ultimate in team fights.' }) : null, p.riv >= 25 ? pill(`Rivalry ${Math.round(p.riv)}`, { tone: 'bad' }) : null])])))); }
}
async function newPair(ctx, draw) {
  const S = ctx.S, lm = L();
  const mids = await pickFighters(ctx, { title: 'Choose the mentor', intro: note('The mentor must be at least 3 levels above the pupil.'), n: 1, info: (g) => (S.glads.some((p) => p !== g && lm.mentorWhy(S, g.id, p.id) === '') ? { badges: [pill(`Lv ${g.lvl}`, { tone: 'blue' })] } : { reason: S.glads.every((p) => p === g || (S.mentors || []).some((x) => x.m === g.id || x.p === g.id)) ? 'Already in a pair' : 'No pupil 3 levels below' }), confirm: () => ({ label: 'Next: the pupil' }) });
  if (!mids) return; const m = ctx.gOf(mids[0]);
  const pids = await pickFighters(ctx, { title: `Pupil for ${m.name}`, n: 1, info: (g) => { const w = lm.mentorWhy(S, m.id, g.id); return w ? { reason: w } : { badges: [pill(`Lv ${g.lvl}`, { tone: 'blue' })] }; }, confirm: () => ({ label: 'Begin teaching' }) });
  if (!pids) return; const r = lm.mentorStart(S, m.id, pids[0]); if (r) { ctx.sfx('uiError'); return U.toast(r, { kind: 'bad' }); }
  ctx.save(); ctx.sfx('levelUp'); U.toast(`${m.name} takes ${ctx.gOf(pids[0]).name} as a pupil`, { kind: 'good', ico: 'star' }); ctx.open('world', { tab: 'barracks' });
}

// ------------------------------------------------------------------ memorial wall
export function memorialTab(ctx, root, draw) {
  const S = ctx.S, lm = L(), list = (S.fallen || []).slice().reverse(), hc = lm.hardcore(S), lf = lm.legacyFame(S);
  root.append(card([row([medal('fame', 'dark big'), col([h('div', 'ax-name', 'Memorial wall'), note(`${list.length} fallen. Their names are carved here for good. Each fallen of level 5 or more draws pilgrims: ${lf ? `+${lf} fame a week now` : 'fame every week'}. The Infirmary and the Shrine lower the risk in the Pit.`)], 'ax-grow')]), h('div', 'ax-row ax-wrap', [pill(hc ? 'Hardcore: on' : 'Hardcore: off', { ico: 'skull', tone: hc ? 'bad' : '', tip: hc ? 'Any defeat can now kill. Change it in More, Settings.' : 'Only the Pit, Horde, champion duels and bounties can kill. Turn on Hardcore in More, Settings to risk every fight.', tipTitle: 'Permadeath' }), S.heirPending ? pill(`${S.heirPending.of} left an heir`, { tone: 'gold' }) : null])], 'gold'));
  if (S.heirPending) root.append(U.button({ label: `An heir of ${S.heirPending.of} waits`, icon: 'star', variant: 'gold', block: true, onClick: async () => { await heirOffer(ctx); draw(); } }));
  const wall = h('div', 'wd-wall'); wall.append(h('div', 'wd-can', [0, 1, 2, 3, 4].map((i) => { const c = h('i'); c.style.setProperty('--i', i); return c; })), h('h4', '', 'Those who fell'));
  if (!list.length) wall.append(h('div', 'ax-empty', [h('div', 'ax-b', 'The wall is bare'), h('div', 'ax-sub', 'May it stay that way. The Pit, the Horde Trial, champion duels and bounties can take a fighter; Hardcore makes every defeat dangerous.')]));
  list.forEach((e) => {
    const heirs = S.glads.filter((g) => g.heirOf === e.name).map((g) => g.name);
    const where = { pit: 'the Pit', horde: 'the Horde Trial', champ: 'a champion duel', bounty: 'a bounty hunt', hunt: 'the Venatio', event: 'the arena' }[e.kind] || 'the arena';
    const bd = styleBadge(e.style, 46); bd.classList.add('bd');
    wall.append(h('div', 'wd-plq', [bd, col([h('div', 'nm', `${e.name}${e.nick ? ' ' + e.nick : ''}`), h('div', 'ds', `${D.STYLES[e.style].n} · Level ${e.lvl} · ${e.w}W ${e.l}L · best ${D.SN[e.best]}`), h('div', 'ds', `Fell in ${where}${e.depth && e.kind !== 'hunt' ? ` (${e.kind === 'horde' ? 'wave' : 'floor'} ${e.depth})` : ''}${e.by ? `, slain by ${e.by}` : ''}. Season ${e.season}, week ${e.wk}.${heirs.length ? ' Heir: ' + heirs.join(', ') + '.' : ''}`)], 'ax-grow')]));
  });
  root.append(wall);
}
