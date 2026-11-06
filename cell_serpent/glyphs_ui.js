// Round 5 (agent 19): glyphs for the round HUD buttons (pause, stats). Painted into the baked HUD chrome layer,
// so they cost nothing per frame. Soft drop shadow, rounded caps, a light top gradient and a gloss line.
const rrect = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };

function bar(c, x, y, w, h, top, bot) {
  c.fillStyle = 'rgba(0,0,0,.38)'; rrect(c, x + 0.5, y + 2, w, h, w / 2); c.fill();   // soft drop
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, top); g.addColorStop(1, bot);
  c.fillStyle = g; rrect(c, x, y, w, h, w / 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.55)'; rrect(c, x + 1.2, y + 1.5, w * 0.32, h - 3, w * 0.16); c.fill();   // gloss
}

// two rounded bars, centred on (x, y)
export function paintPauseGlyph(c, x, y) {
  for (const dx of [-11, 4]) bar(c, x + dx, y - 11, 7.5, 22, '#ffffff', '#ffd6ee');
}

// three rising bars (pink, gold, cyan) like a level meter, centred on (x, y)
export function paintStatsGlyph(c, x, y) {
  const cols = [['#ffd6ee', '#ff7ac0'], ['#fff3b0', '#ffc83d'], ['#c8f8ff', '#4fd8f0']];
  for (let i = 0; i < 3; i++) { const h = [12, 20, 28][i]; bar(c, x - 15 + i * 11, y + 14 - h, 8, h, cols[i][0], cols[i][1]); }
}
