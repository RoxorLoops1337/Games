// Keyword glossary and pinned tooltip stacks (design/UX_SPEC.md section 2). STUB: the tooltip engineer implements these.
//   KEYWORDS                  { name: { color, glyph, text } } for Block, Vulnerable, Weak, Burn, Bleed, Tithe, Strain, Shatter, Echo, Thread, ...
//   keywordsIn(lines)         the keywords that appear in a card's text lines, in order
//   drawCardText(app, ctx, lines, x, y, w, size)  card text with dotted-underlined keywords (returns height)
//   renderTip(app, tip)       draws a pinned tooltip stack; return false to let core.js draw its default tooltip
export const KEYWORDS = {};
export function keywordsIn(lines) { return []; }
export function drawCardText() { return 0; }
export function renderTip(app, tip) { return false; }
