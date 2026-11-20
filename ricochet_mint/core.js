// Ricochet Mint: game rules and physics. No DOM, so the tests can run it headless.
const W=400,WALL=8,CEIL=8,G=520,BASE_H=540;
// the Den's ceiling hatch up to the Attic, and the Attic's pinball parts
const HOLE_X=200,HOLE_W=96,LANE=W-72,LANE_TOP=190,PAD_LEN=64;
// the room can be taller than the 540 the layouts were drawn for (tall phones); everything is placed relative to the floor
let H=BASE_H,FLOOR=H-18;
function setRoomHeight(h){H=Math.max(BASE_H,Math.round(h));FLOOR=H-18}
const BAL={val:2.1,mintBase:10,mintB:1.22,mintG:1.03,padBase:60,padAddG:3.2,padG:2.4,capBase:150,capG:3.5,itemG:2.3,slotBase:80,slotG:6,room2:4e9,room3:1e12,lifeMile:1000,up:1.24,padUp:1.24};
const TIERS=[
 {n:'Copper',c:'#d98a4a',d:'#7a3e16'},{n:'Silver',c:'#d6dee8',d:'#6d7a8a'},{n:'Gold',c:'#ffd23f',d:'#9a6a00'},
 {n:'Jade',c:'#3ddc84',d:'#11663a'},{n:'Ruby',c:'#ff4766',d:'#7f0f24'},{n:'Sapphire',c:'#4a8dff',d:'#13377f'},
 {n:'Amethyst',c:'#b766ff',d:'#4d1782'},{n:'Sunstone',c:'#ff8a1f',d:'#803a00'},{n:'Aqua',c:'#2ef0f0',d:'#06706f'},
 {n:'Blossom',c:'#ff7ad9',d:'#82206a'},{n:'Obsidian',c:'#8d8db8',d:'#24243d'},{n:'Prism',c:'#ffffff',d:'#444466'}];
const MAXT=TIERS.length-1;
function coinR(t){return 14+t*1.4}
// sizes of the builds (world units); the renderer draws the sprites to match
const SZ={bumper:27,bucket:28,spinner:50,ring:30,launcher:22,small:17,jackpot:28};
function tierVal(t){return Math.pow(BAL.val,t)}
const SUF=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
for(let a=0;a<26;a++)for(let b=0;b<26;b++)SUF.push(String.fromCharCode(97+a)+String.fromCharCode(97+b));
function fmt(n){
  if(!isFinite(n))return '∞';
  if(n<1000)return n<10&&n%1?n.toFixed(1):String(Math.floor(n));
  let i=0;while(n>=1000&&i<SUF.length-1){n/=1000;i++}
  return (n<10?n.toFixed(2):n<100?n.toFixed(1):n.toFixed(0))+SUF[i];
}
const ROOMS=[
 {name:'The Den',short:'Den',icon:'🏠',tier:0,mult:1,maxE:1,
  th:{bg:'#14112e',grid:'rgba(120,110,220,.07)',edge:'#3b3590',pad:'74,141,255'},
  slots:[[200,310],[105,420],[295,420],[60,320],[340,320],[200,440],[120,215],[280,215],[200,165]]},
 {name:'The Attic',short:'Attic',icon:'⬆️',tier:0,mult:12,maxE:2,
  th:{bg:'#24102e',grid:'rgba(255,90,170,.07)',edge:'#7a2d78',pad:'255,59,141'},
  slots:[[166,240],[70,150],[166,100],[262,150],[60,250],[272,250],[110,330],[222,330]]},
 {name:'The Rooftop',short:'Roof',icon:'☁️',tier:4,mult:900,maxE:3,
  th:{bg:'#2a2310',grid:'rgba(255,210,90,.07)',edge:'#8a6d22',pad:'255,207,63'},
  slots:[[200,270],[80,130],[160,110],[240,110],[320,130],[60,250],[340,250],[130,350],[270,350],[80,450],[200,440],[320,450]]}
];
const ITEMS={
 bumper:{i:'🔴',name:'Bumper',cost:20,unlock:0,desc:'Pays every time a coin smacks into it.'},
 bucket:{i:'🪣',name:'Copy Bucket',cost:400,unlock:400,desc:'Sucks in a falling coin and fires it back out with a copy. Upgrade it to copy bigger coins faster. Needs a free wallet spot for the copy.'},
 spinner:{i:'🌀',name:'Spinner',cost:900,unlock:2500,desc:'A spinning bar that whacks coins around and pays on every hit.'},
 zapper:{i:'⚡',name:'Zapper',cost:1500,unlock:-1,desc:'Zaps critters in range all by itself.'},
 ring:{i:'💫',name:'Lucky Ring',cost:6000,unlock:20000,desc:'A coin that flies through pays extra on its next 3 hits.'},
 magnet:{i:'🧲',name:'Magnet',cost:40000,unlock:150000,desc:'Pulls coins in and merges matching coins near it on its own. Merges near it pay a bonus.'},
 launcher:{i:'🚀',name:'Launcher',cost:2500,unlock:8000,desc:'Catches coins and fires them all the way up to the ceiling. Once the Attic is open, that means up through the hatch.'},
 jackpot:{i:'🎰',name:'Jackpot Box',cost:3e6,unlock:2e7,desc:'Every hit spins the reels. Most pay a little, some pay 10x, a lucky few pay 100x.'}
};
const ITEM_ORDER=['bumper','bucket','spinner','zapper','ring','magnet','launcher','jackpot'];
const ENEMIES={
 muncher:{i:'👾',name:'Muncher',hp:30,r:21,col:'#5dff7a',intro:'A Muncher crawled in! When its mouth is open it eats any coin it touches. Bounce coins into it or tap it to pop it for a bounty.'},
 thief:{i:'🦇',name:'Pickpocket',hp:14,r:18,col:'#b766ff',intro:'A Pickpocket! It steals cash every time it brushes a coin. Pop it before it flies off and you get double back.'},
 jammer:{i:'🦠',name:'Jammer',hp:70,r:20,col:'#ff8a1f',intro:'A Jammer! It latches onto one of your builds and switches it off until you pop it.'}
};
const PERKS={
 tap:{i:'👆',name:'Power Tap',desc:'Taps pay 3x more and hit critters twice as hard.',max:5},
 merge:{i:'🔗',name:'Compound Interest',desc:'Every merge pays 4x the new coin value.',max:5},
 floor:{i:'🟦',name:'Spring Floor',desc:'Bounce pads pay +50%.',max:5},
 bump:{i:'🔴',name:'Bumper Love',desc:'Bumpers, spinners and Jackpot Boxes pay +50%.',max:5},
 disc:{i:'🏷️',name:'Bulk Discount',desc:'Everything costs 10% less.',max:5},
 combo:{i:'🔥',name:'Combo King',desc:'Combos build 50% faster.',max:5},
 lucky:{i:'🍀',name:'Lucky Strike',desc:'+3% chance that a hit pays 10x.',max:3},
 pockets:{i:'👛',name:'Deep Pockets',desc:'+2 wallet space in every room.',max:5},
 night:{i:'🌙',name:'Night Shift',desc:'Earn more while the game is closed.',max:3},
 hunter:{i:'🎯',name:'Monster Hunter',desc:'Critters take 50% more damage and pay double bounty.',max:5},
 copy:{i:'🪣',name:'Copy Cat',desc:'Copy Buckets hold coins 15% shorter.',max:3}
};
function itemStat(T,L,room){
  if(T==='bumper')return 'Pays '+fmt(2*Math.pow(BAL.up,L-1))+'x per hit';
  if(T==='bucket')return 'Copies coins up to '+TIERS[bucketMax(room,L)].n+'. '+TIERS[room.def.tier].n+' takes '+bucketTime(room,room.def.tier,L).toFixed(1)+'s, '+Math.round(Math.min(.4,.03*(L-1))*100)+'% chance the copy is one tier up';
  if(T==='spinner')return 'Pays '+fmt(1.5*Math.pow(BAL.up,L-1))+'x per hit, '+(2+.15*L).toFixed(1)+' spin speed';
  if(T==='zapper')return (1+.7*(L-1)).toFixed(1)+' damage every '+(1.5*Math.pow(.92,L-1)).toFixed(2)+'s, range '+(100+10*L);
  if(T==='ring')return 'Next 3 hits pay '+(3+.5*(L-1)).toFixed(1)+'x';
  if(T==='magnet')return 'Pull range '+(90+8*L)+', merges nearby pay '+(3+3*L)+'x bonus';
  if(T==='launcher')return '+'+(2+L)+' combo per launch, pays '+fmt(Math.pow(BAL.up,L-1))+'x';
  if(T==='jackpot')return 'Base '+fmt(2*Math.pow(BAL.up,L-1))+'x, 100x chance '+(1+.4*(L-1)).toFixed(1)+'%, 10x chance '+(8+(L-1)).toFixed(0)+'%';
  return '';
}
// where pads go, in the order you buy them: walls (and the floor in the Den and on the Rooftop)
function padSpots(i){
  if(i===1)return [['L',230],['R',230],['L',350],['R',350],['L',470],['R',470]].map(([sd,d])=>({s:sd,y:FLOOR-d,x:sd==='L'?WALL:LANE-3}));
  return [{s:'F',x:200,w:96},{s:'L',y:FLOOR-90},{s:'R',y:FLOOR-90},{s:'L',y:FLOOR-210},{s:'R',y:FLOOR-210},{s:'L',y:FLOOR-330},{s:'R',y:FLOOR-330},{s:'F',x:80,w:72},{s:'F',x:320,w:72}];
}
function bucketTime(room,t,L){const p=room.g?room.g.pk('copy'):0;return Math.max(1,2.5*Math.pow(1.5,Math.max(0,t-room.def.tier))*Math.pow(.92,L-1)*Math.pow(.85,p))}
function bucketMax(room,L){return Math.min(MAXT,room.def.tier+2+Math.floor((L-1)/2))}
function ghostLife(L){return 12+1.5*(L-1)}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

