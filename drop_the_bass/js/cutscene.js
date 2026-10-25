// cutscene.js: plays a CUTSCENES script. The scene is drawn on the canvas (art_world.drawScene), the dialogue is a DOM box.
import { CUTSCENES } from './data_story.js';
import { AW, h, btn } from './ui_core.js';

const NAMES = { roxor: 'RoxorLoops', jasmin: 'Jasmin', loopy: 'Loopy', playback: 'Mr. Playback', narr: '' };
const COLORS = { roxor: '#3d8a00', jasmin: '#d6307f', loopy: '#2a8a6a', playback: '#a01f66', narr: '#241140' };

export class Cutscene {
  constructor(app, id, onDone) {
    this.app = app; this.id = id; this.onDone = onDone;
    this.script = CUTSCENES[id];
    this.p = 0; this.l = 0; this.t = 0; this.panelT = 0; this.chars = 0; this.done = false; this.lastBlip = 0;
    this.box = h('div', { class: 'cut-box', onclick: () => this.advance() });
    this.who = h('div', { class: 'who' }); this.txt = h('div'); this.nx = h('div', { class: 'nx' }, 'tap');
    this.box.append(this.who, this.txt, this.nx);
    this.skip = btn('Skip', () => this.finish(), 'dark small cut-skip');
    app.ui.append(this.skip, this.box);
    this.setLine(true);
    const m = this.script.panels[0].music || this.script.music;
    if (m) app.audio.musicStart(m);
  }
  get panel() { return this.script.panels[this.p]; }
  get line() { return this.panel.lines[this.l]; }
  setLine(first) {
    const ln = this.line;
    this.chars = 0;
    const nm = NAMES[ln.who];
    this.who.textContent = nm; this.who.style.display = nm ? '' : 'none';
    this.who.style.background = ln.who === 'narr' ? '#12082b' : '#12082b';
    this.who.style.color = ln.who === 'roxor' ? '#9dff3a' : ln.who === 'jasmin' ? '#ff8ac8' : ln.who === 'loopy' ? '#6dffd0' : ln.who === 'playback' ? '#ff5fb0' : '#fff';
    this.txt.style.fontStyle = ln.who === 'narr' ? 'italic' : '';
    this.txt.style.color = COLORS[ln.who] || '#241140';
    this.txt.textContent = '';
    this.nx.style.visibility = 'hidden';
  }
  update(dt) {
    this.t += dt; this.panelT += dt;
    const ln = this.line;
    if (this.chars < ln.text.length) {
      this.chars = Math.min(ln.text.length, this.chars + dt * 48);
      this.txt.textContent = ln.text.slice(0, Math.floor(this.chars));
      if (this.t - this.lastBlip > 0.07 && ln.who !== 'narr') { this.lastBlip = this.t; this.app.audio.play('typewriter', { vol: 0.35, pitch: ln.who === 'jasmin' ? 1.25 : ln.who === 'loopy' ? 1.5 : ln.who === 'playback' ? 0.7 : 1 }); }
      if (this.chars >= ln.text.length) this.nx.style.visibility = 'visible';
    }
  }
  advance() {
    const ln = this.line;
    if (this.chars < ln.text.length) { this.chars = ln.text.length; this.txt.textContent = ln.text; this.nx.style.visibility = 'visible'; return; }
    this.app.audio.play('ui_click', { vol: 0.5 });
    if (this.l + 1 < this.panel.lines.length) { this.l++; this.setLine(); return; }
    if (this.p + 1 < this.script.panels.length) {
      this.p++; this.l = 0; this.panelT = 0; this.setLine();
      const m = this.panel.music; if (m) this.app.audio.musicStart(m);
      return;
    }
    this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true; this.box.remove(); this.skip.remove();
    this.onDone && this.onDone();
  }
  draw(ctx, view) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    const prog = Math.min(1, this.panelT / 8);
    AW.drawScene(ctx, this.panel.scene, view.cw, view.ch, this.t, { progress: prog });
  }
}
