# Boss Monster — Handover (for the next Claude)

A living handover for the **Boss Monster** game. Read this first, then skim
`boss_monster/index.html`. Keep this file updated as you change things.

---

## 1. What the game is

A single-file HTML/JS **reverse-tower-defense roguelike deckbuilder**. *You are
the final boss.* Heroes raid from the left toward your throne on the right; you
line the corridor with **trap rooms**, **monster rooms** and a **shop**, draft
**room cards** as rewards, and fire **boss abilities** by hand. Fights
auto-resolve. Two modes: **Campaign** (a fixed 50-level siege) and **Endless**.

- **The whole game is `boss_monster/index.html`** — markup + CSS + one big
  `<script>`. There is no framework; it's vanilla canvas + DOM overlays.
- Live URL: **https://games-71g.pages.dev/boss_monster/** (Cloudflare Pages,
  auto-deploys on merge to `main`).
- Repo: `RoxorLoops1337/Games`. Feature branch: **whatever your session
  designates** — it changes per session (e.g. `claude/boss-monster-handover-3ayjow`);
  the workflow is the same regardless.

---

## 2. Workflow (from repo CLAUDE.md — follow exactly)

1. Make changes on your session's designated feature branch.
2. `node build.js` (esbuild; **recursively copies `boss_monster/` → `dist/`**, so
   any asset under it ships). Confirm 0 errors.
3. Commit → push `-u origin <your-branch>`.
4. **Create a DRAFT PR → mark it ready → squash-merge to `main`. Do NOT ask
   "want me to merge?".**
5. **Always paste the live URL at the bottom of every reply** while working on
   this game: `https://games-71g.pages.dev/boss_monster/`.
6. Commit messages / PR bodies end with the session link (the harness adds it).
   Never put the model identifier anywhere in commits/PRs.

### ⚠️ Recurring merge-guard bug
Reconciling with `git fetch origin main && git merge -X ours origin/main` has
repeatedly **silently resurrected deleted code** (notably an `awardTownResources`
call that crashes run-end). **Every push sequence includes a guard:**
```bash
git fetch origin main -q; git merge -X ours origin/main -m "merge main"
if grep -q "awardTownResources" boss_monster/index.html; then
  perl -0pi -e 's/^\s*awardTownResources\([^;]*\);\s*$//mg' boss_monster/index.html
  git add -A && git commit -q -m guard
fi
```
After any `-X ours` merge, **re-grep for the feature you just added** to make sure
it survived, and rebuild.

Also: because we **squash-merge**, binary files added on a branch show up as
**add/add conflicts (`AA`)** on the next merge of main — `-X ours` can't
auto-resolve those. Fix with `git checkout --ours -- <paths>` then commit.

### GitHub specifics
- Use the `mcp__github__*` tools (no `gh` CLI). Scope is `roxorloops1337/games`.
- The token can expire mid-session ("requires re-authorization"). If so, commit +
  push anyway; the draft PR accumulates commits on the branch and you can
  mark-ready/merge once it recovers.
- After each merge you get a `<github-webhook-activity>` "merged → unsubscribed"
  message and Cloudflare deploy-bot comments — **these need no action.**

---

## 3. Testing & balance harnesses (all in `/tmp`, not committed)

**Headless unit tests now live in the repo** — `tests/boss_monster_lib.mjs`
exports `loadGame(exposeStr)` (full stub set: document/canvas/Image/Audio
Proxies, const/let→var rewrite, eval with an `__api` expose) and `harness()`
(tiny pass/fail counter). Write new suites as `tests/boss_monster_<x>.test.mjs`
importing the lib — **don't recreate `/tmp/h*.mjs` throwaways; commit suites so
they survive container recycling.** Run: `npm run test:boss` (all),
`test:relics`, `test:champion`. The canvas ctx stub **must** return
`{addColorStop:noop}` for `createLinearGradient/Radial` and `{width:10}` for
`measureText`, or `draw()` throws (the lib handles this).

Current suites worth keeping green: `h91` rogue-disarm, `h92` campaign, `h93`
merchant, `h95` King, `h96` slot-cap/Barracks/WarCamp, `h98` wave preview==spawn,
`h99` Black Market, `h100` scrap/difficulty, `h101` hero spells, `h103`
slots+fusing. (They live in `/tmp`, so they vanish when the container is
recycled — recreate from the HTML if needed.)

