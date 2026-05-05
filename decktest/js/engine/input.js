window.Decktest = window.Decktest || {};

(function () {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function attach(canvas) {
    window.addEventListener('keydown', e => {
      if (!keys.has(e.key)) pressed.add(e.key);
      keys.add(e.key);
    });
    window.addEventListener('keyup', e => keys.delete(e.key));

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * canvas.width;
      mouse.y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', () => { mouse.down = true; mouse.clicked = true; });
    canvas.addEventListener('mouseup', () => { mouse.down = false; });
  }

  function endFrame() {
    pressed.clear();
    mouse.clicked = false;
  }

  Decktest.input = {
    attach, endFrame,
    isDown: k => keys.has(k),
    wasPressed: k => pressed.has(k),
    mouse,
  };
})();
