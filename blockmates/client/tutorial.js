// Gentle first-hours goals shown as one line at the top of the screen. Progress is remembered per player name.
import { I, B } from '../shared/data.js';

const has = (G, name, n = 1) => G.count(I[name]) >= n;
export const STEPS = [
  { text: 'Hold the left mouse button on a tree to chop it.', done: (G) => has(G, 'log') || has(G, 'planks') },
  { text: 'Press E and craft planks from your logs.', done: (G) => has(G, 'planks') || G.stations.has('bench') },
  { text: 'Craft a workbench, then place it with the right mouse button.', done: (G) => G.stations.has('bench') },
  { text: 'Dig down with your pickaxe and collect 10 cobblestone.', done: (G) => has(G, 'cobble', 10) || G.stations.has('furnace') },
  { text: 'Craft a furnace (10 cobblestone) next to your workbench.', done: (G) => G.stations.has('furnace') },
  { text: 'Find coal and copper ore underground, then smelt a copper ingot.', done: (G) => has(G, 'copper_ingot') || has(G, 'bronze_ingot') || has(G, 'iron_ingot') },
  { text: 'Dig deeper: iron is below, and lava is hot. Torches (right click) light the way.', done: (G) => has(G, 'iron_ingot') || G.stations.has('anvil') },
  { text: 'Make an anvil with iron ingots to forge better tools and armor.', done: (G) => G.stations.has('anvil') },
  { text: 'Craft a bed and a door, build a house, and sleep through the night.', done: (G) => G.day > 2 },
  { text: 'Hire a Buddy with a Buddy Bell (anvil). Right click them to give orders.', done: (G) => G.npcs.size > 0 },
];

export class Tutorial {
  constructor(G) { this.G = G; this.i = 0; this.t = 0; this.hidden = false; this.el = null; }
  key() { return 'blockmates.tut.' + (this.G.profile ? this.G.profile.name : ''); }
  load() { try { this.i = +localStorage.getItem(this.key()) || 0; this.hidden = localStorage.getItem(this.key() + '.hide') === '1'; } catch { this.i = 0; } }
  toggle() { this.hidden = !this.hidden; try { localStorage.setItem(this.key() + '.hide', this.hidden ? '1' : '0'); } catch { /* private mode */ } this.render(); }
  update(dt, root) {
    if (!this.el) { this.el = document.createElement('div'); this.el.className = 'goal'; root.appendChild(this.el); this.load(); this.render(); }
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const G = this.G;
    let changed = false;
    while (this.i < STEPS.length && STEPS[this.i].done(G)) { this.i++; changed = true; G.sound.play('craft'); G.ui.showToast('Goal complete!'); }
    if (changed) { try { localStorage.setItem(this.key(), String(this.i)); } catch { /* private mode */ } this.render(); }
  }
  render() {
    if (!this.el) return;
    if (this.i >= STEPS.length || this.hidden) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    let t = STEPS[this.i].text;
    if (document.body.classList.contains('touch')) t = t.replace('Hold the left mouse button on', 'Touch and hold').replace('Press E and', 'Tap Bag and').replace('right mouse button', 'Place mode').replace(' (right click)', '');
    this.el.innerHTML = `<small>Goal ${this.i + 1}/${STEPS.length}</small> ${t} <i>(H hides)</i>`;
  }
}
void B;
