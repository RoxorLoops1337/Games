// data_story.js: cutscene scripts, the tutorial script and Loopy's tips. Pure data. No em dashes.
// A cutscene is a list of panels. Each panel draws drawScene(scene) and steps through its lines (tap to continue).
// who: roxor | jasmin | loopy | playback | narr

export const CUTSCENES = {
  intro: {
    music: 'cutscene_warm',
    panels: [
      { scene: 'garage_day', lines: [
        { who: 'narr', text: 'Somewhere between a lawnmower and a drum kit, a garage hums with music.' },
        { who: 'roxor', text: 'Okay, last loop of the day. Ready, Jasmin?' },
        { who: 'jasmin', text: 'Always. Three, two, one...' },
        { who: 'loopy', text: 'Beep! Recording! (I am Loopy, the loop pedal. I am a very good listener.)' },
      ] },
      { scene: 'static_arrives', music: 'cutscene_dark', lines: [
        { who: 'narr', text: 'Then the radio hissed. Something grey crept under the door.' },
        { who: 'jasmin', text: 'Roxor... why did the music just stop?' },
        { who: 'roxor', text: 'It did not stop. It got eaten.' },
        { who: 'loopy', text: 'Alert! Static detected! It is hungry for SOUND!' },
      ] },
      { scene: 'silent_town', lines: [
        { who: 'narr', text: 'Outside, the whole town had gone quiet. Mouths open, no sound coming out.' },
        { who: 'jasmin', text: 'They are all still here. They just cannot be heard.' },
        { who: 'roxor', text: 'Then we make some noise. A LOT of noise.' },
      ] },
      { scene: 'build', music: 'cutscene_warm', lines: [
        { who: 'loopy', text: 'Idea! Your gear can fight back. Speakers, drums, mics. Wire them up and they become turrets!' },
        { who: 'roxor', text: 'A kick drum cannon? Yes please.' },
        { who: 'jasmin', text: 'And if two of the same turret play together, they merge into something stronger. A duet!' },
        { who: 'loopy', text: 'Merge, upgrade, repeat. That is the whole trick. Probably.' },
      ] },
      { scene: 'van_night', lines: [
        { who: 'narr', text: 'The Static is spreading from one stage to the next. The source is the Mega Arena.' },
        { who: 'jasmin', text: 'So we play every stop on the way. Garage, street, club, festival.' },
        { who: 'roxor', text: 'And at the end, we find out who is turning the world down.' },
      ] },
      { scene: 'boss_reveal', music: 'cutscene_dark', lines: [
        { who: 'playback', text: 'Press play. Stay perfect. No wrong notes, no wrong voices. Nobody has to try ever again.' },
        { who: 'roxor', text: 'That is the saddest thing I have ever heard.' },
        { who: 'jasmin', text: 'Then let us show him what live sounds like.' },
      ] },
    ],
  },
  world_garage: { music: 'cutscene_warm', panels: [ { scene: 'world_garage', lines: [
    { who: 'loopy', text: 'Stage one: the garage. Home turf. The Static is small here. Practice makes perfect!' },
    { who: 'roxor', text: 'Nobody touches the amp stack.' } ] } ] },
  world_busk: { music: 'cutscene_warm', panels: [ { scene: 'world_busk', lines: [
    { who: 'narr', text: 'Old Town. The street lamps flicker. The crowd stands frozen mid-clap.' },
    { who: 'jasmin', text: 'These people used to dance every Saturday. Let us give them a reason.' },
    { who: 'loopy', text: 'New enemies ahead: flying drones and humming healers. Stay sharp!' } ] } ] },
  world_club: { music: 'cutscene_dark', panels: [ { scene: 'world_club', lines: [
    { who: 'narr', text: 'The Neon Club. Lasers and fog. The dance floor has forgotten how to dance.' },
    { who: 'roxor', text: 'I have played here twelve times. They owe me a drink.' },
    { who: 'loopy', text: 'Warning: Gate Guards and Feedback ahead. Feedback screeches and jams your turrets.' } ] } ] },
  world_festival: { music: 'cutscene_warm', panels: [ { scene: 'world_festival', lines: [
    { who: 'narr', text: 'Sunset Festival. Two entrances, one stage, and a sky that has gone grey at the edges.' },
    { who: 'jasmin', text: 'Two lanes this time. Place your turrets where the paths meet.' },
    { who: 'loopy', text: 'Mute Ghosts ignore slows and stuns. Use raw damage!' } ] } ] },
  world_arena: { music: 'cutscene_dark', panels: [ { scene: 'world_arena', lines: [
    { who: 'narr', text: 'The Mega Arena. Ninety thousand empty seats. One soundboard.' },
    { who: 'roxor', text: 'Three lanes. Of course it is three lanes.' },
    { who: 'jasmin', text: 'We have come a long way. Let us make it count.' } ] } ] },
  boss_compressor: { music: 'cutscene_dark', panels: [ { scene: 'boss_compressor', lines: [
    { who: 'narr', text: 'THE COMPRESSOR squashes every sound until it is flat and the same.' },
    { who: 'loopy', text: 'Big hits get squashed! Hit it often, not hard.' } ] } ] },
  boss_noisegate: { music: 'cutscene_dark', panels: [ { scene: 'boss_noisegate', lines: [
    { who: 'narr', text: 'NOISE GATE only lets sound through when it feels like it.' },
    { who: 'loopy', text: 'It slams shut now and then. Do not waste your shots while it is closed.' } ] } ] },
  boss_reverb: { music: 'cutscene_dark', panels: [ { scene: 'boss_reverb', lines: [
    { who: 'narr', text: 'REVERB TITAN never finishes a note. It echoes, and echoes, and echoes.' },
    { who: 'loopy', text: 'It leaves Echo Minis behind. Splash damage is your friend.' } ] } ] },
  boss_djglitch: { music: 'cutscene_dark', panels: [ { scene: 'boss_djglitch', lines: [
    { who: 'narr', text: 'DJ GLITCH skips ahead whenever it likes and scrambles your gear.' },
    { who: 'jasmin', text: 'Keep your heroes ready for this one.' } ] } ] },
  boss_playback: { music: 'cutscene_dark', panels: [ { scene: 'boss_playback', lines: [
    { who: 'playback', text: 'You are out of tune, you are out of time, and you are out of luck. Press play.' },
    { who: 'roxor', text: 'You know what the best part of live music is?' },
    { who: 'jasmin', text: 'Anything can happen. Together!' } ] } ] },
  ending: {
    music: 'cutscene_warm',
    panels: [
      { scene: 'victory_stage', lines: [
        { who: 'narr', text: 'Mr. Playback crackled, flickered, and finally went quiet. Then the Arena woke up.' },
        { who: 'narr', text: 'Ninety thousand people cheered. Out loud. Off key. Perfectly human.' },
        { who: 'jasmin', text: 'Listen to that. Not one of them is in tune.' },
        { who: 'roxor', text: 'Best sound I have ever heard.' },
      ] },
      { scene: 'credits_van', lines: [
        { who: 'loopy', text: 'Mission complete! I recorded everything. Want to hear it back?' },
        { who: 'jasmin', text: 'Later. First, the next town needs a show.' },
        { who: 'roxor', text: 'The Static always comes back, though. Endless mode is open. Come and find out how long you can hold the stage.' },
        { who: 'narr', text: 'THANKS FOR PLAYING. KEEP THE MUSIC LIVE.' },
      ] },
    ],
  },
  defeat: {
    music: 'cutscene_dark',
    panels: [ { scene: 'defeat_quiet', lines: [
      { who: 'loopy', text: 'The stage went quiet... but I am still recording. One more try?' } ] } ],
  },
};

