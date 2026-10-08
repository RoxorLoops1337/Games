# Awesome Farm

Co-op island farming for up to 16 friends. Everyone starts on a far-apart island: harvest,
build and buy land until your islands connect, then grow one big farm together. Automate it
with drills, belts and power, befriend creatures that work for you, and take on six bosses.
Dig down a mine shaft into caves as big as the world, label your chests so everything has a home,
wall in a floor to keep the night out, and dare the four haunted Dread Reaches and their wardens.
Fall and you wake at home, but your backpack waits where you went down.

```bash
npm install
npm run dev            # play solo at http://localhost:8080
npm run server         # a local farm server at :7777 — join it from the title screen
npm run server:build   # package a standalone server into server-dist/ (see its README.txt)
npm run check          # typecheck, tests and a production build
```

**Play:** https://games-71g.pages.dev/awesome_farm/ (solo works at once; a friend's server link fills in the Join box).

**Always-on world on Cloudflare (free):** see [server/cf/README.md](server/cf/README.md).

**Hosting for friends:** copy `server-dist/` to any PC or server with Node.js 18+ and run
`start.bat` (Windows) or `./start.sh`. Friends open the address it prints. Over the
internet, `cloudflared tunnel --url http://localhost:7777` gives you a free shareable link.
Friends pick a name and a secret word on the title screen; the same two on any device bring back the same farmer (stored on the server as a salted hash).
Worlds are saved in `worlds/` next to the server; an old save the server cannot read is set
aside, never overwritten.

**Controls**

| Key | Does |
|---|---|
| WASD / arrows | move (on AZERTY: ZQSD, the same key positions) |
| Space / hold mouse | harvest and fight |
| Shift | dash (Combat skill) |
| E | use buildings, buy land, hold to revive a friend |
| hold X | take down what you point at |
| Q | fish (facing open water, with a rod) |
| T | throw a taming pod at a wild creature |
| F | eat |
| I (or Tab) · C · K · B | backpack · crafting · skill tree · build |
| V · L | blueprints · Factory view |
| P · J · H | creatures · journal · how-to-play guide |
| 1–8 · wheel | hotbar |
| R | when you are down: wake up at home now |
| / | search, in a window that has a search box |
| G then 1–8 | emotes · Enter chats · middle-click pings |
| M / Esc | map and menu |
| + / − · Ctrl+wheel | zoom |
| F2 | photo mode (hides the HUD) |

Any keyboard layout works: movement and the fishing key (Q position) follow the key positions, the
hints name the keys you have (Auto-detected, or set under Menu > Settings > Keyboard), and the number
row works without Shift on AZERTY. On touch screens there is an on-screen stick and buttons.

Built with Phaser 4, TypeScript and Vite. All art and sound are generated in code (no asset
files). See [DESIGN.md](DESIGN.md) for the systems and where it could go next, and
[CLAUDE.md](CLAUDE.md) for the codebase and how to add content.
