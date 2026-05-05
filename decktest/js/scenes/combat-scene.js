// Combat scene: renders the arena, runs the simulation, handles win/lose.
window.Decktest = window.Decktest || {};

(function () {
  const { combat, units, sprite, renderer } = Decktest;

  const CELL_W = 80;
  const CELL_H = 78;
  const SPRITE_SCALE = 3;

  // Board origin within the canvas (centered horizontally, top padded for HUD).
  function boardOrigin(canvas) {
    const boardW = combat.BOARD_COLS * CELL_W;
    const boardH = combat.BOARD_ROWS * CELL_H;
    return {
      x: Math.floor((canvas.width - boardW) / 2),
      y: Math.floor((canvas.height - boardH) / 2) + 12,
      w: boardW,
      h: boardH,
    };
  }

  function colRowToPx(canvas, col, row) {
    const o = boardOrigin(canvas);
    return {
      x: o.x + col * CELL_W + CELL_W / 2,
      y: o.y + row * CELL_H + CELL_H / 2,
    };
  }

  function makeScene(canvas) {
    const r = renderer.makeRenderer(canvas);
    const arena = combat.makeArena();
    let speed = 1;
    let resultLatch = null;

    function setSpeed(s) { speed = Math.max(0.1, Math.min(10, s)); }

    function loadDemo() {
      combat.reset(arena);
      resultLatch = null;

      // Player team — front line tanks, back line damage + healer.
      [
        ['kick',  1, 1],
        ['kick',  1, 2],
        ['snare', 2, 1],
        ['hihat', 2, 2],
        ['vocal', 0, 0],
        ['hihat', 0, 3],
      ].forEach(([id, c, r]) => combat.addUnit(arena, units.spawn(id, 'player', c, r)));

      // Foe team — mirrored on the right side.
      [
        ['kick',  6, 1],
        ['snare', 6, 2],
        ['snare', 5, 1],
        ['hihat', 5, 2],
        ['vocal', 7, 0],
        ['hihat', 7, 3],
      ].forEach(([id, c, r]) => combat.addUnit(arena, units.spawn(id, 'foe', c, r)));
    }

    function start() {
      if (arena.state === 'won' || arena.state === 'lost' || arena.state === 'idle') {
        if (arena.units.length === 0 || arena.state !== 'idle') loadDemo();
        arena.state = 'fighting';
      }
    }

    function reset() {
      loadDemo();
    }

    function update(dt) {
      const stepDt = dt * speed;
      // sub-step large speed multipliers so collisions remain stable
      const steps = Math.max(1, Math.ceil(speed));
      const sub = stepDt / steps;
      for (let i = 0; i < steps; i++) combat.update(arena, sub);

      if (!resultLatch && (arena.state === 'won' || arena.state === 'lost')) {
        resultLatch = { state: arena.state, t: 0 };
      }
      if (resultLatch) resultLatch.t += dt;
    }

    function drawBoardGrid() {
      const o = boardOrigin(canvas);
      // alternating tiles
      for (let row = 0; row < combat.BOARD_ROWS; row++) {
        for (let col = 0; col < combat.BOARD_COLS; col++) {
          const tint = (col + row) % 2 === 0 ? '#10101a' : '#0c0c14';
          r.rect(o.x + col * CELL_W, o.y + row * CELL_H, CELL_W, CELL_H, tint);
        }
      }
      // mid-line
      const midX = o.x + (combat.BOARD_COLS / 2) * CELL_W;
      r.rect(midX - 1, o.y, 2, o.h, '#1f1f30');
      // border
      r.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2, '#23233a', 1);
    }

    function drawUnit(u) {
      const px = colRowToPx(canvas, u.x, u.y);
      const size = sprite.spriteSize(u.def.sprite);
      const w = size.w * SPRITE_SCALE;
      const h = size.h * SPRITE_SCALE;

      const isDead = u.hp <= 0;

      // shadow
      r.ctx.globalAlpha = isDead ? 0.2 : 0.45;
      r.ctx.fillStyle = '#000';
      r.ctx.beginPath();
      r.ctx.ellipse(px.x, px.y + h / 2 - 4, w / 2.6, 4, 0, 0, Math.PI * 2);
      r.ctx.fill();
      r.ctx.globalAlpha = 1;

      // bob + attack lunge (still bodies don't bob)
      const bob = isDead ? 0 : Math.sin(u.bobPhase) * 1.5;
      const lungeDx = u.target ? Math.sign(u.target.x - u.x) : (u.team === 'player' ? 1 : -1);
      const lunge = isDead ? 0 : u.attackAnim * 6 * lungeDx;

      const dx = Math.floor(px.x - w / 2 + lunge);
      const dy = Math.floor(px.y - h / 2 + bob + (isDead ? 6 : 0));

      const flip = u.team === 'foe';
      const palette = u.team === 'player' ? u.def.palette : (u.def.foePalette || u.def.palette);

      // dead bodies render dim and rotated 90° (toppled)
      if (isDead) {
        r.ctx.save();
        r.ctx.globalAlpha = 0.35;
        r.ctx.translate(px.x, px.y + h / 2 - 4);
        r.ctx.rotate(Math.PI / 2);
        sprite.drawSprite(r.ctx, u.def.sprite, palette,
          Math.floor(-w / 2), Math.floor(-h / 2), SPRITE_SCALE, flip);
        r.ctx.restore();
        return;
      }

      // sprite + hit flash
      sprite.drawSprite(r.ctx, u.def.sprite, palette, dx, dy, SPRITE_SCALE, flip);
      if (u.flashTimer > 0) {
        r.ctx.globalAlpha = u.flashTimer / 0.15 * 0.55;
        sprite.drawSprite(r.ctx, u.def.sprite, makeFlashPalette(palette), dx, dy, SPRITE_SCALE, flip);
        r.ctx.globalAlpha = 1;
      }

      // hp bar
      const barW = w - 8;
      const barH = 5;
      const barX = Math.floor(px.x - barW / 2);
      const barY = dy - 9;
      const ratio = u.hp / u.maxHp;
      const hpColor = u.team === 'player' ? '#4ade80' : '#f97316';
      r.hpBar(barX, barY, barW, barH, ratio, hpColor);
    }

    function makeFlashPalette(p) {
      const flash = {};
      for (const k of Object.keys(p)) flash[k] = '#ffffff';
      return flash;
    }

    function drawEvents() {
      for (const ev of arena.events) {
        const a = 1 - ev.age / ev.ttl;
        if (ev.kind === 'floater') {
          const px = colRowToPx(canvas, ev.x, ev.y);
          r.ctx.globalAlpha = a;
          r.text(ev.text, px.x, px.y - 30 - ev.age * 30, {
            color: ev.color, align: 'center', font: 'bold 13px ui-monospace, Menlo, monospace',
          });
          r.ctx.globalAlpha = 1;
        } else if (ev.kind === 'spark') {
          const px = colRowToPx(canvas, ev.x, ev.y);
          r.ctx.globalAlpha = a;
          r.ctx.fillStyle = '#fff7c2';
          const sz = 4 + (1 - a) * 8;
          r.ctx.fillRect(px.x - sz / 2, px.y - sz / 2 - 12, sz, sz);
          r.ctx.globalAlpha = 1;
        }
      }
    }

    function drawResult() {
      if (!resultLatch) return;
      const w = 360, h = 120;
      const x = Math.floor((canvas.width - w) / 2);
      const y = Math.floor((canvas.height - h) / 2);
      r.ctx.globalAlpha = 0.85;
      r.rect(x, y, w, h, '#0b0b12');
      r.ctx.globalAlpha = 1;
      r.strokeRect(x, y, w, h, '#23233a', 1);

      const isWin = resultLatch.state === 'won';
      r.text(isWin ? 'CYPHER CLEARED' : 'BEAT DROPPED',
             x + w / 2, y + 28,
             { color: isWin ? '#4ade80' : '#f87171', align: 'center',
               font: 'bold 22px ui-monospace, monospace' });
      r.text('Press R or click Reset to rematch.',
             x + w / 2, y + 70,
             { color: '#8a8aa0', align: 'center' });
    }

    function render() {
      r.clear('#050509');
      drawBoardGrid();

      // draw dead units first (they're occluded), then living
      const drawList = arena.units.slice().sort((a, b) => {
        if ((a.hp <= 0) !== (b.hp <= 0)) return a.hp <= 0 ? -1 : 1;
        return a.y - b.y;
      });
      for (const u of drawList) drawUnit(u);

      drawEvents();

      // top status banner
      const status = arena.state === 'fighting'
        ? `BATTLE — t=${arena.time.toFixed(1)}s   speed ${speed.toFixed(1)}x`
        : arena.state === 'idle' ? 'PRESS START'
        : arena.state === 'won' ? 'VICTORY' : 'DEFEAT';
      r.text(status, canvas.width / 2, 8, {
        color: '#8a8aa0', align: 'center',
        font: '11px ui-monospace, monospace',
      });

      drawResult();
    }

    loadDemo();

    return {
      arena,
      start,
      reset,
      setSpeed,
      update,
      render,
      isFinished: () => arena.state === 'won' || arena.state === 'lost',
    };
  }

  Decktest.combatScene = { makeScene };
})();
