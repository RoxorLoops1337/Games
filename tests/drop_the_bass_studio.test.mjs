// Drop the Bass: visible progress. studioProps tiers, the Studio tab backstage scene and the stage props (drawStageBase o.studio), headless with a mock ctx.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studioProps, drawStudioScene, drawStageBase, setArtScale } from '../drop_the_bass/js/doodle_env.js';
import { STUDIO, STUDIO_IDS, fameTitle, FAME_MAX } from '../drop_the_bass/js/data_meta.js';
import { WORLDS } from '../drop_the_bass/js/data_core.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mockCtx() {
  const st = { saves: 0, restores: 0, calls: 0, bad: 0 };
  return new Proxy({}, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return (...a) => { st.calls++; for (const v of a) if (typeof v === 'number' && !isFinite(v)) st.bad++; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const maxed = {}; for (const id of STUDIO_IDS) maxed[id] = STUDIO[id].max;

// ---- tiers
const z = studioProps({}); ok(Object.values(z).every((v) => v === 0), 'empty studio is all zero');
ok(JSON.stringify(studioProps(null)) === JSON.stringify(z) && JSON.stringify(studioProps(undefined)) === JSON.stringify(z) && JSON.stringify(studioProps('x')) === JSON.stringify(z), 'junk input is an empty studio');
const f = studioProps(maxed);
ok(f.amps === 4 && f.riser === 3 && f.cables === 3 && f.charm === 2 && f.jar === 4 && f.banner === 2 && f.lights === 3 && f.van === 3 && f.truss === 3 && f.eq === 3, 'a maxed studio shows everything');
ok(studioProps({ amp: 1 }).amps === 1 && studioProps({ amp: 5 }).amps === 2 && studioProps({ amp: 10 }).amps === 3 && studioProps({ amp: 15 }).amps === 4, 'amp tiers');
ok(studioProps({ rack: 1 }).van === 1 && studioProps({ rack: 3 }).van === 3 && studioProps({ stream: 4 }).van === 2, 'van comes from the Roadie Rack and Streaming Royalties');
ok(studioProps({ amp: NaN, tempo: -3, hype: 'x', coin: 2.9 }).amps === 0 && studioProps({ amp: NaN, tempo: -3, hype: 'x', coin: 2.9 }).jar === 1, 'bad levels are ignored');
// more levels never remove props
let prev = studioProps({});
for (let l = 0; l <= 20; l++) { const cur = studioProps(Object.fromEntries(STUDIO_IDS.map((id) => [id, Math.min(l, STUDIO[id].max)]))); for (const k of Object.keys(cur)) ok(cur[k] >= prev[k], 'monotonic ' + k + ' at ' + l); prev = cur; }

// ---- the scene
for (const sc of [1, 2, 3]) {
  setArtScale(sc);
  for (const [label, studio] of [['empty', {}], ['some', { amp: 6, hype: 2, coin: 8, rack: 1 }], ['max', maxed], ['null', null]]) {
    for (const hl of [{ roxor: 1, jasmin: 1 }, { roxor: 4, jasmin: 7 }, { roxor: 10, jasmin: 10 }, {}]) {
      const c = mockCtx(); drawStudioScene(c, 504, 170, 1.7, studio, { heroLv: hl, outfits: { roxor: 'onesie', jasmin: 'default' } });
      ok(c.__st.saves === c.__st.restores && c.__st.bad === 0 && c.__st.calls > 30, 'scene ' + label + ' scale ' + sc);
    }
  }
}
drawStudioScene(mockCtx(), 300, 100, 0, {}); drawStudioScene(mockCtx(), 504, 170); n += 2;
{ const a = mockCtx(), b = mockCtx(); drawStudioScene(a, 504, 170, 2.2, maxed, { heroLv: { roxor: 9, jasmin: 9 } }); drawStudioScene(b, 504, 170, 2.2, maxed, { heroLv: { roxor: 9, jasmin: 9 } }); ok(a.__st.calls === b.__st.calls, 'scene is deterministic'); }
{ const a = mockCtx(), b = mockCtx(); drawStudioScene(a, 504, 170, 2.2, {}, {}); drawStudioScene(b, 504, 170, 2.2, maxed, {}); ok(b.__st.calls > a.__st.calls, 'a bigger studio draws more'); }

// ---- the stage the Static attack
setArtScale(2);
for (const w of WORLDS) for (const [hp, hit] of [[1, 0], [0.4, 1], [0, 0]]) for (const studio of [undefined, null, {}, { amp: 3 }, { amp: 16, heropow: 7, hype: 5, stagehp: 10 }, maxed]) {
  const c = mockCtx(); drawStageBase(c, w.id, 450, 760, { t: 2.2, hp, hit, beat: 0.4, studio });
  ok(c.__st.saves === c.__st.restores && c.__st.bad === 0 && c.__st.calls > 20, 'stage ' + w.id + ' ' + hp + ' ' + String(JSON.stringify(studio)).slice(0, 20));
}
{
  const a = mockCtx(), b = mockCtx(), d = mockCtx(), e = mockCtx();
  drawStageBase(a, 'club', 100, 100, { t: 1, hp: 1 }); drawStageBase(b, 'club', 100, 100, { t: 1, hp: 1, studio: {} }); drawStageBase(d, 'club', 100, 100, { t: 1, hp: 1, studio: maxed });
  ok(a.__st.calls === b.__st.calls, 'no studio or an empty studio draws the plain stage (default behaviour kept)');
  ok(d.__st.calls > a.__st.calls, 'a maxed studio adds props to the stage');
  drawStageBase(e, 'club', 100, 100, { t: 1, hp: 1, studio: { lucky: 1 } }); ok(e.__st.calls > a.__st.calls, 'string lights add live bulbs');
}

// ---- fame titles
ok(fameTitle(1) === 'Garage Band' && fameTitle(FAME_MAX) === 'Bass Legend' && fameTitle(10) === 'Local Legend', 'fame titles');
for (let l = 1; l <= FAME_MAX; l++) ok(typeof fameTitle(l) === 'string' && fameTitle(l).length > 2, 'title at ' + l);

// ---- house rules
const src = readFileSync(new URL('../drop_the_bass/js/doodle_env.js', import.meta.url), 'utf8');
ok(!/Math\.random|Date\.now|performance\.now/.test(src) && !src.includes(String.fromCharCode(8212)), 'no randomness, clock or em dash in the env art');
// ---- Studio hero levels unlock the Setlist hero moves; the wardrobe and skins are in the Band tab
{
  const M = await import('../drop_the_bass/js/meta.js');
  const p = M.newProfile(1); p.records = 1e7;
  ok(M.heroAbilityList(p, 'roxor').filter((a) => a.unlocked).length === 1, 'level 1: only the original move');
  while (p.heroLv.roxor < 4) M.upgradeHero(p, 'roxor');
  ok(M.heroAbilityList(p, 'roxor').filter((a) => a.unlocked).length === 2 && M.setHeroAbility(p, 'roxor', 'freeze').ok, 'hero level 4 unlocks the second move');
  while (p.heroLv.roxor < 7) M.upgradeHero(p, 'roxor');
  ok(M.heroAbilityList(p, 'roxor').every((a) => a.unlocked) && M.setHeroAbility(p, 'roxor', 'overclock').ok, 'hero level 7 unlocks the third move');
  const q = M.migrate(JSON.parse(JSON.stringify(p)), 1); ok(q.heroAbility.roxor === 'overclock', 'the pick survives a save');
  ok(M.outfitList(p, 'jasmin').length === 7 && M.outfitList(p, 'jasmin').every((o) => typeof o.how === 'string'), 'wardrobe rows for the Band tab');
  p.diamonds = 500; const price = M.outfitList(p, 'jasmin').find((o) => o.id === 'rocker').price;
  ok(M.buyOutfit(p, 'jasmin', 'rocker').ok && p.diamonds === 500 - price && p.outfits.worn.jasmin === 'rocker', 'outfit bought and worn with diamonds');
  ok(M.buyOutfit(p, 'jasmin', 'beach').reason === 'locked', 'a story outfit stays locked until the stage is cleared');
}
console.log('drop_the_bass studio: ' + n + ' checks passed');
