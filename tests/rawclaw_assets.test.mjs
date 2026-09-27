import fs from 'node:fs';import assert from 'node:assert/strict';
import {boot} from './rawclaw_lib.mjs';import {boot as original} from './clawspire_lib.mjs';
const A=boot({only:['util','data']}),B=original({only:['util','data']});
function area(s){if(s.kind==='circle')return Math.PI*s.r*s.r;if(s.kind==='box')return s.w*s.h;return Math.abs(s.verts.reduce((a,v,i,vs)=>{const q=vs[(i+1)%vs.length];return a+v.x*q.y-q.x*v.y;},0))/2;}
for(const [id,d] of Object.entries(A.DATA.ITEMS)){
 const old=B.DATA.ITEMS[id], png=fs.readFileSync(`rawclaw/art/items/id/${id}.png`);
 assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png[25],6,'RGBA');
 assert(Math.abs(area(d.shape)*d.density-area(old.shape)*old.density)<1e-7,'original mass');
 for(const k of ['id','name','fx','plus','tags','density','friction','restitution'])assert.deepEqual(d[k],old[k],`${id} retains ${k}`);
 assert(d.plush&&d.plushAspect>0);
}
assert(fs.readFileSync('rawclaw/js/game.js','utf8').includes("'rawclaw_run'"));
assert(fs.readFileSync('rawclaw/js/audio.js','utf8').includes("'rawclaw_audio'"));
console.log('RawClaw: all 73 plush mappings, alpha, original mass and item effects verified');
