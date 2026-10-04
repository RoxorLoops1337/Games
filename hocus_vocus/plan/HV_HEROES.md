# HOCUS VOCUS: heroes and cards (agent B)

Status: HEROES rev 1. Every world word is copied from `HV_BIBLE.md` (the bible wins any disagreement). This file owns: the four hero
kits in Hocus Vocus words, their barks (the `barks_<id>` lore entries), and the name, concept and flavour of all 160 cards (148 hero
cards plus the 12 shared curse and status cards). Ids, numbers, costs, rarities, ops, keywords, slots and `art.m` motif ids never
change (bible H1, H2): only `name` and `flavor` strings, the hero DATA fields the bible lists in 4.8, and the barks change.

How to read it: section 1 is the four kits (title, blurb, passives, resource, rows, starter deck, archetypes, skin, barks), section 2
is the full card table (every id, one row each), section 3 is the status and keyword sheet plus the card text sanity note, section 4
lists glossary additions and the notes other plans and the tests need.

Conventions in this file:
- `exact strings` are in backticks and go into DATA verbatim (printable ASCII, no em or en dash, British spelling).
- "Lead:" and "Backing:" in the "what it does" column are the generated row prefixes (bible 4.9). Numbers are base values; "up:" notes
  only where the upgrade changes the shape of the card.
- `art.m` is the card's existing motif id (stays); "(pose)" marks `art.hero: true` cards whose illustration shows the hero.
- Flavour column: an exact string, or "none" (no `flavor` field). Every rare has one; well over a third of the others do.

---------------------------------------------------------------------------------------------------------------------------------

## 1. The four heroes

Fields that change in `DATA.heroes` (bible 4.8): `name`, `title`, `blurb`, the passive `name`, `color`, `accent`, `dark`. Fields that
stay: `id`, `prefer`, `res`, `maxHp`, `rows`, the passive `id`, `on`, `filter`, `limit`, `fx`, `starter`, `unlock`.

The row lines below are what `DATA.rowText(id, row)` prints once the generator says `Lead:` and `Backing:` (bible 4.9) and uses the
new status names; the passive lines are what `DATA.hookText(passive)` prints with the new resource names. Nothing in them is typed by
hand.

### 1.1 JASMIN (`hanae`): The Blossom Voice (lead, the attack hero)

| Field | Value |
|---|---|
| name | `Jasmin` |
| title | `The Blossom Voice` |
| blurb | `A soft, smooth singer whose vocal runs land like falling petals. She never shouts, and every note she sings blooms a little brighter.` |
| colours | color `#ff7eb6`, accent `#fff4f8`, dark `#b0245c` (already her pink) |
| best spot, HP | Lead (`prefer: 'front'`), 84 HP |
| row lines | `Lead: +2 damage on attacks` / `Backing: +1 Block on cards` |
| passive `blade_flow` | **Every Note Blooms**: `Once per turn, whenever you play an Attack, gain 1 Bloom.` |
| resource (status `bloom`) | **Bloom**: `Jasmin's blossoms. Built by her sung attacks, spent by her finishers.` |
| starter deck (5) | 2 x **Petal Note** (`hanae_slash`), 2 x **Soft Shield** (`hanae_parry`), 1 x **Take the Lead** (`hanae_petal_step`) |
| unlock | none (in from the first tour) |
| bio heading | `Her voice` |
| skin | **Unicorn Onesie** (see below) |

How she plays. Jasmin is the band's main damage and stands in the lead, where every hit of hers gets +2. She is not loud: her power is
many small, precise sung notes (runs, trills, arpeggios) and the petals they leave hanging in the air. Each Attack she plays opens a
blossom (Every Note Blooms, once a turn) and many of her cards add more; her finishers then spend every petal at once. Between the two she
answers hits back: soft harmonies give her Block that she turns straight into damage, and a little sway (Shimmy) makes enemies miss.
Her flavour is warm and a little dreamy; she apologises after the big hits.

Her three archetypes (CONTENT_SPEC 3: Bloom burst, Flurry, Riposte), in Hocus Vocus words:

| Archetype (doc name, not player text) | What it does | Build-up cards | Pay-off cards |
|---|---|---|---|
| **Blossom** (Bloom burst) | bank Bloom over several turns, spend it in one finisher | Every Note Blooms, Little Trill, Sweet Thirds, Centre Stage, Oohs and Aahs, La La La, Petal Curtain, Run It Again, Bud by Bud, Bend the Note, Stage Waltz, Take the Lead | Blossom Pop, The High Note, Blossom Blizzard, Blossom Blanket, Blossom Breath, Cherry Lane |
| **Runs** (Flurry: multi-hit plus Volume) | many small hits, each made bigger by Volume, Tag and the lead bonus | Lean In, Find Your Voice, Slow Swell, Calling of the Moon, Corsage, Run It Again | Sweet Thirds, Climbing Scale, Arabic Impro, Petal Twirl, Melisma, Shimmer Trail, Out of Nowhere |
| **Answer Back** (Riposte: Block into damage, Shimmy) | take the hit softly, then sing it back | Soft Shield, Gentle Sway, Sing Along, Petal Curtain, Bend the Note | Sing It Back, Slippery Riff, Answer Phrase, Mirror Ball, Curtsy and Go |

Ally cards (she touches her partner): Petal Curtain, Sing Along, Curtsy and Go, Blossom Blanket, Shimmer Trail, Calling of the Moon,
Stage Waltz.

Owner nods on her cards (bible 2.9, binding): `hanae_whirling_petals` is **Arabic Impro**, `hanae_blade_duet` is **Calling of the
Moon**.

Skin, the **Unicorn Onesie**: a pastel pink and white unicorn onesie with a gold horn, a rainbow mane down the hood and the pink
scrunchie on the ponytail poking out of the top (bible 7.1). Unlocked by the sticker `petal_and_steel` (**In Full Bloom**: win 3 tours
with Jasmin). Her heart necklace stays visible at the collar and the hoop earring stays; the mic gets a tiny gold star sparkle. Petals
still fall from every note. In the attack poses the mane swings like the ponytail does.

### 1.2 ROXORLOOPS (`kuro`): The Beatbox Wizard (backing, the support hero who is also a monster soloist)

| Field | Value |
|---|---|
| name | `RoxorLoops` |
| title | `The Beatbox Wizard` |
| blurb | `A beatboxer who plays a whole band with one mouth. He keeps the groove from the back, and his beats get stuck in every enemy's head.` |
| colours | color `#3fcf6a`, accent `#c6ff3d` (his lime shoes), dark `#0f3a1e` |
| best spot, HP | Backing (`prefer: 'back'`), 68 HP |
| row lines | `Lead: no bonus` / `Backing: +2 damage on attacks` |
| passive `steady_hand` | **In the Pocket**: `Once per turn, whenever you play a Skill, gain 1 Groove.` |
| resource (status `sumi`) | **Groove**: `RoxorLoops's groove. Built layer by layer with his skills, dropped in his big beats.` |
| starter deck (5) | 2 x **Kick Drum** (`kuro_ink_bolt`), 2 x **Hi-Hat Guard** (`kuro_ink_ward`), 1 x **Drop the Beat** (`kuro_first_stroke`) |
| unlock | none (in from the first tour) |
| bio heading | `His voice` |
| skin | **Monster Onesie** (see below) |

How he plays. From the backing spot RoxorLoops hits for +2 and builds the groove: every Skill adds a layer (In the Pocket, once a turn)
and his drops spend it in one big beat or a wave across every enemy. His beats get stuck in enemies' heads (**Earworm**) and heat the
room up (**Sizzle**). His beatbox scratching, flipping and crate digging are the deck tricks (draw, discard, Hold, Fade, copy, Breath).
And he is the support hero: he covers his partner with Block and Shimmy. Throat bass, kicks, hi-hats, snares, rimshots, sirens and
vocal scratches are his card names; the little loop station at his feet appears on one rare (**Loop Station**) and is "just for
emergencies" (bible H18: he is never "a looper").

His three archetypes (CONTENT_SPEC 3: Dirge, Breath spells, Arranger):

| Archetype | What it does | Cards |
|---|---|---|
| **Earworms and Heat** (Dirge: Earworm and Sizzle engines) | stack Earworm (it ignores Block) and Sizzle, then cash them in | Click Clack, Catchy Hook, Nod Along, Word of Mouth, Double Time, On Repeat, Chart Topper, Spicy Snare, Heatwave, Slow Jam, Monster Solo, Crowd Goes Wild, Wee Woo, Scratch Combo |
| **The Drop** (Groove spells: spend Groove, big hits and waves) | layer Groove, then drop it all | builders: Count It In, Heartbeat, Layer Upon Layer, Sample Chop, Back and Forth, Pass the Mic, In the Pocket; drops: Drop the Beat, Throat Bass, Snare Roll, Wait For It, Got Your Back, Imperfect Harmony |
| **The Arranger** (draw, Hold, Breath, pick, Fade tricks) | dig for the right card and keep the set flowing | Rimshot, Build-Up, Crate Digging, Flip It, Second Wind, Pass the Mic, Sample Chop, Loop Station, Back and Forth |

Ally cards: Shoulder to Shoulder, Dance Break, Got Your Back, Pass the Mic, Back and Forth, Imperfect Harmony.

No owner nod sits on his cards: the viral clip and "Human" keep only their bible 2.9 placements, so `kuro_creeping_ink` **Word of
Mouth** and `kuro_inkwash_sanctum` **Imperfect Harmony** are ordinary cards.

Skin, the **Monster Onesie**: a green monster onesie with two cream horns and two round eyes on the hood, the black smiley on the belly,
lime shoes kept, the mohawk poking out of the hood (bible 7.1). Unlocked by the sticker `ink_and_insight` (**Party at the Back**: win 3
tours with RoxorLoops). The hood's horns are soft costume shapes (never horn as a material, H5). His cupped green mic and the sound
rings stay exactly where they are in every pose.

### 1.3 RAWCLAW (`suzu`): The Sound Alchemist (backing, unlocked by clearing Act I)

| Field | Value |
|---|---|
| name | `RawClaw` |
| title | `The Sound Alchemist` |
| blurb | `The duo's producer, a good friend and a beatboxer too. A little reverb, a little delay, a filter here and there, and the whole fight sounds better.` |
| colours | color `#a77bff`, accent `#e9ddff`, dark `#3b2470` |
| best spot, HP | Backing (`prefer: 'back'`), the lead for Feedback builds; 68 HP |
| row lines | `Lead: +1 Block on cards, Feedback 2` / `Backing: Warm Tea 2` |
| passive `moonlit_rite` | **Always Rolling**: `At the start of your turn, gain 1 Reverb.` |
| resource (status `ward`) | **Reverb**: `RawClaw's reverb. It builds every turn, and he spends it to wrap the band in sound.` |
| starter deck (5) | 2 x **Synth Zap** (`suzu_ofuda`), 2 x **Reverb Wall** (`suzu_barrier`), 1 x **Warm Pad** (`suzu_moon_prayer`) |
| unlock | sticker `ch1_clear` (**Mics Returned**); unlock card `RawClaw joins the tour!`; locked line `Clear the act to bring RawClaw on every future tour.` |
| bio heading | `His voice` |
| skin | **Goat Suit** (see below) |

How he plays. RawClaw is the calm one at the mixing desk. Reverb builds every turn on its own (Always Rolling) and he spends it to wrap
both heroes in sound (Block for both, heals) and, once a fight, to bring a lost voice back (**Voice Memo**). From the backing spot he
sips Warm Tea every turn; in the lead he stands as a wall that squeals back (Feedback) and pulls every attack to himself (Spotlight).
His effects rack is the control kit: filters, tape stops and dry signals that leave enemies Muffled, Wobbly, Exposed, Starstruck or
Tagged. Reverb, delay, filters, synths, drum pads and the studio are his card names; no shrine, talisman, miko or moon word remains
(the moon belongs to Calling of the Moon), and the word "echo" never appears: it is always reverb, delay or ring.

His three archetypes (CONTENT_SPEC 3: Sanctuary, Thorns and Taunt, Talismans):

