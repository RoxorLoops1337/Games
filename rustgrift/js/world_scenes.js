'use strict';
// ===================== WORLD_SCENES: Crews & Turf map, venues, social UI (owned by the world_scenes agent) =====================
// Implements the scene side of WORLD_DESIGN.md: WorldMapScene, VenueScene, HomeStudioScene, FinaleIntroScene, DawnScene,
// RequestsModal, CrewsModal, FavoursModal, StreetBuzzModal and the RewardScene "Street Cred" strip.
// Everything talks to the logic layer only through the `World` API (section 8) and the data globals (section 10). Until the logic
// agent's world.js exists, a small private mock (WS_MOCK, bottom of the data section) stands in; it is never used once `World` exists.
// Art: the sticker-zine helpers of art_scenes.js (scn_*), icon(), drawBackdrop(), drawCard() and the Hocus Vocus rigs (ART.rj).
// Static art (paper, roads, badges, washes, crests) is baked into offscreen layers (scn_layer) so a map frame is mostly drawImage.
// Input: immediate mode like scenes.js. Panels and buttons that sit on top are drawn (and so consume In.click) before the deferred
// world hit test at the end of draw(), so the front-most thing always wins a tap. Every hit target is >= 44 px (1280x720 logical).
// Research notes that shaped this pass:
//  - Touch targets: Apple HIG / Material 44pt-48dp and WCAG 2.5.5 44x44 CSS px; padding a small icon's hit box is fine
//    (dequeuniversity.com/rules/attest-ios/1.0/touch-target-size, browserstack.com/docs/app-accessibility/rule-repository/rules-list/touch-target-size)
//    -> venue hit circles >= 60 px, buttons >= 52 px tall, no hover-only info (every tooltip also exists as a tap panel).
//  - Context-sensitive social menus, show only what matters, progressive disclosure on small screens
//    (create.roblox.com/docs/production/game-design/ui-ux-design) -> NPC panel lists only World.actions(npc), disabled ones explain why on tap.
//  - Wheel vs list dialogue layouts (itch.io/devlog/248594/game-ui-rpg-wheel-stack) -> portrait + one speech bubble + a short action list.
//  - Hub topology and orientation: a hub links sections, symmetric/cued layouts make maps predictable
//    (emshort.blog/how-to-play/writing-if/my-articles/geography/) -> Home Studio is the hub, roads are marker routes, next-door routes glow.
//  - Griftlands: relationships sorted by how people feel, factions with rival penalties, a fixed world layout with procedural content
//    (en.wikipedia.com/wiki/Griftlands, forums.kleientertainment.com/forums/topic/108780-first-thoughts-and-feedback/) -> CrewsModal steps
//    -3..+3 with what each step does, rival/friend lines, the same city each run with turf that changes.

// ---------------------------------------------------------------- data access (real globals first, mock only as a fallback)
const WS_HERO_RJ = { rook: 'roxor', pia: 'jasmin', mourn: 'andy', claw: 'rawclaw' };
const WS = { returnVenue: null, seenRun: null };
function wsReal() { return typeof World !== 'undefined' && World && typeof World.travel === 'function'; }
function wsW() { return wsReal() ? World : WS_MOCK.api; }
function wsD() {
  const M = WS_MOCK.data;
  return {
    CREWS: typeof CREWS !== 'undefined' ? CREWS : M.CREWS,
    NPCS: typeof NPCS !== 'undefined' ? NPCS : M.NPCS,
    VENUES: typeof VENUES !== 'undefined' ? VENUES : M.VENUES,
    EDGES: typeof EDGES !== 'undefined' ? EDGES : M.EDGES,
    SN: typeof STANDING_NAMES !== 'undefined' ? STANDING_NAMES : M.STANDING_NAMES,
    RT: typeof REQUEST_TYPES !== 'undefined' ? REQUEST_TYPES : M.REQUEST_TYPES
  };
}
function wsWorld() { return G.run && G.run.world; }
function wsTry(fn, d) { try { const v = fn(); return v === undefined ? d : v; } catch (e) { console.warn('[world_scenes]', e); return d; } }
function wsCrewIds() { return Object.keys(wsD().CREWS); }
function wsCrew(id) { return wsD().CREWS[id] || null; }
function wsNpc(id) { return wsD().NPCS[id] || null; }
function wsVenue(id) { return wsD().VENUES[id] || null; }
function wsName(id) {
  const d = wsD(); const x = d.NPCS[id] || d.CREWS[id] || d.VENUES[id];
  if (wsReal() && World.name) { const n = wsTry(() => World.name(id), null); if (n) return n; }
  return x ? x.name : (id === 'none' ? 'Nobody' : id === 'contested' ? 'Contested' : String(id));
}
function wsCol(id, k) {
  const cr = wsCrew(id);
  if (!cr) return id === 'contested' ? (k === 'dark' ? '#8a7a40' : k === 'light' ? '#fff3b8' : ZP.yel) : (k === 'dark' ? '#7d756a' : k === 'light' ? '#efe9dc' : '#cfc6b8');
  return k === 'dark' ? (cr.colorDark || scn_mix(cr.color, '#000000', .35)) : k === 'light' ? (cr.colorLight || scn_mix(cr.color, '#ffffff', .5)) : cr.color;
}
function wsTurf(v) { const r = wsTry(() => wsW().turf(v), null); if (r) return r; const w = wsWorld(); return (w && w.turf && w.turf[v]) || (wsVenue(v) && wsVenue(v).district) || 'none'; }
function wsStanding(cr) { const r = wsTry(() => wsW().standing(cr), null); if (typeof r === 'number') return r; const w = wsWorld(); return (w && w.standing && w.standing[cr]) || 0; }
function wsStName(n) { n = clamp(Math.round(n), -3, 3); const r = wsTry(() => wsW().standingName(n), null); return r || wsD().SN[String(n)] || String(n); }
function wsRapport(id) { const r = wsTry(() => wsW().rapport(id), null); if (typeof r === 'number') return r; const w = wsWorld(); return (w && w.npc && w.npc[id] && w.npc[id].rapport) || 0; }
function wsBuzz() { const r = wsTry(() => wsW().buzz(), null); return typeof r === 'number' ? r : ((wsWorld() && wsWorld().buzz) || 0); }
function wsNpcsAt(v) { const r = wsTry(() => wsW().npcsAt(v), []) || []; return r.map(x => typeof x === 'string' ? x : x && x.id).filter(Boolean); }
function wsNeighbors(v) { return (wsTry(() => wsW().neighbors(v), []) || []).map(n => typeof n === 'string' ? { id: n, cost: 1, locked: false } : n); }
function wsRequests() { return wsTry(() => wsW().requests(), null) || (wsWorld() && wsWorld().requests) || []; }
function wsFavours() { return wsTry(() => wsW().favours(), null) || (wsWorld() && wsWorld().favours) || []; }
function wsRumors() { return wsTry(() => wsW().rumors(), null) || (wsWorld() && wsWorld().rumors) || []; }
function wsStageOpen() { return !!wsTry(() => wsW().stageUnlocked(), false); }
function wsSlotIdx() { const w = wsWorld(); if (w && typeof w.slot === 'number') return clamp(w.slot, 0, 2); const n = wsTry(() => wsW().slotName(), 'Day'); return Math.max(0, ['Day', 'Dusk', 'Night'].indexOf(n)); }
function wsDay() { const w = wsWorld(); return (w && w.day) || 1; }
function wsHeroRj() { const ch = G.run && charById(G.run.char); return (ch && ch.spec && ch.spec.kind === 'rj' && ch.spec.rj) || WS_HERO_RJ[G.run && G.run.char] || 'roxor'; }
function wsRjOf(id) { const n = wsNpc(id); if (n && n.rj) return n.rj; if (id === 'jordan') return 'jordan'; const e = typeof ENEMIES !== 'undefined' && ENEMIES[id]; if (e && e.spec && e.spec.kind === 'rj') return e.spec.rj; return 'npc_' + id; }
function wsRumorText(r) { return typeof r === 'string' ? r : r ? (r.text || r.line || r.msg || '') : ''; }
function wsRumorCrew(r) {
  if (r && typeof r === 'object' && r.crew) return r.crew;
  const s = wsRumorText(r).toLowerCase();
  for (const id of wsCrewIds()) { const cr = wsCrew(id); if (s.includes(id.replace('_', ' ')) || (cr.short && s.includes(cr.short.toLowerCase())) || (cr.name && s.includes(cr.name.toLowerCase().replace(/^the /, '')))) return id; }
  for (const n of Object.values(wsD().NPCS)) if (wsCrew(n.crew) && n.name && s.includes(n.name.toLowerCase())) return n.crew;
  return null;
}
function wsReqVenue(r) { if (r.venue) return r.venue; const n = r.target && wsNpc(r.target); if (n) return n.venue; return null; }
function wsReqIcon(type) { const rt = wsD().RT[type]; return (rt && rt.icon) || { silence: 'mouth', deliver: 'chest', favour: 'coin', turf: 'shield', scout: 'compass' }[type] || 'question'; }
function wsReqDesc(r) { const rt = wsD().RT[r.type]; return r.desc || wsTry(() => rt && rt.describe && rt.describe(r), null) || (rt ? rt.label : r.type) || 'A favour.'; }
function wsRewardText(rw) {
  if (rw == null) return '';
  if (typeof rw === 'string') return rw; if (typeof rw === 'number') return rw + ' shil';
  const out = [];
  if (rw.shil || rw.money || rw.gold) out.push((rw.shil || rw.money || rw.gold) + ' shil');
  if (rw.card) out.push('a card'); if (rw.graft) out.push('a graft'); if (rw.favour) out.push('a new Favour');
  if (rw.standing) out.push('+' + rw.standing + ' standing'); if (rw.rapport) out.push('+' + rw.rapport + ' rapport');
  return out.join(', ') || rw.text || '';
}
// standing effects (section 5), shown in the crews modal and the venue header
const WS_ST_FX = {
  '3': 'Bonded: their Boss can join you as a Favour and hands over a unique Graft once. All Friend perks.',
  '2': 'Friend: their shops are 25% cheaper, street grunts let you pass for free, better Requests.',
  '1': 'Friendly: they chat and hand out Requests. One more good deed to reach Friend.',
  '0': 'Neutral: business as usual. Help them (or their friends) to climb.',
  '-1': 'Wary: still talking, still offering Requests, but one more slight and they turn on you.',
  '-2': 'Enemy: their streets ambush you (no Talk, +1 enemy), shops +30%, their turf is hostile.',
  '-3': 'Hostile: every dawn their Enforcer hunts you down. Ambushes, shops +30%.'
};
const WS_TYPE = {
  lair: { col: ZP.pink, icon: 'shield', label: 'Crew Lair' }, street: { col: ZP.sky, icon: 'fist', label: 'Street' },
  market: { col: ZP.yel, icon: 'shop', label: 'Market' }, den: { col: ZP.lav, icon: 'question', label: 'Den' },
  rest: { col: ZP.limeL, icon: 'tent', label: 'Rest Stop' }, studio: { col: '#ffffff', icon: 'star', label: 'Home Studio' },
  stage: { col: ZP.orange, icon: 'crown', label: 'The Stage' }
};
const WS_SLOTS = ['Day', 'Dusk', 'Night'];
const WS_DAYS = 6;

