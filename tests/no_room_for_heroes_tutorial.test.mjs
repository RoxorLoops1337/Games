// Scripted tutorial: drives the whole guided run beat-by-beat through its real
// hooks (start wave / abilities / forced drafts / slot buys / trap stacking /
// monster placement / champion + relic / the unbeatable finale) and asserts the
// engine gates input correctly and reaches the end without throwing.
//
//   node tests/no_room_for_heroes_tutorial.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,startTutorial,tutAdvance,tutBtn,tutAllow,tutStepObj,
  startWave,placeCard,upgradeRoomGold,buySlot,takeDraft,pickRelic,heroDies,afterWave,bossDies,
  TUT,roomTrapUnits,roomMonUnits,draw,update,
  get G(){return G;},set G(v){G=v;}`);
const t = harness('tutorial (guided run)');

A.startTutorial();
t.ok(A.G.tutorial===true && A.G.tutStep===0, 'tutorial starts at beat 0');
t.ok(A.G.slots===1 && A.G.rooms.every(r=>r===null) && A.G.hand.length===0, 'fresh dungeon: 1 empty room, no cards');

// --- input is hard-gated to the current beat ---
t.ok(A.tutAllow('start')===false && A.tutAllow('ability')===false, 'intro (cont) blocks wave + abilities');
A.tutAdvance();                                  // → beat 1 (start wave)
t.ok(A.tutAllow('start')===true && A.tutAllow('ability')===false, 'beat 1 allows Start Wave only');

// --- drive the entire script generically by each beat's gate ---
let guard=0, err='', reachedHorde=false, builtTrap=false, stackedTrap=false, twoTraps=false, mixed=false, secondRoom=false;
try{
  while(A.G.tutorial && guard++ < 120){
    const before=A.G.tutStep;
    const st=A.TUT[before]; const g=st.gate;
    A.draw(); A.update(0.05);                       // render-time + sim check (incl. the tutCell ring)
    if(g==='cont' || g==='menu'){ A.tutAdvance(); }
    else if(g==='start'){
      A.startWave();
      if(A.G.tutStep===before){                  // a 'watch' beat → resolve the wave to advance
        (A.G.heroes||[]).forEach(h=>{ if(h.state!=='dead') A.heroDies(h); });
        A.afterWave();
      }
    }
    else if(g==='abil'){
      (A.G.heroes||[]).forEach(h=>{ if(h.state!=='dead') A.heroDies(h); });
      A.afterWave();                              // kill fires 'kill'; afterWave shows the next screen
    }
    else if(g==='pick'){ A.takeDraft(0); }
    else if(g==='place' || g==='trapup'){ A.placeCard(0, st.cell); }
    else if(g==='slotbuy'){ A.upgradeRoomGold(st.cell); }
    else if(g==='buyroom'){ A.buySlot(); }
    else if(g==='relic'){ A.pickRelic(0); }
    else if(st.adv==='never'){ reachedHorde=true; A.bossDies(); A.tutBtn(); A.tutBtn(); }   // finale watch beat
    else { A.tutAdvance(); }
    // probe a few invariants as the dungeon takes shape
    if(A.G.slots>=2) secondRoom=true;
    const r0=A.G.rooms[0];
    if(r0){ if(A.roomTrapUnits(r0).length>=1) builtTrap=true;
            if(A.roomTrapUnits(r0).some(u=>u.lvl>=2)) stackedTrap=true;
            if(A.roomTrapUnits(r0).length>=2) twoTraps=true;
            if(A.roomTrapUnits(r0).length>=1 && A.roomMonUnits(r0).length>=1) mixed=true; }
    if(st.adv!=='never' && A.G.tutStep===before){ err='stuck at beat '+before+' (gate '+g+')'; break; }
  }
}catch(e){ err=(e&&e.message||String(e))+' @beat '+A.G.tutStep; }

t.ok(err==='', 'whole tutorial drove without stalling or throwing'+(err?(' — '+err):''));
t.ok(builtTrap, 'beat 4: a trap was built into the room');
t.ok(stackedTrap, 'beat 7: stacking the same trap raised its level');
t.ok(twoTraps, 'beat 11: a 2nd trap type went in after buying a slot');
t.ok(mixed, 'beat 16: a monster joined the traps in one room');
t.ok(secondRoom, 'a second corridor room was opened (buy + fill)');
t.ok(reachedHorde, 'reached the unbeatable-horde finale');
t.ok(A.G.tutorial===false, 'finale ends the tutorial');
t.ok(guard<120, 'finished in a bounded number of steps ('+guard+')');

// --- replaying after it's done: gating is inert when not in the tutorial ---
t.ok(A.tutAllow('start')===true && A.tutAllow('ability')===true, 'outside the tutorial nothing is gated');

t.done();
