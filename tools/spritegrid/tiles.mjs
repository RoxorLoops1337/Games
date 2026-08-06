// Terrain tiles for EMBERKIN, authored here and written out as spritegrid JSON.
//
// The first set was per-pixel noise: every pixel picked at random from a five
// tone ramp. That is the textbook way to make a floor look like television
// static, and it is what the valley looked like. This set follows what pixel
// artists actually teach about texture and about colour:
//
//   · TEXTURE IS CLUSTERS, NOT PIXELS. A few small shapes, two or three pixels
//     across, repeated with an uneven distribution. Never draw single blades of
//     grass; never let one cluster touch another edge-on. Corner to corner is
//     fine and is what stops the field looking like a grid.
//   · CLUSTERS CROSS THE SEAM. A shape that runs off the right edge and back on
//     the left is what hides the fact that this is one tile repeated.
//   · BACKGROUNDS HOLD LESS CONTRAST THAN CHARACTERS. The ground shares its
//     hues with the creatures standing on it but keeps its values close
//     together, so the creature is the thing your eye lands on.
//   · SHADOWS COOL AND DESATURATE, LIGHTS WARM. Every ramp below shifts hue as
//     well as value — a green's shadow leans blue, its highlight leans yellow.
//     Three or four tones is plenty; more turns texture back into blur.
//
//   node tools/spritegrid/tiles.mjs            # write emberkin/art/tiles/*.json
//   node tools/spritegrid/tiles.mjs --sheet    # …and a contact sheet to look at
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validate, sheet, encodePNG, raster } from './render.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(REPO, 'emberkin', 'art', 'tiles');

/**
 * The valley's ramps. Each is dark → light, and each shifts hue as it climbs:
 * the shadow end is cooler and less saturated than the base, the light end is
 * warmer. The whole set sits in the same violet-leaning family as the UI, so
 * the world and the panels around it look like one object.
 */
const RAMP = {
  // Ground cover. A narrow value range on purpose — this is background. The
  // shadow end is cooled and desaturated hard, the light end warmed, so the
  // ramp carries depth without ever widening its contrast enough to compete
  // with a creature standing on it. Saturation is deliberately below what
  // looks right in isolation: the valley has to sit under a violet UI.
  grass:  { d: '#27503a', m: '#35684a', b: '#45805a', l: '#5c9a6a' },
  deep:   { d: '#1d3f2f', m: '#275238', b: '#326545', l: '#3f7852' },  // tall grass: darker, so it reads as cover
  earth:  { d: '#503c30', m: '#67503e', b: '#7e644d', l: '#957a60' },
  sand:   { d: '#7a674a', m: '#8f7c57', b: '#a89468', l: '#c0ac7e' },
  water:  { d: '#1b4266', m: '#245a85', b: '#2f74a3', l: '#4a95bf' },
  bark:   { d: '#33262a', m: '#453531', b: '#59453b', l: '#705a49' },
  leaf:   { d: '#1f4432', m: '#2a593c', b: '#376e49', l: '#488557' },
  stone:  { d: '#453f4f', m: '#575163', b: '#6d6779', l: '#888194' },
  wood:   { d: '#48362f', m: '#5e483a', b: '#745b47', l: '#8c7159' },
  roof:   { d: '#522c39', m: '#673c47', b: '#7e4e57', l: '#96646a' },
  bloom:  { d: '#7e4459', m: '#b25d74', b: '#d68294', l: '#f7bac8' },
};


/**
 * Tiles, 16 rows of 16. `.` is the ramp's base tone, so the pattern below is
 * only the texture on top of it — which is how it should read when you draw it.
 *   -  shadow cluster      +  light cluster      *  the rare brightest accent
 * Anything else is a per-tile extra named in `extra`.
 */