// ---------------------------------------------------------------- MOCK (only when the real World is absent; inert otherwise)
const WS_MOCK = (function () {
  const CREWS = {
    loop_rats: { id: 'loop_rats', name: 'The Loop Rats', color: '#6cc22e', colorDark: '#3f8f1a', colorLight: '#c4f08e', rivals: ['gloss'], friends: ['scrap_kings'], sound: 'street beatbox & loopers', motto: 'Again! Again! Again!', blurb: 'Chaotic, loud, loyal buskers.', icon: 'fist' },
    gloss: { id: 'gloss', name: 'The Gloss Suits', color: '#f4b6e0', colorDark: '#c4609e', colorLight: '#ffe3f4', rivals: ['loop_rats'], friends: ['bass_cartel'], sound: 'smooth label execs', motto: 'Sign here, darling.', blurb: 'Chrome smiles and contracts.', icon: 'gem' },
    bass_cartel: { id: 'bass_cartel', name: 'The Bass Cartel', color: '#7a45b0', colorDark: '#4a2370', colorLight: '#cdb6ee', rivals: ['static_choir'], friends: ['gloss'], sound: 'subwoofer gangsters', motto: 'Feel it in your chest.', blurb: 'Big hits, bigger speakers.', icon: 'quake' },
    static_choir: { id: 'static_choir', name: 'The Static Choir', color: '#3fd8e8', colorDark: '#1597b0', colorLight: '#bff4fa', rivals: ['bass_cartel'], friends: [], sound: 'hush-cult whisperers', motto: 'Shhhhhhh.', blurb: 'They mute people.', icon: 'eye' },
    scrap_kings: { id: 'scrap_kings', name: 'The Scrap Kings', color: '#ff8a2a', colorDark: '#c45a10', colorLight: '#ffd1a6', rivals: [], friends: ['loop_rats'], sound: 'junkyard rig-builders', motto: 'If it hums, we built it.', blurb: 'Machines and drones.', icon: 'gear' }
  };
  const V = (id, name, district, type, x, y, bg, blurb) => ({ id, name, district, type, x, y, bg, blurb });
  const VENUES = {};
  [V('home_studio', 'Home Studio', 'neutral', 'studio', 640, 300, 'camp', 'Your crash pad, mixing desk and merch table. Jordan is always here.'),
  V('busker_alley', 'Busker Alley', 'loop_rats', 'lair', 150, 300, 'alley', 'Loop pedals stacked like bricks. The Loop Rats hold court here.'),
  V('tape_market', 'Tape Market', 'loop_rats', 'market', 250, 140, 'market', 'Cassettes, pedals and dodgy cables by the kilo.'),
  V('crosswalk', 'The Crosswalk', 'loop_rats', 'street', 270, 470, 'alley', 'Buskers on every corner, fighting for the green light.'),
  V('label_tower', 'Label Tower', 'gloss', 'lair', 640, 70, 'market', 'Pearl-pink glass and a lobby full of lawyers.'),
  V('velvet_lounge', 'Velvet Lounge', 'gloss', 'street', 470, 170, 'night', 'Where deals are whispered over pink lemonade.'),
  V('contract_kiosk', 'Contract Kiosk', 'gloss', 'market', 830, 150, 'market', 'Sign anything. Read nothing.'),
  V('sub_basement', 'Sub Basement', 'bass_cartel', 'lair', 1130, 300, 'foundry', 'The walls shake. So do the visitors.'),
  V('club_woofer', 'Club Woofer', 'bass_cartel', 'street', 1000, 160, 'night', 'The bass drop that never stops.'),
  V('speaker_depot', 'Speaker Depot', 'bass_cartel', 'market', 1010, 460, 'foundry', 'Cones, cabinets and chains.'),
  V('hush_chapel', 'Hush Chapel', 'static_choir', 'lair', 640, 510, 'night', 'Silence is a sermon here.'),
  V('echo_cellar', 'Echo Cellar', 'static_choir', 'den', 470, 460, 'night', 'Every word comes back. Some come back changed.'),
  V('choir_steps', 'Choir Steps', 'static_choir', 'street', 800, 470, 'night', 'Robed kids hum on the stairs.'),
  V('scrapyard', 'The Scrapyard', 'scrap_kings', 'lair', 440, 310, 'foundry', 'Cranes, sparks and a throne made of amps.'),
  V('rust_bridge', 'Rust Bridge', 'scrap_kings', 'street', 850, 300, 'alley', 'Creaky, welded, mostly safe.'),
  V('junk_cafe', 'Junk Cafe', 'scrap_kings', 'rest', 640, 420, 'camp', 'Hot soup in hubcaps. Nobody fights at the Cafe.'),
  V('the_stage', 'The Stage', 'neutral', 'stage', 640, 190, 'night', 'The Headliner Night happens here. Locked until Day 6 Night or Buzz 8.')
  ].forEach(v => VENUES[v.id] = v);
  const EDGES = [['home_studio', 'scrapyard'], ['home_studio', 'rust_bridge'], ['home_studio', 'junk_cafe'], ['home_studio', 'the_stage'], ['busker_alley', 'tape_market'], ['busker_alley', 'crosswalk'], ['busker_alley', 'scrapyard'],
  ['tape_market', 'velvet_lounge'], ['crosswalk', 'echo_cellar'], ['label_tower', 'velvet_lounge'], ['label_tower', 'contract_kiosk'], ['label_tower', 'the_stage'], ['velvet_lounge', 'junk_cafe'], ['contract_kiosk', 'club_woofer'],
  ['club_woofer', 'sub_basement'], ['club_woofer', 'rust_bridge'], ['sub_basement', 'speaker_depot'], ['speaker_depot', 'choir_steps'], ['choir_steps', 'hush_chapel'], ['choir_steps', 'rust_bridge'], ['hush_chapel', 'echo_cellar'],
  ['echo_cellar', 'junk_cafe'], ['scrapyard', 'junk_cafe']];
  const N = (id, name, crew, role, venue, enemy, title, o = {}) => Object.assign({ id, name, crew, role, venue, enemy, title, rj: 'npc_' + id, shop: role === 'merchant', nightOnly: false, blurb: title + '.', barks: ['Hm.'], greet: ['Oh, it\'s you.'] }, o);
  const NPCS = {};
  [N('loop_mama', 'Mama Loop', 'loop_rats', 'boss', 'busker_alley', 'baron', 'Elder Busker Queen', { greet: ['Again, baby. Everything sounds better the second time.'] }),
  N('loop_stomp', 'Stomp', 'loop_rats', 'enforcer', 'busker_alley', 'brute', 'Tap-dancing bruiser', { greet: ['Nobody gets past the stomp.'] }),
  N('loop_echo', 'Echo', 'loop_rats', 'grunt', 'crosswalk', 'rat', 'Kid with a megaphone', { greet: ['HEY! HEY! HEY!'] }),
  N('loop_dotty', 'Dotty Dub', 'loop_rats', 'merchant', 'tape_market', 'bandit', 'Pedal merchant', { greet: ['Pedals! Loopers! Fresh off a truck, do not ask which truck.'] }),
  N('gloss_sheen', 'Madame Sheen', 'gloss', 'boss', 'label_tower', 'baron', 'CEO of Gloss'),
  N('gloss_mute', 'Mr. Mute', 'gloss', 'enforcer', 'label_tower', 'venn', 'Silent security', { greet: ['...'] }),
  N('gloss_tune', 'Agent Autotune', 'gloss', 'grunt', 'velvet_lounge', 'smuggler', 'Pitch-perfect agent', { greet: ['You sound flat. I can fix that. For a fee.'] }),
  N('gloss_sol', 'Sleek Sol', 'gloss', 'fixer', 'contract_kiosk', 'smuggler', 'Contract salesman', { greet: ['Every handshake is a contract, friend.'] }),
  N('cartel_sub', 'Big Sub', 'bass_cartel', 'boss', 'sub_basement', 'baron', 'Head of the Cartel'),
  N('cartel_drop', 'Drop', 'bass_cartel', 'enforcer', 'sub_basement', 'brute', 'Always about to drop'),
  N('cartel_kick', 'Kick', 'bass_cartel', 'grunt', 'club_woofer', 'thug', 'Kick-drum twin', { greet: ['Boom. Boom. You hear that? That is my heart.'] }),
  N('cartel_wanda', 'Woofer Wanda', 'bass_cartel', 'merchant', 'speaker_depot', 'bandit', 'Speaker stall owner', { greet: ['Need more low end, sweetie?'] }),
  N('choir_hush', 'The Hush', 'static_choir', 'boss', 'hush_chapel', 'baron', 'The voice of silence'),
  N('choir_crackle', 'Cantor Crackle', 'static_choir', 'enforcer', 'hush_chapel', 'venn', 'Sparking cantor'),
  N('choir_fuzz', 'Choirboy Fuzz', 'static_choir', 'grunt', 'choir_steps', 'thug', 'Fuzzy-haired choirboy', { nightOnly: true }),
  N('choir_reverb', 'Brother Reverb', 'static_choir', 'fixer', 'echo_cellar', 'smuggler', 'Kind, echoing monk', { greet: ['Ho ho ho... ho... ho...'] }),
  N('scrap_cassette', 'King Cassette', 'scrap_kings', 'boss', 'scrapyard', 'baron', 'Crowned in tape reels'),
  N('scrap_hammer', 'Jack Hammer', 'scrap_kings', 'enforcer', 'scrapyard', 'brute', 'Broad welder'),
  N('scrap_sparks', 'Sparks', 'scrap_kings', 'grunt', 'rust_bridge', 'drone', 'Wiry mechanic', { greet: ['Mind the wires. They bite.'] }),
  N('scrap_carla', 'Cog Carla', 'scrap_kings', 'merchant', 'junk_cafe', 'bandit', 'Parts dealer', { greet: ['Parts for parts. Soup for free.'] }),
  N('jordan', 'Jordan', 'neutral', 'merchant', 'home_studio', null, 'Merch designer', { rj: 'jordan', greet: ['Hey superstar! New tote design, wanna see?'] })
  ].forEach(n => NPCS[n.id] = n);
  const STANDING_NAMES = { '-3': 'Hostile', '-2': 'Enemy', '-1': 'Wary', '0': 'Neutral', '1': 'Friendly', '2': 'Friend', '3': 'Bonded' };
  const REQUEST_TYPES = {
    silence: { id: 'silence', label: 'Silence', icon: 'mouth', describe: r => `Shut ${NPCS[r.target] ? NPCS[r.target].name : 'someone'} up (fight or talk).` },
    deliver: { id: 'deliver', label: 'Delivery', icon: 'chest', describe: r => `Carry a parcel to ${VENUES[r.venue] ? VENUES[r.venue].name : 'somewhere'}.` },
    favour: { id: 'favour', label: 'Favour', icon: 'coin', describe: r => 'Chip in 30 shil.' },
    turf: { id: 'turf', label: 'Turf War', icon: 'shield', describe: r => `Beat the Enforcer of ${VENUES[r.venue] ? VENUES[r.venue].name : 'a lair'}.` },
    scout: { id: 'scout', label: 'Scout', icon: 'compass', describe: r => 'Visit two venues and report back.' }
  };
  const data = { CREWS, NPCS, VENUES, EDGES, STANDING_NAMES, REQUEST_TYPES };
  const D = () => wsD(); const w = () => G.run && G.run.world;
  const adjEdges = v => D().EDGES.filter(e => e[0] === v || e[1] === v).map(e => e[0] === v ? e[1] : e[0]);
  const api = {
    _mock: true,
    init(run, act) {
      const d = D(), turf = {}, npc = {}, standing = {}, half = {};
      Object.values(d.VENUES).forEach(v => turf[v.id] = v.district === 'neutral' ? 'none' : v.district);
      Object.keys(d.NPCS).forEach(id => npc[id] = { rapport: 0, defeated: false, recruited: false, metToday: false, giftedToday: false, hiddenUntil: 0 });
      Object.keys(d.CREWS).forEach(id => { standing[id] = 0; half[id] = 0; });
      const tw = { rook: ['loop_rats', 1, 'gloss', -1], pia: ['gloss', 1, 'scrap_kings', -1], mourn: ['bass_cartel', 1, 'static_choir', -1], claw: ['scrap_kings', 1] }[run.char] || [];
      for (let i = 0; i < tw.length; i += 2) standing[tw[i]] = tw[i + 1];
      run.world = { act: act || 1, day: 1, slot: 0, at: 'home_studio', standing, half, turf, npc, requests: [], favours: [], buzz: 0, rumors: ['Word on the street: a new act just rolled into the Rust Quarter.'], pending: null, flags: {}, log: [] };
      run.map = null; return run.world;
    },
    npcsAt(v) {
      const d = D(), W_ = w(), out = [];
      Object.values(d.NPCS).forEach(n => {
        if (n.venue !== v) return; const st = W_.npc[n.id] || {};
        if (st.defeated || st.recruited) return; if (n.nightOnly && W_.slot < 2) return;
        if (n.role === 'boss' && Math.abs(api.standing(n.crew)) < 3) return;
        out.push(n.id);
      });
      return out;
    },
    neighbors(v) { return adjEdges(v).map(id => ({ id, cost: 1, locked: id === 'the_stage' && !api.stageUnlocked(), why: id === 'the_stage' && !api.stageUnlocked() ? 'The Stage opens on Day 6 Night, or once your Buzz reaches 8.' : '' })); },
    travel(to) {
      const W_ = w(), nb = api.neighbors(W_.at).find(n => n.id === to);
      if (!nb) return { ok: false, why: 'Not next door.' }; if (nb.locked) return { ok: false, why: nb.why };
      api.advance(1); W_.at = to; const events = [];
      const owner = W_.turf[to], vt = D().VENUES[to].type;
      if (owner && D().CREWS[owner] && api.standing(owner) <= -2 && vt === 'street') {
        const g = Object.values(D().NPCS).find(n => n.crew === owner && n.role === 'grunt');
        if (g) events.push({ type: 'ambush', text: `${g.name} jumps you!`, encounter: { kind: 'encounter', mode: 'fight', enemies: [g.id], npc: g.id, venue: to, flags: { ambush: true } } });
      } else if (Math.random() < .25) events.push({ type: 'text', text: pick(['A busker tips his hat at you.', 'You find 5 shil in a gutter.', 'Someone spray-painted your name. Nice.']) });
      return { ok: true, arrivedAt: to, events };
    },
    slotName() { return WS_SLOTS[w().slot]; }, dayLabel() { return 'Day ' + w().day; }, timeLeft() { return (WS_DAYS - w().day) * 3 + (2 - w().slot); },
    advance(n) { const W_ = w(); W_.slot += n; let lines = null; while (W_.slot > 2) { W_.slot -= 3; W_.day++; lines = api.endDay(); } return lines; },
    endDay() {
      const W_ = w(), d = D(), lines = [];
      Object.values(W_.npc).forEach(s => { s.metToday = false; s.giftedToday = false; s.defeated = false; });
      if (Math.random() < .6) {
        const streets = Object.values(d.VENUES).filter(v => v.type === 'street' || v.type === 'market'), v = pick(streets), crews = Object.keys(d.CREWS), cr = pick(crews.filter(c => c !== W_.turf[v.id]));
        lines.push({ crew: cr, text: `${d.CREWS[cr].name} muscled in on ${v.name} overnight.` }); W_.turf[v.id] = cr;
      }
      lines.push({ crew: pick(Object.keys(d.CREWS)), text: pick(['Rumour has it Madame Sheen bought a second moon.', 'The Bass Cartel blew out three speakers. Again.', 'The Static Choir held a silent rave. Nobody heard about it.', 'King Cassette is building a robot band.']) });
      W_.rumors.push(...lines); return lines;
    },
    standing(cr) { return (w().standing[cr]) || 0; }, standingName(n) { return STANDING_NAMES[String(clamp(n, -3, 3))]; },
    adjust(cr, d) { const W_ = w(); W_.standing[cr] = clamp((W_.standing[cr] || 0) + d, -3, 3); },
    rapport(id) { return (w().npc[id] || {}).rapport || 0; }, adjustRapport(id, d) { const s = w().npc[id]; if (s) s.rapport = clamp(s.rapport + d, -2, 2); },
    actions(id) {
      const n = D().NPCS[id], st = w().npc[id] || {}, crSt = D().CREWS[n.crew] ? api.standing(n.crew) : 0, out = [];
      out.push({ id: 'chat', label: 'Chat', cost: { slots: 0, shil: 0 }, enabled: !st.metToday, why: st.metToday ? 'Already chatted today.' : '' });
      if (['fixer', 'merchant', 'boss'].includes(n.role) && id !== 'jordan') { const ok = st.rapport >= 0 && crSt >= -1 && w().requests.filter(r => r.state === 'active').length < 3; out.push({ id: 'request', label: 'Request', cost: { slots: 0, shil: 0 }, enabled: ok, why: ok ? '' : 'Needs rapport 0+, standing Wary+ and a free Request slot.' }); }
      if (n.shop) out.push({ id: 'trade', label: 'Trade', cost: { slots: 0, shil: 0 }, enabled: true, why: '' });
      if (['merchant', 'fixer'].includes(n.role)) { const ok = st.rapport >= 2 && w().favours.length < 3; out.push({ id: 'recruit', label: 'Recruit', cost: { slots: 0, shil: 40 }, enabled: ok && G.run.money >= 40, why: !ok ? (st.rapport < 2 ? 'Needs rapport 2 (chat and gift first).' : 'Your Favour list is full (3).') : G.run.money < 40 ? 'Not enough shil.' : '' }); }
      out.push({ id: 'gift', label: 'Gift', cost: { slots: 0, shil: 20 }, enabled: !st.giftedToday && G.run.money >= 20, why: st.giftedToday ? 'One gift a day.' : 'Not enough shil.' });
      if (n.role === 'grunt' && crSt >= 2) out.push({ id: 'pass', label: 'Pass', cost: { slots: 0, shil: 0 }, enabled: true, why: '' });
      if (n.enemy) { out.push({ id: 'fight', label: 'Fight', cost: { slots: 1, shil: 0 }, enabled: true, why: '' }); out.push({ id: 'talk', label: 'Talk', cost: { slots: 1, shil: 0 }, enabled: crSt > -2, why: crSt <= -2 ? 'They will not listen: you are their Enemy.' : '' }); }
      return out;
    },
    do(id, act) {
      const n = D().NPCS[id], st = w().npc[id], W_ = w();
      if (act === 'chat') { st.metToday = true; api.adjustRapport(id, 1); return { kind: 'text', lines: [pick(n.greet), pick(['You trade gossip about the crews.', 'You hum a hook together. It slaps.', 'They laugh at your joke. Mostly.']), `${n.name} likes you a bit more. (Rapport ${st.rapport})`] }; }
      if (act === 'trade') return { kind: 'shop' };
      if (act === 'gift') { st.giftedToday = true; G.run.money -= 20; api.adjustRapport(id, 1); return { kind: 'gift', lines: [`${n.name} beams at the gift.`, `Rapport ${st.rapport}.`] }; }
      if (act === 'recruit') { G.run.money -= 40; st.recruited = true; W_.favours.push(id); api.adjust(n.crew, 1); return { kind: 'recruit', lines: [`${n.name} joins your Favour list!`, 'Their Favour card is now in your decks.'] }; }
      if (act === 'pass') return { kind: 'text', lines: [`${n.name} waves you through. Friends of the crew walk free.`] };
      if (act === 'request') {
        const types = ['silence', 'deliver', 'favour', 'scout', 'turf'], type = pick(types), others = Object.values(D().NPCS).filter(x => x.crew !== n.crew && x.role === 'grunt'), tgt = pick(others), lair = Object.values(D().VENUES).find(v => v.type === 'lair' && v.district !== n.crew);
        const r = { id: 'rq' + Date.now(), type, giver: id, crew: n.crew, target: tgt.id, venue: type === 'turf' ? lair.id : type === 'deliver' ? pick(Object.keys(D().VENUES)) : tgt.venue, reward: { shil: 40, standing: 1 }, deadline: W_.day + 2, state: 'offered' };
        r.desc = REQUEST_TYPES[type].describe(r); return { kind: 'request', request: r, lines: [`${n.name}: I need a hand with something.`] };
      }
      if (act === 'fight' || act === 'talk') return { kind: 'encounter', mode: act, enemies: [id], npc: id, venue: W_.at, flags: { elite: n.role === 'enforcer' } };
      return { kind: 'text', lines: ['...'] };
    },
    beginEncounter(res) {
      const W_ = w(); W_.pending = res; const d = D(), enc = (res.enemies || []).map(id => (d.NPCS[id] && d.NPCS[id].enemy) || id).filter(id => ENEMIES[id]);
      if (!enc.length) enc.push('thug');
      if (res.mode === 'fight' || (res.flags && res.flags.ambush)) { api.advance(1); go(() => setScene(new BattleScene({ enemies: enc, node: { type: 'fight', enc }, elite: !!(res.flags && res.flags.elite), boss: !!(res.flags && res.flags.finale) }))); }
      else { api.advance(1); go(() => setScene(new EncounterScene({ enc, type: res.flags && res.flags.finale ? 'boss' : 'fight' }))); }
    },
    requests() { return w().requests; }, acceptRequest(r) { r.state = 'active'; w().requests.push(r); return true; },
    favours() { return w().favours; }, setFavours(a) { w().favours = a.slice(0, 3); },
    turf(v) { return w().turf[v] || 'none'; },
    buzz() { const W_ = w(), d = D(); let b = 0; Object.keys(W_.turf).forEach(v => { const c = W_.turf[v]; if (d.CREWS[c] && api.standing(c) >= 2) b++; }); Object.keys(d.CREWS).forEach(c => { if (api.standing(c) >= 3) b += 2; if (api.standing(c) <= -3) b--; }); b += W_.requests.filter(r => r.state === 'done').length; return Math.max(0, b); },
    finale() { const d = D(), low = Object.keys(d.CREWS).sort((a, b) => api.standing(a) - api.standing(b)); const boss = Object.values(d.NPCS).find(n => n.crew === low[0] && n.role === 'boss'), enf = Object.values(d.NPCS).find(n => n.crew === low[1] && n.role === 'enforcer'); return { kind: 'encounter', mode: 'fight', enemies: [boss.id, enf.id], npc: boss.id, venue: 'the_stage', flags: { finale: true } }; },
    stageUnlocked() { const W_ = w(); return (W_.day >= WS_DAYS && W_.slot === 2) || api.buzz() >= 8; },
    name(id) { const d = D(), x = d.NPCS[id] || d.CREWS[id] || d.VENUES[id]; return x ? x.name : id; },
    crewColor(id) { return D().CREWS[id] ? D().CREWS[id].color : '#cfc6b8'; },
    rumors() { return w().rumors.slice(-6); }
  };
  return { data, api };
})();
// dev helper: a mock-world run for standalone testing (does nothing special once the real World exists: it just calls newRun)
function wsMockRun(charId) {
  G.run = newRun(charId || 'rook');
  if (!G.run.world) WS_MOCK.api.init(G.run, 1);
  return G.run;
}

// ---------------------------------------------------------------- shared UI + art helpers
function wsFont(c, size, font, weight) { c.font = `${weight || ''} ${size}px ${font || FB}`.trim(); }
function wsFitSize(c, s, maxW, size, font, weight, min) { wsFont(c, size, font, weight); const w = c.measureText(s).width; return w <= maxW ? size : Math.max(min || 10, Math.floor(size * maxW / w)); }
function wsWrap(c, s, maxW, size, font) { wsFont(c, size, font); return wrapLines(c, s, maxW); }
// sticker button with optional icon and a cost chip; disabled buttons still answer a tap (onDisabled) so touch users learn why
function wsBtn(x, y, w, h, label, o = {}) {
  const c = ctx, dis = !!o.disabled, hov = UI.hit(x, y, w, h), id = 'ws|' + label + '|' + (x | 0) + '|' + (y | 0);
  if (hov) { UI.hotCur = id; UI.cursor = 'pointer'; if (UI.hotPrev !== id && !dis) Snd.play('hover'); }
  const sc = hov && !dis ? (In.down ? .97 : 1.04) : 1, col = dis ? '#d8d2de' : (o.col || ZP.yel);
  c.save(); c.translate(x + w / 2, y + h / 2); c.scale(sc, sc); c.translate(-w / 2, -h / 2);
  scn_sticker(c, 0, 0, w, h, Math.min(18, h / 2.4), col, { pad: o.pad == null ? 4 : o.pad, gloss: !dis, lw: 3, shadow: !dis });
  if (o.badge) { c.save(); c.translate(w - 4, 4); c.beginPath(); c.arc(0, 0, 13, 0, 6.3); c.fillStyle = ZP.pink; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); txt(c, String(o.badge), 0, 1, { size: 16, font: FD, weight: 800, color: '#fff', align: 'center', base: 'middle' }); c.restore(); }
  let lx = w / 2, avail = w - 20;
  const chip = o.cost ? String(o.cost) : '';
  let cw = 0;
  if (chip) { wsFont(c, 15, FM); cw = c.measureText(chip).width + 16; avail -= cw + 6; }
  if (o.icon) { icon(c, o.icon, 14 + h * .3, h / 2, h * .3); avail -= h * .6 + 6; }
  lx = (o.icon ? h * .6 + 18 : 10) + avail / 2;
  const size = wsFitSize(c, label, avail, o.size || Math.min(26, h * .46), FD, 800, 12);
  txt(c, label, lx, h / 2 + 1, { size, font: FD, weight: 800, color: dis ? '#9a93a6' : (o.tc || '#fff'), stroke: dis || (o.tc && o.tc !== '#fff') ? '#fff' : ZK, sw: dis ? 2 : size * .2, align: 'center', base: 'middle' });
  if (chip) { const cx = w - cw - 8; c.fillStyle = dis ? '#eee' : '#fff'; scn_rrect(c, cx, h / 2 - 12, cw, 24, 12); c.fill(); c.strokeStyle = ZK; c.lineWidth = 1.8; c.stroke(); txt(c, chip, cx + cw / 2, h / 2 + 6, { size: 15, font: FM, color: dis ? '#9a93a6' : ZK, align: 'center' }); }
  if (dis && o.lock !== false) icon(c, 'key', w - 6, h - 4, 10);
  c.restore();
  if (hov && In.click) { In.click = null; if (dis) { Snd.play('error'); if (o.onDisabled) o.onDisabled(); return false; } Snd.play('click'); return true; }
  return false;
}
// round close button (56 px)
function wsClose(x, y) { return wsBtn(x, y, 56, 56, 'X', { col: ZP.pink, size: 28 }); }
function wsCrestLayer(id, r) {
  return scn_layer('ws_crest_' + id + '_' + r, r * 2 + 16, r * 2 + 16, (c, w, h) => {
    const cx = w / 2, cy = h / 2, col = wsCol(id), cr = wsCrew(id);
    c.fillStyle = 'rgba(21,16,28,.2)'; c.beginPath(); c.arc(cx + 1.5, cy + 3, r + 4, 0, 6.3); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r + 4, 0, 6.3); c.fill();
    const g = c.createRadialGradient(cx - r * .3, cy - r * .4, r * .1, cx, cy, r * 1.1); g.addColorStop(0, scn_mix(col, '#ffffff', .45)); g.addColorStop(1, col);
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, 6.3); c.fill(); c.strokeStyle = ZK; c.lineWidth = Math.max(2, r * .1); c.stroke();
    if (cr) icon(c, cr.icon || 'star', cx, cy, r * .62); else txt(c, '?', cx, cy + 1, { size: r * 1.1, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 3, align: 'center', base: 'middle' });
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(cx - r * .35, cy - r * .5, r * .32, r * .13, -.5, 0, 6.3); c.fill();
  });
}
function wsCrest(c, id, x, y, r) { scn_blitC(c, wsCrestLayer(id, r), x, y, 1); }
// rapport hearts: two hearts, filled for +, cracked for -
function wsHearts(c, x, y, rap, s = 9) {
  for (let i = 0; i < 2; i++) {
    const hx = x + (i - .5) * s * 2.4;
    if (rap > i) scn_blitC(c, scn_dsprite('heart', s, { fill: ZP.pink, lw: 2, sticker: 2 }), hx, y, 1);
    else if (rap < -i) scn_blitC(c, scn_dsprite('brokenheart', s, { fill: '#b9b2c4', lw: 2, sticker: 2 }), hx, y, 1);
    else scn_blitC(c, scn_dsprite('heart', s, { fill: '#fff', lw: 2, sticker: 2, shine: false }), hx, y, 1);
  }
}
// standing bar -3..+3 with named steps
function wsStandingBar(c, x, y, w, n, crew, o = {}) {
  const step = w / 7, col = wsCol(crew);
  for (let i = 0; i < 7; i++) {
    const v = i - 3, bx = x + i * step, on = v === Math.round(n);
    const f = v < 0 ? scn_mix('#ff9cc6', '#d63a82', (-v) / 3) : v > 0 ? scn_mix('#c4f08e', '#3f8f1a', v / 3) : '#f2ecdf';
    c.save(); c.globalAlpha = on ? 1 : .55; scn_rrect(c, bx + 2, y, step - 4, 22, 7); c.fillStyle = f; c.fill(); c.strokeStyle = ZK; c.lineWidth = on ? 3 : 1.5; c.stroke(); c.restore();
    if (o.labels !== false) txt(c, wsStName(v), bx + step / 2, y + 40, { size: on ? 15 : 12, font: on ? FD : FB, weight: on ? 800 : '', color: on ? ZK : '#7a7186', align: 'center' });
  }
  const k = (clamp(n, -3, 3) + 3) * step + step / 2;
  c.save(); c.translate(x + k, y - 4); c.beginPath(); c.moveTo(-9, -12); c.lineTo(9, -12); c.lineTo(0, 2); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke(); c.restore();
}
// draw any actor id: an NPC rig, an rj enemy, or an old procedural ENEMIES spec (feet at x,y)
function wsActor(c, id, x, y, s, o = {}) {
  const npc = wsNpc(id), e = typeof ENEMIES !== 'undefined' ? ENEMIES[id] : null;
  if (npc || id === 'jordan' || (e && e.spec && e.spec.kind === 'rj') || !e || o.rj) {
    const rjid = o.rj || wsRjOf(id);
    if (o.pose === 'sing' && typeof RGFigure === 'function') RGFigure(c, rjid, x, y, s, { talk: 1 }, o.t || 0, !!o.flip, { expr: o.expr });
    else ART.rj.draw(c, rjid, { x, y, s, pose: o.pose || 'idle', t: o.t || 0, flip: !!o.flip, expr: o.expr });
  } else {
    c.save(); c.translate(x, y); c.scale(o.flip ? -s * 1.05 : s * 1.05, s * 1.05); drawFigure(c, e.spec, { t: o.t || 0, atk: 0, talk: 0 }); c.restore();
  }
}
// throttled figure cache: each standing figure is re-rendered into its own offscreen canvas at ~fps (round-robin, a few per frame)
// and blitted every frame, so a venue with 4-9 Hocus Vocus rigs stays well under the frame budget. Call wsFigBudget(n) once per frame.
const WS_FIGC = { _budget: 2 };
function wsFigBudget(n) { WS_FIGC._budget = n; }
function wsFigCached(c, key, id, x, y, s, o = {}) {
  const res = scn_res(), w = Math.ceil(360 * s), h = Math.ceil(400 * s), ax = w / 2, ay = Math.ceil(360 * s);
  let e = WS_FIGC[key];
  if (!e || e.res !== res || e.w !== w) { const cv = document.createElement('canvas'); cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res); e = WS_FIGC[key] = { cv, g: cv.getContext('2d'), res, w, h, t: -1, sig: '' }; }
  const sig = id + '|' + (o.pose || 'idle') + '|' + (o.expr || '') + '|' + (o.flip ? 1 : 0) + '|' + (o.rj || '');
  const due = e.t < 0 || (G.time - e.t >= 1 / (o.fps || 20) || e.sig !== sig) && WS_FIGC._budget > 0;
  if (due) {
    if (e.t >= 0) WS_FIGC._budget--;
    const g = e.g; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.cv.width, e.cv.height); g.setTransform(res, 0, 0, res, 0, 0);
    wsActor(g, id, ax, ay, s, Object.assign({}, o, { t: o.t != null ? o.t : G.time }));
    e.t = G.time; e.sig = sig;
  }
  c.drawImage(e.cv, x - ax, y - ay, w, h);
}
function wsRole(id) { const n = wsNpc(id); return n ? n.role : 'grunt'; }
function wsRoleScale(id) { const r = wsRole(id); return r === 'boss' ? 1.14 : r === 'enforcer' ? 1.04 : .94; }
// modal frame: scrim + big sticker panel + bubble title; returns panel rect
function wsModalFrame(c, title, col, o = {}) {
  c.fillStyle = 'rgba(21,16,28,.62)'; c.fillRect(0, 0, W, H);
  const x = o.x || 70, y = o.y || 36, w = o.w || W - 140, h = o.h || H - 66;
  scn_sticker(c, x, y, w, h, 26, '#fffaf0', { pad: 8, band: col || ZP.limeL, bandW: 6, lw: 4 });
  const L = scn_bubbleLayer(title, 44, o.tcol || ZP.pink, { seed: title.length, maxW: w - 220 });
  c.save(); c.translate(x + w / 2, y + 2); c.rotate(-.015); scn_blitC(c, L, 0, 0, 1); c.restore();
  return { x, y, w, h };
}
// typewriter text block (returns {done, h})
function wsTypeText(c, s, x, y, maxW, size, t0, o = {}) {
  const lines = wsWrap(c, s, maxW, size, o.font || FB), total = s.length, shown = o.instant ? total : Math.floor((G.time - t0) * (o.cps || 60));
  let n = 0;
  lines.forEach((l, i) => { const take = clamp(shown - n, 0, l.length); n += l.length + 1; if (take > 0) txt(c, l.slice(0, take), x, y + i * size * 1.25, { size, font: o.font || FB, color: o.color || ZK, align: o.align || 'left' }); });
  return { done: shown >= total, h: lines.length * size * 1.25 };
}
// speech bubble (white sticker with a tail pointing toward tx,ty)
function wsSpeech(c, x, y, w, h, tx, ty, o = {}) {
  c.save();
  const px = clamp(tx, x + 30, x + w - 30), side = ty < y ? -1 : 1, by = side < 0 ? y : y + h;
  c.fillStyle = 'rgba(21,16,28,.18)'; scn_rrect(c, x + 3, y + 6, w, h, 22); c.fill();
  c.beginPath(); c.moveTo(px - 18, by - side * 4); c.lineTo(tx, ty); c.lineTo(px + 18, by - side * 4); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3.5; c.lineJoin = 'round'; c.stroke();
  scn_rrect(c, x, y, w, h, 22); c.fillStyle = o.fill || '#fff'; c.fill(); c.stroke();
  c.beginPath(); c.moveTo(px - 15, by - side * 2); c.lineTo(px + 15, by - side * 2); c.lineWidth = 6; c.strokeStyle = o.fill || '#fff'; c.stroke();
  if (o.band) { c.strokeStyle = o.band; c.lineWidth = 4; scn_rrect(c, x + 7, y + 7, w - 14, h - 14, 16); c.stroke(); }
  c.restore();
}
// pop sticker (event / ambush / toast) centred at x,y with an elastic scale-in
function wsPop(c, text, x, y, k, col, o = {}) {
  const s = ease.back(clamp(k, 0, 1)); if (s <= 0.01) return;
  c.save(); c.translate(x, y); c.rotate(o.rot || -.03); c.scale(s, s);
  wsFont(c, o.size || 26, FD, 800); const tw = Math.min(o.maxW || 560, c.measureText(text).width + 50), lines = wsWrap(c, text, tw - 40, o.size || 26, FD), h = 26 + lines.length * (o.size || 26) * 1.15;
  if (o.burst) { c.fillStyle = scn_rgba(col, .55); scn_star(c, tw * .62, tw * .5, 14); c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke(); }
  scn_sticker(c, -tw / 2, -h / 2, tw, h, 20, col, { pad: 6, gloss: true, lw: 3.5 });
  lines.forEach((l, i) => txt(c, l, 0, -h / 2 + 13 + (i + .78) * (o.size || 26) * 1.15, o.tc ? { size: o.size || 26, font: FD, weight: 800, color: o.tc, align: 'center' } : { size: o.size || 26, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 5, align: 'center' }));
  c.restore();
}
// shortest path (venue ids) over EDGES
function wsPath(a, b) {
  if (a === b) return [a]; const E = wsD().EDGES, prev = { [a]: null }, q = [a];
  while (q.length) { const v = q.shift(); for (const e of E) { const nx = e[0] === v ? e[1] : e[1] === v ? e[0] : null; if (nx && !(nx in prev)) { prev[nx] = v; if (nx === b) { const p = [b]; let k = v; while (k) { p.unshift(k); k = prev[k]; } return p; } q.push(nx); } } }
  return null;
}
// remember the venue to return to when a borrowed scene (shop, rest, studio flows) calls makeMapScene()
function wsGoBorrowed(venue, make) { WS.returnVenue = venue; go(() => setScene(make())); }
// encounter handoff: World.beginEncounter may set the scene itself (with or without go()); never nest go()
function wsBegin(res) {
  WS.returnVenue = null;
  const before = G.scene;
  try { wsW().beginEncounter(res); } catch (e) { console.error('[world_scenes] beginEncounter', e); toast('Something went wrong.'); return; }
  if (G.scene === before && !G.trans && res && res.enemies && res.enemies.length) {
    const enc = res.enemies.filter(id => typeof ENEMIES !== 'undefined' && ENEMIES[id]);
    if (enc.length) go(() => setScene(new EncounterScene({ enc, type: res.flags && res.flags.finale ? 'boss' : res.flags && res.flags.elite ? 'elite' : 'fight' })));
  }
}

