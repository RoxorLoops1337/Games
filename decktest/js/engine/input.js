window.Decktest = window.Decktest || {};

(function () {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, rightClicked: false };
  const clickListeners = [];
  const rightClickListeners = [];

  function attach(canvas) {
    window.addEventListener('keydown', e => {
      if (!keys.has(e.key)) pressed.add(e.key);
      keys.add(e.key);
    });
    window.addEventListener('keyup', e => keys.delete(e.key));

    function toCanvasCoords(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    canvas.addEventListener('mousemove', e => {
      const c = toCanvasCoords(e.clientX, e.clientY);
      mouse.x = c.x;
      mouse.y = c.y;
    });
    canvas.addEventListener('mousedown', e => {
      const c = toCanvasCoords(e.clientX, e.clientY);
      mouse.x = c.x; mouse.y = c.y;
      if (e.button === 2) {
        mouse.rightClicked = true;
        for (const fn of rightClickListeners) fn(c);
      } else {
        mouse.down = true;
        mouse.clicked = true;
        for (const fn of clickListeners) fn(c);
      }
    });
    canvas.addEventListener('mouseup', () => { mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  function onClick(fn) { clickListeners.push(fn); }
  function onRightClick(fn) { rightClickListeners.push(fn); }

  function endFrame() {
    pressed.clear();
    mouse.clicked = false;
    mouse.rightClicked = false;
  }

  Decktest.input = {
    attach, endFrame, onClick, onRightClick,
    isDown: k => keys.has(k),
    wasPressed: k => pressed.has(k),
    mouse,
  };
})();
