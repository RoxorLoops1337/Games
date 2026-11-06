# Card audit (O2): deck-building quality per hero

Method. The no-pick strong bot (`POLICIES.strongNoPick`) never buys cards, so a pick counter would read zero for every non-starter. Instead each non-starter card (hero and neutral) was forced into the starter deck as 2 copies and played by the strong bot at A0: 200 runs per card per hero (same seeds for every card, a no-card control on those seeds), 300 runs on a second seed set to confirm outliers. Columns: wins and floors versus the control, plays per run. Wins noise is about +-15 per 200 runs, floors about +-1. Setup and payoff cards read low in a starter deck (power cards with no immediate effect, X-cost Charge, detonators with no Burn to detonate), so a low number means "needs support or lacks a floor", not "bad".

Card ids are save keys (`deserializeRun` does no validation), so no id was removed: a redundant card was **re-themed under the same id** (new name, school, text, art).

## Archetypes (3 per hero, each 4+ cards, after the edits)

| hero | archetype | cards |
|---|---|---|
| Marrow | Bleed / self-damage | m_flick, m_incision, m_lancet, m_reopen, m_epidemic, m_exsang, m_vivisect, m_scarpower, m_anticoag, m_bloodrite, m_hemorrhage, m_laybare, m_fever_chart, m_stress_test (14) |
| Marrow | Rust / junk | m_cauterize (Scrap Drawer, makes junk), m_swab (Salvage Run, scales with exhausted junk), m_triage, m_hacksaw, m_flakeoff, m_scabover, m_rustplate, m_biohazard, m_scrap_splint, m_thread_rustseam, m_hammered_plate (11) |
| Marrow | Long-Line Thread | m_tailored_cut, m_mirrored_wound, m_hemostatic_snip, m_thread_bloodline, m_thread_stitchup (Running Stitch), m_thread_rustseam, m_thread_longsuture (7) plus x_thread_* |
| Wick | Burn | w_kindle, w_match, w_fan, w_ember_toss, w_cinder_rain, w_quick_flick, w_blowtorch, w_flashpoint, w_pyre_dance, w_burnout, w_chain_reaction, w_backdraft, w_wildfire, w_pilot_light (14+) |
| Wick | Static / Charge | w_static_cling, w_discharge, w_spark_gap, w_capacitor_bank, w_arc_flash, w_dynamo, w_bare_wire, w_overcurrent, w_substation, w_earth_wire, w_static_seam (11) |
| Wick | Thread-Ember | w_thread_trail, w_thread_conflagration (Hem of Flame), w_thread_fusewire (Taper Line), w_conductive_thread (Votive Row), w_fuse_bridge, w_tempered_wick, w_scald and w_tinder_stack (now Ember, extend the Line) (8) |
| Odile | Gilded / gold | o_gilt_strike, o_collect, o_receipt, o_levy, o_tip_the_usher, o_dividend, o_patronage, o_gilded_age, o_golden_parachute, o_ledger_line, o_overdraft, o_hardened_purse, o_thread_embroidered, o_thread_tapestry (14) |
| Odile | Echo | o_encore, o_double_bill, o_bulk_order, o_second_helping, o_standing_order, o_triple_threat, o_choir_loft, o_mirror_sale, o_overbooked, o_thread_doublehem (10) |
| Odile | Hoard / draw | o_appraise, o_browse, o_audit, o_reprint (Backorder), o_market_crash, o_cross_listing, o_thread_sparespool, o_keepsake, o_liquidate, o_hostile_takeover (10) |

Gaps found: Marrow's Rust archetype had two junk makers and no cleanse-plus-junk or exhaust-scaling card; Wick's Thread-Ember had only 3 real members; Odile's Hoard-draw had three draw cards and no Thread hook. All three now meet the 4+ bar by a wide margin; the work went into the sub-roles above.

## Flagged cards

Strictly dominated (same hero, same school, same cost, every number lower): `o_levy` by starter `o_gilt_strike`; `w_thread_fusewire` by `w_static_seam`; `w_conductive_thread` by `w_spark_gap`; `o_second_helping` and `o_reprint` by `o_thread_doublehem`; `m_thread_stitchup` by `m_hemostat` for short Lines. Unplayed or near unplayed (plays per run, 2 copies, 200 runs): w_tinder_stack 4.7, m_epidemic 6.6, o_audit 8.1, o_market_crash 1.1, w_chain_reaction 3.8, x_flatline 2 to 3.

