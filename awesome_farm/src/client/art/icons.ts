// Item icons and skill glyphs, generated from shape templates.
// Templates use A (main) a (highlight) z (shadow) S (accent); recolor() maps them to palette chars.

import { ITEMS, ItemId } from '../../shared/data/items';
import { Grid, makeSprite, recolor, stamp } from './pixels';

/** Pad ragged rows with '.' so templates stay easy to author. */
const g = (...rows: string[]): string[] => {
    const w = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(w, '.'));
};

type Mat = [main: string, hi: string, shadow: string];
const MAT = {
    wood: ['b', 'd', 'B'], stone: ['t', 'T', 'S'], flint: ['S', 't', 'n'], iron: ['T', 'w', 'S'], copper: ['o', 'y', 'b'],
    gold: ['y', 'w', 'o'], steel: ['t', 'T', 'n'], crystal: ['F', 'w', 'W'], cloth: ['c', 'w', 's'], leaf: ['g', 'l', 'G'],
    sand: ['s', 'c', 'd'], clay: ['d', 's', 'b'], brick: ['d', 'o', 'B'], coal: ['S', 't', 'n'], peat: ['B', 'b', 'n'],
    bread: ['d', 's', 'B'], gold2: ['y', 'w', 'o'], void: ['v', 'p', 'u'],
} satisfies Record<string, Mat>;

function paint (shape: string[], [A, a, z]: Mat, S = 'k'): string[] {
    return recolor(shape, { A, a, z, S });
}

