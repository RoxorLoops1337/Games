// 04-hit-juice (round 5): a digit atlas for the HP numbers on the cells. Each glyph is baked once per outline colour
// and the number is assembled with drawImage, so a changing HP never bakes a new text strip (the old path baked one
// strip per distinct number and size). Render-only.
const GLYPHS = '0123456789k';
const BASE = 44;                         // font size the glyphs are baked at
const ADV = { k: 0.56, def: 0.6 };       // advance per glyph, in em
const GW = 40, GH = 64;                  // baked glyph box (logical units)

export function createDigitAtlas(kit) {
  const sprs = new Map();
  function glyph(ch, fill, stroke) {
    const key = 'dg|' + ch + '|' + fill + '|' + stroke;
    let s = sprs.get(key);
    if (s !== undefined) return s;
    s = kit.bake(key, GW, GH, g => {
      g.font = `800 ${BASE}px system-ui, -apple-system, "Segoe UI", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2, BASE * 0.2); g.strokeStyle = stroke; g.strokeText(ch, 0, 0); g.fillStyle = fill; g.fillText(ch, 0, 0);
    });
    sprs.set(key, s); return s;
  }
  // true when drawn; false means "use the normal text path" (unknown character or no canvas support)
  function draw(ctx, str, x, y, size, fill, stroke) {
    if (!kit || !kit.bake) return false;
    str = String(str);
    for (let i = 0; i < str.length; i++) if (GLYPHS.indexOf(str[i]) < 0) return false;
    const k = size / BASE, n = str.length;
    let total = 0; for (let i = 0; i < n; i++) total += (ADV[str[i]] || ADV.def) * size;
    let cx = x - total / 2;
    for (let i = 0; i < n; i++) {
      const ch = str[i], a = (ADV[ch] || ADV.def) * size, spr = glyph(ch, fill, stroke);
      if (!spr || !spr.c) return false;
      ctx.drawImage(spr.c, cx + a / 2 - GW * k / 2, y - GH * k / 2, GW * k, GH * k);
      cx += a;
    }
    return true;
  }
  return { draw };
}