const TILES = {
  grass: ['Meadow grass', 'grass', `
..+..........-..
.++...--......--
..+...-.........
............++..
..--.........+..
.--..++.........
.....++......--.
-..........+..--
-.........++....
.....--.........
..+...-.......++
.++..........+++
.+..............
.......--.......
-.....--........
--..........+...`],
  tallgrass: ['Tall grass', 'deep', `
-..++.......--..
--..++...-......
-........--...++
....--........++
.++..-.......-..
.++.--......--..
.....-..++......
--......+++.....
-........+......
....++.......--.
...+++......--..
....+..-........
-......--....++.
--.....-.....+++
.-..++........+.
....++...--.....`],
  path: ['Trodden path', 'earth', `
....-......++...
.++.-...........
.++....--.......
........-....--.
..-..........-..
..-...++........
.....+++........
-.......-.......
-......--.......
............++..
...--.......+++.
..--.........+..
.............-..
..++.........-..
.+++........--..
.++.......--....`],
  sand: ['Pale sand', 'sand', `
..++.........-..
.+++........--..
..+..........-..
........--......
..--...........+
.--...++......++
......++.......+
....-...........
-...-...........
--.........++...
....++......+...
....++.......--.
.............-..
..-.............
.--....++.......
..-...+++.......`],
  water: ['Still water', 'water', `
................
++++.....+++++..
................
....------......
................
.....++++....+++
................
--------....----
................
..+++.....++++..
................
......----......
................
+++.....++++....
................
..----.......---`],
};

