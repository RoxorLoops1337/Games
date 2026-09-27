import fs from 'node:fs';import assert from 'node:assert/strict';import {boot} from './rawclaw_lib.mjs';
const {ART}=boot({only:['util','art','data','render']});
for(const [key,timing] of Object.entries(ART.IDLE_CLIPS)){
 const pngs=timing.map((_,i)=>fs.readFileSync(`rawclaw/art/enemies/idle/${key}_${i}.png`));
 const dimensions=pngs.map(b=>[b.readUInt32BE(16),b.readUInt32BE(20)]);
 assert(pngs.every(b=>b[25]===6),'transparent RGBA frames');
 assert(dimensions.every(x=>String(x)===String(dimensions[0])),'stable frame size');
 assert.equal(new Set(pngs.map(b=>b.toString('base64'))).size,6,'six distinct poses');
 const total=timing.reduce((a,b)=>a+b,0);let elapsed=0;
 timing.forEach((d,i)=>{assert.equal(ART.idleFrame(key,elapsed+d/2),i);assert.equal(ART.idleFrame(key,total+elapsed+d/2),i);elapsed+=d;});
 assert.equal(ART.idle(key,1),null,'static fallback until whole clip loaded');
}
const made=[];const prev=globalThis.Image;
try{
 globalThis.Image=class{constructor(){made.push(this);}set src(s){this._src=s;}};
 ART._request(new Set(ART.paths().filter(x=>x.kind==='enemyIdle').map(x=>x.path.slice(4))));
 const rat=made.filter(i=>i._src.includes('/rat_'));
 function ready(img){img.complete=true;img.naturalWidth=256;img.naturalHeight=168;img.onload();}
 rat.slice(0,5).forEach(ready);assert.equal(ART.idle('rat',0),null,'partial load never flickers');ready(rat[5]);
 assert.equal(ART.idle('rat',0),rat[0]);assert.equal(ART.idle('rat',0.9),rat[1]);
 assert.equal(ART.idle('missing',3),null);
}finally{if(prev)globalThis.Image=prev;else delete globalThis.Image;}
console.log('RawClaw idle: 36 aligned frames, timing, loop seam and partial-load fallback passed');
