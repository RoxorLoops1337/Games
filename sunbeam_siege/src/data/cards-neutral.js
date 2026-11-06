/*
 * B07: Neutral and utility cards for SUNBEAM SIEGE.
 * Contents (48 cards):
 *   5 basics (neutral_swat, neutral_catnap, neutral_cardboard_box, 2 clan-agnostic cats)
 *   30 neutral cards: 12 common, 11 uncommon, 7 rare (15 units, 11 spells, 4 toys)
 *   9 curses and junk (curse_ prefix)
 *   10 tokens (token_ prefix)
 *
 * ID NOTE: A03 examples used bare ids (swat, catnap, cardboard_box, hairball).
 * RULES section 9 requires prefixes, so the canonical ids are neutral_swat,
 * neutral_catnap, neutral_cardboard_box and curse_hairball. Other agents that wrote
 * createCard "hairball" should be aliased to curse_hairball by the loader.
 *
 * Clan ids follow RULES section 2 (alley, hearth, moon, mischief, neutral, curse).
 * Status ids follow A04 (yarn replaces A03 "tangled").
 *
 * NEEDS (for the engine agent):
 *  1. Effect type "removeCard": { type, from:"hand", filter:"curse", amount }.
 *     Removes the card from the deck for the run (fight-only cards just vanish).
 *     Used by neutral_spring_cleaning.
 *  2. Effect type "cleanse": { type, target }. Removes all debuffs from a cat (A04 Cleanse).
 *     Used by neutral_lick_fur.
 *  3. Optional card fields on curses: "removal" (display text object with fight and run)
 *     and "cure" (array of machine ids: play, spring_cleaning, vet_event, shop_desk).
 *     Loader must tolerate unknown informational fields on type "curse".
 *  4. Tag "large" on size 2 cats (Boxes reject them), tag "kitten" on Lives 2 cats.
 *  5. Alias map: hairball -> curse_hairball, swat -> neutral_swat, catnap -> neutral_catnap,
 *     cardboard_box -> neutral_cardboard_box.
 *  6. Box items need durability (A05 says 3 for Cardboard Box). Not stored on the card here,
 *     the "box" effect should default to the Cardboard Box values.
 */
window.SB = window.SB || {};
SB.data = SB.data || {};

