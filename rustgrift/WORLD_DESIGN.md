# RUSTGRIFT: Crews & Turf — design contract (read fully before coding)

Goal: give Rustgrift what made Griftlands great — a living map, factions, friends and enemies, requests — in a new, music-flavoured way,
and raise the character art to the level of the **Hocus Vocus** chibi cast (the owners' own game, see `js/hv/`).

## 1. The pitch
The Rust Quarter is carved up by five **crews**, each a different *sound*. Every day you wander the quarter, meet named people, do favours,
fight or talk your way past rivals, and slowly paint the map in your colours. On the last night every crew crashes **The Stage** for the
Headliner finale — and who shows up to help you (or heckle you) depends on who you made friends and enemies of.

The three "new cool" twists (vs Griftlands):
1. **Turf painting**: the map is coloured by who owns each venue. Beat a lair's Enforcer and the venue flips crew. Your Buzz = how much of the city is yours.
2. **Favour cards**: befriend a named person and they become a **Favour card** in your decks (a battle card AND a talk card): a friend who jumps in for you.
3. **Street Buzz**: a rumour ticker tells you what the crews did overnight (turf wars, scandals, bargains), so the map changes under you.

## 2. The five crews (ids are fixed)
| id | name | sound / vibe | colour | rivals | friends |
|---|---|---|---|---|---|
| `loop_rats` | The Loop Rats | street beatbox & looper buskers: chaotic, loud, loyal; fight with repeats and pets | lime `#6cc22e` | `gloss` | `scrap_kings` |
| `gloss` | The Gloss Suits | smooth label execs: pearl pink/lilac, chrome smiles, contracts; negotiators (high Resolve, bribes, excuses) | pearl pink `#f4b6e0` | `loop_rats` | `bass_cartel` |
| `bass_cartel` | The Bass Cartel | subwoofer gangsters: purple hoodies, speaker chains; big hits, Strength, Block | purple `#7a45b0` | `static_choir` | `gloss` |
| `static_choir` | The Static Choir | grey-cyan robed hush-cult that mutes people; Weak/Vulnerable/Doubt debuffs, whispering arguments | cyan `#3fd8e8` | `bass_cartel` | none |
| `scrap_kings` | The Scrap Kings | junkyard rig-builders: orange overalls, welding goggles, machines & drones; Block/heal/summon machines | orange `#ff8a2a` | none | `loop_rats` |
Rival/friend are *social* links: helping a crew nudges its rival's standing down and its friend's up by half a step (see 5).

## 3. The cast (25 named people + the heroes). Ids are `npc_<id>` for the figure and `<id>` for data. Each crew has 5:
Roles: `boss` (crew leader, finale-class), `enforcer` (elite guarding the lair; beating them flips turf), `grunt` (normal fight/talk), `merchant` (shop + friend recruit), `fixer` (gives Requests).
| crew | boss | enforcer | grunt A | grunt B | merchant/fixer |
|---|---|---|---|---|---|
| loop_rats | `loop_mama` **Mama Loop** — elder busker queen, huge curly grey-green hair, loop-pedal backpack, lime shawl | `loop_stomp` **Stomp** — tap-dancing bruiser, spring-heeled boots | `loop_echo` **Echo** — kid with oversized headphones & megaphone | `loop_tape` **Tape Worm** — cassette-hoarder wrapped in a scarf of tape | `loop_dotty` **Dotty Dub** — pedal merchant, goggles, tool belt |
| gloss | `gloss_sheen` **Madame Sheen** — pearl bob, chrome sunglasses, long pink coat | `gloss_mute` **Mr. Mute** — tall suit, mouth sealed by a chrome smile | `gloss_tune` **Agent Autotune** — slick quiff, earpiece, pitch-perfect smirk | `gloss_ivy` **Intern Ivy** — nervous, huge clipboard, too many lanyards | `gloss_sol` **Sleek Sol** — contract salesman, pearl cufflinks |
| bass_cartel | `cartel_sub` **Big Sub** — enormous, speaker-chain necklace, purple fur-free hoodie | `cartel_drop` **Drop** — hooded, always about to "drop" | `cartel_kick` **Kick** — twin, kick-drum belt buckle | `cartel_snare` **Snare** — twin, snare-drum hat | `cartel_wanda` **Woofer Wanda** — stall owner with cone-speaker earrings |
| static_choir | `choir_hush` **The Hush** — tall hooded figure, face in grey static | `choir_crackle` **Cantor Crackle** — robe sparking with static | `choir_fuzz` **Choirboy Fuzz** — fuzzy-haired kid in a too-big robe | `choir_whisper` **Sister Whisper** — veil, finger to lips | `choir_reverb` **Brother Reverb** — round, kind, echoing laugh |
| scrap_kings | `scrap_cassette` **King Cassette** — crown made of tape reels, patched royal overalls | `scrap_hammer` **Jack Hammer** — broad welder, sledge, goggles up | `scrap_weld` **Weld** — mask-down welder | `scrap_sparks` **Sparks** — wiry mechanic, wires in hair | `scrap_carla` **Cog Carla** — parts dealer, mechanical arm |
Neutral: `jordan` (the merch designer from Hocus Vocus, already registered as `jordan`; lives at Home Studio, sells cosmetic-free "tote" favours).
Heroes (4, all from the Hocus Vocus kit, ids already registered in `js/hv/art_cast.js`): `roxor` (Roxor, beatbox brawler, rg id `rook`), `jasmin` (Jasmin, vocal hustler, rg id `pia`), `andy` (Andy, the Thunder Bass, rg id `mourn`), `rawclaw` (RawClaw, sound alchemist, NEW 4th hero, rg id `claw`).

## 4. The map: 17 venues, 5 districts, free travel, 6 days
Each **day** has 3 **slots**: `Day`, `Dusk`, `Night`. Traveling along one map edge costs 1 slot. Fighting/negotiating costs 1 slot. Shopping, chatting,
asking for Requests, recruiting cost 0. Resting at a camp costs 1 slot and heals 35%. After the `Night` slot the day ends: dawn brings Street Buzz,
turf-war events and an heal of 0. **The finale is on Day 6, Night** at `the_stage` (anyone can also walk to the stage early once Buzz >= 8 and fight the finale then, ending the act early with bonus).
Time ends act 1 -> act 2 (same graph, crews escalate: +40% HP/damage, new Street Buzz lines, `act` field changes names via `World.name(id)` only for flavour).

Venues (id: name, district crew, type, map position in a 1280x560 pane below the HUD, backdrop kind):
- `home_studio`: Home Studio (neutral hub), `rest`+`studio` (upgrade a card, remove a card, Jordan's totes), (640,300), `camp`
- `busker_alley` lair of loop_rats (150,300) `alley`; `tape_market` market (250,140) `market`; `crosswalk` street (270,470) `alley`
- `label_tower` lair of gloss (640,70) `market`; `velvet_lounge` street (470,170) `night`; `contract_kiosk` market (830,150) `market`
- `sub_basement` lair of bass_cartel (1130,300) `foundry`; `club_woofer` street (1000,160) `night`; `speaker_depot` market (1010,460) `foundry`
- `hush_chapel` lair of static_choir (640,510) `night`; `echo_cellar` event/den (470,460) `night`; `choir_steps` street (800,470) `night`
- `scrapyard` lair of scrap_kings (440,310) `foundry`; `rust_bridge` street (850,300) `alley`; `junk_cafe` rest (640,420) `camp`
- `the_stage`: The Stage (finale, locked until Day 6 Night or Buzz>=8) (640,190) `night`
Types: `lair` (the Enforcer guards it; the Boss appears only if you are Bonded (+3) or Hostile (-3) with that crew, or at the finale), `street` (2 grunts of the owning crew roam; random Street events),
`market` (merchant NPC: shop + recruit), `den` (events), `rest` (camp), `studio`.
Edges (undirected, each costs 1 slot): home_studio–scrapyard, home_studio–rust_bridge, home_studio–junk_cafe, home_studio–the_stage; busker_alley–tape_market, busker_alley–crosswalk, busker_alley–scrapyard;
tape_market–velvet_lounge; crosswalk–echo_cellar; label_tower–velvet_lounge, label_tower–contract_kiosk, label_tower–the_stage; velvet_lounge–junk_cafe; contract_kiosk–club_woofer; club_woofer–sub_basement, club_woofer–rust_bridge;
sub_basement–speaker_depot; speaker_depot–choir_steps; choir_steps–hush_chapel, choir_steps–rust_bridge; hush_chapel–echo_cellar; echo_cellar–junk_cafe; scrapyard–junk_cafe.
(Positions are a layout guide; the map artist may nudge them as long as ids and edges are kept.)

## 5. Standing, rapport, requests, favours, turf, buzz
- **Standing** with each crew: integer -3..+3 (`Hostile -3`, `Enemy -2`, `Wary -1`, `Neutral 0`, `Friendly +1`, `Friend +2`, `Bonded +3`). Start 0, with the hero's start tweak (Roxor loop_rats +1, gloss -1; Jasmin gloss +1, scrap_kings -1; Andy bass_cartel +1, static_choir -1; RawClaw scrap_kings +1, loop_rats 0).
  Events: beat a crew member in a battle: that crew -1 (their friend crew 0, their rival crew +0.5 round-down rule: keep fractional `half` counter, +1 on every second); persuade a member in a negotiation: that crew +1; fail a negotiation: -0.5 (counter); complete a Request for crew X: X +1 (rival -0.5); fail/expire a Request: giver crew -1; recruit a friend: that crew +1; flip a venue to a crew: that crew +1, previous owner -1.
  Effects: >=+2 Friend: that crew's venues sell at -25%, their street grunts offer to *pass* (you may skip an encounter at 0 cost), their NPCs offer better Requests. >=+3 Bonded: the Boss becomes recruitable as a Favour and gives a unique Graft once. <=-2 Enemy: their street encounters are ambushes (you cannot choose Talk; +1 enemy), shops +30%, venues of that crew are Hostile territory. <=-3 Hostile: each dawn their Enforcer hunts you: a forced elite fight at your location (reward x1.5, standing -0 for winning).
- **NPC rapport** (per NPC, -2..+2): +1 for each Chat (once per day), +1 for a gift (pay 10-30 shil) , -1 if you beat them. At rapport >=2 a merchant/fixer can be **recruited** as a **Favour**: pay a price (or complete their Request) and they join your *Favour list* (max 3 at a time, replace any time at the Studio).
- **Requests** (given by `fixer`/`merchant`/`boss` when rapport>=0 and standing>=-1). Each has `deadlineDay`. Types: `silence` (win a fight OR talk vs target NPC at a venue), `deliver` (carry a parcel from giver to another NPC/venue before the deadline), `favour` (pay shil), `turf` (defeat the Enforcer of venue X to flip it to the giver's crew), `scout` (visit 2 venues). Rewards: shil, a card choice, a graft, standing, rapport, sometimes a new Favour. Max 3 active. Log in the Requests modal.
- **Favour card** (one per friend, defined in `world_data.js` and registered into `BC` and `NC`): a Battle card (cost 2, Exhaust-per-battle, effect `special:'ally'`: the friend appears behind you for 3 turns and acts at the end of each of your turns: attack/block/heal/debuff by their crew style) and a Talk card (cost 1, adds a player Argument for 3 turns with their crew style). They are *added to the active decks only while on your Favour list* and removed when dismissed. Ally rendering in battle: the friend's figure stands behind the player and plays its pose when acting.
- **Turf**: `turf[venueId]` = crew id. Flipping a lair needs: Enforcer defeated (fight) OR persuaded (talk) -> the lair becomes `contested` for a day, then belongs to the crew with the highest standing among the *hero's friends* (default: the crew that sent the Request, else neutral `none`). Owned venues set which crew's NPCs appear there. Each dawn there is a 35% chance an AI crew takes a neighbouring neutral/weak venue (Street Buzz tells you).
- **Buzz** = 1 per turf venue held by a crew you are Friend+ with, +1 per completed Request, +2 per Bonded crew, -1 per Hostile crew. Buzz is shown on the HUD. Finale reward and the Headliner's difficulty scale with it (see 6).

## 6. Finale: Headliner Night (act boss)
At `the_stage`: the boss is the leader of the crew you stand *lowest* with (ties: random), joined by the Enforcer of the second-lowest. Bonded crews' Bosses (and your Favours) turn up as free Favour plays (their cards are pre-added to your hand on turn 1). Higher Buzz => boss -10% HP per 2 Buzz (min 60%). Offer the choice Fight or Talk like every encounter. Win => act clear (act 1 -> act 2; act 2 -> victory).

## 7. Architecture and file ownership (strict; each agent edits only its own files)
Existing: `js/core.js`, `js/data.js` (BC/NC cards, ENEMIES, ENC, CHARS, GRAFTS), `js/battle.js` (BattleScene), `js/negotiation.js`, `js/scenes.js` (+ `art_*.js` overriding draw methods), `js/hv/*` (Hocus Vocus art stack: `ART.rj`).
`makeMapScene(o)` (scenes.js) returns `new WorldMapScene(o)` when `G.run.world` exists, else the old node map. Every "leave shop / camp / event / reward" button already calls it.
New files (in index.html load order after `art_scenes.js`, before `main.js`): `cast_loop.js`, `cast_gloss.js`, `cast_cartel.js`, `cast_choir.js`, `cast_scrap.js`, `world_data.js`, `world.js`, `world_scenes.js`, `hero_cast.js`.
- **cast_<crew>.js** (one agent per crew): defines the five NPC figures of that crew as `ART.rj.register('npc_<id>', ART.rj.rig({...}))` using `js/hv/art_cast_kit.js` (read its header: it is the manual; read the Roxor and Jasmin blocks in `js/hv/art_cast.js` as worked examples). Hocus Vocus chibi-candy style: warm brown outline, one cel shadow, huge glossy flat eyes, stubby limbs, silhouette-first design, crew colour motif on every member (+ unique prop), idle life, all poses the kit lists (`idle sing attack hurt cheer windup strike block down walk`) with sensible tables, a `bust` crop. Bosses are bigger (`spec.base`/scale) and richer than grunts. Also export `window.RGCAST['<crew>'] = {ids:[...], note:'...'}`.
- **world_data.js** (data agent): global constants `CREWS`, `NPCS`, `VENUES`, `EDGES`, `REQUEST_TYPES`, `RUMORS`, `STANDING_NAMES` exactly with the ids above; `ENEMIES` entries for every NPC (id = npc id; `spec: {kind:'rj', rj:'npc_<id>', scale:..}`; crew-flavoured move sets and `talk` profiles with barks and crew-flavoured arguments added to `ARGS`; hp bands per role and act; gold); `ENC`-style helper `World.encounter(npcId, venue)`; Favour cards in `BC`/`NC` (`favour_<npcId>`).
- **world.js** (logic agent, same agent as world_data): global `World` API (section 8), `run.world` state, `newRun` override (wrap the original `newRun`: after building, set `run.world = World.init(run, 1)` and delete node-map usage), save/load compat (`saveRun` is already generic JSON), `RewardScene.prototype.next` and `BattleScene`/`NegotiationScene` result hooks (fight/talk outcomes -> standing/rapport/requests/turf, return to the venue), Favour ally support in battle (`BattleScene.prototype.applyCard` hook for `special:'ally'` + a small ally unit), act transition (`World.init(run, 2)`), victory/defeat.
- **world_scenes.js** (scene agent): `WorldMapScene`, `VenueScene`, `RequestsModal`, `CrewsModal` (standing overview with the five crew colours, rival/friend lines, effects), `FavoursModal`, the finale intro, plus all art for them: a gorgeous illustrated city map (cream zine paper style of the existing art_scenes map: pastel spray splats, marker doodles) with district colour washes that change with turf, venue badges, crew flags, the day/slot clock, Buzz meter, Street Buzz ticker, active-request pins, hero token walking along edges, NPC busts using `ART.rj.bust(ctx, 'npc_<id>', w, h, {expr})`. VenueScene = the venue backdrop (`drawBackdrop(kind)`), the residents standing in a line drawn with `ART.rj.draw`, tap an NPC to open an action menu (Chat, Request, Trade, Recruit, Gift, Challenge: Fight / Talk). Touch friendly (big buttons, no hover-only information).
- **hero_cast.js** (hero agent): override `drawHuman`/`drawFigureProc` for specs with `kind:'rj'` (draws `ART.rj.draw(c, spec.rj, {x:0,y:0,s:spec.s||1, pose, t:p.t, expr, noShadow:p.noShadow})`; pose mapping: idle->idle, atk<.35->windup, atk>=.35->strike, hurt->hurt, talk->sing, sit/mug->idle with `cheer` for campfire), flip handling, ally poses; update `CHARS` in `data.js`? NO: the lead edits data.js heroes. The hero agent also provides `RGBust(c, rjId, x, y, w, h, expr)` helper and restyles the char-select portraits/HUD portrait to use busts; sprite sheet export (`SPR.renderSheet`) must keep working for `kind:'rj'` specs (cell 512, scale 1.5, noShadow).

## 8. The `World` API (data/logic agent implements, scene agent calls)
```
World.init(run, act) -> world            // builds state; also run.map = null
World.reset(run, act)                     // next act
World.crews / World.venues / World.npcsAt(venueId) -> [npcId]   // residents present now (depends on slot: some only at Night; defeated NPCs leave for a day)
World.neighbors(venueId) -> [{id, cost:1, locked:false, why}]
World.travel(toVenueId) -> {ok, arrivedAt, events:[{type:'ambush'|'text'|'bounty',...}]}   // spends a slot, may trigger an ambush encounter (returns encounter spec the scene starts)
World.slotName() / World.dayLabel() / World.timeLeft() / World.advance(n)   // 'Day','Dusk','Night'; endDay() runs dawn logic and returns the Street Buzz lines
World.standing(crewId) / World.standingName(n) / World.adjust(crewId, delta, why)
World.rapport(npcId) / World.adjustRapport(npcId, d)
World.actions(npcId) -> [{id:'chat'|'request'|'trade'|'recruit'|'gift'|'fight'|'talk'|'pass', label, cost:{slots,shil}, enabled, why}]
World.do(npcId, actionId) -> {kind:'text', lines:[...]} | {kind:'shop'} | {kind:'encounter', mode:'fight'|'talk', enemies:[ids], npc:npcId, venue:venueId, flags} | {kind:'request', request} | {kind:'recruit'|'gift', ...}
World.beginEncounter(res)                  // sets run.world.pending={...} and starts Encounter (fight/talk choice scene reuses EncounterScene) 
World.requests() / World.acceptRequest(r) / World.favours() / World.setFavours([...])
World.turf(venueId) -> crewId|'none'|'contested' ; World.buzz() ; World.finale() -> encounter spec ; World.stageUnlocked()
World.name(id) ; World.crewColor(id) ; World.rumors() -> latest Street Buzz lines
```
Outcome hooks (logic agent wires them so scenes never call them): after every Battle/Negotiation result tied to `run.world.pending`, standing/rapport/requests/turf update, the RewardScene shows a **"Street Cred" summary line** (who liked/hated it), and Continue returns to `VenueScene` at the same venue (or the world map after a finale / act clear).

## 9. Acceptance
- A full headless bot run over the world (travel, chat, requests, fights, talks, favours, finale, act 2, victory) throws no errors and ends in Victory or GameOver.
- Reload mid-day restores the world exactly (saveRun/localStorage `rg_run`).
- All 29 figures render in lab pages and in-game at 60fps, flipped (enemies face left) and unflipped.
- Standing and turf visibly change on the map after actions; Street Buzz reports them next morning.
- Plays on a phone (1280x720 canvas, touch only).

## 10. Data shapes (world_data.js defines these globals; world_scenes.js reads them — keep field names exactly)
```
CREWS[id]   = { id, name, color, colorDark, colorLight, rivals:[id], friends:[id], sound:'street beatbox & loopers', motto:'…', blurb:'…', icon:<IC name> }
NPCS[id]    = { id, name, crew, role:'boss'|'enforcer'|'grunt'|'merchant'|'fixer', title:'Elder Busker Queen', venue:<home venue id>, rj:'npc_<id>', enemy:<ENEMIES id>, shop:bool, nightOnly:bool, blurb:'…', barks:['…'], greet:['…'] }
VENUES[id]  = { id, name, district:<crew id|'neutral'>, type:'lair'|'street'|'market'|'den'|'rest'|'studio'|'stage', x, y, bg:'alley'|'market'|'night'|'foundry'|'camp'|'desert', blurb:'…' }
EDGES       = [[venueA, venueB], …]
STANDING_NAMES = { '-3':'Hostile','-2':'Enemy','-1':'Wary','0':'Neutral','1':'Friendly','2':'Friend','3':'Bonded' }
REQUEST_TYPES[id] = { id, label, icon, describe(req)->string }
RUMORS = { turfFlip:[…], standingUp:[…], standingDown:[…], idle:[…] }  // template strings with {crew} {venue} {npc}
run.world = { act, day, slot, at, standing:{crew:n}, half:{crew:n}, turf:{venue:crew|'none'|'contested'}, npc:{id:{rapport,defeated,recruited,metToday,giftedToday,hiddenUntil}}, requests:[{id,type,giver,crew,target,venue,reward,deadline,state,desc}], favours:[npcId], buzz, rumors:[strings], pending:null|{npc,mode,venue,enemies,flags}, flags:{}, log:[…] }
```
`ART.rj` ids for NPCs are `npc_<npc id>` and are registered by the cast agents; until they exist `ART.rj.draw` draws a placeholder, so world scenes must not crash on missing figures.
