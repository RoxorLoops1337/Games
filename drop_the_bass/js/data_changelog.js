// data_changelog.js: the "What's new" card. One entry per GAME.version (data_core.js), newest first. The text is data: the translatable
// fields are registered in i18n_data.js (CHANGELOG.<id>.title and CHANGELOG.<id>.items.<n>), so the card reads in every language.
// To announce an update: bump GAME.version and put a new entry first (id 'v<version>'). Older entries stay short.
export const CHANGELOG = [
  {
    id: 'v2', version: 2, title: 'The big update',
    items: [
      'A second tour: two more stages, the bonfire cove and the Moon, with their own bosses.',
      'Upgrade paths: a level 4 turret can pick one of two permanent paths.',
      'Hero moves and modifiers: pick a move for each hero and add risky modifiers in the Setlist.',
      'Outfits and stage skins to wear, plus a Wardrobe to try them on.',
      'Four languages: English, Dansk, Nederlands and Deutsch.',
      'Easier to play: Larger text, colour-blind cues and Practice a boss from the Codex.',
    ],
  },
  { id: 'v1', version: 1, title: 'Launch', items: ['Drop turrets, merge them and keep the music live.'] },
];
export const latestChangelog = () => CHANGELOG[0];
