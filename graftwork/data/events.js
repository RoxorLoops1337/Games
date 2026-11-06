// Events: { id, name, act: 0 (any)|1|2|3, text, art?, choices: [{ label, text, cond?(run), pick?, pickFilter?, apply(run, R, inst) -> resultText }] }  R = engine/run.js helper API
const leave = (msg) => ({ label: 'Walk away', text: 'Nothing happens.', apply: () => msg || 'You leave. Nobody objects.' });
const grafted = (i) => i.grafts.length > 0;
const bareCount = (run) => { let n = 0; for (const i of run.deck) if (i.grafts.length === 0 && !i.id.startsWith('j_')) n++; return n; };
// A Bare card re-filed under a fresh uid: Tithe picks cheapest then OLDEST, so the new uid goes to the back of its cost.
const refile = (run, R, inst) => { const id = inst.id, up = inst.up; R.removeCard(run, inst.uid); R.addCard(run, id); const n = run.deck[run.deck.length - 1]; if (up) R.upgrade(run, n.uid); if (run.flags.mem && run.flags.mem.uid === inst.uid) run.flags.mem.uid = n.uid; };
// Replace every graft on a card with the same number of random ones.
// Temper in an event: same rule as engine/cards.js temper() (FUSE_CAP 4). Inlined so this file keeps no imports.
const FUSE_MAX = 4;
const canFuse = (i) => i.grafts.length > 0 && (i.fused || []).length + i.grafts.length <= FUSE_MAX;
const fuseInst = (run, i) => { if (!canFuse(i)) return false; i.fused = [...(i.fused || []), ...i.grafts]; i.grafts = []; if (run.stats) run.stats.tempered = (run.stats.tempered || 0) + 1; return true; };
const rerollCard = (run, R, inst) => { const n = inst.grafts.length; for (const g of inst.grafts.slice()) R.stripGraft(run, inst.uid, g); let k = 0; for (let j = 0; j < n; j++) if (R.addGraftRandom(run, inst.uid)) k++; return k; };

// The phase a Ward event is running in (engine/ward.js keeps it on run.ward.phase); classic runs never see Ward events.
const phaseOf = (run) => (run.ward && run.ward.phase) || 'midday';

