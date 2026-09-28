# CLAWSPIRE art prompt book

This is the prompt book for replacing the canvas-drawn placeholder art with illustrations from an image generation AI. Every file listed here is optional. Drop a PNG at its path, reload the game, and it replaces the drawing. If the file is missing, the drawn art is used instead.

## How to add art

1. Generate the image at the size and orientation given in its table row (or any multiple of it with the same aspect ratio).
2. Save it as a PNG with a transparent background (except backgrounds, the title and event scenes, which are full frame) at the exact path shown, relative to `clawspire/`. Example: `clawspire/art/items/sword.png`.
3. Reload the game. There is no code change, no list to edit and no build step. `js/art.js` asks for every path in this book when the game boots, and anything it finds is used.
4. Missing files show up as 404s in the browser console. That is expected and harmless.
5. To remove a piece of art, delete the PNG. The drawn art comes back.

Rules of thumb:

- **Fill the canvas.** Items are stretched to their physics bounds and claw parts are fitted to their bodies, so the subject must touch the canvas edges on its long axis with nothing cropped. Empty margins make the art look smaller than the object that is actually being grabbed.
- **Match the aspect ratio.** An item picture is stretched to the exact width and height of its physics shape. Generate at the listed aspect and it will not be distorted.
- **Keep orientation.** Each row says which way the object lies (for example "blade pointing right"). If a picture is landscape and the body is portrait, the game turns it a quarter, like the drawn art, but it is best to generate it the listed way.
- **Shared files.** Several items share one art key (all potions use `potion`). The file `art/items/<artKey>.png` covers every item with that key. A file at `art/items/id/<itemId>.png` overrides it for that single item and is checked first. The same goes for enemies: `art/enemies/<enemyId>.png` beats `art/enemies/<artKey>.png`.
- **Enemies face left** (toward the player), stand with their feet on the bottom edge and fill the canvas height. The game sets their height from the body box and keeps the aspect ratio. Hurt flashes, freeze and poison tints, the attack lunge and the death fall are applied to the picture by the game.
- **Odd sizes.** If your generator only offers fixed sizes (1024x1024, 1536x1024 and so on), generate the closest one with plenty of transparent space around the object, then crop tight to the object. A tight crop gives the right aspect ratio automatically.
- **Test at small size.** Items are about 20 to 60 px on screen. Zoom out to 10% before accepting an image: if it does not read, simplify it.
- Sizes are exact pixel sizes for generation. Two sizes are listed where it matters: the gen size (what to generate) and the in-game size (how large it is drawn at scale 1).

## Global style anchor

Paste this paragraph before every prompt:

