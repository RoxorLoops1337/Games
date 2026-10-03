// Art: room card icons + Combo Codex icons. Checks the shipped PNGs
// (icons/<room>.png, icons/codex.png, icons/codex_<key>.png), the icon tables,
// that every DOM surface showing them (hand, forge, Library, Codex, card + room
// tooltips, hero inspect) renders the painted art, that a broken codex icon swaps
// back to its emoji, and that update()/draw() stay clean in a wave built from the
// newly-iconed rooms with heroes carrying every codex status.
//
//   node tests/no_room_for_heroes_art_icons.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const ICONS = join(here, '..', 'no_room_for_heroes', 'icons');

const A = loadGame(`freshGame,chooseBoss,buildCells,prepCampaignWave,startWave,makeRoom,makeUnit,applyRunes,
  update,draw,render,renderPanel,gotoTown,openLibrary,openCodex,describeCard,describeRoom,describeHero,showInspectEntity,
  cardFace,codexFace,codexTag,codexIconFail,codexBookFace,cx,HAS_ICON,CODEX_ICON,ELEM_CX,ELEM_COMBO,REACTIONS,ROOMS,BOSSES,
  get overlayHTML(){ return overlay.innerHTML; }, get panelHTML(){ return panel.innerHTML; }, get inspectHTML(){ return inspectEl.innerHTML; },
  get G(){return G;},set G(v){G=v;}`);
const t = harness('art: room + codex icons');
const BOSS = Object.keys(A.BOSSES)[0];

const NEW_ROOM = ['web', 'horn', 'censer', 'harpy', 'mimic', 'minion'];
const CODEX = ['combust', 'conduct', 'detonate', 'encase', 'fire', 'ice', 'ignite', 'marked', 'oiled',
  'overload', 'phys', 'poisoned', 'shatter', 'shock', 'thermalshock'];

// PNG header: width/height from IHDR, colour type 6 = RGBA (alpha kept)
function pngInfo(p){
  const b = readFileSync(p);
  if(b.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), ct: b[25] };
}
function shipped100(file){
  const p = join(ICONS, file);
  if(!existsSync(p)) return file + ' missing';
  const i = pngInfo(p);
  if(!i) return file + ' is not a PNG';
  if(i.w !== 100 || i.h !== 100) return file + ' is ' + i.w + 'x' + i.h + ', want 100x100';
  if(i.ct !== 6) return file + ' is not RGBA (colour type ' + i.ct + ')';
  return '';
}

// --- 1) the shipped files: 100x100 RGBA under the repo names ---
let bad = NEW_ROOM.map(k => shipped100(k + '.png')).filter(Boolean);
t.ok(!bad.length, 'the six new room card icons ship as 100x100 RGBA' + (bad.length ? ' - ' + bad.join(', ') : ''));
bad = ['codex.png', ...CODEX.map(k => 'codex_' + k + '.png')].map(shipped100).filter(Boolean);
t.ok(!bad.length, 'codex.png + all 15 codex_<key>.png ship as 100x100 RGBA' + (bad.length ? ' - ' + bad.join(', ') : ''));

// --- 2) the tables ---
t.ok(NEW_ROOM.every(k => A.HAS_ICON.has(k)), 'HAS_ICON lists web/horn/censer/harpy/mimic/minion');
bad = [...A.HAS_ICON].filter(k => !A.ROOMS[k] || !existsSync(join(ICONS, k + '.png')));
t.ok(!bad.length, 'every HAS_ICON key is a real room with its icon shipped' + (bad.length ? ' - ' + bad.join(', ') : ''));
t.ok(A.CODEX_ICON.size === CODEX.length && CODEX.every(k => A.CODEX_ICON.has(k)), 'CODEX_ICON holds exactly the 15 codex keys');
bad = [...A.CODEX_ICON].filter(k => !existsSync(join(ICONS, 'codex_' + k + '.png')));
t.ok(!bad.length, 'every CODEX_ICON key has icons/codex_<key>.png shipped' + (bad.length ? ' - ' + bad.join(', ') : ''));
const rKeys = A.REACTIONS.map(r => r.key);
t.ok(A.REACTIONS.length === 8 && rKeys.every(k => A.CODEX_ICON.has(k)) && new Set(rKeys).size === rKeys.length,
  'every REACTIONS row carries a unique key with a codex icon (' + rKeys.join(',') + ')');
t.ok(A.REACTIONS.every(r => r.ic && r.name && r.pay && /icons\/codex_/.test(r.how)), 'every reaction keeps its emoji fallback and its recipe uses codex icons');
t.ok(Object.keys(A.ELEM_COMBO).every(e => A.CODEX_ICON.has(A.ELEM_CX[e])), 'every ELEM_COMBO element maps to a codex icon via ELEM_CX');