// ================================================================ CITY MAP ART
// venue layout pane (section 4: 1280x560 below the HUD) -> screen; keeps room for the title, clock, buzz meter and the bottom bar
// small artistic nudges (section 4 allows them; ids and edges are untouched) so the central column of badges + labels never overlaps
const WS_NUDGE = { junk_cafe: { y: 410 }, hush_chapel: { y: 528 } };
function wsVP(id) { const v = wsVenue(id); if (!v) return { x: W / 2, y: H / 2 }; const n = WS_NUDGE[id] || {}; return { x: 60 + (n.x != null ? n.x : v.x) * .9375, y: 175 + ((n.y != null ? n.y : v.y) - 70) * .98 }; }
function wsVR(id) { const v = wsVenue(id), t = v ? v.type : 'street'; return t === 'stage' ? 35 : t === 'lair' ? 35 : t === 'studio' ? 30 : 28; }
function wsHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function wsEdgeFn(a, b) {
  const A = wsVP(a), B = wsVP(b), mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
  const bend = ((wsHash(a < b ? a + b : b + a) % 100) / 100 - .5) * Math.min(60, L * .28), cx = mx - dy / L * bend, cy = my + dx / L * bend;
  return t => [(1 - t) * (1 - t) * A.x + 2 * t * (1 - t) * cx + t * t * B.x, (1 - t) * (1 - t) * A.y + 2 * t * (1 - t) * cy + t * t * B.y];
}
function wsEdgePath(c, a, b) { const f = wsEdgeFn(a, b); c.moveTo(...f(0)); for (let i = 1; i <= 24; i++) c.lineTo(...f(i / 24)); }
const WS_DISTRICT_LABEL = { loop_rats: 'BUSKER ROW', gloss: 'GLOSS HILL', bass_cartel: 'BASS END', static_choir: 'HUSH SIDE', scrap_kings: 'JUNK MILE' };
const WS_UI_RECTS = [[0, 60, 250, 126], [1030, 60, 250, 112], [240, 60, 800, 72], [0, 636, 370, 84], [890, 636, 390, 84]];
function wsMapBase() {
  return scn_layer('ws_map_base', W, H, (c) => {
    const r = scn_rng(1717), d = wsD();
    scn_paper(c, 0, 0, W, H, 1717, ZP.cream);
    // faint city blocks (the street grid of the quarter)
    c.save(); c.lineJoin = 'round';
    for (let gy = 150; gy < 640; gy += 62) for (let gx = 20 + ((gy / 62) % 2) * 30; gx < W - 30; gx += 88) {
      if (r() < .3) continue; const w = 50 + r() * 26, h = 34 + r() * 14;
      scn_rrect(c, gx, gy, w, h, 8); c.fillStyle = scn_rgba('#d8ccb0', .18 + r() * .1); c.fill(); c.strokeStyle = 'rgba(21,16,28,.09)'; c.lineWidth = 1.4; c.stroke();
    }
    c.restore();
    // district names in big faint marker at each district's centroid
    Object.keys(WS_DISTRICT_LABEL).forEach(cr => {
      const vs = Object.values(d.VENUES).filter(v => v.district === cr); if (!vs.length) return;
      const p = vs.map(v => wsVP(v.id)), cx = p.reduce((a, q) => a + q.x, 0) / p.length, cy = p.reduce((a, q) => a + q.y, 0) / p.length;
      txt(c, WS_DISTRICT_LABEL[cr], cx, cy + 6, { size: 30, font: FM, color: 'rgba(21,16,28,.12)', align: 'center', rot: (r() - .5) * .2 });
    });
    // hand-drawn page frame
    c.strokeStyle = ZK; c.lineWidth = 3; c.lineJoin = 'round'; scn_rrect(c, 8, 66, W - 16, H - 74, 18); c.stroke();
    scn_doodle(c, 'star', 18, H - 14, 13, { fill: ZP.pinkL, sticker: 3, lw: 2.2, rot: .2 });
    scn_doodle(c, 'star', W - 18, 76, 11, { fill: ZP.limeL, sticker: 3, lw: 2.2, rot: -.2 });
  });
}
function wsMapRoads() {
  return scn_layer('ws_map_roads', W, H, (c) => {
    const d = wsD(), r = scn_rng(5150);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    const all = (w, col, dash) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash || []); c.beginPath(); d.EDGES.forEach(e => wsEdgePath(c, e[0], e[1])); c.stroke(); };
    all(26, 'rgba(21,16,28,.18)'); all(22, ZK); all(17, '#fbf8f0'); all(3, scn_rgba(ZP.yel, .95), [10, 10]);
    c.restore();
    // doodles and mini landmarks in the free spaces
    const pts = []; d.EDGES.forEach(e => { const f = wsEdgeFn(e[0], e[1]); for (let i = 0; i <= 20; i++) pts.push(f(i / 20)); });
    const vs = Object.keys(d.VENUES).map(id => [wsVP(id), wsVR(id)]);
    const free = (x, y, s) => {
      if (x - s < 20 || x + s > W - 20 || y - s * 1.4 < 76 || y + s > 700) return false;
      for (const u of WS_UI_RECTS) if (x + s > u[0] && x - s < u[0] + u[2] && y + s > u[1] && y - s * 1.4 < u[1] + u[3]) return false;
      for (const [p, rr] of vs) if ((p.x - x) ** 2 + (p.y - y) ** 2 < (rr + s + 70) ** 2) return false;
      for (const p of pts) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < (s + 16) ** 2) return false;
      return true;
    };
    const placed = [];
    const place = (n, smin, smax, kinds) => {
      for (let i = 0, k = 0; i < 900 && k < n; i++) {
        const s = smin + r() * (smax - smin), x = 20 + r() * (W - 40), y = 80 + r() * 620;
        if (!free(x, y, s) || placed.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < (p[2] + s + 12) ** 2)) continue;
        placed.push([x, y, s]); k++;
        const kind = pick2(r, kinds);
        if (['tree', 'speakers', 'cat', 'hill'].includes(kind)) scn_lm(c, kind, x, y, s, r, 1);
        else { const fill = (kind === 'heart' || kind === 'star' || kind === 'flower') && r() < .6 ? pick2(r, [ZP.pinkL, ZP.limeL, ZP.yel, ZP.sky]) : kind === 'smiley' ? ZP.yel : null; scn_doodle(c, kind, x, y, s, { fill, col: fill ? ZK : (r() < .7 ? ZK : ZP.pinkD), rot: (r() - .5) * .6, lw: 2 }); }
      }
    };
    place(9, 18, 26, ['tree', 'speakers', 'cat', 'tree', 'hill']);
    place(34, 7, 13, ['heart', 'star', 'sparkle', 'note', 'note1', 'plus', 'loop', 'smiley', 'flower', 'dash', 'swirl']);
  });
}
// district wash for one venue in one owner colour (cached per venue x owner)
function wsWash(vid, owner) {
  const v = wsVenue(vid), R = v && v.type === 'lair' ? 150 : 118;
  return scn_layer('ws_wash_' + vid + '_' + owner, R * 2.6, R * 2.4, (c, w, h) => {
    const r = scn_rng(wsHash(vid) + 7);
    if (owner === 'contested') {
      scn_spray(c, w / 2, h / 2, R * .9, ZP.yel, r, { a: .38, dots: 260 });
      c.save(); c.beginPath(); c.arc(w / 2, h / 2, R * .7, 0, 6.3); c.clip(); c.strokeStyle = 'rgba(21,16,28,.14)'; c.lineWidth = 3; for (let k = -w; k < w; k += 16) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke(); } c.restore();
      return;
    }
    if (!wsCrew(owner)) return;
    scn_spray(c, w / 2, h / 2, R, wsCol(owner), r, { a: .4, dots: 380, sx: 1.08, sy: .92 });
  });
}
// venue badge sprite (shape by type, ring in the owner colour, glyph, name tape); mode '' | 'g' (greyed)
function wsBadgePath(c, type, cx, cy, r) {
  if (type === 'lair') { c.beginPath(); c.moveTo(cx - r, cy - r * .8); c.quadraticCurveTo(cx, cy - r * 1.15, cx + r, cy - r * .8); c.lineTo(cx + r * .92, cy + r * .1); c.quadraticCurveTo(cx + r * .7, cy + r * .78, cx, cy + r * 1.08); c.quadraticCurveTo(cx - r * .7, cy + r * .78, cx - r * .92, cy + r * .1); c.closePath(); }
  else if (type === 'stage') { c.save(); c.translate(cx, cy); scn_star(c, r * 1.22, r * .86, 8); c.restore(); }
  else if (type === 'studio') scn_rrect(c, cx - r, cy - r, r * 2, r * 2, r * .42);
  else if (type === 'market') { c.beginPath(); for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.283, rr = r * (1 + .06 * Math.cos(a * 10)); c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } c.closePath(); }
  else { c.beginPath(); c.arc(cx, cy, r, 0, 6.283); }
}
function wsBadge(vid, owner, mode) {
  const v = wsVenue(vid), r = wsVR(vid), type = v ? v.type : 'street', T = WS_TYPE[type] || WS_TYPE.street, bw = 200, bh = r * 2 + 30 + 36;
  return scn_layer('ws_badge_' + vid + '_' + owner + '_' + mode, bw, bh, (c) => {
    const cx = bw / 2, cy = r + 15, rr = scn_rng(wsHash(vid));
    if (mode === 'g') c.filter = 'saturate(.15) brightness(1.06)';
    c.lineJoin = 'round';
    wsBadgePath(c, type, cx + 2, cy + 4, r + 6); c.fillStyle = 'rgba(21,16,28,.22)'; c.fill();
    wsBadgePath(c, type, cx, cy, r + 6); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = 'rgba(21,16,28,.3)'; c.lineWidth = 1.2; c.stroke();
    const own = wsCrew(owner) ? wsCol(owner) : null, base = type === 'lair' && own ? own : T.col;
    wsBadgePath(c, type, cx, cy, r); const g = c.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r * 1.25); g.addColorStop(0, scn_mix(base, '#ffffff', .5)); g.addColorStop(.6, base); g.addColorStop(1, scn_mix(base, '#000000', .1)); c.fillStyle = g; c.fill();
    c.save(); wsBadgePath(c, type, cx, cy, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); for (let i = 0; i < r * r * .35; i++) c.rect(cx + (rr() - .5) * r * 2.6, cy + (rr() - .5) * r * 2.6, 1, 1); c.fill();
    if (own && type !== 'lair') { c.strokeStyle = own; c.lineWidth = 9; wsBadgePath(c, type, cx, cy, r - 1); c.stroke(); }
    if (owner === 'contested') { c.strokeStyle = 'rgba(21,16,28,.35)'; c.lineWidth = 4; c.setLineDash([6, 6]); wsBadgePath(c, type, cx, cy, r - 4); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(cx - r * .38, cy - r * .55, r * .38, r * .15, -.5, 0, 6.283); c.fill();
    c.restore();
    wsBadgePath(c, type, cx, cy, r); c.strokeStyle = ZK; c.lineWidth = 3.5; c.stroke();
    const ic = type === 'lair' ? ((wsCrew(owner) && wsCrew(owner).icon) || 'shield') : T.icon;
    icon(c, ic, cx, cy + (type === 'lair' ? 2 : 1), r * .62);
    // name tape
    const name = v ? v.name : vid, size = wsFitSize(c, name, bw - 30, 17, FM, '', 11);
    wsFont(c, size, FM); const tw = Math.min(bw - 12, c.measureText(name).width + 22), ty = cy + r + 12;
    c.save(); c.translate(cx, ty + 12); c.rotate(((wsHash(vid) % 7) - 3) * .008);
    c.fillStyle = 'rgba(21,16,28,.18)'; scn_rrect(c, -tw / 2 + 2, -11, tw, 26, 9); c.fill();
    c.fillStyle = '#fff'; scn_rrect(c, -tw / 2, -13, tw, 26, 9); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2; c.stroke();
    if (own) { c.fillStyle = own; scn_rrect(c, -tw / 2 + 4, 7, tw - 8, 4, 2); c.fill(); }
    txt(c, name, 0, 5, { size, font: FM, color: ZK, align: 'center' });
    c.restore();
  });
}
function wsBustLayer(id, w, h, expr) {
  const rj = wsRjOf(id), has = ART.rj.chars && ART.rj.chars[rj] ? 1 : 0;
  return scn_layer('ws_bust_' + rj + '_' + w + 'x' + h + '_' + (expr || '') + has, w, h, (c) => ART.rj.bust(c, rj, w, h, { expr: expr || 'neutral', t: 0 }));
}
// round mini portrait with crew rim
function wsMiniBust(c, id, x, y, r, o = {}) {
  const n = wsNpc(id), col = n ? wsCol(n.crew) : ZP.lav;
  c.save(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r + 4, 0, 6.3); c.fill();
  c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fillStyle = scn_mix(col, '#ffffff', .55); c.fill(); c.save(); c.clip();
  const L = wsBustLayer(id, 120, 120, o.expr); c.drawImage(L.cv, x - r * 1.1, y - r * 1.05, r * 2.2, r * 2.2); c.restore();
  c.beginPath(); c.arc(x, y, r, 0, 6.3); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke(); c.lineWidth = 3; c.strokeStyle = col; c.beginPath(); c.arc(x, y, r - 2.5, 0, 6.3); c.stroke();
  c.restore();
}
// bottom corners: a torn paper strip under the crew chips (left) and under the Requests/Favours buttons (right); the centre stays map
function wsBarLayer() {
  return scn_layer('ws_bar2', W, 84, (c) => {
    const r = scn_rng(91);
    for (const [x0, x1] of [[0, 366], [892, W]]) {
      c.save(); c.beginPath(); c.moveTo(x0, 84); c.lineTo(x0, 8); for (let x = x0; x <= x1; x += 20) c.lineTo(x, 6 + (r() - .5) * 4); c.lineTo(x1, 84); c.closePath();
      c.fillStyle = 'rgba(251,247,234,.95)'; c.fill(); c.clip();
      for (let i = 0; i < 3; i++) scn_spray(c, x0 + 60 + i * (x1 - x0 - 120) / 2, 50, 54, i % 2 ? ZP.limeL : ZP.pinkL, r, { a: .35, dots: 140 });
      c.restore();
      c.strokeStyle = ZK; c.lineWidth = 3; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x0 === 0 ? 0 : x0, 84); c.lineTo(x0, 8); c.lineTo(x1, 8); if (x1 !== W) c.lineTo(x1, 84); c.stroke();
    }
  });
}
function wsTitleLayer(act) { return scn_bubbleLayer(act >= 2 ? 'RUST QUARTER: ENCORE' : 'THE RUST QUARTER', 30, ZP.lime, { seed: 4, maxW: 310 }); }

