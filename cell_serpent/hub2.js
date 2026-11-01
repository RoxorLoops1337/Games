// Cell Serpent hub, part two: the shop, the keepsake collection, the character page, and the little panels
// (sign in, fan fund, fragment swap). It gets everything it needs from main.js through `c`.
import {
  KEEPSAKES, KEEP_TIERS, KEEP_SETS, keepMax, keepCost, keepUp, keepCanUp, keepBonus, KEEP_PRICE, openKeepChest,
  META, metaCost, buyMeta, levelInfo, levelReward, power,
  SIGN_DAYS, claimSign, FUND, fundReady, claimFund, idleAmount, claimIdle, idleRate, ENERGY_MAX, buyEnergy, tickEnergy,
  BOXES, WEAPONS, PETS, openBox, shopLevel, dealsFor, buyDeal, refreshDeals, welcomeReady, claimWelcome, GOLD_PACKS, buyGold, EGG_PRICE, buyEgg,
  exchangeFrags,
} from './sim.js';

const STATICON = { atk: '🔊', crt: '🎵', cdn: '⏱️', vit: '❤️', for: '⭐', rev: '🎤' };
const STAT_TEXT = { atk: v => `+${Math.round(v * 100)}% Volume`, crit: v => `+${(v * 100).toFixed(1)}% Pitch`, vit: v => `+${Math.round(v)} Stamina`, coin: v => `+${Math.round(v * 100)}% Beats`, guard: v => `${Math.round(v * 100)}% softer breaches`, cdn: v => `${(v * 100).toFixed(1)}% quicker Tempo`, speed: v => `+${Math.round(v * 100)}% dance speed` };
const kicon = id => `<span class="kemo">${KEEPSAKES.find(k => k.id === id).icon}</span>`;

