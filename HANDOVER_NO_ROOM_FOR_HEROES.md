# No Room For Heroes — Handover (for the next Claude)

A living handover for the **No Room For Heroes** game (folder/URL `no_room_for_heroes`;
it was called *Boss Monster* before the rename — you'll still see `bm_*` /
`bossmonster_*` storage keys and the `/boss_monster/*` redirect). Read this, then
skim `no_room_for_heroes/index.html`. **Keep this file updated as you change things.**

---

## 1. What the game is

A single-file HTML/JS **reverse-tower-defense roguelike deckbuilder**. *You are the
final boss.* Heroes raid from the left toward your throne on the right; you line the
corridor with **trap rooms**, **monster rooms** and a **shop**, draft **room cards**
as rewards, and fire **boss abilities** by hand. Fights auto-resolve. Two modes:
**Campaign** (a fixed 50-level siege) and **Endless**.

- Live: **https://games-71g.pages.dev/no_room_for_heroes/** (Cloudflare Pages,
  auto-deploys ~1 min after merge to `main`).
- Repo: `RoxorLoops1337/Games`. Your feature branch is named per-session.
- Plays mostly on **iPad Safari** — watch for touch/pointer + flexbox-%-height bugs.

---

## 2. Repo map (read before touching anything)

- **`no_room_for_heroes/index.html`** — THE game. Markup + CSS + one ~6k-line
  `<script>`. No framework, vanilla canvas + DOM overlays.
- `no_room_for_heroes/align.html` — standalone **art-alignment tool**. Positions /
  sizes / layers / lights of every trap + the test-traffic heroes/monsters; exports
  `rooms/layout.json`. **This is where trap/light positions are tuned — never
  hand-tune draw positions in code.**
- `no_room_for_heroes/music.html` — standalone chiptune player (deterministic composer).
- `no_room_for_heroes/sandbox.html` — goblin-horde visual sandbox (shares sprites,
  not code).
- `functions/api/board.js` + `functions/api/save.js` — Cloudflare Pages Functions
  (leaderboard + cloud saves, KV binding `BOARD`).
- `build.js` — copies `STATIC_PATHS` folders into `dist/` (Pages deploys `dist/`).
  `no_room_for_heroes` and `tools` are already in the list; new TOP-LEVEL folders
  must be added.
