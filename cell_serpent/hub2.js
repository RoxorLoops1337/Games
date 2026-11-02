// Cell Serpent hub, part two: the shop, the keepsake collection, the character page, and the little panels
// (sign in, fan fund, fragment swap). It gets everything it needs from main.js through `c`.
import {
  KEEPSAKES, KEEP_TIERS, KEEP_SETS, keepMax, keepCost, keepUp, keepCanUp, keepBonus, KEEP_PRICE, openKeepChest,
  META, metaCost, buyMeta, levelInfo, levelReward, power,
  SIGN_DAYS, claimSign, FUND, fundReady, claimFund, idleAmount, claimIdle, idleRate, ENERGY_MAX, buyEnergy, tickEnergy,
  BOXES, WEAPONS, PETS, openBox, shopLevel, dealsFor, buyDeal, refreshDeals, welcomeReady, claimWelcome, GOLD_PACKS, buyGold, EGG_PRICE, buyEgg,
  upgradeAllKeeps, claimAllFund, claimAllTrophies, exchangeFrags, OUTFITS, outfitAvailable, buyOutfit, wearOutfit, eventInfo, EVENT_MILES, claimEventMile, ensureEvent, EXCHANGE_ITEMS, buyExchange, LIMIT_ITEMS, buyLimit,
  CARD_PRICE, buyCard, cardActive, claimCard, TROPHIES, trophyReady, claimTrophy, weaponExchange, WEAPON_EXCHANGE_PRICE, SKINS, SKIN_NAMES,
} from './sim.js';
import { createAddictUI } from './addict_ui.js';
import { createRetainUI } from './retain_ui.js';
import { nextReward } from './sim.js';

import { ico, iconURL } from './icons.js';
import { seeded, newSeed, armChest, wasHeld, keepDetailHTML } from './gear_fx.js';
const STATICON = { atk: 'speaker', crt: 'note', cdn: 'clock', vit: 'heart', for: 'star', rev: 'mic' };
// a six-axis radar of the core stats, drawn as inline svg
function radar(s) {
  const N = META.length, cx = 80, cy = 78, R = 52, pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
  const ring = f => META.map((_, i) => pt(i, f).map(v => v.toFixed(1)).join(',')).join(' ');
  const val = META.map((d, i) => pt(i, Math.max(0.1, Math.min(1, (s.meta[d.id] || 0) / d.max))).map(v => v.toFixed(1)).join(',')).join(' ');
  const ghost = META.map((d, i) => { const l = s.meta[d.id] || 0; return pt(i, Math.max(0.1, Math.min(1, (Math.min(d.max, l + 1)) / d.max))).map(v => v.toFixed(1)).join(','); }).join(' ');
  const dots = META.map((d, i) => { const p = pt(i, Math.max(0.1, Math.min(1, (s.meta[d.id] || 0) / d.max))); return `<circle class="rdot${(s.meta[d.id] || 0) >= d.max ? ' mx' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`; }).join('');
  const axes = META.map((_, i) => { const p = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; }).join('');
  const labs = META.map((d, i) => { const p = pt(i, 1.32); return `<image href="${iconURL(STATICON[d.id])}" x="${(p[0] - 9).toFixed(1)}" y="${(p[1] - 9).toFixed(1)}" width="18" height="18"/>`; }).join('');
  const hits = META.map((d, i) => { const p = pt(i, 1.32); return `<circle class="rhit" data-id="${d.id}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="15"/>`; }).join('');
  let bb = null, bc = 1e9; for (const d of META) { const l = s.meta[d.id] || 0; if (l >= d.max) continue; const cst = metaCost(d, l); if (cst <= s.beats && cst < bc) { bc = cst; bb = d.id; } }
  const bbp = bb && pt(META.findIndex(d => d.id === bb), 1.32), pulse = bbp ? `<circle class="rbb" cx="${bbp[0].toFixed(1)}" cy="${bbp[1].toFixed(1)}" r="11"/>` : '';
  const lvb = META.map((d, i) => { const p = pt(i, 1.32), l = s.meta[d.id] || 0, mx = l >= d.max; if (!l) return ''; return `<g class="rlv${mx ? ' mx' : ''}"><circle cx="${(p[0] + 9).toFixed(1)}" cy="${(p[1] + 8).toFixed(1)}" r="6.5"/><text x="${(p[0] + 9).toFixed(1)}" y="${(p[1] + 11.2).toFixed(1)}" text-anchor="middle">${mx ? '\u2605' : l}</text></g>`; }).join('');
  return `<svg class="radar" viewBox="-8 0 176 170" role="group" aria-label="Stats, tap an icon to upgrade it"><g class="rg"><polygon points="${ring(1)}"/><polygon points="${ring(0.66)}"/><polygon points="${ring(0.33)}"/>${axes}</g><polygon class="rgh" points="${ghost}"/><polygon class="rv" points="${val}"/>${dots}${pulse}${labs}${lvb}${hits}</svg>`;
}
const STAT_TEXT = { atk: v => `+${Math.round(v * 100)}% Volume`, crit: v => `+${(v * 100).toFixed(1)}% Pitch`, vit: v => `snake ${Math.round(v / 12 * 2)}% slower`, coin: v => `+${Math.round(v * 100)}% Beats`, guard: v => `snake ${Math.round(v * 50)}% slower`, cdn: v => `${(v * 100).toFixed(1)}% quicker Tempo`, speed: v => `+${Math.round(v * 100)}% singing speed` };
// keepsakes the player has already looked at (a separate key, so saves stay untouched); the first visit marks what is owned as seen
const SEEN_KEY = 'cell_serpent_keepseen_v1';
function keepSeen(owned) { try { const raw = localStorage.getItem(SEEN_KEY); if (raw) return new Set(JSON.parse(raw)); const st = new Set(owned); localStorage.setItem(SEEN_KEY, JSON.stringify([...st])); return st; } catch (e) { return new Set(owned); } }
function markSeen(id) { try { const st = keepSeen([]); st.add(id); localStorage.setItem(SEEN_KEY, JSON.stringify([...st])); } catch (e) { /* private mode */ } }
// chest drama: it charges up and rattles with a glow, then the lid flies and the next step runs
function chestGo(ch, fn, fast) { if (!ch) { setTimeout(fn, 0); return; } if (ch.classList.contains('charge') || ch.classList.contains('open')) return; ch.classList.add('charge'); setTimeout(() => { ch.classList.remove('charge'); ch.classList.add('open'); const ring = document.createElement('i'); ring.className = 'chburst'; ch.appendChild(ring); setTimeout(() => { ring.remove(); fn(); }, 460); }, fast ? 260 : 720); }
const kicon = id => `<span class="kemo">${KEEPSAKES.find(k => k.id === id).icon}</span>`;

