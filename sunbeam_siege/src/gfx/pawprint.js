/* Pawprint: procedural 32x32 pixel cat sprites for SUNBEAM SIEGE.
 * Classic script. Defines window.SB.gfx.pawprint (also aliased to window.Pawprint).
 * Deterministic from a genome. No images. Cats face RIGHT, flip at draw time.
 * Pipeline per frame: shadow, tail, body, legs, head, ears, pattern, face, accessory, outline.
 */
(function () {
  'use strict';
  window.SB = window.SB || {};
  SB.gfx = SB.gfx || {};

  var W = 32, H = 32, N = 1024, GROUND = 29;

  // ---------------------------------------------------------------- utils
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function hash2(x, y, seed) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function h2r(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixc(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function mulc(a, k) { return [Math.round(a[0] * k), Math.round(a[1] * k), Math.round(a[2] * k)]; }
  var INK = [20, 14, 40];

  // ramp: 4 levels. 0 base, 1 shade, 2 light, 3 line (darker inner line). ol = outline color.
  function ramp(hex) {
    var c = h2r(hex);
    var shade = mixc(mulc(c, 0.76), [42, 30, 84], 0.22);
    var light = mixc(c, [255, 244, 214], 0.4);
    var line = mixc(shade, INK, 0.45);
    return { c: [c, shade, light, line], ol: mixc(mulc(c, 0.4), INK, 0.35) };
  }
  function explicit(base, shade, light, outline) {
    var s = h2r(shade);
    return { c: [h2r(base), s, h2r(light), mixc(s, INK, 0.4)], ol: h2r(outline) };
  }
  function flat(hex, ol) {
    var c = h2r(hex);
    return { c: [c, c, c, c], ol: ol ? h2r(ol) : mixc(mulc(c, 0.4), INK, 0.35) };
  }

  var FUR_DEF = {
    orange: ['#f09040', '#c0642a', '#ffc27a', '#b84e1c', '#5a2a14'],
    black: ['#3a3a48', '#26262f', '#5a5a6c', '#1a1a22', '#0e0e14'],
    white: ['#f2eee6', '#cfc8bc', '#ffffff', '#b9b1a6', '#5a5468'],
    grey: ['#8f95a6', '#6a7084', '#b9bfd0', '#565c70', '#2e3242'],
    cream: ['#e8cf9a', '#c4a770', '#fbe8bc', '#a98552', '#5a4426'],
    chocolate: ['#7a4a34', '#55301f', '#a06a4e', '#3a2014', '#26130b'],
    blue: ['#7c8aa8', '#5a6784', '#a6b3cf', '#44506c', '#232a3e'],
    ginger: ['#ffa94d', '#d67a22', '#ffd08a', '#a65216', '#603010'],
    gold: ['#d8a24a', '#a8742c', '#f4cd7c', '#4a2c14', '#4a2c14'],
    sphynx: ['#e9a99a', '#c27f78', '#ffd2c4', '#a85d62', '#5a2a38']
  };
  var FUR = {}, FURALT = {};
  Object.keys(FUR_DEF).forEach(function (k) {
    var d = FUR_DEF[k];
    FUR[k] = explicit(d[0], d[1], d[2], d[4]);
    FURALT[k] = d[3];
  });
  var WHITE = explicit('#f2eee6', '#cfc8bc', '#ffffff', '#5a5468');
  var PINK = flat('#ffa0ae', '#7a3a4a');
  var NOSE = flat('#ff8fa0', '#7a3a4a');
  var EYEDARK = flat('#1a1226', '#1a1226');
  var EYEWHITE = flat('#ffffff', '#1a1226');
  var EYE_COL = { green: '#6fd66f', amber: '#ffc83a', blue: '#5fb4ff', copper: '#d8803a' };
  var BOXR = ramp('#d9a96a');
  BOXR.c[1] = h2r('#b88848'); BOXR.c[2] = h2r('#f0d3a3'); BOXR.c[3] = h2r('#7a5326'); BOXR.ol = h2r('#4a3014');
  var GOLD = explicit('#ffcf4a', '#c98f1c', '#fff0a0', '#6a4208');

  // ---------------------------------------------------------------- vocab
  var BODIES = ['slim', 'tabby', 'chonk', 'large', 'tall', 'kitten', 'floof'];
  var FURS = Object.keys(FUR_DEF);
  var PATTERNS = ['solid', 'stripes', 'spots', 'tuxedo', 'calico', 'siamese', 'tortie', 'bicolor', 'hairless'];
  var EARS = ['point', 'round', 'fold', 'tufted', 'tiny'];
  var EYES = ['round', 'slit', 'sleepy', 'wide', 'happy'];
  var EYECOLS = ['green', 'amber', 'blue', 'copper', 'odd'];
  var TAILS = ['long', 'stub', 'fluffy', 'curl', 'ring'];
  var ACCS = ['none', 'collar', 'bell', 'bow', 'bowtie', 'scarf', 'hat_wizard', 'hat_crown', 'hat_party', 'hat_top',
    'glasses', 'eyepatch', 'bandana', 'cape', 'armor_helm', 'headphones', 'cardboard_box', 'box_head', 'flower',
    'monocle', 'pirate_hat', 'chef_hat', 'sunglasses'];
  var ACC_COLOR = {
    collar: '#ff5d6c', bell: '#ff5d6c', bow: '#ff6fae', bowtie: '#ff5d6c', scarf: '#ff6a3d', hat_wizard: '#5b4bd6',
    hat_crown: '#ffcf4a', hat_party: '#ff6fae', hat_top: '#ff5d6c', glasses: '#ffcf4a', eyepatch: '#1a1a22',
    bandana: '#ff5d6c', cape: '#c0264a', armor_helm: '#aab4c8', headphones: '#ff5d6c', cardboard_box: '#d9a96a',
    box_head: '#d9a96a', flower: '#ff6fae', monocle: '#ffcf4a', pirate_hat: '#26262f', chef_hat: '#f2eee6',
    sunglasses: '#1a1a22', none: '#ff5d6c'
  };

  // body geometry: b = [cx, cy, rx, ry], h = [hx, hy, rx, ry]
  var BODY_GEO = {
    slim: { b: [14, 22, 8, 5], h: [21, 14, 6, 5] },
    tabby: { b: [14, 22, 9, 6], h: [21, 14, 7, 6] },
    chonk: { b: [13, 21, 11, 8], h: [20, 14, 7, 6] },
    large: { b: [13, 20, 12, 9], h: [20, 13, 8, 7] },
    tall: { b: [13, 20, 7, 9], h: [20, 12, 6, 6] },
    kitten: { b: [13, 24, 7, 5], h: [19, 17, 8, 7] },
    floof: { b: [13, 21, 10, 7], h: [20, 14, 8, 6] }
  };

  function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }
  function wpick(r, table) {
    var tot = 0, k;
    for (k in table) tot += table[k];
    var x = r() * tot;
    for (k in table) { x -= table[k]; if (x < 0) return k; }
    return k;
  }
  function inList(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }

  // ---------------------------------------------------------------- genome
  function normalize(g) {
    g = g || {};
    var out = {};
    out.seed = (g.seed | 0) || 1;
    out.body = inList(g.body, BODIES, 'tabby');
    out.pattern = inList(g.pattern, PATTERNS, 'solid');
    out.fur = inList(g.fur, FURS, out.pattern === 'hairless' ? 'sphynx' : 'orange');
    out.patternColor = g.patternColor || null;
    out.ears = inList(g.ears, EARS, 'point');
    out.eyes = inList(g.eyes, EYES, 'round');
    out.eyeColor = inList(g.eyeColor, EYECOLS, 'green');
    out.tail = inList(g.tail, TAILS, 'long');
    out.accessory = inList(g.accessory, ACCS, 'none');
    out.accessoryColor = g.accessoryColor || ACC_COLOR[out.accessory] || '#ff5d6c';
    out.cape = g.cape ? (typeof g.cape === 'string' ? g.cape : (g.capeColor || '#c0264a')) : (out.accessory === 'cape' ? out.accessoryColor : null);
    out.scale = g.scale || 1;
    return out;
  }
  var SEEDED = { spots: 1, calico: 1, tortie: 1 };
  function genomeKey(g) {
    return [g.body, g.fur, g.pattern, g.patternColor || '', g.ears, g.eyes, g.eyeColor, g.tail, g.accessory,
      g.accessoryColor, g.cape || '', SEEDED[g.pattern] ? g.seed : 0].join('|');
  }

  var CLAN_ALIAS = { prowl: 'alley', nap: 'moon', cardboard: 'mischief', chaos: 'mischief', yarn: 'mischief' };
  var CLAN_BIAS = {
    alley: {
      fur: { black: 4, grey: 3, orange: 3, ginger: 2, chocolate: 2, white: 1 },
      acc: { bandana: 4, eyepatch: 2, collar: 2, none: 2, scarf: 1, pirate_hat: 1 },
      eyes: { slit: 4, round: 2, wide: 1 }, ears: { tufted: 3, point: 3, fold: 1, tiny: 1 }
    },
    hearth: {
      fur: { orange: 4, cream: 4, ginger: 3, white: 2, gold: 2 },
      acc: { scarf: 4, bell: 2, flower: 2, chef_hat: 1, none: 2, bow: 1 },
      eyes: { happy: 4, round: 3, sleepy: 1 }, ears: { round: 3, point: 2, fold: 2 }
    },
    moon: {
      fur: { grey: 3, blue: 4, black: 3, white: 2, cream: 1 },
      acc: { hat_wizard: 4, cape: 3, hat_crown: 1, monocle: 1, none: 2 },
      eyes: { sleepy: 3, slit: 3, round: 1 }, ears: { fold: 2, point: 3, tufted: 2 }
    },
    mischief: {
      fur: { orange: 2, grey: 2, white: 2, cream: 1, black: 2, ginger: 1 },
      acc: { headphones: 3, cardboard_box: 1, box_head: 2, bow: 2, hat_party: 3, sunglasses: 2, none: 1 },
      eyes: { wide: 4, round: 2, happy: 2 }, ears: { point: 3, round: 2, tufted: 2 }
    },
    neutral: {
      fur: { orange: 3, grey: 3, black: 3, white: 2, cream: 2, chocolate: 1, blue: 1, ginger: 2 },
      acc: { none: 6, collar: 2, bell: 1, bow: 1, bowtie: 1 },
      eyes: { round: 4, slit: 1, happy: 1, sleepy: 1 }, ears: { point: 4, round: 2, fold: 1 }
    }
  };

  // Generate a genome. opts: {clan, rarity ('common'..'champion'), body, accessory, pattern, fur}
  function randomGenome(seed, opts) {
    opts = opts || {};
    seed = seed | 0;
    var r = mulberry32(seed ^ 0x9e3779b1);
    var clan = CLAN_ALIAS[opts.clan] || opts.clan || 'neutral';
    var bias = CLAN_BIAS[clan] || CLAN_BIAS.neutral;
    var g = { seed: seed || 1 };
    g.body = opts.body || wpick(r, { slim: 3, tabby: 6, chonk: 3, large: 1, tall: 2, kitten: 1, floof: 3 });
    g.pattern = opts.pattern || wpick(r, { solid: 20, stripes: 22, spots: 6, tuxedo: 12, calico: 8, siamese: 5, tortie: 8, bicolor: 10, hairless: 3 });
    if (opts.fur) g.fur = opts.fur;
    else {
      var P = g.pattern;
      if (P === 'tuxedo') g.fur = wpick(r, { black: 6, grey: 2, chocolate: 1, blue: 1 });
      else if (P === 'calico') g.fur = 'white';
      else if (P === 'tortie') g.fur = wpick(r, { black: 6, chocolate: 1 });
      else if (P === 'siamese') g.fur = 'cream';
      else if (P === 'spots') g.fur = wpick(r, { gold: 4, ginger: 2, cream: 1, grey: 1 });
      else if (P === 'hairless') g.fur = 'sphynx';
      else if (P === 'stripes') g.fur = wpick(r, wfilter(bias.fur, { white: 0 }));
      else g.fur = wpick(r, bias.fur);
    }
    g.ears = wpick(r, bias.ears);
    if (g.pattern === 'hairless') g.ears = 'point';
    g.eyes = wpick(r, bias.eyes);
    var ec = r();
    g.eyeColor = g.pattern === 'siamese' ? 'blue' : (ec < 0.38 ? 'green' : ec < 0.68 ? 'amber' : ec < 0.82 ? 'copper' : ec < 0.94 ? 'blue' : 'odd');
    if (clan === 'mischief' && r() < 0.3) g.eyeColor = 'odd';
    g.tail = wpick(r, { long: 6, stub: 2, fluffy: 3, curl: 3, ring: 2 });
    if (g.body === 'floof' && r() < 0.6) g.tail = 'fluffy';
    var rar = opts.rarity || 'common';
    var accChance = { common: 0.35, uncommon: 0.55, rare: 0.75, epic: 0.9, champion: 1 }[rar];
    if (accChance === undefined) accChance = 0.4;
    g.accessory = opts.accessory || (r() < accChance ? wpick(r, bias.acc) : 'none');
    var hues = ['#ff5d6c', '#5fb4ff', '#7be495', '#ffcf4a', '#b86bff', '#ff6fae', '#ff8a3d', '#6fd6ff'];
    g.accessoryColor = opts.accessoryColor || ACC_COLOR[g.accessory] && (r() < 0.5 ? ACC_COLOR[g.accessory] : pick(r, hues));
    if (g.accessory === 'hat_crown' || g.accessory === 'armor_helm' || g.accessory === 'chef_hat' || g.accessory === 'pirate_hat') g.accessoryColor = ACC_COLOR[g.accessory];
    g.scale = rar === 'champion' ? 1.25 : 1;
    return normalize(g);
  }
  function wfilter(t, over) {
    var o = {};
    for (var k in t) o[k] = t[k];
    for (k in over) { if (over[k] === 0) delete o[k]; else o[k] = over[k]; }
    return o;
  }

  // Named descriptors: "ginger tabby chonk wizard", "tuxedo slim bowtie", {fur:'grey', ...}
  var ALIAS = {
    body: { thin: 'slim', skinny: 'slim', slim: 'slim', fat: 'chonk', chonk: 'chonk', chonky: 'chonk', chubby: 'chonk', large: 'large', big: 'large', huge: 'large', tall: 'tall', kitten: 'kitten', kit: 'kitten', floof: 'floof', floofy: 'floof', average: 'tabby' },
    pattern: { tabby: 'stripes', striped: 'stripes', stripes: 'stripes', solid: 'solid', bengal: 'spots', spots: 'spots', spotted: 'spots', tuxedo: 'tuxedo', calico: 'calico', siamese: 'siamese', point: 'siamese', tortie: 'tortie', tortoiseshell: 'tortie', bicolor: 'bicolor', hairless: 'hairless', sphynx: 'hairless' },
    fur: { orange: 'orange', black: 'black', white: 'white', grey: 'grey', gray: 'grey', cream: 'cream', chocolate: 'chocolate', brown: 'chocolate', blue: 'blue', russian: 'blue', ginger: 'ginger', gold: 'gold', golden: 'gold', pink: 'sphynx' },
    ears: { pointy: 'point', round: 'round', fold: 'fold', folded: 'fold', tufted: 'tufted', lynx: 'tufted', tiny: 'tiny' },
    eyes: { slit: 'slit', sleepy: 'sleepy', wide: 'wide', happy: 'happy', round: 'round' },
    eyeColor: { green: 'green', amber: 'amber', blue: 'blue', copper: 'copper', odd: 'odd', oddeyed: 'odd' },
    tail: { stub: 'stub', bobtail: 'stub', fluffy: 'fluffy', curl: 'curl', curly: 'curl', ring: 'ring', ringtail: 'ring', banded: 'ring', long: 'long' },
    accessory: { collar: 'collar', bell: 'bell', bow: 'bow', bowtie: 'bowtie', scarf: 'scarf', wizard: 'hat_wizard', crown: 'hat_crown', party: 'hat_party', tophat: 'hat_top', glasses: 'glasses', spectacles: 'glasses', eyepatch: 'eyepatch', bandana: 'bandana', cape: 'cape', helm: 'armor_helm', helmet: 'armor_helm', headphones: 'headphones', boxed: 'cardboard_box', box: 'box_head', boxhead: 'box_head', flower: 'flower', monocle: 'monocle', pirate: 'pirate_hat', chef: 'chef_hat', sunglasses: 'sunglasses', shades: 'sunglasses' }
  };
  var ALIAS_ORDER = ['pattern', 'fur', 'body', 'ears', 'eyes', 'tail', 'accessory', 'eyeColor'];
  function fromDescriptor(desc, seed) {
    if (desc && typeof desc === 'object') {
      var o = {}; for (var k in desc) o[k] = desc[k];
      if (seed !== undefined && o.seed === undefined) o.seed = seed;
      if (o.seed === undefined) o.seed = hashStr(JSON.stringify(desc));
      return normalize(o);
    }
    var text = String(desc || '').toLowerCase();
    var words = text.split(/[^a-z0-9]+/).filter(Boolean);
    var g = { seed: seed !== undefined ? seed : hashStr(text) };
    var prevWord = '';
    words.forEach(function (w) {
      if (w === 'cape' || w === 'cloak' || w === 'mantle' || w === 'capes') { g.cape = true; prevWord = w; return; }
      // "blue eyes" / "amber eyes" are eye colors, "blue" alone is the fur
      if (EYECOLS.indexOf(w) >= 0 && w !== 'blue' && w !== 'odd') { g.eyeColor = w; prevWord = w; return; }
      if ((w === 'eyes' || w === 'eyed') && prevWord) {
        if (EYECOLS.indexOf(prevWord) >= 0) { g.eyeColor = prevWord; if (ALIAS.fur[prevWord] && g.fur === ALIAS.fur[prevWord]) delete g.fur; }
        if (prevWord === 'odd') g.eyeColor = 'odd';
        return;
      }
      for (var i = 0; i < ALIAS_ORDER.length; i++) {
        var f = ALIAS_ORDER[i];
        if (ALIAS[f][w] !== undefined && (f !== 'eyeColor' || w === 'odd' || w === 'oddeyed')) {
          if (g[f] === undefined) g[f] = ALIAS[f][w];
          break;
        }
      }
      prevWord = w;
    });
    // coherent defaults when only the pattern was named
    if (!g.fur) {
      var P = g.pattern;
      if (P === 'tuxedo') g.fur = 'black';
      else if (P === 'calico') g.fur = 'white';
      else if (P === 'tortie') g.fur = 'black';
      else if (P === 'siamese') g.fur = 'cream';
      else if (P === 'spots') g.fur = 'gold';
      else if (P === 'hairless') g.fur = 'sphynx';
      else if (P === 'stripes') g.fur = 'orange';
    }
    if (g.fur && !g.pattern) g.pattern = 'solid';
    if (g.pattern === 'siamese' && !g.eyeColor) g.eyeColor = 'blue';
    return normalize(g);
  }

  // Named registry so champions have a fixed look.
  var REGISTRY = {};
  function register(id, genomeOrDescriptor) {
    var g = (typeof genomeOrDescriptor === 'string' || (genomeOrDescriptor && !genomeOrDescriptor.body && !genomeOrDescriptor.fur && !genomeOrDescriptor.pattern))
      ? fromDescriptor(genomeOrDescriptor, hashStr(id)) : normalize(genomeOrDescriptor);
    REGISTRY[id] = g;
    return g;
  }
  // A few fixed looks (others may register more).
  register('elder_cat', { seed: 77, body: 'floof', fur: 'grey', pattern: 'solid', ears: 'fold', eyes: 'sleepy', eyeColor: 'amber', tail: 'fluffy', accessory: 'glasses', accessoryColor: '#ffcf4a' });
  register('champion_sunbeam', { seed: 5, body: 'chonk', fur: 'ginger', pattern: 'stripes', ears: 'round', eyes: 'happy', eyeColor: 'amber', tail: 'ring', accessory: 'hat_crown', scale: 1.25 });
  register('champion_moonwhisker', { seed: 9, body: 'tall', fur: 'black', pattern: 'solid', ears: 'point', eyes: 'slit', eyeColor: 'odd', tail: 'long', accessory: 'hat_wizard', accessoryColor: '#6a4bd6', scale: 1.25 });
  function fromId(id) {
    if (REGISTRY[id]) return REGISTRY[id];
    return randomGenome(hashStr(String(id)), {});
  }

  // ---------------------------------------------------------------- frame buffer
  function Frame() {
    this.pi = new Uint8Array(N); this.lv = new Uint8Array(N); this.mat = new Uint8Array(N);
    this.ly = new Uint8Array(N); this.ti = new Int16Array(N).fill(-1);
    this.pal = [null]; this.layer = 0; this.sh = new Uint8Array(N);
  }
  Frame.prototype.p = function (r) {
    var i = this.pal.indexOf(r);
    if (i < 0) { this.pal.push(r); i = this.pal.length - 1; }
    return i;
  };
  Frame.prototype.set = function (x, y, r, lv, mat) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var i = y * W + x;
    this.pi[i] = this.p(r); this.lv[i] = lv | 0; this.mat[i] = mat | 0; this.ly[i] = this.layer;
  };
  Frame.prototype.has = function (x, y) {
    return x >= 0 && y >= 0 && x < W && y < H && this.pi[y * W + x] !== 0;
  };
  Frame.prototype.matAt = function (x, y) {
    return (x >= 0 && y >= 0 && x < W && y < H && this.pi[y * W + x] !== 0) ? this.mat[y * W + x] : 0;
  };
  Frame.prototype.rect = function (x, y, w, h, r, lv, mat) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, r, lv, mat);
  };
  // repaint existing pixel palette only (keeps level and mat), optional mats filter
  Frame.prototype.paint = function (x, y, r, mats, lvOverride) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var i = y * W + x;
    if (!this.pi[i]) return;
    if (mats && mats.indexOf(this.mat[i]) < 0) return;
    this.pi[i] = this.p(r);
    if (lvOverride !== undefined) this.lv[i] = lvOverride;
  };
  Frame.prototype.lvAt = function (x, y) { return this.lv[y * W + x]; };
  Frame.prototype.setLv = function (x, y, lv, mats) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    var i = y * W + x;
    if (!this.pi[i]) return;
    if (mats && mats.indexOf(this.mat[i]) < 0) return;
    this.lv[i] = lv;
  };
  function inEll(x, y, cx, cy, rx, ry) {
    var dx = (x - cx) / (rx + 0.4), dy = (y - cy) / (ry + 0.4);
    return dx * dx + dy * dy <= 1;
  }
  var M = { BODY: 1, HEAD: 2, TAIL: 3, LIMB: 4, EAR: 5, ACC: 6 };

  // ---------------------------------------------------------------- poses
  // flags: dx shift, bob, tail sway, blink, mouth, paw, expr (null|angry|hurt|sleep|dead), sleep, dead, boxed, hidden
  var POSES = {
    idle0: {},
    idle1: { bob: 1, tail: 1 },
    blink0: { blink: 1 },
    blink1: { bob: 1, tail: 1, blink: 1 },
    attack: { dx: 2, mouth: 1, paw: 1, expr: 'angry', tail: -1, lean: 1 },
    hurt: { dx: -2, mouth: 1, expr: 'hurt', tail: 2, earsBack: 1 },
    sleep0: { sleep: 1, expr: 'sleep' },
    sleep1: { sleep: 1, expr: 'sleep', bob: 1 },
    dead: { dead: 1, expr: 'dead', bob: 1, tail: 1 },
    boxed0: { boxed: 1 },
    boxed1: { boxed: 1, bob: 1 },
    hidden0: { hidden: 1 },
    hidden1: { hidden: 1, bob: 1 }
  };
  var POSE_ALIAS = { sleep: 'sleep0', boxed: 'boxed0', hidden: 'hidden0', idle: 'idle0', blink: 'blink0', death: 'dead', ghost: 'dead' };
  var POSE_NAMES = ['idle0', 'idle1', 'blink0', 'blink1', 'attack', 'hurt', 'sleep0', 'sleep1', 'dead', 'boxed0', 'boxed1', 'hidden0', 'hidden1'];

  // ---------------------------------------------------------------- parts
  function tailPath(type, g, bx, by, sleep) {
    var pts, th;
    if (sleep) { pts = [[0, 0], [-3, 0], [-5, -1], [-6, -3]]; th = type === 'fluffy' ? 4 : 2; }
    else if (type === 'stub') { pts = [[0, 0], [-3, -1]]; th = 3; }
    else if (type === 'curl') { pts = [[0, 0], [-3, 0], [-5, -2], [-5, -5], [-4, -8], [-2, -10], [0, -10], [1, -8], [0, -6]]; th = 2; }
    else if (type === 'fluffy') { pts = [[0, 0], [-3, 0], [-5, -2], [-6, -5], [-6, -8], [-5, -11], [-4, -13]]; th = 4; }
    else { pts = [[0, 0], [-3, 0], [-5, -2], [-6, -5], [-6, -8], [-5, -11], [-4, -13]]; th = type === 'ring' ? 3 : 2; }
    if (g.pattern === 'hairless' && th > 2) th = 2;
    var fx = Math.min(1, Math.max(0.3, (bx - 1) / 7));
    return { pts: pts.map(function (p) { return [Math.round(bx + p[0] * fx), by + p[1]]; }), th: th, fx: fx };
  }
  function stamp(F, x, y, th, r, lv, mat, idx) {
    var i, j, set = function (a, b) {
      F.set(a, b, r, lv, mat);
      if (a >= 0 && b >= 0 && a < W && b < H) F.ti[b * W + a] = idx;
    };
    if (th === 1) { set(x, y); return; }
    if (th === 2) { set(x, y); set(x + 1, y); set(x, y + 1); set(x + 1, y + 1); return; }
    if (th === 3) { for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) set(x + i, y + j); return; }
    for (j = -1; j <= 2; j++) for (i = -1; i <= 2; i++) {
      if ((i === -1 || i === 2) && (j === -1 || j === 2)) continue;
      set(x + i, y + j);
    }
  }
  function drawTail(F, G, g, fur, P) {
    var t = tailPath(g.tail, g, G.b.cx - G.b.rx + 2 - (G.dx > 0 ? G.dx : 0), G.b.cy + (P.sleep ? G.b.ry - 3 : 1), P.sleep);
    var pts = t.pts, sway = P.tail || 0, dense = [], k;
    for (k = 0; k < pts.length - 1; k++) {
      var a = pts[k], b = pts[k + 1], steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2 || 1;
      for (var s = 0; s < steps; s++) dense.push([a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps]);
    }
    dense.push(pts[pts.length - 1]);
    var n = dense.length;
    G.tailTip = null;
    var done = {};
    for (k = 0; k < n; k++) {
      var x = Math.round(dense[k][0] + sway * (k / (n - 1))), y = Math.round(dense[k][1]);
      var key = x + ',' + y;
      if (done[key]) continue;
      done[key] = 1;
      stamp(F, x, y, t.th, fur, 0, M.TAIL, Math.round(k / (n - 1) * 20));
    }
    // shade outer/left edge, light on top edge (tail pixels only)
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      if (F.matAt(xx, yy) !== M.TAIL) continue;
      if (F.matAt(xx - 1, yy) === 0 && F.matAt(xx, yy - 1) === 0) F.setLv(xx, yy, 2, [M.TAIL]);
      else if (F.matAt(xx - 1, yy) === 0 || F.matAt(xx, yy + 1) === 0) F.setLv(xx, yy, 1, [M.TAIL]);
      else if (F.matAt(xx, yy - 1) === 0) F.setLv(xx, yy, 2, [M.TAIL]);
    }
    G.tailThin = t.th;
  }

  function drawBody(F, G, g, fur, P) {
    var b = G.b, x, y;
    var top = b.cy - b.ry;
    for (y = b.cy - b.ry - 1; y <= b.cy + b.ry + 1; y++) for (x = b.cx - b.rx - 1; x <= b.cx + b.rx + 1; x++) {
      if (!inEll(x, y, b.cx, b.cy, b.rx, b.ry)) continue;
      var lv = 0;
      if (y >= b.cy + b.ry * 0.38) lv = 1;
      if (!inEll(x, y - 1, b.cx, b.cy, b.rx, b.ry) && y <= b.cy) lv = 2;
      else if (!inEll(x - 1, y, b.cx, b.cy, b.rx, b.ry) && y < b.cy + 1) lv = 2;
      F.set(x, y, fur, lv, M.BODY);
    }
    // haunch: thigh shading arc
    if (!P.sleep) {
      var hcx = b.cx - Math.round(b.rx * 0.4), hcy = b.cy + 1, hrx = Math.max(3, Math.round(b.rx * 0.5)), hry = Math.max(3, Math.round(b.ry * 0.75));
      for (y = hcy - hry - 1; y <= hcy + hry + 1; y++) for (x = hcx - hrx - 1; x <= hcx + hrx + 1; x++) {
        if (!inEll(x, y, hcx, hcy, hrx, hry) || F.matAt(x, y) !== M.BODY) continue;
        var edgeR = !inEll(x + 1, y, hcx, hcy, hrx, hry), edgeB = !inEll(x, y + 1, hcx, hcy, hrx, hry);
        if ((edgeR || edgeB) && x >= hcx - 1) F.setLv(x, y, 1, [M.BODY]);
        else if (!inEll(x, y - 1, hcx, hcy, hrx, hry) && y < hcy - 1) F.setLv(x, y, 2, [M.BODY]);
      }
    } else {
      // loaf: a crease
      for (x = b.cx - b.rx + 3; x < b.cx + 1; x++) F.setLv(x, b.cy + 1, 1, [M.BODY]);
    }
    // floof fringe
    if (g.body === 'floof') fringe(F, M.BODY, fur, 3);
    G.bodyTop = top;
  }
  function fringe(F, mat, fur, mod) {
    var add = [];
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
      if (F.matAt(x, y) !== mat) continue;
      var h = (x * 3 + y * 5) % (mod + 1);
      if (h !== 0) continue;
      if (!F.has(x - 1, y) && x < 16) add.push([x - 1, y, 1]);
      else if (!F.has(x, y + 1) && y > 24) add.push([x, y + 1, 1]);
      else if (!F.has(x, y - 1)) add.push([x, y - 1, 2]);
    }
    add.forEach(function (a) { F.set(a[0], a[1], fur, a[2], mat); });
  }

  function drawLegs(F, G, g, fur, P) {
    var b = G.b, ex = P.paw ? 4 : 0;
    var yTop = Math.min(b.cy + b.ry - 3, GROUND - 3);
    var x0 = b.cx + b.rx - 5;
    var x;
    // far front leg (shaded)
    F.rect(x0 - 4, yTop, 3, GROUND - yTop + 1, fur, 1, M.LIMB);
    F.rect(x0 - 4, GROUND, 3, 1, fur, 2, M.LIMB);
    // near front leg
    if (P.paw) {
      var py = GROUND - 5;
      F.rect(x0 + 1, py, 9, 3, fur, 0, M.LIMB);
      F.rect(x0 + 1, py, 9, 1, fur, 2, M.LIMB);
      F.rect(x0 + 1, py + 2, 9, 1, fur, 1, M.LIMB);
      F.rect(x0 + 9, py, 1, 3, fur, 2, M.LIMB);
      F.set(x0 + 10, py, WHITE, 0, M.LIMB); F.set(x0 + 10, py + 2, WHITE, 0, M.LIMB);
      // standing leg
      F.rect(x0 - 1, yTop + 1, 3, GROUND - yTop, fur, 0, M.LIMB);
      F.rect(x0 - 1, GROUND, 3, 1, fur, 2, M.LIMB);
    } else {
      F.rect(x0, yTop, 3, GROUND - yTop + 1, fur, 0, M.LIMB);
      F.rect(x0, GROUND, 3, 1, fur, 2, M.LIMB);
    }
    // hind foot (does not shift with dx so attacks stretch)
    var hx = b.cx - b.rx + 2 - (G.dx || 0);
    F.rect(hx, GROUND - 1, 5, 2, fur, 0, M.LIMB);
    F.rect(hx, GROUND, 5, 1, fur, 2, M.LIMB);
    G.pawX = x0 + 1;
  }

  function drawHead(F, G, g, fur, P) {
    var h = G.h, x, y;
    for (y = h.y - h.ry - 1; y <= h.y + h.ry + 1; y++) for (x = h.x - h.rx - 2; x <= h.x + h.rx + 2; x++) {
      if (!inEll(x, y, h.x, h.y, h.rx, h.ry)) continue;
      var lv = 0;
      if (y >= h.y + h.ry * 0.55) lv = 1;
      if (!inEll(x, y - 1, h.x, h.y, h.rx, h.ry)) lv = 2;
      else if (!inEll(x - 1, y, h.x, h.y, h.rx, h.ry) && y <= h.y) lv = 2;
      F.set(x, y, fur, lv, M.HEAD);
    }
    // cheek fluff
    if (g.body === 'floof' || g.body === 'large') {
      F.set(h.x - h.rx - 1, h.y + 3, fur, 1, M.HEAD); F.set(h.x - h.rx - 1, h.y + 2, fur, 0, M.HEAD);
      F.set(h.x + h.rx + 1, h.y + 3, fur, 1, M.HEAD);
    }
    // head to body separation line
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (F.matAt(x, y) !== M.HEAD) continue;
      if (F.matAt(x, y + 1) === M.BODY || F.matAt(x, y + 1) === M.LIMB) {
        if (y > h.y) F.setLv(x, y, 3, [M.HEAD]);
      }
    }
    // muzzle light
    for (y = h.y + 1; y <= h.y + h.ry; y++) for (x = G.fx - 3; x <= G.fx + 3; x++) {
      if (F.matAt(x, y) === M.HEAD && inEll(x, y, G.fx + 0.5, h.y + 3.5, 3, 2) && F.lvAt(x, y) <= 1) F.setLv(x, y, 2, [M.HEAD]);
    }
    if (g.body === 'floof') fringe(F, M.HEAD, fur, 4);
  }

  var EAR_ROWS = {
    point: [5, 3, 3, 1], round: [5, 5, 3], fold: [5, 3, 3], tufted: [5, 3, 3, 1], tiny: [3, 1], big: [5, 5, 3, 3, 3, 1]
  };
  function drawEars(F, G, g, fur, P) {
    var h = G.h, baseY = h.y - h.ry + 1 + (P.earsBack ? 1 : 0), side;
    var type = g.pattern === 'hairless' ? 'big' : g.ears;
    var rows = EAR_ROWS[type] || EAR_ROWS.point;
    for (side = -1; side <= 1; side += 2) {
      var cx = h.x + side * Math.max(3, Math.round(h.rx * 0.6));
      rows.forEach(function (w, r) {
        var y = baseY - r, half = (w - 1) / 2;
        for (var i = -half; i <= half; i++) {
          var lv = (r === rows.length - 1 || (type !== 'round' && Math.abs(i) === half && r > 0 && side < 0)) ? 2 : 0;
          if (Math.abs(i) === half && side > 0) lv = 1;
          F.set(cx + i, y, fur, lv, M.EAR);
        }
      });
      if (type === 'fold') { F.set(cx + side * 2, baseY - 2, fur, 1, M.EAR); F.set(cx + side * 2, baseY - 1, fur, 1, M.EAR); }
      if (type === 'tufted') { F.set(cx, baseY - 4, flat('#2a2236'), 0, M.EAR); F.set(cx, baseY - 5, flat('#2a2236'), 0, M.EAR); }
      if (!P.earsBack && type !== 'tiny') {
        var ih = type === 'big' ? 3 : 2;
        for (var q = 1; q <= ih; q++) if (rows[q] >= 3) F.set(cx, baseY - q, PINK, 0, M.EAR);
      }
    }
  }

  // ---------------------------------------------------------------- patterns
  function altRamp(g) { return ramp(g.patternColor || FURALT[g.fur] || '#3a2014'); }
  function eachPix(F, mats, fn) {
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var m = F.matAt(x, y);
      if (m && (!mats || mats.indexOf(m) >= 0)) fn(x, y, m);
    }
  }
  function applyPattern(F, G, g, fur, P) {
    var pat = g.pattern, b = G.b, h = G.h, alt = altRamp(g), x, y, k, rnd = mulberry32(g.seed * 31 + 7);
    var FM = [M.BODY, M.HEAD, M.TAIL, M.LIMB], BODYM = [M.BODY];
    if (pat === 'stripes') {
      var top = b.cy - b.ry;
      for (k = 0; k < 4; k++) {
        var x0 = b.cx - b.rx + 3 + k * 3;
        for (y = top; y <= top + Math.min(b.ry + 1, 6); y++) {
          var xx = x0 + ((y - top) >> 2);
          F.paint(xx, y, alt, BODYM);
          if (y === top + 1) F.paint(xx + 1, y, alt, BODYM);
        }
      }
      if (!P.sleep) F.paint(b.cx + b.rx - 2, b.cy + 1, alt, BODYM);
      // forehead marks and cheek lines
      for (k = -1; k <= 1; k++) {
        F.paint(h.x + k * 2, h.y - h.ry + 1, alt, [M.HEAD]); F.paint(h.x + k * 2, h.y - h.ry + 2, alt, [M.HEAD]);
      }
      F.paint(h.x - h.rx, h.y + 2, alt, [M.HEAD]); F.paint(h.x - h.rx + 1, h.y + 2, alt, [M.HEAD]);
      F.paint(h.x + h.rx - 1, h.y + 3, alt, [M.HEAD]); F.paint(h.x + h.rx, h.y + 3, alt, [M.HEAD]);
      // leg bars
      eachPix(F, [M.LIMB], function (x2, y2) { if (y2 === GROUND - 2) F.paint(x2, y2, alt, [M.LIMB]); });
      // tail rings
      eachPix(F, [M.TAIL], function (x2, y2) { var i = F.ti[y2 * W + x2]; if (i >= 0 && (i % 6) < 2 && i > 2) F.paint(x2, y2, alt, [M.TAIL]); });
    } else if (pat === 'spots') {
      var n = 9, tries = 0, put = 0;
      while (put < n && tries++ < 60) {
        var px = b.cx - b.rx + 2 + Math.floor(rnd() * (b.rx * 2 - 3)), py = b.cy - b.ry + 1 + Math.floor(rnd() * (b.ry * 1.5));
        if (F.matAt(px, py) !== M.BODY || F.matAt(px + 2, py + 2) !== M.BODY) continue;
        if (put % 3 === 0) {
          for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) if (!(i === 1 && j === 1)) F.paint(px + i, py + j, alt, BODYM);
        } else { F.paint(px, py, alt, BODYM); F.paint(px + 1, py, alt, BODYM); F.paint(px, py + 1, alt, BODYM); F.paint(px + 1, py + 1, alt, BODYM); }
        put++;
      }
      F.paint(h.x - 1, h.y - h.ry + 2, alt, [M.HEAD]); F.paint(h.x + 2, h.y - h.ry + 2, alt, [M.HEAD]); F.paint(h.x + 0, h.y - h.ry + 1, alt, [M.HEAD]);
      F.paint(h.x - h.rx + 1, h.y + 2, alt, [M.HEAD]); F.paint(h.x + h.rx - 1, h.y + 3, alt, [M.HEAD]);
      eachPix(F, [M.TAIL], function (x2, y2) { var i = F.ti[y2 * W + x2]; if (i >= 0 && (i % 5) === 1 && ((x2 + y2) & 1) === 0) F.paint(x2, y2, alt, [M.TAIL]); });
      eachPix(F, [M.LIMB], function (x2, y2) { if (y2 === GROUND - 2 && (x2 & 1)) F.paint(x2, y2, alt, [M.LIMB]); });
    } else if (pat === 'tuxedo' || pat === 'bicolor') {
      var chestCx = b.cx + b.rx - 3, bic = pat === 'bicolor';
      eachPix(F, [M.BODY], function (x2, y2) {
        if (bic ? y2 >= b.cy + 1 || inEll(x2, y2, chestCx, b.cy + 1, 4, b.ry) : inEll(x2, y2, chestCx + 1, b.cy + 2, 3, b.ry - 1)) F.paint(x2, y2, WHITE, BODYM);
      });
      // muzzle, chin and blaze
      eachPix(F, [M.HEAD], function (x2, y2) {
        var inMuzzle = y2 >= h.y + 2 && Math.abs(x2 - (G.fx + 0.5)) <= (y2 >= h.y + 4 ? 3.5 : 2.5);
        var blaze = bic && Math.abs(x2 - G.fx) <= (y2 < h.y ? 0 : 1) && y2 >= h.y - h.ry + 1 && y2 <= h.y + 2;
        if (inMuzzle || blaze) F.paint(x2, y2, WHITE, [M.HEAD]);
      });
      eachPix(F, [M.LIMB], function (x2, y2) { if (y2 >= GROUND - (bic ? 3 : 1)) F.paint(x2, y2, WHITE, [M.LIMB]); });
      if (bic) eachPix(F, [M.TAIL], function (x2, y2) { var i = F.ti[y2 * W + x2]; if (i >= 17) F.paint(x2, y2, WHITE, [M.TAIL]); });
    } else if (pat === 'calico') {
      var cols = [ramp('#f09040'), ramp('#3a3a48'), ramp('#f2eee6'), ramp('#f09040'), ramp('#3a3a48'), ramp('#f2eee6')];
      cols[2] = WHITE; cols[5] = WHITE;
      var seeds = [];
      for (k = 0; k < 7; k++) seeds.push([4 + rnd() * 24, 6 + rnd() * 22, cols[k % 6]]);
      // guarantee a head patch pair
      seeds.push([h.x - 2, h.y - 2, cols[0]]); seeds.push([h.x + 4, h.y + 3, cols[2]]);
      eachPix(F, FM, function (x2, y2) {
        var best = 1e9, c = cols[2];
        for (var s = 0; s < seeds.length; s++) {
          var d = Math.hypot(seeds[s][0] - x2, (seeds[s][1] - y2) * 1.2) + hash2(x2, y2, g.seed) * 3.6;
          if (d < best) { best = d; c = seeds[s][2]; }
        }
        F.paint(x2, y2, c, FM);
      });
    } else if (pat === 'tortie') {
      var O1 = ramp('#f09040'), O2 = ramp('#c0642a');
      eachPix(F, FM, function (x2, y2) {
        var v = hash2((x2 + (y2 & 1)) >> 1, y2 >> 1, g.seed);
        var v2 = hash2(x2, y2, g.seed + 3);
        if (v < 0.34) F.paint(x2, y2, O1, FM);
        else if (v < 0.5 || v2 < 0.08) F.paint(x2, y2, O2, FM);
      });
      // keep the black face blaze for charm
    } else if (pat === 'siamese') {
      var pt = ramp(g.patternColor || '#5a3a2a');
      eachPix(F, [M.EAR], function (x2, y2) { F.paint(x2, y2, pt, [M.EAR]); });
      eachPix(F, [M.HEAD], function (x2, y2) { if (inEll(x2, y2, G.fx + 0.5, h.y + 3.6, 3.4, 2.6)) F.paint(x2, y2, pt, [M.HEAD]); });
      eachPix(F, [M.LIMB], function (x2, y2) { if (y2 >= GROUND - 3) F.paint(x2, y2, pt, [M.LIMB]); });
      eachPix(F, [M.TAIL], function (x2, y2) { var i = F.ti[y2 * W + x2]; if (i > 3 || i < 0) F.paint(x2, y2, pt, [M.TAIL]); });
      // darker back shading on cream body
      eachPix(F, BODYM, function (x2, y2) { if (y2 <= b.cy - b.ry + 1 && x2 < b.cx) F.paint(x2, y2, ramp('#d9bc84'), BODYM); });
    } else if (pat === 'hairless') {
      var wr = ramp('#c27f78');
      for (k = -1; k <= 1; k += 2) { F.paint(h.x + k * 2, h.y - h.ry + 2, wr, [M.HEAD], 3); F.paint(h.x + k * 2 + k, h.y - h.ry + 3, wr, [M.HEAD], 3); }
      F.paint(h.x, h.y - h.ry + 3, wr, [M.HEAD], 3);
      for (k = 0; k < 3; k++) { F.paint(b.cx - 2 + k * 3, b.cy - 2, wr, BODYM, 3); F.paint(b.cx - 1 + k * 3, b.cy - 1, wr, BODYM, 3); }
      eachPix(F, [M.TAIL], function (x2, y2) { var i = F.ti[y2 * W + x2]; if (i >= 18) F.paint(x2, y2, ramp('#d9908a'), [M.TAIL]); });
    }
    // banded tail overrides
    if (g.tail === 'ring' && pat !== 'stripes') {
      eachPix(F, [M.TAIL], function (x2, y2) {
        var i = F.ti[y2 * W + x2];
        if (i >= 0 && ((i % 6) < 3) && i > 1) F.paint(x2, y2, pat === 'calico' || pat === 'tuxedo' ? ramp('#3a3a48') : ramp(FURALT[g.fur] || '#3a2014'), [M.TAIL]);
      });
    }
  }

  // ---------------------------------------------------------------- face
  function eyeColorFor(g, side) {
    if (g.eyeColor === 'odd') return side < 0 ? EYE_COL.blue : EYE_COL.amber;
    return EYE_COL[g.eyeColor];
  }
  function drawEye(F, g, side, ex, ey, kind) {
    var col = flat(eyeColorFor(g, side)), D = EYEDARK, Wh = EYEWHITE;
    var x0 = ex - 1, y0 = ey - 1;
    if (kind === 'closed') { F.rect(x0, ey, 3, 1, D, 0, M.ACC); return; }
    if (kind === 'sleep') { F.rect(x0, ey, 3, 1, D, 0, M.ACC); return; }
    if (kind === 'hurt') {
      if (side < 0) { F.set(x0, y0, D, 0, M.ACC); F.set(x0 + 1, ey, D, 0, M.ACC); F.set(x0, y0 + 2, D, 0, M.ACC); }
      else { F.set(x0 + 2, y0, D, 0, M.ACC); F.set(x0 + 1, ey, D, 0, M.ACC); F.set(x0 + 2, y0 + 2, D, 0, M.ACC); }
      return;
    }
    if (kind === 'dead') {
      F.set(x0, y0, D, 0, M.ACC); F.set(x0 + 2, y0, D, 0, M.ACC); F.set(ex, ey, D, 0, M.ACC);
      F.set(x0, y0 + 2, D, 0, M.ACC); F.set(x0 + 2, y0 + 2, D, 0, M.ACC);
      return;
    }
    if (kind === 'happy') {
      F.set(x0, ey + 1, D, 0, M.ACC); F.set(ex, ey, D, 0, M.ACC); F.set(x0 + 2, ey + 1, D, 0, M.ACC);
      return;
    }
    if (kind === 'sleepy') {
      F.rect(x0, y0 + 1, 3, 1, D, 0, M.ACC);
      F.rect(x0, y0 + 2, 3, 1, col, 0, M.ACC); F.set(ex, y0 + 2, D, 0, M.ACC);
      return;
    }
    if (kind === 'wide') {
      F.rect(x0, y0 - 1, 3, 4, col, 0, M.ACC);
      F.rect(ex, ey - 1, 2, 2, D, 0, M.ACC); F.set(x0, y0 - 1, Wh, 0, M.ACC);
      return;
    }
    if (kind === 'slit') {
      F.rect(x0, y0, 3, 3, col, 0, M.ACC); F.rect(ex, y0, 1, 3, D, 0, M.ACC); F.set(x0, y0, Wh, 0, M.ACC);
      return;
    }
    // round
    F.rect(x0, y0, 3, 3, col, 0, M.ACC);
    F.set(ex, ey, D, 0, M.ACC); F.set(ex, ey + 1, D, 0, M.ACC);
    F.set(x0, y0, Wh, 0, M.ACC);
  }
  function drawFace(F, G, g, fur, P) {
    var h = G.h, fx = G.fx, ey = h.y, kind = g.eyes;
    if (P.expr === 'hurt') kind = 'hurt';
    else if (P.expr === 'dead') kind = 'dead';
    else if (P.expr === 'sleep') kind = 'sleep';
    else if (P.blink) kind = 'closed';
    G.eyeKind = kind;
    drawEye(F, g, -1, fx - 3, ey, kind);
    drawEye(F, g, 1, fx + 3, ey, kind);
    if (P.expr === 'angry') {
      F.rect(fx - 4, ey - 1, 3, 1, EYEDARK, 0, M.ACC); F.set(fx - 2, ey, EYEDARK, 0, M.ACC);
      F.rect(fx + 2, ey - 1, 3, 1, EYEDARK, 0, M.ACC); F.set(fx + 2, ey, EYEDARK, 0, M.ACC);
    }
    // nose and mouth
    F.set(fx, ey + 2, NOSE, 0, M.ACC);
    F.set(fx - 1, ey + 2, NOSE, 0, M.ACC);
    if (P.mouth) {
      F.rect(fx - 1, ey + 3, 3, 2, flat('#4a1a2a'), 0, M.ACC); F.set(fx, ey + 4, PINK, 0, M.ACC);
    } else if (P.expr === 'sleep') {
      F.set(fx, ey + 3, EYEDARK, 0, M.ACC);
    } else {
      F.set(fx - 1, ey + 4, EYEDARK, 0, M.ACC); F.set(fx, ey + 3, EYEDARK, 0, M.ACC); F.set(fx + 1, ey + 4, EYEDARK, 0, M.ACC);
    }
    // whiskers and blush
    if (g.body !== 'kitten' && g.pattern !== 'hairless') {
      [[fx - 6, ey + 3], [fx - 5, ey + 3], [fx + 5, ey + 3], [fx + 6, ey + 3], [fx - 5, ey + 4], [fx + 5, ey + 4]].forEach(function (p) {
        F.setLv(p[0], p[1], 2, [M.HEAD]);
      });
    }
    if (!P.expr || P.expr === 'sleep') {
      [[fx - 5, ey + 2], [fx + 5, ey + 2]].forEach(function (p) {
        var i = p[1] * W + p[0];
        if (F.mat[i] === M.HEAD) F.paint(p[0], p[1], flat('#ff9aa8'), [M.HEAD], 0);
      });
    }
  }

  // ---------------------------------------------------------------- accessories
  function clampH(want, avail) { return Math.max(3, Math.min(want, avail)); }
  function tri(F, cx, baseY, h, baseW, r, lvf, mat) {
    for (var r2 = 0; r2 < h; r2++) {
      var w = Math.max(1, Math.round(baseW * (1 - r2 / h)));
      var half = Math.floor(w / 2);
      for (var i = -half; i <= half - (w % 2 === 0 ? 1 : 0); i++) F.set(cx + i, baseY - r2, r, lvf ? lvf(i, r2, half) : 0, mat);
    }
  }
  function lineP(F, x0, y0, x1, y1, r, lv, mat) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (var i = 0; i <= n; i++) F.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), r, lv, mat);
  }
  function boxFront(F, x0, y0, w, hgt) {
    F.rect(x0, y0, w, hgt, BOXR, 0, M.ACC);
    F.rect(x0, y0 + hgt - 3, w, 3, BOXR, 1, M.ACC);
    F.rect(x0, y0, w, 1, BOXR, 3, M.ACC);
    F.rect(x0, y0 + 1, w, 1, BOXR, 2, M.ACC);
    F.rect(x0 + (w >> 1) - 1, y0, 3, hgt - 2, BOXR, 2, M.ACC); // tape
    F.rect(x0 + (w >> 1) - 1, y0 + 2, 3, 1, BOXR, 0, M.ACC);
    F.set(x0 + 3, y0 + hgt - 5, BOXR, 3, M.ACC); F.set(x0 + 4, y0 + hgt - 5, BOXR, 3, M.ACC); F.set(x0 + 5, y0 + hgt - 5, BOXR, 3, M.ACC);
    F.set(x0 + w - 6, y0 + 4, BOXR, 3, M.ACC); F.set(x0 + w - 5, y0 + 4, BOXR, 3, M.ACC);
  }

  function drawAccBack(F, G, g, P) {
    var acc = g.accessory, A = ramp(g.accessoryColor), h = G.h, b = G.b, x, y;
    if (g.cape) {
      A = ramp(g.cape); F.layer++;
      var nx = h.x - 3, ny = h.y + h.ry - 2, run = Math.min(13, nx - 1);
      for (x = nx; x >= nx - run; x--) {
        var t = nx - x, wave = Math.round(Math.sin(t * 0.9 + 1) * 1.2);
        var top = Math.max(1, ny - 4 - Math.round(t * 0.3) + wave), bot = Math.min(GROUND - 1, ny + 2 + Math.round(t * 0.55) + (t > 5 ? wave : 0));
        for (y = top; y <= bot; y++) F.set(x, y, A, (y <= top + 1) ? 2 : ((y >= bot - 1 || x <= nx - run + 1) ? 1 : 0), M.ACC);
      }
    }
  }
  function drawAccFront(F, G, g, P) {
    var acc = g.accessory, A = ramp(g.accessoryColor), h = G.h, b = G.b, x, y, i;
    var top = h.y - h.ry, fx = G.fx, ex1 = fx - 3, ex2 = fx + 3, ey = h.y;
    var avail = top + 1;
    F.layer++;
    switch (acc) {
      case 'collar': case 'bell': {
        for (x = h.x - 5; x <= h.x + 5; x++) for (y = h.y + h.ry - 1; y <= h.y + h.ry; y++) {
          var m = F.matAt(x, y);
          if (m === M.BODY || m === M.HEAD || m === M.LIMB) F.set(x, y, A, y === h.y + h.ry ? 1 : 0, M.ACC);
        }
        if (acc === 'bell') { F.rect(h.x + 1, h.y + h.ry + 1, 2, 2, GOLD, 0, M.ACC); F.set(h.x + 1, h.y + h.ry + 1, GOLD, 2, M.ACC); F.set(h.x + 2, h.y + h.ry + 2, GOLD, 1, M.ACC); }
        else { F.rect(h.x + 1, h.y + h.ry + 1, 2, 2, GOLD, 0, M.ACC); }
        break;
      }
      case 'bowtie': {
        var by = h.y + h.ry, bx = h.x + 1;
        for (i = 0; i < 3; i++) { F.set(bx - 1 - i, by - 1 + (i === 2 ? 1 : 0), A, 0, M.ACC); F.set(bx + 1 + i, by - 1 + (i === 2 ? 1 : 0), A, 0, M.ACC); F.set(bx - 1 - i, by, A, 1, M.ACC); F.set(bx + 1 + i, by, A, 1, M.ACC); F.set(bx - 1 - i, by + 1, A, 1, M.ACC); F.set(bx + 1 + i, by + 1, A, 1, M.ACC); }
        F.set(bx - 3, by - 1, A, 2, M.ACC); F.set(bx + 3, by - 1, A, 2, M.ACC);
        F.rect(bx, by - 1, 1, 3, A, 3, M.ACC);
        break;
      }
      case 'scarf': {
        var B2 = ramp('#fff0c8');
        for (x = h.x - 6; x <= h.x + 5; x++) for (y = h.y + h.ry - 2; y <= h.y + h.ry + 1; y++) {
          var mm = F.matAt(x, y);
          if ((mm === M.BODY || mm === M.HEAD || mm === M.LIMB) && !(y === h.y + h.ry - 2 && mm === M.HEAD)) F.set(x, y, ((x + (y >> 1)) % 4 < 2 && y > h.y + h.ry - 2) ? B2 : A, y === h.y + h.ry + 1 ? 1 : 0, M.ACC);
        }
        for (y = h.y + h.ry + 1; y <= h.y + h.ry + 4; y++) { F.set(h.x - 5, y, (y & 2) ? B2 : A, 0, M.ACC); F.set(h.x - 4, y, (y & 2) ? B2 : A, 1, M.ACC); }
        break;
      }
      case 'bandana': {
        var wh = flat('#ffffff');
        for (var k = 0; k < 5; k++) for (x = h.x - 4 + k; x <= h.x + 4 - k; x++) {
          y = h.y + h.ry - 1 + k;
          var m2 = F.matAt(x, y);
          if (m2 === M.BODY || m2 === M.HEAD || m2 === M.LIMB) F.set(x, y, A, k > 2 ? 1 : 0, M.ACC);
        }
        F.set(h.x - 5, h.y + h.ry - 1, A, 0, M.ACC); F.set(h.x + 5, h.y + h.ry - 1, A, 0, M.ACC);
        F.set(h.x - 1, h.y + h.ry, wh, 0, M.ACC); F.set(h.x + 2, h.y + h.ry, wh, 0, M.ACC); F.set(h.x + 1, h.y + h.ry + 2, wh, 0, M.ACC);
        break;
      }
      case 'hat_wizard': {
        var HH = clampH(8, avail), brimY = top + 1, C2 = flat('#ffd95a');
        for (x = h.x - 6; x <= h.x + 6; x++) F.set(x, brimY, A, 0, M.ACC);
        for (x = h.x - 5; x <= h.x + 5; x++) F.set(x, brimY + 1, A, 1, M.ACC);
        for (var r = 0; r < HH; r++) {
          var half = Math.round(4 * (1 - r / HH)), bend = r >= HH - 3 ? (r - (HH - 4)) : 0;
          for (x = -half; x <= half; x++) F.set(h.x - 1 - bend + x, brimY - 1 - r, A, x > half - 1 && half > 0 ? 1 : (r === HH - 1 ? 2 : 0), M.ACC);
        }
        for (x = h.x - 5; x <= h.x + 3; x++) F.set(x, brimY - 1, C2, 0, M.ACC);
        F.set(h.x - 2, brimY - 1 - Math.floor(HH / 2), C2, 0, M.ACC);
        F.set(h.x - 1, brimY - 2 - Math.floor(HH / 2), C2, 0, M.ACC);
        break;
      }
      case 'hat_crown': {
        var cy2 = top - 1;
        for (x = h.x - 3; x <= h.x + 3; x++) { F.set(x, cy2, GOLD, 2, M.ACC); F.set(x, cy2 + 1, GOLD, 0, M.ACC); F.set(x, cy2 + 2, GOLD, 1, M.ACC); }
        [-3, 0, 3].forEach(function (o) { F.set(h.x + o, cy2 - 1, GOLD, 2, M.ACC); });
        F.set(h.x, cy2 - 2, GOLD, 2, M.ACC);
        F.set(h.x, cy2 + 1, flat('#ff3d5a'), 0, M.ACC);
        F.set(h.x - 2, cy2 + 1, flat('#5fb4ff'), 0, M.ACC); F.set(h.x + 2, cy2 + 1, flat('#7be495'), 0, M.ACC);
        break;
      }
      case 'hat_party': {
        var PH = clampH(7, avail), stripe = flat('#ffffff'), by2 = top + 1;
        for (var r3 = 0; r3 < PH; r3++) {
          var w3 = Math.max(1, Math.round(6 * (1 - r3 / PH))), cx3 = h.x - 3 + Math.floor(r3 / 3);
          for (x = 0; x < w3; x++) F.set(cx3 - Math.floor(w3 / 2) + x, by2 - r3, (r3 % 3 === 1) ? stripe : A, x === w3 - 1 && w3 > 1 ? 1 : 0, M.ACC);
        }
        F.rect(h.x - 3 + Math.floor((PH - 1) / 3), by2 - PH, 2, 2, flat('#ffd95a'), 0, M.ACC);
        break;
      }
      case 'hat_top': {
        var TH = clampH(6, avail), blk = ramp('#2b2b3a'), t0 = top + 1;
        for (x = h.x - 5; x <= h.x + 5; x++) { F.set(x, t0, blk, 0, M.ACC); F.set(x, t0 + 1, blk, 1, M.ACC); }
        for (y = t0 - TH; y < t0; y++) for (x = h.x - 3; x <= h.x + 3; x++) F.set(x, y, blk, x === h.x - 3 ? 2 : (x === h.x + 3 ? 1 : 0), M.ACC);
        for (x = h.x - 3; x <= h.x + 3; x++) { F.set(x, t0 - 1, A, 0, M.ACC); F.set(x, t0 - 2, A, 1, M.ACC); }
        break;
      }
      case 'pirate_hat': {
        var blk2 = ramp('#26262f'), wh2 = flat('#ffffff'), t1 = top;
        for (x = h.x - 6; x <= h.x + 6; x++) F.set(x, t1 + 1, blk2, 1, M.ACC);
        for (x = h.x - 6; x <= h.x + 6; x++) F.set(x, t1, blk2, 0, M.ACC);
        for (x = h.x - 5; x <= h.x + 5; x++) F.set(x, t1 - 1, blk2, 2, M.ACC);
        for (x = h.x - 3; x <= h.x + 3; x++) F.set(x, t1 - 2, blk2, 2, M.ACC);
        F.set(h.x - 7, t1 - 1, blk2, 0, M.ACC); F.set(h.x + 7, t1 - 1, blk2, 0, M.ACC);
        F.set(h.x, t1 - 1, wh2, 0, M.ACC); F.set(h.x - 1, t1, wh2, 0, M.ACC); F.set(h.x + 1, t1, wh2, 0, M.ACC);
        break;
      }
      case 'chef_hat': {
        var w = ramp('#f2eee6'), t2 = top;
        [[-3, -1, 3, 2], [3, -1, 3, 2], [0, -2, 3, 3]].forEach(function (e) {
          for (var yy = t2 + e[1] - e[3]; yy <= t2 + e[1] + e[3]; yy++) for (var xx = h.x + e[0] - e[2]; xx <= h.x + e[0] + e[2]; xx++) if (inEll(xx, yy, h.x + e[0], t2 + e[1], e[2], e[3])) F.set(xx, yy, w, yy > t2 + e[1] ? 1 : 0, M.ACC);
        });
        for (x = h.x - 4; x <= h.x + 4; x++) { F.set(x, t2 + 1, w, 1, M.ACC); F.set(x, t2 + 2, w, 0, M.ACC); }
        break;
      }
      case 'armor_helm': {
        var steel = ramp('#aab4c8');
        for (y = top - 1; y <= h.y - 3; y++) for (x = h.x - h.rx - 1; x <= h.x + h.rx + 1; x++) {
          if (inEll(x, y, h.x, h.y, h.rx + 1, h.ry + 1)) F.set(x, y, steel, y <= top ? 2 : (y >= h.y - 3 ? 1 : 0), M.ACC);
        }
        for (y = h.y - 3; y <= h.y + 2; y++) F.set(fx, y, steel, 1, M.ACC);
        F.rect(h.x - 1, top - 4, 3, 3, flat('#ff3d5a'), 0, M.ACC);
        break;
      }
      case 'headphones': {
        var dk = ramp('#2b2b3a');
        for (y = top - 2; y <= h.y; y++) for (x = h.x - h.rx - 3; x <= h.x + h.rx + 3; x++) {
          if (inEll(x, y, h.x, h.y, h.rx + 1.5, h.ry + 1.5) && !inEll(x, y, h.x, h.y, h.rx + 0.2, h.ry + 0.2)) F.set(x, y, dk, 0, M.ACC);
        }
        F.rect(h.x - h.rx - 2, h.y - 1, 3, 5, A, 0, M.ACC); F.rect(h.x - h.rx - 2, h.y - 1, 1, 5, A, 2, M.ACC); F.rect(h.x - h.rx - 2, h.y + 3, 3, 1, A, 1, M.ACC);
        F.rect(h.x + h.rx, h.y - 1, 3, 5, A, 0, M.ACC); F.rect(h.x + h.rx, h.y - 1, 1, 5, A, 2, M.ACC); F.rect(h.x + h.rx, h.y + 3, 3, 1, A, 1, M.ACC);
        break;
      }
      case 'flower': {
        var cxf = h.x - 5, cyf = top + 3;
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (o) { F.set(cxf + o[0], cyf + o[1], A, 0, M.ACC); });
        F.set(cxf, cyf, flat('#ffd95a'), 0, M.ACC);
        break;
      }
      case 'bow': {
        var bx2 = h.x + 5, by3 = top + 2;
        F.rect(bx2 - 3, by3 - 1, 3, 3, A, 0, M.ACC); F.rect(bx2 + 1, by3 - 1, 3, 3, A, 0, M.ACC);
        F.set(bx2 - 3, by3 + 1, A, 1, M.ACC); F.set(bx2 + 3, by3 + 1, A, 1, M.ACC);
        F.set(bx2 - 3, by3 - 1, A, 2, M.ACC); F.set(bx2 + 3, by3 - 1, A, 2, M.ACC);
        F.rect(bx2, by3, 1, 2, A, 3, M.ACC);
        break;
      }
      case 'glasses': {
        [ex1, ex2].forEach(function (ex) {
          for (i = -1; i <= 1; i++) { F.set(ex + i, ey - 2, A, 0, M.ACC); F.set(ex + i, ey + 2, A, 1, M.ACC); F.set(ex - 2, ey + i, A, 0, M.ACC); F.set(ex + 2, ey + i, A, 1, M.ACC); }
        });
        F.set(fx, ey, A, 0, M.ACC);
        break;
      }
      case 'monocle': {
        var exm = ex2;
        for (i = -1; i <= 1; i++) { F.set(exm + i, ey - 2, A, 0, M.ACC); F.set(exm + i, ey + 2, A, 1, M.ACC); F.set(exm - 2, ey + i, A, 0, M.ACC); F.set(exm + 2, ey + i, A, 1, M.ACC); }
        for (y = ey + 3; y <= ey + 8; y++) F.set(exm + 2 + ((y - ey) > 5 ? 0 : 0), y, GOLD, 1, M.ACC);
        break;
      }
      case 'sunglasses': {
        var dk2 = ramp('#14101c');
        [ex1, ex2].forEach(function (ex) {
          F.rect(ex - 2, ey - 1, 5, 3, dk2, 0, M.ACC); F.set(ex - 2, ey - 1, flat('#5a5a7a'), 0, M.ACC); F.set(ex - 1, ey - 1, flat('#5a5a7a'), 0, M.ACC);
        });
        F.rect(fx - 1, ey - 1, 3, 1, dk2, 0, M.ACC);
        F.set(ex1 - 3, ey - 1, dk2, 0, M.ACC); F.set(ex2 + 3, ey - 1, dk2, 0, M.ACC);
        break;
      }
      case 'eyepatch': {
        var pk = ramp('#1a1a22');
        F.rect(ex1 - 2, ey - 2, 5, 4, pk, 0, M.ACC); F.set(ex1 - 2, ey - 2, pk, 2, M.ACC);
        lineP(F, ex1 - 2, ey - 2, h.x - h.rx + 1, top + 1, pk, 0, M.ACC);
        lineP(F, ex1 + 2, ey - 2, h.x + h.rx - 1, top + 1, pk, 0, M.ACC);
        break;
      }
      case 'box_head': {
        // box worn on the head with eye holes
        var bx0 = h.x - h.rx - 1, bw = h.rx * 2 + 3, bt = Math.max(1, top - 1), bh = h.y + 4 - bt;
        F.rect(bx0, bt, bw, bh, BOXR, 0, M.ACC);
        F.rect(bx0, bt, bw, 1, BOXR, 2, M.ACC);
        F.rect(bx0, bt + bh - 2, bw, 2, BOXR, 1, M.ACC);
        F.rect(bx0, bt + 1, 1, bh - 2, BOXR, 2, M.ACC);
        F.rect(bx0 + bw - 2, bt + 1, 2, bh - 2, BOXR, 1, M.ACC);
        F.rect(bx0 + (bw >> 1), bt, 2, 3, BOXR, 3, M.ACC);
        // flaps
        F.rect(bx0 - 1, bt - 1, 3, 1, BOXR, 2, M.ACC); F.rect(bx0 + bw - 2, bt - 1, 3, 1, BOXR, 2, M.ACC);
        F.rect(bx0 - 2, bt - 2, 2, 1, BOXR, 2, M.ACC); F.rect(bx0 + bw, bt - 2, 2, 1, BOXR, 2, M.ACC);
        var hole = flat('#1a1226');
        [ex1, ex2].forEach(function (ex, idx) {
          F.rect(ex - 2, ey - 2, 5, 4, hole, 0, M.ACC);
        });
        // eyes shine in the holes
        [ex1, ex2].forEach(function (ex, idx) {
          var c = flat(eyeColorFor(g, idx === 0 ? -1 : 1));
          F.rect(ex - 1, ey - 1, 2, 2, c, 0, M.ACC); F.set(ex - 1, ey - 1, EYEWHITE, 0, M.ACC);
        });
        // chin / nose peeking under the box
        break;
      }
      default: break;
    }
  }

  function drawZ(ctx, x, y, s, col, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    var rows = [[0, 0, 3], [2, 1, 1], [1, 2, 1], [0, 3, 3]];
    rows.forEach(function (r) { ctx.fillRect(Math.round(x + r[0] * s), Math.round(y + r[1] * s), r[2] * s, s); });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- compose a frame
  function buildFrame(g, poseName) {
    var P = POSES[poseName] || POSES.idle0;
    var F = new Frame();
    var fur = FUR[g.fur];
    var hiddenBox = P.hidden;
    var sitBox = P.boxed || g.accessory === 'cardboard_box';
    var geo = BODY_GEO[g.body];
    var G = { dx: P.dx || 0, b: { cx: geo.b[0], cy: geo.b[1], rx: geo.b[2], ry: geo.b[3] }, h: { x: geo.h[0], y: geo.h[1], rx: geo.h[2], ry: geo.h[3] } };
    var dy = 0;
    if (P.dead) dy = -3;
    G.b.cx += G.dx; G.h.x += G.dx;
    if (P.bob) { G.b.ry -= 1; G.h.y += 1; }
    if (P.sleep) {
      var ry2 = Math.max(3, Math.round(G.b.ry * 0.62));
      G.b.rx += 1; G.b.ry = ry2 + (P.bob ? 1 : 0); G.b.cy = GROUND - ry2 + (P.bob ? 0 : 0);
      if (P.bob) G.b.cy = GROUND - ry2;
      G.h.x = G.b.cx + G.b.rx - 3; G.h.y = GROUND - 1 - G.h.ry;
      if (g.body === 'kitten') G.h.y = GROUND - G.h.ry;
    }
    if (sitBox && !hiddenBox) {
      G.h.x = 14; G.h.y = 15 + (P.bob ? 1 : 0); G.h.ry = Math.min(G.h.ry, 6); G.h.rx = Math.min(G.h.rx, 7);
      G.b.cx = 14; G.b.cy = 24; G.b.rx = 7; G.b.ry = 5;
    }
    if (dy) { G.b.cy += dy; G.h.y += dy; }
    G.fx = G.h.x + 1;

    if (hiddenBox) {
      // closed box with two glinting eyes in a slit
      var hb = P.bob ? 1 : 0;
      F.layer++;
      boxFront(F, 4, 14 + hb, 24, 15 - hb);
      F.rect(4, 12 + hb, 24, 2, BOXR, 2, M.ACC);
      F.rect(4, 12 + hb, 24, 1, BOXR, 0, M.ACC);
      F.rect(15, 12 + hb, 2, 2, BOXR, 3, M.ACC);
      F.rect(9, 19 + hb, 14, 4, flat('#1a1226'), 0, M.ACC);
      var ec = flat(EYE_COL[g.eyeColor === 'odd' ? 'amber' : g.eyeColor]);
      F.rect(11, 20 + hb, 3, 2, ec, 0, M.ACC); F.rect(18, 20 + hb, 3, 2, ec, 0, M.ACC);
      F.set(11, 20 + hb, EYEWHITE, 0, M.ACC); F.set(18, 20 + hb, EYEWHITE, 0, M.ACC);
      return finish(F, G, g, P);
    }

    if (g.cape) drawAccBack(F, G, g, P);
    F.layer++; drawTail(F, G, g, fur, P);
    F.layer++;
    if (!(sitBox)) {
      drawLegs(F, G, g, fur, P);
    }
    drawBody(F, G, g, fur, P);
    if (!sitBox && P.sleep) {
      // paws tucked in front of the chin
      F.rect(G.h.x + 2, GROUND - 1, 4, 2, fur, 0, M.LIMB); F.rect(G.h.x + 2, GROUND, 4, 1, fur, 2, M.LIMB);
    }
    F.layer++;
    drawEars(F, G, g, fur, P);
    F.layer++;
    drawHead(F, G, g, fur, P);
    applyPattern(F, G, g, fur, P);
    F.layer++;
    drawFace(F, G, g, fur, P);
    drawAccFront(F, G, g, P);
    if (g.cape) { var CA = ramp(g.cape), hh = G.h, bb = G.b; F.layer++;
      for (var cy = bb.cy - bb.ry; cy <= bb.cy + 2; cy++) for (var cx = bb.cx - bb.rx - 1; cx <= hh.x - 4; cx++) { if (F.matAt(cx, cy) === M.BODY) F.set(cx, cy, CA, cy <= bb.cy - bb.ry + 1 ? 2 : (cy > bb.cy ? 1 : 0), M.ACC); }
      F.set(hh.x - 3, hh.y + hh.ry, GOLD, 0, M.ACC); F.set(hh.x - 3, hh.y + hh.ry - 1, GOLD, 2, M.ACC); }
    if (sitBox) {
      F.layer++;
      boxFront(F, 2, 20, 26, 10);
      // open flaps
      F.rect(1, 18, 3, 2, BOXR, 2, M.ACC); F.rect(0, 17, 2, 1, BOXR, 2, M.ACC); F.rect(27, 18, 3, 2, BOXR, 2, M.ACC); F.rect(30, 17, 2, 1, BOXR, 2, M.ACC);
      // paws on the rim
      F.layer++;
      F.rect(G.h.x - 5, 18, 3, 2, fur, 0, M.LIMB); F.rect(G.h.x - 5, 18, 3, 1, fur, 2, M.LIMB);
      F.rect(G.h.x + 3, 18, 3, 2, fur, 0, M.LIMB); F.rect(G.h.x + 3, 18, 3, 1, fur, 2, M.LIMB);
    }
    if (P.dead && g.accessory === 'none') {
      // halo
      var hl = flat('#ffe58a');
      for (var i = -3; i <= 3; i++) F.set(G.h.x + i, G.h.y - G.h.ry - 4, hl, 0, M.ACC);
      F.set(G.h.x - 4, G.h.y - G.h.ry - 3, hl, 0, M.ACC); F.set(G.h.x + 4, G.h.y - G.h.ry - 3, hl, 0, M.ACC);
      for (i = -3; i <= 3; i++) if (Math.abs(i) > 1) F.set(G.h.x + i, G.h.y - G.h.ry - 2, hl, 0, M.ACC);
    }
    return finish(F, G, g, P);
  }

  function finish(F, G, g, P) {
    // shadow
    var sw = P.sleep ? 11 : 9;
    if (!P.dead) for (var y = 27; y < 32; y++) for (var x = 0; x < W; x++) if (inEll(x, y, 15.5 + (G.dx > 0 ? 1 : 0), 30, sw, 1.6)) F.sh[y * W + x] = 1;
    // outline pass
    var ol = [], i, j;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      if (F.pi[i]) continue;
      var best = -1, bi = 0, nb = [[x, y + 1], [x + 1, y], [x - 1, y], [x, y - 1]];
      for (j = 0; j < 4; j++) {
        var nx = nb[j][0], ny = nb[j][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx;
        if (F.pi[ni] && F.ly[ni] > best) { best = F.ly[ni]; bi = ni; }
      }
      if (best >= 0) ol.push([i, bi]);
    }
    var ghost = !!P.dead;
    var out = new Uint8ClampedArray(N * 4);
    function putc(i, c, a) { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = a; }
    for (i = 0; i < N; i++) if (F.sh[i]) putc(i, [10, 7, 22], 115);
    for (i = 0; i < N; i++) {
      if (!F.pi[i]) continue;
      var c = F.pal[F.pi[i]].c[F.lv[i]];
      if (ghost) c = mixc(c, [200, 218, 255], 0.5);
      putc(i, c, ghost ? 190 : 255);
    }
    ol.forEach(function (o) {
      var c = F.pal[F.pi[o[1]]].ol;
      if (ghost) c = mixc(c, [120, 140, 200], 0.5);
      putc(o[0], c, ghost ? 190 : 255);
    });
    return { data: out, geo: G };
  }

  // ---------------------------------------------------------------- canvases and cache
  function newCanvas(w, h) {
    var c;
    if (typeof document !== 'undefined') c = document.createElement('canvas');
    else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
    c.width = w; c.height = h;
    return c;
  }
  var CACHE = new Map(), CACHE_MAX = 600, stats = { hits: 0, misses: 0 };
  function cacheGet(key, make) {
    var v = CACHE.get(key);
    if (v) { stats.hits++; CACHE.delete(key); CACHE.set(key, v); return v; }
    stats.misses++;
    v = make();
    CACHE.set(key, v);
    while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    return v;
  }
  function normPose(p) { p = POSE_ALIAS[p] || p; return POSES[p] ? p : 'idle0'; }
  function frameCanvas(g, pose) {
    pose = normPose(pose);
    return cacheGet(genomeKey(g) + '#' + pose, function () {
      var r = buildFrame(g, pose), c = newCanvas(W, H), cx = c.getContext('2d');
      var img = cx.createImageData(W, H);
      img.data.set(r.data);
      cx.putImageData(img, 0, 0);
      return c;
    });
  }
  function flashFrame(canvas) {
    var c = newCanvas(canvas.width, canvas.height), cx = c.getContext('2d');
    cx.drawImage(canvas, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function tintFrame(canvas, color) {
    var c = newCanvas(canvas.width, canvas.height), cx = c.getContext('2d');
    cx.drawImage(canvas, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.globalAlpha = 0.45;
    cx.fillStyle = color;
    cx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function variantCanvas(g, pose, flash, tint) {
    var base = frameCanvas(g, pose);
    if (flash) return cacheGet(genomeKey(g) + '#' + normPose(pose) + '#flash', function () { return flashFrame(base); });
    if (tint) return cacheGet(genomeKey(g) + '#' + normPose(pose) + '#t' + tint, function () { return tintFrame(base, tint); });
    return base;
  }

  // make(genome) -> {frames: {name: canvas}} (lazy getters, cached)
  function make(genome) {
    var g = normalize(genome), frames = {};
    POSE_NAMES.forEach(function (n) {
      Object.defineProperty(frames, n, { enumerable: true, get: function () { return frameCanvas(g, n); } });
    });
    return { genome: g, frames: frames, key: genomeKey(g) };
  }

  // ---------------------------------------------------------------- animation selection
  function idlePose(g, tick, bobPeriod) {
    var off = (g.seed * 37) % 97;
    var t = (tick | 0) + off;
    var bob = Math.floor(t / (bobPeriod || 36)) % 2;
    var cycle = 220 + (g.seed % 7) * 25;
    var blink = (t % cycle) < 8 ? 1 : 0;
    return (blink ? 'blink' : 'idle') + bob;
  }
  // pose: 'idle'|'attack'|'hurt'|'sleep'|'dead'|'boxed'|'hidden' or {name, flip, flash, alpha, tint, anchor}
  function resolvePose(g, pose, tick) {
    var o = typeof pose === 'string' ? { name: pose } : (pose || { name: 'idle' });
    var name = o.name || 'idle', frame;
    var bobP = 36;
    if (name === 'idle') frame = idlePose(g, tick);
    else if (name === 'sleep') frame = 'sleep' + (Math.floor(((tick | 0) + g.seed) / 48) % 2);
    else if (name === 'boxed') frame = 'boxed' + (Math.floor(((tick | 0) + g.seed) / 40) % 2);
    else if (name === 'hidden') frame = 'hidden' + (Math.floor(((tick | 0) + g.seed) / 50) % 2);
    else if (name === 'dead') frame = 'dead';
    else frame = normPose(name);
    return { frame: frame, name: name, flip: !!o.flip, flash: !!o.flash, alpha: o.alpha === undefined ? 1 : o.alpha, tint: o.tint || null };
  }

  // drawCat(ctx, genome, pose, x, y, scale, tick). x,y = top-left of the 32*scale box; champions (genome.scale>1) grow about the feet.
  function drawCat(ctx, genome, pose, x, y, scale, tick) {
    var g = normalize(genome), s0 = scale || 1, R = resolvePose(g, pose, tick || 0);
    var s = s0 * g.scale;
    var c = variantCanvas(g, R.frame, R.flash, R.tint);
    var w = W * s, h = H * s;
    var dx = x + 16 * s0 - 16 * s, dy = y + 30 * s0 - 30 * s;
    var prevSmooth = ctx.imageSmoothingEnabled, prevAlpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = prevAlpha * R.alpha;
    // small hop for attack lunge handled by caller; sleeping Zzz below
    if (R.flip) {
      ctx.save(); ctx.translate(x + 16 * s0, 0); ctx.scale(-1, 1);
      ctx.drawImage(c, dx - (x + 16 * s0), dy, w, h);
      ctx.restore();
    } else ctx.drawImage(c, dx, dy, w, h);
    ctx.globalAlpha = prevAlpha;
    if (R.name === 'sleep') drawZzz(ctx, x, y, s, R.flip, tick || 0, g);
    ctx.imageSmoothingEnabled = prevSmooth;
    return c;
  }
  function drawZzz(ctx, x, y, s, flip, tick, g) {
    var geo = BODY_GEO[g.body], hx = geo.b[0] + geo.b[2] - 1;
    for (var k = 0; k < 3; k++) {
      var t = (((tick | 0) + k * 40) % 120) / 120;
      var zx = hx + 3 + t * 5 + Math.sin(t * 6.28) * 1.2, zy = 18 - t * 12 - k * 0.5;
      var size = Math.max(1, Math.round(s * (0.6 + t * 0.6)));
      var px = flip ? (x + 32 * s - (zx * s)) - 3 * size : x + zx * s;
      drawZ(ctx, px + size, y + zy * s + size, size, '#1a1226', Math.min(1, (1 - t) * 1.4));
      drawZ(ctx, px, y + zy * s, size, '#dfe6ff', Math.min(1, (1 - t) * 1.4));
    }
  }

  // death fade: t in 0..1. Ghost floats up and dissolves with a Bayer pattern.
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var deathTmp = null;
  function deathFade(ctx, genome, x, y, scale, t, opts) {
    var g = normalize(genome), s = (scale || 1) * g.scale, s0 = scale || 1;
    t = Math.max(0, Math.min(1, t));
    var c = frameCanvas(g, 'dead');
    if (!deathTmp) deathTmp = newCanvas(W, H);
    var tx = deathTmp.getContext('2d', { willReadFrequently: true });
    tx.clearRect(0, 0, W, H);
    tx.drawImage(c, 0, 0);
    if (t > 0.3) {
      var img = tx.getImageData(0, 0, W, H), th = (t - 0.3) / 0.7;
      for (var i = 0; i < N; i++) if (BAYER[(i >> 5 & 3) * 4 + (i & 3)] / 16 < th) img.data[i * 4 + 3] = 0;
      tx.putImageData(img, 0, 0);
    }
    var prev = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = prev * (1 - t * 0.5);
    var lift = Math.round(t * 10 * s0);
    var dx = x + 16 * s0 - 16 * s, dy = y + 30 * s0 - 30 * s - lift;
    if (opts && opts.flip) { ctx.save(); ctx.translate(x + 16 * s0, 0); ctx.scale(-1, 1); ctx.drawImage(deathTmp, dx - (x + 16 * s0), dy, W * s, H * s); ctx.restore(); }
    else ctx.drawImage(deathTmp, dx, dy, W * s, H * s);
    ctx.globalAlpha = prev; ctx.imageSmoothingEnabled = ps;
  }

  // ---------------------------------------------------------------- export
  var API = {
    version: 1,
    SIZE: 32, FOOT_Y: 29, CENTER_X: 16,
    BODIES: BODIES, FURS: FURS, PATTERNS: PATTERNS, EARS: EARS, EYES: EYES, EYE_COLORS: EYECOLS, TAILS: TAILS, ACCESSORIES: ACCS,
    POSES: POSE_NAMES,
    normalize: normalize, genomeKey: genomeKey,
    randomGenome: randomGenome, fromSeed: function (seed, opts) { return randomGenome(seed, opts); },
    fromDescriptor: fromDescriptor, fromId: fromId, register: register, registry: REGISTRY,
    make: make, frame: function (genome, pose) { return frameCanvas(normalize(genome), pose); },
    draw: function (ctx, genome, pose, x, y, o) {
      o = o || {};
      var p = typeof pose === 'string' ? { name: pose } : pose;
      p = Object.assign({}, p, { flip: o.flip, flash: o.flash, alpha: o.alpha, tint: o.tint });
      return drawCat(ctx, genome, p, x, y, o.scale || 1, o.tick || 0);
    },
    drawCat: drawCat, deathFade: deathFade,
    flashFrame: flashFrame,
    idlePose: function (genome, tick) { return idlePose(normalize(genome), tick); },
    clearCache: function () { CACHE.clear(); stats.hits = 0; stats.misses = 0; },
    cacheStats: function () { return { size: CACHE.size, max: CACHE_MAX, hits: stats.hits, misses: stats.misses }; },
    setCacheMax: function (n) { CACHE_MAX = Math.max(16, n | 0); },
    _hash: hashStr, _rng: mulberry32
  };
  SB.gfx.pawprint = API;
  if (!window.Pawprint) window.Pawprint = API;
})();
