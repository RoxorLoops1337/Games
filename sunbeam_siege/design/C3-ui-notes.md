# C3 UI notes: ui-core, battle screen, deck viewer

Files: `src/ui/ui-core.js`, `src/ui/battle.js`, `src/ui/deck-viewer.js`, `src/styles/base.css`, `src/styles/battle.css`.
Test helpers: `src/ui/mock-battle.js`, `battle-demo.html` (`?engine=real` uses SB.battle, `?phone=1` forces touch), `demo/battle-shot.py`, `demo/battle-drive.py`, `demo/drag-test.py` (Playwright). No em dashes anywhere.

All classic scripts on `window.SB.ui`. Load order: ui-core, deck-viewer, battle (battle needs ui-core, SB.gfx and SB.audio guarded).

## ui-core API (stable)

DOM and utils
- `ui.h(tag, props, ...children)` tag may be `div.cls#id`; props: `class`, `style` (string or object), `on*` handlers, `dataset`, `html`, anything else is an attribute. Children can be strings, nodes, arrays, null.
- `ui.clear(el)`, `ui.$(sel, root)`, `ui.$$(sel, root)`, `ui.esc(s)`, `ui.clamp(v,a,b)`, `ui.hash(str)`.
- `ui.sleep(ms)` Promise, scaled by `ui.speed()`. `ui.speed()` 1 or 1.6 (Fast), `ui.reduced()` true with reduce motion.

Settings (`localStorage nl_settings`, applied as classes on html)
- `ui.settings.get(k)`, `.all()`, `.set(k,v)`, `.onChange(fn)`, `.defaults`, `.reset()`.
- Keys: 1-9 select a card, arrows pick a target (or move through the hand), Enter confirms, Space ends the turn when nothing is selected, E ends the turn, N naps the focused cat, D and X open the draw and discard piles, L the log, ? help, Esc cancels or opens the menu.

Layout
- `ui.layout()` returns `{w,h,mode:'phone'|'desktop',short}`; `ui.onResize(fn)` returns an unsubscribe. `<html data-mode>` and `html.short` are set for CSS.

Icons and text
- `ui.icon(name,{size,cls,letter,title,vec})` returns an element. Uses B20 pixel icons when SB.gfx.icons has the name, otherwise a vector SVG. `vec:true` forces vector. `ui.icons` is the vector set, `ui.iconAlias` aliases.
- `ui.fmt(text)` returns HTML with glossary words wrapped in `<b class="kw" data-gl="id">`.
- `ui.gl(idOrName)` glossary entry. `ui.statusTone(id)`, `ui.statusIcon(id)`.
- `ui.tooltip(contentOrGlossaryId, anchorEl)`, `ui.tooltip.hide()`, `ui.tooltip.bind(root)`. Any element with `data-gl` or `data-tip` gets a tooltip by delegation (hover, focus, long press).

Overlays
- `ui.toast(msg,{tone,ms})`.
- `ui.modal(content,{title,wide,sheet,buttons,closable,onClose})` returns `{el,body,close}`. `ui.modal.top()`, `.closeAll()`, `.count()`. Escape closes the top one. Phones get a bottom sheet when `sheet:true`.
- `ui.confirm({title,text,yes,no,danger})` returns a Promise of boolean.
- `ui.announce(msg)` for the aria-live region. `ui.press(el,{tap,long,ms})` tap and long press helper.

Screens
- `ui.register(name,{mount(root,params), unmount()})`, `ui.go(name,params)` mounts into `section.screen#screen-NAME` inside `#app`, `ui.current`, `ui.onGo(fn)`, `ui.root`.