// --- 3) helpers + graceful fallback ---
t.ok((A.cardFace('web') || '').includes('src="icons/web.png"') && (A.cardFace('minion') || '').includes('icons/minion.png'), 'cardFace paints the new room cards');
t.ok((A.cardFace('sentinel') || '').includes('icons/sentinel.png') && (A.cardFace('orc') || '').includes('icons/orc.png'), 'Stone Sentinel + Orc cards are painted');
for (const k of ['orc', 'sentinel']) t.ok(!shipped100(k + '.png'), 'icons/' + k + '.png is 100x100 RGBA');
const face = A.codexFace('ignite', 'cxbig', '🔥');
t.ok(face && face.includes('src="icons/codex_ignite.png"') && face.includes('class="cxbig"') && face.includes('data-fb="🔥"')
  && face.includes('onerror="codexIconFail(this)"'), 'codexFace builds a sized <img> that carries its emoji fallback');
t.ok(A.codexFace('nope', 'cxbig', 'X') === null && A.cx('nope', 'X') === 'X' && A.cx(undefined, '⚛️') === '⚛️', 'unknown codex keys fall back to the emoji');
t.ok(A.cx('fire', '🔥').includes('class="cxic"'), 'cx() is the small inline icon');
t.ok(A.codexBookFace('btnbig').includes('src="icons/codex.png"') && A.codexBookFace().includes('class="cxic"'), 'codexBookFace paints the Codex book');
{
  // a missing / corrupt codex PNG swaps the <img> for its emoji text
  const prevCTN = document.createTextNode;
  document.createTextNode = s => ({ nodeType: 3, textContent: s });
  let swapped = null;
  A.codexIconFail({ dataset: { fb: '☠️' }, replaceWith: n => { swapped = n; } });
  t.ok(swapped && swapped.textContent === '☠️', 'codexIconFail replaces a broken icon with its emoji');
  A.codexIconFail({ dataset: {}, replaceWith: n => { swapped = n; } });
  t.ok(swapped && swapped.textContent === '', 'codexIconFail with no fallback leaves nothing behind');
  document.createTextNode = prevCTN;
}