// ── shapes ─────────────────────────────────────────────────────────────────
const SHAPES = {
    chunk: g('....aAAA....', '..aAAAAAAz..', '.aAAAAAAAAz.', '.AAAAAAAAAzz', 'AAAAAAAAAAzz', 'AAAAAAAAAzzz', '.zzzzzzzzzz.'),
    ingot: g('..aaaaaaaa..', '.aaAAAAAAAz.', 'aAAAAAAAAAzz', 'AAAAAAAAAAzz', 'zzzzzzzzzzzz'),
    gem: g('.....aa.....', '....aAAz....', '...aAAAAz...', '..aAAAAAAz..', '..aAAaAAAz..', '...aAAAAzz..', '....AAAzz...', '.....Azz....'),
    mound: g('....aaaa....', '..aaAAAAAz..', '.aAAAAAAAAz.', 'aAAAAAAAAAAz', 'AAAAAAAAAAzz', 'zzzzzzzzzzzz'),
    plank: g('aaaaaaaaaaa.', 'AAAAAAAAAAAz', 'AAAAAAAAAAAz', 'zzzzzzzzzzzz', '.aaaaaaaaaa.', '.AAAAAAAAAAz', '.zzzzzzzzzzz'),
    brick: g('aAAAAAAAAAz.', 'AAAAAAAAAAz.', 'zzzzzzzzzzz.', '..aAAAAAAAAz', '..AAAAAAAAAz', '..zzzzzzzzzz'),
    pane: g('.AAAAAAAAz', 'AAaAAAAAAz', 'AaAAAAAAAz', 'AAAAAaAAAz', 'AAAAAAAAAz', '.zzzzzzzzz'),
    cloth: g('aaaaaaaaaaa.', 'AAAAAAAAAAAz', 'SSSSSSSSSSSz', 'AAAAAAAAAAAz', 'zzzzzzzzzzzz'),
    coil: g('...aaAAAz...', '..aAAzzAAz..', '.aAz....zAz.', '.AA......Az.', '.aAz....zAz.', '..aAAzzAAz..', '...zAAAAz...'),
    gear: g('...AAA...', '.A.aAA.A.', '.AAAAAAAz', 'AAAz.zAAA', 'AAz...zAA', 'AAAz.zAAA', '.AAAAAAAz', '.A.AzA.Az', '...zzz...'),
    chip: g('.S.S.S.S..', 'AAAAAAAAAA', 'AaAAAAAAAz', 'SAAkkAAAAS', 'AAAkkAAaAz', '.S.S.S.S..'),
    sack: g('...AAAA...', '..aAAAAz..', '...zSSz...', '..aAAAAAz.', '.aAAAAAAAz', '.AAAAAAAAz', '.AAAAAAAAz', '..zzzzzzz.'),
    wheat: g('..a..a..a.', '.aAa.aAa.a', '.AAA.AAA.A', '..A...A...', '..AzSzAz..', '...gg.gg..', '....g.g...'),
    carrot: g('..g.g.g...', '...ggg....', '..aAAAz...', '..aAAAz...', '...aAAz...', '...aAz....', '....Az....'),
    loaf: g('...aaaaa...', '.aaAAAAAAz.', 'aAAAAAAAAAz', 'aAASAAASAAz', 'AAAAAAAAAAz', '.zzzzzzzzz.'),
    bowl: g('..aAAAAAA..', '.aAAAAAAAz.', 'dddddddddddd', '.bbbbbbbbbB.', '..bbbbbbBB..', '...BBBBBB...'),
    pie: g('...aaaaa...', '.aaAAAAAAz.', 'aAAAASAAAAz', 'AAASSSSAAAz', 'AAAAASAAAAz', '.zzzzzzzzz.'),
    bottle: g('...bb...', '...dd...', '...ww...', '..wAAw..', '.wAAAAw.', 'wAAaAAAw', 'wAAAAAAw', '.wAAAAw.', '..wwww..'),
    pick: g('..aaaaa..', '.aA.b.Az.', 'a...b...z', '....b....', '....b....', '....b....', '....B....'),
    club: g('....bbd..', '...bddbd.', '..bddddBd', '..bdddBB.', '.bddBB...', 'bdBB.....', 'dB.......'),
    sword: g('........aA', '.......aAz', '......aAz.', '.....aAz..', '..d.aAz...', '...dAz....', '...dd.....', '..bd.d....', '.bB.......', 'bB........'),
    spear: g('....a.....', '...aAa....', '..aAAAz...', '...AAz....', '....b.....', '....b.....', '....b.....', '....b.....', '....B.....'),
    hammer: g('.aaAAAAz..', '.aAAAAAz..', '.zzzzzzz..', '....b.....', '....b.....', '....b.....', '....B.....'),
    bow: g('....AA....', '...A.S....', '..A..S....', '.A...S....', '.A...S....', '..A..S....', '...A.S....', '....AA....'),
    staff: g('...aAz...', '..aAAAz..', '..AAaAz..', '...zAz...', '....b....', '....b....', '....b....', '....B....'),
    cap: g('..aaaaaa..', '.aAAAAAAz.', 'aAAAAAAAAz', 'AAAAAAAAAz', 'zzzzzzzzzz'),
    helm: g('..aaaaaa..', '.aAAAAAAz.', 'aAAAAAAAAz', 'AAkkkkkkAz', 'AAAAAAAAAz', '.zz....zz.'),
    body: g('.AA.aaaa.AA.', 'AAAAaAAAzAAA', 'AAAAAAAAAAAz', '.AAAAAAAAAz.', '..AAAAAAAAz.', '..zzzzzzzz..'),
    charm: g('..zzzzzz..', '.z......z.', '.z......z.', '..z....z..', '...zSSz...', '...SaSz...', '....SS....'),
    herbs: g('...g..g...', '..gGg.gG..', '.gGlgGlgG.', '..gGGgGg..', '...gGGg...', '....bb....'),
    puff: g('..aAAa....', '.aAAAAa.a.', '.AAAAAAaAa', '..AAAAAAAA', '...zAAAzAz', '....gg.g..', '.....gg...'),
    motor: g('...aaaa....', '.zAAAAAAzSS', 'zAAAAAAAzSS', 'zAaAAaAAzSS', 'zAAAAAAAzSS', '.zAAAAAAz..', '...zzzz....'),
    core: g('..oooooo..', '.oyyyyyyo.', 'oyyFFwFFyo', 'oyFFwwFWyo', 'oyFWFFWWyo', 'oyyWWWWyyo', '.oyyyyyyo.', '..oooooo..'),
    bone: g('.aa....aa.', 'aAAaaaaAAa', 'AAAAAAAAAz', 'aAAzzzzAAz', '.zz....zz.'),
    wing: g('..........a', '.....aaaaAA', '..aaaAAAAAz', 'aAAAAAAAAz.', 'AAAzAAAAz..', 'Azz.zAAz...', 'z....zz....'),
    dagger: g('......aA', '.....aAz', '....aAz.', '...aAz..', '.d.Az...', '..dz....', '.bd.....', 'bB......'),
    sigil: g('..aaaaaa..', '.aAAAAAAz.', 'aAAASSAAAz', 'aAASAASAAz', 'aASAAAASAz', 'aASAAAASAz', 'aAASAASAAz', 'aAAASSAAAz', '.zAAAAAAz.', '..zzzzzz..'),
    trophy: g('SAAAAAAAAS', 'AaAAAAAAAz', '.AaAAAAAz.', '..AAAAAz..', '...AAAz...', '....AA....', '....AA....', '..SSSSSS..', '..zzzzzz..'),
    pod: g('..aaaaaa..', '.aAAAAAAz.', 'aAAAAAAAAz', 'AAAAAAAAAz', 'kkkkSSkkkk', 'cwwwSSwwwc', 'cwwwwwwwcc', '.cwwwwwcc.', '..cccccc..'),
    bundle: g('.g.g..g.g.', '.gAgAgAgA.', '..AAaAAAz.', '..AAAAAAz.', '..zSSSSzz.', '..AAAAAAz.'),
    fish: g('....aaaaa....', '..aaAAAAAAz.A', '.aAAAAAAAAzAA', 'aASAAAAAAAzAz', '.zAAAAAAAAzAA', '..zzAAAAAzz.A', '....zzzzz....'),
    rod: g('.........c', '........bc', '.......bdc', '......bd.c', '.....bd..c', '....bdS..c', '...bd....c', '..bB.....c', '.bB......c', 'bB.......c'),
    boot: g('..bbbb....', '..bddb....', '..bddb....', '..bddbbb..', '..bdddddb.', '.bbbbbbbbB', '.BBBBBBBBB'),
    satchel: g('....bbbb....', '...bddddb...', '..bd....db..', '.AAAAAAAAAz.', 'AaaAAAAAAAzz', 'AAAAASSAAAzz', 'AAAAAAAAAAzz', '.zzzzzzzzzz.'),
    pack: g('...aaaaaa...', '..aAAAAAAz..', '.aAAAAAAAAz.', '.AAAAAAAAAz.', '.AAAaaaaAAz.', '.AAAASSAAAz.', '.AAAAAAAAAz.', '.AAzzzzzAAz.', '..AAAAAAAz..', '..zzzzzzzz..'),
    pearl: g('..aaaa..', '.aAAAAz.', 'aAAAAAAz', 'aAAAAAzz', '.AAAAzz.', '..zzzz..'),
    crate: g('.aaaaaaaaaaa', 'aAAAAAAAAAAz', 'aSSSSSSSSSSz', 'aAAASSSAAAAz', 'aAAASkSAAAAz', 'aAAASSSAAAAz', 'aAAAAAAAAAAz', '.zzzzzzzzzzz'),
    msgbottle: g('....bb....', '....bb....', '...wFFw...', '..wFFFFF..', '..wFcccF..', '..wFcccF..', '..wFFFFF..', '...wFFw...'),
} satisfies Record<string, string[]>;
type ShapeId = keyof typeof SHAPES;

