// Tutorial Designer preview engine: index.html?tutpreview=1 fast-forwards the REAL guided
// run to any step and freezes that exact scene (so the designer shows what the player sees).
// This drives tutPreviewGoto() to every step headlessly and asserts the dungeon builds up the
// same way the live tutorial does — catching drift if the TUT script is ever re-ordered.
//
//   node tests/no_room_for_heroes_tutpreview.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`tutPreviewGoto,startTutorial,TUT,roomTrapUnits,roomMonUnits,draw,update,
  get G(){return G;},set G(v){G=v;}`);
const t = harness('tutorial preview (designer)');

// --- the early steps are a single EMPTY room (the bug the designer used to misrepresent) ---
A.tutPreviewGoto(3);                 // array index 3 == labelled "Send him in"
t.ok(A.G.slots===1 && A.G.rooms[0]==null && A.G.phase==='build',
  'an early beat previews as ONE empty room in build phase (not pre-filled trap rooms)');

// --- drive the preview to EVERY step: never throws, and the dungeon grows like the real run ---
let err='', maxSlots=1, sawTrap=false, sawTwoTraps=false, sawMix=false, sawSecondRoom=false, reachedLast=false;
for(let i=0;i<A.TUT.length;i++){
  try{ A.tutPreviewGoto(i); }
  catch(e){ err='beat '+i+': '+(e&&e.message||String(e)); break; }
  if(!A.G || !Array.isArray(A.G.rooms)){ err='beat '+i+': no dungeon'; break; }
  const r0=A.G.rooms[0];
  if(r0){ const tr=A.roomTrapUnits(r0).length;
    if(tr>=1) sawTrap=true;
    if(tr>=2) sawTwoTraps=true;
    if(tr>=1 && A.roomMonUnits(r0).length>=1) sawMix=true; }
  if(A.G.slots>maxSlots) maxSlots=A.G.slots;
  if(A.G.slots>=2) sawSecondRoom=true;
  if(i===A.TUT.length-1) reachedLast=true;
}
t.ok(err==='', 'every step previewed without throwing'+(err?(' — '+err):''));
t.ok(sawTrap, 'later beats preview with a trap built into the room');
t.ok(sawTwoTraps, 'a beat previews two traps in one room');
t.ok(sawMix, 'a beat previews a monster guard mixed in with traps');
t.ok(sawSecondRoom, 'a beat previews a second corridor room');
t.ok(reachedLast, 'the final (horde) beat previews without throwing');

// --- re-driving the same step is deterministic (designer re-posts on every edit) ---
A.tutPreviewGoto(3); const a1=A.G.slots, a2=(A.G.rooms[0]==null);
A.tutPreviewGoto(3);
t.ok(A.G.slots===a1 && (A.G.rooms[0]==null)===a2, 'previewing a step twice yields the same scene');

t.done();
