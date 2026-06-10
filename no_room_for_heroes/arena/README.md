# Arena (main game) backdrop

Drop the painted backdrop here as **`no_room_for_heroes/arena/bg.png`** and it
replaces the flat gradient sky behind the dungeon during play.

- Upload via GitHub's **Add file → Upload files** (chat images can't be saved
  at full quality). Any wide panorama works; the in-game art is ~2.9:1
  (e.g. 2000×690), laid out **green valley on the left → storm-lit castle/throne
  on the right**, matching the game's entrance→boss direction.
- It's **cover-fit to the screen height** and **pans toward the throne** as the
  camera moves from the entrance to the boss, so the left/right journey of the
  art tracks the dungeon.
- The dungeon floor, rooms, traps, heroes and boss draw on top.
- **Optional / safe:** while this file is missing, the game uses the built-in
  gradient sky, so nothing breaks. Uploading the art just lights it up.

Tunable in `draw()` (`index.html`, the `ARENA_BG` block): the pan amount and
whether smoothing is on. Tell the next dev if you want more/less parallax.