| Archetype | What it does | Cards |
|---|---|---|
| **The Room** (Sanctuary: Block, heal, Reverb spending, revive) | build the room, then wrap both heroes in it | Reverb Wall, Warm Pad, Chill Mix, Stadium Reverb, Noise Gate, Long Sustain, Preset, Save the Session, Tape Warmth, Comfort Noise, Ping Pong Delay, Crossfade, Acoustic Foam, Voice Memo |
| **Squeal Back** (Feedback and Spotlight retaliation) | stand in the lead, draw every hit, squeal back | Solo Button, Stage Monitors, Howlround, Distortion, Double Tracking, Wall of Sound, Bounce Back, Crossfade |
| **Effects Rack** (control: Muffled, Exposed, Wobbly, Starstruck, Tag) | dull the enemy's bite, then cash in every effect on it | Synth Zap, Low Pass, Dry Signal, Tape Stop, Phaser, Filter Sweep, Finger Drumming, Slapback, Mixing Desk, Sidechain Pump, Final Mixdown, Arpeggiator |

Ally cards: Reverb Wall, Warm Pad, Chill Mix, Stadium Reverb, Push the Fader, Undo, Tape Warmth, Comfort Noise, Ping Pong Delay,
Slapback, Bounce Back, Voice Memo, Acoustic Foam.

Skin, the **Goat Suit**: a cosy cream goat costume with small curled horns, floppy ears and a beard tassel; headphones over the ears;
his pad sampler still on its strap (bible 7.1). Unlocked by the sticker `moonlit_vigil` (**Not a Costume**: win 3 tours with RawClaw).
The running gag: he insists it is not a costume (his signature bark). The pad sampler strap and the violet waveform sparks stay.

### 1.4 ANDY (`raiga`): The Thunder Bass (lead, unlocked by clearing Act II)

| Field | Value |
|---|---|
| name | `Andy` (first name only, always) |
| title | `The Thunder Bass` |
| blurb | `A bass player who sometimes joins the duo, and whose low end you feel before you hear it. Every hit he takes comes back as a bass line, louder.` |
| colours | color `#ff9a2e`, accent `#ffe45e`, dark `#5a2a0a` (already his orange) |
| best spot, HP | Lead (`prefer: 'front'`), 88 HP |
| row lines | `Lead: start each turn with 3 Block, Feedback 2` / `Backing: +1 damage on attacks` |
| passive `storm_born` | **Bass Face**: `Up to 2 times per turn, whenever you are hit, gain 1 Rumble.` |
| resource (status `charge`) | **Rumble**: `Andy's low end. Built by taking hits and striking, released as thunder from below.` |
| starter deck (5) | 2 x **Slap Bass** (`raiga_jab`), 2 x **Amp Stack** (`raiga_brace`), 1 x **Thunder Thumb** (`raiga_static_fist`) |
| unlock | sticker `ch2_clear` (**Heads Up**); unlock card `Andy joins the tour!`; locked line `Clear the act to bring Andy on every future tour.` |
| bio heading | `His voice` |
| skin | none yet (bible 7.1: a future owner request) |

How he plays. Andy stands in the lead and soaks the hits: he starts every turn behind 3 Block with Feedback 2, and every hit he takes
builds Rumble in the floorboards (Bass Face, twice a turn). When the Rumble peaks the whole room shakes: low-end thunder across every
enemy, or one enormous note. His amps squeal back (Feedback), his biggest notes leave enemies Starstruck, and his fuzz pedal makes
them Sizzle. His loop pedal explains the cards that repeat (**Loop Pedal**, **Play It Back**). Thunder stays as a word for his bass;
storms, monks, temples, taiko, gongs and Raijin are gone.

His three archetypes (CONTENT_SPEC 3: Storm, Retaliation, Brawler):

| Archetype | What it does | Cards |
|---|---|---|
| **Low-End Thunder** (Storm: multi-hit and AoE from Rumble) | build Rumble, release it under every enemy | Thunder Thumb, String Pop, Crank It, Lock In, Calm Centre, Shuffle Step, Over Here, Walking Bass, Rolling Low End, Floor Shaker, Thunder From Below, The Lowest Note, Triplet Feel |
| **Hit Me Harder** (Retaliation: Feedback, damage when hit) | take the hit, give it back louder | Fret Buzz, Twin Amps, Speaker Quake, Got Your Number, Play It Back, Octave Down, Bass Trap, Big Shoulders, Bedrock, Dig Deep, Unbothered |
| **Bass Brawler** (Brawler: Starstruck, Sizzle, big single hits) | dazzle, then land the big one | Jaw Dropper, Bass Trap, Bass Drop, Drop D, Fuzz Pedal, Overdrive, Palm Mute, Sweat and Thunder, Loop Pedal |

Ally cards: Hold That Note, Bass Boost, Big Shoulders, Twin Amps, Over Here, Unbothered.

Skin: none yet. If the owners ask for one later it follows the same pattern (one optional costume layer, unlocked by `thunder_and_laughter`,
**Just Andy**), but nothing is drawn or wired for him now.

### 1.5 Skins: how they are unlocked and shown (bible 7.1, plus two decisions)

- Unlock is derived from sticker completion at draw time (`petal_and_steel`, `ink_and_insight`, `moonlit_vigil`); nothing new is
  stored in the profile or the run. The chosen outfit lives in `hv_skins_v1` (try/catch, per viewer, never read by RUN, COMBAT, the
  bot or the daily seed).
- Hero select: an `Outfit` row with two swatches, `Stage clothes` and the skin name; a locked swatch shows a padlock and
  `Win 3 tours with Jasmin to unlock.` (the name is read from DATA). The end screen adds `New outfit: Unicorn Onesie` (or the other
  two) when the sticker that unlocks it is earned.
- Drawn everywhere the hero is drawn: hero select, all eight combat poses, the map party token, medallions, story portraits, the end
  screens and the share card. Same anchors and hit boxes; a failed costume draw falls back to stage clothes.
- Decision (new): **card illustrations stay in stage clothes.** The `art.hero: true` cards are "the official card art" (Jordan's
  designs, in-world) and a deck shown on the end screen or the Tour Bus must look the same to everyone; it also keeps the card art cache
  keyed by card id only.
- Decision (new): the skin never changes a name, a bark or a sound. Barks are the same in a onesie (that is the joke).

### 1.6 Barks (`barks_hanae`, `barks_kuro`, `barks_suzu`, `barks_raiga`)

The engine reads exactly 5 lines for each of the six keys `start hurt kill down win swap` (`DATA.FIXED.barkKeys`; the narrative suite
asserts 5 per key, 120 in all, all different). Each key below lists **12** lines: **lines 1 to 5 are the DATA lines, in this order**;
lines 6 to 12 are vetted spares for reviewers to swap in one for one. Every line is 4 to 64 characters, ends with `.`, `!`, `?` or
`...`, names no other hero, and is unique across all 288 lines.

Who speaks (data_meta.js header): `start` the hero at the fight's start, `hurt` the hero who took a big hit, `kill` the hero who struck
the last blow (lines celebrate winning a foe over or quieting it, never an ending), `down` the hero who just lost their voice (it comes
back), `win` the survivor at the end, `swap` the hero stepping up to the lead spot.

Voice targets (bible 3.1 to 3.4), met by the DATA lines: Jasmin uses no `!` at all (the bible allows one) and says `I do not need to be
loud.` exactly once; RoxorLoops uses `!` on 9 of 30 (a third at most) and says `Party on top. Party at the back.` exactly once;
RawClaw never uses `!` and says `It is not a costume.` exactly once; Andy uses `!` on 2 of 30 (a quarter at most) and says
`Just Andy.` exactly once. The shortest lines: Jasmin `Ta-da.` (6), Andy `Womp.` (5).

#### 1.6.1 `barks_hanae` (Jasmin: soft, short, kind, musical feeling words, sweet apologies)

**start** (1 to 5 DATA, 6 to 12 spares)
1. `I do not need to be loud.`
2. `Okay. Soft and sweet, like we practised.`
3. `Let us make something pretty.`
4. `Mic on. Heart on. Here we go.`
5. `Deep breath in. And... la.`
6. `One little run to start, I think.`
7. `Everyone lean in. This part is quiet.`
8. `I brought petals. I always bring petals.`
9. `Hello, lovely. Let us sing this one together.`
10. `A soft start is still a start.`
11. `Shall we? I will go gently.`
12. `Ready when you are. I am always ready.`

**hurt**
1. `Ow. That was a little flat.`
2. `Oh. That hit a sour note.`
3. `I am fine. My scrunchie is fine too.`
4. `Ouch. Rude, but I forgive you.`
5. `That wobbled me. Only a bit.`
6. `Oof. Okay. Back on pitch.`
7. `That stung. I will sing it better.`
8. `Ow. You could have just asked nicely.`
9. `A little crack in my voice. I like it.`
10. `Still standing. Still singing.`
11. `That was sharp. Not in the good way.`
12. `Owie. I mean, ow. Professionally.`

**kill**
1. `Ta-da.`
2. `Sorry. That was a big one.`
3. `There. Now we can all hear the song.`
4. `You were lovely, really. Just a bit loud.`
5. `Petals for you. Go on, take one.`
6. `Oh, you are singing along now. Sweet.`
7. `A soft goodbye, and a softer bow.`
8. `Sorry, sorry. Was that too much?`
9. `All calm now. That is better.`
10. `And that one bloomed.`
11. `Thank you for listening.`
12. `You can sing with us next time.`

**down**
1. `Oh. My voice went. Give me a second.`
2. `Just... a little... croaky.`
3. `I will be back by the chorus.`
4. `Lost my voice. Have you seen it?`
5. `Hold my note for me, please.`
6. `Need some tea. And a sit down.`
7. `Not my best take.`
8. `Whisper mode. Sorry.`
9. `It cracked. It will come back.`
10. `Keep going. I am humming along inside.`
11. `Tell the petals I will be right back.`
12. `Little break. Do not wait up.`

**win**
1. `That was lovely. Everyone did so well.`
2. `See? Soft works.`
3. `And the room is singing again.`
4. `Noodles after this? I think noodles.`
5. `Pretty. Really, really pretty.`
6. `We did it, and nobody had to belt.`
7. `Group hug? Group hug.`
8. `Thank you, thank you. Soft bow.`
9. `That was warm all the way through.`
10. `All the petals landed. Every one.`
11. `One more song for the road?`
12. `I could cry. In a good way.`

**swap**
1. `My turn at the front mic.`
2. `Excuse me. I have a little solo.`
3. `Into the light. Gently.`
4. `Lead vocal, coming through.`
5. `Front and centre, ponytail first.`
6. `I will take this part.`
7. `Hello, spotlight. We meet again.`
8. `Let me sing this bit.`
9. `Step back, I have got this one.`
10. `Soft voice, big stage.`
11. `Here I come, petals and all.`
12. `Up to the mic. Do not worry.`

#### 1.6.2 `barks_kuro` (RoxorLoops: quick, punchy, beatbox syllables, says "we", teases kindly)

**start**
1. `Boots and cats and boots and cats. Okay, we are warm.`
2. `Party on top. Party at the back.`
3. `Ts ts ts. Ready when you are!`
4. `Pff, ka, pff, ka. We got this.`
5. `Mic check. One, two. Bmm, bmm.`
6. `Let us make some noise. Nice noise!`
7. `Okay team, groove first, panic later.`
8. `Count us in. One, two, ts ts ts ts.`
9. `Who ordered a beat? I brought a beat!`
10. `Bmm tss. That is hello in beatbox.`
11. `Lips: buzzing. Hair: ready. Let us go!`
12. `Fresh beat, made just for you. You are welcome.`

**hurt**
1. `Pff! Okay, that was a rude snare.`
2. `Ow. Off beat, mate. Way off beat.`
3. `Ouch. I will beatbox that sound later.`
4. `Ka-ow. That is the sound it made.`
5. `Rude! I was mid-groove.`
6. `Ow. Hey, we were vibing here.`
7. `That hit came in late. Like me, but worse.`
8. `Oof. Hair still good? Hair still good.`
9. `Bmm... ow. Lost the bass for a second.`
10. `Ow. I am adding that to the beat.`
11. `Ts. Ts. Ow. Ts.`
12. `Okay, that one had some bass in it.`