Cards
- `ui.cardModel(x)` accepts a card id, a def, a CardInst, or a battle hand entry `{uid, card}` (when `card` is null it is resolved by the caller, see battle.js) and returns the display model.
- `ui.card(x,{size:'hand'|'mini'|'detail'|'reward', playable, unaffordable, selected, back, compact, flavor, onClick, noFocus})` returns an element. Sizing is em-based from `--cw`, so set `style="--cw:150px"` on a wrapper to scale.
- `ui.cardBack()`, `ui.cardDetail(x)`, `ui.cardDef(id)`, `ui.cardTypeLabel`, `ui.genome(art,id)`, `ui.clanColors`, `ui.rarityColors`.
- `ui.statusList(obj)` array of `{id,n}`, `ui.statusChip(s)` element with stack number and tooltip.

## deck-viewer
`SB.ui.deckViewer.open({title, cards, sort, filter, empty, note, onPick})` and `SB.ui.deckViewer.pile(B, run, 'draw'|'discard'|'exhaust'|'deck')`. Renders in chunks of 48, filter chips by type, the draw pile is shown alphabetically (not in draw order). C4 can reuse `open` for the collection and reward previews.

## Battle screen

Mount: `SB.ui.go('battle', {run, encounter, node, battle?, factory?, restore?, opts?})`
- `battle` an existing B, `restore` a snapshot for `SB.battle.restore`, otherwise `factory || SB.battle.create` is called as `(run, encounter, opts)`.
- Hand-off on game end: `SB.ui.go('reward', {run, result, battle, encounter, node, outcome:'win'})` or `SB.ui.go('gameover', {... outcome:'lose'})`. `result` is `B.result()`. The Growth Report overlay is shown first, then Continue triggers the hand-off. The reward screen should call `SB.run` itself (the UI does not apply rewards or write warmth back to the run).
- Handle exposed after mount: `SB.ui.battle = {B, el, root, state(), isPlaying(), selectCard(i), endTurn(), pauseMenu(), toggleLog(), fit(), skipPlayback(), destroy()}`.
- Hooks for the tutorial driver (C4): assign functions on `SB.ui.battleHooks`: `select(card)`, `played(card,target)`, `endTurn()`, `playbackDone()`, `ready(api)`, `ended(outcome)`, `leave()`.

Engine contract used (API.md): `B.state`, `B.on`, `B.canPlay(uid)`, `B.playCard`, `B.toggleNap`, `B.endTurn`, `B.surrender`, `B.result`, `B.cardView(uid)` for hand entries whose `card` is null. Events handled: draw, play, deploy, attack, damage, heal, lifeSpent, death, spawn, move, knock, status, phase, witching, surge, crash, nap, wake, zoom, sunbeamHit, intent, shuffle, discard, exhaust, create, room, box, relic, toast, win, lose. Unknown events (wave, pestDown, nip, flap) fall through to a no-op default. While events play the UI works on a cloned view model and resyncs to `B.state` after the queue empties; input is locked until then. Tap the board during playback to skip.

Layout
- Desktop (>= 721px wide or landscape): canvas house 384x208 logical, inspector side panel when the window is wide enough (>= 1100px and 3:2 or wider), otherwise a garden strip under the house. Hand is a fan.
- Phone portrait (390x844 tested, also 360x640 and 768x1024 tablet): canvas house 288x296 logical, garden strip, hand is a horizontal scroll row, End Turn at the bottom right. Long press a card for the detail sheet.
- Short landscape (800x400): `html.short` compact hand and thinner top bar.
- Keys: 1-9 select card, arrows move target, Space or Enter confirm, E end turn (confirm if cards remain), Esc cancel or menu, L log, ? help.
- Left-handed setting mirrors End Turn and the piles.

## Requests to other agents
- C1 engine: `src/engine/registry.js` and `src/engine/battle-ai.js` did not exist when I last checked, and `BT.create` threw `Cannot read properties of undefined (reading 'normTrigger')` (SB.engine missing). Once they exist run `battle-demo.html?engine=real`. The demo falls back to the mock if create throws (the page title gets "(mock fallback)").
- C1: `state.hand[i].card` is null, I resolve through `B.cardView(uid)`. Keep `cardView` returning cost, power, health, text, keywords, type, clan, art.
- C4: the stubs for 'reward' and 'gameover' in battle-demo.html show the payload I send.