interface IconSpec { shape: ShapeId; mat: Mat; accent?: string; dots?: [number, number][]; dotCol?: string[] }

const SPECKS: [number, number][] = [[3, 2], [6, 3], [8, 2], [4, 4], [7, 5], [9, 4]];
const ore = (base: Mat, a: string, b: string): IconSpec => ({ shape: 'chunk', mat: base, dots: SPECKS, dotCol: [a, b] });
/** A seed sack with the crop's own little picture on its front (rows 3 to 6 of the sack, x 2 to 8), so nine sacks tell apart at a glance. */
const pouch = (mark: [number, number, string][]): IconSpec => ({ shape: 'sack', mat: ['d', 's', 'B'], accent: 'r', dots: mark.map(([x, y]) => [x, y]), dotCol: mark.map(([, , c]) => c) });
const SEED_MARKS: Record<string, [number, number, string][]> = {
    wheat:   [[5, 3, 'y'], [4, 4, 'y'], [6, 4, 'y'], [5, 4, 'w'], [4, 5, 'y'], [6, 5, 'y'], [5, 5, 'y'], [5, 6, 'g']],                                           // an ear of wheat on a green stalk
    carrot:  [[4, 3, 'g'], [6, 3, 'g'], [4, 4, 'o'], [5, 4, 'o'], [6, 4, 'o'], [5, 5, 'o'], [5, 6, 'o']],                                                      // a carrot pointing down
    pumpkin: [[5, 3, 'G'], [3, 4, 'o'], [4, 4, 'o'], [5, 4, 'o'], [6, 4, 'o'], [7, 4, 'o'], [3, 5, 'o'], [4, 5, 'y'], [5, 5, 'o'], [6, 5, 'y'], [7, 5, 'o'], [4, 6, 'o'], [5, 6, 'o'], [6, 6, 'o']],   // a wide round pumpkin
    cotton:  [[4, 4, 'w'], [5, 4, 'w'], [6, 4, 'w'], [3, 5, 'w'], [4, 5, 'c'], [5, 5, 'w'], [6, 5, 'c'], [7, 5, 'w'], [4, 6, 'w'], [5, 6, 'w'], [6, 6, 'w']],      // a white puff
    beet:    [[5, 3, 'g'], [4, 4, 'v'], [5, 4, 'v'], [6, 4, 'v'], [4, 5, 'v'], [5, 5, 'p'], [6, 5, 'v'], [5, 6, 'v']],                                           // a purple beet with a leaf
    corn:    [[5, 3, 'g'], [4, 4, 'y'], [5, 4, 'y'], [4, 5, 'y'], [5, 5, 'w'], [4, 6, 'y'], [5, 6, 'y'], [6, 5, 'g'], [6, 6, 'g']],                               // a cob in its husk
    melon:   [[3, 4, 'g'], [4, 4, 'G'], [5, 4, 'g'], [6, 4, 'G'], [7, 4, 'g'], [3, 5, 'g'], [4, 5, 'G'], [5, 5, 'g'], [6, 5, 'G'], [7, 5, 'g'], [4, 6, 'g'], [5, 6, 'G'], [6, 6, 'g']],   // a striped melon
    pepper:  [[5, 3, 'g'], [4, 4, 'r'], [5, 4, 'r'], [4, 5, 'r'], [5, 5, 'p'], [4, 6, 'r'], [5, 6, 'r']],                                                      // a long red pepper
    flax:    [[5, 3, 'g'], [5, 4, 'W'], [4, 5, 'W'], [5, 5, 'F'], [6, 5, 'W'], [5, 6, 'W']],                                                                   // a blue flax flower
};
const bottle = (liquid: string, hi: string): IconSpec => ({ shape: 'bottle', mat: [liquid, hi, liquid] });