**kill**
1. `And... drop. Thank you, goodnight.`
2. `Ts! Out of the mix.`
3. `You were a good beat. Just not ours.`
4. `Pff, ka, bye bye!`
5. `Nice. Now you are nodding along.`
6. `Boom. Bap. Bow out.`
7. `That is called a fade out.`
8. `Remixed you. You sound better now.`
9. `Wikka wikka. Scratched off the list!`
10. `Gotcha. That one goes on the album.`
11. `Ka-ching. That was the outro.`
12. `See? Everybody loves a breakdown.`

**down**
1. `Pff... lost the beat. Back in a bar.`
2. `Lips... out of buzz. One sec.`
3. `No voice. Only... ts.`
4. `Keep the groove going for me!`
5. `Down, but my foot is still tapping.`
6. `Little nap. Short loop.`
7. `Mute me for a moment. I will be back.`
8. `Throat bass has left the building.`
9. `Hold the kick. I will come in late.`
10. `Bmm... bm... b.`
11. `No sound coming out. Hate it. Back soon.`
12. `Tell the crowd it is a dramatic pause.`

**win**
1. `And that is a wrap! Bmm tss.`
2. `We are so good. We are SO good.`
3. `Group bounce! Everybody bounce!`
4. `Boots and cats and victory hats.`
5. `That one is going in the show.`
6. `Nailed it. Mostly on time.`
7. `Ts ts ts. That was the sound of winning.`
8. `High five! Low five! Bass five!`
9. `Somebody get the snacks. We earned them.`
10. `Groove: kept. Hair: excellent. Win: yes.`
11. `Pff! Easy. Okay, not easy. Fun, though.`
12. `That fight was a whole album.`

**swap**
1. `Solo time! Kidding. Mostly.`
2. `Front mic? Do not mind if I do.`
3. `Beatbox to the front, please.`
4. `My turn. Pff, ka, let us go.`
5. `Up front with the big kick.`
6. `Hair first, beat second. Here I come.`
7. `Okay, I will lead. You do the oohs.`
8. `Coming through with a bass line.`
9. `Swap! Ts ts, hello, everyone.`
10. `Right, the beat is in front now.`
11. `I got the lead. Do not tell the hi-hat.`
12. `Stepping up. Mic cupped. Ready.`

#### 1.6.3 `barks_suzu` (RawClaw: calm, never raises his voice, studio jargon as comfort, the goat)

**start**
1. `Let me just tidy the low end. Not the Gloss way. The nice way.`
2. `Levels look good. Shall we?`
3. `Headphones on. I have got you both.`
4. `A little more reverb? A little more reverb.`
5. `Recording. Just in case this is good.`
6. `Everyone breathe. I will handle the mix.`
7. `Calm, everyone. Nothing we cannot fix later.`
8. `Room sounds nice. Let us fill it.`
9. `Okay. Gentle on the faders.`
10. `I set up a warm pad. Make yourselves at home.`
11. `Saved the session. Now we can be brave.`
12. `Soft start. We can always turn it up later.`

**hurt**
1. `That clipped a bit. I am fine.`
2. `Ow. Bit of distortion there.`
3. `Noted. I will fix that in the mix.`
4. `It is only a little noise. Keep going.`
5. `Hm. That one peaked.`
6. `I am all right. The goat took most of it.`
7. `Steady. Still recording.`
8. `Just a scratch on the record.`
9. `Rude. But I have heard worse demos.`
10. `Ow. Somebody turned the wrong knob.`
11. `I heard that in my headphones.`
12. `Fine. Truly. Levels are holding.`

**kill**
1. `There. Much better without the noise.`
2. `Faded out nicely. Go and rest.`
3. `You sound nicer dry. Take care.`
4. `That was a clean fade. The kind kind.`
5. `Rest now. You worked very hard at being loud.`
6. `Bounced and saved. Off you go.`
7. `Gently. There. Sing along when you are ready.`
8. `Low-passed, and much calmer.`
9. `I will keep a copy of your good bit.`
10. `All quiet on that channel. Thank you.`
11. `No harm done. Just a gentle fade.`
12. `There. Quieter, and happier for it.`

**down**
1. `Signal lost. Back in a moment.`
2. `Need a minute. Keep it rolling.`
3. `It is all right. Just a little dropout.`
4. `Hold the session for me.`
5. `I will rest my ears for a bit.`
6. `No voice. Still listening, though.`
7. `Rebooting. Do not touch the faders.`
8. `Out of headroom. Briefly.`
9. `Keep recording. I want to hear this later.`
10. `Quiet on my channel. Only for now.`
11. `Do not worry. I saved everything.`
12. `A little lie down behind the desk.`

**win**
1. `That is a take. Thank you, everyone.`
2. `It is not a costume.`
3. `We sound better together. We always do.`
4. `Lovely. I would not change a thing.`
5. `Room sounds good again. Real, too.`
6. `Saving that one. Twice.`
7. `Nice and warm. That is how it should feel.`
8. `Let us all have some tea.`
9. `Thank you for the noise. The good noise.`
10. `Bounce it down. We are done here.`
11. `The levels are kind tonight.`
12. `Not polished. Just right.`

**swap**
1. `I will take the front. Keep the mix warm.`
2. `Let me be the wall for a bit.`
3. `Behind me. I have the levels.`
4. `Soloing my channel. Look over here.`
5. `Front of house now. Stay close.`
6. `My turn at the front. Gently does it.`
7. `I will take the hits. You take the harmony.`
8. `Swapping channels. All under control.`
9. `Let me put a little room around you.`
10. `Mind the cables. I am coming through.`
11. `I will keep watch from here.`
12. `Front speaker on. Steady now.`

#### 1.6.4 `barks_raiga` (Andy: relaxed, short, dry and warm, bass puns, rarely shouts)

**start**
1. `Just Andy.`
2. `Evening. Mind your cups.`
3. `Right. Low and slow.`
4. `Feel that? That is me.`
5. `Let us find the groove.`
6. `Bass is tuned. Shall we?`
7. `Nice crowd. Bit quiet. Let us fix that.`
8. `I will hold the bottom end. Relax.`
9. `Okay. Deep breath. Low end first.`
10. `The floor is about to hum. Fair warning.`
11. `Big room. Good. Room for bass.`
12. `Ready. Been ready since breakfast.`

**hurt**
1. `Hm. That one landed in the low end.`
2. `Ow. Good hit, that.`
3. `Fine. I will turn it into a bass line.`
4. `That just tuned me up a bit.`
5. `Ha. Tickles.`
6. `Oof. Right. Noted.`
7. `That one goes straight in the groove.`
8. `Mm. Bit rude. Still chill.`
9. `Hit me again. I need the rumble.`
10. `Ow! Okay, that one was real.`
11. `Bruised. Not bothered.`
12. `You just made my next note louder.`

**kill**
1. `Womp.`
2. `And down it goes. Low end wins.`
3. `Nice one. Stay for the next song.`
4. `Heard that one, did you?`
5. `Bass face. Sorry. Cannot help it.`
6. `Thump. Done.`
7. `Settle down now. Have a sit.`
8. `That is the bottom end talking.`
9. `Right in the subs. Lovely.`
10. `Back to the groove. No hard feelings.`
11. `Boom! There it is.`
12. `Good dance. See you around.`

**down**
1. `Hm. Lost the low end. Back soon.`
2. `Just going to lie on the floor. It hums.`
3. `Bass is resting. So am I.`
4. `Keep the groove. I will find it again.`
5. `Mm. Little nap.`
6. `Out of strings. Spare set in the van.`
7. `Do not worry. Floor is comfy.`
8. `Feet up. Back in a bar or two.`
9. `Turned down. Not turned off.`
10. `Need a sip of something warm.`
11. `My voice went south. Lower than usual.`
12. `No rumble left. Give me a minute.`

**win**
1. `Nice. Good groove, everyone.`
2. `Feel that? That is the floor saying thanks.`
3. `Lovely. Noodles?`
4. `Ha! Told you the bass would hold.`
5. `Calm as you like. Well played.`
6. `Right. Pack up the amps. Kidding. Next one.`
7. `That shook the whole street. In a good way.`
8. `Proper groove, that. Proper.`
9. `Everyone still upright? Good.`
10. `Low end: solid. Mood: excellent.`
11. `Steady wins it. Every time.`
12. `Nice and loud. Nice and warm.`

**swap**
1. `Up front. Stand behind the bass.`
2. `Front. Plenty of low end to go round.`
3. `Step back. Let the thunder do the talking.`
4. `Right. I will soak this bit up.`
5. `Up front! Amp is warm.`
6. `Send them my way. I like the rumble.`
7. `Stay behind the amp. It is warm back there.`
8. `My spot now. Easy does it.`
9. `Moving up. Floor is humming.`
10. `Hello, front. Missed you.`
11. `Lead bass, coming through.`
12. `You take a breather. I have got this.`

---------------------------------------------------------------------------------------------------------------------------------

## 2. THE FULL CARD TABLE (160 ids)

Naming rules (bible 7.4 plus the card suites): 1 to 3 words, 3 to 28 characters, capitalised, unique among all 160 cards (ignoring
case and punctuation), no hero prefix, no dash. Jasmin's, RawClaw's and Andy's names are letters, apostrophes and spaces only (their
suites test `/^[A-Z][A-Za-z' ]+$/`); RoxorLoops's suite also allows a hyphen (`Hi-Hat Guard`, `Build-Up`). No name reuses a reserved
name (H16: Spells, statuses, keywords, tiles, Headliners, passives, hero titles, Stickers, Encores, Untangle, Mic Squeal, Botling, The
Viral Clip). One bible-binding exception: `hanae_blade_duet` **Calling of the Moon** is the owners' song title and has 4 words (see
4.3 for the test change). Flavour lines: at most 80 characters, end with `.`, `!` or `?`, no dash, never name another hero, never quote
a real lyric.

### 2.1 Jasmin (`js/data_cards_hanae.js`, 37 cards: floral, vocal and arpeggio spells)

