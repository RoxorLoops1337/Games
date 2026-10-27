/*
 * SUNBEAM SIEGE: MISCHIEF clan card set (B04). 42 non-champion cards.
 * 20 Cat units, 14 spells, 8 toys (rooms, boxes, shelf items).
 * Rarity: 18 common, 16 uncommon, 8 rare. Clan id: mischief. Prefix: mischief_.
 *
 * Conventions used: A03 schema and DSL, RULES.md overrides. Lives: Kitten 2, standard 3, Large 4.
 * Large cats are size 2 and do not fit Boxes. Toys that hold Boxes use type "toy" with tag "box".
 * Nip uses the A03 effect/counter name "catnip" (the meter is the Nip meter, 0 to 10).
 *
 * NEEDS: (new engine support, nothing here is silent)
 *  Triggers (keys of effects):
 *   - onKnock         : you Knock a pest (card or unit). triggerSource = the pest. Accepts "once":"turn".
 *   - onKnockLand     : a pest lands on this floor from a Knock. triggerSource = the pest. (toys and units)
 *   - onKnockedOff    : a Fragile toy is knocked off by a cat on its floor. Toy is then destroyed.
 *   - onUnbox         : this cat leaves a Box (also when the Box is flattened). A05 hook onUnbox.
 *   - onHairballCreated : a Hairball card is added to your hand/draw/discard by an effect.
 *   - onSurgeStart, onCrashStart : A05 hooks onSurgeStart and onCrashStart as card triggers.
 *  Effect types and params:
 *   - surge           : set Nip to 10 and start Surge now (excess 0). Exhausts the meter.
 *   - endCrash        : end the current Crash early (no forced nap refund).
 *   - unbox           : the target Cat leaves its Box (fires onUnbox). Box is not flattened.
 *   - bounce          : return the target Cat to its owner's hand (no life lost).
 *   - box params      : "kind" (cardboard|laundry|tape), "sit":true (the deploying Cat sits in it).
 *   - exhaustCard     : extra param "card" (card id filter) with mode "all", from "hand".
 *   - reduceCost      : extra param "filter":"targetsYarned" (spells whose target has Yarn).
 *   - createCard      : may name any card id, here "mischief_wobbly_vase" (a real card, fightOnly copy).
 *  Targets:
 *   - frontEnemyBelow : front pest on the floor below this toy (the Cellar front pest if on the Cellar).
 *   - allEnemiesOnFloor with "floorOf":"chosenEnemy" : resolve the floor after a Knock moved it.
 *  Counters (AmountExpr "per"): hairballsInHand, yarnOnBoard, yarnOnTarget (target of attackTarget).
 *  Checks: surging, crashing, targetHasStatus:<id>, selfInBox (exists), hasBox (exists, per target floor).
 *  Keyword: fragile (toy). Fragile toys can be knocked off once per turn by any cat on that floor, free.
 *  Aura "if": aura entries may carry an "if" list (used by Too Small For This).
 *  Note: onTurnEnd toy effects must resolve BEFORE the hand is discarded (Fur Factory counts Hairballs in hand).
 */
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.cardsMischief = [

  /* ================================ CAT UNITS (20) ================================ */

  { "id": "mischief_shelf_gremlin", "name": "Shelf Gremlin", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 2, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Whenever this attacks, Knock 1 its target.",
    "flavor": "Maintains eye contact for the whole descent.",
    "effects": { "onAfterAttack": [ { "type": "knock", "amount": 1, "target": "attackTarget" } ] },
    "upgrade": { "stats": { "power": 3, "health": 5 }, "text": "Whenever this attacks, Knock 1 its target." },
    "art": { "sprite": "cat_gremlin", "palette": "teal", "accessory": "tiny wine glass held at the edge" },
    "tags": ["knock"], "unlock": "start" },

  { "id": "mischief_counter_kitten", "name": "Counter Kitten", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 0, "targeting": "floor",
    "stats": { "power": 1, "health": 3, "lives": 3, "size": 1 }, "keywords": { "fleeting": true },
    "text": "Fleeting. Deploy: Knock 1 the front pest on this floor.",
    "flavor": "Takes inventory of the shelf by removing the inventory.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "frontEnemy" } ] },
    "upgrade": { "stats": { "health": 4 }, "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "frontEnemy" }, { "type": "draw", "amount": 1 } ] }, "text": "Fleeting. Deploy: Knock 1 the front pest on this floor. Draw 1." },
    "art": { "sprite": "kitten_blur", "palette": "teal", "accessory": "one paw mid-swipe" },
    "tags": ["knock", "kitten"], "unlock": "start" },

  { "id": "mischief_box_inspector", "name": "Box Inspector", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 2, "targeting": "floor",
    "stats": { "power": 2, "health": 5, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Deploy: if this floor has no Box, place a free Box here and sit in it.",
    "flavor": "Measures every box. Approves most. Sits in them regardless.",
    "effects": { "onPlay": [ { "type": "box", "kind": "cardboard", "sit": true, "target": "thisFloor", "if": [ { "check": "hasBox", "op": "==", "value": false } ] } ] },
    "upgrade": { "stats": { "power": 3, "health": 6 }, "text": "Deploy: if this floor has no Box, place a free Box here and sit in it." },
    "art": { "sprite": "cat_loaf", "palette": "cardboard", "accessory": "tiny hard hat and a tape measure" },
    "tags": ["box"], "unlock": "start" },

  { "id": "mischief_peekaboo_kitten", "name": "Peekaboo Kitten", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 1, "health": 4, "lives": 3, "size": 1 }, "keywords": {},
    "text": "Deploy: draw 1 card. If this is in a Box, draw 1 more.",
    "flavor": "You cannot see it. It can see you. This is the whole game.",
    "effects": { "onPlay": [ { "type": "draw", "amount": 1 }, { "type": "draw", "amount": 1, "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ] },
    "upgrade": { "stats": { "power": 2, "health": 5 }, "text": "Deploy: draw 1 card. If this is in a Box, draw 1 more." },
    "art": { "sprite": "kitten_peek", "palette": "cardboard", "accessory": "two eyes over a box rim" },
    "tags": ["box", "kitten", "draw"], "unlock": "start" },

  { "id": "mischief_skein_gremlin", "name": "Skein Gremlin", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 1, "health": 5, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Deploy: Yarn 1 the front pest on this floor.",
    "flavor": "Not responsible for the sweater. Present at the sweater.",
    "effects": { "onPlay": [ { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "frontEnemy" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "applyStatus", "status": "yarn", "amount": 2, "target": "frontEnemy" } ] }, "text": "Deploy: Yarn 2 the front pest on this floor." },
    "art": { "sprite": "cat_yarn", "palette": "yarn_red", "accessory": "wool trailing from both back paws" },
    "tags": ["yarn"], "unlock": "start" },

  { "id": "mischief_buzzed_burmese", "name": "Buzzed Burmese", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 2, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Start of your turn: gain 1 Nip.",
    "flavor": "Has a lot to say about the ceiling. Most of it is volume.",
    "effects": { "onTurnStart": [ { "type": "catnip", "amount": 1 } ] },
    "upgrade": { "stats": { "power": 3, "health": 5 }, "text": "Start of your turn: gain 1 Nip." },
    "art": { "sprite": "cat_sleek", "palette": "magenta", "accessory": "wide dilated eyes" },
    "tags": ["nip"], "unlock": "start" },

  { "id": "mischief_sprig_courier", "name": "Sprig Courier", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 1, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Deploy: gain 2 Nip.",
    "flavor": "Delivers herbs to the cat's house. The cat's house is yours.",
    "effects": { "onPlay": [ { "type": "catnip", "amount": 2 } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "catnip", "amount": 3 } ] }, "text": "Deploy: gain 3 Nip." },
    "art": { "sprite": "cat_sleek", "palette": "green", "accessory": "small satchel with a green leaf" },
    "tags": ["nip"], "unlock": "start" },

  { "id": "mischief_coughing_persian", "name": "Coughing Persian", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 1, "health": 5, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Deploy: add a Hairball to your hand.",
    "flavor": "Dignity first. Then the rug.",
    "effects": { "onPlay": [ { "type": "createCard", "card": "hairball", "amount": 1, "to": "hand" } ] },
    "upgrade": { "stats": { "power": 2, "health": 6 }, "text": "Deploy: add a Hairball to your hand." },
    "art": { "sprite": "cat_fluffy", "palette": "grey", "accessory": "faintly damp chin" },
    "tags": ["hairball"], "unlock": "start" },

  { "id": "mischief_sock_thief", "name": "Sock Thief", "type": "unit", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor",
    "stats": { "power": 2, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Whenever this attacks a Yarned pest, deal 2 extra damage.",
    "flavor": "Collects one sock from every pair. The system is sound.",
    "effects": { "onAttack": [ { "type": "damage", "amount": 2, "kind": "hit", "target": "attackTarget", "if": [ { "check": "attackTargetYarned", "op": "==", "value": true } ] } ] },
    "upgrade": { "effects": { "onAttack": [ { "type": "damage", "amount": 4, "kind": "hit", "target": "attackTarget", "if": [ { "check": "attackTargetYarned", "op": "==", "value": true } ] } ] }, "text": "Whenever this attacks a Yarned pest, deal 4 extra damage." },
    "art": { "sprite": "cat_scrappy", "palette": "yarn_red", "accessory": "a single striped sock in the mouth" },
    "tags": ["yarn"], "unlock": "start" },

  { "id": "mischief_table_surfer", "name": "Table Surfer", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 2, "health": 6, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Once per turn, when you Knock a pest, draw 1 card.",
    "flavor": "Walks the edge of everything. Falls off nothing. Pushes the rest.",
    "effects": { "onAnyKnock": [ { "type": "draw", "amount": 1, "limit": { "per": "turn", "n": 1 } } ] },
    "upgrade": { "stats": { "power": 3, "health": 7 }, "text": "Once per turn, when you Knock a pest, draw 1 card." },
    "art": { "sprite": "cat_tabby", "palette": "teal", "accessory": "sunglasses, balanced on a coffee table" },
    "tags": ["knock", "draw", "cascade"], "unlock": "start" },

  { "id": "mischief_furniture_mover", "name": "Furniture Mover", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 3, "targeting": "floor",
    "stats": { "power": 4, "health": 10, "lives": 5, "size": 2 }, "keywords": {},
    "text": "Large. Deploy: Knock 1 every pest on this floor.",
    "flavor": "Rearranges the room. Nobody asked, and nobody could stop it.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "allEnemiesOnFloor" } ] },
    "upgrade": { "stats": { "power": 5, "health": 12 }, "text": "Large. Deploy: Knock 1 every pest on this floor." },
    "art": { "sprite": "cat_large_maine", "palette": "teal", "accessory": "a bookcase pushed on one shoulder" },
    "tags": ["knock", "large"], "unlock": "start" },

  { "id": "mischief_too_small_for_this", "name": "Too Small For This", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "floor",
    "stats": { "power": 2, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "+3 Power while in a Box. After it attacks from a Box, return it to your hand.",
    "flavor": "It does not fit. It is going to make that your problem.",
    "aura": [ { "stat": "power", "amount": 3, "target": "self", "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ],
    "effects": { "onAfterAttack": [ { "type": "bounce", "target": "self", "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ] },
    "upgrade": { "aura": [ { "stat": "power", "amount": 5, "target": "self", "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ], "text": "+5 Power while in a Box. After it attacks from a Box, return it to your hand." },
    "art": { "sprite": "cat_loaf", "palette": "cardboard", "accessory": "overflowing a shoebox on all sides" },
    "tags": ["box"], "unlock": "start" },

  { "id": "mischief_spool_hoarder", "name": "Spool Hoarder", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 2, "health": 6, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Whenever this attacks, deal 1 extra damage per Yarn on its target.",
    "flavor": "Has a strategy. The strategy is spools.",
    "effects": { "onAttack": [ { "type": "damage", "amount": { "base": 0, "per": "yarnOnAttackTarget", "mult": 1 }, "kind": "hit", "target": "attackTarget" } ] },
    "upgrade": { "effects": { "onAttack": [ { "type": "damage", "amount": { "base": 0, "per": "yarnOnAttackTarget", "mult": 2 }, "kind": "hit", "target": "attackTarget" } ] }, "text": "Whenever this attacks, deal 2 extra damage per Yarn on its target." },
    "art": { "sprite": "cat_yarn", "palette": "yarn_red", "accessory": "a tower of thread spools on its back" },
    "tags": ["yarn"], "unlock": "start" },

  { "id": "mischief_wired_siamese", "name": "Wired Siamese", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 3, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "When Surge starts, gain Frenzy 1.",
    "flavor": "Speaks only in capitals. Has never been quiet. Is not starting now.",
    "effects": { "onSurgeStart": [ { "type": "applyStatus", "status": "frenzy", "amount": 1, "target": "self" } ] },
    "upgrade": { "stats": { "power": 4, "health": 5 }, "text": "When Surge starts, gain Frenzy 1." },
    "art": { "sprite": "cat_sleek", "palette": "magenta", "accessory": "static-lifted fur, tiny lightning bolts" },
    "tags": ["nip", "surge"], "unlock": "start" },

  { "id": "mischief_crash_test_tom", "name": "Crash Test Tom", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 2, "health": 7, "lives": 4, "size": 1 }, "keywords": {},
    "text": "When Crash starts, gain 6 Fluff and heal 3.",
    "flavor": "Has hit the floor before. Keeps notes.",
    "effects": { "onCrashStart": [ { "type": "fluff", "amount": 6, "target": "self" }, { "type": "heal", "amount": 3, "target": "self" } ] },
    "upgrade": { "effects": { "onCrashStart": [ { "type": "fluff", "amount": 9, "target": "self" }, { "type": "heal", "amount": 5, "target": "self" } ] }, "text": "When Crash starts, gain 9 Fluff and heal 5." },
    "art": { "sprite": "cat_tabby", "palette": "magenta", "accessory": "crash helmet and a clipboard" },
    "tags": ["nip", "crash"], "unlock": "start" },

  { "id": "mischief_hairball_appreciator", "name": "Hairball Appreciator", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 1, "health": 5, "lives": 4, "size": 1 }, "keywords": {},
    "text": "+1 Power for each Hairball in your hand.",
    "flavor": "Collects them. Names them. The naming is the worrying part.",
    "aura": [ { "stat": "power", "amount": { "base": 0, "per": "hairballsInHand", "mult": 1 }, "target": "self" } ],
    "upgrade": { "aura": [ { "stat": "power", "amount": { "base": 0, "per": "hairballsInHand", "mult": 2 }, "target": "self" } ], "text": "+2 Power for each Hairball in your hand." },
    "art": { "sprite": "cat_fluffy", "palette": "grey", "accessory": "monocle, held over a small grey tumbleweed" },
    "tags": ["hairball"], "unlock": "start" },

  { "id": "mischief_gag_reflex", "name": "Gag Reflex", "type": "unit", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor",
    "stats": { "power": 2, "health": 5, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Whenever a Hairball is added to your cards, deal 2 Shatter to a random pest.",
    "flavor": "A reflex. Like a sneeze, with a longer audience.",
    "effects": { "onHairballCreated": [ { "type": "damage", "amount": 2, "kind": "shatter", "target": "randomEnemy" } ] },
    "upgrade": { "effects": { "onHairballCreated": [ { "type": "damage", "amount": 3, "kind": "shatter", "target": "randomEnemy" } ] }, "text": "Whenever a Hairball is added to your cards, deal 3 Shatter to a random pest." },
    "art": { "sprite": "cat_fluffy", "palette": "grey", "accessory": "swallowing visibly, mid-heave" },
    "tags": ["hairball", "engine"], "unlock": "start" },

  { "id": "mischief_pop_up_pounce", "name": "Pop-Up Pounce", "type": "unit", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "floor",
    "stats": { "power": 3, "health": 4, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Leaves its Box when it attacks. On leaving a Box: 8 damage to the front pest here.",
    "flavor": "Appears from nowhere. Looks as surprised as you do.",
    "effects": {
      "onAttack": [ { "type": "unbox", "target": "self", "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ],
      "onUnbox": [ { "type": "damage", "amount": 8, "kind": "hit", "target": "frontEnemy", "limit": { "per": "turn", "n": 1 } } ] },
    "upgrade": { "effects": {
      "onAttack": [ { "type": "unbox", "target": "self", "if": [ { "check": "selfInBox", "op": "==", "value": true } ] } ],
      "onUnbox": [ { "type": "damage", "amount": 12, "kind": "hit", "target": "frontEnemy", "limit": { "per": "turn", "n": 1 } } ] },
      "text": "Leaves its Box when it attacks. On leaving a Box: 12 damage to the front pest here." },
    "art": { "sprite": "cat_loaf", "palette": "cardboard", "accessory": "springing out of a box, startled face" },
    "tags": ["box", "unbox"], "unlock": "start" },

  { "id": "mischief_gravity_tabby", "name": "Gravity Tabby", "type": "unit", "clan": "mischief", "rarity": "rare", "cost": 3, "targeting": "floor",
    "stats": { "power": 3, "health": 7, "lives": 4, "size": 1 }, "keywords": {},
    "text": "Pests Knocked onto this floor take 3 extra Shatter. This cat gains +1 Power for the fight each time.",
    "flavor": "Waits at the bottom of every fall, with a clipboard.",
    "effects": { "onKnockLand": [ { "type": "damage", "amount": 3, "kind": "shatter", "target": "triggerSource", "if": [ { "check": "triggerOnThisFloor", "op": "==", "value": true } ] }, { "type": "buff", "stat": "power", "amount": 1, "duration": "fight", "target": "self", "if": [ { "check": "triggerOnThisFloor", "op": "==", "value": true } ] } ] },
    "upgrade": { "stats": { "health": 10 }, "effects": { "onKnockLand": [ { "type": "damage", "amount": 5, "kind": "shatter", "target": "triggerSource", "if": [ { "check": "triggerOnThisFloor", "op": "==", "value": true } ] }, { "type": "buff", "stat": "power", "amount": 1, "duration": "fight", "target": "self", "if": [ { "check": "triggerOnThisFloor", "op": "==", "value": true } ] } ] }, "text": "Pests Knocked onto this floor take 5 extra Shatter. This cat gains +1 Power for the fight each time." },
    "art": { "sprite": "cat_tabby", "palette": "teal", "accessory": "looking up, arms crossed, hard hat" },
    "tags": ["knock", "shatter", "cascade"], "unlock": "start" },

  { "id": "mischief_comedown_colossus", "name": "Comedown Colossus", "type": "unit", "clan": "mischief", "rarity": "rare", "cost": 4, "targeting": "floor",
    "stats": { "power": 5, "health": 12, "lives": 5, "size": 2 }, "keywords": {},
    "text": "Large. Deploy: gain 2 Nip. When Crash starts, gain Rested 3.",
    "flavor": "Every high ends. This one ends horizontally, with a lot of weight.",
    "effects": { "onPlay": [ { "type": "catnip", "amount": 2 } ], "onCrashStart": [ { "type": "applyStatus", "status": "rested", "amount": 3, "target": "self" } ] },
    "upgrade": { "stats": { "power": 6, "health": 15 }, "effects": { "onPlay": [ { "type": "catnip", "amount": 3 } ], "onCrashStart": [ { "type": "applyStatus", "status": "rested", "amount": 3, "target": "self" } ] }, "text": "Large. Deploy: gain 3 Nip. When Crash starts, gain Rested 3." },
    "art": { "sprite": "cat_large_maine", "palette": "magenta", "accessory": "huge, glazed, sliding gently off the couch" },
    "tags": ["nip", "crash", "nap", "large"], "unlock": "start" },

  /* ================================== SPELLS (14) ================================== */

  { "id": "mischief_paw_on_the_vase", "name": "Paw on the Vase", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "enemy", "keywords": {},
    "text": "Knock 1. Deal 2 Shatter.",
    "flavor": "Looked at the vase. Looked at you. Looked at the vase.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" }, { "type": "damage", "amount": 2, "kind": "shatter", "target": "chosenEnemy" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" }, { "type": "damage", "amount": 5, "kind": "shatter", "target": "chosenEnemy" } ] }, "text": "Knock 1. Deal 5 Shatter." },
    "tags": ["knock", "shatter"], "unlock": "start" },

  { "id": "mischief_just_a_nudge", "name": "Just a Nudge", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 0, "targeting": "enemy", "keywords": { "exhaust": true },
    "text": "Knock 1. Exhaust.",
    "flavor": "Barely touched it. It was already leaving.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" }, { "type": "draw", "amount": 1 } ] }, "text": "Knock 1. Draw 1. Exhaust." },
    "tags": ["knock", "cascade"], "unlock": "start" },

  { "id": "mischief_tip_the_glass", "name": "Tip the Glass", "type": "spell", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "enemy", "keywords": {},
    "text": "Knock 1. Deal 3 Shatter to every pest on the landing floor.",
    "flavor": "Not an accident. Never an accident.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" }, { "type": "damage", "amount": 3, "kind": "shatter", "target": "allEnemiesOnFloor", "floorOf": "chosenEnemy" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "chosenEnemy" }, { "type": "damage", "amount": 5, "kind": "shatter", "target": "allEnemiesOnFloor", "floorOf": "chosenEnemy" } ] }, "text": "Knock 1. Deal 5 Shatter to every pest on the landing floor." },
    "tags": ["knock", "shatter"], "unlock": "start" },

  { "id": "mischief_domino_shelf", "name": "Domino Shelf", "type": "spell", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Knock 1 every pest on a floor.",
    "flavor": "Everything on it was already leaning.",
    "effects": { "onPlay": [ { "type": "knock", "amount": 1, "target": "allEnemiesOnFloor" } ] },
    "upgrade": { "cost": 1, "text": "Knock 1 every pest on a floor." },
    "tags": ["knock", "cascade"], "unlock": "start" },

  { "id": "mischief_loose_thread", "name": "Loose Thread", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "enemy", "keywords": {},
    "text": "Yarn 2 a pest.",
    "flavor": "One thread. Several hours of regret.",
    "effects": { "onPlay": [ { "type": "applyStatus", "status": "yarn", "amount": 2, "target": "chosenEnemy" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "applyStatus", "status": "yarn", "amount": 3, "target": "chosenEnemy" } ] }, "text": "Yarn 3 a pest." },
    "tags": ["yarn"], "unlock": "start" },

  { "id": "mischief_cats_cradle", "name": "Cat's Cradle", "type": "spell", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "none", "keywords": {},
    "text": "Draw 1. This turn, spells that target a Yarned pest cost 1 less.",
    "flavor": "Seven moves. Nobody has ever seen the eighth.",
    "effects": { "onPlay": [ { "type": "draw", "amount": 1 }, { "type": "yarnDiscount", "amount": 1 } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "draw", "amount": 2 }, { "type": "yarnDiscount", "amount": 1 } ] }, "text": "Draw 2. This turn, spells that target a Yarned pest cost 1 less." },
    "tags": ["yarn", "draw"], "unlock": "start" },

  { "id": "mischief_unravel", "name": "Unravel", "type": "spell", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "enemy", "keywords": {},
    "text": "Deal damage equal to all Yarn on the board to a pest. Then Yarn 1 every pest.",
    "flavor": "One pull. The whole house comes with it.",
    "effects": { "onPlay": [ { "type": "damage", "amount": { "base": 0, "per": "yarnOnBoard", "mult": 1 }, "kind": "hit", "target": "chosenEnemy" }, { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "allEnemies" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "damage", "amount": { "base": 0, "per": "yarnOnBoard", "mult": 2 }, "kind": "hit", "target": "chosenEnemy" }, { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "allEnemies" } ] }, "text": "Deal double the Yarn on the board as damage to a pest. Then Yarn 1 every pest." },
    "tags": ["yarn", "engine"], "unlock": "start" },

  { "id": "mischief_a_sniff", "name": "A Sniff", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 0, "targeting": "none", "keywords": { "exhaust": true },
    "text": "Gain 3 Nip. Exhaust.",
    "flavor": "Just a little. The cat has defined 'little' on its own terms.",
    "effects": { "onPlay": [ { "type": "catnip", "amount": 3 } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "catnip", "amount": 4 } ] }, "text": "Gain 4 Nip. Exhaust." },
    "tags": ["nip"], "unlock": "start" },

  { "id": "mischief_fresh_sprig", "name": "Fresh Sprig", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "none", "keywords": {},
    "text": "Gain 4 Nip. Draw 1.",
    "flavor": "Grown in a pot nobody was allowed to touch. Nobody touched it.",
    "effects": { "onPlay": [ { "type": "catnip", "amount": 4 }, { "type": "draw", "amount": 1 } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "catnip", "amount": 5 }, { "type": "draw", "amount": 1 } ] }, "text": "Gain 5 Nip. Draw 1." },
    "tags": ["nip", "draw"], "unlock": "start" },

  { "id": "mischief_whole_jar", "name": "The Whole Jar", "type": "spell", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "none", "keywords": { "exhaust": true },
    "text": "Surge now. Exhaust.",
    "flavor": "Technically a decision. Technically yours.",
    "effects": { "onPlay": [ { "type": "surge" } ] },
    "upgrade": { "cost": 1, "text": "Surge now. Exhaust." },
    "tags": ["nip", "surge"], "unlock": "start" },

  { "id": "mischief_detox_tea", "name": "Detox Tea", "type": "spell", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "none", "keywords": {},
    "text": "Draw 1. If Crashing, end Crash and every cat takes 2 damage.",
    "flavor": "Tastes like regret and chamomile.",
    "effects": { "onPlay": [ { "type": "draw", "amount": 1 }, { "type": "damage", "amount": 2, "kind": "hit", "target": "allCats", "if": [ { "check": "crashing", "op": "==", "value": true } ] }, { "type": "endCrash", "if": [ { "check": "crashing", "op": "==", "value": true } ] } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "draw", "amount": 2 }, { "type": "damage", "amount": 1, "kind": "hit", "target": "allCats", "if": [ { "check": "crashing", "op": "==", "value": true } ] }, { "type": "endCrash", "if": [ { "check": "crashing", "op": "==", "value": true } ] } ] }, "text": "Draw 2. If Crashing, end Crash and every cat takes 1 damage." },
    "tags": ["nip", "crash"], "unlock": "start" },

  { "id": "mischief_soft_landing", "name": "Soft Landing", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "none", "keywords": {},
    "text": "Every cat gains 4 Fluff. If Crashing, draw 2.",
    "flavor": "Cushions placed in advance. The cats pretend it was luck.",
    "effects": { "onPlay": [ { "type": "fluff", "amount": 4, "target": "allCats" }, { "type": "draw", "amount": 2, "if": [ { "check": "crashing", "op": "==", "value": true } ] } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "fluff", "amount": 6, "target": "allCats" }, { "type": "draw", "amount": 2, "if": [ { "check": "crashing", "op": "==", "value": true } ] } ] }, "text": "Every cat gains 6 Fluff. If Crashing, draw 2." },
    "tags": ["nip", "crash", "fluff"], "unlock": "start" },

  { "id": "mischief_cough_it_up", "name": "Cough It Up", "type": "spell", "clan": "mischief", "rarity": "common", "cost": 0, "targeting": "none", "keywords": { "exhaust": true },
    "text": "Add 2 Hairballs to your hand. Exhaust.",
    "flavor": "Not an accident. A statement, and a damp one.",
    "effects": { "onPlay": [ { "type": "createCard", "card": "hairball", "amount": 2, "to": "hand" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "createCard", "card": "hairball", "amount": 3, "to": "hand" } ] }, "text": "Add 3 Hairballs to your hand. Exhaust." },
    "tags": ["hairball"], "unlock": "start" },

  { "id": "mischief_spit_take", "name": "Spit Take", "type": "spell", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "none", "keywords": {},
    "text": "Deal 3 damage to a random pest for each Hairball in your hand. Exhaust them.",
    "flavor": "Projectile. Wet. Aimed, mostly.",
    "effects": { "onPlay": [ { "type": "damage", "amount": 3, "kind": "hit", "target": "randomEnemy", "times": { "base": 0, "per": "hairballsInHand", "mult": 1 } }, { "type": "exhaustCard", "amount": 6, "mode": "all", "from": "hand", "card": "hairball" } ] },
    "upgrade": { "effects": { "onPlay": [ { "type": "damage", "amount": 4, "kind": "hit", "target": "randomEnemy", "times": { "base": 0, "per": "hairballsInHand", "mult": 1 } }, { "type": "exhaustCard", "amount": 6, "mode": "all", "from": "hand", "card": "hairball" } ] }, "text": "Deal 4 damage to a random pest for each Hairball in your hand. Exhaust them." },
    "tags": ["hairball", "engine"], "unlock": "start" },

  /* =========================== TOYS, BOXES AND ROOMS (8) =========================== */

  { "id": "mischief_wobbly_vase", "name": "Wobbly Vase", "type": "toy", "clan": "mischief", "rarity": "common", "cost": 1, "targeting": "floor", "keywords": { "fragile": true },
    "text": "Fragile. When knocked off: 3 Shatter and Knock 1 to the front pest on the floor below.",
    "flavor": "Aunt Marge's vase. Priceless until about now.",
    "effects": { "onKnockedOff": [ { "type": "damage", "amount": 3, "kind": "shatter", "target": "frontEnemyBelow" }, { "type": "knock", "amount": 1, "target": "frontEnemyBelow" } ] },
    "upgrade": { "effects": { "onKnockedOff": [ { "type": "damage", "amount": 6, "kind": "shatter", "target": "frontEnemyBelow" }, { "type": "knock", "amount": 1, "target": "frontEnemyBelow" } ] }, "text": "Fragile. When knocked off: 6 Shatter and Knock 1 to the front pest on the floor below." },
    "art": { "sprite": "toy_vase", "palette": "teal", "accessory": "cracked blue vase on a shelf edge" },
    "tags": ["fragile", "shelf", "knock", "cascade"], "unlock": "start" },

  { "id": "mischief_tape_square", "name": "Tape Square", "type": "toy", "clan": "mischief", "rarity": "common", "cost": 0, "targeting": "floor", "keywords": { "exhaust": true },
    "text": "Place a Tape Square. It holds any cat, even a Large one. No Hidden. Exhaust.",
    "flavor": "A square of tape on the floor. The cat has decided.",
    "effects": { "onPlay": [ { "type": "box", "kind": "tape", "target": "chosenFloor" } ] },
    "upgrade": { "text": "Place a Tape Square. It holds any cat, even a Large one. No Hidden.", "cost": 0, "keywords": { "exhaust": false }, "effects": { "onPlay": [ { "type": "box", "kind": "tape", "target": "chosenFloor" } ] } },
    "art": { "sprite": "toy_tape", "palette": "cardboard", "accessory": "a square of blue painter tape" },
    "tags": ["box"], "unlock": "start" },

  { "id": "mischief_laundry_basket", "name": "Laundry Basket", "type": "toy", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Place a Basket: holds 2 cats (+1 Power each, counted as adjacent). Durability 4.",
    "flavor": "Still warm. That is the whole point.",
    "effects": { "onPlay": [ { "type": "box", "kind": "laundry", "target": "chosenFloor" } ] },
    "upgrade": { "cost": 1, "text": "Place a Basket: holds 2 cats (+1 Power each, counted as adjacent). Durability 4." },
    "art": { "sprite": "toy_basket", "palette": "cream", "accessory": "wicker basket of warm towels" },
    "tags": ["box"], "unlock": "start" },

  { "id": "mischief_yarn_basket", "name": "Yarn Basket", "type": "toy", "clan": "mischief", "rarity": "uncommon", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Start of turn: Yarn 1 the front pest here. Pests Knocked onto this floor get Yarn 1.",
    "flavor": "Everything in here is somehow tied to everything else.",
    "effects": { "onTurnStart": [ { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "frontEnemy" } ], "onKnockLand": [ { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "triggerSource" } ] },
    "upgrade": { "effects": { "onTurnStart": [ { "type": "applyStatus", "status": "yarn", "amount": 1, "target": "frontEnemy" } ], "onKnockLand": [ { "type": "applyStatus", "status": "yarn", "amount": 2, "target": "triggerSource" } ] }, "text": "Start of turn: Yarn 1 the front pest here. Pests Knocked onto this floor get Yarn 2." },
    "art": { "sprite": "toy_yarn", "palette": "yarn_red", "accessory": "overflowing basket of red and teal yarn" },
    "tags": ["yarn", "knock"], "unlock": "start" },

  { "id": "mischief_nip_planter", "name": "Nip Planter", "type": "toy", "clan": "mischief", "rarity": "uncommon", "cost": 1, "targeting": "floor", "keywords": {},
    "text": "Start of your turn: gain 1 Nip.",
    "flavor": "Technically a flowerpot. Technically a problem.",
    "effects": { "onTurnStart": [ { "type": "catnip", "amount": 1 } ] },
    "upgrade": { "effects": { "onTurnStart": [ { "type": "catnip", "amount": 2 } ] }, "text": "Start of your turn: gain 2 Nip." },
    "art": { "sprite": "toy_pot", "palette": "green", "accessory": "terracotta pot, leaves chewed to the stem" },
    "tags": ["nip", "surge"], "unlock": "start" },

  { "id": "mischief_tall_shelf", "name": "Tall Shelf", "type": "toy", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Once per turn, when you Knock a pest, add a Wobbly Vase to your hand.",
    "flavor": "Eleven ornaments. Zero will survive the week.",
    "effects": { "onAnyKnock": [ { "type": "createCard", "card": "mischief_wobbly_vase", "amount": 1, "to": "hand", "limit": { "per": "turn", "n": 1 } } ] },
    "upgrade": { "cost": 1, "text": "Once per turn, when you Knock a pest, add a Wobbly Vase to your hand." },
    "art": { "sprite": "toy_shelf", "palette": "teal", "accessory": "wall shelf crowded with ornaments, paw marks" },
    "tags": ["knock", "shelf", "cascade", "engine"], "unlock": "start" },

  { "id": "mischief_cardboard_annex", "name": "Cardboard Annex", "type": "toy", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Start of your turn: place a free Box on each floor that has none.",
    "flavor": "It was a perfectly good living room before the delivery.",
    "effects": { "onTurnStart": [ { "type": "boxIfNone", "kind": "cardboard" } ] },
    "upgrade": { "cost": 1, "text": "Start of your turn: place a free Box on each floor that has none." },
    "art": { "sprite": "toy_annex", "palette": "cardboard", "accessory": "stack of flat boxes with a tiny doorbell" },
    "tags": ["box", "engine"], "unlock": "start" },

  { "id": "mischief_fur_factory", "name": "Fur Factory", "type": "toy", "clan": "mischief", "rarity": "rare", "cost": 2, "targeting": "floor", "keywords": {},
    "text": "Start of turn: add a Hairball to your hand. End of turn: 1 Shatter to a random pest per Hairball in hand.",
    "flavor": "Production never stops. Neither does the coughing.",
    "effects": { "onTurnStart": [ { "type": "createCard", "card": "hairball", "amount": 1, "to": "hand" } ], "onTurnEnd": [ { "type": "damage", "amount": 1, "kind": "shatter", "target": "randomEnemy", "times": { "base": 0, "per": "hairballsInHand", "mult": 1 } } ] },
    "upgrade": { "effects": { "onTurnStart": [ { "type": "createCard", "card": "hairball", "amount": 1, "to": "hand" } ], "onTurnEnd": [ { "type": "damage", "amount": 2, "kind": "shatter", "target": "randomEnemy", "times": { "base": 0, "per": "hairballsInHand", "mult": 1 } } ] }, "text": "Start of turn: add a Hairball to your hand. End of turn: 2 Shatter to a random pest per Hairball in hand." },
    "art": { "sprite": "toy_factory", "palette": "grey", "accessory": "tiny brick works with a grey smokestack" },
    "tags": ["hairball", "engine"], "unlock": "start" }
];