/** Icons made from templates. Items with hand-drawn grids below override these. */
const SPEC: Partial<Record<ItemId, IconSpec>> = {
    coal: { shape: 'chunk', mat: MAT.coal, dots: [[4, 2], [7, 4], [3, 4]], dotCol: ['k', 'n'] },
    iron: ore(MAT.stone, 'o', 'd'),
    copper: ore(MAT.stone, 'o', 'F'),
    goldore: ore(MAT.stone, 'y', 'w'),
    sand: { shape: 'mound', mat: MAT.sand },
    clay: { shape: 'mound', mat: MAT.clay },
    peat: { shape: 'chunk', mat: MAT.peat, dots: [[4, 3], [7, 4]], dotCol: ['k', 'n'] },
    crystal: { shape: 'gem', mat: MAT.crystal },
    fiber: { shape: 'bundle', mat: ['l', 'h', 'g'], accent: 'b' },
    herb: { shape: 'herbs', mat: MAT.leaf },
    cotton: { shape: 'puff', mat: MAT.cloth },
    plank: { shape: 'plank', mat: MAT.wood },
    brick: { shape: 'brick', mat: MAT.brick },
    glass: { shape: 'pane', mat: ['F', 'w', 'W'] },
    ironbar: { shape: 'ingot', mat: MAT.iron },
    copperbar: { shape: 'ingot', mat: MAT.copper },
    goldbar: { shape: 'ingot', mat: MAT.gold },
    steel: { shape: 'ingot', mat: MAT.steel },
    cloth: { shape: 'cloth', mat: MAT.cloth, accent: 'F' },
    rope: { shape: 'coil', mat: MAT.sand },
    gear: { shape: 'gear', mat: MAT.iron },
    wire: { shape: 'coil', mat: MAT.copper },
    circuit: { shape: 'chip', mat: ['g', 'l', 'G'], accent: 'y' },
    flour: { shape: 'sack', mat: MAT.cloth, accent: 's' },
    motor: { shape: 'motor', mat: MAT.iron, accent: 'o' },
    core: { shape: 'core', mat: MAT.gold },
    wheat: { shape: 'wheat', mat: ['y', 'w', 'o'], accent: 'b' },
    carrot: { shape: 'carrot', mat: ['o', 'y', 'b'] },
    bread: { shape: 'loaf', mat: MAT.bread, accent: 's' },
    stew: { shape: 'bowl', mat: ['o', 'y', 'r'] },
    pie: { shape: 'pie', mat: MAT.bread, accent: 'o' },
    seed_wheat: pouch(SEED_MARKS.wheat), seed_carrot: pouch(SEED_MARKS.carrot), seed_pumpkin: pouch(SEED_MARKS.pumpkin), seed_cotton: pouch(SEED_MARKS.cotton),
    seed_beet: pouch(SEED_MARKS.beet), seed_corn: pouch(SEED_MARKS.corn), seed_melon: pouch(SEED_MARKS.melon), seed_pepper: pouch(SEED_MARKS.pepper), seed_flax: pouch(SEED_MARKS.flax),
    beet: { shape: 'carrot', mat: ['v', 'p', 'u'] }, corn: { shape: 'wheat', mat: ['y', 'w', 'o'], accent: 'g' }, pepper: { shape: 'carrot', mat: ['r', 'p', 'n'] },
    flax: { shape: 'wheat', mat: ['W', 'F', 'D'], accent: 'g' },
    soup: { shape: 'bowl', mat: ['r', 'p', 'v'] }, cornbread: { shape: 'loaf', mat: ['y', 'w', 'o'], accent: 'b' }, jam: bottle('r', 'p'),
    melon_ice: { shape: 'bowl', mat: ['l', 'w', 'g'] }, spicy_stew: { shape: 'bowl', mat: ['o', 'y', 'r'] },
    potion_vigor: bottle('p', 'w'), potion_night: bottle('v', 'F'),
    potion_heal: bottle('r', 'p'), potion_energy: bottle('y', 'w'), potion_swift: bottle('F', 'w'),
    pick_flint: { shape: 'pick', mat: MAT.flint }, pick_iron: { shape: 'pick', mat: MAT.iron },
    pick_gold: { shape: 'pick', mat: MAT.gold }, pick_crystal: { shape: 'pick', mat: MAT.crystal },
    club: { shape: 'club', mat: MAT.wood },
    sword_iron: { shape: 'sword', mat: MAT.iron }, sword_steel: { shape: 'sword', mat: MAT.steel },
    spear_iron: { shape: 'spear', mat: MAT.iron }, hammer_iron: { shape: 'hammer', mat: MAT.iron },
    bow_wood: { shape: 'bow', mat: MAT.wood, accent: 'w' },
    staff_crystal: { shape: 'staff', mat: MAT.crystal },
    cap_cloth: { shape: 'cap', mat: ['c', 'w', 's'] }, tunic_cloth: { shape: 'body', mat: ['c', 'w', 's'] },
    bag_satchel: { shape: 'satchel', mat: ['d', 's', 'B'], accent: 'y' }, bag_rucksack: { shape: 'pack', mat: ['b', 'd', 'B'], accent: 'y' },
    bag_pack: { shape: 'pack', mat: ['F', 'w', 'W'], accent: 'y' }, bag_frame: { shape: 'pack', mat: MAT.iron, accent: 'y' }, bag_rift: { shape: 'pack', mat: ['v', 'p', 'u'], accent: 'F' },
    helm_iron: { shape: 'helm', mat: MAT.iron }, mail_iron: { shape: 'body', mat: MAT.iron },
    helm_steel: { shape: 'helm', mat: MAT.steel }, plate_steel: { shape: 'body', mat: MAT.steel },
    charm_lucky: { shape: 'charm', mat: ['y', 'w', 'o'], accent: 'g' },
    charm_swift: { shape: 'charm', mat: ['F', 'w', 'W'], accent: 'F' },
    charm_vital: { shape: 'charm', mat: ['y', 'w', 'o'], accent: 'r' },
    pod: { shape: 'pod', mat: ['o', 'y', 'r'], accent: 'y' }, pod_great: { shape: 'pod', mat: ['W', 'F', 'D'], accent: 'F' }, pod_ultra: { shape: 'pod', mat: ['v', 'p', 'u'], accent: 'y' },
    treat: { shape: 'loaf', mat: ['y', 'w', 'o'], accent: 'b' },
    // monster drops, sigils, trophies, potions
    slimegel: { shape: 'mound', mat: ['v', 'p', 'u'], dots: [[4, 2], [7, 3]], dotCol: ['w', 'w'] },
    bone: { shape: 'bone', mat: ['c', 'w', 's'] },
    batwing: { shape: 'wing', mat: ['u', 'v', 'n'] },
    hide: { shape: 'cloth', mat: ['d', 's', 'B'], accent: 'b' },
    ectoplasm: { shape: 'mound', mat: ['F', 'w', 'W'], dots: [[3, 2], [6, 3], [8, 2]], dotCol: ['w', 'c'] },
    scarabshell: { shape: 'chunk', mat: ['W', 'F', 'D'], dots: [[4, 2], [7, 3], [5, 4]], dotCol: ['y', 'F'] },
    rockheart: { shape: 'gem', mat: ['r', 'p', 'n'] },
    frostshard: { shape: 'gem', mat: ['w', 'F', 'W'] },
    toadskin: { shape: 'cloth', mat: ['g', 'l', 'G'], accent: 'e' },
    shroud: { shape: 'cloth', mat: ['v', 'p', 'u'], accent: 'k' },
    sigil_slime: { shape: 'sigil', mat: ['v', 'p', 'u'], accent: 'k' },
    sigil_stone: { shape: 'sigil', mat: ['T', 'w', 't'], accent: 'S' },
    sigil_bog: { shape: 'sigil', mat: ['g', 'l', 'G'], accent: 'e' },
    sigil_dune: { shape: 'sigil', mat: ['y', 'w', 'o'], accent: 'B' },
    sigil_frost: { shape: 'sigil', mat: ['F', 'w', 'W'], accent: 'D' },
    sigil_heart: { shape: 'sigil', mat: ['r', 'p', 'n'], accent: 'y' },
    trophy_slime: { shape: 'trophy', mat: ['v', 'p', 'u'], accent: 'k' },
    trophy_stone: { shape: 'trophy', mat: ['t', 'T', 'S'], accent: 'n' },
    trophy_bog: { shape: 'trophy', mat: ['g', 'l', 'G'], accent: 'e' },
    trophy_dune: { shape: 'trophy', mat: ['y', 'w', 'o'], accent: 'B' },
    trophy_frost: { shape: 'trophy', mat: ['F', 'w', 'W'], accent: 'D' },
    trophy_heart: { shape: 'trophy', mat: ['r', 'p', 'n'], accent: 'y' },
    potion_might: bottle('o', 'y'), potion_guard: bottle('T', 'w'), potion_mend: bottle('l', 'w'),
    // weapons
    dagger_bone: { shape: 'dagger', mat: ['c', 'w', 's'] }, dagger_steel: { shape: 'dagger', mat: MAT.steel },
    staff_apprentice: { shape: 'staff', mat: ['F', 'w', 'W'] },
    bow_long: { shape: 'bow', mat: ['d', 's', 'B'], accent: 'w' },
    spear_steel: { shape: 'spear', mat: MAT.steel }, hammer_steel: { shape: 'hammer', mat: MAT.steel },
    sword_crystal: { shape: 'sword', mat: MAT.crystal },
    // armor
    cap_hide: { shape: 'cap', mat: ['d', 's', 'B'] }, tunic_hide: { shape: 'body', mat: ['d', 's', 'B'] },
    cloak_shroud: { shape: 'body', mat: ['v', 'p', 'u'] },
    helm_crystal: { shape: 'helm', mat: MAT.crystal }, plate_crystal: { shape: 'body', mat: MAT.crystal },
    // boss gear
    crown_slime: { shape: 'helm', mat: ['v', 'p', 'u'] }, staff_slime: { shape: 'staff', mat: ['v', 'p', 'u'] },
    hammer_colossus: { shape: 'hammer', mat: ['t', 'T', 'S'] }, plate_colossus: { shape: 'body', mat: ['t', 'T', 'S'] },
    staff_witch: { shape: 'staff', mat: ['g', 'l', 'G'] }, charm_hex: { shape: 'charm', mat: ['g', 'l', 'G'], accent: 'F' },
    sword_pharaoh: { shape: 'sword', mat: MAT.gold }, charm_scarab: { shape: 'charm', mat: ['W', 'F', 'D'], accent: 'y' },
    bow_frost: { shape: 'bow', mat: ['F', 'w', 'W'], accent: 'w' }, helm_frost: { shape: 'helm', mat: ['F', 'w', 'W'] },
    charm_heart: { shape: 'charm', mat: ['r', 'p', 'n'], accent: 'y' },
    // rift spoils
    rift_shard: { shape: 'gem', mat: ['v', 'p', 'u'] }, rift_core: { shape: 'core', mat: ['v', 'F', 'u'] },
    sword_rift: { shape: 'sword', mat: ['v', 'p', 'u'], accent: 'F' }, bow_rift: { shape: 'bow', mat: ['v', 'p', 'u'], accent: 'F' },
    helm_rift: { shape: 'helm', mat: ['v', 'p', 'u'] }, plate_rift: { shape: 'body', mat: ['v', 'p', 'u'] },
    charm_rift: { shape: 'charm', mat: ['v', 'F', 'u'], accent: 'p' },
    // fishing
    rod: { shape: 'rod', mat: MAT.wood, accent: 'r' }, rod_fine: { shape: 'rod', mat: MAT.iron, accent: 'T' }, rod_master: { shape: 'rod', mat: MAT.crystal, accent: 'F' },
    bait: { shape: 'coil', mat: ['p', 'w', 'r'] }, junk_boot: { shape: 'boot', mat: MAT.wood }, pearl: { shape: 'pearl', mat: ['w', 'c', 'F'] },
    crate_wood: { shape: 'crate', mat: MAT.wood, accent: 'T' }, crate_silver: { shape: 'crate', mat: MAT.iron, accent: 'S' },
    crate_gold: { shape: 'crate', mat: MAT.gold, accent: 'o' }, crate_mythic: { shape: 'crate', mat: MAT.void, accent: 'F' },
    bottle: { shape: 'msgbottle', mat: ['F', 'w', 'W'] }, lantern_shard: { shape: 'gem', mat: ['y', 'w', 'o'] },
    charm_fortune: { shape: 'charm', mat: ['y', 'w', 'o'], accent: 'F' },
    fish_minnow: { shape: 'fish', mat: ['T', 'w', 'S'] }, fish_carp: { shape: 'fish', mat: ['o', 'y', 'b'], dots: [[5, 2], [7, 3], [6, 4]], dotCol: ['y', 'y', 'y'] },
    fish_perch: { shape: 'fish', mat: ['g', 'l', 'G'], dots: [[5, 2], [6, 3], [7, 2], [6, 4]], dotCol: ['G', 'G', 'G', 'G'] },
    fish_trout: { shape: 'fish', mat: ['p', 'w', 'v'], dots: [[4, 2], [6, 2], [8, 3], [5, 4]], dotCol: ['r', 'r', 'r', 'r'] },
    fish_bass: { shape: 'fish', mat: ['e', 'l', 'G'], dots: [[5, 3], [7, 3], [9, 3]], dotCol: ['G', 'G', 'G'] },
    fish_eel: { shape: 'fish', mat: ['t', 'T', 'S'] }, fish_catfish: { shape: 'fish', mat: ['b', 'd', 'B'] },
    fish_koi: { shape: 'fish', mat: ['w', 'c', 'T'], dots: [[4, 2], [6, 3], [8, 2], [5, 4]], dotCol: ['o', 'r', 'o', 'r'] },
    fish_pike: { shape: 'fish', mat: ['e', 'h', 'G'], dots: [[4, 2], [6, 2], [8, 2]], dotCol: ['s', 's', 's'] },
    fish_lantern: { shape: 'fish', mat: ['F', 'w', 'W'], dots: [[4, 3], [6, 4], [8, 3]], dotCol: ['y', 'y', 'y'] },
    fish_goldkoi: { shape: 'fish', mat: ['y', 'w', 'o'], dots: [[4, 2], [6, 3], [8, 2], [5, 4]], dotCol: ['w', 'w', 'w', 'w'] },
    fish_pie: { shape: 'pie', mat: ['d', 's', 'B'], accent: 'F' }, smoked_trout: { shape: 'fish', mat: ['o', 'y', 'B'] },
    stewed_eel: { shape: 'bowl', mat: ['u', 'v', 'n'] }, baked_bass: { shape: 'fish', mat: ['y', 'w', 'o'] },
    catfish_stew: { shape: 'bowl', mat: ['o', 'y', 'b'] }, koi_sashimi: { shape: 'plank', mat: ['p', 'w', 'r'] },
    lantern_soup: { shape: 'bowl', mat: ['F', 'w', 'W'] }, pike_roast: { shape: 'loaf', mat: ['d', 'o', 'B'], accent: 'g' },
};

