// MAZEKEEP UI layer. Builds and manages every DOM screen (title, biome select,
// meta shop, codex, settings, in-run HUD + palette + omen panel + wave control,
// card draft overlay, results) and keeps them in sync with TD.G each frame.
// Game systems live in engine.js; this file only reads state and calls engine
// methods in response to clicks.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const DATA = TD.DATA, E = () => TD.engine;

  // tiny DOM helper
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') n.className = props[k];
      else if (k === 'html') n.innerHTML = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
      else if (k === 'style' && typeof props[k] === 'object') Object.assign(n.style, props[k]);
      else if (props[k] == null || props[k] === false) continue; // skip absent attrs (e.g. disabled:null) — setAttribute would stringify to "null" and still apply
      else n.setAttribute(k, props[k]);
    }
    if (kids) for (const c of [].concat(kids)) if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }
  const RARITY_COLOR = { common: '#94a3b8', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24' };
  const click = () => { if (TD.audio) TD.audio.play('uiClick'); };

  const U = {
    root: null, screens: {}, meta: null, canvas: null,
    speed: 1, current: 'title', lastPhase: null, cardOpen: false, resultOpen: false,
  };

  function init(canvas) {
    U.canvas = canvas;
    U.meta = E().loadMeta();
    U.root = document.getElementById('app');
    buildAll();
    showScreen('title');
  }

  function buildAll() {
    U.root.innerHTML = '';
    U.screens.title = buildTitle();
    U.screens.biome = buildBiome();
    U.screens.meta = buildMeta();
    U.screens.codex = buildCodex();
    U.screens.settings = buildSettings();
    U.screens.game = buildGame();
    for (const k in U.screens) { U.screens[k].classList.add('screen'); U.root.appendChild(U.screens[k]); }
    U.cardOverlay = buildCardOverlay(); U.root.appendChild(U.cardOverlay);
    U.resultOverlay = buildResultOverlay(); U.root.appendChild(U.resultOverlay);
  }

  function showScreen(name) {
    U.current = name;
    for (const k in U.screens) U.screens[k].style.display = (k === name) ? 'flex' : 'none';
    if (name === 'meta') refreshMeta();
    if (name === 'biome') refreshBiome();
    if (name === 'title') refreshTitle();
  }

  // ── Title ──────────────────────────────────────────────────────────────────
  function buildTitle() {
    const continueBtn = el('button', { class: 'btn big', onclick: () => { click(); doContinue(); } }, 'Continue Run');
    U._continueBtn = continueBtn;
    const wrap = el('div', { class: 'menu' }, [
      el('div', { class: 'logo' }, [
        el('h1', { class: 'title-main', text: 'MAZEKEEP' }),
        el('div', { class: 'title-sub', text: 'a tower-defense roguelite' }),
      ]),
      el('div', { class: 'menu-btns' }, [
        el('button', { class: 'btn big primary', onclick: () => { click(); showScreen('biome'); } }, '▶ New Run'),
        continueBtn,
        el('button', { class: 'btn big', onclick: () => { click(); showScreen('meta'); } }, '✦ Upgrades'),
        el('button', { class: 'btn big', onclick: () => { click(); showScreen('codex'); } }, '📖 Codex'),
        el('button', { class: 'btn big', onclick: () => { click(); showScreen('settings'); } }, '⚙ Settings'),
      ]),
      el('div', { class: 'shard-count', id: 'title-shards' }),
      el('div', { class: 'hint', text: 'Build a maze. Bend the path. Take dark omens for greater rewards.' }),
    ]);
    return el('div', {}, [wrap]);
  }
  function refreshTitle() {
    U._continueBtn.style.display = E().hasSavedRun() ? '' : 'none';
    const s = document.getElementById('title-shards');
    if (s) s.innerHTML = `◈ <b>${U.meta.shards}</b> Shards &nbsp;·&nbsp; Best Wave ${U.meta.stats.bestWave} &nbsp;·&nbsp; ${U.meta.stats.wins} wins`;
  }

  // ── Biome select ─────────────────────────────────────────────────────────
  function buildBiome() {
    const grid = el('div', { class: 'biome-grid', id: 'biome-grid' });
    return el('div', { class: 'menu wide' }, [
      el('button', { class: 'btn back', onclick: () => { click(); showScreen('title'); } }, '← Back'),
      el('h2', { text: 'Choose your battleground' }),
      grid,
    ]);
  }
  function refreshBiome() {
    const grid = document.getElementById('biome-grid'); grid.innerHTML = '';
    const mp = E().deriveMeta(U.meta);
    for (const b of DATA.BIOMES) {
      const unlocked = !!mp.unlocked[b.id];
      const card = el('div', { class: 'biome-card' + (unlocked ? '' : ' locked'), onclick: () => { if (!unlocked) { if (TD.audio) TD.audio.play('error'); return; } click(); startRun(b.id); } }, [
        el('div', { class: 'biome-name', text: b.name, style: { color: b.theme.accent } }),
        miniMap(b),
        el('div', { class: 'biome-desc', text: b.desc }),
        el('div', { class: 'biome-passive', text: b.passiveDesc || '' }),
        unlocked ? null : el('div', { class: 'lock-tag', text: '🔒 Unlock in Upgrades' }),
      ]);
      grid.appendChild(card);
    }
  }
  function miniMap(b) {
    const wrap = el('div', { class: 'minimap' });
    const rows = b.layout.length, cols = Math.max.apply(null, b.layout.map((l) => l.length));
    wrap.style.gridTemplateColumns = `repeat(${cols},1fr)`;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const ch = (b.layout[y][x] || '.');
      const c = ch === '#' ? b.theme.rock : ch === 'S' ? '#f87171' : ch === 'C' ? b.theme.accent : b.theme.grid;
      wrap.appendChild(el('div', { class: 'mm-cell', style: { background: c } }));
    }
    return wrap;
  }

  // ── Meta shop ──────────────────────────────────────────────────────────────
  function buildMeta() {
    return el('div', { class: 'menu wide' }, [
      el('button', { class: 'btn back', onclick: () => { click(); showScreen('title'); } }, '← Back'),
      el('h2', { text: '✦ Permanent Upgrades' }),
      el('div', { class: 'shard-count big', id: 'meta-shards' }),
      el('div', { class: 'meta-grid', id: 'meta-grid' }),
      el('button', { class: 'btn danger small', onclick: () => { click(); if (confirm('Erase ALL progress (shards, unlocks, stats, saved run)?')) { U.meta = E().defaultMeta(); E().saveMeta(U.meta); E().clearRun(); refreshMeta(); } } }, 'Reset all progress'),
    ]);
  }
  function refreshMeta() {
    document.getElementById('meta-shards').innerHTML = `◈ <b>${U.meta.shards}</b> Shards available`;
    const grid = document.getElementById('meta-grid'); grid.innerHTML = '';
    for (const m of DATA.META_UPGRADES) {
      const lvl = U.meta.unlocks[m.id] || 0;
      const maxed = lvl >= m.max;
      const cost = m.cost * (lvl + 1);
      const afford = U.meta.shards >= cost;
      const btn = el('button', { class: 'btn small ' + (maxed ? 'done' : afford ? 'primary' : ''), disabled: maxed || !afford ? 'true' : null,
        onclick: () => { if (maxed || !afford) return; click(); U.meta.shards -= cost; U.meta.unlocks[m.id] = lvl + 1; E().saveMeta(U.meta); refreshMeta(); } },
        maxed ? 'MAX' : `Buy · ◈${cost}`);
      grid.appendChild(el('div', { class: 'meta-card' + (maxed ? ' maxed' : '') }, [
        el('div', { class: 'meta-name', text: m.name }),
        el('div', { class: 'meta-desc', text: m.desc }),
        el('div', { class: 'meta-foot' }, [ el('span', { class: 'meta-lvl', text: `Lv ${lvl}/${m.max}` }), btn ]),
      ]));
    }
  }

  // ── Codex ────────────────────────────────────────────────────────────────
  function buildCodex() {
    const body = el('div', { class: 'codex-body' });
    body.appendChild(section('How to play', [
      'Place towers to build a MAZE — grounded enemies path around them, so a longer maze means more time in your kill-zone. You can never fully wall off the exit.',
      'Press SEND WAVE when ready. Earn gold from kills, plus interest on your savings between waves.',
      'After each wave, draft a roguelite UPGRADE. They stack all run and chase synergies.',
      'Before a wave you may invoke OMENS: they make enemies nastier but pay out far more gold, cards or shards. Higher risk, higher reward.',
      'Lose a life when an enemy reaches the core. Hit 0 and the run ends — but you keep Shards to spend on permanent upgrades.',
    ].map((t) => el('p', { text: t }))));
    body.appendChild(section('Towers', DATA.TOWERS.map((t) => entry(t.glyph, t.name, `◈${t.cost} — ${t.desc}`, t.color))));
    body.appendChild(section('Foes', Object.values(DATA.ENEMIES).map((e) => entry(e.glyph, e.name, traitText(e), e.color))));
    body.appendChild(section('Credits', [
      el('p', { html: 'Fonts: <b>Press Start 2P</b> and <b>Silkscreen</b> — SIL Open Font License (OFL), bundled in assets/fonts/.' }),
      el('p', { text: 'Everything else — art, music and sound — is generated procedurally in the browser (canvas + WebAudio).' }),
    ]));
    return el('div', { class: 'menu wide' }, [
      el('button', { class: 'btn back', onclick: () => { click(); showScreen('title'); } }, '← Back'),
      el('h2', { text: '📖 Codex' }), body,
    ]);
    function section(title, items) { return el('div', { class: 'codex-section' }, [el('h3', { text: title })].concat(items)); }
    function entry(glyph, name, desc, color) { return el('div', { class: 'codex-entry' }, [ el('span', { class: 'codex-glyph', text: glyph, style: { color } }), el('div', {}, [ el('b', { text: name }), el('div', { class: 'codex-desc', text: desc }) ]) ]); }
    function traitText(e) { const bits = [`${e.hp} HP`, `spd ${e.speed}`]; if (e.armor) bits.push(`${e.armor} armor`); if (e.shield) bits.push(`${e.shield} shield`); if (e.flying) bits.push('flying'); if (e.traits) bits.push.apply(bits, e.traits); return bits.join(' · '); }
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function buildSettings() {
    const a = TD.audio;
    const sfxBtn = el('button', { class: 'btn small', onclick: () => { click(); a.setSfxEnabled(!a.isSfxEnabled()); sfxBtn.textContent = 'SFX: ' + (a.isSfxEnabled() ? 'On' : 'Off'); } }, 'SFX: ' + (a.isSfxEnabled() ? 'On' : 'Off'));
    const musBtn = el('button', { class: 'btn small', onclick: () => { click(); const on = !a.isMusicEnabled(); a.setMusicEnabled(on); musBtn.textContent = 'Music: ' + (on ? 'On' : 'Off'); if (on && TD.G) a.startMusic(TD.G.biome.musicTheme); } }, 'Music: ' + (a.isMusicEnabled() ? 'On' : 'Off'));
    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(0.7) });
    vol.addEventListener('input', () => a.setMasterVolume(parseFloat(vol.value)));
    return el('div', { class: 'menu' }, [
      el('button', { class: 'btn back', onclick: () => { click(); showScreen('title'); } }, '← Back'),
      el('h2', { text: '⚙ Settings' }),
      el('div', { class: 'settings-row' }, [el('span', { text: 'Sound effects' }), sfxBtn]),
      el('div', { class: 'settings-row' }, [el('span', { text: 'Music' }), musBtn]),
      el('div', { class: 'settings-row' }, [el('span', { text: 'Master volume' }), vol]),
      el('div', { class: 'hint', text: 'Progress saves automatically. Your run resumes from the last build phase.' }),
    ]);
  }

  // ── In-run game screen ───────────────────────────────────────────────────
  function buildGame() {
    const canvasWrap = el('div', { class: 'canvas-wrap' }, [U.canvas]);
    const top = el('div', { class: 'topbar' }, [
      el('div', { class: 'stat', id: 'stat-lives', html: '♥ <b>0</b>' }),
      el('div', { class: 'stat', id: 'stat-gold', html: '◈ <b>0</b>' }),
      el('div', { class: 'stat', id: 'stat-wave', html: 'Wave <b>1</b>' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn tiny', id: 'btn-speed', onclick: () => { click(); cycleSpeed(); } }, '▶ 1x'),
      el('button', { class: 'btn tiny', id: 'btn-mute', onclick: () => { click(); const on = !TD.audio.isSfxEnabled(); TD.audio.setSfxEnabled(on); TD.audio.setMusicEnabled(on); if (on && TD.G) TD.audio.startMusic(TD.G.biome.musicTheme); else TD.audio.stopMusic(); document.getElementById('btn-mute').textContent = on ? '🔊' : '🔇'; } }, '🔊'),
      el('button', { class: 'btn tiny', onclick: () => { click(); pauseToMenu(); } }, '☰ Menu'),
    ]);
    const palette = el('div', { class: 'palette', id: 'palette' });
    const info = el('div', { class: 'tower-info', id: 'tower-info' });
    const omens = el('div', { class: 'omen-panel', id: 'omen-panel' });
    const wavebox = el('div', { class: 'wave-box', id: 'wave-box' });
    const sidebar = el('div', { class: 'sidebar' }, [palette, info, omens, wavebox]);
    return el('div', { class: 'game-screen' }, [top, el('div', { class: 'play-area' }, [canvasWrap, sidebar])]);
  }

  function buildPalette() {
    const pal = document.getElementById('palette'); if (!pal) return; pal.innerHTML = '';
    for (const t of DATA.TOWERS) {
      const btn = el('button', { class: 'tower-btn', 'data-id': t.id, title: t.desc,
        onclick: () => { click(); TD.G.selectedTower = t.id; TD.G.selectedTile = null; buildPalette(); refreshInfo(); } }, [
        el('span', { class: 'tw-glyph', text: t.glyph, style: { color: t.color } }),
        el('span', { class: 'tw-name', text: t.name }),
        el('span', { class: 'tw-cost', text: '◈' + t.cost }),
      ]);
      pal.appendChild(btn);
    }
  }

  function refreshInfo() {
    const G = TD.G; const box = document.getElementById('tower-info'); if (!box) return;
    box.innerHTML = '';
    if (G.selectedTile) {
      const i = E().tileIndex(G.selectedTile.x, G.selectedTile.y);
      const t = G.towers[i];
      if (t) {
        const canUp = t.tier < 2;
        const upCost = E().upgradeCost(t);
        const refund = Math.round(t.spent * G.mp.sellRate);
        box.appendChild(el('div', { class: 'ti-title', html: `${t.def.glyph} ${t.def.name} <span class="ti-tier">Lv ${t.tier + 1}</span>` }));
        const stats = [];
        if (t.def.attacks) { stats.push(`DMG ${Math.round(t.dmg)}`); stats.push(`RNG ${t.range.toFixed(1)}`); stats.push(`RATE ${t.rate.toFixed(2)}/s`); if (t.splash > 0) stats.push(`SPL ${t.splash.toFixed(1)}`); }
        else stats.push(t.def.desc);
        box.appendChild(el('div', { class: 'ti-stats', text: stats.join('  ·  ') }));
        const row = el('div', { class: 'ti-btns' }, [
          el('button', { class: 'btn small ' + (canUp && G.gold >= upCost ? 'primary' : ''), disabled: canUp ? null : 'true', onclick: () => { E().upgradeTower(t.x, t.y); refreshInfo(); } }, canUp ? `Upgrade ◈${upCost}` : 'Max level'),
          el('button', { class: 'btn small', onclick: () => { E().sellTower(t.x, t.y); G.selectedTile = null; refreshInfo(); } }, `Sell ◈${refund}`),
        ]);
        box.appendChild(row);
        return;
      }
    }
    const d = E().towerDef(G.selectedTower);
    box.appendChild(el('div', { class: 'ti-title', html: `${d.glyph} ${d.name}` }));
    box.appendChild(el('div', { class: 'ti-stats', text: d.desc }));
    box.appendChild(el('div', { class: 'ti-hint', text: 'Click an empty tile to build. Click a tower to upgrade or sell.' }));
  }

  function buildOmenPanel() {
    const G = TD.G; const box = document.getElementById('omen-panel'); if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'panel-head', html: `🜏 Omens <span class="dim">(${G.selectedOmens.length}/${G.omenSlots})</span>` }));
    const list = el('div', { class: 'omen-list' });
    for (const o of DATA.OMENS) {
      const sel = G.selectedOmens.indexOf(o.id) >= 0;
      const chip = el('button', { class: 'omen-chip risk' + o.risk + (sel ? ' sel' : ''), title: o.desc,
        onclick: () => { E().toggleOmen(o.id); buildOmenPanel(); refreshWaveBox(); } }, [
        el('span', { class: 'omen-ico', text: o.icon }),
        el('span', { class: 'omen-name', text: o.name }),
        el('span', { class: 'omen-risk', text: '★'.repeat(o.risk) }),
      ]);
      list.appendChild(chip);
    }
    box.appendChild(list);
  }

  function refreshWaveBox() {
    const G = TD.G; const box = document.getElementById('wave-box'); if (!box) return;
    box.innerHTML = '';
    if (G.phase === 'build') {
      const pv = E().previewWave(G.wave);
      const isBoss = !!pv.boss;
      const head = el('div', { class: 'wave-head', html: `Incoming · Wave ${G.wave}${isBoss ? ' <span class="boss-tag">BOSS</span>' : ''}` });
      const comp = el('div', { class: 'wave-comp' });
      const entries = Object.entries(pv.counts).sort((a, b) => b[1] - a[1]);
      for (const [id, n] of entries) { const def = DATA.ENEMIES[id]; if (!def) continue; comp.appendChild(el('span', { class: 'wc', style: { color: def.color }, title: def.name }, `${def.glyph}×${n}`)); }
      if (pv.boss) comp.appendChild(el('span', { class: 'wc boss', style: { color: pv.boss.color }, title: pv.boss.name }, `${pv.boss.glyph} ${pv.boss.name}`));
      box.appendChild(head); box.appendChild(comp);
      box.appendChild(el('button', { class: 'btn big primary send', onclick: () => { click(); E().startWave(); refreshWaveBox(); buildOmenPanel(); } }, '⚔ SEND WAVE'));
    } else {
      const remaining = G.spawnQueue.length - G.spawnIdx + G.enemies.length;
      box.appendChild(el('div', { class: 'wave-head', html: `Wave ${G.wave} in progress` }));
      box.appendChild(el('div', { class: 'wave-comp', html: `<span class="dim">${G.enemies.length} on field · ${Math.max(0, G.spawnQueue.length - G.spawnIdx)} to spawn</span>` }));
      box.appendChild(el('div', { class: 'build-hint', text: 'Keep building during the wave!' }));
    }
  }

  // ── Card draft overlay ─────────────────────────────────────────────────────
  function buildCardOverlay() {
    return el('div', { class: 'overlay', id: 'card-overlay', style: { display: 'none' } }, [
      el('div', { class: 'overlay-inner' }, [
        el('h2', { class: 'draft-title', id: 'draft-title', text: 'Choose an Upgrade' }),
        el('div', { class: 'card-row', id: 'card-row' }),
        el('div', { class: 'draft-foot', id: 'draft-foot' }),
      ]),
    ]);
  }
  function syncCardOverlay() {
    const G = TD.G;
    const want = G && G.phase === 'reward' && G.pendingCards && G.pendingCards.length;
    const ov = document.getElementById('card-overlay');
    if (want && !U.cardOpen) { U.cardOpen = true; ov.style.display = 'flex'; }
    if (!want && U.cardOpen) { U.cardOpen = false; ov.style.display = 'none'; return; }
    if (!want) return;
    const row = document.getElementById('card-row'); row.innerHTML = '';
    document.getElementById('draft-title').textContent = G.pendingCardCount > 1 ? `Choose an Upgrade (${G.pendingCardCount} picks left)` : 'Choose an Upgrade';
    for (const c of G.pendingCards) {
      const col = RARITY_COLOR[c.rarity];
      row.appendChild(el('div', { class: 'up-card r-' + c.rarity, style: { borderColor: col, '--rc': col },
        onclick: () => { E().pickCard(c); syncCardOverlay(); rebuildSidebar(); } }, [
        el('div', { class: 'up-rarity', text: c.rarity, style: { color: col } }),
        el('div', { class: 'up-name', text: c.name }),
        el('div', { class: 'up-desc', text: c.desc }),
      ]));
    }
    const foot = document.getElementById('draft-foot'); foot.innerHTML = '';
    if (G.rerollsLeft > 0) foot.appendChild(el('button', { class: 'btn small', onclick: () => { E().rerollCards(); syncCardOverlay(); } }, `↻ Reroll (${G.rerollsLeft})`));
    foot.appendChild(el('span', { class: 'dim owned-note', text: `Owned upgrades: ${G.ownedCards.length}` }));
  }

  // ── Result overlay ─────────────────────────────────────────────────────────
  function buildResultOverlay() {
    return el('div', { class: 'overlay', id: 'result-overlay', style: { display: 'none' } }, [
      el('div', { class: 'overlay-inner result', id: 'result-inner' }),
    ]);
  }
  function syncResult() {
    const G = TD.G;
    const want = G && G.phase === 'lost';
    const ov = document.getElementById('result-overlay');
    if (want && !U.resultOpen) {
      U.resultOpen = true; ov.style.display = 'flex';
      U.meta = E().loadMeta(); // finalize() already saved
      const inner = document.getElementById('result-inner'); inner.innerHTML = '';
      const won = G.result === 'won';
      inner.appendChild(el('h2', { class: won ? 'res-win' : 'res-lose', text: won ? '✦ CORE DEFENDED ✦' : 'THE CORE HAS FALLEN' }));
      inner.appendChild(el('div', { class: 'res-stats' }, [
        stat('Waves cleared', G.stats.wavesCleared),
        stat('Enemies slain', G.stats.kills),
        stat('Bosses felled', G.stats.bossKills),
        stat('Omens braved', G.stats.omensTaken),
        stat('Score', G.score),
      ]));
      inner.appendChild(el('div', { class: 'res-shards', html: `◈ <b>+${G.awardedShards}</b> Shards earned` }));
      inner.appendChild(el('div', { class: 'res-btns' }, [
        el('button', { class: 'btn big primary', onclick: () => { click(); U.resultOpen = false; ov.style.display = 'none'; showScreen('biome'); } }, '▶ New Run'),
        el('button', { class: 'btn big', onclick: () => { click(); U.resultOpen = false; ov.style.display = 'none'; showScreen('meta'); } }, '✦ Spend Shards'),
        el('button', { class: 'btn big', onclick: () => { click(); U.resultOpen = false; ov.style.display = 'none'; showScreen('title'); } }, '⌂ Title'),
      ]));
    }
    if (!want && U.resultOpen) { U.resultOpen = false; ov.style.display = 'none'; }
    function stat(label, val) { return el('div', { class: 'rs' }, [el('div', { class: 'rs-val', text: String(val) }), el('div', { class: 'rs-lbl', text: label })]); }
  }

  // ── Run control ────────────────────────────────────────────────────────────
  function startRun(biomeId) {
    E().newRun(biomeId, U.meta);
    enterGame();
  }
  function doContinue() {
    if (!E().hasSavedRun()) return;
    const g = E().loadRun(U.meta);
    if (g) enterGame();
  }
  function enterGame() {
    TD.render.attach(U.canvas); TD.render.resize();
    showScreen('game');
    buildPalette(); rebuildSidebar();
    U.lastPhase = null; U.cardOpen = false; U.resultOpen = false;
    if (TD.audio) { TD.audio.init(); TD.audio.startMusic(TD.G.biome.musicTheme); }
  }
  function rebuildSidebar() { buildPalette(); refreshInfo(); buildOmenPanel(); refreshWaveBox(); }
  function pauseToMenu() { if (TD.G) E().saveRun(); if (TD.audio) TD.audio.stopMusic(); showScreen('title'); }
  function cycleSpeed() { U.speed = U.speed === 1 ? 2 : U.speed === 2 ? 3 : 1; document.getElementById('btn-speed').textContent = '▶ ' + U.speed + 'x'; }

  // ── Per-frame refresh (called by main loop) ────────────────────────────────
  function tick() {
    const G = TD.G; if (!G || U.current !== 'game') return;
    document.getElementById('stat-lives').innerHTML = `♥ <b>${Math.max(0, G.lives)}</b>`;
    document.getElementById('stat-gold').innerHTML = `◈ <b>${G.gold}</b>`;
    document.getElementById('stat-wave').innerHTML = `Wave <b>${G.wave}</b>`;
    // palette affordability
    const pal = document.getElementById('palette');
    if (pal) for (const btn of pal.children) { const id = btn.getAttribute('data-id'); btn.classList.toggle('sel', id === G.selectedTower && !G.selectedTile); btn.classList.toggle('poor', G.gold < E().towerCost(id)); }
    // phase transitions
    if (G.phase !== U.lastPhase) {
      if (G.phase === 'wave' || G.phase === 'build') refreshWaveBox();
      if (G.phase === 'build') { buildOmenPanel(); }
      U.lastPhase = G.phase;
    }
    if (G.phase === 'wave') refreshWaveBox();
    syncCardOverlay();
    syncResult();
  }

  TD.ui = { init, tick, showScreen, refreshInfo, rebuildSidebar, get speed() { return U.speed; } };
})();
