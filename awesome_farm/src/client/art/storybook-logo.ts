// The title logo: two words in Fredoka with a thick wooden outline, a cream rim and a warm gradient,
// drawn with the 2D canvas (it needs the font loaded, which the boot scene waits for).

import { addDense, SS } from '../res';

interface Word { key: string; text: string; size: number; top: string; bottom: string }

function word (scene: Phaser.Scene, w: Word) {
    const pad = 14, S = SS;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = `700 ${w.size * S}px Fredoka, sans-serif`;
    const textW = Math.ceil(probe.measureText(w.text).width);
    const cw = textW + pad * 2 * S, ch = Math.ceil(w.size * 1.35 * S) + pad * S;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d')!;
    g.font = `700 ${w.size * S}px Fredoka, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round';
    const cx = cw / 2, cy = ch / 2 - 2 * S;
    // a soft drop shadow, the dark wooden outline, then a cream rim inside it
    g.lineWidth = 15 * S; g.strokeStyle = 'rgba(42,29,44,0.32)'; g.strokeText(w.text, cx, cy + 5 * S);
    g.lineWidth = 15 * S; g.strokeStyle = '#4a2f2a'; g.strokeText(w.text, cx, cy);
    g.lineWidth = 7 * S; g.strokeStyle = '#fff3d6'; g.strokeText(w.text, cx, cy);
    // the face: a vertical gradient, with a pale band along the top
    const grad = g.createLinearGradient(0, cy - w.size * S * 0.55, 0, cy + w.size * S * 0.55);
    grad.addColorStop(0, w.top); grad.addColorStop(1, w.bottom);
    g.fillStyle = grad; g.fillText(w.text, cx, cy);
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(0, cy - w.size * S * 0.55, cw, w.size * S * 0.2);
    g.restore();
    addDense(scene, w.key, c);
}

export function registerStorybookLogo (scene: Phaser.Scene) {
    word(scene, { key: 'logo_awesome', text: 'Awesome', size: 62, top: '#ffe58a', bottom: '#f39a3c' });
    word(scene, { key: 'logo_farm', text: 'Farm', size: 62, top: '#d6f48a', bottom: '#4aa04a' });
}