> Chunky cartoon vector illustration for a mobile arcade roguelike, one bold readable silhouette, thick even dark purple-black outlines (#12091f), flat colour fills with simple 2-tone cel shading (one base tone and one darker shadow shape toward the lower right) plus one small white specular highlight, neon arcade meets damp dungeon, palette built on deep purple ink #12091f, hot pink #ff2e88, arcade cyan #2ee6d6, prize gold #ffc94d, slime lime #a6ff5e and blood red #ff5a4a, flat colour, no soft gradients, no texture noise, no text, no letters, no numbers, no watermark, no signature, no border, no frame, no drop shadow, no ground shadow, a single subject isolated on a fully transparent background, centred, reads clearly at 24 pixels.

For **full-frame scenes** (arena and map backgrounds, the title, event illustrations) replace the last sentence of the anchor ("a single subject isolated ... reads clearly at 24 pixels") with: *full-bleed scene that fills the whole frame, no transparent areas, no characters unless the prompt asks for them.*

If your generator takes a negative prompt, use: `text, letters, words, numbers, logo, watermark, signature, frame, border, photo, photorealistic, 3d render, blurry, soft airbrush gradient, drop shadow, cropped, cut off, multiple subjects`.

## Items

Items live in the claw machine bin and are grabbed by the claw, so they must read at 24 px. The game stretches the picture over the item's physics bounds, which is why the size column follows each item's exact shape: generate at that aspect ratio with the object filling the canvas edge to edge along its long axis.

### Shared art keys (one file covers every item using the key)

| File | Gen size (px) | Aspect, orientation | In game (px) | Used by | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/items/sword.png` | 512x104 | 4.8:1, horizontal | 48x10 | rusty_sword, longsword | a short straight sword lying flat, blade pointing right, crossguard and leather-wrapped grip on the left, round pommel touching the left edge, one bright edge highlight along the blade |
| `art/items/dagger.png` | 512x152 | 3.33:1, horizontal | 30x9 | shiv, serrated_knife, twin_daggers | a small dagger lying flat, leaf-shaped steel blade pointing right, oval guard, short wrapped grip and round pommel on the left |
| `art/items/axe.png` | 216x512 | 1:2.33, vertical | 24x56 | battle_axe | a one-handed battle axe standing upright, crescent steel head at the top right, wooden haft running down to the bottom left |
| `art/items/hammer.png` | 360x512 | 1:1.44, vertical | 32x46 | war_hammer, rattle_mallet | a war hammer standing upright, blocky steel head across the top, short wooden handle pointing straight down |
| `art/items/anvil.png` | 512x272 | 1.86:1, horizontal | 52x28 | family_anvil | a blacksmith anvil in side view, wide flat face across the top with the horn pointing left, pinched waist, stubby foot at the bottom |
| `art/items/shield.png` | 432x512 | 1:1.18, vertical | 34x40 | dented_shield, heater_shield, tower_shield | a heater shield facing the viewer, flat top edge, sides curving down to a point at the bottom, riveted metal rim, painted cross |
| `art/items/buckler.png` | 512x512 | 1:1, square | 30x30 | spiked_buckler, pot_lid | a small round buckler seen face on, raised centre boss, ring of rivets around the rim |
| `art/items/potion.png` | 360x512 | 1:1.42, vertical | 24x34 | bubble_flask, stink_potion, liquid_fire, elixir | a round-bellied glass potion bottle standing upright, narrow neck and cork at the top, glowing liquid filling the lower two thirds, a few bubbles |
| `art/items/flask.png` | 480x512 | 1:1.07, square | 28x30 | toxic_vial, alembic | a conical laboratory flask standing upright, narrow corked neck at the top, wide flat base at the bottom, liquid in the lower half |
| `art/items/bomb.png` | 512x512 | 1:1, square | 26x26 | cherry_bomb, smoke_bomb, rubble_bomb | a round cartoon bomb with a metal cap on top and a short curly fuse sparking at the top right |
| `art/items/torch.png` | 512x120 | 4.2:1, horizontal | 42x10 | torch | a wooden torch lying flat, handle on the left, wrapped cloth head on the right with a flame flaring off to the right |
| `art/items/iceshard.png` | 176x512 | 1:2.93, vertical | 15x44 | icicle | a long jagged ice shard standing upright, pointed at both ends, pale blue with white facet lines |
| `art/items/snowball.png` | 512x512 | 1:1, square | 28x28 | snowball | a packed snowball, round and a little lumpy, white with pale blue shading and a few flecks |
| `art/items/coin.png` | 512x512 | 1:1, square | 22x22 | lucky_coin | a thick gold coin seen face on, five-point star stamped in the middle, raised rim |
| `art/items/gem.png` | 512x440 | 1.15:1, horizontal | 30x26 | philosophers_stone, stolen_gem | a cut gemstone in side view, flat table facet across the top, tapering to a point at the bottom, bright facet highlights |
| `art/items/rock.png` | 512x464 | 1.11:1, horizontal | 30x27 | rock | a plain grey rock, blocky lumpy silhouette, one crack |
| `art/items/slag.png` | 512x384 | 1.32:1, horizontal | 37x28 | slag | a lump of smelter slag, charcoal black with glowing orange cracks |
| `art/items/iceblock.png` | 512x480 | 1.06:1, square | 36x34 | iceblock | a rounded cube of clear blue ice with frosty highlights and one crack |
| `art/items/apple.png` | 512x512 | 1:1, square | 26x26 | crisp_apple | a shiny red apple with a short stem and one green leaf at the top |
| `art/items/bread.png` | 512x256 | 2:1, horizontal | 40x20 | stale_bread | a crusty oval loaf of bread lying flat, three diagonal score marks |
| `art/items/book.png` | 408x512 | 1:1.27, vertical | 30x38 | rulebook | a thick hardcover book seen from the front, standing upright, coloured cover, darker spine band on the left, gold emblem |
| `art/items/scroll.png` | 512x168 | 3:1, horizontal | 42x14 | map_scrap | a parchment scroll lying flat, rolled at both ends, wavy ink scribbles with no readable letters |
| `art/items/orb.png` | 512x512 | 1:1, square | 34x34 | plague_orb, crystal_ball | a glass crystal orb with swirling glowing energy inside and a bright highlight at the upper left |
| `art/items/ring.png` | 512x512 | 1:1, square | 20x20 | thieves_ring | a chunky gold ring standing upright with a big faceted gemstone set on top |
| `art/items/key.png` | 512x184 | 2.83:1, horizontal | 34x12 | skeleton_key | an ornate skeleton key lying flat, round decorative bow on the left, toothed bit on the right |
| `art/items/chain.png` | 512x88 | 5.8:1, horizontal | 58x10 | iron_chain | a short length of heavy iron chain lying flat, five interlocking links from edge to edge |
| `art/items/horn.png` | 512x312 | 1.63:1, horizontal | 39x24 | war_horn | a curved war horn, wide bell on the left narrowing to a mouthpiece on the right, brass bands |
| `art/items/whetstone.png` | 512x208 | 2.43:1, horizontal | 34x14 | whetstone | a rectangular sharpening whetstone lying flat, two-tone grey, a few sparks |
| `art/items/feather.png` | 512x96 | 5.5:1, horizontal | 44x8 | tickle_feather | a long fluffy feather lying flat, quill on the left, plume sweeping to the right |
| `art/items/skull.png` | 480x512 | 1:1.07, square | 28x30 | grudge_skull | a cartoon skull facing the viewer, big round eye sockets, small nose hole, row of teeth |
| `art/items/star.png` | 512x488 | 1.05:1, square | 32.4x30.8 | wishing_star | a plump five-pointed star standing upright, glossy |
| `art/items/boot.png` | 424x512 | 1:1.21, vertical | 28x34 | old_boot | an old leather boot standing upright in side view, tall shaft on the left, toe pointing right, sole along the bottom edge |
| `art/items/bone.png` | 512x136 | 3.67:1, horizontal | 44x12 | femur | a cartoon femur bone lying flat, knobbly ends |
| `art/items/bottle.png` | 232x512 | 1:2.22, vertical | 18x40 | frost_phial, acid_bottle, empty_bottle | a tall glass bottle standing upright, narrow neck at the top, straight sides, blank label band |
| `art/items/heart.png` | 512x512 | 1:1, square | 30x30 | spare_heart | a chunky glossy cartoon heart, upright, point at the bottom |
| `art/items/lantern.png` | 312x512 | 1:1.64, vertical | 22x36 | spooky_lantern | a lantern standing upright, metal cap and ring on top, glass panes with a glowing flame inside, metal base |
| `art/items/wand.png` | 512x104 | 5:1, horizontal | 40x8 | leech_wand | a slim magic wand lying flat, handle on the left, glowing tip on the right |
| `art/items/mask.png` | 512x464 | 1.1:1, horizontal | 32x29 | harlequin_mask | a masquerade mask facing the viewer, wide at the top with two eye holes, narrowing to a chin at the bottom |
| `art/items/egg.png` | 384x512 | 1:1.33, vertical | 24x32 | volatile_egg, golden_egg, dragon_egg | an egg standing upright, slightly pointed top |
| `art/items/dice.png` | 512x512 | 1:1, square | 24x24 | loaded_dice | a single six-sided die in three-quarter view, rounded corners, pips on the visible faces |
| `art/items/chip.png` | 512x512 | 1:1, square | 26x26 | poker_chip, roulette_wheel | a casino poker chip seen face on, a ring of eight white edge stripes, a raised inlay with a small star in the middle |
| `art/items/card.png` | 368x512 | 1:1.39, vertical | 24x34 | scratch_card, marked_deck | a playing card standing upright facing the viewer, a coloured border, a pale panel with one big diamond pip in the middle and two corner pips |
| `art/items/horseshoe.png` | 512x512 | 1:1, square | 32x29 | lucky_horseshoe | a lucky horseshoe with the open end pointing up, steel with four nail holes and two gold tips |
| `art/items/clover.png` | 512x512 | 1:1, square | 18x18 | lucky_clover | a four-leaf clover, four round leaves around a pale centre, a short curled stem |
| `art/items/slot.png` | 384x512 | 1:1.33, vertical | 30x40 | one_armed_bandit | a tiny tabletop slot machine standing upright, a gold dome on top, a window of three reels showing red sevens, a lever with a ball on the right side |
| `art/items/potato.png` | 512x328 | 1.55:1, horizontal | 34x21 | hot_potato | a lumpy baked potato lying flat, a few dark eyes, two wisps of orange steam rising off it |
| `art/items/pill.png` | 512x240 | 2.17:1, horizontal | 26x12 | poison_pill | a two-tone capsule pill lying flat, one half lime green, the other hot pink, a glossy highlight along the top |
| `art/items/cookie.png` | 512x344 | 1.5:1, horizontal | 32x21 | fortune_cookie | a golden fortune cookie in side view, folded into a crescent, a white paper slip with two tiny red lucky numbers poking out |

### Per-item overrides (optional, beat the shared key for one item)

Use these when an item should look different from the others that share its key (every potion is a `potion`, but Liquid Fire should burn). The size is that item's own physics box.

| File | Gen size (px) | Aspect, orientation | In game (px) | Art key | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/items/id/rusty_sword.png` | 512x104 | 4.8:1, horizontal | 48x10 | sword | Rusty Sword: a short straight sword lying flat, blade pointing right, tarnished bronze-grey blade (#b7a58c) freckled with orange rust spots and one chipped notch, dark brown leather grip (#6b4a2b) on the left, it has seen better centuries |
| `art/items/id/dented_shield.png` | 432x512 | 1:1.18, vertical | 34x40 | shield | Dented Shield: a heater shield facing the viewer, flat top, point at the bottom, dull steel-blue face (#8fa3b8) with a big comic dent in the upper left, dark navy rim (#3d4f66) with rivets |
| `art/items/id/spiked_buckler.png` | 512x512 | 1:1, square | 30x30 | buckler | Spiked Buckler: a small round steel buckler seen face on (#c9cfd6), a ring of short conical spikes around the rim and one big red-tipped spike (#ff5a4a) in the centre, a pointy hug |
| `art/items/id/iron_chain.png` | 512x88 | 5.8:1, horizontal | 58x10 | chain | Iron Chain: a heavy length of dark iron chain lying flat (#7d8590 links, #3b4048 shadows), five chunky links touching both ends, a few motion ticks as if it clanks |
| `art/items/id/heater_shield.png` | 464x512 | 1:1.11, vertical | 28x31 | shield | Heater Shield: a gold heater shield facing the viewer (#ffc94d), flat top, point at the bottom, a deep crimson chevron band (#8a2b2b), heavy and proud |
| `art/items/id/longsword.png` | 512x88 | 5.8:1, horizontal | 58x10 | sword | Longsword: a long elegant sword lying flat, blade pointing right, mirror-bright pale steel blade (#dfe6ee), long two-hand grip wrapped in indigo cloth (#4a3b8c), square crossguard, pommel at the left edge |
| `art/items/id/tower_shield.png` | 368x512 | 1:1.39, vertical | 36x50 | shield | Tower Shield: a tall rectangular tower shield standing upright facing the viewer, slate steel face (#6f7f99), glowing cyan trim lines (#2ee6d6) and a riveted boss, heavy as your regrets |
| `art/items/id/whetstone.png` | 512x208 | 2.43:1, horizontal | 34x14 | whetstone | Whetstone: a rectangular sharpening stone lying flat, mid grey (#8a8f99) with a pale grey top band (#c7ccd4), three bright sparks flying off the top right |
| `art/items/id/battle_axe.png` | 216x512 | 1:2.33, vertical | 24x56 | axe | Executioner Axe: a big executioner axe standing upright, wide crescent steel head (#aab3bd) at the top right, thick brown haft (#6b4a2b) angled down to the bottom left, heavy, honest, rude |
| `art/items/id/war_hammer.png` | 360x512 | 1:1.44, vertical | 32x46 | hammer | Bonk Hammer: a war hammer standing upright, fat steel head (#9aa4ad) across the top with a paper tag tied to it, short brown handle (#5a3a22) pointing down, cartoon bonk energy |
| `art/items/id/war_horn.png` | 512x312 | 1.63:1, horizontal | 39x24 | horn | War Horn: a curved ivory war horn (#e8d6a8) with brass bands (#8a5a2b), wide bell on the left sweeping to a mouthpiece at the right, lying slightly diagonal |
| `art/items/id/family_anvil.png` | 512x272 | 1.86:1, horizontal | 52x28 | anvil | Family Anvil: a squat charcoal-iron anvil in side view (#4a4f58), wide face across the top, horn pointing left, a gold heirloom plaque (#ffc94d) on its waist with no text, absurdly heavy |
| `art/items/id/toxic_vial.png` | 480x512 | 1:1.07, square | 28x30 | flask | Toxic Vial: a conical glass flask standing upright, narrow corked neck at the top, wide base, filled with radioactive slime-lime liquid (#a6ff5e) and dark green bubbles (#2d5a1a), a tiny skull bubble |
| `art/items/id/bubble_flask.png` | 360x512 | 1:1.42, vertical | 24x34 | potion | Bubble Flask: a round potion bottle standing upright, sky blue liquid (#7fd6ff) packed with big bubbles, dark teal cork (#1b4f73), the bubbles look ready to block |
| `art/items/id/cherry_bomb.png` | 512x512 | 1:1, square | 26x26 | bomb | Cherry Bomb: a round cherry-red bomb (#ff5a4a) with a dark cap (#2a1a1a) and a short sparking fuse at the top, glossy, contains no cherries |
| `art/items/id/stink_potion.png` | 360x512 | 1:1.42, vertical | 24x34 | potion | Stink Potion: a round potion bottle standing upright, murky olive liquid (#8fae3a), a wobbly brown cork (#4a3a1a) barely holding back three wavy stink lines |
| `art/items/id/alembic.png` | 480x512 | 1:1.07, square | 28x30 | flask | Alembic: a conical glass lab flask standing upright, clear pale glass (#d8f0ff), a hot pink liquid (#ff2e88) at the bottom, a curly glass tube at the neck, science |
| `art/items/id/liquid_fire.png` | 360x512 | 1:1.42, vertical | 24x34 | potion | Liquid Fire: a round potion bottle standing upright, blazing orange liquid (#ff8a2e) with gold sparks (#ffc94d), a tiny flame licking out around the cork |
| `art/items/id/frost_phial.png` | 232x512 | 1:2.22, vertical | 18x40 | bottle | Frost Phial: a tall slim glass bottle standing upright, icy pale blue liquid (#bfefff), cyan frost crust (#2ee6d6) creeping up the glass, a snowflake glint |
| `art/items/id/acid_bottle.png` | 232x512 | 1:2.22, vertical | 18x40 | bottle | Acid Bottle: a tall glass bottle standing upright, sizzling yellow-green acid (#d4ff3a) with olive shadows (#5a6b1a), a droplet eating a small hole in the label band |
| `art/items/id/volatile_egg.png` | 384x512 | 1:1.33, vertical | 24x32 | egg | Volatile Egg: a cream egg standing upright (#fff3d6) with glowing hot pink cracks (#ff2e88), tiny sparks leaking out, do not incubate |
| `art/items/id/elixir.png` | 360x512 | 1:1.42, vertical | 24x34 | potion | Elixir of Vigor: a round potion bottle standing upright, hot pink liquid (#ff2e88) glowing from inside, a gold cork and a gold heart charm tied at the neck (#ffc94d) |
| `art/items/id/plague_orb.png` | 512x512 | 1:1, square | 34x34 | orb | Plague Orb: a glass orb filled with swirling toxic green fog (#6bd35e), a dark purple skull-shaped swirl (#12091f) inside, bright highlight at the upper left |
| `art/items/id/philosophers_stone.png` | 512x440 | 1.15:1, horizontal | 30x26 | gem | Philosopher's Stone: a cut gemstone in side view, flat top, point at the bottom, hot pink crystal (#ff2e88) with gold alchemical sigil lines (#ffc94d) glowing inside |
| `art/items/id/shiv.png` | 512x152 | 3.33:1, horizontal | 30x9 | dagger | Shiv: a small crude dagger lying flat, blade pointing right, sharpened scrap steel (#d0d6de), grip wrapped in dark purple rag (#3a2a4a), small, pointy, deniable |
| `art/items/id/old_boot.png` | 424x512 | 1:1.21, vertical | 28x34 | boot | Old Boot: a battered brown leather boot standing upright (#7a5236), tall shaft on the left, toe pointing right, a flapping loose sole and dark laces (#3a2616), smells like a plan |
| `art/items/id/lucky_coin.png` | 512x512 | 1:1, square | 22x22 | coin | Lucky Coin: a thick gold coin seen face on (#ffc94d), a four-leaf clover stamped in the middle instead of a face, darker gold rim (#b8862b), one sparkle |
| `art/items/id/serrated_knife.png` | 512x136 | 3.78:1, horizontal | 34x9 | dagger | Serrated Knife: a knife lying flat, blade pointing right, steel blade (#c0c7cf) with a saw-tooth top edge, red grip (#ff5a4a) |
| `art/items/id/smoke_bomb.png` | 512x512 | 1:1, square | 30x30 | bomb | Smoke Bomb: a round grey bomb (#8a8aa0) with a dark cap (#2e2e3a), soft puffs of smoke curling from the fuse, poof |
| `art/items/id/twin_daggers.png` | 512x168 | 3:1, horizontal | 36x12 | dagger | Twin Daggers: two matching daggers lying flat side by side, blades pointing right, bright steel (#e6ebf0), hot pink grips (#ff2e88) tied together with a ribbon |
| `art/items/id/skeleton_key.png` | 512x184 | 2.83:1, horizontal | 34x12 | key | Skeleton Key: an ornate gold skeleton key lying flat (#ffc94d), round bow shaped like a tiny skull on the left, toothed bit on the right, dark gold shading (#7a5a1a) |
| `art/items/id/loaded_dice.png` | 512x512 | 1:1, square | 24x24 | dice | Loaded Dice: one ivory six-sided die (#f4f0e6) in three-quarter view with hot pink pips (#ff2e88), a tiny lead weight glinting inside, it knows |
| `art/items/id/stolen_gem.png` | 512x440 | 1.15:1, horizontal | 30x26 | gem | Stolen Gem: a cut gemstone in side view, flat top, point at the bottom, bright cyan crystal (#2ee6d6) with deep teal facets (#1a6b66), a tiny price tag string still attached |
| `art/items/id/thieves_ring.png` | 512x512 | 1:1, square | 20x20 | ring | Thief's Ring: a chunky gold ring standing upright (#ffc94d) with a hot pink gem (#ff2e88) set in a little claw-hand setting |
| `art/items/id/harlequin_mask.png` | 512x464 | 1.1:1, horizontal | 32x29 | mask | Harlequin Mask: a masquerade mask facing the viewer, split diamond pattern in hot pink and ink purple (#ff2e88, #12091f), wide at the top with eye holes, narrowing to a chin, nobody knows it is you |
| `art/items/id/wishing_star.png` | 512x488 | 1.05:1, square | 32.4x30.8 | star | Wishing Star: a plump five-pointed star standing upright, warm lemon gold (#ffe066) with an orange rim glow (#ff9a2e), a smiling sparkle in the centre |
| `art/items/id/crisp_apple.png` | 512x512 | 1:1, square | 26x26 | apple | Crisp Apple: a shiny red apple (#ff5a4a) with a short stem and a bright lime leaf (#a6ff5e), one juicy highlight |
| `art/items/id/stale_bread.png` | 512x256 | 2:1, horizontal | 40x20 | bread | Stale Bread: an oval loaf lying flat, toasted crust (#d9a35e) with darker score marks (#8a5a2b), so hard it looks like armour, a small chip missing |
| `art/items/id/torch.png` | 512x120 | 4.2:1, horizontal | 42x10 | torch | Torch: a wooden torch lying flat, brown handle (#8a5a2b) on the left, wrapped head on the right with an orange flame (#ff8a2e) flaring off to the right edge |
| `art/items/id/snowball.png` | 512x512 | 1:1, square | 28x28 | snowball | Snowball: a packed snowball, bright white (#f2fbff) with icy blue shading (#9fd8ff), a few frost crystals on top |
| `art/items/id/femur.png` | 512x136 | 3.67:1, horizontal | 44x12 | bone | Femur: a big cartoon leg bone lying flat, bone cream (#f0e8d0) with tan shading (#b8ab88), knobbly ends, it was someone's leg once |
| `art/items/id/empty_bottle.png` | 232x512 | 1:2.22, vertical | 18x40 | bottle | Empty Bottle: a tall green glass bottle standing upright (#6bd3a0), dark green shading (#1a4a33), empty, one crack starting near the bottom |
| `art/items/id/tickle_feather.png` | 512x96 | 5.5:1, horizontal | 44x8 | feather | Tickle Feather: a long fluffy pink feather lying flat (#ff9ad0), white tips (#ffffff), quill on the left, plume curling to the right |
| `art/items/id/icicle.png` | 176x512 | 1:2.93, vertical | 15x44 | iceshard | Icicle: a long icicle standing upright, pointed at both ends, pale blue ice (#bfefff) with cyan facet lines (#2ee6d6), dripping one droplet |
| `art/items/id/rattle_mallet.png` | 360x512 | 1:1.42, vertical | 24x34 | hammer | Rattle Mallet: a wooden mallet standing upright, round tan head (#b8864a) across the top with rattling beads inside, short dark handle (#5a3a22) pointing down |
| `art/items/id/pot_lid.png` | 512x512 | 1:1, square | 32x32 | buckler | Pot Lid: a round kitchen pot lid seen face on, brushed steel (#b0b8c0), a dark handle knob in the centre (#5a6068), dinner can wait |
| `art/items/id/map_scrap.png` | 512x168 | 3:1, horizontal | 42x14 | scroll | Map Scrap: a torn parchment map piece lying flat (#f0e0b0), rolled at the ends, brown ink paths (#8a5a2b) with several little X marks, no readable letters |
| `art/items/id/rulebook.png` | 408x512 | 1:1.27, vertical | 30x38 | book | Rulebook: a thick hardcover book standing upright facing the viewer, deep indigo cover (#4a3b8c), a gold claw emblem and gold corner guards (#ffc94d), no text |
| `art/items/id/grudge_skull.png` | 480x512 | 1:1.07, square | 28x30 | skull | Grudge Skull: a cartoon skull facing the viewer, bone cream (#f0e8d0), glowing hot pink eyes (#ff2e88), a scowl, it holds grudges |
| `art/items/id/leech_wand.png` | 512x104 | 5:1, horizontal | 40x8 | wand | Leech Wand: a slim wand lying flat, dark wine wood (#8a2b4a), handle on the left, a red glowing leech-mouth tip on the right (#ff5a4a) |
| `art/items/id/rubble_bomb.png` | 512x512 | 1:1, square | 36x36 | bomb | Rubble Bomb: a big round bomb made of packed rubble and stones (#5a5048), bound with rope, an orange fuse spark on top (#ff8a2e) |
| `art/items/id/spooky_lantern.png` | 312x512 | 1:1.64, vertical | 22x36 | lantern | Spooky Lantern: a lantern standing upright, dark purple iron frame (#3a2a4a), cyan ghost flame inside (#2ee6d6) with a cute little ghost face, boo but warm |
| `art/items/id/crystal_ball.png` | 512x512 | 1:1, square | 30x30 | orb | Crystal Ball: a lilac crystal ball (#d8c8ff) with a violet swirl (#7a5aff) inside, a small wooden stand under it, it saw this coming |
| `art/items/id/golden_egg.png` | 384x512 | 1:1.33, vertical | 24x32 | egg | Golden Egg: an egg standing upright, polished gold (#ffc94d) with pale yellow highlights (#fff3a0), one goose feather stuck to it |
| `art/items/id/spare_heart.png` | 512x512 | 1:1, square | 30x30 | heart | Spare Heart: a chunky glossy cartoon heart, upright, point at the bottom, hot pink (#ff2e88) with deep berry shading (#8a1a4a), a little stitched patch |
| `art/items/id/dragon_egg.png` | 384x512 | 1:1.33, vertical | 30x40 | egg | Dragon Egg: an egg standing upright with dragon scales, red (#ff5a4a) with gold scale edges (#ffc94d), a crack glowing with fire, it hatched angry |
| `art/items/id/rock.png` | 512x464 | 1.11:1, horizontal | 30x27 | rock | Rock: a dull grey-brown rock (#7a7068) with darker shading (#4a4440), lumpy blocky silhouette, completely boring on purpose |
| `art/items/id/slag.png` | 512x384 | 1.32:1, horizontal | 37x28 | slag | Slag: a lump of smelter slag, near black (#3a3230) with glowing orange cracks (#ff8a2e), wisps of heat, still warm |
| `art/items/id/iceblock.png` | 512x480 | 1.06:1, square | 36x34 | iceblock | Ice Block: a rounded cube of clear pale ice (#cfefff) with blue shading (#7fc8e8), frosty corners and a crack, slippery and useless |
| `art/items/id/flail.png` | 512x88 | 5.6:1, horizontal | 56x10 | chain | Morning Flail: a spiked iron ball on a short chain with a wooden grip on the left, lying flat, steel grey links (#aab3bd), red-tipped spikes (#ff5a4a), spin to win |
| `art/items/id/magnetite.png` | 512x440 | 1.15:1, horizontal | 30x26 | gem | Magnetite: a cut gemstone in side view, dark iron-grey crystal (#4a4f58) with hot pink magnetic field lines (#ff2e88) curling around it, a paperclip stuck to one facet |
| `art/items/id/aegis.png` | 432x512 | 1:1.18, vertical | 34x40 | shield | Aegis of the Rig: a grand kite shield facing the viewer, polished silver face (#e6ebf0), a gold claw crest and gold rim (#ffc94d), faint glowing aura, a wall with a handle |
| `art/items/id/rot_catalyst.png` | 480x512 | 1:1.07, square | 28x30 | flask | Rot Catalyst: a conical glass flask standing upright, murky moss green liquid (#6b8f2e) with acid yellow bubbles (#d4ff3a), a wisp of rotten vapour, ripe |
| `art/items/id/bottled_blaze.png` | 232x512 | 1:2.22, vertical | 18x40 | bottle | Bottled Blaze: a tall glass bottle standing upright, mint green glass (#6bd3a0) full of orange fire (#ff9a2e), a burning rag stuffed in the neck |
| `art/items/id/venom_dart.png` | 512x144 | 3.56:1, horizontal | 32x9 | dagger | Venom Dart: a slim throwing dart lying flat, point to the right, the tip dripping slime lime venom (#a6ff5e), dark green fletching (#2d5a1a) on the left |
| `art/items/id/bribe.png` | 512x512 | 1:1, square | 22x22 | coin | Bribe: a thick gold coin seen face on (#ffe066), a green banknote (#2a8a3a) folded and tucked behind it, a sly wink stamped in the middle |
| `art/items/id/firebomb.png` | 512x512 | 1:1, square | 30x30 | bomb | Firebomb: a round cartoon bomb, orange hot shell (#ff8a2e) with dark scorched bands (#5a1a0a), the fuse already a small fireball |
| `art/items/id/ghost_pepper.png` | 512x512 | 1:1, square | 26x26 | apple | Ghost Pepper: a wrinkly round red chilli pepper (#ff2e4a) with a green stem (#3a8a1a), a tiny ghost face made of steam rising from it, worth it |
| `art/items/id/inferno_scroll.png` | 512x168 | 3:1, horizontal | 42x14 | scroll | Inferno Scroll: a parchment scroll lying flat, rolled at both ends, orange flame runes (#ff8a2e) with scorched dark red edges (#8a1a0a), no readable letters |
| `art/items/id/ice_pick.png` | 512x152 | 3.4:1, horizontal | 34x10 | dagger | Ice Pick: a steel ice pick lying flat, frosty pale blue spike pointing right (#bfefff), a blue wrapped grip (#3b6fd6) on the left, ice chips flying |
| `art/items/id/blizzard_orb.png` | 512x512 | 1:1, square | 32x32 | orb | Blizzard Orb: a glass orb with a tiny swirling blizzard inside, snow white (#eaf6ff) with cyan wind streaks (#2ee6d6), frost creeping on the glass |
| `art/items/id/frozen_heart.png` | 512x512 | 1:1, square | 30x30 | heart | Frozen Heart: a chunky cartoon heart made of ice, pale blue (#9fd8ff) with deep blue facets (#2e6bd6), frosty sparkles, cold but kind |
| `art/items/id/thorn_ring.png` | 512x512 | 1:1, square | 20x20 | ring | Thorn Ring: a ring standing upright made of a twisted olive green thorny vine (#8fae3a), dark green thorns (#3a4a1a), a small bud where the gem would be |
| `art/items/id/glass_shield.png` | 464x512 | 1:1.11, vertical | 28x31 | shield | Glass Shield: a heater shield facing the viewer made of clear pale glass (#d8f0ff), sky blue leading lines (#7fd6ff) like stained glass, one thin crack |
| `art/items/id/rage_potion.png` | 360x512 | 1:1.42, vertical | 24x34 | potion | Rage Potion: a round potion bottle standing upright, boiling crimson liquid (#ff2e4a), a dark wine cork (#5a0a1a), an angry face in the bubbles |
| `art/items/id/scrap_shield.png` | 512x512 | 1:1, square | 32x32 | buckler | Scrap Shield: a round buckler seen face on, bolted together from rusty brown scrap plates (#8a6a4a), orange rust patches and glowing weld seams (#ff8a2e), upcycled |
| `art/items/id/pet_rock.png` | 512x464 | 1.11:1, horizontal | 30x27 | rock | Pet Rock: a plain beige-grey rock (#b8a898) with big googly eyes and a small pink bow on top (#ff2e88), content |
| `art/items/id/junk_cannon.png` | 512x312 | 1.63:1, horizontal | 39x24 | horn | Junk Cannon: a blunderbuss-shaped horn cannon, grey scrap metal (#7a7068) with gold bands (#ffc94d), wide bell on the left stuffed with rocks and bolts |
| `art/items/id/arcade_token.png` | 512x512 | 1:1, square | 22x22 | coin | Arcade Token: a thick arcade token seen face on, cyan metal (#2ee6d6) with a dark teal rim (#1a6b66), a tiny claw machine stamped in the middle |
| `art/items/id/gumball_jar.png` | 232x512 | 1:2.22, vertical | 18x40 | bottle | Gumball Jar: a tall glass jar standing upright packed with pink (#ff9ad0) and cyan (#2ee6d6) gumballs and marbles, a small lid on top |
| `art/items/id/crystal_shard.png` | 176x512 | 1:2.93, vertical | 15x44 | iceshard | Crystal Shard: a long jagged crystal shard standing upright, pointed at both ends, bubblegum pink (#ff9ad0) with violet facets (#7a5aff), sharp glints |
| `art/items/id/blood_orange.png` | 512x512 | 1:1, square | 26x26 | apple | Blood Orange: a round orange fruit (#ff8a2e) cut open on one side showing deep red flesh (#8a1a2a), a small leaf on top, juicy |
| `art/items/id/vampire_fang.png` | 512x136 | 3.67:1, horizontal | 44x12 | bone | Vampire Fang: a big curved fang lying flat, ivory white (#f4f0e6) with a dark red tip (#8a1a2a), a drop of red, bitey |
| `art/items/id/pay_to_win.png` | 512x488 | 1.05:1, square | 32.4x30.8 | star | Pay to Win: a plump five-pointed star standing upright, shiny gold (#ffc94d) with a hot pink coin slot in the middle (#ff2e88), the arcade way |
| `art/items/id/golden_idol.png` | 480x512 | 1:1.07, square | 28x30 | skull | Golden Idol: a small golden skull idol facing the viewer (#ffc94d), bronze shading (#8a5a2b), gem eyes that seem to watch your wallet |
| `art/items/id/deja_vu.png` | 512x168 | 3:1, horizontal | 42x14 | scroll | Deja Vu: a parchment scroll lying flat, rolled at both ends, lilac paper (#b08cff) with a looping gold spiral (#ffe066) drawn twice, no readable letters |
| `art/items/id/arcane_tome.png` | 408x512 | 1:1.27, vertical | 30x38 | book | Arcane Tome: a thick spellbook standing upright facing the viewer, violet cover (#7a5aff), a cyan glowing sigil (#2ee6d6) on the front, a ribbon bookmark, no text |
| `art/items/id/iron_nut.png` | 512x512 | 1:1, square | 20x20 | ring | Iron Nut: a chunky hexagonal iron nut seen face on, steel grey (#8a929c) with darker thread shading (#4a5058), tiny and important |
| `art/items/id/bag_bolts.png` | 512x512 | 1:1, square | 28x28 | ring | Bucket of Bolts: a small tin bucket overflowing with grey iron nuts and bolts (#8a929c), dark shading (#4a5058) |
| `art/items/id/bone_dice.png` | 512x512 | 1:1, square | 22x22 | dice | Bone Dice: a yellowed bone die in three-quarter view (#f1e9d6), rounded chipped corners, dark red pips (#8a1a2a) |
| `art/items/id/poker_chip.png` | 512x512 | 1:1, square | 26x26 | chip | Poker Chip: a red casino chip seen face on (#ff2e4a) with eight white edge stripes and a white star inlay |
| `art/items/id/scratch_card.png` | 368x512 | 1:1.39, vertical | 24x34 | card | Scratch Card: a gold lottery scratch card standing upright (#ffe066), three silver scratch-off circles, one scratched to show a pink star (#ff2e88) |
| `art/items/id/fortune_cookie.png` | 512x344 | 1.5:1, horizontal | 32x21 | cookie | Fortune Cookie: a golden brown fortune cookie (#e8b25e) folded into a crescent, a cream paper slip (#fff6e0) with tiny red numbers poking out |
| `art/items/id/double_or_nothing.png` | 512x512 | 1:1, square | 24x24 | coin | Double or Nothing: a thick silver coin seen face on (#e6ebf0), a dark stamped "2x" on one side of a split face (#2a2a3a) |
| `art/items/id/lucky_horseshoe.png` | 512x512 | 1:1, square | 32x29 | horseshoe | Lucky Horseshoe: a steel horseshoe pointing up (#aab3bd), four nail holes, gold tips (#ffc94d), a tiny sparkle |
| `art/items/id/marked_deck.png` | 368x512 | 1:1.39, vertical | 26x34 | card | Marked Deck: a small deck of playing cards standing upright, blue backs (#3b6fd6) with a white diamond pattern, the top card slightly askew, a pencil tick on the corner |
| `art/items/id/one_armed_bandit.png` | 384x512 | 1:1.33, vertical | 30x40 | slot | One-Armed Bandit: a tiny red slot machine (#ff2e4a) with a gold dome (#ffc94d), three reels showing red sevens, a chrome lever on the right |
| `art/items/id/roulette_wheel.png` | 512x512 | 1:1, square | 36x36 | chip | Roulette Wheel: a small roulette wheel seen from above, black body (#1a1224) with red pockets (#ff2e4a), a white ball in one pocket |
| `art/items/id/golden_dice.png` | 512x512 | 1:1, square | 26x26 | dice | Golden Dice: a solid gold die in three-quarter view (#ffc94d), glossy highlights, deep purple pips (#12091f), a little glint |
| `art/items/id/poison_pill.png` | 512x240 | 2.17:1, horizontal | 26x12 | pill | Poison Pill: a capsule pill lying flat, one half toxic lime (#a6ff5e) with a tiny skull, the other hot pink (#ff2e88) |
| `art/items/id/hot_potato.png` | 512x328 | 1.55:1, horizontal | 34x21 | potato | Hot Potato: a lumpy baked potato lying flat (#c98a4a), glowing red-orange cracks (#ff5a2e), wisps of steam, visibly too hot to hold |
| `art/items/id/crystal_dice.png` | 512x512 | 1:1, square | 22x22 | dice | Crystal Dice: a clear glass die in three-quarter view (#bfefff) with violet pips (#7a5aff) floating inside, bright refractions |
| `art/items/id/floating_token.png` | 512x512 | 1:1, square | 22x22 | coin | Floating Token: a lilac arcade token (#b08cff) with a gold rim (#ffe066), hovering with a soft purple glow under it |
| `art/items/id/firecracker.png` | 512x512 | 1:1, square | 26x26 | bomb | Firecracker: a round red firecracker bomb (#ff2e4a) with gold bands (#ffe066) and a short curly fuse with a spark |
| `art/items/id/lucky_clover.png` | 512x512 | 1:1, square | 18x18 | clover | Lucky Clover: a four-leaf clover, bright green leaves (#3ddc84) with darker veins (#1a6b3a), a curled stem |

### Evolved items (round 7)

An upgraded item delivered while the run holds its relic evolves into one of these (DESIGN.md "Evolutions and pet synergies (round 7)"). They are legends: a touch more ornate than any other prize, a soft glow in their colour, and a small gold up-chevron badge somewhere near a corner (the game adds the pulsing aura and rays around them live, so keep the background transparent and the glow tight). An evolved item only ever uses its own file below, never the shared art key, so the drawn fallback stays unique until the PNG exists.

| File | Gen size (px) | Aspect, orientation | In game (px) | Art key | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/items/id/excalibur_claw.png` | 512x110 | 4.67:1, horizontal | 56x12 | sword | Excalibur Claw: a legendary sword lying flat, blade pointing right, pale gold-white blade (#fff3c4) with a glowing cyan rune line, the crossguard is a three-pronged golden arcade claw gripping the blade, blue wrapped grip (#3b6fd6), a cyan gem pommel on the left |
| `art/items/id/plague_needle.png` | 512x102 | 5:1, horizontal | 50x10 | dagger | Plague Needle: a syringe dart lying flat, a long steel needle pointing right, a glass barrel of glowing toxic lime venom (#c6ff8a) with tick marks and a tiny skull, a dark purple plunger and cap on the left (#3a2f5a) |
| `art/items/id/nuke_pop.png` | 512x512 | 1:1, square | 34x34 | bomb | Nuke Pop: one huge glossy cherry bomb (#ff3b3b) with a yellow radiation trefoil (#ffe066) on its face, a cherry stem with a leaf for a fuse, sparking at the tip |
| `art/items/id/prism_lance.png` | 512x114 | 4.5:1, horizontal | 54x12 | iceshard | Prism Lance: a long faceted crystal lance lying flat, point to the right, clear icy glass (#d8f8ff) with rainbow bands of refracted light running across it, a bright white core line |
| `art/items/id/loaded_fate.png` | 512x512 | 1:1, square | 28x28 | dice | Loaded Fate: a golden die seen face on (#ffe8a0), rounded corners, a gold inner rim, the centre pip is a glowing green eye (#3ddc84), two small ink pips in opposite corners |
| `art/items/id/absolute_zero.png` | 512x512 | 1:1, square | 28x28 | snowball | Absolute Zero: a pale ice orb (#e8f8ff) with a six-pointed snowflake frozen inside it in deep ice blue (#4aa8ff), a white spark at its heart, frost on the rim |
| `art/items/id/tower_aegis.png` | 408x512 | 1:1.25, vertical | 40x50 | shield | Tower Aegis: a shield shaped like a castle tower, three battlements across the top, stone courses on a steel-blue face (#9fb4d8), a dark arched gate in the middle, a pointed base trimmed in gold (#ffc94d) |
| `art/items/id/scrap_titan.png` | 512x488 | 1.05:1, square | 42x40 | buckler | Scrap Titan: a robot head bolted together from scrap metal (#b89a6a), rivets in the corners, two glowing red eyes (#ff5a4a), a grille mouth, a hex nut on an antenna |
| `art/items/id/black_death.png` | 480x512 | 1:1.07, square | 28x30 | flask | Black Death Vial: a dark smoky conical flask (#2b1f3a) full of glowing toxic green brew (#7dff5e) with bubbles, a bone-white skull for a cork |
| `art/items/id/midas_coin.png` | 512x512 | 1:1, square | 32x32 | coin | Midas Coin: a fat solid gold coin seen face on (#ffd84a), a beaded rim of darker gold dots (#b8860b), a raised crown embossed in the middle |
| `art/items/id/swarm_queen.png` | 512x512 | 1:1, square | 26x26 | orb | Swarm Queen: a golden marble in black bee stripes (#ffcf3f, #3a2a10), two small glassy wings on top and a tiny gold crown |
| `art/items/id/echo_grimoire.png` | 432x512 | 1:1.18, vertical | 34x40 | book | Echo Grimoire: a thick purple grimoire standing upright (#5a2b9c), gold corner caps, a glowing cyan eye on the cover (#9ff6ff) with three echo rings rippling out around it |
| `art/items/id/streak_stiletto.png` | 512x112 | 4.6:1, horizontal | 46x10 | dagger | Streak Stiletto: a slim needle-thin stiletto lying flat, point to the right, silver-white blade (#e8fbff) with a pink edge line, a gold crossguard, three hot pink speed streaks trailing off the left end (#ff2e88) |
| `art/items/id/phoenix_torch.png` | 144x512 | 1:3.57, vertical | 14x50 | torch | Phoenix Torch: a torch standing upright, a dark red wooden handle (#8a2b2b) with a gold band, its flame is a small phoenix with orange wings spread (#ff8a2e) and a golden body (#ffb347) |

## Enemies

Full body, **facing left**, feet on the bottom edge, filling the canvas height, transparent background. The game sets the drawn height to the enemy's body box and keeps the width from your aspect ratio, so the listed aspect is a guide, not a hard rule. Bosses are drawn 1.6 times larger and the game adds a dashed aura ring around them, so give them a thin rim light in their accent colour but no big glow or background.

### Shared art keys

| File | Gen size (px) | Aspect, orientation | In game (px) | Used by | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/enemies/rat.png` | 512x288 | 1.78:1, horizontal | 66x37 | rat | a scruffy grey arcade rat on all fours, pink ears and tail, big front teeth, full body, facing left, feet on the bottom edge |
| `art/enemies/slime.png` | 512x400 | 1.28:1, horizontal | 64x50 | slime, slimeling, oilslick | a wobbly jelly slime blob with two big eyes and a gooey grin, full body, facing left, feet on the bottom edge |
| `art/enemies/bat.png` | 512x288 | 1.79:1, horizontal | 77x43 | bat | a round purple bat hovering with wings spread, gold eyes, tiny fangs, full body, facing left, feet on the bottom edge |
| `art/enemies/gremlin.png` | 472x512 | 1:1.09, vertical | 54x59 | gremlin | a small green gremlin with big ears, a toothy grin and clawed feet, full body, facing left, feet on the bottom edge |
| `art/enemies/mimic.png` | 512x400 | 1.27:1, horizontal | 90x71 | mimic | a treasure chest mimic, lid open like a jaw full of teeth, a long tongue, gold trim, full body, facing left, feet on the bottom edge |
| `art/enemies/spider.png` | 512x304 | 1.69:1, horizontal | 76x45 | spider, broodmother, spiderling | a round dark spider with eight bent legs, a red hourglass mark, several red eyes, full body, facing left, feet on the bottom edge |
| `art/enemies/goblin.png` | 400x512 | 1:1.29, vertical | 62x80 | goblin | a green goblin mechanic in overalls, holding a big wrench, full body, facing left, feet on the bottom edge |
| `art/enemies/hoard.png` | 768x616 | 1.25:1, horizontal | 240x192 | hoard | a towering heap of unwon arcade prizes (plush toys, coins, balls, trophies) with angry eyes and a mouth in the pile, full body, facing left, feet on the bottom edge |
| `art/enemies/imp.png` | 432x512 | 1:1.18, vertical | 50x59 | imp | a small red imp with little horns, bat wings and a pitchfork tail, full body, facing left, feet on the bottom edge |
| `art/enemies/clockwork.png` | 472x512 | 1:1.09, vertical | 64x70 | clockwork | a brass wind-up toy soldier with a big key in its back and a tiny musket, full body, facing left, feet on the bottom edge |
| `art/enemies/golem.png` | 488x512 | 1:1.05, square | 101x106 | golem | a hulking brass and stone golem with glowing orange eyes and huge fists, full body, facing left, feet on the bottom edge |
| `art/enemies/furnace.png` | 696x768 | 1:1.1, vertical | 122x134 | smelter | a living foundry furnace, iron body, a glowing orange mouth grate, smokestack arms, full body, facing left, feet on the bottom edge |
| `art/enemies/magnet.png` | 472x512 | 1:1.09, vertical | 77x84 | lodestone | a living horseshoe magnet, red body with steel tips, crackling cyan sparks between the tips, full body, facing left, feet on the bottom edge |
| `art/enemies/ironjaw.png` | 512x512 | 1:1, square | 180x180 | ironjaw | a giant walking bear trap, steel jaws as a mouth, stubby legs, full body, facing left, feet on the bottom edge |
| `art/enemies/wraith.png` | 352x512 | 1:1.45, vertical | 62x90 | wraith | a translucent glass ghost wraith, trailing wisps, cyan glowing eyes, full body, facing left, feet on the bottom edge |
| `art/enemies/yeti.png` | 512x488 | 1.04:1, square | 120x115 | yeti | a big furry white yeti with pale blue shading, long arms and a grumpy just-woke-up face, full body, facing left, feet on the bottom edge |
| `art/enemies/frostmage.png` | 336x512 | 1:1.52, vertical | 66x100 | frostmage, glacius | a frost mage in blue robes and a tall hat, holding an ice staff, full body, facing left, feet on the bottom edge |
| `art/enemies/icemimic.png` | 512x408 | 1.26:1, horizontal | 82x65 | icemimic | a mimic chest frozen in blue ice, icicle teeth, frosted lid, full body, facing left, feet on the bottom edge |
| `art/enemies/prizemaster.png` | 552x768 | 1:1.38, vertical | 208x288 | prizemaster | the Prize Master, a tall ringmaster showman in a purple coat and top hat whose hands are claw machine claws, full body, facing left, feet on the bottom edge |
| `art/enemies/mushroom.png` | 512x512 | 1:1, square | 63x63 | mushroom, rimecap | a mushroom creature with a red spotted cap, stubby legs and a grumpy face, full body, facing left, feet on the bottom edge |
| `art/enemies/knight.png` | 368x512 | 1:1.39, vertical | 66x92 | tinknight, frostknight | an empty suit of armour with a glowing visor slit, sword and shield, full body, facing left, feet on the bottom edge |
| `art/enemies/wisp.png` | 424x512 | 1:1.2, vertical | 40x48 | wisp | a floating wisp of cold cyan fire with a tiny face, full body, facing left, feet on the bottom edge |
| `art/enemies/crab.png` | 512x296 | 1.71:1, horizontal | 96x56 | crab | a red crab with one giant claw raised, eyes on stalks, full body, facing left, feet on the bottom edge |
| `art/enemies/drone.png` | 512x472 | 1.09:1, square | 63x58 | drone | a small flying drone with a tiny claw hanging underneath and a pink eye light, full body, facing left, feet on the bottom edge |
| `art/enemies/tinker.png` | 480x512 | 1:1.06, square | 63x67 | tinker | a tinker gnome with goggles and a tool belt, holding a screwdriver, full body, facing left, feet on the bottom edge |
| `art/enemies/cultist.png` | 344x512 | 1:1.5, vertical | 60x90 | cultist, highcultist | a hooded cultist in purple robes holding a glowing punch card, full body, facing left, feet on the bottom edge |
| `art/enemies/tickler.png` | 480x512 | 1:1.07, square | 68x72 | tickler | a round fuzzy pink monster with four long skinny arms, each ending in a yellow feather, a huge toothy grin, full body, facing left, feet on the bottom edge |
| `art/enemies/jelly.png` | 512x480 | 1.07:1, square | 66x62 | jelly | a see-through mint gelatin cube with a coin and a key floating inside, two eyes, a wobbly smile, full body, facing left, feet on the bottom edge |
| `art/enemies/barker.png` | 336x512 | 1:1.52, vertical | 73x112 | barker | a carnival barker in a pink and white striped jacket, straw boater hat, curly moustache, shouting into a megaphone, a cane, full body, facing left, feet on the bottom edge |
| `art/enemies/magbat.png` | 512x344 | 1.49:1, horizontal | 83x56 | magbat | a red bat whose head is a horseshoe magnet with steel pole tips and a cyan spark between them, riveted silver wings, full body, facing left, feet on the bottom edge |
| `art/enemies/mole.png` | 512x456 | 1.12:1, square | 68x61 | mole | a brown mole popping out of a dirt mound, a yellow miner's hard hat with a lamp, a pink star nose, big digging paws, full body, facing left, feet on the bottom edge |
| `art/enemies/dozer.png` | 512x368 | 1.39:1, horizontal | 134x96 | dozer | a small yellow bulldozer with a face: headlight eyes under angry brows, a grille grin, a steel blade in front, tracks, a smoking exhaust, full body, facing left, feet on the bottom edge |
| `art/enemies/ghost.png` | 384x512 | 1:1.33, vertical | 62x82 | ghost | a classic white sheet ghost with a wavy hem, big black oval eyes, a round "oo" mouth and pink cheeks, full body, facing left, feet on the bottom edge |
| `art/enemies/collector.png` | 344x512 | 1:1.49, vertical | 96x144 | collector | a gentleman collector in a long purple coat, top hat and monocle, a cane, a little crane arm on his back dangling a gold mini claw, full body, facing left, feet on the bottom edge |

### Per-enemy files

Where the enemy id equals its art key (for example `rat`), this is the same file as the shared one above, and this row is the more specific prompt for it.

| File | Gen size (px) | Aspect | In game (px) | Act, tier | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/enemies/rat.png` | 512x288 | 1.78:1, horizontal | 66x37 | act 1, normal | Coin Rat: a scruffy taupe arcade rat (#9a8a7a) on all fours, pink ears and tail, cheeks stuffed with coins, one coin clamped in its big front teeth, beady eyes on anything shiny. Full body, facing left, feet on the bottom edge. |
| `art/enemies/slime.png` | 512x400 | 1.28:1, horizontal | 64x50 | act 1, normal | Sticky Slime: a wobbly lime jelly slime (#a6ff5e), two big glossy eyes, a smug gooey grin, drips at the base, mostly water, the rest is attitude. Full body, facing left, feet on the bottom edge. |
| `art/enemies/slimeling.png` | 512x408 | 1.27:1, horizontal | 38x30 | act 1, normal | Slimeling: a tiny pale lime slime (#c8ff9a), one oversized eye, bouncy and fun-sized. Full body, facing left, feet on the bottom edge. |
| `art/enemies/bat.png` | 512x288 | 1.79:1, horizontal | 77x43 | act 1, normal | Arcade Bat: a round purple bat (#6b4a8c) hovering with wings spread, gold eyes, grumpy just-woken frown, a claw machine token hanging from one foot. Full body, facing left, feet on the bottom edge. |
| `art/enemies/gremlin.png` | 472x512 | 1:1.09, vertical | 54x59 | act 1, normal | Token Gremlin: a small green gremlin (#6bd35e) with huge ears, a toothy grin, clutching a rock it wants to feed to a machine. Full body, facing left, feet on the bottom edge. |
| `art/enemies/spider.png` | 512x304 | 1.69:1, horizontal | 76x45 | act 1, normal | Crawl Spider: a round dusky purple spider (#4a3a5a) with eight bent legs, red eyes, a scrap of web trailing, rude. Full body, facing left, feet on the bottom edge. |
| `art/enemies/goblin.png` | 400x512 | 1:1.29, vertical | 62x80 | act 1, normal | Goblin Crank-Op: an olive goblin (#8fae3a) in greasy overalls with a big wrench held the wrong way round, one eyebrow raised. Full body, facing left, feet on the bottom edge. |
| `art/enemies/mushroom.png` | 512x512 | 1:1, square | 63x63 | act 1, normal | Spore Cap: a mushroom creature with a red cap (#ff5a4a) and cream spots, stubby legs, a soda bottle cap stuck on its head, has opinions. Full body, facing left, feet on the bottom edge. |
| `art/enemies/crab.png` | 512x296 | 1.71:1, horizontal | 96x56 | act 1, normal | Claw Crab: a coral red crab (#ff8a5a), one giant claw raised in challenge like a boxer, eyes on stalks, wants a rematch. Full body, facing left, feet on the bottom edge. |
| `art/enemies/mimic.png` | 512x400 | 1.27:1, horizontal | 90x71 | act 1, elite | Prize Mimic (elite): a gold-trimmed treasure chest (#ffc94d) with the lid open as a jaw of teeth, a long purple tongue, a fake prize sticker on the lid, looks like a prize, is a mouth, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/broodmother.png` | 512x304 | 1.68:1, horizontal | 101x60 | act 1, elite | Brood Mother (elite): a big plum spider (#6b2a5a) with a bulbous abdomen covered in glowing egg sacs, eight legs braced, many red eyes, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/spiderling.png` | 512x312 | 1.64:1, horizontal | 46x28 | act 1, normal | Spiderling: a tiny pink-purple spider (#8a4a7a), too many legs for its size, bitey little fangs. Full body, facing left, feet on the bottom edge. |
| `art/enemies/hoard.png` | 768x616 | 1.25:1, horizontal | 240x192 | act 1, boss | The Hoard (boss): a towering heap of every prize nobody ever won, plush toys, gold coins, rubber balls and trophies (#ffc94d glints), two angry eyes and a gaping mouth in the pile, a crown of tickets on top, boss scale: imposing, fills the frame, thin rim light, no background glow. Full body, facing left, feet on the bottom edge. |
| `art/enemies/imp.png` | 432x512 | 1:1.18, vertical | 50x59 | act 2, normal | Grease Imp: a small red imp (#ff5a4a) with little horns and bat wings, holding a dripping oil can, mischievous grin. Full body, facing left, feet on the bottom edge. |
| `art/enemies/clockwork.png` | 472x512 | 1:1.09, vertical | 64x70 | act 2, normal | Wind-Up Soldier: a brass wind-up toy soldier (#c8a040) marching, big wind-up key in its back, tiny musket, rosy painted cheeks. Full body, facing left, feet on the bottom edge. |
| `art/enemies/drone.png` | 512x472 | 1.09:1, square | 63x58 | act 2, normal | Claw Drone: a small cyan flying drone (#2ee6d6) with four little rotors and a tiny claw dangling underneath clutching a stolen coin. Full body, facing left, feet on the bottom edge. |
| `art/enemies/tinker.png` | 480x512 | 1:1.06, square | 63x67 | act 2, normal | Tinker Gnome: an orange-bearded tinker gnome (#ff9a2e) with goggles, a tool belt and an oversized screwdriver. Full body, facing left, feet on the bottom edge. |
| `art/enemies/golem.png` | 488x512 | 1:1.05, square | 101x106 | act 2, normal | Brass Golem: a hulking brass golem (#c8a040) with stone plates, glowing orange eyes, huge fists, confused expression. Full body, facing left, feet on the bottom edge. |
| `art/enemies/tinknight.png` | 368x512 | 1:1.39, vertical | 66x92 | act 2, normal | Tin Knight: a hollow suit of pale tin armour (#aab3bd) with a dark visor slit and a faint glint inside, sword and kite shield, nobody is inside, probably. Full body, facing left, feet on the bottom edge. |
| `art/enemies/oilslick.png` | 512x400 | 1.28:1, horizontal | 64x50 | act 2, normal | Oil Slick: a black machine oil slime (#3a3230) with a rainbow sheen, two white eyes, dripping. Full body, facing left, feet on the bottom edge. |
| `art/enemies/ironjaw.png` | 512x512 | 1:1, square | 180x180 | act 2, elite | Ironjaw (elite): a giant walking bear trap (#7d8590), steel jaws as a huge mouth, stubby legs, a chain dragging behind, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/lodestone.png` | 472x512 | 1:1.09, vertical | 77x84 | act 2, elite | The Lodestone (elite): a living horseshoe magnet (#ff2e4a) with steel tips, crackling cyan sparks between the tips, paperclips and nails stuck to it, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/smelter.png` | 696x768 | 1:1.1, vertical | 122x134 | act 2, boss | The Smelter (boss): a living foundry furnace (#ff8a2e glow) with a riveted iron body, a glowing mouth grate full of molten metal, smokestack shoulders belching sparks, prize tokens dripping out, boss scale: imposing, fills the frame, thin rim light, no background glow. Full body, facing left, feet on the bottom edge. |
| `art/enemies/wraith.png` | 352x512 | 1:1.45, vertical | 62x90 | act 3, normal | Glass Wraith: a translucent pale blue ghost (#bfefff) with trailing wisps, cyan glowing eyes, breathing fog onto a pane of glass. Full body, facing left, feet on the bottom edge. |
| `art/enemies/wisp.png` | 424x512 | 1:1.2, vertical | 40x48 | act 3, normal | Cold Wisp: a floating wisp of icy blue fire (#9fd8ff) with a tiny grudging face. Full body, facing left, feet on the bottom edge. |
| `art/enemies/frostmage.png` | 336x512 | 1:1.52, vertical | 66x100 | act 3, normal | Frost Mage: a frost mage in periwinkle robes (#7fb2ff) and a tall pointed hat, frosty beard, holding an ice crystal staff. Full body, facing left, feet on the bottom edge. |
| `art/enemies/icemimic.png` | 512x408 | 1.26:1, horizontal | 82x65 | act 3, normal | Ice Mimic: a treasure chest frozen in pale blue ice (#cfefff), icicle teeth, frost on the lid, hungrier for it. Full body, facing left, feet on the bottom edge. |
| `art/enemies/cultist.png` | 344x512 | 1:1.5, vertical | 60x90 | act 3, normal | Claw Cultist: a hooded cultist in hot pink and purple robes (#ff2e88), face hidden in shadow except glowing eyes, holding up a punch card. Full body, facing left, feet on the bottom edge. |
| `art/enemies/yeti.png` | 512x488 | 1.04:1, square | 120x115 | act 3, normal | Snow Yeti: a big shaggy white yeti (#f2fbff) with pale blue shading, long arms, a grumpy just-woke-up face, frost on the fur. Full body, facing left, feet on the bottom edge. |
| `art/enemies/rimecap.png` | 512x512 | 1:1, square | 66x66 | act 3, normal | Rime Cap: a frozen mushroom creature with an icy blue cap (#9fd8ff) and snowflake spots, puffing tiny snowflake spores. Full body, facing left, feet on the bottom edge. |
| `art/enemies/frostknight.png` | 368x512 | 1:1.39, vertical | 83x115 | act 3, elite | The Frozen Knight (elite): a Crawler in armour encased in ice (#7fb2ff), a greatsword frozen to its gauntlet, frost breath from the visor, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/highcultist.png` | 344x512 | 1:1.5, vertical | 72x108 | act 3, elite | High Cultist (elite): a taller hooded cultist in magenta robes (#b02e88) with gold trim, holding a gold punch card aloft, a ring of floating candles, elite: a touch bigger and meaner than the normal version. Full body, facing left, feet on the bottom edge. |
| `art/enemies/glacius.png` | 512x768 | 1:1.51, vertical | 106x160 | act 3, boss | Glacius, the Ice Box (boss): the penthouse freezer awake, a huge frosted freezer cabinet body (#2ee6d6 glow) with an icy crown, glowing cyan eyes in the door window, frost claws, a small STAFF ONLY door shape behind it (no text), boss scale: imposing, fills the frame, thin rim light, no background glow. Full body, facing left, feet on the bottom edge. |
| `art/enemies/prizemaster.png` | 552x768 | 1:1.38, vertical | 208x288 | act 3, boss | The Prize Master (boss): a tall grinning ringmaster in a deep purple tailcoat (#ff2e88 trim) and top hat, a monocle, his hands are chrome claw machine claws, a showman bow, boss scale: imposing, fills the frame, thin rim light, no background glow. Full body, facing left, feet on the bottom edge. |
| `art/enemies/tickler.png` | 480x512 | 1:1.07, square | 68x72 | act 1, normal | Tickle Monster: a fuzzy ball of pink fur (#ff8ad8) with purple arms (#7a3aa8), eleven-armed energy shown as four long wiggling arms tipped with yellow feathers, a huge mischievous grin, lives under the prize counter. Full body, facing left, feet on the bottom edge. |
| `art/enemies/jelly.png` | 512x480 | 1.07:1, square | 66x62 | act 1, normal | Jelly Cube: a wobbling see-through cube of mint gelatin (#7af0c8), a coin, a key and a very old sandwich suspended inside, bubbles rising, a goo drip at the base, a pleased little face. Full body, facing left, feet on the bottom edge. |
| `art/enemies/barker.png` | 336x512 | 1:1.52, vertical | 73x112 | act 1, elite | Carnival Barker (elite): a fast-talking showman in a hot pink and white striped jacket (#ff2e88), gold boater hat and bow tie (#ffc94d), a curly moustache, shouting through a gold megaphone, a cane in the other hand, elite: a touch bigger and meaner than a normal enemy. Full body, facing left, feet on the bottom edge. |
| `art/enemies/magbat.png` | 512x344 | 1.49:1, horizontal | 83x56 | act 2, normal | Magnet Bat: a red bat (#d81f3a) whose head is a horseshoe magnet with steel pole tips (#c9d3e0) and a crackling cyan spark between them, riveted sheet-metal wings, gold eyes, roosts on the claw rail. Full body, facing left, feet on the bottom edge. |
| `art/enemies/mole.png` | 512x456 | 1.12:1, square | 68x61 | act 2, normal | Cinder Mole: a brown foundry mole (#8a5a3a) popping out of a dirt mound, a yellow miner's hard hat with a glowing lamp, a pink star nose (#ffb0c0), big pink digging paws, squinting. Full body, facing left, feet on the bottom edge. |
| `art/enemies/dozer.png` | 512x368 | 1.39:1, horizontal | 134x96 | act 2, elite | The Bulldozer (elite): a stubby yellow bulldozer (#ffc94d) with a face, headlight eyes under angry brows, a grille grin, a curved steel blade in front with a hazard stripe, dark tracks, a smoking exhaust stack, elite: a touch bigger and meaner than a normal enemy. Full body, facing left, feet on the bottom edge. |
| `art/enemies/ghost.png` | 384x512 | 1:1.33, vertical | 62x82 | act 3, normal | Peekaboo Ghost: a classic white sheet ghost (#e8f4ff) with a pale blue shade (#9fd8ff), a wavy hem, big black oval eyes, a round surprised mouth, pink blush, little waving nubs for arms, playing peekaboo. Full body, facing left, feet on the bottom edge. |
| `art/enemies/collector.png` | 344x512 | 1:1.49, vertical | 96x144 | act 3, elite | The Claw Collector (elite): a lean gentleman collector in a long purple frock coat (#7a3aa8) with gold buttons (#ffc94d), a top hat, a monocle on a chain, a thin smile, a cane, and a little crane arm rising off his back that dangles his own gold mini claw machine claw, elite: a touch bigger and meaner than a normal enemy. Full body, facing left, feet on the bottom edge. |

## Character portraits

Square, head and shoulders bust, facing the camera, the face centred. The game crops the picture into a circle, so keep the face and hat inside the central 80%. Use a flat dark background in the character colour instead of transparency (the circle crop hides the corners).

| File | Gen size (px) | Aspect | In game (px) | Prompt |
| --- | --- | --- | --- | --- |
| `art/portraits/knight.png` | 512x512 | 1:1, square | 96x96 | Sir Grabsworth, The Knight: a sturdy good-natured knight in a round steel helmet with the visor up, a hot pink plume, cyan trim on the armour (#2ee6d6), a very firm handshake face, the strap of a claw machine backpack over one shoulder, head and shoulders bust, facing the camera, flat dark background in #2ee6d6 |
| `art/portraits/alchemist.png` | 512x512 | 1:1, square | 96x96 | Mira Fizzwick, The Alchemist: a cheerful young alchemist with wild orange hair, big lime green goggles pushed up (#a6ff5e), a stain on one cheek, a bubbling vial tucked behind one ear, the strap of a claw machine backpack over one shoulder, head and shoulders bust, facing the camera, flat dark background in #a6ff5e |
| `art/portraits/gambler.png` | 512x512 | 1:1, square | 96x96 | Lucky Lou, The Gambler: a slick card sharp with oiled dark hair, a translucent green dealer's visor with a playing card tucked in the band, one eye winking, a pencil moustache, a grin with one gold tooth, a red bow tie on a green felt vest, the strap of a claw machine backpack over one shoulder, head and shoulders bust, facing the camera, flat dark background in #ffc94d |
| `art/portraits/rogue.png` | 512x512 | 1:1, square | 96x96 | Pip Quickclaw, The Rogue: a sly rogue in a deep purple hood, face in shadow except gold eyes and a smirk, a hot pink scarf (#ff2e88), a coin rolling across the knuckles, the strap of a claw machine backpack over one shoulder, head and shoulders bust, facing the camera, flat dark background in #ff2e88 |

## Relics

Small emblems shown at about 32 px in the relic strip, 256x256, square, transparent background, one object filling about 85% of the canvas. The game adds a small rarity dot in the corner, so do not add a frame.

| File | Gen size (px) | Rarity | Relic | Prompt |
| --- | --- | --- | --- | --- |
| `art/relics/squire_gauntlet.png` | 256x256 | event | Squire's Gauntlet | Squire's Gauntlet relic emblem: a steel knight gauntlet gripping tightly, a small blue shield crest on the back, small icon, square |
| `art/relics/bubbling_satchel.png` | 256x256 | event | Bubbling Satchel | Bubbling Satchel relic emblem: a leather satchel with green bubbles and a fizz of lime vapour spilling from the flap, something alive inside, small icon, square |
| `art/relics/pickpocket_glove.png` | 256x256 | event | Pickpocket Glove | Pickpocket Glove relic emblem: a black fingerless glove with a gold coin vanishing between two fingers, small icon, square |
| `art/relics/grip_tape.png` | 256x256 | c | Grip Tape | Grip Tape relic emblem: a roll of sticky pink grip tape with a peeled end, small icon, square |
| `art/relics/oiled_rails.png` | 256x256 | c | Oiled Rails | Oiled Rails relic emblem: a short length of chrome rail with an oil can dripping a glossy drop onto it, small icon, square |
| `art/relics/golden_ticket.png` | 256x256 | c | Golden Ticket | Golden Ticket relic emblem: a shining gold arcade ticket with a scalloped edge and a star punched in it, small icon, square |
| `art/relics/inkwell.png` | 256x256 | c | Bottomless Inkwell | Bottomless Inkwell relic emblem: a round glass inkwell full of deep blue ink with a quill, ink swirling like it has no bottom, small icon, square |
| `art/relics/heart_locket.png` | 256x256 | c | Heart Locket | Heart Locket relic emblem: an open heart-shaped gold locket on a chain, a tiny portrait silhouette inside, small icon, square |
| `art/relics/kettle_helm.png` | 256x256 | c | Kettle Helm | Kettle Helm relic emblem: a dented kettle used as a helmet, spout on the side, a wisp of steam, small icon, square |
| `art/relics/consolation_prize.png` | 256x256 | c | Consolation Prize | Consolation Prize relic emblem: a small sad teddy bear plush with a ribbon, trying its best, small icon, square |
| `art/relics/sore_loser.png` | 256x256 | c | Sore Loser | Sore Loser relic emblem: an angry red cartoon face with steam puffing from the ears, small icon, square |
| `art/relics/blood_bag.png` | 256x256 | c | Blood Bag | Blood Bag relic emblem: a medical blood bag with a red drop and a little heart on it, small icon, square |
| `art/relics/hot_coffee.png` | 256x256 | c | Hot Coffee | Hot Coffee relic emblem: a steaming mug of coffee with a claw machine logo shape on it (no text), small icon, square |
| `art/relics/wide_palm.png` | 256x256 | u | Wide Palm | Wide Palm relic emblem: an open hand with fingers spread wide, cyan motion lines, small icon, square |
| `art/relics/rubber_thimbles.png` | 256x256 | u | Rubber Thimbles | Rubber Thimbles relic emblem: three red rubber thimbles in a little row, small icon, square |
| `art/relics/protein_bar.png` | 256x256 | u | Protein Bar | Protein Bar relic emblem: a chunky protein bar in a wrapper with a flexing arm icon (no text), small icon, square |
| `art/relics/jackpot_bell.png` | 256x256 | u | Jackpot Bell | Jackpot Bell relic emblem: a shiny gold bell ringing, cartoon ding lines, a cherry charm, small icon, square |
| `art/relics/thorn_mail.png` | 256x256 | u | Thorn Mail | Thorn Mail relic emblem: a chainmail shirt with green cactus thorns poking out, small icon, square |
| `art/relics/venom_gland.png` | 256x256 | u | Venom Gland | Venom Gland relic emblem: a small green snake coiled around a dripping venom vial, small icon, square |
| `art/relics/flint_striker.png` | 256x256 | u | Flint Striker | Flint Striker relic emblem: a flint and steel striker throwing orange sparks, small icon, square |
| `art/relics/snow_globe.png` | 256x256 | u | Snow Globe | Snow Globe relic emblem: a snow globe with a tiny claw machine inside and swirling snow, small icon, square |
| `art/relics/trophy_rack.png` | 256x256 | u | Trophy Rack | Trophy Rack relic emblem: a wooden plaque with small monster horns and a gold trophy cup, small icon, square |
| `art/relics/egg_timer.png` | 256x256 | u | Egg Timer | Egg Timer relic emblem: an egg-shaped kitchen timer with a dial, ringing, small icon, square |
| `art/relics/grudge_journal.png` | 256x256 | u | Grudge Journal | Grudge Journal relic emblem: a small black journal with a skull clasp and a red bookmark ribbon, small icon, square |
| `art/relics/recycling_bin.png` | 256x256 | u | Recycling Bin | Recycling Bin relic emblem: a small cyan recycling bin with a rock and a scrap of slag inside, small icon, square |
| `art/relics/potion_belt.png` | 256x256 | u | Potion Belt | Potion Belt relic emblem: a leather belt with three little potion vials in loops, small icon, square |
| `art/relics/fridge_magnet.png` | 256x256 | r | Fridge Magnet | Fridge Magnet relic emblem: a red horseshoe fridge magnet with a paperclip and nail stuck to it, cyan sparks, small icon, square |
| `art/relics/cracked_hourglass.png` | 256x256 | r | Cracked Hourglass | Cracked Hourglass relic emblem: a cracked hourglass with pink sand leaking out of the crack, small icon, square |
| `art/relics/big_knuckles.png` | 256x256 | r | Brass Knuckles | Brass Knuckles relic emblem: a set of chunky brass knuckles with a star glint, small icon, square |
| `art/relics/four_leaf_clover.png` | 256x256 | r | Four-Leaf Clover | Four-Leaf Clover relic emblem: a bright green four-leaf clover with a sparkle, small icon, square |
| `art/relics/vampire_dentures.png` | 256x256 | r | Vampire Dentures | Vampire Dentures relic emblem: a set of chattering false teeth with two vampire fangs, small icon, square |
| `art/relics/second_wind.png` | 256x256 | r | Second Wind | Second Wind relic emblem: a swirling cyan gust of wind with a small white feather, small icon, square |
| `art/relics/token_stack.png` | 256x256 | boss | Stack of Tokens | Stack of Tokens relic emblem: a tall stack of gold arcade tokens, slightly wobbly, one rock on top, small icon, square |
| `art/relics/third_hand.png` | 256x256 | boss | Third Hand | Third Hand relic emblem: a robotic chrome third arm ending in a claw prong, a bolt at the elbow, small icon, square |
| `art/relics/golden_crane.png` | 256x256 | boss | Golden Crane | Golden Crane relic emblem: a golden claw machine crane arm, solid gold, gleaming, small icon, square |
| `art/relics/cursed_quarter.png` | 256x256 | boss | Cursed Quarter | Cursed Quarter relic emblem: a tarnished quarter coin with a single glowing purple eye in the middle, small icon, square |
| `art/relics/friendship_bracelet.png` | 256x256 | event | Friendship Bracelet | Friendship Bracelet relic emblem: a woven friendship bracelet in pink, cyan and gold threads with a tiny plush charm, small icon, square |
| `art/relics/cursed_plush.png` | 256x256 | event | Cursed Plush | Cursed Plush relic emblem: a lumpy plush toy with button eyes and too many stitched eyes, whispering, small icon, square |
| `art/relics/contagion.png` | 256x256 | u | Contagion | Contagion relic emblem: a cartoon green germ blob with little arms reaching out to two smaller germs, lime glow, small icon, square |
| `art/relics/festering_jar.png` | 256x256 | r | Festering Jar | Festering Jar relic emblem: a cracked clay jar oozing thick toxic green sludge, bubbles popping at the lip, small icon, square |
| `art/relics/bellows.png` | 256x256 | u | Bellows | Bellows relic emblem: a pair of leather fireplace bellows puffing a stream of orange sparks, small icon, square |
| `art/relics/powder_keg.png` | 256x256 | r | Powder Keg | Powder Keg relic emblem: a small wooden gunpowder barrel with a lit fuse and a big orange boom starburst behind it, small icon, square |
| `art/relics/cold_snap.png` | 256x256 | u | Cold Snap | Cold Snap relic emblem: a pale blue icicle snapping in two with a burst of frost shards, small icon, square |
| `art/relics/permafrost_core.png` | 256x256 | r | Permafrost Core | Permafrost Core relic emblem: a glowing cyan diamond of ice inside a frosty ring, cracks of light, small icon, square |
| `art/relics/battering_ram.png` | 256x256 | u | Battering Ram | Battering Ram relic emblem: a log battering ram capped with an iron ram head, motion lines, small icon, square |
| `art/relics/castle_walls.png` | 256x256 | r | Castle Walls | Castle Walls relic emblem: a stubby stone castle wall with crenellations and a blue banner, rock solid, small icon, square |
| `art/relics/sweatband.png` | 256x256 | c | Sweatband | Sweatband relic emblem: a red and white terry sweatband with a drop of sweat, sporty, small icon, square |
| `art/relics/gym_membership.png` | 256x256 | r | Gym Membership | Gym Membership relic emblem: a chunky barbell with red weight plates and a small membership card tucked on it (no text), small icon, square |
| `art/relics/horseshoe.png` | 256x256 | c | Horseshoe | Horseshoe relic emblem: a silver horseshoe held up like a magnet, two small nails clinging to it, small icon, square |
| `art/relics/tuning_fork.png` | 256x256 | u | Tuning Fork | Tuning Fork relic emblem: a steel tuning fork ringing with cyan sound waves, small icon, square |
| `art/relics/dynamo.png` | 256x256 | r | Dynamo | Dynamo relic emblem: a chunky battery with copper coils and a crackling cyan spark, small icon, square |
| `art/relics/dumpster_lid.png` | 256x256 | c | Dumpster Lid | Dumpster Lid relic emblem: a dented green dumpster lid held up like a shield, a banana peel stuck on it, small icon, square |
| `art/relics/junkyard_king.png` | 256x256 | r | Junkyard King | Junkyard King relic emblem: a crown made of bent scrap metal, bottle caps and a bolt, proudly shiny, small icon, square |
| `art/relics/prize_counter.png` | 256x256 | c | Prize Counter | Prize Counter relic emblem: a red raffle ticket stub with a star, curling out of a little counter, small icon, square |
| `art/relics/winning_streak.png` | 256x256 | u | Winning Streak | Winning Streak relic emblem: a gold upward zigzag arrow with three stars along it, small icon, square |
| `art/relics/encore_machine.png` | 256x256 | r | Encore Machine | Encore Machine relic emblem: a mini slot machine showing three gold sevens (drawn as shapes, no text), confetti, small icon, square |
| `art/relics/marble_pouch.png` | 256x256 | c | Marble Pouch | Marble Pouch relic emblem: a small drawstring cloth pouch spilling colourful marbles, small icon, square |
| `art/relics/beehive.png` | 256x256 | u | Beehive | Beehive relic emblem: a round golden beehive with two cartoon bees buzzing out, small icon, square |
| `art/relics/pocket_dimension.png` | 256x256 | r | Pocket Dimension | Pocket Dimension relic emblem: a jeans pocket with a swirling purple and cyan portal inside it, tiny marbles orbiting, small icon, square |
| `art/relics/bottle_deposit.png` | 256x256 | c | Bottle Deposit | Bottle Deposit relic emblem: an empty green glass bottle with a gold coin popping out of its neck, small icon, square |
| `art/relics/sharp_shards.png` | 256x256 | u | Sharp Shards | Sharp Shards relic emblem: three jagged pale blue glass shards flying outward, bright glints, small icon, square |
| `art/relics/glass_cannon.png` | 256x256 | r | Glass Cannon | Glass Cannon relic emblem: a tiny cannon made entirely of clear glass, firing a glittering blast, small icon, square |
| `art/relics/bat_wing.png` | 256x256 | u | Bat Wing | Bat Wing relic emblem: a single dark purple bat wing with a small red droplet, small icon, square |
| `art/relics/feast_table.png` | 256x256 | r | Feast Table | Feast Table relic emblem: a roast drumstick on a small plate with a fork and knife crossed behind it, small icon, square |
| `art/relics/piggy_bank.png` | 256x256 | u | Piggy Bank | Piggy Bank relic emblem: a pink ceramic piggy bank with a gold coin dropping into its slot, small icon, square |
| `art/relics/money_bags.png` | 256x256 | r | Money Bags | Money Bags relic emblem: a bulging burlap money sack tied at the top with gold coins spilling out, small icon, square |
| `art/relics/crystal_focus.png` | 256x256 | c | Crystal Focus | Crystal Focus relic emblem: a small crystal ball on a brass stand with a lilac glow and a reflected second ball inside, small icon, square |
| `art/relics/wizard_hat.png` | 256x256 | u | Wizard Hat | Wizard Hat relic emblem: a tall floppy purple wizard hat with gold stars and a spark leaping off the tip, small icon, square |
| `art/relics/echo_chamber.png` | 256x256 | r | Echo Chamber | Echo Chamber relic emblem: a brass horn with lilac sound rings repeating out of it, each ring smaller, small icon, square |
| `art/relics/snake_eyes.png` | 256x256 | event | Snake Eyes | Snake Eyes relic emblem: two ivory dice both showing one pip, a little green snake curled around them, small icon, square |
| `art/relics/pity_timer.png` | 256x256 | c | Pity Timer | Pity Timer relic emblem: a brass hourglass with green sand and a tiny sympathetic frowny face on the glass, small icon, square |
| `art/relics/dealers_visor.png` | 256x256 | c | Dealer's Visor | Dealer's Visor relic emblem: a translucent green casino dealer's visor with a white band, small icon, square |
| `art/relics/lucky_ticket.png` | 256x256 | c | Lucky Ticket | Lucky Ticket relic emblem: a red envelope with a gold arcade ticket and a four-leaf clover peeking out, small icon, square |
| `art/relics/lucky_cat.png` | 256x256 | u | Lucky Cat | Lucky Cat relic emblem: a white maneki-neko beckoning cat raising one paw, holding a gold coin, small icon, square |
| `art/relics/wheel_of_fortune.png` | 256x256 | r | Wheel of Fortune | Wheel of Fortune relic emblem: a carnival prize wheel with four coloured wedges and a gold pointer, small icon, square |
| `art/relics/rabbits_foot.png` | 256x256 | r | Rabbit's Foot | Rabbit's Foot relic emblem: a fluffy white rabbit's foot keychain on a gold chain with a green clover charm, small icon, square |
| `art/relics/high_roller.png` | 256x256 | r | High Roller | High Roller relic emblem: a tall stack of pink and gold casino chips topped with a cut diamond, small icon, square |
| `art/relics/ticket_roll.png` | 256x256 | c | Ticket Roll | Ticket Roll relic emblem: a spool of pink arcade tickets unrolling in a curl, small icon, square |
| `art/relics/gacha_charm.png` | 256x256 | u | Gacha Charm | Gacha Charm relic emblem: a gold gacha capsule charm on a string, half open with rainbow light spilling out, small icon, square |
| `art/relics/heartburn.png` | 256x256 | u | Heartburn | Heartburn relic emblem: a red chili pepper with a small flame and a green bubble of poison at its tip, small icon, square |
| `art/relics/broken_mirror.png` | 256x256 | c | Broken Mirror | Broken Mirror relic emblem: a small round hand mirror with a spidery crack and a green clover reflected in it, small icon, square |
| `art/relics/blasting_cap.png` | 256x256 | u | Blasting Cap | Blasting Cap relic emblem: a red firework stick with a brass cap and a lit spark, small icon, square |
| `art/relics/lodestone.png` | 256x256 | u | Lodestone | Lodestone relic emblem: a dark grey magnetic stone with iron filings bristling toward one end and cyan field lines, small icon, square |
| `art/relics/sand_pail.png` | 256x256 | u | Sand Pail | Sand Pail relic emblem: a small cyan beach bucket overflowing with marbles, small icon, square |
| `art/relics/big_catch.png` | 256x256 | u | Big Catch | Big Catch relic emblem: a barbed harpoon tip hooked through a gold fish, small icon, square |

## Status icons

Flat glyphs, 128x128, square, transparent background. They are drawn at about 14 px inside the status pips and the enemy intent bubble, so use one bold shape, one or two colours, a thick outline and no detail.

| File | Gen size (px) | Status | Prompt |
| --- | --- | --- | --- |
| `art/status/block.png` | 128x128 | Block (buff) | flat game status icon glyph: a sturdy blue kite shield (#7fb2ff), one bold shape, thick outline, minimal detail, square |
| `art/status/str.png` | 128x128 | Strength (buff) | flat game status icon glyph: a flexing red arm with a bulging bicep (#ff5a4a), one bold shape, thick outline, minimal detail, square |
| `art/status/weak.png` | 128x128 | Weak (debuff) | flat game status icon glyph: a wilted drooping flower in lilac (#b08cff), one bold shape, thick outline, minimal detail, square |
| `art/status/vuln.png` | 128x128 | Vulnerable (debuff) | flat game status icon glyph: a cracked heart in orange (#ff8a2e), one bold shape, thick outline, minimal detail, square |
| `art/status/poison.png` | 128x128 | Poison (debuff) | flat game status icon glyph: a lime green skull on a dripping droplet (#a6ff5e), one bold shape, thick outline, minimal detail, square |
| `art/status/burn.png` | 128x128 | Burn (debuff) | flat game status icon glyph: a three-tongued orange flame (#ff8a2e), one bold shape, thick outline, minimal detail, square |
| `art/status/chill.png` | 128x128 | Chill (debuff) | flat game status icon glyph: a six-armed snowflake in pale blue (#9fd8ff), one bold shape, thick outline, minimal detail, square |
| `art/status/freeze.png` | 128x128 | Frozen (debuff) | flat game status icon glyph: a cyan ice cube with a frosty highlight (#2ee6d6), one bold shape, thick outline, minimal detail, square |
| `art/status/regen.png` | 128x128 | Regen (buff) | flat game status icon glyph: a green heart with a small plus sign (#6bd35e), one bold shape, thick outline, minimal detail, square |
| `art/status/thorns.png` | 128x128 | Thorns (buff) | flat game status icon glyph: a spiky thorny vine curl in olive green (#8fae3a), one bold shape, thick outline, minimal detail, square |
| `art/status/dodge.png` | 128x128 | Dodge (buff) | flat game status icon glyph: a pale grey swoosh of motion lines (#e6ebf0), one bold shape, thick outline, minimal detail, square |
| `art/status/bleed.png` | 128x128 | Bleed (debuff) | flat game status icon glyph: a single red blood drop (#ff2e4a), one bold shape, thick outline, minimal detail, square |
| `art/status/stun.png` | 128x128 | Stunned (debuff) | flat game status icon glyph: three spinning yellow stars in a circle (#ffe066), one bold shape, thick outline, minimal detail, square |
| `art/status/grease.png` | 128x128 | Greased (debuff) | flat game status icon glyph: a golden oil drop with a slippery shine (#c8a040), one bold shape, thick outline, minimal detail, square |
| `art/status/fog.png` | 128x128 | Fogged (debuff) | flat game status icon glyph: a soft grey cloud with wavy lines (#a0a8b8), one bold shape, thick outline, minimal detail, square |
| `art/status/shield_up.png` | 128x128 | Bulwark (buff) | flat game status icon glyph: a blue shield with a padlock on it (#7fb2ff), one bold shape, thick outline, minimal detail, square |
| `art/status/enrage.png` | 128x128 | Enrage (buff) | flat game status icon glyph: an angry red face with a vein mark (#ff2e4a), one bold shape, thick outline, minimal detail, square |
| `art/status/armor.png` | 128x128 | Armor (buff) | flat game status icon glyph: a steel bolt and nut (#aab3bd), one bold shape, thick outline, minimal detail, square |
| `art/status/streak.png` | 128x128 | Streak (buff) | flat game status icon glyph: a gold bullseye target with a small arrow in the centre (#ffc94d), one bold shape, thick outline, minimal detail, square |
| `art/status/luck.png` | 128x128 | Luck (buff) | flat game status icon glyph: a bright green four-leaf clover (#3ddc84), one bold shape, thick outline, minimal detail, square |

## Map hex tile icons

256x256, square, transparent background. The game draws the coloured hex tile and puts this icon in the middle at about 40 px, so the icon must read at that size.

| File | Gen size (px) | Tile type | Prompt |
| --- | --- | --- | --- |
| `art/hex/empty.png` | 256x256 | empty | map tile icon: a few scattered floor tiles and a tiny dust puff, deliberately quiet, simple bold icon, square |
| `art/hex/fight.png` | 256x256 | fight | map tile icon: two crossed swords, steel blades and brown grips, simple bold icon, square |
| `art/hex/elite.png` | 256x256 | elite | map tile icon: a bone skull wearing a small gold crown, simple bold icon, square |
| `art/hex/treasure.png` | 256x256 | treasure | map tile icon: a small closed wooden treasure chest with a gold lock, simple bold icon, square |
| `art/hex/gem.png` | 256x256 | gem | map tile icon: a big cyan cut gem with facet highlights, simple bold icon, square |
| `art/hex/ink.png` | 256x256 | ink (bulb box) | map tile icon: a small open wooden crate holding three glowing gold light bulbs, warm glow, simple bold icon, square |
| `art/hex/brush.png` | 256x256 | brush (tool) | map tile icon: a hanging paper lantern glowing warm gold on a short hook, simple bold icon, square |
| `art/hex/event.png` | 256x256 | event | map tile icon: a big purple question mark made of neon tube, simple bold icon, square |
| `art/hex/shop.png` | 256x256 | shop | map tile icon: a small striped awning market stall with a gold coin sign (no text), simple bold icon, square |
| `art/hex/rest.png` | 256x256 | rest | map tile icon: a cosy campfire with two logs and a curl of smoke, simple bold icon, square |
| `art/hex/boss.png` | 256x256 | boss | map tile icon: a menacing claw machine claw with glowing pink eyes on the palm, simple bold icon, square |
| `art/hex/start.png` | 256x256 | start | map tile icon: a small green flag on a short pole planted in the ground, simple bold icon, square |
| `art/hex/forge.png` | 256x256 | forge | map tile icon: a dark iron anvil with a hammer resting on it and a spark, simple bold icon, square |

## Arena backgrounds

1080x540, landscape (2:1), full frame. Drawn full width across the top half of the stage, where the enemies stand. **The stage floor line sits at 92% of the image height** (y = 497 of 540); the band below it is the lip of the stage. Enemies stand in the middle third of the width, from about 25% to 90% of the height, so keep that area calm and darker, with detail pushed to the left and right thirds and the top. The top row of pixels is stretched upward to fill behind the HUD, so keep the top edge a plain colour.

| File | Gen size (px) | Act | Prompt |
| --- | --- | --- | --- |
| `art/bg/act1.png` | 1080x540 | 1: The Damp Arcade | The Damp Arcade, basement level where the prizes rust: a dark purple arcade basement, rows of dead claw machine cabinets on the left and right, one flickering hot pink neon sign high on the wall (no readable letters), cobwebs in the top corners, a hanging bulb, drips and damp stains, a worn stage floor with a pink neon edge, landscape game backdrop, stage floor line at 92% of the height, the centre left empty for monsters, full-bleed scene |
| `art/bg/act2.png` | 1080x540 | 2: The Clockwork Foundry | The Clockwork Foundry, the mezzanine where the prizes are made: a warm rust-red foundry, big brass gears turning on the left and right walls, hanging chains, molten orange glow from below, a lava channel under the stage floor edge, prize token moulds on shelves, landscape game backdrop, stage floor line at 92% of the height, the centre left empty for monsters, full-bleed scene |
| `art/bg/act3.png` | 1080x540 | 3: The Frozen Penthouse | The Frozen Penthouse, top floor where the prizes are kept forever: a cold navy blue penthouse vault, frosted glass display pillars, prizes hanging from strings like ornaments (a star, a heart, a gem, a coin), icicles along the ceiling, drifting snow, an icy stage floor with a cyan edge, landscape game backdrop, stage floor line at 92% of the height, the centre left empty for monsters, full-bleed scene |

## Map backgrounds

1080x1920, portrait (9:16), full frame, cover-fitted behind the hex map. The hex tiles sit on top across the middle, so this is a texture, not a scene: low contrast, dark, no focal point, no characters.

| File | Gen size (px) | Act | Prompt |
| --- | --- | --- | --- |
| `art/bg/map1.png` | 1080x1920 | 1: The Damp Arcade | an old dark parchment map texture stained with deep purple ink washes (#12091f), faint lime ink doodles of arcade machines in the margins, water stains, a brushed border, portrait, low contrast, seamless feel, no focal point, full-bleed |
| `art/bg/map2.png` | 1080x1920 | 2: The Clockwork Foundry | a scorched rust-brown parchment texture with sooty ink washes, faint gold ink gear doodles and blueprint lines in the margins, burnt edges, portrait, low contrast, seamless feel, no focal point, full-bleed |
| `art/bg/map3.png` | 1080x1920 | 3: The Frozen Penthouse | a cold navy blue parchment texture with frosty ink washes, faint cyan ink snowflake and crystal doodles in the margins, frost creeping in from the corners, portrait, low contrast, seamless feel, no focal point, full-bleed |

## Title screen and logo

The title picture replaces the whole drawn title scene (1080x1920, portrait 9:16, full frame, cover-fitted). The logo is drawn on top of it, centred at half the screen height, so keep the band from 40% to 60% of the height calm. The menu buttons sit over the bottom third. The logo file is a separate transparent PNG, 1024x384 (8:3, horizontal), drawn up to 486 px wide.

| File | Gen size (px) | Aspect | Prompt |
| --- | --- | --- | --- |
| `art/title.png` | 1080x1920 | 9:16, portrait | Title scene: the Clawspire, a tall tower built from stacked glowing arcade cabinets narrowing upward into a night sky, windows lit in hot pink, cyan, gold and lime, a giant chrome claw machine claw descending on a cable from the top of the frame over the tower, tiny prizes (swords, potions, coins, plush toys) raining down, wet street reflections at the base, calm dark band across the middle for the logo, full-bleed portrait scene |
| `art/logo.png` | 1024x384 | 8:3, horizontal | Game logo: the single word CLAWSPIRE in heavy chunky capital letters, polished chrome top half and hot pink neon bottom half (#ff2e88) split by a bright horizontal highlight line, thick dark purple outline (#12091f), a soft pink neon glow halo, the letter A shaped a little like an arcade claw, isolated on a transparent background, the word fills the width. This is the one prompt where text is required: spell it exactly C-L-A-W-S-P-I-R-E. |

## Cabinet frame overlay

`art/cabinet.png` is drawn **over** the claw machine, on top of the items and the claw, so it must be a frame with a fully transparent window. It covers the whole 540x450 cabinet (a 30 px frame around the 480x390 interior). Generate at 1080x900 (6:5, horizontal).

- Transparent window in the 1080x900 image: **x 60 to 1020, y 60 to 840** (960x780 px, top-left corner at (60, 60)). In game units that is the 480x390 interior at (30, 30) inside the 540x450 frame.
- The prize chute is the right-most 128 px of the window (x 892 to 1020 in the image) with a divider wall rising from the floor to 60% of the window height. The game draws the chute, divider and rail itself, so leave the window completely clear.
- Anything outside the window (the frame itself) is opaque art.

| File | Gen size (px) | Aspect | Prompt |
| --- | --- | --- | --- |
| `art/cabinet.png` | 1080x900 | 6:5, horizontal | Front frame of an arcade claw machine cabinet seen straight on, a thick deep purple lacquered frame (#1d1233) with chrome corner brackets, a ring of chasing marquee light bulbs, a hot pink neon tube hugging the inner edge, a small marquee plate on the top band (no text), a coin slot and joystick plate hinted on the bottom band, the rectangular window from x 60 to 1020 and y 60 to 840 completely transparent, flat front view, no perspective |

## Claw parts

Chrome machine parts, transparent background, flat side view. The palm and carriage are fitted to their body width (the height follows your aspect ratio, centred on the body). The prong is fitted to its length from the hinge at the top to the tip at the bottom, and is used for every prong (left, right and the optional third one), rotated by the physics.

| File | Gen size (px) | Aspect, orientation | In game (px) | Prompt |
| --- | --- | --- | --- | --- |
| `art/claw/palm.png` | 256x128 | 4:1, horizontal | 56x14 | the palm hub of an arcade claw machine claw, a chunky chrome dome-topped block seen from the side, a cable eyelet on top, two hinge pins at the lower left and right corners where the prongs attach, one red indicator light, fills the width edge to edge |
| `art/claw/prong.png` | 128x256 | 1:4.6, vertical | 10x46 | one prong of an arcade claw machine claw, a chrome finger, hinge ring at the top edge, a gentle inward curve, a hooked tip pointing down at the bottom edge, fills the height edge to edge, tip down |
| `art/claw/carriage.png` | 256x128 | 3.29:1, horizontal | 46x14 | the rail carriage of an arcade claw machine, a chrome trolley block seen from the side with two dark wheels on top that ride a rail, a cable spool underneath, a small red light, fills the width edge to edge |

## UI icons

128x128, square, transparent background. Shown at 14 to 20 px next to the Gold and Bulbs counters in the top bar and on the tool buttons of the map header.

| File | Gen size (px) | Used for | Prompt |
| --- | --- | --- | --- |
| `art/ui/coin.png` | 128x128 | Gold counter | UI icon: a single gold arcade token coin with a star stamp, tilted slightly, bold and simple, square |
| `art/ui/ink.png` | 128x128 | Bulbs counter | UI icon: a single glowing gold light bulb with a short screw base, bold and simple, square |
| `art/ui/brush.png` | 128x128 | Tool buttons | UI icon: a small hanging paper lantern glowing warm gold, bold and simple, square |

## Event illustrations

768x512, landscape (3:2), full frame. Shown at the top of the event screen above the story text, cropped slightly to fit, so keep the subject in the middle 80%. If the file is missing the game shows the drawn creature instead.

| File | Gen size (px) | Event | Prompt |
| --- | --- | --- | --- |
| `art/events/out_of_order.png` | 768x512 | Out of Order | A broken claw machine in a dark aisle with a handwritten OUT OF ORDER sign taped to the glass (draw the sign as scribbles, no readable text), a prize mimic inside staring out with big eyes, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/wishing_well.png` | 768x512 | Wishing Well | A stone wishing fountain in a damp arcade, the basin full of glittering coins, a faint sad glow rising from the water, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/goblin_mechanic.png` | 768x512 | Goblin Mechanic | A goblin in greasy overalls grinning next to a toolbox, holding a big wrench upside down, offering to tune a claw rig, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/ink_squid.png` | 768x512 | The Ink Squid | A friendly squid wearing a glass fishbowl helmet waddling forward with tentacles open for a hug, ink splotches on the floor, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/lonely_anvil.png` | 768x512 | Lonely Anvil | A single anvil alone on a dark floor under a spotlight, humming with soft gold light, a hopeful mood, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/refund_shrine.png` | 768x512 | Customer Service Shrine | A little shrine counter with a service bell on it and a sign board (scribbles only, no readable text), incense smoke, candles, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/suspicious_chest.png` | 768x512 | Suspicious Chest | A treasure chest with bite marks on its own lid, one eye peeking from the gap, gold coins scattered as bait, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/ring_toss.png` | 768x512 | Ring Toss | A carnival ring toss booth with three rings and one bottle, a grinning goblin behind the counter, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/fortune_crane.png` | 768x512 | Fortune Crane | A tiny desktop claw machine full of rolled paper fortunes, one fortune unrolled on the floor with an arrow scribble pointing left, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/stuffed_adventurer.png` | 768x512 | Stuffed Adventurer | A plush knight toy with button eyes sitting on a shelf between other prizes, one button eye mid-blink, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/steam_vent.png` | 768x512 | Steam Vent | A warm floor vent hissing steam between cracked tiles, a pretzel-shaped curl of steam rising, cosy orange underglow, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/one_armed_bandit.png` | 768x512 | One-Armed Bandit | A slot machine whose lever is a real cartoon arm that is waving hello, reels showing cherries and a claw symbol, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/ghost_smith.png` | 768x512 | Ghost Blacksmith | A friendly ghost blacksmith with a hammer floating over an anvil, a small sign with a heart and a coin drawn on it, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/frozen_crane.png` | 768x512 | Frozen Crane | A claw machine frozen solid in a block of ice, something glittering deep inside, frost spreading across the floor, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/cursed_plushie.png` | 768x512 | Cursed Plushie | A plush toy with too many stitched eyes sitting politely in an arcade aisle, a soft purple glow around it, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/map_mole.png` | 768x512 | Map Mole | A mole in a trench coat holding it open to reveal ink bottles and paintbrushes hanging inside, sunglasses, shifty but polite, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/under_the_machine.png` | 768x512 | Under the Machine | The dark gap under a claw machine, something shiny wedged in the shadow, two glowing eyes behind it, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/goblin_toll.png` | 768x512 | Goblin Toll Booth | A goblin in a paper hat sitting in a cardboard toll booth with a striped barrier arm, a coin tray, deadpan expression, inside the haunted arcade tower, storybook scene, landscape, full-bleed |

## Seasonal events (round 7)

Claw-o-ween's own art. Every file is optional: the drawn art (`RENDER.sea`) is the fallback, and a costumed monster's PNG replaces the whole drawing, costume included (draw the costume in). Items use the per-item path (`art/items/id/<id>.png`) so they never replace the year-round art key they share. Same global style anchor as the rest of the book, plus "Halloween night, orange and violet".

| File | Gen size (px) | Aspect, orientation | In game (px) | Used by | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/items/id/candy_corn.png` | 512x512 | 1:1, square | 20x20 | candy_corn | a single piece of candy corn standing upright, white tip, orange middle, yellow base, glossy, chunky outline |
| `art/items/id/bag_candycorn.png` | 512x512 | 1:1, square | 28x28 | bag_candycorn | a small purple drawstring pouch with three pieces of candy corn peeking out of the top |
| `art/items/id/pumpkin_bomb.png` | 512x512 | 1:1, square | 30x30 | pumpkin_bomb | a round carved jack-o'-lantern with a short sparking fuse coming out of its stem, dark carved eyes and grin, orange and green |
| `art/items/id/cursed_lollipop.png` | 512x180 | 2.86:1, horizontal | 40x14 | cursed_lollipop | a lollipop lying flat, white stick on the left, a round purple swirl candy on the right with a tiny skull face in the swirl |
| `art/items/id/haunted_teddy.png` | 424x512 | 1:1.21, vertical | 28x34 | haunted_teddy | a worn brown teddy bear sitting upright, one glowing green button eye, one stitched X eye, a zigzag stitched mouth, faint ghostly glow |
| `art/items/id/witch_broom.png` | 512x92 | 5.6:1, horizontal | 56x10 | witch_broom | a witch's broom lying flat, crooked wooden handle on the left, a bushy straw bundle tied with a purple band on the right |
| `art/items/id/skull_candle.png` | 480x512 | 1:1.07, square | 28x30 | skull_candle | a cartoon skull facing the viewer with a white candle stuck on top, wax dripping down the skull, a small orange flame |
| `art/enemies/rat_vamp.png` | 512x288 | 1.77:1, horizontal | 66x37 | rat_vamp | a coin rat in a vampire cape with a high spiky collar and red lining, little fangs, facing left, feet on the bottom edge |
| `art/enemies/slime_ghost.png` | 512x400 | 1.28:1, horizontal | 64x50 | slime_ghost | a green slime hiding under a white bedsheet ghost costume with two cut-out eye holes, the hem rippling on the floor, facing left |
| `art/enemies/goblin_witch.png` | 400x512 | 1:1.28, vertical | 62x80 | goblin_witch | a green goblin in a pointed witch hat with an orange band, holding a straw broom, grinning, facing left, feet on the bottom edge |
| `art/enemies/pumpking.png` | 400x512 | 1:1.28, vertical | 133x173 | pumpking | the Pumpkin King: a crowned glowing jack-o'-lantern head on a big ribbed pumpkin body, curling green vine arms with leaf hands, a leafy collar, facing left, menacing but fun |
| `art/hex/treat.png` | 512x512 | 1:1, square | 60x60 | the trick-or-treat tile | map icon: a carved jack-o'-lantern candy pail with a wire handle, sweets peeking over the rim, glowing from inside |

## Mama Mech and two new claws (round 8)

Mama Mech's own art (DESIGN.md "Mama Mech and two new claws (round 8)"). Every file is optional: the drawn art is the fallback (`RENDER.cr8`, her items' silhouettes and her portrait). Her kit is workshop metal: scuffed steel and brass, safety orange (#ff8a2e) and hazard yellow (#ffc94d) paint, a little teal electric glow (#2ee6d6) on the fancy pieces. The Vacuum Nozzle, the Twin Claws and her turret are drawn in code and take no files.

| File | Gen size (px) | Aspect, orientation | In game (px) | Used by | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/portraits/engineer.png` | 512x512 | 1:1, square | 96x96 | the Engineer | Mama Mech, The Engineer: a big-hearted mechanic grandma with a wide gap-toothed grin, dark curly hair tied up in a red polka-dot bandana, brass welding goggles pushed up on her forehead, a grease smudge on one cheek, denim overalls straps over an orange shirt, a tiny wrench earring, flat dark orange background (#3a1a08) |
| `art/items/id/hex_bolt.png` | 512x216 | 2.33:1, horizontal | 28x12 | hex_bolt | a steel hex bolt lying flat, the six-sided head on the left, the threaded shank pointing right, scuffed grey metal with a bright edge highlight |
| `art/items/id/tin_plate.png` | 512x160 | 3.2:1, horizontal | 32x10 | tin_plate | a flat rectangular tin plate lying flat, riveted at each corner, an orange hazard stripe along one edge, dented and scratched |
| `art/items/id/pipe_wrench.png` | 512x160 | 3.2:1, horizontal | 44x14 | pipe_wrench | a red-handled pipe wrench lying flat, the steel jaws on the right with a knurled adjuster wheel, the handle pointing left |
| `art/items/id/spring_coil.png` | 512x512 | 1:1, square | 24x24 | spring_coil | a chunky brass coil spring seen from the side, six shiny loops, slightly squashed as if about to boing |
| `art/items/id/oil_can.png` | 400x512 | 1:1.27, vertical | 22x28 | oil_can | a green oil can with a long thin brass spout curving up to the upper right, a thumb pump on top, a yellow drip label, a drop of oil at the spout tip |
| `art/items/id/rivet_gun.png` | 512x296 | 1.73:1, horizontal | 38x22 | rivet_gun | an orange pneumatic rivet gun lying on its side, the nozzle pointing right, a pistol grip underneath, a coiled air hose stub on the left |
| `art/items/id/toolbox.png` | 512x352 | 1.46:1, horizontal | 38x26 | toolbox | a red metal toolbox with a yellow handle on top, the lid slightly open with a wrench and screwdriver poking out |
| `art/items/id/tesla_coil.png` | 240x512 | 1:2.1, vertical | 20x42 | tesla_coil | a small tesla coil standing upright, a copper winding on a dark base, a teal glowing sphere on top with tiny purple sparks crackling around it |
| `art/items/id/mech_arm.png` | 512x160 | 3.25:1, horizontal | 52x16 | mech_arm | a robot arm lying flat, grey steel segments with an orange hydraulic piston, a three-finger gripper pointing right, cables along the top |
| `art/items/id/mech_core.png` | 512x512 | 1:1, square | 34x34 | mech_core | a round reactor core, a thick orange armoured ring with bolts around a glowing teal centre, hazard stripes on the rim, a faint glow |
| `art/items/id/thunder_bolt.png` | 512x211 | 2.43:1, horizontal | 34x14 | thunder_bolt | Thunder Bolt (evolved): the hex bolt charged with electricity, pale steel crackling with teal lightning (#7ff7ff) along the thread, a glowing head |
| `art/items/id/mech_plating.png` | 512x179 | 2.86:1, horizontal | 40x14 | mech_plating | Mech Plating (evolved): a thick hazard-yellow armour plate (#ffc94d) lying flat, riveted steel edges, black and yellow chevrons, a small orange glow |
| `art/relics/socket_set.png` | 256x256 | 1:1, square | 32x32 | Socket Set (event relic) | Socket Set relic emblem: an open red case of chrome sockets in a row with a ratchet handle across them, small icon, square |
| `art/relics/blueprints.png` | 256x256 | 1:1, square | 32x32 | Blueprints (rare relic) | Blueprints relic emblem: a rolled-up blue blueprint half open showing white line drawings of a little turret, small icon, square |
| `art/relics/armor_piercing.png` | 256x256 | 1:1, square | 32x32 | Armor-Piercing Rounds (uncommon relic) | Armor-Piercing Rounds relic emblem: three brass bullets with sharp steel tips standing in a row, a red target ring behind, small icon, square |
| `art/relics/grease_gun.png` | 256x256 | 1:1, square | 32x32 | Grease Gun (common relic) | Grease Gun relic emblem: a chunky hand grease gun with a green barrel and a black lever, a glob of grease at the nozzle, small icon, square |

## Stories, the rival and alternate bosses (round 8)

Every file is optional: the drawn art (`RENDER.sto`, the story vignettes of `RENDER.arcScene`) is the fallback. A story's illustration replaces its vignette on every beat of that story (the dice still roll over the text). Grabby Gary's drawing adds his gear as you keep beating him, across runs (shades, a chain, a jacket, a gold claw); a `gary.png` replaces all of it, so draw him in his rookie look. The Plushie Queen's plush and the Conveyor King's crate are junk in the bin; the Arctic Arcade's ice block is always drawn (it shows the prizes frozen inside). Same global style anchor as the rest of the book.

| File | Gen size (px) | Aspect, orientation | In game (px) | Used by | Prompt |
| --- | --- | --- | --- | --- | --- |
| `art/enemies/gary.png` | 336x512 | 1:1.52, vertical | 84x128 | gary (act 3 elite, the rival's showdown) | Grabby Gary: a smug teenage arcade champion in a backwards green cap, a green track jacket with a white stripe, navy jeans and green sneakers, one gold tooth in a cocky grin, holding up a small toy claw like a trophy. Full body, facing left, feet on the bottom edge. |
| `art/enemies/cardshark.png` | 440x512 | 1:1.16, vertical | 101x117 | cardshark (act 2 elite, hunts you after a cheat) | The Card Shark: an upright blue-grey shark in a green dealer's visor and a black waistcoat, a fan of playing cards in one fin, an ace tucked behind the gill, a sly toothy smile. Full body, facing left, feet on the bottom edge. |
| `art/enemies/plushqueen.png` | 744x768 | 1:1.03, square | 186x192 | plushqueen (act 1 alternate boss) | The Plushie Queen: a huge pink teddy bear on a purple velvet throne, a gold crown, a stitched heart on her belly, a lollipop sceptre, a bunny plush and a chick plush guarding her sides, cute and imperious. Full body, facing left, feet on the bottom edge. |
| `art/enemies/conveyorking.png` | 728x768 | 1:1.05, square | 179x189 | conveyorking (act 2 alternate boss) | The Conveyor King: a robot built from stacked cardboard shipping boxes with THIS WAY UP arrows, a screen face with cyan eyes, a crown of brass gears, one arm a parcel stamper, rolling on a caterpillar conveyor track with hazard stripes. Full body, facing left, feet on the bottom edge. |
| `art/enemies/arcticarcade.png` | 576x768 | 1:1.33, vertical | 154x205 | arcticarcade (act 3 alternate boss) | The Arctic Arcade: a whole arcade cabinet frozen inside a block of blue ice, still switched on, its screen a grinning face, icicle teeth hanging from the marquee, a joystick poking out, frost smoke curling around the base. Full body, facing left, feet on the bottom edge. |
| `art/events/sto_crab.png` | 768x512 | 3:2, landscape | 240x160 | The Caged Crab | An orange crab with big eyestalks peering out of a small prize cage with a warning sign (scribbles only, no readable text), sad hopeful eyes, crates stacked beside it, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_monte.png` | 768x512 | 3:2, landscape | 240x160 | Three-Card Monte | A goblin in a tiny vest shuffling three playing cards on an upturned crate, a small pile of coins as the pot, a shifty grin, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_seed.png` | 768x512 | 3:2, landscape | 240x160 | The Coin Seed | A gumball machine full of golden seeds beside a coin fountain, one seed glowing with a clover mark, a hint of a coin tree sprouting in the background, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_intern.png` | 768x512 | 3:2, landscape | 240x160 | The Nervous Intern | A young tinkerer in a staff lanyard crying into a clipboard in front of a locked boss cabinet with a keypad, sweat drops, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_dance.png` | 768x512 | 3:2, landscape | 240x160 | Dance-Off | A raccoon in a sweatband striking a pose on a glowing dance machine with arrow pads, disco light beams, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_egg.png` | 768x512 | 3:2, landscape | 240x160 | The Warm Egg | A prize bin full of yellow rubber ducks with one real speckled egg in the middle, softly glowing warm, a tiny crack on top, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_booth.png` | 768x512 | 3:2, landscape | 240x160 | The Photo Booth | An old photo booth with its curtain half open, a flash going off inside, a photo strip sliding out showing a smiling ghost, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_vendy.png` | 768x512 | 3:2, landscape | 240x160 | The Runaway Vending Machine | A worried vending machine with stubby legs running down an arcade aisle, snacks rattling inside, its screen showing a pleading face (no readable text), inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/events/sto_oracle.png` | 768x512 | 3:2, landscape | 240x160 | The Magpie Oracle | A magpie in a tiny purple turban perched on a glowing crystal ball, shiny trinkets scattered around it, mystic fortune teller mood, inside the haunted arcade tower, storybook scene, landscape, full-bleed |
| `art/hex/rival.png` | 256x256 | 1:1, square | 36x36 | the rival tile (Grabby Gary) | map tile icon: a green backwards baseball cap with a gold G on it and a small toy claw beside it, simple bold icon, square |
| `art/items/id/sto_plush.png` | 512x512 | 1:1, square | 38x38 | sto_plush (the Plushie Queen's plush) | a small round pink teddy bear plush sitting upright, button eyes, a tiny gold paper crown, soft and squishy |
| `art/items/id/sto_crate.png` | 512x360 | 1.42:1, horizontal | 46x32 | sto_crate (the Conveyor King's crate) | a small cardboard shipping crate taped shut, a black arrow printed on the side, a hazard stripe label, slightly dented |

---

310 prompts in total. Sizes in this book come from `ART.paths()` in `js/art.js`; if an item or enemy changes size in `js/data.js`, the in-game size changes with it and the game still fits whatever PNG is there.
