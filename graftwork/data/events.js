// Events: { id, name, act: 0 (any)|1|2|3, text, art?, choices: [{ label, text, cond?(run), pick?, pickFilter?, apply(run, R, inst) -> resultText }] }  R = engine/run.js helper API
const leave = (msg) => ({ label: 'Walk away', text: 'Nothing happens.', apply: () => msg || 'You leave. Nobody objects.' });
const grafted = (i) => i.grafts.length > 0;
const bareCount = (run) => { let n = 0; for (const i of run.deck) if (i.grafts.length === 0 && !i.id.startsWith('j_')) n++; return n; };
// A Bare card re-filed under a fresh uid: Tithe picks cheapest then OLDEST, so the new uid goes to the back of its cost.
const refile = (run, R, inst) => { const id = inst.id, up = inst.up; R.removeCard(run, inst.uid); R.addCard(run, id); const n = run.deck[run.deck.length - 1]; if (up) R.upgrade(run, n.uid); if (run.flags.mem && run.flags.mem.uid === inst.uid) run.flags.mem.uid = n.uid; };
// Replace every graft on a card with the same number of random ones.
const rerollCard = (run, R, inst) => { const n = inst.grafts.length; for (const g of inst.grafts.slice()) R.stripGraft(run, inst.uid, g); let k = 0; for (let j = 0; j < n; j++) if (R.addGraftRandom(run, inst.uid)) k++; return k; };