// Tutorial steps. The battle view interprets: say (Loopy text), wait (condition id), spot (rect id to highlight), lock (what the player may do).
export const TUTORIAL = [
  { id: 'hello', say: 'Hi! I am Loopy. The Static is coming down that path. Your job: keep it away from the stage!', wait: 'tap' },
  { id: 'coins', say: 'You earn COINS for every Static you pop. Coins buy new turrets. You have enough for a few already.', wait: 'tap', spot: 'coins' },
  { id: 'deploy1', say: 'Tap DROP to deploy a turret onto a free tile.', wait: 'deployed1', spot: 'deploy' },
  { id: 'deploy2', say: 'Nice! Drop another one. Two of the same kind is what we want.', wait: 'deployed2', spot: 'deploy' },
  { id: 'merge', say: 'Two matching turrets of the same level can MERGE. Drag one onto the other (or tap one, then the other).', wait: 'merged1', spot: 'turrets' },
  { id: 'merged', say: 'Level 2! Every level doubles the power. Merging is how you win.', wait: 'tap' },
  { id: 'startwave', say: 'Ready? Tap the wave button to call the first wave. Calling early earns bonus coins.', wait: 'wavestarted', spot: 'wave' },
  { id: 'fight', say: 'Turrets fire on their own. Keep dropping and merging while the Static walks. Watch the combo grow!', wait: 'kills3', spot: 'none', free: true },
  { id: 'hype', say: 'Kills fill the HYPE bar. When it is full you pick a REMIX upgrade. Try it!', wait: 'remixopen', free: true, auto: true },
  { id: 'hero', say: 'Roxor and Jasmin have special moves. Tap Roxor for a Beatbox Blast!', wait: 'heroR', spot: 'heroR', free: true },
  { id: 'hero2', say: 'Jasmin sings a Siren Song that slows everything and heals the stage. Use both within 2 seconds for a DUET FINALE!', wait: 'heroJ', spot: 'heroJ', free: true },
  { id: 'finish', say: 'You are a natural. Clear the rest of this practice tour. Between runs you can upgrade in the Studio, open crates and wear new gear.', wait: 'tap', free: true },
];

