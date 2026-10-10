// Battle Call: ready-made events. Open #/new/<key> and the organiser only has to pick a password: the event, its
// categories and the whole lineup are set up in one go.
export const PRESETS = {
  dmi2026: {
    name: 'DMI Beatbox 2026',
    cats: [
      { name: 'Mixed Solo', size: 16, art: 'male', bbs: ['Mokz BBX', 'Guardian', 'Frilton', 'Ankersen', 'MBL', 'Groovy', 'S', 'SimpleSound', 'Bozz', 'Sebbix', 'Reyork', 'Fade Away', 'Pavo', 'Totti', 'Crythix', 'Rawclaw', 'Silva'] },
      { name: 'Tag Team', size: 2, art: 'duo', bbs: ['The Mongolian Avekats', 'BrainBrothers', 'M3L0D1C'] },
      { name: 'Solo Female', size: 2, art: 'female', bbs: ['Sena Mascs'] },
    ],
  },
};
export const presetOf = (key) => PRESETS[String(key || '').toLowerCase()] || null;