const fragRar = n => (n >= 12 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0), RAR_COL = ['#9fb4d8', '#4fd8f0', '#b06cff', '#ffb04d'];
// a chest with a separate lid so CSS can lift it
const chestArt = (hue) => `<span class="chest3" style="--hue:${hue || 0}deg"><img class="cb" src="${iconURL('chestBody')}" alt=""><img class="cl" src="${iconURL('chestLid')}" alt=""></span>`;

// each chest tile keeps a seeded roll: the hold glow forecasts it and the open uses the very same roll
const rolls = new WeakMap(), rollOf = el => { let r = rolls.get(el); if (r == null) { r = newSeed(); rolls.set(el, r); } return r; };
const keepTier = (seed, n) => { const sv = { sparkles: 1e9, keeps: Object.fromEntries(KEEPSAKES.map(k => [k.id, { lv: 0, frag: 0 }])) }; const got = openKeepChest(sv, n, seeded(seed)); return got ? got.reduce((m, x) => Math.max(m, KEEPSAKES.find(k => k.id === x.id).tier), 0) : 0; };
const boxTier = (save, id, seed) => { try { const sv = structuredClone(save), b = BOXES.find(q => q.id === id); sv[b.cur] = 1e9; const got = openBox(sv, id, seeded(seed)); return got ? got.reduce((m, x) => Math.max(m, fragRar(x.n)), 0) : 0; } catch (e) { return 0; } };