| id (stays) | Echowake name | type, rarity, cost | what it does | art.m | **new name** | concept (what it looks and sounds like) | flavour (exact) |
|---|---|---|---|---|---|---|---|
| `hanae_slash` | Petal Slash | attack, starter, 1 | 6 damage | slash (pose) | **Petal Note** | She sings one soft, clear "la" into her pink-banded mic; a single cherry petal spins off the note and lands with a gentle chime. | `She sang it softly. The whole street leaned in to listen.` |
| `hanae_parry` | Parry | skill, starter, 1 | 5 Block (up: 6 Block and 1 Bloom) | shield (pose) | **Soft Shield** | A sustained "ooh" hangs in front of her like a pink soap bubble; a hit bonks off it with a little "boop". | `She does not block a hit. She sings right over it.` |
| `hanae_petal_step` | Petal Step | skill, starter, 0 | move to the lead, 1 Bloom, 3 Block | petals | **Take the Lead** | She steps up to the front mic, ponytail swinging, petals swirling round her shoes; a rising two-note glockenspiel "ta-da". | `One step forward, and the spotlight finds her by itself.` |
| `hanae_petal_flick` | Petal Flick | attack, common, 0 | 2 damage, 1 Bloom | petals (pose) | **Little Trill** | A tiny fluttering trill; one petal pings off the end of it like a flicked sweet wrapper. | none |
| `hanae_twin_petals` | Twin Petals | attack, common, 1 | 2 damage twice; Lead: 1 Bloom | cross_slash (pose) | **Sweet Thirds** | Two notes sung a third apart, two petals spinning round each other as they fly. | none |
| `hanae_rising_gale` | Rising Gale | attack, common, 1 | 2 damage per card played earlier this turn | wind | **Climbing Scale** | She climbs a scale step by step; every card played before it is one more step up, and the top note lands hardest. | `It starts as a whisper. Ask the top note how it ends.` |
| `hanae_blossom_burst` | Blossom Burst | attack, common, 1 | spend up to 3 Bloom: 3 damage plus 3 per Bloom | bloom (pose) | **Blossom Pop** | A bright little "pop" and every petal hanging round her bursts into pink confetti on the target. | none |
| `hanae_riposte` | Riposte | attack, common, 1 | 3 Block, then damage equal to her Block | crescent (pose) | **Sing It Back** | She catches the enemy's sour note in a soft harmony and sings it straight back, prettier and pointier. | `They sang it wrong. She sang it back, right.` |
| `hanae_crescent_step` | Crescent Step | attack, common, 1 | move to the lead, 5 damage; Lead: 1 Bloom | crescent | **Centre Stage** | She glides to the front mic mid-phrase and lands the note the moment she arrives; a pink arc of petals follows her. | none |
| `hanae_whirling_petals` | Whirling Petals | attack, common, X | 4 damage to a random enemy, X times | tornado | **Arabic Impro** | Owner nod (bible 2.9). She improvises a winding, ornamented melody; petals spiral off in every direction and not even she knows where each one will land. | `Never the same twice. Not even this time.` |
| `hanae_folding_screen` | Folding Screen | skill, common, 1 | 5 Block; Backing: 2 Bloom | fan | **Oohs and Aahs** | From the backing spot she sings a warm wall of "oohs and aahs"; blossoms open quietly behind it. | `Every great song has someone at the back going ooh.` |
| `hanae_sway` | Sway | skill, common, 1 | 4 Block, 1 Shimmy | crane (pose) | **Gentle Sway** | She sways to the beat and the hit simply misses; her ponytail swishes, her scrunchie does not move. | `The scrunchie did not move. It never moves.` |
| `hanae_petal_veil` | Petal Veil | skill, common, 1 | both heroes 3 Block, 1 Bloom | barrier | **Petal Curtain** | A curtain of pink petals drifts down between the band and the enemy, wide enough for two. | `Wide enough for two, and it smells of spring.` |
| `hanae_sakura_sort` | Sakura Sort | skill, common, 0 | draw 1, discard 1, 1 Bloom | scroll | **La La La** | She tries a few "la la la"s, keeps the nicest one and lets the others float off as petals. | none |
| `hanae_flurry_stance` | Flurry Stance | skill, common, 0 | 2 Volume this turn | eye | **Lean In** | She leans in close to her pink-banded mic; every note this turn lands bigger, though she never gets any louder. | `She did not sing louder. She just leaned in.` |
| `hanae_petal_mark` | Petal Mark | skill, common, 1 | apply 3 Tag | sigil | **Corsage** | She tosses a cherry blossom that pins itself to the enemy like a corsage; every note after aims for it. | `Jordan already sells a pin of it. Of course he does.` |
| `hanae_borrowed_shield` | Borrowed Shield | skill, common, 1 | Block equal to 3 plus the ally's Block | shield | **Sing Along** | She slides onto her partner's part in harmony, and their shield becomes hers too. | `If you know the words, you are in the band.` |
| `hanae_cyclone_cut` | Cyclone Cut | attack, uncommon, 2 | 2 damage to all enemies, twice | tornado | **Petal Twirl** | She twirls on the spot singing an arpeggio up and down; a ring of petals sweeps every enemy, twice. | none |
| `hanae_hit_and_vanish` | Hit and Vanish | attack, uncommon, 2 | 6 damage, swap; now Backing: both heroes 3 Block | crescent (pose) | **Curtsy and Go** | One bright note, a tiny curtsy, and she glides to the backing spot while petals settle over both heroes. | `By the time they turn round, she is already curtsying.` |
| `hanae_flowing_counter` | Flowing Counter | attack, uncommon, 1 | 1 Shimmy, then 3 damage per Shimmy | wave | **Slippery Riff** | She slips out of the way mid-riff, and every slip comes back as a sharper little lick. | none |
| `hanae_iai_draw` | Iai Draw | attack, uncommon, 0 | Hold; 12 damage if it is the first card this turn, else 4; Fade | iai (pose) | **Out of Nowhere** | Before anything else happens she sings one clear, unexpected note, and the whole fight stops to listen. | `First note of the night, and the whole room forgets to breathe.` |
| `hanae_swallow_reversal` | Swallow Reversal | attack, uncommon, 1 | 2 plus the damage she took last enemy turn (max 15) | crane | **Answer Phrase** | Whatever they threw at her last turn she sings back as a sweet answering phrase, note for note. | none |
| `hanae_full_bloom` | Full Bloom | skill, uncommon, 1 | Hold; spend all Bloom: both heroes 2 Block per Bloom | bloom | **Blossom Blanket** | Every petal in the air drifts down into a soft pink blanket over both heroes, with a sleepy "ahh". | none |
| `hanae_bloom_tide` | Bloom Tide | skill, uncommon, 0 | draw 1; with 3 Bloom, trade 3 Bloom for 2 Breath; Fade | koi | **Blossom Breath** | She breathes in a cloud of her own blossoms and comes up with two whole breaths to spare. | `Cherry blossom, deep breath, and back to the chorus.` |
| `hanae_keen_edge` | Keen Edge | skill, uncommon, 1 | 1 Volume for the fight; Fade | thrust | **Find Your Voice** | One quiet moment, eyes closed; from now on every note she sings has a little more shine. | `Not louder. Clearer.` |
| `hanae_whetstone` | Whetstone | skill, uncommon, 1 | upgrade a card in hand, 2 Bloom; Fade | star | **Run It Again** | She sings the tricky bit once more, slowly, then just right; the card in her hand glows a little pinker. | none |
| `hanae_spring_vow` | Spring Vow | power, uncommon, 1 | Opener; 1 Bloom at the start of each turn | lotus | **Bud by Bud** | A little cherry tree buds behind her; at the start of every turn one more blossom opens with a soft "ting". | `One more blossom every morning. She has never missed one.` |
| `hanae_petal_trail` | Petal Trail | power, uncommon, 2 | up to 2 times a turn, either hero's Attack deals 2 to all enemies | petals | **Shimmer Trail** | Every attack either hero plays leaves a shimmering trail of petals that drifts across every enemy. | none |
| `hanae_bending_willow` | Bending Willow | power, uncommon, 2 | 4 Block; up to 2 times a turn, when hit: 2 damage back and 1 Bloom | thorns | **Bend the Note** | When a hit lands she bends the note like a willow branch, and it springs back with a petal and a sting. | `The note bends. It does not break.` |
| `hanae_thousand_petals` | Thousand Petals | attack, rare, 2 | Hold; spend all Bloom: 5 damage per Bloom | petal_storm (pose) | **The High Note** | She floats one soft, impossibly high note, and every petal she has been saving flies at once. | `Everyone braced for a belt. It came out as a whisper, and it hit harder.` |
| `hanae_sakura_blizzard` | Sakura Blizzard | attack, rare, X | spend all Bloom: 1 damage to all enemies X times, plus 1 per Bloom | petal_storm | **Blossom Blizzard** | A whole spring of petals whirls round the stage in a pink blizzard, hitting every enemy again and again. | `A whole spring in one breath. Bring an umbrella.` |
| `hanae_hundred_cuts` | Hundred Cuts | attack, rare, 3 | 1 damage, 9 times | sword_rain (pose) | **Melisma** | One syllable, nine notes, every one of them landing; a petal flicks off each little bend in the line. | `She swears it was only one syllable.` |
| `hanae_mirror_edge` | Mirror Edge | attack, rare, 1 | damage equal to her Block (max 20) to all enemies; lose all Block | mirror | **Mirror Ball** | Her shield of soft harmony turns into a spinning mirror ball and throws its sparkles at every enemy at once. | `Every blow you throw comes back wearing glitter.` |
| `hanae_blade_duet` | Blade Duet | skill, rare, 1 | both heroes 2 Volume this turn, draw 1 | torii | **Calling of the Moon** | Owner nod (bible 2.9). Under a huge moon she sings one long, soft call, her partner answers, and both voices swell together. | `She calls. The moon answers. So does everyone on the rooftop.` |
| `hanae_blossom_field` | Blossom Field | power, rare, 2 | 5 Block; end of turn: damage equal to her Bloom (up to 6) to all enemies | bloom | **Cherry Lane** | Cherry trees bloom along the edge of the stage; at the end of every turn they shake their petals over every enemy. | `Stand still long enough, and the whole street starts to bloom.` |
| `hanae_blade_dance` | Blade Dance | power, rare, 2 | 1 Crescendo (up: and 1 Volume) | fan | **Slow Swell** | One long note that keeps swelling, a little more every turn, the petals round her drifting thicker. | `Every bar, a little more. She never once raised her voice.` |
| `hanae_waltz_of_steps` | Waltz of Steps | power, rare, 2 | once a turn, when either hero swaps: 1 Bloom and 4 Block | wind | **Stage Waltz** | Every time the duo trade places they twirl like a waltz, and she gains a blossom and a soft shield. | `One, two, three, swap. One, two, three, swap. Nobody trips.` |

### 2.2 RoxorLoops (`js/data_cards_kuro.js`, 37 cards: beatbox sounds and arranger moves)

