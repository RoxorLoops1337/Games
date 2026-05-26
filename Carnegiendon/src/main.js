// Entry point: wire up menu buttons and start the game loop.
(() => {
  const canvas = document.getElementById("game");

  function bindMode(btn) {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      Game.newGame(mode);
    });
  }
  document.querySelectorAll("#menu .menu-buttons button").forEach(bindMode);

  document.getElementById("resume-btn").addEventListener("click", () => {
    // Synthesize a P keypress on window so the input layer sees it and the
    // state-machine's existing pause-toggle handler picks it up next tick.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { key: "p", bubbles: true }));
  });
  document.getElementById("quit-btn").addEventListener("click", () => Game.quitToMenu());
  document.getElementById("retry-btn").addEventListener("click", () => Game.retry());
  document.getElementById("gameover-menu-btn").addEventListener("click", () => Game.quitToMenu());
  document.getElementById("next-btn").addEventListener("click", () => Game.nextLevel());
  document.getElementById("victory-menu-btn").addEventListener("click", () => Game.quitToMenu());

  // Tap-anywhere first interaction to unlock audio on browsers that need it.
  document.body.addEventListener("pointerdown", () => {
    Audio.init();
    Audio.resume();
  }, { once: false });

  Game.start(canvas);
})();
