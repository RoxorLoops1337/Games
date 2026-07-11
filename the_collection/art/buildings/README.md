# Town map building art (owner uploads)

Drop a painted facade here and the town map uses it automatically in
place of the drawn building — no code changes needed.

- **Naming**: `<key>.png` where key is one of `home`, `kiosk`, `school`,
  `market` (the four town buildings).
- **Shape**: a front-on facade with a **transparent background**. The
  sprite is anchored bottom-centre on the building's ground line and
  scaled to the footprint width, so include the yard/props you want but
  keep the building itself centred. ~500–900px wide looks good.
- Missing files fall back to the procedural facade — never breaks the map.
- Per-building scale nudges live in `BUILDING_ART_SCALE` in index.html
  (yards/props overhang the core building, so each is sized a little
  wider than its footprint).

Day/night variants: only the day art is wired up today. Night variants
can drive the map's day/night cycle in a later pass.
