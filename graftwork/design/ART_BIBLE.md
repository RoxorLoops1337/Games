# GRAFTWORK ART BIBLE: "THE ANATOMICAL PLATE" (council memo, art director)

Identity: a 19th century surgeon's atlas engraved in sepia ink on vellum. Base is monochrome engraved line; colour is SPOT colour only (hand-tinted wax, glass, gold leaf) where something matters. Stitched gauze patches and black thread are the textile layer, so grafts feel physically sewn on.

## Critique of the old look
Flat/linear-gradient fills with one 2.2px dark outline everywhere (generic vector cartoon). Motifs are icons on flat banners with no depth or light response; rare cards look like common ones. No unified light: cards and enemies have no key direction, rim or contact shadow. Particles are glow dots for every school. School colours are saturated and equal in value, so they fight. Georgia+Trebuchet has no identity.

## Rules
- Line: contour 2.5px at 1x tapered as two offset strokes (3px and 1.2px, 1.5px offset). Interior detail 1px. Outlines are warm sepia, never pure black. Pure black (#0E0E0E) is reserved for THREAD (1.8px, always dashed or stitched).
- Shading: HATCHING not gradients. Cached 8px diagonal hatch tile at 3 densities, clipped to the shadow side of each shape and multiplied. Cross-hatch only in deep shadow. Gradients only for glass and glow.
- Materials: Vellum #E8DCC4 + fibre noise 6% + edge foxing. Brass #C9A227 body / #7A5F12 shade / #FFF1B0 specular, 4-stop stepped banding. Glass: alpha .18 fill, bright rim, one diagonal caustic streak, inner glow in school colour. Gauze: 3px weave tile at 12% alpha, frayed edges. Wax: opaque spot colour with soft inner highlight. Gold leaf #F5E6A8 to #C9A227 with cracked-flake noise, only rare and gilded.
- Light model: ONE key lamp on a slow pendulum (+/-12 degrees, 6 s period) from upper left. EVERY asset takes light direction L from the same function (export it from one module). Coloured practicals (school glow, fire, static) are small additive sources. Rim light = 1.5px light stroke on the lit side. Contact shadow = flattened ellipse alpha .45 with blurred core. Fake AO = dark multiply gradient in creases. Fog = low-contrast haze on the bottom third.
- Type: names in engraved high-contrast serif look (Georgia bold, 0.5px letter spacing, 1px debossed shadow). Numbers tabular small caps, inked. Small UI condensed uppercase with 8% tracking. Rules text stays plain and readable.
- Palette per act (ground / ink / accent / glow): Act1 Ward #E8DCC4 / #2B1E1A / #B3263A / #F2C14E. Act2 Market #D4C9A8 / #1F2A2B / #3E7C74 / #7FD1E0. Act3 Theatre #BFB3A4 / #171018 / #6B3FA0 / #E85D75. Slab (dark UI) #1A1614.
- Revised school colours (keep value within 10% lightness, distinct hue): Ember #E8571F, Echo #6CC6D6, Hoard #B8922A, Blood #A3142F, Rust #8F4A2A, Static #D9E84A, Gilded #EFD98F. Keep the SHAPE glyphs (colourblind contract) at full contrast.

## Upgrade plan (cache static layers; only live layers per frame)
Cards: bake vellum fibre texture once as a pattern (multiply). 2px bevel driven by L (light top/left, dark bottom/right). Illustration clipped with hatch shading on the shadow side + 1.5px inner shadow ring; 3-layer parallax (back wash, motif, foreground sprinkles) shifted by hover tilt*(2,5,9)px. Embossed stitches (dark thread + 1px light offset). RARE FOIL: art drawn offscreen then a moving diagonal gradient band with 'color-dodge' or 'overlay' clipped to the art, shifted by t and tilt, plus 1px gold frame sparkle. Edge light sweep every 4 s on uncommon and above. Card back: stitched suture cross over a vellum wound, brass corner staples, slow pulse.
Enemies: rim light (silhouette drawn again offset (-1.5,-1.5) in lit colour, 'lighter' alpha .5, clipped to main fill). Thickness: darker copy offset (3,4) behind. Wet specular: 2 to 3 small white ellipses sliding with lamp angle. Idle: breathing scale 1+0.015 sin, secondary motion lag phase 0.4 on dangly parts. Floor shadow: skewed blurred silhouette (scaleY .25, skew by L). Silhouette outline 2.5px sepia, thicker on elites, gold on bosses. Hero: same plus warm lamp wash on the face.
Backgrounds: 4 layers (far wall parallax .2, mid props .5, floor 1.0, foreground blur 1.4). Light shafts: 3 to 5 additive trapezoids with gradient falloff swinging with the key lamp + dust motes crossing them. Reflections: flipped floor props alpha .12.
UI chrome: panels = brass-framed slab, riveted corners, inner inset shadow. Buttons: 2px press travel, lit top edge. HP = glass vial with liquid wobble and meniscus. Energy = brass dial. Block = riveted plates. Icons unified to engraved look: 1px hatch, tinted spot colour, 1px highlight.

## AAA effects (intensity guide; ONE dominant effect per moment, never stack more than two)
Bloom threshold .8 strength .35 on lamps/foil/glow only, never on text. God rays combat only alpha .08 to .14 additive. Depth of field strong on map transitions and reward backgrounds, none during combat. Chromatic aberration 2 to 3px for 120 ms on heavy hits and Overload shatter, constant 0.4px at screen edges. Heat distortion on fire only amplitude 2px localised. Colour grade per act (warm / teal / plum) subtle. Film grain 4 to 6% at 24 fps, off in reduced motion. Vignette .35 to .5, tighter during hit-stop. Shockwave radial refraction 0.6 s only kills and boss events. Practical light flicker +/-8% at 3 to 7 Hz. Additive particles cap 150. Glass refraction only on vials and potions (3px).

## School VFX identity
- Ember #E8571F: rising teardrops with heat shimmer, additive. Sound crackle+whoosh. Signature: the card ignites its own edge; kills leave wax-melt drips.
- Echo #6CC6D6: concentric ghost copies delayed 80 to 160 ms fading. Reverb tail. Signature: the played card duplicates as a translucent glass twin that replays.
- Hoard #B8922A: coin and bar glints, weighted gravity with bounce, dull clink. Signature: a coin stack rattles up the gauge then collapses into a burst.
- Blood #A3142F: wet splatter, droplets with dark core and sheen, thread drips, wet thud. Signature: a seam opens along the target, then stitches shut.
- Rust #8F4A2A: flaking slab shards, gritty dust, slow crumble, metal grind. Signature: enemy plates corrode with an orange bloom and flake away.
- Static #D9E84A: jagged branching bolts, 1 frame white flash, hard cuts, crackle. Signature: a chain arc jumps between enemies with a CA flash.
- Gilded #EFD98F: slow shimmering foil leaves and gold dust, soft glow drifting upward, bell chime. Signature: the card turns to gold leaf then a god-ray fan blooms.

## Cut or simplify
Cut the glow-dot particle and per-particle shadowBlur (use pre-baked glow sprites). Reduce motifs to a consistent engraved set, no gradients inside motifs. One heavy post effect per screen state; text and intent icons stay above all post passes. Lower UI saturation; school colour only for glyph and rim. No duplicate nested outlines on small icons.
