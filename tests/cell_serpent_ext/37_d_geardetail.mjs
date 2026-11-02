// batch 14 agent d: sticky gear level-up bar, pet detail hero and next-star preview
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
import { petHeroHTML, nextStarHTML, gearBarHTML } from '../../cell_serpent/pet_detail_b14d.js';
const read = f => readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const html = read('index.html'), hub2 = read('hub2.js'), sheet = read('skill_sheet.js'), mod = read('pet_detail_b14d.js');
const i = html.indexOf('/* @css:37-d-geardetail */'), j = html.indexOf('/* end @css:37-d-geardetail */'), k = html.indexOf('/* @css:34-phone-hub */');
assert.ok(i > 0 && j > i && j < k, 'd css block sits before the phone-hub block');
for (const t of [html.slice(i, j), mod]) assert.ok(!t.includes('—'), 'no em dash');
assert.ok(/#gearBody \.gearbar\{position:sticky/.test(html), 'gear bar is sticky');
assert.ok(hub2.includes("bar.className = 'gearbar'") && hub2.includes('gearBarHTML'), 'hub2 builds the bar');
assert.ok(sheet.includes('petHeroHTML') && sheet.includes('nextStarHTML'), 'pet sheet uses the new pieces');
assert.ok(gearBarHTML(3).includes('gbgo') && gearBarHTML(3).includes('3 READY'), 'bar text');
const hero = petHeroHTML({ iconHTML: '<img>', label: 'Kit & Cat', sub: 'Common friend', color: '#fff', stars: 2, max: 5, owned: true });
assert.equal((hero.match(/star on/g) || []).length, 2); assert.ok(hero.includes('Kit &amp; Cat'));
const nx = nextStarHTML({ nowText: '+6%', nextText: '+12%', deltaText: '+6%', owned: true, maxed: false, frag: 3, need: 8, star: 1, max: 5 });
assert.ok(nx.includes('NEXT STAR 2') && nx.includes('5 fragments to go') && nx.includes('width:38%'), 'next star card');
assert.ok(nextStarHTML({ nowText: '+30%', owned: true, maxed: true, star: 5, max: 5 }).includes('ALL 5 STARS'), 'maxed card');
console.log('37_d_geardetail ok');
