// Groove Lock levels. Each level is one layer of the same song, "Midnight Loop" (A minor, 100 bpm).
// Pattern letters: k kick, s snare, h hat, b bass wub, a/o/e Jasmin's Ah / Oh / Ee. One sound per step.
// `show` = the layers that exist in this level, `lock` = the layers already on the ring (out of sync).
// `stacks` list each lorry's cubes TOP FIRST. All the numbers were found with the solver (tests print the pars).

export const GROOVE8 = 'khskkhsh';
export const GROOVE16 = 'kahbsohbkehksohb';
export const SONG = { name: 'Midnight Loop', key: 'A minor', bpm: 100 };

export const LEVELS = [
  { id: 'heartbeat', name: 'Heartbeat', layer: 'Roxor lays the kick', steps: 8, bpm: 100, pattern: GROOVE8, show: 'k', lock: '', rot0: 0, oneWay: false,
    stacks: ['kkk'],
    tip: 'Tap the lorry to drop its cube into the glowing slot at the bottom. Spin the ring (drag it, or use the arrows) to bring the next ghost down. Finish with the star at the top: that locks the groove.' },
  { id: 'backbeat', name: 'Backbeat', layer: 'Snare and hats join in', steps: 8, bpm: 100, pattern: GROOVE8, show: 'khs', lock: 'k', rot0: 3, oneWay: false,
    stacks: ['hsh', 'sh'],
    tip: 'The kicks are already on the ring but out of sync. Only the top cube of each lorry can go, so pick the lorry that fits the slot at the bottom.' },
  { id: 'drums', name: 'Drum Machine', layer: 'A full 16 step drum loop', steps: 16, bpm: 100, pattern: GROOVE16, show: 'ks', lock: '', rot0: 0, oneWay: false,
    stacks: ['skks', 'k'],
    tip: 'Sixteen steps now. Plan your route: every notch you turn costs a move, and fewer moves earn more stars.' },
  { id: 'hats', name: 'Conveyor', layer: 'Hats on a one way belt', steps: 16, bpm: 100, pattern: GROOVE16, show: 'ksh', lock: 'ks', rot0: 5, oneWay: true,
    stacks: ['hhhh'],
    tip: 'This belt only turns one way, like a real conveyor. Missed a slot? You have to go all the way round.' },
  { id: 'voices', name: 'Wub and Voice', layer: 'Wub bass and Jasmin sings', steps: 16, bpm: 100, pattern: GROOVE16, show: 'kshbaoe', lock: 'ksh', rot0: 11, oneWay: true,
    stacks: ['oeb', 'bao', 'b'],
    tip: 'Three lorries, seven cubes, one belt direction. Look at which ghost reaches the dock next, then choose.' },
  { id: 'fullmix', name: 'Full Mix', layer: 'Midnight Loop, the whole band', steps: 16, bpm: 100, pattern: GROOVE16, show: 'kshbaoe', lock: 'hb', rot0: 7, oneWay: true,
    stacks: ['saeo', 'kk', 'o', 'sk'],
    tip: 'The finale. Nine cubes, four lorries, a one way belt. Lock the whole band.' },
];

export const JAM = { id: 'jam', name: 'Jam Mode', layer: 'Free loop station', steps: 16, bpm: 100, jam: true, rot0: 0, oneWay: false,
  tip: 'No rules. Tap a sound to drop it at the dock, spin the ring, tap a cube on the ring to pick it up again.' };