export const EVENT_LIST = [
  // ---------------- ANY ACT ----------------
  {
    id: 'e_second_hand_surgeon', name: 'The Second-Hand Surgeon', act: 0,
    text: 'A surgeon sits on an upturned crate, sharpening something that is not a knife. He will take a graft off any card for free. He keeps nothing. He just likes the sound.',
    choices: [
      { label: 'Strip a graft (free, heal 6)', text: 'Remove the last graft from a grafted card, free. Heal 6 as his gift.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted),
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
      { label: 'Accept an Overload (50% destroyed)', text: 'Pick a card with 2 grafts. Add a third graft (Overload, x1.5 numbers). 50% it shatters at once and the card is destroyed.', pick: 'card',
        pickFilter: (i) => i.grafts.length === 2, cond: (run) => run.deck.some((i) => i.grafts.length === 2),
        apply: (run, R, inst) => { R.addGraft(run, inst.uid, 'g_quick_hands'); if (R.rng(run).chance(0.5)) { R.removeCard(run, inst.uid); return 'He presses your thumb to the card. It sings, then shatters. The card is gone for the run. He keeps the pieces.'; } return 'He presses your thumb to the card. It holds. It hums. It is Overloaded and very pleased.'; } },
      { label: 'Take a normal graft (free)', text: 'Choose a graft for a card as after a fight. He sulks.', apply: (run, R) => { R.queueGraftPick(run); return 'He sulks, professionally.'; } },
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
      { label: 'Let her upgrade a card (free)', text: 'Upgrade one card, free.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.upgrade(run, inst.uid); return 'She works carefully. The card is better. She cries a little, from pride.'; } },
      leave('She salutes the wrong person.'),
    ],
  },
  {
    id: 'e_coin_flip', name: 'Heads, Tails, Teeth', act: 0,
    text: 'A coin sits on a plinth. A plaque reads: DOUBLE OR NOTHING. A smaller plaque reads: NOTHING IS NOT NOTHING.',
    choices: [
      { label: 'Flip for 40 gold (50%)', text: 'Pay 40 gold up front. 50% chance to win 100 gold back (net +60). Otherwise the 40 is gone.', cond: (run) => run.gold >= 40,
        apply: (run, R) => { R.gold(run, -40); if (R.rng(run).chance(0.5)) { R.gold(run, 100); return 'Heads. The coin returns with friends. You paid 40 and win 100 (net +60 gold).'; } return 'Tails. The coin keeps your 40 gold and does not thank you.'; } },
      { label: 'Flip for blood (50% potion, 50% -6 HP)', text: '50% chance to gain a random potion. Otherwise lose 6 HP.',
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
      { label: 'Take the potion (free)', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'You take a potion. The basket seems lighter, and relieved.'; } },
      { label: 'Eat the grapes (heal 10)', text: 'Heal 10 HP.', apply: (run, R) => { R.heal(run, 10); return 'The grapes are fine. You heal 10 HP. One is a tooth.'; } },
      leave('You leave it for someone worse off. The basket remains unconvinced.'),
    ],
  },

  // ---------------- ACT I: THE WARD ----------------
  {
    id: 'e_vending_machine', name: 'The Vending Machine', act: 1,
    text: 'It hums between two gurneys, glowing the color of weak tea. Row C sells grafts. The coin slot also accepts, according to the label, "other."',
    choices: [
      { label: 'Buy a graft (-50 gold)', text: 'Pay 50 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 50, apply: (run, R) => { R.gold(run, -50); R.queueGraftPick(run); return 'A clunk. A graft drops into the tray, still warm. -50 gold.'; } },
      { label: 'Pay in blood (-10 HP, graft)', text: 'Lose 10 HP. A normal graft reward screen follows.', cond: (run) => run.hp > 14, apply: (run, R) => { R.hurt(run, 10); R.queueGraftPick(run); return 'The slot takes 10 HP and a little more. A graft drops.'; } },
      leave('The machine blinks. Out of order, it admits, to nobody.'),
    ],
  },
  {
    id: 'e_night_shift', name: 'Night Shift', act: 1,
    text: 'The ward at 3 a.m. A nurse looks up from a clipboard and asks if you have been sleeping. You lie. She writes that down too.',
    choices: [
      { label: 'Take a bed (-20 gold, heal 18)', text: 'Pay 20 gold. Heal 18 HP.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.heal(run, 18); return 'Clean sheets, one pillow, no questions. You heal 18 HP. -20 gold.'; } },
      { label: 'Nap on a gurney (heal 8)', text: 'Heal 8 HP.', apply: (run, R) => { R.heal(run, 8); return 'The gurney rolls slowly toward the elevator the whole time. You heal 8 HP.'; } },
      leave('"Hydrate," she says, to your back.'),
    ],
  },
  {
    id: 'e_morgue_drawer', name: 'Drawer Nine', act: 1,
    text: 'The morgue is cold and politely labeled. Drawer nine is open an inch. Something inside is knocking, softly, the way a patient asks for a nurse.',
    choices: [
      { label: 'Open it (50% relic, 50% -9 HP)', text: '50%: gain a random relic. 50%: lose 9 HP.', apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.addRelic(run, null); return 'A relic, nestled in a tag marked PERSONAL EFFECTS. It is yours now.'; } R.hurt(run, 9); return 'It was not a relic. It was a hand. It wanted yours. You lose 9 HP.'; } },
      { label: 'Knock back (random potion)', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'The knocking stops. A potion slides out under the door, a thank-you.'; } },
      leave('You close it gently. The knocking resumes at once, in another drawer.'),
    ],
  },
  {
    id: 'e_orderly_challenge', name: 'Orderly Conduct', act: 1,
    text: 'An orderly blocks the corridor with a mop and a grudge. "Visiting hours are over." Behind him, a supply cart with something shiny on it.',
    choices: [
      { label: 'Fight him (fight, +40 gold now)', text: 'Fight an Orderly. Win to receive a normal reward and 40 gold.', apply: (run, R) => { R.gold(run, 40); R.queueFight(run, ['orderly']); return 'He raises the mop. You raise your cards. The 40 gold from the cart is yours up front.'; } },
      { label: 'Bribe him (-30 gold, heal 6)', text: 'Pay 30 gold. Heal 6 HP from the cart.', cond: (run) => run.gold >= 30, apply: (run, R) => { R.gold(run, -30); R.heal(run, 6); return 'He pockets the gold and looks the other way. You take bandages. Heal 6 HP.'; } },
      leave('He mops the place you were standing, with feeling.'),
    ],
  },
  {
    id: 'e_gurney_race', name: 'Unattended Gurney', act: 1,
    text: 'A gurney with a loose wheel waits at the top of a long ramp. The sheet is warm. The ramp leads to the next floor and it is very long.',
    choices: [
      { label: 'Ride it (60% +35 gold, 40% -7 HP)', text: '60%: gain 35 gold from a bag under the sheet. 40%: lose 7 HP.', apply: (run, R) => { if (R.rng(run).chance(0.6)) { R.gold(run, 35); return 'You arrive intact, shaken, and holding a bag of 35 gold you did not bring.'; } R.hurt(run, 7); return 'The wall arrives before you do. You lose 7 HP.'; } },
      { label: 'Check the sheet (random potion)', text: 'Gain a random potion.', apply: (run, R) => { R.addPotion(run, null); return 'Under the sheet, a potion and a note: DO NOT RIDE. Good advice. You keep the potion.'; } },
      leave('The gurney rolls off by itself, no longer waiting for anyone.'),
    ],
  },

  // ---------------- ACT II: THE CELLAR MARKET ----------------
  {
    id: 'e_pickled_graft', name: 'Pickled Things', act: 2,
    text: 'Shelves of jars, each labeled in careful handwriting. One jar says DO NOT. One says PROBABLY FINE. The stallholder points at the second.',
    choices: [
      { label: 'Buy PROBABLY FINE (-55 gold, graft)', text: 'Pay 55 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 55, apply: (run, R) => { R.gold(run, -55); R.queueGraftPick(run); return 'The jar opens with a sigh. A graft, brined to perfection. -55 gold.'; } },
      { label: 'Buy DO NOT (-12 HP, relic)', text: 'Gain a random relic. Lose 12 HP.', cond: (run) => run.hp > 16, apply: (run, R) => { R.hurt(run, 12); R.addRelic(run, null); return 'You open it. It was right. You lose 12 HP, and gain a relic.'; } },
      leave('The stallholder re-labels the jar in your honor.'),
    ],
  },
  {
    id: 'e_haggler', name: 'The Haggler', act: 2,
    text: 'He argues with a lamp. The lamp is winning. When he sees you, he lowers his voice to a price: your potion for his relic, no questions, several answers.',
    choices: [
      { label: 'Trade gold for a relic (-40 gold)', text: 'Pay 40 gold. Gain a random relic.', cond: (run) => run.gold >= 40, apply: (run, R) => { R.gold(run, -40); R.addRelic(run, null); return 'A handshake that goes on slightly too long. -40 gold, +1 relic.'; } },
      { label: 'Sell your blood (+70 gold, -6 max HP)', text: 'Gain 70 gold. Lose 6 max HP.', cond: (run) => run.maxHp > 30, apply: (run, R) => { R.gold(run, 70); R.maxHp(run, -6); return 'He labels the vial "premium". +70 gold, -6 max HP.'; } },
      leave('"I was bluffing," he calls after you. "About everything."'),
    ],
  },
  {
    id: 'e_lamp_lottery', name: 'The Lamp Lottery', act: 2,
    text: 'Forty lamps hang from the cellar ceiling, each a different shade of not quite right. A sign: PICK ONE. The ticket costs whatever you have the least of.',
    choices: [
      { label: 'Pick a lamp (-25 gold, 50% upgrade, 50% -5 HP)', text: 'Pay 25 gold. 50%: upgrade a card (the first not yet upgraded). 50%: lose 5 HP.', cond: (run) => run.gold >= 25,
        apply: (run, R) => { R.gold(run, -25); const cands = run.deck.filter((i) => !i.up); if (R.rng(run).chance(0.5) && cands.length) { R.upgrade(run, cands[0].uid); return 'The lamp lights. A card in your deck brightens. It is upgraded.'; } R.hurt(run, 5); return 'The lamp goes out, and so does a little of you. -25 gold, -5 HP.'; } },
      { label: 'Pick a lamp (free, 30% potion)', text: '30%: gain a random potion. 70%: nothing.',
        apply: (run, R) => { if (R.rng(run).chance(0.3)) { R.addPotion(run, null); return 'The lamp drops a potion. It looks rehearsed.'; } return 'The lamp stays dark. It seems embarrassed.'; } },
      leave('The lamps all turn slightly to watch you go.'),
    ],
  },
  {
    id: 'e_black_market_clinic', name: 'The Black Market Clinic', act: 2,
    text: 'A curtain, a chair, a tray of instruments that have seen things. "No appointment? Wonderful. Neither did the last one."',
    choices: [
      { label: 'Full patch-up (-40 gold, heal 25)', text: 'Pay 40 gold. Heal 25 HP.', cond: (run) => run.gold >= 40, apply: (run, R) => { R.gold(run, -40); R.heal(run, 25); return 'Efficient, unsmiling, thorough. You heal 25 HP. -40 gold.'; } },
      { label: 'Cheap patch-up (-15 gold, heal 10, -2 max HP)', text: 'Pay 15 gold. Heal 10 HP, lose 2 max HP.', cond: (run) => run.gold >= 15, apply: (run, R) => { R.gold(run, -15); R.heal(run, 10); R.maxHp(run, -2); return 'You heal 10 HP. You also lose 2 max HP. They call that the discount.'; } },
      leave('The curtain falls shut, kindly.'),
    ],
  },
  {
    id: 'e_jarred_twin', name: 'A Jar With Your Name', act: 2,
    text: 'On a high shelf, a jar. It holds one of your cards, floating, pale, slightly annoyed. The label has your handwriting. You did not write it yet.',
    choices: [
      { label: 'Take it (copy a card, -5 HP)', text: 'Add a plain second copy of a chosen card. Lose 5 HP.', pick: 'card', cond: (run) => run.hp > 8 && run.deck.length > 0,
        apply: (run, R, inst) => { R.hurt(run, 5); R.addCard(run, inst.id); return 'The jar opens and the card steps out beside its original. They do not look at each other. -5 HP.'; } },
      { label: 'Smash it (+30 gold)', text: 'Gain 30 gold from the glass dealer who saw it.', apply: (run, R) => { R.gold(run, 30); return 'It makes a great noise. A man pays you 30 gold for the pieces.'; } },
      leave('The jar turns on its own, keeping its eyes on you.'),
    ],
  },

  // ---------------- ACT III: THE GILT THEATRE ----------------
  {
    id: 'e_costume_rack', name: 'The Costume Rack', act: 3,
    text: 'Backstage, a rack of costumes that fit nobody and everybody. Each has a tag with a role. One tag says YOU.',
    choices: [
      { label: 'Try on YOU (upgrade a card, -6 max HP)', text: 'Upgrade one card. Lose 6 max HP.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.maxHp > 28 && run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.maxHp(run, -6); R.upgrade(run, inst.uid); return 'It fits. A card is upgraded. You are 6 max HP smaller in it.'; } },
      { label: 'Steal a hat (+45 gold)', text: 'Gain 45 gold.', apply: (run, R) => { R.gold(run, 45); return 'The hat sells itself. +45 gold. Something in the rafters applauds.'; } },
      leave('The rack sways, taking a bow.'),
    ],
  },
  {
    id: 'e_rehearsal', name: 'Dress Rehearsal', act: 3,
    text: 'The stage is lit for nobody. A director in the dark says "again" and the stage manager hands you a script with your lines already written. Your lines include screaming.',
    choices: [
      { label: 'Play your part (-8 HP, graft)', text: 'Lose 8 HP. A normal graft reward screen follows.', cond: (run) => run.hp > 12, apply: (run, R) => { R.hurt(run, 8); R.queueGraftPick(run); return 'You scream on cue. The director weeps. -8 HP, and a graft is sewn into the reviews.'; } },
      { label: 'Improvise (50% +80 gold, 50% -8 HP)', text: '50%: gain 80 gold. 50%: lose 8 HP.', apply: (run, R) => { if (R.rng(run).chance(0.5)) { R.gold(run, 80); return 'Silence, then thunder. The house throws 80 gold onto the stage.'; } R.hurt(run, 8); return 'Silence, then a boot. You lose 8 HP.'; } },
      leave('"Again," says the dark, after you.'),
    ],
  },
  {
    id: 'e_balcony_seat', name: 'Box Seat', act: 3,
    text: 'The balcony is empty except for one occupied seat and a smell of old roses. The occupant is very still. They hold out a small velvet bag without turning.',
    choices: [
      { label: 'Take the bag (relic, -10 HP)', text: 'Gain a random relic. Lose 10 HP.', cond: (run) => run.hp > 14, apply: (run, R) => { R.hurt(run, 10); R.addRelic(run, null); return 'The bag is heavy. You are slightly less so. -10 HP, +1 relic.'; } },
      { label: 'Sit down beside them (heal 12)', text: 'Heal 12 HP.', apply: (run, R) => { R.heal(run, 12); return 'Neither of you speaks. The show is very good. You heal 12 HP.'; } },
      leave('The seat creaks as you leave. It was not you.'),
    ],
  },
  {
    id: 'e_standing_ovation', name: 'Standing Ovation', act: 3,
    text: 'An empty house starts applauding the moment you enter. It does not stop. It is the loudest thing you have ever heard, and it is pleased with you.',
    choices: [
      { label: 'Bow (+60 gold, potion, -7 HP)', text: 'Gain 60 gold and a random potion. Lose 7 HP from the noise.', cond: (run) => run.hp > 10, apply: (run, R) => { R.hurt(run, 7); R.gold(run, 60); R.addPotion(run, null); return 'The applause rises. Flowers fall from nowhere. +60 gold, +1 potion, -7 HP.'; } },
      { label: 'Raise a hand for silence (heal 8)', text: 'Heal 8 HP.', apply: (run, R) => { R.heal(run, 8); return 'Silence. It is somehow worse, then somehow better. You heal 8 HP.'; } },
      leave('The applause follows you into the corridor and waits outside.'),
    ],
  },
  {
    id: 'e_understudy', name: 'The Understudy', act: 3,
    text: 'A figure in your coat adjusts your posture in a mirror. They know your lines. They offer, politely, to take your place for one scene, for a modest fee.',
    choices: [
      { label: 'Hand over a card (remove it, +25 gold)', text: 'Remove a chosen card from your deck. Gain 25 gold.', pick: 'card', cond: (run) => run.deck.length > 8,
        apply: (run, R, inst) => { R.removeCard(run, inst.uid); R.gold(run, 25); return 'They take the card with them into the wings. +25 gold. Nobody will miss it, probably.'; } },
      { label: 'Pay them off (-20 gold, heal 14)', text: 'Pay 20 gold. Heal 14 HP.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.heal(run, 14); return 'They take the stage and the wounds with them. You heal 14 HP. -20 gold.'; } },
      leave('They return to the mirror, content to wait.'),
    ],
  },
  {
    id: 'e_dentist_chair', name: 'The Dentist Next Door', act: 1,
    text: 'A dentist in a ward that has no use for one. He holds up a molar and a business card. "Bring me a bad habit," he says. "I will take it out at the root."',
    choices: [
      { label: 'Extract a card (remove it, heal 5)', text: 'Remove a chosen card from your deck. Heal 5 HP.', pick: 'card', cond: (run) => run.deck.length > 8,
        apply: (run, R, inst) => { R.removeCard(run, inst.uid); R.heal(run, 5); return 'A small crack, a small relief. The card is gone. You heal 5 HP, and receive a lollipop.'; } },
      { label: 'Just a cleaning (-15 gold, heal 8)', text: 'Pay 15 gold. Heal 8 HP.', cond: (run) => run.gold >= 15, apply: (run, R) => { R.gold(run, -15); R.heal(run, 8); return 'He scrapes something off you. You heal 8 HP. -15 gold.'; } },
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
      { label: 'Borrow 90 gold (owe 120 later)', text: 'Gain 90 gold. You will owe him 120 later.', apply: (run, R) => { R.gold(run, 90); run.flags.debt = 120; return 'The money is warm from his pocket. +90 gold. He writes 120 in his ledger, and underlines it gently.'; } },
      { label: 'Borrow 40 gold (owe 55 later)', text: 'Gain 40 gold. You will owe him 55 later.', apply: (run, R) => { R.gold(run, 40); run.flags.debt = 55; return 'A smaller loan, a smaller underline. +40 gold. He writes 55.'; } },
      leave('"Another time," he says. He is already writing something.'),
    ],
  },
  {
    id: 'e_stray_patient', name: 'The Unregistered Patient', act: 1,
    text: 'A man sits on the stairs with a graft coming loose at the wrist. Nobody has signed him in. He is polite about it, which is worse.',
    choices: [
      { label: 'Stabilize him (-12 gold)', text: 'Pay 12 gold. He may remember.', cond: (run) => run.gold >= 12, apply: (run, R) => { R.gold(run, -12); run.flags.patient = 1; return 'You clamp, you tape, you do not know his name. -12 gold. He nods as if filing it.'; } },
      { label: 'Carry him to a bed (-6 HP)', text: 'Lose 6 HP. He will remember.', cond: (run) => run.hp > 10, apply: (run, R) => { R.hurt(run, 6); run.flags.patient = 2; return 'He weighs more than he looks. -6 HP. He holds your sleeve until the nurse arrives.'; } },
      leave('You step around him. He understands. That is the worst part.'),
    ],
  },
  {
    id: 'e_scar_reader', name: 'The Scar Reader', act: 1,
    text: 'An old woman reads your cards the way others read palms. "This one has a graft," she says, "and it is not entirely sure it wants one." She offers to take it off. Gently. The card will keep the shape of it.',
    choices: [
      { label: 'Lift the last graft (free, card remembers)', text: 'Remove the last graft from a grafted card, free. That card is marked: it may ask for the graft back later.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted),
        apply: (run, R, inst) => { const gid = inst.grafts[inst.grafts.length - 1]; R.stripGraft(run, inst.uid, gid); run.flags.mem = { uid: inst.uid, gid }; return 'The graft lifts like a plaster. The card keeps a pale outline where it was. It will remember.'; } },
      { label: 'Read your scars (heal 6)', text: 'Heal 6 HP.', apply: (run, R) => { R.heal(run, 6); return 'She reads you aloud for a while. You heal 6 HP. Some of it is accurate.'; } },
      leave('"The scars will wait," she says. They always do.'),
    ],
  },
  {
    id: 'e_cult_pamphlet', name: 'The Even Stitch', act: 1,
    text: 'A pamphlet is pressed into your hand by someone with perfectly even stitching. THE DECK IS A BODY, it reads. THE BODY OWES NOTHING. The last line is smaller: ASK ABOUT OUR VOW.',
    choices: [
      { label: 'Take the vow (+1 Budget, a promise due)', text: 'Gain 1 Budget permanently. They will come for what you promised.', apply: (run, R) => { R.budget(run, 1); run.flags.cult = 1; return 'You sign in even letters. +1 Budget. They bow, evenly, and write down your address.'; } },
      { label: 'Take the snacks (heal 7)', text: 'Heal 7 HP.', apply: (run, R) => { R.heal(run, 7); return 'The biscuits are excellent. You heal 7 HP. Nobody asks for anything.'; } },
      leave('You fold the pamphlet into a very small square.'),
    ],
  },
  {
    id: 'e_weigh_in', name: 'The Weigh-In', act: 1,
    text: 'A nurse with a deck scale and a printout. "Weight, Budget, difference," she recites. "The difference is what we call Strain. Step up, please."',
    choices: [
      { label: 'Step on the scale (no Strain: heal 8)', text: 'No Strain: heal 8 HP. Strain: gain 10 gold per Strain (max 40) and lose 3 HP.',
        apply: (run, R) => { const s = R.strainOf(run); if (s.strain === 0) { R.heal(run, 8); return 'Weight ' + s.weight + ', Budget ' + s.budget + '. "Very good," she says. You heal 8 HP.'; } const g = Math.min(40, 10 * s.strain); R.gold(run, g); R.hurt(run, 3); return 'Weight ' + s.weight + ', Budget ' + s.budget + '. Strain ' + s.strain + '. She sighs, pays you ' + g + ' gold for the data, and takes 3 HP for the sigh.'; } },
      { label: 'Have her trim a card (-4 HP, strip a graft)', text: 'Lose 4 HP. Remove the FIRST graft of a grafted card.', pick: 'card', pickFilter: grafted, cond: (run) => run.hp > 6 && run.deck.some(grafted),
        apply: (run, R, inst) => { R.hurt(run, 4); R.stripGraft(run, inst.uid, inst.grafts[0]); return 'She trims the oldest stitch and bins it. -4 HP. The scale is visibly relieved.'; } },
      leave('She prints the weight anyway and tucks it in your pocket.'),
    ],
  },
  {
    id: 'e_ward_ledger', name: 'The Visitor Log', act: 1,
    text: 'A clipboard on a string. Every line is a name and a time, and every name is yours in a different hand. A pen is chained to it. The note says: SIGN, AND WE WILL REMEMBER WHAT YOU SEW.',
    choices: [
      { label: 'Sign (+10 gold)', text: 'Gain 10 gold. Grafts sewn from now on are logged. Someone will settle up later.', apply: (run, R) => { R.gold(run, 10); run.flags.signed = run.stats.grafts | 0; return 'You sign. The pen is warm. +10 gold and a faint sense of being counted.'; } },
      { label: 'Sign a false name (random potion)', text: 'Gain a random potion. Nobody settles up.', apply: (run, R) => { R.addPotion(run, null); return 'You sign Dr. Nobody. A potion is handed over without eye contact.'; } },
      leave('The pen swings back and forth on its chain.'),
    ],
  },

  // ---------------- ACT II ----------------
  {
    id: 'e_patient_returns', name: 'A Familiar Wrist', act: 2,
    text: 'A man behind a tray of bottles lifts his sleeve to show a neat graft at the wrist. He is trying to remember how he knows you.',
    choices: [
      { label: 'Accept his gift (a relic)', text: 'Gain a random relic.', cond: (run) => run.flags.patient === 2, apply: (run, R) => { delete run.flags.patient; R.addRelic(run, null); return '"You carried me," he says. He presses a relic into your hand and will not hear no.'; } },
      { label: 'Accept his gift (potion, +30 gold)', text: 'Gain a random potion and 30 gold.', cond: (run) => run.flags.patient === 1, apply: (run, R) => { delete run.flags.patient; R.addPotion(run, null); R.gold(run, 30); return '"You clamped it," he says. A potion and 30 gold, from a tray that has seen fewer customers.'; } },
      { label: 'Browse his tray (-20 gold, potion)', text: 'Pay 20 gold. Gain a random potion.', cond: (run) => !run.flags.patient && run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.addPotion(run, null); return 'Nobody here owes you anything. The potion is fairly priced. -20 gold.'; } },
      leave('He keeps squinting at you, still working it out.'),
    ],
  },
  {
    id: 'e_debt_collector', name: 'The Collector, Courteous', act: 2,
    text: 'He appears in the market as if he had been there all along. "A word about the matter of the loan," he begins. If you owe nothing, the words are just a pleasant noise.',
    choices: [
      { label: 'Pay the balance (clear the debt)', text: 'Pay what you owe in gold. The debt is cleared.', cond: (run) => run.flags.debt > 0 && run.gold >= run.flags.debt, apply: (run, R) => { const d = run.flags.debt; R.gold(run, -d); delete run.flags.debt; return 'He counts it twice. -' + d + ' gold. "A pleasure," he says, and for once nobody is lying.'; } },
      { label: 'Pay in blood (-10 max HP, clear the debt)', text: 'Lose 10 max HP. The debt is cleared.', cond: (run) => run.flags.debt > 0 && run.maxHp > 30, apply: (run, R) => { R.maxHp(run, -10); delete run.flags.debt; return 'He does not take much, but what he takes does not come back. -10 max HP. The ledger is closed.'; } },
      { label: 'Send him away (fight 2 Orderlies)', text: 'Fight two Orderlies he brought. Win and the debt is cleared.', cond: (run) => run.flags.debt > 0, apply: (run, R) => { delete run.flags.debt; R.queueFight(run, ['orderly', 'orderly']); return '"As you like," he says, and whistles. Two orderlies come in with mops and an invoice.'; } },
      { label: 'Take his spare receipt (+20 gold)', text: 'Gain 20 gold. He had you confused with someone else.', cond: (run) => !run.flags.debt, apply: (run, R) => { R.gold(run, 20); return '"Not you," he says, embarrassed, and pays you 20 gold for the inconvenience.'; } },
      leave('He writes it down. The number is bigger than it was.'),
    ],
  },
  {
    id: 'e_borrowed_graft', name: 'Graft on Account', act: 2,
    text: 'A stall that sells grafts without a price tag. "On account," says the vendor, whose face is a very good loan. "You will not notice the bill until it arrives."',
    choices: [
      { label: 'Take a graft on account (free now, billed later)', text: 'A normal graft reward screen follows. Something will be taken back later.', apply: (run, R) => { run.flags.owe = 1; R.queueGraftPick(run); return 'The graft is yours, warm and unpaid. He writes your name on a small card and puts it in a very large drawer.'; } },
      { label: 'Pay now (-60 gold, graft)', text: 'Pay 60 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 60, apply: (run, R) => { R.gold(run, -60); R.queueGraftPick(run); return 'He looks almost sad to be paid. -60 gold. A graft follows.'; } },
      leave('"Everyone comes back," he says, kindly.'),
    ],
  },
  {
    id: 'e_load_balancer', name: 'The Load Balancer', act: 2,
    text: 'A man in a hard hat walks across your deck with a spirit level. "Heavy here," he says, tapping a card. "Light there. We can even that out, and the stitches do not mind. Most of them."',
    choices: [
      { label: 'Move a graft to a Bare card (free)', text: 'Move the last graft of a grafted card onto the first card that can take it and has no grafts. The Bare card is no longer Bare, so it escapes the Tithe but the weight stays.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted) && run.deck.length > 1,
        apply: (run, R, inst) => { const gid = inst.grafts[inst.grafts.length - 1]; const dest = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length === 0 && (i.id.charAt(0) !== 'j')).find((i) => R.moveGraft(run, inst.uid, i.uid, gid)); return dest ? 'The graft is lifted, carried across the deck, and set down on a new card. It sits up straight. The weight is the same. The Tithe is not.' : 'He walks the whole deck and finds no card that will take it. No charge.'; } },
      { label: 'Weigh the deck (heal 5)', text: 'Hear Weight, Budget and Strain. Heal 5 HP.', apply: (run, R) => { const s = R.strainOf(run); R.heal(run, 5); return 'Weight ' + s.weight + '. Budget ' + s.budget + '. Strain ' + s.strain + ', Tithed ' + s.tithed.length + (s.backfire ? ', Backfire ' + s.backfire : '') + '. He gives you tea. You heal 5 HP.'; } },
      leave('He taps the hard hat and goes up the stairs backwards.'),
    ],
  },
  {
    id: 'e_graft_clone', name: 'The Duplicator', act: 2,
    text: 'A printing press that does not take paper. A tray says INSERT ONE STITCHED CARD. The output slot already holds a card, plain, wearing a graft that has not stopped blinking.',
    choices: [
      { label: 'Clone a card with its graft (-60 gold)', text: 'Pay 60 gold. Add a copy of a card that has exactly 1 graft, with the same graft. Its weight raises Strain.', pick: 'card', pickFilter: (i) => i.grafts.length === 1, cond: (run) => run.gold >= 60 && run.deck.some((i) => i.grafts.length === 1),
        apply: (run, R, inst) => { R.gold(run, -60); R.addCard(run, inst.id); const c = run.deck[run.deck.length - 1]; if (inst.up) R.upgrade(run, c.uid); R.addGraft(run, c.uid, inst.grafts[0]); return 'The press shudders and hands you a twin with the same stitch and the same expression. -60 gold. Mind the Strain.'; } },
      { label: 'Clone a card, plain (-12 HP)', text: 'Lose 12 HP. Add a plain copy of any card.', pick: 'card', cond: (run) => run.hp > 16 && run.deck.length > 0,
        apply: (run, R, inst) => { R.hurt(run, 12); R.addCard(run, inst.id); return 'The press takes 12 HP and prints a copy with no graft and no memory. It is, however, Bare.'; } },
      leave('The blinking graft in the slot follows you with its light.'),
    ],
  },
  {
    id: 'e_cure_shelf', name: 'The Cure Shelf', act: 2,
    text: 'Two shelves behind a locked glass door. Left: cures for the body of the deck. Right: cures for the arithmetic. The keeper has a tidy handwriting and a poor opinion of Budget.',
    choices: [
      { label: 'Left shelf (-20 gold, 2 potions)', text: 'Pay 20 gold. Gain Unjam Solvent and Absolution Drops.', cond: (run) => run.gold >= 20, apply: (run, R) => { R.gold(run, -20); R.addPotion(run, 'p_unjam'); R.addPotion(run, 'p_untithe'); return 'Two small bottles, labeled in the keeper\'s tidy hand. -20 gold. Only as many as you can carry.'; } },
      { label: 'Right shelf (-25 gold, 2 potions)', text: 'Pay 25 gold. Gain Borrowed Budget and Loaded Dice.', cond: (run) => run.gold >= 25, apply: (run, R) => { R.gold(run, -25); R.addPotion(run, 'p_borrowed_budget'); R.addPotion(run, 'p_loaded_dice'); return 'Two bottles that clink like coins. -25 gold. Only as many as you can carry.'; } },
      leave('The keeper locks the glass again, with relief.'),
    ],
  },

  // ---------------- ACT III ----------------
  {
    id: 'e_memory_returns', name: 'The Card That Remembers', act: 3,
    text: 'A card in your deck is warm. You did not play it. You turn it over and it shows you a pale outline on its face, the shape of a graft that is no longer there.',
    choices: [
      { label: 'Re-sew its graft (free, upgrade, weight returns)', text: 'Re-sew the graft that was lifted from that card, and upgrade it. The weight returns with it.', cond: (run) => !!run.flags.mem && run.deck.some((i) => i.uid === run.flags.mem.uid),
        apply: (run, R) => { const m = run.flags.mem; delete run.flags.mem; const r = R.addGraft(run, m.uid, m.gid); if (r && r.ok) { R.upgrade(run, m.uid); return 'The graft slots into its outline as if it had never left. The card is upgraded, and warmer. The weight came back too.'; } return 'The outline will not take the graft any more. The card sighs and cools.'; } },
      { label: 'Let it forget (upgrade, stays plain)', text: 'Upgrade that card. It stays plain.', cond: (run) => !!run.flags.mem && run.deck.some((i) => i.uid === run.flags.mem.uid),
        apply: (run, R) => { const m = run.flags.mem; delete run.flags.mem; R.upgrade(run, m.uid); return 'The outline fades. The card is upgraded and lighter. It does not say thank you; it was the one who asked.'; } },
      { label: 'Read your own scars (heal 10)', text: 'Heal 10 HP.', cond: (run) => !run.flags.mem || !run.deck.some((i) => i.uid === run.flags.mem.uid), apply: (run, R) => { R.heal(run, 10); return 'Nothing in the deck is asking for anything. You sit with it. You heal 10 HP.'; } },
      leave('The warmth fades. For now.'),
    ],
  },
  {
    id: 'e_cult_recruiter', name: 'The Even Stitch, Again', act: 3,
    text: 'They are waiting at the foot of the stage, in a line, perfectly even. "It is the day," says the one in front. "You promised."',
    choices: [
      { label: 'Keep the vow (strip a card bare, +2 Budget)', text: 'Remove EVERY graft from one grafted card. Gain 2 Budget permanently.', pick: 'card', pickFilter: grafted, cond: (run) => run.flags.cult === 1 && run.deck.some(grafted),
        apply: (run, R, inst) => { for (const g of inst.grafts.slice()) R.stripGraft(run, inst.uid, g); delete run.flags.cult; R.budget(run, 2); return 'They unpick it in a single clean motion. +2 Budget. They bow again, evenly, and leave no crumbs.'; } },
      { label: 'Break the vow (-12 max HP, +80 gold)', text: 'Lose 12 max HP and gain 80 gold. The vow is void.', cond: (run) => run.flags.cult === 1 && run.maxHp > 34, apply: (run, R) => { delete run.flags.cult; R.maxHp(run, -12); R.gold(run, 80); return 'They take the 12 max HP politely. They also press 80 gold on you, for the trouble. It feels like an apology.'; } },
      { label: 'Donate (-30 gold, heal 12)', text: 'Pay 30 gold. Heal 12 HP.', cond: (run) => run.flags.cult !== 1 && run.gold >= 30, apply: (run, R) => { R.gold(run, -30); R.heal(run, 12); return 'Everyone is very even about it. -30 gold. You heal 12 HP.'; } },
      leave('They straighten the line behind you.'),
    ],
  },
  {
    id: 'e_repossession', name: 'Repossession', act: 3,
    text: 'Two men in matching gloves and a van with no doors. They have a clipboard with your name on it and a small, regretful smile.',
    choices: [
      { label: 'Let them take a graft (+40 gold, clear the debt)', text: 'They remove the last graft from one grafted card (the one with the most grafts). You gain 40 gold. The debt is cleared.', cond: (run) => run.flags.owe === 1 && run.deck.some(grafted),
        apply: (run, R) => { delete run.flags.owe; const t = run.deck.filter(grafted).sort((a, b) => b.grafts.length - a.grafts.length)[0]; R.stripGraft(run, t.uid, t.grafts[t.grafts.length - 1]); R.gold(run, 40); return 'Thread, scissors, a wet sound. The graft goes into the van. They leave you 40 gold for the inconvenience, which is more than the usual.'; } },
      { label: 'Settle in gold (-70 gold, clear the debt)', text: 'Pay 70 gold. The debt is cleared.', cond: (run) => run.flags.owe === 1 && run.gold >= 70, apply: (run, R) => { R.gold(run, -70); delete run.flags.owe; return 'They count it on the van roof. -70 gold. They shake your hand in the glove.'; } },
      { label: 'Pick through the van (+25 gold)', text: 'Gain 25 gold. They are on a different street today.', cond: (run) => run.flags.owe !== 1, apply: (run, R) => { R.gold(run, 25); return 'The van is empty except for a purse of loose coins. +25 gold. Somebody else is having a bad day.'; } },
      leave('They tick a box and let you go. The box does not stay ticked.'),
    ],
  },
  {
    id: 'e_ledger_audit', name: 'The Audit', act: 3,
    text: 'A woman at a folding table, with the visitor log open in front of her. She has been counting your stitches since the ward, and she has a number.',
    choices: [
      { label: 'Collect the settlement (+12 gold per graft)', text: 'Gain 12 gold per graft you have sewn since you signed the log (max 72).', cond: (run) => run.flags.signed !== undefined, apply: (run, R) => { const n = Math.max(0, (run.stats.grafts | 0) - run.flags.signed); const g = Math.min(72, 12 * n); delete run.flags.signed; R.gold(run, g); return n + ' graft' + (n === 1 ? '' : 's') + ' logged since the ward. +' + g + ' gold. She stamps PAID with satisfaction.'; } },
      { label: 'Contest the count (heal 8, no gold)', text: 'Heal 8 HP. The log is closed with no settlement.', cond: (run) => run.flags.signed !== undefined, apply: (run, R) => { delete run.flags.signed; R.heal(run, 8); return 'You argue pleasantly. She closes the log and gives you tea. You heal 8 HP, and no gold.'; } },
      { label: 'Audit yourself (-15 gold, upgrade a card)', text: 'Pay 15 gold. Upgrade a card.', pick: 'card', pickFilter: (i) => !i.up, cond: (run) => run.flags.signed === undefined && run.gold >= 15 && run.deck.some((i) => !i.up),
        apply: (run, R, inst) => { R.gold(run, -15); R.upgrade(run, inst.uid); return 'She finds an error in your favour and charges for it. A card is upgraded. -15 gold.'; } },
      leave('She turns a page. It is yours.'),
    ],
  },
  {
    id: 'e_glassblower', name: 'The Glassblower', act: 3,
    text: 'A furnace backstage and a man who makes things that were meant to break. He eyes your most overloaded card the way a baker eyes a hot loaf. "Shatter is just glass finishing early," he says.',
    choices: [
      { label: 'Shatter an Overload (+70 gold, +1 Budget)', text: 'Destroy a card with 3 grafts. Gain 70 gold and 1 Budget permanently.', pick: 'card', pickFilter: (i) => i.grafts.length === 3, cond: (run) => run.deck.some((i) => i.grafts.length === 3),
        apply: (run, R, inst) => { R.shatter(run, inst.uid); R.gold(run, 70); R.budget(run, 1); return 'He breaks it with a single tap. The shards are very pretty and very expensive. +70 gold, +1 Budget. The weight leaves with them.'; } },
      { label: 'Buy a Shatter Ward (-80 gold, relic)', text: 'Pay 80 gold. Gain the relic Shatter Ward (Shatter chance 10% lower), if you do not own it.', cond: (run) => run.gold >= 80 && !run.relics.includes('r_shatter_ward'),
        apply: (run, R) => { R.gold(run, -80); R.addRelic(run, 'r_shatter_ward'); return 'A thin glass ring, hot from the furnace. -80 gold. "It will break," he says, "later than usual."'; } },
      { label: 'Sweep the shards (+25 gold)', text: 'Gain 25 gold.', apply: (run, R) => { R.gold(run, 25); return 'You sweep for an hour. +25 gold. Nobody in the house is cut.'; } },
      leave('He turns back to the furnace and exhales through the pipe.'),
    ],
  },

  // =====================================================================
  // CONTENT WAVE 3 (H3): events that put Temper, Strain, the Thread and Overload into play.
  // Flags used: debt (shared with the Friendly Lender), spool (charges for the Cursed Spool relic).
  // =====================================================================
  {
    id: 'e_tailor_temper', name: 'The Tailor Who Hammers', act: 0,
    text: 'A tailor with a cobbler\'s hammer and a mouthful of pins. "Patches come off," he says. "Hammered patches do not. They become the card. Lighter on the books, too. Heavier on the conscience."',
    choices: [
      { label: 'Temper a card (45 gold)', text: 'Pay 45 gold. All live grafts on a card are fused into it for good: boons AND prices stay, each weighs 1 less, the card stops being an Overload, and its patch slots empty. Max 4 fused grafts per card.', pick: 'card', pickFilter: canFuse, cond: (run) => run.gold >= 45 && run.deck.some(canFuse),
        apply: (run, R, inst) => { if (!fuseInst(run, inst)) return 'The hammer finds nothing it can fuse. No charge.'; R.gold(run, -45); return 'Three taps and the patches stop being patches. -45 gold. You cannot strip them now, and he will not refund the Prices.'; } },
      { label: 'Temper a card (7 max HP)', text: 'Lose 7 max HP. The same Temper, paid in blood.', pick: 'card', pickFilter: canFuse, cond: (run) => run.maxHp > 28 && run.deck.some(canFuse),
        apply: (run, R, inst) => { if (!fuseInst(run, inst)) return 'The hammer finds nothing it can fuse. No charge.'; R.maxHp(run, -7); return 'He takes the fee from somewhere behind the ribs. -7 max HP. The card is permanent now, and so is the invoice.'; } },
      leave('"Loose threads are honest," he says, spitting a pin.'),
    ],
  },
  {
    id: 'e_compound_interest', name: 'Compound Interest', act: 2,
    text: 'The collector has brought a ledger, a lamp and a second, heavier ledger. "I do not raise interest," he says. "I let it grow." If you owe him nothing, he offers to fix that.',
    choices: [
      { label: 'Settle in the alley (fight, +40 gold now)', text: 'Fight a Tax Collector (it also takes gold from Gilded cuts). Win and the debt is cleared; you receive 40 gold up front.', cond: (run) => run.flags.debt > 0,
        apply: (run, R) => { delete run.flags.debt; R.gold(run, 40); R.queueFight(run, ['tax_collector']); return 'He sets the lamp down carefully, as if it were the dangerous thing. You are paid 40 gold in advance, for the risk.'; } },
      { label: 'Restructure (-1 Budget)', text: 'The debt is cleared. Lose 1 Budget permanently, which can push grafts into Strain and hurt Bare cards.', cond: (run) => run.flags.debt > 0,
        apply: (run, R) => { delete run.flags.debt; R.budget(run, -1); return 'He converts what you owe into room you no longer have. -1 Budget. The ledger closes, relieved.'; } },
      { label: 'Borrow against a graft (100 gold)', text: 'Gain 100 gold and owe 150 later. A normal graft reward screen follows, since you have a plan.', cond: (run) => !run.flags.debt,
        apply: (run, R) => { run.flags.debt = 150; R.gold(run, 100); R.queueGraftPick(run); return 'He writes 150 and underlines it twice. +100 gold. Then he holds the door for your next stitch.'; } },
      leave('He adds a line to the heavier ledger. It grows slightly.'),
    ],
  },
  {
    id: 'e_seamstress_move', name: 'The Seamstress of Second Thoughts', act: 1,
    text: 'She works at a window with the light behind her. "Grafts are not tattoos," she says. "They can be moved. Mind where. A card with one graft already has ideas of its own."',
    choices: [
      { label: 'Move a graft (15 gold)', text: 'Pay 15 gold. Move the last graft of a grafted card onto the card with the most grafts that still has room. The source may become Bare and open to the Tithe.', pick: 'card', pickFilter: grafted, cond: (run) => run.gold >= 15 && run.deck.some(grafted) && run.deck.length > 1,
        apply: (run, R, inst) => {
          const gid = inst.grafts[inst.grafts.length - 1];
          const cands = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length < 2 && !i.id.startsWith('j_')).sort((a, b) => b.grafts.length - a.grafts.length);
          const dest = cands.find((i) => R.moveGraft(run, inst.uid, i.uid, gid));
          if (!dest) return 'She holds it up to the light, finds no card that will have it, and hands it back. No charge.';
          R.gold(run, -15); return 'She lifts it with two pins and sets it down in a new place. -15 gold. Its Price came with it; its Weight too.';
        } },
      { label: 'Move a graft (6 HP)', text: 'Lose 6 HP. The same move, paid in blood.', pick: 'card', pickFilter: grafted, cond: (run) => run.hp > 10 && run.deck.some(grafted) && run.deck.length > 1,
        apply: (run, R, inst) => {
          const gid = inst.grafts[inst.grafts.length - 1];
          const cands = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length < 2 && !i.id.startsWith('j_')).sort((a, b) => b.grafts.length - a.grafts.length);
          const dest = cands.find((i) => R.moveGraft(run, inst.uid, i.uid, gid));
          if (!dest) return 'She holds it up to the light, finds no card that will have it, and hands it back. No charge.';
          R.hurt(run, 6); return 'She works without anaesthetic, yours or the card\'s. -6 HP. The graft sits in its new home like a guest.';
        } },
      leave('"Think about it," she says. "Everything does."'),
    ],
  },
  {
    id: 'e_school_mirror', name: 'The Mirror That Agrees', act: 3,
    text: 'A tall mirror in the wings, stitched along its frame. It does not show your face. It shows your hand, holding a card, and then a second hand, holding the same card with the same school on it.',
    choices: [
      { label: 'Copy a graft (8 HP)', text: 'Lose 8 HP. Copy the last graft of a grafted card onto the first Bare card that accepts it. The copy weighs the same and carries the same Price, so Strain may follow.', pick: 'card', pickFilter: grafted, cond: (run) => run.hp > 12 && run.deck.some(grafted),
        apply: (run, R, inst) => {
          const gid = inst.grafts[inst.grafts.length - 1];
          const bare = run.deck.filter((i) => i.uid !== inst.uid && i.grafts.length === 0 && !(i.fused && i.fused.length) && !i.id.startsWith('j_'));
          for (const b of bare) { const r = R.addGraft(run, b.uid, gid); if (r && r.ok) { R.hurt(run, 8); return 'The reflection leans out and sews. A second card now carries the same school. -8 HP. It agrees with everything you said.'; } }
          return 'The mirror looks over your Bare cards and finds none that will wear it. It shows you your own face instead. No charge.';
        } },
      { label: 'Take a shard (+35 gold, -3 max HP)', text: 'Gain 35 gold. Lose 3 max HP.', cond: (run) => run.maxHp > 24,
        apply: (run, R) => { R.gold(run, 35); R.maxHp(run, -3); return 'A shard comes away in your hand and cuts something that is not your hand. +35 gold, -3 max HP.'; } },
      leave('The mirror shows you leaving. It rehearses it twice.'),
    ],
  },
  {
    id: 'e_cursed_spool', name: 'A Spool That Hums', act: 0,
    text: 'A wooden spool on a windowsill, wound with thread the colour of old bruises. It is warm. When you pick it up it pays out into your palm, then pays again, like a stitch repeated. The label says: NEXT FIGHT ONLY. THE FIGHT AFTER THAT, ASK THE FIGHT BEFORE.',
    choices: [
      { label: 'Wind it once (-6 HP, 1 charge)', text: 'Lose 6 HP. Gain the relic Cursed Spool if you lack it, plus 1 charge: in your NEXT combat every Thread payout is paid twice.', cond: (run) => run.hp > 10,
        apply: (run, R) => { R.hurt(run, 6); R.addRelic(run, 'r_cursed_spool'); run.flags.spool = (run.flags.spool | 0) + 1; return 'The spool takes six HP and starts to hum. One fight, double the payouts. It will not say what the second fight costs.'; } },
      { label: 'Wind it twice (-13 HP, -1 max HP, 2 charges)', text: 'Lose 13 HP and 1 max HP. Gain the relic if you lack it, plus 2 charges: your next two combats pay every Thread payout twice.', cond: (run) => run.hp > 18 && run.maxHp > 24,
        apply: (run, R) => { R.hurt(run, 13); R.maxHp(run, -1); R.addRelic(run, 'r_cursed_spool'); run.flags.spool = (run.flags.spool | 0) + 2; return 'It hums like a kettle that wants something. Two fights of double payouts, for 13 HP and a little more.'; } },
      { label: 'Sell it (+25 gold)', text: 'Gain 25 gold.', apply: (run, R) => { R.gold(run, 25); return 'The pawnbroker holds it with tongs. +25 gold. He does not ask where you got it.'; } },
      leave('The spool pays out into thin air for a while, then stops, offended.'),
    ],
  },
  {
    id: 'e_cloakroom', name: 'The Cloakroom', act: 1,
    text: 'An attendant behind a counter of numbered hooks. "Check anything," she says, "for a fee in your favour." She eyes your deck the way a bank eyes an empty pocket. "Travel light and I will tip you."',
    choices: [
      { label: 'Check a graft (+35 gold)', text: 'Remove the last graft of a grafted card. Gain 35 gold. The graft is gone for good.', pick: 'card', pickFilter: grafted, cond: (run) => run.deck.some(grafted),
        apply: (run, R, inst) => { R.stripGraft(run, inst.uid, inst.grafts[inst.grafts.length - 1]); R.gold(run, 35); return 'She hangs it on hook 9 and hands you a ticket she then eats. +35 gold. The weight is off your back and the boon with it.'; } },
      { label: 'Travel light (needs no Strain: potion, +10 gold)', text: 'Needs zero Strain. Gain a random potion and 10 gold. If you are Strained, she sniffs and gives you nothing.',
        apply: (run, R) => { const s = R.strainOf(run); if (s.strain > 0) return 'Strain ' + s.strain + '. "Not light," she says, and turns a page. Nothing.'; R.addPotion(run, null); R.gold(run, 10); return 'You are light, she says. A potion and 10 gold are your tip.'; } },
      leave('She hands your absent coat back to you anyway.'),
    ],
  },
  {
    id: 'e_proof_house', name: 'The Proof House', act: 3,
    text: 'A concrete room where things are made to fail on purpose. A rack of Overloaded cards hums on a bench. An inspector in goggles says "Third graft, is it? I can certify it or I can break it. You choose which of us gets the surprise."',
    choices: [
      { label: 'Certify it (Temper, 6 HP)', text: 'Lose 6 HP. Temper a card with 3 grafts: it is no longer an Overload (no x1.5, no Shatter roll) and its grafts fuse for good.', pick: 'card', pickFilter: (i) => i.grafts.length === 3 && canFuse(i), cond: (run) => run.hp > 10 && run.deck.some((i) => i.grafts.length === 3 && canFuse(i)),
        apply: (run, R, inst) => { if (!fuseInst(run, inst)) return 'The stamp bounces off. No charge.'; R.hurt(run, 6); return 'He stamps it SAFE and the stamp hurts you instead. -6 HP. The card holds, and now it cannot let go.'; } },
      { label: 'Break-test it (50%)', text: 'Pick a card with 3 grafts. 50%: it survives and you gain 90 gold. 50%: it Shatters (destroyed) and you gain 1 Budget.', pick: 'card', pickFilter: (i) => i.grafts.length === 3, cond: (run) => run.deck.some((i) => i.grafts.length === 3),
        apply: (run, R, inst) => { if (R.rng(run).chance(0.5)) { R.gold(run, 90); return 'It takes the load and hums. He pays 90 gold for the data. You keep the card.'; } R.shatter(run, inst.uid); R.budget(run, 1); return 'It goes with a high note. The card is destroyed. +1 Budget, as the weight leaves with the glass.'; } },
      leave('"Come back when it has failed once," he says, to the bench.'),
    ],
  },
  {
    id: 'e_cross_loom', name: 'The Cross-Loom', act: 2,
    text: 'A loom the size of a doorway, threaded in two colours at once. A weaver feeds it your cards one at a time. "Single colour is sturdy," she says. "Two colours is interesting. Interesting is how you get a Line of five."',
    choices: [
      { label: 'Weave a random graft (6 HP)', text: 'Lose 6 HP. Add one random graft to a card that already has exactly 1 graft. It may bridge two schools. The Weight is real.', pick: 'card', pickFilter: (i) => i.grafts.length === 1, cond: (run) => run.hp > 10 && run.deck.some((i) => i.grafts.length === 1),
        apply: (run, R, inst) => { const g = R.addGraftRandom(run, inst.uid); if (!g) return 'Nothing in the basket fits this card. No charge.'; R.hurt(run, 6); return 'The shuttle goes through twice. The card now wears a second colour. -6 HP.'; } },
      { label: 'Commission a pattern (45 gold)', text: 'Pay 45 gold. A normal graft reward screen follows.', cond: (run) => run.gold >= 45,
        apply: (run, R) => { R.gold(run, -45); R.queueGraftPick(run); return 'She names a price and a pattern, in that order. -45 gold. A graft follows.'; } },
      { label: 'Sell your offcuts (+30 gold)', text: 'Gain 30 gold and lose 4 HP to the shuttle.', cond: (run) => run.hp > 8,
        apply: (run, R) => { R.gold(run, 30); R.hurt(run, 4); return 'You sweep the offcuts into her palm. +30 gold, -4 HP.'; } },
      leave('The loom keeps weaving without you, in two colours, with feeling.'),
    ],
  },

  // ---------------- WARD EVENTS (phase aware: the Chapel's midday, evening and night versions differ; `phase` is the hint the Ward weights by) ----------------
  {
    id: 'e_w_menu_board', name: 'The Menu Board', act: 0, ward: true, phase: 'evening',
    text: 'A chalk menu hangs outside the canteen. The specials change with the hour and the handwriting changes with them. Someone has underlined "while supplies last" twice.',
    choices: [
      { label: 'Order the special (-12 gold)', text: 'Pay 12 gold. Midday: heal 14. Evening: heal 20. Night: 50% heal 26, 50% lose 6 HP.', cond: (run) => run.gold >= 12,
        apply: (run, R) => { R.gold(run, -12); const p = phaseOf(run); if (p === 'night') { if (R.rng(run).chance(0.5)) { R.heal(run, 26); return 'The night cook is a genius. Heal 26 HP. -12 gold.'; } R.hurt(run, 6); return 'It moved. You lose 6 HP. -12 gold.'; } const n = p === 'evening' ? 20 : 14; R.heal(run, n); return `A proper meal. Heal ${n} HP. -12 gold.`; } },
      { label: 'Raid the trolley', text: 'Midday: 25 gold. Evening: a potion. Night: 60% 45 gold, 40% lose 8 HP.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 25); return 'Nobody counts the trolley at noon. +25 gold.'; } if (p === 'evening') { R.addPotion(run, null); return 'Under the napkins, a potion. It was meant for someone else.'; } if (R.rng(run).chance(0.6)) { R.gold(run, 45); return 'The night shift shares. +45 gold.'; } R.hurt(run, 8); return 'The night shift does not share. You lose 8 HP.'; } },
      leave('The menu changes while you watch.'),
    ],
  },
  {
    id: 'e_w_visiting_hours', name: 'Visiting Hours', act: 0, ward: true, phase: 'midday',
    text: 'A queue of relatives with flowers and questions. Visiting hours end at an hour nobody has written down. A sign promises that all donations are tax deductible, somewhere.',
    choices: [
      { label: 'Accept donations', text: 'Midday: 35 gold. Evening: 20 gold and heal 6. Night: 8 gold only.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 35); return 'Generous, and busy. +35 gold.'; } if (p === 'evening') { R.gold(run, 20); R.heal(run, 6); return 'Fewer visitors, warmer ones. +20 gold, heal 6.'; } R.gold(run, 8); return 'Only the lost come at night. +8 gold.'; } },
      { label: 'Take the flowers', text: 'Midday: heal 8. Evening: heal 12. Night: a random potion.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'night') { R.addPotion(run, null); return 'The flowers hide a small bottle. Nobody claims it.'; } const n = p === 'evening' ? 12 : 8; R.heal(run, n); return `Lilies. Heal ${n} HP.`; } },
      leave('You show a visitor the way out. They show you the way in.'),
    ],
  },
  {
    id: 'e_w_noon_rounds', name: 'Consultants at Noon', act: 1, ward: true, phase: 'midday',
    text: 'A row of consultants walks the corridor in step, white coats blowing. At noon they are cheerful. By evening they are tired. After dark you have not seen them at all.',
    choices: [
      { label: 'Ask for a second opinion', text: 'Midday: gain 30 gold and heal 5. Evening: heal 10. Night: lose 5 HP, gain a relic.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 30); R.heal(run, 5); return 'A cheerful invoice in your favour. +30 gold, heal 5.'; } if (p === 'evening') { R.heal(run, 10); return 'Tired and kind. Heal 10 HP.'; } R.hurt(run, 5); R.addRelic(run, null); return 'The opinion is unpleasant and comes with a relic. -5 HP.'; } },
      { label: 'Follow them in step', text: 'Gain 1 Budget at midday, 12 gold at evening, a potion at night.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.budget(run, 1); return 'You keep pace. +1 Budget.'; } if (p === 'evening') { R.gold(run, 12); return 'They drop a pen, then a coin. +12 gold.'; } R.addPotion(run, null); return 'They drop a bottle and do not look back.'; } },
      leave('You step aside. They do not.'),
    ],
  },
  {
    id: 'e_w_supper_bell', name: 'The Supper Bell', act: 1, ward: true, phase: 'evening',
    text: 'A brass bell on a string. When it rings, every door in the corridor opens an inch. What looks out depends on the hour.',
    choices: [
      { label: 'Ring it', text: 'Midday: 20 gold. Evening: heal 14. Night: a fight with an Orderly for 55 gold.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 20); return 'Pocket change falls out of the doors. +20 gold.'; } if (p === 'evening') { R.heal(run, 14); return 'Soup, quietly. Heal 14 HP.'; } R.gold(run, 55); R.queueFight(run, ['orderly']); return 'The night orderly has been waiting for the bell. +55 gold now, then a fight.'; } },
      { label: 'Muffle the bell (-1 max HP)', text: 'Lose 1 max HP. Gain 1 Budget.', apply: (run, R) => { R.maxHp(run, -1); R.budget(run, 1); return 'You wrap it in a sock. The doors stay closed. -1 max HP, +1 Budget.'; } },
      leave('The bell rings itself, a little later.'),
    ],
  },
  {
    id: 'e_w_night_porter', name: 'The Night Porter', act: 0, ward: true, phase: 'night',
    text: 'A porter with a trolley and no visible shift. He knows what is behind every door and would like you to know he knows. He offers it at a price that depends on the hour.',
    choices: [
      { label: 'Buy a tip (-20 gold)', text: 'Pay 20 gold. Midday: heal 6. Evening: a potion. Night: a relic.', cond: (run) => run.gold >= 20,
        apply: (run, R) => { R.gold(run, -20); const p = phaseOf(run); if (p === 'midday') { R.heal(run, 6); return 'A boring tip, kindly meant. Heal 6. -20 gold.'; } if (p === 'evening') { R.addPotion(run, null); return 'The tip is a bottle. -20 gold.'; } R.addRelic(run, null); return 'The tip is a relic in a laundry bag. -20 gold.'; } },
      { label: 'Help with the trolley', text: 'Midday: 12 gold. Evening: 12 gold. Night: 50% a relic, 50% lose 8 HP.',
        apply: (run, R) => { const p = phaseOf(run); if (p !== 'night') { R.gold(run, 12); return 'He tips badly. +12 gold.'; } if (R.rng(run).chance(0.5)) { R.addRelic(run, null); return 'The trolley has a false bottom. A relic.'; } R.hurt(run, 8); return 'The trolley has a mind of its own. You lose 8 HP.'; } },
      leave('He nods, as if you had said something very wise.'),
    ],
  },
  {
    id: 'e_w_lost_property', name: 'Lost Property', act: 2, ward: true, phase: ['midday', 'evening'],
    text: 'A cage of umbrellas, false teeth and one very patient clipboard. A tag on each item. The tags change colour with the light.',
    choices: [
      { label: 'Claim something', text: 'Midday: 40 gold. Evening: 20 gold and a potion. Night: lose 6 HP, gain 15 gold.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 40); return 'Someone else will miss it. +40 gold.'; } if (p === 'evening') { R.gold(run, 20); R.addPotion(run, null); return 'A coat with a bottle in the lining. +20 gold.'; } R.hurt(run, 6); R.gold(run, 15); return 'The false teeth bite. -6 HP, +15 gold.'; } },
      { label: 'Hand something in', text: 'Heal 10 at midday, heal 6 and gain 1 Budget at evening, gain 1 max HP at night.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.heal(run, 10); return 'A reward, in the form of tea. Heal 10 HP.'; } if (p === 'evening') { R.heal(run, 6); R.budget(run, 1); return 'The clipboard approves. Heal 6, +1 Budget.'; } R.maxHp(run, 1); return 'It was yours all along. +1 max HP.'; } },
      leave('You take nothing and the cage looks hurt.'),
    ],
  },
  {
    id: 'e_w_laundry_chute', name: 'The Laundry Chute', act: 2, ward: true, phase: 'evening',
    text: 'A steel chute in the wall, warm. Something comes down it every few minutes. At noon it is sheets. At dusk it is pockets. At night it is not sheets.',
    choices: [
      { label: 'Check the pockets', text: 'Midday: 15 gold. Evening: 35 gold. Night: 50% 60 gold, 50% lose 9 HP.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 15); return 'Mostly lint. +15 gold.'; } if (p === 'evening') { R.gold(run, 35); return 'Someone forgot their wage. +35 gold.'; } if (R.rng(run).chance(0.5)) { R.gold(run, 60); return 'A fat envelope. +60 gold.'; } R.hurt(run, 9); return 'The pocket had a hand in it. You lose 9 HP.'; } },
      { label: 'Climb the chute', text: 'Heal 12 at midday. At evening a random potion. At night gain a relic and lose 10 HP.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.heal(run, 12); return 'Warm and clean. Heal 12 HP.'; } if (p === 'evening') { R.addPotion(run, null); return 'You land on a potion. Fine, it was a bag.'; } R.hurt(run, 10); R.addRelic(run, null); return 'Dark, steep, and at the bottom a relic. -10 HP.'; } },
      leave('You close the hatch. It reopens at once.'),
    ],
  },
  {
    id: 'e_w_moonlit_surgeon', name: 'The Moonlit Surgeon', act: 3, ward: true, phase: 'night',
    text: 'She works by lamplight and only after dark. By day she is in the book as a rumour. She offers a graft the way other people offer tea.',
    choices: [
      { label: 'Take the offer', text: 'Midday: heal 10. Evening: lose 4 HP, a graft pick. Night: lose 8 HP, two graft picks.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.heal(run, 10); return 'Daylight rounds: bandages only. Heal 10 HP.'; } if (p === 'evening') { R.hurt(run, 4); R.queueGraftPick(run); return 'A quick job. -4 HP, then a graft.'; } R.hurt(run, 8); R.queueGraftPick(run); R.queueGraftPick(run); return 'A long job, at the proper hour. -8 HP, two grafts.'; } },
      { label: 'Ask for the fee', text: 'Gain 30 gold at midday and evening, 55 gold at night.',
        apply: (run, R) => { const g = phaseOf(run) === 'night' ? 55 : 30; R.gold(run, g); return `She pays you to stay quiet. +${g} gold.`; } },
      leave('She goes on working in the dark of the room, politely.'),
    ],
  },
  {
    id: 'e_w_shift_change', name: 'Shift Change', act: 0, ward: true, phase: ['midday', 'night'],
    text: 'Two crews pass in the corridor, one leaving, one arriving, each convinced the other has left the mess. A whistle blows. A form is handed to you for signing.',
    choices: [
      { label: 'Sign for the day crew', text: 'Midday: 25 gold and heal 4. Evening: 12 gold. Night: nothing, but you are not charged.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.gold(run, 25); R.heal(run, 4); return 'Paid per signature. +25 gold, heal 4.'; } if (p === 'evening') { R.gold(run, 12); return 'Half pay for half a shift. +12 gold.'; } return 'The night crew does not recognise your handwriting.'; } },
      { label: 'Sign for the night crew', text: 'Midday: nothing. Evening: 12 gold. Night: 40 gold and a potion.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'night') { R.gold(run, 40); R.addPotion(run, null); return 'They pay in cash and bottles. +40 gold.'; } if (p === 'evening') { R.gold(run, 12); return '+12 gold, signed in pencil.'; } return 'Nobody on the night crew is awake to pay you.'; } },
      leave('You hand the form back unsigned. It is handed to you again.'),
    ],
  },
  {
    id: 'e_w_wakeful_patient', name: 'The Wakeful Patient', act: 1, ward: true, phase: 'night',
    text: 'Bed nine is awake and has been for some time. At noon they chat. At dusk they ask for water. After midnight they ask for something else, and the monitor next to them does not beep.',
    choices: [
      { label: 'Sit with them', text: 'Midday: heal 6. Evening: heal 9 and 8 gold. Night: lose 6 HP, gain 1 max HP and a potion.',
        apply: (run, R) => { const p = phaseOf(run); if (p === 'midday') { R.heal(run, 6); return 'A pleasant chat. Heal 6 HP.'; } if (p === 'evening') { R.heal(run, 9); R.gold(run, 8); return 'They press a few coins on you. Heal 9, +8 gold.'; } R.hurt(run, 6); R.maxHp(run, 1); R.addPotion(run, null); return 'You stay until dawn. -6 HP, +1 max HP, a potion.'; } },
      { label: 'Bring the water', text: 'Gain 10 gold at any hour.', apply: (run, R) => { R.gold(run, 10); return 'They are very grateful. +10 gold.'; } },
      leave('Their eyes follow you to the door and a little way past it.'),
    ],
  },
];

// Phase hints for events written before the Ward: weight x3 in the named phases, x0.5 elsewhere (engine/ward.js eventWeight).
// Midday leans to gold and healing, evening to small comforts and trades, night to chance and risk.
export const EVENT_PHASE = {
  e_gift_basket: 'midday', e_budget_loan: 'midday', e_vending_machine: 'midday', e_budget_pharmacy: 'midday', e_haggler: 'midday', e_free_polish: 'midday',
  e_orderly_challenge: 'evening', e_stray_patient: 'evening', e_cloakroom: 'evening', e_standing_ovation: 'evening', e_costume_rack: 'evening',
  e_morgue_drawer: 'night', e_coin_flip: 'night', e_gurney_race: 'night', e_night_shift: 'night', e_jarred_twin: 'night', e_lamp_lottery: 'night',
};
for (const e of EVENT_LIST) if (EVENT_PHASE[e.id] && !e.phase) e.phase = EVENT_PHASE[e.id];
