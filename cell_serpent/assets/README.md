# Cell Serpent art

Every file here is an optional transparent PNG. Replace a file with the same name to
swap the art; delete one and the game draws a plain stand-in. No code changes needed.
The list lives in `art.js` (`ART_KEYS`).

Snake sprites face RIGHT (toward the snake's head). Everything else is drawn upright.

| File | What | Notes |
|---|---|---|
| `duo_idle`, `duo_sing` | The player (RoxorLoops & Jasmin) | idle, and the pose while firing |
| `snake_<skin>_head` | Snake head | skins: `pink`, `pinkelite` (boss), `purple`, `purpleboss` (boss) |
| `snake_<skin>_body` | One body segment | drawn stretched along the snake and overlapped; keep it a slice that tiles |
| `min_golem`, `min_mine`, `min_plant` | Armored, bomb and spitter segments | replace the body sprite for those segments |
| `min_green/red/yellow/jelly/eye/robot`, `mon_bat`, `mon_ghost` | Swarm minions | unlock by stage, see `MINIONS` in `sim.js` |
| `mon_*` (others) | Spare monsters, title screen decoration | `slime`, `bat`, `skeleton`, `ghost` appear on the title |
| `icon_coin`, `icon_crystal` | Coin and XP gem | |
| `icon_heal`, `icon_shield`, `icon_heartsword` | Heal, shield and rage drops | |
| `bullet`, `bullet_crit` | Player shots | not supplied, drawn in code; drop a PNG in to override |
| `bg` | Full-screen background | not supplied, drawn in code |
