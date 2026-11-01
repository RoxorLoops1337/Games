// Registry. Every content file exports an array; this builds the id maps and refuses duplicate ids.
import { STATUS_LIST } from './statuses.js';
import { STATUS_MARROW } from './statuses_marrow.js';
import { STATUS_WICK } from './statuses_wick.js';
import { STATUS_ODILE } from './statuses_odile.js';
import { STATUS_GRAFTS } from './statuses_grafts.js';
import { STATUS_E1 } from './statuses_e1.js';
import { STATUS_E2 } from './statuses_e2.js';
import { STATUS_E3 } from './statuses_e3.js';
import { STATUS_RELICS } from './statuses_relics.js';
import { STATUS_GSAFE } from './statuses_gsafe.js';
import { STATUS_GGREEDY } from './statuses_ggreedy.js';
import { STATUS_GRAFTSX } from './statuses_ggraftsx.js';
import { CARDS_MARROW } from './cards_marrow.js';
import { CARDS_WICK } from './cards_wick.js';
import { CARDS_ODILE } from './cards_odile.js';
import { CARDS_ANY } from './cards_any.js';
import { CARDS_JUNK } from './cards_junk.js';
import { GRAFTS_SAFE } from './grafts_safe.js';
import { GRAFTS_GREEDY } from './grafts_greedy.js';
import { GRAFTS_WEIRD } from './grafts_weird.js';
import { GRAFTS_EXTRA } from './grafts_extra.js';
import { ENEMIES_1 } from './enemies_1.js';
import { ENEMIES_2 } from './enemies_2.js';
import { ENEMIES_3 } from './enemies_3.js';
import { BOSSES } from './bosses.js';
import { RELIC_LIST } from './relics.js';
import { POTION_LIST } from './potions.js';
import { EVENT_LIST } from './events.js';
import { HERO_LIST } from './heroes.js';
import { SCHOOL_LIST } from './schools.js';

function byId(name, ...lists) {
  const m = {};
  for (const l of lists) for (const x of l) {
    if (m[x.id]) throw new Error(`duplicate ${name} id ${x.id}`);
    m[x.id] = x;
  }
  return m;
}
export const STATUSES = byId('status', STATUS_LIST, STATUS_MARROW, STATUS_WICK, STATUS_ODILE, STATUS_GRAFTS, STATUS_E1, STATUS_E2, STATUS_E3, STATUS_RELICS, STATUS_GSAFE, STATUS_GGREEDY, STATUS_GRAFTSX);
export const CARDS = byId('card', CARDS_MARROW, CARDS_WICK, CARDS_ODILE, CARDS_ANY, CARDS_JUNK);
export const GRAFTS = byId('graft', GRAFTS_SAFE, GRAFTS_GREEDY, GRAFTS_WEIRD, GRAFTS_EXTRA);
export const ENEMIES = byId('enemy', ENEMIES_1, ENEMIES_2, ENEMIES_3, BOSSES);
export const RELICS = byId('relic', RELIC_LIST);
export const POTIONS = byId('potion', POTION_LIST);
export const EVENTS = byId('event', EVENT_LIST);
export const HEROES = byId('hero', HERO_LIST);
export const SCHOOLS = byId('school', SCHOOL_LIST);
export const CARD_LIST = Object.values(CARDS);
export const GRAFT_LIST = Object.values(GRAFTS);
export const ENEMY_LIST = Object.values(ENEMIES);