class Room{
  constructor(g,i){
    this.g=g;this.i=i;this.def=ROOMS[i];this.open=false;this.coins=[];this.enemies=[];this.parts=[];this.floats=[];this.bolts=[];this.beams=[];
    this.mintN=0;this.padLv=0;this.capLv=0;this.kills=0;this.enemyT=25;this.padPulse=0;this.time=0;this.rescueT=0;
    const sl=this.def.slots.slice(1).sort((p,q)=>q[1]-p[1]);sl.unshift(this.def.slots[0]);
    const off=H-BASE_H;this.slots=sl.map(([x,y],k)=>({x,y:y+off,k,open:false,item:null}));
    this.padN=1;this.padObjs=padSpots(i).map(o=>Object.assign({pulse:0},o));this.plungeK=0;this.queue=[];
    if(i===1){const pc=(WALL+LANE-3)/2,py=FLOOR-64;
      this.flip=[{px:pc-82,py,len:66,rest:.5,up:-.4,ang:.5,w:0,state:0,hold:0,cd:0,dir:1},{px:pc+82,py,len:66,rest:Math.PI-.5,up:Math.PI+.4,ang:Math.PI-.5,w:0,state:0,hold:0,cd:0,dir:-1}]}
  }
  pads(){return this.padObjs.slice(0,this.padN)}
  base(){return this.i===1?this.g.rooms[0]:this}
  pool(){return this.i<=1?[this.g.rooms[0],this.g.rooms[1]].filter(r=>r.open):[this]}
  padFull(){return this.padN>=this.padObjs.length}
  get rng(){return this.g.rng}
  unit(){return this.def.mult*tierVal(this.def.tier)}
  cap(){return 6+2*this.base().capLv+2*this.g.pk('pockets')}
  padMult(){return Math.pow(BAL.padUp,this.padLv)*(1+.5*this.g.pk('floor'))}
  padLaunch(){return Math.min(560+18*this.padLv,760)}
  cost(k){if(this.i===1&&(k==='mint'||k==='cap'))return this.g.rooms[0].cost(k);const u=this.unit()*this.g.disc();
    if(k==='mint')return BAL.mintBase*u*Math.pow(BAL.mintB,this.real())*Math.pow(BAL.mintG,this.base().mintN);
    if(k==='pad')return this.padFull()?BAL.padBase*u*4*Math.pow(BAL.padG,this.padLv):BAL.padBase*u*Math.pow(BAL.padAddG,this.padN-1);
    if(k==='cap')return BAL.capBase*u*Math.pow(BAL.capG,this.capLv);}
  slotCost(){const n=this.slots.filter(s=>s.open).length;return BAL.slotBase*this.unit()*this.g.disc()*Math.pow(BAL.slotG,Math.max(0,n-1))}
  buildCost(T){return ITEMS[T].cost*this.unit()*this.g.disc()}
  upCost(it){return ITEMS[it.type].cost*this.unit()*this.g.disc()*Math.pow(BAL.itemG,it.lv)}
  init(){
    this.open=true;this.slots[0].open=true;
    if(this.i===0){this.slots[0].item=this.mkItem('bumper');this.slots[0].item.spent=0}
    if(this.i!==1){this.addCoin(this.def.tier,140,60);if(this.i>0)this.addCoin(this.def.tier,260,60)}
  }
  mkItem(T){return {type:T,lv:1,spent:this.buildCost(T),ang:0,pulse:0,cd:0,hold:null,holdT:0,holdMax:1,jam:false,reels:[0,1,2],win:0}}
  addCoin(t,x,y,vx,vy){
    const c={x,y,vx:vx!=null?vx:(this.rng()-.5)*80,vy:vy||0,t,r:coinR(t),age:0,combo:0,charge:0,chargeM:3,ringCd:0,bucketCd:0,launchCd:0,ehit:0,flash:0};
    this.coins.push(c);this.g.discover(t);return c;
  }
  value(c){return tierVal(c.t)*this.def.mult}
  earn(a,x,y,col,big){this.g.earn(a);if(this.floats.length<(big?80:60))this.floats.push({x,y,txt:'+'+fmt(a),life:1,col,big:!!big})}
  float(x,y,txt,col){if(this.floats.length<40)this.floats.push({x,y,txt,life:1.4,col,big:true})}
  pay(c,base,x,y){
    let a=this.value(c)*base*(1+c.combo*this.g.comboStep())*(this.g.frenzy>0?3:1);c.sq=1;
    if(c.combo>=10&&c.combo%10===0&&c.cpop!==c.combo){c.cpop=c.combo;this.float(c.x,c.y-34,'COMBO '+c.combo+'!','#ff8fa3');this.g.sfx('combo',c.combo)}
    if(c.charge>0){a*=c.chargeM;c.charge--}
    let lucky=false;const L=this.g.pk('lucky');
    if(L&&this.rng()<.03*L){a*=10;lucky=true;this.burst(x,y,'#7dff7a',10)}
    this.earn(a,x,y,lucky?'#7dff7a':c.charge>0?'#ffe14d':'#ffffff',lucky);
  }
  burst(x,y,col,n){if(this.g.headless)return;for(let i=0;i<n&&this.parts.length<300;i++){const a=this.rng()*6.283,s=60+this.rng()*240;this.parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.5+this.rng()*.4,col,sz:2+this.rng()*2.5})}}
  units(){let u=0;const t0=this.base().def.tier;for(const r of this.pool()){for(const q of r.queue)u+=Math.pow(2,q.t-t0);for(const c of r.coins)if(!c.ghost)u+=Math.pow(2,c.t-t0);for(const s of r.slots)if(s.item&&s.item.hold)u+=Math.pow(2,s.item.hold.t-t0)}return u}
  real(){let n=0;for(const r of this.pool()){n+=r.queue.length;for(const c of r.coins)if(!c.ghost)n++}return n}
  canMint(){return this.real()<this.cap()&&this.g.cash>=this.cost('mint')}
  mint(x){
    if(this.i===1)return this.g.rooms[0].mint(x);
    if(this.real()>=this.cap())return 'full';
    const c=this.cost('mint');if(this.g.cash<c)return 'cash';
    this.g.cash-=c;this.mintN++;
    const px=x==null?40+this.rng()*320:Math.max(WALL+16,Math.min(W-WALL-16,x));
    this.addCoin(this.def.tier,px,30);this.g.sfx('mint',this.def.tier);return 'ok';
  }
  buy(k){if(this.i===1&&k==='cap')return this.g.rooms[0].buy(k);const c=this.cost(k);if(this.g.cash<c)return false;this.g.cash-=c;if(k==='pad'){if(this.padFull())this.padLv++;else{this.padN++;this.padObjs[this.padN-1].pulse=1}}else this.capLv++;this.g.sfx('buy');return true}
  unlockSlot(s){const c=this.slotCost();if(s.open||this.g.cash<c)return false;this.g.cash-=c;s.open=true;this.burst(s.x,s.y,'#ffcf3f',16);this.g.sfx('buy');return true}
  build(s,T){if(!s.open||s.item||!this.g.itemUnlocked(T))return false;const c=this.buildCost(T);if(this.g.cash<c)return false;this.g.cash-=c;s.item=this.mkItem(T);s.item.pulse=1;this.burst(s.x,s.y,'#22e6e6',18);this.g.sfx('build');return true}
  upgrade(s){const it=s.item;if(!it||it.lv>=25)return false;const c=this.upCost(it);if(this.g.cash<c)return false;this.g.cash-=c;it.spent+=c;it.lv++;it.pulse=1;this.burst(s.x,s.y,'#ffcf3f',14);this.g.sfx('buy');return true}
  sell(s){const it=s.item;if(!it)return 0;const r=it.spent*.5;this.g.cash+=r;
    if(it.hold){this.addCoin(it.hold.t,s.x,s.y-30,0,-500)}
    for(const e of this.enemies)if(e.target===s){e.target=null;e.stuck=false}
    s.item=null;this.g.sfx('buy');return r}
  // physics helpers
  solid(c,x,y,R,vx,vy,minOut){
    const dx=c.x-x,dy=c.y-y,rr=c.r+R,d2=dx*dx+dy*dy;if(d2>=rr*rr)return false;
    const d=Math.sqrt(d2)||.01,nx=dx/d,ny=dy/d;c.x=x+nx*rr;c.y=y+ny*rr;
    let rvx=c.vx-vx,rvy=c.vy-vy;const vn=rvx*nx+rvy*ny;if(vn>=0)return false;
    rvx-=2*vn*nx;rvy-=2*vn*ny;const out=rvx*nx+rvy*ny;if(out<minOut){rvx+=nx*(minOut-out);rvy+=ny*(minOut-out)}
    c.vx=rvx+vx;c.vy=rvy+vy;return true;
  }
  hitItem(c,s,it){
    const T=it.type,g=this.g,L=it.lv;
    if(T==='spinner'){
      const len=SZ.spinner,ex=Math.cos(it.ang)*len,ey=Math.sin(it.ang)*len,ax=s.x-ex,ay=s.y-ey,abx=2*ex,aby=2*ey;
      let t=((c.x-ax)*abx+(c.y-ay)*aby)/(abx*abx+aby*aby);t=Math.max(0,Math.min(1,t));
      const px=ax+abx*t,py=ay+aby*t;let dx=c.x-px,dy=c.y-py,d=Math.hypot(dx,dy);const rr=c.r+6;
      if(d<rr){if(d<.01){dx=-aby;dy=abx;d=Math.hypot(dx,dy)}const nx=dx/d,ny=dy/d;c.x=px+nx*rr;c.y=py+ny*rr;
        const w=it.jam?0:it.w,svx=-w*(py-s.y),svy=w*(px-s.x);
        let rvx=c.vx-svx,rvy=c.vy-svy;const vn=rvx*nx+rvy*ny;
        if(vn<0){rvx-=2*vn*nx;rvy-=2*vn*ny;const o=rvx*nx+rvy*ny;if(o<240){rvx+=nx*(240-o);rvy+=ny*(240-o)}c.vx=rvx+svx;c.vy=rvy+svy;
          if(!it.jam){c.combo=Math.min(c.combo+1,50);this.pay(c,1.5*Math.pow(BAL.up,L-1)*g.bumpMult(),c.x,c.y);it.pulse=1;this.burst(c.x,c.y,'#22e6e6',3);g.sfx('spin',c.t)}}}
      return;
    }
    if(T==='ring'){if(!it.jam&&c.ringCd<=0&&Math.hypot(c.x-s.x,c.y-s.y)<SZ.ring){c.charge=3;c.chargeM=3+.5*(L-1);c.ringCd=1.2;it.pulse=1;this.burst(s.x,s.y,'#ffcf3f',10);g.sfx('ring',c.t);this.float(s.x,s.y-26,'x'+c.chargeM.toFixed(1).replace('.0',''),'#ffcf3f')}return}
    if(T==='launcher'){if(!it.jam&&c.launchCd<=0&&Math.hypot(c.x-s.x,c.y-s.y)<SZ.launcher){c.x=s.x;c.y=s.y-c.r-6;c.vx=(this.rng()<.5?-1:1)*(60+this.rng()*70);c.vy=-Math.sqrt(2*G*Math.max(120,s.y-CEIL))*1.1;c.launchCd=2.5;c.combo=Math.min(c.combo+2+L,50);
        this.pay(c,Math.pow(BAL.up,L-1),s.x,s.y);it.pulse=1;this.burst(s.x,s.y,'#7dff7a',12);g.sfx('launch',c.t)}return}
    if(T==='bucket'){
      if(!it.jam&&!it.hold&&!c.ghost&&c.t<=bucketMax(this,L)&&c.bucketCd<=0&&c.y<s.y+4&&Math.abs(c.x-s.x)<SZ.bucket&&Math.hypot(c.x-s.x,c.y-s.y)<c.r+SZ.bucket){
        it.hold={t:c.t,combo:c.combo};it.holdMax=it.holdT=bucketTime(this,c.t,L);c.dead=true;it.pulse=1;g.sfx('catch',c.t);return}
      this.solid(c,s.x,s.y,SZ.bucket-2,0,0,200);return;
    }
    const big=T==='bumper'||T==='jackpot',R=T==='bumper'?SZ.bumper:T==='jackpot'?SZ.jackpot:SZ.small;
    if(this.solid(c,s.x,s.y,R,0,0,big?300:220)&&!it.jam){
      if(T==='bumper'){c.combo=Math.min(c.combo+1,50);this.pay(c,2*Math.pow(BAL.up,L-1)*g.bumpMult(),c.x,c.y);it.pulse=1;this.burst(c.x,c.y,'#ff3b8d',4);g.sfx('bump',c.t)}
      if(T==='jackpot'){c.combo=Math.min(c.combo+1,50);
        if(it.cd<=0){it.cd=.35;const r=this.rng();let m=1;
          if(r<.01+.004*(L-1))m=100;else if(r<.09+.01*(L-1)+.004*(L-1))m=10;else if(r<.4)m=3;
          it.reels=m===100?[0,0,0]:m===10?[1,1,1]:m===3?[2,2,Math.floor(this.rng()*3)]:[Math.floor(this.rng()*3),Math.floor(this.rng()*3),(Math.floor(this.rng()*2)+1)%3===0?1:2];
          if(m===1&&it.reels[0]===it.reels[1]&&it.reels[1]===it.reels[2])it.reels[2]=(it.reels[2]+1)%3;
          it.win=m>1?1:0;this.pay(c,2*m*Math.pow(BAL.up,L-1)*g.bumpMult(),c.x,c.y-10);it.pulse=1;
          if(m>=10){this.float(s.x,s.y-34,m+'x!','#ffcf3f');this.burst(s.x,s.y,'#ffcf3f',m===100?50:20);g.sfx(m===100?'jackpot':'merge',5)}else g.sfx('slot',0)}}
    }
  }
  release(s){
    const it=s.item,t=it.hold.t;it.hold=null;it.pulse=1;
    const a=this.addCoin(t,s.x,s.y-30,-60-this.rng()*60,-520);a.bucketCd=1.4;a.combo=0;
    if(this.real()<this.cap()){
      const up=this.rng()<Math.min(.4,.03*(it.lv-1))&&t<MAXT;
      const b=this.addCoin(up?t+1:t,s.x,s.y-30,60+this.rng()*60,-520);b.bucketCd=1.4;b.flash=1;
      this.float(s.x,s.y-40,up?'UPGRADED COPY!':'COPY!','#22e6e6');
    }else this.float(s.x,s.y-40,'WALLET FULL','#ff4766');
    this.burst(s.x,s.y-20,'#22e6e6',12);this.g.sfx('release',t);
  }
  damage(e,d){
    e.hp-=d*(1+.5*this.g.pk('hunter'));e.flash=1;
    if(e.hp<=0&&!e.dead){e.dead=true;this.kills++;this.g.kills++;
      const bounty=120*this.unit()*Math.pow(1.15,Math.min(this.kills,40))*(e.type==='jammer'?1.5:1)*(1+this.g.pk('hunter'));
      this.earn(bounty+e.loot*2,e.x,e.y,'#ffcf3f',true);this.float(e.x,e.y-26,'POP!','#7dff7a');
      if(e.target&&e.target.item)e.target.item.jam=false;
      this.burst(e.x,e.y,ENEMIES[e.type].col,40);this.g.sfx('pop',0);}
  }
  tapAt(x,y){
    for(const e of this.enemies){if(Math.hypot(e.x-x,e.y-y)<e.r+16){this.damage(e,3*(this.def.tier+1)*(1+this.g.pk('tap')));this.burst(x,y,'#ffffff',6);this.g.sfx('kick',0);return 'enemy'}}
    let best=null,bd=1e9;for(const c of this.coins){const d=Math.hypot(c.x-x,c.y-y);if(d<c.r+8&&d<bd){bd=d;best=c}}
    if(best){best.vy=-600-this.rng()*120;best.vx+=(this.rng()-.5)*170;best.combo++;best.flash=1;
      this.pay(best,3*(1+2*this.g.pk('tap')),best.x,best.y);this.burst(best.x,best.y,'#22e6e6',8);this.g.sfx('kick',best.t);return 'coin'}
    return null;
  }
  biteMax(){return Math.min(this.def.tier+4,this.def.tier+1+Math.floor(this.kills/10))}
  slotAt(x,y){let b=null,bd=48;for(const s of this.slots){const d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;b=s}}return b}
  spawnEnemy(){
    const pool=['muncher'];if(this.g.kills>=2||this.i>0)pool.push('thief');if(this.g.kills>=6||this.i>0)pool.push('jammer');
    let type=pool[Math.floor(this.rng()*pool.length)];
    const built=this.slots.filter(s=>s.item&&!s.item.jam&&!this.enemies.some(e=>e.target===s));
    if(type==='jammer'&&!built.length)type='muncher';
    const d=ENEMIES[type],hp=d.hp*(this.def.tier+1)*(1+.18*this.kills);
    const e={type,x:60+this.rng()*280,y:-20,vx:(this.rng()<.5?-1:1)*(type==='thief'?110:40),vy:60,r:d.r,hp,max:hp,bite:3,steal:0,loot:0,life:0,flash:0,target:null,stuck:false,ph:this.rng()*6};
    if(type==='jammer')e.target=built[Math.floor(this.rng()*built.length)];
    this.enemies.push(e);this.g.meetEnemy(type,this);this.g.sfx('spawn',0);
  }
  stepEnemies(dt){
    const g=this.g;
    if(g.enemiesOn&&this.enemies.length<this.def.maxE){this.enemyT-=dt;if(this.enemyT<=0){this.spawnEnemy();this.enemyT=Math.max(35,(80+this.rng()*60)*Math.pow(.97,this.kills))}}
    for(const e of this.enemies){
      e.life+=dt;e.flash=Math.max(0,e.flash-dt*4);if(e.bite>0)e.bite-=dt;if(e.steal>0)e.steal-=dt;
      if(e.leaving){}
      else if(e.type==='jammer'){
        if(!e.target||!e.target.item){e.target=null;e.stuck=false;const b=this.slots.filter(s=>s.item&&!s.item.jam);if(b.length)e.target=b[Math.floor(this.rng()*b.length)]}
        if(e.target&&!e.stuck){const dx=e.target.x-e.x,dy=e.target.y-e.y,d=Math.hypot(dx,dy);if(d<4){e.stuck=true;e.target.item.jam=true;g.sfx('jam',0);this.float(e.x,e.y-30,'JAMMED!','#ff8a1f')}else{const sp=70;e.vx=dx/d*sp;e.vy=dy/d*sp}}
        if(e.stuck){e.vx=0;e.vy=0;e.x=e.target.x;e.y=e.target.y}
        else if(!e.target){e.vx=e.vx||40;e.vy=e.vy||30}
      }else if(e.type==='thief'){
        if(e.life>45){e.vy=-160;e.vx*=.98}else{e.vy=Math.sin(e.life*2.2+e.ph)*90;if(e.y<Math.max(60,FLOOR-470))e.vy+=80}
      }else{
        if(this.rng()<dt*.4){const a=this.rng()*6.283;e.vx=Math.cos(a)*40;e.vy=Math.sin(a)*40}
        if(e.y<Math.max(50,FLOOR-480)&&e.vy<0)e.vy=Math.abs(e.vy);
      }
      if(e.type!=='thief'&&e.life>120&&!e.leaving){e.leaving=true;if(e.stuck&&e.target&&e.target.item)e.target.item.jam=false;e.stuck=false;e.target=null;this.float(e.x,e.y-26,'bye!','#9a93c9')}
      if(e.leaving){e.vx*=.95;e.vy=-140;if(e.y<-40){e.dead=true;e.gone=true}}
      e.x+=e.vx*dt;e.y+=e.vy*dt;
      if(!e.stuck&&!e.leaving){
        if(e.x<WALL+e.r){e.x=WALL+e.r;e.vx=Math.abs(e.vx)}const xr=(this.i===1?LANE-3:W-WALL)-e.r;if(e.x>xr){e.x=xr;e.vx=-Math.abs(e.vx)}
        const yb=FLOOR-(this.i===1?190:90);if(e.y>yb){e.y=yb;e.vy=-Math.abs(e.vy)}
        if(e.type==='thief'&&e.life>45&&e.y<-30){e.dead=true;e.gone=true;if(e.loot>0)g.toast('The Pickpocket got away with '+fmt(e.loot)+'!')}
      }
    }
  }
  step(dt){
    const g=this.g;this.time+=dt;this.padPulse=Math.max(0,this.padPulse-dt*4);
    for(const s of this.slots){const it=s.item;if(!it)continue;
      it.pulse=Math.max(0,it.pulse-dt*5);if(it.cd>0)it.cd-=dt;if(it.win>0)it.win-=dt;
      if(it.type==='spinner'){it.w=(2+.15*it.lv)*(s.k%2?-1:1);if(!it.jam)it.ang+=it.w*dt}
      if(it.type==='bucket'&&it.hold&&!it.jam){it.holdT-=dt;if(it.holdT<=0)this.release(s)}
      if(it.type==='zapper'&&!it.jam&&it.cd<=0&&this.enemies.length){
        const R=100+10*it.lv;let tgt=null,bd=R;for(const e of this.enemies){if(e.leaving)continue;const d=Math.hypot(e.x-s.x,e.y-s.y);if(d<bd){bd=d;tgt=e}}
        if(tgt){it.cd=1.5*Math.pow(.92,it.lv-1);this.damage(tgt,(1+.7*(it.lv-1))*(this.def.tier+1));it.pulse=1;
          if(!g.headless)this.bolts.push({x1:s.x,y1:s.y-22,x2:tgt.x,y2:tgt.y,life:.18});g.sfx('zap',0)}
      }
    }
    for(const p of this.padObjs)p.pulse=Math.max(0,p.pulse-dt*4);
    if(this.flip){this.stepFlippers(dt);this.feedPlunger()}
    this.stepEnemies(dt);
    const cs=this.coins,mags=this.slots.filter(s=>s.item&&s.item.type==='magnet'&&!s.item.jam),buckets=this.slots.filter(s=>s.item&&s.item.type==='bucket'&&!s.item.jam&&!s.item.hold);
    for(const c of cs){
      if(c.dead)continue;
      if(c.ghost){c.ghost-=dt;if(c.ghost<=0){c.dead=true;this.burst(c.x,c.y,'#22e6e6',6);continue}}
      c.age+=dt;if(c.ringCd>0)c.ringCd-=dt;if(c.bucketCd>0)c.bucketCd-=dt;if(c.launchCd>0)c.launchCd-=dt;if(c.ehit>0)c.ehit-=dt;
      c.vy+=G*dt;
      for(const b of buckets){const dx=b.x-c.x,dy=b.y-c.y;if(c.vy>0&&dy>0&&dy<150&&Math.abs(dx)<90&&c.bucketCd<=0&&c.t<=bucketMax(this,b.item.lv))c.vx+=dx*5*dt*(1-dy/150)+(dx*.5-c.vx)*1.5*dt}
      for(const m of mags){const R=90+8*m.item.lv,dx=m.x-c.x,dy=m.y-c.y,d=Math.hypot(dx,dy);if(d<R&&d>20){const p=480*(1-d/R);c.vx+=dx/d*p*dt;c.vy+=dy/d*p*dt}}
      const sp=Math.hypot(c.vx,c.vy);if(sp>1150){c.vx*=1150/sp;c.vy*=1150/sp}
      c.x+=c.vx*dt;c.y+=c.vy*dt;
      for(const e of this.enemies){if(e.dead||e.leaving)continue;
        const er=e.stuck?e.r+12:e.r,dx=c.x-e.x,dy=c.y-e.y;if(dx*dx+dy*dy>=(c.r+er)*(c.r+er))continue;
        if(e.type==='muncher'&&e.bite<=0&&c.t<=this.biteMax()){
          c.dead=true;e.bite=9;e.hp=Math.min(e.max,e.hp+e.max*.25);e.r=Math.min(34,e.r+1.5);this.float(e.x,e.y-28,'CHOMP!','#5dff7a');g.sfx('chomp',0);break}
        if(e.type==='thief'&&e.steal<=0&&e.life<45){const st=Math.min(g.cash,this.value(c)*25);if(st>0){g.cash-=st;e.loot+=st;this.float(e.x,e.y-24,'-'+fmt(st),'#ff4766');g.sfx('steal',0)}e.steal=2.5}
        if(this.solid(c,e.x,e.y,e.stuck?e.r+12:e.r,e.vx,e.vy,210)&&c.ehit<=0){c.ehit=.2;this.damage(e,c.t-this.def.tier+1);this.burst(c.x,c.y,ENEMIES[e.type].col,4)}
      }
      if(c.dead)continue;
      for(const s of this.slots){if(s.item){this.hitItem(c,s,s.item);if(c.dead)break}}
      if(c.dead)continue;
      if(this.i===1){this.atticPhysics(c,dt);if(c.dead||c.plunge>0)continue}
      const pads=this.pads();
      if(c.x-c.r<WALL){c.x=WALL+c.r;this.wallHit(c,'L',pads)}
      if(c.x+c.r>W-WALL){c.x=W-WALL-c.r;if(this.i===1)c.vx=-Math.abs(c.vx)*.9;else this.wallHit(c,'R',pads)}
      if(c.y-c.r<CEIL){
        if(this.i===0&&g.rooms[1].open&&c.vy<0&&Math.abs(c.x-HOLE_X)<HOLE_W/2-c.r*.3){c.dead=true;g.rooms[1].receive(c);continue}
        c.y=CEIL+c.r;c.vy=Math.abs(c.vy)*.8}
      if(this.i!==1&&c.y+c.r>FLOOR){c.y=FLOOR-c.r;
        if(c.vy>=0){if(c.combo>g.bestCombo)g.bestCombo=c.combo;
          const pd=pads.find(p=>p.s==='F'&&Math.abs(c.x-p.x)<p.w/2+c.r*.3);
          if(pd){c.vy=-Math.max(Math.abs(c.vy)*.8,this.padLaunch()*(.9+this.rng()*.2));this.pay(c,2*this.padMult(),c.x,FLOOR-8);pd.pulse=1;this.padPulse=1;g.sfx('pad',c.t)}
          else{c.vy=-Math.max(Math.abs(c.vy)*.72,300+this.rng()*60);g.sfx('thud',c.t)}
          c.vx+=(this.rng()-.5)*60;c.combo=0}}
      if(!isFinite(c.x+c.y+c.vx+c.vy)){c.x=W/2;c.y=60;c.vx=0;c.vy=0}
    }
    for(let i=0;i<cs.length;i++){const a=cs[i];if(a.dead)continue;
      for(let j=i+1;j<cs.length;j++){const b=cs[j];if(b.dead)continue;
        const dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r,d2=dx*dx+dy*dy;if(d2>=rr*rr)continue;
        if(a.t===b.t&&a.age>.35&&b.age>.35&&!a.ghost&&!b.ghost&&mags.some(m=>Math.hypot(m.x-(a.x+b.x)/2,m.y-(a.y+b.y)/2)<90+8*m.item.lv)){this.merge(a,b,mags);break}
        const d=Math.sqrt(d2)||.01,nx=dx/d,ny=dy/d,ov=rr-d,ma=a.r*a.r,mb=b.r*b.r,tot=ma+mb;
        a.x-=nx*ov*mb/tot;a.y-=ny*ov*mb/tot;b.x+=nx*ov*ma/tot;b.y+=ny*ov*ma/tot;
        const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
        if(rv<0){const j2=-1.9*rv/(1/ma+1/mb);a.vx-=j2*nx/ma;a.vy-=j2*ny/ma;b.vx+=j2*nx/mb;b.vy+=j2*ny/mb}
      }}
    if(cs.some(c=>c.dead))this.coins=cs.filter(c=>!c.dead);
    if(this.enemies.some(e=>e.dead))this.enemies=this.enemies.filter(e=>!e.dead);
    if(this.i!==1&&!this.pool().some(r=>r.coins.length||r.queue.length||r.slots.some(s=>s.item&&s.item.hold))&&g.cash<this.cost('mint')){this.rescueT+=dt;if(this.rescueT>3){this.rescueT=0;this.addCoin(this.def.tier,200,40);g.toast('Here, a free coin to keep you going.')}}else this.rescueT=0;
  }
  wallHit(c,side,pads){
    const pd=pads.find(p=>p.s===side&&Math.abs(c.y-p.y)<PAD_LEN/2+c.r*.3);
    const out=side==='L'?1:-1;
    if(pd&&c.vx*out<0){c.vx=out*Math.max(Math.abs(c.vx)*1.05,260);c.vy-=80;c.combo=Math.min(c.combo+1,50);this.pay(c,3*this.padMult(),c.x,c.y);pd.pulse=1;this.g.sfx('pad',c.t)}
    else c.vx=out*Math.abs(c.vx)*.9;
  }
  seg(c,ax,ay,bx,by,th,velf,minOut){
    const abx=bx-ax,aby=by-ay;let t=((c.x-ax)*abx+(c.y-ay)*aby)/(abx*abx+aby*aby);t=Math.max(0,Math.min(1,t));
    const px=ax+abx*t,py=ay+aby*t;let dx=c.x-px,dy=c.y-py,d=Math.hypot(dx,dy);const rr=c.r+th;if(d>=rr)return false;
    if(d<.01){dx=-aby;dy=abx;d=Math.hypot(dx,dy)}const nx=dx/d,ny=dy/d;c.x=px+nx*rr;c.y=py+ny*rr;
    const v=velf?velf(px,py):[0,0];let rvx=c.vx-v[0],rvy=c.vy-v[1];const vn=rvx*nx+rvy*ny;if(vn>=0)return false;
    rvx-=1.75*vn*nx;rvy-=1.75*vn*ny;const o=rvx*nx+rvy*ny;if(minOut&&o<minOut){rvx+=nx*(minOut-o);rvy+=ny*(minOut-o)}
    c.vx=rvx+v[0];c.vy=rvy+v[1];return true;
  }
  // a coin coming up through the Den's hatch drops into the Attic's shooter lane
  receive(c){this.queue.push({t:c.t,combo:c.combo});this.g.sfx('catch',c.t)}
  feedPlunger(){if(!this.queue.length||this.coins.some(c=>c.plunge>0||(c.x>LANE&&c.y>FLOOR-160)))return;const q=this.queue.shift();const n=this.addCoin(q.t,W-36,FLOOR-coinR(q.t)-4,0,0);n.plunge=.5+this.rng()*.4;n.combo=q.combo}
  // a coin that drains past the Attic's flippers falls back into the Den
  dropIn(c){const n=this.addCoin(c.t,HOLE_X+(this.rng()-.5)*40,CEIL+coinR(c.t)+6,(this.rng()-.5)*80,80);n.combo=0}
  stepFlippers(dt){
    for(const f of this.flip){
      const ex=f.px+Math.cos(f.rest)*f.len,ey=f.py+Math.sin(f.rest)*f.len;
      const trig=this.coins.some(c=>{if(c.plunge>0||c.x>LANE||c.vy<-60)return false;const abx=ex-f.px,aby=ey-f.py;let t=((c.x-f.px)*abx+(c.y-f.py)*aby)/(abx*abx+aby*aby);if(t<.3||t>1.05)return false;t=Math.min(1,t);return Math.hypot(c.x-(f.px+abx*t),c.y-(f.py+aby*t))<c.r+14});
      if(f.cd>0)f.cd-=dt;
      if(f.state===0&&trig&&f.cd<=0){if(this.rng()<.2){f.state=2;f.hold=0}else{f.state=1;this.g.sfx('flip',0)}}
      // state 2: the flipper misses and sags, opening the gap so any coin can drop back to the Den
      if(f.state===2){f.hold+=dt;if(f.hold>.8){f.state=0;f.hold=0;f.cd=.3}}
      const target=f.state===1?f.up:f.state===2?f.rest+.5*f.dir:f.rest,spd=f.state===1?20:9,da=target-f.ang,st=Math.sign(da)*Math.min(Math.abs(da),spd*dt);
      f.w=st/dt;f.ang+=st;
      if(f.state===1&&Math.abs(target-f.ang)<1e-4){f.hold+=dt;if(f.hold>.12){f.state=0;f.hold=0;f.cd=.2}}
    }
  }
  // one-sided: the pocket above it is sealed, so a coin shoved past the end is put back into the room
  deflect(c){
    const ax=W-WALL+20,ay=LANE_TOP-45,bx=W-170,by=CEIL-6,abx=bx-ax,aby=by-ay,L=Math.hypot(abx,aby);
    const t=((c.x-ax)*abx+(c.y-ay)*aby)/(L*L);if(t<0||t>1)return this.seg(c,ax,ay,bx,by,6,null,180);
    const nx=aby/L,ny=-abx/L,s=(c.x-ax)*nx+(c.y-ay)*ny,rr=c.r+6;if(s>=rr)return false;
    const px=ax+abx*t,py=ay+aby*t;c.x=px+nx*rr;c.y=py+ny*rr;
    const vn=c.vx*nx+c.vy*ny;if(vn<180){c.vx+=nx*(180-vn)-(vn<0?.75*vn*nx:0);c.vy+=ny*(180-vn)-(vn<0?.75*vn*ny:0)}
    return true;
  }
  atticPhysics(c,dt){
    const g=this.g;
    if(!(c.plunge>0)){if(Math.abs(c.vx)+Math.abs(c.vy)<25)c.still=(c.still||0)+dt;else c.still=0;if(c.still>1.5){c.still=0;c.vy=-380;c.vx=(c.x<(WALL+LANE)/2?1:-1)*180}}
    if(c.plunge>0){c.plunge-=dt;c.x=W-36;c.y=FLOOR-c.r-4;c.vx=0;c.vy=0;this.plungeK=Math.max(this.plungeK,Math.min(1,1-c.plunge/.6));
      if(c.plunge<=0){c.vy=-Math.sqrt(2*G*(FLOOR-CEIL))*(1.02+this.rng()*.3);c.vx=0;this.plungeK=0;g.sfx('launch',c.t)}return}
    // shooter lane wall
    const vxIn=c.vx;
    if(this.seg(c,LANE,LANE_TOP,LANE,FLOOR,3,null,0)&&c.x<LANE&&c.y>LANE_TOP){c.vx=vxIn;c.x=Math.min(c.x,LANE-3-c.r);this.wallHit(c,'R',this.pads())}
    if(c.x>LANE&&c.y+c.r>FLOOR-4&&c.vy>=0){c.dead=true;this.queue.unshift({t:c.t,combo:c.combo});return}
    // top-right deflector sends launched coins into the room
    this.deflect(c);
    // inlane slopes down to the flippers
    const f0=this.flip[0],f1=this.flip[1];
    this.seg(c,WALL,FLOOR-170,f0.px,f0.py,6,null,0);this.seg(c,LANE-3,FLOOR-170,f1.px,f1.py,6,null,0);
    for(const f of this.flip){const ex=f.px+Math.cos(f.ang)*f.len,ey=f.py+Math.sin(f.ang)*f.len;
      if(this.seg(c,f.px,f.py,ex,ey,7,(px,py)=>[-f.w*(py-f.py),f.w*(px-f.px)],f.state===1?620+this.rng()*180:120)&&Math.abs(f.w)>1){c.combo=Math.min(c.combo+1,50);this.pay(c,1,c.x,c.y);g.sfx('bump',c.t)}}
    // drain between the flippers: back down to the Den
    if(c.x<LANE&&c.y-c.r>FLOOR-30){c.dead=true;g.rooms[0].dropIn(c)}
  }
  // the Merge button: merge the highest matching pair (this room first, then the linked room)
  bestPair(){const rooms=[this].concat(this.pool().filter(r=>r!==this));
    for(let t=MAXT;t>=0;t--)for(const r of rooms){const cs=r.coins.filter(c=>!c.dead&&!c.ghost&&!(c.plunge>0)&&c.t===t);if(cs.length>=2)return {room:r,a:cs[0],b:cs[1],t}}return null}
  mergeBest(){const p=this.bestPair();if(!p)return null;const {room,a,b}=p;
    const [hi,lo]=a.y<b.y?[a,b]:[b,a];room.beams.push({x1:lo.x,y1:lo.y,x2:hi.x,y2:hi.y,life:.35,t:a.t});
    room.merge(a,b,[],hi);room.coins=room.coins.filter(c=>!c.dead);return p}
  merge(a,b,mags,at){
    a.dead=b.dead=true;const x=at?at.x:(a.x+b.x)/2,y=at?at.y:(a.y+b.y)/2,g=this.g;
    if(a.t===MAXT){const v=this.value(a)*200;this.earn(v,x,y,'#ffffff',true);this.burst(x,y,'#ffffff',60);g.sfx('jackpot',MAXT);this.float(x,y-30,'PRISM JACKPOT!','#ffcf3f');return}
    const n=this.addCoin(a.t+1,x,y,(a.vx+b.vx)/2,Math.min((a.vy+b.vy)/2,-160));n.combo=Math.max(a.combo,b.combo);n.flash=1;
    let bonus=.5+4*g.pk('merge');for(const m of mags){if(Math.hypot(m.x-x,m.y-y)<90+8*m.item.lv){bonus+=3+3*m.item.lv;m.item.pulse=1}}
    this.earn(this.value(n)*bonus,x,y,TIERS[a.t+1].c,true);this.burst(x,y,TIERS[a.t+1].c,18);g.sfx('merge',a.t+1);
  }
  fx(dt){
    for(const c of this.coins){c.flash=Math.max(0,c.flash-dt*3);c.sq=Math.max(0,(c.sq||0)-dt*6)}
    for(const b of this.beams)b.life-=dt;if(this.beams.length)this.beams=this.beams.filter(b=>b.life>0);
    for(const p of this.parts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=400*dt;p.life-=dt}
    if(this.parts.length)this.parts=this.parts.filter(p=>p.life>0);
    for(const f of this.floats){f.y-=40*dt;f.life-=dt*(f.big?.8:1.7)}
    if(this.floats.length)this.floats=this.floats.filter(f=>f.life>0);
    for(const b of this.bolts)b.life-=dt;if(this.bolts.length)this.bolts=this.bolts.filter(b=>b.life>0);
  }
}

