// Events: { id, name, act: 0 (any)|1|2|3, text, art?, choices: [{ label, text, cond?(run), pick?, pickFilter?, apply(run, R, inst) -> resultText }] }  R = engine/run.js helper API
const leave = (msg) => ({ label: 'Walk away', text: 'Nothing happens.', apply: () => msg || 'You leave. Nobody objects.' });
const grafted = (i) => i.grafts.length > 0;

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
];