| id (stays) | Echowake name | type, rarity, cost | what it does | art.m | **new name** | concept (what it looks and sounds like) | flavour (exact) |
|---|---|---|---|---|---|---|---|
| `kuro_ink_bolt` | Sharp Note | attack, starter, 1 | 6 damage | ink_splash (pose) | **Kick Drum** | A punchy beatboxed kick, "BMM", and a fat green sound ring thumps out of his cupped mic. | `Boots. The cats come later.` |
| `kuro_ink_ward` | Flute Guard | skill, starter, 1 | 5 Block | barrier | **Hi-Hat Guard** | A fast "ts ts ts ts" hi-hat pattern spins round him like a shimmering cymbal shield. | none |
| `kuro_first_stroke` | Overture | attack, starter, 1 | spend up to 2 Groove: 4 damage plus 3 per Groove | brush_stroke (pose) | **Drop the Beat** | He builds a little groove, raises one finger, holds it... and drops it: kick and bass land together. | `Every great set starts with one smug little drop.` |
| `kuro_ink_flick` | Grace Note | attack, common, 0 | 3 damage; Lead: draw 1 | quill | **Rimshot** | A crisp tongue-click rimshot, "tk", with a tiny green spark; in the lead it lands like the end of a joke. | `Ba dum tss. He will be here all week.` |
| `kuro_cinder_note` | Cinder Note | attack, common, 1 | 4 damage, 3 Sizzle; Lead: 2 more Sizzle | flame_orb | **Spicy Snare** | A sizzling "pff kssh" snare that leaves the target glowing warm, with little chilli-red sparks. | none |
| `kuro_viper_nib` | Viper Trill | attack, common, 1 | 2 damage twice, 2 Earworm | thorns (pose) | **Click Clack** | Two quick tongue clicks, "click, clack", and the rhythm burrows into the enemy's ear. | `Two clicks. Now it is in your head for the rest of the day.` |
| `kuro_ink_flood` | Sound Swell | attack, common, 2 | spend up to 3 Groove: 4 damage to all enemies plus 2 per Groove | ink_wave (pose) | **Throat Bass** | A deep, buzzing throat bass, "bmmmm", rolls across every enemy, bigger with every layer of groove. | `Nobody knows where he keeps the subwoofer.` |
| `kuro_running_script` | Running Scale | attack, common, 1 | 2 damage plus 3 per Skill played earlier this turn (up to 3) | crane | **Build-Up** | He stacks layer on layer (kick, hat, snare) and then fires the whole stack at once. | none |
| `kuro_blinding_blot` | Shrill Whistle | attack, common, 1 | 1 Muffled, 1 Exposed, 3 damage | eye | **Wee Woo** | A wobbly beatboxed siren, "wee woo wee woo", and the enemy forgets which way it was facing. | none |
| `kuro_venom_script` | Venom Lullaby | skill, common, 1 | 4 Earworm | skull | **Catchy Hook** | He whispers a tiny four-bar hook at the enemy; it climbs into its ear and refuses to leave. | `It is only four bars long. It will last all week.` |
| `kuro_miasma_verse` | Miasma Chant | skill, common, 1 | 2 Earworm to all enemies | wind | **Nod Along** | A bouncy beat drifts through the room and every enemy starts nodding along without meaning to. | none |
| `kuro_grind_ink` | Deep Breath | skill, common, 1 | 3 Block, 2 Groove | calligraphy | **Count It In** | "One, two, one two three four": he counts the band in and the groove starts layering up. | none |
| `kuro_skim_the_scroll` | Sound Check | skill, common, 1 | 4 Block; take a card from the top 3 of the draw pile | scroll | **Crate Digging** | He flicks through a crate of beats behind him and pulls out exactly the one he needs. | `Somewhere in this crate is the right beat. Ah. There it is.` |
| `kuro_redraft` | Remix | skill, common, 0 | discard up to 2, draw that many (up: Hold) | quill | **Flip It** | "Wikka wikka": he scratches two ideas out and flips them into two fresh ones. | none |
| `kuro_ink_cloak` | Quiet Cloak | skill, common, 1 | 6 Block; Lead: 6 more | mask | **Beat Box** | He beatboxes a literal box: four walls of kick and snare snap up round him, thicker when he stands in the lead. | `Beat. Box. He has explained this joke many times.` |
| `kuro_shared_umbrella` | Shared Umbrella | skill, common, 1 | both heroes 4 Block | fan | **Shoulder to Shoulder** | The duo stand shoulder to shoulder and his beat wraps round both of them like a hug. | `He calls it a tactical formation. It is a hug.` |
| `kuro_ghost_ink` | Ghost Note | skill, common, 1 | the ally gains 1 Shimmy (up: and he gains 3 Block) | spirit_orb | **Dance Break** | He drops into a dance break and his partner cannot help shimmying out of the way. | none |
| `kuro_rot_script` | Rot Reprise | skill, uncommon, 1 | double the target's Earworm (adds at most 10); Fade | skull | **Double Time** | He flips the stuck beat into double time; the earworm in the enemy's head runs twice as fast. | none |
| `kuro_wildfire_verse` | Wildfire Anthem | skill, uncommon, 2 | 5 Sizzle, 3 Sizzle to all other enemies | fire | **Heatwave** | The beat gets so hot the speakers glow; heat rolls out from the target to everyone near it. | none |
| `kuro_inkblot_verdict` | Dissonance | attack, uncommon, 1 | 2 damage plus 3 per debuff on the target | sigil (pose) | **Scratch Combo** | "Wikka wikka chk": a vocal scratch combo that hits harder for every jinx already stuck to the enemy. | `Wikka wikka. That is the polite version.` |
| `kuro_creeping_ink` | Creeping Drone | power, uncommon, 1 | up to 2 times a turn, each Skill puts 1 Earworm on a random enemy | web | **Word of Mouth** | Every trick he plays gets passed along; a tiny phone pops up over a random enemy, playing his beat on repeat. | `One beat, passed from mouth to mouth, until all of the Soundlands know it.` |
| `kuro_rain_of_strokes` | Rain of Notes | attack, uncommon, 2 | 4 to a random enemy, then spend up to 4 Groove: 4 to a random enemy per Groove | sword_rain (pose) | **Snare Roll** | "K k k kssh": a stuttering snare roll sprays hits at random, one more burst per layer of groove. | none |
| `kuro_well_of_ink` | Circular Breathing | power, uncommon, 1 | Opener; 1 Groove at the start of each turn | mirror | **Heartbeat** | A soft, steady kick like a heartbeat; every turn it adds one more layer of groove. | `Ba dum. Ba dum. The oldest beat in the world.` |
| `kuro_shelter_script` | Shelter Hymn | skill, uncommon, 1 | spend up to 2 Groove: the ally gains 4 Block plus 3 per Groove | talisman | **Got Your Back** | From the backing spot he lays a fat bass cushion under his partner's feet, and the hits sink into it. | `He has your back. Literally. He is standing right there.` |
| `kuro_strikethrough` | Cut the Noise | skill, uncommon, 1 | Fade up to 2 cards: 3 Block and 1 Groove each | cross_slash | **Sample Chop** | "Chk, chk": he chops two cards out of the mix, and every chop leaves a layer of groove and a little shield. | none |
| `kuro_nightshade_verdict` | Nightshade Requiem | attack, uncommon, 3 | 5 damage per Earworm on the target (max 50) | poison_bloom | **Chart Topper** | The beat stuck in the enemy's head goes straight to number one, and the whole chart lands on it at once. | `Number one in every head in the room.` |
| `kuro_midnight_oil` | Midnight Session | skill, uncommon, 0 | lose 3 HP, 1 Breath, draw 1; Fade | lantern | **Second Wind** | He gasps, grins and finds one more breath from somewhere, at a small cost to his throat. | `His throat says stop. His feet say one more.` |
| `kuro_flip_the_page` | Key Change | skill, uncommon, 1 | swap, draw 1, the ally gains 3 Block; now Backing: 1 Groove | book | **Pass the Mic** | "Your turn": he spins, hands over the lead, and slides into the backing spot on the beat. | none |
| `kuro_slow_match` | Slow Match | skill, uncommon, 1 | Hold; 2 Sizzle per turn of the fight so far (max 10) | fire | **Slow Jam** | A lazy slow jam that gets hotter every bar it plays; by the end the enemy is glowing. | `Patience, dear listener. It is still heating up.` |
| `kuro_grand_flourish` | Grand Finale | attack, rare, 2 | Hold; spend all Groove: 3 damage plus 5 per Groove | calligraphy (pose) | **Wait For It** | He builds, builds, holds it, holds it... then drops every layer of groove at once. | `Wait for it. Wait for it. Okay, now.` |
| `kuro_inkfall_inferno` | Inferno Cadenza | attack, rare, X | X times: 4 damage and 1 Sizzle to all enemies | meteor | **Monster Solo** | He steps up and goes off: kicks, snares, scratches and bass all at once, and the stage glows red hot. | `He was meant to be backing. Nobody told his solo.` |
| `kuro_plague_garden` | Plague Garden | power, rare, 2 | 2 Earworm to all enemies at the start of each turn | poison_bloom | **On Repeat** | A little beat starts playing on repeat in every enemy's head, every single turn. | `You will hear it in the shower. You will hear it in your dreams.` |
| `kuro_epilogue_flame` | Coda Flame | power, rare, 2 | 2 Sizzle to all; whenever either hero defeats an enemy, 3 Sizzle to all | fire | **Crowd Goes Wild** | Every time an enemy bows out the crowd goes wild, and the cheering heats the whole room up. | `Every win gets a cheer. Every cheer makes it hotter in here.` |
| `kuro_ink_reservoir` | Bottomless Lungs | power, rare, 2 | 2 Groove; each Skill gives 1 Groove | koi | **Layer Upon Layer** | Every trick he plays adds another layer to the beat, and the stack of sound rings keeps growing. | `How many layers is too many? He has never found out.` |
| `kuro_second_edition` | Canon | skill, rare, 1 | copy up to 2 cards in hand; Fade | book | **Loop Station** | He stomps the little loop pedal board at his feet: whatever is in his hand plays again, recorded and copied. | `Just for emergencies. It is always an emergency.` |
| `kuro_scene_change` | Call and Response | power, rare, 2 | whenever either hero swaps: draw 1, 1 Groove | mask | **Back and Forth** | Every time the duo trade places the beat bounces with them: a new card and a new layer of groove each swap. | `You lead, I back. I lead, you back. Nobody sits down.` |
| `kuro_inkwash_sanctum` | Resonant Sanctum | skill, rare, 2 | spend all Groove: both heroes 3 Block plus 3 per Groove | lotus | **Imperfect Harmony** | He drops the beat out and just hums along with his partner, a hair off the grid and a bit wobbly, and the sound wraps both of them up. | `A hair off the grid, a little wobbly, and completely real.` |

### 2.3 RawClaw (`js/data_cards_suzu.js`, 37 cards: electronic effects and production tricks)

