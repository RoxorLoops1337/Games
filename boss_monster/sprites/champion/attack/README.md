# Champion knight — ATTACK animation

The Super Knight's **attack** animation (he's the powered-up hero mini-boss).
This is the swing he plays when he's hammering a monster guard or the boss's
throne. The walk animation lives one folder up (`sprites/champion/`).

Upload via GitHub's **Add file → Upload files** (not as a chat image) so
transparency is preserved. Export **without** a baked shadow — the engine draws
its own. Heroes face/march rightward, so the **right-facing** swing is what gets
used.

Drop the frames in **this** folder. Any filenames are fine — I'll normalise them
(e.g. to `champion_attack_0.png … champion_attack_N.png`). To save me guessing,
note:
- frame size (e.g. 64×64 or 192×192) and grid (cols × rows), or one PNG per frame
- which rows are which facing (up / left / down / right) if it's a multi-row sheet
- attack frame count + FPS
- where in the cycle the "hit" lands (which frame is the contact/impact frame)

Keep the **same footing** as the walk frames (feet at the same baseline across
every frame) and the **same overall scale** so he doesn't jump in size or jitter
when he switches from walking to swinging. He should read clearly BIGGER than a
normal hero.

Once these are in, I'll wire the attack animation into `drawChampion` so the
Super Knight swings instead of sliding his walk pose while fighting.
