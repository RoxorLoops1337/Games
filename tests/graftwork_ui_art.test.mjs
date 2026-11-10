// GRAFTWORK painted UI parts (graftwork/assets/ui, tools/graftwork_ui_build.py, ui/preview.js, ui/templates.js, ui/skin.js, art/cards.js, ui/chrome.js,
// ui/settings.js, lab/art.html): the manifest and its files agree, slices and slots lie inside their images, every card of the game has a frame,
// nothing under assets/ui is asked for while the preview is off, a card composes through its frame when it is on, the Settings toggle switches
// the look live and the minimal graphics tier keeps it off, sliced parts bake without stretching a corner, the lab page is wired to real exports,
// and the build tool gives the same bytes twice (skipped when Python or Pillow is missing).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fakeCtx, installDom, makeApp, frames } from './graftwork_lib.mjs';

installDom();
const ROOT = fileURLToPath(new URL('../graftwork/', import.meta.url)), UI = path.join(ROOT, 'assets/ui');
const T = await import('../graftwork/ui/templates.js');
const P = await import('../graftwork/ui/preview.js');
const SK = await import('../graftwork/ui/skin.js');
const CH = await import('../graftwork/ui/chrome.js');
const C = await import('../graftwork/art/cards.js');
const I = await import('../graftwork/art/icons.js');
const { CARD_LIST } = await import('../graftwork/data/index.js');
const { cardSpec } = await import('../graftwork/engine/cards.js');
const { templates } = T;
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const tick = () => new Promise((r) => setTimeout(r, 5));
const RAW = JSON.parse(fs.readFileSync(path.join(UI, 'manifest.json'), 'utf8'));
const MAN = T.parseManifest(RAW);

// pixel size of a WebP file (VP8, VP8L or VP8X header)
function webpSize(file) {
  const b = fs.readFileSync(file); assert.equal(b.toString('ascii', 0, 4), 'RIFF', file); assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}
const listFiles = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
const filesOf = (d) => [d.file, d.file1x, d.file2x].filter(Boolean);

