# Champion (Super Knight) — DEATH animation

Upload the dying animation here as **one PNG per frame**:

    champion_death_0.png, champion_death_1.png, …      (zero-based)
    — or —
    champion_death_01.png, champion_death_02.png, …    (one-based, like your trap uploads)

Any frame count up to 16. Conventions match the walk/attack art: right-facing,
transparent background, shared foot baseline, ~500 px tall (draws at ~92 world
px — tunable via CHAMP_DEATH_DH). The engine plays the animation ONCE at the
moment of death (~140 ms per frame) and holds the final frame as the corpse.
While these files are missing, champions use the generic fallen-hero drawing.
