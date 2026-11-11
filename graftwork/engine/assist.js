// Assist mode (optional, for newcomers). Four independent options, all data-driven from run.assist = { sturdy?, gentle?, kind?, mercy? }.
// A run without assist has NO run.assist key and none of these hooks changes a number. Assisted runs are still saved and winnable
// but never count for ascension unlocks, daily bests, first-time Credit doubling or achievements (engine/meta.js recordRunEnd).
export const ASSIST_OPTIONS = [
  { id: 'sturdy', name: 'Sturdy', text: 'Start with 30% more max HP.', hpMul: 1.3 },
  { id: 'gentle', name: 'Gentle foes', text: 'Enemies deal 20% less damage.', dmgMul: 0.8 },
  { id: 'kind', name: 'Kind Strain', text: 'Budget is 1 higher, so you can carry one more Weight before Strain.', budget: 1 },
  { id: 'mercy', name: 'Mercy', text: 'Overload never Shatters a card. The first time you would die in a run, you get back up at half HP, once.', shatter: 0, revive: 0.5 },
];
export const ASSIST_NOTE = 'Assisted runs still count as played, but do not unlock ascensions, daily bests, first-time Credit bonuses or achievements.';

// the plain flags to store on a run, or null when nothing is switched on. Accepts the settings object ({on, ...}) or a bare flag map.
export function assistFlags(a) {
  if (!a || typeof a !== 'object' || a.on === false) return null;
  const f = {};
  for (const o of ASSIST_OPTIONS) if (a[o.id]) f[o.id] = true;
  return Object.keys(f).length ? f : null;
}
export const assistOpt = (run, id) => !!(run && run.assist && run.assist[id]);
// newRun hook: applies the HP and Budget parts (the combat parts read run.assist where they happen)
export function applyAssist(run, a) {
  const f = assistFlags(a); if (!f || run.practice) return;
  run.assist = f;
  if (f.sturdy) { run.maxHp = Math.round(run.maxHp * ASSIST_OPTIONS[0].hpMul); run.hp = run.maxHp; }
  if (f.kind) run.budgetBonus += ASSIST_OPTIONS[2].budget;
}
// combat hooks
export const assistDmgMul = (run) => (assistOpt(run, 'gentle') ? ASSIST_OPTIONS[1].dmgMul : 1);
export function assistRevive(c) { // call when the player would die; returns true when mercy stood them back up (once per run)
  const run = c.run;
  if (!assistOpt(run, 'mercy') || run.assistRevived) return false;
  run.assistRevived = true;
  c.player.hp = Math.max(1, Math.ceil(c.player.maxHp * ASSIST_OPTIONS[3].revive));
  c.ev.push({ t: 'heal', who: 'player', n: c.player.hp }, { t: 'assistRevive', hp: c.player.hp });
  return true;
}
