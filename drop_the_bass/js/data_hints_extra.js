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
  // ---- one first-time card per boss (battle.js shows boss_<id> the first time that boss spawns, the generic 'boss' hint is the fallback)
  boss_compressor: { title: 'The Compressor', text: 'It squashes big hits, so one huge shot barely hurts it. Use lots of fast, small hits instead, and watch for the shield it pops out.' },
  boss_noisegate:  { title: 'Noise Gate', text: 'It slams shut every few seconds and nothing can hurt it, and it calls in Fuzz. Hold your hero moves until the gate opens again.' },
  boss_reverb:     { title: 'Reverb Titan', text: 'It echoes itself and leaves Echo Minis behind as it walks. Splash turrets like Kick Cannon clean up the pieces fast.' },
  boss_djglitch:   { title: 'DJ Glitch', text: 'It teleports along the path and jams your nearest turrets. Spread your turrets out so one scratch never stops the whole band.' },
  boss_playback:   { title: 'Mr. Playback', text: 'He has three phases: he pauses your turrets, shields himself, then skips one of your tracks. Save your hero moves for his last phase.' },
  boss_lowpass:    { title: 'The Low-Pass Tide', text: 'It washes over small hits, so fast weak shots barely scratch it. Bring big hitters like Kick Cannon and Cowbell Sniper.' },
  boss_silence:    { title: 'Dr. Dead Air', text: 'It mutes your turrets in waves and can steal an instrument. Spread your turrets out so a mute never silences the whole band.' },
  // ---- hub flows (shown once per profile by hubHint in ui_core.js)
  hint_setlist:     { title: 'Your Setlist', text: 'Before a run, pick a hero move for Roxor and Jasmin. Modifiers are optional: each one makes the run harder and pays more Records, Fans and diamonds. Tap a modifier to read it.' },
  hint_wardrobe:    { title: 'The Wardrobe', text: 'Outfits and Stage skins are pure style. Tap one to wear it and swipe sideways for more. Some unlock by playing, some cost diamonds.' },
  hint_skin_buy:    { title: 'Something to buy', text: 'You have enough diamonds for a new look. Tap the price to buy it. Outfits and skins change how things look, never how the game plays.' },
  hint_studio_scene: { title: 'Backstage', text: 'This is your stage. Every Studio upgrade adds a prop here: amps, a riser, lights, even a tour van. Your hero level and outfits show up too.' },
  hint_weekly:      { title: 'Weekly Gig', text: 'One special run each week, the same for everyone. The first try pays a big reward, replays pay half Records. The timer shows when it resets.' },
};
