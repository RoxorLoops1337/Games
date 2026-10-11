// Ludus Maximus: week flow, fight screen, results, tournaments.
(function (G) {
  const D = G.LM_D, A = G.LM_ART, L = G.LM, U = G.LMUI; const ACT = U.ACT;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = U.esc, fmt = U.fmt;
  const btn = (label, val, cls) => `<button class="btn full ${cls || ''}" style="margin-top:8px" data-a="res" data-v="${val}">${label}</button>`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STANCES = [['agg', 'Aggressive', '+15% damage, -10% armor', 'red'], ['bal', 'Balanced', 'No changes', ''], ['grd', 'Guarded', '+20% armor, -8% damage', 'blue']];

  ACT.next = async () => {
    const S = U.S(); if (!S || U.busy) return;
    if (!S.glads.length) return U.toast('Recruit a gladiator first');
    U.busy = true; U.snd('click');
    try { await weekFlow(S); } catch (e) { console.error(e); U.toast('Oops: ' + e.message); } finally { U.busy = false; U.save(); U.render(); }
  };

  async function weekFlow(S) {
    const wk = S.week;
    const rep = L.weekTrain(S); U.save(); U.render();
    await U.dialog(trainHtml(S, rep, wk));
    await pickTechs(S);
    for (const key of L.dueKeys(S)) {
      const ev = L.eventByKey(S, key); const en = S.entries[key];
      const gl = en.ids.map((id) => U.gOf(id)).filter(Boolean);
      if (!ev || gl.length !== en.ids.length || gl.some((g) => g.inj > 0)) { L.withdraw(S, key); U.toast('An entry was cancelled: fighter unavailable. Fee refunded.'); continue; }
      await runEvent(S, ev, gl, en);
      U.save(); U.render();
    }
    const fin = L.weekFinish(S); U.save(); U.render();
    await U.dialog(summaryHtml(S, fin, wk));
    await pendingEvent(S);
  }
  U.checkPending = async () => { const S = U.S(); if (S && S.pendingEv && !U.busy) { U.busy = true; try { await pendingEvent(S); } finally { U.busy = false; U.render(); } } };
  async function pendingEvent(S) {
    if (!S.pendingEv) return;
    const E = L.EVENTS[S.pendingEv]; if (!E) { S.pendingEv = null; return; }
    const i = await U.dialog(`<h2>Event</h2><div style="font-size:15px;margin:8px 0">${E.t}</div>` + E.c.map((c, k) => btn(c.l, k, k ? 'ghost' : '')).join(''));
    const msg = L.runEvent(S, +i); U.save(); U.render(); await U.dialog(`<h2>Result</h2><div style="font-size:15px;margin:8px 0">${esc(msg)}</div>` + btn('Okay', 'ok'));
  }
  async function pickTechs(S) {
    for (const g of S.glads) {
      if (!g.pick) continue;
      const t = await U.dialog(`<h2>${esc(g.name)} reached level ${g.lvl}!</h2><div class="muted" style="margin-bottom:8px">Choose a new technique.</div>` + g.pick.map((t) => { const T = D.TECHS[t]; return `<div class="tech"><b>${T.n}</b> <span class="tag">${T.cd}s</span><div>${T.d}</div>${btn('Learn ' + T.n, t)}</div>`; }).join(''));
      L.choosePick(g, t);
    }
  }

  function trainHtml(S, rep, wk) {
    let h = `<h2>Week ${wk} training</h2>`;
    h += rep.lines.map((l) => { const g = U.gOf(l.id); return `<div class="itm" style="cursor:default"><div style="width:40px;height:46px;overflow:hidden;display:flex;align-items:flex-end;justify-content:center">${U.spr(g, { size: 42 })}</div><div class="sp"><div class="gname" style="font-size:12px">${esc(l.name)}</div><div class="small">${esc(l.txt)}</div></div></div>`; }).join('');
    if (rep.menuCost) h += `<div class="small">Kitchen: -${fmt(rep.menuCost)} gold</div>`;
    const due = L.dueKeys(S).length;
    return h + btn(due ? 'To the arena!' : 'Continue', 'ok', 'red');
  }
  function summaryHtml(S, fin, wk) {
    let h = `<h2>Week ${wk} done</h2><div class="kv"><span>Upkeep paid</span><b>-${fmt(fin.upkeep)}</b></div><div class="kv"><span>Market income</span><b>+${fmt(fin.income)}</b></div><div class="kv"><span>Gold now</span><b>${fmt(S.gold)}</b></div>`;
    fin.notes.forEach((n) => { h += `<div class="small" style="margin-top:6px">${esc(n)}</div>`; });
    if (fin.season) h += `<div class="card" style="margin-top:10px;background:var(--gold)"><b class="h">Season ${fin.season} begins!</b><div class="small">Rivals have grown stronger. New prizes, new faces.</div></div>`;
    return h + btn('Continue', 'ok');
  }

  // ---------- running one event ----------
  async function runEvent(S, ev, gl, en) {
    if (ev.kind === 'tourney' || ev.kind === 'grand') return runTourney(S, ev, gl[0]);
    const stance = await prep(S, ev, gl, ev.opps, {});
    const res = await fightScreen(S, gl, ev.opps, stance, { ev });
    const rep = L.settle(S, ev, gl, res);
    await results(S, ev, gl, res, rep);
  }
  async function runTourney(S, ev, g) {
    const T = L.tourneyInit(S, ev, g); let champion = false; let hype = 0; let hpf = 1; let odds = null;
    const names = ev.size === 8 ? ['Quarterfinal', 'Semifinal', 'Final'] : ['Semifinal', 'Final'];
    for (;;) {
      const opp = L.tourneyOpp(T); const name = names[T.round];
      const stance = await prep(S, ev, [g], [opp], { T, name, hpf: T.hpf });
      const res = await fightScreen(S, [g], [opp], stance, { ev, hpf: { [g.id]: T.hpf } });
      hype = Math.max(hype, res.hype); hpf = res.hpf[g.id]; if (odds == null) odds = res.odds;
      const r = L.tourneyAdvance(S, T, res.win);
      if (res.win) {
        if (r.champion) { champion = true; break; }
        T.hpf = Math.min(1, hpf + 0.4 + (g.trait === 'hordearius' ? 0.1 : 0));
        await U.dialog(`<h2>${name} won!</h2><div class="small">${esc(g.name)} advances. Wounds carry over: next round starts at <b>${Math.round(T.hpf * 100)}% HP</b>.</div>` + btn('Next round', 'ok', 'red'));
      } else break;
    }
    const place = L.placeOf(T, champion);
    const res = { win: champion, place, hype, hpf: { [g.id]: hpf }, odds };
    const rep = L.settle(S, ev, [g], res);
    await results(S, ev, [g], res, rep);
  }

  // ---------- prep ----------
  function prep(S, ev, gl, opps, o) {
    const lv = L.scoutLevel(S); const a = L.adv(gl[0].style, opps[0].style);
    const ctx = L.teamCtx(S, gl, 'bal');
    let h = `<h2>${o.name ? o.name + ': ' : ''}${ev.title}</h2>`;
    h += `<div class="row" style="justify-content:space-around;align-items:flex-end"><div style="text-align:center">${gl.map((g) => U.spr(g, { size: 70 })).join('')}<div class="gname" style="font-size:12px">${gl.map((g) => esc(g.name)).join(' & ')}</div></div><div class="h" style="font-size:22px">VS</div><div style="text-align:center">${opps.map((x) => A.gladOf(x, { size: 70, tunic: x.color, flip: true, mood: 'fight' })).join('')}<div class="gname" style="font-size:12px">${opps.map((x) => esc(x.name)).join(' & ')}</div></div></div>`;
    h += `<div class="row wrap" style="justify-content:center;margin:8px 0">${gl.length === 1 && opps.length === 1 ? U.advTag(a) : ''}${opps.map((x) => A.styleIcon(x.style, 22)).join('')}</div>`;
    if (o.hpf != null && o.hpf < 1) h += `<div class="card" style="background:#f7c9c0"><b>Wounded:</b> starting at ${Math.round(o.hpf * 100)}% HP</div>`;
    if (gl.length > 1) h += `<div class="small">Synergy: ${ctx.list.length ? ctx.list.map((s) => `<b>${s.n}</b> (${s.d})`).join(', ') : 'none'}</div>`;
    const low = gl.filter((g) => g.en < 60); if (low.length) h += `<div class="small" style="color:var(--terra)">${low.map((g) => esc(g.name)).join(', ')} ${low.length > 1 ? 'are' : 'is'} tired (energy under 60). Stats reduced.</div>`;
    h += '<div class="sec" style="color:var(--terra);text-shadow:none">Choose a stance and fight</div>';
    h += STANCES.map(([id, n, d, c]) => {
      let odds = ''; if (lv >= 2 && gl.length * opps.length <= 6) odds = `<span class="pill">${Math.round(L.odds(S, gl, opps, id, 30) * 100)}% win</span>`;
      return `<button class="btn full ${c}" style="margin-top:8px;justify-content:space-between" data-a="res" data-v="${id}"><span>${n}<br><span class="tiny" style="text-transform:none;opacity:.85">${d}</span></span>${odds}</button>`;
    }).join('');
    return U.dialog(h).then((v) => v);
  }

  // ---------- fight screen ----------
  const POS = { 1: [[10, 22]], 2: [[3, 30], [18, 8]], 3: [[0, 38], [16, 20], [2, 2]] };
  function fightScreen(S, gl, opps, stance, o) {
    return new Promise((resolve) => {
      const ev = o.ev || {};
      const odds = L.odds(S, gl, opps, stance, 30);
      const ctxA = L.teamCtx(S, gl, stance); const ctxB = L.teamCtx(null, opps, ['agg', 'bal', 'grd'][Math.floor(Math.random() * 3)]);
      const unitsA = L.mkUnits(gl, 'A', ctxA, gl.map((g) => (o.hpf && o.hpf[g.id] != null ? o.hpf[g.id] : 1)));
      const unitsB = L.mkUnits(opps, 'B', ctxB);
      if (L.isRevenge(S, ev)) unitsA.forEach((u) => { u.grudge = true; });
      const F = L.createFight(unitsA, unitsB, { autoA: !!S.flags.auto });
      const root = $('#fightRoot');
      const posA = POS[unitsA.length], posB = POS[unitsB.length];
      const spritesHtml = F.units.map((u) => { const p = (u.side === 'A' ? posA : posB)[u.i]; return `<div class="fs" id="fs-${u.id}" data-a="${u.side === 'B' ? 'ffocus' : ''}" data-id="${u.id}" style="${u.side === 'A' ? 'left' : 'right'}:${p[0]}%;bottom:${p[1]}%;z-index:${10 - Math.floor(p[1] / 10)}"><span class="tgt">TARGET</span>${A.gladOf(u.g, { size: 130, tunic: u.side === 'A' ? U.myColor() : u.g.color || '#3d3b46', flip: u.side === 'B', mood: 'fight' })}</div>`; }).join('');
      const bars = (side) => F.units.filter((u) => u.side === side).map((u) => `<div class="fu" id="fu-${u.id}"><div class="nm">${A.styleIcon(u.style, 16)}<span>${esc(u.name)}</span></div><div class="bar hp"><i id="hp-${u.id}" style="width:100%"></i></div></div>`).join('');
      const ctrl = unitsA.map((u) => `<div class="tr"><div class="who">${esc(u.name)}</div>${u.techs.map((t, k) => `<button class="tb" id="tb-${u.id}-${k}" data-a="ftech" data-u="${u.id}" data-k="${k}"><i></i><span>${D.TECHS[t.id].n}</span></button>`).join('')}</div>`).join('');
      root.innerHTML = `<div id="fight"><div class="inner"><div class="f-top"><div class="side">${bars('A')}</div><div class="h" style="color:#fff;align-self:center;font-size:14px;text-shadow:2px 2px 0 var(--ink)">VS</div><div class="side r">${bars('B')}</div></div><div class="f-stage" id="stage">${A.arenaBG()}${spritesHtml}<div class="f-banner" id="fban"></div></div><div class="f-hype"><i id="hype"></i><span>Crowd hype</span></div><div class="f-log" id="flog">${esc(gl[0].name)} enters the sand.</div><div class="f-ctrl">${ctrl}</div><div class="f-speed"><button class="btn sm on" data-a="fspeed" data-v="1">1x</button><button class="btn sm" data-a="fspeed" data-v="2">2x</button><button class="btn sm" data-a="fspeed" data-v="4">4x</button><button class="btn sm ${F.auto.A ? 'on' : ''}" id="fauto" data-a="fauto">Auto</button><button class="btn sm ghost" data-a="fskip">Skip</button></div></div></div>`;
      U.fight = { F, speed: 1, skip: false };
      const fx = U.fight;
      const el = (id) => $('#' + id);
      const stage = $('#stage');
      const ban = (t) => { const b = $('#fban'); b.textContent = t; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); };
      const logt = (t) => { $('#flog').textContent = t; };
      const nameOf = (id) => (F.units.find((u) => u.id === id) || {}).name;
      function floatAt(id, text, cls) {
        const e = el('fs-' + id); if (!e) return; const f = document.createElement('div'); f.className = 'float ' + (cls || ''); f.textContent = text;
        f.style.left = e.offsetLeft + e.offsetWidth / 2 + (Math.random() * 20 - 10) + 'px'; f.style.top = e.offsetTop + e.offsetHeight * 0.15 + 'px'; stage.appendChild(f); setTimeout(() => f.remove(), 1000);
      }
      const STL = { stun: 'STUNNED', slow: 'SLOWED', blind: 'BLINDED', bleed: 'BLEEDING', guard: 'GUARD', taunt: 'TAUNT', frenzy: 'FRENZY', rally: 'RALLY' };
      function handle(e) {
        const sp = fx.skip;
        if (e.k === 'hit') {
          if (!sp) {
            const a = el('fs-' + e.src); const t = el('fs-' + e.dst); const dir = e.src[0] === 'A' ? 1 : -1;
            if (a && !a.classList.contains('dead')) a.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dir * 30}px) scale(1.06)` }, { transform: 'translateX(0)' }], { duration: 280 / fx.speed });
            if (t) { t.classList.add('hurt'); setTimeout(() => t.classList.remove('hurt'), 120); }
            floatAt(e.dst, (e.crit ? 'CRIT ' : '') + e.dmg, e.crit ? 'crit' : '');
            if (e.save) floatAt(e.dst, e.save + '!', 'tech');
            U.snd(e.crit ? 'crit' : 'hit');
          }
          logt(`${nameOf(e.src)} hits ${nameOf(e.dst)} for ${e.dmg}${e.crit ? ' (CRIT)' : ''}${e.adv > 0 ? ' (style advantage)' : e.adv < 0 ? ' (style disadvantage)' : ''}.`);
        } else if (e.k === 'miss') { if (!sp) floatAt(e.dst, 'MISS', 'miss'); logt(`${nameOf(e.src)} misses ${nameOf(e.dst)}.`); }
        else if (e.k === 'tech') { if (!sp) { floatAt(e.src, D.TECHS[e.tech].n + '!', 'tech'); U.snd('tech'); } logt(`${nameOf(e.src)} uses ${D.TECHS[e.tech].n}!`); }
        else if (e.k === 'heal') { if (!sp) floatAt(e.dst, '+' + e.amt, 'heal'); }
        else if (e.k === 'down') { const t = el('fs-' + e.dst); if (t) t.classList.add('dead'); const f = el('fu-' + e.dst); if (f) f.classList.add('dead'); logt(`${nameOf(e.dst)} is down!`); }
        else if (e.k === 'status') { if (!sp && STL[e.st]) floatAt(e.dst, STL[e.st], 'st'); }
        else if (e.k === 'resist') { if (!sp) floatAt(e.dst, 'RESIST', 'st'); }
        else if (e.k === 'bleed') { if (!sp) floatAt(e.dst, '-' + e.dmg, 'miss'); }
        else if (e.k === 'thorn') { if (!sp) floatAt(e.dst, e.dmg + ' thorns', 'miss'); }
        else if (e.k === 'roar') { if (!sp) { ban('Crowd roars!'); U.snd('roar'); stage.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 }); } logt(e.side === 'A' ? 'The crowd backs YOU!' : 'The crowd backs the underdog!'); }
      }
      function paint() {
        F.units.forEach((u) => {
          const h = el('hp-' + u.id); if (h) h.style.width = (u.hp / u.maxhp) * 100 + '%';
          if (u.side === 'A') u.techs.forEach((t, k) => { const b = el(`tb-${u.id}-${k}`); if (!b) return; const T = D.TECHS[t.id]; b.firstChild.style.height = (t.cd > 0 ? (t.cd / T.cd) * 100 : 0) + '%'; b.classList.toggle('cd', t.cd > 0 || u.down || !!u.s.stun); });
        });
        $('#hype').style.width = Math.min(100, F.hype) + '%';
        F.units.filter((u) => u.side === 'B').forEach((u) => { const e = el('fs-' + u.id); if (e) e.classList.toggle('focus', F.foc.A === u.id); });
      }
      let last = performance.now(); let acc = 0; let finished = false;
      function end() {
        if (finished) return; finished = true;
        const win = F.winner === 'A'; ban(win ? 'Victory!' : 'Defeat'); U.snd(win ? 'win' : 'lose'); paint();
        const hpf = {}; unitsA.forEach((u) => { hpf[u.g.id] = u.hp / u.maxhp; });
        setTimeout(() => { root.innerHTML = ''; U.fight = null; resolve({ win, hype: Math.max(F.peak, F.hype), hpf, odds, F }); }, 1500);
      }
      function frame(now) {
        if (finished) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt * fx.speed;
        if (fx.skip) { let n = 0; while (!F.done && n++ < 4000) L.step(F, 0.1); } else { while (acc >= 0.05 && !F.done) { L.step(F, 0.05); acc -= 0.05; } }
        F.ev.splice(0).forEach(handle); paint();
        if (F.done) { end(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame((t) => { last = t; frame(t); });
    });
  }
  ACT.ftech = (el) => { const fx = U.fight; if (!fx) return; const ok = L.useTech(fx.F, el.dataset.u, +el.dataset.k); if (!ok) U.snd('miss'); };
  ACT.ffocus = (el) => { const fx = U.fight; if (!fx) return; L.focus(fx.F, 'A', el.dataset.id); U.snd('click'); };
  ACT.fspeed = (el) => { const fx = U.fight; if (!fx) return; fx.speed = +el.dataset.v; document.querySelectorAll('.f-speed [data-a=fspeed]').forEach((b) => b.classList.toggle('on', b === el)); };
  ACT.fauto = (el) => { const fx = U.fight; if (!fx) return; fx.F.auto.A = !fx.F.auto.A; U.S().flags.auto = fx.F.auto.A; el.classList.toggle('on', fx.F.auto.A); };
  ACT.fskip = () => { const fx = U.fight; if (fx) fx.skip = true; };

  // ---------- results ----------
  async function results(S, ev, gl, res, rep) {
    const win = res.win;
    const isT = ev.kind === 'tourney' || ev.kind === 'grand';
    const place = res.place; const ord = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 || n === 4 ? 'Semifinalist' : 'Out early');
    let h = isT ? `<div class="big ${win ? 'win' : 'lose'}">${win ? 'CHAMPION' : ord(place)}</div>` : `<div class="big ${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</div>`;
    h += `<div class="row" style="justify-content:center;margin:6px 0">${gl.map((g) => U.spr(g, { size: 80, mood: win ? 'idle' : 'idle' })).join('')}</div>`;
    h += `<div class="row wrap" style="justify-content:center"><span class="pill">${A.icon('coin', 14)} +${fmt(rep.gold)}</span><span class="pill">${A.icon('fame', 14)} +${fmt(rep.fame)}</span>${res.odds != null && res.odds < 0.4 && win ? '<span class="tag green">Underdog win!</span>' : ''}</div>`;
    rep.notes.forEach((n) => { h += `<div class="small" style="text-align:center;margin-top:4px">${esc(n)}</div>`; });
    h += '<div style="margin-top:8px">' + rep.xp.map((x) => { const g = U.gOf(x.id); return `<div class="kv"><span>${esc(g.name)}</span><b>+${x.xp} XP${x.up.length ? ' · LEVEL ' + x.up[x.up.length - 1] + '!' : ''}</b></div>`; }).join('') + '</div>';
    rep.inj.forEach((i) => { h += `<div class="small" style="color:var(--terra)">${esc(U.gOf(i.id).name)} is injured for ${i.w} week${i.w > 1 ? 's' : ''}.</div>`; });
    rep.loot.forEach((it) => { h += `<div class="itm" style="cursor:default;margin-top:6px">${A.itemIcon(it.slot, it.rar, 38)}<div class="sp"><div class="gname" style="font-size:12px">${esc(it.name)}</div>${U.rarTag(it.rar)}<div class="muted" style="opacity:1">${U.fmtSt(it)}</div></div><span class="tag green">Loot!</span></div>`; });
    U.snd(win ? 'win' : 'lose');
    if (win && ev.kind === 'duel') {
      h += `<div class="sec" style="color:var(--terra);text-shadow:none">The crowd waits. Your call.</div><button class="btn full green" data-a="res" data-v="mercy">Show mercy <span class="tiny" style="text-transform:none">more fame, 30% they join you</span></button><button class="btn full ghost" style="margin-top:8px" data-a="res" data-v="show">Showboat <span class="tiny" style="text-transform:none">extra gold</span></button>`;
      const c = await U.dialog(h);
      const m = L.mercy(S, ev, rep, c);
      if (m.joined) await U.dialog(`<h2>A new recruit!</h2><div class="row" style="justify-content:center">${U.spr(m.joined, { size: 100 })}</div><div style="text-align:center;margin:8px 0"><b>${esc(m.joined.name)}</b> (${D.STYLES[m.joined.style].n}, Lv ${m.joined.lvl}) was moved by your mercy and joins your ludus!</div>` + btn('Welcome!', 'ok', 'green'));
      else if (c === 'mercy') U.toast(`The crowd loves it. +${m.f} fame.`);
      else U.toast(`+${m.gd} gold from the crowd.`);
    } else await U.dialog(h + btn('Continue', 'ok', win ? 'red' : ''));
    if (rep.choice) {
      const id = await U.dialog(`<h2>Champion's loot</h2><div class="muted" style="margin-bottom:8px">Choose one prize from the Emperor's gift table.</div>` + rep.choice.map((it) => `<div class="itm" data-a="res" data-v="${it.id}">${A.itemIcon(it.slot, it.rar, 40)}<div class="sp"><div class="gname" style="font-size:12px">${esc(it.name)}</div>${U.rarTag(it.rar)}<div class="muted" style="opacity:1">${U.fmtSt(it)}</div>${U.affTxt(it)}</div></div>`).join(''));
      const it = rep.choice.find((x) => x.id === id) || rep.choice[0]; L.addItem(S, it);
    }
    await pickTechs(S);
  }

  U.afterBoot = () => { U.checkPending(); };
  U.boot();
  U.afterBoot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
