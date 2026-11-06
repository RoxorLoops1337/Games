# Late game read (Acts 2 and 3), session S1

Method: real Chromium, real mouse clicks through the combat screen (hover, click card, click enemy, End Turn), Marrow with a strong-bot deck and 260 HP so fights run long enough to read. Fights seen: Act 2 normals (Needle Nanny + Brine Surgeon, Scissor Nurse + Tax Collector + Ferric Warden), elites (Appraiser, Pickled King), boss (Broker); Act 3 normals (Applause + Understudy's Shadow + Usher, Mask Chorus + Gilded Cherub + Critic), elites (Gold Leaf Golem, Diva), boss (Impresario), final (Grafter). Fights were played to turn 3 or 4 each with a hover tour of intents and statuses, not to the kill. Screenshots are in /tmp/claude-0/shots/s1/ (not in the repo). Not seen: Mimic, Insulated, Hoist, Ensemble, Claim, Late Fee first hit; Thirst and Leaf Armor tooltips only partly (hover positions missed).

What works: intent tooltips are strong (they print base, strength, weak and the final number, for example "Base 20, +2 Strength, x0.75 Weak = 16"), status tooltips state stacking and effect, the Diva Aria tip explains its own condition.

## Ranked findings

1. Intent plate does not show that its number is conditional. The Diva plate reads 37 but the move grows by 3 per card past the 5th and per Applause; only the hover says so. FIXED: a gold "+" pip on the plate for any move with a tip or note. Shots: a3e2_tour_int0, a3e2_t03_a.
2. Intent plate showed only two effect icons, so Appraiser (attack, block, debuff) hid its debuff. FIXED: up to three icons, dropping from the right when the plate is narrow. Shots: a2e1_t03_a, a2n2_t01_a.
3. Multi-enemy plates all show a bare sword for different moves (Snip, Levy, Allergy all 14 in a2n2_t01_a). The move name sits above, but the icon does not distinguish them. Open: needs per-move icon art.
4. The boss and elite intro banner covers the enemy name, move and intent plate on turn 1, and the first screenshot after the fight starts shows it (fix1_t01_a, fix2_t01_a). A new player cannot read the first telegraph for about two seconds. Open: dim only the lower band, or shorten.
5. Floating combat text lands on the intent plate and move name ("BROKEN" and "+10 Block" over the Appraiser's Levy, a2e1_hover_122). Open: anchor enemy float text to the body centre, not the plate.
6. Hero status row is one row of about 20 px icons under the HP bar; with five statuses (a3n2_t03_a) the numbers are tiny and the effect of each (card cost up, Charge) is only on hover. Open: needs a taller hero plate in combat_layout.
7. Card costs inflated by a player status (a3n2_t03_a shows 2, 3, 2, 2, 3 on a 1-cost hand) with no label on the cards. The cause is only in the hero status tooltip. Open: tint the cost orb and name the cause in the card tip.
8. Pickled King Lid Crush shows 29 with Brined 14 and Thirst as plain icons; the plate does not say what feeds the number (a2e2_t03_a). Open: give the move a tip like Aria has.
9. The Grafter "Your Bone Saw" tip says only "Hits you for 14" (a3f_tour_int0). It should say it copies your most played card. Open (data text, enemies_3.js).
10. Tooltip panels cover the hand and the Thread rail while hovering statuses (a3n1_tour_st0, a2n1_tour_hero), so the cards you are planning with are hidden at the moment you read the status. Open.
11. Aria style spikes are large (36 plus 12) against a real 70 to 90 HP player; the plate is honest but there is no "this would kill you" warning colour. Open: tint the number red when intent damage is at least current HP plus Block.
12. Card text repeats a line ("Apply 2 Bleed. Apply 3 Bleed." on Clean Incision, a2e1_hover_122); merge same-status lines. Open (text.js).
13. Enemy statuses wrap to a second row of bad statuses under the HP bar; with 8 statuses on a 4-enemy fight the rows sit close to the Thread rail (a3n2_t03_a). Fits, but no room to grow.
14. Status name is never on the icon, only a glyph and number; Leaf Armor, Interest, Late Fee and Brined need a hover each (a3e1_tour_stx1, a2b_tour_st0). Open: colour-coded glyphs exist; add name labels on the elite or boss only.
15. Tutorial tip ("Energy pays for cards") reappears in Act 2 on a fresh meta; harmless in a real run but it sat over the first telegraph in a2n1_t02_a. Open.

## Fixed in this pass
Findings 1 and 2, both in ui/combat_hud.js (drawEnemyPlate badge, drawIntentBubble kinds). `node tests/run_graftwork.mjs`: 46/46 passed. Findings 3 to 15 were not fixed in this session (time budget), the list is ordered by priority for the next pass.