/** Hand-drawn item icons (kept from the first version). */
const HAND: Partial<Record<ItemId, Grid>> = {
    wood: g('.bbbbbbd.', 'bbbbbbdsd', 'BbbbbbdBd', 'BBBBBBdsd', '.BBBBBBd.'),
    stone: g('..TTTt..', '.TTtttS.', 'TTttttSS', 'tttttSSS', '.SSSSSS.'),
    berry: g('...gl..', '.rrgrr.', 'rwrrwrr', 'rrrrrrr', '.rrrrr.', '..rrr..'),
    mushroom: g('...rrr...', '.rrwrrrr.', 'rrrrrrwrr', 'rwrrrrrrr', '...ccs...', '...ccs...', '..ccccs..'),
    melon: g('....gggg....', '..ggllglgg..', '.gglgGgGlgg.', '.glgGlgGglg.', '.gglgGgGlgg.', '..ggGllGgg..', '....GGGG....'),
    pumpkin: g('.....gG.....', '...lgGGg....', '..ooyooyoo..', '.oyyoyyoyoo.', 'oyyoyyoyyood', 'oyooyooyoodd', '.ooooooooodd', '..dddddddd..'),
};

function build (id: ItemId): Grid | null {
    const hand = HAND[id];
    if (hand) return hand;
    const s = SPEC[id];
    if (!s) return null;
    let rows = paint(SHAPES[s.shape], s.mat, s.accent ?? 'k');
    if (s.dots) rows = stamp(rows, s.dots.map(([x, y], i) => [x, y, s.dotCol![i % s.dotCol!.length]] as [number, number, string]));
    return rows;
}