**Balance sims**: `/tmp/ptlib.mjs` exports `loadGame()` (full game eval with a
big exposed API). Built on it:
- `/tmp/firstrun.mjs` — a smart **first run** (5-slot cap, no runes/town, natural
  gold economy, blocker+trap layouts, heavy boss-ability casting). Target: best
  layout wins ~10-20%.
- `/tmp/maxedsim.mjs` — a **fully-meta'd** account (all runes + all town buildings
  + per-level boss empowerment). Should win ~90-100%.
- `/tmp/campsim3.mjs` — a **mid** account (8 rooms, light empowerment, no runes).

> Sims are **pessimistic** (they don't model human skill); the owner outplays
> them, so treat sim win-rates as a floor.

`node -e` one-liners against `ptlib.mjs` are the fastest way to print a constant's
effect (e.g. tier probabilities, monster atk at N kills).

---

## 4. Core architecture (where things live in index.html)

- **`G`** = the active run state object, built by `freshGame(mode)`; assigned via
  `G = freshGame(...)` (callers, not freshGame, set the global). Key fields:
  `mode`, `levelIdx` (0-based), `phase` (`menu|bossSelect|edicts|loadout|build|run|town|reward|mandate|win|lose`),
  `boss`, `heroes`, `queue` (the upcoming wave), `rooms[]`, `cells[]`, `slots`,
  `gold`, `dread`, `hand[]`, `relics[]`, `mandates[]`, `totalSlain`.
- **`RUNES`** (persistent meta: `points`, `ranks{}`, `kills` lifetime, `bossXp`)
  and **`TOWN`** (`res{wood,stone,shards}`, `built{}`) — saved to localStorage.
- **`RB`** = aggregated run bonuses (rune + relic), rebuilt by `recomputeRB()`;
  `blankRB()` is the zeroed template (**keep this function — I once deleted it by
  accident and crashed load**). `applyRunes()` locks rune bonuses at run start.
- **Phases / screens** are rendered into `#overlay` (DOM) and the canvas (`draw()`
  via `requestAnimationFrame(frame)`). `render()` = top bar + relic bar + panel +
  draw. Town/menu/rune/etc. screens set `overlay.innerHTML`.
- **Cells**: `buildCells()` turns `G.rooms` into `G.cells` (geometry + live trap
  list + monster guards). `ROOM_W=200`, `FLOOR=330`, world units `VW≈960,VH≈420`.
- **Combat**: `simStep(h,dt)` per hero; `fightTick` (vs monster), `bossFightTick`
  (vs throne), `trapTick`/`aoeTrapTick` (traps). Heroes walk → fight monsters →
  reach throne. `heroDies` handles loot/dread/combo/rivals.

---

## 5. Major systems & current tuning (all values current as of this handover)

### Campaign (50-level siege) — `CAMP_LEVELS=50`
- `levelComp(L)` defines each wave: champions at every 5th level (1→4 as you
  climb), normal escorts growing `min(5, 1+floor((L-1)/6))`.
- `campPower()` = `ceil(level*0.7)` (hero stat index). 
- **Difficulty**: `difficulty()` campaign branch = `(1+(L-1)*0.02)*(1+(L-1)*0.034)*threat`
  (≈**5.3×** by L50; the inline comment now matches). This is the main "how hard"
  dial — raise the `0.034` term to harden.
- Milestones: odd 5s (5/15/25/35/45) → **relic**; even 5s (10/20/30/40/50) →
  **mandate + Town visit**. `campaignAdvance()` drives it.
- **The King finale** (`campaignVictory → kingApproaches → faceTheKing →` King
  wave): clearing wave 50 shows a FAKE victory, then the King raids. He's a lone
  hero with `king:true`, **HP ×8 / ATK ×1.3**, ignores corruption, and **smashes
  a room he passes with `KING_SMASH=0.10`**. Kill him → `trueVictory()`.

### 🏆 Endless leaderboard (Cloudflare Pages Function + KV)
- Server: `functions/api/board.js` (repo root — Pages auto-deploys it at
  `/api/board`). GET → top 50; POST {name,score} → sanitized name, score
  clamped 1..50000, best-per-name, 30s per-IP throttle. **Requires a KV
  namespace binding named `BOARD`** on the Pages project (dashboard →
  Settings → Bindings); returns 503 until bound and the client fails soft.
- Client: `openLeaderboard()` (Start Game menu + endless end screens),
  `lbFetch/lbSubmit/lbName` (name cached in `bm_lbname`). Submits
  `RUNES.best` explicitly via a button — never auto-posts.
- Tests: `tests/boss_monster_board.test.mjs` (mock KV).
- **☁️ Cloud saves** share the same KV namespace: `functions/api/save.js`
  (`save:<code>` keys, 1-year TTL refreshed on write, 10s/IP throttle,
  20KB cap). Client: `openCloud()` on the title screen — backup uploads the
  ACTIVE slot's RUNES+TOWN under a sync code (`bm_cloud_<slot>`), restore
  pulls a code into the active slot with a tap-twice overwrite confirm.
  Tests: `tests/boss_monster_cloud.test.mjs`. Leaderboard fetches retry
  with backoff (transient failures showed as "offline").
- **Town map backdrop**: `town/map_bg.png` (owner-generated 16:9) replaces the
  procedural terrain when present; building art comes next via the same
  graceful-fallback pattern.

### Battle report, Ascension & juice
- **Battle report** (`battleReportHTML`, shown on win/lose/close screens): per-room
  damage attributed in `dealToHero` via the `_roomDmgCtx` context var (set around
  the trap/guard tick calls — nested reaction chains inherit the room); anything
  context-free lands in `G.stats.abilDmg` ("boss & elements"). Kills were already
  per-room (`room.kills`). Tests: `tests/boss_monster_meta.test.mjs`.
- **👑 Ascension (NG+)**: `RUNES.asc` (persisted per slot) +1 on each
  `trueVictory` (cap 9). `difficulty()` campaign branch ×`(1+asc*0.18)`;
  **endless untouched** (leaderboard fairness). Shown on title cards, home slot
  line, Campaign button.
- **Juice**: wave-end kill cam (`killCamT` slow-mo in `frame()`), arrival
  `banner()` nameplates (champion/King/rival, drawn by `drawBanner` in device
  space), per-room carnage (bones/blood scale with `room.kills` in
  `drawRoomContents`), `RUNES.best` endless record, town-map villagers.

### Wave preview consistency
Campaign rolls each wave **once** into `G.queue` via `prepCampaignWave()`
(keyed by `G.waveLevel`), so the staging-zone preview, town roster, town meddling
and `spawnGroup` all use the *same* specs. Don't reintroduce fresh-rolling in
`spawnGroup` for campaign.

### Rooms, fusing, monsters
- `ROOMS` = traps + monsters + shop + `warcamp` (War Camp blocker, buffs adjacent
  monster rooms +30%) + `minion` (corrupted hero).
- **Fusing is ungated** (no kill requirement) — `canFuse`/`canFuseRooms` only
  check not-full/not-shop/not-duplicate-type. **A room holds up to 3 parts**
  (`type`+`part2`+`part3`): 2nd is free, **3rd costs `FUSE3_GOLD=250`** and a
  3rd *guard* joins at `GUARD3_MUL=0.85`. Guards chain `mon→mon2→mon3` (step-up
  in fightTick). `synergyInfo` picks the **best named pair** among all parts;
  fallback by kinds (any monster+trap = Pinned Down etc.).
- **Two fused monsters are TWO separate guards** (`cell.mon` + `cell.mon2`), each
  with its own HP/atk and the synergy multiplier applied individually; the 2nd
  steps up when the 1st falls. Unnamed monster+monster is "Pack" ×1.0, but
  **named monster pairs have identities** (`SYNERGY_PAIRS` entries with `fx` +
  `desc`, hooks applied in `buildCells`): Grave Horde / Spawning Vats
  (`feedBoth` — both guards feed +3%/kill), Gatehouse (`tauntBoth` — party-wide
  strikes), Sludge Colossus (`splitBoth` — both reform at 60%), Bone Colossus
  (plain ×1.25). Listed in the Codex's "Named Fusions" section (auto-generated
  from `SYNERGY_PAIRS`). Tests: `tests/boss_monster_fusion.test.mjs`.