// --- 4) DOM surfaces ---
let threw = '';
try {
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.openLibrary();
  t.ok(A.overlayHTML.includes('icons/codex.png') && A.overlayHTML.includes('class="btnbig"'), 'the Library Codex button shows the book icon');
  A.openCodex();
  const cod = A.overlayHTML;
  t.ok(/<h1><img class="cxic" src="icons\/codex.png"/.test(cod), 'the Codex title shows the book icon');
  bad = rKeys.filter(k => !cod.includes('class="cxbig" src="icons/codex_' + k + '.png"'));
  t.ok(!bad.length, 'every Codex reaction card shows its big icon' + (bad.length ? ' - missing ' + bad.join(', ') : ''));
  bad = ['fire', 'ice', 'shock', 'phys', 'oiled', 'poisoned', 'marked'].filter(k => !cod.includes('class="cxbig" src="icons/codex_' + k + '.png"'));
  t.ok(cod.includes('Elements &amp; statuses') && !bad.length, 'the Codex elements & statuses strip shows every element/status icon' + (bad.length ? ' - missing ' + bad.join(', ') : ''));

  // card + room tooltips: element prefix + recipe icons
  const flame = A.describeCard({ type: 'flame', lvl: 1 });
  t.ok(flame.includes('icons/codex_fire.png') && flame.includes('icons/codex_ignite.png') && flame.includes('icons/codex_poisoned.png'),
    'a Flame Jet tooltip shows the fire element + Ignite/Combust icons');
  t.ok(A.describeCard({ type: 'oil', lvl: 1 }).includes('icons/codex_oiled.png'), 'an Oil Slick tooltip shows the oiled icon');
  t.ok(A.describeCard({ type: 'web', lvl: 1 }).includes('icons/codex_phys.png'), 'a Web Snare tooltip shows the phys icon');
  const tesla = A.describeRoom(A.makeRoom('tesla', 1), true);
  t.ok(tesla.includes('icons/codex_shock.png') && tesla.includes('icons/codex_conduct.png') && tesla.includes('icons/codex_overload.png'),
    'a Tesla room readout shows the shock element + Conduct/Overload icons');
  t.ok(A.describeRoom(A.makeRoom('frost', 1), true).includes('icons/codex_ice.png'), 'a Frost room readout shows the ice icon');

  // hero inspect panel: frozen = encase, chilled = ice, + the new poisoned / marked lines
  const base = { cls: 'warrior', heroName: 'Sir Test', traits: [], hp: 10, maxHp: 10, atk: 3, armor: 2, spd: 46, gold: 5 };
  const plain = A.describeHero({ ...base });
  t.ok(!/codex_/.test(plain), 'a status-free hero shows no status icons');
  const hd = A.describeHero({ ...base, burn: 3, freeze: 1, chill: 2, oil: 4, shock: 1, poison: 2.4, mark: 1, reactCount: 3 });
  t.ok(/codex_fire\.png[^>]*> burning/.test(hd), 'burning uses the fire icon');
  t.ok(/codex_encase\.png[^>]*> frozen/.test(hd), 'frozen uses the encase icon');
  t.ok(/codex_ice\.png[^>]*> chilled/.test(hd), 'chilled uses the ice icon');
  t.ok(/codex_oiled\.png[^>]*> oiled/.test(hd) && /codex_shock\.png[^>]*> shocked/.test(hd), 'oiled + shocked use their icons');
  t.ok(/codex_poisoned\.png[^>]*> poisoned ×3/.test(hd), 'poisoned stacks now show in the inspect panel (rounded up)');
  t.ok(/codex_marked\.png[^>]*> marked/.test(hd), 'a marked hero now shows in the inspect panel');
  t.ok(hd.includes('⚛️ reaction ×3'), 'the reaction count keeps its emoji');

  // hand cards (build panel) paint the new room icons
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots = 2; A.G.rooms = [null, null]; A.G.phase = 'build'; A.buildCells();
  A.G.hand = NEW_ROOM.map(k => k === 'minion' ? { type: 'minion', lvl: 1, minHp: 20, minAtk: 5, label: 'Corrupted Bob' } : { type: k, lvl: 1 });
  A.renderPanel();
  bad = NEW_ROOM.filter(k => !A.panelHTML.includes('src="icons/' + k + '.png"'));
  t.ok(!bad.length, 'hand cards show the six new painted icons' + (bad.length ? ' - missing ' + bad.join(', ') : ''));

  // the town forge sizes the card icon (it used to render at native size)
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.gold = 9999; A.G.hand = [{ type: 'harpy', lvl: 1 }, { type: 'spike', lvl: 1 }];
  A.gotoTown();
  t.ok(/class="forgeic"[^>]*><img class="cardimg" src="icons\/harpy.png"/.test(A.overlayHTML), 'the forge stall shows the Harpy icon inside a sized .forgeic span');
} catch (e) { threw = e.message + '\n' + String(e.stack || '').split('\n').slice(0, 4).join('\n'); }
t.ok(!threw, 'every icon surface renders without throwing' + (threw ? ' - ' + threw : ''));

// --- 5) update()/draw() with the newly-iconed rooms and every codex status live ---
threw = '';
try {
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  const rooms = [A.makeRoom('oil', 2), A.makeRoom('web', 2), A.makeRoom('horn', 2), A.makeRoom('censer', 2),
    A.makeRoom('harpy', 2), A.makeRoom('mimic', 2), A.makeRoom('minion', 2), A.makeRoom('flame', 2)];
  A.G.slots = rooms.length; A.G.rooms = rooms;
  if(typeof A.applyRunes === 'function') A.applyRunes();
  A.prepCampaignWave(); A.startWave();
  t.ok(A.G.phase === 'run' && A.G.heroes.length > 0, 'a wave starts through the new rooms');
  let frames = 0, inspected = 0;
  for(; frames < 900; frames++){
    A.update(0.05); A.draw();
    const h = (A.G.heroes || []).find(x => x && x.state !== 'dead');
    if(h && frames % 30 === 0){
      Object.assign(h, { poison: 2, poisonT: 1, mark: 1, markT: 1, chill: 1, oil: 1 });   // statuses the panel now lists
      A.showInspectEntity({ kind: 'hero', h }); inspected++;
    }
    if(A.G.phase !== 'run') break;
  }
  t.ok(frames > 0 && inspected > 0, 'ran ' + frames + ' frames, inspected a live hero ' + inspected + 'x');
  t.ok(/codex_poisoned\.png/.test(A.inspectHTML) || inspected === 0, 'the live inspect bubble lists the poisoned icon');
  for(let i = 0; i < 10; i++){ A.render(); A.draw(); }
} catch (e) { threw = e.message + '\n' + String(e.stack || '').split('\n').slice(0, 4).join('\n'); }
t.ok(!threw, 'update()/draw()/inspect with the new icons never threw' + (threw ? ' - ' + threw : ''));

t.done();
