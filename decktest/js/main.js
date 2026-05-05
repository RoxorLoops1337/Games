(function () {
  const { input, loop, combatScene } = Decktest;

  const canvas = document.getElementById('game');
  const btnStart = document.getElementById('btn-start');
  const btnReset = document.getElementById('btn-reset');
  const speedSel = document.getElementById('speed');
  const statusEl = document.getElementById('status');

  input.attach(canvas);

  const scene = combatScene.makeScene(canvas);
  scene.setSpeed(parseFloat(speedSel.value));

  btnStart.addEventListener('click', () => {
    scene.start();
    statusEl.textContent = 'Battle in progress…';
  });
  btnReset.addEventListener('click', () => {
    scene.reset();
    statusEl.textContent = 'Phase 1 — Demo Battle';
  });
  speedSel.addEventListener('change', () => {
    scene.setSpeed(parseFloat(speedSel.value));
  });

  loop.start({
    fixedDt: 1 / 60,
    update(dt) {
      if (input.wasPressed(' ') || input.wasPressed('Enter')) {
        scene.start();
        statusEl.textContent = 'Battle in progress…';
      }
      if (input.wasPressed('r') || input.wasPressed('R')) {
        scene.reset();
        statusEl.textContent = 'Phase 1 — Demo Battle';
      }
      scene.update(dt);
      input.endFrame();

      if (scene.isFinished()) {
        statusEl.textContent = scene.arena.state === 'won'
          ? 'Victory — press R to rematch'
          : 'Defeat — press R to rematch';
      }
    },
    render() { scene.render(); },
  });
})();