- **Demolish**: the room inspect bubble offers 🗑 Demolish in build phase
  (`askDeleteRoom` → in-bubble confirm → `doDeleteRoom`; no refund).
- **Inspect bubble**: anchored near the click/hover x (`lastPtrCX`), clamped to
  the stage. A tapped bubble is **pinned** (`inspectPinned`) — hover no longer
  overwrites/hides it; hover-empty hides on a 280ms grace (`hideInspectSoon`)
  so the mouse can reach the bubble's buttons.
- **Veteran ranks** (kills make a room stronger): `VET_KILLS=6`/rank, `VET_MAX=6`,
  `VET_DMG=0.09`/rank, `VET_BITE=0.006` (% hero max-HP/hit — the snowball driver,
  kept low on purpose).
- **Feed** (Goblin Den / Undeath doctrine grow per kill): **+3%/kill** (`*0.03`).
- **Barracks** (in-run, town screen, gold): build `BARRACKS_BUILD=160`, then
  `barracksDrillCost()=240·1.9^lvl` for a global Monster Rank (+16% HP&ATK/rank,
  `BARRACKS_MAX=8`).

### Slots
- `slotCap()` = **5 (campaign)** + rune Excavator (+1) + War Foundry building
  (+1-2) + relics (Deed/Architect's Sigil, +1 each). Endless = 99 (uncapped).
- `slotCost()` = **2nd room cheap (~50g), then `120·2.3^(slots-2)`** (exponential
  past slot 2).

### Heroes
- Classes: warrior/rogue/mage/cleric (`CLASSES`), plus champion mini-bosses
  (`CHAMPIONS`, e.g. paladin/berserker/necromancer/thief).
- **Class spells** (auto-cast on cooldown, `heroSpellTick`): Warrior War Cry
  (+30% atk 4s), Mage Arcane Surge (+60% atk ~2.6s), Rogue Evasion (+25% dodge
  3s), **Cleric Heal & Bless** (heals most-wounded ally 12% + party +20% atk 4s).
  Buffs fold in via `heroAtkMul(h)` and the dodge roll.
- **Rogue trap-disarm**: on entering a trap room, **always** disarms its traps for
  `DISARM_DUR=3`s (one timed window per entry, not re-armed).

### Boss & abilities
- `BOSSES` (dragon/lich/demon/ogre/ent/golem), each with a passive + 2 signature
  abilities + a pool 3rd. Real sprites for dragon/lich/demon; procedural fallback.
- Boss drawn at `BOSS_H=185` (towers over the 150px rooms). Abilities fire a
  **bolt from the throne across the rooms** to the target (`bossBolt` / `bossBolts`
  drawn in `draw()`); AoE abilities (quake/hellfire, tagged `aoe:true`) spray one
  per hero. `Smite` and `Overdrive` (rage meter) are the active player tools.

### Town economy / meta
- In-run **Town screen** (even-5 milestones): the **Traveling Merchant** (buy
  relics with dread, `MERCHANT_PRICE` by tier), the **Barracks**, the **Black
  Market** (adjustable exchange: sell 1 dread→`BM_SELL=100`g, buy 1 dread←`BM_BUY=200`g),
  boss empowerment (needs Sanctum), schemes (Den), sabotage/corrupt (Inn), guild,
  threat dial (Watchtower).
- **Town Builder** (persistent, between runs): spend wood/stone/shards on
  `BUILDINGS` that unlock the in-run town options + passive bonuses. **Rendered
  as a painted village MAP** (`renderTownBuilder` → `drawTownMap` on its own
  canvas): `TOWN_PLOTS` fixes each building's spot, unbuilt = dashed
  foundation, built = a procedural structure that grows with level (max =
  banner), green 🔨 = affordable. Tap → anchored popup (`showTownPop` /
  `townPlotAt`, hit radius 58). **Pannable/zoomable** (1–3×): drag pans,
  pinch/wheel/＋− buttons zoom about the anchor (`townZoom/townCamX/Y`,
  `townClampCam`); the popup tracks the transform; view resets on open.
  Pure UI — `TOWN.built{}` data unchanged.
  Tests: `tests/boss_monster_town.test.mjs`.
- **Rune page**: static-tree skill page; **pannable/zoomable** but the buy popup
  is **anchored next to the tapped node** (lives inside the transformed tree).
  Pointer capture is deferred until a real drag so taps reach nodes (iOS fix).
  The runebook is `position:absolute;inset:0` (iOS flex %-height bug fix).

### Save slots — `SAVE_SLOTS=3` — and the menu hierarchy
- Independent profiles. Keys: `bossmonster_runes_<n>` / `bossmonster_town_<n>`,
  active slot in `bm_slot`. Legacy un-slotted saves migrate into slot 1.
  `switchSlot/resetSlot/slotSummary`.
- **Menu is slot-first with grouped submenus** (owner dislikes link rows —
  buttons only): boot → `openTitle()` (branding + pitch + the three slot cards;
  `pickSlot`) → `gotoMenu()` = the **profile home** with four buttons:
  `openPlay()` (Campaign/Endless/Tutorial), `openStronghold()` (Rune Page /
  Town Builder / Unlocks), `openLibrary()` (Codex / How to play), and Save
  Slots (`openTitle`). Each leaf screen's Back returns to its parent submenu
  (runebook & town builder & unlocks → Stronghold; codex & help → Library);
  `openSlots()` is an alias for `openTitle()`.

### Meta-reward economy (recently cut hard — owner found it too fast)
- Rune points & shards both scaled `slain/4+level`; **both ÷10** now
  (`awardRunes` `/10`; `pendingResources` shards `*m/10`).
- Wood/stone ~÷3 (`slain*0.04` / `slain*0.02`); win gold→resource conversion
  `g/90` & `g/180`.
- **Card scrap**: a hand card's ✕ scraps it for gold (`SCRAP_GOLD` common 10 →
  epic 40) — the sink for extra cards once 5 rooms are built.