/** Structural tiles: drawn shape first, texture second. */
const SHAPES = {
  tree: ['Broadleaf tree', {
    K: '#16241c', d: RAMP.leaf.d, m: RAMP.leaf.m, b: RAMP.leaf.b, l: RAMP.leaf.l,
    t: RAMP.bark.d, u: RAMP.bark.m, v: RAMP.bark.b, g: RAMP.grass.m, h: RAMP.grass.d,
  }, `
gggKKKKKKKKggggg
ggKddmmmmddKgggg
gKdmmbbbbmmdKggg
KdmbblllbbmmdKgg
KdmblllllbbmmdKg
KdmbbllbbbbmmdKg
KddmbbbbbmmmddKg
gKddmmmmmmmddKgg
ggKKddmmmddKKggg
ggggKtuvutKggggg
ggggKtuvutKggggg
gggKKtuvutKKgggg
gggKtuvvvutKgggg
ggKtuvvvvvutKggg
gKhhKKKKKKKhhKgg
gghhhhgghhhhhggg`],
  rock: ['Standing stone', {
    K: '#241f2a', d: RAMP.stone.d, m: RAMP.stone.m, b: RAMP.stone.b, l: RAMP.stone.l,
    g: RAMP.grass.m, h: RAMP.grass.d, e: RAMP.grass.b,
  }, `
gggggggggggggggg
gggggKKKKKgggggg
ggggKdmmmdKggggg
gggKdmbbbmdKgggg
ggKdmbllbbmdKggg
ggKdmblbbbmmdKgg
gKdmmbbbbmmmddKg
gKdmmmbbmmmdddKg
gKddmmmmmmdddKgg
ggKddmmmmdddKggg
gggKKddmmdKKgggg
ggggKKddddKggggg
gggggKKKKKgggggg
gghhhhhhhhhhhggg
ghegggggggggehgg
gggggggggggggggg`],
  flowers: ['Meadow flowers', {
    g: RAMP.grass.m, h: RAMP.grass.d, e: RAMP.grass.b,
    s: RAMP.leaf.d, p: RAMP.bloom.m, q: RAMP.bloom.b, y: '#ffd98a',
  }, `
gggggggggggggeeg
gghggggggggggggg
ggggggggpqgggggg
geggggggqygggggg
gggggggggsggggeg
ggggggggggggghgg
gpqgggggggggggeg
gqyggggggggggggg
ggsgggggggpqgggg
gggggegggggqyggg
ggggggggggggsggg
gheggggggggggggg
ggggggggggggggeg
ggggpqgggggggggg
ggggqyggggggghgg
gggggsgggggggggg`],
  ledge: ['Ledge', {
    K: '#1c2a20', d: RAMP.earth.d, m: RAMP.earth.m, b: RAMP.earth.b,
    g: RAMP.grass.m, h: RAMP.grass.d, e: RAMP.grass.b,
  }, `
geggggeggggggegg
gggggggggegggggg
eggggggggggggegg
KKKKKKKKKKKKKKKK
dddddddddddddddd
mmbmmmmbmmmmbmmm
mmmmmbmmmmbmmmmm
dmmmmmmmmmmmmmmd
ddmdddmdddmdddmd
KKKKKKKKKKKKKKKK
gggggggggggggggg
ggehggggegggggeg
gggggggggggggggg
gegggggggehggggg
gggggggggggggggg
ggggeggggggggegg`],
  fence: ['Fence', {
    K: '#241a18', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b,
    g: RAMP.grass.m, h: RAMP.grass.d, e: RAMP.grass.b,
  }, `
gggggggggggggggg
ggegggggggggeggg
gKdmgggggggKdmgg
gKdmggggggeKdmgg
KKKKKKKKKKKKKKKK
dmbmmbmmbmmbmmbd
KKKKKKKKKKKKKKKK
gKdmggggggeKdmgg
gKdmgggggggKdmgg
KKKKKKKKKKKKKKKK
dmbmmbmmbmmbmmbd
KKKKKKKKKKKKKKKK
gKdmggggeggKdmgg
gKdmgggggggKdmgg
ggeggggggggggegg
gggggggegggggggg`],
  floor: ['Floorboards', {
    K: '#241a16', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b, l: RAMP.wood.l,
  }, `
mbmmmmlmmmmbmmmm
mmmmbmmmmmmmmlmm
KKKKKKKKKKKKKKKK
mmmlmmmmbmmmmmmm
mmmmmmmmmmbmmmlm
mmbmmmmmmmmmmmmm
KKKKKKKKKKKKKKKK
lmmmmmbmmmmmmmmb
mmmmmmmmmlmmmmmm
mmmmbmmmmmmmmmmm
KKKKKKKKKKKKKKKK
mmlmmmmmmmbmmmmm
mmmmmmbmmmmmmmlm
mmmmmmmmmmmmbmmm
KKKKKKKKKKKKKKKK
bmmmmlmmmmmmmmmm`],
  rug: ['Woven rug', {
    d: RAMP.roof.d, m: RAMP.roof.m, b: RAMP.roof.b, l: RAMP.roof.l, y: '#c69320',
  }, `
mmbmmmmdmmmmbmmm
mbbbmmdddmmbbbmm
mmbmmmmdmmmmbmmm
mmmmmmmmmmmmmmmm
ddmmmyymmmyymmdd
mmmmmyymmmyymmmm
mmmmmmmmmmmmmmmm
mmdmmmmbmmmmdmmm
mdddmmmbbbmmdddm
mmdmmmmbmmmmdmmm
mmmmmmmmmmmmmmmm
yymmmddmmmddmmyy
yymmmddmmmddmmyy
mmmmmmmmmmmmmmmm
mmmmbmmmmmmdmmmm
mmmbbbmmmmmdddmm`],
  wall: ['Cut wall', {
    K: '#221d29', d: RAMP.stone.d, m: RAMP.stone.m, b: RAMP.stone.b, l: RAMP.stone.l,
  }, `
KKKKKKKKKKKKKKKK
KmblllbmmKmbllbm
KdmmbbmmdKdmmbbm
KddmmmmddKddmmmd
KKKKKKKKKKKKKKKK
mbllbmKmbllllbmm
mmbbmdKdmmbbmmdd
ddmmmdKddmmmmddd
KKKKKKKKKKKKKKKK
KmbllbmmKmblllbm
KdmmbbmmdKdmmbbm
KddmmmmddKddmmmd
KKKKKKKKKKKKKKKK
mbllbmKmbllllbmm
mmbbmdKdmmbbmmdd
ddmmmdKddmmmmddd`],
  roof: ['Tiled roof', {
    K: '#2a1720', d: RAMP.roof.d, m: RAMP.roof.m, b: RAMP.roof.b, l: RAMP.roof.l,
  }, `
KKKKKKKKKKKKKKKK
dlbmdlbmdlbmdlbm
dmbbdmbbdmbbdmbb
ddmmddmmddmmddmm
KKKKKKKKKKKKKKKK
bmdlbmdlbmdlbmdl
bbdmbbdmbbdmbbdm
mmddmmddmmddmmdd
KKKKKKKKKKKKKKKK
dlbmdlbmdlbmdlbm
dmbbdmbbdmbbdmbb
ddmmddmmddmmddmm
KKKKKKKKKKKKKKKK
bmdlbmdlbmdlbmdl
bbdmbbdmbbdmbbdm
mmddmmddmmddmmdd`],
  door: ['Door', {
    K: '#1b1220', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b, l: RAMP.wood.l,
    s: RAMP.stone.d, y: '#ffc94d',
  }, `
ssssssssssssssss
sKKKKKKKKKKKKKKs
sKddddddddddddKs
sKdmmmmmmmmmmdKs
sKdmbbbbbbbbmdKs
sKdmbllllllbmdKs
sKdmbllllllbmdKs
sKdmbllyyllbmdKs
sKdmbllyyllbmdKs
sKdmbllllllbmdKs
sKdmbllllllbmdKs
sKdmbbbbbbbbmdKs
sKdmmmmmmmmmmdKs
sKddddddddddddKs
sKKKKKKKKKKKKKKs
ssssssssssssssss`],
  // ---- what makes a room a room -------------------------------------------
  // Three interiors built from the same generated box, all with the same rug,
  // is three copies of a room rather than three rooms. These are furniture:
  // objects, so they follow the sprite rules rather than the texture rules —
  // a silhouette that reads filled, an outline on the outside only, light from
  // the upper left. Each sits on its own patch of floorboard so it drops into
  // an interior without a seam.
  shelf: ['Bookshelf', {
    K: '#1b1220', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b, l: RAMP.wood.l,
    r: '#8c4048', g: '#3f7852', c: '#2f74a3', y: '#c69320', w: RAMP.wood.m, v: RAMP.wood.d,
  }, `
llllllllllllllll
KKKKKKKKKKKKKKKK
KrrgKbbyKccrKggK
KrrgKbbyKccrKggK
KrrgKbbyKccrKggK
KKKKKKKKKKKKKKKK
KggyKrrcKbbgKyyK
KggyKrrcKbbgKyyK
KggyKrrcKbbgKyyK
KKKKKKKKKKKKKKKK
KccbKyygKrrbKccK
KccbKyygKrrbKccK
KccbKyygKrrbKccK
KKKKKKKKKKKKKKKK
dddddddddddddddd
wwvwwwwwwwwvwwww`],
  counter: ['Counter', {
    K: '#1b1220', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b, l: RAMP.wood.l,
    w: RAMP.wood.m, v: RAMP.wood.d,
  }, `
wwwwwwwwwwwwwwww
wwvwwwwwwwwwwwww
KKKKKKKKKKKKKKKK
KllllllllllllllK
KlbbbbbbbbbbbblK
KbmmmmmmmmmmmmbK
KbmdmmmmdmmmmmbK
KbmmmmmmmmmmmmbK
KbdmmmdmmmmmdmbK
KbmmmmmmmmmmmmbK
KKKKKKKKKKKKKKKK
KddddddddddddddK
KKKKKKKKKKKKKKKK
wwwwwwwwwwwvwwww
wwwwwwwwwwwwwwww
wwvwwwwwwwwwwwww`],
  bed: ['Bed', {
    K: '#1b1220', d: RAMP.wood.d, l: '#e8dcc8', p: '#cfc3ae',
    b: '#4a5f8e', c: '#63799f', w: RAMP.wood.m, v: RAMP.wood.d,
  }, `
wwwwwwwwwwwwwwww
wKKKKKKKKKKKKKKw
wKllppppppppllKw
wKlpppppppppplKw
wKllppppppppllKw
wKKKKKKKKKKKKKKw
wKbbbbbbbbbbbbKw
wKbccbbccbbccbKw
wKbbbbbbbbbbbbKw
wKbccbbccbbccbKw
wKbbbbbbbbbbbbKw
wKbccbbccbbccbKw
wKbbbbbbbbbbbbKw
wKKKKKKKKKKKKKKw
wddddddddddddddw
wwwwwwwvwwwwwwww`],
  crate: ['Crate', {
    K: '#1b1220', d: RAMP.wood.d, m: RAMP.wood.m, l: RAMP.wood.l,
    w: RAMP.wood.m, v: RAMP.wood.d,
  }, `
wwwwwwwwwwwwwwww
wwvwwwwwwwwwwwww
wwKKKKKKKKKKKKww
wwKllllllllllKww
wwKlmmmmmmmmlKww
wwKlmdmmmmdmlKww
wwKlmmmmmmmmlKww
wwKllllllllllKww
wwKlmmmmmmmmlKww
wwKlmdmmmmdmlKww
wwKlmmmmmmmmlKww
wwKllllllllllKww
wwKKKKKKKKKKKKww
wwddddddddddddww
wwwwwwwwwwwvwwww
wwwwwwwwwwwwwwww`],
  pot: ['Potted fern', {
    K: '#1b1220', d: RAMP.wood.d, g: RAMP.leaf.m, G: RAMP.leaf.l, t: RAMP.bark.m,
    r: '#7e4e57', b: '#96646a', w: RAMP.wood.m, v: RAMP.wood.d,
  }, `
wwwwwwwwwwwwwwww
wwwwwwgGgwwwwwww
wwwwggGGGggwwwww
wwwgGGgGgGGgwwww
wwgGGgGGGgGGgwww
wgGGgGGGGGgGGgww
wwgGGgGGGgGGgwww
wwwgGGgGgGGgwwww
wwwwggGtGggwwwww
wwwwwwgtgwwwwwww
wwwKKKKKKKKKwwww
wwwKbbbbbbbKwwww
wwwKbrrrrrbKwwww
wwwKbrrrrrbKwwww
wwwKKbbbbbKKwwww
wwwwdddddddwwwww`],
  window: ['Window', {
    K: '#221d29', d: RAMP.stone.d, m: RAMP.stone.m, b: RAMP.stone.b, l: RAMP.stone.l,
    t: RAMP.wood.d, y: '#ffe7b0', o: '#f7c979',
  }, `
KKKKKKKKKKKKKKKK
KmblllbmmKmbllbm
KdmmbbmmdKdmmbbm
KKKKKKKKKKKKKKKK
tttttttttttttttt
tyyyyyytyyyyyyot
tyyyyyytyyyyyoot
tyyyyyytyyyyooot
tttttttttttttttt
tyyyyyytyyyyyoot
tyyyyyytyyyyooot
tyyyyyytyyyoooot
tttttttttttttttt
KmblllbmmKmbllbm
KdmmbbmmdKdmmbbm
KKKKKKKKKKKKKKKK`],
  sign: ['Signpost', {
    K: '#1b1220', d: RAMP.wood.d, m: RAMP.wood.m, b: RAMP.wood.b, l: RAMP.wood.l,
    g: RAMP.grass.m, h: RAMP.grass.d, e: RAMP.grass.b,
  }, `
gggggggggggggggg
ggKKKKKKKKKKKggg
gKdmmmmmmmmmdKgg
gKdbllllllllbdKg
gKdbllllllllbdKg
gKdblllllllllbKg
gKdbllllllllbdKg
gKdmmmmmmmmmdKgg
ggKKKKKdmKKKKggg
ggggggKdmKgggggg
ggggggKdmKgggggg
ggggggKdmKgggggg
ggggeeKdmKeegggg
ggggghhKKhhggggg
gggggghhhggggggg
gggggggggggggggg`],
};

