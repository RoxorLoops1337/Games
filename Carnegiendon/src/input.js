// Keyboard input. Tracks held keys and one-shot "just pressed" events.
const Input = (() => {
  const keys = new Set();
  const pressed = new Set();   // cleared each frame after consume()
  const released = new Set();

  function isDown(...names) {
    for (const n of names) if (keys.has(n)) return true;
    return false;
  }
  function wasPressed(...names) {
    for (const n of names) if (pressed.has(n)) return true;
    return false;
  }
  function endFrame() {
    pressed.clear();
    released.clear();
  }

  // Normalize the wide variety of key.code / key.key values into a small
  // alphabet that the rest of the game can talk in.
  function normalize(e) {
    const k = e.key;
    if (k === "ArrowUp" || k === "w" || k === "W") return "UP";
    if (k === "ArrowDown" || k === "s" || k === "S") return "DOWN";
    if (k === "ArrowLeft" || k === "a" || k === "A") return "LEFT";
    if (k === "ArrowRight" || k === "d" || k === "D") return "RIGHT";
    if (k === " ") return "SPACE";
    if (k === "Shift") return "SHIFT";
    if (k === "Escape") return "ESC";
    if (k === "p" || k === "P") return "P";
    if (k === "r" || k === "R") return "R";
    if (k === "m" || k === "M") return "M";
    if (k === "Enter") return "ENTER";
    return k.toUpperCase();
  }

  window.addEventListener("keydown", (e) => {
    const k = normalize(e);
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (["UP","DOWN","LEFT","RIGHT","SPACE","SHIFT"].includes(k)) e.preventDefault();
  });

  window.addEventListener("keyup", (e) => {
    const k = normalize(e);
    keys.delete(k);
    released.add(k);
  });

  // Blur tends to leave keys "stuck" — clear them on focus loss.
  window.addEventListener("blur", () => { keys.clear(); });

  return { isDown, wasPressed, endFrame };
})();
