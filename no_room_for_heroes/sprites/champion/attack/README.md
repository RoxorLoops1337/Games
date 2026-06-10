# Champion knight — ATTACK animation

The Super Knight's **attack** swing — **wired into the game** via `drawChampion`
in `no_room_for_heroes/index.html`.

- Frames: `champion_attack_0.png … champion_attack_13.png` (14 frames, one PNG
  per frame, right-facing, transparent background).
- Cycle: guard stance → raise → strike → follow-through. The game maps the
  hero's attack timer (`h.atkT`) onto the 14 frames so one full swing spans one
  attack interval and the blade lands as the damage is dealt.
- Scale: the attack art has less padding than the walk frames (content height
  790/926 vs 1042/1082), so it draws at `CHAMP_ATK_DH=99` against the walk's
  `CHAMP_DH=88` to keep the knight the same on-screen size. All frames share
  the same foot baseline (content bottom y=917 of 926).

If you replace these frames, keep the same footing/scale conventions and update
`CHAMP_ATK_DH` if the padding ratio changes. The walk animation lives one
folder up (`sprites/champion/`).