export const HINTS = {
  fuzz:    { title: 'Fuzz', text: 'Plain static. There is always a lot of it. Any turret handles it, splash is best.' },
  brick:   { title: 'Brickwall', text: 'Armored Static. Small hits bounce off it. Use big hitters like Kick Cannon and Cowbell Sniper.' },
  zip:     { title: 'Glitch Zip', text: 'Very fast and fragile. Splash and chain turrets are great here.' },
  echo:    { title: 'Echo', text: 'Splits into two minis when it dies. Splash damage cleans up the mess.' },
  drone:   { title: 'Autotune Drone', text: 'Flies straight to the stage and ignores the path. Turrets near the stage matter.' },
  leech:   { title: 'Hum Healer', text: 'Heals other Static nearby. Kill it first (set a turret to Strongest or use Mic and Synth).' },
  gate:    { title: 'Gate Guard', text: 'Wears a shield that soaks damage and comes back if you stop hitting it. Burst it down.' },
  squeal:  { title: 'Feedback', text: 'Screeches when it dies and jams nearby turrets for a moment. Kill it far from your gear.' },
  mute:    { title: 'Mute Ghost', text: 'Immune to slows, stuns and push-backs. Raw damage only.' },
  rager:   { title: 'Glitchbug', text: 'Goes berserk when hurt. Finish it quickly or slow it down early.' },
  boss:    { title: 'Boss!', text: 'Bosses hit the stage hard if they get through. Save your hero abilities for them.' },
  elite:   { title: 'Elite Static', text: 'Glowing Static have a special trait. Golden ones drop lots of coins.' },
  mod:     { title: 'Wave Twist', text: 'Some waves have a twist, shown under the wave number. Good ones help you, bad ones pay extra coins.' },
  chest:   { title: 'Chest!', text: 'Pick one Merch relic. Relics are unique and last the whole run.' },
  full:    { title: 'Board full', text: 'No free tiles. Merge turrets to make room, or sell a weak one.' },
};

export const LOOPY_TIPS = [
  'Tip: matching turrets of the same level merge. Different types of the same level can remix into a surprise.',
  'Tip: tap an empty tile first, then DROP to place the next turret exactly there.',
  'Tip: drop on the beat for a discount. Watch the ring around the DROP button.',
  'Tip: Loop Station and Amp Stack do not shoot. Put them between your attackers.',
  'Tip: set a turret to Strongest to focus bosses, or Last to pick off stragglers.',
  'Tip: use Roxor and Jasmin within 2 seconds of each other for a Duet Finale.',
  'Tip: save the Beatbox Blast for bosses and big waves.',
  'Tip: gear can be merged too. Three of the same piece make the next rarity.',
  'Tip: sell weak level 1 turrets late in a run to make room and get coins back.',
  'Tip: Remix cards stack. Doubling down on one idea often beats spreading out.',
  'Tip: clear a stage with 3 stars for bonus diamonds and better loot.',
  'Tip: the Studio upgrades are permanent. Spend your Records after every run.',
  'Tip: higher Encore levels make stages harder and pay a lot more.',
  'Tip: Sub Bass slows enemies, which makes every other turret hit more often.',
  'Tip: kills in a row build a combo that boosts coins.',
];