// ── skill glyphs (k_*) ─────────────────────────────────────────────────────
// Each glyph is drawn with its own few palette chars; they sit inside a coloured frame in the tree.
const GLYPHS: Record<string, string[]> = {
    k_fist:    g('.cccccc.', 'cscscscc', 'cccccccc', 'cscscscc', '.cccccss', '..ccsss.', '..sssss.'),
    k_reach:   g('....c....', '...ccc...', '....c....', 'c.......c', 'cc.....cc', 'c.......c', '....c....', '...ccc...', '....c....'),
    k_axe:     g('...TTT...', '..TTwTT..', '.TTwTTb..', '.TTTTb...', '..TTb....', '...b.....', '..b......', '.B.......'),
    k_magnet:  g('rr.....bb', 'rr.....bb', 'rr.....bb', 'rr.....bb', 'TT.....TT', '.TTT.TTT.', '..TTTTT..'),
    k_sprout:  g('.gg...gg.', 'gllg.gllg', 'gllgGgllg', '.ggGGGgg.', '...GGG...', '...GGG...', '...bbb...'),
    k_clover:  g('.gg.gg.', 'glgglgg', 'gggggggg', '.ggGgg..', 'gggGggg', 'glgGglg', '.gg.gg.', '...G....'),
    k_bolt:    g('...yyy', '..yyy.', '.yyy..', 'yyyyyy', '..yyy.', '.yyy..', 'yy....'),
    k_chest:   g('.bbbbbbb.', 'bddddddbB', 'bddddddbB', 'yyyykyyyy', 'bddddddbB', 'bBBBBBBBB'),
    k_star:    g('...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'yy...yy'),
    k_burst:   g('y..y..y', '.y.y.y.', '..yyy..', 'yyywyyy', '..yyy..', '.y.y.y.', 'y..y..y'),
    k_crown:   g('y..y..y', 'yy.yy.yy', 'yyyyyyyy', 'yoyoyoyy', 'yyyyyyyy', 'oooooooo'),
    k_flask:   g('..www..', '..wFw..', '..wFw..', '.wFFFw.', 'wFFpFFw', 'wFFFFFw', '.wwwww.'),
    k_drop:    g('...W...', '..WWW..', '.WWwWW.', '.WWWWW.', 'WWwWWWW', 'WWWWWWW', '.WWWWW.', '..WWW..'),
    k_coin:    g('..yyyy..', '.yywwyy.', 'yywyyyyo', 'yywyoyyo', 'yyyyyoyo', '.yyoooo.', '..oooo..'),
    k_hammer:  g('.TTTTT..', '.TwwTTT.', '.TTTTTT.', '..bb....', '..bb....', '..bb....', '..BB....'),
    k_anvil:   g('TTTTTTTTT', 'TwwwwwwTt', '.tttTTt..', '...tTt...', '..ttTtt..', '.SSSSSSS.'),
    k_flame:   g('...o...', '..oo...', '.ooyo..', '.oyyoo.', 'ooyyyoo', 'ooyyyoo', '.ooyoo.', '..ooo..'),
    k_gear:    g('..TTT..', '.TTTTT.', 'TTT.TTT', 'TT...TT', 'TTT.TTT', '.TTTTT.', '..TTT..'),
    k_belt:    g('TTTTTTTTT', 'TSTSTSTST', 'tttttttt.', 'TSTSTSTST', 'TTTTTTTTT'),
    k_drill:   g('..TT...', '.TwT...', '.TTT...', '.TTT...', '..tt...', '..tt...', '...t...'),
    k_robot:   g('...y...', '.TTTTT.', 'TTkTkTT', 'TTTTTTT', '.TyTyT.', '.TTTTT.', '.T...T.'),
    k_shield:  g('TTTTTTT', 'TwwwTTt', 'TwTTTTt', 'TwTTTTt', '.TTTTt.', '..Ttt..', '...t...'),
    k_sword:   g('......wT', '.....wTt', '....wTt.', '...wTt..', 'b.wTt...', '.bTt....', '..bd....', '.dB.....'),
    k_target:  g('..rrrrr..', '.rwwwwwr.', 'rwwrrrwwr', 'rwrrkrrwr', 'rwwrrrwwr', '.rwwwwwr.', '..rrrrr..'),
    k_moon:    g('..ccc..', '.cc....', 'cc.....', 'cc.....', 'cc.....', '.cc..cc', '..cccc.'),
    k_skull:   g('.wwwww.', 'wwwwwww', 'wkwwwkw', 'wwwwwww', '.wwkww.', '.w.w.w.'),
    k_heart:   g('.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'),
    k_boot:    g('.bbb...', '.bBb...', '.bBb...', '.bBbbb.', 'bddBBBb', 'BBBBBBB'),
    k_paw:     g('.p..p.p..', 'pp.pp.pp.', '.p..p.p..', '..pppppp.', '.pppppppp', '.pppppppp', '..pppppp.'),
    k_hand:    g('..c.c.c..', '.cc.cc.cc', '.cccccccc', '.cccccccc', 'cccccccc.', '.cccccc..', '..cccc...'),
    k_den:     g('...bbb...', '..bddbb..', '.bddddbb.', 'bddkkddbb', 'bdkkkkdbb', 'bBkkkkBBb'),
    k_ear:     g('..ppp...', '.pppppp..', '.pp..pp..', '.pp.ppp..', '..ppppp..', '...pppp..', '....pp...'),
    k_eye:     g('..wwww..', '.wFFFFw.', 'wFFkkFFw', '.wFFFFw.', '..wwww..'),
    k_whistle: g('.TTTTT..', 'TwTTTTTT', 'TTkTTTTT', '.TTTTTT.', '..TT.T..'),
    k_lung:    g('...c...', '..ccc..', '.cc.cc.', 'ccc.ccc', 'cccpccc', '.cc.cc.'),
    k_bag:     g('..bbb..', '.bddbb.', 'bddddbb', 'bddsddb', 'bddddBb', '.bBBBb.'),
    k_book:    g('bbbbbbbb', 'bddddddB', 'bdwwwwdB', 'bdwwwwdB', 'bddddddB', 'BBBBBBBB'),
    k_flag:    g('b.......', 'brrrrr..', 'brwwrrr.', 'brrrrr..', 'b.......', 'b.......', 'b.......'),
    k_lock:    g('.TTTT.', 'T....T', 'T....T', 'TTTTTT', 'TTkkTT', 'TTkkTT', 'TTTTTT'),
    k_compass: g('..FFFF..', '.FwwwwF.', 'FwwrwwwF', 'FwrrrrwF', 'FwwrwwwF', '.FwwwwF.', '..FFFF..'),
    k_map:     g('ccccccccc', 'cpcssccsc', 'cppccsscc', 'ccrcccscc', 'cscccsppc', 'ccsccpppc', 'ccccccccc'),
    // the weather vane's forecast: a sun, a cloud with rain, a dark cloud with lightning, a fog bank, a red moon, a falling star and a fairy light
    k_sun:     g('....y....', '.y..y..y.', '..yyyyy..', '.yyywyyy.', 'yyywyyyyy', '.yyyyyoy.', '..yyyoo..', '.y..y..y.', '....y....'),
    k_rain:    g('...TTT....', '..TwwwT.T.', '.TwwwwwTwT', 'TwwwwwwwwT', 'TTTTTTTTTT', '..W..W..W.', '.W..W..W..', '..W..W....'),
    k_storm:   g('...ttt....', '..tSSSt.t.', '.tSSSSStSt', 'tSSSSSSSSt', 'ttttttttt.', '....yy....', '...yy.....', '..yyyy....', '....yy....', '...y......'),
    k_fog:     g('..FFFF....', '.FwwwwF.F.', 'FFFFFFFFFF', '..........', '.TTTTTTTT.', '..........', 'TTTTTTTT..', '..........', '..TTTTTT..'),
    k_blood:   g('..rrrr..', '.rpprrr.', 'rprrrrrr', 'rprrrrrr', 'rrrrrrro', 'rrrrrroo', '.rrrroo.', '..rooo..'),
    k_meteor:  g('o........', '.oo......', '..ooo....', '...ooyy..', '....yyyy.', '....yyyw.', '.....yy..'),
    k_fairy:   g('....p....', '....p..w.', '...ppp...', 'ppppwpppp', '...ppp...', '.w..p....', '....p....'),
};

/** Every icon grid by texture key (also used by tests and the dev gallery). */
export function iconGrids (): Record<string, Grid> {
    const out: Record<string, Grid> = {};
    for (const id of Object.keys(ITEMS) as ItemId[]) { const grid = build(id); if (grid) out[`i_${id}`] = grid; }
    return { ...out, ...GLYPHS };
}

/**
 * Registers every item icon (i_<id>) and skill glyph (k_*). Throws on a missing item icon. There are hundreds, each its own
 * canvas and texture, so the Boot scene asks for them in `parts` slices (`part` 0..parts-1) with a breath between; the glyphs
 * come with the last slice.
 */
export function registerIcons (scene: Phaser.Scene, part = 0, parts = 1) {
    const missing: string[] = [];
    const ids = Object.keys(ITEMS) as ItemId[], per = Math.ceil(ids.length / parts);
    for (const id of ids.slice(part * per, (part + 1) * per)) {
        const grid = build(id);
        if (!grid) { missing.push(id); continue; }
        makeSprite(scene, `i_${id}`, grid);
    }
    if (missing.length) throw new Error(`items without an icon: ${missing.join(', ')}`);
    if (part !== parts - 1) return;
    for (const [key, grid] of Object.entries(GLYPHS)) makeSprite(scene, key, grid);
}