| id (stays) | Echowake name | type, rarity, cost | what it does | art.m | **new name** | concept (what it looks and sounds like) | flavour (exact) |
|---|---|---|---|---|---|---|---|
| `suzu_ofuda` | Ofuda | attack, starter, 1 | 5 damage, 1 Tag | talisman (pose) | **Synth Zap** | A bright square-wave "pew" zaps from his pad sampler and leaves a glowing violet tag on the target. | `Pew. Not his fanciest patch. Still his favourite.` |
| `suzu_barrier` | Barrier | skill, starter, 1 | both heroes 3 Block | barrier | **Reverb Wall** | He pushes up the reverb fader and a soft violet wall of sound folds round both heroes. | `Mostly air. Very well arranged air.` |
| `suzu_moon_prayer` | Moon Prayer | skill, starter, 1 | 2 Reverb, heal both heroes 2 | moon | **Warm Pad** | A warm, slow synth pad swells under the band like a big hug, and everyone feels a bit better. | `The sound of a warm hug, played on a synth.` |
| `suzu_banishing_seal` | Banishing Seal | attack, common, 1 | 2 damage plus 3 per debuff on the target | sigil (pose) | **Sidechain Pump** | "Wub, wub": a pumping synth hit that ducks and swells harder for every effect already on the target. | none |
| `suzu_briar_lash` | Briar Lash | attack, common, 1 | 3 damage plus 3 per Feedback he has (up to 6) | thorns | **Distortion** | He cranks the distortion knob; the more the room squeals round him, the crunchier the hit. | `He saves the crunchy setting for special occasions.` |
| `suzu_hamaya_shot` | Hamaya Shot | attack, common, 2 | spend up to 3 Reverb: 10 damage plus 2 per Reverb; Backing: 1 Reverb | arrow (pose) | **Laser Synth** | He fires a long, rising laser synth line across the stage, brighter for every bit of reverb behind it. | none |
| `suzu_moonbeam` | Moonbeam | attack, common, 1 | 3 damage to all enemies, 1 Tag on the lowest HP enemy | crescent | **Filter Sweep** | "Vwoooom": a filter sweep washes over every enemy and pins a tag on the one already wobbling most. | none |
| `suzu_moon_veil` | Moon Veil | skill, common, 1 | the lead hero gains 7 Block | lotus | **Noise Gate** | He clicks on a noise gate; anything aimed at the lead hero hits a closed violet gate first. | `Only the good sounds get through. Everything else waits outside.` |
| `suzu_omamori` | Omamori | skill, common, 1 | heal both heroes 4 (up: 5, and 1 Reverb) | heal_light | **Chill Mix** | He spins a cosy chill mix with soft vinyl crackle; both heroes' shoulders drop and their voices come back a little. | `Beats to rest and recover to. Goat optional.` |
| `suzu_prayer_wall` | Prayer Wall | skill, common, 1 | Hold; spend up to 3 Reverb: both heroes 2 Block plus 2 per Reverb | shield | **Stadium Reverb** | He dials the reverb up to stadium size; a huge, glowing room of sound wraps both heroes. | none |
| `suzu_tolling_bell` | Tolling Bell | skill, common, 1 | 5 Block, 1 Spotlight; Lead: 1 Feedback | bell | **Solo Button** | He hits the solo button on his own channel: suddenly he is the only thing anyone can hear, or aim at. | `One click, and every eye in the room turns to him.` |
| `suzu_paper_seal` | Paper Seal | skill, common, 0 | 1 Muffled, 1 Wobbly | scroll | **Low Pass** | He sweeps a low-pass filter over the enemy; it suddenly sounds like it is singing from inside a wardrobe. | `Like singing from inside a wardrobe.` |
| `suzu_binding_seal` | Binding Seal | skill, common, 1 | 2 Exposed (up: and 1 Muffled) | web | **Dry Signal** | He bypasses every effect the enemy is hiding behind; its raw, dry voice is suddenly out in the open. | `No reverb, no filter, no hiding. Just you.` |
| `suzu_kagura_step` | Kagura Step | skill, common, 1 | swap; now Lead: 6 Block, 1 Spotlight; now Backing: heal both heroes 4 | fan | **Crossfade** | He crossfades between the spots: in the lead he becomes a wall, at the back he becomes a warm pad. | `Smooth in, smooth out. Nobody hears the join.` |
| `suzu_blessed_blade` | Blessed Blade | skill, common, 1 | the ally gains 3 Volume this turn | star | **Push the Fader** | He slides his partner's fader up; every hit they throw this turn sits louder in the mix. | none |
| `suzu_saisen` | Saisen | skill, common, 0 | 1 Reverb, draw 1 | coin | **Preset** | He scrolls to his favourite preset and taps it: a little reverb, a little inspiration. | `Preset forty two. It is always preset forty two.` |
| `suzu_waxing_moon` | Waxing Moon | skill, common, 1 | the lead hero gains 2 Block per turn of the fight so far (max 12) | moon | **Long Sustain** | He holds one long synth note under the lead hero; the longer the fight goes, the thicker the sound gets. | `Patience is a kind of power. So is a really long sustain.` |
| `suzu_ofuda_barrage` | Ofuda Barrage | attack, uncommon, X | 5 damage X times, Tag equal to X | talisman | **Finger Drumming** | He finger-drums on the pad sampler on his strap, tap tap tap tap, each tap a hit and a glowing tag. | none |
| `suzu_gohei_sweep` | Gohei Sweep | attack, uncommon, 2 | 5 damage and 1 Muffled to all enemies | wind (pose) | **Phaser** | A whooshing phaser sweep rolls over every enemy and leaves them all sounding muffled. | none |
| `suzu_guardians_reply` | Guardian's Reply | attack, uncommon, 1 | Lead: 3 plus his Block; Backing: 3 plus the ally's Block | quake | **Bounce Back** | Whatever wall of sound stands in front, his or his partner's, he bounces it straight back at the enemy. | none |
| `suzu_purifying_foxfire` | Purifying Foxfire | attack, uncommon, 2 | 8 damage, remove all debuffs from both heroes | fox | **Undo** | He rolls back everything bad that just happened to the band and fires the undone noise at the enemy. | `If only life had an undo button. In the studio, it does.` |
| `suzu_renewal_rite` | Renewal Rite | skill, uncommon, 1 | Hold; spend up to 3 Reverb: heal both heroes 2 per Reverb | lotus | **Tape Warmth** | He runs the band through warm old tape; the soft hiss soothes every scratchy throat. | none |
| `suzu_silencing_seal` | Silencing Seal | skill, uncommon, 1 | Hold; with 2 Reverb: spend 2, apply 1 Starstruck; else 1 Muffled | mask | **Tape Stop** | "Vwoooop": a tape-stop effect winds the enemy down to a standstill; it just stands there, dazzled. | `Some things are best slowed down. All the way down.` |
| `suzu_prayer_vigil` | Prayer Vigil | skill, uncommon, 0 | Hold up to 2 cards, 1 Reverb | lantern | **Save the Session** | He hits save; the best bits of this turn stay put for the next one. | `He saves every ten seconds. Nobody has ever asked why.` |
| `suzu_stone_lion` | Stone Lion | skill, uncommon, 2 | 10 Block, 2 Spotlight, 1 Feedback | tiger | **Stage Monitors** | He rolls a row of stage monitors in front of himself; everyone looks his way, and anything that hits them squeals back. | `Point the monitors at the problem. That usually helps.` |
| `suzu_ring_of_thorns` | Ring of Thorns | power, uncommon, 2 | 1 Feedback at the start of each turn (up: Opener) | thorns | **Howlround** | Every turn the monitors howl a little louder; anything that touches him gets an earful. | `The British word for feedback. It sounds exactly how it sounds.` |
| `suzu_sacred_stream` | Sacred Stream | power, uncommon, 2 | end of turn: heal both heroes HP equal to his Block (max 3) | koi | **Comfort Noise** | At the end of each turn a soft hiss of comfort noise settles over the band, healing a little for the shield he kept. | `Even the hiss between songs can be kind.` |
| `suzu_swaying_bells` | Swaying Bells | power, uncommon, 2 | once a turn, when either hero swaps: 1 Reverb, both heroes 2 Block | bell | **Ping Pong Delay** | Every time the duo trade places a ping-pong delay bounces between them, leaving reverb and a shield on each side. | `Left, right, left, right. The delay always knows where you are.` |
| `suzu_trailing_charms` | Trailing Charms | power, uncommon, 2 | every Attack either hero plays puts 1 Tag on its target (up: Opener) | spirit_orb | **Slapback** | Every attack either hero lands gets a quick slapback repeat that sticks to the target like a glowing tag. | `Every hit, then the same hit again, a little quieter, a little later.` |
| `suzu_moonlit_verdict` | Moonlit Verdict | attack, rare, 2 | 6 damage per debuff on the target (up to 5); if it defeats the enemy, 1 Reverb | eye (pose) | **Final Mixdown** | He bounces every effect on the enemy down into one master track and plays it back very, very loud. | `Every effect on you, bounced into one track. Enjoy the playback.` |
| `suzu_komainu_roar` | Komainu Roar | attack, rare, 2 | damage equal to his Block (max 16) to all enemies; Fade (up: no Fade) | quake | **Wall of Sound** | He tips his whole wall of sound forward onto every enemy at once. | `He built it to protect his friends. It also falls over very well.` |
| `suzu_thousand_ofuda` | Thousand Ofuda | attack, rare, 3 | 9 damage and 2 Tag to all enemies | sword_rain (pose) | **Arpeggiator** | He switches on the arpeggiator: hundreds of tiny bright synth notes rain on every enemy and tag them all. | `He pressed one key. The machine played the other thousand.` |
| `suzu_kagura_blessing` | Kagura Blessing | skill, rare, 1 | upgrade 2 cards in hand; Fade | crane | **Mastering** | He gives two cards a proper master: not shinier, just warmer and clearer. | `A little warmer, a little clearer. Not shinier. Never shinier.` |
| `suzu_yata_mirror` | Yata Mirror | skill, rare, 2 | double his Feedback (adds at most 8), 2 Spotlight; Fade | mirror | **Double Tracking** | He double-tracks his own squeal: twice the noise for anything that touches him, and every eye on him. | `Twice the squeal, and somehow even more charming.` |
| `suzu_guardian_kami` | Guardian Kami | power, rare, 2 | the next time a hero loses their voice, bring them back with 50% HP; both heroes 10 Block | spirit_orb | **Voice Memo** | He kept a voice memo of each of them; when a voice goes, he plays it back until it sings along again. | `He kept a voice memo of you laughing. Just in case.` |
| `suzu_shrine_grounds` | Shrine Grounds | power, rare, 2 | start of turn: both heroes gain Block equal to his Reverb (up to 5) | torii | **Acoustic Foam** | He lines the stage with violet acoustic foam; every turn the room he built wraps both heroes. | `Where he stands, the room starts to sound better.` |
| `suzu_lunar_domain` | Lunar Domain | power, rare, 3 | every 2nd turn: 2 Muffled and 1 Exposed to all enemies | moon | **Mixing Desk** | He rolls out the big mixing desk; every second turn he pulls every enemy's fader down and strips their effects. | `He controls the mix. Everyone else just thinks they do.` |

### 2.4 Andy (`js/data_cards_raiga.js`, 37 cards: bass and low-end moves)

