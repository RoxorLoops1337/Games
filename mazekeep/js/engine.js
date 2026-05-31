// MAZEKEEP simulation engine. Owns the run state (TD.G) and every system:
// grid/maze, flow-field re-pathing, towers, enemies, projectiles, combat &
// status effects, the wave generator, economy, roguelite cards, omens, plus
// save/load + persistent meta-progression. Rendering and DOM/UI live elsewhere
// and only read state + call the methods exposed on TD.engine.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const DATA = TD.DATA;
  const rand = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  const TILE = 44;                 // pixels per tile (canvas space)
  const TIER_DMG = [1, 1.7, 2.9];  // per-upgrade-tier multipliers
  const TIER_RANGE = [1, 1.12, 1.25];
  const TIER_RATE = [1, 1.18, 1.42];
  const MAX_TIER = 2;
  const WIN_WAVE = 20;

  // ── Persistent meta-progression ──────────────────────────────────────────
  const META_KEY = 'mk_meta_v1';
  const RUN_KEY = 'mk_run_v1';

  function defaultMeta() {
    return { shards: 0, unlocks: {}, stats: { runs: 0, bestWave: 0, kills: 0, wins: 0 }, };
  }
  function loadMeta() {
    try { const m = JSON.parse(localStorage.getItem(META_KEY)); if (m && typeof m === 'object') { return Object.assign(defaultMeta(), m); } } catch (e) {}
    return defaultMeta();
  }
  function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }

  // Fold meta unlock levels into run-start parameters.
  function deriveMeta(meta) {
    const lvl = (id) => meta.unlocks[id] || 0;
    const p = { startGold: 120, lives: 20, rerolls: 1, omenSlots: 1, interest: 0.0,
      sellRate: 0.6, startCard: 0, shardGain: 0, unlocked: { meadow: 1, cavern: 1, volcano: 1 } };
    p.startGold += 40 * lvl('gold1');
    p.lives += 3 * lvl('life1');
    p.rerolls += lvl('reroll1');
    p.omenSlots += lvl('omen1');
    p.interest += 0.03 * lvl('interest1');
    p.sellRate += 0.15 * lvl('sell1');
    p.startCard += lvl('startcard');
    p.shardGain += 0.25 * lvl('shardgain');
    if (lvl('unlockvoid')) p.unlocked.void = 1;
    return p;
  }

  // ── Grid construction from a biome layout ──────────────────────────────────
  function buildGrid(biome) {
    const layout = biome.layout;
    const rows = layout.length;
    let cols = 0;
    for (const line of layout) cols = Math.max(cols, line.length);
    const blocked = new Uint8Array(cols * rows);
    const rock = new Uint8Array(cols * rows);
    const spawns = [], cores = [];
    for (let y = 0; y < rows; y++) {
      const line = layout[y];
      for (let x = 0; x < cols; x++) {
        const ch = line[x] || '.';
        const i = y * cols + x;
        if (ch === '#') { blocked[i] = 1; rock[i] = 1; }
        else if (ch === 'S') spawns.push({ x, y });
        else if (ch === 'C') cores.push({ x, y });
      }
    }
    return { cols, rows, blocked, rock, spawns, cores };
  }

  // ── Run lifecycle ──────────────────────────────────────────────────────────
  function newRun(biomeId, meta) {
    const biome = DATA.BIOMES.find((b) => b.id === biomeId) || DATA.BIOMES[0];
    const mp = deriveMeta(meta);
    const grid = buildGrid(biome);
    const passive = biome.passive || {};
    const G = {
      biome, theme: biome.theme, meta, mp, tile: TILE,
      cols: grid.cols, rows: grid.rows, grid,
      towers: {},                 // tileIndex -> tower
      enemies: [], projectiles: [], particles: [], floaters: [], beams: [],
      field: null,
      gold: mp.startGold + (passive.startGold || 0),
      lives: mp.lives + (passive.lives || 0),
      wave: 1, phase: 'build', // build | reward | wave | won | lost
      spawnQueue: [], spawnIdx: 0, waveElapsed: 0, waveDuration: 0,
      ownedCards: [], pendingCards: null, pendingCardCount: 1,
      rerollsLeft: mp.rerolls, rerollsMax: mp.rerolls,
      omenSlots: mp.omenSlots + (passive.extraOmenSlot || 0),
      selectedOmens: [], waveOmens: null,
      mods: null,
      stats: { kills: 0, waveKills: 0, bossKills: 0, omensTaken: 0, wavesCleared: 0 },
      momentum: 0, bloodCounter: 0,
      score: 0, startTime: Date.now(),
      selectedTower: 'arrow', selectedTile: null,
      shardsEarned: 0,
    };
    TD.G = G;
    recomputeMods();
    recomputeField();
    recomputeTowerStats();
    // Optional free starting card from meta.
    if (mp.startCard > 0) { G.pendingCardCount = mp.startCard; G.phase = 'reward'; G.pendingCards = rollCards(G.pendingCardCount); }
    saveRun();
    return G;
  }

  // ── Maze / flow field ──────────────────────────────────────────────────────
  function recomputeField() {
    const G = TD.G;
    G.field = TD.path.computeField(G.grid, G.grid.cores);
  }
  function tileIndex(x, y) { return y * TD.G.cols + x; }
  function inBounds(x, y) { const G = TD.G; return x >= 0 && y >= 0 && x < G.cols && y < G.rows; }

  function canPlace(x, y, towerId) {
    const G = TD.G;
    if (!inBounds(x, y)) return false;
    const i = tileIndex(x, y);
    if (G.grid.rock[i]) return false;
    if (G.towers[i]) return false;
    if (G.grid.spawns.some((s) => s.x === x && s.y === y)) return false;
    if (G.grid.cores.some((c) => c.x === x && c.y === y)) return false;
    const def = towerDef(towerId);
    if (!def) return false;
    if (G.gold < towerCost(towerId)) return false;
    // Blocking towers may not seal the maze shut.
    if (def.blocks && TD.path.wouldBlockPath(G.grid, G.grid.cores, G.grid.spawns, { x, y })) return false;
    return true;
  }
  function towerDef(id) { return DATA.TOWERS.find((t) => t.id === id); }
  function towerCost(id) { const d = towerDef(id); return d ? d.cost : 0; }

  function placeTower(x, y, towerId) {
    const G = TD.G;
    if (!canPlace(x, y, towerId)) return false;
    const def = towerDef(towerId);
    const i = tileIndex(x, y);
    G.gold -= def.cost;
    const t = { id: towerId, def, x, y, tier: 0, cd: 0, angle: -Math.PI / 2, spent: def.cost, targetId: null };
    G.towers[i] = t;
    if (def.blocks) { G.grid.blocked[i] = 1; recomputeField(); nudgeEnemiesOffBlocked(); }
    recomputeTowerStats();
    if (TD.audio) TD.audio.play('place');
    saveRunSoft();
    return true;
  }

  function upgradeCost(t) { return Math.round(t.def.cost * (t.tier + 1) * 0.95); }
  function upgradeTower(x, y) {
    const G = TD.G; const i = tileIndex(x, y); const t = G.towers[i];
    if (!t || t.tier >= MAX_TIER) return false;
    const cost = upgradeCost(t);
    if (G.gold < cost) { if (TD.audio) TD.audio.play('error'); return false; }
    G.gold -= cost; t.tier++; t.spent += cost;
    recomputeTowerStats();
    if (TD.audio) TD.audio.play('upgrade');
    saveRunSoft();
    return true;
  }
  function sellTower(x, y) {
    const G = TD.G; const i = tileIndex(x, y); const t = G.towers[i];
    if (!t) return false;
    const refund = Math.round(t.spent * G.mp.sellRate);
    G.gold += refund;
    delete G.towers[i];
    if (t.def.blocks) { G.grid.blocked[i] = 0; recomputeField(); }
    recomputeTowerStats();
    if (TD.audio) TD.audio.play('sell');
    spawnFloater(x, y, '+' + refund, '#fbbf24');
    saveRunSoft();
    return true;
  }

  // If a freshly blocked tile had enemies on it, shove them to the best
  // adjacent walkable tile so they never get stuck inside a wall.
  function nudgeEnemiesOffBlocked() {
    const G = TD.G;
    for (const e of G.enemies) {
      if (e.flying) continue;
      const tx = Math.round(e.x), ty = Math.round(e.y);
      if (!inBounds(tx, ty)) continue;
      if (!G.grid.blocked[tileIndex(tx, ty)]) continue;
      let best = null, bestD = Infinity;
      for (const d of TD.path.DIRS) {
        const nx = tx + d.dx, ny = ty + d.dy;
        if (!inBounds(nx, ny)) continue;
        const ni = tileIndex(nx, ny);
        if (G.grid.blocked[ni]) continue;
        const dd = G.field.dist[ni];
        if (dd < bestD) { bestD = dd; best = { x: nx, y: ny }; }
      }
      if (best) { e.x = best.x; e.y = best.y; }
    }
  }

  // ── Run-wide modifiers (recomputed from owned cards + meta + biome) ─────────
  function recomputeMods() {
    const G = TD.G;
    const passive = G.biome.passive || {};
    const mods = {
      dmgMul: 1, rangeMul: 1, rateMul: 1, projMul: 1, splashMul: 1,
      slowMul: 1, slowDurMul: 1, dotMul: 1,
      critChance: 0, critMul: 2.0, armorPen: 0,
      goldMul: (passive.goldMul || 1), interest: G.mp.interest, mintMul: 1,
      pierce: 0, chainAdd: 0, flatKillGold: 0,
      enemyHpMul: (passive.enemyHpMul || 1),
      byType: {}, specials: {},
    };
    const MUL = { dmgMul:1, rangeMul:1, rateMul:1, projMul:1, splashMul:1, slowMul:1, slowDurMul:1, dotMul:1, goldMul:1, mintMul:1 };
    for (const card of G.ownedCards) {
      for (const ef of card.effects) {
        if (ef.kind === 'stat') {
          if (ef.type) {
            const bt = (mods.byType[ef.type] = mods.byType[ef.type] || { dmgMul:1, rangeMul:1, rateMul:1 });
            if (ef.mode === 'mul') bt[ef.stat] = (bt[ef.stat] || 1) * ef.value; else bt[ef.stat] = (bt[ef.stat] || 0) + ef.value;
          } else if (ef.mode === 'mul') { mods[ef.stat] = (mods[ef.stat] != null ? mods[ef.stat] : (MUL[ef.stat] != null ? 1 : 0)) * ef.value; }
          else { mods[ef.stat] = (mods[ef.stat] || 0) + ef.value; }
        } else if (ef.kind === 'flag') { mods[ef.flag] = (mods[ef.flag] || 0) + ef.value; }
        else if (ef.kind === 'special') { mods.specials[ef.id] = true; }
      }
    }
    G.mods = mods;
  }

  // Derive each placed tower's effective stats (tier × global mods × pylon auras).
  function recomputeTowerStats() {
    const G = TD.G; const mods = G.mods;
    const towers = Object.values(G.towers);
    // Pylon auras first.
    const pylons = towers.filter((t) => t.def.effect === 'buff');
    for (const t of towers) {
      const d = t.def;
      let dmgMul = 1, rangeMul = 1, rateMul = 1;
      if (d.attacks) {
        for (const p of pylons) {
          if (p === t) continue;
          const r = p.def.range + 0.5;
          if (dist2(t.x, t.y, p.x, p.y) <= r * r) {
            dmgMul *= p.def.fx.dmgMul; rangeMul *= p.def.fx.rangeMul; rateMul *= p.def.fx.rateMul;
          }
        }
      }
      const bt = mods.byType[d.id] || {};
      t.dmg = d.damage * TIER_DMG[t.tier] * mods.dmgMul * (bt.dmgMul || 1) * dmgMul;
      t.range = d.range * TIER_RANGE[t.tier] * mods.rangeMul * (bt.rangeMul || 1) * rangeMul;
      t.rate = d.fireRate * TIER_RATE[t.tier] * mods.rateMul * (bt.rateMul || 1) * rateMul;
      t.splash = d.splash * mods.splashMul;
      t.projSpeed = d.projSpeed * mods.projMul;
      t.buffed = dmgMul > 1;
    }
  }

  // ── Roguelite card draft ─────────────────────────────────────────────────
  const RARITY_WEIGHT = { common: 60, rare: 28, epic: 10, legendary: 3 };
  function rollCards(count, guaranteeRarity) {
    const G = TD.G;
    const ownedIds = new Set(G.ownedCards.filter((c) => c.rarity !== 'common').map((c) => c.id));
    const pool = DATA.UPGRADES.filter((u) => !(ownedIds.has(u.id)));
    const picks = [];
    const order = ['legendary', 'epic', 'rare', 'common'];
    let mustRarity = guaranteeRarity || null;
    for (let n = 0; n < count; n++) {
      let candidates = pool.filter((u) => !picks.includes(u));
      if (mustRarity && n === 0) {
        const idx = order.indexOf(mustRarity);
        const high = candidates.filter((u) => order.indexOf(u.rarity) <= idx);
        if (high.length) candidates = high;
        mustRarity = null;
      }
      if (!candidates.length) break;
      picks.push(weightedPick(candidates));
    }
    return picks;
  }
  function weightedPick(cards) {
    let total = 0; for (const c of cards) total += RARITY_WEIGHT[c.rarity] || 1;
    let r = rand() * total;
    for (const c of cards) { r -= RARITY_WEIGHT[c.rarity] || 1; if (r <= 0) return c; }
    return cards[cards.length - 1];
  }
  function pickCard(card) {
    const G = TD.G;
    if (G.phase !== 'reward' || !card) return;
    G.ownedCards.push(card);
    // One-shot card specials resolved on pick.
    for (const ef of card.effects) if (ef.kind === 'special' && ef.id === 'glassCannon') { G.lives = Math.max(1, G.lives - 2); spawnFloater(nearestCore({ x: G.grid.cores[0].x, y: G.grid.cores[0].y }).x, G.grid.cores[0].y, '-2♥', '#f87171'); }
    recomputeMods();
    recomputeTowerStats();
    if (TD.audio) TD.audio.play('cardPick');
    G.pendingCardCount--;
    if (G.pendingCardCount > 0) { G.pendingCards = rollCards(1); }
    else { G.pendingCards = null; G.phase = 'build'; saveRun(); }
  }
  function rerollCards() {
    const G = TD.G;
    if (G.rerollsLeft <= 0 || G.phase !== 'reward') return false;
    G.rerollsLeft--;
    G.pendingCards = rollCards(G.pendingCards.length);
    if (TD.audio) TD.audio.play('uiClick');
    return true;
  }

  // ── Omens (pre-wave risk/reward) ───────────────────────────────────────────
  function toggleOmen(omenId) {
    const G = TD.G;
    if (G.phase !== 'build') return;
    const idx = G.selectedOmens.indexOf(omenId);
    if (idx >= 0) { G.selectedOmens.splice(idx, 1); if (TD.audio) TD.audio.play('uiClick'); }
    else if (G.selectedOmens.length < G.omenSlots) { G.selectedOmens.push(omenId); if (TD.audio) TD.audio.play('bargain'); }
    else if (TD.audio) TD.audio.play('error');
  }
  function activeOmenObjs() { return TD.G.selectedOmens.map((id) => DATA.OMENS.find((o) => o.id === id)).filter(Boolean); }

  // ── Wave generation ────────────────────────────────────────────────────────
  function previewWave(n) {
    // Lightweight composition summary for the UI (counts by enemy type).
    return composeWave(n, activeOmenObjs(), true);
  }
  function composeWave(n, omens, previewOnly) {
    const G = TD.G;
    const curse = mergeCurse(omens);
    const budget = Math.round(22 + n * 14 + n * n * 1.4);
    const eligible = Object.values(DATA.ENEMIES).filter((e) => (e.minWave || 1) <= n && !e.traits || (e.minWave || 1) <= n);
    const pool = Object.values(DATA.ENEMIES).filter((e) => (e.minWave || 1) <= n);
    const counts = {};
    let spent = 0, guard = 0;
    while (spent < budget && guard++ < 600) {
      const e = pool[(rand() * pool.length) | 0];
      const c = Math.max(2, e.bounty);
      counts[e.id] = (counts[e.id] || 0) + 1;
      spent += c;
    }
    // Omen: count multiplier.
    if (curse.countMul) for (const k in counts) counts[k] = Math.ceil(counts[k] * curse.countMul);
    // Boss wave.
    const boss = DATA.BOSSES[n] || null;
    // Omen: add an elite.
    if (curse.addElite) counts[curse.addElite] = (counts[curse.addElite] || 0) + 1;
    if (previewOnly) return { counts, boss, curse };

    // Build an ordered spawn schedule.
    const list = [];
    for (const id in counts) for (let k = 0; k < counts[id]; k++) list.push(id);
    shuffle(list);
    const gap = clamp(7 / Math.sqrt(list.length + 1), 0.22, 0.7);
    const sched = list.map((id, k) => ({ id, t: 0.5 + k * gap, boss: false }));
    let dur = sched.length ? sched[sched.length - 1].t + 1 : 2;
    if (boss) { sched.push({ id: boss.id, t: dur + 0.6, boss: true }); dur += 2.5; }
    return { sched, dur, curse, boss };
  }
  function mergeCurse(omens) {
    const c = { hpMul: 1, spdMul: 1, countMul: 1, armorAdd: 0, hideHp: false, addElite: null };
    const reward = { goldMul: 1, cardBonus: 0, rerollAdd: 0, shardAdd: 0, flatKillGold: 0, guaranteeRarity: null, lifeAdd: 0 };
    for (const o of omens) {
      const cu = o.curse || {}, re = o.reward || {};
      if (cu.hpMul) c.hpMul *= cu.hpMul;
      if (cu.spdMul) c.spdMul *= cu.spdMul;
      if (cu.countMul) c.countMul *= cu.countMul;
      if (cu.armorAdd) c.armorAdd += cu.armorAdd;
      if (cu.hideHp) c.hideHp = true;
      if (cu.addElite) c.addElite = cu.addElite;
      if (re.goldMul) reward.goldMul *= re.goldMul;
      if (re.cardBonus) reward.cardBonus += re.cardBonus;
      if (re.rerollAdd) reward.rerollAdd += re.rerollAdd;
      if (re.shardAdd) reward.shardAdd += re.shardAdd;
      if (re.flatKillGold) reward.flatKillGold += re.flatKillGold;
      if (re.lifeAdd) reward.lifeAdd += re.lifeAdd;
      if (re.guaranteeRarity) reward.guaranteeRarity = re.guaranteeRarity;
    }
    c.reward = reward;
    return c;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function startWave() {
    const G = TD.G;
    if (G.phase !== 'build') return;
    const omens = activeOmenObjs();
    const w = composeWave(G.wave, omens, false);
    G.waveOmens = w.curse;
    G.spawnQueue = w.sched; G.spawnIdx = 0; G.waveElapsed = 0; G.waveDuration = w.dur;
    G.phase = 'wave';
    G.stats.waveKills = 0; G.momentum = 0; G.bloodCounter = 0;
    G.mods.flatKillGold = (w.curse.reward.flatKillGold || 0);
    if (TD.audio) { TD.audio.play(w.boss ? 'bossWarn' : 'waveStart'); }
    spawnBanner(w.boss ? ('⚠ ' + (w.boss.name) + ' ⚠') : ('WAVE ' + G.wave), w.boss ? '#f87171' : G.theme.accent);
  }

  // ── Enemy spawning ─────────────────────────────────────────────────────────
  function spawnEnemy(id, isBoss, spawnTile) {
    const G = TD.G;
    const base = isBoss ? DATA.BOSSES[G.wave] : DATA.ENEMIES[id];
    const src = isBoss ? base : DATA.ENEMIES[id];
    if (!src) return;
    const curse = G.waveOmens || { hpMul: 1, spdMul: 1, armorAdd: 0 };
    const sp = spawnTile || G.grid.spawns[(rand() * G.grid.spawns.length) | 0];
    const hp = src.hp * curse.hpMul * G.mods.enemyHpMul;
    const e = {
      def: src, x: sp.x, y: sp.y,
      hp, maxHp: hp,
      speed: src.speed * curse.spdMul,
      armor: (src.armor || 0) + (isBoss ? 0 : (curse.armorAdd || 0)),
      shield: src.shield || 0, maxShield: src.shield || 0,
      flying: !!src.flying, size: src.size, color: src.color, glyph: src.glyph,
      bounty: src.bounty, leak: src.leak, traits: src.traits || [],
      isBoss: !!isBoss,
      slow: 0, slowT: 0, burn: null, poison: null,
      regen: src.regen || 0, spawnT: 0, hitFlash: 0, dead: false, phaseT: 0,
    };
    G.enemies.push(e);
    if (isBoss) spawnBanner(src.name + ' has arrived', '#f87171');
  }

  // ── Combat helpers ───────────────────────────────────────────────────────
  function nearestCore(e) {
    const G = TD.G; let best = G.grid.cores[0], bd = Infinity;
    for (const c of G.grid.cores) { const d = dist2(e.x, e.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function progressDist(e) {
    const G = TD.G;
    if (e.flying) { const c = nearestCore(e); return Math.sqrt(dist2(e.x, e.y, c.x, c.y)); }
    const tx = clamp(Math.round(e.x), 0, G.cols - 1), ty = clamp(Math.round(e.y), 0, G.rows - 1);
    const d = G.field.dist[tileIndex(tx, ty)];
    return isFinite(d) ? d : Math.sqrt(dist2(e.x, e.y, nearestCore(e).x, nearestCore(e).y));
  }

  function dealDamage(e, amount, opts) {
    if (e.dead) return;
    const G = TD.G; opts = opts || {};
    let dmg = amount;
    const specials = G.mods.specials;
    if (specials.firstStrike && e.hp / e.maxHp > 0.9) dmg *= 1.6;
    if (specials.absoluteZero && e.slowT > 0) dmg *= 1.25;
    if (specials.momentum && !opts.isDot) dmg *= 1 + 0.01 * G.momentum;
    if (!opts.isDot) {
      const pen = (opts.armorPen || 0) + G.mods.armorPen;
      const eff = Math.max(0, e.armor - pen);
      dmg = Math.max(1, dmg - eff);
      // crit
      const cc = (opts.critChance || 0) + G.mods.critChance + ((e.def && e.def.fx && opts.towerFx && opts.towerFx.crit) || 0);
      if (rand() < cc) { dmg *= G.mods.critMul + ((opts.towerFx && opts.towerFx.critMul ? opts.towerFx.critMul - 2.0 : 0)); opts.crit = true; }
    }
    // phase (wraithlord): 20% dodge
    if (e.traits.indexOf('phase') >= 0 && rand() < 0.2) { spawnFloater(e.x, e.y, 'miss', '#94a3b8'); return; }
    // shield soaks first
    if (e.shield > 0) { const s = Math.min(e.shield, dmg); e.shield -= s; dmg -= s; }
    e.hp -= dmg; e.hitFlash = 0.12;
    if (dmg >= 1) spawnFloater(e.x, e.y - e.size, Math.round(dmg).toString(), opts.crit ? '#fde047' : '#fff', opts.crit);
    if (e.hp <= 0) killEnemy(e, opts);
  }

  function killEnemy(e, opts) {
    const G = TD.G;
    if (e.dead) return; e.dead = true;
    const gold = Math.round(e.bounty * G.mods.goldMul) + (G.mods.flatKillGold || 0);
    G.gold += gold;
    G.stats.kills++; G.stats.waveKills++; G.momentum++; G.bloodCounter++;
    if (e.isBoss) { G.stats.bossKills++; if (TD.audio) TD.audio.play('bossDeath'); spawnExplosion(e.x, e.y, e.color, 40); }
    else if (TD.audio && rand() < 0.5) TD.audio.play('enemyDeath');
    spawnDeath(e);
    // Blood Tithe: heal a life every 12 kills this wave.
    if (G.mods.specials.bloodTithe && G.bloodCounter >= 12) { G.bloodCounter -= 12; G.lives++; spawnFloater(nearestCore(e).x, nearestCore(e).y, '+1♥', '#f87171'); }
    // Overflow: deal overkill to nearest enemy.
    if (G.mods.specials.overflow && opts && opts.overkill > 0) {
      const near = nearestEnemyTo(e.x, e.y, e);
      if (near) dealDamage(near, opts.overkill * 0.5, { isDot: false });
    }
    // Splitter.
    if (e.traits.indexOf('split') >= 0 && e.def.splitInto) {
      for (let k = 0; k < (e.def.splitCount || 2); k++) {
        const child = makeChild(e.def.splitInto, e.x + (rand() - 0.5) * 0.4, e.y + (rand() - 0.5) * 0.4);
        if (child) G.enemies.push(child);
      }
    }
  }
  function makeChild(id, x, y) {
    const src = DATA.ENEMIES[id]; if (!src) return null;
    const G = TD.G;
    const hp = src.hp * G.mods.enemyHpMul;
    return { def: src, x, y, hp, maxHp: hp, speed: src.speed, armor: src.armor || 0,
      shield: 0, maxShield: 0, flying: !!src.flying, size: src.size, color: src.color,
      glyph: src.glyph, bounty: src.bounty, leak: src.leak, traits: src.traits || [],
      isBoss: false, slow: 0, slowT: 0, burn: null, poison: null, regen: 0, spawnT: 0, hitFlash: 0, dead: false };
  }
  function nearestEnemyTo(x, y, exclude) {
    const G = TD.G; let best = null, bd = Infinity;
    for (const e of G.enemies) { if (e === exclude || e.dead) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  function applyEffect(e, def, t) {
    const G = TD.G;
    if (def.effect === 'slow' && e.traits.indexOf('immuneSlow') < 0) {
      const power = clamp(def.fx.slow * G.mods.slowMul, 0, 0.85);
      const dur = def.fx.dur * G.mods.slowDurMul;
      if (power >= e.slow || e.slowT <= 0) { e.slow = power; }
      e.slowT = Math.max(e.slowT, dur);
    } else if (def.effect === 'poison') {
      const dps = def.fx.dps * G.mods.dotMul * TIER_DMG[t.tier];
      e.poison = { dps: (e.poison ? e.poison.dps : 0) + dps * 0.6 + dps * 0.4, t: def.fx.dur };
      e.poison.dps = Math.min(e.poison.dps, dps * 4); e.poison.t = def.fx.dur;
    } else if (def.effect === 'burn') {
      const dps = def.fx.dps * G.mods.dotMul * TIER_DMG[t.tier];
      e.burn = { dps, t: def.fx.dur };
    }
    // Absolute Zero special: every attack applies a small slow.
    if (G.mods.specials.absoluteZero && def.effect !== 'slow' && e.traits.indexOf('immuneSlow') < 0) {
      e.slow = Math.max(e.slow, 0.15); e.slowT = Math.max(e.slowT, 1.0);
    }
  }

  function towerFire(t) {
    const G = TD.G; const d = t.def;
    // Acquire target: leading in-range enemy (lowest progress distance to core).
    let target = null, bestProg = Infinity;
    const r2 = t.range * t.range;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.flying && !d.air) continue;
      if (dist2(t.x, t.y, e.x, e.y) > r2) continue;
      const p = progressDist(e);
      if (p < bestProg) { bestProg = p; target = e; }
    }
    if (!target) return;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    t.cd = 1 / t.rate;
    if (d.effect === 'chain') { fireChain(t, target); return; }
    if (t.projSpeed <= 0) { hitscan(t, target); return; }
    // Projectile.
    G.projectiles.push({
      x: t.x, y: t.y, tx: target.x, ty: target.y, target, speed: t.projSpeed,
      dmg: t.dmg, splash: t.splash, effect: d.effect, def: d, tier: t.tier, color: d.color,
      pierce: (d.pierce || 0) + G.mods.pierce, towerFx: d.fx || null, dead: false,
    });
    if (TD.audio) TD.audio.play(t.dmg > 30 ? 'shootHeavy' : 'shoot');
  }

  function hitscan(t, target) {
    const G = TD.G; const d = t.def;
    if (TD.audio) TD.audio.play(d.id === 'sniper' ? 'shootHeavy' : 'zap');
    G.beams.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, color: d.color, t: 0.12, life: 0.12 });
    const before = target.hp;
    dealDamage(target, t.dmg, { armorPen: d.id === 'sniper' ? 6 : 0, towerFx: d.fx, overkill: 0 });
    if (target.dead) {/* overkill handled inside */}
    if (d.effect) applyEffect(target, d, t);
    // Sniper pierce: hit additional enemies in range.
    let pierce = (d.pierce || 0) + G.mods.pierce;
    if (pierce > 0) {
      const r2 = t.range * t.range;
      const others = G.enemies.filter((e) => !e.dead && e !== target && (!e.flying || d.air) && dist2(t.x, t.y, e.x, e.y) <= r2)
        .sort((a, b) => progressDist(a) - progressDist(b));
      for (let k = 0; k < pierce && k < others.length; k++) { dealDamage(others[k], t.dmg * 0.7, { armorPen: 6, towerFx: d.fx }); if (d.effect) applyEffect(others[k], d, t); }
    }
  }

  function fireChain(t, target) {
    const G = TD.G; const d = t.def;
    if (TD.audio) TD.audio.play('zap');
    const hops = (d.fx.chain || 3) + G.mods.chainAdd;
    let cur = target, dmg = t.dmg; const hit = new Set();
    let px = t.x, py = t.y;
    for (let h = 0; h <= hops; h++) {
      if (!cur || cur.dead) break;
      hit.add(cur);
      G.beams.push({ x1: px, y1: py, x2: cur.x, y2: cur.y, color: d.color, t: 0.1, life: 0.1 });
      dealDamage(cur, dmg, { towerFx: d.fx });
      if (d.effect && d.effect !== 'chain') applyEffect(cur, d, t);
      px = cur.x; py = cur.y; dmg *= (d.fx.falloff || 0.8);
      // next nearest unhit enemy within chain range
      let nx = null, nd = (d.fx.range || 2.2) * (d.fx.range || 2.2);
      for (const e of G.enemies) { if (e.dead || hit.has(e)) continue; if (e.flying && !d.air) continue; const dd = dist2(cur.x, cur.y, e.x, e.y); if (dd <= nd) { nd = dd; nx = e; } }
      cur = nx;
    }
  }

  // ── Main simulation step ────────────────────────────────────────────────
  function update(dt) {
    const G = TD.G;
    if (!G || G.phase !== 'wave') return;
    // Spawn from schedule.
    G.waveElapsed += dt;
    while (G.spawnIdx < G.spawnQueue.length && G.spawnQueue[G.spawnIdx].t <= G.waveElapsed) {
      const s = G.spawnQueue[G.spawnIdx++];
      spawnEnemy(s.id, s.boss, null);
    }
    // Enemies.
    const cores = G.grid.cores;
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.spawnT += dt; if (e.hitFlash > 0) e.hitFlash -= dt;
      // status effects
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      if (e.burn) { dealDamage(e, e.burn.dps * dt, { isDot: true }); e.burn.t -= dt; if (e.burn.t <= 0) e.burn = null; if (e.dead) continue; }
      if (e.poison) { dealDamage(e, e.poison.dps * dt, { isDot: true }); e.poison.t -= dt; if (e.poison.t <= 0) e.poison = null; if (e.dead) continue; }
      if (e.regen) { e.hp = Math.min(e.maxHp, e.hp + e.regen * dt); }
      // healer trait: heal nearby allies
      if (e.traits.indexOf('heal') >= 0) { e.healT = (e.healT || 0) + dt; if (e.healT >= 0.5) { e.healT = 0; for (const o of G.enemies) { if (o === e || o.dead) continue; if (dist2(e.x, e.y, o.x, o.y) < 4) o.hp = Math.min(o.maxHp, o.hp + 6); } } }
      // boss spawner
      if (e.traits.indexOf('spawner') >= 0 && e.def.spawn) { e.spawnTimer = (e.spawnTimer || 0) + dt; if (e.spawnTimer >= (e.def.spawnEvery || 3)) { e.spawnTimer = 0; for (let k = 0; k < (e.def.spawnCount || 1); k++) { const c = makeChild(e.def.spawn, e.x, e.y); if (c) G.enemies.push(c); } } }
      moveEnemy(e, dt, cores);
    }
    // Towers fire.
    for (const t of Object.values(G.towers)) {
      if (!t.def.attacks) continue;
      if (t.cd > 0) t.cd -= dt;
      if (t.cd <= 0) towerFire(t);
    }
    // Projectiles.
    for (const p of G.projectiles) updateProjectile(p, dt);
    // Cull.
    G.enemies = G.enemies.filter((e) => !e.dead);
    G.projectiles = G.projectiles.filter((p) => !p.dead);
    updateFx(dt);
    // Wave clear?
    if (G.spawnIdx >= G.spawnQueue.length && G.enemies.length === 0) endWave();
    if (G.lives <= 0 && G.phase === 'wave') loseRun();
  }

  function moveEnemy(e, dt, cores) {
    const G = TD.G;
    const sp = e.speed * (1 - e.slow);
    let step = sp * dt;
    let tgtx, tgty;
    if (e.flying) { const c = nearestCore(e); tgtx = c.x; tgty = c.y; }
    else {
      const tx = clamp(Math.round(e.x), 0, G.cols - 1), ty = clamp(Math.round(e.y), 0, G.rows - 1);
      const ti = tileIndex(tx, ty);
      if (G.field.dist[ti] === 0) { leak(e); return; }
      const ni = G.field.next[ti];
      if (ni < 0) { // stuck (shouldn't happen) — drift toward nearest core
        const c = nearestCore(e); tgtx = c.x; tgty = c.y;
      } else { tgtx = ni % G.cols; tgty = (ni / G.cols) | 0; }
    }
    const dx = tgtx - e.x, dy = tgty - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= step) { e.x = tgtx; e.y = tgty; }
    else { e.x += (dx / d) * step; e.y += (dy / d) * step; }
    // reached a core?
    for (const c of cores) { if (Math.abs(e.x - c.x) < 0.12 && Math.abs(e.y - c.y) < 0.12) { leak(e); return; } }
  }

  function leak(e) {
    const G = TD.G; if (e.dead) return; e.dead = true;
    G.lives -= e.leak;
    if (TD.audio) TD.audio.play('lifeLost');
    spawnFloater(e.x, e.y, '-' + e.leak + '♥', '#f87171');
    spawnExplosion(e.x, e.y, '#ef4444', 10);
  }

  function updateProjectile(p, dt) {
    const G = TD.G;
    if (p.target && p.target.dead) { p.target = nearestEnemyTo(p.x, p.y, null); }
    if (p.target) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y; const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 0.05) { impact(p); return; }
    p.x += (dx / d) * step; p.y += (dy / d) * step;
    p.angle = Math.atan2(dy, dx);
    spawnTrail(p);
  }
  function impact(p) {
    const G = TD.G; p.dead = true;
    if (p.splash > 0) {
      spawnExplosion(p.x, p.y, p.color, 14);
      if (TD.audio) TD.audio.play('explode');
      const r2 = p.splash * p.splash;
      for (const e of G.enemies) { if (e.dead) continue; if (e.flying && !p.def.air) continue; if (dist2(p.x, p.y, e.x, e.y) <= r2) { dealDamage(e, p.dmg, { towerFx: p.towerFx }); if (p.effect) applyEffect(e, p.def, { tier: p.tier }); } }
    } else {
      const e = p.target;
      if (e && !e.dead) { const before = e.hp; dealDamage(e, p.dmg, { towerFx: p.towerFx, overkill: Math.max(0, p.dmg - before) }); if (p.effect) applyEffect(e, p.def, { tier: p.tier }); }
      if (p.pierce > 0) { /* simple pierce: spawn no new proj; pierce handled for hitscan */ }
    }
    spawnExplosion(p.x, p.y, p.color, p.splash > 0 ? 0 : 5);
  }

  // ── Wave end / rewards ─────────────────────────────────────────────────────
  function endWave() {
    const G = TD.G;
    const omens = activeOmenObjs();
    const curse = G.waveOmens || { reward: { goldMul: 1, cardBonus: 0, rerollAdd: 0, shardAdd: 0, guaranteeRarity: null, lifeAdd: 0 } };
    const reward = curse.reward || { goldMul: 1 };
    // Interest on banked gold.
    const interest = Math.floor(G.gold * G.mods.interest);
    if (interest > 0) { G.gold += interest; spawnBanner('+' + interest + ' interest', '#fbbf24'); }
    // Mint income.
    let mintTotal = 0;
    for (const t of Object.values(G.towers)) if (t.def.effect === 'gold') mintTotal += Math.round(t.def.fx.perWave * G.mods.mintMul * (1 + t.tier * 0.5));
    if (mintTotal > 0) { G.gold += mintTotal; }
    // Omen gold bonus is applied as a lump based on wave value.
    if (reward.goldMul && reward.goldMul !== 1) { const bonus = Math.round(20 + G.wave * 6) * (reward.goldMul - 1); G.gold += Math.round(bonus); }
    if (reward.lifeAdd) G.lives += reward.lifeAdd;
    G.rerollsLeft = Math.min(G.rerollsMax + (reward.rerollAdd || 0), G.rerollsMax + 3);
    if (reward.rerollAdd) G.rerollsMax += reward.rerollAdd;
    G.stats.omensTaken += omens.length;
    G.stats.wavesCleared++;
    G.shardsEarned += (reward.shardAdd || 0);
    G.selectedOmens = [];
    G.waveOmens = null;
    if (TD.audio) TD.audio.play('coin');

    if (G.wave >= WIN_WAVE && !G.won) { G.won = true; winRun(); }

    // Advance & offer cards.
    G.wave++;
    G.pendingCardCount = 1 + (reward.cardBonus || 0);
    G.pendingCards = rollCards(G.pendingCardCount, reward.guaranteeRarity);
    G.phase = 'reward';
    saveRun();
  }

  function computeShards() {
    const G = TD.G;
    const base = G.stats.wavesCleared * 2 + G.stats.bossKills * 6 + Math.floor(G.stats.kills / 25) + G.shardsEarned;
    return Math.max(1, Math.round(base * (1 + G.mp.shardGain)));
  }
  function finalize(result) {
    const G = TD.G; const meta = G.meta;
    const shards = computeShards();
    meta.shards += shards;
    meta.stats.runs++;
    meta.stats.kills += G.stats.kills;
    meta.stats.bestWave = Math.max(meta.stats.bestWave, G.wave);
    if (result === 'won') meta.stats.wins++;
    saveMeta(meta);
    clearRun();
    G.result = result; G.awardedShards = shards;
    G.score = G.stats.wavesCleared * 100 + G.stats.kills * 5 + G.stats.bossKills * 250 + G.stats.omensTaken * 60;
  }
  function loseRun() { const G = TD.G; G.phase = 'lost'; if (TD.audio) { TD.audio.play('gameOver'); TD.audio.stopMusic(); } finalize(G.won ? 'won' : 'lost'); }
  function winRun() { const G = TD.G; if (TD.audio) TD.audio.play('victory'); spawnBanner('CORE DEFENDED — Endless mode unlocked!', '#4ade80'); }

  // ── FX (particles, floaters, banners) ──────────────────────────────────────
  function spawnFloater(x, y, text, color, big) { TD.G.floaters.push({ x, y, text, color, t: 0.8, vy: -1.1, big: !!big }); }
  function spawnBanner(text, color) { TD.G.banner = { text, color, t: 1.6 }; }
  function spawnExplosion(x, y, color, n) { const G = TD.G; for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2, sp = 1 + rand() * 4; G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0.4 + rand() * 0.3, life: 0.7, color, r: 1 + rand() * 2 }); } }
  function spawnDeath(e) { spawnExplosion(e.x, e.y, e.color, e.isBoss ? 0 : 6); }
  function spawnTrail(p) { if (rand() < 0.5) TD.G.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, t: 0.2, life: 0.2, color: p.color, r: 1.2 }); }
  function updateFx(dt) {
    const G = TD.G;
    for (const f of G.floaters) { f.t -= dt; f.y += f.vy * dt; }
    G.floaters = G.floaters.filter((f) => f.t > 0);
    for (const p of G.particles) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    G.particles = G.particles.filter((p) => p.t > 0);
    for (const b of G.beams) b.t -= dt;
    G.beams = G.beams.filter((b) => b.t > 0);
    if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  }

  // ── Save / load (build-phase snapshots only → no transient entities) ───────
  function serialize() {
    const G = TD.G;
    return {
      biome: G.biome.id, gold: G.gold, lives: G.lives, wave: G.wave, phase: G.phase,
      ownedCards: G.ownedCards.map((c) => c.id),
      towers: Object.values(G.towers).map((t) => ({ x: t.x, y: t.y, id: t.id, tier: t.tier, spent: t.spent })),
      rerollsLeft: G.rerollsLeft, rerollsMax: G.rerollsMax, omenSlots: G.omenSlots,
      stats: G.stats, shardsEarned: G.shardsEarned,
      pendingCardCount: G.pendingCardCount,
      pendingCards: G.pendingCards ? G.pendingCards.map((c) => c.id) : null,
      won: !!G.won, startTime: G.startTime,
    };
  }
  function saveRun() { if (!TD.G || TD.G.phase === 'lost') return; try { localStorage.setItem(RUN_KEY, JSON.stringify(serialize())); } catch (e) {} }
  // Soft save during build (towers changed) — same as saveRun but only in build/reward.
  function saveRunSoft() { if (TD.G && (TD.G.phase === 'build' || TD.G.phase === 'reward')) saveRun(); }
  function hasSavedRun() { try { return !!localStorage.getItem(RUN_KEY); } catch (e) { return false; } }
  function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch (e) {} }
  function loadRun(meta) {
    let s; try { s = JSON.parse(localStorage.getItem(RUN_KEY)); } catch (e) { return null; }
    if (!s) return null;
    const G = newRun(s.biome, meta);
    G.gold = s.gold; G.lives = s.lives; G.wave = s.wave;
    G.ownedCards = (s.ownedCards || []).map((id) => DATA.UPGRADES.find((u) => u.id === id)).filter(Boolean);
    G.rerollsLeft = s.rerollsLeft != null ? s.rerollsLeft : G.rerollsLeft;
    G.rerollsMax = s.rerollsMax != null ? s.rerollsMax : G.rerollsMax;
    G.omenSlots = s.omenSlots || G.omenSlots;
    G.stats = Object.assign(G.stats, s.stats || {});
    G.shardsEarned = s.shardsEarned || 0;
    G.won = !!s.won; G.startTime = s.startTime || Date.now();
    // Rebuild towers.
    G.towers = {}; G.grid.blocked = G.grid.rock.slice();
    for (const ts of s.towers || []) { const def = towerDef(ts.id); if (!def) continue; const i = tileIndex(ts.x, ts.y); const t = { id: ts.id, def, x: ts.x, y: ts.y, tier: ts.tier || 0, cd: 0, angle: -Math.PI / 2, spent: ts.spent || def.cost, targetId: null }; G.towers[i] = t; if (def.blocks) G.grid.blocked[i] = 1; }
    recomputeMods(); recomputeField(); recomputeTowerStats();
    // Restore reward/build phase.
    G.phase = s.phase === 'wave' ? 'build' : (s.phase || 'build');
    G.pendingCardCount = s.pendingCardCount || 1;
    if (G.phase === 'reward') { G.pendingCards = (s.pendingCards || []).map((id) => DATA.UPGRADES.find((u) => u.id === id)).filter(Boolean); if (!G.pendingCards.length) G.pendingCards = rollCards(G.pendingCardCount); }
    return G;
  }

  TD.engine = {
    TILE, WIN_WAVE,
    loadMeta, saveMeta, defaultMeta, deriveMeta,
    newRun, update, hasSavedRun, loadRun, clearRun, saveRun,
    canPlace, placeTower, upgradeTower, sellTower, upgradeCost, towerDef, towerCost,
    recomputeField, recomputeTowerStats, recomputeMods,
    rollCards, pickCard, rerollCards,
    toggleOmen, activeOmenObjs, previewWave, startWave, finalize, computeShards,
    progressDist, tileIndex,
  };
})();
