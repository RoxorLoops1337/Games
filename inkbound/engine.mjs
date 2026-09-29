import {HEROES,CARDS,RELICS,GEMS,TALENTS,CHAPTERS,ENEMIES,EVENTS,byId,cardStats} from './data.mjs';
export const VERSION=1;
export function random(s){let t=s.rng+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
const pick=(s,a)=>a[Math.floor(random(s)*a.length)];
function shuffle(s,a){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const has=(s,id)=>s.relics.includes(id),tal=(s,id)=>s.talents.includes(id);
export function makeCard(s,id){return {id,uid:++s.uid,up:false,gems:[]};}
export function newRun(pair=['akari','ren'],seed=Date.now(),level=0,meta={}){
 const s={version:VERSION,seed,rng:seed>>>0,uid:0,phase:'map',chapter:0,gold:75+(meta.wealth||0)*15,brushes:5,ink:3,deck:[],heroes:pair.map(id=>{const h=HEROES.find(h=>h.id===id);return {id,hp:h.hp+(meta.vitality||0)*4,maxHp:h.hp+(meta.vitality||0)*4,block:0,power:0,thorns:0};}),front:0,relics:['lantern'],gems:[],talents:[],level,fights:0,totalFights:0,turns:0,pages:0,log:[],stats:{damage:0,cards:0,explored:0},started:Date.now(),event:null,battle:null,reward:null};
 for(const id of pair){const cards=CARDS.filter(c=>c.hero===id);for(const n of [0,0,1,1,2])s.deck.push(makeCard(s,cards[n].id));}makeMap(s);return s;
}
export function log(s,t){s.log.unshift(t);s.log=s.log.slice(0,30);}
export function distance(a,b){const aq=a.x-(a.y-(a.y&1))/2,bq=b.x-(b.y-(b.y&1))/2;return (Math.abs(aq-bq)+Math.abs(a.y-b.y)+Math.abs(aq+a.y-bq-b.y))/2;}
export function neighbors(s,n){return s.map.filter(t=>distance(n,t)===1);}
export function makeMap(s){s.fights=0;s.position=3*9;s.map=[];let counts=['battle','battle','battle','battle','battle','elite','elite','shop','camp','camp','treasure','treasure','gem','gem','event','event','event','ink','ink','gold','gold','gold'];let cells=shuffle(s,Array.from({length:63},(_,i)=>i).filter(i=>i!==27&&i!==35));for(let i=0;i<63;i++){let k=cells.indexOf(i);s.map.push({id:i,x:i%9,y:Math.floor(i/9),type:i===27?'start':i===35?'boss':counts[k]||'empty',seen:false,done:false});}
 // A legible main road ensures that resource use can never strand the run.
 for(let x=0;x<9;x++){const n=s.map[27+x];n.seen=true;if(x===2||x===4||x===6)n.type='battle';else if(x!==0&&x!==8)n.type='empty';}
 for(const t of s.map)if(distance(t,s.map[s.position])<=1)t.seen=true;s.map[s.position].done=true;
}
export function reachable(s,id){const dest=s.map[id];if(!dest?.seen)return false;const visited=new Set([s.position]),q=[s.map[s.position]];while(q.length){const n=q.shift();if(n.id===id)return true;if(n.id!==s.position&&!n.done&&['battle','elite','boss'].includes(n.type))continue;for(const x of neighbors(s,n))if(x.seen&&!visited.has(x.id)){visited.add(x.id);q.push(x);}}return false;}
export function paint(s,mode,target){if(s.phase!=='map')return false;let tiles=[];const origin=s.map[s.position];if(mode==='brush'){if(s.brushes<1)return false;tiles=s.map.filter(t=>distance(origin,t)<=2);if(tiles.every(t=>t.seen))return false;s.brushes--;}else{if(s.ink<1)return false;const n=s.map[target];if(!n||distance(origin,n)>4||n.seen)return false;tiles=s.map.filter(t=>distance(t,n)<=1);s.ink--;}
 for(const t of tiles)if(!t.seen){t.seen=true;s.stats.explored++;}log(s,mode==='brush'?'A brushstroke gives the world its shape.':'Moon ink reveals a distant memory.');return true;}
function heal(s,n){for(const h of s.heroes)h.hp=Math.min(h.maxHp,h.hp+n);}
export function cardChoices(s,n=3,rare=false){let pool=CARDS.filter(c=>s.heroes.some(h=>h.id===c.hero)&&c.rarity!=='basic'&&(!rare||c.rarity!=='common'));return shuffle(s,pool).slice(0,n).map(c=>makeCard(s,c.id));}
function grantRelic(s){const options=RELICS.filter(r=>!has(s,r.id));if(!options.length){s.gold+=80;return '80 gold';}const r=pick(s,options);s.relics.push(r.id);return r.name;}
export function visit(s,id){if(s.phase!=='map'||!reachable(s,id))return false;let n=s.map[id];if(n.type==='boss'&&!n.done&&s.fights<3){log(s,`Defeat ${3-s.fights} more encounters to unseal the chapter guardian.`);return false;}s.position=id;if(n.done){if(n.type==='shop'&&n.shop){s.shop=n.shop;s.phase='shop';}return true;}
 switch(n.type){case 'battle':case 'elite':case 'boss':startBattle(s,n.type);return true;
 case 'gold':s.gold+=30+Math.floor(random(s)*25);log(s,'Gold gleams beneath the paper.');break;
 case 'ink':s.brushes+=2;s.ink++;log(s,'Found 2 brushes and a vial of moon ink.');break;
 case 'treasure':log(s,'Discovered '+grantRelic(s)+'.');s.phase='discovery';s.discovery={title:'A forgotten treasure',text:s.log[0],kind:'relic'};break;
 case 'gem':{let g=pick(s,GEMS);s.gems.push(g.id);s.phase='discovery';s.discovery={title:g.name,text:g.text+' Socket it into a card from your deck.',kind:'gem'};break;}
 case 'camp':s.phase='camp';break;
 case 'shop':s.phase='shop';s.shop={cards:cardChoices(s,3),relic:pick(s,RELICS.filter(r=>!has(s,r.id)))?.id,gem:pick(s,GEMS).id,bought:[]};n.shop=s.shop;break;
 case 'event':s.phase='event';s.event=pick(s,EVENTS);break;
 }n.done=true;return true;}
export function closeEncounter(s){if(['discovery','shop','event','camp'].includes(s.phase)){s.phase='map';s.event=null;}}
export function eventChoice(s,i){if(s.phase!=='event')return false;const o=s.event.options[i];if(!o||s.gold<(o.cost||0))return false;s.gold+=(o.gold||0)-(o.cost||0);if(o.heal)heal(s,o.heal);if(o.hurt)s.heroes.forEach(h=>h.hp=Math.max(1,h.hp-o.hurt));s.brushes+=o.brush||0;s.ink+=o.ink||0;if(o.gem)s.gems.push(pick(s,GEMS).id);if(o.relic)grantRelic(s);if(o.card)s.deck.push(cardChoices(s,1,true)[0]);closeEncounter(s);return true;}
export function camp(s,action,uid){if(s.phase!=='camp')return false;if(action==='rest')heal(s,Math.ceil(Math.max(...s.heroes.map(h=>h.maxHp))*.3));else if(action==='brush')s.brushes+=3;else if(action==='upgrade'){const c=s.deck.find(c=>c.uid===uid);if(!c||c.up)return false;c.up=true;}else return false;closeEncounter(s);return true;}
export function price(s,base){return Math.floor(base*(has(s,'jade')?.75:1));}
export function buy(s,type,index=0){if(s.phase!=='shop')return false;const key=type+index;if(s.shop.bought.includes(key))return false;const costs={card:65,relic:115,gem:50,heal:35,brush:30},cost=price(s,costs[type]);if(!cost||s.gold<cost)return false;if(type==='relic'&&!s.shop.relic)return false;s.gold-=cost;s.shop.bought.push(key);if(type==='card')s.deck.push(s.shop.cards[index]);if(type==='relic')s.relics.push(s.shop.relic);if(type==='gem')s.gems.push(s.shop.gem);if(type==='heal')heal(s,18);if(type==='brush')s.brushes+=2;if(s.map[s.position]?.type==='shop')s.map[s.position].shop=s.shop;return true;}
export function socket(s,uid,gid){if(s.phase==='combat')return false;const c=s.deck.find(c=>c.uid===uid),i=s.gems.indexOf(gid);if(!c||i<0||c.gems.length>=2)return false;c.gems.push(gid);s.gems.splice(i,1);return true;}
export function talentAvailable(s){return Math.min(6,Math.floor((s.deck.length-10)/4))>s.talents.length;}
export function learn(s,id){if(!talentAvailable(s)||s.talents.includes(id)||!TALENTS.some(t=>t.id===id))return false;s.talents.push(id);if(id==='vigor')s.heroes.forEach(h=>{h.maxHp+=12;h.hp+=12;});return true;}
function enemy(s,base,boss=false){const scale=1+s.chapter*.35+s.level*.09;return {...base,uid:++s.uid,hp:Math.round(base.hp*scale),maxHp:Math.round(base.hp*scale),attack:Math.round(base.attack*(1+s.chapter*.18+s.level*.05)),block:0,power:0,poison:0,bleed:0,weak:0,vulnerable:0,boss};}
export function startBattle(s,type='battle'){
 s.phase='combat';s.heroes.forEach(h=>{h.block=0;h.power=tal(s,'power')?2:0;h.thorns=has(s,'thorn')?3:0;h.weak=0;});
 let foes;if(type==='boss'){const ch=CHAPTERS[s.chapter];foes=[enemy(s,{name:ch.boss,art:ch.art,hp:140+s.chapter*25,attack:12+s.chapter*2,pattern:['attack','guard','heavy','hex','drain']},true)];}else if(type==='elite')foes=[enemy(s,{...ENEMIES[2+s.chapter],hp:88,attack:12})];else {let pool=ENEMIES.slice(0,Math.min(6,3+s.chapter));foes=[enemy(s,pick(s,pool))];if(s.chapter>0||s.fights>0)foes.push(enemy(s,pick(s,pool)));}
 s.battle={type,enemies:foes,draw:shuffle(s,s.deck.map(c=>({...c,gems:[...c.gems]}))),hand:[],discard:[],exhaust:[],energy:3,turn:0,swapUsed:false,firstAttack:[],firstSkill:[],ally:0,combo:0,lastHero:null};
 if(has(s,'star'))foes.forEach(e=>e.hp-=7);beginTurn(s);if(has(s,'lantern'))s.heroes[s.front].block+=5;if(has(s,'bell'))s.battle.energy++;log(s,type==='boss'?'The guardian steps from the page.':'The ink comes alive.');
}
export function draw(s,n){const b=s.battle;for(let i=0;i<n&&b.hand.length<10;i++){if(!b.draw.length){b.draw=shuffle(s,b.discard);b.discard=[];}if(!b.draw.length)break;b.hand.push(b.draw.pop());}}
export function intent(s,e){const b=s.battle,t=e.pattern[(b.turn-1)%e.pattern.length];let damage=Math.max(0,Math.floor((e.attack+e.power)*(t==='heavy'?1.7:1)*(e.weak>0?.75:1)));return {type:t,damage,label:t==='guard'?'Guard 12':t==='buff'?'Power +3':t==='hex'?`Weaken · ${damage}`:t==='drain'?`Drain ${damage}`:t==='heavy'?`Heavy ${damage}`:`Attack ${damage}`};}
function beginTurn(s){const b=s.battle;b.turn++;s.turns++;b.energy=3+(tal(s,'energy')?1:0);b.swapUsed=false;b.firstAttack=[];b.firstSkill=[];b.combo=0;b.lastHero=null;s.heroes.forEach(h=>h.block=0);s.heroes[s.front].block+=(has(s,'shell')?3:0)+(tal(s,'guard')?5:0);draw(s,5+(has(s,'feather')?1:0)+(tal(s,'draw')?1:0));}
export function swap(s,free=false){if(s.phase!=='combat'||s.heroes.some(h=>h.hp<=0)||(!free&&s.battle.swapUsed))return false;s.front=1-s.front;if(!free)s.battle.swapUsed=true;if(s.heroes[s.front].id==='kuro')s.heroes[s.front].block+=4;return true;}
function hit(target,n){n=Math.max(0,n);const blocked=Math.min(target.block,n);target.block-=blocked;target.hp=Math.max(0,target.hp-(n-blocked));return n-blocked;}
export function targetRequired(c){return !c.all&&!!(c.damage||c.poison||c.weak||c.vulnerable||c.bleed);}
export function play(s,uid,target){if(s.phase!=='combat')return false;const b=s.battle,idx=b.hand.findIndex(c=>c.uid===uid);if(idx<0)return false;const card=b.hand[idx],c=cardStats(card),owner=s.heroes.find(h=>h.id===c.hero);if(owner.hp<=0||c.cost>b.energy)return false;const enemy=b.enemies.find(e=>e.uid===target&&e.hp>0);if(targetRequired(c)&&!enemy)return false;
 b.energy-=c.cost;b.hand.splice(idx,1);s.stats.cards++;if(b.lastHero&&b.lastHero!==c.hero)b.combo++;b.lastHero=c.hero;
 if(c.swap)swap(s,true);let bonus=(owner.id==='akari'&&!b.firstAttack.includes(c.hero)&&c.damage?3:0)+(has(s,'fang')?2:0);if(c.damage)b.firstAttack.push(c.hero);
 const targets=c.all?b.enemies.filter(e=>e.hp>0):enemy?[enemy]:[];
 for(const e of targets){for(let k=0;k<(c.hits||1);k++)if(c.damage){let amount=c.damage+owner.power+bonus+(c.frontBonus&&s.heroes[s.front]===owner?c.frontBonus:0)+(c.blockDamage?owner.block:0);amount=Math.floor(amount*(e.vulnerable>0?1.5:1)*(owner.weak>0?.75:1));s.stats.damage+=hit(e,amount);}for(const st of ['poison','bleed','weak','vulnerable'])if(c[st])e[st]+=c[st]+(st==='poison'&&owner.id==='yuna'?1:0);}
 if(c.block)owner.block+=c.block+(owner.id==='ren'&&!c.damage&&!b.firstSkill.includes(c.hero)?3:0);if(!c.damage)b.firstSkill.push(c.hero);
 if(c.power)owner.power+=c.power;if(c.thorns)owner.thorns+=c.thorns;if(c.heal)owner.hp=Math.min(owner.maxHp,owner.hp+c.heal);if(c.selfDamage)owner.hp=Math.max(1,owner.hp-c.selfDamage);if(c.energy)b.energy+=c.energy;if(c.ally)b.ally+=c.ally;if(c.draw)draw(s,c.draw);
 (c.exhaust?b.exhaust:b.discard).push(card);log(s,`${HEROES.find(h=>h.id===c.hero).name} · ${c.name}`);checkVictory(s);return true;
}
function checkVictory(s){if(s.battle.enemies.every(e=>e.hp<=0)){const b=s.battle;let gold=(b.type==='boss'?95:b.type==='elite'?60:28)+Math.floor(random(s)*15)+(has(s,'coin')?12:0);s.gold+=gold;s.pages+=b.type==='boss'?12:b.type==='elite'?5:3;s.fights++;s.totalFights++;s.map[s.position].done=true;s.brushes++;if(has(s,'tea'))heal(s,4);if(tal(s,'heal'))heal(s,5);s.heroes.forEach(h=>{if(h.hp===0)h.hp=Math.ceil(h.maxHp*.25);});s.phase='reward';s.reward={gold,cards:cardChoices(s,3,b.type!=='battle'),type:b.type,relic:b.type==='elite'?grantRelic(s):null};if(b.type==='boss')s.gems.push(pick(s,GEMS).id);return true;}return false;}
export function endTurn(s){if(s.phase!=='combat')return false;const b=s.battle;b.discard.push(...b.hand);b.hand=[];if(b.ally){let e=b.enemies.find(e=>e.hp>0);if(e)hit(e,b.ally);}for(const e of b.enemies){if(e.hp<=0)continue;e.hp=Math.max(0,e.hp-e.poison-e.bleed);e.poison=Math.max(0,e.poison-1);e.bleed=Math.max(0,e.bleed-1);}if(checkVictory(s))return true;
 for(const e of b.enemies){if(e.hp<=0)continue;e.block=0;let a=intent(s,e);if(a.type==='guard')e.block=12+s.chapter*4;else if(a.type==='buff')e.power+=3;else {let h=s.heroes[s.front];if(h.hp<=0){s.front=1-s.front;h=s.heroes[s.front];}const loss=hit(h,a.damage);if(h.thorns)hit(e,h.thorns);if(a.type==='hex')h.weak=2;if(a.type==='drain')e.hp=Math.min(e.maxHp,e.hp+loss);if(h.hp<=0&&s.heroes[1-s.front].hp>0)s.front=1-s.front;}e.weak=Math.max(0,e.weak-1);e.vulnerable=Math.max(0,e.vulnerable-1);if(s.heroes.every(h=>h.hp<=0)){s.phase='defeat';s.pages+=2;return true;}}
 s.heroes.forEach(h=>h.weak=Math.max(0,(h.weak||0)-1));if(checkVictory(s))return true;beginTurn(s);return true;
}
export function takeReward(s,uid){if(s.phase!=='reward')return false;if(uid){const c=s.reward.cards.find(c=>c.uid===uid);if(!c)return false;s.deck.push(c);}if(s.reward.type==='boss'){if(s.chapter===2){s.phase='victory';s.pages+=25;return true;}s.chapter++;s.phase='chapter';heal(s,has(s,'heart')?999:25);s.brushes+=5+(has(s,'brush')?2:0);s.ink+=2;makeMap(s);}else s.phase='map';s.reward=null;return true;}
export function serialize(s){return JSON.stringify(s);}
export function restore(text){try{const s=JSON.parse(text);if(s.version!==VERSION||!Array.isArray(s.deck)||!Array.isArray(s.map)||s.heroes?.length!==2||!s.heroes.every(h=>HEROES.some(x=>x.id===h.id))||s.deck.some(c=>!byId(c.id)))return null;return s;}catch{return null;}}