// ================================================================ WORLD MAP SCENE
class WorldMapScene {
  constructor(o = {}) { this.o = o || {}; this.t = 0; this.panel = null; this.note = null; this.travel = null; this.pops = []; this.flips = []; this.tick = 0; }
  enter() {
    Snd.setMood('map'); const run = G.run, w = run && run.world;
    if (!w) { setScene(new MapScene(this.o)); return; }
    // came back from a borrowed scene (shop / rest / studio flows) -> straight back into that venue
    if (WS.returnVenue && WS.returnVenue === w.at && !this.o.intro) { const v = WS.returnVenue; WS.returnVenue = null; setScene(new VenueScene({ venue: v })); return; }
    WS.returnVenue = null;
    w.flags = w.flags || {};
    if (w.flags.wsDay == null || w.day < w.flags.wsDay || this.o.intro) w.flags.wsDay = w.day;
    if (w.day > w.flags.wsDay) { setScene(new DawnScene()); return; }
    // after an encounter the logic layer returns here with {venue}: section 8 says Continue goes back into that venue
    if (this.o.venue && !this.o.show && this.o.venue === w.at && wsVenue(w.at) && wsVenue(w.at).type !== 'stage' && !this.o.stay) { setScene(new VenueScene({ venue: w.at })); return; }
    saveRun();
    this.snapTurf(true);
    if (this.o.intro) this.banner = { t: 0, text: `ACT ${run.act || w.act || 1}`, sub: (run.act || w.act || 1) >= 2 ? 'THE ENCORE' : 'THE RUST QUARTER' };
    if (this.o.venue && wsVenue(this.o.venue)) this.panel = this.o.venue;
    this.hint = !(G.meta.seen && G.meta.seen.wsMapHint);
  }
  // compare the turf snapshot with the current turf: queue a flip animation per change
  snapTurf(first) {
    const w = wsWorld(), snap = w.flags.wsTurf;
    const now = {}; Object.keys(wsD().VENUES).forEach(v => now[v] = wsTurf(v));
    if (!snap) { w.flags.wsTurf = now; return; }
    let i = 0;
    Object.keys(now).forEach(v => { if (snap[v] !== now[v] && !this.flips.some(f => f.v === v)) this.flips.push({ v, from: snap[v] || 'none', to: now[v], t: -(first ? .7 : .1) - i++ * .55, fx: false }); });
  }
  update(dt) {
    this.t += dt;
    if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    if (this.travel) { this.travel.t += dt / this.travel.dur; if (this.travel.t >= 1) this.arrive(); }
    if (this.pops.length) { const p = this.pops[0]; p.t += dt; if (p.t > p.dur) this.nextPop(); }
    for (const f of this.flips) {
      f.t += dt;
      if (f.t > .25 && !f.fx) { f.fx = true; const p = wsVP(f.v); burst(p.x, p.y, 34, { col: [wsCol(f.to), wsCol(f.to, 'light'), '#fff'], shape: 'star', min: 90, max: 360, up: 80 }); floatText(p.x, p.y - 60, 'TURF FLIP!', wsCol(f.to), 30, { life: 1.6 }); Snd.play('stamp'); shake(4, .2); }
    }
    if (this.flips.length && this.flips.every(f => f.t > 1.6)) { const w = wsWorld(); this.flips.forEach(f => w.flags.wsTurf[f.v] = f.to); this.flips = []; }
    if (this.note) { this.note.t += dt; }
  }
  startTravel(to) {
    const w = wsWorld(), from = w.at, day0 = w.day;
    const res = wsTry(() => wsW().travel(to), null);
    if (!res || res.ok === false) { Snd.play('error'); this.note = { title: 'Can\'t go', body: (res && (res.why || res.reason)) || 'That way is blocked.', t: 0 }; return; }
    Snd.play('whoosh'); this.panel = null;
    const A = wsVP(from), B = wsVP(to);
    this.travel = { from, to: res.arrivedAt || w.at || to, t: 0, dur: clamp(Math.hypot(B.x - A.x, B.y - A.y) / 300, .7, 1.4), res, day0 };
  }
  arrive() {
    const tr = this.travel; this.travel = null; const w = wsWorld(); saveRun();
    const evs = (tr.res && tr.res.events) || [];
    let enc = null;
    evs.forEach(ev => {
      const type = ev.type || 'text', text = ev.text || ev.msg || (ev.lines && ev.lines.join(' ')) || '';
      if (type === 'dawn') return; // the DawnScene presents the overnight Street Buzz
      if (type === 'ambush') { enc = ev.encounter || ev.enc || ev.spec || (ev.enemies ? ev : null); this.pops.push({ text: 'AMBUSH!', sub: text || 'You walked into an ambush!', col: ZP.pinkD, t: 0, dur: 1.8, big: true }); }
      else if (type === 'bounty') { enc = enc || ev.encounter || null; this.pops.push({ text: 'BOUNTY!', sub: text, col: ZP.orange, t: 0, dur: 2.2, big: true }); }
      else if (text) this.pops.push({ text: '', sub: text, col: ZP.sky, t: 0, dur: 2.2 });
      if (ev.encounter && type !== 'ambush' && !enc) enc = ev.encounter;
    });
    const after = () => {
      if (enc) { wsBegin(enc); return; }
      if (w.day > (w.flags.wsDay || w.day)) { go(() => setScene(new DawnScene())); return; }
      this.snapTurf(false);
      this.panel = w.at;
    };
    if (this.pops.length) this.popAfter = after; else after();
  }
  nextPop() { this.pops.shift(); if (!this.pops.length && this.popAfter) { const f = this.popAfter; this.popAfter = null; f(); } }
  enterVenue(v) {
    const vv = wsVenue(v); if (!vv) return;
    if (vv.type === 'stage') {
      if (!wsStageOpen()) { this.note = { title: 'The Stage', body: 'Locked until Day 6 Night, or until your Buzz reaches 8.', t: 0 }; Snd.play('error'); return; }
      go(() => setScene(new FinaleIntroScene())); return;
    }
    go(() => setScene(new VenueScene({ venue: v })));
  }
  // ---- drawing
  draw(c) {
    const run = G.run, w = wsWorld(), t = G.time; if (!w) return;
    const block = !!(this.hint || this.pops.length || this.travel || this.banner && this.banner.t < 1.2);
    const uiOn = UI.enabled; if (block) UI.enabled = false;
    scn_blit(c, wsMapBase(), 0, 0, W, H);
    const D = wsD(), vids = Object.keys(D.VENUES), at = w.at;
    // turf washes (with flip animations)
    const flipOf = {}; this.flips.forEach(f => flipOf[f.v] = f);
    vids.forEach(v => {
      const p = wsVP(v), f = flipOf[v];
      if (f) {
        const k = clamp(f.t / .9, 0, 1), Lo = wsWash(v, f.from), Ln = wsWash(v, f.to);
        if (k < 1) { c.save(); c.globalAlpha = 1 - k; scn_blitC(c, Lo, p.x, p.y, 1); c.restore(); }
        if (k > 0) { c.save(); c.globalAlpha = k; scn_blitC(c, Ln, p.x, p.y, .4 + .6 * ease.back(k)); c.restore(); }
      } else { const own = wsTurf(v); if (own !== 'none') scn_blitC(c, wsWash(v, own), p.x, p.y, 1); }
    });
    scn_blit(c, wsMapRoads(), 0, 0, W, H);
    // neighbours: glowing marching routes
    const nb = this.travel ? [] : wsNeighbors(at), nbOf = {}; nb.forEach(n => nbOf[n.id] = n);
    c.save(); c.lineCap = 'round';
    nb.forEach(n => { c.strokeStyle = n.locked ? 'rgba(21,16,28,.25)' : scn_rgba(ZP.limeL, .85); c.lineWidth = 16; c.setLineDash([]); c.beginPath(); wsEdgePath(c, at, n.id); c.stroke(); });
    nb.forEach(n => { if (n.locked) return; c.strokeStyle = ZK; c.lineWidth = 4; c.setLineDash([9, 9]); c.lineDashOffset = -t * 26; c.beginPath(); wsEdgePath(c, at, n.id); c.stroke(); });
    c.restore();
    // travel trail
    let hero = null;
    if (this.travel) {
      const tr = this.travel, k = ease.inOut(clamp(tr.t, 0, 1)), f = wsEdgeFn(tr.from, tr.to);
      const isEdge = D.EDGES.some(e => (e[0] === tr.from && e[1] === tr.to) || (e[1] === tr.from && e[0] === tr.to));
      const fn = isEdge ? f : (q => { const A = wsVP(tr.from), B = wsVP(tr.to); return [lerp(A.x, B.x, q), lerp(A.y, B.y, q)]; });
      c.save(); c.lineCap = 'round'; c.strokeStyle = scn_rgba(ZP.pink, .6); c.lineWidth = 12; c.beginPath(); for (let i = 0; i <= 20; i++) { const p = fn(k * i / 20); i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); } c.stroke(); c.restore();
      const p = fn(k), A = wsVP(tr.from), B = wsVP(tr.to), hops = Math.max(2, Math.round(tr.dur * 3));
      const offA = wsVR(tr.from) + 14, offB = wsVR(tr.to) + 14;
      hero = { x: p[0] + lerp(offA, offB, k), y: p[1] + lerp(wsVR(tr.from) * .6, wsVR(tr.to) * .6, k), hop: Math.abs(Math.sin(k * Math.PI * hops)) * 16, walk: true, flip: B.x < A.x };
    }
    // badges
    const reqs = wsRequests().filter(r => r && (r.state === 'active' || r.state === 'accepted' || !r.state)), reqAt = {};
    reqs.forEach(r => { const v = wsReqVenue(r); if (v) (reqAt[v] = reqAt[v] || []).push(r); });
    const hovV = this.hoverVenue();
    vids.forEach(v => {
      const p = wsVP(v), r = wsVR(v), own = wsTurf(v), vv = D.VENUES[v], n = nbOf[v], isCur = v === at && !this.travel;
      const locked = (n && n.locked) || (vv.type === 'stage' && !wsStageOpen());
      const hov = hovV === v && !block, sel = this.panel === v;
      const pulse = (n && !n.locked) ? 1 + Math.sin(t * 5 + p.x) * .05 : 1;
      if (n && !n.locked) { c.save(); c.translate(p.x, p.y); c.rotate(t * .8); c.setLineDash([8, 7]); c.lineCap = 'round'; c.strokeStyle = ZP.limeD; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r + 15, 0, 6.3); c.stroke(); c.restore(); }
      if (isCur) { c.save(); c.globalAlpha = .55 + .25 * Math.sin(t * 4); c.strokeStyle = ZP.pink; c.lineWidth = 6; c.beginPath(); c.arc(p.x, p.y, r + 14, 0, 6.3); c.stroke(); c.restore(); }
      if (sel) { c.save(); c.strokeStyle = ZP.cyanD; c.lineWidth = 5; c.setLineDash([4, 6]); c.beginPath(); c.arc(p.x, p.y, r + 20, 0, 6.3); c.stroke(); c.restore(); }
      if (vv.type === 'stage' && wsStageOpen()) for (let i = 0; i < 6; i++) { const a = t * .9 + i * 1.047; scn_blitC(c, scn_dsprite(i % 2 ? 'note' : 'star', 8, { fill: i % 2 ? null : [ZP.yel, ZP.limeL, ZP.pinkL][i % 3], lw: 2 }), p.x + Math.cos(a) * (r + 30), p.y + Math.sin(a) * (r + 22), 1); }
      const L = wsBadge(v, own, locked ? 'g' : ''), s = pulse * (hov ? 1.1 : 1);
      c.save(); if (!isCur && !n && !locked && !sel) c.globalAlpha = .9;
      c.drawImage(L.cv, p.x - L.w / 2 * s, p.y - (r + 15) * s, L.w * s, L.h * s); c.restore();
      if (locked) icon(c, 'key', p.x + r * .75, p.y + r * .55, 14);
      if (n && !n.locked) { const cy = p.y + 2, cx = p.x + r + 34; c.save(); scn_sticker(c, cx - 26, cy - 11, 52, 22, 11, ZP.limeL, { pad: 3, lw: 2, shadow: false }); txt(c, n.cost === 0 ? 'free' : (n.cost || 1) + ' slot', cx, cy + 5, { size: 14, font: FM, color: ZK, align: 'center' }); c.restore(); }
      // crew flag on lairs
      if (vv.type === 'lair') this.drawFlag(c, p.x + r * .62, p.y - r * .55, own, t + p.x * .01);
      // request pins
      const rq = reqAt[v]; if (rq) {
        const bx = p.x - r * .9, by = p.y - r * .95 - Math.abs(Math.sin(t * 3 + p.x)) * 5;
        c.save(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(bx, by + 10); c.lineTo(bx + 5, by + 24); c.stroke(); c.restore();
        c.save(); c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, 17, 0, 6.3); c.fill(); c.fillStyle = ZP.yel; c.beginPath(); c.arc(bx, by, 14, 0, 6.3); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); c.restore();
        icon(c, wsReqIcon(rq[0].type), bx, by, 10);
        if (rq.length > 1) txt(c, 'x' + rq.length, bx + 15, by - 10, { size: 14, font: FD, weight: 800, color: ZP.pinkD, stroke: '#fff', sw: 3 });
      }
    });
    // hero token
    if (!hero) { const p = wsVP(at), r = wsVR(at); hero = { x: p.x + r + 14, y: p.y + r * .55, hop: Math.abs(Math.sin(t * 3.2)) * 3, walk: false, flip: false }; }
    c.save(); c.fillStyle = 'rgba(21,16,28,.25)'; c.beginPath(); c.ellipse(hero.x, hero.y + 2, 16 - hero.hop * .3, 5, 0, 0, 6.3); c.fill(); c.restore();
    ART.rj.draw(c, wsHeroRj(), { x: hero.x, y: hero.y - hero.hop, s: .28, pose: hero.walk ? 'walk' : 'idle', t: t * (hero.walk ? 1.6 : 1), flip: hero.flip, noShadow: true });
    // title
    const TL = wsTitleLayer(run.act || w.act || 1); c.save(); c.translate(876, 100); c.rotate(-.02); scn_blitC(c, TL, 0, 0, 1); c.restore();
    this.drawClock(c); this.drawBuzz(c); this.drawBar(c);
    drawHUD(c, run);
    // tooltips (desktop) for the hovered venue
    if (hovV && !block && this.panel !== hovV) { const s = this.venueStatus(hovV); tip(wsVenue(hovV).name, s.line + (s.detail ? ' ' + s.detail : '')); }
    if (this.panel && !block) this.drawPanel(c, this.panel);
    if (this.note && !block) this.drawNote(c);
    UI.enabled = uiOn;
    // overlays
    if (this.pops.length) this.drawPops(c);
    if (this.banner) this.drawBanner(c);
    if (this.hint) this.drawHint(c);
    // deferred world tap (front-most things above have already had their chance at In.click)
    if (!block && UI.enabled && In.click) this.worldTap(In.click.x, In.click.y);
  }
  hoverVenue() {
    if (!UI.enabled) return null; let best = null, bd = 1e9;
    for (const v of Object.keys(wsD().VENUES)) { const p = wsVP(v), r = Math.max(32, wsVR(v) + 14), d = Math.hypot(In.x - p.x, In.y - p.y); if (d < r && d < bd) { bd = d; best = v; } }
    if (best && this.panelRect && this.inRect(In.x, In.y, this.panelRect)) return null;
    return best;
  }
  inRect(x, y, r) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  worldTap(x, y) {
    if (this.note) { this.note = null; In.click = null; return; }
    if (this.panel && this.inRect(x, y, this.panelRect)) { In.click = null; return; }
    let best = null, bd = 1e9;
    for (const v of Object.keys(wsD().VENUES)) { const p = wsVP(v), r = Math.max(32, wsVR(v) + 14), d = Math.hypot(x - p.x, y - p.y); if (d < r && d < bd) { bd = d; best = v; } }
    if (!best) { if (this.panel) { this.panel = null; In.click = null; } return; }
    In.click = null; Snd.play('click');
    const w = wsWorld(), n = wsNeighbors(w.at).find(q => q.id === best);
    if (best === w.at) { this.enterVenue(best); return; }
    if (n && !n.locked) { this.startTravel(best); return; }
    this.panel = best; // locked or far away: show the tap-info panel with the reason
  }
  venueStatus(v) {
    const w = wsWorld(), n = wsNeighbors(w.at).find(q => q.id === v), vv = wsVenue(v);
    if (v === w.at) return { kind: 'here', line: 'You are here.', detail: vv.type === 'stage' ? (wsStageOpen() ? 'The Headliner awaits.' : 'Locked until Day 6 Night or Buzz 8.') : 'Tap to go inside.' };
    if (n && n.locked) return { kind: 'locked', line: 'Locked.', detail: n.why || 'Not open yet.' };
    if (vv.type === 'stage' && !wsStageOpen()) return { kind: 'locked', line: 'Locked.', detail: 'The Stage opens on Day 6 Night, or once your Buzz reaches 8.' };
    if (n) return { kind: 'near', line: 'Next door: 1 slot to travel.', detail: 'Tap to go.' };
    const p = wsPath(w.at, v); return { kind: 'far', line: p ? `Not next door: ${p.length - 1} hops (${p.length - 1} slots) away.` : 'No route.', detail: p ? `Head via ${wsVenue(p[1]).name}.` : '', path: p };
  }
  drawFlag(c, x, y, own, t) {
    const col = wsCrew(own) ? wsCol(own) : own === 'contested' ? ZP.yel : '#ece6d8', top = y - 52;
    c.save(); c.strokeStyle = ZK; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x, top); c.stroke();
    c.fillStyle = ZP.yel; c.beginPath(); c.arc(x, top - 2, 4, 0, 6.3); c.fill(); c.lineWidth = 2; c.stroke();
    const wv = k => Math.sin(t * 5 - k * 3) * 4 * k;
    c.beginPath(); c.moveTo(x, top + 2); c.bezierCurveTo(x + 14, top + 2 + wv(.3), x + 28, top + 2 + wv(.7), x + 40, top + 4 + wv(1));
    c.lineTo(x + 40, top + 28 + wv(1)); c.bezierCurveTo(x + 28, top + 26 + wv(.7), x + 14, top + 26 + wv(.3), x, top + 26); c.closePath();
    c.fillStyle = col; c.fill(); c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke();
    if (wsCrew(own)) icon(c, wsCrew(own).icon || 'star', x + 20, top + 14 + wv(.5), 9);
    c.restore();
  }
  drawClock(c) {
    const w = wsWorld(), slot = wsSlotIdx(), day = wsDay(), x = 14, y = 72, cx = x + 52, cy = y + 50, R = 38;
    scn_sticker(c, x, y, 222, 100, 18, '#fffdf6', { pad: 5, band: ZP.sky, bandW: 3, lw: 3 });
    const cols = [ZP.yel, ZP.orange, ZP.navy];
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI / 2 - Math.PI / 3 + i * 2 * Math.PI / 3 - Math.PI / 3, a1 = a0 + 2 * Math.PI / 3;
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a1); c.closePath(); c.globalAlpha = i === slot ? 1 : .35; c.fillStyle = cols[i]; c.fill(); c.globalAlpha = 1; c.strokeStyle = ZK; c.lineWidth = 2; c.stroke();
    }
    c.beginPath(); c.arc(cx, cy, R, 0, 6.3); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke();
    const am = -Math.PI / 2 - Math.PI / 3 + slot * 2 * Math.PI / 3, wob = Math.sin(G.time * 3) * .04;
    c.save(); c.translate(cx, cy); c.rotate(am + wob + Math.PI / 2);
    c.strokeStyle = ZK; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 4); c.lineTo(0, -R + 12); c.stroke();
    c.translate(0, -R + 10); c.rotate(-(am + wob + Math.PI / 2));
    if (slot === 2) { c.beginPath(); c.arc(0, 0, 11, 0, 6.3); c.fillStyle = '#fff6c8'; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.2; c.stroke(); c.beginPath(); c.arc(5, -3, 9, 0, 6.3); c.fillStyle = ZP.navy; c.fill(); }
    else { c.strokeStyle = ZK; c.lineWidth = 2; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; c.moveTo(Math.cos(a) * 13, Math.sin(a) * 13); c.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); } c.stroke(); c.beginPath(); c.arc(0, 0, 11, 0, 6.3); c.fillStyle = slot ? ZP.orange : ZP.yel; c.fill(); c.lineWidth = 2.2; c.stroke(); }
    c.restore();
    c.beginPath(); c.arc(cx, cy, 5, 0, 6.3); c.fillStyle = ZK; c.fill();
    scn_bubbleLive(c, `DAY ${day}/${WS_DAYS}`, x + 160, y + 30, 26, day >= WS_DAYS ? ZP.pink : ZP.lime);
    txt(c, WS_SLOTS[slot], x + 160, y + 63, { size: 22, font: FM, color: ZK, align: 'center' });
    const left = 2 - slot; txt(c, day >= WS_DAYS && slot === 2 ? 'HEADLINER NIGHT!' : `${left} slot${left === 1 ? '' : 's'} left today`, x + 160, y + 86, { size: 14, font: FB, color: '#5c5368', align: 'center' });
    if (UI.hit(x, y, 222, 100)) { tip('Time', 'Each day has 3 slots: Day, Dusk, Night. Travelling one road or a fight/talk costs 1 slot. The finale is on Day 6, Night.'); if (In.click) { In.click = null; this.note = { title: 'Time', body: 'Each day has 3 slots: Day, Dusk and Night. Travelling one road costs 1 slot, so does a fight or a talk, or resting. Chatting, shopping and taking Requests are free. After Night, dawn brings the Street Buzz. The finale is on Day 6, Night at The Stage.', t: 0 }; } }
  }
  drawBuzz(c) {
    const b = wsBuzz(), x = 1044, y = 72;
    scn_sticker(c, x, y, 222, 92, 18, '#fffdf6', { pad: 5, band: ZP.pinkL, bandW: 3, lw: 3 });
    txt(c, 'BUZZ', x + 16, y + 34, { size: 22, font: FM, color: ZK });
    scn_bubbleLive(c, String(b), x + 104, y + 28, 32, ZP.pink);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const bx = x + 16 + i * 16, h = 10 + i * 2.2, on = i < b, by = y + 80;
      c.fillStyle = on ? (i >= 7 ? ZP.pink : ZP.lime) : '#e9e3f0'; scn_rrect(c, bx, by - h, 12, h, 3); c.fill(); c.strokeStyle = ZK; c.lineWidth = 1.6; c.stroke();
      if (on && i === b - 1) { c.save(); c.globalAlpha = .4 + .4 * Math.sin(G.time * 6); c.fillStyle = '#fff'; c.fillRect(bx + 2, by - h + 2, 4, h - 4); c.restore(); }
    }
    const sx = x + 16 + 7 * 16 + 6; c.strokeStyle = ZP.pinkD; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(sx, y + 40); c.lineTo(sx, y + 82); c.stroke(); c.setLineDash([]);
    txt(c, wsStageOpen() ? 'STAGE OPEN!' : 'stage at 8', x + 166, y + 36, { size: 13, font: FM, color: ZP.pinkD, align: 'center' });
    if (UI.hit(x, y, 222, 92)) { tip('Buzz', 'How much of the city is on your side. 8+ opens The Stage early.'); if (In.click) { In.click = null; this.note = { title: 'Buzz', body: 'Buzz = 1 per turf venue held by a crew that counts you as a Friend, +1 per completed Request, +2 per Bonded crew, -1 per Hostile crew. At 8 Buzz The Stage opens early, and every 2 Buzz weakens the Headliner.', t: 0 }; } }
  }
  drawBar(c) {
    scn_blit(c, wsBarLayer(), 0, 636);
    const ids = wsCrewIds();
    ids.forEach((id, i) => {
      const x = 12 + i * 70, y = 648, cx = x + 31, st = wsStanding(id), hov = UI.hit(x, y, 62, 66);
      c.save(); if (hov) { c.translate(cx, y + 30); c.scale(1.06, 1.06); c.translate(-cx, -y - 30); }
      wsCrest(c, id, cx, y + 22, 18);
      const lab = (st > 0 ? '+' : '') + Math.round(st), col = st >= 2 ? ZP.limeD : st <= -2 ? ZP.pinkD : ZK;
      scn_sticker(c, cx - 31, y + 44, 62, 20, 10, st >= 2 ? '#e6f9d0' : st <= -2 ? '#ffe0ee' : '#fff', { pad: 2, lw: 2, shadow: false });
      const sl = lab + ' ' + wsStName(st); txt(c, sl, cx, y + 59, { size: wsFitSize(c, sl, 58, 12, FD, 800, 9), font: FD, weight: 800, color: col, align: 'center' });
      c.restore();
      if (hov) { UI.cursor = 'pointer'; tip(wsName(id), `${wsStName(st)} (${lab}). ${WS_ST_FX[String(clamp(Math.round(st), -3, 3))]}`); if (In.click) { In.click = null; Snd.play('click'); G.modal = new CrewsModal(id); } }
    });
    // Street Buzz ticker
    const tx = 250, ty = 72, tw = 362, th = 52, hov = UI.hit(tx, ty, tw, th);
    scn_sticker(c, tx, ty, tw, th, 16, '#fff', { pad: 4, lw: 3 });
    scn_sticker(c, tx + 6, ty + 8, 104, th - 16, 12, ZP.pink, { pad: 0, lw: 2.2, shadow: false });
    txt(c, 'STREET', tx + 58, ty + 26, { size: 15, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 3, align: 'center' });
    txt(c, 'BUZZ', tx + 58, ty + 43, { size: 15, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 3, align: 'center' });
    const lines = wsRumors().map(wsRumorText).filter(Boolean), s = lines.length ? lines.slice(-4).join('   ★   ') : 'Quiet night. Nobody is talking... yet.';
    wsFont(c, 19, FB); const sw = c.measureText(s).width + 80, off = (G.time * 60) % sw;
    c.save(); c.beginPath(); c.rect(tx + 118, ty + 4, tw - 126, th - 8); c.clip();
    for (let k = 0; k < 2; k++) txt(c, s, tx + 124 + k * sw - off, ty + 35, { size: 19, font: FB, color: ZK });
    c.restore();
    if (hov) { UI.cursor = 'pointer'; tip('Street Buzz', 'What the crews did overnight. Tap for the full log.'); if (In.click) { In.click = null; Snd.play('click'); G.modal = new StreetBuzzModal(); } }
    const act = wsRequests().filter(r => r && (r.state === 'active' || r.state === 'accepted')).length;
    if (wsBtn(900, 654, 178, 54, 'REQUESTS', { col: ZP.yel, icon: 'compass', badge: act || null, size: 22 })) G.modal = new RequestsModal();
    const fv = wsFavours().length;
    if (wsBtn(1088, 654, 180, 54, 'FAVOURS', { col: ZP.pinkL, icon: 'heart', cost: fv + '/3', size: 22 })) G.modal = new FavoursModal();
  }
  drawPanel(c, v) {
    const vv = wsVenue(v); if (!vv) { this.panel = null; return; }
    const p = wsVP(v), pw = 420, ph = 372, px = p.x < W / 2 ? 830 : 30, py = 190, T = WS_TYPE[vv.type] || WS_TYPE.street, own = wsTurf(v), st = this.venueStatus(v);
    this.panelRect = { x: px - 8, y: py - 8, w: pw + 16, h: ph + 16 };
    // leader line from the panel to the venue
    c.save(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.setLineDash([3, 7]); c.lineCap = 'round'; c.beginPath(); c.moveTo(px < p.x ? px + pw : px, py + 60); c.lineTo(p.x, p.y); c.stroke(); c.restore();
    scn_sticker(c, px, py, pw, ph, 22, '#fffdf6', { pad: 7, band: T.col === '#ffffff' ? ZP.limeL : T.col, bandW: 5, lw: 3.5 });
    const ns = wsFitSize(c, vv.name, pw - 110, 30, FD, 800, 16);
    scn_bubbleLive(c, vv.name, px + 20 + (pw - 100) / 2, py + 36, ns, ZP.lime);
    if (wsClose(px + pw - 64, py + 8)) { this.panel = null; return; }
    // type + owner chips
    icon(c, T.icon, px + 30, py + 78, 13); txt(c, T.label, px + 48, py + 84, { size: 17, font: FM, color: ZK });
    const ownLab = own === 'contested' ? 'CONTESTED' : wsCrew(own) ? wsName(own) : (vv.district === 'neutral' ? 'Neutral ground' : 'No crew');
    if (wsCrew(own)) wsCrest(c, own, px + 210, py + 78, 11);
    txt(c, ownLab, px + 228, py + 84, { size: 17, font: FD, weight: 800, color: wsCrew(own) ? wsCol(own, 'dark') : '#7a7186' });
    if (wsCrew(own)) { const s = wsStanding(own); txt(c, `you: ${wsStName(s)}`, px + pw - 22, py + 104, { size: 14, font: FB, color: s <= -2 ? ZP.pinkD : '#5c5368', align: 'right' }); }
    // blurb
    wsFont(c, 17, FB); wsWrap(c, vv.blurb || '', pw - 44, 17).slice(0, 2).forEach((l, i) => txt(c, l, px + 22, py + 126 + i * 21, { size: 17, color: '#3a3346' }));
    // residents (cached busts)
    const res = wsNpcsAt(v).slice(0, 5);
    if (res.length) res.forEach((id, i) => { const bx = px + 48 + i * 76, by = py + 196; wsMiniBust(c, id, bx, by, 27); const nm = wsName(id); txt(c, nm.length > 11 ? nm.slice(0, 10) + '.' : nm, bx, by + 44, { size: 13, font: FD, weight: 800, color: ZK, align: 'center' }); });
    else txt(c, v === wsWorld().at || st.kind === 'near' ? 'Nobody around right now.' : 'Who knows who\'s hanging out there?', px + pw / 2, py + 204, { size: 17, font: FM, color: '#7a7186', align: 'center' });
    // status + action
    txt(c, st.line, px + 22, py + 270, { size: 17, font: FD, weight: 800, color: st.kind === 'locked' ? ZP.pinkD : ZK });
    if (st.detail && st.kind !== 'near' && st.kind !== 'here') { wsFont(c, 15, FB); wsWrap(c, st.detail, st.kind === 'far' ? 200 : pw - 44, 15).slice(0, 2).forEach((l, i) => txt(c, l, px + 22, py + 292 + i * 18, { size: 15, color: '#5c5368' })); }
    const bx = px + pw - 196, by = py + ph - 66;
    if (st.kind === 'here') { if (wsBtn(px + 22, by, pw - 44, 52, vv.type === 'stage' ? 'TAKE THE STAGE' : 'GO INSIDE', { col: ZP.lime, icon: 'star' })) this.enterVenue(v); }
    else if (st.kind === 'near') { if (wsBtn(px + 22, by, pw - 44, 52, 'TRAVEL HERE', { col: ZP.lime, icon: 'boot', cost: '1 slot' })) this.startTravel(v); }
    else if (st.kind === 'far' && st.path && st.path.length > 1) {
      const nx = st.path[1], nn = wsNeighbors(wsWorld().at).find(q => q.id === nx);
      if (wsBtn(bx, by, 176, 52, 'STEP TOWARD', { col: ZP.sky, size: 19, cost: '1 slot', disabled: !nn || nn.locked, onDisabled: () => this.note = { title: 'Blocked', body: (nn && nn.why) || 'That road is closed.', t: 0 } })) this.startTravel(nx);
    }
  }
  drawNote(c) {
    const n = this.note, k = ease.back(clamp(n.t * 4, 0, 1)), w = 520, lines = wsWrap(c, n.body, w - 50, 20), h = 86 + lines.length * 25, x = W / 2 - w / 2, y = 250;
    c.save(); c.translate(W / 2, y + h / 2); c.scale(k, k); c.translate(-W / 2, -(y + h / 2));
    scn_sticker(c, x, y, w, h, 22, '#fffdf6', { pad: 7, band: ZP.sky, bandW: 4, lw: 3.5 });
    scn_bubbleLive(c, n.title, W / 2, y + 34, 28, ZP.pink);
    lines.forEach((l, i) => txt(c, l, x + 26, y + 74 + i * 25, { size: 20, color: ZK }));
    txt(c, 'tap anywhere to close', W / 2, y + h - 12, { size: 13, font: FM, color: '#8a8296', align: 'center' });
    c.restore();
  }
  drawPops(c) {
    const p = this.pops[0], k = p.t * 3, a = p.t > p.dur - .25 ? (p.dur - p.t) / .25 : 1;
    c.save(); c.globalAlpha = clamp(a, 0, 1);
    c.fillStyle = `rgba(21,16,28,${p.big ? .35 : .15})`; c.fillRect(0, 0, W, H);
    if (p.text) wsPop(c, p.text, W / 2, 300, k, p.col, { size: p.big ? 64 : 44, burst: true, rot: -.05 });
    if (p.sub) wsPop(c, p.sub, W / 2, p.text ? 410 : 340, k - (p.text ? .4 : 0), '#fffdf6', { size: 24, maxW: 640, tc: ZK });
    c.restore();
    // tap to skip (UI.enabled was restored by draw)
    if (UI.enabled && In.click) { In.click = null; if (p.t > .3) this.nextPop(); }
  }
  drawBanner(c) {
    const b = this.banner, k = b.t / 2.6, a = k < .1 ? k / .1 : k > .8 ? (1 - k) / .2 : 1, e = ease.out(clamp(b.t * 3, 0, 1));
    c.save(); c.globalAlpha = a; c.translate(W / 2, 330); c.scale(1, e); c.translate(-W / 2, -330); scn_blit(c, scn_bandLayer(), 0, 210); c.restore();
    c.save(); c.globalAlpha = a; const A = scn_bubbleLayer(b.text, 100, ZP.lime, { seed: 2 }); c.translate(W / 2, 296); c.rotate(-.03); scn_blitC(c, A, 0, 0, e); c.restore();
    c.save(); c.globalAlpha = a; const S = scn_bubbleLayer(b.sub, 50, ZP.pink, { seed: 5 }); c.translate(W / 2, 384); c.rotate(.015); scn_blitC(c, S, 0, 0, 1); c.restore();
    if (UI.enabled && In.click && b.t > .5) { In.click = null; this.banner = null; }
  }
  drawHint(c) {
    c.fillStyle = 'rgba(21,16,28,.66)'; c.fillRect(0, 0, W, H);
    const x = 190, y = 110, w = 900, h = 500;
    scn_sticker(c, x, y, w, h, 26, '#fffdf6', { pad: 8, band: ZP.limeL, bandW: 6, lw: 4 });
    const L = scn_bubbleLayer('WELCOME TO THE QUARTER', 46, ZP.pink, { seed: 7, maxW: 760 }); scn_blitC(c, L, W / 2, y + 4, 1);
    const tips = [
      ['boot', 'Tap a glowing venue next door to travel there. Every road costs 1 time slot.'],
      ['star', 'Tap the venue you are standing on to go inside and meet the people there.'],
      ['clock', 'A day has 3 slots: Day, Dusk, Night. On Day 6, Night the Headliner finale opens at The Stage.'],
      ['shield', 'Colours show who owns the turf. Beat (or out-talk) a lair\'s Enforcer to flip it.'],
      ['heart', 'Make friends! Tap a crew chip to see your standing. Friends become Favour cards in your decks.']
    ];
    tips.forEach((tp, i) => {
      const ty = y + 76 + i * 72; c.beginPath(); c.arc(x + 62, ty + 14, 26, 0, 6.3); c.fillStyle = [ZP.limeL, ZP.yel, ZP.sky, ZP.pinkL, ZP.lav][i]; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke();
      icon(c, tp[0], x + 62, ty + 14, 16);
      wsWrap(c, tp[1], w - 160, 22).forEach((l, k) => txt(c, l, x + 104, ty + 10 + k * 26, { size: 22, color: ZK }));
    });
    UI.enabled = !G.trans && !G.modal;
    if (wsBtn(W / 2 - 130, y + h - 72, 260, 58, 'LET\'S GO!', { col: ZP.lime, size: 30 })) { this.hint = false; G.meta.seen = G.meta.seen || {}; G.meta.seen.wsMapHint = 1; saveMeta(); }
    else if (In.click) In.click = null;
  }
  onKey(k) { if (k === 'Escape') { if (this.note) this.note = null; else if (this.panel) this.panel = null; else openPause(); } }
}

