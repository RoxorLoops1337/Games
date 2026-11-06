// THE THREAD user interface (design/THREAD.md). STUB: the Thread UI engineer implements these; combat.js already calls them.
//   drawSeamRail(app, c, rect, t)      the thread rail above the hand: school glyph knots, needle, payout preview
//   seamBadge(c, card)                 'extend' | 'cut' | 'slack' | 'tied' | null  (what playing this card would do)
//   drawSeamBadge(app, kind, x, y, s)  needle or scissors badge on a hand card
//   onSeamEvent(app, ev, ctx)          animate seamExtend / seamCut / seamSlack / seamFray / seamPay events (ctx = { fx, entPos })
export function drawSeamRail(app, c, rect, t) {}
export function seamBadge(c, card) { return null; }
export function drawSeamBadge(app, kind, x, y, s) {}
export function onSeamEvent(app, ev, ctx) {}
