// Relic icon art: the painted relic_*.png upload (avarice, ironscrap, midas,
// soulforge, thronebone) is shipped in icons/, wired in RELIC_ICON, and the
// alchemist belt art moved off Midas onto the Alchemist's Belt. Checks the
// files on disk (100x100 RGBA PNGs), the mapping, relicFace() output + emoji
// fallback, and that the relic pick screen, relic bar and a full run-phase
// update()/render() loop with the new relics held never throw.
//
//   node tests/no_room_for_heroes_art_relics.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const ICONS = join(here, '..', 'no_room_for_heroes', 'icons');

const A = loadGame(`freshGame,chooseBoss,makeRoom,prepCampaignWave,startWave,addRelic,
  update,draw,render,updateTop,renderRelicBar,gotoRelicChoice,relicFace,RELICS,RELIC_ICON,
  get relicBarHTML(){ return relicBar.innerHTML; },
  get overlayHTML(){ return overlay.innerHTML; },
  get G(){return G;},set G(v){G=v;}`);
const t = harness('art: relic icons');

// relic key -> icon word the new art ships under (rFlask re-homes the old alchemist belt)
const NEW = { cScrap:'ironscrap', eForge:'soulforge', eThrone:'thronebone', eMidas:'midas', lCrown:'avarice', rFlask:'alchemist' };
const src = w => 'icons/relic_'+w+'.png';

// --- files on disk: 100x100 RGBA PNGs (IHDR: width/height at 16/20, colour type 6 at 25)
for(const w of new Set(Object.values(NEW))){
  const p = join(ICONS, 'relic_'+w+'.png');
  t.ok(existsSync(p), 'icons/relic_'+w+'.png is shipped');
  if(!existsSync(p)) continue;
  const b = readFileSync(p);
  t.ok(b.readUInt32BE(0)===0x89504e47, 'relic_'+w+'.png is a PNG');
  if(w!=='alchemist'){
    t.ok(b.readUInt32BE(16)===100 && b.readUInt32BE(20)===100, 'relic_'+w+'.png kept at native 100x100');
    t.ok(b[25]===6, 'relic_'+w+'.png keeps its alpha channel (RGBA)');
  }
}

// --- the mapping
for(const k in NEW){
  t.ok(!!A.RELICS[k], k+' is a real relic');
  t.ok(A.RELIC_ICON[k]===NEW[k], 'RELIC_ICON.'+k+' -> '+NEW[k]+' (got '+A.RELIC_ICON[k]+')');
}
t.ok(A.RELICS.rFlask.name==="Alchemist's Belt" && A.RELIC_ICON.rFlask==='alchemist' && A.RELIC_ICON.eMidas!=='alchemist',
  'alchemist belt art sits on the Alchemist\'s Belt, not Midas');
t.ok(A.RELIC_ICON.cEmber==='wildfire', 'cEmber left on its existing art (out of scope for this upload)');
const words = Object.values(A.RELIC_ICON);
t.ok(new Set(words).size===words.length, 'no two relics share the same icon art');
let bad = '';
for(const k in A.RELIC_ICON){
  if(!A.RELICS[k]) { bad = k+' is not a relic id'; break; }
  if(!existsSync(join(ICONS, 'relic_'+A.RELIC_ICON[k]+'.png'))) { bad = k+' art missing'; break; }
}
t.ok(!bad, 'every RELIC_ICON entry maps a real relic to shipped art' + (bad ? ': '+bad : ''));

// --- relicFace(): painted <img> for the new keys, null (emoji fallback) for unmapped ones
for(const k in NEW){
  const f = A.relicFace(k);
  t.ok(typeof f==='string' && f.includes('src="'+src(NEW[k])+'"') && f.includes('class="relicimg"'), 'relicFace('+k+') renders '+src(NEW[k]));
}
t.ok(A.relicFace('eMidas', 'x').includes('class="x"'), 'relicFace honours a custom class');
const unmapped = Object.keys(A.RELICS).find(k => !A.RELIC_ICON[k]);
if(unmapped) t.ok(A.relicFace(unmapped)===null, 'an unmapped relic ('+unmapped+') falls back to its emoji');
t.ok(A.relicFace('noSuchRelic')===null, 'an unknown id falls back (null), never a broken img');

let threw = null;
try{
  // --- relic pick screen: own everything EXCEPT the six re-arted relics, so the
  // three offered cards must come from them; the held list renders the rest.
  A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
  A.G.relics = Object.keys(A.RELICS).filter(k => !(k in NEW));
  A.gotoRelicChoice('Test relics', '', () => {});
  const html = A.overlayHTML;
  t.ok(A.G.phase==='relic' && A.G._relicChoices.length===3 && A.G._relicChoices.every(k => k in NEW), 'relic choice offers three of the re-arted relics');
  t.ok(A.G._relicChoices.every(k => html.includes('<div class="big"><img class="relicimg" src="'+src(NEW[k])+'"')), 'each pick card shows the painted icon, not the emoji');
  t.ok(html.includes('Held: ') && html.includes(src('phylactery')), 'held-relics line still renders its icons');

  // --- relic bar during a real run with all six held
  A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
  A.G.slots = 3;
  A.G.rooms = [A.makeRoom('spike', 2), A.makeRoom('skeleton', 2), A.makeRoom('flame', 2)];
  for(const k in NEW) A.addRelic(k);
  A.prepCampaignWave();
  A.startWave();
  t.ok(A.G.phase==='run', 'wave started with the new relics held');
  A.renderRelicBar();
  const bar = A.relicBarHTML;
  t.ok(Object.values(NEW).every(w => bar.includes('<span class="ric"><img class="relicimg" src="'+src(w)+'"')), 'relic bar chips show all six painted icons');
  let frames = 0;
  for(; frames<600; frames++){
    A.update(0.05);
    A.updateTop();
    if(frames%10===0) A.render(); else A.draw();
    if(A.G.phase!=='run') break;
  }
  t.ok(frames>0, 'ran '+frames+' update()/render() frames with the new relic art held');
}catch(e){ threw = e; console.log(e && e.stack); }
t.ok(!threw, 'relic art paths never throw' + (threw ? ': '+threw.message : ''));

t.done();
