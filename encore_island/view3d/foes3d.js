// Encore Island 3D, creature sync. Reads S.enemies / S.dead and shows each foe as a baked actor from the act files (foes_a / foes_b / foes_c).
// Missing art falls back to a generic coloured blob so a foe is never invisible. Actors are created lazily (at most 2 per frame), recycled when
// they support reset(), and disposed otherwise. Foes use blob shadows (only bosses cast real ones); HP bars, boss names and the elite star are HUD labels.
import * as THREE from 'three';
import { Builder, C, W, TAU, clamp, damp, rng } from './kit.js';

const REG = {}; // art name -> build(opts)
async function loadActs() {
  for (const f of ['./foes_a.js', './foes_b.js', './foes_c.js']) {
    try { const m = await import(f); for (const k in m) if (/^FOES_/.test(k)) Object.assign(REG, m[k]); } catch (e) { console.warn('[3d] ' + f + ' unavailable: ' + e.message); }
  }
}
const ease = (u) => { const c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; };
const shortYaw = (a, b) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return d; };

function fallbackFoe(art, opts) { // a plump coloured blob with eyes: only seen when an act file is missing an art name
  const col = (typeof foeCol === 'function' ? 0 : 0), g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const hex = opts && opts.hex ? opts.hex : 0xff7eb6, b = new Builder();
  b.ball(hex, 0, 0.55, 0, 0.5, 0.95); b.ball(0xffffff, -0.17, 0.66, 0.4, 0.12); b.ball(0xffffff, 0.17, 0.66, 0.4, 0.12); b.ball(0x2d170f, -0.17, 0.66, 0.5, 0.06); b.ball(0x2d170f, 0.17, 0.66, 0.5, 0.06);
  root.add(b.build());
  return { group: g, height: 1.2, radius: 0.55, update(dt, t, st) { root.position.y = Math.abs(Math.sin(t * 6 + 1)) * 0.06 * Math.min(1, (st.speed || 0) * 2); const k = 1 - 0.25 * (st.die || 0); root.scale.set(k, k, k); root.rotation.y = (st.die || 0) * 8; }, attack() {}, die() {}, isDead: () => false };
}