// ================================================================ VENUE SCENE
const WS_ACT_STYLE = {
  chat: { col: ZP.sky, icon: 'talk' }, request: { col: ZP.yel, icon: 'compass' }, trade: { col: ZP.limeL, icon: 'shop' },
  recruit: { col: ZP.pinkL, icon: 'heart' }, gift: { col: ZP.lav, icon: 'chest' }, pass: { col: '#ffffff', icon: 'boot' },
  fight: { col: ZP.pink, icon: 'fist' }, talk: { col: ZP.cyan, icon: 'mouth' }
};
function wsCostText(cost) {
  if (!cost) return ''; const o = [];
  if (cost.slots) o.push(cost.slots + ' slot' + (cost.slots > 1 ? 's' : '')); if (cost.shil) o.push(cost.shil + ' shil');
  return o.join(' + ');
}
function wsSlotTint(c) {
  const s = wsSlotIdx();
  if (s === 1) { c.fillStyle = 'rgba(255,138,42,.12)'; c.fillRect(0, 0, W, H); }
  else if (s === 2) { c.fillStyle = 'rgba(20,24,43,.28)'; c.fillRect(0, 0, W, H); }
}
class VenueScene {
  constructor(o = {}) { this.o = o || {}; this.v = this.o.venue; this.t = 0; this.sel = null; this.talk = null; this.acts = null; this.react = {}; }
  enter() {
    const w = wsWorld(); if (!w) { setScene(new MapScene()); return; }
    this.v = this.v || w.at; const vv = wsVenue(this.v);
    WS.returnVenue = null;
    if (vv && vv.type === 'stage') { if (wsStageOpen()) { setScene(new FinaleIntroScene()); return; } }
    Snd.setMood('map'); saveRun();
    if (this.o.npc) this.open(this.o.npc);
  }
  update(dt) { this.t += dt; }
  residents() { return wsNpcsAt(this.v); }
  layout(res) {
    const n = res.length, vv = wsVenue(this.v), xs = [];
    if (!n) return xs;
    const x0 = 470, x1 = 1180, step = n === 1 ? 0 : Math.min(240, (x1 - x0) / (n - 1)), mid = (x0 + x1) / 2 + (n === 1 ? 60 : 0);
    // a lair's enforcer stands at the door (right-centre), everyone else around them
    let order = res.slice();
    if (vv && vv.type === 'lair') { const e = order.find(id => wsRole(id) === 'enforcer'); if (e) { order = order.filter(id => id !== e); order.splice(Math.min(order.length, Math.floor(n / 2)), 0, e); } }
    order.forEach((id, i) => xs.push({ id, x: mid + (i - (n - 1) / 2) * step, s: wsRoleScale(id), i }));
    return xs;
  }
  open(id) {
    this.sel = id; this.acts = null; this.talk = null; const n = wsNpc(id);
    const g = n && (n.greet && n.greet.length ? n.greet : n.barks);
    this.greet = { text: g && g.length ? pick(g) : '...', t0: G.time };
    this.react[id] = { pose: 'cheer', until: this.t + .9 };
    Snd.play('talk');
  }
  actions() { if (!this.acts) this.acts = wsTry(() => wsW().actions(this.sel), []) || []; return this.acts; }
  say(lines, o = {}) { this.talk = Object.assign({ lines: (lines || []).filter(Boolean), i: 0, t0: G.time }, o); if (!this.talk.lines.length && !this.talk.offer) this.talk = null; }
  doAction(a) {
    const id = this.sel, n = wsNpc(id), res = wsTry(() => wsW().do(id, a.id), null);
    this.acts = null;
    if (!res) { this.say(['Nothing happens.']); return; }
    const lines = res.lines || (res.text ? [res.text] : []);
    switch (res.kind) {
      case 'shop': wsGoBorrowed(this.v, () => new ShopScene()); return;
      case 'encounter': this.react[id] = { pose: 'windup', until: this.t + 2, expr: 'angry' }; wsBegin(res); return;
      case 'request': this.say(lines.length ? lines : [`${n ? n.name : 'They'} leans in: "I need a hand with something."`], { offer: res.request }); return;
      case 'recruit': Snd.play('buff'); burst(1000, 300, 30, { col: [ZP.pink, ZP.pinkL, '#fff'], shape: 'star', min: 100, max: 360 }); this.react[id] = { pose: 'cheer', until: this.t + 2, expr: 'happy' }; break;
      case 'gift': Snd.play('coin'); this.react[id] = { pose: 'cheer', until: this.t + 1.5, expr: 'shy' }; break;
      default: if (a.id === 'chat') { Snd.play('talk'); this.react[id] = { pose: 'sing', until: this.t + 1.6, expr: 'happy' }; }
    }
    if (res.encounter) { wsBegin(res.encounter); return; }
    this.say(lines.length ? lines : ['...']); saveRun();
  }
  draw(c) {
    const w = wsWorld(), run = G.run, t = G.time; if (!w) return;
    const vv = wsVenue(this.v) || { name: this.v, type: 'street', bg: 'alley' }, own = wsTurf(this.v);
    drawBackdrop(c, vv.bg || 'alley', (wsHash(this.v) % 40) + 1, t);
    wsSlotTint(c);
    const g = c.createLinearGradient(0, 520, 0, H); g.addColorStop(0, 'rgba(21,16,28,0)'); g.addColorStop(1, 'rgba(21,16,28,.45)'); c.fillStyle = g; c.fillRect(0, 520, W, H - 520);
    const panel = !!this.sel, uiOn = UI.enabled; if (panel) UI.enabled = false;
    const res = this.residents(), lay = this.layout(res), GY = 590;
    // lair door behind the enforcer
    if (vv.type === 'lair') { const e = lay.find(q => wsRole(q.id) === 'enforcer'); this.drawDoor(c, e ? e.x : 1000, GY, own); }
    // hero
    c.save(); c.fillStyle = 'rgba(21,16,28,.3)'; c.beginPath(); c.ellipse(180, GY + 2, 60, 12, 0, 0, 6.3); c.fill(); c.restore();
    wsFigBudget(Math.max(1, Math.ceil((lay.length + 1) / 3))); wsFigCached(c, 'v_hero', 'hero', 180, GY, .95, { rj: wsHeroRj(), pose: this.sel && this.talk ? 'sing' : 'idle' });
    // residents
    let hovId = null;
    lay.forEach(q => {
      const r = this.react[q.id], act = r && r.until > this.t, pose = act ? r.pose : 'idle', expr = act ? r.expr : (this.sel === q.id ? 'happy' : undefined);
      c.save(); c.fillStyle = 'rgba(21,16,28,.3)'; c.beginPath(); c.ellipse(q.x, GY + 2, 55 * q.s, 11, 0, 0, 6.3); c.fill(); c.restore();
      const hov = !panel && UI.hit(q.x - 75, GY - 270 * q.s, 150, 270 * q.s + 66);
      if (hov) { hovId = q.id; UI.cursor = 'pointer'; c.save(); c.globalAlpha = .35 + .15 * Math.sin(t * 6); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(q.x, GY, 70 * q.s, 16, 0, 0, 6.3); c.fill(); c.restore(); }
      wsFigCached(c, 'v_' + q.id, q.id, q.x, GY, q.s, { flip: true, pose, t: t + q.i * 1.37, expr });
      this.drawPlate(c, q.id, q.x, GY + 14);
    });
    if (!lay.length) wsPop(c, 'Nobody around right now. Try another time of day.', 760, 420, 1, '#fffdf6', { size: 22, tc: ZK, rot: .02, maxW: 520 });
    if (hovId) { const n = wsNpc(hovId); tip(wsName(hovId), (n ? (n.title || '') + '. ' : '') + 'Tap to talk.'); }
    this.drawHeader(c, vv, own);
    // left: back to the map; right: venue services
    if (wsBtn(16, 76, 150, 56, 'MAP', { col: ZP.sky, icon: 'compass', size: 26 })) go(() => setScene(makeMapScene()));
    let sx = 1112;
    const va = this.venueActs().find(a => a.id === 'rest');
    if (va || (!wsReal() && (vv.type === 'rest' || vv.type === 'studio'))) {
      if (wsBtn(sx, 76, 152, 56, 'REST', { col: ZP.limeL, icon: 'tent', cost: wsCostText(va ? va.cost : { slots: 1 }) || 'free', size: 22, disabled: va && va.enabled === false, onDisabled: () => this.toast(va.why || 'Not now.') })) this.rest();
      if (va && UI.hit(sx, 76, 152, 56)) tip('Rest', va.label + '. ' + (va.why || ''));
      sx -= 168;
    }
    if (this.vmsg) this.drawVmsg(c);
    if (vv.type === 'studio' && wsBtn(sx, 76, 152, 56, 'STUDIO', { col: ZP.yel, icon: 'star', size: 22 })) go(() => setScene(new HomeStudioScene({ venue: this.v })));
    drawHUD(c, run);
    UI.enabled = uiOn;
    if (panel) this.drawPanel(c);
    // deferred tap on a figure
    if (!panel && UI.enabled && In.click) {
      const q = lay.find(q => Math.abs(In.click.x - q.x) < 75 && In.click.y > GY - 270 * q.s && In.click.y < GY + 66);
      if (q) { In.click = null; Snd.play('click'); this.open(q.id); }
    }
  }
  venueActs() { const W_ = wsW(); return typeof W_.venueActions === 'function' ? (wsTry(() => W_.venueActions(this.v), []) || []) : []; }
  toast(s) { this.vmsg = { lines: [s], t0: G.time }; }
  drawVmsg(c) {
    const m = this.vmsg, age = G.time - m.t0; if (age > 4.5) { this.vmsg = null; return; }
    c.save(); c.globalAlpha = clamp((4.5 - age) * 2, 0, 1); wsPop(c, m.lines.join(' '), 760, 210, age * 3, '#fffdf6', { size: 22, tc: ZK, maxW: 640 }); c.restore();
  }
  // Rest: the logic layer heals and spends the slot (World.doVenue('rest')); without it, fall back to the old RestScene
  rest() {
    const W_ = wsW();
    if (typeof W_.doVenue !== 'function') { wsTry(() => W_.advance(1)); saveRun(); wsGoBorrowed(this.v, () => new RestScene()); return; }
    const res = wsTry(() => W_.doVenue('rest'), null); if (!res) return;
    Snd.play('heal'); burst(180, 420, 30, { col: [ZP.limeL, '#fff', ZP.yel], shape: 'star', grav: -90 });
    this.vmsg = { lines: (res.lines || []).slice(0, 1), t0: G.time }; saveRun();
    const enc = (res.events || []).find(e => e.encounter); if (enc) { wsBegin(enc.encounter); return; }
    if ((res.events || []).some(e => e.type === 'dawn')) go(() => setScene(new DawnScene()));
  }
  drawDoor(c, x, gy, own) {
    const col = wsCrew(own) ? wsCol(own, 'dark') : '#4a4258', w = 200, h = 330, top = gy - h + 6;
    c.save(); c.globalAlpha = .96;
    c.fillStyle = 'rgba(21,16,28,.35)'; scn_rrect(c, x - w / 2 - 14, top - 14, w + 28, h + 14, 30); c.fill();
    c.beginPath(); c.moveTo(x - w / 2, gy); c.lineTo(x - w / 2, top + w / 2); c.arc(x, top + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, gy); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = ZK; c.lineWidth = 5; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * 34, gy - 6); c.lineTo(x + k * 34, top + w / 2 - Math.sqrt(Math.max(0, (w / 2) ** 2 - (k * 34) ** 2)) + 10); c.stroke(); }
    c.fillStyle = ZP.yel; c.beginPath(); c.arc(x + w / 2 - 24, gy - h * .42, 8, 0, 6.3); c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke();
    c.restore();
    if (wsCrew(own)) wsCrest(c, own, x, top - 4, 26);
    txt(c, 'MEMBERS ONLY', x, top + w / 2 + 6, { size: 17, font: FM, color: '#fff', align: 'center', stroke: ZK, sw: 4 });
  }
  drawPlate(c, id, x, y) {
    const n = wsNpc(id), name = wsName(id), col = n ? wsCol(n.crew) : ZP.lav, role = n ? n.role : '', rap = wsRapport(id);
    wsFont(c, 19, FD, 800); const tw = Math.max(130, c.measureText(name).width + 34);
    scn_sticker(c, x - tw / 2, y, tw, 52, 14, '#fffdf6', { pad: 4, lw: 2.8 });
    c.fillStyle = col; scn_rrect(c, x - tw / 2 + 5, y + 5, tw - 10, 7, 3); c.fill();
    txt(c, name, x, y + 31, { size: 19, font: FD, weight: 800, color: ZK, align: 'center' });
    if (role === 'boss' || role === 'enforcer') { c.save(); scn_sticker(c, x - 36, y - 16, 72, 20, 10, role === 'boss' ? ZP.yel : ZP.pink, { pad: 2, lw: 2, shadow: false }); txt(c, role.toUpperCase(), x, y - 1, { size: 13, font: FD, weight: 800, color: ZK, align: 'center' }); c.restore(); }
    wsHearts(c, x, y + 45, rap, 7);
  }
  drawHeader(c, vv, own) {
    const x = 316, y = 72, w = 610, h = 70;
    scn_sticker(c, x, y, w, h, 20, '#fffdf6', { pad: 5, band: wsCrew(own) ? wsCol(own, 'light') : ZP.limeL, bandW: 4, lw: 3 });
    const ns = wsFitSize(c, vv.name, 330, 34, FD, 800, 18);
    scn_bubbleLive(c, vv.name, x + 190, y + 36, ns, wsCrew(own) ? wsCol(own) : ZP.lime);
    const T = WS_TYPE[vv.type] || WS_TYPE.street; txt(c, T.label + ' · Day ' + wsDay() + ', ' + WS_SLOTS[wsSlotIdx()], x + 190, y + 62, { size: 13, font: FM, color: '#5c5368', align: 'center' });
    if (wsCrew(own)) {
      wsCrest(c, own, x + 400, y + 35, 18);
      txt(c, wsName(own), x + 426, y + 32, { size: 17, font: FD, weight: 800, color: wsCol(own, 'dark') });
      const s = wsStanding(own); txt(c, 'turf · you: ' + wsStName(s), x + 426, y + 53, { size: 15, font: FB, color: s <= -2 ? ZP.pinkD : s >= 2 ? ZP.limeD : '#5c5368' });
      if (UI.hit(x + 380, y, 240, h)) { tip(wsName(own), WS_ST_FX[String(clamp(Math.round(s), -3, 3))]); if (In.click) { In.click = null; G.modal = new CrewsModal(own); } }
    } else txt(c, own === 'contested' ? 'CONTESTED TURF' : 'Neutral ground', x + 430, y + 42, { size: 18, font: FD, weight: 800, color: own === 'contested' ? ZP.orange : '#7a7186' });
  }
  drawPanel(c) {
    const id = this.sel, n = wsNpc(id), t = G.time;
    if (!n && id !== 'jordan' && !this.residents().includes(id)) { this.sel = null; return; }
    c.fillStyle = 'rgba(21,16,28,.55)'; c.fillRect(0, 0, W, H);
    const px = 250, py = 140, pw = 1000, ph = 520, col = n ? wsCol(n.crew) : ZP.lav;
    scn_sticker(c, px, py, pw, ph, 26, '#fffaf0', { pad: 8, band: n && wsCrew(n.crew) ? wsCol(n.crew, 'light') : ZP.limeL, bandW: 6, lw: 4 });
    // bust portrait
    const bx = px + 20, by = py + 20, bw = 250, bh = 300;
    c.save(); scn_rrect(c, bx, by, bw, bh, 20); c.clip(); c.fillStyle = scn_mix(col, '#ffffff', .6); c.fillRect(bx, by, bw, bh);
    const sr = scn_rng(wsHash(id)); scn_spray(c, bx + bw * .5, by + bh * .45, 120, col, sr, { a: .35, dots: 0 });
    const talkNow = this.talk && !this.talkDone();
    c.translate(bx, by); ART.rj.bust(c, wsRjOf(id), bw, bh, { expr: (this.react[id] && this.react[id].until > this.t && this.react[id].expr) || (talkNow ? 'sing' : 'neutral'), t });
    c.restore();
    c.save(); scn_rrect(c, bx, by, bw, bh, 20); c.strokeStyle = ZK; c.lineWidth = 4; c.stroke(); c.restore();
    // identity
    const name = wsName(id), ns = wsFitSize(c, name, bw, 34, FD, 800, 16);
    scn_bubbleLive(c, name, bx + bw / 2, by + bh + 32, ns, col === '#f4b6e0' ? ZP.pink : col);
    txt(c, (n && n.title) || '', bx + bw / 2, by + bh + 62, { size: 17, font: FM, color: ZK, align: 'center' });
    if (n && wsCrew(n.crew)) { wsCrest(c, n.crew, bx + 28, by + bh + 96, 14); txt(c, wsName(n.crew), bx + 50, by + bh + 92, { size: 15, font: FD, weight: 800, color: wsCol(n.crew, 'dark') }); txt(c, wsStName(wsStanding(n.crew)), bx + 50, by + bh + 110, { size: 14, font: FB, color: '#5c5368' }); }
    else txt(c, 'Neutral friend', bx + bw / 2, by + bh + 100, { size: 16, font: FB, color: '#5c5368', align: 'center' });
    wsHearts(c, bx + bw - 34, by + bh + 98, wsRapport(id), 10);
    txt(c, 'rapport', bx + bw - 34, by + bh + 126, { size: 12, font: FM, color: '#7a7186', align: 'center' });
    // speech bubble
    const sx = px + 300, sy = py + 26, sw = pw - 330, sh = 180;
    wsSpeech(c, sx, sy, sw, sh, sx - 26, sy + 110, { band: scn_mix(col, '#ffffff', .5) });
    c.save(); c.beginPath(); c.rect(sx + 14, sy + 10, sw - 28, sh - 20); c.clip();
    let doneNow = true;
    if (this.talk) {
      const tk = this.talk, line = tk.lines[tk.i] || '', r = wsTypeText(c, line, sx + 26, sy + 46, sw - 52, 24, tk.t0, { cps: 70 }); doneNow = r.done;
      if (tk.offer && tk.i >= tk.lines.length - 1 && r.done) this.drawOffer(c, tk.offer, sx + 26, sy + 46 + r.h + 4, sw - 52);
    } else if (this.greet) { const r = wsTypeText(c, this.greet.text, sx + 26, sy + 46, sw - 52, 24, this.greet.t0, { cps: 70 }); doneNow = r.done; }
    c.restore();
    if (this.talk && !(this.talk.offer && this.talk.i >= this.talk.lines.length - 1)) txt(c, doneNow ? (this.talk.i < this.talk.lines.length - 1 ? 'tap for more ▶' : 'tap to continue ▶') : '...', sx + sw - 22, sy + sh - 14, { size: 14, font: FM, color: '#8a8296', align: 'right' });
    // buttons / conversation controls
    const gx = sx, gy = py + 226, cw = (sw - 16) / 2;
    if (this.talk) {
      const tk = this.talk, last = tk.i >= tk.lines.length - 1;
      if (tk.offer && last && this.talkDone()) {
        if (wsBtn(gx, gy + 150, cw, 64, 'ACCEPT', { col: ZP.lime, icon: 'star', size: 28 })) {
          const ok = wsTry(() => wsW().acceptRequest(tk.offer), true), bad = ok === false || (ok && ok.ok === false); this.acts = null;
          Snd.play(bad ? 'error' : 'buff');
          this.say(bad ? [(ok && ok.why) || 'You can\'t take on more Requests right now.'] : ['Deal! It\'s on your Requests list now.', 'Check REQUESTS on the map: a pin marks where to go.']); saveRun();
        } else if (wsBtn(gx + cw + 16, gy + 150, cw, 64, 'DECLINE', { col: '#d8d2de', tc: ZK, size: 28 })) { this.say(['Maybe another time.']); }
      } else {
        if (wsBtn(gx + sw - 230, gy, 230, 60, last ? 'OK' : 'NEXT  ▶', { col: ZP.sky, size: 26 }) || (UI.hit(sx, sy, sw, sh) && In.click && (In.click = null, true))) this.advanceTalk();
      }
    } else {
      const acts = this.actions();
      if (!acts.length) txt(c, 'They have nothing for you right now.', gx + sw / 2, gy + 60, { size: 20, font: FM, color: '#7a7186', align: 'center' });
      acts.slice(0, 8).forEach((a, i) => {
        const st = WS_ACT_STYLE[a.id] || { col: ZP.yel, icon: 'star' }, x = gx + (i % 2) * (cw + 16), y = gy + Math.floor(i / 2) * 70;
        const lab = String(a.label || a.id).replace(/\s*\([^)]*shil[^)]*\)\s*$/i, '');
        if (wsBtn(x, y, cw, 58, lab.toUpperCase(), { col: st.col, icon: st.icon, cost: wsCostText(a.cost), disabled: a.enabled === false, onDisabled: () => this.say([a.why || 'Not right now.'], { sys: true }), size: 24 })) this.doAction(a);
      });
      if (UI.hit(sx, sy, sw, sh) && In.click && this.greet) { In.click = null; this.greet.t0 = -99; }
    }
    if (wsClose(px + pw - 48, py - 18)) { this.sel = null; this.talk = null; }
  }
  talkDone() { const tk = this.talk; if (!tk) return true; const line = tk.lines[tk.i] || ''; return (G.time - tk.t0) * 70 >= line.length; }
  advanceTalk() {
    const tk = this.talk; if (!tk) return;
    if (!this.talkDone()) { tk.t0 = -99; return; }
    if (tk.i < tk.lines.length - 1) { tk.i++; tk.t0 = G.time; Snd.play('talk'); } else this.talk = null;
  }
  drawOffer(c, r, x, y, w) {
    const ty = y + 4; c.save(); scn_sticker(c, x - 4, ty, w + 8, 86, 12, '#fff8d8', { pad: 3, lw: 2.4, shadow: false });
    icon(c, wsReqIcon(r.type), x + 24, ty + 32, 16);
    const rt = wsD().RT[r.type]; txt(c, ((rt && rt.label) || r.type || 'Request').toUpperCase(), x + 50, ty + 22, { size: 16, font: FD, weight: 800, color: ZP.pinkD });
    wsFont(c, 16, FB); wsWrap(c, wsReqDesc(r), w - 70, 16).slice(0, 2).forEach((l, k) => txt(c, l, x + 50, ty + 42 + k * 18, { size: 16, color: ZK }));
    txt(c, 'Reward: ' + (wsRewardText(r.reward) || '?'), x + 50, ty + 79, { size: 14, font: FB, color: ZP.limeD });
    if (r.deadline || r.deadlineDay) txt(c, 'due Day ' + (r.deadline || r.deadlineDay), x + w - 8, ty + 22, { size: 15, font: FM, color: ZK, align: 'right' });
    c.restore();
  }
  onKey(k) { if (k === 'Escape') { if (this.sel) { this.sel = null; this.talk = null; } else openPause(); } else if ((k === ' ' || k === 'Enter') && this.talk) this.advanceTalk(); }
}

