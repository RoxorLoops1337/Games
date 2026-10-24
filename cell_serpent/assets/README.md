# Cell Serpent art

Only the player art is a picture: `duo_idle.png` and `duo_sing.png` are RoxorLoops and
Jasmin, baked from the Hocus Vocus chibi kit (`ART.rj.draw('roxor' / 'jasmin')`, poses
`idle` and `sing`). Replace them with any transparent PNG, feet at the bottom edge.

Everything else is drawn in code by `../art_draw.js` in the same "chibi candy" look (warm
brown outline, one cel shadow, one gloss band, big flat-cel eyes): the five virus skins and
their boss versions, armored / bomb / spitter / gold segments, the eight swarm minions, the
pickups and chest, the skill sprites, the music-note shots and the acid glob. Sprites are
baked once and cached.
