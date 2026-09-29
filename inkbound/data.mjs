export const HEROES = [
 {id:'akari',name:'Akari',title:'The Cinderblade',hp:72,color:'#ff917b',art:0,passive:'First attack each turn deals +3 damage.',story:'She carries the last ember of a sun the world has forgotten.'},
 {id:'ren',name:'Ren',title:'The Moonweaver',hp:62,color:'#76e1e0',art:1,passive:'First skill each turn grants 3 extra block.',story:'A cartographer who charts the spaces between stars.'},
 {id:'yuna',name:'Yuna',title:'The Foxbound',hp:64,color:'#bbd788',art:2,passive:'Poison you apply gains 1 extra stack.',story:'The forest lends her its arrows. It always asks for them back.'},
 {id:'kuro',name:'Kuro',title:'The Oathkeeper',hp:84,color:'#c4a0ed',art:3,passive:'Gain 4 block whenever you swap to the front.',story:'Every name he saves is written in gold upon his hands.'}
];
const c=(id,name,hero,cost,effect,rarity='common',art=0)=>({id,name,hero,cost,...effect,rarity,art});
export const CARDS=[
 c('a1','Scarlet Cut','akari',1,{damage:8},'basic',0),c('a2','Silk Guard','akari',1,{block:7},'basic',1),c('a3','Crosswind','akari',1,{damage:7,swap:true},'common',2),c('a4','Crimson Waltz','akari',2,{damage:7,hits:3},'rare',0),c('a5','Ember Brand','akari',1,{damage:5,bleed:4},'common',3),c('a6','Sunbreaker','akari',2,{damage:22,vulnerable:2},'rare',0),c('a7','Quickdraw','akari',0,{damage:4,draw:1},'common',2),c('a8','Burning Resolve','akari',1,{power:3,exhaust:true},'rare',3),c('a9','Petal Storm','akari',2,{damage:12,all:true},'common',2),c('a10','Blade Reverie','akari',1,{block:11,draw:1},'common',1),c('a11','Last Sunrise','akari',3,{damage:38,exhaust:true},'legendary',0),c('a12','Red Horizon','akari',1,{damage:10,frontBonus:7},'common',3),c('a13','Phoenix Thread','akari',1,{heal:9,exhaust:true},'rare',1),c('a14','Dancing Ash','akari',1,{damage:6,bleed:3,all:true},'rare',2),c('a15','Flame Covenant','akari',0,{energy:2,selfDamage:5,exhaust:true},'rare',3),
 c('r1','Moon Shard','ren',1,{damage:7},'basic',4),c('r2','Lunar Veil','ren',1,{block:8},'basic',5),c('r3','Tidal Step','ren',1,{block:8,swap:true,draw:1},'common',5),c('r4','Starfall','ren',2,{damage:13,all:true},'rare',4),c('r5','Still Water','ren',1,{block:12},'common',5),c('r6','Celestial Script','ren',0,{draw:2,exhaust:true},'rare',6),c('r7','Eclipse Ray','ren',2,{damage:20,weak:2},'rare',4),c('r8','Borrowed Tomorrow','ren',1,{energy:3,exhaust:true},'rare',6),c('r9','Silver Thread','ren',1,{heal:6,block:5,exhaust:true},'common',5),c('r10','Astral Familiar','ren',2,{ally:5,exhaust:true},'rare',7),c('r11','A Thousand Moons','ren',3,{damage:25,all:true,draw:2},'legendary',4),c('r12','Dissolve','ren',1,{weak:3,vulnerable:2},'common',6),c('r13','Moonlit Mirror','ren',1,{block:9,thorns:3},'rare',5),c('r14','Starlight','ren',0,{block:4,draw:1},'common',7),c('r15','Deep Current','ren',2,{block:22,draw:2},'rare',6),
 c('y1','Thorn Arrow','yuna',1,{damage:7},'basic',8),c('y2','Leaf Shelter','yuna',1,{block:7},'basic',9),c('y3','Venom Kiss','yuna',1,{damage:4,poison:4},'common',8),c('y4','Foxfire','yuna',1,{poison:5,all:true},'rare',10),c('y5','Wild Companion','yuna',2,{ally:6,exhaust:true},'rare',11),c('y6','Bramble Snare','yuna',1,{block:10,thorns:4},'common',9),c('y7','Fleetfoot','yuna',0,{swap:true,draw:1},'common',10),c('y8','Emerald Rain','yuna',2,{damage:5,hits:3,poison:2},'rare',8),c('y9','Forest Remedy','yuna',1,{heal:10,exhaust:true},'rare',9),c('y10','Predator Eye','yuna',1,{vulnerable:3,draw:2},'common',11),c('y11','Nine-Tail Eclipse','yuna',3,{damage:18,poison:9,all:true},'legendary',10),c('y12','Feather Volley','yuna',1,{damage:8,all:true},'common',8),c('y13','Spirit Pact','yuna',1,{ally:3,block:5,exhaust:true},'rare',11),c('y14','Verdant Ambush','yuna',1,{damage:11,frontBonus:6},'common',9),c('y15','Toxic Bloom','yuna',2,{poison:12},'rare',10),
 c('k1','Golden Fist','kuro',1,{damage:8},'basic',3),c('k2','Iron Sutra','kuro',1,{block:9},'basic',1),c('k3','Guardian Step','kuro',1,{swap:true,block:10},'common',5),c('k4','Mountain Stance','kuro',2,{block:24},'rare',9),c('k5','Karmic Strike','kuro',1,{damage:6,blockDamage:true},'rare',0),c('k6','Gilded Vow','kuro',1,{power:2,thorns:2,exhaust:true},'rare',7),c('k7','Palm of Dawn','kuro',1,{damage:10,weak:2},'common',3),c('k8','Unbroken','kuro',0,{block:6},'common',1),c('k9','Temple Bell','kuro',1,{weak:2,all:true,draw:1},'common',6),c('k10','Stone Familiar','kuro',2,{ally:4,block:10,exhaust:true},'rare',11),c('k11','Heaven Splits','kuro',3,{damage:32,all:true},'legendary',0),c('k12','Meditation','kuro',1,{heal:8,draw:1,exhaust:true},'common',7),c('k13','Saffron Shield','kuro',1,{block:8,thorns:4},'common',9),c('k14','Avalanche','kuro',2,{damage:16,block:12},'rare',3),c('k15','Open Palm','kuro',0,{draw:2,exhaust:true},'rare',6)
];
export const RELICS=[
 {id:'lantern',name:'Dawn Lantern',icon:'lantern',text:'Begin every battle with 5 block.'},
 {id:'coin',name:'Lucky Koban',icon:'coin',text:'Earn 12 extra gold after each battle.'},
 {id:'feather',name:'Crane Feather',icon:'feather',text:'Draw 1 extra card each turn.'},
 {id:'tea',name:'Evergreen Tea',icon:'leaf',text:'Heal both heroes for 4 after each victory.'},
 {id:'fang',name:'Ivory Fang',icon:'sword',text:'All attacks deal 2 extra damage.'},
 {id:'bell',name:'Temple Bell',icon:'bell',text:'Start each battle with 1 extra energy.'},
 {id:'shell',name:'Moon Shell',icon:'shield',text:'Gain 3 block at the start of each turn.'},
 {id:'brush',name:'Endless Brush',icon:'brush',text:'Gain 2 extra brushes at the next chapter.'},
 {id:'thorn',name:'Briar Crown',icon:'leaf',text:'Start battles with 3 thorns on each hero.'},
 {id:'star',name:'Fallen Star',icon:'star',text:'Deal 7 damage to all enemies when combat begins.'},
 {id:'heart',name:'Phoenix Seal',icon:'heart',text:'At chapter transitions restore all health.'},
 {id:'jade',name:'Jade Abacus',icon:'gem',text:'Shop purchases cost 25% less.'}
];
export const GEMS=[
 {id:'ruby',name:'Ember Ruby',color:'#ef8b79',text:'+4 attack damage.',damage:4},
 {id:'sapphire',name:'Moon Sapphire',color:'#82dff4',text:'+5 block.',block:5},
 {id:'emerald',name:'Thorn Emerald',color:'#a4d482',text:'Apply 3 poison.',poison:3},
 {id:'opal',name:'Dream Opal',color:'#d3b6f7',text:'Draw 1 card.',draw:1},
 {id:'diamond',name:'Dawn Diamond',color:'#f5e0a5',text:'Costs 1 less energy.',discount:1},
 {id:'amber',name:'Sun Amber',color:'#eab669',text:'Heal the owner for 3.',heal:3}
];
export const TALENTS=[
 {id:'power',name:'Shared Flame',text:'Both heroes gain 2 power every battle.'},
 {id:'vigor',name:'Living Ink',text:'Both heroes gain 12 maximum and current health.'},
 {id:'energy',name:'Perfect Harmony',text:'Gain 1 extra energy every turn.'},
 {id:'draw',name:'Open Mind',text:'Draw 1 extra card every turn.'},
 {id:'heal',name:'Gentle Rain',text:'Heal both heroes for 5 after victories.'},
 {id:'guard',name:'Paper Fortress',text:'Begin each turn with 5 extra block.'}
];
export const CHAPTERS=[{name:'The Jade Expanse',subtitle:'Where forgotten stories take root',color:'#83c6bb',boss:'The Vermilion Warden',art:2},{name:'The Drowned Observatory',subtitle:'Even the stars have something to hide',color:'#b9a1e4',boss:'The Cathedral of Moss',art:4},{name:'The Unwritten Throne',subtitle:'One final stroke against the dark',color:'#e6b675',boss:'The Eclipse Empress',art:5}];
export const ENEMIES=[
 {name:'Paper Imp',art:0,hp:27,attack:6,pattern:['attack','guard','attack']},
 {name:'Hollow Wolf',art:1,hp:36,attack:8,pattern:['attack','attack','buff']},
 {name:'Oni Ronin',art:2,hp:48,attack:10,pattern:['guard','attack','heavy']},
 {name:'Dusk Oracle',art:3,hp:35,attack:7,pattern:['hex','attack','drain']},
 {name:'Temple Sentinel',art:4,hp:58,attack:10,pattern:['guard','heavy','attack']},
 {name:'Eclipse Herald',art:5,hp:46,attack:9,pattern:['hex','attack','buff']}
];
export const EVENTS=[
 {name:'The Fox at the Crossroads',text:'A fox in a paper crown offers two gifts. “Choose the one you can afford to lose.”',options:[{name:'Accept the gilded pouch',text:'Gain 55 gold. Lose 6 health from each hero.',gold:55,hurt:6},{name:'Share a quiet moment',text:'Heal both heroes for 10.',heal:10}]},
 {name:'A Name in the Rain',text:'An unfinished poem clings to a ruined gate. Its last line is your name.',options:[{name:'Finish the poem',text:'Gain a rare card. Lose 8 health from each hero.',card:true,hurt:8},{name:'Let the ink wash away',text:'Gain 2 brushes.',brush:2}]},
 {name:'The Sleeping Cartographer',text:'She dreams the world onto parchment. Beside her, a gemstone catches the light.',options:[{name:'Trade a little gold',text:'Pay 35 gold. Receive a gem.',cost:35,gem:true},{name:'Leave a kind note',text:'Gain 1 brush and 1 ink.',brush:1,ink:1}]},
 {name:'The Hundredth Bell',text:'Ninety-nine bells hang in the branches. Your heartbeat is the hundredth.',options:[{name:'Ring the golden bell',text:'Gain a relic. Lose 10 health from each hero.',relic:true,hurt:10},{name:'Listen',text:'Heal both heroes for 12.',heal:12}]}
];
export const byId=id=>CARDS.find(c=>c.id===id);
export function cardStats(card){const v={...byId(card.id)};if(card.up){if(v.damage)v.damage+=3;if(v.block)v.block+=3;if(v.poison)v.poison+=2;if(v.heal)v.heal+=3;if(v.ally)v.ally+=2;}for(const gid of card.gems||[]){const g=GEMS.find(g=>g.id===gid);for(const k of ['damage','block','poison','draw','heal'])if(g[k])v[k]=(v[k]||0)+g[k];if(g.discount)v.cost=Math.max(0,v.cost-g.discount);}return v;}
export function describe(c){return [c.damage&&`Deal ${c.damage}${c.hits?' × '+c.hits:''} damage${c.all?' to ALL enemies':''}.`,c.block&&`Gain ${c.block} block.`,c.poison&&`Apply ${c.poison} poison${c.all?' to ALL enemies':''}.`,c.bleed&&`Apply ${c.bleed} bleed.`,c.weak&&`Apply ${c.weak} weak.`,c.vulnerable&&`Apply ${c.vulnerable} vulnerable.`,c.draw&&`Draw ${c.draw}.`,c.energy&&`Gain ${c.energy} energy.`,c.heal&&`Heal ${c.heal}.`,c.power&&`Gain ${c.power} power.`,c.thorns&&`Gain ${c.thorns} thorns.`,c.ally&&`Summon: ${c.ally} damage each turn.`,c.swap&&'Switch positions.',c.frontBonus&&`Front: +${c.frontBonus} damage.`,c.blockDamage&&'Add your block to damage.',c.selfDamage&&`Lose ${c.selfDamage} health.`,c.exhaust&&'Exhaust.'].filter(Boolean).join(' ');}