export function createHub2(c) {
  const { $, tile, icon, curImg, audio } = c;
  const save = () => c.save();
  const now = () => Date.now();
  let gearFilter = 'All';

  // ---- a generic full-screen panel with a close button
  function openPanel(title, build, onClose) {
    $('pTitle').textContent = title; const body = $('pBody'); body.innerHTML = '';
    build(body);
    $('pClose').onclick = () => { audio.play('click'); if (onClose) onClose(); else c.openHub(); };
    c.show('panel');
  }
  const sec = (list, text, color) => { const h = document.createElement('div'); h.className = 'sec'; h.innerHTML = `<span style="${color ? `background:${color}` : ''}">${text}</span>`; list.appendChild(h); };
  const lootModal = (title, items, back) => {
    $('bTitle').textContent = title;
    $('bLoot').innerHTML = items.map((x, i) => `<div class="it" style="animation-delay:${i * 0.1}s">${x.html}<span>+${x.n}</span><small>${x.name}</small></div>`).join('');
    $('bOk').onclick = () => { audio.play('click'); c.resetBoxOk(); c.openHub(back); };
    c.show('boxModal');
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
      $('swGo').onclick = () => { if (exchangeFrags(save(), $('swFrom').value, $('swTo').value)) { c.persist(); audio.play('upgrade'); openSwap(); } };
    });
  }

  // ---------------------------------------------------------------- Character (Stats)
  function renderStats() {
    const s = save(), list = $('statList'); list.innerHTML = '';
    const li = levelInfo(s.xp); let nextR = null; for (let l = li.lv + 1; l < li.lv + 12 && !nextR; l++) if (levelReward(l)) nextR = { lv: l, r: levelReward(l) };
    $('heroBox').innerHTML = `<div class="heroname">RoxorLoops &amp; Jasmin</div><div class="heropow">${power(s)}</div>`;
    $('lvBar').innerHTML = `<div class="lvrow"><span class="lvbadge">${li.lv}</span><div class="bar"><i style="width:${Math.round((li.cur / li.need) * 100)}%"></i></div></div>` + (nextR ? `<div class="lvnext">Level ${nextR.lv}: ${nextR.r.sparkles} ${curImg('sparkles')}</div>` : '');
    const core = document.createElement('div'); core.className = 'stat3'; list.appendChild(core);
    META.forEach((d, i) => {
      const lvl = s.meta[d.id] || 0, maxed = lvl >= d.max, cost = metaCost(d, lvl);
      const card = document.createElement('div'); card.className = 'sc' + (maxed ? ' maxed' : '');
      card.innerHTML = `<div class="sct">${maxed ? 'Max Level' : d.max === 1 ? (lvl ? 'Owned' : 'Not owned') : 'Level ' + lvl}</div><div class="sci">${STATICON[d.id]}</div><div class="scn">${d.name}</div><div class="scd">${d.desc(Math.max(1, maxed ? lvl : lvl + 1))}</div><button class="btn small go" ${maxed || s.beats < cost ? 'disabled' : ''}>${maxed ? '✔' : cost + ' ' + curImg('beats')}</button>`;
      card.querySelector('button').onclick = () => { if (buyMeta(save(), d.id)) { c.persist(); audio.unlock(); audio.play('upgrade'); c.renderHub(); } };
      core.appendChild(card);
    });
  }

  // ---------------------------------------------------------------- Gear (keepsakes)
  function renderGear() {
    const s = save(), box = $('gearBody'); box.innerHTML = '';
    for (const b of document.querySelectorAll('#gearFilters button')) b.classList.toggle('on', b.dataset.f === gearFilter);
    const lvl = k => s.keeps[k.id].lv, frag = k => s.keeps[k.id].frag;
    if (gearFilter === 'Set') {
      for (const set of KEEP_SETS) {
        const members = KEEPSAKES.filter(k => k.set === set.id), have = members.filter(k => lvl(k) > 0).length, full = have === members.length;
        const d = document.createElement('div'); d.className = 'setbox' + (full ? ' full' : '');
        d.innerHTML = `<div class="setn">${set.name} <small>${have}/${members.length}</small></div><div class="setm">${members.map(k => `<span class="${lvl(k) ? '' : 'off'}">${k.icon}</span>`).join('')}</div><div class="setb">${STAT_TEXT[set.stat](set.val)}</div>`;
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
          const b = document.createElement('button'); b.className = 'kcard' + (lvl(k) ? '' : ' off'); b.style.setProperty('--tc', T.color);
          b.innerHTML = `${lvl(k) ? `<i class="kstar">${lvl(k)}</i>` : ''}<div class="kic">${k.icon}</div><div class="kbar"><i style="width:${pct}%"></i><span>${frag(k)}/${cost || 'max'}</span></div><div class="kname">${k.name}</div>${keepCanUp(s, k.id) ? '<em class="kup">▲</em>' : ''}`;
          b.onclick = () => { audio.play('click'); openKeep(k); };
          grid.appendChild(b);
        }
      }
    }
    // chests
    sec(box, 'Keepsake Chest');
    const row = document.createElement('div'); row.className = 'tiles'; box.appendChild(row);
    for (const n of [1, 10]) {
      const price = n === 10 ? KEEP_PRICE * 9 : KEEP_PRICE;
      row.appendChild(tile({ cls: 't-gold', ic: n === 10 ? '🎁' : '🧰', name: n === 10 ? 'Ten Chests' : 'Keepsake Chest', desc: n === 10 ? 'With a star prize' : 'Backstage finds', btn: price + ' ' + curImg('sparkles'), gold: true, disabled: save().sparkles < price,
        onclick: () => { const got = openKeepChest(save(), n); if (!got) return; c.persist(); audio.play('levelup'); c.refreshCur(); lootModal('KEEPSAKES!', got.map(x => ({ html: kicon(x.id), n: x.n, name: KEEPSAKES.find(k => k.id === x.id).name })), 'Gear'); } }));
    }
  }
  function openKeep(k) {
    const s = save(), a = s.keeps[k.id], T = KEEP_TIERS[k.tier], max = keepMax(k);
    openPanel(k.name.toUpperCase(), body => {
      const d = document.createElement('div'); d.className = 'kdetail'; d.style.setProperty('--tc', T.color);
      const cost = a.lv >= max ? 0 : keepCost(k, a.lv);
      d.innerHTML = `<div class="kbig">${k.icon}</div><div class="ktier">${T.name}</div><div class="klv">${a.lv ? 'Level ' + a.lv + ' / ' + max : 'Not collected yet'}</div>` +
        `<div class="kst">${STAT_TEXT[k.stat](k.per * Math.max(1, a.lv))}${a.lv && a.lv < max ? ` <small>next: ${STAT_TEXT[k.stat](k.per * (a.lv + 1))}</small>` : ''}</div>` +
        (k.set ? `<div class="kset">${KEEP_SETS.find(x => x.id === k.set).name} set</div>` : '') +
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
    if (welcomeReady(s) || s.shop.welcome) {
      list.appendChild(tile({ cls: 't-gold one', ic: '🎪', name: 'Welcome Chest', chip: s.shop.welcome ? 'Claimed' : 'Once only', desc: `${icon('egg')} ×4   ${curImg('sparkles')} 100   ${curImg('beats')} 3000`, btn: s.shop.welcome ? 'CLAIMED' : 'OPEN', gold: true, disabled: !!s.shop.welcome, onclick: () => { if (claimWelcome(save())) { c.persist(); audio.play('levelup'); c.refreshCur(); renderShop(); } } }));
    }
    sec(list, "Today's Treats");
    dealsFor(s, day).forEach((d, i) => {
      const bought = s.shop.bought[i];
      const name = d.kind === 'frag' ? WEAPONS.find(w => w.id === d.ref).name : d.kind === 'keep' ? KEEPSAKES.find(k => k.id === d.ref).name : d.kind === 'egg' ? 'Pet Egg' : d.kind === 'energy' ? 'Voice' : d.kind === 'sparkles' ? 'Sparkles' : 'Beats';
      const ic = d.kind === 'frag' ? icon(d.ref) : d.kind === 'keep' ? kicon(d.ref) : d.kind === 'egg' ? icon('egg') : d.kind === 'energy' ? '⚡' : d.kind === 'sparkles' ? curImg('sparkles') : curImg('beats');
      const t = tile({ cls: 't-gold deal', ic, name: `${name} ×${d.n}`, desc: '', btn: bought ? 'OBTAINED' : d.price ? d.price + ' ' + curImg('sparkles') : 'FREE', gold: !bought, disabled: bought || s.sparkles < d.price, onclick: () => { if (buyDeal(save(), day, i)) { c.persist(); audio.play('upgrade'); c.refreshCur(); renderShop(); } } });
      if (d.off < 100) { const bd = document.createElement('i'); bd.className = 'dealbadge'; bd.textContent = d.off + '% off'; t.appendChild(bd); }
      t.querySelector('.ds').remove(); list.appendChild(t);
    });
    const rr = document.createElement('div'); rr.className = 'refrow'; rr.innerHTML = `<span>New treats in ${countdown()}</span><button class="btn small alt">${s.shop.free ? '5 ' + curImg('sparkles') : 'FREE'} REFRESH</button>`;
    rr.querySelector('button').onclick = () => { if (refreshDeals(save())) { c.persist(); audio.play('click'); c.refreshCur(); renderShop(); } };
    list.appendChild(rr);
    // chests with a shop level
    const sl = shopLevel(s.shop.xp); sec(list, 'Chests');
    const lv = document.createElement('div'); lv.className = 'shoplv'; lv.innerHTML = `<span class="lvbadge s">LV.${sl.lv}</span><div class="bar"><i style="width:${Math.round((sl.cur / sl.need) * 100)}%"></i></div><small>${sl.cur}/${sl.need}</small>`; list.appendChild(lv);
    for (const b of BOXES) {
      const can = s[b.cur] >= b.price;
      list.appendChild(tile({ cls: (b.cur === 'sparkles' ? 't-gold' : 't-weapon') + (b.id === 'spark10' ? ' one' : ''), ic: icon(b.cur === 'sparkles' ? 'boxspark' : 'boxbeat'), name: b.name, desc: b.desc, btn: b.price + ' ' + curImg(b.cur), gold: b.cur === 'sparkles', disabled: !can,
        onclick: () => { audio.unlock(); const got = openBox(save(), b.id); if (!got) return; c.persist(); audio.play('levelup'); c.refreshCur(); lootModal(b.name.toUpperCase() + ' OPENED!', got.map(x => ({ html: icon(x.id), n: x.n, name: WEAPONS.find(w => w.id === x.id).name })), 'Shop'); } }));
    }
    list.appendChild(tile({ cls: 't-gold', ic: icon('egg'), name: 'Pet Egg', desc: 'Warm and wiggly.', btn: EGG_PRICE + ' ' + curImg('sparkles'), gold: true, disabled: s.sparkles < EGG_PRICE, onclick: () => { if (buyEgg(save())) { c.persist(); audio.play('upgrade'); c.refreshCur(); renderShop(); } } }));
    list.appendChild(tile({ cls: 't-gold', ic: '⚡', name: 'Voice ×10', desc: 'A big gulp of tea.', btn: '10 ' + curImg('sparkles'), gold: true, disabled: s.sparkles < 10, onclick: () => { if (buyEnergy(save(), now())) { c.persist(); audio.play('upgrade'); c.refreshCur(); renderShop(); } } }));
    sec(list, 'Beats Store');
    for (const p of GOLD_PACKS) {
      const free = !p.price, used = free && s.shop.gold === day;
      list.appendChild(tile({ cls: 't-weapon', ic: curImg('beats'), name: p.name, desc: `${p.beats} Beats`, btn: used ? 'OBTAINED' : free ? 'FREE' : p.price + ' ' + curImg('sparkles'), disabled: used || (!free && s.sparkles < p.price), onclick: () => { if (buyGold(save(), p.id, day)) { c.persist(); audio.play('upgrade'); c.refreshCur(); renderShop(); } } }));
    }
  }

  return { renderSide, renderStats, renderGear, renderShop, openPanel, openPanelStats: null, setGearFilter: f => { gearFilter = f; }, lootModal };
}