- `tests/no_room_for_heroes_*.test.mjs` — 10 headless suites; `tests/no_room_for_heroes_lib.mjs`
  exports `loadGame(exposeStr)` (evals the inline script with a stubbed DOM — including a
  full no-op canvas context, so the `juice` suite drives `draw()`/`update()` through a real
  wave to catch render-time errors the logic suites can't see). **Write new tests with the
  lib; never make throwaway harnesses outside `tests/`.**
- `tools/comfyui/` — local pixel-art sprite generator (see §6).

---

## 3. Workflow — verify with ONE command, then ship

```
npm run check        # = node build.js && all 10 test suites — must be GREEN before every push
```

1. Work on your session's feature branch.
2. `npm run check` green. If you can't make it green, STOP and report — never push red.
3. Commit → `git push -u origin <branch>`.
4. **Create a DRAFT PR → mark it ready → squash-merge to `main`. Don't ask "want me
   to merge?".** (`mcp__github__*` tools only; scope `roxorloops1337/games`. No `gh` CLI.)
5. End every reply (while on this game) with the four links:
   ```
   Play: https://games-71g.pages.dev/no_room_for_heroes/
   Align tool: https://games-71g.pages.dev/no_room_for_heroes/align.html
   Music player: https://games-71g.pages.dev/no_room_for_heroes/music.html
   Goblin sandbox: https://games-71g.pages.dev/no_room_for_heroes/sandbox.html
   ```
6. Commit/PR end with the session link the harness provides. **Never put a model
   identifier in commits/PRs/code.**

### Merge conflicts are NORMAL (we squash-merge)
After each PR squash-merges, the next PR conflicts with `origin/main`. Resolve by
**keeping HEAD (your branch)**: `git fetch origin main && git merge origin/main`,
fix conflicts keeping your side, then **re-run `npm run check`** and **re-grep the
feature you just added** (squash-merges can resurrect old code). Binary add/add
conflicts: `git checkout --ours -- <path>`. Known zombie to keep at 0 hits:
`awardTownResources`.

### Webhooks need no action
After a merge you get "merged → unsubscribed" + a Cloudflare deploy-bot comment —
both routine. The PR-activity subscription is for CI/review events; on this repo
there are no GitHub Actions, and the "unstable" mergeable state is just the
non-required Cloudflare preview check (merge on the green local `npm run check`).

---

## 4. Core architecture (where things live in index.html)

- **`G`** = active run state (`freshGame(mode)`; the global is set by callers).
  Key fields: `mode`, `levelIdx`, `phase`
  (`menu|bossSelect|edicts|loadout|build|run|town|reward|mandate|win|lose`), `boss`,
  `heroes`, `queue`, `rooms[]`, `cells[]`, `slots`, `gold`, `dread`, `hand[]`,
  `relics[]`, `mandates[]`, `minions[]` (marching den goblins), `totalSlain`.
- **`RUNES`** (persistent meta: `points`, `ranks{}`, lifetime `kills`, `bossXp`,
  `asc`) and **`TOWN`** (`res{wood,stone,shards}`, `built{}`) — localStorage, per
  save slot (`SAVE_SLOTS=3`, keys `bossmonster_runes_<n>` / `bossmonster_town_<n>`,
  active slot in `bm_slot`). **Never rename these keys.**
- **`RB`** = aggregated run bonuses; `recomputeRB()`, `blankRB()` (keep it),
  `applyRunes()` at run start.
- **Geometry**: `ROOM_W=200`, `FLOOR=330` (the floor line), `LIFT=14` (heroes &
  monsters draw this many px above the floor — see §5). `buildCells()` turns
  `G.rooms` → `G.cells` (geometry + live traps + monster guards).
- **Combat**: `simStep(h,dt)` per hero → `fightTick` (vs monster), `bossFightTick`
  (vs throne), `trapTick`/`aoeTrapTick`. `heroDies` handles loot/dread/combo/rivals.
  Den goblins: `goblinStep`/`goblinTick` (see §5 "Den goblins").
- **Render**: `requestAnimationFrame(frame)` → `draw()` (canvas) + DOM overlays
  (`#overlay`, `#panel`, `#inspect` bubble). `drawDungeon(tx,scale,isBuild)` draws
  the corridor: room backgrounds → per-cell contents (`drawRoomContents`) → the
  party → deferred front-of-hero trap layers.

---

## 5. The art system (most recent work lives here)

All art is **graceful-fallback**: missing art must never break the game (procedural
shapes draw until a PNG loads). Positions/sizes/layers/lights come from
`rooms/layout.json` (made in `align.html`) — **fix the layout/align tool, not draw
positions in code.**

### Heroes
- `SPRITES` (keyed by sprite id) + `CLASS_SPRITE` (class→sprite): warrior→knight,
  mage→wizard, cleric, rogue. LPC sheets, right-facing (`row:3`); per-clip `ax`/`ay`
  anchors keep body size consistent across 64px/192px frames. `drawSprite`/`spriteClip`
  pick idle/walk/attack by hero state. Champion mini-boss art in `sprites/champion/`
  (`drawChampion`, swing synced to `h.atkT`).

### Monsters
- `MON_SPRITES` (goblin, skeleton, warden, ogre, **slime**) + `drawMonsterSprite`
  (`dirRow:1` = left-facing toward incoming heroes; single-row sheets use `dirRow:0`).
  `MON_IMG` loader, `monSpriteReady`. Monster room draw is generalized: any
  `MON_SPRITES[mp]` entry uses sprites, else procedural `drawMonster`.
- **Slime** was assembled from loose `gel_idle/walk/attack` frames into 1-row sheets
  (`sprites/slime/slime_*.png`); walk frames were scaled up ~1.4× so the cube stays
  the same size across clips. Monsters still WITHOUT sprites (procedural): `totem`,
  `warcamp`, `minion` — they'd need directional LPC sheets.

### The LIFT (heroes + monsters share one walking line)
- `const LIFT=14`. Heroes get `h.yOff=-LIFT` (flat — no per-hero spread; they walk
  on one line). Every monster draw is raised by `LIFT` (`drawMonster` uses
  `FLOOR-LIFT`; `drawMonsterSprite` is called with `FLOOR-LIFT`; den-goblin sprite
  raised inline). The align tool's "mob lift" slider defaults to 14 and lifts both
  heroes AND monsters so its preview matches the game.

### Traps
- Art in `rooms/traps/<id>*.png`. Naming accepts `<id>_0.png` / `<id>_01.png` /
  static `<id>.png`. Animated art exists for: **spike, flame, venom (poison1/2),
  maul, arrow, frost, gallows, hexward, tesla, oil, corrode, magebane**. Still
  procedural (no art yet): **bombard, hexbrand, runestone**.
- `LAYOUT` (defaults in code) is overridden by `rooms/layout.json`. Each trap PART
  carries `fx, fy, h, layer` (+ `n`/`gap` for the flame's 4 columns, `flip`, `mode`).
- **Per-trap timing** `TRAP_TIMING{rise,fall}` (ms): traps move differently (maul
  slams down fast/grinds up slow; arrow `{rise:420,fwd:true}` = forward-only volley,
  slower). **`TRAP_ANIM`** = `{venom:'loop', oil:'loop'}` (continuous flow instead of
  a strike). **`TRAP_PHASE`** staggers the build-phase idle preview so a multi-trap
  room doesn't pulse in unison. `strikeIdx(N,firedAt,type)` reads the profile;
  `fwd:true` snaps back to rest instead of reverse-playing.
- **Hero z-layer**: `HERO_LAYER` (from `LAYOUT.heroLayer`) — trap parts with `layer
  > HERO_LAYER` render IN FRONT of the party (deferred draw flushed after heroes).
  The **flame** is `p.alpha 0.5` (50% see-through) so heroes read as walking through it.
- **Lights** (`LIGHT_COL` + `trapAccentGlow`, additive radial glows): candle / flame
  heat / venom vapor, plus per-trap accents **frost (blue), tesla (yellow flicker),
  hexward + magebane (purple pulse), corrode (acid-green simmer)**. Positions fall
  back to the trap centre until aligned in `align.html`.

### Shop & boss room
- **Shop interior** (`drawShopArt` + `SHOP_LAYOUT`, fractions of room width so it
  scales with zoom): `sprites/shop/shop_{shelf,keeper,table}.png` drawn back→front,
  with the live stock plaque (`drawShopStock`) overlaid. Falls back to the
  procedural counter until art loads.
- **Throne rooms** (boss cell): `rooms/throne_{green,purple,red}.png`, mapped per
  boss by hue via `BOSS_THRONE` (red: dragon/ogre · purple: demon/golem · green:
  ent/lich). `drawRoomBg` paints it behind the boss; `drawBoss` skips its procedural
  throne when the art shows. Boss draws floor-anchored at `BOSS_H=167` (10% smaller
  than the old 185); only the **demon** has a real sprite (+ idle animation + aura),
  others procedural.

### Den goblins (combat)
- Goblin Den spawns marching `G.minions`. **They lock onto a hero (`g.engaged`) and
  the hero HALTS to trade blows until one dies** (`goblinStep` keeps the lock,
  `goblinValidTarget` guards against stale cross-wave refs; the hero-walk update
  halts while any living goblin has `g.engaged===h`). Dials: `GOBLIN_HP_FRAC=0.55`,
  hero retaliation `*0.4`, `GOBLIN_SPD=50`, `GOBLIN_DEN_CAP=20`.

### The align-tool loop
`align.html` shows every trap + test-traffic heroes/monsters running through a room.
Tune positions/sizes/layers/lights/lift there → **Generate → download** → upload
`rooms/layout.json` to `no_room_for_heroes/rooms/` on GitHub. The game reads it on
the next deploy. When you add a new trap/light, register it in align.html's probe
list, default pieces, `defLayer`, and (for lights) `LIGHT_COL`/`kindOf`/`lightAlpha`.

### Game feel / FX layer (the "juice")
Cosmetic-only, layered on the existing `shake/flash/hitStop/slowmo/comboCallout`.
**Never touches combat math or save state** — it reads game state and pushes to FX
arrays. Lives near the `AUDIO + GAME FEEL` block.
- **Blood** (`blood(x,y,n,dirx)`) pushes gore particles to `particles` flagged
  `blood:true`; when one lands (`p.y>=FLOOR`) the particle update splatters a floor
  `decals[]` entry. `bloodPool(x,r)` drops a pool directly. `sparks(...)` = bright
  weapon/cast specks. Hooks: `dealToHero` (hit + crit), `heroDies` (gibs + pool +
  soul wisp), `fightTick` (monster hit/death), `bossBolt` (cast pop).
- **`decals[]`** = floor blood (cap `DECAL_CAP`=90), drawn in `drawDungeon` under the
  actors. **`embers[]`** = ambient motes + rising soul wisps (additive, drawn in
  `draw()`); spawned each frame in build/run and by `comboCallout`.
- **Sprite hit-flash**: `h.flashAt` / `cell.mon.flashAt` timestamps → a 120ms pop in
  `drawHero` / the monster draw. **Ghost HP bars**: `bar(...,ent)` stores `ent._bg`
  and drains a pale sliver after a hit (heroes, monsters, boss).
- **Screen-space** (device transform, end of `draw()`): cached **vignette** (`_vig`)
  always; **red danger vignette** (`_redVig`) when `throneHitT>0` (throne struck) or
  the boss HP is low. Rebuild on resize (keyed on `CV.height`).
- **UI motion** (anime.js-inspired, vanilla — no dependency): `jz*` CSS keyframes
  (`jzReveal`/`jzDeal`, easeOutBack `cubic-bezier(.34,1.56,.64,1)`) spring reward &
  boss-select cards in (`.choice.jz` + inline `animation-delay` stagger), deal new
  hand cards in (`.card.jzdeal`, gated to cards added since the last render) and pop
  the selected card (`.card.sel`); every overlay's `<h1>`/`.menu-btns` drift in. The
  HUD rolls gold/dread with `countTo()` (eased per-frame lerp in `updateTop`) instead
  of snapping. All honour `prefers-reduced-motion`.
- Covered by `tests/no_room_for_heroes_juice.test.mjs` — it runs a real wave through
  `draw()`/`updateTop()` and a build-phase `render()`, so a render-time error there
  fails `npm run check`.

---

## 6. ComfyUI pixel-art sprite tooling (`tools/comfyui/`)

When the owner asks to **create/generate a sprite/icon/tile**, use this — not
hand-drawing or a cloud service.

- `make_sprite.py "<subject>" --name <n> --size <px>` → ComfyUI (SDXL + Pixel Art XL
  LoRA) → `pixelate.py` (downscale + palette + transparent bg) → `assets/<n>.png`.
  Ranked model auto-detect (drop a better SDXL checkpoint in and it's preferred).
  `/sprite <subject>` is the slash-command shortcut.
- `make_missing.py` — batch-renders the still-procedural traps (bombard/hexbrand/
  runestone left) into `rooms/traps/` with style-matched prompts.
- `animate.py` — **CPU only** (Pillow): turns one static sprite into a frame
  sequence + sheet (strike/pulse/flicker/bob). No GPU/ComfyUI needed.

### ⚠️ The cloud-vs-local constraint (read this)
The generation step needs a **reachable local ComfyUI** (`127.0.0.1:8000`). A Claude
Code session **started from the phone/web runs in an isolated cloud sandbox** that
CANNOT reach the owner's machine (localhost is the sandbox; outbound is proxy-blocked)
— so `make_sprite.py`/`make_missing.py` will NOT run there. Only a session running
**on the owner's machine** (desktop Claude Code, or the script directly) can generate.
The **CPU halves run anywhere** (`pixelate.py`, `animate.py`) — so the split is:
owner's machine generates → pushes art → a cloud session does pixelate/animate/align/
wire. Don't promise to generate from a cloud session; verify with
`python tools/comfyui/make_sprite.py --check` first.

---

## 7. Major gameplay systems & tuning

- **Campaign** (`CAMP_LEVELS=50`): `levelComp(L)` waves, `campPower()=ceil(L*0.7)`,
  difficulty `(1+(L-1)*0.02)*(1+(L-1)*0.034)*threat` (raise the `0.034` to harden) ×
  `(1+asc*0.18)` for Ascension. Odd-5 → relic, even-5 → mandate + Town. **The King
  finale** after wave 50 (HP×8, ATK×1.3, smashes a room with `KING_SMASH=0.10`).
- **Rooms/fusing**: a room holds up to 3 parts (2nd free, 3rd `FUSE3_GOLD=250`, 3rd
  guard `GUARD3_MUL=0.85`). Two fused monsters = two guards (`cell.mon`+`cell.mon2`),
  named pairs in `SYNERGY_PAIRS`. **Demolish** + **Upgrade** live in the room inspect
  bubble (build phase). The bubble caps at stage height with scroll, and the
  Upgrade/Demolish buttons sit in a **sticky `.ibtns` footer** so a long bubble
  (e.g. Goblin Den) can't hide them.
- **Heroes**: warrior/rogue/mage/cleric + champion mini-bosses. Auto-cast class
  spells (`heroSpellTick`); rogue disarms a trap room on entry (`DISARM_DUR=3`s).
- **Boss**: `BOSSES` (dragon/lich/demon/ogre/ent/golem), passive + 2 signature + pool
  ability; bolts fly from the throne (`bossBolt`); `Smite` + `Overdrive` (rage) are
  the player's active tools.
- **Town/meta**: in-run Town (Merchant, Barracks, Black Market `BM_SELL=100`/`BM_BUY=200`,
  boss empowerment, schemes); persistent **Town Builder** (painted map, pan/zoom).
  Slots: `slotCap()`=5 campaign (+rune/building/relic), 99 endless; `slotCost()`
  exponential past slot 2.
- **Leaderboard + cloud saves**: `functions/api/{board,save}.js`, KV binding `BOARD`
  (TTL must be ≥60). Endless-only leaderboard; cloud save backs up RUNES+TOWN under a
  sync code.

### Single-constant dials (safe tweaks)
- Fed monster growth `feedMul(k)=1+0.30*ln(1+0.10k)`; rune income `/8` in
  `awardRunes`; resources wood `*0.05`, stone `*0.025`, shards `/8`.
- Veteran snowball `VET_DMG=0.09`/rank, `VET_BITE=0.006`; stacked traps
  `TRAP_STACK_MUL=[1,0.8,0.6]`; music under SFX `MUSIC_SCALE=0.55`.
- Trap strike `TRAP_RISE=110`/`TRAP_FALL=480` (defaults; per-trap overrides in
  `TRAP_TIMING`); flame cascade `70`ms; candle loop `110`ms.

---

## 8. The owner's balance philosophy

- **First runs should be brutal (~20% win with smart play); meta-progression (runes
  + town + slots) is the path to reliable wins.** Sims in `/tmp` (not committed) are
  pessimistic — treat their win-rates as a floor; the owner outplays them.
- The owner iterates fast on *feel*: "too easy/strong/big" → move a specific dial.
  Recent asks: nerfs (snowball, feed, meta rewards, early epics) and depth (hero
  spells, two-guard fusion, the King, merchant, the whole art pass).
- Art comes in waves of uploaded PNGs/zips → you place + wire + align them. The owner
  generates new art on their machine (ComfyUI) and aligns positions in `align.html`.

---

## 9. Quick start for your first task
```bash
cd /home/user/Games
npm run check                      # build + 10 suites, must be green
# edit no_room_for_heroes/index.html (and/or align.html, rooms/layout.json)
npm run check
git add -A && git commit -m "..."
git push -u origin <your-session-branch>
# DRAFT PR → mark ready → squash-merge (mcp__github__*). Conflicts: keep HEAD, re-check, re-grep.
```
End the reply with the four links (Play / Align tool / Music player / Goblin sandbox).
