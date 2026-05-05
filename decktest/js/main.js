// Top-level scene manager: shop → battle → result → shop. Run-over screen ends it.
(function () {
  const { input, loop, combatScene, shopScene, run: runMod, encounters, rng: rngMod } = Decktest;

  const canvas = document.getElementById('game');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');
  const speedSel = document.getElementById('speed');
  const statusEl = document.getElementById('status');

  input.attach(canvas);

  // Run-wide state
  let runState = runMod.makeRun();
  const rng = rngMod.makeRng();

  // Scenes
  const shopS = shopScene.makeScene(canvas, runState, rng);
  const battleS = combatScene.makeScene(canvas);
  battleS.setSpeed(parseFloat(speedSel.value));

  // Mode: 'shop' | 'battle' | 'gameover'
  let mode = 'shop';
  let battleDwell = -1;       // set to >0 once the battle finishes, then counts down

  function setStatus(text) { statusEl.textContent = text; }

  function startBattle() {
    if (runState.board.length === 0) return;
    const playerRoster = runState.board.map(p => ({ defId: p.defId, col: p.col, row: p.row }));
    const foeRoster = encounters.rosterForRound(runState.round);
    const buff = encounters.foeBuff(runState.round);
    battleS.loadRosters(playerRoster, foeRoster, buff);
    battleS.start();
    mode = 'battle';
    battleDwell = -1;
    setStatus(`Battle — round ${runState.round}`);
  }

  function finishBattle(won) {
    runMod.endRound(runState, won);
    if (runState.runOver) {
      mode = 'gameover';
      setStatus(runState.victory ? 'RUN COMPLETE' : 'RUN OVER');
    } else {
      shopRef.refreshForNewRound();
      mode = 'shop';
      setStatus(`Round ${runState.round}/${runMod.MAX_ROUND} — ${won ? 'won' : 'lost'} last battle`);
    }
  }

  function newRun() {
    runState = runMod.makeRun();
    // rebuild the shop scene against the fresh state
    rebuildShop();
    mode = 'shop';
    setStatus(`Round ${runState.round}/${runMod.MAX_ROUND} — shop`);
  }

  // Build shop scene against current runState; needed when state object is replaced.
  let shopRef = shopS;
  function rebuildShop() {
    shopRef = shopScene.makeScene(canvas, runState, rng);
    shopRef.setOnStartBattle(startBattle);
  }

  // Wire shop input
  shopS.setOnStartBattle(startBattle);
  shopRef = shopS;

  input.onClick(p => {
    if (mode === 'shop') shopRef.onClick(p);
    else if (mode === 'gameover') {
      // any click on the game-over overlay starts a new run
      newRun();
    }
  });
  input.onRightClick(p => {
    if (mode === 'shop') shopRef.onRightClick(p);
  });

  btnStart.addEventListener('click', () => {
    if (mode === 'shop') startBattle();
    else if (mode === 'gameover') newRun();
  });
  btnReset.addEventListener('click', () => {
    newRun();
  });
  speedSel.addEventListener('change', () => {
    battleS.setSpeed(parseFloat(speedSel.value));
  });

  setStatus(`Round ${runState.round}/${runMod.MAX_ROUND} — shop`);

  loop.start({
    fixedDt: 1 / 60,
    update(dt) {
      if (mode === 'shop') {
        shopRef.update(dt);
        if (input.wasPressed('Enter') || input.wasPressed(' ')) startBattle();
      } else if (mode === 'battle') {
        battleS.update(dt);
        if (battleS.isFinished()) {
          if (battleDwell < 0) battleDwell = 1.6;
          else battleDwell -= dt;
          if (battleDwell <= 0) {
            finishBattle(battleS.isPlayerVictory());
            battleDwell = -1;
          }
        }
      }
      input.endFrame();
    },
    render() {
      if (mode === 'shop') shopRef.render();
      else if (mode === 'battle') battleS.render();
      else if (mode === 'gameover') drawGameOver();
    },
  });

  function drawGameOver() {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050509';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const w = 480, h = 220;
    const x = Math.floor((canvas.width - w) / 2);
    const y = Math.floor((canvas.height - h) / 2);
    ctx.fillStyle = '#0b0b12';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#23233a';
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = runState.victory ? '#4ade80' : '#f87171';
    ctx.font = 'bold 28px ui-monospace, monospace';
    ctx.fillText(runState.victory ? 'CYPHER MASTERED' : 'BEAT DROPPED',
                 x + w / 2, y + 28);

    ctx.fillStyle = '#e8e8f0';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`Round reached: ${runState.round}/${runMod.MAX_ROUND}`, x + w / 2, y + 80);
    ctx.fillText(`Lives remaining: ${Math.max(0, runState.lives)}`, x + w / 2, y + 102);
    ctx.fillText(`Gold: ${runState.gold}`, x + w / 2, y + 124);

    ctx.fillStyle = '#8a8aa0';
    ctx.fillText('Click anywhere or press Reset for a new run.', x + w / 2, y + 168);
  }
})();
