// Shop, Gear and Stats polish: the icon module loads headless and the CSS block and markup hooks exist.
import fs from 'node:fs';
import assert from 'node:assert';
const { ICON_NAMES, iconURL, ico } = await import('../../cell_serpent/icons.js');
assert.ok(ICON_NAMES.includes('chestLid') && ICON_NAMES.includes('star'));
assert.strictEqual(iconURL('star'), '');           // no document in node: empty, never throws
assert.strictEqual(ico('star'), '');
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('/* @css:10-shop-gear-stats */') && html.includes('/* end @css:10-shop-gear-stats */'));
assert.ok(html.includes('class="stage"'));
const hub = fs.readFileSync(new URL('../../cell_serpent/hub2.js', import.meta.url), 'utf8');
assert.ok(!hub.includes('—') && !html.includes('—'));
console.log('ok 10_shop_gear_stats');
// round 2: outfit hats are drawn icons, and the new hooks exist
for (const id of ['overalls', 'jacket', 'wig', 'tux', 'bloom', 'sun', 'pumpkin', 'snow']) assert.ok(ICON_NAMES.includes('hat_' + id), 'hat icon ' + id);
for (const k of ['rhit', 'dealCheer', 'lootx', 'setring', 'hatsOn', 'wardhero2']) assert.ok(hub.includes(k) || html.includes(k), k);
assert.ok(html.includes('.kstar.w'));
console.log('ok 10_shop_gear_stats round 2');
// round 3: collection header, deal quantity badge, best buy, radar ghost, loot tick sounds and legendary flash
{
  const aud = fs.readFileSync(new URL('../../cell_serpent/audio.js', import.meta.url), 'utf8');
  for (const k of ['colhead', 'dqty', 'bestBuy', 'rgh', 'legflash', "'counttick'", "'legend'"]) assert.ok(hub.includes(k) || html.includes(k), k);
  assert.ok(aud.includes('counttick:') && aud.includes('legend:') && !aud.includes('—'));
  assert.ok(html.includes('.bestrib') && html.includes('.legflash') && !html.includes('—'));
  console.log('ok 10_shop_gear_stats round 3');
}
// round 4: NEW keepsake ribbons, chest charge drama, hot deal, radar level badges, narrow gear chips
{
  for (const k of ['knew', 'cell_serpent_keepseen_v1', 'chestGo', 'hotbadge', 'rlv', 'obt']) assert.ok(hub.includes(k) || html.includes(k), k);
  assert.ok(html.includes('.chest3.charge') && html.includes('#gearFilters .ttl') && !html.includes('\u2014') && !hub.includes('\u2014'));
  console.log('ok 10_shop_gear_stats round 4');
}
// round 6: radar badges only on levelled axes with a best-buy pulse, NEW + flying star in the keepsake reveal, event milestone track
{
  for (const k of ['rbb', 'lootStars', 'isNew', 'lnewstar', 'evtrack', 'evlab']) assert.ok(hub.includes(k) || html.includes(k), k);
  assert.ok(hub.includes("if (!l) return ''"), 'zero-level badges are not drawn');
  assert.ok(html.includes('.radar .rbb') && html.includes('.evm.ready') && !html.includes('\u2014') && !hub.includes('\u2014'));
  console.log('ok 10_shop_gear_stats round 6');
}
