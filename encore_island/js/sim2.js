'use strict';
// Encore Island — simulation systems: the per-frame tick (hero, notes, foes, loot, selling, vault, plates, towers, fans, groove).
function nearestLandIdx(x, y) { let best = 0, bd = dist2(x, y, 0, 0) - HUB.r * HUB.r; for (const z of S.lands) { const d = dist2(x, y, z.g.x, z.g.y) - z.g.r * z.g.r; if (d < bd) { bd = d; best = z.k; } } return best; }
// waypoints that keep walkers on the boardwalks: climb from the start land to the hub, then descend to the target land
function routeBetween(ax, ay, bx, by) {
  const la = nearestLandIdx(ax, ay), lb = nearestLandIdx(bx, by);
  if (la === lb) return [{ x: bx, y: by }];
  const chain = (k) => { const c = []; while (k > 0) { c.push(k); k = geoOf(k).parent; } return c; };
  let ca = chain(la), cb = chain(lb);
  while (ca.length && cb.length && ca[ca.length - 1] === cb[cb.length - 1]) { ca.pop(); cb.pop(); }
  const pts = [];
  for (const k of ca) { const P = geoOf(k).path; for (let i = P.length - 1; i >= 0; i--) pts.push({ x: P[i].x, y: P[i].y }); }
  for (let i = cb.length - 1; i >= 0; i--) { const P = geoOf(cb[i]).path; for (let j = 0; j < P.length; j++) pts.push({ x: P[j].x, y: P[j].y }); }
  pts.push({ x: bx, y: by });
  return pts;
}
// ---- the tick ----
function tick(dt) {
  if (!S.started) { S.t += dt; return; }
  if (JUICE.hitStop > 0) { JUICE.hitStop -= dt; dt *= 0.12; }
  S.t += dt; S.stats.playT += dt; S.flowTouched = false;
  const p = S.player;
  p.maxHp = pMaxHp(); p.hp = Math.min(p.hp, p.maxHp);
  tickHero(dt); tickFire(dt); tickShots(dt); tickItems(dt); tickSell(dt); tickForge(dt); tickVault(dt);
  tickHubPlates(dt); tickLandPlates(dt); tickSpawns(dt); tickEnemies(dt); tickTowers(dt); tickFans(dt); tickComp(dt);
  tickTimers(dt); tickMeta(dt); tickFx(dt);
  if (!S.flowTouched) { S.flowKey = null; S.flowT = 0; }
}
function tickHero(dt) {
  const p = S.player;
  p.cheerT = Math.max(0, (p.cheerT || 0) - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.atkT = Math.max(0, p.atkT - dt); p.invuln = Math.max(0, p.invuln - dt); p.dashCd = Math.max(0, p.dashCd - dt);
  if (pk('regen') > 0) p.hp = Math.min(p.maxHp, p.hp + 3 * pk('regen') * dt);
  let ix = 0, iy = 0;
  if (S.stick) { ix = S.stick.dx; iy = S.stick.dy; } else if (S.keyStick) { ix = S.keyStick.dx; iy = S.keyStick.dy; }
  const mag = Math.min(1, Math.hypot(ix, iy)), sp = speedNow();
  if (p.dashT > 0) { p.dashT -= dt; p.vx = p.dashX * DASH_SPD; p.vy = p.dashY * DASH_SPD; }
  else {
    const tx = mag > 0.05 ? ix / (mag || 1) * sp * Math.min(1, mag * 1.15) : 0, ty = mag > 0.05 ? iy / (mag || 1) * sp * Math.min(1, mag * 1.15) : 0, k = Math.min(1, dt * 13);
    p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
  }
  const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
  if (walkable(nx, ny, S.lands.length)) { p.x = nx; p.y = ny; }
  else if (walkable(nx, p.y, S.lands.length)) { p.x = nx; p.vy *= 0.3; }
  else if (walkable(p.x, ny, S.lands.length)) { p.y = ny; p.vx *= 0.3; }
  else { p.vx *= 0.2; p.vy *= 0.2; }
  p.moving = Math.hypot(p.vx, p.vy) > 28;
  if (Math.abs(p.vx) > 18) p.face = p.vx > 0 ? 1 : -1;
}
function dashAbility() {
  const p = S.player;
  if (!S.started || p.dashCd > 0 || p.dashT > 0) return false;
  let dx = p.vx, dy = p.vy; const l = Math.hypot(dx, dy);
  if (l < 20) { dx = p.face; dy = 0; } else { dx /= l; dy /= l; }
  p.dashX = dx; p.dashY = dy; p.dashT = DASH_TIME; p.dashCd = dashCdMax(); p.invuln = Math.max(p.invuln, DASH_TIME + 0.12);
  starBurst(p.x, p.y - 10, 6, ['#fff4e6', '#c6ffd8'], 160); sfx('dash'); buzz(15);
  return true;
}
function tickFire(dt) {
  const p = S.player; p.fireCd -= dt;
  if (p.fireCd > 0) return;
  const range = FIRE_RANGE * (1 + 0.12 * pk('range')), inRange = [];
  for (const e of S.enemies) if (e.hp > 0) { const d = dist2(e.x, e.y, p.x, p.y); if (d < range * range) inRange.push([d, e]); }
  if (!inRange.length) return;
  inRange.sort((a, b) => a[0] - b[0]);
  const shots = 1 + pk('multi'), spd = 460 * (1 + 0.18 * pk('velocity'));
  p.fireCd = pRate(); p.atkT = 0.4;
  for (let i = 0; i < shots; i++) {
    const tgt = inRange[i % inRange.length][1], crit = rnd() < critChance();
    S.shots.push({ x: p.x + p.face * 10, y: p.y - 42, tgt, dmg: pDmg() * (crit ? critMult() : 1), spd, crit, a: 0, nt: Math.floor(rnd() * 3) });
  }
  p.face = inRange[0][1].x > p.x ? 1 : -1; sfx('shoot');
}
function tickShots(dt) {
  for (const sh of S.shots) {
    if (sh.boulder) {
      sh.t += dt; const f = Math.min(1, sh.t / sh.dur);
      sh.x = sh.sx + (sh.tx - sh.sx) * f; sh.y = sh.sy + (sh.ty - sh.sy) * f - Math.sin(f * Math.PI) * 150;
      if (sh.t >= sh.dur) {
        sh.done = true; S.fx.push({ kind: 'boom', x: sh.tx, y: sh.ty, r: CAT_AOE, t: 0, dur: 0.4 });
        for (const e of S.enemies) if (e.hp > 0 && dist2(e.x, e.y, sh.tx, sh.ty) < CAT_AOE * CAT_AOE) hurtEnemy(e, sh.dmg);
        puff(sh.tx, sh.ty, '#ffc2dc', 14, true); shake(6); sfx('boom', true);
      }
      continue;
    }
    const tx = sh.tgt.hp > 0 ? sh.tgt.x : sh.lx || sh.x, ty = (sh.tgt.hp > 0 ? sh.tgt.y : sh.ly || sh.y) - (sh.tgt.hp > 0 ? sh.tgt.r * 0.5 : 0);
    if (sh.tgt.hp > 0) { sh.lx = tx; sh.ly = ty; }
    const dx = tx - sh.x, dy = ty - sh.y, dl = Math.hypot(dx, dy) || 1;
    sh.x += dx / dl * sh.spd * dt; sh.y += dy / dl * sh.spd * dt; sh.a = Math.atan2(dy, dx);
    if (dl < 18) { sh.done = true; if (sh.tgt.hp > 0) hurtEnemy(sh.tgt, sh.dmg, sh.crit); }
  }
  compact(S.shots, (s) => !s.done);
}
function tickItems(dt) {
  const p = S.player, pr = pickR(), room = p.helmets.length < cap();
  for (const it of S.items) {
    it.t += dt;
    if (it.t < 0.45) { it.x += it.vx * dt; it.y += it.vy * dt; it.vy += 380 * dt; continue; }
    if (it.dead) continue;
    const d2 = dist2(it.x, it.y, p.x, p.y);
    if (d2 < pr * pr * 2.2 && (it.gem || room)) { // gentle magnet: loot eases toward the hero
      const d = Math.sqrt(d2) || 1, pull = (90 + 700 * (1 - d / (pr * 1.5))) * dt;
      it.x += (p.x - it.x) / d * Math.min(d, pull); it.y += (p.y - it.y) / d * Math.min(d, pull);
    }
    if (it.t < 0.6 || dist2(it.x, it.y, p.x, p.y) >= pr * pr) continue;
    if (it.gem) {
      it.dead = true; S.gems++; S.stats.gemsFound++; questEvent('gem', 1);
      flyTo('gem', it.x, it.y, p.x, p.y - 34, { dur: 0.22 }); starBurst(p.x, p.y - 34, 5, ['#b8fff6', '#6ee0d8'], 140);
      float(p.x, p.y - 70, '+1', '#6ee0d8', true); sfx('gem', true, chainPitch());
    } else if (room) {
      it.dead = true; p.helmets.push(cloneEntry(it));
      flyTo('item', it.x, it.y, p.x, p.y - 34, { entry: it, dur: 0.2, arc: 18 }); sfx('pick', false, chainPitch());
      if (p.helmets.length >= cap()) float(p.x, p.y - 90, 'FULL! Go sell', '#ffd94a', true);
    }
  }
  compact(S.items, (i) => !i.dead);
  if (S.items.length > 400) S.items.splice(0, S.items.length - 400);
}
function tickSell(dt) {
  const p = S.player;
  if (p.helmets.length && dist2(p.x, p.y, SELL.x, SELL.y) < SELL.r * SELL.r) {
    p.sellAcc += dt * SELL_RATE;
    while (p.sellAcc >= 1 && p.helmets.length) {
      p.sellAcc -= 1; const e = p.helmets.pop(), v = entryVal(e);
      S.pallet += v; S.stats.sold++; S.stats.earned += v; questEvent('sell', 1); questEvent('earn', v);
      float(SELL.x + 36, SELL.y - 60, '+' + fmt(v), '#ffd94a', !!e.crown);
      flyTo('item', p.x, p.y - 40, SELL.x, SELL.y - 24, { entry: e, dur: 0.26, arc: 44 });
      flyTo('coin', SELL.x, SELL.y - 24, VAULT.x + (vrnd() - 0.5) * 40, VAULT.y - 16, { delay: 0.2, dur: 0.34, arc: 70 });
      puff(VAULT.x, VAULT.y - 30, '#ffd94a', 3, true); sfx('sell', false, chainPitch());
    }
  } else p.sellAcc = 0;
}
function sellToVault(e) { const v = entryVal(e); S.pallet += v; S.stats.earned += v; S.stats.sold++; questEvent('sell', 1); questEvent('earn', v); flyTo('coin', SELL.x, SELL.y - 24, VAULT.x + (vrnd() - 0.5) * 40, VAULT.y - 16, { dur: 0.34, arc: 70 }); puff(VAULT.x, VAULT.y - 30, '#ffd94a', 1, true); }
function tickForge(dt) {
  const f = S.forge, p = S.player; if (!f) return;
  if (dist2(p.x, p.y, FORGE.x, FORGE.y) < FORGE.r * FORGE.r && f.queue.length < forgeQ()) {
    p.forgeAcc += dt * SELL_RATE;
    while (p.forgeAcc >= 1 && f.queue.length < forgeQ()) {
      p.forgeAcc -= 1; let idx = -1;
      for (let i = p.helmets.length - 1; i >= 0; i--) if (entryRes(p.helmets[i]) === 'helm') { idx = i; break; }
      if (idx < 0) break;
      const e = p.helmets.splice(idx, 1)[0]; f.queue.push(e.k); sfx('smelt'); flyTo('item', p.x, p.y - 40, FORGE.x, FORGE.y - 10, { entry: e, dur: 0.24, arc: 30 });
    }
  }
  if (f.queue.length && f.tray.length < trayMax()) {
    f.smeltT += dt * forgeSpeed();
    if (f.smeltT >= FORGE_T) { f.smeltT = 0; const k = f.queue.shift(); f.tray.push(k); S.stats.crafted++; puff(FORGE.x, FORGE.y - 10, '#ffb640', 6, true); sfx('smelt'); flyTo('item', FORGE.x, FORGE.y - 10, TRAY.x, TRAY.y - 10, { entry: { k, bar: true }, dur: 0.3, arc: 40 }); }
  }
  if (dist2(p.x, p.y, TRAY.x, TRAY.y) < TRAY.r * TRAY.r && f.tray.length && p.helmets.length < cap()) {
    p.forgeAcc += dt * SELL_RATE; // reuse accumulator for collecting
    while (p.forgeAcc >= 1 && f.tray.length && p.helmets.length < cap()) { p.forgeAcc -= 1; const k = f.tray.pop(); p.helmets.push({ k, bar: true, crown: false }); sfx('pick', false, chainPitch()); flyTo('item', TRAY.x, TRAY.y - 10, p.x, p.y - 38, { entry: { k, bar: true }, dur: 0.22 }); }
  }
}
function tickVault(dt) {
  const p = S.player;
  if (S.pallet > 0 && dist2(p.x, p.y, VAULT.x, VAULT.y) < VAULT.r * VAULT.r) {
    touchFlow('vault', dt);
    const take = Math.min(S.pallet, Math.max(1, Math.ceil(VAC_RATE * flowMul() * dt)));
    S.pallet -= take; S.wallet += take;
    if ((S.coinFxT = (S.coinFxT || 0) + dt) > 0.09) {
      S.coinFxT = 0; float(p.x, p.y - 70, '+' + fmt(take), '#ffd94a'); sfx('coin', false, 1 + Math.min(1, Math.log2(flowMul()) * 0.08));
      const nc = Math.min(6, 1 + Math.floor(Math.log2(Math.max(1, flowMul()))));
      for (let i = 0; i < nc; i++) flyTo('coin', VAULT.x + (vrnd() - 0.5) * 70, VAULT.y - 14, p.x, p.y - 36, { delay: i * 0.025, dur: 0.32, arc: 50 });
    }
  }
}
// ---- plates (walk onto one, coins pour from your wallet into it) ----
function pourFx(dt, x, y) {
  if ((S.pourFxT = (S.pourFxT || 0) + dt) < 0.07) return; S.pourFxT = 0;
  const p = S.player, n = Math.min(4, 1 + Math.floor(Math.log2(Math.max(1, flowMul()))));
  for (let i = 0; i < n; i++) flyTo('coin', p.x, p.y - 36, x + (vrnd() - 0.5) * 20, y - 4, { delay: i * 0.03, dur: 0.3, arc: 30 });
}
// pay a plate: returns true when it just completed
function pay(plate, dt, key) {
  if (plate.built || S.wallet <= 0) return false;
  touchFlow(key || plate, dt);
  const chunk = Math.min(S.wallet, Math.ceil(BUILD_RATE * flowMul() * dt), plate.cost - plate.paid);
  if (chunk <= 0) return false;
  S.wallet -= chunk; plate.paid += chunk; sfx('pour'); pourFx(dt, plate.x, plate.y);
  return plate.paid >= plate.cost;
}
function tickHubPlates(dt) {
  const p = S.player;
  for (const key in UPG) {
    const pos = UPG_POS[key];
    if (dist2(p.x, p.y, pos.x, pos.y) < 52 * 52 && S.wallet > 0) {
      const cost = upgCost(key, S.up[key]), tmp = { x: pos.x, y: pos.y, cost, paid: S.upPaid[key], built: false };
      const done = pay(tmp, dt, 'upg:' + key); S.upPaid[key] = tmp.paid;
      if (done) { S.up[key]++; S.upPaid[key] = 0; float(pos.x, pos.y - 70, UPG[key].name + ' LV' + (S.up[key] + 1) + '!', '#6ecb5a', true); sfx('built', true); buzz(40); starBurst(pos.x, pos.y - 20, 12, ['#ffe98a', '#9af0b4'], 240); ringFx(pos.x, pos.y, 80, '#9af0b4', 0.4); }
    }
  }
  for (const key in GEMU) {
    const pos = GEM_POS[key], cost = gemUpCost(key, S.gemUp[key]);
    if (dist2(p.x, p.y, pos.x, pos.y) < 46 * 46 && S.gems > 0 && S.gemPaid[key] < cost) {
      S.gemAcc = (S.gemAcc || 0) + dt * 3;
      while (S.gemAcc >= 1 && S.gems > 0 && S.gemPaid[key] < cost) {
        S.gemAcc -= 1; S.gems--; S.gemPaid[key]++; sfx('gem'); flyTo('gem', p.x, p.y - 36, pos.x, pos.y - 4, { dur: 0.28 });
        if (S.gemPaid[key] >= cost) { S.gemUp[key]++; S.gemPaid[key] = 0; float(pos.x, pos.y - 70, GEMU[key].name + ' LV' + S.gemUp[key] + '!', '#6ee0d8', true); sfx('built', true); buzz(40); starBurst(pos.x, pos.y - 20, 12, ['#b8fff6', '#6ee0d8'], 240); }
      }
    }
  }
  if (!S.forgePlate.built && S.lands.length >= 1 && dist2(p.x, p.y, FORGE.x, FORGE.y) < 56 * 56) {
    const pl = S.forgePlate; pl.x = FORGE.x; pl.y = FORGE.y;
    if (pay(pl, dt, 'forge')) { pl.built = true; S.forge = { queue: [], tray: [], smeltT: 0 }; float(FORGE.x, FORGE.y - 80, 'SMELTER BUILT! Shields become bars', '#ffd94a', true); sfx('built', true); buzz(50); starBurst(FORGE.x, FORGE.y, 16, ['#ffb640', '#ffe98a'], 260); }
  }
  if (S.forge && S.forgeLvl < FORGE_LVL_MAX && dist2(p.x, p.y, FUP.x, FUP.y) < 46 * 46) {
    const pl = S.forgeUpPlate; pl.x = FUP.x; pl.y = FUP.y; pl.cost = forgeUpCost(S.forgeLvl);
    if (pay(pl, dt, 'fup')) { S.forgeLvl++; pl.paid = 0; pl.cost = forgeUpCost(S.forgeLvl); float(FUP.x, FUP.y - 70, 'SMELTER LV' + (S.forgeLvl + 1) + '!', '#ffb060', true); sfx('built', true); starBurst(FUP.x, FUP.y, 12, ['#ffb640', '#ffe98a'], 240); }
  }
  if (!S.waygate && S.lands.length >= 2 && dist2(p.x, p.y, WAYPLATE.x, WAYPLATE.y) < 52 * 52) {
    const pl = S.wayPlate; pl.x = WAYPLATE.x; pl.y = WAYPLATE.y;
    if (pay(pl, dt, 'way')) { pl.built = true; S.waygate = true; float(WAYPLATE.x, WAYPLATE.y - 80, 'WARP PADS OPEN!', '#6ec9e0', true); sfx('unlock', true); ringFx(WAYPLATE.x, WAYPLATE.y, 120, '#6ec9e0', 0.6); }
  }
  // warp pads: stand still on one to jump between the plaza and the newest land
  if (S.waygate) {
    let warp = null;
    if (dist2(p.x, p.y, WAYPAD.x, WAYPAD.y) < WAYPAD.r * WAYPAD.r) { const z = S.lands[S.lands.length - 1]; warp = { x: z.pad.x, y: z.pad.y }; }
    else for (const z of S.lands) if (dist2(p.x, p.y, z.pad.x, z.pad.y) < 44 * 44) { warp = { x: WAYPAD.x, y: WAYPAD.y + 60 }; break; }
    if (warp && !p.moving) { p.warpT += dt; if (p.warpT >= WARP_T) { p.warpT = 0; ringFx(p.x, p.y, 100, '#6ec9e0', 0.4); p.x = warp.x; p.y = warp.y; ringFx(p.x, p.y, 100, '#6ec9e0', 0.4); starBurst(p.x, p.y - 20, 14, ['#6ec9e0', '#fff4e6'], 240); sfx('warp', true); S.warpCool = 1; } }
    else p.warpT = 0;
  }
  // Encore Tour monument
  if (S.lands.length >= PRESTIGE_MIN && dist2(p.x, p.y, MONU.x, MONU.y) < MONU.r * MONU.r && !p.moving) {
    S.prestT += dt; if (S.prestT >= PREST_T) { S.prestT = 0; prestige(); }
  } else S.prestT = Math.max(0, S.prestT - dt * 2);
  // the plate that opens the next land
  const nu = unlockSpot(S.lands.length + 1);
  S.unlockPlate = { x: nu.x, y: nu.y, cost: nextUnlockCost(), paid: S.unlockPaid, built: false };
  if (dist2(p.x, p.y, nu.x, nu.y) < 58 * 58) {
    if (pay(S.unlockPlate, dt, 'unlock')) openNextLand(); else S.unlockPaid = S.unlockPlate.paid;
  }
}
function openNextLand() {
  const z = addLand(); questEvent('land', 1);
  const g = z.g;
  float(g.x, g.y - 120, 'NEW LAND: ' + biomeOf(z.k).name.toUpperCase() + '!', '#ffd94a', true);
  sfx('unlock', true); buzz([40, 30, 80]); shake(10); JUICE.flash = 0.5;
  ringFx(g.x, g.y, g.r * 0.9, '#ffe98a', 0.9); ringFx(g.x, g.y, g.r * 0.55, '#ff9ac8', 0.7);
  starBurst(g.x, g.y, 28, ['#ffe98a', '#ff9ac8', '#9af0b4', '#c6a8ff'], 380);
  if (typeof AUDIO !== 'undefined' && AUDIO.setBiome) AUDIO.setBiome(z.k - 1);
}
function applyPlate(z, pl) {
  if (pl.id === 'tower1' || pl.id === 'tower2') z.towers.push({ type: 'archer', x: pl.x, y: pl.y, k: z.k, cd: vrnd() * 0.5 });
  else if (pl.id === 'wizard') z.towers.push({ type: 'wizard', x: pl.x, y: pl.y, k: z.k, cd: vrnd() * 0.5 });
  else if (pl.id === 'catapult') z.towers.push({ type: 'catapult', x: pl.x, y: pl.y, k: z.k, cd: 1 + vrnd() });
  else if (pl.id === 'drums') z.drums = true;
  else if (pl.id === 'altar') z.altar = { x: pl.x, y: pl.y, cd: 0 };
  else if (pl.id === 'gate2') z.hordeLvl++;
  else if (pl.id === 'towersUp') z.towerLvl++;
}
function tickLandPlates(dt) {
  const p = S.player;
  for (const z of S.lands) {
    for (const pl of z.plates) {
      if (pl.built || dist2(p.x, p.y, pl.x, pl.y) >= 56 * 56) continue;
      if (pay(pl, dt)) {
        applyPlate(z, pl);
        if (pl.repeat) { pl.lvl++; pl.paid = 0; pl.cost = Math.ceil(pl.base * Math.pow(pl.mul, pl.lvl)); if (pl.lvl >= pl.maxLvl) pl.built = true; float(pl.x, pl.y - 70, pl.name + ' LV' + pl.lvl + '!', '#6ecb5a', true); }
        else { pl.built = true; float(pl.x, pl.y - 70, pl.name + ' built!', '#6ecb5a', true); }
        sfx('built', true); buzz(40); starBurst(pl.x, pl.y - 20, 14, ['#ffe98a', '#9af0b4', '#ff9ac8'], 260); ringFx(pl.x, pl.y, 90, '#ffe98a', 0.45);
      }
    }
    if (z.altar) { z.altar.cd = Math.max(0, z.altar.cd - dt); if (z.altar.cd <= 0 && dist2(p.x, p.y, z.altar.x, z.altar.y) < 50 * 50) { z.altar.cd = BOSS_CD; spawnEnemy(z, { boss: true }); } }
  }
}
function tickSpawns(dt) {
  const alive = new Map();
  for (const e of S.enemies) if (e.hp > 0 && !e.boss) alive.set(e.k, (alive.get(e.k) || 0) + 1);
  for (const z of S.lands) {
    z.spawnCd -= dt;
    if (z.spawnCd <= 0 && (alive.get(z.k) || 0) < maxAlive(z)) { z.spawnCd = spawnInt(z); spawnEnemy(z); alive.set(z.k, (alive.get(z.k) || 0) + 1); }
  }
}
function tickEnemies(dt) {
  const p = S.player, heroLand = landAt(p.x, p.y, S.lands.length);
  for (const e of S.enemies) {
    if (e.hp <= 0) continue;
    e.hurt = Math.max(0, e.hurt - dt); e.born = Math.min(1, e.born + dt * 2.2);
    const z = S.lands[e.k - 1], g = z.g, pd2 = dist2(e.x, e.y, p.x, p.y);
    const aggroR = e.boss ? 1200 : e.arch === 'spitter' ? 360 : 240, nearPlayer = pd2 < aggroR * aggroR && heroLand === e.k;
    const spdMul = e.arch === 'fast' ? 1.55 : e.arch === 'tank' ? 0.7 : 1;
    let tx = e.tx, ty = e.ty, spd = (e.boss ? e.spd : 42) * spdMul;
    if (nearPlayer) {
      if (e.arch === 'spitter') {
        const near = e.boss ? 280 : 190, far = e.boss ? 440 : 300, range = e.boss ? 560 : 320;
        if (pd2 < near * near) { tx = e.x + (e.x - p.x); ty = e.y + (e.y - p.y); } else if (pd2 < far * far) { tx = e.x; ty = e.y; } else { tx = p.x; ty = p.y; }
        spd = (e.boss ? e.spd : 52) * spdMul; e.atkCd -= dt;
        if (e.atkCd <= 0 && pd2 < range * range) {
          e.atkCd = e.boss ? 1.1 : 1.6; const sl = Math.sqrt(pd2) || 1, bvx = (p.x - e.x) / sl, bvy = (p.y - 14 - e.y) / sl, n = e.boss ? 3 : 1;
          for (let s = 0; s < n; s++) { const a = (s - (n - 1) / 2) * 0.3, ca = Math.cos(a), sa = Math.sin(a); S.eshots.push({ x: e.x, y: e.y - 14, vx: (bvx * ca - bvy * sa) * 320, vy: (bvx * sa + bvy * ca) * 320, dmg: e.dmg * (e.boss ? 0.6 : 1), k: e.k, life: 0, big: e.boss }); }
          sfx('shoot');
        }
      } else { tx = p.x; ty = p.y; spd = (e.boss ? e.spd : 62 + e.k * 2) * spdMul; }
    } else {
      e.wanderT -= dt;
      if (e.wanderT <= 0) { e.wanderT = 1.5 + rnd() * 2.5; const w = wanderPoint(z); e.tx = w.x; e.ty = w.y; }
    }
    const dx = tx - e.x, dy = ty - e.y, dl = Math.hypot(dx, dy) || 1, want = dl > 30 ? spd * Math.min(1, e.born * 1.5) : 0, k = Math.min(1, dt * 5);
    e.vx += (dx / dl * want - e.vx) * k; e.vy += (dy / dl * want - e.vy) * k;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (Math.abs(e.vx) > 6) e.face = e.vx > 0 ? 1 : -1;
    // stay on the island: pushed back inside the blob if they drift out
    const ddx = e.x - g.x, ddy = e.y - g.y, lim = radiusAt(g, Math.atan2(ddy, ddx)) * 0.9, dd = Math.hypot(ddx, ddy);
    if (dd > lim) { e.x = g.x + ddx / dd * lim; e.y = g.y + ddy / dd * lim; }
    if (e.arch !== 'spitter') { e.atkCd -= dt; if (e.atkCd <= 0 && pd2 < (e.r + 22) * (e.r + 22)) { e.atkCd = 0.85; hurtPlayer(e.dmg, e); } }
  }
  // soft separation so crowds flow around each other instead of stacking
  const near = S.enemies.filter(e => e.hp > 0 && dist2(e.x, e.y, p.x, p.y) < 1100 * 1100);
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const a = near[i], b = near[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, m = (a.r + b.r) * 0.7;
    if (d2 > 0 && d2 < m * m) { const d = Math.sqrt(d2), push = (m - d) * 0.5; a.x -= dx / d * push * 0.5; a.y -= dy / d * push * 0.5; b.x += dx / d * push * 0.5; b.y += dy / d * push * 0.5; }
  }
  compact(S.enemies, (e) => e.hp > 0);
  for (const es of S.eshots) { es.life += dt; es.x += es.vx * dt; es.y += es.vy * dt; if (dist2(es.x, es.y, p.x, p.y - 14) < 24 * 24) { es.done = true; hurtPlayer(es.dmg); } if (es.life > 2.2) es.done = true; }
  compact(S.eshots, (s) => !s.done);
  for (const d of S.dead) d.t += dt;
  compact(S.dead, (d) => d.t < 0.7);
}
function tickTowers(dt) {
  const byLand = new Map();
  for (const e of S.enemies) if (e.hp > 0) { let a = byLand.get(e.k); if (!a) byLand.set(e.k, a = []); a.push(e); }
  for (const z of S.lands) {
    const rateMul = z.drums ? DRUM_MUL : 1, dmgBase = towerDmg(z.k) * towerMul(z), foes = byLand.get(z.k) || [];
    for (const tw of z.towers) {
      tw.cd -= dt; if (tw.cd > 0 || !foes.length) continue;
      if (tw.type === 'archer' || tw.type === 'wizard') {
        let tgt = null, bd = TOWER_RANGE * TOWER_RANGE;
        for (const e of foes) { if (e.hp <= 0) continue; const d = dist2(e.x, e.y, tw.x, tw.y); if (d < bd) { bd = d; tgt = e; } }
        if (!tgt) continue;
        if (tw.type === 'archer') { tw.cd = TOWER_RATE * rateMul; tw.fire = 0.25; S.shots.push({ x: tw.x, y: tw.y - 70, tgt, dmg: dmgBase, spd: 430, a: 0, nt: Math.floor(vrnd() * 3), tower: true }); sfx('shoot'); }
        else {
          tw.cd = WIZ_RATE * rateMul; tw.fire = 0.3; const order = [tgt]; let cur = tgt;
          for (let j = 1; j < WIZ_CHAIN; j++) { let nxt = null, nb = WIZ_JUMP * WIZ_JUMP; for (const e of foes) { if (e.hp <= 0 || order.includes(e)) continue; const d = dist2(e.x, e.y, cur.x, cur.y); if (d < nb) { nb = d; nxt = e; } } if (!nxt) break; order.push(nxt); cur = nxt; }
          S.fx.push({ kind: 'zap', pts: [{ x: tw.x, y: tw.y - 80 }].concat(order.map(e => ({ x: e.x, y: e.y - 14 }))), t: 0, dur: 0.22 });
          for (const e of order) hurtEnemy(e, dmgBase * 1.2); sfx('zap', true);
        }
      } else {
        let tgt = null, best = -1;
        for (const e of foes) { if (e.hp <= 0) continue; let n = 0; for (const e2 of foes) if (e2.hp > 0 && dist2(e.x, e.y, e2.x, e2.y) < 120 * 120) n++; if (n > best) { best = n; tgt = e; } }
        if (tgt) { tw.cd = CAT_RATE * rateMul; tw.fire = 0.4; S.shots.push({ boulder: true, sx: tw.x, sy: tw.y - 50, tx: tgt.x, ty: tgt.y, x: tw.x, y: tw.y - 50, t: 0, dur: 0.9, dmg: dmgBase * 2.6, k: z.k }); }
      }
    }
    for (const tw of z.towers) tw.fire = Math.max(0, (tw.fire || 0) - dt);
  }
}
// ---- fans: collectors haul loot to the stall, fighters follow the hero and join the fight ----
function mkFan(role) { return { x: STAGE.x + (vrnd() - 0.5) * 80, y: STAGE.y + 40, role, state: 'seek', carry: [], ph: vrnd() * 6.28, cd: 0, route: null, face: 1, mv: 0, art: ['rawclaw', 'roxor', 'andy', 'jasmin_unicorn', 'rawclaw_goat', 'roxor_monster'][(S.pop.length + (vrnd() * 6 | 0)) % 6] }; }
function stepToward(f, tx, ty, spd, dt) { const dx = tx - f.x, dy = ty - f.y, dl = Math.hypot(dx, dy) || 1; if (dl < 2) return dl; const m = Math.min(dl, spd * dt); f.x += dx / dl * m; f.y += dy / dl * m; f.face = dx > 0 ? 1 : -1; f.mv = 0.15; return dl; }
function walkRoute(f, tx, ty, spd, dt) { // follow boardwalk waypoints toward (tx,ty); returns remaining distance to the final target
  if (!f.route || f.routeKey !== Math.round(tx) + ',' + Math.round(ty)) { f.route = routeBetween(f.x, f.y, tx, ty); f.routeKey = Math.round(tx) + ',' + Math.round(ty); }
  while (f.route.length > 1 && dist2(f.x, f.y, f.route[0].x, f.route[0].y) < 30 * 30) f.route.shift();
  const w = f.route[0]; stepToward(f, w.x, w.y, spd, dt);
  return Math.hypot(tx - f.x, ty - f.y);
}
function tickFans(dt) {
  const p = S.player;
  for (const f of S.pop) {
    f.mv = Math.max(0, f.mv - dt);
    if (f.role === 'fight') {
      const ang = f.ph + S.t * 0.4, ox = p.x + Math.cos(ang) * 90, oy = p.y + Math.sin(ang) * 60;
      const dl = Math.hypot(ox - f.x, oy - f.y); if (dl > 40) stepToward(f, ox, oy, INHAB_SPD * (dl > 300 ? 3 : 1), dt);
      if (dl > 900) { f.x = p.x; f.y = p.y; }
      f.cd -= dt;
      if (f.cd <= 0) {
        let best = null, bd = FIGHTER_RANGE * FIGHTER_RANGE;
        for (const e of S.enemies) { if (e.hp <= 0) continue; const d = dist2(e.x, e.y, f.x, f.y); if (d < bd) { bd = d; best = e; } }
        if (best) { f.cd = FIGHTER_RATE; f.face = best.x > f.x ? 1 : -1; f.atkT = 0.3; S.shots.push({ x: f.x, y: f.y - 24, tgt: best, dmg: fighterDmg(), spd: 430, a: 0, ally: true, nt: Math.floor(vrnd() * 3) }); }
      }
      f.atkT = Math.max(0, (f.atkT || 0) - dt);
    } else {
      if (f.state === 'seek') {
        f.scan = (f.scan || 0) - dt;
        let it = f.tgt && !f.tgt.dead ? f.tgt : null;
        if (!it && f.scan <= 0) {
          let bd = 1e12; for (const i2 of S.items) { if (i2.dead || i2.gem || i2.t < 0.6) continue; const d = dist2(i2.x, i2.y, f.x, f.y); if (d < bd) { bd = d; it = i2; } }
          f.tgt = it; f.scan = 0.25 + vrnd() * 0.2;
        }
        if (!it) { if (f.carry.length) f.state = 'sell'; else { const dl = Math.hypot(STAGE.x - f.x, STAGE.y + 70 - f.y); if (dl > 120) walkRoute(f, STAGE.x + (f.ph % 1) * 60 - 30, STAGE.y + 70, INHAB_SPD * 0.7, dt); } }
        else { const dl = walkRoute(f, it.x, it.y, INHAB_SPD, dt); if (dl < 26 && it.t > 0.6 && !it.dead) { it.dead = true; f.tgt = null; f.carry.push(cloneEntry(it)); f.route = null; if (f.carry.length >= PORTER_CAP) f.state = 'sell'; } }
      } else {
        const dl = walkRoute(f, SELL.x + 10, SELL.y + 40, INHAB_SPD, dt);
        if (dl < 46) { f.cd -= dt; if (f.cd <= 0 && f.carry.length) { f.cd = 0.12; sellToVault(f.carry.pop()); sfx('sell', false, 1.2); } if (!f.carry.length) { f.state = 'seek'; f.route = null; } }
      }
    }
  }
}
function tickComp(dt) {
  const c = S.comp, p = S.player;
  const ox = p.x - p.face * 70, oy = p.y + 24, dl = Math.hypot(ox - c.x, oy - c.y);
  if (dl > 30) { const m = Math.min(dl, (dl > 260 ? 600 : 170) * dt); c.x += (ox - c.x) / dl * m; c.y += (oy - c.y) / dl * m; c.face = ox > c.x ? 1 : -1; c.mv = 0.15; } else c.mv = Math.max(0, (c.mv || 0) - dt);
  if (dl > 700) { c.x = ox; c.y = oy; }
  c.cd -= dt;
  if (c.cd <= 0) {
    let hit = 0; const R = 120 + 10 * Math.min(10, S.up.dmg), dmg = pDmg() * 1.4;
    for (const e of S.enemies) if (e.hp > 0 && dist2(e.x, e.y, c.x, c.y) < (R + e.r) * (R + e.r)) hit++;
    if (hit) {
      c.cd = 2.6; c.drop = 0.35; ringFx(c.x, c.y + 10, R, '#9af0b4', 0.4); sfx('boom', false, 1.6);
      for (const e of S.enemies) if (e.hp > 0 && dist2(e.x, e.y, c.x, c.y) < (R + e.r) * (R + e.r)) hurtEnemy(e, dmg);
    } else c.cd = 0.4;
  }
  c.drop = Math.max(0, (c.drop || 0) - dt);
}
function tickTimers(dt) {
  S.comboT = Math.max(0, S.comboT - dt); if (S.comboT <= 0 && S.combo > 0) S.combo = 0;
  S.comboFlash = Math.max(0, S.comboFlash - dt); S.goldPulse = Math.max(0, S.goldPulse - dt); S.frenzyT = Math.max(0, S.frenzyT - dt); S.goldRushT = Math.max(0, S.goldRushT - dt);
  S.petCd = Math.max(0, S.petCd - dt);
  if (S.encoreT > 0) { S.encoreT -= dt; if (S.encoreT <= 0 && typeof AUDIO !== 'undefined' && AUDIO.setEncore) AUDIO.setEncore(false); }
  else if (S.groove > 0) { S.grooveT -= dt; if (S.grooveT <= 0) S.groove = Math.max(0, S.groove - dt * 1.2); }
  if (S.ultCasting > 0) S.ultCasting = Math.max(0, S.ultCasting - dt);
  // wandering treasure chest
  if (!S.chest) { S.chestCd -= dt; if (S.chestCd <= 0 && S.lands.length) { const z = S.lands[Math.floor(vrnd() * S.lands.length)], w = wanderPoint(z); S.chest = { x: w.x, y: w.y, val: Math.ceil(70 * helmVal(Math.max(1, S.lands.length)) * coinMul()), t: 0 }; S.toasts.push({ txt: 'A treasure chest appeared!', t: 0, ic: 'chest' }); sfx('chest'); } }
  else {
    S.chest.t += dt;
    if (dist2(S.player.x, S.player.y, S.chest.x, S.chest.y) < 42 * 42) {
      const c = S.chest; S.wallet += c.val; S.stats.earned += c.val; S.stats.chests++; questEvent('chest', 1); questEvent('earn', c.val);
      float(c.x, c.y - 60, '+' + fmt(c.val), '#ffd94a', true); starBurst(c.x, c.y - 20, 22, ['#ffe98a', '#fff4c0', '#ff9ac8'], 320); ringFx(c.x, c.y, 90, '#ffe98a', 0.5); sfx('chest', true); buzz([30, 20, 40]);
      for (let i = 0; i < 8; i++) flyTo('coin', c.x, c.y - 10, S.player.x, S.player.y - 36, { delay: i * 0.04, dur: 0.4, arc: 60 });
      if (vrnd() < 0.4) dropItem(c.x, c.y, { gem: true }, true);
      S.chest = null; S.chestCd = CHEST_CD * (0.7 + vrnd() * 0.6);
    } else if (S.chest.t > 90) { S.chest = null; S.chestCd = 30; }
  }
}
function tickFx(dt) {
  for (const q of S.fx) q.t += dt; compact(S.fx, (q) => q.t < q.dur);
  for (const q of S.parts) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.g) q.vy += 420 * dt; } compact(S.parts, (q) => q.t < q.dur);
  if (S.fly.length) { for (const f of S.fly) f.t += dt; compact(S.fly, (f) => f.t < f.delay + f.dur); }
  for (const f of S.floats) { f.t += dt; f.y -= 30 * dt; } compact(S.floats, (f) => f.t < (f.big ? 1.6 : 0.8));
  for (const to of S.toasts) to.t += dt; compact(S.toasts, (to) => to.t < 3);
}
