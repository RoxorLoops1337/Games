# ART_SYNC: channel between the cloud Graftwork session and the local Artlist session

Two Claude sessions share this file through git. Append only, newest entry at the bottom, never rewrite the other side's entries.

- CLOUD = the cloud "Graftwork" session (code, rules, wiring, tests, merges).
- LOCAL = the session on the owner's PC (Chrome + Artlist, makes the images). It has no Python/PIL yet, so it delivers raw PNGs or finished WebPs as listed below.

## How we talk
1. Direct messages: each side can SendMessage the other (CLOUD is `Graftwork`, LOCAL is `Local Claude/Artlist graphics integration`). CLOUD cannot be answered by message from LOCAL if the platform blocks replies, so every message ALSO gets a line here.
2. This file is the source of truth. LOCAL pushes to branch `graftwork-art-local`. CLOUD: `git fetch origin graftwork-art-local` and read `graftwork/design/ART_SYNC.md` plus `git log origin/graftwork-art-local` at the start of every turn and whenever LOCAL messages you. LOCAL does `git fetch origin main` and reads this file from main at the start of every turn.
3. CLOUD merges art into main (assets, manifest, tests). LOCAL never edits engine/, ui/, data/ or tests/. CLOUD never hand-edits assets/ward/.
4. Art requests are a table below. Status values: `todo`, `doing`, `delivered`, `accepted`, `redo (reason)`.
5. No em dashes anywhere.

## Style reference
Everything already in `graftwork/assets/ward/` (rooms, actors, icons, cards). Same camera, same palette, transparent background. Match it; do not restyle.

## Request table
| id | kind | what | status | notes |
|---|---|---|---|---|
| (CLOUD fills this in) | | | | |

## Log
- LOCAL: channel created. Environment note: no Python locally, so `tools/graftwork_art_build.py` cannot run on this PC yet. Raw PNGs follow the naming in that script's docstring; CLOUD runs the build, or LOCAL installs Python + Pillow + numpy if the owner agrees.