### Rarity curves (recently made rarer early)
- **Cards** `cardWeight(t,L)`: epic `max(0.08, L*0.16-0.25)` (≈0 in opening
  rounds → ramps), rare slightly scarcer early. `L=runDepth()=levelIdx*1.3`.
- **Relics** `tierWeights(L)`: epic ramps after L>4, legendary after L>10, mythic
  after L>18. First relic (~L6) ≈ 4.5% epic / 0% legendary+mythic.

---

## 6. Sprites
`boss_monster/sprites/<actor>/` (knight, wizard, cleric, goblin, demon, champion).Champion = the **Super Knight** mini-boss: walk frames `champion_0..11.png`;
attack frames `attack/champion_attack_0..13.png` — **wired into `drawChampion`**:
while `state` is `fighting`/`boss` the swing is synced to `h.atkT` (one full
14-frame cycle per attack interval, blade lands as the damage does), drawn at
`CHAMP_ATK_DH=99` vs walk's `CHAMP_DH=88` (attack art has less padding; content
heights matched, same foot baseline). Boss art in `boss_monster/bosses/`.
Card icons in `boss_monster/icons/`. Upload via GitHub (preserves transparency),
no baked shadow, right-facing.

**Mob sandbox**: `boss_monster/sandbox.html` — a standalone toy (one room, a
Super Knight, +N goblin buttons, FPS counter) the owner uses to eyeball how a
goblin horde reads visually before deciding on monster stacking. A dropdown
picks the mob behaviour (`MODES`): **V1** ranks-and-cleave, **V2** pile-on
frenzy (tighter packing, up to 10 concurrent attackers, blood spray + floor
stains, overflow goblins climb onto the pile), **V3** chaotic frenzy (V2 +
per-goblin cadence/speed, staggered swing admission, slot fidgeting and
random hops — kills the synchronized-lunge look). It borrows the game's
sprites/scales but shares no code with `index.html`.

