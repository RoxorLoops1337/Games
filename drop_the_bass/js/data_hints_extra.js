// data_hints_extra.js: coach marks for the depth systems (branches, synergies, wave preview, reroll, boss phases, hero abilities).
// battle.js reads these through `HINTS_EXTRA` and copies any id that data_story.js HINTS does not already define, so merging them into
// data_story.js is optional. Same shape as HINTS: { title, text }. Ids are append-only. No em dashes.
export const HINTS_EXTRA = {
  hint_synergy:    { title: 'Synergy!', text: 'These two turrets are partners. Side by side (not diagonal) they boost each other. Tap a turret to see who it works well with.' },
  hint_branch:     { title: 'Upgrade path!', text: 'A level 4 turret can pick one of two upgrade paths. Tap the turret with the star and choose. It is permanent for that turret.' },
  hint_preview:    { title: 'Peek at the next wave', text: 'Tap the WAVE box at the top to see exactly which Static are coming, lane by lane, before you call them.' },
  hint_reroll:     { title: 'Not the turret you wanted?', text: 'The two round arrows under the board re-roll the next drop. Coins first, or gems when you are short. Setlist rerolls are free.' },
  hint_bossphase:  { title: 'Boss phase!', text: 'Bosses change tricks as they lose health. Watch the notches on the boss bar: each one is a new phase. Stay flexible.' },
  hint_hero_ready: { title: 'Hero move ready', text: 'Roxor and Jasmin are charged up. Tap their portraits for the move shown under each one. Save it for a boss or a big wave.' },
};