Outliers up (wins versus control, per 200 runs): x_adrenal +60 / +76 / +59 (Marrow / Wick / Odile; the worst, and it is in every hero's pool), m_restraints +55, m_secondwind +57, m_desperate +48, o_liquidate +44, o_tip_the_usher +36, o_golden_parachute +31, w_bare_wire +40. Only x_adrenal, m_restraints and o_golden_parachute were nerfed (the others sit at the top of a normal range: a typical good card is +40 to +60 here).

Outliers down: w_capacitor_bank (-59 wins, -18.8 floors), w_flashpoint (-56, -9.6), m_bloodrite (-49, -7.0), w_dynamo (-46, -6.6), m_hammered_plate (-32, -5.3), m_laybare (-31, -4.7), o_gilded_age (-53), o_dividend (-54), o_tithe_ledger (-47), w_graft_furnace (-36), x_resolve (-26 to -50).

## What changed (all data edits, no engine, ui or art code)

| card | change | before -> after (wins / floors vs control) |
|---|---|---|
| x_adrenal | energy 2 draw 2 (up draw 3) -> energy 1 draw 1 (up energy 2 draw 1) | +60/+76/+59 -> +20/+41/+17 wins |
| m_cauterize | now **Scrap Drawer**, Rust: cleanse, Block 5, add a Scrap Heap to hand (junk maker; keeps the cleanse the status tests rely on) | +1 -> +14, floors -1.7 -> -0.4 |
| m_swab | now **Salvage Run**, Rust attack: 5 damage +1 per exhausted card (max 14) | -8 -> -24 (exhaust pile starts empty; a payoff card) |
| m_thread_stitchup | now **Running Stitch**, Blood 0-cost attack, damage and Bleed scale with the Line | -5 -> +28, floors -1.7 -> +1.9 |
| m_scabover, m_drawblood, m_laybare, m_epidemic | Block base up; Draw Blood gains 4 Block; Lay Bare gains 5 damage; Epidemic gains 4 damage to all | floors -3.6/-3.8/-4.7/-1.6 -> -2.5/-1.3/-2.0/-0.1 |
| m_hammered_plate | Plated 2 + Tempered cards (was 1 +) | -32 -> -9 |
| m_bloodrite | 1 HP and 1 Strength per turn (was 2 and 2), plus 2 Strength now (3 upgraded) | -49 -> -32, floors -7.0 -> -2.5 |
| m_restraints | Block 3 (was 4), upgraded 5 | +55 -> +46 |
| w_thread_fusewire | now **Taper Line**, Ember 0-cost skill: Burn 2 +1 per knot (max 6) | 0 -> +19 |
| w_conductive_thread | now **Votive Row**, Ember skill: Burn to all, 1 +1 per knot (max 5) | -9 -> -21 (needs a Line) |
| w_tinder_stack, w_scald | become Ember (extend Ember Lines); Tinder Stack lights 1 Burn on all; Scald costs 3 HP | -25 -> -19 ; -31 -> -3 |
| w_pyre_dance | Burn scaling 0.5 -> 0.75 per stack | -10 -> +7 |
| w_flashpoint, w_chain_reaction | +5 / +6 damage so they are never a blank play | floors -9.6 -> -2.1 ; -3.5 -> -3.2 |
| w_capacitor_bank | now also Block 4 and damage 3 per X (target enemy) | -59 -> +35, floors -18.8 -> +0.5 |
| w_dynamo, w_graft_furnace | Dynamo +8 Block; Furnace Smolder base 2 | -46 -> -15 ; -36 -> -19 |
| o_levy | cost 0, 4 damage, 3 gold (no longer a worse Gilt Strike) | -23 -> +9 |
| o_second_helping | Echo cantrip: draw 1, Echo 1, exhaust (upgrade cost 0) | +20 -> +5 |
| o_reprint | now **Backorder**, Hoard retain skill: Block 5, draw 1 +1 per 2 knots | +28 -> -15 (was a dominated duplicate; now a Thread draw card) |
| o_market_crash | cost 1, no exhaust, 12 gold threshold, else draw 2 and Block 6 | -35 -> -43 (still rarely played; rare payoff) |
| o_pawn_ticket, o_tithe_ledger, o_cross_listing | draw instead of discard plus Block 3; Block 7; base Block 6 and 2 gold | -39 -> -4 ; -47 -> -28 ; -24 -> -23 |
| o_dividend, o_gilded_age | each gains immediate Block (6 / 8) | -54 -> -20 ; -53 -> -27 |
| o_golden_parachute | Block 7 +12% gold (max 20), was 8 +15% (max 24) | +31 -> +22 |

Still low and left alone on purpose (setup or payoff cards that need their archetype): w_chain_reaction, w_graft_furnace, o_market_crash, o_audit, x_resolve, x_flatline (a power or exhaust card with no immediate effect; consider a neutral-pool pass).

## Gate

Strong bot at A0 (100 runs per hero) is identical before and after, because it never acquires the changed cards: Marrow 24%, Wick 30%, Odile 27% wins (mean 27%), Act 1 clear 96 / 99 / 94 percent. A fresh 300-run read after the edits: 28 / 39 / 34 percent wins, Act 1 clear 94 / 99 / 94 percent.

## Round 2: card pick policy and support-card rework

### Strong bot pick policy (`GW_PICK`, default on)
Cards only enter a run through the shop, so "pick" means a shop buy. `POLICIES.strongPick` (the default `POLICIES.strong`; `GW_PICK=0` or `POLICIES.strongNoPick` is the baseline) scores each shelf card as: static value over the deck median (sim `cardV`) + the forced-sweep delta from `tools/graftwork_cardsweep.mjs` (`AUDIT_DELTA`, wins per 200 runs divided by 20) + school bonus (+1.5 if it shares the school of the deck's grafts, +0.7 for a second school) - 1 for a Power in a deck under 9 cards. It buys the best card only if the score is >= 3 (`GW_THRESH`, the margin over skipping), at most 4 cards per run (`GW_MAXBUY`), before relics (`GW_FIRST`), never dipping below the price of a junk removal. Tuning notes: buying more, or at a lower threshold, hurts (a 6-card cap scored 28% against a 31% baseline; the deck dilutes its grafted stars), and the buy-after-relics order gave only +2.

Pick-on versus pick-off, 900 runs per hero (150 runs per hero in brackets, noise +-4 per hero at 150), after the rework below:

| | Marrow | Wick | Odile | mean |
|---|---|---|---|---|
| A0 off | 29.4% (34.7) | 31.1% (28.0) | 32.7% (32.7) | 31.1% (31.8) |
| A0 on | 33.6% (33.3) | 32.6% (33.3) | 38.2% (46.0) | 34.8% (37.6) |
| A5 off | 11.8% (9.3) | 14.3% (12.0) | 14.7% (20.0) | 13.6% (13.8) |
| A5 on | 17.1% (13.3) | 13.9% (16.7) | 19.7% (20.7) | 16.9% (16.9) |
| buys per run (A0) | 1.8 | 2.0 | 1.7 | |

Picking is worth +3.7 points at A0 and +3.3 at A5 (target 3 to 10), floors +0.7. Odile gains most (+5.5) because Market Crash is her best buy. Wick at A5 is flat.

### Rework (data only, ids kept), forced sweep: 2 copies, 200 runs, A0, no-pick bot, wins versus control (Marrow / Wick / Odile where the card exists)

| card | role | change | before | after |
|---|---|---|---|---|
| x_resolve | neutral scaling power | cost 1 (was 2), Ritual 1 and Block 5 (up: Ritual 2, Block 7) | -28 / -42 / -33 | +36 / +20 / +35 |
| x_flatline | neutral boss answer | cost 1, Intangible and Block 8, exhaust, retain (up: cost 0, Block 10) | -20 / -19 / -46 | +7 / +17 / -7 |
| w_chain_reaction | Wick finisher | cost 1; lights 5 Burn on all, detonates, then 5 damage to all (up: 6 and 7). Self-fuelled, bigger with stacks | -38 | -7 |
| w_graft_furnace | Wick engine | also 3 Burn on all now; Smolder 2 + 0.34 per graft (max 6) (up: 4 Burn, 3 base, max 7) | -25 | +9 |
| o_market_crash | Odile gold to tempo | cost 0, exhaust; with 15 gold pay it for 2 energy and draw 3, else draw 1 and Block 6 (up 12 gold, draw 4, else draw 2 and Block 8) | +20 | +48 |
| o_audit | Odile cycling | draw 3, discard 1, Block 7, retain, no exhaust (up adds 4 gold); was draw 4 discard 2 exhaust | -24 | -2 |

Floors versus control after: all within -1.0 to +2.3 (Market Crash +2.2 is the high end; it is the only reworked card above a normal good-card range, Odile's gold-heavy builds can afford it, watch it). The earlier -43 read for Market Crash was on the old spec; the full unmodified sweep before this round is the "before" column. A fresh full sweep of every card (all heroes plus the neutral pool) lives in the same format via `node tools/graftwork_cardsweep.mjs <hero> 200`.
