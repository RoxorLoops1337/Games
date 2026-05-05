// Combat system: tick-based simulation on a grid.
// Each unit picks the nearest living enemy, walks toward it, attacks on cd.
// Vocal additionally periodically heals the lowest-hp ally in range.
window.Decktest = window.Decktest || {};

(function () {
  const BOARD_COLS = 8;
  const BOARD_ROWS = 4;

  function makeArena() {
    return {
      cols: BOARD_COLS,
      rows: BOARD_ROWS,
      units: [],          // all combatants (alive or dead)
      events: [],         // floating text, hit sparks
      state: 'idle',      // 'idle' | 'fighting' | 'won' | 'lost'
      time: 0,
    };
  }

  function reset(arena) {
    arena.units = [];
    arena.events = [];
    arena.state = 'idle';
    arena.time = 0;
  }

  function addUnit(arena, unit) {
    arena.units.push(unit);
  }

  function dist(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function alive(u) { return u.hp > 0; }

  function findNearestEnemy(arena, unit) {
    let best = null;
    let bestD = Infinity;
    for (const other of arena.units) {
      if (!alive(other)) continue;
      if (other.team === unit.team) continue;
      const d = dist(unit, other);
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  function findHealTarget(arena, unit) {
    let best = null;
    let bestRatio = 1;
    for (const other of arena.units) {
      if (!alive(other)) continue;
      if (other.team !== unit.team) continue;
      if (other === unit) continue;
      if (dist(unit, other) > unit.def.range) continue;
      const ratio = other.hp / other.maxHp;
      if (ratio < bestRatio && ratio < 0.95) {
        bestRatio = ratio;
        best = other;
      }
    }
    return best;
  }

  function moveToward(unit, target, dt) {
    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const step = unit.def.moveSpeed * dt;
    if (step >= len) {
      unit.x = target.x;
      unit.y = target.y;
    } else {
      unit.x += (dx / len) * step;
      unit.y += (dy / len) * step;
    }
    unit.col = Math.round(unit.x);
    unit.row = Math.round(unit.y);
  }

  function spawnFloater(arena, unit, text, color) {
    arena.events.push({
      kind: 'floater',
      x: unit.x, y: unit.y,
      text, color,
      ttl: 0.9, age: 0,
    });
  }

  function spawnSpark(arena, unit) {
    arena.events.push({
      kind: 'spark',
      x: unit.x, y: unit.y,
      ttl: 0.18, age: 0,
    });
  }

  function dealDamage(arena, attacker, victim) {
    const dmg = attacker.atk != null ? attacker.atk : attacker.def.atk;
    victim.hp -= dmg;
    victim.flashTimer = 0.15;
    spawnFloater(arena, victim, '-' + dmg, '#fca5a5');
    spawnSpark(arena, victim);
    if (victim.hp <= 0) {
      victim.hp = 0;
      spawnFloater(arena, victim, 'KO', '#f87171');
    }
  }

  function applyHeal(arena, healer, target) {
    const amt = healer.def.heal;
    target.hp = Math.min(target.maxHp, target.hp + amt);
    spawnFloater(arena, target, '+' + amt, '#86efac');
  }

  function update(arena, dt) {
    if (arena.state !== 'fighting') return;
    arena.time += dt;

    // tick events
    for (const ev of arena.events) ev.age += dt;
    arena.events = arena.events.filter(ev => ev.age < ev.ttl);

    for (const u of arena.units) {
      if (!alive(u)) continue;

      // visual timers
      u.flashTimer = Math.max(0, u.flashTimer - dt);
      u.bobPhase += dt * 4;
      u.attackAnim = Math.max(0, u.attackAnim - dt * 3);

      // refresh target if dead/missing
      if (!u.target || !alive(u.target)) {
        u.target = findNearestEnemy(arena, u);
      }
      if (!u.target) continue;

      const d = dist(u, u.target);
      const inRange = d <= u.def.range;

      // healer behaviour
      if (u.def.heal) {
        u.healCd -= dt;
        if (u.healCd <= 0) {
          const ht = findHealTarget(arena, u);
          if (ht) {
            applyHeal(arena, u, ht);
            u.healCd = u.def.healCooldown;
          } else {
            u.healCd = 0.3; // re-check soon
          }
        }
      }

      // attack
      u.atkCd -= dt;
      if (inRange) {
        if (u.atkCd <= 0) {
          dealDamage(arena, u, u.target);
          u.atkCd = 1 / u.def.atkSpeed;
          u.attackAnim = 1;
        }
      } else {
        moveToward(u, u.target, dt);
      }
    }

    // outcome check
    const playerAlive = arena.units.some(u => u.team === 'player' && alive(u));
    const foeAlive = arena.units.some(u => u.team === 'foe' && alive(u));
    if (!playerAlive && !foeAlive) arena.state = 'lost';
    else if (!foeAlive) arena.state = 'won';
    else if (!playerAlive) arena.state = 'lost';
  }

  Decktest.combat = {
    BOARD_COLS, BOARD_ROWS,
    makeArena, reset, addUnit, update,
  };
})();
