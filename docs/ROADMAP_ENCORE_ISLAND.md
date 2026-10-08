# Encore Island, the Backstage roadmap

Working document for the late-game content that lives under the home island.
Each session: pick one door, build it properly (headless suite + `npm run check`
+ a browser look), ship, then move it to **Done** and promote what comes next.

**Rules of the loop**
- The Backstage is late game. Nothing behind a door may matter before the
  player has 6 islands open; the early loop (sing, loot, sell, plates) stays
  untouched.
- A door is its own small game with its own verbs. If it is only "more plates",
  it is the wrong door.
- Everything is a plug-in: a `js/f_*.js` module that calls `regDoor(...)`
  (see encore_island/FEATURES.md). Core files are not edited for a door.
- Costs scale with `helmVal(S.lands.length)`; think thousands to millions.
- Phone first: one glance to read, one thumb to play.

---

## Done

- **The big home island** (r 470 to 640) laid out in zones around the Stage
  Plaza, each at the end of a signposted cobbled boulevard: Hall of Fame (N,
  marble: monument + Magnet/Crit gem plates), Smelter Yard (NE, basalt),
  Arena (E, sand), Travel Dock (SE, warp pad), Training Terrace (S, slab arc
  with the five hero plates and a balustrade), Backstage stairway (SW), Market
  Quarter (W, planks: SELL stall, Vault, Midas plate, Market district), Studio
  (NW). Plates are perspective stone discs with a rune ring that turns gold
  when affordable and a sign post carrying icon, level and price.
- **The Backstage stairway and greenroom.** The stairway shows at 3 islands,
  its plate is payable from 6. Stand still on it to go down. The greenroom has
  a mirror, outfit rack, couch, fridge, neon sign and three doorways in the back
  wall, each a `regDoor` slot. Unclaimed doorways show chained placeholders.
  Saves remember `S.place` and the plate; a tour resets both.

## Next up

### Door 1: Merch Workshop ("turn drops into merchandise")

A craft-and-sell loop that gives late-game loot a second use. Different kind of
game from the plaza: no walking, no combat. A workshop board.

- **Materials.** Every creature kind drops its material on top of the usual
  helmet (fur, scales, feathers, glow dust...), only once the door is open, at
  a low rate that rises with Crowd Gate level. Materials stack in `st.mats[k]`.
- **Designs.** Unlock merch designs with gems or by milestones: T-shirt, tote,
  cap, poster, vinyl, plush. Each design has a recipe (2 to 3 materials) and a
  base price far above the helmets it took (10x to 50x helmVal of the material's
  land).
- **Print press.** One press to start, more with coins. A press takes a design
  and runs a batch over real time (minutes), like the Smelter but longer and
  idle-friendly (offline progress like towers).
- **Demand.** Fans at the stage buy merch from a table in the Market Quarter.
  Each design has a demand bar that drains as you sell and refills over time;
  selling into empty demand pays little. Headliner kills spike demand for the
  matching design (a boss shirt sells out). That is the decision: what to print
  now versus what to stockpile.
- **Why it is good.** Coins per minute in the millions late game, without
  touching the plaza balance; a reason to hunt specific creatures again.
- **Unlock condition.** Backstage open and the Smelter at level 3.
- **Test expectations.** Materials drop only when unlocked; a press finishes a
  batch after its time (and offline); demand drains and refills; selling pays
  by demand; state round-trips through `serialize/applySave`; a tour keeps
  designs (keep: true) and clears stock.

### Door 2: Watchtower ("hordes will come for the island")

A tower-defence night that attacks the home island, in the style of the base
defence ad games: build walls and turrets on the plaza rim, then hold.

- **The night.** Once the door is open, every N minutes of play (or on demand
  from the Watchtower) a horde night starts: three to five waves of creatures
  from all your opened islands march up the boardwalks and across the shore
  towards the Stage. Day play is unchanged.
- **Building.** Defence tokens (earned from Headliners and the Arena) buy wall
  segments and turrets on fixed rim slots around the plaza (the boulevard
  mouths are the choke points, exactly where the signposts stand). Turrets
  reuse the existing tower types (Speaker, Disco, Boom Box) with a defence
  skin; walls have HP and are repaired with coins.
- **Play.** You are on the island during the night: sing, dash, use the
  Blast, and the fans fight beside you. Breaking through to the Stage costs a
  slice of the Vault. Holding all waves pays a chest of coins, gems and tokens.
- **Why it is good.** A reason for the big island and the boulevards to exist
  as geometry, a place for fighters to shine, and a loud five-minute event in a
  game that is mostly calm.
- **Unlock condition.** Backstage open and 8 islands.
- **Test expectations.** Slots are on the rim and clear of fixtures
  (`HUB_KEEP`); a night spawns the waves and ends on hold or breach; walls take
  damage and block pathing (`walkable` for foes only, never for the hero);
  rewards scale with waves held; nothing runs while in the Backstage; state
  round-trips; a tour clears walls but keeps tokens.

### Door 3: VIP Lounge (open)

Reserved. Candidates: a daily set list (three songs = three modifiers), a
guest-book of fans with portraits and requests, or a cosmetics room for the
greenroom itself.

## Later ideas

- Backstage decor that reflects progress (gold records per Encore Tour, a
  trophy shelf per milestone).
- A second staircase down to a rehearsal cellar once two doors are open.