// ================================================================ HOME STUDIO (Jordan, upgrades, removals, favour list)
function wsStudioBg() {
  return scn_layer('ws_studio_bg', W, H, (c) => {
    const r = scn_rng(606);
    scn_paper(c, 0, 0, W, H, 606, '#fdf3fa');
    [[150, 220, 220, ZP.pinkL], [640, 160, 260, ZP.limeL], [1130, 230, 220, ZP.sky], [360, 600, 260, ZP.lav], [960, 620, 260, ZP.yel]].forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, { a: .4, drips: 2 }));
    // floor
    c.fillStyle = '#efe2cf'; c.fillRect(0, 560, W, 160); c.strokeStyle = ZK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 560); c.lineTo(W, 560); c.stroke();
    c.strokeStyle = 'rgba(21,16,28,.12)'; c.lineWidth = 2; for (let x = -200; x < W; x += 90) { c.beginPath(); c.moveTo(x, 720); c.lineTo(x + 140, 560); c.stroke(); }
    // posters on the wall
    [[110, 240, -.08, ZP.pinkL, 'LIVE!'], [1180, 250, .06, ZP.limeL, 'TOUR'], [250, 330, .05, ZP.sky, 'LOOPS']].forEach((p, i) => {
      c.save(); c.translate(p[0], p[1]); c.rotate(p[2]); scn_sticker(c, -60, -78, 120, 156, 6, ZP.cream, { pad: 4, lw: 2.5 }); scn_spray(c, 0, -10, 46, p[3], r, { a: .8, dots: 120 });
      scn_doodle(c, ['star', 'heart', 'note'][i], 0, -14, 22, { fill: [ZP.yel, ZP.pink, null][i], lw: 2.5 }); txt(c, p[4], 0, 52, { size: 22, font: FM, color: ZK, align: 'center' }); c.restore();
      scn_tape(c, p[0], p[1] - 80, 46, 14, p[2] * 2, ZP.limeL);
    });
    // mixing desk
    scn_box(c, 470, 470, 340, 90, ZP.navy, 10, 3.5); scn_box(c, 450, 448, 380, 30, ZP.lav, 8, 3);
    for (let i = 0; i < 12; i++) { c.fillStyle = SCN_CONF[i % 6]; c.beginPath(); c.arc(480 + i * 28, 463, 6, 0, 6.3); c.fill(); c.strokeStyle = ZK; c.lineWidth = 1.6; c.stroke(); }
    for (let i = 0; i < 8; i++) { c.fillStyle = '#fff'; c.fillRect(492 + i * 38, 492, 6, 52); c.fillStyle = ZP.pink; c.fillRect(486 + i * 38, 500 + (i * 13) % 34, 18, 9); c.strokeRect(486 + i * 38, 500 + (i * 13) % 34, 18, 9); }
    scn_doodle(c, 'speaker', 430, 500, 46, { lw: 3 }); scn_doodle(c, 'speaker', 850, 500, 46, { lw: 3 });
    // merch table
    scn_box(c, 930, 520, 260, 40, ZP.pink, 8, 3);
    scn_doodle(c, 'cassette', 980, 506, 22, { lw: 2.5, rot: -.1 }); scn_doodle(c, 'vinyl', 1060, 500, 22, { label: ZP.lime, lw: 2.5 });
    c.save(); c.translate(1130, 500); c.beginPath(); c.moveTo(-22, -18); c.lineTo(22, -18); c.lineTo(26, 18); c.lineTo(-26, 18); c.closePath(); c.fillStyle = ZP.limeL; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); c.beginPath(); c.arc(0, -18, 12, Math.PI, 0); c.stroke(); scn_doodle(c, 'heart', 0, 2, 7, { fill: ZP.pink, lw: 1.5 }); c.restore();
    scn_marker(c, 'JORDAN\'S TOTES', 1060, 590, 20, ZK, { rot: -.03 });
    scn_scatter(c, r, 16, 20, 80, W - 40, 340, [[300, 70, 680, 110], [60, 150, 260, 280], [1100, 150, 160, 220]], { smax: 16 });
  });
}
class HomeStudioScene {
  constructor(o = {}) { this.o = o; this.v = o.venue || 'home_studio'; this.msg = null; this.t = 0; }
  enter() { Snd.setMood('menu'); WS.returnVenue = null; const n = wsNpc('jordan'); this.line = (n && n.greet && n.greet.length) ? pick(n.greet) : 'Hey superstar! Your gear is where you left it.'; this.t0 = G.time; }
  update(dt) { this.t += dt; }
  draw(c) {
    const run = G.run, w = wsWorld(), t = G.time; if (!w) return;
    scn_blit(c, wsStudioBg(), 0, 0); wsSlotTint(c);
    const L = scn_bubbleLayer('HOME STUDIO', 54, ZP.lime, { seed: 11 }); c.save(); c.translate(W / 2, 110); c.rotate(-.02); scn_blitC(c, L, 0, 0, 1); c.restore();
    wsFigBudget(1); wsFigCached(c, 'st_hero', 'hero', 160, 640, .92, { rj: wsHeroRj() });
    wsFigCached(c, 'st_jordan', 'jordan', 1150, 650, .95, { pose: this.t < 1.2 ? 'cheer' : 'idle', t: t + 2, flip: true, expr: 'happy' });
    wsSpeech(c, 900, 150, 364, 116, 1110, 370, { band: ZP.limeL });
    c.save(); c.beginPath(); c.rect(908, 156, 348, 104); c.clip(); wsTypeText(c, this.msg || this.line, 920, 188, 330, 20, this.t0, { cps: 70 }); c.restore();
    const flags = w.flags = w.flags || {}, day = wsDay(), W_ = wsW(), real = typeof W_.venueActions === 'function';
    const va = real ? (wsTry(() => W_.venueActions(this.v), []) || []) : [], A = id => va.find(a => a.id === id);
    const up = A('upgrade'), rm = A('remove'), fv = A('favours');
    const sharpUsed = real ? !!(up && up.enabled === false) : flags.wsSharpenDay === day;
    const rmCost = real ? ((rm && rm.cost && rm.cost.shil) || 40) : 50 + 25 * (flags.wsRemoved || 0), rmOk = real ? !!(rm && rm.enabled !== false) : run.money >= rmCost;
    const cards = [
      { label: 'REWORK A CARD', sub: sharpUsed ? ((up && up.why) || 'Done for today. Come back tomorrow.') : 'Upgrade one card. Free, once a day.', col: ZP.yel, icon: 'up', dis: sharpUsed, go: () => this.sharpen() },
      { label: 'CUT A CARD', sub: `Remove a card from a deck for ${rmCost} shil.`, col: ZP.lav, icon: 'crack', dis: !rmOk, why: (rm && rm.why) || 'Not enough shil.', cost: rmCost + ' shil', go: () => this.remove(rmCost) },
      { label: 'SWAP FAVOURS', sub: `Pick who is on your list (${wsFavours().length}/3).`, col: ZP.pinkL, icon: 'heart', dis: real && fv && fv.enabled === false, why: fv && fv.why, go: () => { G.modal = new FavoursModal({ manage: true }); } },
      { label: 'TALK TO JORDAN', sub: 'Totes, gossip and favours.', col: ZP.limeL, icon: 'talk', go: () => go(() => setScene(new VenueScene({ venue: this.v, npc: 'jordan' }))) }
    ];
    cards.forEach((cd_, i) => {
      const x = 270 + (i % 2) * 310, y = 190 + Math.floor(i / 2) * 120;
      if (wsBtn(x, y, 300, 64, cd_.label, { col: cd_.col, icon: cd_.icon, cost: cd_.cost, disabled: cd_.dis, size: 21, onDisabled: () => { this.msg = cd_.why || cd_.sub; this.t0 = G.time; } })) cd_.go();
      txt(c, cd_.sub, x + 150, y + 90, { size: 15, font: FB, color: '#3a3346', align: 'center' });
    });
    if (wsBtn(16, 76, 150, 56, 'BACK', { col: ZP.sky, icon: 'compass', size: 26 })) go(() => setScene(new VenueScene({ venue: this.v })));
    drawHUD(c, run);
  }
  // the World's doVenue('upgrade'/'remove') + upgradeCard/removeCard do the work when present; the pick happens first so a cancel costs nothing
  sharpen() {
    const run = G.run, w = wsWorld(), W_ = wsW();
    openDeckView('Rework a Card', { b: run.deck, n: run.ndeck }, {
      pick: (inst, tab) => {
        const l = tab === 'b' ? run.deck : run.ndeck, k = l.indexOf(inst) >= 0 ? l.indexOf(inst) : l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k < 0) return;
        let ok;
        if (typeof W_.doVenue === 'function' && typeof W_.upgradeCard === 'function') { wsTry(() => W_.doVenue('upgrade')); ok = wsTry(() => W_.upgradeCard(tab, k), false); }
        else { l[k].up = true; w.flags.wsSharpenDay = wsDay(); ok = true; }
        if (ok) { Snd.play('buff'); burst(W / 2, 300, 40, { col: [ZP.yel, ZP.limeL, '#fff'], shape: 'star' }); this.msg = `${cd({ id: inst.id }).name} sounds sharper already!`; this.t0 = G.time; saveRun(); }
      },
      canPick: inst => { const d = BC[inst.id] || NC[inst.id]; return d && !inst.up && d.rarity !== 'curse' && d.upg && Object.keys(d.upg).length > 0; }, hint: 'Choose a card to upgrade.', preview: 1
    });
  }
  remove(cost) {
    const run = G.run, w = wsWorld(), W_ = wsW();
    openDeckView('Cut a Card', { b: run.deck, n: run.ndeck }, {
      pick: (inst, tab) => {
        if (run.money < cost) return; const l = tab === 'b' ? run.deck : run.ndeck, k = l.indexOf(inst) >= 0 ? l.indexOf(inst) : l.findIndex(q => q.id === inst.id && q.up === inst.up); if (k < 0) return;
        let ok;
        if (typeof W_.doVenue === 'function' && typeof W_.removeCard === 'function') { const r = wsTry(() => W_.doVenue('remove'), null); ok = wsTry(() => W_.removeCard(tab, k, (r && r.cost) || cost), false); }
        else { l.splice(k, 1); run.money -= cost; w.flags.wsRemoved = (w.flags.wsRemoved || 0) + 1; ok = true; }
        if (ok) { Snd.play('stamp'); this.msg = 'Gone. Jordan turns it into a sticker.'; this.t0 = G.time; saveRun(); } else { Snd.play('error'); this.msg = 'Jordan shakes their head: that one stays (Favour cards can\'t be cut).'; this.t0 = G.time; }
      },
      canPick: inst => !/^favour_/.test(inst.id), hint: 'Choose a card to remove forever.'
    });
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ================================================================ MODALS
// shared paging for lists (touch friendly: big PREV / NEXT buttons, wheel also works)
function wsPager(m, total, per, x, y) {
  const pages = Math.max(1, Math.ceil(total / per)); m.page = clamp(m.page || 0, 0, pages - 1);
  if (pages > 1) {
    if (wsBtn(x, y, 130, 52, '< PREV', { col: ZP.sky, size: 20, disabled: m.page === 0, lock: false })) m.page--;
    txt(ctx, `${m.page + 1} / ${pages}`, x + 200, y + 34, { size: 20, font: FD, weight: 800, color: ZK, align: 'center' });
    if (wsBtn(x + 270, y, 130, 52, 'NEXT >', { col: ZP.sky, size: 20, disabled: m.page >= pages - 1, lock: false })) m.page++;
  }
  return m.page * per;
}
class RequestsModal {
  constructor() { this.tab = 'active'; this.page = 0; }
  onKey(k) { if (k === 'Escape') closeModal(); }
  onWheel(d) { this.page += d > 0 ? 1 : -1; }
  draw(c) {
    UI.enabled = !G.trans;
    const f = wsModalFrame(c, 'REQUESTS', ZP.yel);
    if (wsClose(f.x + f.w - 66, f.y + 12)) { closeModal(); return; }
    const all = wsRequests().filter(Boolean), isAct = r => !r.state || r.state === 'active' || r.state === 'accepted';
    const act = all.filter(isAct), old = all.filter(r => !isAct(r) && r.state !== 'offered');
    if (wsBtn(f.x + 40, f.y + 50, 220, 52, `ACTIVE (${act.length}/3)`, { col: this.tab === 'active' ? ZP.yel : '#ece6f2', tc: this.tab === 'active' ? '#fff' : ZK, size: 20 })) { this.tab = 'active'; this.page = 0; }
    if (wsBtn(f.x + 276, f.y + 50, 220, 52, `LOG (${old.length})`, { col: this.tab === 'log' ? ZP.yel : '#ece6f2', tc: this.tab === 'log' ? '#fff' : ZK, size: 20 })) { this.tab = 'log'; this.page = 0; }
    const list = (this.tab === 'active' ? act : old.slice().reverse()), per = 4, start = wsPager(this, list.length, per, f.x + f.w - 440, f.y + 50);
    if (!list.length) {
      txt(c, this.tab === 'active' ? 'No active Requests.' : 'Nothing finished yet.', W / 2, 330, { size: 30, font: FM, color: '#7a7186', align: 'center' });
      txt(c, 'Fixers, merchants and bosses hand out Requests: tap them in a venue and pick REQUEST.', W / 2, 372, { size: 20, color: '#5c5368', align: 'center' });
      return;
    }
    list.slice(start, start + per).forEach((r, i) => this.card(c, r, f.x + 30, f.y + 122 + i * 132, f.w - 60));
  }
  card(c, r, x, y, w) {
    const h = 118, done = r.state === 'done' || r.state === 'complete', failed = r.state === 'failed' || r.state === 'expired', giver = r.giver, n = wsNpc(giver);
    scn_sticker(c, x, y, w, h, 18, done ? '#eefbe2' : failed ? '#f6eef2' : '#fffdf6', { pad: 4, lw: 3, band: r.crew && wsCrew(r.crew) ? wsCol(r.crew, 'light') : null, bandW: 3 });
    c.beginPath(); c.arc(x + 54, y + h / 2, 34, 0, 6.3); c.fillStyle = ZP.yel; c.fill(); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke(); icon(c, wsReqIcon(r.type), x + 54, y + h / 2, 22);
    if (giver) wsMiniBust(c, giver, x + 136, y + h / 2, 34);
    const rt = wsD().RT[r.type], title = ((rt && rt.label) || r.type || 'Request').toUpperCase();
    txt(c, title, x + 188, y + 32, { size: 22, font: FD, weight: 800, color: ZP.pinkD });
    txt(c, 'from ' + (giver ? wsName(giver) : '?') + (r.crew && wsCrew(r.crew) ? ' (' + wsName(r.crew) + ')' : ''), x + 188 + (wsFitSize(c, title, 300, 22, FD, 800) && c.measureText(title).width) + 14, y + 32, { size: 16, font: FB, color: '#5c5368' });
    wsWrap(c, wsReqDesc(r), w - 520, 18).slice(0, 2).forEach((l, k) => txt(c, l, x + 188, y + 60 + k * 21, { size: 18, color: ZK }));
    const rw = wsRewardText(r.reward); if (rw) txt(c, 'Reward: ' + rw, x + 188, y + 106, { size: 15, font: FB, color: ZP.limeD });
    const dl = r.deadline || r.deadlineDay, rx = x + w - 300;
    if (dl) { const urgent = dl <= wsDay(); scn_sticker(c, rx, y + 16, 130, 34, 12, urgent ? ZP.pinkL : '#fff', { pad: 2, lw: 2, shadow: false }); txt(c, 'due Day ' + dl, rx + 65, y + 39, { size: 17, font: FM, color: urgent ? ZP.pinkD : ZK, align: 'center' }); }
    if (done || failed) { c.save(); c.translate(x + w - 90, y + h / 2); c.rotate(-.18); c.strokeStyle = done ? ZP.limeD : ZP.pinkD; c.lineWidth = 4; scn_rrect(c, -70, -24, 140, 48, 8); c.stroke(); txt(c, done ? 'DONE!' : 'FAILED', 0, 10, { size: 28, font: FD, weight: 800, color: done ? ZP.limeD : ZP.pinkD, align: 'center' }); c.restore(); }
    else {
      const v = wsReqVenue(r);
      if (v && wsVenue(v)) {
        txt(c, 'at ' + wsVenue(v).name, rx + 65, y + 74, { size: 15, font: FB, color: '#5c5368', align: 'center' });
        if (wsBtn(x + w - 156, y + 30, 136, 56, 'SHOW', { col: ZP.sky, icon: 'compass', size: 20 })) {
          closeModal();
          if (G.scene instanceof WorldMapScene) G.scene.panel = v; else go(() => setScene(new WorldMapScene({ venue: v, show: true })));
        }
      }
    }
  }
}
class CrewsModal {
  constructor(focus) { this.focus = focus || null; }
  onKey(k) { if (k === 'Escape') closeModal(); }
  draw(c) {
    UI.enabled = !G.trans;
    const f = wsModalFrame(c, 'THE CREWS', ZP.limeL, { tcol: ZP.lime });
    if (wsClose(f.x + f.w - 66, f.y + 12)) { closeModal(); return; }
    txt(c, 'Help a crew and its rival cools on you, its friends warm up. Standing runs from Hostile (-3) to Bonded (+3).', W / 2, f.y + 66, { size: 17, font: FB, color: '#5c5368', align: 'center' });
    const ids = wsCrewIds(), rowH = 112, turfN = {};
    Object.keys(wsD().VENUES).forEach(v => { const o = wsTurf(v); turfN[o] = (turfN[o] || 0) + 1; });
    ids.forEach((id, i) => {
      const cr = wsCrew(id), y = f.y + 84 + i * rowH, x = f.x + 24, w = f.w - 48, st = wsStanding(id), foc = this.focus === id;
      scn_sticker(c, x, y, w, rowH - 10, 18, foc ? scn_mix(cr.color, '#ffffff', .78) : '#fffdf6', { pad: 3, lw: foc ? 3.5 : 2.4, shadow: false });
      wsCrest(c, id, x + 52, y + 50, 32);
      txt(c, wsName(id), x + 98, y + 34, { size: 24, font: FD, weight: 800, color: wsCol(id, 'dark') });
      const mo = '"' + (cr.motto || cr.sound || '') + '"'; txt(c, mo, x + 98, y + 56, { size: wsFitSize(c, mo, 296, 15, FM, '', 10), font: FM, color: ZK });
      const rel = (arr, lab, yy) => { let xx = x + 98; txt(c, lab, xx, yy, { size: 14, font: FB, color: '#5c5368' }); xx += 62; if (!arr || !arr.length) { txt(c, 'none', xx, yy, { size: 14, font: FB, color: '#9a93a6' }); return; } arr.forEach(o => { if (!wsCrew(o)) return; wsCrest(c, o, xx + 8, yy - 5, 8); txt(c, wsName(o).replace(/^The /, ''), xx + 20, yy, { size: 14, font: FD, weight: 800, color: wsCol(o, 'dark') }); wsFont(c, 14, FD, 800); xx += c.measureText(wsName(o).replace(/^The /, '')).width + 34; }); };
      rel(cr.rivals, 'rivals:', y + 78); rel(cr.friends, 'friends:', y + 96);
      wsStandingBar(c, x + 400, y + 24, 350, st, id);
      txt(c, (st > 0 ? '+' : '') + st + ' ' + wsStName(st), x + 575, y + 90, { size: 16, font: FD, weight: 800, color: st >= 2 ? ZP.limeD : st <= -2 ? ZP.pinkD : ZK, align: 'center' });
      wsWrap(c, WS_ST_FX[String(clamp(Math.round(st), -3, 3))], 252, 15).slice(0, 5).forEach((l, k) => txt(c, l, x + 776, y + 26 + k * 18, { size: 15, color: ZK }));
      icon(c, 'shield', x + w - 46, y + 30, 14); txt(c, String(turfN[id] || 0), x + w - 46, y + 70, { size: 26, font: FD, weight: 800, color: wsCol(id, 'dark'), align: 'center' }); txt(c, 'turf', x + w - 46, y + 88, { size: 13, font: FM, color: '#5c5368', align: 'center' });
    });
  }
}
class FavoursModal {
  constructor(o = {}) { this.o = o; }
  onKey(k) { if (k === 'Escape') closeModal(); }
  bench() { const W_ = wsW(), fav = wsFavours(); const rec = typeof W_.recruitedList === 'function' ? (wsTry(() => W_.recruitedList(), []) || []) : Object.keys((wsWorld() || {}).npc || {}).filter(id => wsWorld().npc[id].recruited); return rec.filter(id => !fav.includes(id)); }
  draw(c) {
    UI.enabled = !G.trans;
    const f = wsModalFrame(c, 'FAVOURS', ZP.pinkL);
    if (wsClose(f.x + f.w - 66, f.y + 12)) { closeModal(); return; }
    const fav = wsFavours().slice(0, 3), t = G.time, man = !!this.o.manage, colH = man ? 400 : 500;
    txt(c, man ? 'Bench a friend to make room, or add a benched friend to an empty slot.' : 'Friends on your list jump in as Favour cards (battle + talk). Max 3; swap them at the Home Studio.', W / 2, f.y + 66, { size: 18, font: FB, color: '#5c5368', align: 'center' });
    for (let i = 0; i < 3; i++) {
      const id = fav[i], x = f.x + 60 + i * ((f.w - 120) / 3), w = (f.w - 120) / 3 - 30, y = f.y + 92;
      if (!id) {
        c.save(); c.setLineDash([10, 8]); c.strokeStyle = 'rgba(21,16,28,.4)'; c.lineWidth = 3; scn_rrect(c, x, y, w, colH, 22); c.stroke(); c.restore();
        scn_doodle(c, 'heart', x + w / 2, y + colH * .34, 34, { fill: '#fff', lw: 3, sticker: 3, shine: false });
        txt(c, 'Empty slot', x + w / 2, y + colH * .52, { size: 26, font: FM, color: '#7a7186', align: 'center' });
        wsWrap(c, 'Chat and gift until someone trusts you, then pick RECRUIT in their venue.', w - 40, 17).forEach((l, k) => txt(c, l, x + w / 2, y + colH * .52 + 34 + k * 22, { size: 17, color: '#5c5368', align: 'center' }));
        continue;
      }
      const n = wsNpc(id), col = n ? wsCol(n.crew) : ZP.lav;
      scn_sticker(c, x, y, w, colH, 22, scn_mix(col, '#ffffff', .75), { pad: 5, lw: 3 });
      const bh = man ? 130 : 170;
      c.save(); scn_rrect(c, x + 14, y + 14, 130, bh, 16); c.clip(); c.fillStyle = scn_mix(col, '#ffffff', .45); c.fillRect(x + 14, y + 14, 130, bh);
      c.translate(x + 14, y + 14); ART.rj.bust(c, wsRjOf(id), 130, bh, { expr: 'happy', t: t + i }); c.restore();
      c.save(); scn_rrect(c, x + 14, y + 14, 130, bh, 16); c.strokeStyle = ZK; c.lineWidth = 3; c.stroke(); c.restore();
      txt(c, wsName(id), x + 156, y + 44, { size: wsFitSize(c, wsName(id), w - 166, 24, FD, 800, 14), font: FD, weight: 800, color: ZK });
      if (n && wsCrew(n.crew)) { wsCrest(c, n.crew, x + 168, y + 74, 10); txt(c, wsName(n.crew).replace(/^The /, ''), x + 184, y + 79, { size: 14, font: FD, weight: 800, color: wsCol(n.crew, 'dark') }); }
      wsWrap(c, (n && n.title) || '', w - 166, 15).slice(0, 2).forEach((l, k) => txt(c, l, x + 156, y + 106 + k * 18, { size: 15, font: FB, color: '#5c5368' }));
      // the Favour card pair: battle (BC) and talk (NC) share the id favour_<npc>; cd() resolves BC, the talk twin is drawn from NC directly
      const bid = 'favour_' + id, hasB = typeof BC !== 'undefined' && BC[bid], tid = typeof NC === 'undefined' ? null : [bid + '_t', bid + '_talk', bid + '_n', bid].find(k => NC[k]), cy = y + (man ? 268 : 340), sc = man ? .62 : .78;
      const list = []; if (hasB) list.push(() => cd({ id: bid })); if (tid) list.push(() => (tid === bid && hasB) ? Object.assign({ up: false }, NC[tid]) : cd({ id: tid }));
      if (list.length) list.forEach((mk, k) => { const cx = x + w / 2 + (list.length > 1 ? (k - .5) * (w * .5) : 0); wsTry(() => drawCard(c, mk(), cx, cy, (k - .5) * .06, sc)); });
      else txt(c, 'FAVOUR', x + w / 2, cy, { size: 24, font: FD, weight: 800, color: col, align: 'center', stroke: ZK, sw: 4 });
      if (man && wsBtn(x + 20, y + colH - 64, w - 40, 52, 'BENCH', { col: '#d8d2de', tc: ZK, size: 22 })) { wsTry(() => wsW().setFavours(fav.filter(q => q !== id))); saveRun(); Snd.play('stamp'); }
    }
    if (man) {
      const bench = this.bench(), by = f.y + 92 + colH + 20, full = fav.length >= 3;
      txt(c, bench.length ? 'ON THE BENCH' : 'Nobody on the bench.', f.x + 60, by + 20, { size: 20, font: FM, color: ZK });
      bench.slice(0, 6).forEach((id, i) => {
        const bx = f.x + 60 + i * 185, yy = by + 34;
        wsMiniBust(c, id, bx + 30, yy + 34, 28);
        txt(c, wsName(id), bx + 66, yy + 26, { size: wsFitSize(c, wsName(id), 110, 16, FD, 800, 11), font: FD, weight: 800, color: ZK });
        if (wsBtn(bx + 66, yy + 34, 100, 46, 'ADD', { col: ZP.limeL, size: 20, disabled: full, onDisabled: () => toast('Bench someone first (max 3).') })) { wsTry(() => wsW().setFavours(fav.concat([id]))); saveRun(); Snd.play('buff'); }
      });
    }
  }
}
class StreetBuzzModal {
  constructor() { this.page = 0; }
  onKey(k) { if (k === 'Escape') closeModal(); }
  onWheel(d) { this.page += d > 0 ? 1 : -1; }
  draw(c) {
    UI.enabled = !G.trans;
    const f = wsModalFrame(c, 'STREET BUZZ', ZP.pinkL);
    if (wsClose(f.x + f.w - 66, f.y + 12)) { closeModal(); return; }
    const w = wsWorld(); let all;
    if (w && w.rumorLog && w.rumorLog.length) { all = []; w.rumorLog.forEach(e => (e.lines || []).forEach(l => all.push(typeof l === 'string' ? { text: l, day: e.day } : Object.assign({ day: e.day }, l)))); all.reverse(); }
    else all = ((w && w.rumors && w.rumors.length ? w.rumors : wsRumors()) || []).slice().reverse();
    const per = 7;
    const start = wsPager(this, all.length, per, f.x + f.w / 2 - 200, f.y + f.h - 70);
    if (!all.length) { txt(c, 'Quiet on the streets. For now.', W / 2, 340, { size: 30, font: FM, color: '#7a7186', align: 'center' }); return; }
    all.slice(start, start + per).forEach((r, i) => {
      const y = f.y + 70 + i * 74, x = f.x + 40, cr = wsRumorCrew(r), s = wsRumorText(r);
      scn_sticker(c, x, y, f.w - 80, 62, 14, i === 0 && start === 0 ? '#fff8d8' : '#fffdf6', { pad: 3, lw: 2.2, shadow: false });
      if (cr) wsCrest(c, cr, x + 34, y + 31, 18); else scn_doodle(c, 'note', x + 34, y + 31, 16, { lw: 2.5 });
      const lines = wsWrap(c, s, f.w - 200, 19); lines.slice(0, 2).forEach((l, k) => txt(c, l, x + 68, y + (lines.length > 1 ? 26 : 38) + k * 22, { size: 19, color: ZK }));
      if (r && r.day) txt(c, 'Day ' + r.day, x + f.w - 96, y + 38, { size: 15, font: FM, color: '#7a7186', align: 'right' });
    });
  }
}

// ================================================================ FINALE INTRO (Headliner Night at The Stage)
function wsBossOf(crew) { return Object.values(wsD().NPCS).find(n => n.crew === crew && n.role === 'boss'); }
class FinaleIntroScene {
  constructor(o = {}) { this.o = o; this.t = 0; }
  enter() {
    Snd.setMood('battle'); Snd.play('drum'); WS.returnVenue = null;
    this.spec = this.o.spec || wsTry(() => wsW().finale(), null) || { kind: 'encounter', mode: 'fight', enemies: [], flags: { finale: true } };
    const ids = wsCrewIds();
    this.cheer = ids.filter(id => wsStanding(id) >= 3).map(id => wsBossOf(id)).filter(Boolean).map(n => n.id);
    wsFavours().forEach(f => { if (!this.cheer.includes(f) && this.cheer.length < 4) this.cheer.push(f); });
    this.boo = ids.filter(id => wsStanding(id) <= -3).map(id => wsBossOf(id)).filter(Boolean).map(n => n.id).filter(id => !(this.spec.enemies || []).includes(id));
    this.cheer = this.cheer.slice(0, 4); this.boo = this.boo.slice(0, 3);
    this.heads = (this.spec.enemies || []).slice(0, 2);
    if (!this.heads.length && this.spec.npc) this.heads = [this.spec.npc];
  }
  update(dt) { this.t += dt; if (this.t > .4 && Math.random() < dt * 10) G.particles.push({ x: rnd(0, W), y: -10, vx: rnd(-30, 30), vy: rnd(60, 160), life: 0, max: 6, size: rnd(4, 8), col: pick(SCN_CONF), grav: 20, rot: 0, vr: rnd(-6, 6), shape: pick(['rect', 'star']), drag: .1 }); }
  draw(c) {
    const t = G.time, k = this.t, run = G.run;
    drawBackdrop(c, 'night', 77, t); c.fillStyle = 'rgba(20,24,43,.45)'; c.fillRect(0, 0, W, H);
    // light cones sweeping in
    const la = clamp(k * 1.5, 0, 1);
    [[160, ZP.pink, .5], [440, ZP.cyan, -.2], [840, ZP.lime, .25], [1120, ZP.yel, -.45]].forEach((L, i) => scn_drawCone(c, L[1], L[0], 50, L[2] + Math.sin(t * .9 + i * 1.7) * .35, 640, .55 * la));
    // stage
    c.save(); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(W / 2, 600, 560, 40, 0, 0, 6.3); c.fill(); c.restore();
    scn_box(c, 90, 540, W - 180, 64, ZP.lav, 14, 4); c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(104, 548, W - 208, 8);
    for (let i = 0; i < 22; i++) { c.fillStyle = SCN_CONF[i % 6]; c.globalAlpha = .6 + .4 * Math.sin(t * 5 + i); c.beginPath(); c.arc(120 + i * 48, 590, 6, 0, 6.3); c.fill(); c.globalAlpha = 1; c.strokeStyle = ZK; c.lineWidth = 1.5; c.stroke(); }
    for (const sx of [70, W - 70]) { scn_doodle(c, 'speaker', sx, 440, 66, { lw: 4 }); scn_doodle(c, 'speaker', sx, 300, 50, { lw: 3.5 }); }
    // the hero and the headliner(s)
    const GY = 560;
    wsFigBudget(3); wsFigCached(c, 'fi_hero', 'hero', 300, GY, 1.02, { rj: wsHeroRj(), pose: k > 2.2 ? 'windup' : 'idle' });
    this.heads.forEach((id, i) => { const e = clamp((k - .5 - i * .4) * 2, 0, 1); if (e <= 0) return; c.save(); c.globalAlpha = e; wsFigCached(c, 'fi_h' + i, id, 820 + i * 220 + (1 - e) * 200, GY, i === 0 ? 1.22 : 1.02, { flip: true, pose: k > 2.4 ? 'windup' : 'idle', t: t + i, expr: 'angry' }); c.restore(); });
    // crowd: cheering friends front-left, hecklers front-right (cut off by the bottom edge)
    this.cheer.forEach((id, i) => { const e = clamp((k - 1.1 - i * .2) * 3, 0, 1); if (e <= 0) return; const x = 120 + i * 120, y = H + 96 - e * 40; wsFigCached(c, 'fi_c' + i, id, x, y, .72, { pose: 'cheer', t: t + i * .7, expr: 'happy', fps: 12 }); if (Math.sin(t * 4 + i) > .3) scn_blitC(c, scn_dsprite('heart', 10, { fill: ZP.pink, lw: 2, sticker: 2 }), x + 30, y - 220 - ((t * 40 + i * 30) % 60), 1); });
    this.boo.forEach((id, i) => { const e = clamp((k - 1.6 - i * .2) * 3, 0, 1); if (e <= 0) return; const x = W - 120 - i * 130, y = H + 96 - e * 40; wsFigCached(c, 'fi_b' + i, id, x, y, .72, { flip: true, pose: 'idle', t: t + i, expr: 'angry', fps: 12 }); if ((t * 1.3 + i * .5) % 2 < 1.2) wsPop(c, 'BOO!', x - 20, y - 250, 1, ZP.navy, { size: 22, rot: .08 }); });
    // titles
    const TL = scn_bubbleLayer('HEADLINER NIGHT', 70, ZP.pink, { seed: 13 }); c.save(); c.translate(W / 2, 118); c.rotate(-.02); scn_blitC(c, TL, 0, 0, ease.back(clamp(k * 2, 0, 1))); c.restore();
    const hn = this.heads[0], hc = hn && wsNpc(hn) && wsNpc(hn).crew;
    if (hn && k > .7) wsPop(c, `${wsName(hn)}${wsCrew(hc) ? ' of ' + wsName(hc) : ''} takes the stage!`, W / 2, 196, (k - .7) * 3, hc && wsCrew(hc) ? wsCol(hc) : ZP.orange, { size: 26, maxW: 760 });
    if (k > 1.2) { const s = this.cheer.length ? 'ON YOUR SIDE: ' + this.cheer.map(wsName).join(', ') : 'Nobody in the crowd owes you one... yet.'; txt(c, s, 40, 270, { size: 20, font: FD, weight: 800, color: '#fff', stroke: ZK, sw: 5 }); }
    if (k > 1.6 && this.boo.length) txt(c, 'HECKLING: ' + this.boo.map(wsName).join(', '), W - 40, 270, { size: 20, font: FD, weight: 800, color: ZP.pinkL, stroke: ZK, sw: 5, align: 'right' });
    const bz = wsBuzz(); if (k > 1.4) txt(c, `Buzz ${bz}: the Headliner is ${Math.round(Math.min(40, Math.floor(bz / 2) * 10))}% weaker`, W / 2, 300, { size: 18, font: FM, color: '#fff', stroke: ZK, sw: 4, align: 'center' });
    if (k > 1.2 && wsBtn(W / 2 - 170, 626, 340, 70, 'FACE THE MUSIC', { col: ZP.pink, icon: 'star', size: 32 })) wsBegin(this.spec);
    if (wsBtn(16, 76, 150, 56, 'NOT YET', { col: ZP.sky, size: 22 })) go(() => setScene(makeMapScene()));
    drawHUD(c, run);
  }
  onKey(k) { if (k === 'Escape') openPause(); }
}

// ================================================================ DAWN (Street Buzz summary between days)
function wsDawnBg() {
  return scn_layer('ws_dawn_bg', W, H, (c) => {
    const r = scn_rng(2626);
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ffd9ec'); g.addColorStop(.55, '#fff1d6'); g.addColorStop(1, '#fbf7ea'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    scn_paper(c, 0, 0, W, H, 2626, 'rgba(0,0,0,0)');
    [[200, 160, 200, ZP.pinkL], [1080, 140, 220, ZP.yel], [640, 640, 320, ZP.limeL]].forEach(s => scn_spray(c, s[0], s[1], s[2], s[3], r, { a: .4 }));
    // skyline silhouette
    c.fillStyle = 'rgba(122,69,176,.18)'; c.strokeStyle = 'rgba(21,16,28,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 470);
    let x = 0; while (x < W) { const w = 40 + r() * 70, h = 60 + r() * 140; c.lineTo(x, 470 - h); c.lineTo(x + w, 470 - h); x += w; } c.lineTo(W, 470); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
    scn_scatter(c, r, 18, 20, 20, W - 40, 200, [[300, 20, 680, 200]], { smax: 16 });
  });
}
class DawnScene {
  constructor() { this.t = 0; }
  enter() {
    Snd.setMood('menu'); Snd.play('ding');
    const w = wsWorld(); w.flags = w.flags || {};
    this.day = w.day; w.flags.wsDay = w.day;
    this.lines = (wsRumors() || []).slice(-4);
    const snap = w.flags.wsTurf || {};
    this.flips = Object.keys(wsD().VENUES).map(v => ({ v, from: snap[v] || 'none', to: wsTurf(v) })).filter(f => f.from !== f.to).slice(0, 4);
    this.hunters = wsCrewIds().filter(id => wsStanding(id) <= -3);
    saveRun();
  }
  update(dt) { this.t += dt; }
  draw(c) {
    const t = G.time, k = this.t, run = G.run;
    scn_blit(c, wsDawnBg(), 0, 0);
    // rising sun
    const sy = 560 - ease.out(clamp(k / 1.4, 0, 1)) * 110;
    c.save(); c.beginPath(); c.rect(0, 0, W, 470); c.clip(); c.translate(W / 2, sy); c.rotate(t * .1);
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillStyle = i % 2 ? scn_rgba(ZP.yel, .35) : scn_rgba(ZP.pinkL, .3); c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -700); c.lineTo(40, -700); c.closePath(); c.fill(); }
    c.restore();
    c.save(); c.beginPath(); c.rect(0, 0, W, 470); c.clip(); c.beginPath(); c.arc(W / 2, sy, 90, 0, 6.3); c.fillStyle = ZP.yel; c.fill(); c.strokeStyle = ZK; c.lineWidth = 4; c.stroke(); c.restore();
    const L = scn_bubbleLayer('DAY ' + this.day, 92, ZP.lime, { seed: this.day }); c.save(); c.translate(W / 2, 112); c.rotate(-.025); scn_blitC(c, L, 0, 0, ease.back(clamp(k * 2, 0, 1))); c.restore();
    const left = WS_DAYS - this.day;
    scn_marker(c, left > 0 ? `${left} day${left > 1 ? 's' : ''} until Headliner Night` : 'TONIGHT: HEADLINER NIGHT AT THE STAGE!', W / 2, 186, 24, left > 0 ? ZK : ZP.pinkD);
    // street buzz cards
    const cards = this.lines.map(r => ({ text: wsRumorText(r), crew: wsRumorCrew(r) }));
    this.hunters.forEach(h => cards.push({ text: `${wsName(h)} are hunting you. Watch your back today.`, crew: h, hot: true }));
    if (!cards.length) cards.push({ text: 'A quiet night in the Rust Quarter. Nobody made a move.', crew: null });
    const shown = cards.slice(0, 5), cx0 = this.flips.length ? 70 : 190, cw = this.flips.length ? 700 : 900;
    scn_marker(c, 'STREET BUZZ', cx0 + 80, 236, 26, ZP.pinkD, { rot: -.03 });
    shown.forEach((cd_, i) => {
      const e = clamp((k - .5 - i * .25) * 3, 0, 1); if (e <= 0) return; const y = 256 + i * 72;
      c.save(); c.globalAlpha = e; c.translate((1 - e) * -120, 0);
      scn_sticker(c, cx0, y, cw, 60, 16, cd_.hot ? '#ffe0ee' : '#fffdf6', { pad: 4, lw: 2.6, band: cd_.crew && wsCrew(cd_.crew) ? wsCol(cd_.crew, 'light') : null, bandW: 3 });
      if (cd_.crew && wsCrew(cd_.crew)) wsCrest(c, cd_.crew, cx0 + 34, y + 30, 18); else scn_doodle(c, 'note', cx0 + 34, y + 30, 15, { lw: 2.5 });
      const ls = wsWrap(c, cd_.text, cw - 90, 19); ls.slice(0, 2).forEach((l, q) => txt(c, l, cx0 + 66, y + (ls.length > 1 ? 25 : 37) + q * 21, { size: 19, color: ZK }));
      c.restore();
    });
    // turf flips with a crest flip animation
    if (this.flips.length) {
      scn_marker(c, 'TURF CHANGED HANDS', 1010, 236, 22, ZK, { rot: .02 });
      this.flips.forEach((f, i) => {
        const y = 256 + i * 92, x = 800, e = clamp((k - 1 - i * .4) * 2, 0, 1);
        scn_sticker(c, x, y, 410, 80, 16, '#fffdf6', { pad: 4, lw: 2.6 });
        txt(c, wsVenue(f.v).name, x + 205, y + 26, { size: 19, font: FD, weight: 800, color: ZK, align: 'center' });
        const fx = x + 205, flip = Math.cos(e * Math.PI), who = e < .5 ? f.from : f.to;
        c.save(); c.translate(fx, y + 54); c.scale(Math.abs(flip) * (e >= 1 ? 1 : 1), 1); if (wsCrew(who)) wsCrest(c, who, 0, 0, 16); else { c.beginPath(); c.arc(0, 0, 16, 0, 6.3); c.fillStyle = who === 'contested' ? ZP.yel : '#e9e3d6'; c.fill(); c.strokeStyle = ZK; c.lineWidth = 2.5; c.stroke(); } c.restore();
        txt(c, wsName(f.from).replace(/^The /, ''), fx - 34, y + 60, { size: 15, font: FB, color: '#7a7186', align: 'right' });
        txt(c, '→ ' + wsName(f.to).replace(/^The /, ''), fx + 30, y + 60, { size: 15, font: FD, weight: 800, color: wsCrew(f.to) ? wsCol(f.to, 'dark') : ZK });
      });
    }
    if (k > .8 && wsBtn(W / 2 - 170, 636, 340, 66, 'HIT THE STREETS', { col: ZP.lime, icon: 'boot', size: 30 })) go(() => setScene(new WorldMapScene()));
  }
  onKey(k) { if (k === 'Escape') openPause(); else if (k === 'Enter' || k === ' ') go(() => setScene(new WorldMapScene())); }
}