| id (stays) | Echowake name | type, rarity, cost | what it does | art.m | **new name** | concept (what it looks and sounds like) | flavour (exact) |
|---|---|---|---|---|---|---|---|
| `raiga_jab` | Thunder Jab | attack, starter, 1 | 6 damage | thunder_fist (pose) | **Slap Bass** | A fat thumb slap on the low string, "THWACK", and an orange shockwave rolls along the floor. | `Just a knock at the door. The low end answers later.` |
| `raiga_brace` | Stone Brace | skill, starter, 1 | 5 Block | shield | **Amp Stack** | He steps behind his towering orange amp stack; hits thud off the speaker grilles. | `Three amps high and humming. He leans on it like a sofa.` |
| `raiga_static_fist` | Static Fist | attack, starter, 1 | 3 damage plus 2 per Rumble (up to 3), 1 Rumble; Backing: 1 more Rumble | lightning (pose) | **Thunder Thumb** | He thumps the lowest string with his thumb; the floor hums and the rumble builds under it. | none |
| `raiga_hard_knock` | Hard Knock | attack, common, 0 | 4 damage, lose 1 HP, 1 Rumble | fist (pose) | **String Pop** | He hooks a finger under the string and pops it, "PAP", and it stings his fingertip a bit. | `Ow. Worth it.` |
| `raiga_chain_lightning` | Chain Lightning | attack, common, 1 | 3 to a random enemy per Rumble; lose all Rumble | chain_lightning | **Walking Bass** | A walking bass line strolls from enemy to enemy, one bouncy note for every bit of rumble stored up. | `It never picks a favourite. It just walks over to everyone.` |
| `raiga_rolling_thunder` | Rolling Thunder | attack, common, 2 | 5 damage to all enemies plus 1 per Rumble (up to 3); Backing: 2 more | tornado | **Rolling Low End** | A long rolling low note travels across the floor under every enemy; cups rattle on the tables. | `You feel it long before you hear it.` |
| `raiga_iron_palm` | Iron Palm | attack, common, 1 | 6 damage, 2 Block; Lead: 2 more Block | thrust | **Palm Mute** | He palm-mutes a chunky note, "chug", and the hand that strikes also shields. | none |
| `raiga_stilling_palm` | Stilling Palm | attack, common, 2 | 7 damage, 1 Starstruck | fist (pose) | **Jaw Dropper** | One note so low and so good that the enemy's jaw drops and it forgets to move. | `It is not the loudest note. It is just the right one.` |
| `raiga_repay_in_kind` | Repay in Kind | attack, common, 1 | 2 damage plus 3 per hit he took last enemy turn (max 11) | mirror | **Play It Back** | He records every hit he took on his loop pedal, then plays the whole lot back, bassier. | `He remembers every kindness, and every bump.` |
| `raiga_ember_fist` | Ember Fist | attack, common, 1 | 3 damage, 4 Sizzle | flame_orb | **Fuzz Pedal** | He stomps the fuzz pedal; the note comes out crackling hot and keeps on sizzling. | none |
| `raiga_bramble_stance` | Bramble Stance | skill, common, 1 | 5 Block, 1 Feedback | thorns | **Fret Buzz** | He leans on a buzzing bass; anything that touches him gets buzzed right back. | none |
| `raiga_draw_lightning` | Draw Lightning | skill, common, 0 | lose 2 HP, 2 Rumble; Backing: 1 more | lightning | **Crank It** | He cranks the amp, winces, grins; the floorboards start to hum. | `A little ringing in the ears is a fair price for a lot of low end.` |
| `raiga_temple_gong` | Temple Gong | skill, common, 1 | both heroes 4 Block, Hold a card | bell | **Hold That Note** | He holds one long, warm bass note both heroes can lean on, and it keeps a card warm for later. | `One long low note. Somehow everyone feels a bit braver.` |
| `raiga_static_field` | Static Field | skill, common, 0 | 1 Tag to all enemies | eye | **Floor Shaker** | A single deep note shakes the floor under every enemy; now they are all wobbling and easier to hit. | none |
| `raiga_still_water` | Still Water | skill, common, 0 | discard up to 2, draw that many | wave | **Change Strings** | He swaps two dull old strings for two fresh, bright ones, and tunes up with a smile. | `Old strings out, new strings in, and the tea is still warm.` |
| `raiga_rousing_roar` | Rousing Roar | skill, common, 1 | both heroes 2 Volume this turn | dragon | **Bass Boost** | He flicks on the bass boost; everyone in the band suddenly hits fuller. | `Not a roar. A big, warm invitation to turn it up.` |
| `raiga_shared_burden` | Shared Burden | skill, common, 1 | the ally gains Block equal to his missing HP (max 8) | barrier | **Big Shoulders** | The more battered he is, the bigger the shield he lends his partner; he just shrugs. | `Heavy? He did not notice. He was busy carrying it.` |
| `raiga_sundering_blow` | Sundering Blow | attack, uncommon, 2 | Hold; 26 damage to a Starstruck target, else 10 | quake | **Drop D** | He detunes to drop D and lands the lowest note of the night; on a dazzled enemy it hits like a falling piano. | `Tune down. Breathe out. Let the floor do the rest.` |
| `raiga_cornered_tiger` | Cornered Tiger | attack, uncommon, 1 | 7 damage; below half HP, 8 more | tiger (pose) | **Dig Deep** | Battered, sweaty and grinning, he digs into the strings harder the worse it gets. | `He is calmest just before he is loudest.` |
| `raiga_drumroll` | Drumroll | attack, uncommon, X | X times: 4 damage and 2 Block | thunder_fist (pose) | **Loop Pedal** | He stomps his loop pedal and the same riff plays back again and again, each pass a hit and a shield. | `Record, play, repeat. He keeps the groove, the pedal keeps count.` |
| `raiga_lightning_rod` | Lightning Rod | skill, uncommon, 1 | both heroes 2 Feedback | lightning | **Twin Amps** | An amp rolls in behind each hero; hit either of them and it squeals back. | none |
| `raiga_blood_and_thunder` | Blood and Thunder | skill, uncommon, 1 | lose 6 HP, 2 Volume, 1 Rumble; Fade | fire | **Sweat and Thunder** | He plays so hard he gets a blister, and everything after lands heavier. | `Some grooves are paid for in blisters.` |
| `raiga_waiting_storm` | Waiting Storm | skill, uncommon, 1 | 4 Block; the next attacker is Starstruck | wind | **Bass Trap** | He sets a bass trap: the next thing that hits him gets a low boom so big it stands there dazzled. | `The trap is patient. So is the bass.` |
| `raiga_flashpoint` | Flashpoint | skill, uncommon, 1 | double the target's Sizzle (adds at most 12) | fire | **Overdrive** | He kicks the overdrive on; whatever is already sizzling on the enemy sizzles twice as hard. | `If it is sizzling, he can make it sizzle twice.` |
| `raiga_tiger_and_crane` | Tiger and Crane | skill, uncommon, 0 | swap; now Lead: 5 Block; now Backing: 1 Rumble, draw 1 | crane | **Shuffle Step** | A lazy shuffle across the stage: in the lead he plants his feet, at the back he noodles a little riff. | `Two moods, one bass.` |
| `raiga_bring_it_on` | Bring It On | skill, uncommon, 1 | lose 3 HP, 3 Rumble, 2 Spotlight, the ally gains 3 Block | mask | **Over Here** | He steps forward, waves at every enemy, "over here", and soaks up all the attention, rumbling. | `He says it so kindly that they all fall for it.` |
| `raiga_living_conduit` | Living Conduit | power, uncommon, 1 | Opener; once a turn, either hero's Attack gives 1 Rumble | spirit_orb | **Lock In** | He locks in with whoever is playing; every hit either hero lands adds a little rumble under his feet. | `Bass rule number one: listen to the beat.` |
| `raiga_long_memory` | Long Memory | power, uncommon, 2 | up to 2 times a turn, when hit: 1 Tag on the attacker | eye | **Got Your Number** | Every enemy that hits him gets a little orange note pinned on it: he will be back for that one. | `He forgives everyone. He also never forgets a bass line.` |
| `raiga_unshaken_mind` | Unshaken Mind | power, uncommon, 1 | end of turn with 10 Block: 2 Rumble and the ally gains 3 Block | lotus | **Unbothered** | Behind a big shield he simply keeps playing, unbothered, and the rumble keeps building. | `The fight can knock all it likes. He is busy with the groove.` |
| `raiga_raijin_hammer` | Raijin's Hammer | attack, rare, 3 | Hold; 22 damage; with 4 Rumble: spend 4, gain 2 Breath | quake | **The Lowest Note** | He reaches for the lowest note the bass can make; the floor drops an inch and he gets his breath back on the way up. | `So low that only the floor can hear it. The floor is impressed.` |
| `raiga_thousand_thunders` | Thousand Thunders | attack, rare, 3 | Hold; spend up to 5 Rumble: 3 damage to all enemies plus 4 per Rumble | meteor | **Thunder From Below** | All the rumble stored in the floorboards erupts at once under every enemy. | `The floor has been saving this up for a while.` |
| `raiga_heavens_answer` | Heaven's Answer | attack, rare, 2 | 10 plus the damage he took last enemy turn (max 26) | thunder_fist (pose) | **Octave Down** | Everything that hit him last turn comes back as one huge, deep reply. | `Whatever you throw at him comes back an octave lower.` |
| `raiga_mountain_vow` | Mountain Vow | skill, rare, 2 | Block equal to 4 plus his missing HP (max 18) | torii | **Bedrock** | He plants his feet and becomes the bedrock of the band; the more battered he is, the steadier he gets. | `The bass is the floor everyone else dances on.` |
| `raiga_deafening_thunderclap` | Deafening Thunderclap | skill, rare, 3 | 5 damage and 1 Starstruck to all enemies; Fade | bell | **Bass Drop** | The bass drops so hard that every enemy is left standing still, mouth open. | `For one moment, all of the Soundlands forget what they were doing.` |
| `raiga_storms_eye` | Storm's Eye | power, rare, 2 | 3 Rumble, draw 1; up to 2 times a turn, when hit: 1 Rumble | eye | **Calm Centre** | In the middle of the noise he closes his eyes and smiles; every hit just feeds the rumble. | `In the loud middle of everything, someone is smiling.` |
| `raiga_thornstorm` | Thornstorm | power, rare, 2 | 5 Block, 1 Feedback; start of turn: damage equal to his Feedback (max 8) to all enemies | thorns | **Speaker Quake** | His speakers shake so hard at the start of every turn that every enemy gets a jolt, and anything that hits him gets one too. | `The speakers were a gift. The shaking was a bonus.` |
| `raiga_storm_taiko` | Storm Taiko | power, rare, 2 | every 3rd card he plays: 2 damage to all enemies, 1 Rumble | sun | **Triplet Feel** | He slips into a triplet feel; every third card he plays lands on the big beat and booms across every enemy. | `One for courage, one for fun, and one for the floor.` |

### 2.5 Shared curse and status cards (`js/data_cards_shared.js`, 12 cards)

Curses come from Detours and Encore 8 (`Jinxed`); status cards are added by enemies (Glossed Over by many, Untangle by Scrollspinner and
other tanglers, Live Wire by the Perfect Stage drones, Airbrushed and Out of Breath by the Polished). They are acted by the lead hero.
Every one keeps a flavour line (as in Echowake). The curse names are little everyday jinxes of the feed and the stage, never mean.

| id (stays) | Echowake name | type | what it does | art.m | **new name** | concept (what it looks and sounds like) | flavour (exact) |
|---|---|---|---|---|---|---|---|
| `curse_regret` | Regret | curse | Unplayable; in hand at end of turn: the lead hero loses 2 HP | mirror | **Cringe Replay** | A little phone screen replays your most awkward moment on a loop; the lead hero winces every turn it sits in hand. | `Your brain plays it back at 2 am. In slow motion. With subtitles.` |
| `curse_smudge` | Wrong Note | curse | Unplayable, pure clutter | ink_splash | **Pitchy** | A grumpy comment bubble that only says "pitchy", wedged in your hand doing nothing. | `Someone in the comments said so, and now it lives in your deck.` |
| `curse_doubt` | Doubt | curse | Unplayable; when drawn: the lead hero gains 1 Muffled | eye | **Stage Fright** | Cold hands, wobbly knees, a tiny voice; the lead hero goes small for a turn. | `Cold hands, small voice. Breathe. It always passes.` |
| `curse_burden` | Burden | curse | Opener, Unplayable | void | **Excess Baggage** | A battered suitcase that is always in your opening hand and never gets opened. | `Somebody has to carry it, and the van is already full.` |
| `curse_hex` | Hex | curse | Unplayable; in hand at end of turn: both heroes gain 1 Exposed | sigil | **Hot Take** | A loud, steaming speech bubble everyone can see; both heroes feel very looked at. | `Nobody asked for it. Everybody saw it anyway.` |
| `curse_decay` | Decay | curse | Unplayable; in hand at end of turn: both heroes lose 1 HP | poison_bloom | **Screen Time** | A phone that keeps lighting up; both heroes lose a little every turn they stare at it. | `Just one more minute. That was an hour ago.` |
| `status_blot` | Silence | status | One Take, Unplayable | ink_splash | **Glossed Over** | A shiny pastel smear of the Gloss across the card; it wipes itself off at the end of the turn. | `A smear of the Gloss. It wipes off by itself, if you let it.` |
| `status_tangle` | Tangle | status | cost 1: remove Tangled from both heroes; Fade | web | **Untangle** | A knot of mic cables round the heroes' ankles, and one quick "over, under, through". | `Mic cables round your ankles. Over, under, through, and free.` |
| `status_scorch` | Scorch | status | One Take, Unplayable; in hand at end of turn: the lead hero loses 2 HP | fire | **Hot Mic** | A microphone left switched on and glowing warm; holding it at the end of the turn singes the lead hero's fingers. | `Still switched on, still very warm, and still very cross about it.` |
| `status_redacted` | Muted | status | Unplayable, pure clutter | void | **Airbrushed** | A card airbrushed so smooth that nothing is left on it but a soft pastel blur. | `There was a real note here once. Now it is very, very smooth.` |
| `status_static` | Static | status | cost 0: the lead hero loses 2 HP, draw 1; Fade | lightning | **Live Wire** | A crackling cable with blue sparks: grab it, get a zap, get a card. | `A crackling cable. Grab it and it grabs back.` |
| `status_wilt` | Wilt | status | Unplayable; when drawn: lose 1 Breath | petals | **Out of Breath** | A singer bent double, gasping; the turn starts one breath short. | `Too many high notes in a row. Everybody needs a sip of water.` |

Enemy intent lines then read, from the generator: "Adds a Glossed Over card to your draw pile", "Adds 2 Airbrushed cards", "Adds an
Untangle card"; Detour outcomes read "Add a Pitchy card" or "Add a Stage Fright card". Echowake's header comment in
`data_cards_shared.js` ("the song's sour notes", "Tempo Trials") becomes "the little jinxes of the feed and the stage", "Encores".

### 2.6 Name census (for the uniqueness check)

148 hero names plus 12 shared names, all different ignoring case and punctuation. Names by word count: one word 21, two words 106,
three words 32, four words 1 (`Calling of the Moon`). Longest: `Shoulder to Shoulder` (20 characters) and `Calling of the Moon` (19);
shortest: `Undo` (4). Hyphens only in RoxorLoops's `Hi-Hat Guard` and `Build-Up`.

---------------------------------------------------------------------------------------------------------------------------------

## 3. Statuses, keywords and the card text sanity note

### 3.1 Statuses (copied from bible 4.3; ids stay; these words appear in generated card text)

| id | kind | name | text (exact) |
|---|---|---|---|
| `might` | buff | **Volume** | `Attacks deal +N damage per hit.` |
| `bulwark` | buff | **Soundproof** | `Gain +N extra Block whenever you gain Block from a card.` |
| `regen` | buff | **Warm Tea** | `At the start of its turn, heal N, then Warm Tea falls by 1.` |
| `thorns` | buff | **Feedback** | `Whenever it is hit by an attack, the attacker takes N damage.` |
| `dodge` | buff | **Shimmy** | `Shimmies out of the next N attack hits completely.` |
| `taunt` | buff | **Spotlight** | `Enemy attacks that would strike the backing hero, or a random or lowest hero, hit this hero instead.` |
| `ritual` | buff | **Crescendo** | `At the start of its turn, gain N Volume.` |
| `plating` | buff | **Sequins** | `At the start of its turn, gain N Block.` |
| `bloom` | resource (Jasmin) | **Bloom** | `Jasmin's blossoms. Built by her sung attacks, spent by her finishers.` |
| `sumi` | resource (RoxorLoops) | **Groove** | `RoxorLoops's groove. Built layer by layer with his skills, dropped in his big beats.` |
| `ward` | resource (RawClaw) | **Reverb** | `RawClaw's reverb. It builds every turn, and he spends it to wrap the band in sound.` |
| `charge` | resource (Andy) | **Rumble** | `Andy's low end. Built by taking hits and striking, released as thunder from below.` |
| `vulnerable` | debuff | **Exposed** | `Takes 50% more attack damage.` |
| `weak` | debuff | **Muffled** | `Deals 25% less attack damage.` |
| `frail` | debuff | **Wobbly** | `Gains 25% less Block from cards.` |
| `poison` | debuff | **Earworm** | `At the start of its turn, lose N HP (ignores Block), then Earworm falls by 1.` |
| `burn` | debuff | **Sizzle** | `At the end of the round, take N damage (ignores Block), then Sizzle halves.` |
| `stun` | debuff | **Starstruck** | `Skips its next action. A starstruck hero cannot play cards on their next turn.` |
| `bind` | debuff | **Tangled** | `While either hero is Tangled, neither hero can swap spots.` |
| `mark` | debuff | **Tag** | `The next N attack hits against it deal +3 damage each (one stack per hit).` |