---

## 7. The owner's balance philosophy (important context)
- **First runs should be brutal (~20% win with *very* smart play, lower now);
  meta-progression — runes + town + more slots — is the path to reliable wins.**
- The owner iterates fast on feel: they'll say "too easy / too strong / too much"
  and want a specific dial moved. Make the change, sim both ends (first-run +
  maxed), keep the spread (hard floor, reliable ceiling), and ship.
- Recurring asks have been **nerfs** (relics, decrees, veteran snowball, feed,
  meta rewards, early epics) and **depth** (hero spells, two-guard fusion, the
  King, merchant, Black Market, Barracks).
- Plays on **iPad Safari** — watch for touch/pointer and flexbox-%-height issues.

---

## 8. Quick start for your first task
```bash
cd /home/user/Games
node build.js                      # sanity: 0 errors
# make change in boss_monster/index.html
node build.js
# (recreate a /tmp/h*.mjs harness if you need a unit test)
git add -A && git commit -m "..."
git fetch origin main -q; git merge -X ours origin/main -m "merge main"
grep -q awardTownResources boss_monster/index.html && echo "RUN THE GUARD"
node build.js
git push -u origin <your-session-branch>
# create DRAFT PR → mark ready → squash-merge (mcp__github__*)
```
Then paste `https://games-71g.pages.dev/boss_monster/` at the end of your reply.