// ================================================================ REWARD: "Street Cred" strip (reads G.run.world.lastCred, written by the logic agent)
function wsCredItems(cred) {
  if (!cred) return [];
  if (typeof cred === 'string') { // "Street Cred: Loop Rats +1 (Friend) · Gloss -½ (Wary) · note · note"
    const parts = cred.replace(/^\s*Street Cred:\s*/i, '').split(/\s+·\s+/).filter(Boolean);
    return parts.map(p => {
      const m = p.match(/^(.+?) ([+-][\d½]*) \(([^)]+)\)$/);
      if (!m) return { text: p };
      const crew = wsCrewIds().find(id => [wsCrew(id).short, wsCrew(id).name, wsName(id)].filter(Boolean).some(s => s.toLowerCase() === m[1].toLowerCase()));
      return { text: `${m[1]}: now ${m[3]}`, crew, delta: m[2] };
    });
  }
  const arr = Array.isArray(cred) ? cred : (cred.lines || cred.items || [cred]);
  return arr.map(x => typeof x === 'string' ? { text: x } : { text: x.text || x.line || x.msg || (x.crew && wsCrew(x.crew) ? wsName(x.crew) + (x.delta > 0 ? ' liked that' : ' hated that') : ''), crew: x.crew, delta: x.delta != null ? x.delta : x.d, npc: x.npc }).filter(x => x.text);
}
function wsDrawCred(c, cred, t) {
  const items = wsCredItems(cred).slice(0, 5); if (!items.length) return;
  const e = ease.back(clamp((t - .3) * 2.5, 0, 1)); if (e <= 0) return;
  const w = 330, x = W - w - 26, y = 150;
  wsFont(c, 16, FB); const rows = items.map(it => wsWrap(c, it.text, w - (it.crew ? 110 : 40), 16).slice(0, 2)), h = 60 + rows.reduce((a, r) => a + r.length * 19 + 10, 0);
  c.save(); c.translate(x + w, y); c.scale(e, e); c.rotate(.025); c.translate(-(x + w), -y);
  scn_sticker(c, x, y, w, h, 18, '#fffdf6', { pad: 6, band: ZP.limeL, bandW: 4, lw: 3 });
  scn_tape(c, x + w / 2, y - 4, 70, 18, -.05, ZP.pinkL);
  scn_bubbleLive(c, 'STREET CRED', x + w / 2, y + 30, 24, ZP.pink);
  let yy = y + 56;
  items.forEach((it, i) => {
    let tx = x + 18;
    if (it.crew && wsCrew(it.crew)) { wsCrest(c, it.crew, x + 30, yy + 10, 12); tx = x + 50; }
    if (it.delta != null && it.delta !== 0 && it.delta !== '+0') { const up = typeof it.delta === 'string' ? it.delta[0] === '+' : it.delta > 0; scn_sticker(c, x + w - 56, yy - 4, 42, 24, 10, up ? ZP.limeL : ZP.pinkL, { pad: 2, lw: 2, shadow: false }); txt(c, typeof it.delta === 'string' ? it.delta : (up ? '+' : '') + it.delta, x + w - 35, yy + 14, { size: 16, font: FD, weight: 800, color: up ? ZP.limeD : ZP.pinkD, align: 'center' }); }
    rows[i].forEach((l, k) => txt(c, l, tx, yy + 15 + k * 19, { size: 16, color: ZK }));
    yy += rows[i].length * 19 + 10;
  });
  c.restore();
}
if (typeof RewardScene === 'function' && !RewardScene.prototype._wsCredWrapped) {
  const _wsRewardDraw = RewardScene.prototype.draw;
  RewardScene.prototype.draw = function (c) {
    _wsRewardDraw.call(this, c);
    const w = G.run && G.run.world; if (!w) return;
    // world.js stores this reward's line on this.cred (RewardScene.enter); older builds only had world.lastCred
    if (this._wsCred === undefined) this._wsCred = this.cred !== undefined ? this.cred : (this.r && this.r.world ? w.lastCred : null) || null;
    if (this._wsCred) wsDrawCred(c, this._wsCred, this.t || 0);
  };
  RewardScene.prototype._wsCredWrapped = true;
}