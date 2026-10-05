// Bakes Hocus Vocus chibi art (heroes, creatures, icons, logo) into WebP sprite sheets for Kingshot Endless.
// Run from the repo root:  node tools/kingshot/bake_art.mjs
// Needs Playwright + Chromium. Output: kingshot_endless/art/*.webp + atlas.json
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const OUT = resolve(ROOT, 'kingshot_endless/art');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(pathToFileURL(resolve(ROOT, 'hocus_vocus/gallery.html')).href);
await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const atlas = { sheets: {}, spr: {} };
  const sheets = {};
  // shelf-packs cells into one canvas per sheet
  function makeSheet(name, W) { const s = { name, W, x: 0, y: 0, rowH: 0, items: [] }; sheets[name] = s; return s; }
  function place(sheet, w, h) {
    if (sheet.x + w > sheet.W) { sheet.x = 0; sheet.y += sheet.rowH; sheet.rowH = 0; }
    const p = { x: sheet.x, y: sheet.y }; sheet.x += w; sheet.rowH = Math.max(sheet.rowH, h); return p;
  }
  function add(sheet, name, cw, ch, ax, ay, frames, anims, painter) {
    const first = place(sheet, cw * frames, ch);
    sheet.items.push({ first, cw, ch, frames, painter });
    atlas.spr[name] = { sheet: sheet.name, x: first.x, y: first.y, w: cw, h: ch, ax, ay, n: frames, anims };
  }
  const heroes = makeSheet('heroes', 3800), foes = makeSheet('foes', 2400), icons = makeSheet('icons', 1024);

  // ---- heroes: idle x6, walk x8, attack x4, hurt x2 ----
  const HS = 0.72, HW = 190, HH = 250, HAX = 95, HAY = 214;
  const HEROES = { jasmin: ['hanae', 'stage'], jasmin_unicorn: ['hanae', 'skin'], roxor: ['kuro', 'stage'], roxor_monster: ['kuro', 'skin'], rawclaw: ['suzu', 'stage'], rawclaw_goat: ['suzu', 'skin'], andy: ['raiga', 'stage'] };
  const HFR = [];
  for (let i = 0; i < 6; i++) HFR.push({ pose: 'idle', t: i * 1.7 / 6, pt: 0 });
  for (let i = 0; i < 8; i++) HFR.push({ pose: 'walk', t: i / 8, pt: 0 });
  for (let i = 0; i < 4; i++) HFR.push({ pose: 'attack', t: 0, pt: 0.04 + i * 0.1 });
  for (let i = 0; i < 2; i++) HFR.push({ pose: 'hurt', t: 0, pt: 0.05 + i * 0.07 });
  const HANIM = { idle: [0, 6], walk: [6, 8], attack: [14, 4], hurt: [18, 2] };
  for (const [name, [hid, skin]] of Object.entries(HEROES)) {
    add(heroes, name, HW, HH, HAX, HAY, HFR.length, HANIM, (g, i) => {
      const f = HFR[i];
      ART.hero.draw(g, hid, { x: HAX, y: HAY, s: HS, pose: f.pose, t: f.t, pt: f.pt, skin, shadow: false });
    });
  }
  // ---- Jordan (shopkeeper) and cast idle poses ----
  add(heroes, 'jordan', HW, HH, HAX, HAY, 4, { idle: [0, 4] }, (g, i) => {
    ART.cast.draw(g, 'jordan', { x: HAX, y: HAY, s: HS, mood: ['hello', 'buy', 'sold', 'hello'][i], t: i * 0.4, shadow: false });
  });

  // ---- creatures: idle x4, attack x2, hurt x1 ----
  const FOES = ['kappa', 'oni_cub', 'bamboo_boar', 'crow_tengu', 'mushroom_folk', 'hitodama', 'oni_brute', 'karakasa',
    'chochin', 'karakuri_puppet', 'drowned_samurai', 'nopperabo', 'koi_spirit', 'tsukumogami', 'ittan_momen', 'silk_weaver',
    'storm_drone', 'blank_soldier', 'komainu_guardian', 'void_scribe', 'redaction_knight', 'margin_imp', 'thunder_crow', 'eraser_wraith',
    'boss_kuzunoha', 'boss_jorogumo', 'boss_editor', 'ember_wisp', 'leaf_imp', 'spark_mote'];
  const FFR = [{ pose: 'idle', t: 0, pt: 0 }, { pose: 'idle', t: 0.3, pt: 0 }, { pose: 'idle', t: 0.6, pt: 0 }, { pose: 'idle', t: 0.9, pt: 0 },
    { pose: 'attack', t: 0, pt: 0.12 }, { pose: 'attack', t: 0, pt: 0.3 }, { pose: 'hurt', t: 0, pt: 0.1 }];
  const FANIM = { idle: [0, 4], attack: [4, 2], hurt: [6, 1] };
  for (const id of FOES) {
    const b = ART.enemy.bounds(id), boss = id.startsWith('boss_');
    const CW = boss ? 220 : 150, CH = boss ? 200 : 150, maxW = CW - 16, maxH = CH - 22;
    const s = Math.min(maxW / b.w, maxH / b.h, 1.2);
    const ax = CW / 2, ay = CH - 12;
    add(foes, id, CW, CH, ax, ay, FFR.length, FANIM, (g, i) => {
      const f = FFR[i];
      ART.enemy.draw(g, id, { x: ax, y: ay, s, pose: f.pose, t: f.t, pt: f.pt, phase: 0 });
    });
  }

  // ---- icons (sticker style) ----
  const IC = 64;
  const ICONS = [['relic', ['coin', 'crown', 'star', 'heart', 'key', 'bell', 'drum', 'flute', 'dice', 'mirror', 'teacup', 'lantern', 'compass', 'scroll', 'hourglass', 'candle', 'ribbon', 'sword', 'bow', 'flame', 'bolt', 'lotus', 'moon', 'sun', 'mask', 'skull', 'shell', 'plum', 'petal', 'snowflake', 'riceball', 'brush', 'charm', 'comb', 'jar', 'seal', 'eye', 'tooth', 'feather', 'umbrella', 'koi', 'dragon', 'tiger', 'fox', 'crane', 'maple', 'shrine', 'bridge', 'gourd', 'bamboo', 'inkstone']],
    ['stat', ['gold', 'hp', 'energy', 'ink', 'block']], ['tile', ['chest', 'shop', 'camp', 'well', 'forge', 'event', 'boss', 'elite', 'enemy']], ['motif', ['fist', 'kick', 'arrow', 'coin', 'key', 'book', 'quill', 'sigil', 'torii', 'meteor', 'tornado']]];
  const list = [];
  for (const [kind, ids] of ICONS) for (const id of ids) list.push([kind, id]);
  for (const [kind, id] of list) {
    add(icons, kind + ':' + id, IC, IC, IC / 2, IC / 2, 1, null, (g) => { ART.icon.draw(g, kind, id, IC / 2, IC / 2, IC - 4, {}); });
  }

  // ---- logo + title ----
  const misc = makeSheet('misc', 1024);
  add(misc, 'logo', 640, 260, 320, 130, 1, null, (g) => { ART.scene.logo(g, 320, 130, 600, 0.5); });

  // ---- paint all sheets ----
  const out = {};
  for (const s of Object.values(sheets)) {
    const H = s.y + s.rowH;
    const c = document.createElement('canvas'); c.width = s.W; c.height = H;
    const g = c.getContext('2d');
    for (const it of s.items) {
      for (let i = 0; i < it.frames; i++) {
        g.save(); g.translate(it.first.x + i * it.cw, it.first.y);
        g.beginPath(); g.rect(0, 0, it.cw, it.ch); g.clip();
        try { it.painter(g, i); } catch (e) { console.error('bake fail', e.message); }
        g.restore();
      }
    }
    atlas.sheets[s.name] = { w: s.W, h: H };
    out[s.name] = c.toDataURL('image/webp', 0.86);
  }
  return { atlas, out };
});

for (const [name, url] of Object.entries(result.out)) {
  writeFileSync(resolve(OUT, name + '.webp'), Buffer.from(url.split(',')[1], 'base64'));
  console.log(name, result.atlas.sheets[name], Math.round(url.length * 0.75 / 1024) + ' KB');
}
writeFileSync(resolve(OUT, 'atlas.json'), JSON.stringify(result.atlas));
await browser.close();
