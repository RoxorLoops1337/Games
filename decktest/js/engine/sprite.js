// Pixel-art sprite system. A sprite is an array of strings (rows of chars).
// Each char maps to a color via the unit's palette. ' ' or '.' = transparent.
window.Decktest = window.Decktest || {};

(function () {
  function drawSprite(ctx, sprite, palette, dx, dy, scale, flip) {
    scale = scale || 1;
    const h = sprite.length;
    const w = sprite[0].length;
    for (let y = 0; y < h; y++) {
      const row = sprite[y];
      for (let x = 0; x < w; x++) {
        const ch = row.charAt(x);
        if (ch === ' ' || ch === '.' || ch === '') continue;
        const color = palette[ch];
        if (!color) continue;
        const px = flip ? (dx + (w - 1 - x) * scale) : (dx + x * scale);
        ctx.fillStyle = color;
        ctx.fillRect(px | 0, (dy + y * scale) | 0, scale, scale);
      }
    }
  }

  // Returns { w, h } in unscaled pixels.
  function spriteSize(sprite) {
    return { w: sprite[0].length, h: sprite.length };
  }

  Decktest.sprite = { drawSprite, spriteSize };
})();