class Game{
  constructor(rng,headless){this.rng=rng||Math.random;this.headless=!!headless;this.sfx=()=>{};this.events=[];this.reset()}
  reset(){
    this.cash=0;this.life=0;this.perks={};this.mile=0;this.seen=0;this.enemiesOn=false;this.met={};this.kills=0;this.bestCombo=0;
    this.rate=0;this.rateBuf=[0];this.rateT=0;this.cur=0;this.notified=0;this.pending=null;this.time=0;
    this.rooms=ROOMS.map((_,i)=>new Room(this,i));this.rooms[0].init();
    this.lucky=null;this.luckyT=60;this.frenzy=0;
  }
  pk(id){return this.perks[id]||0}
  disc(){return Math.pow(.9,this.pk('disc'))}
  comboStep(){return .06*(1+.5*this.pk('combo'))}
  bumpMult(){return 1+.5*this.pk('bump')}
  room(){return this.rooms[this.cur]}
  roomCost(i){return i===1?BAL.room2:BAL.room3}
  unlockRoom(i){const r=this.rooms[i];if(r.open||this.cash<this.roomCost(i))return false;this.cash-=this.roomCost(i);r.init();this.cur=i;this.sfx('clear');
    this.events.push({k:'info',icon:ROOMS[i].icon,spr:'room:'+i,title:ROOMS[i].name+' is open!',text:i===1?'The hatch in the Den ceiling is open. Any coin that flies up through it lands in the shooter lane up here and gets fired into a pinball room with automatic flippers. Everything pays 12x. Coins that slip past the flippers fall back to the Den. Tip: a Launcher shoots coins up to the hatch.':'Up on the roof under the moon. Coins start as Ruby and everything pays 900x. Three critters at a time though, so build zappers.'});return true}
  itemUnlocked(T){const u=ITEMS[T].unlock;return u<0?this.enemiesOn:this.life>=u}
  discover(t){if(t+1>this.seen){this.seen=t+1;if(t>0&&!this.headless)this.toast('New coin: '+TIERS[t].n+'!');if(t>0)this.sfx('new',t)}}
  toast(t){this.events.push({k:'toast',t})}
  meetEnemy(type,room){if(!this.met[type]){this.met[type]=1;const d=ENEMIES[type];this.events.push({k:'info',icon:d.i,spr:'enemy:'+type,title:d.name,text:d.intro})}}
  earn(a){this.cash+=a;this.life+=a;this.rateBuf[this.rateBuf.length-1]+=a;
    if(!this.enemiesOn&&this.life>=1500){this.enemiesOn=true;this.rooms[0].enemyT=12}
  }
  checkUnlocks(){
    ITEM_ORDER.forEach((T,i)=>{const bit=1<<i;if(!(this.notified&bit)&&this.itemUnlocked(T)){this.notified|=bit;if(i>0)this.toast('New build unlocked: '+ITEMS[T].name+'! Tap an empty slot.')}});
    const goal=BAL.lifeMile*Math.pow(10,this.mile);
    if(!this.pending&&this.life>=goal){this.mile++;this.pending=this.offer()}
  }
  nextMile(){return BAL.lifeMile*Math.pow(10,this.mile)}
  offer(){const ids=Object.keys(PERKS).filter(k=>this.pk(k)<PERKS[k].max);for(let i=ids.length-1;i>0;i--){const j=Math.floor(this.rng()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}return ids.slice(0,3)}
  choose(id){this.perks[id]=this.pk(id)+1;this.pending=null}
  stepGlobal(dt){
    if(this.frenzy>0)this.frenzy=Math.max(0,this.frenzy-dt);
    if(this.lucky){const L=this.lucky;L.t+=dt;L.life-=dt;L.y+=L.vy*dt;L.x+=Math.sin(L.t*2)*30*dt;if(L.life<=0||L.y>FLOOR-20)this.lucky=null}
    else{this.luckyT-=dt;if(this.luckyT<=0){this.luckyT=60+this.rng()*90;this.lucky={room:this.cur,x:60+this.rng()*280,y:-20,vy:Math.max(40,(FLOOR-40)/10),life:10,t:0};this.sfx('lucky',0)}}
  }
  // tap the Lucky Coin: a cash burst or a 3x Frenzy
  tapLucky(x,y){const L=this.lucky;if(!L||L.room!==this.cur||Math.hypot(L.x-x,L.y-y)>40)return null;this.lucky=null;const R=this.room();
    if(this.rng()<.5){this.frenzy=20;R.float(x,y-30,'FRENZY x3!','#ffcc4d');this.sfx('jackpot',0);return 'frenzy'}
    const v=Math.max(this.rate*45,300*R.unit());this.cash+=v;this.life+=v;this.rateBuf[this.rateBuf.length-1]+=v;R.float(x,y-30,'+'+fmt(v)+'!','#ffcc4d');R.burst(x,y,'#ffcc4d',40);this.sfx('jackpot',0);return 'cash'}
  step(dt){this.time+=dt;this.stepGlobal(dt);for(const r of this.rooms)if(r.open)r.step(dt)}
  tick(dt){this.rateT+=dt;if(this.rateT>=1){this.rateT-=1;this.rateBuf.push(0);if(this.rateBuf.length>16)this.rateBuf.shift()}
    const f=this.rateBuf.slice(0,-1);if(f.length)this.rate=f.reduce((a,b)=>a+b,0)/f.length;this.checkUnlocks()}
  offline(sec){if(sec<10)return 0;const g=Math.min(sec,8*3600)*this.rate*(.3+.2*this.pk('night'));if(g>0){this.cash+=g;this.life+=g}return g}
  save(){return {v:2,cash:this.cash,life:this.life,perks:this.perks,mile:this.mile,seen:this.seen,enemiesOn:this.enemiesOn,met:this.met,kills:this.kills,bestCombo:this.bestCombo,rate:this.rate,cur:this.cur,notified:this.notified,pending:this.pending,at:Date.now(),
    rooms:this.rooms.map(r=>({open:r.open,mintN:r.mintN,padLv:r.padLv,padN:r.padN,capLv:r.capLv,kills:r.kills,coins:r.coins.filter(c=>!c.ghost).map(c=>c.t).concat(r.queue.map(q=>q.t)),
      slots:r.slots.map(s=>({o:s.open,it:s.item?{type:s.item.type,lv:s.item.lv,spent:s.item.spent,hold:s.item.hold?s.item.hold.t:null}:null}))}))}}
  load(s){
    this.reset();if(!s||s.v!==2)return;
    Object.assign(this,{cash:s.cash||0,life:s.life||0,perks:s.perks||{},mile:s.mile||0,seen:s.seen||0,enemiesOn:!!s.enemiesOn,met:s.met||{},kills:s.kills||0,bestCombo:s.bestCombo||0,rate:s.rate||0,cur:s.cur||0,notified:s.notified||0,pending:s.pending||null});
    (s.rooms||[]).forEach((rs,i)=>{const r=this.rooms[i];if(!r||!rs.open)return;r.open=true;r.coins=[];
      Object.assign(r,{padN:Math.max(1,Math.min(r.padObjs.length,rs.padN||1)),mintN:rs.mintN||0,padLv:rs.padLv||0,capLv:rs.capLv||0,kills:rs.kills||0});
      (rs.coins||[]).forEach((t,k)=>r.addCoin(Math.min(MAXT,t|0),40+this.rng()*320,40+(k%8)*30));
      (rs.slots||[]).forEach((ss,k)=>{const sl=r.slots[k];if(!sl)return;sl.open=!!ss.o;sl.item=null;
        if(ss.it&&ITEMS[ss.it.type]){const it=r.mkItem(ss.it.type);it.lv=ss.it.lv||1;it.spent=ss.it.spent||0;if(ss.it.hold!=null){it.hold={t:ss.it.hold,combo:0};it.holdMax=it.holdT=bucketTime(r,ss.it.hold,it.lv)}sl.item=it}})});
    if(!this.rooms[this.cur].open)this.cur=0;
  }
}

export {HOLE_X,HOLE_W,LANE,LANE_TOP,PAD_LEN,padSpots,setRoomHeight,BASE_H,SZ,W,H,WALL,CEIL,FLOOR,G,BAL,TIERS,MAXT,coinR,tierVal,SUF,fmt,ROOMS,ITEMS,ITEM_ORDER,ENEMIES,PERKS,itemStat,bucketTime,bucketMax,ghostLife,mulberry,Room,Game};
