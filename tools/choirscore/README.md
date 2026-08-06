# choirscore — getting real repertoire into Adjudicator

`world_choir_games` needs one thing per piece: **a melody and its text**. The game
works out the harmony (`harmonise()`) and voices it into SATB (`voiceParts()`) itself.
So adding a piece is adding a tune — and the tune should come from an edition, not
from somebody's memory.

## Where the free scores are

| Source | What it has | Formats | Licence |
|---|---|---|---|
| **[CPDL / ChoralWiki](https://www.cpdl.org/)** | ~51,000 choral works, 5,000+ composers. The obvious first stop. | PDF, **MusicXML** (`.xml`, `.mxl`), MIDI, Finale, Sibelius, LilyPond, Capella | CPDL Copyright Licence (GPL-based) or Creative Commons — free to download, perform, modify and redistribute, with attribution |
| **[IMSLP](https://imslp.org/)** | Full scores and parts, heavy on the orchestral/large choral repertoire | PDF, some MIDI/MusicXML | Per-file; mostly public domain |
| **[Musopen](https://musopen.org/)** | Recordings and some sheet music | PDF, MIDI | Public domain |

A note on licensing: for the standards (Palestrina, Victoria, Bruckner, Pitoni) the
**composition** is long out of copyright, but the **typeset edition** you download
carries its own licence. This tool extracts pitches and syllables as data — it does not
redistribute anyone's engraving — but put the edition you used in the entry's `origin`
field anyway. It costs nothing and it is the polite thing to do.

## What choirs actually sing

INTERKULTUR publish their own count of the
[most performed songs at their competitions](https://www.interkultur.com/newsroom/world-of-voices/details/news/top-10-most-performed-songs-at-choir-competitions-and-events):
**Musica Sacra** and **Folklore** are the two biggest categories, and Latin settings —
*Ubi caritas*, *Cantate Domino* — come up again and again. All of the following are on
CPDL with MusicXML, and all are safely out of copyright:

- Palestrina — *Sicut cervus*
- Bruckner — *Locus iste*
- Victoria — *O magnum mysterium*, *Ave Maria*
- Pitoni — *Cantate Domino*
- Gregorian — *Ubi caritas* (the chant; Duruflé's and Gjeilo's settings are **not** free)
- Mozart — *Ave verum corpus*, K.618
- Bach — chorales from the Passions and cantatas
- Tallis — *If ye love me*
- Arcadelt — *Ave Maria*

Folklore is per-country and mostly traditional, so it is free by default.

## Using it

```sh
# what is in the file
node tools/choirscore/musicxml_to_piece.mjs sicut_cervus.musicxml --list

# convert the top line into a REPERTOIRE entry
node tools/choirscore/musicxml_to_piece.mjs sicut_cervus.musicxml \
  --id sicut --part P1 --bars 16 \
  --origin "Palestrina, Motettorum liber secundus (1581), CPDL #12345" \
  --moods sacred,calm
```

Paste the output into the `REPERTOIRE` array in `world_choir_games/index.html`.

`.mxl` is zipped MusicXML — `unzip score.mxl` first and point the tool at the `.xml`
inside.

### Options

| Flag | Does |
|---|---|
| `--list` | print the parts in the file and stop |
| `--id` | the entry's id (required in practice — it defaults to `piece`) |
| `--part P1` | which part to read; default is the first |
| `--voice 1` | which voice, when two parts share a staff |
| `--bars N` | trim to N whole bars, so an excerpt ends where a phrase does |
| `--meter 3\|4` | force a meter the game can play |
| `--transpose N` | shift by N semitones |
| `--tempo N` | override the tempo mark |
| `--title` `--composer` `--origin` `--moods` | fill in the entry's header |

`moods` decides which competition categories draw the piece: `hymn`, `sacred`,
`gospel`, `jazz`, `folk`, `bright`, `calm`, `jubilant`, `low`.

## It refuses rather than guesses

The converter will not emit an entry that the game's own test suite would reject.
It stops with `PROBLEM:` and a non-zero exit when:

- the line does not fit a soprano (60–79) even after octave shifting
- the notes do not add up to whole bars, allowing for the pickup
- the time signature is not 3/4 or 4/4 and you have not forced one

and warns (but proceeds) about notes outside the key, missing lyrics, absorbed rests
and octave shifts it applied. Chord notes are dropped, tied notes are merged into one,
and a rest lengthens the note before it — the game has no rests.

## Why this exists

Two of the first seven melodies in the game were wrong, both written from memory:
the Ode to Joy came out in whole tones (F♯–G♯–A♯ instead of F♯–G–A) and Greensleeves
was an octave below anything a soprano can sing. Both were caught by tests, but only
after they had been committed. Importing from an edition removes the whole class of
mistake.

Tests: `npm run test:choirimport`.
