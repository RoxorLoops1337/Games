// 3D characters (beatbox_heroes/park3d/characters.js + char_*.js): catalog parity, NPC looks from Core, the whole cast, clips, moods, props, the instanced crowd and portraits.
// Part 1 bundles characters.js with esbuild and runs it in node (geometry building needs no WebGL). Part 2 runs the shader / render parts in headless Chromium (swiftshader);
// it is SKIPPED when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { ok, eq, between, done, load } from './beatbox_heroes_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..'), CH = path.join(REPO, 'beatbox_heroes', 'park3d', 'characters.js');
const req = createRequire(import.meta.url), esbuild = req(path.join(REPO, 'node_modules', 'esbuild'));
const BBH = load('pix', 'catalog', 'core'), CAT = BBH.CATALOG, Core = BBH.Core;
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'look3d_test_'));
const watchdog = setTimeout(() => { console.error('FAIL: look3d suite hung'); process.exit(1); }, 240000);

await esbuild.build({ entryPoints: [CH], outfile: path.join(tmp, 'chars.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'error' });
const errs = []; const origErr = console.error; const quiet = () => { console.error = (...a) => { errs.push(a.join(' ').slice(0, 200)); }; }, loud = () => { console.error = origErr; };
const M = await import(pathToFileURL(path.join(tmp, 'chars.mjs')).href);
const { createCharacter, createNPC, createCast, castLooks, createCrowd, portrait, normLook, CLIPS, MOODS, KNOWN, JUDGES3D, TRI_BUDGET } = M;
const CTX = { quality: 'high' };
const finite = (arr) => { for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false; return true; };
const geoOk = (c) => { let good = true; c.object.traverse((o) => { if (o.isSkinnedMesh) { const a = o.geometry.attributes; for (const k of Object.keys(a)) if (!finite(a[k].array)) good = false; } }); return good; };
const bonesOk = (c) => { let good = true; c.object.updateMatrixWorld(true); c.object.traverse((o) => { if (o.isBone) for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) good = false; }); return good; };
const clone = (o) => JSON.parse(JSON.stringify(o));

eq(TRI_BUDGET, 3500, 'tri budget is 3500');
const hero = createCharacter(CTX, CAT.DEFAULT_LOOK);

// ---- 1. catalog parity: every id of every group is known to the renderer, builds without throwing, stays inside the budget, no NaN
const setter = {
  body: (L, it) => { L.body = it.id; }, skin: (L, it) => { L.skin = it.color; }, hairStyle: (L, it) => { L.hair.style = it.id; }, hairColor: (L, it) => { L.hair.color = it.color; },
  eyeStyle: (L, it) => { L.eyes.style = it.id; }, eyeColor: (L, it) => { L.eyes.color = it.color; }, brows: (L, it) => { L.brows = it.id; }, facial: (L, it) => { L.facial = it.id; },
  marks: (L, it) => { L.marks = [it.id]; }, top: (L, it) => { L.top.id = it.id; }, bottom: (L, it) => { L.bottom.id = it.id; }, shoes: (L, it) => { L.shoes.id = it.id; },
  hat: (L, it) => { L.hat.id = it.id; }, glasses: (L, it) => { L.glasses.id = it.id; }, acc: (L, it) => { L.acc[it.slot] = { id: it.id, color: '#2ee6ff' }; },
};
let built = 0, maxTris = 0, maxId = '';
for (const g of Object.keys(CAT.GROUPS)) {
  ok(setter[g], 'renderer test covers catalog group ' + g);
  for (const it of CAT.GROUPS[g]) {
    const L = clone(CAT.DEFAULT_LOOK); setter[g](L, it); const before = errs.length;
    let threw = null; quiet(); try { hero.setLook(L); } catch (e) { threw = e; } loud();
    ok(!threw && errs.length === before, g + ':' + it.id + ' builds without throwing' + (threw ? ': ' + threw.message : errs.length > before ? ': ' + errs[errs.length - 1] : ''));
    ok(hero.tris <= TRI_BUDGET, g + ':' + it.id + ' within ' + TRI_BUDGET + ' tris (' + hero.tris + ')'); ok(geoOk(hero), g + ':' + it.id + ' geometry has no NaN');
    built++; if (hero.tris > maxTris) { maxTris = hero.tris; maxId = g + ':' + it.id; }
    const norm = hero.getLook();   // ids that survive normalisation are the ids the catalog offered
    if (g === 'hairStyle') eq(norm.hair.style, it.id, 'hair id kept ' + it.id); if (g === 'hat') eq(norm.hat.id, it.id, 'hat id kept ' + it.id); if (g === 'glasses') eq(norm.glasses.id, it.id, 'glasses id kept ' + it.id);
    if (g === 'top') eq(norm.top.id, it.id, 'top id kept ' + it.id); if (g === 'bottom') eq(norm.bottom.id, it.id, 'bottom id kept ' + it.id); if (g === 'shoes') eq(norm.shoes.id, it.id, 'shoes id kept ' + it.id);
    if (g === 'facial') eq(norm.facial, it.id, 'facial id kept ' + it.id); if (g === 'eyeStyle') eq(norm.eyes.style, it.id, 'eye id kept ' + it.id); if (g === 'brows') eq(norm.brows, it.id, 'brow id kept ' + it.id);
    if (g === 'marks') eq(norm.marks, [it.id], 'mark kept ' + it.id); if (g === 'acc') eq(norm.acc[it.slot].id, it.id, 'accessory kept ' + it.id); if (g === 'body') eq(norm.body, it.id, 'body kept ' + it.id);
  }
}
ok(built >= 230, 'built every catalog id (' + built + ', largest ' + maxId + ' ' + maxTris + ' tris)');
for (const g of ['hairStyle', 'hat', 'glasses', 'facial', 'eyeStyle', 'brows', 'marks', 'body']) ok(CAT.GROUPS[g].every((it) => (KNOWN[{ hairStyle: 'hair', eyeStyle: 'eyes' }[g] || g] || []).indexOf(it.id) >= 0), 'KNOWN ids cover catalog group ' + g);
ok(CAT.GROUPS.acc.every((it) => KNOWN.acc[it.slot].indexOf(it.id) >= 0), 'KNOWN ids cover every accessory slot');

// ---- 2. unknown ids fall back to 'none' (or the group default)
{
  const L = clone(CAT.DEFAULT_LOOK); L.hair.style = 'zzz'; L.hat.id = 'zzz'; L.glasses.id = 'zzz'; L.facial = 'zzz'; L.eyes.style = 'zzz'; L.brows = 'zzz'; L.marks = ['zzz', 'blush']; L.top.id = 'zzz'; L.bottom.id = 'zzz'; L.shoes.id = 'zzz'; L.body = 'zzz';
  L.acc = { neck: { id: 'zzz' }, ears: { id: 'zzz' }, back: { id: 'zzz' }, hand: { id: 'zzz' }, wrist: { id: 'zzz' }, tail: { id: 'chain' } };
  const n = normLook(L);
  eq([n.hair.style, n.hat.id, n.glasses.id, n.facial, n.eyes.style, n.brows, n.top.id, n.bottom.id, n.shoes.id, n.body], ['bald', 'none', 'none', 'none', 'round', 'soft', 'tee', 'jeans', 'sneakers', 'neutral'], 'unknown ids normalise to none or the default');
  eq(n.marks, ['blush'], 'unknown face marks are dropped'); eq(Object.keys(n.acc), [], 'unknown accessory ids and slots are dropped');
  const M0 = clone(CAT.DEFAULT_LOOK); M0.hair.style = 'bald'; M0.hat.id = 'none'; M0.glasses.id = 'none'; M0.facial = 'none'; M0.eyes.style = 'round'; M0.brows = 'soft'; M0.marks = ['blush']; M0.top.id = 'tee'; M0.bottom.id = 'jeans'; M0.shoes.id = 'sneakers'; M0.body = 'neutral'; M0.acc = {};
  hero.setLook(L); const a = hero.tris; hero.setLook(M0); eq(a, hero.tris, 'an unknown-id look builds exactly the none/default look');
  hero.setLook(null); ok(hero.tris > 500 && geoOk(hero), 'a null look builds the default hero'); hero.setLook({ hair: 'afro', hat: 'beanie', glasses: 'round', top: 'hoodie', bottom: 'jeans', shoes: 'boots' }); ok(hero.tris > 500 && geoOk(hero), 'string shorthand looks still build');
}

// ---- 3. budget governor: 80 seeded worst-case mixes stay under the budget
{
  let s = 12345; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }, pick = (a) => a[Math.floor(r() * a.length)], worst = { n: 0 };
  for (let i = 0; i < 80; i++) {
    const L = clone(CAT.DEFAULT_LOOK); L.body = pick(CAT.BODIES).id; L.hair.style = pick(CAT.HAIR_STYLES).id; L.top.id = pick(CAT.TOPS).id; L.bottom.id = pick(CAT.BOTTOMS).id; L.shoes.id = pick(CAT.SHOES).id; L.hat.id = pick(CAT.HATS).id; L.glasses.id = pick(CAT.GLASSES).id;
    L.facial = pick(CAT.FACIAL).id; L.marks = [pick(CAT.MARKS).id, pick(CAT.MARKS).id]; for (const slot of CAT.ACC_SLOTS) { const it = pick(CAT.ACCESSORIES.filter((a) => a.slot === slot)); L.acc[slot] = { id: it.id, color: pick(CAT.OUTFIT_COLORS) }; }
    hero.setLook(L); if (hero.tris > worst.n) worst.n = hero.tris; ok(hero.tris <= TRI_BUDGET && geoOk(hero), 'random look ' + i + ' within budget (' + hero.tris + ')');
  }
  ok(worst.n > 2500, 'budget test exercises heavy looks (worst ' + worst.n + ')');
}

// ---- 4. NPC looks come from the passed look, NPC_LOOKS only as fallback
{
  const fox = clone(Core.NPCS.foxy.look); fox.hair = { style: 'afro', color: '#ff3ea5' }; fox.hat = { id: 'wizard', color: '#7b4fe0' };
  const a = createNPC(CTX, 'foxy', { look: fox }); eq(a.getLook().hair.style, 'afro', 'createNPC uses the passed hair'); eq(a.getLook().hat.id, 'wizard', 'createNPC uses the passed hat (no merge with NPC_LOOKS)');
  const b = createNPC(CTX, 'foxy'); eq(b.getLook().hair.style, M.NPC_LOOKS.foxy.hair.style, 'createNPC falls back to NPC_LOOKS without a look');
  const bee = clone(Core.NPCS.beeamgee.look), c = createNPC(CTX, 'beeamgee', { look: bee }); eq(c.getLook().hat.id, 'none', 'BeeAmGee takes the Core look (no cap)'); ok(c.boombox && c.seat > 0, 'BeeAmGee keeps his boombox and bench');
  c.play('talk'); c.update(0.05, 0.05); ok(bonesOk(c), 'BeeAmGee seated variants animate');
  for (const id of Object.keys(Core.NPCS)) { const n = createNPC(CTX, id, { look: Core.NPCS[id].look }); eq(n.getLook().name, Core.NPCS[id].look.name, 'npc ' + id + ' name from Core'); ok(n.tris <= TRI_BUDGET && geoOk(n), 'npc ' + id + ' within budget'); }
}

// ---- 5. the whole cast from Core data
{
  const looks = castLooks(Core);
  eq(Object.keys(looks.npc).sort(), Object.keys(Core.NPCS).sort(), 'cast has every Core NPC'); eq(Object.keys(looks.opponent).sort(), Core.OPPONENTS.map((o) => o.id).sort(), 'cast has every opponent');
  eq(Object.keys(looks.final).sort(), Core.FINALS.map((o) => o.id).sort(), 'cast has every final'); eq(Object.keys(looks.judge).sort(), Core.JUDGES.map((j) => j.id).sort(), 'cast has all five judges'); ok(looks.clerk && looks.clerk.name === 'Clerk', 'cast has the clerk');
  ok(Core.OPPONENTS.every((o) => looks.opponent[o.id] && looks.opponent[o.id].name), 'every opponent has a look (Pig Pen included)');
  const jn = Object.keys(looks.judge).map((id) => JSON.stringify(looks.judge[id])); eq(new Set(jn).size, 5, 'five distinct judge looks');
  eq(Object.keys(JUDGES3D).sort(), ['mel', 'origi', 'showtime', 'tek', 'wildcard'], 'judge definitions are Tek, Mel, Origi, Showtime, Wildcard'); ok(Object.values(JUDGES3D).every((j) => ['clipboard', 'scorecard', 'card'].includes(j.prop.kind)), 'every judge holds a prop');
  const cast = createCast(CTX, Core); const all = cast.buildAll();
  eq(all.length, Object.keys(Core.NPCS).length + Core.OPPONENTS.length + Core.FINALS.length + Core.JUDGES.length + 1, 'buildAll builds the whole cast (' + all.length + ')');
  for (const c of all) { ok(c.tris <= TRI_BUDGET && c.tris > 500, 'cast ' + c.castKey + ' within budget (' + c.tris + ')'); ok(geoOk(c), 'cast ' + c.castKey + ' no NaN'); }
  ok(cast.judge('tek') === cast.judge('tek'), 'cast characters are built once'); for (const j of Core.JUDGES) { const c = cast.judge(j.id); ok(c.prop && c.prop.userData.tris <= 120, 'judge ' + j.id + ' holds a prop <= 120 tris'); eq(c.displayName, j.name, 'judge name ' + j.id); c.update(0.05, 0.05); ok(bonesOk(c), 'judge ' + j.id + ' animates'); }
  ok(cast.opponent('hexx').taunt && cast.final('wc3').displayName === 'Penny', 'opponents and finals carry their names and taunts');
  const m = [cast.crowdMember(0), cast.crowdMember(1), cast.crowdMember(0, 9)]; ok(m[0] !== m[1] && JSON.stringify(m[0].getLook()) !== JSON.stringify(m[1].getLook()), 'generic crowd members differ'); ok(m.every((c) => c.tris <= TRI_BUDGET), 'crowd members within budget');
  cast.dispose();
}

// ---- 6. clips, moods, props: every clip stays finite, one-shots return, hold takes every prop
{
  const c = createCharacter(CTX, CAT.DEFAULT_LOOK); eq(CLIPS.slice(-7), ['point', 'battle', 'sad', 'finisher', 'hit', 'hold', 'walkside'], 'new clips are listed');
  for (const clip of CLIPS) { c.play(clip, { speed: 1.4, bpm: 100, seat: 0.46, prop: 'box' }); for (let i = 0; i < 90; i++) c.update(1 / 30, i / 30); ok(bonesOk(c), 'clip ' + clip + ' stays finite'); }
  c.play('hit', { side: 1 }); for (let i = 0; i < 12; i++) c.update(1 / 30, i / 30); ok(c.anim.clip === 'hit', 'hit is still playing at 0.4 s'); for (let i = 0; i < 30; i++) c.update(1 / 30, i / 30); eq(c.anim.clip, 'idle', 'hit returns to idle by itself');
  c.play('hit'); c.update(0.016, 0); c.play('hit'); c.update(0.016, 0); eq(c.anim.cur.t < 0.05, true, 'hit restarts when played again');
  c.play('walkside', { speed: 1.4 }); for (let i = 0; i < 20; i++) c.update(1 / 30, i / 30); ok(c.anim.vs > 0.5, 'walkside walks like walk');
  for (const kind of M.PROP_KINDS) { c.setProp(kind, { color: '#ff3ea5', score: 9 }); c.play('hold', { prop: kind, raise: kind === 'scorecard' ? 1 : 0, speed: 0 }); for (let i = 0; i < 40; i++) c.update(1 / 30, i / 30); ok(bonesOk(c) && c.prop.parent === c.object && c.prop.userData.tris <= 120, 'hold with ' + kind + ' (' + c.prop.userData.tris + ' tris)'); }
  c.setScore(10); eq(c.propKind, 'scorecard', 'setScore keeps the scorecard'); c.setProp(null); ok(!c.prop, 'setProp(null) removes the prop');
  const t0 = c.object.getObjectByName('char_lit').geometry.attributes.position.count;
  for (const mood of MOODS) { c.setMood(mood, true); c.play('idle'); for (let i = 0; i < 6; i++) c.update(1 / 30, i / 30); ok(bonesOk(c), 'mood ' + mood + ' stays finite'); ok(c.mood === mood, 'mood ' + mood + ' is set'); }
  eq(MOODS, ['neutral', 'happy', 'sad', 'angry', 'shout'], 'five moods'); c.setMood('nonsense'); eq(c.anim.mood, 'neutral', 'unknown mood falls back to neutral'); ok(t0 > 0, 'lit geometry exists');
  c.setMood('sad', true); c.update(0.02, 0); const B = c.rig.map; ok(B.lipF.scale.y > 0.5 && B.lipS.scale.y < 0.05, 'sad shows the frown and hides the smile'); c.setMood('happy', true); c.update(0.02, 0); ok(B.mouth.scale.y > 0.2 && B.lipS.scale.y < 0.05 && B.lipF.scale.y < 0.05, 'happy opens a grin and hides the closed lip lines (one mouth only)'); c.setMood('neutral', true); c.play('idle'); c.update(0.02, 0); ok(B.lipS.scale.y > 0.5 && B.mouth.scale.y < 0.01, 'neutral idle shows only the closed smile line');
  c.setMood('angry', true); c.update(0.02, 0); ok(B.browL.quaternion.z * B.browR.quaternion.z < 0 || Math.abs(B.browL.quaternion.z) > 0.1, 'angry tilts the brows');
  c.dispose();
}

// ---- 7. instanced crowd (node: geometry and attributes)
{
  const crowd = createCrowd(CTX, 200, { area: { x0: -6, x1: 6, z0: 1, z1: 7 }, facing: { x: 0, z: -9 }, seed: 3, keepout: [{ x0: -1, x1: 1, z0: 1, z1: 3 }] });
  ok(crowd.trisPer <= 600 && crowd.trisPer > 250, 'spectator <= 600 tris (' + crowd.trisPer + ')'); eq(crowd.count, 200, '200 spectators'); eq(crowd.draws, 1, 'one draw call'); ok(!crowd.mesh.isSkinnedMesh, 'no skeleton');
  ok(crowd.mesh.isInstancedMesh && crowd.mesh.count === 200, 'one InstancedMesh');
  const g = crowd.mesh.geometry; for (const k of ['iA', 'iB', 'iC', 'iD']) ok(g.attributes[k] && g.attributes[k].count === 200 && finite(g.attributes[k].array), 'instance attribute ' + k + ' is finite');
  ok(finite(g.attributes.position.array) && finite(g.attributes.color.array) && finite(crowd.mesh.instanceMatrix.array), 'crowd geometry and matrices are finite');
  ok(crowd.positions.every((p) => p[0] >= -6.5 && p[0] <= 6.5 && p[1] >= 0.5 && p[1] <= 7.5), 'spectators stand inside the area'); ok(crowd.positions.filter((p) => p[0] > -1 && p[0] < 1 && p[1] > 1 && p[1] < 3).length === 0, 'keep-out zone stays empty');
  const skins = new Set(), shirts = new Set(), styles = new Set(); for (let i = 0; i < 200; i++) { const a = g.attributes.iA.array, b = g.attributes.iB.array, d = g.attributes.iD.array; skins.add(a[i * 4].toFixed(2) + a[i * 4 + 1].toFixed(2)); shirts.add(b[i * 4].toFixed(2) + b[i * 4 + 1].toFixed(2)); styles.add(d[i * 4 + 3]); }
  ok(skins.size >= 8 && shirts.size >= 12 && styles.size === 4, 'colour and hair variety (' + skins.size + ' skins, ' + shirts.size + ' shirts, ' + styles.size + ' styles)');
  crowd.setEnergy(0.9); crowd.setBeat(128); crowd.cheer(1); for (let i = 0; i < 12; i++) crowd.update(1 / 30, i / 30); ok(crowd.state.burst > 0, 'cheer burst is active'); for (let i = 0; i < 90; i++) crowd.update(1 / 30, i / 30); ok(crowd.state.energy > 0.8 && crowd.state.burst === 0, 'energy follows setEnergy and the burst ends');
  const ring = createCrowd(CTX, 40, { ring: { cx: 0, cz: 0, r0: 5, r1: 7, a0: 0, a1: Math.PI } }); ok(ring.positions.every((p) => Math.hypot(p[0], p[1]) >= 4.9 && Math.hypot(p[0], p[1]) <= 7.1), 'ring layout'); ring.dispose();
  const fixed = createCrowd(CTX, 3, { positions: [[1, 2], [3, 4, 0.5]] }); eq(fixed.positions.length, 3, 'explicit positions'); fixed.dispose(); crowd.setPositions(crowd.positions.map((p) => [p[0], p[1] + 1])); crowd.dispose(); ok(createCrowd(CTX, 0, {}).count === 0, 'an empty crowd is fine');
}

// ---- 8. portraits need a renderer: without one they return null (no throw); the render check runs in the browser part
ok(portrait(CAT.DEFAULT_LOOK, { mood: 'happy', size: 64 }) === null, 'portrait without a renderer returns null');
loud();

// ---- 9. browser part: real WebGL (swiftshader): shaders compile, portraits render, moods differ, crowd draws, no console errors
const REQUIRED = process.env.BBH_BROWSER === '1';
let chromium = null; try { chromium = req(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { chromium = null; }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (!chromium || !exe || !fs.existsSync(exe)) { console.log('beatbox_heroes_look3d: browser part SKIPPED, no playwright-core or Chromium'); ok(!REQUIRED, 'browser part required (BBH_BROWSER=1)'); } else {
  await esbuild.build({ stdin: { contents: "import '" + CH.replace(/\\/g, '/') + "';", resolveDir: REPO }, outfile: path.join(tmp, 'page.js'), bundle: true, format: 'iife', logLevel: 'error' });
  fs.writeFileSync(path.join(tmp, 'page.html'), '<!doctype html><html><body style="margin:0"><canvas id="cv" width="256" height="256"></canvas><script src="page.js"></script></body></html>');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 400, height: 400 } })).newPage(); const perr = [];
  page.on('pageerror', (e) => perr.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') perr.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await page.goto(pathToFileURL(path.join(tmp, 'page.html')).href);
  const r = await page.evaluate((core) => {
    const C = window.__chars, T = C.THREE, out = {}, cv = document.getElementById('cv'), renderer = new T.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: true }), ctx = { quality: 'high', renderer };
    const L = (id) => core.NPCS[id].look, sum = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, a = 0; for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; if (d[i + 3] > 10) a++; } return [s, a]; };
    const first = C.createCharacter(ctx, L('foxy')); out.has = !!first.object;                       // registers the shared renderer
    const pn = C.portrait(L('foxy'), { mood: 'neutral', size: 96 }), ph = C.portrait(L('foxy'), { mood: 'happy', size: 96 }), ps = C.portrait(L('foxy'), { mood: 'sad', size: 96 }), pa = C.portrait(L('foxy'), { mood: 'angry', size: 96 });
    out.portraits = [pn, ph, ps, pa].map((c) => c && sum(c)); out.size = [pn.width, pn.height];
    const pbg = C.portrait(L('penny'), { mood: 'shout', size: 64, bg: '#7b1f3f' }), px = pbg.getContext('2d').getImageData(1, 1, 1, 1).data; out.bg = [px[0], px[1], px[2], px[3]];
    const pw = C.portrait({ hat: { id: 'wizard', color: '#7b4fe0' } }, { size: 64 }); out.wizard = sum(pw)[1];
    C.disposePortraits();
    // the crowd and a judge in one scene: shaders must compile and draw
    const scene = new T.Scene(); C.addStudioLights(scene); const cam = new T.PerspectiveCamera(40, 1, 0.1, 60); cam.position.set(0, 2.5, -6); cam.lookAt(0, 1, 3);
    const crowd = C.createCrowd(ctx, 120, { area: { x0: -5, x1: 5, z0: 0, z1: 5 }, facing: { x: 0, z: -10 }, seed: 4 }); scene.add(crowd.object);
    const cast = C.createCast(ctx, core), j = cast.judge('mel'); j.object.position.set(0, 0, 1); j.setScore(9); j.play('hold', { prop: 'scorecard', raise: 1 }); scene.add(j.object);
    crowd.setEnergy(0.9); for (let i = 0; i < 40; i++) { crowd.update(1 / 30, i / 30); j.update(1 / 30, i / 30); }
    renderer.setSize(256, 256, false); renderer.setClearColor(0x1a1230, 1); renderer.render(scene, cam); const gl = renderer.getContext(), px2 = new Uint8Array(4); out.calls = renderer.info.render.calls; out.tris = renderer.info.render.triangles;
    let lit = 0; const buf = new Uint8Array(256 * 256 * 4); gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, buf); for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i + 1] + buf[i + 2] > 120) lit++; out.lit = lit; void px2;
    crowd.dispose(); cast.dispose(); return out;
  }, JSON.parse(JSON.stringify({ NPCS: Core.NPCS, OPPONENTS: Core.OPPONENTS, FINALS: Core.FINALS, JUDGES: Core.JUDGES })));
  ok(r.portraits.every((p) => p && p[1] > 1500), 'portraits render a head (opaque pixels: ' + r.portraits.map((p) => p && p[1]).join(',') + ')'); eq(r.size, [96, 96], 'portrait size');
  ok(new Set(r.portraits.map((p) => p[0])).size === 4, 'the four moods render four different portraits'); ok(r.bg[3] === 255 && r.bg[0] > 90, 'portrait background colour is honoured (' + r.bg.join(',') + ')'); ok(r.wizard > 800, 'a tall hat is framed in the portrait');
  ok(r.calls <= 12 && r.calls >= 3, 'crowd + judge draw in few calls (' + r.calls + ')'); ok(r.lit > 3000, 'the scene is not black (' + r.lit + ' lit pixels)');
  ok(perr.length === 0, 'no console errors or shader warnings in the browser' + (perr.length ? ': ' + perr.slice(0, 3).join(' | ') : ''));
  await browser.close();
}
clearTimeout(watchdog); fs.rmSync(tmp, { recursive: true, force: true }); done();
void between;