// ---------------------------------------------------------------- the manifest and its files
await t('manifest_parses_whole_and_names_exactly_the_files_on_disk', () => {
  assert.ok(MAN, 'manifest.json is a manifest');
  for (const g of ['atlases', 'frames', 'icons']) assert.deepEqual(Object.keys(MAN[g]).sort(), Object.keys(RAW[g]).sort(), `no ${g} entry is dropped by the parser`);
  assert.deepEqual(Object.keys(MAN.templates).sort(), ['card_back', 'card_front']);
  const named = new Set();
  for (const g of ['atlases', 'frames', 'icons']) for (const d of Object.values(MAN[g])) for (const f of filesOf(d)) named.add(f);
  for (const f of named) assert.ok(fs.existsSync(path.join(UI, f)), 'file exists: ' + f);
  const disk = listFiles(UI).filter((f) => f !== 'manifest.json').sort();
  assert.deepEqual(disk, [...named].sort(), 'assets/ui holds the manifest and the files it names, nothing else');
  const bytes = listFiles(UI).reduce((a, f) => a + fs.statSync(path.join(UI, f)).size, 0);
  assert.ok(bytes < 2.0 * 1048576, `assets/ui stays under 2.0 MB (it is ${(bytes / 1048576).toFixed(2)} MB)`);
  assert.ok(!/—/.test(JSON.stringify(RAW)), 'no em dash in the manifest');
});
await t('every_part_is_there_and_file_sizes_are_1x_and_2x_of_the_logical_size', () => {
  const want = ['card_front.junk', 'card_front', 'card_back.plain', 'card_gem', 'card_gem.up', 'card_gem.down', 'panel', 'panel.parchment', 'modal', 'button.normal', 'button.hover', 'button.down', 'button.disabled', 'button.small',
    'chip.intent', 'chip.status', 'dial.energy', 'plate.block', 'bar.hp.frame', 'bar.hp.fill', 'gauge.budget.l', 'gauge.budget.cell', 'gauge.budget.r', 'bg.title_keyart'];
  for (const ty of ['attack', 'skill', 'power']) { want.push('card_front.' + ty); for (const r of ['common', 'uncommon', 'rare']) want.push(`card_front.${ty}.${r}`); }
  for (const id of want) assert.ok(MAN.frames[id], 'frame ' + id);
  for (const id of ['draw', 'discard', 'exhaust', 'energy', 'cost', 'retain', 'innate', 'ethereal', 'jam', 'upgrade', 'graft', 'tithe', 'strain', 'budget', 'overload', 'temper']) assert.ok(MAN.icons['rules.' + id], 'icon rules.' + id);
  for (const id of ['attack', 'multi', 'block', 'buff', 'debuff', 'heal', 'summon', 'unknown', 'stun', 'escape', 'poison', 'thread']) assert.ok(MAN.icons['intent.' + id], 'icon intent.' + id);
  const check = (id, d) => {
    assert.ok(d.file1x && d.file2x, id + ' has a 1x and a 2x file');
    const a = webpSize(path.join(UI, d.file1x)), b = webpSize(path.join(UI, d.file2x));
    assert.deepEqual([a.w, a.h], [d.w, d.h], id + ' @1x is the logical size'); assert.deepEqual([b.w, b.h], [d.w * 2, d.h * 2], id + ' @2x is twice that');
  };
  for (const [id, d] of Object.entries(MAN.atlases)) check('atlas ' + id, d);
  for (const [id, d] of Object.entries(MAN.frames)) if (!d.atlas) check(id, d);
  for (const [id, d] of Object.entries(MAN.frames)) if (/^card_/.test(id) && !d.atlas) assert.deepEqual([d.w, d.h], [T.CARD_TEMPLATE.w, T.CARD_TEMPLATE.h], id + ' has the card size');
});
await t('slices_content_and_atlas_rects_lie_inside_their_images', () => {
  for (const g of ['frames', 'icons']) for (const [id, d] of Object.entries(MAN[g])) {
    if (d.atlas) { const A = MAN.atlases[d.atlas], r = d.rect; assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= A.w && r.y + r.h <= A.h, id + ' rect inside atlas ' + d.atlas); }
    const w = d.atlas ? d.rect.w : d.w, h = d.atlas ? d.rect.h : d.h;
    if (d.slice) { const [l, tp, r, b] = d.slice; assert.ok(l + r < w, `${id} slice leaves a middle column (${l}+${r} of ${w})`); assert.ok(tp + b <= h, `${id} slice fits its height (${tp}+${b} of ${h})`); if (d.scale !== 'height') assert.ok(tp + b < h, id + ' slice leaves a middle row'); }
    if (d.content) assert.ok(d.content.x >= 0 && d.content.y >= 0 && d.content.x + d.content.w <= w && d.content.y + d.content.h <= h, id + ' content inside the part');
  }
  // atlas parts never overlap (a 9-slice must not sample its neighbour)
  for (const an of Object.keys(MAN.atlases)) {
    const rs = [...Object.entries(MAN.frames), ...Object.entries(MAN.icons)].filter(([, d]) => d.atlas === an).map(([id, d]) => ({ id, ...d.rect }));
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} and ${b.id} overlap in atlas ${an}`); }
  }
  for (const id of ['panel', 'modal', 'button.small']) assert.equal(MAN.frames[id].tile, true, id + ' repeats its edges');
  assert.equal(MAN.frames.panel.fill, false, 'the panel is a border: the code paints the slab under it');
  for (const st of ['normal', 'hover', 'down', 'disabled']) { assert.equal(MAN.frames['button.' + st].scale, 'height', 'button.' + st + ' is a pill'); assert.deepEqual(MAN.frames['button.' + st].slice, MAN.frames['button.normal'].slice, 'the four states share one geometry'); assert.deepEqual([MAN.frames['button.' + st].rect.w, MAN.frames['button.' + st].rect.h], [MAN.frames['button.normal'].rect.w, MAN.frames['button.normal'].rect.h]); }
});
await t('card_slots_lie_on_the_card_and_keep_text_inside_its_window', () => {
  const W = T.CARD_TEMPLATE.w, H = T.CARD_TEMPLATE.h;
  const fronts = Object.keys(MAN.frames).filter((id) => id.startsWith('card_front'));
  assert.equal(fronts.length, 14, 'ten paintings plus the four ids that share one (attack, skill, power, the generic junk)');
  for (const id of fronts) {
    const def = MAN.frames[id];
    assert.deepEqual(def.under, ['window', 'textHole', 'keyNumber'], id + ': the windows are painted under the frame');
    assert.deepEqual(def.baked, ['namePlate', 'typeBand', 'pips'], id + ': banner and ribbon are in the painting');
    const tpl = T.mergeTemplate(T.CARD_TEMPLATE, MAN.templates.card_front, def);
    for (const variant of [{}, { compact: true }, { compact: true, grafts: true }]) {
      const s = T.resolveSlots(tpl, variant), tag = `${id} ${JSON.stringify(variant)}`;
      for (const k of ['window', 'textHole', 'namePlate', 'typeBand', 'textBox', 'costGem']) assert.ok(s[k], tag + ' has slot ' + k);
      for (const [k, r] of Object.entries(s)) {
        const hang = k === 'graftSlots' || k === 'fusedSlots' ? 24 : 0.5; // patches and rivets hang over the card's edge on purpose
        assert.ok(r.x >= -W / 2 - hang && r.x + r.w <= W / 2 + hang && r.y >= -H / 2 - 0.5 && r.y + r.h <= H / 2 + 0.5, `${tag}: ${k} on the card (${r.x},${r.y} ${r.w}x${r.h})`);
        for (const it of r.items || []) assert.ok(it.y >= -H / 2 && it.y + it.h <= H / 2, `${tag}: every ${k} item on the card`);
      }
      const inside = (a, b, pad = 0.01) => a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.w <= b.x + b.w + pad && a.y + a.h <= b.y + b.h + pad;
      assert.ok(inside(s.textBox, s.textHole), tag + ': the text area is inside the text window');
      assert.ok(s.textBox.w >= 150 && s.textBox.h >= 80, tag + `: the text area is big enough to read (${s.textBox.w}x${s.textBox.h})`);
      assert.ok(s.window.w >= 150 && s.window.h >= 100, tag + ': the picture window');
      assert.ok(s.window.y + s.window.h <= s.namePlate.y + 6 && s.namePlate.y + s.namePlate.h <= s.textHole.y + 4, tag + ': picture, then banner, then text');
      assert.ok(s.typeBand.y + s.typeBand.h <= s.window.y + 6 && s.typeBand.x > s.costGem.x + s.costGem.w - 6, tag + ': the type ribbon is right of the gem and above the picture');
      if (variant.compact) { assert.ok(s.keyNumber && s.keyNumber.own && inside(s.keyNumber, s.window), tag + ': the big number stands on the picture'); assert.ok(!s.typeGlyph && !s.schoolGlyph, tag + ': the corner glyphs are off'); assert.ok(inside(s.graftBand, s.textHole), tag + ': graft chips in the text window'); }
      else { assert.ok(!s.keyNumber && !s.graftBand, tag + ': a full face has no key number'); assert.equal(s.graftSlots.items.length, 3); assert.ok(s.graftSlots.items.every((it) => it.y >= s.textHole.y - 2 && it.y + it.h <= s.textHole.y + s.textHole.h + 2), tag + ': graft patches beside the text'); }
    }
  }
  const own = MAN.frames['card_front.attack.rare'].slots;
  assert.ok(own && own.textBox && own.textBox.y > MAN.templates.card_front.slots.textBox.y + 3, 'attack.rare: its ornament hangs into the text window, so its text starts lower');
  const bt = T.resolveSlots(T.mergeTemplate(T.CARD_BACK_TEMPLATE, MAN.templates.card_back, MAN.frames['card_back.plain']), {}).title;
  assert.ok(bt && bt.y > 100 && bt.y + bt.h < 155 && Math.abs(bt.x + bt.w / 2) < 2, 'the back title sits on the plate at the bottom centre');
});
await t('every_card_of_the_game_maps_to_a_painted_frame', () => {
  const seen = new Set();
  for (const c of CARD_LIST) for (const up of [0, 1]) {
    const spec = cardSpec({ uid: 1, id: c.id, grafts: [], up });
    const id = T.cardFrameIds(spec, spec.rarity).find((q) => MAN.frames[q]);
    assert.ok(id, `${c.id} (${spec.type} / ${spec.rarity}) has a frame`); seen.add(id);
    if (spec.type !== 'junk') assert.ok(id.startsWith('card_front.' + spec.type), `${c.id} wears a ${spec.type} frame, not ${id}`);
    else assert.equal(id, 'card_front.junk');
  }
  for (const id of ['card_front.attack.uncommon', 'card_front.skill.rare', 'card_front.power.rare', 'card_front.attack', 'card_front.junk']) assert.ok(seen.has(id), id + ' is worn by a card of the data');
  // a kind the data does not have yet (a status, a curse) takes the generic frame, which is the junk painting
  assert.equal(T.cardFrameIds({ type: 'curse' }, 'common').find((q) => MAN.frames[q]), 'card_front');
  assert.deepEqual(filesOf(MAN.frames.card_front), filesOf(MAN.frames['card_front.junk']));
  assert.deepEqual(filesOf(MAN.frames['card_front.skill']), filesOf(MAN.frames['card_front.skill.common']), 'a starter card wears the common frame');
  assert.equal(T.cardBackIds('plain', 'marrow', 2).find((q) => MAN.frames[q]), 'card_back.plain');
  assert.equal(T.cardBackIds('gilt').find((q) => MAN.frames[q]), undefined, 'a back without a painting stays procedural');
});

// ---------------------------------------------------------------- the switch
await t('preview_switch_url_then_setting_then_default', () => {
  assert.deepEqual(P.PREVIEW_DEFAULT, { art: false, rig: false }, 'both previews are off by default');
  assert.equal(P.previewOn('art', null, ''), false); assert.equal(P.previewOn('art', { previewArt: true }, ''), true); assert.equal(P.previewOn('rig', { previewArt: true }, ''), true);
  assert.equal(P.previewOn('art', null, '?art=1'), true); assert.equal(P.previewOn('art', { previewArt: true }, '?art=0'), false); assert.equal(P.previewOn('rig', null, '?art=1'), false);
  assert.equal(P.previewOn('art', null, '?preview=1'), true); assert.equal(P.previewOn('rig', null, '?preview=1'), true); assert.equal(P.previewOn('art', { previewArt: true }, '?preview=off'), false);
  assert.equal(P.previewOn('art', {}, undefined), false, 'no page (node): off');
});
// fake network: the real manifest, images that report the pixel size of the real file
const requests = [];
const fetchJson = (u) => { requests.push(u); return Promise.resolve(RAW); };
const makeImage = () => { const im = { width: 0, height: 0 }; Object.defineProperty(im, 'src', { set(v) { requests.push(v); const s = webpSize(path.join(ROOT, v)); im.width = im.naturalWidth = s.w; im.height = im.naturalHeight = s.h; setTimeout(() => im.onload && im.onload(), 0); } }); return im; };
const uiRequests = () => requests.filter((u) => String(u).includes('assets/ui'));

await t('preview_off_asks_for_nothing_under_assets_ui_and_draws_no_painted_part', async () => {
  templates.configure({ art: null, live: true, fetchJson, makeImage });
  const g = globalThis, keep = { fetch: g.fetch, Image: g.Image };
  g.fetch = (u) => { requests.push(String(u)); return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) }); };
  g.Image = class { set src(v) { requests.push(String(v)); } };
  try {
    const RUN = await import('../graftwork/engine/run.js');
    const run = RUN.newRun({ hero: 'marrow', seed: 'ui-art-off' });
    const meta = { settings: {} }, flow = new Proxy({ RUN }, { get: (o, k) => (k in o ? o[k] : () => false) }); // every flow call a screen makes answers false
    const app = await makeApp({ run, meta, flow, audio: { sfx() {}, music() {}, setVolumes() {}, mute() {} } });
    for (const name of ['title', 'ward', 'settings', 'pause', 'deckview', 'codex']) app.register(name, (await import(`../graftwork/ui/${name}.js`)).default);
    app.register('combat', (await import('../graftwork/ui/combat.js')).default);
    app.go('title'); frames(app, 6); await tick();
    app.go('ward', { run }); frames(app, 6); await tick();
    run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime', 'gauze_mummy'] };
    app.go('combat', { run }); frames(app, 40); await tick();
    app.push('pause', {}); frames(app, 6); app.pop(); app.push('settings', {}); frames(app, 6); app.pop(); app.push('deckview', {}); frames(app, 6); app.pop(); await tick();
    assert.equal(templates.on, false); assert.equal(templates.ready(), false);
    assert.deepEqual(uiRequests(), [], 'nothing under assets/ui was requested');
    for (const id of ['panel', 'button.normal', 'bar.hp.frame']) assert.equal(SK.has(id), false);
    assert.equal(SK.nine(fakeCtx(), 'panel', 0, 0, 200, 100), false); assert.equal(SK.icon(fakeCtx(), 'rules.draw', 0, 0, 30), false); assert.equal(SK.hpBar(fakeCtx(), 0, 0, 100, 16, 0.5, 0.5), false); assert.equal(SK.gauge(fakeCtx(), 0, 0, 30, 6), null);
  } finally { g.fetch = keep.fetch; g.Image = keep.Image; templates.configure({ art: null, live: false, fetchJson: null, makeImage: null }); }
});

// a canvas factory that records what is drawn into every offscreen canvas (the card face cache, the skin cache)
function recordingDom() {
  const log = [], prev = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const g = fakeCtx(), cv = { width: 0, height: 0, getContext: () => g, style: {} };
    g.drawImage = (im, ...a) => { log.push({ kind: 'image', im, a, cv }); };
    for (const m of ['fillText', 'strokeText']) g[m] = (s) => { log.push({ kind: 'text', s: String(s), cv }); };
    return cv;
  };
  return { log, restore() { globalThis.document.createElement = prev; } };
}
const isPart = (im) => !!im && typeof im.naturalWidth === 'number' && !im.getContext; // one of the fake asset images
const DESK = { px: 2, scale: 1, frame: 0, shared: {} }; // a desktop screen: the 2x files
async function load(ids = []) { templates.ensure(DESK); await tick(); for (let i = 0; i < 4; i++) { templates.preload(DESK); for (const id of ids) templates.frameImg(id, DESK); await tick(); } }

await t('preview_on_a_card_composes_through_its_frame_and_falls_back_while_the_image_is_on_its_way', async () => {
  templates.configure({ art: true, live: true, fetchJson, makeImage });
  const atk = CARD_LIST.find((c) => c.type === 'attack' && c.rarity === 'rare'), spec = cardSpec({ uid: 1, id: atk.id, grafts: [], up: 0 });
  const D = recordingDom();
  try {
    C.clearCardCache(); C.cardFrame(); templates.ensure(DESK);
    // first frame: the manifest is not there yet, the procedural face is drawn (no part image anywhere), and the frame is asked for
    C.drawCard(fakeCtx(), spec, 0, 0, { t: 1 });
    assert.equal(D.log.filter((e) => e.kind === 'image' && isPart(e.im)).length, 0, 'still loading: the procedural face');
    await load();
    D.log.length = 0; C.cardFrame();
    C.drawCard(fakeCtx(), spec, 0, 0, { t: 1 });
    const face = D.log.filter((e) => e.kind === 'image' && isPart(e.im) && e.im.naturalWidth === 440);
    assert.equal(face.length, 1, 'the full face draws the frame once');
    assert.deepEqual(face[0].a.slice(4), [-110, -155, 220, 310], 'over the whole card');
    const cv = face[0].cv, inFace = D.log.filter((e) => e.cv === cv), at = inFace.indexOf(face[0]);
    const texts = inFace.filter((e) => e.kind === 'text').map((e) => e.s), after = inFace.slice(at).filter((e) => e.kind === 'text').map((e) => e.s);
    assert.ok(after.includes(spec.name) && after.includes('ATTACK'), 'name and type are written over the frame (banner and ribbon)');
    assert.ok(texts.some((s) => /damage/i.test(s)), 'the rules text is on the face');
    // the hand face: the same frame, the big number under it on the picture, the name still over it
    D.log.length = 0; C.cardFrame();
    C.drawCard(fakeCtx(), spec, 0, 0, { t: 1, compact: true });
    const hf = D.log.find((e) => e.kind === 'image' && isPart(e.im) && e.im.naturalWidth === 440);
    assert.ok(hf, 'the hand face draws the frame'); const hand = D.log.filter((e) => e.cv === hf.cv), hat = hand.indexOf(hf);
    assert.ok(hand.slice(0, hat).some((e) => e.kind === 'text' && /^\d+$/.test(e.s)), 'the key number is painted before the frame (it shows through the picture window)');
    assert.ok(hand.slice(hat).some((e) => e.kind === 'text' && e.s === spec.name), 'the name is over the frame');
    // every type and rarity, junk and the back draw a part image; a card back without a painting does not
    for (const c of CARD_LIST.filter((q, i, a) => a.findIndex((z) => z.type === q.type && z.rarity === q.rarity) === i)) {
      D.log.length = 0; C.drawCard(fakeCtx(), cardSpec({ uid: 1, id: c.id, grafts: [], up: 0 }), 0, 0, { t: 1 }); await load();
      D.log.length = 0; C.clearCardCache(); C.cardFrame(); C.drawCard(fakeCtx(), cardSpec({ uid: 1, id: c.id, grafts: [], up: 0 }), 0, 0, { t: 1 });
      assert.ok(D.log.some((e) => e.kind === 'image' && isPart(e.im) && e.im.naturalWidth === 440), `${c.type} ${c.rarity} (${c.id}) is drawn through a frame`);
    }
    D.log.length = 0; C.drawCardBack(fakeCtx(), 0, 0, { t: 1, back: 'plain' }); await load(); C.clearCardCache();
    D.log.length = 0; C.drawCardBack(fakeCtx(), 0, 0, { t: 1, back: 'plain' });
    assert.ok(D.log.some((e) => e.kind === 'image' && isPart(e.im)), 'the plain back is painted'); assert.ok(D.log.some((e) => e.kind === 'text' && e.s === 'GRAFTWORK'), 'its title is written by the code');
    D.log.length = 0; C.drawCardBack(fakeCtx(), 0, 0, { t: 1, back: 'gilt' });
    assert.ok(!D.log.some((e) => e.kind === 'image' && isPart(e.im)), 'a back without a painting stays procedural');
    // the gem follows the cost state
    const live = []; const lg = fakeCtx(); lg.drawImage = (im, sx, sy) => { if (isPart(im)) live.push([sx, sy]); };
    const gemAt = (o) => { live.length = 0; C.drawCard(lg, spec, 0, 0, { t: 1, ...o }); return live.length ? live[live.length - 1].join(',') : ''; };
    await load(['card_gem', 'card_gem.up', 'card_gem.down']);
    const plain = gemAt({}), up = gemAt({ cost: spec.cost + 1 }), down = gemAt({ cost: spec.cost - 1 });
    assert.ok(plain && up && down && new Set([plain, up, down]).size === 3, 'three gems: printed cost, raised, lowered');
  } finally { D.restore(); templates.configure({ art: null, live: false, fetchJson: null, makeImage: null }); C.clearCardCache(); }
});

await t('sliced_parts_bake_once_per_size_corners_whole_edges_repeated_pills_by_height', async () => {
  templates.configure({ art: true, live: true, fetchJson, makeImage });
  await load(['panel', 'modal', 'button.normal', 'button.small', 'chip.intent']);
  const D = recordingDom();
  try {
    const mk = () => { const calls = []; const g = fakeCtx(); g.drawImage = (...a) => calls.push(a); g.getTransform = () => ({ a: 2, b: 0 }); return { g, calls }; };
    // a modal 400 x 300 on a 2x screen: one bake, then one drawImage per frame
    const A = mk(); assert.equal(SK.nine(A.g, 'modal', 10, 20, 400, 300), true);
    const baked = D.log.filter((e) => e.kind === 'image' && isPart(e.im));
    assert.equal(A.calls.length, 1, 'one drawImage on the screen'); assert.deepEqual(A.calls[0].slice(1), [10, 20, 400, 300]);
    const cv = A.calls[0][0]; assert.deepEqual([cv.width, cv.height], [800, 600], 'baked at device resolution');
    const sl = MAN.frames.modal.slice, rects = baked.map((e) => e.a);
    // the four corners keep their size (logical margin x 2 device px), every piece lands on whole pixels, and the pieces tile the canvas with no gap
    const corner = rects.find((r) => r[4] === 0 && r[5] === 0); assert.deepEqual(corner.slice(6), [sl[0] * 2, sl[1] * 2], 'top left corner is not stretched');
    const br = rects.find((r) => r[4] + r[6] === 800 && r[5] + r[7] === 600); assert.deepEqual(br.slice(6), [sl[2] * 2, sl[3] * 2], 'bottom right corner is not stretched');
    for (const r of rects) for (const v of r.slice(4)) assert.equal(v, Math.round(v), 'whole pixels');
    assert.equal(rects.reduce((s, r) => s + r[6] * r[7], 0), 800 * 600, 'the pieces cover the canvas exactly');
    const top = rects.filter((r) => r[5] === 0 && r[4] > 0 && r[4] + r[6] < 800); assert.ok(top.length >= 2, 'the top edge repeats (it does not stretch one piece): ' + top.length);
    const nat = (MAN.frames.modal.rect.w - sl[0] - sl[2]) * 2; for (const r of top) assert.ok(r[6] > nat * 0.66 && r[6] < nat * 1.5, 'each repeat is close to its natural width');
    const n0 = D.log.length; SK.nine(A.g, 'modal', 10, 20, 400, 300); assert.equal(D.log.length, n0, 'the second frame bakes nothing'); assert.equal(A.calls.length, 2);
    // the leather pill: its caps follow the height (a 44 px button on 2x: cap = slice * 44 / natural height * 2)
    D.log.length = 0; const B = mk(); SK.nine(B.g, 'button.normal', 0, 0, 220, 44);
    const pr = D.log.filter((e) => e.kind === 'image' && isPart(e.im)).map((e) => e.a), bd = MAN.frames['button.normal'], capPx = Math.round(bd.slice[0] * (44 / bd.rect.h) * 2);
    assert.equal(pr.length, 3, 'cap, middle, cap'); assert.deepEqual(pr.map((r) => r[6]), [capPx, 440 - 2 * capPx, capPx]); for (const r of pr) assert.deepEqual([r[5], r[7]], [0, 88], 'one band, top to bottom');
    // the panel is a border: no centre piece
    D.log.length = 0; const P2 = mk(); SK.nine(P2.g, 'panel', 0, 0, 300, 200);
    const pp = D.log.filter((e) => e.kind === 'image' && isPart(e.im)).map((e) => e.a), ps = MAN.frames.panel.slice;
    assert.ok(!pp.some((r) => r[4] >= ps[0] * 2 && r[5] >= ps[1] * 2 && r[4] + r[6] <= 600 - ps[2] * 2 && r[5] + r[7] <= 400 - ps[3] * 2), 'no piece inside the border');
    // chrome: a panel is painted only where its call asks, a too small one keeps the procedural look, a button is painted by default
    const app = (g) => ({ ctx: g, px: 2, scale: 1, frame: 1, rr() {}, shared: {} });
    const c1 = mk(); CH.panel(app(c1.g), 0, 0, 400, 300, { fill: '#111' }); assert.ok(!c1.calls.some((a) => a[0] && a[0].width === 800), 'a plain panel call is not skinned');
    const c2 = mk(); CH.panel(app(c2.g), 0, 0, 400, 300, { frame: 'modal' }); assert.equal(c2.calls.length, 1, 'frame: modal is one drawImage');
    const c3 = mk(); CH.panel(app(c3.g), 0, 0, 90, 60, { frame: 'modal' }); assert.ok(!c3.calls.some((a) => a[0] && a[0].width === 180 && a[0].height === 120 && a.length === 5 && a[3] === 90), 'too small for the corner pieces: procedural');
    const c4 = mk(); assert.equal(CH.button(app(c4.g), 0, 0, 220, 44, {}, 2), 2, 'a pressed button travels 2 px'); assert.equal(c4.calls.length, 1); assert.deepEqual(c4.calls[0].slice(1), [0, 2, 220, 44]);
    const c5 = mk(); CH.button(app(c5.g), 0, 0, 120, 30, {}, 0); assert.equal(c5.calls.length, 1, 'a low button uses the small tab');
    const c6 = mk(); CH.button(app(c6.g), 0, 0, 220, 44, { frame: false }, 0); assert.ok(!c6.calls.some((a) => a[0] && a[0].width === 440 && a[0].height === 88), 'frame: false opts out');
  } finally { D.restore(); templates.configure({ art: null, live: false, fetchJson: null, makeImage: null }); }
});

await t('hud_parts_draw_painted_and_fall_back_one_by_one', async () => {
  templates.configure({ art: true, live: true, fetchJson, makeImage });
  const rec = () => { const parts = []; const g = fakeCtx(); g.drawImage = (im) => { if (isPart(im)) parts.push(im); }; return { g, parts }; };
  try {
    // before anything is loaded every helper answers false and the icon functions draw their procedural look
    const a = rec(); I.drawStatus(a.g, 'weak', 20, 20, 30, false); I.drawIntent(a.g, 'attack', 20, 20, 30); I.drawEnergyOrb(a.g, 20, 20, 60, 2, 3); I.drawShield(a.g, 20, 20, 30, 5); I.drawBudgetGauge(a.g, 0, 0, 300, 4, 6, 0); I.drawPileIcon(a.g, 20, 20, 40, 'draw');
    assert.equal(a.parts.length, 0, 'nothing painted while loading');
    await load(['chip.status', 'dial.energy', 'plate.block', 'gauge.budget.l', 'gauge.budget.cell', 'gauge.budget.r', 'bar.hp.frame', 'bar.hp.fill']);
    const count = (fn) => { const r = rec(); fn(r.g); return r.parts.length; };
    assert.equal(count((g) => I.drawStatus(g, 'weak', 20, 20, 30, false)), 1, 'status chip');
    assert.equal(count((g) => I.drawEnergyOrb(g, 20, 20, 60, 2, 3)), 1, 'energy dial');
    assert.equal(count((g) => I.drawShield(g, 20, 20, 30, 5)), 1, 'block plate');
    assert.equal(count((g) => I.drawBudgetGauge(g, 0, 0, 300, 4, 6, 0)), 8, 'Budget gauge: cap, six sockets, cap');
    assert.equal(count((g) => I.drawBudgetGauge(g, 0, 0, 300, 11, 9, 0)), 11, 'one socket per Budget point');
    assert.equal(count((g) => I.drawPileIcon(g, 20, 20, 40, 'exhaust')), 1, 'pile icon');
    for (const k of Object.keys(I.INTENT_ART)) { assert.ok(MAN.icons[I.INTENT_ART[k]], 'intent ' + k + ' names an icon of the manifest'); assert.equal(count((g) => I.drawIntent(g, k, 20, 20, 30)), 1, 'intent ' + k + ' is painted'); }
    for (const k of ['sweep', 'junk', 'special', 'sleep']) assert.equal(count((g) => I.drawIntent(g, k, 20, 20, 30)), 0, 'intent ' + k + ' has no painting and keeps its glyph');
    { const all = []; const g = fakeCtx(); g.drawImage = (im) => all.push(isPart(im)); assert.equal(SK.hpBar(g, 0, 0, 200, 16, 0.5, 0.7), true); assert.ok(all.filter(Boolean).length >= 1 && all.length >= 2, 'HP tube: liquid tiles, then the frame over them'); assert.equal(all[all.length - 1], false, 'the frame is the baked canvas, drawn last'); }
    const g0 = SK.gauge(fakeCtx(), 10, 0, 34, 6); assert.ok(g0 && g0.cell > 0 && g0.socket > 0 && Math.abs(g0.w - SK.gaugeWidth(34, 6)) < 1e-6, 'gauge geometry');
  } finally { templates.configure({ art: null, live: false, fetchJson: null, makeImage: null }); }
});

// ---------------------------------------------------------------- Settings: the toggle is live, the minimal tier keeps the art off
await t('settings_toggle_switches_the_painted_art_live_and_the_minimal_tier_keeps_it_off', async () => {
  const settings = await import('../graftwork/ui/settings.js');
  assert.equal(settings.DEFAULTS.previewArt, false, 'off by default');
  const meta = { settings: {} }; let saves = 0;
  const app = await makeApp({ meta, flow: { saveMeta() { saves++; } }, audio: { sfx() {}, setVolumes() {}, mute() {} } });
  assert.equal(settings.settingsOf(app).previewArt, false, 'settingsOf fills the default');
  requests.length = 0;
  templates.configure({ art: null, live: true, fetchJson, makeImage });
  try {
    app.register('settings', settings.default); app.push('settings'); frames(app, 30); await tick();
    const sc = app.top(), row = () => sc.rows.find((r) => r.label === 'Painted art (preview)');
    assert.ok(row(), 'the Settings screen has the row'); assert.ok(sc.rows.every((r) => r.y >= 0 && r.y + r.h <= 720), 'every row is on the stage');
    assert.equal(templates.on, false); assert.deepEqual(uiRequests(), [], 'off: no request');
    row().act(1); assert.equal(meta.settings.previewArt, true); assert.equal(saves, 1, 'saved with the other settings');
    frames(app, 2); assert.equal(templates.on, true, 'on at the next frame, no reload'); await tick();
    assert.deepEqual(uiRequests(), ['assets/ui/manifest.json'], 'the manifest is asked for once');
    for (let i = 0; i < 4; i++) { frames(app, 2); await tick(); }
    assert.ok(templates.ready(), 'ready');
    assert.ok(uiRequests().some((u) => /atlas\/chrome@/.test(u)), 'the buttons of the Settings screen asked for the chrome atlas');
    assert.ok(SK.has('button.normal'), 'and it is drawn');
    const before = uiRequests().length, v0 = templates.ver;
    row().act(1); assert.equal(meta.settings.previewArt, false); frames(app, 2);
    assert.equal(templates.on, false, 'off again at the next frame'); assert.equal(templates.ready(), false); assert.equal(SK.has('button.normal'), false); assert.ok(templates.ver > v0, 'the version counts the change (frozen screens repaint)');
    frames(app, 4); await tick(); assert.equal(uiRequests().length, before, 'off: nothing more is asked for');
    row().act(1); frames(app, 2); assert.ok(templates.ready() && SK.has('button.normal'), 'on again: what was loaded is still there, no new request'); assert.equal(uiRequests().length, before);
    // Graphics: Low is the minimal tier: the painted art stays off whatever the toggle says
    app.perf.q.setMode('low', 0); assert.equal(app.perf.q.tier, 'minimal'); frames(app, 2);
    assert.equal(templates.on, false, 'minimal tier: off'); assert.equal(SK.has('button.normal'), false);
    app.perf.q.setMode('high', 0); frames(app, 2); assert.equal(templates.on, true, 'back on the full tier: on');
    // the lite tier takes the 1x files, a dense phone screen the 2x ones
    assert.equal(templates.use2x({ px: 2, perf: { q: { tier: 'full' } } }), true); assert.equal(templates.use2x({ px: 1, perf: { q: { tier: 'full' } } }), false); assert.equal(templates.use2x({ px: 2, perf: { q: { tier: 'lite' } } }), false);
    assert.equal(templates.use2x({ px: 1.62, scale: 0.54 }), true, 'a phone with a dense screen (scale 0.54, dpr 3)');
  } finally { templates.configure({ art: null, live: false, fetchJson: null, makeImage: null }); }
  const doc = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.ok(/previewArt/.test(doc) && /ui\/preview\.js/.test(doc) && /graftwork_ui_build\.py/.test(doc), 'graftwork/CLAUDE.md names the setting, the switch and the build tool');
});

// ---------------------------------------------------------------- the lab page
await t('lab_page_references_real_modules_and_exports', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'lab/art.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'lab/art.js'), 'utf8');
  assert.ok(/<script type="module" src="art\.js">/.test(html)); assert.ok(/viewport/.test(html) && /width=device-width/.test(html), 'a phone viewport');
  for (const id of ['main', 'jump', 'state', 'bg']) assert.ok(new RegExp(`id="${id}"`).test(html), 'element #' + id);
  for (const m of js.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]*)\})\s+from\s+'(\.\.?\/[^']+)'/g)) {
    const file = path.resolve(path.join(ROOT, 'lab'), m[2]); assert.ok(fs.existsSync(file), 'import ' + m[2]);
    if (m[1]) { const mod = await import(file); for (const name of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) assert.ok(name in mod, `${m[2]} exports ${name}`); }
  }
  assert.ok(/templates\.configure\(\{ base: '\.\.\/assets\/ui\/', art: true \}\)/.test(js), 'the lab loads the game\'s own assets/ui');
  for (const id of ['card_front', 'card_back.plain', 'panel', 'panel.parchment', 'modal', 'button.small', 'bar.hp.frame', 'dial.energy', 'plate.block', 'chip.intent', 'gauge.budget', 'sheet.rules', 'sheet.intent', 'bg.title_keyart']) assert.ok(js.includes(id), 'the lab shows ' + id);
  assert.ok(!/console\.(log|error|warn)/.test(js), 'no console output'); assert.ok(!/—/.test(js + html), 'no em dash');
});

// ---------------------------------------------------------------- the build tool: same input, same bytes
await t('build_tool_is_deterministic', () => {
  const tool = fileURLToPath(new URL('../tools/graftwork_ui_build.py', import.meta.url));
  assert.ok(fs.existsSync(tool), 'tools/graftwork_ui_build.py exists');
  const probe = spawnSync('python3', ['-I', '-c', 'import PIL, numpy'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) { console.log('   (skipped: python3 with Pillow and numpy is not available here)'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ui-art-')), raw = path.join(tmp, 'raw');
  try {
    fs.mkdirSync(raw);
    // small stand-ins for the artist's files: a card front with its two windows, a sliced panel, the four pill states, an icon sheet
    const gen = `
import sys, numpy as np
from PIL import Image
out = sys.argv[1]; rng = np.random.default_rng(7)
def save(a, name): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').save(out + '/' + name + '.png')
def noise(h, w, base): a = np.zeros((h, w, 4), np.float32); a[..., :3] = np.array(base, np.float32) + rng.normal(0, 6, (h, w, 3)); a[..., 3] = 255; return a
card = np.zeros((2400, 1792, 4), np.float32); card[90:2311, 85:1707] = noise(2221, 1622, (120, 40, 36))
card[338:1198, 297:1495, 3] = 0; card[1488:2149, 259:1533, 3] = 0
save(card, 'card_front.attack.common')
p = np.zeros((600, 600, 4), np.float32); p[20:580, 20:580] = noise(560, 560, (70, 44, 36)); p[90:510, 90:510] = noise(420, 420, (214, 190, 140))
for cy in (20, 480):
    for cx in (20, 480): p[cy:cy + 100, cx:cx + 100, :3] = (190, 160, 70)
save(p, 'panel')
for i, st in enumerate(('normal', 'hover', 'down', 'disabled')):
    b = np.zeros((120, 600, 4), np.float32); yy, xx = np.mgrid[0:120, 0:600]
    d = np.hypot(np.clip(np.abs(xx - 300) - 240, 0, None), yy - 60)
    b[..., :3] = (110 + i * 12, 40, 36); b[..., 3] = np.clip(58 - d, 0, 1) * 255
    save(b, 'button.' + st)
s = np.zeros((512, 512, 4), np.float32); yy, xx = np.mgrid[0:512, 0:512]
for r in range(4):
    for c in range(4):
        m = np.hypot(xx - (c * 128 + 64), yy - (r * 128 + 64)) < 50; s[m, :3] = (200 - r * 20, 170, 90 + c * 20); s[m, 3] = 255
save(s, 'sheet.rules')
`;
    const g = spawnSync('python3', ['-I', '-c', gen, raw], { encoding: 'utf8' }); assert.equal(g.status, 0, g.stderr);
    const run = (dir) => { const r = spawnSync('python3', ['-I', tool, '--raw', raw, '--out', dir, '--quiet'], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr + r.stdout); return r.stdout; };
    const a = path.join(tmp, 'a'), b = path.join(tmp, 'b'); run(a); run(b);
    const fa = listFiles(a).sort(), fb = listFiles(b).sort();
    assert.deepEqual(fa, fb, 'the same files'); assert.ok(fa.includes('manifest.json') && fa.includes('cards/front_attack_common@2x.webp') && fa.some((f) => f.startsWith('atlas/chrome@')) && fa.some((f) => f.startsWith('atlas/icons@')), 'cards, atlases and the manifest were written: ' + fa.join(' '));
    for (const f of fa) assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), 'identical bytes: ' + f);
    const m = T.parseManifest(JSON.parse(fs.readFileSync(path.join(a, 'manifest.json'), 'utf8')));
    assert.ok(m.frames['card_front.attack.common'] && m.frames['card_front.attack'] && m.frames.panel && m.frames['button.hover'] && m.icons['rules.temper'], 'a partial delivery builds the parts it has');
    assert.ok(!m.frames.modal && !m.frames['card_back.plain'], 'and leaves out the ones it has not');
    const win = m.templates.card_front.slots.window, hole = m.templates.card_front.slots.textHole;
    assert.ok(Math.abs(win.x + 81.25) < 0.6 && Math.abs(win.w - 162.5) < 0.8, 'the picture window is measured from the pixels'); assert.ok(hole.h > 97 && hole.h < 101, 'the text window got the rows that bring 3:4 to the card ratio: ' + hole.h);
    const sz = webpSize(path.join(a, 'cards/front_attack_common@2x.webp')); assert.deepEqual([sz.w, sz.h], [440, 620]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

console.log(n + ' painted UI art checks passed');
