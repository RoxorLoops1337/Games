// Text width cache (pure: takes the measuring function, no DOM). Round 2 perf: `app.text` with `tab: true` (tabular digits) used to call
// measureText twice per character per frame, and `app.measure` once per call; a width never changes for a given font + letter spacing + string.
// Keys are the CSS font string (what ctx.font reads back as) plus the letter spacing, so a different size, face or spacing never shares a width.
// Bounded: when a table passes its cap it is cleared (the text of a screen refills it in a frame or two).
export const MAX_STR = 1500, MAX_FONTS = 40, MAX_CHARS = 220;
export function createTextMetrics(measure) {
  const fonts = new Map(); // fontKey -> { cell, chars: Map(char -> width), strs: Map(string -> width), tabs: Map(string -> width) }
  const stats = { hits: 0, misses: 0 };
  function slot(fk) {
    let f = fonts.get(fk);
    if (!f) { if (fonts.size >= MAX_FONTS) fonts.clear(); f = { cell: -1, chars: new Map(), strs: new Map(), tabs: new Map() }; fonts.set(fk, f); }
    return f;
  }
  const api = {
    stats,
    // width of one character (a digit's own width too)
    char(fk, ch) {
      const f = slot(fk); let w = f.chars.get(ch);
      if (w === undefined) { stats.misses++; w = measure(ch); if (f.chars.size >= MAX_CHARS) f.chars.clear(); f.chars.set(ch, w); } else stats.hits++;
      return w;
    },
    // the tabular cell: every digit takes the width of '0'
    cell(fk) { const f = slot(fk); if (f.cell < 0) { stats.misses++; f.cell = measure('0'); } else stats.hits++; return f.cell; },
    // plain string width
    str(fk, s) {
      const f = slot(fk); let w = f.strs.get(s);
      if (w === undefined) { stats.misses++; w = measure(s); if (f.strs.size >= MAX_STR) f.strs.clear(); f.strs.set(s, w); } else stats.hits++;
      return w;
    },
    // tabular string width: digits at the cell width, other characters at their own
    tab(fk, s) {
      const f = slot(fk); let w = f.tabs.get(s);
      if (w === undefined) {
        const cell = api.cell(fk); w = 0;
        for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); w += c >= 48 && c <= 57 ? cell : api.char(fk, s[i]); }
        if (f.tabs.size >= MAX_STR) f.tabs.clear(); f.tabs.set(s, w);
      } else stats.hits++;
      return w;
    },
    clear() { fonts.clear(); },
    size() { let n = 0; for (const f of fonts.values()) n += f.chars.size + f.strs.size + f.tabs.size; return n; },
  };
  return api;
}