export const EVENT_LIST = [
  // ---------------- ANY ACT ----------------
  {
    id: 'e_second_hand_surgeon', name: 'The Second-Hand Surgeon', act: 0,
    text: 'A surgeon sits on an upturned crate, sharpening something that is not a knife. He will take a graft off any card for free. He keeps nothing. He just likes the sound.',
    choices: [
      { label: 'Strip a graft', text: 'Remove the last graft from a grafted card, free. Heal 6 as his gift.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted),
        apply: (run, R, inst) => { R.stripGraft(run, inst.uid, inst.grafts[inst.grafts.length - 1]); R.heal(run, 6); return 'The graft comes away clean. He hands you the boon as a gift, warm. You heal 6.'; } },
      leave('He nods. The sharpening resumes.'),
    ],
  },
  {
    id: 'e_back_alley_swap', name: 'Back-Alley Swap', act: 0,
    text: 'A man in a long coat opens it. Inside, hundreds of tiny stitched seams. "Moving house?" he asks. "I move grafts."',
    choices: [
      { label: 'Move a graft (20 gold)', text: 'Pay 20 gold. Move the last graft of a grafted card onto another card with room (the first one he finds).', pick: 'card', pickFilter: grafted,
        cond: (run) => run.gold >= 20 && run.deck.some(grafted) && run.deck.length > 1,
        apply: (run, R, inst) => {
          const room = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length < 2);
          if (!room.length) return 'He looks over your deck, shrugs, and keeps his hands in his coat. No charge.';
          const dest = room[0];
          const gid = inst.grafts[inst.grafts.length - 1];
          R.gold(run, -20); R.stripGraft(run, inst.uid, gid); R.addGraft(run, dest.uid, gid);
          return 'Thread, scissors, a wet sound. The graft now lives on a different card. It does not seem to mind. You paid 20 gold.';
        } },
      leave('The coat closes. So does the conversation.'),
    ],
  },
  {
    id: 'e_overload_stranger', name: 'A Generous Stranger', act: 0,
    text: 'The stranger smiles with too many teeth for the room. "Third graft," he says, "on the house." He does not say which house.',
    choices: [
      { label: 'Accept an Overload', text: 'Pick a card with 2 grafts. Add a third graft (Overload, x1.5 numbers). 50% it shatters at once and the card is destroyed.', pick: 'card',
        pickFilter: (i) => i.grafts.length === 2, cond: (run) => run.deck.some((i) => i.grafts.length === 2),
        apply: (run, R, inst) => { R.addGraft(run, inst.uid, 'g_quick_hands'); if (R.rng(run).chance(0.5)) { R.removeCard(run, inst.uid); return 'He presses your thumb to the card. It sings, then shatters. The card is gone for the run. He keeps the pieces.'; } return 'He presses your thumb to the card. It holds. It hums. It is Overloaded and very pleased.'; } },
      { label: 'Take a graft normally', text: 'Choose a graft for a card as after a fight. He sulks.', apply: (run, R) => { R.queueGraftPick(run); return 'He sulks, professionally.'; } },
      leave('"Another time," he says. He has said this before.'),
    ],
  },
  {
    id: 'e_budget_loan', name: 'The Budget Office', act: 0,
    text: 'A small desk. A smaller clerk. A form that asks for blood in a box marked Other. "We can raise your Budget," she says. "Everyone pays something."',
    choices: [
      { label: 'Sign (+2 Budget, -8 max HP)', text: 'Gain 2 Budget permanently. Lose 8 max HP.', apply: (run, R) => { R.budget(run, 2); R.maxHp(run, -8); return 'You sign. Your Budget grows by 2 and your maximum HP shrinks by 8.'; } },
      { label: 'Sign the small form (+1 Budget, -3 max HP)', text: 'Gain 1 Budget. Lose 3 max HP.', apply: (run, R) => { R.budget(run, 1); R.maxHp(run, -3); return 'A smaller signature, a smaller loss. +1 Budget, -3 max HP.'; } },
      leave('She stamps something anyway. You choose not to read it.'),
    ],
  },
  {
    id: 'e_tithe_collector', name: 'The Tithe Collector', act: 0,
    text: 'She wears a collar of receipts. She does not ask for a donation, she describes it. "Your Bare cards will be glad to help."',
    choices: [
      { label: 'Pay the Tithe (+90 gold, -1 Budget)', text: 'Gain 90 gold. Lose 1 Budget permanently, which pushes grafts into Strain and hurts Bare cards.', apply: (run, R) => { R.gold(run, 90); R.budget(run, -1); return 'You receive 90 gold. Your Budget drops by 1. Somewhere, a Bare card sighs.'; } },
      { label: 'Pay in blood (+45 gold, -4 HP)', text: 'Gain 45 gold. Lose 4 HP.', apply: (run, R) => { R.gold(run, 45); R.hurt(run, 4); return 'A small cut, a small purse. +45 gold, -4 HP.'; } },
      leave('She writes your name down anyway, in pencil.'),
    ],
  },
  {
    id: 'e_second_copy', name: 'The Photocopier', act: 0,
    text: 'A humming machine in a corridor with no office. A sign says COPY ONE CARD. Another sign, lower, says THE COPY WILL REMEMBER.',
    choices: [
      { label: 'Copy a card (30 gold)', text: 'Pay 30 gold. Add a plain second copy of a chosen card to the deck.', pick: 'card', cond: (run) => run.gold >= 30 && run.deck.length > 0,
        apply: (run, R, inst) => { R.gold(run, -30); R.addCard(run, inst.id); return 'The machine hums, then coughs out a card slightly warmer than the first. 30 gold paid. It has no grafts yet.'; } },
      { label: 'Copy a card (8 HP)', text: 'Lose 8 HP. Add a plain second copy of a chosen card.', pick: 'card', cond: (run) => run.hp > 12 && run.deck.length > 0,
        apply: (run, R, inst) => { R.hurt(run, 8); R.addCard(run, inst.id); return 'The machine takes 8 HP and prints a copy. It is not sure whose.'; } },
      leave('The machine hums at your back for a while.'),
    ],
  },
  {
    id: 'e_free_polish', name: 'A Tidy Apprentice', act: 0,
    text: 'An apprentice offers to improve one of your cards. She has her tongue between her teeth. It is her first week and it shows, positively.',
    choices: [
      { label: 'Let her upgrade a card', text: 'Upgrade one card, free.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.upgrade(run, inst.uid); return 'She works carefully. The card is better. She cries a little, from pride.'; } },
      leave('She salutes the wrong person.'),
    ],
  },
  {
    id: 'e_coin_flip', name: 'Heads, Tails, Teeth', act: 0,
    text: 'A coin sits on a plinth. A plaque reads: DOUBLE OR NOTHING. A smaller plaque reads: NOTHING IS NOT NOTHING.',
    choices: [
      { label: 'Flip for 40 gold (50%)', text: 'Pay 40 gold. 50% chance to win 100 gold. Otherwise lose the stake.', cond: (run) => run.gold >= 40,
        apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.gold(run, 100); return 'Heads. The coin returns with friends. +100 gold.'; } R.gold(run, -40); return 'Tails. The coin keeps your 40 gold and does not thank you.'; } },
      { label: 'Flip for blood (50%)', text: '50% chance to gain a random potion. Otherwise lose 6 HP.',
        apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.addPotion(run, null); return 'Heads. A potion drops from the ceiling into your hand.'; } R.hurt(run, 6); return 'Tails. You lose 6 HP.'; } },
      leave('The coin spins by itself for a while, then stops, disappointed.'),
    ],
  },
  {
    id: 'e_relic_trade', name: 'The Relic Pawnbroker', act: 0,
    text: 'The pawnbroker examines your pockets with a loupe. "That one," he says, pointing at nothing you own yet. "I will swap you."',
    choices: [
      { label: 'Trade 60 gold for a relic', text: 'Pay 60 gold. Gain a random relic.', cond: (run) => run.gold >= 60, apply: (run, R) => { R.gold(run, -60); R.addRelic(run, null); return 'He wraps it in a newspaper from a year that has not happened. -60 gold.'; } },
      { label: 'Trade 10 max HP for a relic', text: 'Lose 10 max HP. Gain a random relic.', cond: (run) => run.maxHp > 30, apply: (run, R) => { R.maxHp(run, -10); R.addRelic(run, null); return 'He weighs you, nods, and slides a relic across. -10 max HP.'; } },
      leave('"Come back when you are heavier," he says.'),
    ],
  },
  {
    id: 'e_gift_basket', name: 'Get Well Basket', act: 0,
    text: 'A wicker basket sits on the path with a card attached. It reads: FOR WHOEVER NEEDS IT MOST. You are fairly sure that is you.',
    choices: [
      { label: 'Take the potion', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'You take a potion. The basket seems lighter, and relieved.'; } },
      { label: 'Eat the grapes', text: 'Heal 10 HP.', apply: (run, R) => { R.heal(run, 10); return 'The grapes are fine. You heal 10 HP. One is a tooth.'; } },
      leave('You leave it for someone worse off. The basket remains unconvinced.'),
    ],
  },

  // ---------------- ACT I: THE WARD ----------------
  {
    id: 'e_vending_machine', name: 'The Vending Machine', act: 1,
    text: 'It hums between two gurneys, glowing the color of weak tea. Row C sells grafts. The coin slot also accepts, according to the label, "other."',
    choices: [
      { label: 'Buy a graft (50 gold)', text: 'Pay 50 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 50, apply: (run, R) => { R.gold(run, -50); R.queueGraftPick(run); return 'A clunk. A graft drops into the tray, still warm. -50 gold.'; } },
      { label: 'Pay in HP (10 HP)', text: 'Lose 10 HP. A normal graft reward screen follows.', cond: (run) => run.hp > 14, apply: (run, R) => { R.hurt(run, 10); R.queueGraftPick(run); return 'The slot takes 10 HP and a little more. A graft drops.'; } },
      leave('The machine blinks. Out of order, it admits, to nobody.'),
    ],
  },
  {
    id: 'e_night_shift', name: 'Night Shift', act: 1,
    text: 'The ward at 3 a.m. A nurse looks up from a clipboard and asks if you have been sleeping. You lie. She writes that down too.',
    choices: [
      { label: 'Take a bed (-20 gold)', text: 'Pay 20 gold. Heal 18 HP.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.heal(run, 18); return 'Clean sheets, one pillow, no questions. You heal 18 HP. -20 gold.'; } },
      { label: 'Nap on a gurney', text: 'Heal 8 HP.', apply: (run, R) => { R.heal(run, 8); return 'The gurney rolls slowly toward the elevator the whole time. You heal 8 HP.'; } },
      leave('"Hydrate," she says, to your back.'),
    ],
  },
  {
    id: 'e_morgue_drawer', name: 'Drawer Nine', act: 1,
    text: 'The morgue is cold and politely labeled. Drawer nine is open an inch. Something inside is knocking, softly, the way a patient asks for a nurse.',
    choices: [
      { label: 'Open it', text: '50%: gain a random relic. 50%: lose 9 HP.', apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.addRelic(run, null); return 'A relic, nestled in a tag marked PERSONAL EFFECTS. It is yours now.'; } R.hurt(run, 9); return 'It was not a relic. It was a hand. It wanted yours. You lose 9 HP.'; } },
      { label: 'Knock back', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'The knocking stops. A potion slides out under the door, a thank-you.'; } },
      leave('You close it gently. The knocking resumes at once, in another drawer.'),
    ],
  },
  {
    id: 'e_orderly_challenge', name: 'Orderly Conduct', act: 1,
    text: 'An orderly blocks the corridor with a mop and a grudge. "Visiting hours are over." Behind him, a supply cart with something shiny on it.',
    choices: [
      { label: 'Fight him for the cart', text: 'Fight an Orderly. Win to receive a normal reward and 40 gold.', apply: (run, R) => { R.gold(run, 40); R.queueFight(run, ['orderly']); return 'He raises the mop. You raise your cards. The 40 gold from the cart is yours up front.'; } },
      { label: 'Bribe him (30 gold)', text: 'Pay 30 gold. Heal 6 HP from the cart.', cond: (run) => run.gold >= 30, apply: (run, R) => { R.gold(run, -30); R.heal(run, 6); return 'He pockets the gold and looks the other way. You take bandages. Heal 6 HP.'; } },
      leave('He mops the place you were standing, with feeling.'),
    ],
  },
  {
    id: 'e_gurney_race', name: 'Unattended Gurney', act: 1,
    text: 'A gurney with a loose wheel waits at the top of a long ramp. The sheet is warm. The ramp leads to the next floor and it is very long.',
    choices: [
      { label: 'Ride it', text: '60%: gain 35 gold from a bag under the sheet. 40%: lose 7 HP.', apply: (run, R) => { if (R.rng(run).chance(0.6)) { R.gold(run, 35); return 'You arrive intact, shaken, and holding a bag of 35 gold you did not bring.'; } R.hurt(run, 7); return 'The wall arrives before you do. You lose 7 HP.'; } },
      { label: 'Check the sheet', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'Under the sheet, a potion and a note: DO NOT RIDE. Good advice. You keep the potion.'; } },
      leave('The gurney rolls off by itself, no longer waiting for anyone.'),
    ],
  },

  // ---------------- ACT II: THE CELLAR MARKET ----------------
  {
    id: 'e_pickled_graft', name: 'Pickled Things', act: 2,
    text: 'Shelves of jars, each labeled in careful handwriting. One jar says DO NOT. One says PROBABLY FINE. The stallholder points at the second.',
    choices: [
      { label: 'Buy PROBABLY FINE (55 gold)', text: 'Pay 55 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 55, apply: (run, R) => { R.gold(run, -55); R.queueGraftPick(run); return 'The jar opens with a sigh. A graft, brined to perfection. -55 gold.'; } },
      { label: 'Buy DO NOT (free)', text: 'Gain a random relic. Lose 12 HP.', cond: (run) => run.hp > 16, apply: (run, R) => { R.hurt(run, 12); R.addRelic(run, null); return 'You open it. It was right. You lose 12 HP, and gain a relic.'; } },
      leave('The stallholder re-labels the jar in your honor.'),
    ],
  },
  {
    id: 'e_haggler', name: 'The Haggler', act: 2,
    text: 'He argues with a lamp. The lamp is winning. When he sees you, he lowers his voice to a price: your potion for his relic, no questions, several answers.',
    choices: [
      { label: 'Trade 40 gold for a relic', text: 'Pay 40 gold. Gain a random relic.', cond: (run) => run.gold >= 40, apply: (run, R) => { R.gold(run, -40); R.addRelic(run, null); return 'A handshake that goes on slightly too long. -40 gold, +1 relic.'; } },
      { label: 'Sell your blood (+70 gold, -6 max HP)', text: 'Gain 70 gold. Lose 6 max HP.', cond: (run) => run.maxHp > 30, apply: (run, R) => { R.gold(run, 70); R.maxHp(run, -6); return 'He labels the vial "premium". +70 gold, -6 max HP.'; } },
      leave('"I was bluffing," he calls after you. "About everything."'),
    ],
  },
  {
    id: 'e_lamp_lottery', name: 'The Lamp Lottery', act: 2,
    text: 'Forty lamps hang from the cellar ceiling, each a different shade of not quite right. A sign: PICK ONE. The ticket costs whatever you have the least of.',
    choices: [
      { label: 'Pick a lamp (25 gold)', text: 'Pay 25 gold. 50%: upgrade a card (the first not yet upgraded). 50%: lose 5 HP.', cond: (run) => run.gold >= 25,
        apply: (run, R) => { R.gold(run, -25); const cands = run.deck.filter((i) => !i.up); if (R.rng(run).chance(0.5) && cands.length) { R.upgrade(run, cands[0].uid); return 'The lamp lights. A card in your deck brightens. It is upgraded.'; } R.hurt(run, 5); return 'The lamp goes out, and so does a little of you. -25 gold, -5 HP.'; } },
      { label: 'Pick a lamp (free)', text: '30%: gain a random potion. 70%: nothing.',
        apply: (run, R) => { if (R.rng(run).chance(0.3)) { R.addPotion(run, null); return 'The lamp drops a potion. It looks rehearsed.'; } return 'The lamp stays dark. It seems embarrassed.'; } },
      leave('The lamps all turn slightly to watch you go.'),
    ],
  },
  {
    id: 'e_black_market_clinic', name: 'The Black Market Clinic', act: 2,
    text: 'A curtain, a chair, a tray of instruments that have seen things. "No appointment? Wonderful. Neither did the last one."',
    choices: [
      { label: 'Full patch-up (40 gold)', text: 'Pay 40 gold. Heal 25 HP.', cond: (run) => run.gold >= 40, apply: (run, R) => { R.gold(run, -40); R.heal(run, 25); return 'Efficient, unsmiling, thorough. You heal 25 HP. -40 gold.'; } },
      { label: 'Cheap patch-up (15 gold)', text: 'Pay 15 gold. Heal 10 HP, lose 2 max HP.', cond: (run) => run.gold >= 15, apply: (run, R) => { R.gold(run, -15); R.heal(run, 10); R.maxHp(run, -2); return 'You heal 10 HP. You also lose 2 max HP. They call that the discount.'; } },
      leave('The curtain falls shut, kindly.'),
    ],
  },
  {
    id: 'e_jarred_twin', name: 'A Jar With Your Name', act: 2,
    text: 'On a high shelf, a jar. It holds one of your cards, floating, pale, slightly annoyed. The label has your handwriting. You did not write it yet.',
    choices: [
      { label: 'Take it (a copy of a card)', text: 'Add a plain second copy of a chosen card. Lose 5 HP.', pick: 'card', cond: (run) => run.hp > 8 && run.deck.length > 0,
        apply: (run, R, inst) => { R.hurt(run, 5); R.addCard(run, inst.id); return 'The jar opens and the card steps out beside its original. They do not look at each other. -5 HP.'; } },
      { label: 'Smash it', text: 'Gain 30 gold from the glass dealer who saw it.', apply: (run, R) => { R.gold(run, 30); return 'It makes a great noise. A man pays you 30 gold for the pieces.'; } },
      leave('The jar turns on its own, keeping its eyes on you.'),
    ],
  },

  // ---------------- ACT III: THE GILT THEATRE ----------------
  {
    id: 'e_costume_rack', name: 'The Costume Rack', act: 3,
    text: 'Backstage, a rack of costumes that fit nobody and everybody. Each has a tag with a role. One tag says YOU.',
    choices: [
      { label: 'Try on YOU', text: 'Upgrade one card. Lose 6 max HP.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.maxHp > 28 && run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.maxHp(run, -6); R.upgrade(run, inst.uid); return 'It fits. A card is upgraded. You are 6 max HP smaller in it.'; } },
      { label: 'Steal a hat', text: 'Gain 45 gold.', apply: (run, R) => { R.gold(run, 45); return 'The hat sells itself. +45 gold. Something in the rafters applauds.'; } },
      leave('The rack sways, taking a bow.'),
    ],
  },
  {
    id: 'e_rehearsal', name: 'Dress Rehearsal', act: 3,
    text: 'The stage is lit for nobody. A director in the dark says "again" and the stage manager hands you a script with your lines already written. Your lines include screaming.',
    choices: [
      { label: 'Play your part', text: 'Lose 8 HP. A normal graft reward screen follows.', cond: (run) => run.hp > 12, apply: (run, R) => { R.hurt(run, 8); R.queueGraftPick(run); return 'You scream on cue. The director weeps. -8 HP, and a graft is sewn into the reviews.'; } },
      { label: 'Improvise', text: '50%: gain 80 gold. 50%: lose 8 HP.', apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.gold(run, 80); return 'Silence, then thunder. The house throws 80 gold onto the stage.'; } R.hurt(run, 8); return 'Silence, then a boot. You lose 8 HP.'; } },
      leave('"Again," says the dark, after you.'),
    ],
  },
  {
    id: 'e_balcony_seat', name: 'Box Seat', act: 3,
    text: 'The balcony is empty except for one occupied seat and a smell of old roses. The occupant is very still. They hold out a small velvet bag without turning.',
    choices: [
      { label: 'Take the bag', text: 'Gain a random relic. Lose 10 HP.', cond: (run) => run.hp > 14, apply: (run, R) => { R.hurt(run, 10); R.addRelic(run, null); return 'The bag is heavy. You are slightly less so. -10 HP, +1 relic.'; } },
      { label: 'Sit down beside them', text: 'Heal 12 HP.', apply: (run, R) => { R.heal(run, 12); return 'Neither of you speaks. The show is very good. You heal 12 HP.'; } },
      leave('The seat creaks as you leave. It was not you.'),
    ],
  },
  {
    id: 'e_standing_ovation', name: 'Standing Ovation', act: 3,
    text: 'An empty house starts applauding the moment you enter. It does not stop. It is the loudest thing you have ever heard, and it is pleased with you.',
    choices: [
      { label: 'Bow', text: 'Gain 60 gold and a random potion. Lose 7 HP from the noise.', cond: (run) => run.hp > 10, apply: (run, R) => { R.hurt(run, 7); R.gold(run, 60); R.addPotion(run, null); return 'The applause rises. Flowers fall from nowhere. +60 gold, +1 potion, -7 HP.'; } },
      { label: 'Raise a hand for silence', text: 'Heal 8 HP.', apply: (run, R) => { R.heal(run, 8); return 'Silence. It is somehow worse, then somehow better. You heal 8 HP.'; } },
      leave('The applause follows you into the corridor and waits outside.'),
    ],
  },
  {
    id: 'e_understudy', name: 'The Understudy', act: 3,
    text: 'A figure in your coat adjusts your posture in a mirror. They know your lines. They offer, politely, to take your place for one scene, for a modest fee.',
    choices: [
      { label: 'Let them take a card (Remove it)', text: 'Remove a chosen card from your deck. Gain 25 gold.', pick: 'card', cond: (run) => run.deck.length > 8,
        apply: (run, R, inst) => { R.removeCard(run, inst.uid); R.gold(run, 25); return 'They take the card with them into the wings. +25 gold. Nobody will miss it, probably.'; } },
      { label: 'Pay them off (20 gold)', text: 'Pay 20 gold. Heal 14 HP.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.heal(run, 14); return 'They take the stage and the wounds with them. You heal 14 HP. -20 gold.'; } },
      leave('They return to the mirror, content to wait.'),
    ],
  },
  {
    id: 'e_dentist_chair', name: 'The Dentist Next Door', act: 1,
    text: 'A dentist in a ward that has no use for one. He holds up a molar and a business card. "Bring me a bad habit," he says. "I will take it out at the root."',
    choices: [
      { label: 'Extract a card', text: 'Remove a chosen card from your deck. Heal 5 HP.', pick: 'card', cond: (run) => run.deck.length > 8,
        apply: (run, R, inst) => { R.removeCard(run, inst.uid); R.heal(run, 5); return 'A small crack, a small relief. The card is gone. You heal 5 HP, and receive a lollipop.'; } },
      { label: 'Just a cleaning (15 gold)', text: 'Pay 15 gold. Heal 8 HP.', cond: (run) => run.gold >= 15, apply: (run, R) => { R.gold(run, -15); R.heal(run, 8); return 'He scrapes something off you. You heal 8 HP. -15 gold.'; } },
      leave('He holds the molar up to the light, and sighs for it.'),
    ],
  },
  // =====================================================================
  // CONTENT WAVE 2. Chains use run.flags: debt, patient, mem, cult, signed, owe.
  // =====================================================================
  // ---------------- ANY ACT: graft-system events ----------------
  {
    id: 'e_filing_clerk', name: 'The Filing Clerk', act: 0,
    text: 'A clerk sits behind a wall of index cards, each one a card of yours. "The Tithe is collected cheapest first, then oldest first," she says. "Age is a matter of paperwork."',
    choices: [
      { label: 'File one Bare card at the back (10 gold)', text: 'Pay 10 gold. A Bare card is re-filed as the newest, so among Bare cards of equal cost it is Tithed last.', pick: 'card', pickFilter: (i) => !grafted(i) && !i.id.startsWith('j_'), cond: (run) => run.gold >= 10 && bareCount(run) > 1,
        apply: (run, R, inst) => { R.gold(run, -10); refile(run, R, inst); return 'She stamps it NEW. It is the same card with a younger number. 10 gold paid. Whoever is older pays first.'; } },
      { label: 'Re-file everything now Tithed (25 gold)', text: 'Pay 25 gold. Every currently Tithed card is re-filed as the newest, so the Tithe falls on the next in line. If nothing else shares their cost, nothing changes.', cond: (run) => run.gold >= 25 && bareCount(run) > 1,
        apply: (run, R) => { const ids = R.strainOf(run).tithed.slice(); R.gold(run, -25); for (const u of ids) { const i = run.deck.find((x) => x.uid === u); if (i) refile(run, R, i); } return 'The stamp comes down ' + ids.length + ' time' + (ids.length === 1 ? '' : 's') + '. -25 gold. The Tithe takes a different seat.'; } },
      leave('"Your file is in order," she says. It is not.'),
    ],
  },
  {
    id: 'e_lottery_ward', name: 'The Reroll Ward', act: 0,
    text: 'A ward of cots, each with a card under the pillow and a graft stitched crooked. A nurse offers to unpick everything and sew it again from the bin. "Surprises are good for patients," she says. She has never been a patient.',
    choices: [
      { label: 'Reroll one card (4 HP)', text: 'Lose 4 HP. Remove all grafts from a grafted card and sew the same number of random ones. Max HP Prices apply again.', pick: 'card', pickFilter: grafted, cond: (run) => run.hp > 6 && run.deck.some(grafted),
        apply: (run, R, inst) => { R.hurt(run, 4); const n = rerollCard(run, R, inst); return 'Unpicked and resewn: ' + n + ' graft' + (n === 1 ? '' : 's') + ' drawn from the bin. -4 HP. She calls this "a fresh start".'; } },
      { label: 'Reroll every graft in the deck (10 HP)', text: 'Lose 10 HP. Every graft on every card is replaced by a random one, same count per card.', cond: (run) => run.hp > 14 && run.deck.some(grafted),
        apply: (run, R) => { R.hurt(run, 10); let n = 0; for (const i of run.deck.filter(grafted)) n += rerollCard(run, R, i); return 'The whole ward is unpicked at once. ' + n + ' grafts are drawn from the bin. -10 HP. Some of them are even good.'; } },
      leave('She puts the needle back in the cushion, reluctantly.'),
    ],
  },
  {
    id: 'e_budget_pharmacy', name: 'The Budget Pharmacist', act: 0,
    text: 'A counter, a scale, a jar of small numbers. "Budget is prescribed, not found," says the pharmacist. "Payment on collection. Any currency the body recognizes."',
    choices: [
      { label: 'Fill it with blood (+1 Budget, -5 max HP)', text: 'Gain 1 Budget permanently. Lose 5 max HP.', cond: (run) => run.maxHp > 30,
        apply: (run, R) => { R.budget(run, 1); R.maxHp(run, -5); return 'A small label: TAKE AS NEEDED. +1 Budget, -5 max HP.'; } },
      { label: 'Fill it with gold (+1 Budget, 45 gold)', text: 'Pay 45 gold. Gain 1 Budget permanently.', cond: (run) => run.gold >= 45,
        apply: (run, R) => { R.gold(run, -45); R.budget(run, 1); return 'The jar rattles once. +1 Budget, -45 gold. No refills.'; } },
      leave('"Side effects include leaving," she says.'),
    ],
  },
  {
    id: 'e_actuary', name: 'The Actuary', act: 0,
    text: 'A man with a slide rule and no shadow. "Shatter is only a number," he says, "and I know all of them." He offers to put your next stitch on the books at a known rate.',
    choices: [
      { label: 'Free third graft (10% the stitch fails)', text: 'Pick a card with 2 grafts. Add a random third graft (Overload). 10% chance the stitch fails at once: the card is destroyed and he pays 20 gold. The Overload still rolls its usual Shatter in combat.', pick: 'card', pickFilter: (i) => i.grafts.length === 2, cond: (run) => run.deck.some((i) => i.grafts.length === 2),
        apply: (run, R, inst) => { if (R.rng(run).chance(0.1)) { R.shatter(run, inst.uid); R.gold(run, 20); return 'The ten percent arrives on schedule. The card is gone. He pays 20 gold and writes "as predicted".'; } const g = R.addGraftRandom(run, inst.uid); return g ? 'The ninety percent holds. The third graft takes. It is Overloaded and in the books.' : 'No graft fits this card. He shrugs, in italics.'; } },
      { label: 'Insured third graft (40 gold, 0% fail)', text: 'Pay 40 gold. Same as above, but the stitch cannot fail. The Overload still rolls its usual Shatter in combat.', pick: 'card', pickFilter: (i) => i.grafts.length === 2, cond: (run) => run.gold >= 40 && run.deck.some((i) => i.grafts.length === 2),
        apply: (run, R, inst) => { R.gold(run, -40); const g = R.addGraftRandom(run, inst.uid); return g ? 'Premium paid. The third graft takes, guaranteed. -40 gold. The policy excludes combat.' : 'No graft fits this card. He refunds the 40 gold with visible pain.'; } },
      leave('He writes "declined" in a column of his own.'),
    ],
  },

  // ---------------- ACT I ----------------
  {
    id: 'e_loan_shark', name: 'A Friendly Lender', act: 1,
    text: 'He has a sofa in a stairwell and a ledger on the sofa. "Gold now, gold later," he says. "No hurry. I always find you."',
    choices: [
      { label: 'Borrow 90 gold', text: 'Gain 90 gold. You will owe him 120 later.', apply: (run, R) => { R.gold(run, 90); run.flags.debt = 120; return 'The money is warm from his pocket. +90 gold. He writes 120 in his ledger, and underlines it gently.'; } },
      { label: 'Borrow 40 gold', text: 'Gain 40 gold. You will owe him 55 later.', apply: (run, R) => { R.gold(run, 40); run.flags.debt = 55; return 'A smaller loan, a smaller underline. +40 gold. He writes 55.'; } },
      leave('"Another time," he says. He is already writing something.'),
    ],
  },
  {
    id: 'e_stray_patient', name: 'The Unregistered Patient', act: 1,
    text: 'A man sits on the stairs with a graft coming loose at the wrist. Nobody has signed him in. He is polite about it, which is worse.',
    choices: [
      { label: 'Stabilize him (12 gold)', text: 'Pay 12 gold. He may remember.', cond: (run) => run.gold >= 12, apply: (run, R) => { R.gold(run, -12); run.flags.patient = 1; return 'You clamp, you tape, you do not know his name. -12 gold. He nods as if filing it.'; } },
      { label: 'Carry him to a bed (6 HP)', text: 'Lose 6 HP. He will remember.', cond: (run) => run.hp > 10, apply: (run, R) => { R.hurt(run, 6); run.flags.patient = 2; return 'He weighs more than he looks. -6 HP. He holds your sleeve until the nurse arrives.'; } },
      leave('You step around him. He understands. That is the worst part.'),
    ],
  },
  {
    id: 'e_scar_reader', name: 'The Scar Reader', act: 1,
    text: 'An old woman reads your cards the way others read palms. "This one has a graft," she says, "and it is not entirely sure it wants one." She offers to take it off. Gently. The card will keep the shape of it.',
    choices: [
      { label: 'Lift the last graft (card remembers)', text: 'Remove the last graft from a grafted card, free. That card is marked: it may ask for the graft back later.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted),
        apply: (run, R, inst) => { const gid = inst.grafts[inst.grafts.length - 1]; R.stripGraft(run, inst.uid, gid); run.flags.mem = { uid: inst.uid, gid }; return 'The graft lifts like a plaster. The card keeps a pale outline where it was. It will remember.'; } },
      { label: 'Read your scars', text: 'Heal 6 HP.', apply: (run, R) => { R.heal(run, 6); return 'She reads you aloud for a while. You heal 6 HP. Some of it is accurate.'; } },
      leave('"The scars will wait," she says. They always do.'),
    ],
  },
  {
    id: 'e_cult_pamphlet', name: 'The Even Stitch', act: 1,
    text: 'A pamphlet is pressed into your hand by someone with perfectly even stitching. THE DECK IS A BODY, it reads. THE BODY OWES NOTHING. The last line is smaller: ASK ABOUT OUR VOW.',
    choices: [
      { label: 'Take the vow (+1 Budget)', text: 'Gain 1 Budget permanently. They will come for what you promised.', apply: (run, R) => { R.budget(run, 1); run.flags.cult = 1; return 'You sign in even letters. +1 Budget. They bow, evenly, and write down your address.'; } },
      { label: 'Take the snacks', text: 'Heal 7 HP.', apply: (run, R) => { R.heal(run, 7); return 'The biscuits are excellent. You heal 7 HP. Nobody asks for anything.'; } },
      leave('You fold the pamphlet into a very small square.'),
    ],
  },
  {
    id: 'e_weigh_in', name: 'The Weigh-In', act: 1,
    text: 'A nurse with a deck scale and a printout. "Weight, Budget, difference," she recites. "The difference is what we call Strain. Step up, please."',
    choices: [
      { label: 'Step on the scale', text: 'No Strain: heal 8 HP. Strain: gain 10 gold per Strain (max 40) and lose 3 HP.',
        apply: (run, R) => { const s = R.strainOf(run); if (s.strain === 0) { R.heal(run, 8); return 'Weight ' + s.weight + ', Budget ' + s.budget + '. "Very good," she says. You heal 8 HP.'; } const g = Math.min(40, 10 * s.strain); R.gold(run, g); R.hurt(run, 3); return 'Weight ' + s.weight + ', Budget ' + s.budget + '. Strain ' + s.strain + '. She sighs, pays you ' + g + ' gold for the data, and takes 3 HP for the sigh.'; } },
      { label: 'Have her trim a card (4 HP)', text: 'Lose 4 HP. Remove the FIRST graft of a grafted card.', pick: 'card', pickFilter: grafted, cond: (run) => run.hp > 6 && run.deck.some(grafted),
        apply: (run, R, inst) => { R.hurt(run, 4); R.stripGraft(run, inst.uid, inst.grafts[0]); return 'She trims the oldest stitch and bins it. -4 HP. The scale is visibly relieved.'; } },
      leave('She prints the weight anyway and tucks it in your pocket.'),
    ],
  },
  {
    id: 'e_ward_ledger', name: 'The Visitor Log', act: 1,
    text: 'A clipboard on a string. Every line is a name and a time, and every name is yours in a different hand. A pen is chained to it. The note says: SIGN, AND WE WILL REMEMBER WHAT YOU SEW.',
    choices: [
      { label: 'Sign (+10 gold)', text: 'Gain 10 gold. Grafts sewn from now on are logged. Someone will settle up later.', apply: (run, R) => { R.gold(run, 10); run.flags.signed = run.stats.grafts | 0; return 'You sign. The pen is warm. +10 gold and a faint sense of being counted.'; } },
      { label: 'Sign a false name', text: 'Gain a random potion. Nobody settles up.', apply: (run, R) => { R.addPotion(run, null); return 'You sign Dr. Nobody. A potion is handed over without eye contact.'; } },
      leave('The pen swings back and forth on its chain.'),
    ],
  },

  // ---------------- ACT II ----------------
  {
    id: 'e_patient_returns', name: 'A Familiar Wrist', act: 2,
    text: 'A man behind a tray of bottles lifts his sleeve to show a neat graft at the wrist. He is trying to remember how he knows you.',
    choices: [
      { label: 'Accept the gift (he remembers a lot)', text: 'Gain a random relic.', cond: (run) => run.flags.patient === 2, apply: (run, R) => { delete run.flags.patient; R.addRelic(run, null); return '"You carried me," he says. He presses a relic into your hand and will not hear no.'; } },
      { label: 'Accept the gift (he remembers a little)', text: 'Gain a random potion and 30 gold.', cond: (run) => run.flags.patient === 1, apply: (run, R) => { delete run.flags.patient; R.addPotion(run, null); R.gold(run, 30); return '"You clamped it," he says. A potion and 30 gold, from a tray that has seen fewer customers.'; } },
      { label: 'Browse his tray (20 gold)', text: 'Pay 20 gold. Gain a random potion.', cond: (run) => !run.flags.patient && run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.addPotion(run, null); return 'Nobody here owes you anything. The potion is fairly priced. -20 gold.'; } },
      leave('He keeps squinting at you, still working it out.'),
    ],
  },
  {
    id: 'e_debt_collector', name: 'The Collector, Courteous', act: 2,
    text: 'He appears in the market as if he had been there all along. "A word about the matter of the loan," he begins. If you owe nothing, the words are just a pleasant noise.',
    choices: [
      { label: 'Pay the balance', text: 'Pay what you owe in gold. The debt is cleared.', cond: (run) => run.flags.debt > 0 && run.gold >= run.flags.debt, apply: (run, R) => { const d = run.flags.debt; R.gold(run, -d); delete run.flags.debt; return 'He counts it twice. -' + d + ' gold. "A pleasure," he says, and for once nobody is lying.'; } },
      { label: 'Pay in blood (-10 max HP)', text: 'Lose 10 max HP. The debt is cleared.', cond: (run) => run.flags.debt > 0 && run.maxHp > 30, apply: (run, R) => { R.maxHp(run, -10); delete run.flags.debt; return 'He does not take much, but what he takes does not come back. -10 max HP. The ledger is closed.'; } },
      { label: 'Send him away by force', text: 'Fight two Orderlies he brought. Win and the debt is cleared.', cond: (run) => run.flags.debt > 0, apply: (run, R) => { delete run.flags.debt; R.queueFight(run, ['orderly', 'orderly']); return '"As you like," he says, and whistles. Two orderlies come in with mops and an invoice.'; } },
      { label: 'Take his spare receipt', text: 'Gain 20 gold. He had you confused with someone else.', cond: (run) => !run.flags.debt, apply: (run, R) => { R.gold(run, 20); return '"Not you," he says, embarrassed, and pays you 20 gold for the inconvenience.'; } },
      leave('He writes it down. The number is bigger than it was.'),
    ],
  },
  {
    id: 'e_borrowed_graft', name: 'Graft on Account', act: 2,
    text: 'A stall that sells grafts without a price tag. "On account," says the vendor, whose face is a very good loan. "You will not notice the bill until it arrives."',
    choices: [
      { label: 'Take a graft on account', text: 'A normal graft reward screen follows. Something will be taken back later.', apply: (run, R) => { run.flags.owe = 1; R.queueGraftPick(run); return 'The graft is yours, warm and unpaid. He writes your name on a small card and puts it in a very large drawer.'; } },
      { label: 'Pay now (60 gold)', text: 'Pay 60 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 60, apply: (run, R) => { R.gold(run, -60); R.queueGraftPick(run); return 'He looks almost sad to be paid. -60 gold. A graft follows.'; } },
      leave('"Everyone comes back," he says, kindly.'),
    ],
  },
  {
    id: 'e_load_balancer', name: 'The Load Balancer', act: 2,
    text: 'A man in a hard hat walks across your deck with a spirit level. "Heavy here," he says, tapping a card. "Light there. We can even that out, and the stitches do not mind. Most of them."',
    choices: [
      { label: 'Move a graft to a Bare card', text: 'Move the last graft of a grafted card onto the first card that can take it and has no grafts. The Bare card is no longer Bare, so it escapes the Tithe but the weight stays.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted) && run.deck.length > 1,
        apply: (run, R, inst) => { const gid = inst.grafts[inst.grafts.length - 1]; const dest = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length === 0 && (i.id.charAt(0) !== 'j')).find((i) => R.moveGraft(run, inst.uid, i.uid, gid)); return dest ? 'The graft is lifted, carried across the deck, and set down on a new card. It sits up straight. The weight is the same. The Tithe is not.' : 'He walks the whole deck and finds no card that will take it. No charge.'; } },
      { label: 'Weigh the deck', text: 'Hear Weight, Budget and Strain. Heal 5 HP.', apply: (run, R) => { const s = R.strainOf(run); R.heal(run, 5); return 'Weight ' + s.weight + '. Budget ' + s.budget + '. Strain ' + s.strain + ', Tithed ' + s.tithed.length + (s.backfire ? ', Backfire ' + s.backfire : '') + '. He gives you tea. You heal 5 HP.'; } },
      leave('He taps the hard hat and goes up the stairs backwards.'),
    ],
  },
  {
    id: 'e_graft_clone', name: 'The Duplicator', act: 2,
    text: 'A printing press that does not take paper. A tray says INSERT ONE STITCHED CARD. The output slot already holds a card, plain, wearing a graft that has not stopped blinking.',
    choices: [
      { label: 'Clone a card with its graft (60 gold)', text: 'Pay 60 gold. Add a copy of a card that has exactly 1 graft, with the same graft. Its weight raises Strain.', pick: 'card', pickFilter: (i) => i.grafts.length === 1, cond: (run) => run.gold >= 60 && run.deck.some((i) => i.grafts.length === 1),
        apply: (run, R, inst) => { R.gold(run, -60); R.addCard(run, inst.id); const c = run.deck[run.deck.length - 1]; if (inst.up) R.upgrade(run, c.uid); R.addGraft(run, c.uid, inst.grafts[0]); return 'The press shudders and hands you a twin with the same stitch and the same expression. -60 gold. Mind the Strain.'; } },
      { label: 'Clone a card, plain (12 HP)', text: 'Lose 12 HP. Add a plain copy of any card.', pick: 'card', cond: (run) => run.hp > 16 && run.deck.length > 0,
        apply: (run, R, inst) => { R.hurt(run, 12); R.addCard(run, inst.id); return 'The press takes 12 HP and prints a copy with no graft and no memory. It is, however, Bare.'; } },
      leave('The blinking graft in the slot follows you with its light.'),
    ],
  },
  {
    id: 'e_cure_shelf', name: 'The Cure Shelf', act: 2,
    text: 'Two shelves behind a locked glass door. Left: cures for the body of the deck. Right: cures for the arithmetic. The keeper has a tidy handwriting and a poor opinion of Budget.',
    choices: [
      { label: 'Left shelf (20 gold)', text: 'Pay 20 gold. Gain Unjam Solvent and Absolution Drops.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.addPotion(run, 'p_unjam'); R.addPotion(run, 'p_untithe'); return 'Two small bottles, labeled in the keeper\'s tidy hand. -20 gold. Only as many as you can carry.'; } },
      { label: 'Right shelf (25 gold)', text: 'Pay 25 gold. Gain Borrowed Budget and Loaded Dice.', cond: (run) => run.gold >= 25, apply: (run, R) => { R.gold(run, -25); R.addPotion(run, 'p_borrowed_budget'); R.addPotion(run, 'p_loaded_dice'); return 'Two bottles that clink like coins. -25 gold. Only as many as you can carry.'; } },
      leave('The keeper locks the glass again, with relief.'),
    ],
  },

  // ---------------- ACT III ----------------
  {
    id: 'e_memory_returns', name: 'The Card That Remembers', act: 3,
    text: 'A card in your deck is warm. You did not play it. You turn it over and it shows you a pale outline on its face, the shape of a graft that is no longer there.',
    choices: [
      { label: 'Give it back its graft (free)', text: 'Re-sew the graft that was lifted from that card, and upgrade it. The weight returns with it.', cond: (run) => !!run.flags.mem && run.deck.some((i) => i.uid === run.flags.mem.uid),
        apply: (run, R) => { const m = run.flags.mem; delete run.flags.mem; const r = R.addGraft(run, m.uid, m.gid); if (r && r.ok) { R.upgrade(run, m.uid); return 'The graft slots into its outline as if it had never left. The card is upgraded, and warmer. The weight came back too.'; } return 'The outline will not take the graft any more. The card sighs and cools.'; } },
      { label: 'Let it forget (upgrade it)', text: 'Upgrade that card. It stays plain.', cond: (run) => !!run.flags.mem && run.deck.some((i) => i.uid === run.flags.mem.uid),
        apply: (run, R) => { const m = run.flags.mem; delete run.flags.mem; R.upgrade(run, m.uid); return 'The outline fades. The card is upgraded and lighter. It does not say thank you; it was the one who asked.'; } },
      { label: 'Read your own scars', text: 'Heal 10 HP.', cond: (run) => !run.flags.mem || !run.deck.some((i) => i.uid === run.flags.mem.uid), apply: (run, R) => { R.heal(run, 10); return 'Nothing in the deck is asking for anything. You sit with it. You heal 10 HP.'; } },
      leave('The warmth fades. For now.'),
    ],
  },
  {
    id: 'e_cult_recruiter', name: 'The Even Stitch, Again', act: 3,
    text: 'They are waiting at the foot of the stage, in a line, perfectly even. "It is the day," says the one in front. "You promised."',
    choices: [
      { label: 'Keep the vow (strip a card bare)', text: 'Remove EVERY graft from one grafted card. Gain 2 Budget permanently.', pick: 'card', pickFilter: grafted, cond: (run) => run.flags.cult === 1 && run.deck.some(grafted),
        apply: (run, R, inst) => { for (const g of inst.grafts.slice()) R.stripGraft(run, inst.uid, g); delete run.flags.cult; R.budget(run, 2); return 'They unpick it in a single clean motion. +2 Budget. They bow again, evenly, and leave no crumbs.'; } },
      { label: 'Break the vow (-12 max HP)', text: 'Lose 12 max HP and gain 80 gold. The vow is void.', cond: (run) => run.flags.cult === 1 && run.maxHp > 34, apply: (run, R) => { delete run.flags.cult; R.maxHp(run, -12); R.gold(run, 80); return 'They take the 12 max HP politely. They also press 80 gold on you, for the trouble. It feels like an apology.'; } },
      { label: 'Donate (30 gold)', text: 'Pay 30 gold. Heal 12 HP.', cond: (run) => run.flags.cult !== 1 && run.gold >= 30, apply: (run, R) => { R.gold(run, -30); R.heal(run, 12); return 'Everyone is very even about it. -30 gold. You heal 12 HP.'; } },
      leave('They straighten the line behind you.'),
    ],
  },
  {
    id: 'e_repossession', name: 'Repossession', act: 3,
    text: 'Two men in matching gloves and a van with no doors. They have a clipboard with your name on it and a small, regretful smile.',
    choices: [
      { label: 'Let them take a graft', text: 'They remove the last graft from one grafted card (the one with the most grafts). You gain 40 gold. The debt is cleared.', cond: (run) => run.flags.owe === 1 && run.deck.some(grafted),
        apply: (run, R) => { delete run.flags.owe; const t = run.deck.filter(grafted).sort((a, b) => b.grafts.length - a.grafts.length)[0]; R.stripGraft(run, t.uid, t.grafts[t.grafts.length - 1]); R.gold(run, 40); return 'Thread, scissors, a wet sound. The graft goes into the van. They leave you 40 gold for the inconvenience, which is more than the usual.'; } },
      { label: 'Settle in gold (70 gold)', text: 'Pay 70 gold. The debt is cleared.', cond: (run) => run.flags.owe === 1 && run.gold >= 70, apply: (run, R) => { R.gold(run, -70); delete run.flags.owe; return 'They count it on the van roof. -70 gold. They shake your hand in the glove.'; } },
      { label: 'Pick through the van', text: 'Gain 25 gold. They are on a different street today.', cond: (run) => run.flags.owe !== 1, apply: (run, R) => { R.gold(run, 25); return 'The van is empty except for a purse of loose coins. +25 gold. Somebody else is having a bad day.'; } },
      leave('They tick a box and let you go. The box does not stay ticked.'),
    ],
  },
  {
    id: 'e_ledger_audit', name: 'The Audit', act: 3,
    text: 'A woman at a folding table, with the visitor log open in front of her. She has been counting your stitches since the ward, and she has a number.',
    choices: [
      { label: 'Collect the settlement', text: 'Gain 12 gold per graft you have sewn since you signed the log (max 72).', cond: (run) => run.flags.signed !== undefined, apply: (run, R) => { const n = Math.max(0, (run.stats.grafts | 0) - run.flags.signed); const g = Math.min(72, 12 * n); delete run.flags.signed; R.gold(run, g); return n + ' graft' + (n === 1 ? '' : 's') + ' logged since the ward. +' + g + ' gold. She stamps PAID with satisfaction.'; } },
      { label: 'Contest the count', text: 'Heal 8 HP. The log is closed with no settlement.', cond: (run) => run.flags.signed !== undefined, apply: (run, R) => { delete run.flags.signed; R.heal(run, 8); return 'You argue pleasantly. She closes the log and gives you tea. You heal 8 HP, and no gold.'; } },
      { label: 'Audit yourself (15 gold)', text: 'Pay 15 gold. Upgrade a card.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.flags.signed === undefined && run.gold >= 15 && run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.gold(run, -15); R.upgrade(run, inst.uid); return 'She finds an error in your favour and charges for it. A card is upgraded. -15 gold.'; } },
      leave('She turns a page. It is yours.'),
    ],
  },
  {
    id: 'e_glassblower', name: 'The Glassblower', act: 3,
    text: 'A furnace backstage and a man who makes things that were meant to break. He eyes your most overloaded card the way a baker eyes a hot loaf. "Shatter is just glass finishing early," he says.',
    choices: [
      { label: 'Shatter an Overloaded card on purpose', text: 'Destroy a card with 3 grafts. Gain 70 gold and 1 Budget permanently.', pick: 'card', pickFilter: (i) => i.grafts.length === 3, cond: (run) => run.deck.some((i) => i.grafts.length === 3),
        apply: (run, R, inst) => { R.shatter(run, inst.uid); R.gold(run, 70); R.budget(run, 1); return 'He breaks it with a single tap. The shards are very pretty and very expensive. +70 gold, +1 Budget. The weight leaves with them.'; } },
      { label: 'Buy a Shatter Ward (80 gold)', text: 'Pay 80 gold. Gain the relic Shatter Ward (Shatter chance 10% lower), if you do not own it.', cond: (run) => run.gold >= 80 && !run.relics.includes('r_shatter_ward'),
        apply: (run, R) => { R.gold(run, -80); R.addRelic(run, 'r_shatter_ward'); return 'A thin glass ring, hot from the furnace. -80 gold. "It will break," he says, "later than usual."'; } },
      { label: 'Sweep the shards', text: 'Gain 25 gold.', apply: (run, R) => { R.gold(run, 25); return 'You sweep for an hour. +25 gold. Nobody in the house is cut.'; } },
      leave('He turns back to the furnace and exhales through the pipe.'),
    ],
  },
];
