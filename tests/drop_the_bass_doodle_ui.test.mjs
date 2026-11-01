// Drop the Bass: the doodle UI art (glyphs, gear, crates, rarity frames), headless on a mock ctx.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawGlyph, drawIcon, drawGear, drawCrate, drawRarityFrame, GLYPH_NAMES, setArtScale } from '../drop_the_bass/js/doodle_ui.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mock() {
  const st = { saves: 0, restores: 0, calls: 0, nan: 0, log: [] };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return (...a) => { st.calls++; for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; st.log.push(k + a.length); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}
setArtScale(2);
const chk = (c, m) => { ok(c.__st.saves === c.__st.restores, m + ' balanced'); ok(c.__st.nan === 0, m + ' no NaN'); ok(c.__st.calls > 0, m + ' draws'); };
ok(GLYPH_NAMES.length >= 50, 'glyph names');
ok(drawIcon === drawGlyph, 'icon alias');
for (const g of GLYPH_NAMES) { let c = mock(); drawGlyph(c, g, 50, 50, 32); chk(c, g); c = mock(); drawGlyph(c, g, 50, 50, 32, '#ff0000'); chk(c, g + ' col'); }
for (const s of ['head', 'mic', 'body', 'chain', 'feet']) for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic']) { const c = mock(); drawGear(c, s, 'gear_' + s + '_1', r, 60, 60, 56); chk(c, s + r); }
for (const tier of ['garage', 'studio', 'platinum']) for (const o of [{}, { t: 1, shake: 1 }, { t: 2, open: 0.5 }, { t: 3, open: 1 }]) { const c = mock(); drawCrate(c, tier, 100, 100, 90, o); chk(c, tier); }
for (const r of ['common', 'rare', 'epic', 'legendary', 'mythic']) { const c = mock(); drawRarityFrame(c, r, 80, 80, 100, 130, 1.4); chk(c, 'frame ' + r); }
drawGlyph(mock(), 'nope', 0, 0, 10); drawGear(mock(), 'x', 'y', 'z', 0, 0, 10); drawCrate(mock(), 'x', 0, 0, 10); n += 3;
const a = mock(), b = mock(); drawGear(a, 'mic', 'abc', 'epic', 10, 10, 50); drawGear(b, 'mic', 'abc', 'epic', 10, 10, 50);
ok(a.__st.log.join() === b.__st.log.join(), 'deterministic');
const src = readFileSync(new URL('../drop_the_bass/js/doodle_ui.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|new Date/.test(src), 'no unseeded randomness or clock'); ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
// ---- hub and meta UI wiring (Setlist, wardrobe, skins, seven worlds, settings): modules load, data lines up, nothing says the old numbers
{
  const { WORLDS, BOSSES, ENCORE_MAX } = await import('../drop_the_bass/js/data_core.js');
  const { SKIN_PRICES, SKIN_IDS, OUTFITS } = await import('../drop_the_bass/js/data_meta.js');
  const { BOARD_SKIN_IDS, BOARD_SKINS, drawBoard } = await import('../drop_the_bass/js/doodle_env.js');
  const { drawBoss } = await import('../drop_the_bass/js/doodle_enemies.js');
  const { drawHero } = await import('../drop_the_bass/js/doodle_heroes.js');
  const { RUN_MODIFIERS, HERO_ABILITIES } = await import('../drop_the_bass/js/data_depth.js');
  const M = await import('../drop_the_bass/js/meta.js');
  ok(WORLDS.length === 7 && WORLDS.every((w) => BOSSES[w.boss] && BOSSES[w.boss10]), 'seven worlds with bosses');
  ok(M.worldStarsMax() === WORLDS.length * 3 * (ENCORE_MAX + 1), 'Stars total is data driven');
  for (const w of WORLDS) { const c = mock(); drawBoss(c, w.boss, 40, 40, { t: 1, scale: 0.5, hp: 1 }); chk(c, 'boss portrait ' + w.boss); }
  ok(SKIN_IDS.join() === BOARD_SKIN_IDS.join() && SKIN_IDS.every((id) => BOARD_SKINS[id] && BOARD_SKINS[id].name) && SKIN_PRICES.skin_paper === 0, 'shop skins match the art skins');
  for (const id of SKIN_IDS) { const c = mock(); drawBoard(c, 'garage', 'garage', 0.3, { skin: id }); chk(c, 'skin thumbnail ' + id); }
  for (const who of ['roxor', 'jasmin']) for (const o of M.outfitList(M.newProfile(1), who)) { const c = mock(); drawHero(c, who, 40, 90, 100, { t: 0.4, outfit: o.id, pose: 'idle' }); chk(c, 'wardrobe ' + who + ' ' + o.id); ok(OUTFITS[who][o.id] && o.how.length > 0, 'outfit row ' + o.id); }
  ok(RUN_MODIFIERS.length === 10 && RUN_MODIFIERS.every((m) => m.glyph && GLYPH_NAMES.includes(m.glyph)), 'every modifier glyph exists');
  ok(Object.values(HERO_ABILITIES).every((l) => l.length === 3), 'three abilities per hero');
  ok(GLYPH_NAMES.includes('fire') && GLYPH_NAMES.includes('lock') && GLYPH_NAMES.includes('check'), 'flame, lock and check glyphs exist for the Setlist');
  for (const f of ['ui_hub.js', 'ui_run.js', 'ui_setlist.js', 'ui_wardrobe.js', 'main.js', 'cutscene.js', 'meta.js', 'data_meta.js']) {
    const t = readFileSync(new URL('../drop_the_bass/js/' + f, import.meta.url), 'utf8');
    ok(!t.includes(String.fromCharCode(8212)), f + ' has no em dash'); ok(!/five stages|all 5 stages/i.test(t), f + ' does not claim five stages');
  }
  const hub = readFileSync(new URL('../drop_the_bass/js/ui_hub.js', import.meta.url), 'utf8');
  ok(/requestRun\(\{ mode: 'story'/.test(hub) && !/startRun\(\{ mode: 'story'/.test(hub), 'Play goes through the Setlist');
  ok(/Share anonymous play stats/.test(hub) && /Helps balance the game\. No names or identifiers are sent\./.test(hub) && /promptInstall/.test(hub), 'settings: analytics and install');
}
console.log('drop_the_bass doodle_ui: ' + n + ' checks passed');