### 3.2 Keywords (copied from bible 4.2; ids stay)

| id | name | text (exact) |
|---|---|---|
| `block` | **Block** | `Absorbs damage this turn. Wears off at the start of the owner's next turn.` |
| `exhaust` | **Fade** | `Fades out of the fight after it is played. It returns next combat.` |
| `retain` | **Hold** | `Stays in your hand at the end of the turn.` |
| `innate` | **Opener** | `Always in your opening hand.` |
| `ethereal` | **One Take** | `Fades if it is still in your hand at the end of the turn.` |
| `unplayable` | **Unplayable** | `Cannot be played.` |
| `front` | **Lead** | `The lead hero takes most enemy attacks. A card line starting Lead: only works while its hero stands here.` |
| `back` | **Backing** | `The backing hero is safe from most enemy attacks. A card line starting Backing: only works while its hero stands here.` |
| `swap` | **Swap** | `Trade spots. One swap per turn is free, more cost 1 Breath.` |
| `ink` | **Vox** | `Spend Vox on the map to unmute a hex and reveal it.` |
| `brush` | **Spell** | `A one-use Spell that unmutes a shape of hexes for free.` |
| `gem` | **Gem** | `Socket gems into card slots. A slot only accepts its own colour, rainbow slots accept any.` |
| `slot` | **Gem slot** | `Colour-matched socket. Gems change how the card plays.` |
| `prism` | **Rainbow slot** | `A rainbow slot accepts a gem of any colour.` |
| `xcost` | **X cost** | `Spends all your remaining Breath. The card reads X as the Breath spent.` |
| `down` | **Voiceless** | `A hero at 0 HP loses their voice: their cards clog your hand and they cannot be targeted. If both heroes lose their voice, the tour ends.` |

### 3.3 Card text sanity (only names and flavour are ours)

- Rules text is generated from the ops by `js/data_text.js` (`DATA.cardHtml`, `DATA.cardPlain`, `DATA.rowText`, `DATA.hookText`). A
  `text` field on a card is an error (CONTENT_SPEC 1). This plan changes only `name` and `flavor` in the four `data_cards_<hero>.js`
  files and `data_cards_shared.js`, plus the hero fields in 1.x. Ids, `cost`, `rarity`, `type`, `kw`, `fx`, `up`, `slots`, `locked`,
  `art` stay byte for byte, so the balance bot's records stay identical.
- Once the generator speaks the bible's words (4.9), sample renderings read: Take the Lead `Move to the lead. Gain 1 Bloom and 3
  Block.`; Sweet Thirds `Deal 2 damage 2 times. Lead: gain 1 Bloom.`; Drop the Beat `Spend up to 2 Groove. Deal 4 damage, plus 3 for
  each Groove spent.`; Catchy Hook `Apply 4 Earworm.`; Low Pass `Apply 1 Muffled and 1 Wobbly.`; Thunder Thumb `Deal 3 damage, plus 2
  for each Rumble you have (up to 3). Gain 1 Rumble. Backing: gain 1 more Rumble.`; Out of Nowhere `Hold. If you have not played a
  card this turn, deal 12 damage. Otherwise, deal 4 damage. Fade.`; Out of Breath `Unplayable. When drawn, lose 1 Breath.`
- Every name above was checked against what its card does: AoE cards sound like they reach everyone (Petal Twirl, Throat Bass, Nod
  Along, Filter Sweep, Phaser, Arpeggiator, Rolling Low End, Thunder From Below, Bass Drop); random-target cards sound scattered (Arabic
  Impro, Snare Roll, Walking Bass); Block-into-damage cards sound like a wall turned round (Sing It Back, Mirror Ball, Bounce Back, Wall
  of Sound); swap cards sound like moving (Take the Lead, Centre Stage, Curtsy and Go, Pass the Mic, Crossfade, Shuffle Step); Breath
  cards say "breath" (Blossom Breath, Second Wind, Out of Breath); doubling cards say "double" (Double Time, Double Tracking) or "twice"
  in their concept (Overdrive).
- Phrases the generator prints on these cards that the bible's 4.9 table does not list yet (see 4.2): `swaps rows` (Stage Waltz, Back
  and Forth, Ping Pong Delay) becomes `swaps spots`; `Retain a card` / `Retain up to 2 cards` (Hold That Note, Save the Session)
  becomes `Hold a card` / `Hold up to 2 cards`; `The next time a hero falls, revive that hero with 50% HP` (Voice Memo) becomes `The
  next time a hero loses their voice, bring them back with 50% HP`; `Lose all Charge` (Walking Bass) becomes `Lose all Rumble` by the
  status rename alone.
- Rewrite each card file's header comment (it is the file's contract of record: archetype names, resource word, notable cards) with
  the names and archetypes in section 1; the `art.m` motif ids in it stay.
- Tests that mention old card names do so in labels and comments only (`Petal Slash in front is 6 + 2`, `engine: Blade Dance grows
  Might`, `Thunder Jab hits for 6 + 1`, `Raijin's Hammer hits for 22`, the `Tangle`, `Static` and `Wilt` fixtures in the enemies
  suites); they assert by id, so they keep passing. Refresh the labels when the suite is next touched; the local fixtures may keep
  their old names.

---------------------------------------------------------------------------------------------------------------------------------

## 4. Glossary additions and notes for the other plans and the tests

### 4.1 Glossary additions (terms this plan needed that the bible did not fix)

| Term | Use | Where |
|---|---|---|
| **Imperfect Harmony** | an ordinary card name (`kuro_inkwash_sanctum`), not an owner nod: "Human" lives only in its bible 2.9 placements (victory entry, `ch3_clear`, Flawless's last phase, the share line) and the question is never quoted on a card | card name and flavour |
| **Word of Mouth** | an ordinary card name (`kuro_creeping_ink`), not an owner nod: the viral clip lives only in its bible 2.9 placements (The Viral Clip Charm, the `wandering_storyteller` Detour, the two hero entries) | card name and flavour |
| **Loop Station** / **Loop Pedal** | RoxorLoops's little loop station is one rare (`kuro_second_edition`, the copy card, gag 4); Andy's loop pedal is `raiga_drumroll` (the repeat card) and is mentioned in `raiga_repay_in_kind` (**Play It Back**). | card names |
| archetype names | doc-only labels, never player text: Blossom, Runs, Answer Back (Jasmin); Earworms and Heat, The Drop, The Arranger (RoxorLoops); The Room, Squeal Back, Effects Rack (RawClaw); Low-End Thunder, Hit Me Harder, Bass Brawler (Andy) | this file, card file headers |
| "jinx" (lowercase) | casual word for any debuff on an enemy, in concept lines and flavour only (`Jinx` is the curse intent label, bible 4.10, so no card is named Jinx) | concepts |
| "Upgrade" in rules text | stays: the green room action is **Rehearse** (`Upgrade a card` is its own verb line), so card text keeps `Upgrade a card in your hand` (Run It Again, Mastering) | generator |

### 4.2 For the text plan (`js/data_text.js`, bible 4.9 additions)

| Echowake output | Hocus Vocus output | Cards that print it |
|---|---|---|
| `whenever either hero swaps rows` | `whenever either hero swaps spots` | `hanae_waltz_of_steps`, `kuro_scene_change`, `suzu_swaying_bells` |
| `Retain a card.` / `Retain up to 2 cards.` | `Hold a card.` / `Hold up to 2 cards.` | `raiga_temple_gong`, `suzu_prayer_vigil` |
| `The next time a hero falls, revive that hero with 50% HP` | `The next time a hero loses their voice, bring them back with 50% HP` | `suzu_guardian_kami` (and any Charm built on `revive`, for the relics plan) |
| `the front hero gains 7 Block` | `the lead hero gains 7 Block` | `suzu_moon_veil`, `suzu_waxing_moon` (already covered by 4.9's `the lead hero`) |

### 4.3 For the test plan

- `tests/hocus_vocus_cards_hanae.test.mjs` names test (1 to 3 words): add one named exception, `hanae_blade_duet` **Calling of the
  Moon** (4 words, the owners' song title, binding in bible 2.9). Every other name in this file has 1 to 3 words.
- Narrative suite, barks: replace the Echowake voice assertions (Raiga booms, Hanae is dry, `Nobody. Saw. That.`) with: Jasmin at most
  one line with `!` (she has none) and `I do not need to be loud.` exactly once; RoxorLoops at most a third with `!` and `Party on top.
  Party at the back.` exactly once; RawClaw no `!` and `It is not a costume.` exactly once; Andy at most a quarter with `!` and
  `Just Andy.` exactly once; some line of 8 characters or fewer for Jasmin (`Ta-da.`) and Andy (`Womp.`); no bark of one hero contains
  another hero's DATA `name` (`/Jasmin|RoxorLoops|RawClaw|Andy/`, own name allowed). Suggested topic checks, all met by the DATA
  lines here: Jasmin half or more match `/soft|sing|song|note|petal|bloom|pretty|lovely|gentl|sorry|thank|voice|pitch|flat|sour|chorus|tea|mic|scrunchie|ponytail|lean|la\b|solo|front|light|bit/i`;
  RoxorLoops half or more match `/beat|groove|bmm|\bts\b|pff|\bka\b|kick|snare|bass|drop|mix|wikka|bounce|mic|solo|hair|outro|fade|album|show|front|boots/i`;
  RawClaw half or more match `/mix|reverb|level|fader|record|session|save|channel|signal|headphone|room|warm|filter|fade|bounce|clip|peak|distortion|goat|gentl|steady|calm|rest|noise|front|take|wall|ears|minute|moment/i`;
  Andy half or more match `/bass|low|floor|groove|rumble|hum|amp|string|subs?|thump|womp|boom|cups|chill|calm|nice|lovely|feel|front|right|nap|resting|bottom/i`.
- Theme-leak suite: the names here avoid every token in bible 6.2 and 6.3 (no echo, verse, Song, Chorus, Hum, Shout, Ripple, Drum
  Line, Beat Drop, ink, page, book, brush, paint, quill, scroll as an object, sakura, shrine, kami, taiko, moon outside Calling of the
  Moon). Allowed survivors used: `Bloom`, `Breath` (only on cards that gain or lose Breath), lowercase `chorus` and `song` in flavour,
  `thunder` for Andy, `scroll` as a verb (Preset's concept).
- Encore `trial_7` **Limited Edition** contains "edition" (bible 6.3); resolved: bible 6.4 lists it as an allowed survivor (a merch
  print run), so the theme-leak suite allowlists it.

### 4.4 Cross-checks done for this file

- Every card id of `inventory.md` appears exactly once in section 2 (37 per hero plus 12 shared, 160 in all); every hero id, the four
  `barks_<id>` lore ids, every status id and every keyword id appear in sections 1 and 3.
- Names: 160 different; no name equals a Spell (Boots and Cats, Vocal Run, Air Horn, Abracadabass, Surround Sound, Hocus Focus), a
  status, a keyword, a tile, a passive (Every Note Blooms, In the Pocket, Always Rolling, Bass Face), a hero title, a Sticker, an Encore, a
  Headliner, Untangle (reserved for `status_tangle`, used there), Mic Squeal, Botling or The Viral Clip.
- Flavour: 32 rares all have one; non-rare flavours: Jasmin 18 of 29, RoxorLoops 16 of 29, RawClaw 20 of 29, Andy 23 of 29, shared
  12 of 12. All at most 80 characters, ASCII, British spelling, no dash, no other hero named, no animal product, no admin word, no
  real name, no lyric. Plant-based food appears only as scenery (tea, noodles, snacks), never remarked on.
- Tone: nobody dies; `kill` barks win foes over or quiet them; `down` barks are a lost voice that comes back; the Gloss is never called
  evil; Jasmin never belts (The High Note is a whisper); RoxorLoops is never "a looper" (one Loop Station card, as a gag).