export async function init(V) {
  await loadActs();
  const recs = new Map(), idle = {}; // enemy object -> record; art key -> spare actors
  let frame = 0, built = 0; const st0 = () => ({ speed: 0, atk: false, hurt: 0, die: 0, elite: false, gold: false, slow: false, glow: false, singing: false, cast: false, cheer: false, carry: null });
  function artOf(e) { return typeof foeArtName === 'function' ? foeArtName(e.k, e.boss) : 'kappa'; }
  function make(e) {
    const art = artOf(e), key = art + (e.elite ? ':e' : '') + (e.gold ? ':g' : ''), spare = idle[key];
    if (spare && spare.length) return { actor: spare.pop(), art, key };
    let actor; const f = REG[art], opts = { boss: !!e.boss, elite: !!e.elite, gold: !!e.gold, hex: typeof foeCol === 'function' ? new THREE.Color(foeCol(e.k)).getHex() : 0xff7eb6 };
    try { actor = f ? f(opts) : fallbackFoe(art, opts); } catch (err) { console.warn('[3d] foe ' + art + ': ' + err.message); actor = fallbackFoe(art, opts); }
    try { V.bake(actor, { cast: !!e.boss }); } catch (err) { console.warn('[3d] bake ' + art + ': ' + err.message); }
    built++; return { actor, art, key };
  }
  function release(rec) {
    V.dyn.remove(rec.actor.group); rec.actor.group.visible = false;
    if (rec.actor.reset && !rec.noReuse) { try { rec.actor.reset(); const a = (idle[rec.key] || (idle[rec.key] = [])); if (a.length < 6) { a.push(rec.actor); return; } } catch (e) { /* fall through to dispose */ } }
    try { if (rec.actor.dispose) rec.actor.dispose(); if (rec.actor.baked) rec.actor.baked.dispose(); } catch (e) { /* ignore */ }
  }
  function drive(rec, e, dt, t, dying, d) {
    const a = rec.actor, g = a.group, st = rec.st, p = S.player, vx = e.vx || 0, vy = e.vy || 0, sp = Math.hypot(vx, vy);
    const x = e.x * W, z = e.y * W, sc = (e.r * W / (a.radius || 0.55)) * (dying ? 1 : ease(clamp(e.born === undefined ? 1 : e.born, 0, 1)) * 0.6 + 0.4 * (e.born === undefined ? 1 : e.born));
    st.speed = dying ? 0 : clamp(sp / 62, 0, 1); st.atk = !dying && (e.atkCd || 0) > 0.55; st.hurt = clamp((e.hurt || 0) * 4, 0, 1); st.die = dying ? clamp(d.t / 0.7, 0, 1) : 0;
    st.elite = !!e.elite; st.gold = !!e.gold; st.slow = (e.slowT || 0) > 0; st.glow = !!(e.elite || e.gold);
    let target = rec.yaw; if (st.atk) target = Math.atan2(p.x - e.x, p.y - e.y); else if (sp > 8) target = Math.atan2(vx, vy); else if (rec.first) { target = e.face > 0 ? 0.5 : -0.5; }
    rec.first = false; rec.yaw += shortYaw(rec.yaw, target) * Math.min(1, dt * 9); g.rotation.y = rec.yaw;
    g.position.set(x, 0, z); g.scale.setScalar(Math.max(0.001, sc)); g.visible = true;
    if (st.atk && !rec.wasAtk && a.attack) { try { a.attack(); } catch (e2) { /* optional */ } } rec.wasAtk = st.atk;
    if (dying && !rec.dieCalled) { rec.dieCalled = true; if (a.die) { try { a.die(); } catch (e2) { /* optional */ } } }
    a.update(dt, t, st);
    if (!dying) {
      V.blobs.add(x, z, e.r * W * 1.05 * Math.min(1, sc / (e.r * W / (a.radius || 0.55))), 0.3);
      const top = (a.height || 1.2) * sc, L = V.labels;
      if (e.hp < e.max) L.bar(e.hp / e.max, x, top + 0.12, z, e.boss ? 74 : 40, '#7fe36a', '#ff6a8a', e.boss);
      if (e.boss && typeof BOSS_NAMES !== 'undefined') L.pill(BOSS_NAMES[foeAct(e.k)], x, top + 0.55, z, { c1: '#ffb0c0', c2: '#ff5a7a', px: 12 });
      if (e.elite) L.icon('star', x, top + 0.45, z, 24);
    }
  }
  return {
    REG, stats: () => ({ live: recs.size, built, registered: Object.keys(REG).length }),
    update(dt, t, focus) {
      frame++; let made = 0;
      const fx = focus.x, fz = focus.z, FAR = 70 * 70;
      for (const e of S.enemies) {
        let rec = recs.get(e);
        const dx = e.x * W - fx, dz = e.y * W - fz; if (dx * dx + dz * dz > FAR) { if (rec) rec.seen = frame, rec.actor.group.visible = false; continue; }
        if (!rec) { if (made >= 2) continue; made++; const m = make(e); rec = { actor: m.actor, art: m.art, key: m.key, e, seen: 0, yaw: 0, first: true, st: st0(), dead: null, noReuse: false }; recs.set(e, rec); V.dyn.add(rec.actor.group); }
        rec.seen = frame; drive(rec, e, dt, t, false, null);
      }
      for (const [e, rec] of recs) {
        if (rec.seen === frame && !rec.dead) continue;
        if (!rec.dead) { // gone from S.enemies: killed (a fresh S.dead entry sits where it stood) or simply removed
          let d = null; for (const q of S.dead) if (Math.abs(q.x - e.x) < 2 && Math.abs(q.y - e.y) < 2 && q.k === e.k) { d = q; break; }
          if (d) rec.dead = d; else { release(rec); recs.delete(e); continue; }
        }
        if (S.dead.indexOf(rec.dead) < 0 || rec.dead.t >= 0.7) { rec.noReuse = rec.actor.isDead ? !!rec.actor.isDead() : false; release(rec); recs.delete(e); continue; }
        drive(rec, e, dt, t, true, rec.dead);
      }
    },
    dispose() { for (const [, rec] of recs) release(rec); recs.clear(); },
  };
}
