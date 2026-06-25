// Scripted tutorial: drives the whole guided run beat-by-beat through its real
// hooks (start wave / abilities / forced drafts / slot buys / trap stacking /
// monster placement / champion + relic / the unbeatable finale) and asserts the
// engine gates input correctly and reaches the end without throwing.
//
//   node tests/no_room_for_heroes_tutorial.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,startTutorial,tutAdvance,tutBtn,tutAllow,tutStepObj,tutText,
  startWave,placeCard,upgradeRoomGold,buySlot,moveRoom,takeDraft,pickRelic,heroDies,afterWave,bossDies,
  collectAllLoot,autoMergeGear,
  TUT,roomTrapUnits,roomMonUnits,draw,update,
  get G(){return G;},set G(v){G=v;},set TUT_CFG(v){TUT_CFG=v;}`);
const t = harness('tutorial (guided run)');

A.startTutorial();
t.ok(A.G.tutorial===true && A.G.tutStep===0, 'tutorial starts at beat 0');
t.ok(A.G.slots===1 && A.G.rooms.every(r=>r===null) && A.G.hand.length===0, 'fresh dungeon: 1 empty room, no cards');

// --- input is hard-gated to the current beat ---
t.ok(A.tutAllow('start')===false && A.tutAllow('ability')===false, 'intro (cont) blocks wave + abilities');
let gg=0; while(A.TUT[A.G.tutStep] && A.TUT[A.G.tutStep].gate==='cont' && gg++<10) A.tutAdvance();  // skip the intro bubbles
t.ok(A.TUT[A.G.tutStep].gate==='start' && A.tutAllow('start')===true && A.tutAllow('ability')===false, 'first start beat allows Start Wave only');

// --- drive the entire script generically by each beat's gate ---
let guard=0, err='', reachedHorde=false, builtTrap=false, stackedTrap=false, twoTraps=false, mixed=false, secondRoom=false, sawSwap=false, lootCollected=false, gearMerged=false;
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
    else if(g==='swap'){ sawSwap=true; A.moveRoom(0, 1); }
    else if(g==='relic'){ A.pickRelic(0); }
    else if(g==='collect'){ A.collectAllLoot(); if(A.G.tutStep===before) A.tutAdvance(); }   // loot section: sweep the floor
    else if(g==='merge'){ A.autoMergeGear(); if(A.G.tutStep===before) A.tutAdvance(); }       // loot section: fuse the pair
    else if(st.adv==='never'){ reachedHorde=true; A.bossDies(); A.tutBtn(); A.tutBtn(); }   // finale watch beat
    else { A.tutAdvance(); }
    // probe a few invariants as the dungeon takes shape
    if(A.G.slots>=2) secondRoom=true;
    const r0=A.G.rooms[0];
    if(r0){ if(A.roomTrapUnits(r0).length>=1) builtTrap=true;
            if(A.roomTrapUnits(r0).some(u=>u.lvl>=2)) stackedTrap=true;
            if(A.roomTrapUnits(r0).length>=2) twoTraps=true;
            if(A.roomTrapUnits(r0).length>=1 && A.roomMonUnits(r0).length>=1) mixed=true; }
    if((A.G.chest||[]).length>=2) lootCollected=true;                       // gear swept into the War Chest
    if((A.G.chest||[]).some(x=>x.t!=='common')) gearMerged=true;            // two commons fused into a higher tier
    if(st.adv!=='never' && A.G.tutStep===before){ err='stuck at beat '+before+' (gate '+g+')'; break; }
  }
}catch(e){ err=(e&&e.message||String(e))+' @beat '+A.G.tutStep; }

t.ok(err==='', 'whole tutorial drove without stalling or throwing'+(err?(' — '+err):''));
t.ok(builtTrap, 'beat 4: a trap was built into the room');
t.ok(stackedTrap, 'beat 7: stacking the same trap raised its level');
t.ok(twoTraps, 'beat 11: a 2nd trap type went in after buying a slot');
t.ok(mixed, 'beat 16: a monster joined the traps in one room');
t.ok(lootCollected, 'loot section: slain heroes dropped gear that was collected into the War Chest');
t.ok(gearMerged, 'loot section: two common swords merged into a higher tier');
t.ok(secondRoom, 'a second corridor room was opened (buy + fill)');
t.ok(sawSwap, 'the rearrange-rooms beat was taught');
t.ok(reachedHorde, 'reached the unbeatable-horde finale');
t.ok(A.G.tutorial===false, 'finale ends the tutorial');
t.ok(guard<120, 'finished in a bounded number of steps ('+guard+')');

// --- replaying after it's done: gating is inert when not in the tutorial ---
t.ok(A.tutAllow('start')===true && A.tutAllow('ability')===true, 'outside the tutorial nothing is gated');

// --- the "Pick a Trap" Spoils beat is trap-only (spike/flame + a Bone Pit) ---
A.startTutorial();
const ti = A.TUT.findIndex(s => s.pickKind === 'trap');
t.ok(ti >= 0, 'a Spoils of War beat is flagged trap-only (pickKind)');
A.G.tutStep = ti; A.G.phase = 'reward';
A.G.drafts = [{type:'spike',lvl:1},{type:'flame',lvl:1},{type:'skeleton',lvl:1}];
A.G._tutDraft = A.G.drafts.slice();
A.takeDraft(2);   // the Bone Pit (monster) — locked, must be ignored
t.ok(A.G.tutStep === ti && A.G.hand.length === 0, 'picking the monster card does nothing (locked)');
A.takeDraft(0);   // a trap — allowed, advances the beat
t.ok(A.G.hand.length === 1 && A.G._tutTrap === 'spike' && A.G.tutStep === ti + 1, 'picking a trap is allowed and advances');

// --- a downloaded tutorial.json (designed in tutorial.html) overrides the wording ---
A.startTutorial();
A.TUT_CFG = { global:{}, steps:{ '0':{ title:'CUSTOM', body:'CUSTOM BODY' } } };
A.G.tutStep = 0;
t.ok(A.tutText('body') === 'CUSTOM BODY' && A.tutText('title') === 'CUSTOM', 'a tutorial.json step override replaces the wording');
A.G.tutStep = 1;
t.ok(A.tutText('body') === (A.TUT[1].body || ''), 'an un-overridden step keeps its built-in wording');
A.TUT_CFG = null;
t.ok(A.tutText('title') === (A.TUT[A.G.tutStep].title || ''), 'with no config, wording is the built-in default');

t.done();