export function createHub2(c) {
  const { $, tile, icon, curImg, audio } = c;
  const save = () => c.save();
  const armT = (t, tierOf, cols) => { armChest(t, () => { const tier = tierOf(rollOf(t)); return { tier, color: cols && cols[tier] }; }, () => calmMotion()); return t; };
  const now = () => Date.now();
  let gearFilter = 'All';

  // ---- a generic full-screen panel with a close button
  function openPanel(title, build, onClose) {
    $('pTitle').textContent = title; const body = $('pBody'); body.innerHTML = '';
    build(body);
    $('pClose').onclick = () => { audio.play('click'); if (onClose) onClose(); else c.openHub(); };
    c.show('panel');
  }
  const sec = (list, text, color, icn) => { const h = document.createElement('div'); h.className = 'sec'; h.innerHTML = `<span style="${color ? `background:${color}` : ''}">${icn ? ico(icn, 22) : ''}${text}</span>`; list.appendChild(h); };
  const calmMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches || !!save().settings.reduceMotion; } catch (e) { return false; } };
  // a deal was bought: coins burst out of the button and the equipped pet cheers with hearts
  function dealCheer(r) {
    if (!r || calmMotion()) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, root = document.createElement('div'); root.className = 'dealfx'; document.body.appendChild(root);
    const cu = curImg('sparkles');
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('i'); p.className = 'dcoin'; p.innerHTML = i % 3 ? curImg('beats') : cu;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, d = 70 + Math.random() * 110;
      p.style.cssText = `left:${cx}px;top:${cy}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--fall:${60 + Math.random() * 50}px;animation-delay:${i * 18}ms`;
      root.appendChild(p);
    }
    const pet = save().petEquip[0];
    if (pet) {
      const w = document.createElement('div'); w.className = 'dealpet'; w.style.left = Math.min(window.innerWidth - 70, Math.max(10, cx - 30)) + 'px'; w.style.top = Math.max(60, cy - 90) + 'px';
      w.innerHTML = `${icon(pet)}<b>♥</b><b>♥</b><b>♥</b>`; root.appendChild(w);
    }
    setTimeout(() => root.remove(), 1800);
  }
  // loot reveal: rarity glow and shine per item, rays behind the best find, numbers that count up
  const RNAME = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  // a first-time find sends a star from its NEW badge down to the Gear tab, where the keepsake now lives
  const lootStars = (root, items) => {
    const tab = document.querySelector('nav [data-tab="Gear"]') || document.querySelector('[data-tab="Gear"]'); if (!tab) return;
    root.querySelectorAll('.it').forEach((it, i) => {
      if (!items[i] || !items[i].isNew) return;
      setTimeout(() => {
        if (!it.isConnected) return;
        const a = it.getBoundingClientRect(), b = tab.getBoundingClientRect(), st = document.createElement('i'); st.className = 'lnewstar'; st.style.backgroundImage = `url(${iconURL('star')})`;
        st.style.left = (a.right - 14) + 'px'; st.style.top = (a.top - 14) + 'px'; document.body.appendChild(st);
        const tx = b.width ? b.left + b.width / 2 : innerWidth * 11 / 12, ty = b.height ? b.top + b.height / 2 : innerHeight - 34, dx = tx - (a.right - 14) - 14, dy = ty - (a.top - 14) - 14;
        const an = st.animate([{ transform: 'translate(0,0) scale(.4) rotate(0)', opacity: 0 }, { transform: 'translate(0,-26px) scale(1.4) rotate(120deg)', opacity: 1, offset: .25 }, { transform: `translate(${dx}px,${dy}px) scale(.6) rotate(480deg)`, opacity: .9 }], { duration: 900, easing: 'cubic-bezier(.5,0,.8,.6)' });
        an.onfinish = () => { st.remove(); tab.classList.remove('lnewhit'); void tab.offsetWidth; tab.classList.add('lnewhit'); setTimeout(() => tab.classList.remove('lnewhit'), 500); audio.play('counttick', { n: 1 }); };
      }, 700 + i * 140);
    });
  };
  const lootModal = (title, items, back) => {
    $('bTitle').textContent = title;
    const top = items.reduce((m, x) => Math.max(m, x.rar || 0), 0), topItem = items.find(x => (x.rar || 0) === top), calm = calmMotion();
    const grand = items.length > 6 || items.reduce((m, x) => m + x.n, 0) >= 100;
    $('bLoot').className = 'loot lootx' + (grand ? ' grand' : '');
    $('bLoot').innerHTML = (top >= 1 ? `<i class="lrays r${top}" style="--rc:${topItem.color || '#ffd84d'}"></i>` : '') +
      (top >= 1 ? `<div class="lbanner r${top}" style="--rc:${topItem.color || '#ffd84d'}">${topItem.rname || RNAME[top]}!</div>` : '') +
      items.map((x, i) => `<div class="it rar${x.rar || 0}" style="animation-delay:${0.25 + i * 0.14}s;${x.color ? `--rc:${x.color}` : ''}">${x.html}<span class="cnt" data-n="${x.n}">+${calm ? x.n : 0}</span><small>${x.name}</small><u class="shn"></u>${x.isNew ? '<i class="knew lnew">NEW</i>' : ''}</div>`).join('');
    if (!calm) lootStars($('bLoot'), items);
    if (!calm) $('bLoot').querySelectorAll(".it .cnt").forEach((el, i) => {   // count-up, each item after its pop
      const n = +el.dataset.n, t0 = performance.now() + 300 + i * 140, dur = 650 + Math.min(500, n * 4);
      const step = t => { const k = Math.max(0, Math.min(1, (t - t0) / dur)); const v = Math.round(n * (1 - Math.pow(1 - k, 3))); if (v !== +el.dataset.shown && k > 0 && k < 1) { el.dataset.shown = v; audio.play('counttick', { n: k }); } el.textContent = '+' + v; if (k < 1 && el.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step);
    });
    $('bOk').onclick = () => { audio.play('click'); $('bLoot').className = 'loot'; c.resetBoxOk(); c.openHub(back); };
    c.show('boxModal');
    if (top >= 3 && !calm) {   // legendary: a white flash over the reveal and a big chord
      const fl = document.createElement('div'); fl.className = 'legflash'; fl.style.setProperty('--rc', topItem.color || '#ffb04d'); document.body.appendChild(fl);
      setTimeout(() => audio.play('legend'), 120); setTimeout(() => fl.remove(), 900);
    }
  };

  // ---------------------------------------------------------------- Battle side buttons
  function renderSide() {
    const el = $('battleSide'); el.innerHTML = '';
    const s = save(), day = c.dayKey();
    const signReady = s.sign.day !== day, fundReadyAny = FUND.some(f => fundReady(s, f));
    const mk = (emo, name, alert, fn) => { const b = document.createElement('button'); b.className = 'sidebtn'; b.innerHTML = `${alert ? '<i class="alert">!</i>' : ''}<b>${emo}</b>${name}`; b.onclick = () => { audio.unlock(); audio.play('click'); fn(); }; el.appendChild(b); };
    mk('📅', 'Sign in', signReady, openSign);
    mk('🎀', 'Fan Fund', fundReadyAny, openFund);
    mk('🧺', 'Backstage', idleAmount(s, now()) >= 50, openIdle);
    mk('🎪', eventInfo(day).name.split(' ')[0], s.event.earned > 0 && EVENT_MILES.some((m, i) => !s.event.claimed[i] && s.event.earned >= m.at), openEvent);
    mk('👗', 'Wardrobe', false, openWardrobe);
    mk('🏆', 'Trophies', TROPHIES.some(t => trophyReady(s, t)), openTrophies);
    mk('📖', 'Preview', false, openBestiary);
    mk('🎫', 'Pass', cardActive(s, day) && s.card.last !== day, openPass);
    mk('🎡', 'Goals', nextReward(s, day).ready, () => addict.openGoals());
    mk('🔀', 'Swap', false, openSwap);
  }
  function openSign() {
    const s = save(), day = c.dayKey();
    openPanel('SIGN IN', body => {
      const grid = document.createElement('div'); grid.className = 'tiles';
      SIGN_DAYS.forEach((r, i) => {
        const done = i < s.sign.n % 7 || (s.sign.day === day && i === (s.sign.n - 1) % 7), next = !done && i === s.sign.n % 7 && s.sign.day !== day;
        const txt = r.beats ? `${r.beats} ${curImg('beats')}` : r.sparkles ? `${r.sparkles} ${curImg('sparkles')}` : r.eggs ? `${icon('egg')} Egg` : `⚡ ${r.energy}`;
        grid.appendChild(tile({ cls: 't-gold' + (done ? ' done' : ''), ic: i + 1, name: 'Day ' + (i + 1), desc: '', btn: done ? 'GOT IT' : next ? 'CLAIM ' + txt : txt, gold: next, disabled: !next, onclick: () => { if (claimSign(save(), day)) { c.persist(); audio.play('levelup'); c.refreshCur(); openSign(); } } }));
      });
      body.appendChild(grid);
    });
  }
  function openFund() {
    openPanel('FAN CLUB FUND', body => {
      { const b = document.createElement('button'); b.className = 'btn small gold'; b.textContent = 'CLAIM ALL'; b.onclick = () => { if (claimAllFund(save())) { c.persist(); audio.play('levelup'); c.refreshCur(); openFund(); } }; body.appendChild(b); }
      const grid = document.createElement('div'); grid.className = 'tiles';
      for (const f of FUND) {
        const got = save().fund[f.stage], ready = fundReady(save(), f), r = f.reward;
        const txt = r.sparkles ? `${r.sparkles} ${curImg('sparkles')}` : r.eggs ? `${icon('egg')} Egg` : `⚡ ${r.energy}`;
        grid.appendChild(tile({ cls: 't-weapon one', ic: '🎀', name: 'Clear stage ' + f.stage, desc: '', btn: got ? 'GOT IT' : ready ? 'CLAIM ' + txt : txt, gold: ready, disabled: !ready, onclick: () => { if (claimFund(save(), f.stage)) { c.persist(); audio.play('levelup'); c.refreshCur(); openFund(); } } }));
      }
      body.appendChild(grid);
    });
  }
  function openIdle() {
    openPanel('BACKSTAGE CHEST', body => {
      const n = idleAmount(save(), now()), grid = document.createElement('div'); grid.className = 'tiles';
      grid.appendChild(tile({ cls: 't-gold one', ic: '🧺', name: 'Tip jar', chip: `${idleRate(save())} / hour`, desc: 'Fans leave Beats while you are away.', btn: n ? `COLLECT ${n} ${curImg('beats')}` : 'EMPTY', gold: true, disabled: n < 1, onclick: () => { if (claimIdle(save(), now())) { c.persist(); audio.play('levelup'); c.refreshCur(); openIdle(); } } }));
      body.appendChild(grid);
    });
  }
  function openSwap() {
    const s = save();
    openPanel('FRAGMENT SWAP', body => {
      const box = document.createElement('div'); box.className = 'swap';
      const opts = WEAPONS.map(w => `<option value="${w.id}">${w.name} (${s.skills[w.id].frag})</option>`).join('');
      box.innerHTML = `<div class="sub">Three of one become two of another.</div><select id="swFrom">${opts}</select><div class="arrowd">⬇</div><select id="swTo">${opts}</select><button class="btn gold" id="swGo">SWAP</button>`;
      body.appendChild(box);
      $('swTo').selectedIndex = 1;
      const wx = document.createElement('div'); wx.className = 'tiles'; wx.style.marginTop = '14px';
      for (const w of WEAPONS.filter(q => !s.skills[q.id].lv)) wx.appendChild(tile({ cls: 't-weapon tier' + (w.tier || 0), ic: icon(w.id), name: w.name, desc: (s.cleared || 0) < (w.stage || 0) ? 'Clear stage ' + w.stage + ' first' : 'Skip the fragment hunt', btn: WEAPON_EXCHANGE_PRICE + ' ' + curImg('sparkles'), gold: true, disabled: (s.cleared || 0) < (w.stage || 0) || s.sparkles < WEAPON_EXCHANGE_PRICE, onclick: () => { if (weaponExchange(save(), w.id)) { c.persist(); audio.play('levelup'); c.refreshCur(); openSwap(); } } }));
      if (wx.children.length) { const t = document.createElement('div'); t.className = 'sub'; t.textContent = 'Weapon Exchange'; box.appendChild(t); box.appendChild(wx); }
      $('swGo').onclick = () => { if (exchangeFrags(save(), $('swFrom').value, $('swTo').value)) { c.persist(); audio.play('upgrade'); openSwap(); } };
    });
  }

  // ---------------------------------------------------------------- Character (Stats)
  function renderStats() {
    const s = save(), list = $('statList'); list.innerHTML = '';
    const li = levelInfo(s.xp); let nextR = null; for (let l = li.lv + 1; l < li.lv + 12 && !nextR; l++) if (levelReward(l)) nextR = { lv: l, r: levelReward(l) };
    $('heroBox').innerHTML = `<div class="heroname">RoxorLoops &amp; Jasmin</div><div class="heropow"><span class="pwi">${ico('fist', 30)}</span><small>POWER</small><b>${power(s)}</b></div>${radar(s)}`;
    $('lvBar').innerHTML = `<div class="lvrow"><span class="lvbadge">${li.lv}</span><div class="bar"><i style="width:${Math.round((li.cur / li.need) * 100)}%"></i></div></div>` + (nextR ? `<div class="lvnext">Level ${nextR.lv}: ${nextR.r.sparkles} ${curImg('sparkles')}</div>` : '');
    const core = document.createElement('div'); core.className = 'stat3'; list.appendChild(core);
    $('heroBox').querySelector('.radar').addEventListener('click', ev => {   // tap an axis to jump to its upgrade card
      const id = ev.target.dataset && ev.target.dataset.id, cardEl = id && core.querySelector(`.sc[data-id="${id}"]`); if (!cardEl) return;
      audio.play('click'); cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); cardEl.classList.remove('flash'); void cardEl.offsetWidth; cardEl.classList.add('flash');
    });
    META.forEach((d, i) => {
      const lvl = s.meta[d.id] || 0, maxed = lvl >= d.max, cost = metaCost(d, lvl);
      const card = document.createElement('div'); card.className = 'sc' + (maxed ? ' maxed' : ''); card.dataset.id = d.id;
      card.innerHTML = `<div class="sct">${maxed ? 'Max Level' : d.max === 1 ? (lvl ? 'Owned' : 'Not owned') : 'Level ' + lvl}</div><div class="sci">${ico(STATICON[d.id], 40) || ''}</div><div class="spips">${d.max <= 12 && d.max > 1 ? Array.from({ length: d.max }, (_, q) => `<i class="${q < lvl ? 'on' : ''}"></i>`).join('') : ''}</div><div class="scn">${d.name}</div><div class="scd">${d.desc(Math.max(1, maxed ? lvl : lvl + 1))}</div><button class="btn small go" ${maxed || s.beats < cost ? 'disabled' : ''}>${maxed ? '✔' : cost + ' ' + curImg('beats')}</button>`;
      card.querySelector('button').onclick = () => { if (buyMeta(save(), d.id)) { c.persist(); audio.unlock(); audio.play('upgrade'); c.renderHub(); } };
      core.appendChild(card);
    });
    bestBuy(core, s);
  }
  // the cheapest upgrade you can afford right now wears a "BEST BUY" ribbon (a nudge, never a rule)
  function bestBuy(core, s) {
    let pick = null, pc = 1e9;
    for (const d of META) { const l = s.meta[d.id] || 0; if (l >= d.max) continue; const cst = metaCost(d, l); if (cst <= s.beats && cst < pc) { pc = cst; pick = d; } }
    const el = pick && core.querySelector(`.sc[data-id="${pick.id}"]`); if (!el) return;
    el.classList.add('best'); const r = document.createElement('i'); r.className = 'bestrib'; r.textContent = 'BEST BUY'; el.appendChild(r);
  }

  // ---------------------------------------------------------------- Gear (keepsakes)
  function renderGear() {
    const s = save(), box = $('gearBody'); box.innerHTML = '';
    for (const b of document.querySelectorAll('#gearFilters button')) b.classList.toggle('on', b.dataset.f === gearFilter);
    const lvl = k => s.keeps[k.id].lv, frag = k => s.keeps[k.id].frag;
    const seen = keepSeen(KEEPSAKES.filter(k => s.keeps[k.id].lv > 0).map(k => k.id));
    {   // collection summary: how many keepsakes, total levels, sets finished
      const own = KEEPSAKES.filter(k => lvl(k) > 0).length, tot = KEEPSAKES.length, C = 2 * Math.PI * 22, setsDone = KEEP_SETS.filter(st => KEEPSAKES.filter(k => k.set === st.id).every(k => lvl(k) > 0)).length;
      const hd = document.createElement('div'); hd.className = 'colhead';
      hd.innerHTML = `<div class="setring cr"><svg viewBox="0 0 54 54" aria-hidden="true"><circle class="bg" cx="27" cy="27" r="22"/><circle class="fg" cx="27" cy="27" r="22" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - own / tot)).toFixed(1)}"/></svg><b>${own}</b></div><div class="colt"><b>Collection ${own}/${tot}</b><span>${setsDone}/${KEEP_SETS.length} sets complete</span></div><div class="colp"><small>TOTAL LEVELS</small><b>${KEEPSAKES.reduce((m, k) => m + lvl(k), 0)}</b></div>`;
      box.appendChild(hd);
    }
    if (gearFilter === 'Set') {
      for (const set of KEEP_SETS) {
        const members = KEEPSAKES.filter(k => k.set === set.id), have = members.filter(k => lvl(k) > 0).length, full = have === members.length;
        const C = 2 * Math.PI * 30, off = C * (1 - have / members.length);
        const d = document.createElement('div'); d.className = 'setbox setx' + (full ? ' full' : '');
        d.innerHTML = `<div class="setring"><svg viewBox="0 0 72 72" aria-hidden="true"><circle class="bg" cx="36" cy="36" r="30"/><circle class="fg" cx="36" cy="36" r="30" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${have}<small>/${members.length}</small></b></div>` +
          `<div class="setinfo"><div class="setn">${set.name}</div><div class="setm">${members.map(k => `<span class="${lvl(k) ? '' : 'off'}" title="${k.name}">${k.icon}<i>${lvl(k) ? '✔' : ''}</i></span>`).join('')}</div>` +
          `<div class="setb ${full ? 'on' : ''}">${full ? 'ACTIVE: ' : 'Collect all: '}${STAT_TEXT[set.stat](set.val)}</div></div>`;
        d.onclick = () => { audio.play('click'); const first = members.find(k => !lvl(k)) || members[0]; openKeep(first); };
        box.appendChild(d);
      }
    } else {
      for (let t = 3; t >= 0; t--) {
        let items = KEEPSAKES.filter(k => k.tier === t);
        if (gearFilter === 'Owned') items = items.filter(k => lvl(k) > 0);
        if (gearFilter === 'Upgrade') items = items.filter(k => keepCanUp(s, k.id));
        if (!items.length) continue;
        const T = KEEP_TIERS[t]; sec(box, T.name, T.color);
        const grid = document.createElement('div'); grid.className = 'kgrid'; box.appendChild(grid);
        for (const k of items) {
          const cost = lvl(k) >= keepMax(k) ? 0 : keepCost(k, lvl(k)), pct = cost ? Math.min(100, Math.round((frag(k) / cost) * 100)) : 100;
          const b = document.createElement('button'); b.className = 'kcard t' + t + (lvl(k) ? '' : ' off') + (lvl(k) >= keepMax(k) ? ' max' : ''); b.style.setProperty('--tc', T.color);
          b.innerHTML = `${lvl(k) ? `<i class="kstar${lvl(k) > 9 ? ' w' : ''}" style="background-image:url(${iconURL('star')})"><b>${lvl(k)}</b></i>` : ''}<div class="kic">${k.icon}</div><div class="kbar"><i style="width:${pct}%"></i><span>${frag(k)}/${cost || 'max'}</span></div><div class="kname">${k.name}</div>${keepCanUp(s, k.id) ? '<em class="kup">▲</em>' : ''}${lvl(k) && !seen.has(k.id) ? '<i class="knew">NEW</i>' : ''}`;
          b.onclick = () => { audio.play('click'); openKeep(k); };
          grid.appendChild(b);
        }
      }
    }
    { const ready = KEEPSAKES.filter(k => keepCanUp(s, k.id)).length; if (ready) { const b = document.createElement('button'); b.className = 'btn small gold'; b.style.margin = '10px auto'; b.style.display = 'block'; b.textContent = 'LEVEL UP ALL READY (' + ready + ')'; b.onclick = () => { const n = upgradeAllKeeps(save()); if (n) { c.persist(); audio.play('upgrade'); c.renderHub(); } }; box.appendChild(b); } }
    // chests
    sec(box, 'Keepsake Chest', '#c8843a', 'chest');
    const row = document.createElement('div'); row.className = 'tiles'; box.appendChild(row);
    for (const n of [1, 10]) {
      const price = n === 10 ? KEEP_PRICE * 9 : KEEP_PRICE;
      row.appendChild(armT(tile({ cls: 'chestcard t-gold', ic: n === 10 ? ico('gift', 46) : chestArt(30), name: n === 10 ? 'Ten Chests' : 'Keepsake Chest', desc: n === 10 ? 'With a star prize' : 'Backstage finds', btn: price + ' ' + curImg('sparkles'), gold: true, disabled: save().sparkles < price,
        onclick: ev => { const tt = ev.currentTarget.closest('.tile'), ch = tt.querySelector('.chest3'), fast = wasHeld(ev.currentTarget), sd = rollOf(tt); chestGo(ch, () => { rolls.delete(tt); const fresh = new Set(KEEPSAKES.filter(k => !save().keeps[k.id].lv && !save().keeps[k.id].frag).map(k => k.id)); const got = openKeepChest(save(), n, seeded(sd)); if (!got) { if (ch) ch.classList.remove('open'); return; } c.persist(); audio.play('stinger'); c.refreshCur(); lootModal('KEEPSAKES!', got.map(x => { const kk = KEEPSAKES.find(k => k.id === x.id); return { html: kicon(x.id), n: x.n, name: kk.name, rar: kk.tier, color: KEEP_TIERS[kk.tier].color, rname: KEEP_TIERS[kk.tier].name.toUpperCase(), isNew: fresh.has(x.id) }; }), 'Gear'); }, fast); } }), sd => keepTier(sd, n), KEEP_TIERS.map(q => q.color)));
    }
  }
  function openKeep(k) {
    markSeen(k.id);
    const s = save(), a = s.keeps[k.id], T = KEEP_TIERS[k.tier], max = keepMax(k);
    openPanel(k.name.toUpperCase(), body => {
      const d = document.createElement('div'); d.className = 'kdetail'; d.style.setProperty('--tc', T.color);
      const cost = a.lv >= max ? 0 : keepCost(k, a.lv);
      d.innerHTML = `<div class="kbig">${k.icon}</div><div class="ktier">${T.name}</div><div class="klv">${a.lv ? 'Level ' + a.lv + ' / ' + max : 'Not collected yet'}</div>` +
        keepDetailHTML(k, a, max, STAT_TEXT, KEEPSAKES, KEEP_SETS, Object.fromEntries(KEEPSAKES.map(q => [q.id, s.keeps[q.id].lv]))) +
        `<div class="bar"><i style="width:${cost ? Math.min(100, Math.round((a.frag / cost) * 100)) : 100}%"></i></div><div class="sm">${cost ? a.frag + ' / ' + cost : 'Fully polished'}</div>`;
      const b = document.createElement('button'); b.className = 'btn go gold'; b.textContent = a.lv >= max ? 'MAX LEVEL' : a.lv ? 'LEVEL UP' : 'COLLECT'; b.disabled = !keepCanUp(s, k.id);
      b.onclick = () => { if (keepUp(save(), k.id)) { c.persist(); audio.play('upgrade'); openKeep(k); } };
      d.appendChild(b); body.appendChild(d);
    }, () => c.openHub('Gear'));
  }

  // ---------------------------------------------------------------- Shop
  function countdown() { const d = new Date(); const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); const t = Math.floor((next - d) / 1000); const p = n => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`; }
  function renderShop() {
    const s = save(), day = c.dayKey(), list = $('boxList'); list.innerHTML = '';
    {
      const wel = welcomeReady(s), top = BOXES.find(b => b.top), ban = document.createElement('div'); ban.className = 'featban';
      const can = wel || s[top.cur] >= top.price;
      ban.innerHTML = `<div class="fbray"></div>${chestArt(wel ? 0 : 200)}<div class="fbtx"><em>${wel ? 'ONCE ONLY' : 'FEATURED'}</em><b>${wel ? 'Welcome Chest' : top.name}</b><span>${wel ? `${icon('egg')} ×4 ${curImg('sparkles')} 100 ${curImg('beats')} 3000` : 'A star prize inside'}</span></div><button class="btn go gold" ${can ? '' : 'disabled'}>${wel ? 'OPEN' : top.price + ' ' + curImg(top.cur)}</button>`;
      ban.querySelector('button').onclick = () => {
        audio.unlock(); const ch = ban.querySelector('.chest3'), fast = wasHeld(ban.querySelector('button')), sd = rollOf(ban);
        chestGo(ch, () => { rolls.delete(ban);
          if (wel) { if (claimWelcome(save())) { c.persist(); audio.play('levelup'); c.refreshCur(); renderShop(); } return; }
          const got = openBox(save(), top.id, seeded(sd)); if (!got) { ch.classList.remove('open'); return; } c.persist(); audio.play('stinger'); c.refreshCur();
          lootModal(top.name.toUpperCase() + ' OPENED!', got.map(x => ({ html: icon(x.id), n: x.n, name: WEAPONS.find(w => w.id === x.id).name, rar: fragRar(x.n), color: RAR_COL[fragRar(x.n)] })), 'Shop');
        }, fast);
      };
      armT(ban, sd => (wel ? 2 : boxTier(save(), top.id, sd)), RAR_COL);
      list.appendChild(ban);
    }
    sec(list, "Today's Treats", '#e0457a', 'tag');
    const deals = dealsFor(s, day), hotI = deals.reduce((m, d, i) => (!s.shop.bought[i] && d.price && d.off < 100 && (m < 0 || d.off > deals[m].off) ? i : m), -1);
    deals.forEach((d, i) => {
      const bought = s.shop.bought[i];
      const name = d.kind === 'frag' ? WEAPONS.find(w => w.id === d.ref).name : d.kind === 'keep' ? KEEPSAKES.find(k => k.id === d.ref).name : d.kind === 'egg' ? 'Pet Egg' : d.kind === 'energy' ? 'Voice' : d.kind === 'sparkles' ? 'Sparkles' : 'Beats';
      const ic = d.kind === 'frag' ? icon(d.ref) : d.kind === 'keep' ? kicon(d.ref) : d.kind === 'egg' ? icon('egg') : d.kind === 'energy' ? '⚡' : d.kind === 'sparkles' ? curImg('sparkles') : curImg('beats');
      const t = tile({ cls: 't-gold deal', ic: `${ic}<b class="dqty">×${d.n}</b>`, name, desc: '', btn: bought ? 'OBTAINED' : d.price ? d.price + ' ' + curImg('sparkles') : 'FREE', gold: !bought, disabled: bought || s.sparkles < d.price, onclick: ev => { const r = ev.currentTarget.getBoundingClientRect(); if (buyDeal(save(), day, i)) { c.persist(); audio.play('buy'); c.refreshCur(); renderShop(); dealCheer(r); } } });
      if (d.off < 100) { const bd = document.createElement('i'); bd.className = 'dealrib'; bd.innerHTML = `<b>-${d.off}%</b>`; t.appendChild(bd); }
      else { const bd = document.createElement('i'); bd.className = 'dealrib free'; bd.innerHTML = '<b>FREE</b>'; t.appendChild(bd); }
      const ds = t.querySelector('.ds'); if (d.base && !bought) ds.innerHTML = `<s>${d.base}</s> ${curImg('sparkles')}`; else ds.innerHTML = '&nbsp;';
      if (i === hotI) { t.classList.add('hot'); const hb = document.createElement('i'); hb.className = 'hotbadge'; hb.textContent = 'BEST DEAL'; t.appendChild(hb); }
      if (bought) { t.classList.add('done'); const ob = document.createElement('i'); ob.className = 'obt'; ob.textContent = 'GOT IT'; t.appendChild(ob); }
      list.appendChild(t);
    });
    const rr = document.createElement('div'); rr.className = 'refrow'; rr.innerHTML = `<span>New treats in ${countdown()}</span><button class="btn small alt">${s.shop.free ? '5 ' + curImg('sparkles') : 'FREE'} REFRESH</button>`;
    rr.querySelector('button').onclick = () => { if (refreshDeals(save())) { c.persist(); audio.play('click'); c.refreshCur(); renderShop(); } };
    list.appendChild(rr);
    // chests with a shop level
    const sl = shopLevel(s.shop.xp); sec(list, 'Chests', '#c8843a', 'chest');
    const lv = document.createElement('div'); lv.className = 'shoplv'; lv.innerHTML = `<span class="lvbadge s">LV.${sl.lv}</span><div class="bar"><i style="width:${Math.round((sl.cur / sl.need) * 100)}%"></i></div><small>${sl.cur}/${sl.need}</small>`; list.appendChild(lv);
    for (const b of BOXES) {
      const can = s[b.cur] >= b.price;
      list.appendChild(armT(tile({ cls: 'chestcard ' + (b.cur === 'sparkles' ? 't-gold' : 't-weapon') + (b.id === 'spark10' ? ' one' : ''), ic: chestArt(b.cur === 'sparkles' ? 300 : 0), name: b.name, desc: b.desc, btn: b.price + ' ' + curImg(b.cur), gold: b.cur === 'sparkles', disabled: !can,
        onclick: ev => { audio.unlock(); const tt = ev.currentTarget.closest('.tile'), ch = tt.querySelector('.chest3'), fast = wasHeld(ev.currentTarget), sd = rollOf(tt); chestGo(ch, () => { rolls.delete(tt); const got = openBox(save(), b.id, seeded(sd)); if (!got) { ch.classList.remove('open'); return; } c.persist(); audio.play('stinger'); c.refreshCur(); lootModal(b.name.toUpperCase() + ' OPENED!', got.map(x => ({ html: icon(x.id), n: x.n, name: WEAPONS.find(w => w.id === x.id).name, rar: fragRar(x.n), color: RAR_COL[fragRar(x.n)] })), 'Shop'); }, fast); } }), sd => boxTier(save(), b.id, sd), RAR_COL));
    }
    list.appendChild(tile({ cls: 't-gold', ic: icon('egg'), name: 'Pet Egg', desc: 'Warm and wiggly.', btn: EGG_PRICE + ' ' + curImg('sparkles'), gold: true, disabled: s.sparkles < EGG_PRICE, onclick: () => { if (buyEgg(save())) { c.persist(); audio.play('buy'); c.refreshCur(); renderShop(); } } }));
    list.appendChild(tile({ cls: 't-gold', ic: ico('bolt', 44), name: 'Voice ×10', desc: 'A big gulp of tea.', btn: '10 ' + curImg('sparkles'), gold: true, disabled: s.sparkles < 10, onclick: () => { if (buyEnergy(save(), now())) { c.persist(); audio.play('buy'); c.refreshCur(); renderShop(); } } }));
    sec(list, 'Beats Store', '#d09a1c', 'coins');
    for (const p of GOLD_PACKS) {
      const free = !p.price, used = free && s.shop.gold === day;
      list.appendChild(tile({ cls: 't-weapon', ic: curImg('beats'), name: p.name, desc: `${p.beats} Beats`, btn: used ? 'OBTAINED' : free ? 'FREE' : p.price + ' ' + curImg('sparkles'), disabled: used || (!free && s.sparkles < p.price), onclick: () => { if (buyGold(save(), p.id, day)) { c.persist(); audio.play('buy'); c.refreshCur(); renderShop(); } } }));
    }
    shopExtras(list);
  }

  // ---------------------------------------------------------------- extra panels
  // the duo wears the outfit: a hat drawn on canvas (icons.js) placed on each head of the picture; shades sit on the eyes
  const HEADS = [{ x: 26, y: -10, w: 27 }, { x: 71, y: -9, w: 25 }], EYES = [{ x: 28.5, y: 23, w: 24 }, { x: 68, y: 24, w: 21 }];
  function hatsOn(o) {
    const u = iconURL('hat_' + o.id); if (!u) return `<span class="wardhat">${o.hat}</span>`;
    return (o.id === 'sun' ? EYES : HEADS).map((h, i) => `<img class="what" src="${u}" alt="" style="left:${h.x}%;top:${h.y}%;width:${h.w}%;animation-delay:${i * 0.15}s">`).join('');
  }
  const rib = n => `🎀 ${n}`;
  function openWardrobe() {
    const s = save(), day = c.dayKey();
    openPanel('WARDROBE', body => {
      const top = document.createElement('div'); top.className = 'wardtop';
      const worn = OUTFITS.find(o => o.id === s.outfits.worn);
      top.innerHTML = `<div class="wardhero2" style="--oc:${worn ? worn.color : '#ffd84d'}"><i class="wglow"></i><img class="wduo" src="assets/duo_idle.png" alt="">${worn ? hatsOn(worn) : ''}<i class="wped"></i></div><div class="wname">${worn ? worn.name : 'Everyday look'}</div><div class="sub">Ribbons ${rib(s.ribbons)}</div>`;
      body.appendChild(top);
      const grid = document.createElement('div'); grid.className = 'tiles';
      for (const o of OUTFITS) {
        const own = s.outfits.owned[o.id], av = outfitAvailable(o, day), wn = s.outfits.worn === o.id, wname = WEAPONS.find(w => w.id === o.weapon).name;
        grid.appendChild(tile({ cls: 't-gold' + (wn ? ' on-loadout' : ''), ic: iconURL('hat_' + o.id) ? ico('hat_' + o.id, 42) : `<span class="kemo">${o.hat}</span>`, name: o.name, chip: o.event ? EVENT_THEMES_NAME(o.event) : '', desc: `${wname} +${Math.round((o.mul - 1) * 100)}%`, btn: own ? (wn ? 'TAKE OFF' : 'WEAR') : av ? rib(o.price) : 'Event only', gold: !own && av, disabled: !own && (!av || s.ribbons < o.price),
          onclick: () => { const sv = save(); if (own) wearOutfit(sv, wn ? '' : o.id); else if (!buyOutfit(sv, o.id, day)) return; c.persist(); audio.play('buy'); openWardrobe(); } }));
      }
      body.appendChild(grid);
    });
  }
  const EVENT_THEMES_NAME = id => ({ spring: 'Blossom', summer: 'Sunny', autumn: 'Harvest', winter: 'Snowy' })[id];
  function openEvent() {
    const s = save(), day = c.dayKey(); ensureEvent(s, day); const ev = eventInfo(day);
    openPanel(ev.name.toUpperCase(), body => {
      const hd = document.createElement('div'); hd.className = 'sub'; hd.innerHTML = `${ev.blurb}<br><b>${ev.daysLeft} days left</b>  ·  you gathered ${rib(s.event.earned)}  ·  you hold ${rib(s.ribbons)}`; body.appendChild(hd);
      const track = document.createElement('div'); track.className = 'evtrack';
      let seg = 0; EVENT_MILES.forEach((m, i) => { const prev = i ? EVENT_MILES[i - 1].at : 0; seg += Math.max(0, Math.min(1, (s.event.earned - prev) / (m.at - prev))); });
      const nxt = EVENT_MILES.findIndex((m, i) => !s.event.claimed[i] && s.event.earned < m.at);
      track.innerHTML = `<div class="evbar"><i style="width:${Math.round(seg / EVENT_MILES.length * 100)}%"></i></div><div class="evms"></div>`;
      const row = track.querySelector('.evms');
      EVENT_MILES.forEach((m, i) => {
        const got = s.event.claimed[i], ready = !got && s.event.earned >= m.at, r = m.reward;
        const ric = r.eggs ? icon('egg') : r.sparkles ? curImg('sparkles') : r.energy ? '\u26a1' : '\ud83d\udc57';
        const qty = r.eggs ? '' : r.sparkles ? r.sparkles : r.energy ? r.energy : '';
        const n = document.createElement('button'); n.className = 'evm' + (got ? ' got' : ready ? ' ready' : i === nxt ? ' next' : '');
        n.innerHTML = `<span class="evi">${ric}${qty ? `<b>${qty}</b>` : ''}${got ? '<em>\u2714</em>' : ''}</span><span class="evlab">${m.at}</span>`;
        n.disabled = !ready; n.setAttribute('aria-label', m.at + ' ribbons' + (got ? ', claimed' : ready ? ', claim' : ''));
        n.onclick = () => { if (claimEventMile(save(), i, day)) { c.persist(); audio.play('levelup'); c.refreshCur(); openEvent(); } };
        row.appendChild(n);
      });
      body.appendChild(track);
      const grid = document.createElement('div'); grid.className = 'tiles';
      for (const it of EXCHANGE_ITEMS) grid.appendChild(tile({ cls: 't-gold', ic: it.id === 'egg' ? icon('egg') : it.id === 'sparkles' ? curImg('sparkles') : it.id === 'voice' ? '⚡' : '🎒', name: it.name, desc: '', btn: rib(it.price), gold: true, disabled: s.ribbons < it.price, onclick: () => { if (buyExchange(save(), it.id)) { c.persist(); audio.play('buy'); c.refreshCur(); openEvent(); } } }));
      body.appendChild(grid);
    });
  }
  function openTrophies() {
    const s = save();
    openPanel('TROPHY SHELF', body => {
      { const b = document.createElement('button'); b.className = 'btn small gold'; b.textContent = 'CLAIM ALL'; b.onclick = () => { if (claimAllTrophies(save())) { c.persist(); audio.play('levelup'); c.refreshCur(); openTrophies(); } }; body.appendChild(b); }
      const grid = document.createElement('div'); grid.className = 'tiles';
      for (const t of TROPHIES) {
        const got = s.trophies[t.id], ready = trophyReady(s, t), cur = Math.min(t.at, t.get(s)), r = t.reward;
        grid.appendChild(tile({ cls: 't-gold one', ic: got ? '🏆' : '🥉', name: t.name, desc: '', bar: Math.round(cur / t.at * 100), barText: cur + ' / ' + t.at, btn: got ? 'GOT IT' : ready ? 'CLAIM ' + (r.sparkles ? r.sparkles + ' ' + curImg('sparkles') : icon('egg') + ' ×' + r.eggs) : (r.sparkles ? r.sparkles + ' ' + curImg('sparkles') : icon('egg') + ' ×' + r.eggs), gold: ready, disabled: !ready, onclick: () => { if (claimTrophy(save(), t.id)) { c.persist(); audio.play('levelup'); c.refreshCur(); openTrophies(); } } }));
      }
      body.appendChild(grid);
    });
  }
  function openBestiary() {
    const s = save();
    openPanel('PREVIEW', body => {
      const grid = document.createElement('div'); grid.className = 'beasts';
      SKINS.forEach((sk, i) => {
        const seen = (s.cleared || 0) >= i, url = c.bodyURL(sk);
        const d = document.createElement('div'); d.className = 'beast' + (seen ? '' : ' off');
        d.innerHTML = `<div class="bpic">${url ? `<img src="${url}" alt="">` : '?'}</div><div class="bname">${seen ? SKIN_NAMES[i] : '???'}</div><small>Stage ${i + 1}</small>`;
        grid.appendChild(d);
      });
      body.appendChild(grid);
    });
  }
  function openPass() {
    const s = save(), day = c.dayKey(), act = cardActive(s, day);
    openPanel('MONTHLY PASS', body => {
      const grid = document.createElement('div'); grid.className = 'tiles';
      grid.appendChild(tile({ cls: 't-gold one', ic: '🎫', name: 'Fan Club Pass', chip: act ? (s.card.until - day) + ' days left' : 'Not active', desc: '10 Sparkles and 5 Voice every day for 30 days.', btn: act ? (s.card.last === day ? 'COME BACK TOMORROW' : 'COLLECT TODAY') : CARD_PRICE + ' ' + curImg('sparkles'), gold: true, disabled: act ? s.card.last === day : s.sparkles < CARD_PRICE,
        onclick: () => { const sv = save(); if (act ? claimCard(sv, day) : buyCard(sv, day)) { c.persist(); audio.play('levelup'); c.refreshCur(); openPass(); } } }));
      body.appendChild(grid);
    });
  }
  function eventTile() {
    const s = save(), day = c.dayKey(), ev = eventInfo(day);
    return tile({ cls: 't-gold one', ic: '🎪', name: ev.name, chip: ev.daysLeft + ' days left', desc: ev.blurb, btn: 'JOIN THE FUN', gold: true, onclick: () => { audio.play('click'); openEvent(); } });
  }
  function shopExtras(list) {
    const s = save(), day = c.dayKey(), wk = Math.floor(day / 7), bought = s.shop.limit.week === wk ? s.shop.limit.bought : {};
    sec(list, 'Limit Shop');
    for (const it of LIMIT_ITEMS) { const left = it.limit - (bought[it.id] || 0); list.appendChild(tile({ cls: 't-weapon', ic: it.id === 'egg' ? icon('egg') : it.id === 'voice' ? '⚡' : '🎒', name: it.name, chip: left + ' left this week', desc: '', btn: it.price + ' ' + curImg('beats'), disabled: left < 1 || s.beats < it.price, onclick: () => { if (buyLimit(save(), it.id, day)) { c.persist(); audio.play('upgrade'); c.refreshCur(); c.renderHub(); } } })); }
    sec(list, 'Exchange Shop');
    for (const it of EXCHANGE_ITEMS) list.appendChild(tile({ cls: 't-gold', ic: it.id === 'egg' ? icon('egg') : it.id === 'sparkles' ? curImg('sparkles') : it.id === 'voice' ? '⚡' : '🎒', name: it.name, desc: '', btn: rib(it.price), gold: true, disabled: s.ribbons < it.price, onclick: () => { if (buyExchange(save(), it.id)) { c.persist(); audio.play('upgrade'); c.refreshCur(); c.renderHub(); } } }));
    sec(list, 'Pass');
    list.appendChild(tile({ cls: 't-gold one', ic: '🎫', name: 'Fan Club Pass', desc: '30 days of daily gifts', btn: 'LOOK', gold: true, onclick: () => { audio.play('click'); openPass(); } }));
  }
  const addict = createAddictUI(c, openPanel, sec);
  const retain = createRetainUI({ ...c, renderNext: () => addict.renderNext() }, openPanel, sec, () => openTrophies());
  { const gf = $('gearFilters'); if (gf) gf.addEventListener('click', ev => { const b = ev.target.closest && ev.target.closest('button[data-f]'); if (!b) return; audio.play('click'); gearFilter = b.dataset.f; renderGear(); }); }   // the Collection filter chips
  return { addict, retain, eventTile, shopExtras, renderSide, renderStats, renderGear, renderShop, openPanel, openPanelStats: null, setGearFilter: f => { gearFilter = f; }, lootModal };
}
