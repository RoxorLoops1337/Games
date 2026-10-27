/* SUNBEAM SIEGE events. Agent B14. 48 events, 16 home events per act, 6 also shared to an adjacent act.
   Classic script. Namespace SB.data.events. No em dashes anywhere.

   EVENT SCHEMA
   { id, title, acts:[..], homeAct, category:'boon'|'gamble'|'trade'|'story'|'fight' (A07 weights),
     character?, livesGamble?, chain?{id,part,of}, requires?{flag}, forced?, art, setup:[2 to 4 lines],
     choices:[{ id, label, req?, effects:[op..], result }] }
   req: {fish:n} | {clan:'moon'} | {flag:'x'} | {champion:true} | {curses:1} | {catLives:2} (a cat with at least n lives).
   Unmet req = option shown greyed with the requirement text.

   EFFECT OPS (all amounts are plain numbers, no expressions)
   {op:'fish', amount}                 gain or lose Fish (never below 0)
   {op:'warmth', amount}               Sunbeam Warmth, clamped to 1 minimum (events never kill)
   {op:'maxWarmth', amount}            raise max Warmth (and current by same)
   {op:'lives', amount, who}           who: 'choose' (player picks a cat) | 'all' | 'random' | 'lowest' | 'champion'
   {op:'addCard', card, curse?}        add a card to the deck
   {op:'cardDraft', pool, count}       open a draft of count cards from pool ('main','side','neutral','mischief', 'rare')
   {op:'removeCard', mode, count, curseOnly?, card?}   mode 'choose' | 'random' | 'specific'
   {op:'duplicateCard', mode}          Litter-style copy of a chosen card (not champion)
   {op:'upgradeCard', mode}            mode 'choose' | 'random' (one upgrade, A06 rules)
   {op:'evolveCard', from, to}         swap a card for its evolved form, keeping lives
   {op:'addRelic', relic | rarity}     specific relic id, or random of rarity 'common'|'uncommon'|'rare'
   {op:'fight', encounter, tier, rewards}  start a battle (tier 'prowl'|'elite'); rewards extra {fish, relic, draft}
   {op:'setFlag', flag, value?}        run flag (value defaults true)
   {op:'clearFlag', flag}
   {op:'payDebt', rate}                pay flag gerald_debt value times rate in Fish (req must check Fish), then clear it
   {op:'chance', outcomes:[{p, result, effects}]}   p sums to 1; engine uses the event RNG stream

   NEEDS (for engine and content agents):
   - Ops above that are new to A03's DSL are event-layer only: evolveCard, payDebt, duplicateCard, cardDraft, chance, flags.
   - Forced follow ups: an event with forced:true and requires.flag is chosen ahead of the random pool the next time an
     Event node (or Mystery resolving to Event) opens in its act, if the flag is set. Never offered otherwise.
   - Cards: neutral_goblin_kitten (unit, cost 1, 2/3, lives 2, Pounce 1), neutral_goblin_cat (cost 1, 4/5, lives 3, Pounce 2,
     Deploy: gain 1 Fish... or any scrappy effect), neutral_goblin_king (cost 2, 6/8, lives 4, Deploy: summon a kitten
     token on each other floor). Existing: swat, catnap, cardboard_box, off_the_shelf, vet_appointment, bath_time.
   - Curses: curse_wet_sock (unplayable, when drawn: lose 1 Fish... or -1 Zoomies next turn once).
   - Relics (event-only or event-weighted): relic_pigeon_feather (common, first card each fight costs 1 less once),
     relic_roomba_bumper (uncommon, first enemy to climb each fight gets Knock 1), relic_elder_spectacles (rare,
     see enemy intents two rounds ahead and upgrades gain +1 Kneading cap), relic_goblin_tooth (unused spare).
   - Encounters: enc_evt_rat_toll (A1 prowl), enc_evt_dust_bunnies (A2 prowl), enc_evt_roomba_revenge (A2 prowl),
     enc_evt_gerald_cousins (A2 prowl, raccoons in coats), enc_evt_roomba_mk2 (A3 elite), enc_evt_chandelier_spiders (A3 prowl),
     enc_evt_pigeon_flock (A3 prowl).
   - Flags used: gerald_debt (value Fish), elder_student, elder_scholar, roomba_met, roomba_friend, roomba_foe,
     kitten_adopted, pigeon_grudge, boss_intel (show next boss first two moves), red_dot_dim (Red Dot boss starts at 85 percent HP).
*/
window.SB = window.SB || {}; SB.data = SB.data || {};
SB.data.events = (function () {
  var fish = function (n) { return { op: 'fish', amount: n }; };
  var warmth = function (n) { return { op: 'warmth', amount: n }; };
  var maxW = function (n) { return { op: 'maxWarmth', amount: n }; };
  var lives = function (n, who) { return { op: 'lives', amount: n, who: who }; };
  var addCard = function (c) { return { op: 'addCard', card: c }; };
  var curse = function (c) { return { op: 'addCard', card: c, curse: true }; };
  var draft = function (pool, count) { return { op: 'cardDraft', pool: pool, count: count || 3 }; };
  var rm = function (mode, count) { return { op: 'removeCard', mode: mode, count: count || 1 }; };
  var rmCurse = function () { return { op: 'removeCard', mode: 'choose', count: 1, curseOnly: true }; };
  var rmSpec = function (c) { return { op: 'removeCard', mode: 'specific', card: c, count: 1 }; };
  var dup = function () { return { op: 'duplicateCard', mode: 'choose' }; };
  var up = function (mode) { return { op: 'upgradeCard', mode: mode }; };
  var evolve = function (a, b) { return { op: 'evolveCard', from: a, to: b }; };
  var relic = function (id) { return { op: 'addRelic', relic: id }; };
  var relicR = function (r) { return { op: 'addRelic', rarity: r }; };
  var fight = function (enc, tier, rewards) { return { op: 'fight', encounter: enc, tier: tier, rewards: rewards || {} }; };
  var flag = function (f, v) { return { op: 'setFlag', flag: f, value: v === undefined ? true : v }; };
  var unflag = function (f) { return { op: 'clearFlag', flag: f }; };
  var debt = function (rate) { return { op: 'payDebt', rate: rate }; };
  var chance = function (arr) { return { op: 'chance', outcomes: arr }; };
  var o = function (p, result, effects) { return { p: p, result: result, effects: effects || [] }; };
  var C = function (label, result, effects, req) {
    var ch = { label: label, effects: effects || [], result: result };
    if (req) ch.req = req;
    return ch;
  };
  var E = function (e) {
    e.choices.forEach(function (c, i) { c.id = 'abcd'.charAt(i); });
    return e;
  };

  var list = [

  /* ================= ACT 1: THE CELLAR AND GARDEN ================= */

  E({ id: 'evt_closed_door', title: 'The Closed Door', acts: [1], homeAct: 1, category: 'gamble',
    art: 'ordinary white interior door, slightly ajar light under it, one cat silhouette sitting before it, looking betrayed',
    setup: ['A door has been closed between you and the kitchen.', 'You were not consulted.', 'It is a very ordinary door, and it is winning.'],
    choices: [
      C('Meow at it', 'Eleven minutes of principled complaint. The door opens, and a human leaves something on the floor to make you stop.', [warmth(-5), relicR('common')]),
      C('Wait politely', 'You sit. The sun finds you. This was the plan all along, you tell yourself.', [warmth(8)]),
      C('Scratch the paint', 'A bold choice that will be judged by whoever finds the door.', [chance([
        o(0.5, 'The door swings open and there is a Fish on the other side. Nobody mentions the paint.', [fish(25)]),
        o(0.5, 'A voice says "Was that the cat?" A bath is mentioned. It is not a threat, it is a schedule.', [curse('bath_time')])
      ])])
    ] }),

  E({ id: 'evt_mysterious_parcel', title: 'Mysterious Parcel', acts: [1], homeAct: 1, category: 'gamble',
    art: 'small cardboard box on cellar floor, smaller than a cat, open flaps, a hopeful orange tail sticking out',
    setup: ['A box arrived. It is, objectively, too small.', 'You are going in anyway.'],
    choices: [
      C('Climb in', 'Physics is consulted and overruled.', [chance([
        o(0.55, 'It fits. Barely. There is a Fish in the corner, left by a previous tenant.', [fish(30)]),
        o(0.3, 'It fits perfectly. You nap. You wake up with a plan and an odd crease.', [warmth(6)]),
        o(0.15, 'It does not fit. The box wins and keeps your dignity as a deposit.', [warmth(-4)])
      ])]),
      C('Sit next to it', 'The box is respected. It is also, you notice, a box.', [warmth(3), addCard('cardboard_box')]),
      C('Leave it for later', 'Later, it will be gone, or enormous. These things are not up to you.', [])
    ] }),

  E({ id: 'evt_gerald_overstock', title: 'Gerald Has Overstock', acts: [1, 2], homeAct: 1, category: 'trade', character: 'gerald',
    art: 'raccoon in a long tan trench coat and fedora standing on a milk crate beside a half-open suitcase of tins',
    setup: ['Gerald is not at his stall. He is in the middle of the corridor, with a suitcase.', '"Not a shop," he says. "A pop-up."', 'He is, in his own words, a tall cat.'],
    choices: [
      C('Buy a dented Tuna Tin (30 Fish)', 'Gerald says the dent is the flavor. The cat it goes to does not argue.', [fish(-30), lives(1, 'choose')], { fish: 30 }),
      C('Sell him a card', 'He takes it, weighs it with his eyes, and pays in damp coins.', [rm('choose', 1), fish(25)]),
      C('Ask where the stock came from', 'Gerald says "Upstairs" very loudly and leaves the way a man leaves who has not been asked this before.', [])
    ] }),

  E({ id: 'evt_gerald_tab', title: 'Gerald Opens a Tab', acts: [1], homeAct: 1, category: 'trade', character: 'gerald', chain: { id: 'gerald_tab', part: 1, of: 2 },
    art: 'raccoon in trench coat holding a tiny ledger and a pencil behind its ear, gesturing at a pile of Fish on a plate',
    setup: ['Gerald has a ledger. It has your name in it, spelled correctly, which is worrying.', '"Credit," he says. "Very friendly terms. I will remember them."'],
    choices: [
      C('Borrow 60 Fish', 'Gerald writes it down. He writes it down for a long time.', [fish(60), flag('gerald_debt', 60)]),
      C('Borrow 100 Fish', 'He tears the page out and licks it shut. "Act Two," he says. "I will find you."', [fish(100), flag('gerald_debt', 100)]),
      C('Decline', 'He looks disappointed and relieved in equal parts. You get a mint.', [warmth(2)])
    ] }),

  E({ id: 'evt_elder_lesson', title: 'The Elder Cat Has Notes', acts: [1], homeAct: 1, category: 'story', character: 'elder', chain: { id: 'elder', part: 1, of: 3 },
    art: 'very old grey cat with round spectacles and a knitted shawl on a cushion, one paw raised as if mid-lecture',
    setup: ['The Elder Cat is sitting on the good cushion, which is the lesson.', '"Sit," she says, and removes her spectacles to polish them. "This will not take long."', 'It will take long.'],
    choices: [
      C('Sit through the lesson', 'You learn something about patience, and something about knees. You leave sharper.', [warmth(-3), up('choose'), flag('elder_student')]),
      C('Ask about the Sunbeam', '"It was here first," she says. "Be nice to it." You feel the house lean in.', [maxW(2), flag('elder_student')]),
      C('Nap through it', 'She notices and says nothing. Disappointment travels at the speed of knitting.', [warmth(10)])
    ] }),

  E({ id: 'evt_pigeon_tip', title: 'A Pigeon, Unprompted', acts: [1, 2], homeAct: 1, category: 'gamble', character: 'pigeon',
    art: 'plump grey pigeon on a window sill glancing sideways, one eye large and suspicious, a single feather out of place',
    setup: ['A pigeon is on the sill. It says it saw nothing.', 'You did not ask.', 'It lowers its voice. "I could tell you where it is. For 15."'],
    choices: [
      C('Pay 15 Fish for the information', 'The pigeon takes the Fish and puts it somewhere you decide not to look.', [fish(-15), chance([
        o(0.6, 'It tells you a floorboard in the cellar. There are 50 Fish under it. This is the first honest thing it has said.', [fish(50)]),
        o(0.4, '"The information," it says, "is that pigeons are everywhere." It leaves. Your Fish does not.', [])
      ])], { fish: 15 }),
      C('Chase it', 'You do. It is in the air in a second and you are in the hedge for ten.', [chance([
        o(0.5, 'It drops a feather on the way out. A small, ceremonial feather. You keep it.', [relicR('common')]),
        o(0.5, 'The hedge has opinions about your fur.', [warmth(-4)])
      ])]),
      C('Ignore it', 'It looks hurt. It makes a note. Pigeons make notes.', [flag('pigeon_grudge')])
    ] }),

  E({ id: 'evt_roomba_sighting', title: "The Neighbor's Roomba", acts: [1], homeAct: 1, category: 'story', character: 'roomba', chain: { id: 'roomba', part: 1, of: 3 },
    art: 'round grey robot vacuum with a blinking blue ring on a cellar floor, one cat staring at it from a stack of crates',
    setup: ["The Neighbor's Roomba has entered the cellar.", 'It moves with the confidence of a machine that has never been told no.', 'It bumps a wall, thinks about it, and bumps it again.'],
    choices: [
      C('Ride it', 'Technically, you are being transported. It would be rude to call it a steed.', [flag('roomba_met'), chance([
        o(0.6, 'The Roomba tours the whole cellar. Under the shelf you find coins. It does not claim a cut.', [fish(35)]),
        o(0.4, 'It turns left at the stairs. You do not. Warmth is lost in the transition.', [warmth(-5)])
      ])]),
      C('Feed it (10 Fish)', 'It will accept crumbs. It would like you to know it has been waiting for someone to ask.', [fish(-10), flag('roomba_met'), flag('roomba_friend')], { fish: 10 }),
      C('Knock it down the stairs', 'It makes a sound like a small apology and a very large grudge. Its dust bin spills fish scales.', [fish(20), flag('roomba_met'), flag('roomba_foe')])
    ] }),

  E({ id: 'evt_kitten_goblin', title: 'A Small Visitor', acts: [1], homeAct: 1, category: 'story', character: 'kitten', chain: { id: 'kitten', part: 1, of: 3 },
    art: 'tiny grey kitten with oversized ears, too many pointy teeth, holding a spoon like a sceptre, standing on a flour sack',
    setup: ['A kitten sits in the middle of the cellar, holding a spoon.', 'It has too many teeth and a plan.', 'It says its name is Pip. It does not blink while saying it.'],
    choices: [
      C('Take Pip in', 'Pip nods once, as if accepting a minor kingdom. A small, concerning smile.', [addCard('neutral_goblin_kitten'), flag('kitten_adopted')]),
      C('Give Pip a Fish (10)', 'Pip eats it, bows, and leaves. It will be back. That was a promise, not a threat.', [fish(-10), warmth(4)], { fish: 10 }),
      C('Leave it alone', 'You back away. Pip watches you go and writes something on a wall.', [])
    ] }),

  E({ id: 'evt_fish_heads', title: 'Fish Heads Behind the Boiler', acts: [1], homeAct: 1, category: 'boon',
    art: 'cellar boiler with a rusted dial, a paper bag of fish heads spilling behind it, steam curling around a hungry cat',
    setup: ['Someone has left a bag behind the boiler.', 'It smells of the sea, and also of decisions.'],
    choices: [
      C('Eat what you can', 'A decent meal. A small, private triumph.', [warmth(10)]),
      C('Pocket the best ones', 'Gerald will pay for these. Gerald pays for anything that looks like it was not his.', [fish(30)]),
      C('Take all of it', 'A greedy gamble.', [chance([
        o(0.5, 'Everything was fish. Perfectly good fish. The universe is occasionally kind.', [fish(45), warmth(5)]),
        o(0.5, 'Not everything was fish. One thing in the bag was a sock. You smell like it for a week.', [curse('curse_wet_sock')])
      ])])
    ] }),

  E({ id: 'evt_rat_toll', title: 'The Toll Rats', acts: [1], homeAct: 1, category: 'fight',
    art: 'brown rats in hi-vis vests behind a tiny barrier made of a mop handle, one holding a clipboard, a hand-painted TOLL sign',
    setup: ['A rat in a hi-vis vest has set up a toll gate across the passage.', 'The sign says TOLL. The prices are posted in a language that is mostly squeaks.', 'There are more rats behind him, which is the real fee.'],
    choices: [
      C('Pay the toll (25 Fish)', 'The rat stamps your paw. The stamp is legal in precisely one place: this corridor.', [fish(-25)], { fish: 25 }),
      C('Refuse and fight', 'The rat sighs, clips his pen, and blows a tiny whistle.', [fight('enc_evt_rat_toll', 'prowl', { fish: 40, draft: true })]),
      C('Negotiate', 'You use your calm voice. The rat uses his calm voice. There is a pause.', [chance([
        o(0.5, 'A reasonable rat. He waves you through and tips his cap, and you find 10 Fish he accidentally dropped.', [fish(10)]),
        o(0.5, '"Ah," he says, "that is not what I was told." The whistle gets blown.', [fight('enc_evt_rat_toll', 'prowl', { fish: 40, draft: true })])
      ])])
    ] }),

  E({ id: 'evt_sunbeam_patch', title: 'A Patch of Sun', acts: [1, 2], homeAct: 1, category: 'boon',
    art: 'a rectangular patch of golden light on a dusty cellar floor, a cat shadow stretched long across it, dust motes glowing',
    setup: ['A patch of sun on the floor. It should not be there.', 'It has been there since morning. Nobody has explained it.', 'Nobody has to.'],
    choices: [
      C('Sit in it', 'You do. This is the correct response to sun.', [warmth(10)]),
      C('Give your spot to a tired cat', 'They fall asleep within the minute. Everyone is a little better for it.', [lives(1, 'choose')]),
      C('Stare at it until something happens', 'You stare. Something may happen. Possibly nothing.', [chance([
        o(0.3, 'The light shifts and, for a moment, the whole house hums. You feel like you have been introduced.', [maxW(3)]),
        o(0.7, 'Nothing happens, warmly.', [warmth(3)])
      ])])
    ] }),

  E({ id: 'evt_dusty_yarn', title: 'The Yarn Basket', acts: [1], homeAct: 1, category: 'boon',
    art: 'wicker basket of tangled red and blue yarn, a loose strand trailing across the floor, paw prints through it',
    setup: ['A basket of old yarn sits in the corner.', 'Half of it is a single knot. The other half is hoping you will not look.'],
    choices: [
      C('Untangle it patiently', 'It takes an hour. You come away with nothing but insight. Insight is useful.', [warmth(-3), up('random')]),
      C('Take the knot whole', 'You pick out a piece of the mess, and it turns out to be an idea.', [draft('mischief', 3)]),
      C('Roll in it', 'There is no better use of yarn. Warmth rises. So does the yarn count on your coat.', [warmth(6)])
    ] }),

  E({ id: 'evt_milk_roulette', title: 'Five Saucers of Milk', acts: [1], homeAct: 1, category: 'gamble', livesGamble: true,
    art: 'five white saucers in a row on a wooden table, four glowing creamy white, one with a faint green tinge, a cat peering over the rim',
    setup: ['Five saucers of milk on a table, in a row.', 'Four are milk. The fifth smells of something with a vet bill.', 'A card reads: "Please choose responsibly." It is in a cat\'s handwriting, which is to say, ominous.'],
    choices: [
      C('Drink one', 'You choose the middle one. It is the most dignified position.', [chance([
        o(0.8, 'Milk. Perfect, cold, wonderful milk.', [warmth(8)]),
        o(0.2, 'Not milk. A cat makes a face you will remember. A life is spent.', [lives(-1, 'random')])
      ])]),
      C('Drink three, with confidence', 'You say "I know what I am doing" out loud, which is how you know.', [chance([
        o(0.51, 'All milk. A surplus of luck. A small bottle appears from under the table as a prize.', [warmth(8), relicR('uncommon')]),
        o(0.49, 'The third saucer was the one. A life is spent, audibly.', [lives(-1, 'random')])
      ])]),
      C('Offer a life, skip the risk', 'You tip one saucer onto the floor and a cat takes the loss. The table pays out, politely.', [lives(-1, 'choose'), relicR('common')], { catLives: 2 }),
      C('Walk away', 'Cats are known for this. Declining is also an art.', [])
    ] }),

  E({ id: 'evt_bookshelf_leap', title: 'The Top Shelf', acts: [1], homeAct: 1, category: 'gamble', livesGamble: true,
    art: 'tall wooden bookshelf, a cat crouched at the top shelf next to a fragile blue vase, distance to the floor drawn with exaggeration',
    setup: ['The top shelf. A cat has been up there for eleven minutes.', 'It is looking at the vase. The vase knows.', 'Below it is a hard floor and eight lives of confidence.'],
    choices: [
      C('Leap, nine lives and all', 'Pick a cat. They will do it. They always do.', [chance([
        o(0.65, 'A perfect landing. A short pause. Then the vase falls, and under it, tips.', [fish(50), up('random')]),
        o(0.35, 'A less perfect landing. A life is spent. The vase is fine, which is worse.', [lives(-1, 'choose'), fish(20)])
      ])], { catLives: 2 }),
      C('Push the vase instead', 'A classic. The vase lands. Eye contact is maintained.', [addCard('off_the_shelf')]),
      C('Climb down properly', 'Nobody is watching. You do it anyway.', [warmth(2)])
    ] }),

  E({ id: 'evt_garden_gnome', title: 'The Garden Gnome', acts: [1], homeAct: 1, category: 'gamble',
    art: 'a weathered garden gnome with a red hat and a fixed grin beside a cellar window, a cat sitting rigid directly in front of it',
    setup: ['A garden gnome stands beside the cellar window.', 'Cats have been staring at it for years. Nobody has blinked.', 'It is time.'],
    choices: [
      C('Win the staring contest', 'You commit. You go to a place that is neither awake nor asleep.', [chance([
        o(0.4, 'The gnome loses. It was always going to. A small trinket falls from its hat.', [relicR('common')]),
        o(0.6, 'The gnome wins. You are not sure how. You know that you are tired now.', [warmth(-3)])
      ])]),
      C('Blink first, with dignity', 'You say "I have places to be," and then you sit down in the sun.', [warmth(4)]),
      C('Knock it over', 'It lands face down. There is a coin where it stood. The gnome has not forgotten.', [fish(15)])
    ] }),

  E({ id: 'evt_drain_wish', title: 'The Drain', acts: [1], homeAct: 1, category: 'trade',
    art: 'round iron drain grate in a damp cellar floor, a single coin on the rim, a ripple of light inside, a cat looking down',
    setup: ['A drain in the cellar floor. Things fall in.', 'Wishes seem likelier here than anywhere else in the house.'],
    choices: [
      C('Drop a Fish and wish (10 Fish)', 'The Fish disappears. A moment passes. The drain thinks about it.', [fish(-10), chance([
        o(0.25, 'You wish for fewer bad habits. A bad habit goes down the drain.', [rm('choose', 1)]),
        o(0.45, 'The drain returns more than it took. Possibly a moral.', [fish(25)]),
        o(0.3, 'The drain gurgles and does nothing. It was a drain, after all.', [])
      ])], { fish: 10 }),
      C('Drop a card', 'You push it through the grate. A coin comes up, wet.', [rm('choose', 1), fish(20)]),
      C('Leave it', 'Some wishes are better unmade.', [])
    ] }),

  /* ================= ACT 2: THE PARLOR ================= */

  E({ id: 'evt_elder_pop_quiz', title: 'A Pop Quiz', acts: [2], homeAct: 2, category: 'story', character: 'elder', chain: { id: 'elder', part: 2, of: 3 },
    requires: { flag: 'elder_student' }, forced: true,
    art: 'old grey cat in round spectacles holding a tiny clipboard, a stack of cardboard test sheets, standing on the arm of a sofa',
    setup: ['The Elder Cat has returned with a clipboard.', '"A short quiz," she says. It has forty questions.', 'The first one is: "What is a nap?"'],
    choices: [
      C('Take the quiz', 'You answer honestly. The pencil is chewed by the end.', [chance([
        o(0.6, '"Acceptable," she says, which from her is a standing ovation. You sharpen.', [up('choose'), flag('elder_scholar')]),
        o(0.4, '"Interesting," she says. It is the worst word she knows.', [warmth(-4)])
      ])]),
      C('Ask for the answers (20 Fish)', 'She looks at the Fish for a long time, and then at you. "I did not see that," she says. She did.', [fish(-20), flag('elder_scholar')], { fish: 20 }),
      C('Admit you napped through the first lesson', '"Honesty," she says, "is a form of rest." She hands you a warm blanket.', [warmth(6)])
    ] }),

  E({ id: 'evt_roomba_negotiation', title: 'The Roomba Returns', acts: [2], homeAct: 2, category: 'story', character: 'roomba', chain: { id: 'roomba', part: 2, of: 3 },
    requires: { flag: 'roomba_met' }, forced: true,
    art: 'round grey robot vacuum with a blinking blue ring and a tiny cardboard flag taped on top, rolling across a parlor rug, ominous or friendly depending on color',
    setup: ['The Roomba is in the parlor. It has been in the parlor a while.', 'Its light blinks. It seems to be thinking, in the way that only things with no thoughts can.', 'It has, by all appearances, remembered you.'],
    choices: [
      C('Accept its gift', 'A small spring-loaded bumper, taped to a paper note that says "sorry about before." It was never about before.', [relic('relic_roomba_bumper'), fish(20)], { flag: 'roomba_friend' }),
      C('Face its revenge', 'The Roomba backs up, turns, and raises its voice to a mechanical hum.', [fight('enc_evt_roomba_revenge', 'prowl', { fish: 40, relic: 'uncommon' })], { flag: 'roomba_foe' }),
      C('Offer a truce (20 Fish)', 'You slide Fish across the floor. It sweeps them up. This is, technically, a yes.', [fish(-20), flag('roomba_friend'), unflag('roomba_foe')], { flag: 'roomba_foe' }),
      C('Hide on the shelf and hope', 'It circles the room twice and goes away. You will see it again.', [])
    ] }),

  E({ id: 'evt_kitten_grows', title: 'Pip Has Opinions', acts: [2], homeAct: 2, category: 'story', character: 'kitten', chain: { id: 'kitten', part: 2, of: 3 },
    requires: { flag: 'kitten_adopted' }, forced: true,
    art: 'half-grown grey goblin kitten in a bottle-cap helmet, sitting on a sock drawer like a throne, surrounded by stolen buttons',
    setup: ['Pip has doubled in size and tripled in opinions.', 'It has opened a small business in the sock drawer. The business sells buttons.', 'It has the same teeth. They have not improved.'],
    choices: [
      C('Feed it properly (25 Fish)', 'Pip eats with great ceremony. It gets bigger. The room gets smaller.', [fish(-25), evolve('neutral_goblin_kitten', 'neutral_goblin_cat')], { fish: 25 }),
      C('Let it fend for itself', 'You do. It is a risk and Pip knows it.', [chance([
        o(0.5, 'Pip returns with an entire sock of coins and a smile. It grows as it goes.', [evolve('neutral_goblin_kitten', 'neutral_goblin_cat'), fish(30)]),
        o(0.5, 'Pip is gone. A note says: "Gone to see the world. Back by dinner. Maybe." It is not back by dinner.', [rmSpec('neutral_goblin_kitten')])
      ])]),
      C('Enroll Pip with the Elder', 'The Elder Cat adjusts her spectacles and looks at Pip. Pip looks back. Neither blinks. Both nod.', [evolve('neutral_goblin_kitten', 'neutral_goblin_cat'), lives(1, 'random')], { flag: 'elder_student' })
    ] }),

  E({ id: 'evt_gerald_collector', title: 'Gerald Collects', acts: [2], homeAct: 2, category: 'trade', character: 'gerald', chain: { id: 'gerald_tab', part: 2, of: 2 },
    requires: { flag: 'gerald_debt' }, forced: true,
    art: 'raccoon in a different, slightly darker trench coat, tapping a pocket watch, two smaller raccoons in identical coats behind him',
    setup: ['Gerald has changed coats. He insists it is the same coat.', '"Friend," he says, "your account has matured."', 'He wants 125 percent. Two more raccoons stand behind him with calculators.'],
    choices: [
      C('Pay in full', 'Gerald counts it twice, thumbs the edges, and tips his hat. "Always a pleasure."', [debt(1.25)], { fish: 1 }),
      C('Pay in a card', 'He looks at the card, then the ledger, then the card again. "This is a fair weight," he says, and tears up the page.', [rm('choose', 1), unflag('gerald_debt')]),
      C('Refuse', 'The calculators come out. The raccoons come out. There are, it turns out, a lot of cousins.', [fight('enc_evt_gerald_cousins', 'prowl', { fish: 30, draft: true }), unflag('gerald_debt')]),
      C('Pay half with a compliment', 'You say "That coat suits you." It is the right coat. It might work.', [chance([
        o(0.5, 'He is moved. He forgives half the debt, and the other half is considered paid.', [debt(0.625)]),
        o(0.5, '"The coat," he says quietly, "is not a compliment. It is a disguise." A bad word is written in the ledger.', [curse('curse_wet_sock'), unflag('gerald_debt')])
      ])], { fish: 1 })
    ] }),

  E({ id: 'evt_pigeon_syndicate', title: 'The Pigeon Syndicate', acts: [2], homeAct: 2, category: 'trade', character: 'pigeon',
    art: 'a ring of grey pigeons on a parlor windowsill, the suspicious one in the center with a small stolen watch, curtains half drawn',
    setup: ['Several pigeons stand in a ring on the sill, doing nothing, at length.', 'The suspicious one nods at you. You nod back before you can stop yourself.', '"We have something," it says. "Unattended."'],
    choices: [
      C('Buy the unattended relic (60 Fish)', 'It was left on a bench. It is now on your person. Everyone feels fine about it.', [fish(-60), relicR('uncommon')], { fish: 60 }),
      C('Report them to Gerald', 'Gerald pays for information. The pigeons note it, collectively and without sound.', [fish(30), flag('pigeon_grudge')]),
      C('Join the ring', 'You stand in the circle. Nothing happens, at length. Something is learned.', [warmth(-2), up('random')])
    ] }),

  E({ id: 'evt_gerald_curio', title: "Gerald's Curio Bag", acts: [2], homeAct: 2, category: 'gamble', character: 'gerald',
    art: 'raccoon in trench coat holding up a sealed burlap bag with a question mark on it and a handwritten price tag of 40',
    setup: ['Gerald is holding a sealed bag.', '"Contents: a surprise," he says. "Price: 40."', '"Contents: also a refund policy," he adds. "Which is: no."'],
    choices: [
      C('Buy the bag (40 Fish)', 'The seal breaks. Gerald does not look.', [fish(-40), chance([
        o(0.5, 'Something useful, wrapped in newspaper.', [relicR('common')]),
        o(0.3, 'Something genuinely good. Gerald makes a noise like a kettle.', [relicR('uncommon')]),
        o(0.2, 'A sock. Damp. Somehow worse than it looks.', [curse('curse_wet_sock')])
      ])], { fish: 40 }),
      C('Haggle', 'You open with a low number. Gerald counters with a story.', [chance([
        o(0.5, 'Twenty Fish and a handshake. The bag goes into your paws, the handshake out of your paws.', [fish(-20), relicR('common')]),
        o(0.5, 'He packs the bag away. The conversation is over. He will not discuss it.', [])
      ])]),
      C('Trade a card for it', 'He weighs the card and the bag against each other. They balance, for reasons.', [rm('choose', 1), relicR('common')])
    ] }),

  E({ id: 'evt_laundry_basket', title: 'Warm Laundry', acts: [2, 3], homeAct: 2, category: 'boon',
    art: 'overflowing wicker basket of freshly dried towels and a single mismatched sock draped over the side, steam rising, a cat already half inside',
    setup: ['A basket of warm laundry, left on the sofa, unattended.', 'It is still warm. It has the smell of a human who is not currently home.'],
    choices: [
      C('Nap in it', 'The best decision of the evening. Possibly of the week.', [warmth(12)]),
      C('Build a nest for the clowder', 'Everyone shuffles in. The pile is wide and the sleep is deep.', [lives(1, 'choose'), warmth(4)]),
      C('Steal a sock', 'A symbol of power. A trophy. A risk.', [chance([
        o(0.5, 'There was something in the toe. It was a coin. It was lucky.', [relicR('common')]),
        o(0.5, 'The sock had been worn. It is now a part of you.', [curse('curse_wet_sock')])
      ])])
    ] }),

  E({ id: 'evt_piano_recital', title: 'The Piano', acts: [2], homeAct: 2, category: 'gamble',
    art: 'upright piano in a dim parlor with its lid open, a cat mid-stride across the keys, sheet music scattered, a candle on top',
    setup: ['A piano. A cat on a piano is a concert nobody asked for.', 'It has been tuned. It is about to be retuned by a professional.'],
    choices: [
      C('Walk across it', 'A short piece in C major, then C minor, then no key at all. The audience tips.', [fish(20)]),
      C('Perform the Nocturne at 3AM', 'You commit. The house wakes. The neighbors consider options.', [chance([
        o(0.5, 'A standing ovation from one woken human, a rare thing. You feel improved and richer.', [up('random'), fish(20)]),
        o(0.5, 'A complaint is filed. A bath is scheduled. The piano is unhurt.', [curse('bath_time')])
      ])]),
      C('Close the lid and nap on it', 'It is warm from the lamp. The lid is not a bad bed.', [warmth(8)])
    ] }),

  E({ id: 'evt_seance_saucer', title: 'The Seance Saucer', acts: [2], homeAct: 2, category: 'gamble', livesGamble: true,
    art: 'blue-tinted saucer of water on a table, the reflection showing nine cat faces while only eight cats stand over it, candle flicker',
    setup: ['A saucer of water that shows the wrong reflection.', 'Eight faces look back. You count nine.', 'The ninth one is yours, and it looks calm.'],
    choices: [
      C('Offer one life for a question', 'The water ripples. A cat steps back, lighter by a life, with a small gift.', [lives(-1, 'choose'), relicR('uncommon')], { catLives: 2 }),
      C('Offer two lives for the answer', 'The water goes dark. The gift is large. The cat is quiet for the rest of the night.', [lives(-2, 'choose'), relicR('rare')], { catLives: 3 }),
      C('Ask the reflection for a loan', 'It considers. It looks at you for a long time.', [chance([
        o(0.5, 'The reflection nods. A life is delivered, warm, folded neatly.', [lives(2, 'choose')]),
        o(0.5, 'The reflection shrugs, and takes two. It was a bad idea, and it knew it.', [lives(-2, 'choose')])
      ])], { catLives: 3 }),
      C('Leave the water alone', 'Some saucers are best left full.', [])
    ] }),

  E({ id: 'evt_pigeon_dice', title: 'The Pigeon Has Dice', acts: [2], homeAct: 2, category: 'gamble', livesGamble: true, character: 'pigeon',
    art: 'pigeon behind a small crate table, a plastic cup, three bone dice, a chalkboard behind it reading LIVES with tally marks',
    setup: ['The pigeon has a cup, three dice and a chalkboard.', 'The chalkboard says LIVES. The tally under it is long.', '"House rules," it says. "The house is me."'],
    choices: [
      C('Bet a life', 'You roll. The cup is shaken for longer than strictly necessary.', [chance([
        o(0.5, 'Triple six. The pigeon is silent. A life is returned, with interest.', [lives(2, 'choose')]),
        o(0.5, 'The dice show a face you do not recognize. A life is spent.', [lives(-1, 'choose')])
      ])], { catLives: 2 }),
      C('Bet 30 Fish', 'A less personal wager.', [chance([
        o(0.45, 'The dice fall your way. The pigeon pays out with the expression of a man being mugged.', [fish(80)]),
        o(0.55, 'The pigeon wins. It does not gloat. It does something worse: it looks relieved.', [fish(-30)])
      ])], { fish: 30 }),
      C('Check the dice', 'You pick one up, sniff it, and press a claw into it.', [chance([
        o(0.7, 'Loaded. The pigeon explodes into feathers and flees. It leaves a feather behind, in shame.', [relic('relic_pigeon_feather')]),
        o(0.3, 'They are fair. The pigeon is offended, and says so in a way that costs you.', [warmth(-5)])
      ])]),
      C('Walk away', 'The pigeon watches you leave. It makes a mark on the chalkboard.', [])
    ] }),

  E({ id: 'evt_curtain_climb', title: 'The Curtain', acts: [2], homeAct: 2, category: 'gamble',
    art: 'floor-to-ceiling heavy velvet curtain, a cat dangling midway with claws extended, the rail high above, afternoon light behind it',
    setup: ['Curtains. Floor to ceiling. A pole at the top.', 'Gravity has a position on this. You have a counter-position.'],
    choices: [
      C('Climb to the rail', 'Each foot is a plan. Each plan is mostly claws.', [chance([
        o(0.65, 'At the top there is a small object, left by a previous cat. You were not the first.', [relicR('common')]),
        o(0.35, 'The curtain comes down with you in it. You are the curtain now.', [warmth(-6)])
      ])]),
      C('Climb halfway and call it a day', 'You hang there for a bit. A coin falls out of a fold.', [fish(15)]),
      C('Wait for the curtain to move', 'It does, eventually. A breeze. You feel it in your whiskers.', [warmth(3)])
    ] }),

  E({ id: 'evt_fish_tank', title: 'The Aquarium', acts: [2, 3], homeAct: 2, category: 'gamble',
    art: 'glowing rectangular fish tank on a sideboard, orange fish glaring through the glass, a cat with one paw on the lid',
    setup: ['An aquarium. The fish inside are looking back with hostility.', 'The lid is not firmly on.', 'You have thoughts about this.'],
    choices: [
      C('Fish for a fish', 'A paw goes in. The water has views on this.', [chance([
        o(0.55, 'A fat orange fish, caught and not killed. A deal is struck: it will be released for a fee.', [fish(40)]),
        o(0.45, 'It was a fast fish. You are wet and disappointed.', [warmth(-5)])
      ])]),
      C('Sit and watch', 'This is the closest thing to television the house provides.', [warmth(6)]),
      C('Free the largest fish', 'It looks at you. It has seen things. It has a debt now.', [chance([
        o(0.35, 'It returns a month later with a pearl it should not have. You do not ask.', [relicR('uncommon')]),
        o(0.65, 'It is grateful, and shows it by blowing a small bubble. A coin floats up in it.', [fish(10)])
      ])])
    ] }),

  E({ id: 'evt_cucumber', title: 'The Cucumber', acts: [2], homeAct: 2, category: 'gamble',
    art: 'a single green cucumber sitting alone on a tile floor behind a startled cat, cat mid-air with arched back, comic tension',
    setup: ['Behind you. Quietly.', 'It was just there.', 'Nobody put it there. It simply arrived, in the manner of cucumbers.'],
    choices: [
      C('Panic', 'You leave the room at speed. Adrenaline is a kind of education.', [warmth(-5), up('random')]),
      C('Stare it down', 'A long, wordless duel, at the end of which one party moves.', [chance([
        o(0.5, 'The cucumber does not move. You do not move. Something is learned about each other.', [maxW(2)]),
        o(0.5, 'The cucumber moved. Nobody saw it. You see it now.', [warmth(-6)])
      ])]),
      C('Knock it off the counter', 'It was, in fact, the right call. Something rolls out of it.', [fish(10), addCard('off_the_shelf')])
    ] }),

  E({ id: 'evt_dust_bunnies', title: 'Under the Sofa', acts: [2], homeAct: 2, category: 'fight',
    art: 'cluster of fluffy grey dust bunnies with tiny button eyes and a flag made from a lint scrap, emerging from under a plaid sofa',
    setup: ['Under the sofa: a civilization of dust bunnies in a loose confederation.', 'They have a flag. It is lint.', 'They have been here since before you.'],
    choices: [
      C('Sneeze at them', 'A great sneeze. The flag is knocked flat. The confederation takes it personally.', [fight('enc_evt_dust_bunnies', 'prowl', { fish: 35, relic: 'common' })]),
      C("Borrow Gerald's broom (15 Fish)", 'A fair arrangement. The bunnies go, the broom goes back, and a little pile of coins is left behind.', [fish(-15), fish(35)], { fish: 15 }),
      C('Parley', 'You sit and lick a paw. A signal of peaceful intent.', [chance([
        o(0.5, 'They pay a tribute in the form of one old sock of coins.', [fish(25)]),
        o(0.5, 'They do not accept your terms.', [fight('enc_evt_dust_bunnies', 'prowl', { fish: 35, relic: 'common' })])
      ])])
    ] }),

  E({ id: 'evt_mirror_cat', title: 'The Mirror', acts: [2, 3], homeAct: 2, category: 'story',
    art: 'tall ornate mirror in a parlor corner, the reflected cat standing a little taller and sharper than the real one, faint silver outline',
    setup: ['A mirror. The cat in it has an excellent deck.', 'It looks you over, finds you passable, and offers a nod.'],
    choices: [
      C('Copy something', 'You point at a card. The reflection makes a copy and hands it through the glass, grudgingly.', [warmth(-4), dup()]),
      C('Hiss at it', 'It hisses back, improved. You take the improvement.', [up('random')]),
      C('Look away', 'The reflection shrugs. You feel a little better for not having had to decide.', [warmth(4)])
    ] }),

  E({ id: 'evt_hairball_gallery', title: 'The Hairball Gallery', acts: [2], homeAct: 2, category: 'trade',
    art: 'tiny gallery corner of the parlor, a hairball on a pedestal under a glass dome with a small brass plaque, a cat in a beret critiquing',
    setup: ['Someone has put a hairball in a frame.', 'There is a small card next to it: "Untitled, Cat."', 'Three cats are gathered around it, nodding slowly.'],
    choices: [
      C('Leave a review', 'Four paws, glowing. The artist is grateful, and tips.', [fish(15)]),
      C('Submit your own', 'You contribute a piece. The committee deliberates.', [warmth(-3), chance([
        o(0.5, 'Accepted. A prize is mentioned, and it is paid.', [fish(45)]),
        o(0.5, 'Rejected. "Too representational," says one cat, and sniffs.', [])
      ])]),
      C('Eat the exhibit', 'The gallery gasps. You do not. It was not very good.', [warmth(5), curse('curse_wet_sock')])
    ] }),

  /* ================= ACT 3: THE ATTIC AND ROOF ================= */

  E({ id: 'evt_elder_graduation', title: 'Graduation', acts: [3], homeAct: 3, category: 'story', character: 'elder', chain: { id: 'elder', part: 3, of: 3 },
    requires: { flag: 'elder_student' }, forced: true,
    art: 'old grey cat in round spectacles standing on a wooden trunk in the attic, a small paper diploma tied with yarn in her paw, motes in the light',
    setup: ['The Elder Cat is in the attic, in a small mortarboard.', '"It is traditional," she says. "I am told."', 'She has prepared a short speech. It is not short.'],
    choices: [
      C('Receive her spectacles', 'She takes them off. She hands them over. You see everything, for the first time, slightly sooner.', [relic('relic_elder_spectacles')], { flag: 'elder_scholar' }),
      C('Accept a warm hug', 'She does not hug. She pats once. The whole clowder feels it.', [lives(1, 'all')]),
      C('Ask a final question', '"Why do we do all this?" She considers. "The sun," she says. "It asked nicely."', [maxW(3)])
    ] }),

  E({ id: 'evt_roomba_return', title: 'The Roomba, Again', acts: [3], homeAct: 3, category: 'story', character: 'roomba', chain: { id: 'roomba', part: 3, of: 3 },
    requires: { flag: 'roomba_met' }, forced: true,
    art: 'upgraded round vacuum robot with a taped-on antenna, blinking red or blue light, riding up an attic ramp, tiny rolling mop attachment',
    setup: ['The Roomba has made it to the attic.', 'It has acquired an antenna, a mop attachment and a certain gravitas.', 'Its light flickers. It is trying to tell you something, and failing in machine.'],
    choices: [
      C('Climb on, it knows the way', 'It does. It carries you through every dusty corner to a place you could not have found alone.', [up('choose'), warmth(10)], { flag: 'roomba_friend' }),
      C('Face the Mk II', 'It beeps once. It is an old argument, and neither of you remembers why.', [fight('enc_evt_roomba_mk2', 'elite', { fish: 70, relic: 'rare' })], { flag: 'roomba_foe' }),
      C('Ask it to clear out a bad habit (15 Fish)', 'It sucks up something from your deck with an apologetic noise and rolls on.', [fish(-15), rm('choose', 1)], { fish: 15 })
    ] }),

  E({ id: 'evt_kitten_finale', title: 'Pip, Ascendant', acts: [3], homeAct: 3, category: 'story', character: 'kitten', chain: { id: 'kitten', part: 3, of: 3 },
    requires: { flag: 'kitten_adopted' }, forced: true,
    art: 'full-grown goblin cat in a bottle-cap crown on a throne of stacked books, three mice attendants, a spoon held as a royal staff',
    setup: ['Pip is a goblin of standing now. It has an army of three mice.', 'It has a bottle-cap crown and a seat on the attic council.', 'It sees you and does not look away. It never has.'],
    choices: [
      C("Make Pip your champion's apprentice", 'Pip nods, once. It will do. It will do everything.', [evolve('neutral_goblin_cat', 'neutral_goblin_king')]),
      C('Take its crown as tribute', 'You lift it off and Pip lets you. It looks at you, then at the door, and goes. You hold the crown.', [fish(50), rmSpec('neutral_goblin_cat')]),
      C('Ask Pip to share the throne', 'It considers. It tilts its head.', [chance([
        o(0.5, 'Pip agrees. It grows, and shares its treasury with you.', [evolve('neutral_goblin_cat', 'neutral_goblin_king'), relicR('uncommon')]),
        o(0.5, 'Pip declines, the way a king declines. Something small and awful is left on your cushion.', [curse('curse_wet_sock')])
      ])])
    ] }),

  E({ id: 'evt_gerald_closing', title: 'Everything Must Go', acts: [3], homeAct: 3, category: 'trade', character: 'gerald',
    art: 'raccoon in a singed trench coat beside a smoking cart of goods with a hand-painted sign reading EVERYTHING MUST GO, small flames at the corner',
    setup: ["Gerald's cart is, he says, on fire. \"Mostly,\" he adds.", 'The sign reads EVERYTHING MUST GO. He has crossed out MUST and written WILL.', 'He is smiling. He is smoking slightly.'],
    choices: [
      C('Buy a rare relic (120 Fish)', 'He hands it over in a glove. The glove is on fire too. It is a good relic.', [fish(-120), relicR('rare')], { fish: 120 }),
      C('Catch what falls off', 'You stand under the cart. Things fall. Some of them are good.', [chance([
        o(0.5, 'A tin of something, perfectly good, and a shoe.', [fish(40)]),
        o(0.5, 'A burning something. Not good. A little singeing.', [warmth(-5)])
      ])]),
      C('Sell him your worst card', 'He takes it. He looks at it. He puts it on the fire to see if it burns.', [rm('choose', 1), fish(30)]),
      C('Help put it out', 'You get wet. You get ash. Gerald is quietly moved.', [warmth(-4), fish(25)])
    ] }),

  E({ id: 'evt_pigeon_reveal', title: 'The Pigeon Knows', acts: [3], homeAct: 3, category: 'gamble', character: 'pigeon',
    art: 'a pigeon perched on an attic rafter in a shaft of dusty light, a small notebook clutched in one foot, all-seeing yellow eye',
    setup: ['The pigeon is on the attic beam. It has been here the whole time.', 'It has also been everywhere else the whole time.', '"I know about the boss," it says. "Everyone knows. Nobody says."'],
    choices: [
      C('Ask for the truth (20 Fish)', 'It tells you. It tells you very quickly, and then pretends not to have.', [fish(-20), flag('boss_intel')], { fish: 20 }),
      C('Accept a feather', 'It offers one. It could be a trick. It could be a peace offering.', [chance([
        o(0.6, 'A good feather. You take it, you are changed.', [relic('relic_pigeon_feather')]),
        o(0.4, 'The feather was attached to the pigeon, and it did not enjoy that.', [warmth(-4)])
      ])]),
      C('Face the flock', 'The flock arrives. It had been hovering.', [fight('enc_evt_pigeon_flock', 'prowl', { fish: 50, relic: 'uncommon' })], { flag: 'pigeon_grudge' }),
      C('Leave', 'It watches you leave with its head tilted. It makes a mark in the notebook.', [])
    ] }),

  E({ id: 'evt_last_ledger', title: 'The Last Life Auction', acts: [3], homeAct: 3, category: 'gamble', livesGamble: true,
    art: 'a Persian cat auctioneer in a waistcoat behind a small gavel and lectern in the attic, rows of cats holding paddles, one lot glowing on a cushion',
    setup: ['An auction in the attic. The auctioneer is a Persian in a waistcoat.', 'Today\'s lot is a single relic of great age.', 'Accepted currency: Fish, favors, and lives. He specifically says "lives" twice.'],
    choices: [
      C('Bid one life', 'A cat raises its paw. The gavel falls. The relic is yours, and so is the quiet.', [lives(-1, 'choose'), relicR('rare')], { catLives: 2 }),
      C('Bid two lives, for the full set', 'A cat raises both paws, gravely. The lot, and a note of applause, are theirs.', [lives(-2, 'choose'), relicR('rare'), up('choose')], { catLives: 3 }),
      C('Outbid with Fish (80)', 'You wave the paddle. The Persian approves of a transaction without a death in it.', [fish(-80), relicR('rare')], { fish: 80 }),
      C('Hold the paddle and sneeze', 'You sneeze. The gavel falls. Nobody is sure what you bid.', [chance([
        o(0.5, 'You bid a bargain. A lesser relic, free.', [relicR('uncommon')]),
        o(0.5, 'You bid nothing. The auctioneer fines you for loitering.', [curse('curse_wet_sock')])
      ])])
    ] }),

  E({ id: 'evt_roof_midnight', title: 'The Roof at Midnight', acts: [3], homeAct: 3, category: 'gamble', livesGamble: true,
    art: 'a steep slate roof under an enormous violet moon, chimney silhouette, a champion cat on the ridgeline with eyes glowing, scattered stars',
    setup: ['The roof, midnight, the moon exactly overhead.', 'The shingles remember a thousand cats who did this.', 'It is time to be a cat.'],
    choices: [
      C('Howl at the moon', 'You do. It is the loudest sound the house has heard since the vacuum.', [chance([
        o(0.6, 'The moon answers. Your champion stands taller. The night remembers it.', [lives(2, 'champion')]),
        o(0.4, 'The neighbors answer. A life is spent in embarrassment.', [lives(-1, 'random'), warmth(5)])
      ])]),
      C('Walk the ridgeline', 'A cat picks its way along the roof. A life is on the line, as a tradition.', [lives(-1, 'choose'), relicR('uncommon')], { catLives: 2 }),
      C('Commune with the moon', 'Moonwhiskers know this particular silence.', [lives(-1, 'choose'), relicR('rare')], { clan: 'moon', catLives: 2 }),
      C('Sit with the moon', 'You sit. It is a good moon. It warms nothing, but it is good.', [warmth(8)])
    ] }),

  E({ id: 'evt_trunk_of_memories', title: 'The Old Trunk', acts: [3], homeAct: 3, category: 'boon',
    art: 'ancient leather trunk with brass corners open in the attic, pale light spilling out of it, a folded blanket and a ribbon on top',
    setup: ['An old trunk in the attic. It smells of cedar and someone else\'s grandmother.', 'The lid is ajar. Something inside has been waiting.'],
    choices: [
      C('Open it carefully', 'A folded certificate and a chipped medal. You carry them both for a while.', [up('choose')]),
      C('Rummage', 'A messy, enthusiastic search.', [chance([
        o(0.5, 'At the bottom: a small, heavy thing. You know it is good before you know what it is.', [relicR('uncommon')]),
        o(0.5, 'Moths. A lot of moths. They have taken an interest in your coat.', [curse('bath_time')])
      ])]),
      C('Sit on it', 'The trunk is warm. It has been waiting for this.', [warmth(6)]),
      C('Take the blanket', 'It is soft, old, and folded exactly right.', [lives(1, 'choose')])
    ] }),

  E({ id: 'evt_dollhouse', title: 'The Dollhouse', acts: [3], homeAct: 3, category: 'gamble',
    art: 'a three-story dollhouse in the attic with tiny furniture, a cat looking at it from behind, one paw pressed on the roof',
    setup: ['A dollhouse. To scale, it is slightly better than the real house.', 'It has a sunbeam of its own. A tiny one.'],
    choices: [
      C('Move a cat in', 'A single, very serious cat lies down in the tiny bed. The rest of the clowder is left quiet.', [warmth(4), addCard('cardboard_box')]),
      C('Rearrange the furniture', 'A long evening. You come away with spare coins.', [fish(25)]),
      C('Knock the roof off', 'It comes away with a satisfying click.', [chance([
        o(0.5, 'There is something inside. It is small and a little proud.', [relicR('common')]),
        o(0.5, 'There was nothing inside, and the roof is now on your foot.', [warmth(-4)])
      ])])
    ] }),

  E({ id: 'evt_vet_postcard', title: 'A Postcard from the Vet', acts: [3], homeAct: 3, category: 'trade',
    art: 'a pastel postcard with a smiling cartoon carrier on it, slid under an attic door, a cat flinching at the sight of it',
    setup: ['A postcard has arrived from the vet.', 'It is addressed to every cat in the house.', 'It mentions the word "annual."'],
    choices: [
      C('Hide it', 'Out of sight. Not out of mind. The postcard is replaced by a smaller version of itself.', [curse('vet_appointment'), fish(30)]),
      C('Attend, briefly', 'It goes better than expected. A bad memory is cleared. Warmth is spent.', [warmth(-6), rmCurse()], { curses: 1 }),
      C('Shred it', 'A sound like a very small applause. Fish drifts out of the envelope.', [fish(10)])
    ] }),

  E({ id: 'evt_chandelier_spiders', title: 'The Chandelier', acts: [3], homeAct: 3, category: 'fight',
    art: 'cobwebbed crystal chandelier in a dim attic, a large spider with tiny spectacles on a silk thread, tiny spiders rappelling around it',
    setup: ['Cobwebs, a chandelier, and a spider who has noticed you.', 'He has spectacles. He has a ledger. He has family.', '"A moment of your time," he says. He means all of it.'],
    choices: [
      C('Take on the web', 'The chandelier shivers. So does everything in it.', [fight('enc_evt_chandelier_spiders', 'prowl', { fish: 50, relic: 'uncommon' })]),
      C('Tiptoe past', 'Delicate paws. A breath held. A strand brushes your ear.', [warmth(-4)]),
      C('Offer a Fish (30)', 'The spider examines it, notes it, and returns a small gift for a courteous guest.', [fish(-30), up('random')], { fish: 30 })
    ] }),

  E({ id: 'evt_suspicious_fern', title: 'The Fern', acts: [3], homeAct: 3, category: 'gamble',
    art: 'a leafy potted fern with feathery fronds on an attic windowsill, one frond bitten, a cat considering it with sidelong eyes',
    setup: ['A plant. Green. In a pot. Looks edible.', 'It is not clear who owns it. It is clear that someone loves it.'],
    choices: [
      C('Eat it', 'A confident chomp. You are about to find out.', [chance([
        o(0.5, 'Delicious, in a leafy way. Warmth rises.', [warmth(15)]),
        o(0.5, 'Not food. Your stomach files a complaint. It is eventually upheld.', [warmth(-6), curse('curse_wet_sock')])
      ])]),
      C('Eat only the tips', 'Cautious. Mature. A mild flavor.', [warmth(4)]),
      C('Knock it over', 'It falls. A coin rolls out of the soil.', [fish(20)])
    ] }),

  E({ id: 'evt_old_photograph', title: 'A Framed Photograph', acts: [2, 3], homeAct: 3, category: 'boon',
    art: 'a dusty framed photograph of a champion cat from years ago, same unimpressed expression, lit by a window in the attic',
    setup: ['A framed photograph: your champion, years ago.', 'They look exactly the same. They look exactly as unimpressed.'],
    choices: [
      C('Take it with you', 'It hangs in the hallway of your head. Warmth, a little, is its work.', [maxW(2)]),
      C('Ask your champion about it', 'They look at it for a long time. "That was a good week," they say, and nothing more.', [lives(1, 'champion')]),
      C('Sell the frame', 'Gerald would call it "vintage." It is, at minimum, a frame.', [fish(35)])
    ] }),

  E({ id: 'evt_dot_cult', title: 'The Congregation', acts: [3], homeAct: 3, category: 'gamble',
    art: 'a dim attic wall with a single red laser dot, a ring of cats sitting rigid in a semicircle, all heads turned the same way',
    setup: ['In the attic, a ring of cats is watching a red dot on the wall.', 'It moves. They do not.', 'A cat at the back is taking notes.'],
    choices: [
      C('Join the congregation', 'You sit. You watch. The dot goes where it goes.', [chance([
        o(0.5, 'The dot stops. For a moment, the whole ring breathes out. You are reminded of something.', [warmth(10), maxW(2)]),
        o(0.5, 'The dot moves very fast and you move with it. You come back later with a headache.', [warmth(-8)])
      ])]),
      C('Switch off the pointer', 'You find the little battery. The dot goes dark. Every cat in the ring blinks at once.', [fish(10), flag('red_dot_dim')]),
      C('Leave them to it', 'They will be there tomorrow. They will be there in a hundred years.', [])
    ] }),

  E({ id: 'evt_attic_vent', title: 'The Warm Vent', acts: [3], homeAct: 3, category: 'boon',
    art: 'a floor vent in an attic with warm air shimmering above it, four cats already curled together on the grille, one empty spot',
    setup: ['A warm vent in the attic floor, in the middle of winter.', 'Your colleagues have already claimed it.', 'There is one spot left. It is the center spot.'],
    choices: [
      C('Take the best spot', 'You do. A quiet, uncontested victory.', [warmth(14)]),
      C('Share the vent', 'A little room made for a late arrival. A kind gesture. A good fit.', [warmth(6), lives(1, 'random')]),
      C('Move them along', 'A few indignant stares. A few grudging shuffles. You win, in a petty way.', [warmth(8), fish(10)])
    ] }),

  E({ id: 'evt_night_before', title: 'The Night Before the Night', acts: [3], homeAct: 3, category: 'story',
    art: 'a quiet attic window with a pink and orange dawn beginning, a cat silhouette preparing, a lantern, a folded map',
    setup: ['The last evening before Night 9.', 'The house is quiet. The Sunbeam is quieter.', 'You have until the light changes.'],
    choices: [
      C('Rest', 'You curl up. For a few hours, the house is not at war.', [warmth(10)]),
      C('Sharpen your claws', 'A slow rasp on the beam. The wood remembers.', [warmth(-3), up('choose')]),
      C('Raid the pantry', 'A big supper. A little shame. Unlikely to be the last.', [fish(40), curse('curse_wet_sock')]),
      C('Make peace with a bad habit', 'You write it down and let it go. It goes.', [rm('choose', 1)])
    ] })
  ];

  return list;
})();
