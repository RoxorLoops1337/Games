// THE THREAD (see design/THREAD.md). Combat plumbing is wired in engine/combat.js; the Thread engineer fills this module in.
// c.seam = { set: [schools], counts: {school: n}, len, cuts, tied, last }  (state lives on the combat object)
export function seamInit(c) { return { set: [], counts: {}, len: 0, cuts: 0, tied: false, last: null, paidTurn: {} }; }
// Called by playCard AFTER the energy is spent and BEFORE the card's effects run, so effects can read {per:'knots'}.
export function seamStep(c, card, spec) { /* extend, cut or slack; emit seamExtend/seamCut/seamSlack/seamFray/seamPay events */ }
// Called by endTurn before the turnEnd hooks: an unfinished Line cashes at S-1.
export function seamEnd(c) { /* cash the unfinished line */ }
// Called at the start of every player turn: reset the Line unless it is Tied.
export function seamTurnStart(c) { /* reset per-turn counters */ }
