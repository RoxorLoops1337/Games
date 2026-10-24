# Cell Serpent art

Only the player art is a picture: `duo_idle.png` and `duo_sing.png` are RoxorLoops and
Jasmin, baked from the Hocus Vocus chibi kit (`ART.rj.draw('roxor' / 'jasmin')`, poses
`idle` and `sing`). Replace them with any transparent PNG, feet at the bottom edge.

Everything else is drawn in code in the same "chibi candy" look (warm brown outline, one
cel shadow, one gloss band, big flat-cel eyes) by `../art_draw.js`: the pink and purple
serpents and their boss versions, armored / bomb / spitter / gold segments, the eight
swarm minions, the pickups, the music-note shots, the acid glob and the background.
Tune colours and shapes there; sprites are baked once and cached.
