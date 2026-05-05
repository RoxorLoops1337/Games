// Shop / placement scene: shows the board (player half placeable + foe preview),
// the bench, and a row of shop offerings. Click-driven UX:
//   * click shop slot → buy
//   * click bench unit → select; click empty player cell → place
//   * click board unit → return to bench
//   * Sell button → refund selected bench unit
window.Decktest = window.Decktest || {};

(function () {
  const { combat, units, sprite, renderer, run: runMod, encounters } = Decktest;

  const CELL_W = 80;
  const CELL_H = 60;
  const SPRITE_SCALE = 2;

  // Canvas 768 x 432, vertical layout:
  //   top bar 0..24
  //   board   30..270   (4 rows × 60)
  //   actions 276..302  (button row)
  //   bench   308..362  (54 high)
  //   shop    368..428  (60 high)
  const TOP_BAR_H = 24;
  const BOARD_Y = 30;
  const BOARD_H = combat.BOARD_ROWS * CELL_H;
  const ACTIONS_Y = BOARD_Y + BOARD_H + 6;       // 276
  const ACTIONS_H = 26;
  const BENCH_Y = ACTIONS_Y + ACTIONS_H + 6;     // 308
  const BENCH_H = 54;
  const SHOP_Y = BENCH_Y + BENCH_H + 6;          // 368
  const SHOP_H = 60;

  function makeScene(canvas, runState, rng) {
    const r = renderer.makeRenderer(canvas);

    // Refresh shop initially (free first roll).
    Decktest.shop.refreshShop(runState, rng, true);

    // UI state
    let selectedBenchIdx = -1;
    let hoverCell = null;        // { col, row } | null
    let message = '';
    let messageTtl = 0;
    let onStartBattle = null;     // callback

    // ----- helpers -----------------------------------------------------------

    function boardOrigin() {
      const w = combat.BOARD_COLS * CELL_W;
      return {
        x: Math.floor((canvas.width - w) / 2),
        y: BOARD_Y,
        w,
        h: BOARD_H,
      };
    }

    function cellRect(col, row) {
      const o = boardOrigin();
      return { x: o.x + col * CELL_W, y: o.y + row * CELL_H, w: CELL_W, h: CELL_H };
    }

    function pointInRect(p, rc) {
      return p.x >= rc.x && p.x < rc.x + rc.w && p.y >= rc.y && p.y < rc.y + rc.h;
    }

    function benchSlotRect(i) {
      const slotW = 64;
      const gap = 6;
      const totalW = runMod.MAX_BENCH * slotW + (runMod.MAX_BENCH - 1) * gap;
      const startX = Math.floor((canvas.width - totalW) / 2);
      return { x: startX + i * (slotW + gap), y: BENCH_Y, w: slotW, h: BENCH_H };
    }

    function shopSlotRect(i) {
      const slotW = 100;
      const gap = 8;
      const totalW = Decktest.shop.SHOP_SIZE * slotW + (Decktest.shop.SHOP_SIZE - 1) * gap;
      const startX = Math.floor((canvas.width - totalW) / 2);
      return { x: startX + i * (slotW + gap), y: SHOP_Y, w: slotW, h: SHOP_H };
    }

    function buttonRect(name) {
      // Centered horizontal row in the dedicated actions strip
      const widths = { reroll: 110, sell: 100, start: 130 };
      const order = ['reroll', 'sell', 'start'];
      const gap = 10;
      const total = order.reduce((s, k) => s + widths[k], 0) + gap * (order.length - 1);
      const startX = Math.floor((canvas.width - total) / 2);
      let cursor = startX;
      let result = null;
      for (const k of order) {
        const rc = { x: cursor, y: ACTIONS_Y, w: widths[k], h: ACTIONS_H };
        if (k === name) result = rc;
        cursor += widths[k] + gap;
      }
      return result;
    }

    function flash(msg, ttl) {
      message = msg;
      messageTtl = ttl == null ? 1.6 : ttl;
    }

    // ----- input handling ----------------------------------------------------

    function onClick(p) {
      // shop slots
      for (let i = 0; i < runState.shop.length; i++) {
        if (pointInRect(p, shopSlotRect(i))) {
          tryBuy(i);
          return;
        }
      }

      // bench slots
      for (let i = 0; i < runState.bench.length; i++) {
        if (pointInRect(p, benchSlotRect(i))) {
          if (selectedBenchIdx === i) selectedBenchIdx = -1;
          else selectedBenchIdx = i;
          return;
        }
      }
      // empty bench slots also deselect
      for (let i = runState.bench.length; i < runMod.MAX_BENCH; i++) {
        if (pointInRect(p, benchSlotRect(i))) {
          selectedBenchIdx = -1;
          return;
        }
      }

      // board cells
      for (let row = 0; row < combat.BOARD_ROWS; row++) {
        for (let col = 0; col < combat.BOARD_COLS; col++) {
          if (!pointInRect(p, cellRect(col, row))) continue;
          // clicked a board cell
          const placedIdx = runState.board.findIndex(b => b.col === col && b.row === row);
          if (placedIdx >= 0) {
            // returning a placed unit to bench (only player half)
            if (runMod.isPlayerCell(col)) {
              if (runMod.returnToBench(runState, placedIdx)) {
                selectedBenchIdx = -1;
              } else {
                flash('Bench is full');
              }
            }
            return;
          }
          // empty cell: try to place selected bench unit
          if (selectedBenchIdx >= 0 && runMod.isPlayerCell(col)) {
            if (runMod.placeFromBench(runState, selectedBenchIdx, col, row)) {
              selectedBenchIdx = -1;
            } else {
              flash('Cannot place there');
            }
          } else if (!runMod.isPlayerCell(col)) {
            flash('That side belongs to the foe');
          }
          return;
        }
      }

      // buttons
      const br = buttonRect('reroll');
      if (pointInRect(p, br)) { tryReroll(); return; }
      const bs = buttonRect('sell');
      if (pointInRect(p, bs)) { trySell(); return; }
      const bt = buttonRect('start');
      if (pointInRect(p, bt)) { tryStart(); return; }
    }

    function onRightClick(p) {
      // right-click bench unit = sell
      for (let i = 0; i < runState.bench.length; i++) {
        if (pointInRect(p, benchSlotRect(i))) {
          runMod.sellFromBench(runState, i);
          if (selectedBenchIdx === i) selectedBenchIdx = -1;
          flash('Sold (+1g)');
          return;
        }
      }
      // right-click placed board unit = sell
      for (let row = 0; row < combat.BOARD_ROWS; row++) {
        for (let col = 0; col < combat.BOARD_COLS; col++) {
          if (!pointInRect(p, cellRect(col, row))) continue;
          if (!runMod.isPlayerCell(col)) return;
          const placedIdx = runState.board.findIndex(b => b.col === col && b.row === row);
          if (placedIdx >= 0) {
            runMod.sellFromBoard(runState, placedIdx);
            flash('Sold (+1g)');
          }
          return;
        }
      }
    }

    function tryBuy(slot) {
      if (Decktest.shop.buy(runState, slot)) {
        // success
      } else if (!runMod.benchHasRoom(runState)) {
        flash('Bench is full');
      } else if (runState.shop[slot] == null) {
        // already bought - silent
      } else {
        flash('Not enough gold');
      }
    }

    function tryReroll() {
      if (runState.gold < runMod.REROLL_COST) {
        flash(`Reroll costs ${runMod.REROLL_COST}g`);
        return;
      }
      Decktest.shop.refreshShop(runState, rng, false);
    }

    function trySell() {
      if (selectedBenchIdx < 0) {
        flash('Select a bench unit first');
        return;
      }
      runMod.sellFromBench(runState, selectedBenchIdx);
      selectedBenchIdx = -1;
      flash('Sold (+1g)');
    }

    function tryStart() {
      if (runState.board.length === 0) {
        flash('Place at least one unit');
        return;
      }
      if (onStartBattle) onStartBattle();
    }

    // ----- drawing ----------------------------------------------------------

    function drawTopBar() {
      r.rect(0, 0, canvas.width, TOP_BAR_H, '#0c0c14');
      r.text(`ROUND ${runState.round}/${runMod.MAX_ROUND}`, 12, 6, {
        color: '#e8e8f0', font: 'bold 13px ui-monospace, monospace',
      });
      r.text(`LIVES ${runState.lives}`, 140, 6, { color: '#f87171', font: 'bold 13px ui-monospace, monospace' });
      r.text(`GOLD ${runState.gold}`, 240, 6, { color: '#fde047', font: 'bold 13px ui-monospace, monospace' });

      const subtitle = 'SHOP & PLACEMENT — click to buy / select / place. Right-click to sell.';
      r.text(subtitle, canvas.width - 12, 8, { color: '#8a8aa0', align: 'right', font: '11px ui-monospace, monospace' });
    }

    function drawBoard() {
      const o = boardOrigin();
      // tiles
      for (let row = 0; row < combat.BOARD_ROWS; row++) {
        for (let col = 0; col < combat.BOARD_COLS; col++) {
          const isPlayer = runMod.isPlayerCell(col);
          let tint = isPlayer
            ? ((col + row) % 2 === 0 ? '#10101a' : '#0c0c14')
            : ((col + row) % 2 === 0 ? '#0e0a14' : '#0a060e');
          r.rect(o.x + col * CELL_W, o.y + row * CELL_H, CELL_W, CELL_H, tint);
        }
      }
      // mid line
      const midX = o.x + (combat.BOARD_COLS / 2) * CELL_W;
      r.rect(midX - 1, o.y, 2, o.h, '#23233a');
      r.strokeRect(o.x - 1, o.y - 1, o.w + 2, o.h + 2, '#23233a', 1);

      // foe preview (dim)
      const foeRoster = encounters.rosterForRound(runState.round);
      const buff = encounters.foeBuff(runState.round);
      r.ctx.globalAlpha = 0.65;
      for (const [defId, col, row] of foeRoster) {
        drawUnitAtCell(defId, col, row, /*flip*/ true, /*foe*/ true);
      }
      r.ctx.globalAlpha = 1;

      // player placed
      for (const piece of runState.board) {
        drawUnitAtCell(piece.defId, piece.col, piece.row, false, false);
      }

      // hover hint when placing
      if (selectedBenchIdx >= 0 && hoverCell && runMod.isPlayerCell(hoverCell.col)) {
        const placed = runState.board.some(b => b.col === hoverCell.col && b.row === hoverCell.row);
        const rc = cellRect(hoverCell.col, hoverCell.row);
        const ok = !placed && runMod.boardHasRoom(runState);
        r.strokeRect(rc.x + 2, rc.y + 2, rc.w - 4, rc.h - 4, ok ? '#4ade80' : '#f87171', 2);
      }

      // foe scaling badge
      if (buff.hpMul > 1.0) {
        r.text(`FOE +${Math.round((buff.atkMul - 1) * 100)}% ATK / +${Math.round((buff.hpMul - 1) * 100)}% HP`,
          o.x + o.w - 6, o.y + 6,
          { color: '#fca5a5', align: 'right', font: '10px ui-monospace, monospace' });
      }
    }

    function drawUnitAtCell(defId, col, row, flip, foe) {
      const def = units.UNIT_DEFS[defId];
      if (!def) return;
      const rc = cellRect(col, row);
      const size = sprite.spriteSize(def.sprite);
      const w = size.w * SPRITE_SCALE;
      const h = size.h * SPRITE_SCALE;
      const dx = Math.floor(rc.x + (rc.w - w) / 2);
      const dy = Math.floor(rc.y + (rc.h - h) / 2);
      const palette = foe ? (def.foePalette || def.palette) : def.palette;
      sprite.drawSprite(r.ctx, def.sprite, palette, dx, dy, SPRITE_SCALE, flip);
    }

    function drawSlotBox(rc, opts) {
      const o = opts || {};
      r.rect(rc.x, rc.y, rc.w, rc.h, o.bg || '#15151f');
      r.strokeRect(rc.x, rc.y, rc.w, rc.h, o.border || '#23233a', 1);
    }

    function drawBench() {
      r.text('BENCH', canvas.width / 2, BENCH_Y - 12, {
        color: '#8a8aa0', align: 'center', font: '10px ui-monospace, monospace',
      });
      for (let i = 0; i < runMod.MAX_BENCH; i++) {
        const rc = benchSlotRect(i);
        drawSlotBox(rc, {
          bg: i === selectedBenchIdx ? '#1d2a1a' : '#15151f',
          border: i === selectedBenchIdx ? '#4ade80' : '#23233a',
        });
        const defId = runState.bench[i];
        if (defId) {
          const def = units.UNIT_DEFS[defId];
          const size = sprite.spriteSize(def.sprite);
          const w = size.w * SPRITE_SCALE;
          const h = size.h * SPRITE_SCALE;
          const dx = Math.floor(rc.x + (rc.w - w) / 2);
          const dy = Math.floor(rc.y + (rc.h - h) / 2 - 2);
          sprite.drawSprite(r.ctx, def.sprite, def.palette, dx, dy, SPRITE_SCALE, false);
          r.text(def.name, rc.x + rc.w / 2, rc.y + rc.h - 12, {
            color: '#e8e8f0', align: 'center', font: '9px ui-monospace, monospace',
          });
        }
      }
    }

    function drawShop() {
      r.text('SHOP', canvas.width / 2, SHOP_Y - 12, {
        color: '#8a8aa0', align: 'center', font: '10px ui-monospace, monospace',
      });
      for (let i = 0; i < Decktest.shop.SHOP_SIZE; i++) {
        const rc = shopSlotRect(i);
        const defId = runState.shop[i];
        const def = defId ? units.UNIT_DEFS[defId] : null;
        const canAfford = def && runState.gold >= def.cost && runMod.benchHasRoom(runState);
        drawSlotBox(rc, {
          bg: defId ? '#16161e' : '#0a0a10',
          border: canAfford ? '#3b8a55' : '#23233a',
        });
        if (def) {
          const size = sprite.spriteSize(def.sprite);
          const w = size.w * SPRITE_SCALE;
          const h = size.h * SPRITE_SCALE;
          const dx = Math.floor(rc.x + 4);
          const dy = Math.floor(rc.y + (rc.h - h) / 2);
          sprite.drawSprite(r.ctx, def.sprite, def.palette, dx, dy, SPRITE_SCALE, false);
          // name + cost stacked on right
          const tx = rc.x + dx - rc.x + w + 6;
          r.text(def.name, rc.x + 38, rc.y + 8, { color: '#e8e8f0', font: 'bold 11px ui-monospace, monospace' });
          r.text(def.role, rc.x + 38, rc.y + 22, { color: '#8a8aa0', font: '9px ui-monospace, monospace' });
          r.text(`${def.cost}g`, rc.x + rc.w - 6, rc.y + rc.h - 14, {
            color: canAfford ? '#fde047' : '#6b6b80', align: 'right', font: 'bold 12px ui-monospace, monospace',
          });
          r.text(`HP${def.hp} ATK${def.atk}`, rc.x + 38, rc.y + 36, {
            color: '#8a8aa0', font: '9px ui-monospace, monospace',
          });
        }
      }
    }

    function drawButton(name, label, color) {
      const rc = buttonRect(name);
      r.rect(rc.x, rc.y, rc.w, rc.h, '#1f1f30');
      r.strokeRect(rc.x, rc.y, rc.w, rc.h, color || '#2e2e48', 1);
      r.text(label, rc.x + rc.w / 2, rc.y + 7, {
        color: color || '#e8e8f0', align: 'center', font: 'bold 12px ui-monospace, monospace',
      });
    }

    function drawButtons() {
      drawButton('reroll', `REROLL ${runMod.REROLL_COST}g`,
        runState.gold >= runMod.REROLL_COST ? '#fde047' : '#5b5b6e');
      drawButton('sell', 'SELL +1g',
        selectedBenchIdx >= 0 ? '#f87171' : '#5b5b6e');
      drawButton('start', 'BATTLE',
        runState.board.length > 0 ? '#4ade80' : '#5b5b6e');
    }

    function drawMessage() {
      if (messageTtl > 0 && message) {
        const a = Math.min(1, messageTtl);
        r.ctx.globalAlpha = a;
        r.text(message, canvas.width / 2, BOARD_Y + BOARD_H - 18, {
          color: '#fde047', align: 'center', font: 'bold 13px ui-monospace, monospace',
        });
        r.ctx.globalAlpha = 1;
      }
    }

    // ----- main API ---------------------------------------------------------

    function update(dt) {
      messageTtl = Math.max(0, messageTtl - dt);

      // hover tracking for placement preview
      const m = Decktest.input.mouse;
      hoverCell = null;
      const o = boardOrigin();
      if (m.x >= o.x && m.x < o.x + o.w && m.y >= o.y && m.y < o.y + o.h) {
        hoverCell = {
          col: Math.floor((m.x - o.x) / CELL_W),
          row: Math.floor((m.y - o.y) / CELL_H),
        };
      }
    }

    function render() {
      r.clear('#050509');
      drawTopBar();
      drawBoard();
      drawBench();
      drawShop();
      drawButtons();
      drawMessage();
    }

    function refreshForNewRound() {
      Decktest.shop.refreshShop(runState, rng, true);
      selectedBenchIdx = -1;
    }

    return {
      update, render,
      onClick, onRightClick,
      setOnStartBattle: cb => { onStartBattle = cb; },
      refreshForNewRound,
    };
  }

  Decktest.shopScene = { makeScene };
})();