SB.data.cardsNeutral = [

  /* ===================== 1. BASICS (never drop as rewards) ===================== */

  { id: "neutral_swat", name: "Swat", type: "spell", clan: "neutral", rarity: "basic", cost: 1,
    targeting: "enemy", keywords: {}, tags: ["attack", "starter"],
    text: "Deal 4 damage.",
    flavor: "A lesson, delivered at speed.",
    effects: { onPlay: [ { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy" } ] },
    upgrade: { effects: { onPlay: [ { type: "damage", amount: 6, kind: "hit", target: "chosenEnemy" } ] }, text: "Deal 6 damage." },
    art: { sprite: "spell_paw", palette: "orange", desc: "A grey paw mid-swipe, motion lines" },
    unlock: "start" },

  { id: "neutral_catnap", name: "Catnap", type: "spell", clan: "neutral", rarity: "basic", cost: 1,
    targeting: "cat", keywords: {}, tags: ["nap", "heal", "starter"],
    text: "A Cat Naps, heals 3 and gains Rested 1 extra.",
    flavor: "Productivity is a human invention.",
    effects: { onPlay: [
      { type: "nap", target: "chosenCat" },
      { type: "heal", amount: 3, target: "chosenCat" },
      { type: "applyStatus", status: "rested", amount: 1, target: "chosenCat" } ] },
    upgrade: { effects: { onPlay: [
      { type: "nap", target: "chosenCat" },
      { type: "heal", amount: 6, target: "chosenCat" },
      { type: "applyStatus", status: "rested", amount: 1, target: "chosenCat" } ] }, text: "A Cat Naps, heals 6 and gains Rested 1 extra." },
    art: { sprite: "spell_zzz", palette: "cream", desc: "A curled cat silhouette with floating Z letters" },
    unlock: "start" },

  { id: "neutral_cardboard_box", name: "Cardboard Box", type: "toy", clan: "neutral", rarity: "basic", cost: 1,
    targeting: "floor", keywords: {}, tags: ["box", "starter"],
    text: "Place a Box on a floor. A Box holds 1 Cat.",
    flavor: "Much better than the expensive bed.",
    effects: { onPlay: [ { type: "box", target: "chosenFloor" } ] },
    upgrade: { cost: 0, text: "Place a Box on a floor. A Box holds 1 Cat." },
    art: { sprite: "toy_box", palette: "brown", desc: "Open cardboard box, flaps up, tape stripe" },
    unlock: "start" },

  { id: "neutral_house_cat", name: "House Cat", type: "unit", clan: "neutral", rarity: "basic", cost: 1,
    targeting: "floor", stats: { power: 2, health: 5, lives: 3, size: 1 }, keywords: {}, tags: ["starter"],
    text: "No tricks. Just a cat.",
    flavor: "Fully qualified. Zero certificates.",
    upgrade: { stats: { power: 3, health: 6 }, text: "No tricks. Just a cat." },
    art: { sprite: "cat_plain", palette: "grey", desc: "Plain grey shorthair sitting upright, small red collar" },
    unlock: "start" },

  { id: "neutral_window_watcher", name: "Window Watcher", type: "unit", clan: "neutral", rarity: "basic", cost: 1,
    targeting: "floor", stats: { power: 1, health: 5, lives: 3, size: 1 }, keywords: {}, tags: ["starter", "fluff"],
    text: "Deploy: gain Fluff 2.",
    flavor: "Reports on birds. Never files the report.",
    effects: { onPlay: [ { type: "fluff", amount: 2, target: "self" } ] },
    upgrade: { stats: { health: 6 }, effects: { onPlay: [ { type: "fluff", amount: 4, target: "self" } ] }, text: "Deploy: gain Fluff 4." },
    art: { sprite: "cat_sit_side", palette: "cream", desc: "Cream cat in profile, nose on a windowsill" },
    unlock: "start" },

  /* ===================== 2. NEUTRAL COMMONS (12) ===================== */

  { id: "neutral_knickknack_kitten", name: "Knick-Knack Kitten", type: "unit", clan: "neutral", rarity: "common", cost: 1,
    targeting: "floor", stats: { power: 2, health: 3, lives: 2, size: 1 }, keywords: {}, tags: ["kitten", "knock"],
    text: "Deploy: Knock 1 the front enemy on this floor.",
    flavor: "Moves it a little further every time. For science.",
    effects: { onPlay: [ { type: "knock", amount: 1, target: "frontEnemy" } ] },
    upgrade: { stats: { power: 3, health: 4 }, text: "Deploy: Knock 1 the front enemy on this floor." },
    art: { sprite: "kitten_paw_out", palette: "orange", desc: "Orange kitten with one paw hovering over a mug" },
    unlock: "start" },

  { id: "neutral_cushion_cat", name: "Cushion Cat", type: "unit", clan: "neutral", rarity: "common", cost: 2,
    targeting: "floor", stats: { power: 1, health: 8, lives: 3, size: 1 }, keywords: { purr: 1 }, tags: ["purr"],
    text: "Purr 1.",
    flavor: "Technically furniture. Legally a cat.",
    upgrade: { keywords: { purr: 2 }, text: "Purr 2." },
    art: { sprite: "cat_loaf", palette: "cream", desc: "Square cream cat shaped exactly like a sofa cushion" },
    unlock: "start" },

  { id: "neutral_pantry_raider", name: "Pantry Raider", type: "unit", clan: "neutral", rarity: "common", cost: 1,
    targeting: "floor", stats: { power: 2, health: 3, lives: 3, size: 1 }, keywords: {}, tags: ["death", "draw"],
    text: "Death: draw 1 card.",
    flavor: "Went in for one crumb. Left a legacy.",
    effects: { onDeath: [ { type: "draw", amount: 1, target: "player" } ] },
    upgrade: { stats: { health: 5 }, text: "Death: draw 1 card." },
    art: { sprite: "cat_sneak", palette: "brown", desc: "Brown cat with a cracker box on its head" },
    unlock: "start" },

  { id: "neutral_sun_chaser", name: "Sun Chaser", type: "unit", clan: "neutral", rarity: "common", cost: 2,
    targeting: "floor", stats: { power: 2, health: 7, lives: 3, size: 1 }, keywords: {}, tags: ["warmth"],
    text: "Deploy: restore 2 Warmth.",
    flavor: "Follows the light. Refuses to explain.",
    effects: { onPlay: [ { type: "warmth", amount: 2, target: "player" } ] },
    upgrade: { effects: { onPlay: [ { type: "warmth", amount: 4, target: "player" } ] }, text: "Deploy: restore 4 Warmth." },
    art: { sprite: "cat_stretch", palette: "gold", desc: "Ginger cat stretched across a yellow light patch" },
    unlock: "start" },

  { id: "neutral_delivery_cat", name: "Delivery Cat", type: "unit", clan: "neutral", rarity: "common", cost: 2,
    targeting: "floor", stats: { power: 2, health: 5, lives: 3, size: 1 }, keywords: {}, tags: ["box", "generate"],
    text: "Deploy: add a Flat Pack to your hand.",
    flavor: "Signed for it. Sat in it. Left.",
    effects: { onPlay: [ { type: "createCard", card: "token_flat_pack", amount: 1, to: "hand" } ] },
    upgrade: { cost: 1, text: "Deploy: add a Flat Pack to your hand." },
    art: { sprite: "cat_courier", palette: "brown", desc: "Cat in a tiny delivery cap carrying a flat parcel" },
    unlock: "start" },

  { id: "neutral_tangle_kitten", name: "Tangle Kitten", type: "unit", clan: "neutral", rarity: "common", cost: 1,
    targeting: "floor", stats: { power: 1, health: 4, lives: 2, size: 1 }, keywords: {}, tags: ["kitten", "yarn"],
    text: "Deploy: Yarn 1 the front enemy on this floor.",
    flavor: "Did nothing wrong. Yarn everywhere.",
    effects: { onPlay: [ { type: "applyStatus", status: "yarn", amount: 1, target: "frontEnemy" } ] },
    upgrade: { effects: { onPlay: [ { type: "applyStatus", status: "yarn", amount: 2, target: "frontEnemy" } ] }, text: "Deploy: Yarn 2 the front enemy on this floor." },
    art: { sprite: "kitten_yarn", palette: "red", desc: "Tiny grey kitten wrapped in loops of red yarn" },
    unlock: "start" },

  { id: "neutral_warning_hiss", name: "Warning Hiss", type: "spell", clan: "neutral", rarity: "common", cost: 1,
    targeting: "enemy", keywords: {}, tags: ["hiss", "draw"],
    text: "Hiss 3 an enemy. Draw 1.",
    flavor: "Not a threat. A very clear prediction.",
    effects: { onPlay: [
      { type: "applyStatus", status: "hiss", amount: 3, target: "chosenEnemy" },
      { type: "draw", amount: 1, target: "player" } ] },
    upgrade: { effects: { onPlay: [
      { type: "applyStatus", status: "hiss", amount: 5, target: "chosenEnemy" },
      { type: "draw", amount: 1, target: "player" } ] }, text: "Hiss 5 an enemy. Draw 1." },
    art: { sprite: "spell_hiss", palette: "grey", desc: "Open cat mouth with fangs and a sound burst" },
    unlock: "start" },

  { id: "neutral_claw_polish", name: "Claw Polish", type: "spell", clan: "neutral", rarity: "common", cost: 1,
    targeting: "cat", keywords: {}, tags: ["claws"],
    text: "A Cat gains Claws 2.",
    flavor: "Maintenance, not violence. Mostly.",
    effects: { onPlay: [ { type: "applyStatus", status: "claws", amount: 2, target: "chosenCat" } ] },
    upgrade: { effects: { onPlay: [ { type: "applyStatus", status: "claws", amount: 3, target: "chosenCat" } ] }, text: "A Cat gains Claws 3." },
    art: { sprite: "spell_claws", palette: "orange", desc: "Four gleaming claws and a tiny nail file" },
    unlock: "start" },

  { id: "neutral_tuna_snack", name: "Tuna Snack", type: "spell", clan: "neutral", rarity: "common", cost: 1,
    targeting: "cat", keywords: {}, tags: ["heal", "fluff"],
    text: "Heal a Cat 5. It gains Fluff 2.",
    flavor: "Fish fixes everything. Fish is also evidence.",
    effects: { onPlay: [
      { type: "heal", amount: 5, target: "chosenCat" },
      { type: "fluff", amount: 2, target: "chosenCat" } ] },
    upgrade: { effects: { onPlay: [
      { type: "heal", amount: 8, target: "chosenCat" },
      { type: "fluff", amount: 3, target: "chosenCat" } ] }, text: "Heal a Cat 8. It gains Fluff 3." },
    art: { sprite: "spell_tin", palette: "teal", desc: "Open tuna tin with a fork-shaped fish bone" },
    unlock: "start" },

  { id: "neutral_shove", name: "Shove", type: "spell", clan: "neutral", rarity: "common", cost: 1,
    targeting: "enemy", keywords: {}, tags: ["knock"],
    text: "Knock 1. Deal 2 damage.",
    flavor: "Gently. Then not gently.",
    effects: { onPlay: [
      { type: "knock", amount: 1, target: "chosenEnemy" },
      { type: "damage", amount: 2, kind: "hit", target: "chosenEnemy" } ] },
    upgrade: { effects: { onPlay: [
      { type: "knock", amount: 1, target: "chosenEnemy" },
      { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy" } ] }, text: "Knock 1. Deal 4 damage." },
    art: { sprite: "spell_shove", palette: "teal", desc: "Two paws pushing a wobbling mug off a ledge" },
    unlock: "start" },

  { id: "neutral_welcome_mat", name: "Welcome Mat", type: "toy", clan: "neutral", rarity: "common", cost: 1,
    targeting: "floor", keywords: {}, tags: ["fluff", "deploy"],
    text: "Cats deployed here gain Fluff 2.",
    flavor: "It says welcome. It means mine.",
    effects: { onCatDeployed: [ { type: "fluff", amount: 2, target: "triggerSource" } ] },
    upgrade: { effects: { onCatDeployed: [ { type: "fluff", amount: 4, target: "triggerSource" } ] }, text: "Cats deployed here gain Fluff 4." },
    art: { sprite: "toy_mat", palette: "brown", desc: "Coir doormat with paw prints across the word WELCOME" },
    unlock: "start" },

  { id: "neutral_old_slipper", name: "Old Slipper", type: "toy", clan: "neutral", rarity: "common", cost: 1,
    targeting: "floor", keywords: {}, tags: ["hiss"],
    text: "Start of your turn: Hiss 1 the front enemy on this floor.",
    flavor: "Chewed, buried, dug up, chewed again.",
    effects: { onTurnStart: [ { type: "applyStatus", status: "hiss", amount: 1, target: "frontEnemy" } ] },
    upgrade: { effects: { onTurnStart: [ { type: "applyStatus", status: "hiss", amount: 2, target: "frontEnemy" } ] }, text: "Start of your turn: Hiss 2 the front enemy on this floor." },
    art: { sprite: "toy_slipper", palette: "brown", desc: "Fluffy slipper with teeth marks and one missing pompom" },
    unlock: "start" },

  /* ===================== NEUTRAL UNCOMMONS (11) ===================== */

  { id: "neutral_dozing_tom", name: "Dozing Tom", type: "unit", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "floor", stats: { power: 2, health: 6, lives: 3, size: 1 }, keywords: {}, tags: ["nap", "heal"],
    text: "Whenever this Naps, heal all Cats on this floor 2.",
    flavor: "Asleep on duty, which is the duty.",
    effects: { onNap: [ { type: "heal", amount: 2, target: "allCatsOnFloor" } ] },
    upgrade: { effects: { onNap: [ { type: "heal", amount: 4, target: "allCatsOnFloor" } ] }, text: "Whenever this Naps, heal all Cats on this floor 4." },
    art: { sprite: "cat_sleep", palette: "grey", desc: "Big grey tom snoring, one eye slightly open" },
    unlock: "start" },

  { id: "neutral_kind_stranger", name: "Kind Stranger", type: "unit", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "floor", stats: { power: 2, health: 5, lives: 3, size: 1 }, keywords: {}, tags: ["lives"],
    text: "Deploy: a random Cat gains 1 Life.",
    flavor: "Left a bowl out. Asked for nothing. Suspicious.",
    effects: { onPlay: [ { type: "lives", amount: 1, target: "randomCat" } ] },
    upgrade: { effects: { onPlay: [ { type: "lives", amount: 1, target: "randomCat", times: 2 } ] }, text: "Deploy: two random Cats each gain 1 Life." },
    art: { sprite: "cat_kind", palette: "cream", desc: "White cat holding a small bowl with both paws" },
    unlock: "start" },

  { id: "neutral_shelf_sitter", name: "Shelf Sitter", type: "unit", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "floor", stats: { power: 3, health: 4, lives: 3, size: 1 }, keywords: {}, tags: ["knock"],
    text: "End of your turn: Knock 1 the front enemy on this floor.",
    flavor: "Has not touched the vase. Is looking at the vase.",
    effects: { onTurnEnd: [ { type: "knock", amount: 1, target: "frontEnemy" } ] },
    upgrade: { stats: { power: 4, health: 5 }, text: "End of your turn: Knock 1 the front enemy on this floor." },
    art: { sprite: "cat_perch", palette: "black", desc: "Black cat on a shelf edge, one paw on a vase" },
    unlock: "start" },

  { id: "neutral_window_burglar", name: "Window Burglar", type: "unit", clan: "neutral", rarity: "uncommon", cost: 1,
    targeting: "floor", stats: { power: 1, health: 3, lives: 2, size: 1 }, keywords: {}, tags: ["kitten", "hidden", "draw"],
    text: "Deploy: gain Hidden 1. Draw 1.",
    flavor: "Wears a little mask. The mask is its face.",
    effects: { onPlay: [
      { type: "applyStatus", status: "hidden", amount: 1, target: "self" },
      { type: "draw", amount: 1, target: "player" } ] },
    upgrade: { stats: { power: 2, health: 4 }, text: "Deploy: gain Hidden 1. Draw 1." },
    art: { sprite: "kitten_mask", palette: "black", desc: "Black kitten with a raccoon-stripe mask and a tiny sack" },
    unlock: "start" },

  { id: "neutral_chonk", name: "Chonk", type: "unit", clan: "neutral", rarity: "uncommon", cost: 3,
    targeting: "floor", stats: { power: 4, health: 11, lives: 4, size: 2 }, keywords: {}, tags: ["large", "fluff"],
    text: "Large. Deploy: gain Fluff 3.",
    flavor: "Takes up two slots and has earned both.",
    effects: { onPlay: [ { type: "fluff", amount: 3, target: "self" } ] },
    upgrade: { stats: { power: 5, health: 14 }, effects: { onPlay: [ { type: "fluff", amount: 5, target: "self" } ] }, text: "Large. Deploy: gain Fluff 5." },
    art: { sprite: "cat_chonk", palette: "orange", desc: "Enormous round orange tabby, tiny ears, huge calm face" },
    unlock: "start" },

  { id: "neutral_night_nurse", name: "Night Nurse", type: "unit", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "floor", stats: { power: 1, health: 6, lives: 3, size: 1 }, keywords: {}, tags: ["heal"],
    text: "End of your turn: heal a random Cat 2.",
    flavor: "Does rounds. Sits on patients.",
    effects: { onTurnEnd: [ { type: "heal", amount: 2, target: "randomCat" } ] },
    upgrade: { effects: { onTurnEnd: [ { type: "heal", amount: 4, target: "randomCat" } ] }, text: "End of your turn: heal a random Cat 4." },
    art: { sprite: "cat_nurse", palette: "cream", desc: "Cream cat in a paper nurse hat with a thermometer" },
    unlock: "start" },

  { id: "neutral_spring_cleaning", name: "Spring Cleaning", type: "spell", clan: "neutral", rarity: "uncommon", cost: 1,
    targeting: "none", keywords: { exhaust: true }, tags: ["curse-cure", "draw"],
    text: "Remove a curse in your hand from your deck for good. Draw 1. Exhaust.",
    flavor: "Everything off the shelf and into the bin. The cat objects.",
    effects: { onPlay: [
      { type: "removeCard", from: "hand", filter: "curse", amount: 1 },
      { type: "draw", amount: 1, target: "player" } ] },
    upgrade: { cost: 0, text: "Remove a curse in your hand from your deck for good. Draw 1. Exhaust." },
    art: { sprite: "spell_broom", palette: "teal", desc: "Cat swinging a tiny broom at a pile of fur and dust" },
    unlock: "start" },

  { id: "neutral_lick_fur", name: "Lick Fur", type: "spell", clan: "neutral", rarity: "uncommon", cost: 0,
    targeting: "cat", keywords: { exhaust: true }, tags: ["cleanse", "heal"],
    text: "Cleanse a Cat and heal it 2. Exhaust.",
    flavor: "Dignity restored in four strokes.",
    effects: { onPlay: [
      { type: "cleanse", target: "chosenCat" },
      { type: "heal", amount: 2, target: "chosenCat" } ] },
    upgrade: { effects: { onPlay: [
      { type: "cleanse", target: "chosenCat" },
      { type: "heal", amount: 5, target: "chosenCat" } ] }, text: "Cleanse a Cat and heal it 5. Exhaust." },
    art: { sprite: "spell_lick", palette: "cream", desc: "Cat mid-grooming with one hind leg in the air" },
    unlock: "start" },

  { id: "neutral_two_paw_swat", name: "Two-Paw Swat", type: "spell", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "enemy", keywords: {}, tags: ["attack"],
    text: "Deal 4 damage twice.",
    flavor: "One paw is a warning. Two is correspondence.",
    effects: { onPlay: [ { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy", times: 2 } ] },
    upgrade: { effects: { onPlay: [ { type: "damage", amount: 5, kind: "hit", target: "chosenEnemy", times: 2 } ] }, text: "Deal 5 damage twice." },
    art: { sprite: "spell_paws2", palette: "orange", desc: "Two paws swinging in alternating arcs" },
    unlock: "start" },

  { id: "neutral_pick_your_prey", name: "Pick Your Prey", type: "spell", clan: "neutral", rarity: "uncommon", cost: 1,
    targeting: "enemy", keywords: {}, tags: ["marked"],
    text: "Mark an enemy. Deal 2 damage.",
    flavor: "Stares until it becomes the mouse's problem.",
    effects: { onPlay: [
      { type: "applyStatus", status: "marked", amount: 1, target: "chosenEnemy" },
      { type: "damage", amount: 2, kind: "hit", target: "chosenEnemy" } ] },
    upgrade: { effects: { onPlay: [
      { type: "applyStatus", status: "marked", amount: 1, target: "chosenEnemy" },
      { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy" } ] }, text: "Mark an enemy. Deal 4 damage." },
    art: { sprite: "spell_eyes", palette: "indigo", desc: "Two slit-pupil eyes with a red crosshair between them" },
    unlock: "start" },

  { id: "neutral_cat_tree", name: "Cat Tree", type: "toy", clan: "neutral", rarity: "uncommon", cost: 2,
    targeting: "floor", keywords: {}, tags: ["hidden", "aura"],
    text: "Cats on this floor have +1 Power. Cats deployed here gain Hidden 1.",
    flavor: "Four levels, one cat, no sharing.",
    aura: [ { stat: "power", amount: 1, target: "allCatsOnFloor" } ],
    effects: { onCatDeployed: [ { type: "applyStatus", status: "hidden", amount: 1, target: "triggerSource" } ] },
    upgrade: { cost: 1, text: "Cats on this floor have +1 Power. Cats deployed here gain Hidden 1." },
    art: { sprite: "toy_tree", palette: "brown", desc: "Carpeted multi-level cat tower with a rope post" },
    unlock: "start" },

  /* ===================== NEUTRAL RARES (7) ===================== */

  { id: "neutral_block_matriarch", name: "Matriarch of the Block", type: "unit", clan: "neutral", rarity: "rare", cost: 3,
    targeting: "floor", stats: { power: 3, health: 9, lives: 3, size: 1 }, keywords: {}, tags: ["fluff", "deploy"],
    text: "Whenever you deploy another Cat, it gains Fluff 2.",
    flavor: "Knows every cat on the street, and what they did.",
    effects: { onCatDeployed: [ { type: "fluff", amount: 2, target: "triggerSource" } ] },
    upgrade: { stats: { health: 11 }, effects: { onCatDeployed: [ { type: "fluff", amount: 4, target: "triggerSource" } ] }, text: "Whenever you deploy another Cat, it gains Fluff 4." },
    art: { sprite: "cat_matriarch", palette: "grey", desc: "Stately grey cat with a pearl collar and one torn ear" },
    unlock: "start" },

  { id: "neutral_lucky_calico", name: "Lucky Calico", type: "unit", clan: "neutral", rarity: "rare", cost: 2,
    targeting: "floor", stats: { power: 2, health: 4, lives: 3, size: 1 }, keywords: { reborn: true }, tags: ["reborn"],
    text: "Reborn. Death: it costs 1 less to play again.",
    flavor: "Landed on all four. Billed all nine.",
    effects: { onDeath: [ { type: "reduceCost", amount: 1, duration: "played", target: "thisCard" } ] },
    upgrade: { stats: { power: 3, health: 6 }, text: "Reborn. Death: it costs 1 less to play again." },
    art: { sprite: "cat_calico", palette: "mixed", desc: "Orange, black and white calico with a tiny gold bell" },
    unlock: "start" },

  { id: "neutral_drifter", name: "The Drifter", type: "unit", clan: "neutral", rarity: "rare", cost: 3,
    targeting: "floor", stats: { power: 3, health: 7, lives: 3, size: 1 }, keywords: {}, tags: ["bridge", "purr", "knock", "marked"],
    text: "Deploy: add 2 Purr here. Knock 1 and Mark the front enemy.",
    flavor: "Has eaten at every house. Belongs to none.",
    effects: { onPlay: [
      { type: "floorStatus", status: "purr", amount: 2, target: "thisFloor" },
      { type: "applyStatus", status: "marked", amount: 1, target: "frontEnemy" },
      { type: "knock", amount: 1, target: "frontEnemy" } ] },
    upgrade: { stats: { health: 9 }, effects: { onPlay: [
      { type: "floorStatus", status: "purr", amount: 4, target: "thisFloor" },
      { type: "applyStatus", status: "marked", amount: 1, target: "frontEnemy" },
      { type: "knock", amount: 1, target: "frontEnemy" } ] }, text: "Deploy: add 4 Purr here. Knock 1 and Mark the front enemy." },
    art: { sprite: "cat_drifter", palette: "brown", desc: "Scruffy ginger-and-grey cat with a bindle on a stick" },
    unlock: "start" },

  { id: "neutral_all_nighter", name: "All-Nighter", type: "spell", clan: "neutral", rarity: "rare", cost: 1,
    targeting: "none", keywords: { exhaust: true }, tags: ["zoomies", "draw"],
    text: "Gain 2 Zoomies. Draw 2. Next turn, 1 less Zoomies. Exhaust.",
    flavor: "The sun will rise anyway. The cat will not be consulted.",
    effects: { onPlay: [
      { type: "zoomies", amount: 2 },
      { type: "draw", amount: 2, target: "player" },
      { type: "zoomies", amount: -1, nextTurn: true } ] },
    upgrade: { effects: { onPlay: [
      { type: "zoomies", amount: 2 },
      { type: "draw", amount: 3, target: "player" },
      { type: "zoomies", amount: -1, nextTurn: true } ] }, text: "Gain 2 Zoomies. Draw 3. Next turn, 1 less Zoomies. Exhaust." },
    art: { sprite: "spell_clock", palette: "indigo", desc: "Wide-eyed cat silhouette against a 3:00 clock face" },
    unlock: "start" },

  { id: "neutral_lucky_penny", name: "Lucky Penny", type: "spell", clan: "neutral", rarity: "rare", cost: 2,
    targeting: "cat", keywords: { exhaust: true }, tags: ["lives", "fluff"],
    text: "A Cat gains 1 Life and Fluff 6. Exhaust.",
    flavor: "Found under the fridge. Has opinions about luck.",
    effects: { onPlay: [
      { type: "lives", amount: 1, target: "chosenCat" },
      { type: "fluff", amount: 6, target: "chosenCat" } ] },
    upgrade: { cost: 1, text: "A Cat gains 1 Life and Fluff 6. Exhaust." },
    art: { sprite: "spell_coin", palette: "gold", desc: "Shiny copper coin with a cat face stamped on it" },
    unlock: "start" },

  { id: "neutral_group_photo", name: "Group Photo", type: "spell", clan: "neutral", rarity: "rare", cost: 2,
    targeting: "none", keywords: {}, tags: ["fluff", "heal", "team"],
    text: "All Cats gain Fluff 3, heal 3 and get +1 Power this turn.",
    flavor: "Everyone is in the shot. Nobody is looking at the camera.",
    effects: { onPlay: [
      { type: "fluff", amount: 3, target: "allCats" },
      { type: "heal", amount: 3, target: "allCats" },
      { type: "buff", stat: "power", amount: 1, duration: "turn", target: "allCats" } ] },
    upgrade: { effects: { onPlay: [
      { type: "fluff", amount: 5, target: "allCats" },
      { type: "heal", amount: 5, target: "allCats" },
      { type: "buff", stat: "power", amount: 1, duration: "turn", target: "allCats" } ] }, text: "All Cats gain Fluff 5, heal 5 and get +1 Power this turn." },
    art: { sprite: "spell_frame", palette: "cream", desc: "Wooden photo frame crammed with mismatched cat faces" },
    unlock: "start" },

  { id: "neutral_sunny_windowsill", name: "Sunny Windowsill", type: "toy", clan: "neutral", rarity: "rare", cost: 2,
    targeting: "floor", keywords: {}, tags: ["warmth", "fluff"],
    text: "End of your turn: restore 1 Warmth. Cats here gain Fluff 2.",
    flavor: "Prime real estate. Zoned for loafing.",
    effects: { onTurnEnd: [
      { type: "warmth", amount: 1, target: "player" },
      { type: "fluff", amount: 2, target: "allCatsOnFloor" } ] },
    upgrade: { effects: { onTurnEnd: [
      { type: "warmth", amount: 2, target: "player" },
      { type: "fluff", amount: 3, target: "allCatsOnFloor" } ] }, text: "End of your turn: restore 2 Warmth. Cats here gain Fluff 3." },
    art: { sprite: "toy_sill", palette: "gold", desc: "Wide windowsill, yellow light slab, potted plant half chewed" },
    unlock: "start" },

  /* ===================== 3. CURSES AND JUNK (9) =====================
   * removal.fight: what you can do about it inside a fight.
   * removal.run: how it leaves the deck for good.
   * cure: machine ids. "play" = playing it clears it from the fight (it still returns next fight).
   *   spring_cleaning = neutral_spring_cleaning. vet_event = free Flush at any Vet event (A03).
   *   shop_desk = Gerald's removal desk, 75 Fish +25 each time (RULES section 8).
   */

  { id: "curse_hairball", name: "Hairball", type: "curse", clan: "curse", rarity: "token", cost: 2,
    targeting: "enemy", keywords: { exhaust: true }, junk: "fight", tags: ["hairball"],
    text: "Deal 4 damage. Exhaust.",
    flavor: "A gift. Do not step on it.",
    effects: { onPlay: [ { type: "damage", amount: 4, kind: "hit", target: "chosenEnemy" } ] },
    removal: { fight: "Play it. It hits an enemy for 4 and exhausts.", run: "Fight-only card. It vanishes when the fight ends." },
    cure: ["play"],
    art: { sprite: "junk_hairball", palette: "grey", desc: "Damp grey tumbleweed with one stray whisker" } },

  { id: "curse_vet_appointment", name: "Vet Appointment", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["zoomies"],
    text: "Unplayable. When drawn, you start next turn with 1 less Zoomies.",
    flavor: "There is a carrier involved. Nobody wants to talk about it.",
    effects: { onDrawn: [ { type: "zoomies", amount: -1, nextTurn: true } ] },
    removal: { fight: "Exhaust effects clear it for this fight only.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_carrier", palette: "grey", desc: "Grey plastic pet carrier, door shut, a paw poking out" } },

  { id: "curse_bath_time", name: "Bath Time", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["debuff"],
    text: "Unplayable. When drawn, a random Cat on the board gets -1 Power for the fight.",
    flavor: "Betrayal, with warm water.",
    effects: { onDrawn: [ { type: "buff", stat: "power", amount: -1, duration: "fight", target: "randomCat" } ] },
    removal: { fight: "Exhaust effects clear it for this fight only.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_tub", palette: "teal", desc: "Soapy tub with two furious ears above the bubbles" } },

  { id: "curse_cucumber", name: "Cucumber", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["scared"],
    text: "Unplayable. When drawn, a random Cat is Scared 1.",
    flavor: "Placed silently behind the cat. Nobody has recovered.",
    effects: { onDrawn: [ { type: "applyStatus", status: "scared", amount: 1, target: "randomCat" } ] },
    removal: { fight: "Exhaust effects clear it for this fight only.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_cucumber", palette: "green", desc: "One smug cucumber, a single dramatic shadow" } },

  { id: "curse_wet_sock", name: "Wet Sock", type: "curse", clan: "curse", rarity: "curse", cost: 1,
    targeting: "cat", keywords: { exhaust: true }, junk: "deck", tags: ["wet", "draw"],
    text: "Give a Cat Wet 2. Draw 1. Exhaust.",
    flavor: "Nobody knows whose it is. Everyone knows where it has been.",
    effects: { onPlay: [
      { type: "applyStatus", status: "wet", amount: 2, target: "chosenCat" },
      { type: "draw", amount: 1, target: "player" } ] },
    removal: { fight: "Play it, and pick a Cat you can spare for two turns.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["play", "vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_sock", palette: "grey", desc: "Single damp striped sock with a drip underneath" } },

  { id: "curse_itchy_collar", name: "Itchy Collar", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true, retain: true }, junk: "deck", tags: ["debuff", "clog"],
    text: "Unplayable. Retain. End of turn in hand: a random Cat gets -1 Power for the fight.",
    flavor: "Comes with a bell. The bell is the problem.",
    effects: { onTurnEndInHand: [ { type: "buff", stat: "power", amount: -1, duration: "fight", target: "randomCat" } ] },
    removal: { fight: "Spring Cleaning or any Exhaust-from-hand effect. Otherwise it sits there and jingles.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_collar", palette: "red", desc: "Red collar with an oversized gold bell and a price tag" } },

  { id: "curse_dead_mouse_gift", name: "Dead Mouse Gift", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["hairball", "chain"],
    text: "Unplayable. When drawn, add a Hairball to your hand.",
    flavor: "Presented with pride. Eaten, regretted, returned.",
    effects: { onDrawn: [ { type: "createCard", card: "curse_hairball", amount: 1, to: "hand" } ] },
    removal: { fight: "Play the Hairball it leaves behind for a small refund.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_mouse", palette: "grey", desc: "Toy-sized grey mouse on a doormat, ribbon around its tail" } },

  { id: "curse_eviction_notice", name: "Eviction Notice", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["warmth"],
    text: "Unplayable. When drawn, lose 2 Warmth.",
    flavor: "Addressed to The Cats. Signed by the dog next door.",
    effects: { onDrawn: [ { type: "warmth", amount: -2, target: "player" } ] },
    removal: { fight: "Exhaust effects clear it for this fight only.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_letter", palette: "cream", desc: "Official envelope with a red stamp and a muddy paw print" } },

  { id: "curse_static_shock", name: "Static Shock", type: "curse", clan: "curse", rarity: "curse", cost: null,
    targeting: "none", keywords: { unplayable: true }, junk: "deck", tags: ["damage"],
    text: "Unplayable. When drawn, deal 2 damage to a random Cat.",
    flavor: "The blanket has been collecting. Today it spends.",
    effects: { onDrawn: [ { type: "damage", amount: 2, kind: "hit", target: "randomCat" } ] },
    removal: { fight: "Exhaust effects clear it for this fight only.", run: "Free at any Vet event. Or Spring Cleaning, or Gerald's desk." },
    cure: ["vet_event", "spring_cleaning", "shop_desk"],
    art: { sprite: "junk_blanket", palette: "indigo", desc: "Fuzzy blanket with blue sparks and standing-up cat fur" } },

  /* ===================== 4. TOKENS (10, fight-only) =====================
   * Summoned or generated by other clans. Rarity token means the engine removes them
   * from all piles when the fight ends. Token cats have Lives 1 (A02).
   */

  { id: "token_empty_collar", name: "Empty Collar", type: "spell", clan: "neutral", rarity: "token", cost: 0,
    targeting: "none", keywords: { exhaust: true }, tags: ["zoomies", "lives"],
    text: "Gain 1 Zoomies. Exhaust.",
    flavor: "It fits. The cat does not say goodbye. It never does.",
    effects: { onPlay: [ { type: "zoomies", amount: 1 } ] },
    art: { sprite: "token_collar", palette: "grey", desc: "Small empty collar lying open with its bell on its side" } },

  { id: "token_flat_pack", name: "Flat Pack", type: "toy", clan: "neutral", rarity: "token", cost: 1,
    targeting: "floor", keywords: { exhaust: true }, tags: ["box"],
    text: "Place a Box on a floor. Exhaust.",
    flavor: "Some assembly required. None attempted.",
    effects: { onPlay: [ { type: "box", target: "chosenFloor" } ] },
    art: { sprite: "token_flatbox", palette: "brown", desc: "Folded flat cardboard sheet with dotted fold lines" } },

  { id: "token_yarn_ball", name: "Yarn Ball", type: "spell", clan: "neutral", rarity: "token", cost: 0,
    targeting: "enemy", keywords: { exhaust: true }, tags: ["yarn"],
    text: "Yarn 1 an enemy. Exhaust.",
    flavor: "Rolled off the sofa and into destiny.",
    effects: { onPlay: [ { type: "applyStatus", status: "yarn", amount: 1, target: "chosenEnemy" } ] },
    art: { sprite: "token_yarn", palette: "red", desc: "Fat ball of red yarn with a trailing loose thread" } },

  { id: "token_stray_kitten", name: "Stray Kitten", type: "unit", clan: "neutral", rarity: "token", cost: 0,
    targeting: "floor", stats: { power: 1, health: 2, lives: 1, size: 1 }, keywords: { exhaust: true }, tags: ["kitten", "token"],
    text: "Exhaust.",
    flavor: "Showed up. Nobody called. Staying.",
    art: { sprite: "kitten_stray", palette: "grey", desc: "Skinny grey kitten with oversized ears and a hopeful face" } },

  { id: "token_lap_kitten", name: "Lap Kitten", type: "unit", clan: "hearth", rarity: "token", cost: 0,
    targeting: "floor", stats: { power: 1, health: 3, lives: 1, size: 1 }, keywords: { purr: 1, exhaust: true }, tags: ["kitten", "purr", "token"],
    text: "Purr 1. Exhaust.",
    flavor: "Purrs on contact. Contact is not optional.",
    art: { sprite: "kitten_lap", palette: "cream", desc: "Cream kitten kneading a folded blanket, eyes shut" } },

  { id: "token_spirit_cat", name: "Spirit Cat", type: "unit", clan: "moon", rarity: "token", cost: 0,
    targeting: "floor", stats: { power: 2, health: 2, lives: 1, size: 1 }, keywords: { exhaust: true }, tags: ["spirit", "hidden", "token"],
    text: "Deploy: gain Hidden 1. Exhaust.",
    flavor: "Does not remember the house. Haunts it anyway.",
    effects: { onPlay: [ { type: "applyStatus", status: "hidden", amount: 1, target: "self" } ] },
    art: { sprite: "cat_ghost", palette: "indigo", desc: "Translucent violet cat, glowing eyes, tail fading to mist" } },

  { id: "token_scrap_kitten", name: "Scrap Kitten", type: "unit", clan: "alley", rarity: "token", cost: 0,
    targeting: "floor", stats: { power: 2, health: 1, lives: 1, size: 1 }, keywords: { pounce: 1, exhaust: true }, tags: ["kitten", "pounce", "token"],
    text: "Pounce 1. Exhaust.",
    flavor: "Born swinging. Missed.",
    art: { sprite: "kitten_scrap", palette: "orange", desc: "Tiny torn-eared orange kitten with a fish bone in its mouth" } },

  { id: "token_tuna_treat", name: "Tuna Treat", type: "spell", clan: "hearth", rarity: "token", cost: 0,
    targeting: "cat", keywords: { exhaust: true }, tags: ["heal"],
    text: "Heal a Cat 4. Exhaust.",
    flavor: "One piece. Counted. Twice.",
    effects: { onPlay: [ { type: "heal", amount: 4, target: "chosenCat" } ] },
    art: { sprite: "token_treat", palette: "teal", desc: "Single fish-shaped treat on a small saucer" } },

  { id: "token_spare_charm", name: "Spare Charm", type: "spell", clan: "moon", rarity: "token", cost: 1,
    targeting: "cat", keywords: { exhaust: true }, tags: ["lives"],
    text: "A Cat gains 1 Life. Exhaust.",
    flavor: "Smells of luck and tuna. Mostly tuna.",
    effects: { onPlay: [ { type: "lives", amount: 1, target: "chosenCat" } ] },
    art: { sprite: "token_charm", palette: "indigo", desc: "Small violet bell charm on a thread with a crescent moon" } },

  { id: "token_catnip_mouse", name: "Catnip Mouse", type: "toy", clan: "mischief", rarity: "token", cost: 0,
    targeting: "floor", keywords: { exhaust: true }, tags: ["catnip", "token"],
    text: "End of your turn: gain 1 Nip. Exhaust.",
    flavor: "Stuffed with something. Do not ask what.",
    effects: { onTurnEnd: [ { type: "catnip", amount: 1 } ] },
    art: { sprite: "token_mouse", palette: "teal", desc: "Green felt mouse with button eyes and a leaf-print belly" } }

];