// ---------------------------------------------------------------- build ----
const built = [];
const push = (id, name, palette, art) => {
  const rows = art.trim().split('\n');
  const sp = { id, name, tile: true, w: 16, h: 16, palette, rows };
  validate(sp, id);
  built.push(sp);
};

for (const [id, [name, rampName, art]] of Object.entries(TILES)) {
  const r = RAMP[rampName];
  // The base tone fills everything the pattern does not claim.
  const rows = art.trim().split('\n').map((row) => row.replace(/\./g, 'm'));
  push(id, name, { m: r.m, '-': r.d, '+': r.b, '*': r.l }, rows.join('\n'));
}
for (const [id, [name, palette, art]] of Object.entries(SHAPES)) push(id, name, palette, art);

mkdirSync(OUT, { recursive: true });
for (const sp of built) writeFileSync(join(OUT, `${sp.id}.json`), JSON.stringify(sp, null, 2) + '\n');
console.log(`wrote ${built.length} tiles → emberkin/art/tiles/`);

if (process.argv.includes('--sheet')) {
  const out = process.argv[process.argv.indexOf('--sheet') + 1] || '/tmp/tiles.png';
  // Draw each tile 3×3 so the seams show — a tile that only looks good alone
  // is not a tile.
  const tiled = built.map((sp) => ({
    id: sp.id, name: sp.name, palette: sp.palette,
    rows: Array.from({ length: 48 }, (_, y) => sp.rows[y % 16].repeat(3)),
  }));
  const img = sheet(tiled, 4, 5);
  writeFileSync(out, encodePNG(img.data, img.W, img.H));
  console.log(`contact sheet → ${out}`);
  void raster;
}
