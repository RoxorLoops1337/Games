// Ludus Maximus: UI (tabs, modals). Week flow and the fight screen live in play.js.
(function (G) {
  const D = G.LM_D, A = G.LM_ART, L = G.LM;
  const U = {}; G.LMUI = U;
  let S = null;
  const ui = { tab: 'ludus', league: 0, wk: 0, arm: 'inv', fsel: [], pick: [], dismiss: true, res: null, introName: '', introColor: 0, cands: null };
  U.ui = ui; U.S = () => S; U.setS = (s) => { S = s; };

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('en');
  U.fmt = fmt; U.esc = esc;
  const ACT = {}; U.ACT = ACT;
  const main = () => $('#main');
  const myColor = () => D.COLORS[S.color].c;
  U.myColor = myColor;

  // ---------- sound ----------
  let ac = null;
  function tone(f, d, type, vol, to, delay) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ac.currentTime + (delay || 0); const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
      g.gain.setValueAtTime(vol || 0.06, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  function noise(d, vol, f0, f1, delay) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const t0 = ac.currentTime + (delay || 0); const n = Math.floor(ac.sampleRate * d); const buf = ac.createBuffer(1, n, ac.sampleRate); const dd = buf.getChannelData(0);
      for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(); s.buffer = buf; const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.setValueAtTime(f0, t0); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t0 + d); const g = ac.createGain(); g.gain.value = vol; s.connect(fl); fl.connect(g); g.connect(ac.destination); s.start(t0);
    } catch (e) { /* audio unavailable */ }
  }
  let crowd = null;
  U.crowd = (on) => {
    try {
      if (!on) { if (crowd) { crowd.g.gain.setTargetAtTime(0, ac.currentTime, 0.2); const c = crowd; setTimeout(() => { try { c.s.stop(); } catch (e) { /* stopped */ } }, 500); crowd = null; } return; }
      if (S && S.sound === false) return; ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (crowd) return;
      const n = ac.sampleRate * 2; const buf = ac.createBuffer(1, n, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6; const g = ac.createGain(); g.gain.value = 0.0001; s.connect(f); f.connect(g); g.connect(ac.destination); s.start(); g.gain.setTargetAtTime(0.025, ac.currentTime, 0.4); crowd = { s, g, f };
    } catch (e) { /* audio unavailable */ }
  };
  U.crowdLevel = (x) => { if (crowd) { crowd.g.gain.setTargetAtTime(0.02 + 0.05 * Math.min(1, x), ac.currentTime, 0.15); crowd.f.frequency.setTargetAtTime(480 + 400 * Math.min(1, x), ac.currentTime, 0.2); } };
  U.snd = (n) => {
    if (S && S.sound === false) return;
    if (n === 'click') tone(520, 0.05, 'square', 0.04);
    else if (n === 'coin') { tone(880, 0.08, 'square', 0.05); tone(1320, 0.14, 'square', 0.05, 0, 0.07); }
    else if (n === 'hit') tone(160, 0.12, 'sawtooth', 0.07, 60);
    else if (n === 'crit') { tone(240, 0.18, 'sawtooth', 0.09, 70); tone(900, 0.1, 'square', 0.05, 0, 0.02); }
    else if (n === 'miss') tone(300, 0.1, 'triangle', 0.03, 600);
    else if (n === 'tech') tone(400, 0.2, 'square', 0.05, 900);
    else if (n === 'roar') { tone(90, 0.7, 'sawtooth', 0.08, 180); tone(140, 0.7, 'sawtooth', 0.05, 90); }
    else if (n === 'win') [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'square', 0.06, 0, i * 0.12));
    else if (n === 'lose') [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.07, 0, i * 0.16));
    else if (n === 'levelup') [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.05, 0, i * 0.08));
    else if (n === 'u_pulverize') { tone(70, 0.5, 'sawtooth', 0.1, 35); noise(0.4, 0.08, 300, 80); }
    else if (n === 'u_hookshot') { tone(300, 0.25, 'square', 0.05, 1200); noise(0.2, 0.04, 2000, 600, 0.2); }
    else if (n === 'u_bladedance') { noise(0.3, 0.07, 800, 4000); tone(500, 0.2, 'sawtooth', 0.04, 1500); }
    else if (n === 'u_skewer') { noise(0.35, 0.07, 3000, 700); tone(900, 0.3, 'triangle', 0.04, 300); }
    else if (n === 'u_tornado') { [0, 0.1, 0.2, 0.3].forEach((d, i) => tone(300 + (i % 2) * 120, 0.12, 'sawtooth', 0.04, 0, d)); noise(0.8, 0.05, 600, 1500); }
    else if (n === 'u_unbreakable') { [523, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.06, 0, i * 0.07)); }
    else if (n === 'u_bloodrage') { tone(110, 0.5, 'sawtooth', 0.09, 70); tone(165, 0.5, 'square', 0.04, 90); }
    else if (n === 'u_meteor') { tone(900, 0.9, 'sawtooth', 0.05, 90); noise(0.5, 0.1, 400, 60, 0.85); }
    else if (n === 'u_duststorm') noise(0.9, 0.07, 1500, 300);
    else if (n === 'build') { tone(200, 0.08, 'square', 0.06); tone(300, 0.1, 'square', 0.06, 0, 0.09); }
  };

  // ---------- modal / toast ----------
  const modalEl = () => $('#modal');
  function modal(html, o) {
    o = o || {}; ui.dismiss = o.dismiss !== false; $('#sheet').innerHTML = `<div class="sheetwrap">${ui.dismiss ? '<button class="btn sm ghost x" data-a="close">' + A.icon('close', 16) + '</button>' : ''}${html}</div>`;
    modalEl().className = 'on' + (o.mid ? ' mid' : ''); $('#sheet').scrollTop = 0;
  }
  function closeModal() { modalEl().className = ''; }
  function dialog(html, o) { return new Promise((res) => { U.res = res; modal(html, Object.assign({ dismiss: false }, o)); }); }
  U.modal = modal; U.closeModal = closeModal; U.dialog = dialog;
  let tt = 0;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'on'; clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, 2200); }
  U.toast = toast;
  const save = () => L.save(S); U.save = save;

  // ---------- small views ----------
  const statChip = (g, s) => `<div class="st"><span style="background:${D.SC[s]}">${D.SA[s]}</span><b>${Math.floor(g.st[s])}</b></div>`;
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
  const rarTag = (r) => `<span class="tag" style="background:${D.RAR[r].c}">${D.RAR[r].n}</span>`;
  const advTag = (a) => (a > 0 ? '<span class="adv up">Style edge +10%</span>' : a < 0 ? '<span class="adv dn">Style risk -8%</span>' : '<span class="adv eq">Even styles</span>');
  U.advTag = advTag; U.stars = stars; U.rarTag = rarTag;
  function fmtSt(it, f) {
    f = f || 1 + 0.08 * it.up; const lab = { atk: 'ATK', def: 'DEF', hp: 'HP', spd: 'SPD', crit: 'CRT%', eva: 'EVA%' };
    return Object.keys(it.st).map((k) => `${lab[k]} ${Math.round(it.st[k] * f * 10) / 10}`).join(' · ');
  }
  U.fmtSt = fmtSt;
  const gOf = (id) => S.glads.find((g) => g.id === id);
  U.gOf = gOf;
  const spr = (g, o) => A.gladOf(g, Object.assign({ tunic: g.color || myColor() }, o));
  U.spr = spr;
  const need = () => L.dueKeys(S).length;

  // ---------- HUD & tabs ----------
  function renderHud() {
    if (!S) { $('#hud').innerHTML = ''; $('#tabs').innerHTML = ''; return; }
    const due = need();
    const gb = ui.pg !== undefined && ui.pg !== S.gold ? ' bump' : '', fb = ui.pf !== undefined && ui.pf !== S.fame ? ' bump' : ''; ui.pg = S.gold; ui.pf = S.fame;
    $('#hud').innerHTML = `<span class="chip${gb}">${A.icon('coin', 20)}<b>${fmt(S.gold)}</b></span><span class="chip${fb}">${A.icon('fame', 20)}<b>${fmt(S.fame)}</b></span><span class="chip">${A.icon('week', 18)}<b>W${S.week}</b></span><span class="grow"></span><button class="btn sm ${due ? 'red pulse' : ''}" id="nextBtn" data-a="next">${due ? 'Games day' : 'Next week'} ${A.icon('play', 14)}</button>`;
    const picks = S.glads.filter((g) => g.pend && g.pend.length).length; const claim = S.contracts.filter((c) => L.contractProgress(S, c) >= c.n).length;
    const T = [['ludus', 'home', 'Ludus', 0], ['glads', 'user', 'Fighters', picks], ['arena', 'swords', 'Arena', 0], ['armory', 'bag', 'Armory', 0], ['more', 'scroll', 'More', claim]];
    $('#tabs').innerHTML = T.map(([id, ic, n, d]) => `<div class="tab ${ui.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}">${d ? `<span class="dot">${d}</span>` : ''}${A.icon(ic, 22, ui.tab === id ? '' : 'style="filter:brightness(1.3)"')}${n}</div>`).join('');
  }

  const shelf = (small) => `<div class="troph">${D.TROPHIES.map((t) => { const got = (S.trophies || {})[t.id]; return `<div class="tr1 ${got ? '' : 'lock'}" title="${esc(t.n + ': ' + t.d)}" ${small ? 'data-a="tab" data-v="more"' : `data-a="trophy" data-v="${t.id}"`}>${A.icon(got ? 'fame' : 'lock', small ? 16 : 24)}</div>`; }).join('')}</div>`;
  ACT.trophy = (el) => { const t = D.TROPHIES.find((x) => x.id === el.dataset.v); const got = (S.trophies || {})[t.id]; modal(`<h2>${esc(t.n)}</h2><div class="muted" style="opacity:1">${esc(t.d)}</div><div class="small" style="margin-top:8px">${got ? 'Earned in week ' + got + '.' : 'Not earned yet.'} Reward: ${[t.r.gold ? t.r.gold + ' gold' : '', t.r.fame ? t.r.fame + ' fame' : '', t.r.laurels ? t.r.laurels + ' laurel(s)' : ''].filter(Boolean).join(', ')}.</div>`); };
  // ---------- LUDUS ----------
  function where(g) {
    const has = (id) => L.plotOf(S, id) >= 0; const a = L.activity(g);
    if (g.inj > 0) return has('infirmary') ? 'infirmary' : 'barracks';
    if (a.t === 'train') return 'palaestra'; if (a.t === 'spar') return has('sparring') ? 'sparring' : 'palaestra';
    if (a.t === 'rest') return has('bath') ? 'bath' : 'barracks'; if (a.t === 'spy') return has('scout') ? 'scout' : 'barracks'; return has('market') ? 'market' : 'barracks';
  }
  function vLudus() {
    const cap = L.rosterCap(S); const season = Math.ceil(S.week / 12); const wk = ((S.week - 1) % 12) + 1;
    let h = `<div class="banner"><div style="flex:1"><h2>${esc(S.name)}</h2><div class="small" style="opacity:.9">Season ${season} · Week ${wk}/12 · ${S.glads.length}/${cap} fighters</div></div><span class="tag">${D.LEAGUES[L.maxLeague(S)].n}</span></div>${L.festival(S, S.week) ? `<div class="card" style="background:${L.festival(S, S.week).c};color:#fff;border-color:var(--ink)"><b class="h" style="font-size:13px">${L.festival(S, S.week).n}</b><div class="small" style="font-weight:700">${L.festival(S, S.week).d}</div></div>` : ''}`;
    const pplAt = {}; S.glads.forEach((g) => { (pplAt[where(g)] = pplAt[where(g)] || []).push(g); });
    h += '<div class="map">';
    for (let i = 0; i < 16; i++) {
      if (i >= S.rows * 4) { if (i === S.rows * 4) h += `<div class="tile locked" style="grid-column:1/-1;aspect-ratio:auto;padding:14px" data-a="land">${A.icon('lock', 22)}<span>Buy more land<br>${fmt(L.landCost(S))} gold · ${L.landFame(S)} fame</span></div>`; continue; }
      const p = S.plots[i];
      if (!p) { h += `<div class="tile empty" data-a="plot" data-i="${i}">${A.icon('plus', 26)}</div>`; continue; }
      const syn = L.synAt(S, i); const people = (pplAt[p.b] || []).slice(0, 3).map((g) => spr(g, { size: 26 })).join('');
      h += `<div class="tile" data-a="plot" data-i="${i}">${A.building(p.b, 100)}${people ? `<div class="people">${people}</div>` : ''}<span class="lv">L${p.l}</span>${syn ? `<span class="sy">+${syn}</span>` : ''}<span class="lbl">${D.BUILD[p.b].n}</span></div>`;
    }
    h += '</div>';
    const menu = D.MENUS.find((m) => m.id === S.menu) || D.MENUS[0];
    const inc = L.weeklyIncome(S), up = L.upkeep(S), mc = menu.c * S.glads.length;
    h += `<div class="sec">Kitchen</div><div class="card"><div class="row"><div class="sp"><div class="gname">${menu.n}</div><div class="muted">${menu.d}</div></div><button class="btn sm" data-a="menu">Change</button></div></div>`;
    const nt = Object.keys(S.trophies || {}).length; h += `<div class="sec">Trophy shelf ${nt}/${D.TROPHIES.length}</div><div class="card" style="padding:8px">${shelf(true)}</div>`;
    h += `<div class="sec">Weekly forecast</div><div class="card"><div class="kv"><span>Market income</span><b>+${fmt(inc)}</b></div><div class="kv"><span>Upkeep (${S.glads.length} fighters)</span><b>-${fmt(up)}</b></div><div class="kv"><span>Food (${menu.n})</span><b>-${fmt(mc)}</b></div><div class="muted" style="margin-top:6px">Tip: tap a building to upgrade it. Neighbours it likes add a +synergy bonus to its effect.</div></div>`;
    return h;
  }
  ACT.land = () => { const e = L.buyLand(S); if (e) return toast(e); U.snd('build'); save(); render(); };
  ACT.menu = () => {
    const kv = D.BUILD.kitchen.v[L.bfx(S, 'kitchen').l];
    modal('<h2>Weekly menu</h2><div class="muted" style="margin-bottom:8px">Plant-based fuel for the whole ludus. Gladiators were once called "hordearii", barley men. Cost is per fighter per week.</div>' + D.MENUS.map((m) => `<div class="menu-opt ${S.menu === m.id ? 'on' : ''} ${kv >= m.k ? '' : 'lock'}" data-a="setmenu" data-v="${m.id}"><div class="sp"><div class="gname">${m.n}</div><div class="muted" style="font-size:12px;opacity:1">${m.d}</div></div><div>${kv >= m.k ? (m.c ? m.c + 'g' : 'Free') : A.icon('lock', 18) + ' Kitchen L' + m.k}</div></div>`).join(''));
  };
  ACT.setmenu = (el) => { const m = D.MENUS.find((x) => x.id === el.dataset.v); if (D.BUILD.kitchen.v[L.bfx(S, 'kitchen').l] < m.k) return toast('Upgrade the Kitchen first'); S.menu = m.id; save(); closeModal(); render(); };
  ACT.plot = (el) => {
    const i = +el.dataset.i; const p = S.plots[i];
    if (!p) {
      modal('<h2>Build</h2>' + D.BUILD_IDS.filter((id) => L.plotOf(S, id) < 0).map((id) => {
        const B = D.BUILD[id]; const ok = S.fame >= B.fame; const c = L.buildCost(id, 1);
        return `<div class="itm" style="cursor:default"><div style="width:62px;flex:none">${A.building(id, 62)}</div><div class="sp"><div class="gname">${B.n}</div><div class="muted" style="opacity:1">${B.f(B.v[1], 1)}</div><div class="tiny muted">Likes: ${B.like.map((x) => D.BUILD[x].n).join(', ')}</div></div>${ok ? `<button class="btn sm ${S.gold < c ? 'off' : ''}" data-a="dobuild" data-i="${i}" data-id="${id}">${A.icon('coin', 14)}${fmt(c)}</button>` : `<span class="tag grey">${A.icon('lock', 12)} ${B.fame} fame</span>`}</div>`;
      }).join('') || '<div class="empty">Everything is built.</div>');
      return;
    }
    const B = D.BUILD[p.b]; const fx = L.bfx(S, p.b); const syn = L.synAt(S, i); const cap = L.levelCap(S);
    const nextV = B.v[Math.min(5, p.l + 1)] * (1 + 0.1 * (B.syn ? syn : 0)); const c = p.l < 5 ? L.buildCost(p.b, p.l + 1) : 0;
    const nb = L.neighbors(i).map((n) => S.plots[n]).filter(Boolean);
    let h = `<h2>${B.n} <span class="tag">L${p.l}</span></h2><div class="row"><div style="width:110px">${A.building(p.b, 110)}</div><div class="sp"><div class="kv"><span>Now</span><b>${B.f(fx.v, p.l)}</b></div>${p.l < 5 ? `<div class="kv"><span>Next</span><b>${B.f(nextV, p.l + 1)}</b></div>` : '<div class="muted">Max level</div>'}</div></div>`;
    h += `<div class="sec" style="color:var(--terra);text-shadow:none">Synergy</div><div class="muted" style="opacity:1">${B.syn ? `Likes ${B.like.map((x) => D.BUILD[x].n).join(' and ')} next to it: <b>+10% effect each</b>. Right now: ${syn} nearby.` : `Likes ${B.like.map((x) => D.BUILD[x].n).join(' and ')} nearby (they boost each other when they are the one with an effect bonus).`}</div>`;
    if (p.l < 5) h += `<button class="btn full ${S.gold < c || p.l >= cap ? 'off' : ''}" style="margin-top:12px" data-a="doup" data-i="${i}">${p.l >= cap ? A.icon('lock', 16) + ' Need more fame for L' + (p.l + 1) : 'Upgrade to L' + (p.l + 1) + ' · ' + A.icon('coin', 16) + fmt(c)}</button>`;
    if (p.b === 'kitchen') h += '<button class="btn full ghost" style="margin-top:8px" data-a="menu">Change menu</button>';
    if (p.b === 'hall') h += '<button class="btn full ghost" style="margin-top:8px" data-a="legends">View legends</button>';
    modal(h);
  };
  ACT.dobuild = (el) => { const e = L.build(S, +el.dataset.i, el.dataset.id); if (e) return toast(e); U.snd('build'); save(); closeModal(); render(); toast(D.BUILD[el.dataset.id].n + ' built!'); };
  ACT.doup = (el) => { const e = L.upgrade(S, +el.dataset.i); if (e) return toast(e); U.snd('build'); save(); render(); ACT.plot(el); };

  // ---------- GLADIATORS ----------
  const actLabel = { str: 'STR', agi: 'AGI', end: 'END', skl: 'SKL', wil: 'HRT', rest: 'Rest', spar: 'Spar', work: 'Job', spy: 'Spy' };
  function gcard(g) {
    const T = D.TRAITS[g.trait]; const entered = L.busy(S, g, S.week) ? 'this week' : L.busy(S, g, S.week + 1) ? 'next week' : '';
    const acts = D.ACTS.map((a) => `<div class="act ${g.act === a.id ? 'on' : ''} ${g.inj > 0 ? 'off' : ''}" data-a="setact" data-id="${g.id}" data-v="${a.id}" ${a.t === 'train' ? `style="border-bottom-color:${D.SC[a.s]}"` : ''}>${actLabel[a.id]}</div>`).join('');
    return `<div class="card gcard"><div class="row" style="align-items:flex-start"><div class="spr" data-a="gdetail" data-id="${g.id}">${spr(g)}</div><div class="sp"><div class="row"><div class="gname sp">${esc(g.name)} <span class="muted" style="text-transform:none">${esc(g.nick)}</span></div>${A.styleIcon(g.style, 24)}</div><div class="row wrap" style="margin:3px 0"><span class="pill">Lv ${g.lvl}</span><span class="pill">${esc(T.n)}</span><span class="pips">${stars(L.stars(g))}</span>${g.inj > 0 ? `<span class="tag red">Injured ${g.inj}w</span>` : ''}${entered ? `<span class="tag blue">Fights ${entered}</span>` : ''}${g.pend && g.pend.length ? '<span class="tag green pulse" data-a="gpick" data-id="' + g.id + '">Level-up pick!</span>' : ''}</div><div class="row" style="gap:4px"><div class="sp"><div class="bar en" title="Energy"><i style="width:${g.en}%"></i></div></div><div class="sp"><div class="bar mo" title="Morale"><i style="width:${g.mo}%"></i></div></div><div class="sp"><div class="bar xp" title="XP"><i style="width:${(g.xp / L.need(g.lvl)) * 100}%"></i></div></div></div><div class="row tiny muted" style="gap:4px;margin-top:1px"><span class="sp">ENERGY ${Math.round(g.en)}</span><span class="sp">MORALE ${Math.round(g.mo)}</span><span class="sp">XP</span></div></div></div><div class="stats">${D.STATS.map((s) => statChip(g, s)).join('')}</div><div class="acts">${acts}${L.canDrill(S, g) ? `<div class="act" style="background:var(--teal);color:#fff" data-a="drill" data-id="${g.id}">Drill!</div>` : g.drill && g.drill.week === S.week ? `<div class="act off">Drilled +${Math.round(g.drill.m * 100)}%</div>` : ''}</div></div>`;
  }
  function vGlads() {
    let h = `<div class="row" style="margin-bottom:10px"><div class="sec sp" style="margin:0">Fighters ${S.glads.length}/${L.rosterCap(S)}</div><button class="btn sm ghost" data-a="autoplan">Auto-plan</button><button class="btn sm" data-a="recruit">${A.icon('plus', 14)} Recruit</button></div>`;
    if (!S.glads.length) h += '<div class="empty">No gladiators. Recruit someone!</div>';
    h += S.glads.map(gcard).join('');
    h += '<div class="muted" style="text-align:center">Pick an activity per fighter. It repeats every week until you change it. Fighters entered in games should rest to arrive fresh.</div>';
    return h;
  }
  ACT.drill = (el) => {
    const g = gOf(+el.dataset.id); if (!g || !L.canDrill(S, g)) return toast('Set a training activity first. One drill per fighter each week.');
    U.drillRun = { g: g.id, t0: performance.now(), done: false };
    modal(`<h2>Training drill</h2><div class="muted" style="margin-bottom:6px">${esc(g.name)} drills ${D.SN[L.activity(g).s]}. Stop the marker in the green zone for a bonus on this week's gain.</div><div class="drillbar"><div class="drillz g"></div><div class="drillz p"></div><div class="drillm" id="dm"></div></div><button class="btn full red" data-a="drillstop">STOP!</button><div id="dres" class="big" style="font-size:22px;margin-top:10px"></div>`);
    const loop = () => { const r = U.drillRun; const m = document.getElementById('dm'); if (!r || r.done || !m) return; const t = (performance.now() - r.t0) / 1000 * 1.3; const ph = t % 2; const p = ph < 1 ? ph : 2 - ph; m.style.left = `calc(${p * 100}% - 4px)`; r.p = p; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  };
  ACT.drillstop = () => {
    const r = U.drillRun; if (!r || r.done) return; r.done = true; const g = gOf(r.g); const acc = 1 - Math.abs(r.p - 0.5) * 2; const m = L.setDrill(S, g, acc);
    const txt = m >= 0.4 ? 'PERFECT! +40%' : m >= 0.25 ? 'Great! +25%' : m >= 0.1 ? 'Good. +10%' : 'Missed.'; $('#dres').textContent = txt; $('#dres').style.color = m >= 0.25 ? 'var(--green)' : 'var(--terra)'; U.snd(m >= 0.25 ? 'win' : 'miss'); save(); setTimeout(() => { closeModal(); render(); }, 900);
  };
  ACT.setact = (el) => { const g = gOf(+el.dataset.id); g.act = el.dataset.v; U.snd('click'); save(); render(); };
  ACT.autoplan = () => {
    S.glads.forEach((g) => {
      if (g.inj > 0 || g.en < 45 || L.busy(S, g, S.week)) { g.act = 'rest'; return; }
      if (S.gold < 70 && g.en > 60) { g.act = 'work'; return; }
      const B = D.STYLES[g.style].base; let best = 'str', bv = 1e9;
      D.STATS.forEach((s) => { const v = (g.st[s] / B[s]) / (0.8 + 0.1 * g.tal[s]); if (v < bv && g.st[s] < L.cap(g)) { bv = v; best = s; } });
      g.act = best;
    });
    toast('Weekly plan set'); save(); render();
  };
  const PKL = { tech: ['New technique', (t) => `<span class="tag">${D.TECHS[t].cd}s</span> ${D.TECHS[t].d}`, (t) => D.TECHS[t].n], mast: ['New mastery', (t) => D.MASTS[t].d, (t) => D.MASTS[t].n], ult: ['Second ultimate', (t) => `<span class="tag">${D.ULTS[t].cd}s</span> ${D.ULTS[t].d}`, (t) => D.ULTS[t].n] };
  ACT.gpick = (el) => {
    const g = gOf(+el.dataset.id); if (!g || !g.pend || !g.pend.length) return; const p0 = g.pend[0]; const M = PKL[p0.t];
    modal(`<h2>${M[0]}</h2><div class="muted" style="margin-bottom:8px">${esc(g.name)}, level ${g.lvl}. Choose one for good.</div>` + p0.o.map((t) => `<div class="tech"><b>${M[2](t)}</b><div>${M[1](t)}</div><button class="btn sm full" style="margin-top:6px" data-a="dopick" data-id="${g.id}" data-v="${t}">Take ${M[2](t)}</button></div>`).join(''), { dismiss: true });
  };
  ACT.dopick = (el) => { const g = gOf(+el.dataset.id); L.choosePick(g, el.dataset.v); U.snd('win'); save(); closeModal(); render(); if (g.pend.length) ACT.gpick(el); };
  ACT.recruit = () => {
    L.ensureShops(S);
    const cap = L.rosterCap(S);
    modal(`<h2>Volunteers</h2><div class="muted" style="margin-bottom:8px">Free citizens queue at the gate every week. ${S.glads.length}/${cap} beds used.</div>` + S.recruits.map((g, i) => `<div class="card" style="box-shadow:0 3px 0 var(--ink)"><div class="row" style="align-items:flex-start"><div class="spr" style="width:60px;height:78px;display:flex;align-items:flex-end;justify-content:center;background:var(--cream2);border:3px solid var(--ink);border-radius:12px;overflow:hidden;flex:none">${spr(g, { size: 56 })}</div><div class="sp"><div class="row"><div class="gname sp">${esc(g.name)} <span class="muted" style="text-transform:none">${esc(g.nick)}</span></div>${A.styleIcon(g.style, 24)}</div><div class="row wrap" style="margin:3px 0"><span class="pill">Lv ${g.lvl}</span><span class="pill">${D.STYLES[g.style].n}</span><span class="pips">${stars(L.stars(g))}</span></div><div class="small">${D.TRAITS[g.trait].n}: ${D.TRAITS[g.trait].d}</div></div></div><div class="stats">${D.STATS.map((s) => statChip(g, s)).join('')}</div><button class="btn full ${S.gold < g.cost || S.glads.length >= cap ? 'off' : ''}" data-a="hire" data-i="${i}">Hire · ${A.icon('coin', 16)}${fmt(g.cost)}</button></div>`).join('') + `<button class="btn full ghost" data-a="rerollrec">New faces · ${A.icon('coin', 14)}30</button>`);
  };
  ACT.hire = (el) => { const g = S.recruits[+el.dataset.i]; const e = L.hire(S, g); if (e) return toast(e); U.snd('coin'); save(); render(); ACT.recruit(); toast(g.name + ' joined your ludus!'); };
  ACT.rerollrec = () => { if (S.gold < 30) return toast('Not enough gold'); S.gold -= 30; S.recruits = null; L.ensureShops(S); save(); render(); ACT.recruit(); };

  ACT.gdetail = (el) => {
    const g = gOf(+(el.dataset ? el.dataset.id : el)); if (!g) return; U.dg = g.id;
    const d = L.derive(g, { noperf: true }); const T = D.TRAITS[g.trait]; const S0 = D.STYLES[g.style];
    let h = `<h2>${esc(g.name)} ${esc(g.nick)}</h2><div class="row" style="align-items:flex-start"><div style="width:130px;flex:none;background:var(--cream2);border:3px solid var(--ink);border-radius:14px;display:flex;justify-content:center;align-items:flex-end;height:176px;overflow:hidden">${spr(g, { size: 120, mood: 'fight' })}</div><div class="sp">${A.styleIcon(g.style, 26)} <b class="h" style="font-size:13px">${S0.n}</b><div class="muted" style="opacity:1;margin:4px 0">${S0.role}. ${S0.d}</div><div class="row wrap"><span class="pill">Lv ${g.lvl}</span><span class="pips">${stars(L.stars(g))}</span><span class="pill">${g.rec.w}W ${g.rec.l}L</span></div><div class="small" style="margin-top:6px"><b>${T.n}:</b> ${T.d}</div><div class="bar xp" style="margin-top:8px"><i style="width:${(g.xp / L.need(g.lvl)) * 100}%"></i></div><div class="tiny muted">XP ${Math.floor(g.xp)}/${L.need(g.lvl)} · training cap ${L.cap(g)}</div></div></div>`;
    h += '<div class="sec" style="color:var(--terra);text-shadow:none">Stats</div>' + D.STATS.map((s) => `<div class="kv"><span>${D.SN[s]} <span class="pips">${'●'.repeat(g.tal[s])}${'○'.repeat(3 - g.tal[s])}</span></span><b style="color:${D.SC[s]}">${g.st[s].toFixed(1)}</b></div>`).join('');
    h += `<div class="kv"><span>HP / ATK / DEF</span><b>${Math.round(d.hp)} / ${Math.round(d.atk)} / ${Math.round(d.def)}</b></div><div class="kv"><span>SPD / CRIT / EVA</span><b>${Math.round(d.spd)} / ${Math.round(d.crit * 100)}% / ${Math.round(d.eva * 100)}%</b></div>`;
    h += '<div class="sec" style="color:var(--terra);text-shadow:none">Gear</div><div class="row wrap">' + D.SLOTS.map((s) => { const it = g.gear[s]; return `<div style="text-align:center"><div class="slotbox ${it ? 'has' : ''}" data-a="slot" data-id="${g.id}" data-v="${s}" style="${it ? 'background:' + D.RAR[it.rar].c + '33' : ''}">${it ? A.itemIcon(s, it.rar, 38) : '<span class="tiny muted">' + D.SLOT_NAME[s] + '</span>'}</div>${it && it.up ? `<div class="tiny">+${it.up}</div>` : ''}</div>`; }).join('') + '</div>';
    const sc = L.setCounts(g); const sl = Object.keys(sc).filter((k) => sc[k] >= 2);
    if (sl.length) h += '<div class="small" style="margin-top:6px">' + sl.map((k) => `<span class="tag" style="background:${D.SETS[k].c};color:#fff">${D.SETS[k].n} ${sc[k]}pc</span> ${D.SETS[k].d2}${sc[k] >= 4 ? ', ' + D.SETS[k].d4 : ''}`).join('<br>') + '</div>';
    const kr = D.KEYSTONES[g.rune.k];
    h += `<div class="sec" style="color:var(--terra);text-shadow:none">Ultimates (you trigger these)</div>` + L.ultsOf(g).map((id) => `<div class="tech" style="border-color:${D.ULTS[id].c}"><div class="row"><span class="sbadge" style="background:${D.ULTS[id].c};width:30px;height:30px">${A.ultIcon(id, 22)}</span><b>${D.ULTS[id].n}</b><span class="tag">${D.ULTS[id].cd}s</span></div><div>${D.ULTS[id].d}</div></div>`).join('') + (g.ult2 ? '' : '<div class="muted">A second ultimate unlocks at level 8.</div>');
    h += `<div class="sec" style="color:var(--terra);text-shadow:none">Runes</div><div class="tech" style="border-color:${kr.c};cursor:pointer" data-a="runes" data-id="${g.id}"><b>${kr.n}</b> <span class="tag">Keystone</span><div>${kr.d}</div></div>` + g.rune.m.map((m) => `<div class="tech" data-a="runes" data-id="${g.id}" style="cursor:pointer"><b>${D.MINORS[m].n}</b> <span class="tag grey">Minor</span><div>${D.MINORS[m].d}</div></div>`).join('') + `<button class="btn sm ghost" data-a="runes" data-id="${g.id}">Change runes</button>`;
    if (g.mast.length) h += '<div class="sec" style="color:var(--terra);text-shadow:none">Masteries</div>' + g.mast.map((m) => `<div class="tech"><b>${D.MASTS[m].n}</b> ${D.MASTS[m].d}</div>`).join('');
    h += '<div class="sec" style="color:var(--terra);text-shadow:none">Techniques (cast automatically)</div>' + g.techs.map((t) => `<div class="tech"><b>${D.TECHS[t].n}</b> <span class="tag">${D.TECHS[t].cd}s</span><div>${D.TECHS[t].d}</div></div>`).join('');
    h += `<div class="row wrap" style="margin-top:10px"><button class="btn sm" data-a="autoeq" data-id="${g.id}">Auto-equip</button><button class="btn sm ghost" data-a="rename" data-id="${g.id}">Rename</button><button class="btn sm ghost" data-a="retrainm" data-id="${g.id}">Retrain style</button><button class="btn sm ghost ${g.lvl < 8 ? 'off' : ''}" data-a="retire" data-id="${g.id}">Retire (Lv8+)</button><button class="btn sm red" data-a="release" data-id="${g.id}">Release</button></div>`;
    modal(h);
  };
  ACT.runes = (el) => {
    const g = gOf(+el.dataset.id); U.rg = g.id; const ks = Object.keys(D.KEYSTONES), ms = Object.keys(D.MINORS);
    modal(`<h2>Runes: ${esc(g.name)}</h2><div class="muted" style="margin-bottom:6px">Pick one keystone and two minors. Unlock more by winning tournaments, bosses and Pit floors.</div><div class="sec" style="color:var(--terra);text-shadow:none">Keystone</div>` + ks.map((k) => { const own = L.runeOwned(S, 'k', k); return `<div class="tech ${own ? '' : 'lockd'}" style="border-color:${D.KEYSTONES[k].c};${g.rune.k === k ? 'background:var(--gold)' : ''};${own ? 'cursor:pointer' : 'opacity:.45'}" data-a="${own ? 'setk' : ''}" data-id="${g.id}" data-v="${k}"><b>${D.KEYSTONES[k].n}</b> ${own ? '' : A.icon('lock', 12)}<div>${D.KEYSTONES[k].d}</div></div>`; }).join('') + '<div class="sec" style="color:var(--terra);text-shadow:none">Minors (2)</div>' + ms.map((m) => { const own = L.runeOwned(S, 'm', m); return `<div class="tech" style="${g.rune.m.includes(m) ? 'background:var(--gold)' : ''};${own ? 'cursor:pointer' : 'opacity:.45'}" data-a="${own ? 'setm' : ''}" data-id="${g.id}" data-v="${m}"><b>${D.MINORS[m].n}</b> ${own ? '' : A.icon('lock', 12)}<div>${D.MINORS[m].d}</div></div>`; }).join('') + `<button class="btn full" style="margin-top:8px" data-a="gdetail" data-id="${g.id}">Done</button>`);
  };
  ACT.setk = (el) => { const g = gOf(+el.dataset.id); L.setKeystone(S, g, el.dataset.v); save(); U.snd('click'); ACT.runes(el); };
  ACT.setm = (el) => { const g = gOf(+el.dataset.id); L.toggleMinor(S, g, el.dataset.v); save(); U.snd('click'); const sc = $('#sheet').scrollTop; ACT.runes(el); $('#sheet').scrollTop = sc; };
  ACT.autoeq = (el) => { const g = gOf(+el.dataset.id); L.autoEquip(S, g); save(); ACT.gdetail(g.id); render(); };
  ACT.rename = (el) => { const g = gOf(+el.dataset.id); const n = prompt('New name', g.name); if (n && n.trim()) { g.name = n.trim().slice(0, 16); save(); ACT.gdetail(g.id); render(); } };
  ACT.retrainm = (el) => {
    const g = gOf(+el.dataset.id); const c = L.retrainCost(g);
    modal(`<h2>Retrain style</h2><div class="muted">Costs ${c} gold. Keeps stats and learned picks, swaps the signature technique. Counter-pick the next opponent!</div>` + D.STYLE_IDS.filter((s) => s !== g.style).map((s) => `<div class="itm" data-a="doretrain" data-id="${g.id}" data-v="${s}">${A.styleIcon(s, 28)}<div class="sp"><div class="gname">${D.STYLES[s].n}</div><div class="muted" style="opacity:1">${D.STYLES[s].role}. Beats ${D.STYLES[s].beats.map((b) => D.STYLES[b].n).join(' and ')}.</div></div></div>`).join(''));
  };
  ACT.doretrain = (el) => { const g = gOf(+el.dataset.id); const e = L.retrain(S, g, el.dataset.v); if (e) return toast(e); save(); ACT.gdetail(g.id); render(); };
  ACT.retire = (el) => { const g = gOf(+el.dataset.id); if (!confirm(`Retire ${g.name} to the Hall of Legends? They leave the roster; legends boost training for everyone (needs Hall slots).`)) return; const e = L.retire(S, g); if (e) return toast(e); save(); closeModal(); render(); toast(g.name + ' became a legend.'); };
  ACT.release = (el) => { const g = gOf(+el.dataset.id); if (!confirm(`Release ${g.name}? Their gear returns to the armory.`)) return; L.release(S, g); save(); closeModal(); render(); };
  ACT.slot = (el) => {
    const g = gOf(+el.dataset.id); const slot = el.dataset.v; const cur = g.gear[slot];
    const list = S.items.filter((i) => i.slot === slot).sort((a, b) => L.itemScore(b) - L.itemScore(a));
    modal(`<h2>${D.SLOT_NAME[slot]}</h2>` + (cur ? `<div class="itm" data-a="unequip" data-id="${g.id}" data-v="${slot}">${A.itemIcon(slot, cur.rar, 36)}<div class="sp"><div class="gname" style="color:#000">${esc(cur.name)} ${cur.up ? '+' + cur.up : ''}</div><div class="muted" style="opacity:1">${fmtSt(cur)}</div></div><span class="tag">Remove</span></div>` : '') + (list.length ? list.map((it) => `<div class="itm" data-a="doequip" data-id="${g.id}" data-v="${it.id}">${A.itemIcon(slot, it.rar, 36)}<div class="sp"><div class="gname">${esc(it.name)} ${it.up ? '+' + it.up : ''}</div><div class="muted" style="opacity:1">${fmtSt(it)}</div>${affTxt(it)}</div>${cur ? (L.itemScore(it) > L.itemScore(cur) ? '<span class="tag green">Better</span>' : '<span class="tag grey">Worse</span>') : ''}</div>`).join('') : '<div class="empty" style="color:var(--ink)">No spare items for this slot.</div>'));
  };
  ACT.doequip = (el) => { const g = gOf(+el.dataset.id); const it = S.items.find((i) => i.id === el.dataset.v); if (it) L.equip(S, g, it); U.snd('build'); save(); ACT.gdetail(g.id); render(); };
  ACT.unequip = (el) => { const g = gOf(+el.dataset.id); const e = L.unequip(S, g, el.dataset.v); if (e) return toast(e); save(); ACT.gdetail(g.id); render(); };
  function affTxt(it) {
    const a = it.af.map((x) => `<div class="tiny" style="color:#6a3bb0">${D.AFFIX[x.id].n}: ${D.AFFIX[x.id].d(x.v)}</div>`).join('');
    return a + (it.set ? `<div class="tiny"><span class="tag" style="background:${D.SETS[it.set].c};color:#fff">${D.SETS[it.set].n} set</span></div>` : '');
  }
  U.affTxt = affTxt;

  // ---------- ARENA ----------
  function fogLevel() { return L.scoutLevel(S); }
  function oppRow(o, lv, i, key) {
    const fog = lv < 1 ? 'fog' : '';
    return `<div class="opp" data-a="insp" data-key="${key}" data-i="${i}"><div class="spr ${lv < 0 ? 'fog' : ''}">${A.gladOf(o, { size: 52, tunic: o.color, mood: 'fight' })}</div><div class="sp"><div class="gname" style="font-size:13px">${esc(o.name)}</div><div class="row"><span class="pill">Lv ${o.lvl}</span>${A.styleIcon(o.style, 20)}${o.gh ? '<span class="tag" style="background:#7d7d8c;color:#fff">Ghost</span>' : ''}</div></div></div>`;
  }
  function vArena() {
    const ml = L.maxLeague(S); const lv = fogLevel(); const look = L.lookahead(S);
    if (ui.wk >= look) ui.wk = 0;
    let h = '<div class="ltabs">' + D.LEAGUES.map((Lg) => `<div class="ltab ${ui.league === Lg.id ? 'on' : ''} ${Lg.id > ml ? 'lock' : ''}" data-a="league" data-v="${Lg.id}">${Lg.id > ml ? A.icon('lock', 12) : ''} ${Lg.n}</div>`).join('') + '</div>';
    h += '<div class="wtabs">' + Array.from({ length: look }, (_, i) => `<div class="wtab ${ui.wk === i ? 'on' : ''}" data-a="wk" data-v="${i}">${i === 0 ? 'This week' : 'Week ' + (S.week + i)}${L.festival(S, S.week + i) ? ' \u2605' : ''}</div>`).join('') + `</div>`;
    h += `<div class="card dark row" style="gap:10px">${A.icon('eye', 24)}<div class="small sp"><b class="h" style="font-size:12px;color:var(--gold)">Scouting level ${lv}</b><br>${L.fogNote[lv]}. Upgrade the Scout Tower to see more and look further ahead.</div></div>`;
    const used = S.pitWeek === S.week;
    h += `<div class="card" style="background:var(--ink);color:var(--cream);border-color:var(--gold)"><div class="row"><div class="sp"><b class="h" style="color:var(--gold)">Pit of Trials</b><div class="small" style="font-weight:600">One fighter descends. Wounds carry over. Pick an augment before every floor, then cash out or push deeper. Best floor: <b>${S.pitBest || 0}</b></div></div><div class="col" style="gap:6px"><button class="btn sm ${used ? 'off' : 'red'}" data-a="pit">${used ? 'Done this week' : 'Descend'}</button><button class="btn sm ${L.dailyDone(S) ? 'off' : 'blue'}" data-a="pitdaily">${L.dailyDone(S) ? 'Daily done' : 'Daily seed'}</button></div></div><div class="tiny" style="margin-top:6px;opacity:.85">Daily Descent: the same opponents and augment offers for everyone today. Best daily floor: <b>${S.dailyBest || 0}</b>. Resets at midnight UTC.</div><div class="tiny" style="margin-top:4px"><b style="color:var(--gold)">Mutators:</b> this week <b>${L.mutator('w' + S.week).n}</b>, daily <b>${L.mutator('d' + L.dayKey()).n}</b>.</div></div>`;
    const Lg = D.LEAGUES[ui.league];
    if (ui.league > ml) return h + `<div class="card"><h3>${A.icon('lock', 18)} ${Lg.n}</h3>Reach ${Lg.fame} fame to enter (you have ${fmt(S.fame)}). ${Lg.d}</div>`;
    const week = S.week + ui.wk; const evs = L.events(S, week, ui.league); const fs = L.festival(S, week);
    if (fs) h += `<div class="card" style="background:${fs.c};color:#fff"><b class="h" style="font-size:13px">${fs.n} this week</b><div class="small" style="font-weight:700">${fs.d}</div></div>`;
    evs.forEach((ev) => {
      const en = S.entries[ev.key]; const cls = ev.kind === 'grand' ? 'g' : ev.kind === 'tourney' ? 't' : ev.kind === 'team' ? 'm' : '';
      const rev = L.isRevenge(S, ev);
      h += `<div class="card ev ${cls}"><div class="hd">${A.icon(ev.kind === 'team' ? 'user' : 'swords', 18, 'stroke="#14100f"')}<span class="h sp">${ev.title}</span>${rev ? '<span class="tag red">Revenge!</span>' : ''}<span class="pill">${D.DIFF[ev.diff] ? D.DIFF[ev.diff].n : ev.size + ' fighters'}</span>${L.weather(S, ev.key) !== 'clear' ? `<span class="fest" style="background:#3d3b46">${D.WEATHER[L.weather(S, ev.key)].n}</span>` : ''}</div><div class="bd">`;
      if (ev.kind === 'duel') h += oppRow(ev.opps[0], lv, 0, ev.key);
      else if (ev.kind === 'team') h += '<div class="row" style="gap:10px">' + ev.opps.map((o, i) => oppRow(o, lv, i, ev.key)).join('') + '</div>';
      else h += '<div class="row wrap" style="gap:6px">' + ev.opps.map((o, i) => `<div class="opp" data-a="insp" data-key="${ev.key}" data-i="${i}"><div class="spr" style="width:40px;height:46px">${A.gladOf(o, { size: 38, tunic: o.color })}</div>${A.styleIcon(o.style, 18)}</div>`).join('') + '</div>';
      h += `<div class="reward"><span class="pill">${A.icon('coin', 14)} ${fmt(ev.purse)}</span><span class="pill">${A.icon('fame', 14)} ${ev.fame}</span><span class="pill" style="background:var(--cream)">Fee ${fmt(ev.fee)}</span>${ev.loot ? '<span class="pill" style="background:var(--gold)">Pick 1 of 3 loot</span>' : ''}</div>`;
      h += '<div class="row" style="margin-top:8px">';
      if (en) h += `<div class="sp small"><b>ENTERED:</b> ${en.ids.map((id) => esc((gOf(id) || { name: '?' }).name)).join(', ')}</div><button class="btn sm ghost" data-a="withdraw" data-key="${ev.key}">Withdraw</button>`;
      else h += `<button class="btn sm ghost" data-a="insp" data-key="${ev.key}" data-i="0">${A.icon('eye', 14)} Scout</button><span class="sp"></span><button class="btn sm red" data-a="enter" data-key="${ev.key}">Enter</button>`;
      h += '</div></div></div>';
    });
    return h;
  }
  ACT.league = (el) => { ui.league = +el.dataset.v; render(); };
  ACT.wk = (el) => { ui.wk = +el.dataset.v; render(); };
  ACT.withdraw = (el) => { L.withdraw(S, el.dataset.key); save(); render(); toast('Entry refunded'); };
  U.evOf = (key) => L.eventByKey(S, key);

  // Opponent dossier with fog of war
  U.dossier = (o, ev, opts) => {
    const lv = fogLevel(); const S0 = D.STYLES[o.style]; const counters = L.counters(o.style);
    let h = `<h2>${esc(o.name)} ${esc(o.nick)}</h2><div class="row" style="align-items:flex-start"><div style="width:120px;flex:none;background:var(--cream2);border:3px solid var(--ink);border-radius:14px;display:flex;justify-content:center;align-items:flex-end;height:164px;overflow:hidden">${A.gladOf(o, { size: 112, tunic: o.color, mood: 'fight' })}</div><div class="sp"><div class="row">${A.styleIcon(o.style, 26)}<b class="h" style="font-size:13px">${S0.n}</b></div><div class="muted" style="opacity:1;margin:3px 0">${esc(o.lud || '')} · ${S0.role}</div><span class="pill">Lv ${o.lvl}</span>${o.rv && S.rivals[o.rv] ? `<div class="small" style="margin-top:6px">Your record vs them: <b>${S.rivals[o.rv].w}W ${S.rivals[o.rv].l}L</b></div>` : ''}<div class="small" style="margin-top:6px"><b>Slight edge on:</b> ${S0.beats.map((b) => A.styleIcon(b, 20)).join(' ')}<br><b>Slight risk vs:</b> ${counters.map((b) => A.styleIcon(b, 20)).join(' ')}</div></div></div>`;
    if (o.gh) h += `<div class="card" style="background:#d9d9e3;margin-top:8px"><b>${esc(o.lud || 'A ghost')}</b><div class="small">One of your own former champions, back as a rival. They keep their old techniques and tricks.</div></div>`;
    h += `<div class="sec" style="color:var(--terra);text-shadow:none">Intel (scouting ${lv})</div>`;
    if (lv < 1) h += `<div class="row wrap">${D.STATS.map((s) => `<div class="st"><span style="background:${D.SC[s]}">${D.SA[s]}</span><b>?</b></div>`).join('')}</div><div class="muted" style="margin-top:6px">Build a Scout Tower to learn their stats, traits and gear.</div>`;
    else if (lv === 1) h += `<div class="row wrap">${D.STATS.map((s) => `<div class="st"><span style="background:${D.SC[s]}">${D.SA[s]}</span><b>${L.grade(o.st[s], o.lvl)}</b></div>`).join('')}</div><div class="small" style="margin-top:6px"><b>${D.TRAITS[o.trait].n}:</b> ${D.TRAITS[o.trait].d}</div><div class="muted">Scouting 2 reveals exact numbers, gear and win odds.</div>`;
    else {
      const wk = ev ? ev.week : S.week; const err = L.staleErr(S, wk);
      h += (err > 0 ? `<div class="small" style="color:var(--terra)"><b>Intel is ${L.weeksAhead(S, wk)} week(s) old.</b> Rivals keep training: real numbers may be up to ${Math.round(err * 100)}% higher. Spy or scout again closer to the date.</div>` : '') + `<div class="row wrap">${D.STATS.map((s) => `<div class="st"><span style="background:${D.SC[s]}">${D.SA[s]}</span><b>${err > 0 ? '~' : ''}${Math.floor(L.scoutVal(S, wk, o.st[s]))}</b></div>`).join('')}</div><div class="small" style="margin-top:6px"><b>${D.TRAITS[o.trait].n}:</b> ${D.TRAITS[o.trait].d}</div>`;
      h += '<div style="margin-top:8px">' + o.techs.map((t) => `<span class="pill" title="${D.TECHS[t].d}">${D.TECHS[t].n}</span>`).join(' ') + '</div>';
      h += `<div style="margin-top:6px" class="small"><b>Ultimates:</b> ${L.ultsOf(o).map((x) => D.ULTS[x].n).join(', ')} · <b>Rune:</b> ${D.KEYSTONES[o.rune.k].n}${lv >= 3 && o.mast.length ? ' · <b>Masteries:</b> ' + o.mast.map((m) => D.MASTS[m].n).join(', ') : ''}</div>`;
      h += '<div style="margin-top:8px">' + D.SLOTS.map((s) => { const it = o.gear[s]; return it ? `<div class="small"><span class="tag" style="background:${D.RAR[it.rar].c}">${D.SLOT_NAME[s]}</span> ${esc(it.name)}${lv >= 3 ? ' ' + it.af.map((a) => `<span class="tiny" style="color:#6a3bb0">${D.AFFIX[a.id].n}</span>`).join(' ') : ''}</div>` : ''; }).join('') + '</div>';
      if (lv >= 3) { const d = L.derive(o, { noperf: true }); h += `<div class="kv" style="margin-top:6px"><span>HP / ATK / DEF</span><b>${Math.round(d.hp)} / ${Math.round(d.atk)} / ${Math.round(d.def)}</b></div><div class="kv"><span>SPD / CRIT / EVA</span><b>${Math.round(d.spd)} / ${Math.round(d.crit * 100)}% / ${Math.round(d.eva * 100)}%</b></div>${d.sets.length ? '<div class="small">Sets: ' + d.sets.map((x) => D.SETS[x.id].n + ' ' + x.n + 'pc').join(', ') + '</div>' : ''}`; }
    }
    if (ev && ev.kind !== 'duel' && ev.opps.length > 1) h += '<div class="sec" style="color:var(--terra);text-shadow:none">Others in this event</div><div class="row wrap">' + ev.opps.map((x, i) => `<div class="opp" data-a="insp" data-key="${ev.key}" data-i="${i}">${A.gladOf(x, { size: 40, tunic: x.color })}${A.styleIcon(x.style, 18)}</div>`).join('') + '</div>';
    if (!opts || !opts.noback) h += '<div class="muted" style="margin-top:10px">Matchups give a small style edge (+10%), but fights are decided by stats, gear, runes, augments and how well you time your ultimates.</div>';
    modal(h);
  };
  ACT.insp = (el) => { const ev = L.eventByKey(S, el.dataset.key); U.dossier(ev.opps[+el.dataset.i], ev); };

  // Choose who fights
  ACT.enter = (el) => {
    const ev = L.eventByKey(S, el.dataset.key); ui.pickEv = ev.key; ui.pick = []; renderPick();
  };
  function renderPick() {
    const ev = L.eventByKey(S, ui.pickEv); const lv = fogLevel(); const n = L.teamSize(ev); const opp = ev.opps[0];
    const wk = ev.week; const list = S.glads;
    let h = `<h2>${ev.title}</h2><div class="muted" style="margin-bottom:8px">${n > 1 ? 'Pick ' + n + ' fighters' : 'Pick your fighter'}. vs ${ev.kind === 'duel' || ev.kind === 'team' ? ev.opps.map((o) => esc(o.name) + ' (' + D.STYLES[o.style].n + ')').join(', ') : 'a bracket of ' + ev.size}.</div>`;
    if (!list.length) h += '<div class="empty" style="color:var(--ink)">No fighters.</div>';
    list.forEach((g) => {
      const busy = L.busy(S, g, wk); const bad = g.inj > 0 || busy; const a = L.adv(g.style, opp.style);
      let odds = ''; if (!bad && ev.kind !== 'team') { const p = L.odds(S, [g], [opp], 'bal'); const pp = L.weeksAhead(S, wk) > 0 && lv < 3 ? Math.round(p * 10) / 10 : p; odds = lv >= 2 ? (pp !== p ? '~' : '') + Math.round(pp * 100) + '%' : lv === 1 ? (p > 0.6 ? 'Favoured' : p < 0.4 ? 'Underdog' : 'Even') : '?'; }
      h += `<div class="itm ${ui.pick.includes(g.id) ? 'sel' : ''}" style="${ui.pick.includes(g.id) ? 'background:var(--gold)' : ''}${bad ? ';opacity:.45' : ''}" data-a="pickg" data-id="${g.id}"><div style="width:44px;height:52px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${spr(g, { size: 46 })}</div><div class="sp"><div class="gname" style="font-size:13px">${esc(g.name)}</div><div class="row wrap" style="gap:4px"><span class="pill">Lv ${g.lvl}</span>${A.styleIcon(g.style, 18)}${advTag(a)}${g.inj > 0 ? '<span class="tag red">Injured</span>' : busy ? '<span class="tag blue">Busy</span>' : ''}</div><div class="bar en" style="margin-top:3px"><i style="width:${g.en}%"></i></div></div>${odds ? `<div style="text-align:center"><div class="h" style="font-size:16px">${odds}</div><div class="tiny muted">win</div></div>` : ''}</div>`;
    });
    if (n > 1 && ui.pick.length === n) {
      const gs = ui.pick.map(gOf); const ctx = L.teamCtx(S, gs, 'bal'); const p = L.odds(S, gs, ev.opps, 'bal', 24);
      h += `<div class="card" style="margin-top:8px"><b class="h" style="font-size:12px">Team synergy</b><div class="small">${ctx.list.length ? ctx.list.map((s) => `<b>${s.n}</b>: ${s.d}`).join('<br>') : 'No style combo. Mix styles for bonuses!'}</div>${lv >= 2 ? `<div class="small" style="margin-top:4px">Win chance: <b>${Math.round(p * 100)}%</b></div>` : ''}</div>`;
    }
    const ready = n === 1 || ev.kind === 'tourney' || ev.kind === 'grand' ? ui.pick.length === 1 : ui.pick.length === n;
    h += `<button class="btn full red ${ready ? '' : 'off'}" style="margin-top:8px" data-a="confirmenter">Enter · fee ${fmt(ev.fee)}</button>`;
    modal(h);
  }
  ACT.pickg = (el) => {
    const ev = L.eventByKey(S, ui.pickEv); const g = gOf(+el.dataset.id); if (g.inj > 0 || L.busy(S, g, ev.week)) return toast(g.inj > 0 ? 'Injured' : 'Already entered that week');
    const n = L.teamSize(ev); const i = ui.pick.indexOf(g.id);
    if (i >= 0) ui.pick.splice(i, 1); else { if (ui.pick.length >= n) ui.pick.shift(); ui.pick.push(g.id); }
    const sc = $('#sheet').scrollTop; renderPick(); $('#sheet').scrollTop = sc;
  };
  ACT.confirmenter = () => {
    const ev = L.eventByKey(S, ui.pickEv); const e = L.enter(S, ev, ui.pick.slice(), 'bal'); if (e) return toast(e);
    U.snd('click'); save(); closeModal(); render(); toast('Entered! See you on games day.');
  };

  // ---------- ARMORY ----------
  const icell = (it, extra) => `<div class="icell ${extra || ''}" data-a="${extra === 'fsel' ? 'fpick' : 'item'}" data-id="${it.id}" style="border-color:var(--ink);background:${D.RAR[it.rar].c}33">${it.up ? `<span class="up">+${it.up}</span>` : ''}${A.itemIcon(it.slot, it.rar, 36)}<div class="nm">${esc(it.name)}</div>${it.set ? `<span class="tag" style="background:${D.SETS[it.set].c};color:#fff;font-size:8px">${D.SETS[it.set].n}</span>` : ''}<div class="tiny">${fmtSt(it).split(' · ')[0]}</div></div>`;
  function vArmory() {
    const sub = ui.arm;
    let h = `<div class="ltabs">${[['inv', 'Items'], ['relics', 'Relics'], ['shop', 'Market'], ['forge', 'Forge']].map(([id, n]) => `<div class="ltab ${sub === id ? 'on' : ''}" data-a="armsub" data-v="${id}">${n}</div>`).join('')}</div>`;
    if (sub === 'inv') {
      const items = S.items.slice().sort((a, b) => b.rar - a.rar || L.itemScore(b) - L.itemScore(a));
      h += `<div class="muted" style="margin-bottom:8px;color:var(--cream2)">${items.length}/${L.armoryCap(S)} items. Tap one to equip, upgrade or sell.</div>`;
      h += items.length ? '<div class="igrid">' + items.map((it) => icell(it)).join('') + '</div>' : '<div class="empty">No spare items. Win fights, enter tournaments, or visit the Market.</div>';
    } else if (sub === 'relics') {
      const slots = L.relicSlots(S);
      h += `<div class="card dark"><b class="h" style="color:var(--gold)">Relics ${S.relicOn.length}/${slots}</b><div class="small" style="font-weight:600">Ancient artifacts that boost every fighter. Win tournaments, grand games and Pit bosses to find them. The Shrine adds slots.</div></div>`;
      h += S.relics.length ? S.relics.map((id) => { const r = D.RELICS.find((x) => x.id === id); const on = S.relicOn.includes(id); return `<div class="itm" data-a="relic" data-v="${id}" style="border-color:${r.c};${on ? 'background:var(--gold)' : ''}"><div class="sbadge" style="background:${r.c};width:34px;height:34px">${A.icon('laurel', 20)}</div><div class="sp"><div class="gname" style="font-size:13px">${r.n}</div><div class="muted" style="opacity:1">${r.d}</div></div><span class="tag ${on ? 'green' : 'grey'}">${on ? 'Equipped' : 'Stored'}</span></div>`; }).join('') : '<div class="empty">No relics yet.</div>';
    } else if (sub === 'shop') {
      L.ensureShops(S); const mk = L.bfx(S, 'market');
      h += `<div class="muted" style="margin-bottom:8px;color:var(--cream2)">${mk.l ? 'Market L' + mk.l + ': ' + 3 * mk.l + '% discount.' : 'Build a Market for discounts and weekly income.'} Stock changes every week.</div>`;
      h += S.market.map((it) => `<div class="itm" data-a="shopitem" data-id="${it.id}">${A.itemIcon(it.slot, it.rar, 38)}<div class="sp"><div class="gname" style="font-size:13px">${esc(it.name)}</div><div class="muted" style="opacity:1">${rarTag(it.rar)} ${fmtSt(it)}</div>${affTxt(it)}</div><div class="h" style="font-size:13px">${A.icon('coin', 14)}${fmt(L.buyVal(S, it))}</div></div>`).join('');
      h += `<button class="btn full ghost" data-a="rerollmk">Restock · ${A.icon('coin', 14)}40</button>`;
    } else {
      const fl = L.bfx(S, 'forge').l; const sel = ui.fsel.map((id) => S.items.find((i) => i.id === id)).filter(Boolean);
      h += `<div class="card"><h3>Merge three, get one better</h3><div class="muted" style="opacity:1">Pick 3 items of the same rarity. Out comes 1 item a rarity higher, with fresh affixes and a chance at a set piece. ${fl ? '' : '<b>Build a Forge first.</b>'}</div></div>`;
      const items = S.items.slice().sort((a, b) => a.rar - b.rar);
      h += items.length ? '<div class="igrid">' + items.map((it) => icell(it, 'fsel' + (ui.fsel.includes(it.id) ? ' sel' : ''))).join('') + '</div>' : '<div class="empty">Nothing to merge.</div>';
      const ok = sel.length === 3 && sel.every((i) => i.rar === sel[0].rar) && sel[0].rar < 4 && fl > 0;
      h += `<button class="btn full red ${ok ? '' : 'off'}" style="margin-top:10px" data-a="domerge">${sel.length === 3 && sel.every((i) => i.rar === sel[0].rar) && sel[0].rar < 4 ? 'Forge to ' + D.RAR[sel[0].rar + 1].n + ' · ' + A.icon('coin', 14) + L.mergeCost(sel[0].rar) : 'Select 3 of the same rarity (' + sel.length + '/3)'}</button>`;
    }
    return h;
  }
  ACT.relic = (el) => { const e = L.toggleRelic(S, el.dataset.v); if (e) return toast(e); U.snd('click'); save(); render(); };
  ACT.armsub = (el) => { ui.arm = el.dataset.v; render(); };
  ACT.fpick = (el) => { const id = el.dataset.id; const i = ui.fsel.indexOf(id); if (i >= 0) ui.fsel.splice(i, 1); else { if (ui.fsel.length >= 3) ui.fsel.shift(); ui.fsel.push(id); } render(); };
  ACT.domerge = () => {
    const sel = ui.fsel.map((id) => S.items.find((i) => i.id === id)).filter(Boolean); const r = L.merge(S, sel); if (r.err) return toast(r.err);
    ui.fsel = []; U.snd('win'); save(); render(); modal(`<h2>Forged!</h2><div class="itm" style="cursor:default">${A.itemIcon(r.item.slot, r.item.rar, 44)}<div class="sp"><div class="gname">${esc(r.item.name)}</div>${rarTag(r.item.rar)}<div class="muted" style="opacity:1">${fmtSt(r.item)}</div>${affTxt(r.item)}</div></div>`);
  };
  ACT.rerollmk = () => { if (S.gold < 40) return toast('Not enough gold'); S.gold -= 40; L.rerollMarket(S); save(); render(); };
  ACT.shopitem = (el) => {
    const it = S.market.find((i) => i.id === el.dataset.id); const cur = null;
    modal(`<h2>${esc(it.name)}</h2>${rarTag(it.rar)} <span class="pill">${D.SLOT_NAME[it.slot]}</span> <span class="pill">ilvl ${it.ilvl}</span><div class="muted" style="opacity:1;margin:8px 0">${fmtSt(it)}</div>${affTxt(it)}${it.set ? `<div class="small" style="margin-top:6px">${D.SETS[it.set].n}: 2pc ${D.SETS[it.set].d2}; 4pc ${D.SETS[it.set].d4}</div>` : ''}<button class="btn full" style="margin-top:12px" data-a="buyitem" data-id="${it.id}">Buy · ${A.icon('coin', 16)}${fmt(L.buyVal(S, it))}</button>`);
  };
  ACT.buyitem = (el) => { const it = S.market.find((i) => i.id === el.dataset.id); const e = L.buyItem(S, it); if (e) return toast(e); U.snd('coin'); save(); closeModal(); render(); toast('Bought ' + it.name); };
  ACT.item = (el) => {
    const it = S.items.find((i) => i.id === el.dataset.id); if (!it) return;
    const maxUp = L.maxUp(S); const upc = L.upCost(it);
    modal(`<h2>${esc(it.name)} ${it.up ? '+' + it.up : ''}</h2>${rarTag(it.rar)} <span class="pill">${D.SLOT_NAME[it.slot]}</span> <span class="pill">ilvl ${it.ilvl}</span><div class="muted" style="opacity:1;margin:8px 0">${fmtSt(it)}</div>${affTxt(it)}${it.set ? `<div class="small" style="margin-top:6px"><b>${D.SETS[it.set].n} set:</b> 2pc ${D.SETS[it.set].d2}; 4pc ${D.SETS[it.set].d4}</div>` : ''}
    <div class="sec" style="color:var(--terra);text-shadow:none">Equip on</div>${S.glads.map((g) => { const c = g.gear[it.slot]; return `<div class="itm" data-a="equipon" data-id="${g.id}" data-v="${it.id}"><div style="width:36px;height:42px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${spr(g, { size: 38 })}</div><div class="sp"><div class="gname" style="font-size:12px">${esc(g.name)}</div><div class="tiny muted">${c ? 'Now: ' + esc(c.name) : 'Empty slot'}</div></div>${c ? (L.itemScore(it) > L.itemScore(c) ? '<span class="tag green">Better</span>' : '<span class="tag grey">Worse</span>') : '<span class="tag green">New</span>'}</div>`; }).join('')}
    <div class="row wrap" style="margin-top:10px"><button class="btn sm ${it.up >= maxUp || S.gold < upc ? 'off' : ''}" data-a="upitem" data-id="${it.id}">${it.up >= maxUp ? (maxUp ? 'Upgrade the Forge' : 'Build a Forge') : 'Upgrade +' + (it.up + 1) + ' · ' + fmt(upc)}</button><button class="btn sm ghost ${it.af.length && S.gold >= L.reforgeCost(it) ? '' : 'off'}" data-a="reforge" data-id="${it.id}">Reforge affix · ${L.reforgeCost(it)}</button>${it.rar < 4 ? `<button class="btn sm blue ${L.canEvolve(S, it) && S.gold >= L.evolveCost(it) ? 'pulse' : L.canEvolve(S, it) ? '' : 'off'}" data-a="evolve" data-id="${it.id}">Evolve to ${D.RAR[it.rar + 1].n} · ${fmt(L.evolveCost(it))}</button>` : ''}<button class="btn sm red" data-a="sell" data-id="${it.id}">Sell ${fmt(L.sellVal(it))}</button></div>`);
  };
  ACT.equipon = (el) => { const g = gOf(+el.dataset.id); const it = S.items.find((i) => i.id === el.dataset.v); L.equip(S, g, it); U.snd('build'); save(); closeModal(); render(); toast(g.name + ' equipped ' + it.name); };
  ACT.upitem = (el) => { const it = S.items.find((i) => i.id === el.dataset.id); const e = L.upgradeItem(S, it); if (e) return toast(e); U.snd('build'); save(); render(); ACT.item(el); };
  ACT.reforge = (el) => { const it = S.items.find((i) => i.id === el.dataset.id); const e = L.reforge(S, it); if (e) return toast(e); U.snd('build'); save(); render(); ACT.item(el); };
  ACT.evolve = (el) => { const it = S.items.find((i) => i.id === el.dataset.id); const e = L.evolve(S, it); if (e) return toast(e); U.snd('levelup'); save(); render(); ACT.item(el); toast(it.name + ' evolved!'); };
  ACT.sell = (el) => { const it = S.items.find((i) => i.id === el.dataset.id); L.sellItem(S, it); U.snd('coin'); save(); closeModal(); render(); };

  // ---------- MORE ----------
  function vMore() {
    let h = '<div class="sec">Sponsors</div>';
    h += S.contracts.map((c, i) => { const p = Math.min(c.n, L.contractProgress(S, c)); const done = p >= c.n; return `<div class="card"><div class="row"><div class="sp"><div class="gname" style="font-size:13px">${L.contractText(c)}</div><div class="bar" style="margin:6px 0"><i style="width:${(p / c.n) * 100}%"></i></div><div class="row wrap"><span class="pill">${A.icon('coin', 12)} ${c.rew.gold}</span><span class="pill">${A.icon('fame', 12)} ${c.rew.fame}</span>${c.rew.item ? `<span class="pill" style="background:${D.RAR[c.rew.item.rar].c}">${D.RAR[c.rew.item.rar].n} item</span>` : ''}<span class="tiny muted">${p}/${c.n}</span></div></div><button class="btn sm ${done ? 'green pulse' : 'off'}" data-a="claim" data-i="${i}">Claim</button></div></div>`; }).join('');
    h += `<div class="sec">Trophies ${Object.keys(S.trophies || {}).length}/${D.TROPHIES.length}</div><div class="card">${shelf(false)}<div class="tiny muted" style="margin-top:6px">Tap a trophy for details.</div></div>`;
    h += '<div class="sec">Factions</div>' + Object.keys(D.FACTIONS).map((id) => { const F = D.FACTIONS[id]; const r = L.facRep(S, id); const t = L.facTier(S, id); return `<div class="card"><div class="row"><span class="sbadge" style="background:${F.c};width:26px;height:26px">${A.icon('laurel', 15)}</span><b class="h" style="font-size:13px">${F.n}</b><span class="sp"></span><span class="tag">${r}/100</span></div><div class="bar" style="margin:6px 0"><i style="width:${r}%;background:${F.c}"></i></div><div class="tiny muted" style="opacity:1">${F.want}</div>${F.perks.map((pk, i) => `<div class="tiny" style="${i < t ? 'font-weight:900' : 'opacity:.5'}">${i < t ? '&#10003;' : '&#9675;'} ${[25, 50, 75, 100][i]}: ${pk}</div>`).join('')}</div>`; }).join('');
    const slots = Math.round(L.bfx(S, 'hall').v);
    h += `<div class="sec">Hall of Legends</div><div class="card"><div class="muted" style="opacity:1">${(S.legends || []).length} legends. ${slots} statue slot${slots === 1 ? '' : 's'} (build the Hall). Each active legend: +1.5% training for all and +3% for their best stat.</div><button class="btn sm ghost" style="margin-top:6px" data-a="legends">Open hall</button></div>`;
    h += `<div class="sec">New ludus</div><div class="card"><div class="muted" style="opacity:1">Laurels: <b>${S.laurels}</b>. Reach the Imperial Games (1800 fame) or win them, then found a new ludus: you keep laurels, perks and legends, and start over faster.</div><div class="row wrap" style="margin-top:6px"><button class="btn sm" data-a="perks">Laurel perks</button><button class="btn sm red ${L.canAscend(S) ? '' : 'off'}" data-a="ascend">Found new ludus (+${L.laurelsFor(S)})</button></div></div>`;
    h += `<div class="sec">Records</div><div class="card"><div class="kv"><span>Fights</span><b>${S.stats.fights}</b></div><div class="kv"><span>Wins / Losses</span><b>${S.stats.wins} / ${S.stats.losses}</b></div><div class="kv"><span>Tournaments won</span><b>${S.stats.tourneys}</b></div><div class="kv"><span>Mercies shown</span><b>${S.stats.spares}</b></div><div class="kv"><span>Weeks run</span><b>${S.stats.weeks}</b></div></div>`;
    h += `<div class="sec">Settings</div><div class="card"><div class="row wrap"><button class="btn sm ghost" data-a="sound">Sound: ${S.sound === false ? 'OFF' : 'ON'}</button><button class="btn sm ghost" data-a="how">How to play</button><button class="btn sm ghost" data-a="export">Export save</button><button class="btn sm ghost" data-a="import">Import save</button><button class="btn sm red" data-a="reset">Reset</button></div></div>`;
    return h;
  }
  ACT.claim = (el) => { const c = L.claimContract(S, +el.dataset.i); if (!c) return; U.snd('coin'); save(); render(); toast(`Sponsor paid ${c.rew.gold} gold, ${c.rew.fame} fame!`); };
  ACT.legends = () => {
    const slots = Math.round(L.bfx(S, 'hall').v);
    modal('<h2>Hall of Legends</h2>' + ((S.legends || []).length ? S.legends.map((l, i) => `<div class="itm" style="cursor:default;${i < slots ? '' : 'opacity:.5'}"><div style="width:44px;height:52px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${A.glad({ style: l.style, skin: l.skin, hair: l.hair, plume: l.plume, tunic: '#f6b82d', gear: {}, size: 46 })}</div><div class="sp"><div class="gname" style="font-size:13px">${esc(l.name)} ${esc(l.nick || '')}</div><div class="muted" style="opacity:1">Lv ${l.lvl} · ${l.w}W ${l.l}L · best ${D.SN[l.best]}</div></div><span class="tag ${i < slots ? 'green' : 'grey'}">${i < slots ? 'Active' : 'No slot'}</span></div>`).join('') : '<div class="empty" style="color:var(--ink)">Retire a level 8+ gladiator to create a legend.</div>'));
  };
  ACT.perks = () => {
    modal(`<h2>Laurel perks</h2><div class="muted" style="margin-bottom:8px">You have <b>${S.laurels}</b> laurels. Perks last across all your ludi.</div>` + D.PERKS.map((p) => { const lv = S.perks[p.id] || 0; return `<div class="itm" style="cursor:default"><div class="sp"><div class="gname" style="font-size:13px">${p.n} <span class="tag">${lv}/${p.max}</span></div><div class="muted" style="opacity:1">${p.d} per level</div></div><button class="btn sm ${lv >= p.max || S.laurels < L.perkCost(S, p) ? 'off' : ''}" data-a="buyperk" data-v="${p.id}">${A.icon('laurel', 14)}${L.perkCost(S, p)}</button></div>`; }).join(''));
  };
  ACT.buyperk = (el) => { const e = L.buyPerk(S, el.dataset.v); if (e) return toast(e); save(); ACT.perks(); render(); };
  ACT.ascend = () => {
    if (!confirm(`Found a new ludus? You get ${L.laurelsFor(S)} laurels and keep perks and legends. Everything else resets.`)) return;
    S = L.ascend(S); U.setS(S); S.glads.push(U.starter()); save(); ui.tab = 'ludus'; render(); toast('A new ludus rises!');
  };
  ACT.sound = () => { S.sound = S.sound === false; save(); render(); };
  ACT.export = () => { const c = L.exportCode(S); modal(`<h2>Save code</h2><div class="muted">Copy this to back up or move your ludus.</div><textarea readonly style="width:100%;height:140px;margin-top:8px;font-size:11px;border:3px solid var(--ink);border-radius:10px;user-select:text;-webkit-user-select:text">${c}</textarea>`); };
  ACT.import = () => { const t = prompt('Paste a save code'); if (!t) return; const N = L.importCode(t); if (!N) return toast('That code did not work'); S = N; U.setS(S); save(); render(); toast('Save loaded'); };
  ACT.reset = () => { if (!confirm('Delete your ludus and start over?')) return; if (!confirm('Really? This cannot be undone.')) return; L.wipe(); S = null; U.setS(null); intro(); };
  ACT.how = () => {
    modal(`<h2>How to play</h2><div class="col small" style="font-weight:600;line-height:1.35">
<div><b>1. Plan the week.</b> In Fighters, give every gladiator an activity: train a stat, rest, spar or take odd jobs. It repeats each week.</div>
<div><b>2. Build your fighter.</b> Gear with on-hit effects and sets, a Keystone rune plus two minors, masteries at levels 5/10/15/20, techniques that fire on their own, and ultimates that you trigger.</div>
<div><b>3. Scout the Arena.</b> Matches are announced weeks ahead. A Scout Tower reveals more about rivals and shows more weeks ahead. Style matchups give a small edge only.</div>
<div><b>4. Fight live.</b> Gladiators move, strike and cast on their own in the arena. You tap your <b>ultimates</b> (knock-ups, hookshots, tornadoes...) at the right moment and tap an enemy to focus it. Before each fight pick an <b>augment</b> (Silver, Gold or Prismatic).</div>
<div><b>5. Grow.</b> Win gold, fame, loot, runes and <b>relics</b>. Upgrade buildings (neighbours add synergy), merge gear, bet on mispriced fights, try the Pit of Trials, then found a new ludus for laurels.</div></div>`);
  };

  // ---------- INTRO ----------
  U.starter = () => { const g = L.makeGlad({ id: S.nextId++, lvl: 1, q: 0.7 }); g.act = 'str'; return g; };
  function intro() {
    ui.tab = 'ludus'; renderHud(); $('#hud').innerHTML = ''; $('#tabs').innerHTML = '';
    main().innerHTML = `<div style="text-align:center;padding:18px 4px"><div class="big win" style="font-size:46px">Ludus<br>Maximus</div><div style="margin:8px 0 14px;color:var(--cream2)">Build a gladiator school. Scout your rivals. Counter-pick. Rule the sand.</div><div style="margin:14px auto;width:210px">${A.glad({ style: 'murmillo', tunic: '#d2412b', plume: '#f6b82d', mood: 'fight', size: 150, gear: {} })}</div><div class="card" style="text-align:left"><h3>Name your ludus</h3><input id="nm" maxlength="22" value="${esc(ui.introName || 'Ludus ' + D.FIRST[Math.floor(Math.random() * 28)])}" style="width:100%;font:900 18px var(--font);padding:8px;border:3px solid var(--ink);border-radius:10px;text-transform:uppercase"><h3 style="margin-top:10px">Banner color</h3><div class="row wrap">${D.COLORS.map((c, i) => `<div data-a="icolor" data-v="${i}" style="width:44px;height:44px;border-radius:50%;background:${c.c};border:4px solid ${ui.introColor === i ? '#f6b82d' : 'var(--ink)'};box-shadow:0 3px 0 var(--ink);cursor:pointer"></div>`).join('')}</div></div><button class="btn full red" style="font-size:18px;padding:14px" data-a="inext">Choose first fighter</button></div>`;
  }
  U.intro = intro;
  ACT.icolor = (el) => { ui.introName = $('#nm').value; ui.introColor = +el.dataset.v; intro(); };
  ACT.inext = () => {
    ui.introName = $('#nm').value.trim() || 'Ludus Maximus'; ui.cands = ui.cands || D.STYLE_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 3).map((s) => L.makeGlad({ id: 1, style: s, lvl: 1, q: 0.7 }));
    main().innerHTML = `<div class="sec">Your first gladiator</div><div class="muted" style="color:var(--cream2);margin-bottom:10px">Pick a style. You can retrain later and recruit more.</div>` + ui.cands.map((g, i) => `<div class="card gcard" data-a="ipick" data-i="${i}"><div class="row" style="align-items:flex-start"><div class="spr">${A.gladOf(g, { tunic: D.COLORS[ui.introColor].c })}</div><div class="sp"><div class="row"><div class="gname sp">${esc(g.name)} ${esc(g.nick)}</div>${A.styleIcon(g.style, 26)}</div><div class="small"><b>${D.STYLES[g.style].n}</b> (${D.STYLES[g.style].role}): ${D.STYLES[g.style].d}</div><div class="small"><b>${D.TRAITS[g.trait].n}:</b> ${D.TRAITS[g.trait].d}</div><div class="pips">${stars(L.stars(g))}</div></div></div><div class="stats">${D.STATS.map((s) => statChip(g, s)).join('')}</div><button class="btn full">Choose ${esc(g.name)}</button></div>`).join('');
  };
  ACT.ipick = (el) => {
    const g = ui.cands[+el.dataset.i]; S = L.newGame({ name: ui.introName, color: ui.introColor }); U.setS(S);
    g.id = S.nextId++; g.act = 'str'; S.glads.push(g); ui.cands = null; save(); render();
    ACT.how(); S.flags.tutor = true; S.flags.tips = { ludus: 1 };
  };

  // ---------- first-time coach tips ----------
  const TIPS = {
    ludus: 'Tap a building to upgrade it. Buildings next to ones they like get a +synergy bonus. Then open Fighters.',
    glads: 'Give each fighter a weekly activity: train a stat, rest, spar or work. It repeats every week. Tap a fighter for runes, ultimates and gear.',
    arena: 'Matches are announced ahead. Scout opponents, tap Enter on a duel, then press GAMES DAY at the top. Try the Pit of Trials too.',
    armory: 'Equip items from here, upgrade them at the Forge, merge three into one better, and equip Relics for ludus-wide bonuses.',
    more: 'Sponsors pay for goals. The Hall of Legends and laurel perks power your long-term growth.',
  };
  U.tip = (key) => {
    if (!S || !TIPS[key]) return; S.flags.tips = S.flags.tips || {}; if (S.flags.tips[key] || modalEl().className.includes('on') || document.getElementById('fight')) return;
    S.flags.tips[key] = 1; save(); let t = $('#tip'); if (!t) { t = document.createElement('div'); t.id = 'tip'; $('#app').appendChild(t); }
    t.innerHTML = `<b>Tip</b> ${TIPS[key]}<button class="btn sm" data-a="tipx">Got it</button>`; t.className = 'on';
  };
  ACT.tipx = () => { const t = $('#tip'); if (t) t.className = ''; };

  // ---------- routing ----------
  ACT.tab = (el) => { ui.tab = el.dataset.v; U.snd('click'); render(); main().scrollTop = 0; const m = main(); m.classList.remove('tabin'); void m.offsetWidth; m.classList.add('tabin'); setTimeout(() => U.tip(ui.tab), 500); };
  ACT.close = () => closeModal();
  ACT.res = (el) => { const r = U.res; U.res = null; closeModal(); if (r) r(el.dataset.v); };
  function render() {
    if (!S) return;
    const sc = main().scrollTop; renderHud();
    const V = { ludus: vLudus, glads: vGlads, arena: vArena, armory: vArmory, more: vMore };
    main().innerHTML = V[ui.tab](); main().scrollTop = sc;
  }
  U.render = render;

  function boot() {
    document.addEventListener('click', (e) => {
      if (e.target === modalEl() && ui.dismiss) return closeModal();
      const el = e.target.closest('[data-a]'); if (!el) return;
      const f = ACT[el.dataset.a]; if (f) { try { f(el, e); } catch (err) { console.error(err); toast('Oops: ' + err.message); } }
    });
    document.addEventListener('keydown', (e) => { if (!S || e.target.tagName === 'INPUT') return; const m = { 1: 'ludus', 2: 'glads', 3: 'arena', 4: 'armory', 5: 'more' }[e.key]; if (m) { ui.tab = m; render(); } if ((e.key === ' ' || e.key === 'Enter') && !document.getElementById('fight') && modalEl().className === '') { ACT.next(); e.preventDefault(); } if (e.key === 'Escape') closeModal(); });
    S = L.load(); U.setS(S);
    if (S) { render(); setTimeout(() => U.tip('ludus'), 800); } else intro();
  }
  U.boot = boot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
